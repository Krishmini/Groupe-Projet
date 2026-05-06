// create-index.js
import { Pinecone } from '@pinecone-database/pinecone';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import 'dotenv/config';

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

const CHUNK_SIZE = 400;
const OVERLAP = 50;
const BATCH_SIZE = 50;
const EMBED_CONCURRENCY = 5;

// --- Fonctions utilitaires ---

function chunkWithOverlap(text, size, overlap) {
  const words = text.split(' ');
  const chunks = [];
  let i = 0;
  while (i < words.length) {
    chunks.push(words.slice(i, i + size).join(' '));
    i += size - overlap;
  }
  return chunks.filter(c => c.trim().length > 0);
}

async function embedText(text) {
  const response = await fetch('https://api.mistral.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'mistral-embed',
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mistral embedding error (${response.status}): ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

async function embedBatch(texts) {
  const response = await fetch('https://api.mistral.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'mistral-embed',
      input: texts,           // tableau accepté directement par l'API
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mistral batch embedding error (${response.status}): ${error}`);
  }

  const data = await response.json();
  // L'API retourne les embeddings dans le même ordre que l'input
  return data.data.map(item => item.embedding);
}

// --- Traitement d'un fichier ---

async function processFile(filePath, indexName) {
  const index = pinecone.index(indexName);
  const text = readFileSync(filePath, 'utf-8');
  const filename = filePath.split('/').pop();

  console.log(`\n→ Traitement de ${filename}...`);

  const rawChunks = chunkWithOverlap(text, CHUNK_SIZE, OVERLAP);
  console.log(`  ${rawChunks.length} chunks créés`);

  const vectors = [];

  for (let i = 0; i < rawChunks.length; i += EMBED_CONCURRENCY) {
    const batch = rawChunks.slice(i, i + EMBED_CONCURRENCY);

    // Embedder tous les chunks du batch en un seul appel API (plus efficace)
    const embeddings = await embedBatch(batch);

    const batchVectors = batch.map((chunkText, j) => ({
      id: `${filename}-chunk-${i + j}`,
      values: embeddings[j],
      metadata: {
        text: chunkText,
        source: filename,
        chunkIndex: i + j,
      },
    }));

    vectors.push(...batchVectors);
  }

  // Upsert dans Pinecone par lots
  for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
    const batch = vectors.slice(i, i + BATCH_SIZE);
    await index.upsert({records: batch});
    console.log(`  Upsert ${Math.min(i + BATCH_SIZE, vectors.length)}/${vectors.length} vecteurs...`);
  }

  console.log(`  ✓ ${vectors.length} vecteurs indexés`);
  return vectors.length;
}

// --- Point d'entrée ---

async function main() {
  const INDEX_NAME = process.env.PINECONE_INDEX_NAME;
  const CORPUS_DIR = './corpus';

  const files = readdirSync(CORPUS_DIR)
    .filter(f => f.endsWith('.txt') || f.endsWith('.md'))
    .map(f => join(CORPUS_DIR, f));

  console.log(`Indexation de ${files.length} fichiers dans l'index "${INDEX_NAME}"`);

  let total = 0;
  for (const file of files) {
    try {
      const count = await processFile(file, INDEX_NAME);
      total += count;
    } catch (err) {
      console.error(`  ✗ Erreur sur ${file}: ${err.message}`);
      // On continue avec les fichiers suivants
    }
  }

  console.log(`\nIndexation terminée. ${total} vecteurs au total.`);
}

main().catch(console.error);