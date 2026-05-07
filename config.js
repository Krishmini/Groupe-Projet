import 'dotenv/config';

// ─── Validation des variables d'environnement obligatoires ───────────────────

const REQUIRED_VARS = ['MISTRAL_API_KEY', 'PINECONE_API_KEY', 'PINECONE_INDEX_NAME', 'PINECONE_INDEX_HOST'];

for (const key of REQUIRED_VARS) {
  if (!process.env[key]) {
    console.error(`[config] Variable d'environnement manquante : ${key}`);
    process.exit(1);
  }
}

// ─── Clés API ──────────
export const MISTRAL_API_KEY  = process.env.MISTRAL_API_KEY;
export const PINECONE_API_KEY = process.env.PINECONE_API_KEY;

// ─── Pinecone ────────

export const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME;
export const PINECONE_INDEX_HOST = process.env.PINECONE_INDEX_HOST;

// Namespace : isoler les datasets (ex: "cours-droit", "docs-nodejs", "default")
// Configurable via PINECONE_NAMESPACE dans .env — fallback sur "default"
export const PINECONE_NAMESPACE  = process.env.PINECONE_NAMESPACE || 'default';

// ─── Modèles Mistral ────────────────

export const EMBED_MODEL = 'mistral-embed';    // 1024 dimensions, métrique cosine
export const CHAT_MODEL  = 'mistral-small-latest';

// ─── Paramètres de retrieval ─────────────

export const TOP_K             = 5;     // nombre de chunks retournés par Pinecone
export const SCORE_THRESHOLD   = 0.7;   // score cosine minimum — en dessous = non pertinent
export const MAX_CONTEXT_CHARS = 4000;  // limite de contexte injectée dans le prompt (~1000 tokens)

// ─── Confidence ─────────

export const CONFIDENCE_THRESHOLD = parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.75');

// ─── Retry (429 / 503) ───────────────

export const MAX_RETRIES   = 4;
export const RETRY_BASE_MS = 5000; // backoff : 5s, 10s, 15s, 20s

// ─── Fichiers ─────────────────

export const QUESTIONS_FILE = './questions-test.txt';
export const CORPUS_DIR     = './corpus';
