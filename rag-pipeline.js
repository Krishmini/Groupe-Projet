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
console.log(`  ${q3.length} chunks après filtre 0.65 (attendu: 0 ou très peu)`);

/**
 * Phase 5 - Génération de la réponse RAG
 * @param {string} query - La question de l'utilisateur
 * @param {Array} context - Les chunks filtrés issus de retrieveContext
 */
export async function generateCompletion(query, context) {
  // 1. Formatage des sources pour le prompt
  const contextText = context.length > 0 
    ? context
        .map((chunk, i) => `[Source ${i + 1} ${chunk.source}]\n${chunk.text}`)
        .join('\n\n---\n\n')
    : "AUCUN CONTEXTE DISPONIBLE";

  // 2. System Prompt strict (Anti-hallucination)
  const systemPrompt = `Tu es un assistant expert qui répond uniquement à partir des sources fournies.
Règles :
- Réponds UNIQUEMENT à partir du contexte ci-dessous. N'utilise pas ta mémoire interne.
- Si la réponse n'est pas dans le contexte, dis explicitement : "Je ne trouve pas cette information dans les documents fournis."
- Cite toujours tes sources entre crochets : [Source 1], [Source 2], etc.
- Sois précis et concis.`;

  // 3. Appel à Mistral avec gestion de la température
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Contexte :\n${contextText}\n\nQuestion : ${query}` },
      ],
      temperature: 0.1, // Obligatoire pour rester factuel
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    // Gestion spécifique de l'erreur 429
    if (response.status === 429) {
        return "ERREUR : Quota API dépassé (429). Réessaie dans une minute.";
    }
    throw new Error(`Generation error (${response.status}): ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// TEST PHASE 5 - à supprimer après vérification
async function runDemo() {
    const question = "Quelle est la thématique de mon corpus ?"; // Change selon ton Option C[cite: 1]
    console.log(`\n> Question : ${question}`);
    
    try {
        const context = await retrieveContext(question);
        console.log(`[retrieval] ${context.length} chunks trouvés.`);
        
        const answer = await generateCompletion(question, context);
        console.log(`\n[assistant] : ${answer}`);
    } catch (err) {
        console.error("Erreur durant la démo :", err.message);
    }
}

// Lancer la démo
runDemo();

/**
 * Phase 6 - Pipeline RAG complète avec Observabilité
 * @param {string} question - La question utilisateur
 * @param {object} options - Options (topK, verbose)
 */
export async function ragQuery(question, options = { topK: 5, verbose: false }) {
  const start = Date.now();

  // 1. RETRIEVAL
  const startRetrieval = Date.now();
  const chunks = await retrieveContext(question, options.topK);
  const retrievalMs = Date.now() - startRetrieval;

  // Calcul des scores pour les métriques
  const scores = chunks.map(c => c.score);
  const topScore = scores.length > 0 ? Math.max(...scores) : 0;
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  // 2. GÉNÉRATION
  const startGen = Date.now();
  // On récupère ici la réponse brute de Mistral (Phase 5)
  // Note : pour les tokens, on utilise l'approximation : 4 caractères = 1 token
  const answer = await generateCompletion(question, chunks);
  const generationMs = Date.now() - startGen;

  // 3. MÉTRIQUES & COÛT (Estimation)
  // Prix approximatif mistral-small-latest : $0.2/1M tokens (input) / $0.6/1M (output)
  // Ces valeurs sont indicatives pour l'exercice
  const promptTokens = Math.ceil((question.length + JSON.stringify(chunks).length) / 4);
  const completionTokens = Math.ceil(answer.length / 4);
  const costUSD = (promptTokens * 0.0000002) + (completionTokens * 0.0000006);

  const metrics = {
    topScore: parseFloat(topScore.toFixed(2)),
    avgScore: parseFloat(avgScore.toFixed(2)),
    retrievalMs,
    generationMs,
    totalMs: Date.now() - start,
    promptTokens,
    completionTokens,
    costUSD: parseFloat(costUSD.toFixed(6))
  };

  // 4. MODE VERBOSE
  if (options.verbose) {
    console.log(`\n[ragQuery] question="${question}"`);
    console.log(`[retrieve] ${chunks.length} chunks trouvés en ${retrievalMs}ms (Top Score: ${metrics.topScore})`);
    chunks.forEach((c, i) => console.log(`   [${c.score.toFixed(2)}] ${c.source}`));
    console.log(`[generate] ${generationMs}ms, ${promptTokens} tokens in / ${completionTokens} tokens out`);
    console.log(`[cost] $${metrics.costUSD}`);
  }

  return {
    answer,
    sources: [...new Set(chunks.map(c => c.source))], // Déduplication des sources
    chunks,
    metrics
  };
}

// TEST PHASE 6 
const test = await ragQuery("Quelle est la thématique de mon corpus ?", { verbose: true });
console.log("\n--- Résultat final ---");
console.log(test.answer);
console.log(test.metrics);