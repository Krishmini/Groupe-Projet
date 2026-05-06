// scripts/create-index.js — Pipeline d'indexation complète (Phase 2-3)
// Indexe tous les fichiers du corpus dans Pinecone avec chunking + batch embedding.
import { Pinecone }                              from '@pinecone-database/pinecone';
import { readFileSync, readdirSync, statSync }   from 'fs';
import { join, basename, extname, resolve, dirname } from 'path';
import { fileURLToPath }                         from 'url';
import {
  PINECONE_API_KEY,
  PINECONE_INDEX_NAME,
  PINECONE_NAMESPACE,
  MISTRAL_API_KEY,
  EMBED_MODEL,
  CORPUS_DIR,
  MAX_RETRIES,
  RETRY_BASE_MS
} from '../config.js';

// Chemin absolu du corpus — fonctionne peu importe le répertoire de lancement
const __dirname  = dirname(fileURLToPath(import.meta.url));
const CORPUS_PATH = resolve(__dirname, '..', CORPUS_DIR.replace('./', ''));

const pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });

// Extensions de fichiers supportées (Option C : txt, md, json)
const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.json'];

// ─── Paramètres de chunking ─────────────────────────────────────────────────
// Ajustables sans toucher au reste du code.
export const CONFIG = {
  chunkSize:       400,  // mots par chunk (recommandé : 300-500)
  overlap:          50,  // mots de chevauchement (~12%)
  batchSize:        50,  // vecteurs par upsert Pinecone
  embedConcurrency:  5   // appels d'embedding en parallèle max
};

// ─── Chunking avec overlap ───────────────────────────────────────────────────
// Découpe `text` en chunks de `size` mots avec `overlap` mots de recouvrement.
// Cas limites gérés : texte vide → [], texte < size → [texte entier],
// overlap >= size → erreur explicite.
export function chunkWithOverlap(text, size = CONFIG.chunkSize, overlap = CONFIG.overlap) {
  if (overlap >= size) throw new Error(`overlap (${overlap}) doit être < chunkSize (${size})`);

  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return [];

  const chunks = [];
  let i = 0;
  while (i < words.length) {
    chunks.push(words.slice(i, i + size).join(' '));
    i += size - overlap;
  }
  return chunks;
}

// ─── Lecture du corpus (récursive, Option C) ─────────────────────────────────
// Parcourt `dir` et tous ses sous-dossiers, retourne les fichiers supportés.
export function loadCorpus(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      results.push(...loadCorpus(fullPath));
    } else if (SUPPORTED_EXTENSIONS.includes(extname(entry).toLowerCase())) {
      results.push(fullPath);
    }
  }
  return results;
}

// ─── Batch embedding via Mistral (avec retry) ────────────────────────────────
async function embedBatch(texts) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch('https://api.mistral.ai/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${MISTRAL_API_KEY}`
      },
      body: JSON.stringify({ model: EMBED_MODEL, input: texts })
    });

    if (res.ok) {
      const data = await res.json();
      return data.data.map(d => d.embedding);
    }

    const isRetryable = res.status === 429 || res.status === 503;
    if (isRetryable && attempt < MAX_RETRIES) {
      const wait = attempt * RETRY_BASE_MS;
      console.log(`  [embed] Erreur ${res.status} — retry ${attempt}/${MAX_RETRIES} dans ${wait / 1000}s...`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }

    throw new Error(`Mistral embeddings → HTTP ${res.status}`);
  }
}

// ─── Traitement d'un fichier ───────────
async function processFile(filePath, index) {
  const source = basename(filePath);
  const rawText = readFileSync(filePath, 'utf-8');

  console.log(`\n→ Traitement de ${source}...`);

  // Chunking
  const rawChunks = chunkWithOverlap(rawText, CONFIG.chunkSize, CONFIG.overlap);
  const uniqueChunks = [...new Set(rawChunks)];
  console.log(`  ${rawChunks.length} chunks → ${uniqueChunks.length} uniques`);

  const vectors = [];

  // Embedding par groupes de CONFIG.embedConcurrency (parallélisme contrôlé)
  for (let i = 0; i < uniqueChunks.length; i += CONFIG.embedConcurrency) {
    const batch      = uniqueChunks.slice(i, i + CONFIG.embedConcurrency);
    const embeddings = await embedBatch(batch);

    for (let j = 0; j < batch.length; j++) {
      vectors.push({
        id:     `${source}-chunk-${i + j}`,
        values: embeddings[j],
        metadata: {
          text:        batch[j],
          source,
          chunkIndex:  i + j,
          createdAt:   new Date().toISOString()
        }
      });
    }
  }

  // Upsert dans Pinecone par lots de CONFIG.batchSize
  for (let i = 0; i < vectors.length; i += CONFIG.batchSize) {
    const batch = vectors.slice(i, i + CONFIG.batchSize);
    await index.namespace(PINECONE_NAMESPACE).upsert({ records: batch });
    console.log(`  Upsert ${Math.min(i + CONFIG.batchSize, vectors.length)}/${vectors.length} vecteurs...`);
  }

  console.log(`  ✓ ${vectors.length} vecteurs indexés`);
  return vectors.length;
}

// ─── Point d'entrée ───────
async function main() {
  console.log(`Namespace : "${PINECONE_NAMESPACE}"`);
  console.log(`Corpus    : ${CORPUS_PATH}\n`);

  const files = loadCorpus(CORPUS_PATH);

  if (files.length === 0) {
    console.log(`Aucun fichier ${SUPPORTED_EXTENSIONS.join('/')} trouvé dans ${CORPUS_PATH}`);
    return;
  }

  console.log(`Indexation de ${files.length} fichiers dans l'index "${PINECONE_INDEX_NAME}"`);
  const index = pinecone.index(PINECONE_INDEX_NAME);

  let total = 0;
  for (const file of files) {
    try {
      total += await processFile(file, index);
    } catch (err) {
      console.error(`  ✗ Erreur sur ${basename(file)} : ${err.message}`);
    }
  }

  console.log(`\nIndexation terminée. ${total} vecteurs au total.`);
}

main().catch(console.error);
