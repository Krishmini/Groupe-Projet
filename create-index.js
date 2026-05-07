import { Pinecone } from '@pinecone-database/pinecone';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import 'dotenv/config';
 //
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY
});
const PINECONE_INDEX_HOST = process.env.PINECONE_INDEX_HOST;
 
export const CONFIG = {
  chunkSize: 400,
  overlap: 50,
  batchSize: 50,
  embedConcurrency: 5
};
 
export function chunkWithOverlap(text, chunkSize = CONFIG.chunkSize, overlap = CONFIG.overlap) {
  if (!text || text.trim().length === 0) {
    return [];
  }
 
  if (overlap >= chunkSize) {
    throw new Error('L’overlap doit être inférieur au chunkSize pour éviter une boucle infinie.');
  }
 
  const words = text.trim().split(/\s+/);
  const chunks = [];
 
  let i = 0;
 
  while (i < words.length) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    chunks.push(chunk);
    i += chunkSize - overlap;
  }
 
  return chunks;
}
 
export function loadCorpus(dir = './corpus') {
  const files = readdirSync(dir)
    .filter(file => file.endsWith('.txt') || file.endsWith('.md'))
    .map(filename => {
      const filePath = join(dir, filename);
      const text = readFileSync(filePath, 'utf-8');
 
      return {
        filename,
        text
      };
    });
 
  return files;
}
 
async function embedBatch(texts) {
  const response = await fetch('https://api.mistral.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'mistral-embed',
      input: texts
    })
  });
 
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Erreur Mistral embeddings : ${response.status} - ${error}`);
  }
 
  const data = await response.json();
 
  return data.data.map(item => item.embedding);
}
 
async function processFile(file, index) {
  console.log(`\n→ Traitement de ${file.filename}...`);
 
  const chunks = chunkWithOverlap(file.text, CONFIG.chunkSize, CONFIG.overlap);
  console.log(`${chunks.length} chunks créés`);
 
  const vectors = [];
 
  for (let i = 0; i < chunks.length; i += CONFIG.embedConcurrency) {
    const batchChunks = chunks.slice(i, i + CONFIG.embedConcurrency);
    const embeddings = await embedBatch(batchChunks);
 
    const batchVectors = embeddings.map((embedding, batchIndex) => {
      const chunkIndex = i + batchIndex;
 
      return {
        id: `${file.filename}-chunk-${chunkIndex}`,
        values: embedding,
        metadata: {
          text: chunks[chunkIndex],
          source: file.filename,
          chunkIndex
        }
      };
    });
 
    vectors.push(...batchVectors);
 
    console.log(`Embeddings ${vectors.length}/${chunks.length}`);
  }
 
  for (let i = 0; i < vectors.length; i += CONFIG.batchSize) {
    const batch = vectors.slice(i, i + CONFIG.batchSize);
 
    // Debug: ensure the batch is non-empty and well-formed
    console.log(`Debug upsert batch size=${batch.length}`);
    batch.forEach((v, vi) => {
      console.log(`  [${vi}] id=${v.id} valuesType=${Array.isArray(v.values) ? 'array' : typeof v.values} valuesLen=${Array.isArray(v.values) ? v.values.length : 'N/A'}`);
    });
 
    // Use REST endpoint to upsert with the shape { vectors }
    if (!PINECONE_INDEX_HOST) {
      // Fallback to SDK call if host is not provided
      await index.upsert(batch);
    } else {
      const url = `${PINECONE_INDEX_HOST}/vectors/upsert`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Api-Key': process.env.PINECONE_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ vectors: batch })
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Pinecone upsert failed ${res.status}: ${txt}`);
      }
    }
 
    console.log(`Upsert ${Math.min(i + CONFIG.batchSize, vectors.length)}/${vectors.length}`);
  }
 
  console.log(`✓ ${vectors.length} vecteurs indexés pour ${file.filename}`);
 
  return vectors.length;
}
 
async function main() {
  const indexName = process.env.PINECONE_INDEX_NAME;
 
  if (!process.env.MISTRAL_API_KEY) {
    throw new Error('MISTRAL_API_KEY est manquant dans le fichier .env');
  }
 
  if (!process.env.PINECONE_API_KEY) {
    throw new Error('PINECONE_API_KEY est manquant dans le fichier .env');
  }
 
  if (!indexName) {
    throw new Error('PINECONE_INDEX_NAME est manquant dans le fichier .env');
  }
 
  const index = pinecone.index(indexName);
  const corpus = loadCorpus('./corpus');
 
  console.log(`Chargement du corpus...`);
  console.log(`${corpus.length} fichier(s) trouvé(s)`);
 
  let totalChunks = 0;
  let totalVectors = 0;
 
  for (const doc of corpus) {
    const chunks = chunkWithOverlap(doc.text, CONFIG.chunkSize, CONFIG.overlap);
    totalChunks += chunks.length;
  }
 
  console.log(`Total : ${totalChunks} chunks créés`);
  console.log(`Indexation dans Pinecone...`);
 
  for (const file of corpus) {
    try {
      const indexedCount = await processFile(file, index);
      totalVectors += indexedCount;
    } catch (error) {
      console.error(`Erreur sur ${file.filename} : ${error.message}`);
    }
  }
 
  console.log(`\nIndexation terminée : ${totalVectors} vecteurs dans l'index "${indexName}"`);
}
 
main().catch(console.error);