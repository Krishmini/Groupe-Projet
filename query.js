// query.js — Pipeline de retrieval : embed la question + interroge Pinecone
// Utilisé par agent.js et eval.js.
import {
  MISTRAL_API_KEY,
  PINECONE_API_KEY,
  PINECONE_INDEX_HOST,
  PINECONE_NAMESPACE,
  EMBED_MODEL,
  TOP_K,
  SCORE_THRESHOLD,
  MAX_RETRIES,
  RETRY_BASE_MS
} from './config.js';

// ─── Sanitisation de l'entrée utilisateur ────────────────────────────────────
function sanitizeQuestion(input) {
  if (typeof input !== 'string') throw new TypeError('La question doit être une chaîne de caractères.');
  const cleaned = input
    .replace(/[\x00-\x1F\x7F]/g, ' ') // caractères de contrôle
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length === 0) return '';
  return cleaned.slice(0, 500); // limite à 500 chars (~125 tokens max)
}

// ─── Embedding via Mistral (avec retry) ──────────
async function embedQuery(text) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch('https://api.mistral.ai/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${MISTRAL_API_KEY}`
      },
      body: JSON.stringify({ model: EMBED_MODEL, input: [text] })
    });

    if (res.ok) {
      const data = await res.json();
      return data.data[0].embedding; // tableau de 1024 floats
    }

    const isRetryable = res.status === 429 || res.status === 503;
    if (isRetryable && attempt < MAX_RETRIES) {
      const wait = attempt * RETRY_BASE_MS;
      console.warn(`  [query] Erreur ${res.status} — retry ${attempt}/${MAX_RETRIES} dans ${wait / 1000}s...`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }

    // Ne pas inclure le corps de la réponse dans l'erreur (peut contenir des infos sensibles)
    throw new Error(`Mistral embeddings → HTTP ${res.status}`);
  }
}

// ─── Requête Pinecone ──────

async function queryPinecone(vector, topK) {
  const res = await fetch(`${PINECONE_INDEX_HOST}/query`, {
    method: 'POST',
    headers: {
      'Api-Key':      PINECONE_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      vector,
      topK,
      includeMetadata: true,
      namespace: PINECONE_NAMESPACE
    })
  });

  if (!res.ok) throw new Error(`Pinecone query → HTTP ${res.status}`);
  return res.json();
}

// ─── Retrieval principal ────────

/**
 * Prend une question brute, l'embède, interroge Pinecone et retourne
 * les chunks pertinents (filtrés par SCORE_THRESHOLD).
 *
 * @param {string} query        — question de l'utilisateur (non sanitisée)
 * @param {number} [topK]       — nombre de résultats demandés à Pinecone
 * @returns {Promise<Array<{ text: string, source: string, score: number, chunkIndex: number|null }>>}
 */
export async function retrieveContext(query, topK = TOP_K) {
  try {
    const question = sanitizeQuestion(query);

    if (question.length === 0) {
      console.warn('[retrieveContext] Question vide — aucun chunk retourné.');
      return [];
    }
    const vector = await embedQuery(question);
    const data = await queryPinecone(vector, topK);

    // 5. Filtrage par score + extraction des métadonnées utiles
    return (data.matches || [])
      .filter(m => m.score >= SCORE_THRESHOLD)
      .map(m => ({
        text:       m.metadata?.text       || '',
        source:     m.metadata?.source     || 'inconnu',
        score:      parseFloat(m.score.toFixed(4)),
        chunkIndex: m.metadata?.chunkIndex ?? null
      }));
  } catch (err) {
    console.error(`[retrieveContext] ${err.message}`);
    return [];
  }
}
