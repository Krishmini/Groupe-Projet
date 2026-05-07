import 'dotenv/config';

const MISTRAL_API_KEY  = process.env.MISTRAL_API_KEY;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX   = process.env.PINECONE_INDEX_NAME;
const PINECONE_HOST    = process.env.PINECONE_INDEX_HOST;

// ─── Helpers HTTP ──────────

async function mistralPost(path, body) {
  const res = await fetch(`https://api.mistral.ai${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MISTRAL_API_KEY}`
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Mistral ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function pineconeRequest(path, body, method = 'POST') {
  // path peut être une URL complète (pour /indexes) ou un chemin relatif à PINECONE_HOST
  const url = path.startsWith('http') ? path : `${PINECONE_HOST}${path}`;
  const opts = {
    method,
    headers: {
      'Api-Key': PINECONE_API_KEY,
      'Content-Type': 'application/json'
    }
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`Pinecone ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── Phase 5 : Infos de l'index ────────
export async function getIndexInfo() {
  const data = await pineconeRequest(
    `https://api.pinecone.io/indexes/${PINECONE_INDEX}`,
    undefined,
    'GET'
  );
  return {
    name:      data.name,
    dimension: data.dimension,
    metric:    data.metric,
    status:    data.status?.state,
    host:      data.host
  };
}

// ─── Phase 6 : Embedding + Upsert ─────────

/** Génère un vecteur de 1024 dimensions via Mistral. */
export async function getEmbedding(text) {
  const data = await mistralPost('/v1/embeddings', {
    model: 'mistral-embed',
    input: [text]
  });
  return data.data[0].embedding;
}

/** Découpe un texte en chunks de maxWords mots. */
export function simpleChunk(text, maxWords = 50) {
  const words = text.trim().split(/\s+/);
  const chunks = [];
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(' '));
  }
  return chunks;
}

/** Embède chaque chunk et les stocke dans Pinecone. */
export async function upsertChunks(chunks) {
  const vectors = await Promise.all(
    chunks.map(async (text, i) => ({
      id:       `chunk-${i}`,
      values:   await getEmbedding(text),
      metadata: { text }
    }))
  );
  const data = await pineconeRequest('/vectors/upsert', { vectors });
  return { upsertedCount: data.upsertedCount };
}

// ─── Phase 7 : Requête sémantique ───────

/** Embède une question et retourne les topK chunks les plus proches. */
export async function searchSimilar(question, topK = 3) {
  const vector = await getEmbedding(question);
  const data   = await pineconeRequest('/query', { vector, topK, includeMetadata: true });
  return data.matches.map(m => ({
    score:    m.score,
    metadata: { text: m.metadata.text }
  }));
}

// ─── Phase 4 : retrieveContext(query) ─────────────────────────────────────
// Retourne [{ text, source, score, chunkIndex }], filtré score >= 0.5
export async function retrieveContext(query, topK = 5) {
  // Gestion d'une query vide : on retourne [] (le service d'embeddings peut
  // refuser d'embeder une chaîne vide). Ceci évite une stack trace côté appelant.
  if (!query || String(query).trim().length === 0) {
    return [];
  }

  // Embedde la query
  let vector;
  try {
    vector = await getEmbedding(query);
  } catch (err) {
    // Retourne [] si l'embedding échoue pour une raison liée au contenu
    // (ex: texte vide). Remonter l'erreur sinon.
    if (String(err.message).toLowerCase().includes('empty') || String(err.message).toLowerCase().includes('input')) {
      return [];
    }
    throw err;
  }

  // Requête Pinecone
  const data = await pineconeRequest('/query', { vector, topK, includeMetadata: true });
  const matches = data.matches || [];

  // Filtre par score (>= 0.5) et mappe sur la forme demandée
  const results = matches
    .filter(m => typeof m.score === 'number' && m.score >= 0.5)
    .map(m => ({
      text:       m.metadata?.text ?? '',
      source:     m.metadata?.source ?? m.metadata?.source ?? 'unknown',
      score:      m.score,
      chunkIndex: m.metadata?.chunkIndex ?? null
    }));

  return results;
}

// ─── Phase 8 : RAG complet ───────────

