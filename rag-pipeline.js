// rag-pipeline.js
import { Pinecone } from '@pinecone-database/pinecone';
import 'dotenv/config';

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

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
    throw new Error(`Embedding error (${response.status}): ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

export async function retrieveContext(query, topK = 5) {
  // Garde-fou : query vide
  if (!query || query.trim().length === 0) {
    console.warn('[retrieveContext] query vide, retour []');
    return [];
  }

  // 1. Vectoriser la question
  const queryVector = await embedText(query);

  // 2. Recherche de similarité dans Pinecone
  const index = pinecone.index(process.env.PINECONE_INDEX_NAME);
  const results = await index.query({
    vector: queryVector,
    topK,
    includeMetadata: true,
  });

  // 3. Formater + filtrer les résultats sous le seuil 0.65
  return results.matches
    .filter(match => match.score >= 0.65)
    .map(match => ({
      text: match.metadata.text,
      source: match.metadata.source,
      score: match.score,
      chunkIndex: match.metadata.chunkIndex,
    }));
}

// TEST PHASE 4 - à supprimer après vérification
const q1 = await retrieveContext("sujet principal de ton corpus");
console.log('\n[Test 1] Question pertinente :');
console.log(`  ${q1.length} chunks retournés`);
q1.forEach(c => console.log(`  [${c.score.toFixed(2)}] ${c.source}`));

const q2 = await retrieveContext("");
console.log('\n[Test 2] Query vide :', q2.length === 0 ? '✓ []' : '✗ KO');

const q3 = await retrieveContext("Quelle est la capitale du Pérou ?");
console.log('\n[Test 3] Hors corpus :');
console.log(`  ${q3.length} chunks après filtre 0.5 (attendu: 0 ou très peu)`);