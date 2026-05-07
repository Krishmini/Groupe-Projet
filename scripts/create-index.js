// create-index.js — RAG Pipeline : Indexation du corpus
// ========================================================
// Phase 2 : Chunking avec paramètres configurables
// Phase 3 : Batch embed et indexation dans Pinecone
//
// Flux : corpus/ → chunking → embed Mistral → upsert Pinecone

import { Pinecone } from '@pinecone-database/pinecone';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import 'dotenv/config';

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

// === PHASE 2 : Configuration du chunking ===
export const CONFIG = {
  chunkSize: 400,        // Taille des chunks en mots
  overlap: 50,           // Recouvrement entre chunks (pour contexte)
  batchSize: 50,         // Nombre de vecteurs à upsert en une fois (Pinecone)
  embedConcurrency: 5,   // Parallélisme des appels embed (Mistral)
};

// === PHASE 2 : Découpe le texte en chunks de chunkSize mots avec overlap ===
// Cas tordus à tester :
//   - Texte vide → retourne []
//   - Texte court (< chunkSize) → retourne [texte entier]
//   - overlap === chunkSize → détecte et lève une erreur
function chunkWithOverlap(text, size, overlap) {
  // Validation
  if (!text || !text.trim()) return []; // Cas tordu #1 : texte vide
  if (overlap >= size) {
    throw new Error(`overlap (${overlap}) doit être < chunkSize (${size}), sinon boucle infinie`);
  }

  const words = text.trim().split(/\s+/); // Split sur espaces multiples aussi
  const chunks = [];
  let i = 0;
  
  // Boucle : avance de (size - overlap) mots à chaque itération
  while (i < words.length) {
    const chunk = words.slice(i, i + size).join(' ');
    if (chunk.trim().length > 0) {
      chunks.push(chunk);
    }
    i += size - overlap; // Avance de (size - overlap) pour recouvrementÂ
  }
  
  return chunks;
}

// === PHASE 2 : Tests des cas tordus ===
// À lancer avant de pousser sur le corpus complet
export function testChunking() {
  console.log("\n🧪 Test 1 : Texte vide");
  const empty = chunkWithOverlap("", CONFIG.chunkSize, CONFIG.overlap);
  console.assert(empty.length === 0, "Doit retourner []");
  console.log("  ✓ Passe");

  console.log("🧪 Test 2 : Texte court (< chunkSize)");
  const short = chunkWithOverlap("hello world", CONFIG.chunkSize, CONFIG.overlap);
  console.assert(short.length === 1 && short[0] === "hello world", "Doit retourner [texte entier]");
  console.log("  ✓ Passe");

  console.log("🧪 Test 3 : overlap === chunkSize (détection boucle infinie)");
  try {
    chunkWithOverlap("some text here", CONFIG.chunkSize, CONFIG.chunkSize);
    console.error("  ✗ Aurait dû lever une erreur !");
  } catch (err) {
    console.log(`  ✓ Levé erreur attendue : ${err.message}`);
  }
}

// === PHASE 3 : Appelle Mistral embed en batch ===
// Retourne [ embedding[], embedding[], ... ] dans le même ordre que l'input
// === PHASE 3 : Appelle Mistral embed en batch ===
// Retourne [ embedding[], embedding[], ... ] dans le même ordre que l'input
async function embedBatch(texts) {
  const response = await fetch('https://api.mistral.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'mistral-embed',  // Dimension 1024
      input: texts,             // Accepte tableau
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mistral batch embedding error (${response.status}): ${error}`);
  }

  const data = await response.json();
  // API retourne les embeddings dans le même ordre que l'input
  return data.data.map(item => item.embedding);
}

// === PHASE 2 : Charge tous les .txt de dir, retourne [{ filename, text }] ===
async function loadCorpus(dir) {
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.txt') || f.endsWith('.md'))
    .map(f => join(dir, f));
  
  return files.map(filePath => ({
    filename: filePath.split('/').pop(),
    text: readFileSync(filePath, 'utf-8'),
  }));
}

// === PHASE 3 : Vectorise les chunks et upsert dans Pinecone ===
// Chaque vecteur : { id: `${filename}-chunk-${i}`, values, metadata }
async function embedAndIndex(chunks, indexName) {
  const index = pinecone.index(indexName);
  let totalUpserted = 0;

  // Découper chunks en sous-tableaux de taille embedConcurrency
  for (let i = 0; i < chunks.length; i += CONFIG.embedConcurrency) {
    const batchToEmbed = chunks.slice(i, i + CONFIG.embedConcurrency);
    
    // 1. Embedder ce batch de chunks
    const embeddingsArray = await embedBatch(batchToEmbed.map(c => c.text));
    
    // 2. Construire les vecteurs avec métadonnées
    const vectors = batchToEmbed.map((chunk, j) => ({
      id: `${chunk.filename}-chunk-${chunk.index}`,
      values: embeddingsArray[j],
      metadata: {
        text: chunk.text,
        source: chunk.filename,
        chunkIndex: chunk.index,
      },
    }));

    // 3. Upsert dans Pinecone par lots de batchSize
    for (let k = 0; k < vectors.length; k += CONFIG.batchSize) {
      const batchToUpsert = vectors.slice(k, k + CONFIG.batchSize);
      await index.upsert({ records: batchToUpsert });
      totalUpserted += batchToUpsert.length;
      console.log(`  Upsert ${totalUpserted}/${chunks.length}...`);
    }
  }

  return totalUpserted;
}

// === Point d'entrée ===

async function main() {
  const INDEX_NAME = process.env.PINECONE_INDEX_NAME;
  const CORPUS_DIR = './corpus';

  // 1. Tester chunking sur les cas tordus
  console.log("🔍 Vérification du chunking...");
  testChunking();

  // 2. Charger le corpus
  console.log("\n📚 Chargement du corpus...");
  const corpus = await loadCorpus(CORPUS_DIR);
  console.log(`  ${corpus.length} fichiers trouvés`);

  // 3. Chunking + construction du tableau de chunks
  console.log("✂️  Chunking...");
  let allChunks = [];
  corpus.forEach(doc => {
    const chunks = chunkWithOverlap(doc.text, CONFIG.chunkSize, CONFIG.overlap);
    console.log(`  ${doc.filename}: ${chunks.length} chunks (${doc.text.length} caractères)`);
    chunks.forEach((text, index) => {
      allChunks.push({ filename: doc.filename, text, index });
    });
  });
  console.log(`  Total: ${allChunks.length} chunks créés`);

  // 4. Vectoriser et indexer
  console.log(`\n🔌 Indexation dans "${INDEX_NAME}"...`);
  const totalVectors = await embedAndIndex(allChunks, INDEX_NAME);
  console.log(`✅ Indexation terminée : ${totalVectors} vecteurs dans l'index`);
}

// Exécution
main().catch(console.error);