export async function ragQuery(question) {
  console.log(`\nQuestion : ${question}`);

  const matches = await searchSimilar(question, 3);
  console.log('\nContexte récupéré :');
  matches.forEach(m => console.log(`  [${m.score.toFixed(2)}] ${m.metadata.text}`));

  const context = matches.map(m => m.metadata.text).join('\n\n');

  const data = await mistralPost('/v1/chat/completions', {
    model: 'mistral-small-latest',
    messages: [
      {
        role:    'system',
        content: "Réponds uniquement à partir du contexte fourni, en texte brut sans markdown. Si l'information est absente du contexte, dis-le clairement sans inventer."
      },
      {
        role:    'user',
        content: `Contexte :\n${context}\n\nQuestion : ${question}`
      }
    ]
  });

  const answer = data.choices[0].message.content;
  console.log('\nRéponse :', answer);
  return answer;
}

// ─── Script principal — ne s'exécute QUE si lancé directement (node vector-store.js)
// Quand vector-store.js est importé par hybrid-agent.js, ce bloc est ignoré.
import { fileURLToPath } from 'url';
const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  // --- Tests pour Phase 4 : retrieveContext
  console.log('\n--- Phase 4 tests : retrieveContext ---');
  try {
    const ctx1 = await retrieveContext('Comment gérer les erreurs dans un stream ?');
    console.log('ctx1 length =', ctx1.length);
    ctx1.forEach(c => console.log(`  [${c.score.toFixed(2)}] ${c.source} #${c.chunkIndex}`));
  } catch (e) {
    console.error('ctx1 failed :', e.message);
  }

  try {
    const ctx2 = await retrieveContext('');
    console.log('ctx2 length =', ctx2.length);
  } catch (e) {
    console.error('ctx2 failed :', e.message);
  }

  try {
    const ctx3 = await retrieveContext("Quelle est la capitale du Pérou ?");
    console.log('ctx3 length =', ctx3.length);
    ctx3.forEach(c => console.log(`  [${c.score.toFixed(2)}] ${c.source} #${c.chunkIndex}`));
  } catch (e) {
    console.error('ctx3 failed :', e.message);
  }

  const CORPUS = `
Node.js est un environnement d'exécution JavaScript côté serveur, créé par Ryan Dahl en 2009.
Il utilise le moteur V8 de Google Chrome pour exécuter du JavaScript hors du navigateur.
Node.js est particulièrement performant pour les applications I/O-intensives grâce à son modèle événementiel non-bloquant.
npm (Node Package Manager) est le gestionnaire de paquets officiel de Node.js, avec plus d'un million de packages disponibles.
Node.js est utilisé par des entreprises comme Netflix, LinkedIn, Walmart et PayPal pour leurs applications en production.
La version LTS (Long Term Support) de Node.js reçoit des mises à jour de sécurité pendant 30 mois.
Express.js est le framework web le plus populaire pour Node.js, permettant de créer des APIs REST rapidement.
Node.js utilise un seul thread avec une boucle d'événements (event loop) pour gérer la concurrence.
`.trim();

  // ── Phase 5 ──
  console.log('=== Phase 5 : Connexion Pinecone ===');
  const info = await getIndexInfo();
  console.log('Index connecté :', info);

  // ── Phase 6 ──
  console.log('\n=== Phase 6 : Indexation du corpus ===');
  const chunks = simpleChunk(CORPUS, 50);
  console.log(`${chunks.length} chunks générés :`);
  chunks.forEach((c, i) => console.log(`  [${i}] ${c}`));
  const upsertResult = await upsertChunks(chunks);
  console.log('Résultat upsert :', upsertResult);

  // ── Phase 7 ──
  console.log('\n=== Phase 7 : Recherche sémantique ===');
  const results = await searchSimilar('Qui a créé Node.js ?', 3);
  console.log('Résultats trouvés :');
  results.forEach(r => console.log(`  Score: ${r.score.toFixed(3)} | ${r.metadata.text}`));

  // ── Phase 8 ──
  console.log('\n=== Phase 8 : RAG complet ===');
  await ragQuery('Qui a créé Node.js et quand ?');
  await ragQuery("Quelle est la météo à Paris aujourd'hui ?"); // hors contexte
}
