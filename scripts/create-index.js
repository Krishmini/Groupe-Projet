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
const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.json'];

// ─── Paramètres de chunking ──────
export const CONFIG = {
  chunkSize:       400,  // mots par chunk 
  overlap:          50,  // mots de chevauchement (~12%)
  batchSize:        50,  // vecteurs par upsert Pinecone
  embedConcurrency:  5   // appels d'embedding en parallèle max
};

// ─── Chunking avec overlap ──────
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

// ─── Lecture du corpus  ─────────────────────────────────
// Lit tous les fichiers supportés de dir, retourne [{ filename, text }]
export function loadCorpus(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      results.push(...loadCorpus(fullPath));
    } else if (SUPPORTED_EXTENSIONS.includes(extname(entry).toLowerCase())) {
      results.push({
        filename: basename(fullPath),
        text:     readFileSync(fullPath, 'utf-8')
      });
    }
  }
  return results;
}

// ─── Batch embedding via Mistral (avec retry) ────────────────────────────────
export async function embedBatch(texts) {
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

// ─── Embed + Index dans Pinecone ─────────────────────────────────────────────
export async function embedAndIndex(chunks) {
  const index = pinecone.index(PINECONE_INDEX_NAME);
  const vectors = [];

  // Embedding par groupes de CONFIG.embedConcurrency (parallélisme contrôlé)
  for (let i = 0; i < chunks.length; i += CONFIG.embedConcurrency) {
    const batch      = chunks.slice(i, i + CONFIG.embedConcurrency);
    const texts      = batch.map(c => c.text);
    const embeddings = await embedBatch(texts);

    for (let j = 0; j < batch.length; j++) {
      vectors.push({
        id:     `${batch[j].source}-chunk-${batch[j].chunkIndex}`,
        values: embeddings[j],
        metadata: {
          text:        batch[j].text,
          source:      batch[j].source,
          chunkIndex:  batch[j].chunkIndex,
          createdAt:   new Date().toISOString()
        }
      });
    }
  }

  // Upsert dans Pinecone par lots de CONFIG.batchSize
  let upserted = 0;
  for (let i = 0; i < vectors.length; i += CONFIG.batchSize) {
    const batch = vectors.slice(i, i + CONFIG.batchSize);
    await index.namespace(PINECONE_NAMESPACE).upsert({ records: batch });
    upserted = Math.min(i + CONFIG.batchSize, vectors.length);
    console.log(`Upsert ${upserted}/${vectors.length}...`);
  }

  return vectors.length;
}

// ─── Point d'entrée ───────
async function main() {
  console.log('Chargement du corpus...');

  const docs = loadCorpus(CORPUS_PATH);

  if (docs.length === 0) {
    console.log(`Aucun fichier ${SUPPORTED_EXTENSIONS.join('/')} trouvé dans ${CORPUS_PATH}`);
    return;
  }

  // Chunking de tous les fichiers → tableau plat de { text, source, chunkIndex }
  const allChunks = [];
  for (const { filename, text } of docs) {
    const rawChunks = chunkWithOverlap(text, CONFIG.chunkSize, CONFIG.overlap);
    const uniqueChunks = [...new Set(rawChunks)];
    for (let i = 0; i < uniqueChunks.length; i++) {
      allChunks.push({ text: uniqueChunks[i], source: filename, chunkIndex: i });
    }
  }

  console.log(`${docs.length} fichiers trouvés, ${allChunks.length} chunks créés`);
  console.log('Indexation en cours...');

  const total = await embedAndIndex(allChunks);

  console.log(`Indexation terminée : ${total} vecteurs dans l'index "${PINECONE_INDEX_NAME}"`);
}

main().catch(console.error);
