// retrieval.js — Module de retrieval sémantique : embed question + query Pinecone + filtrage (Phase 4)
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

// ─── Détection de prompt injection ───────────────────────────────────────────

const INJECTION_PATTERNS = [
  /ignore\s+(le|les|tout|all|previous|précédent)/i,
  /oublie\s+(tes|les|tout)/i,
  /forget\s+(your|all|previous)/i,
  /system\s*prompt/i,
  /instructions?\s*(exactes?|complètes?|système)/i,
  /change\s*(de|ton|your)\s*rôle/i,
  /tu\s+es\s+maintenant/i,
  /you\s+are\s+now/i,
  /act\s+as/i,
  /\bDAN\b|jailbreak/i,
];

function detectInjection(text) {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

// ─── Sanitisation de l'entrée utilisateur ────────────────────────────────────
function sanitizeQuestion(input) {
  if (typeof input !== 'string') throw new TypeError('La question doit être une chaîne de caractères.');
  const cleaned = input
    .replace(/[\x00-\x1F\x7F]/g, ' ') // caractères de contrôle
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length === 0) return '';

  if (detectInjection(cleaned)) {
    console.warn('[security] ⚠️ Prompt injection détectée — requête transmise avec avertissement');
  }

  return cleaned.slice(0, 500); // limite à 500 chars (~125 tokens max)
}

// ─── Cache d'embeddings (évite les appels API redondants) ────────────────────

const embedCache = new Map();
const CACHE_MAX_SIZE = 100;

// ─── Embedding via Mistral (avec retry + cache) ──────────
async function embedQuery(text) {
  if (embedCache.has(text)) return embedCache.get(text);
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
      const embedding = data.data[0].embedding; // tableau de 1024 floats

      // Stocker en cache (LRU simple : supprimer le plus ancien si plein)
      if (embedCache.size >= CACHE_MAX_SIZE) {
        const oldest = embedCache.keys().next().value;
        embedCache.delete(oldest);
      }
      embedCache.set(text, embedding);

      return embedding;
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
export async function retrieveContext(query, topK = TOP_K, scoreThreshold = SCORE_THRESHOLD) {
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
      .filter(m => m.score >= scoreThreshold)
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
