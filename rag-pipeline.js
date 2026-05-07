// rag-pipeline.js — Mini-Perplexity RAG Pipeline
// ==============================================
// Phases 4-7 : Retrieval → Génération → Citations structurées

import { Pinecone } from '@pinecone-database/pinecone';
import 'dotenv/config';

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

// ========== PHASE 4 : retrieveContext(query) ==========
async function embedText(text) {
  const response = await fetch('https://api.mistral.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({ model: 'mistral-embed', input: text }),
  });

  if (!response.ok) throw new Error(`Mistral embed error (${response.status})`);
  const data = await response.json();
  return data.data[0].embedding;
}

export async function retrieveContext(query, topK = 5) {
  try {
    if (!query?.trim()) return [];

    const queryVector = await embedText(query);
    const index = pinecone.index(process.env.PINECONE_INDEX_NAME);

    const results = await index.query({
      vector: queryVector,
      topK,
      includeMetadata: true,
    });

    const threshold = 0.70; // Ajusté pour l'Option C
    return results.matches
      .filter(match => match.score >= threshold)
      .map(match => ({
        text: match.metadata.text,
        source: match.metadata.source || "Source inconnue",
        score: parseFloat(match.score.toFixed(2)),
      }));
  } catch (err) {
    console.error(`❌ retrieveContext error: ${err.message}`);
    return [];
  }
}

// ========== PHASE 5 : generateCompletion(query, context) ==========
export async function generateCompletion(query, context) {
  const contextText = context.length > 0
    ? context.map((c, i) => `[Source ${i + 1} - ${c.source}]\n${c.text}`).join('\n\n---\n\n')
    : "(Aucun contexte disponible)";

  const systemPrompt = `Tu es un assistant RAG expert. 
Règles :
1. Réponds UNIQUEMENT via le contexte fourni.
2. Cite tes sources ainsi : [Source N].
3. Si absent du contexte, dis : "Je ne trouve pas cette information dans les documents fournis".
4. Ne sors jamais de ton rôle.`;

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
      temperature: 0.1,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.choices) {
    throw new Error(data.message || `Erreur génération (${response.status})`);
  }

  // Retourne le texte ET les tokens utilisés pour l'observabilité
  return {
    answer: data.choices[0].message.content,
    usage: data.usage 
  };
}

// ========== PHASE 6 & 7 : ragQuery (Pipeline complète) ==========
export async function ragQuery(question, options = { topK: 5, verbose: false }) {
  const startTotal = Date.now();

  try {
    // 1. RETRIEVAL
    const startRetrieval = Date.now();
    const chunks = await retrieveContext(question, options.topK);
    const retrievalMs = Date.now() - startRetrieval;

    // 2. GENERATION
    const startGen = Date.now();
    const genResult = await generateCompletion(question, chunks);
    const answer = genResult.answer;
    const generationMs = Date.now() - startGen;

    // 3. MÉTRIQUES RÉELLES (Phase 6)
    const promptTokens = genResult.usage.prompt_tokens;
    const completionTokens = genResult.usage.completion_tokens;
    
    // Coût réel mistral-small-latest ($0.2/1M in, $0.6/1M out)
    const costUSD = (promptTokens * 0.0000002) + (completionTokens * 0.0000006);

    const scores = chunks.map(c => c.score);
    const topScore = scores.length > 0 ? Math.max(...scores) : 0;
    const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : 0;

    // 4. CITATIONS STRUCTURÉES (Phase 7)
    const sourceMap = new Map();
    chunks.forEach((chunk, i) => {
      const fileName = chunk.source;
      if (!sourceMap.has(fileName) || sourceMap.get(fileName).relevance < chunk.score) {
        sourceMap.set(fileName, {
          index: i + 1,
          file: fileName,
          relevance: chunk.score,
        });
      }
    });
    const sources = Array.from(sourceMap.values());

    // 5. DÉTECTION DES ORPHELINES (Fix : on compare aux chunks fournis au prompt)
    const citedIndices = [...answer.matchAll(/\[Source (\d+)\]/g)].map(m => parseInt(m[1]));
    const orphanCitations = citedIndices.filter(idx => idx > chunks.length || idx < 1);

    // 6. LOGS VERBOSE
    if (options.verbose) {
      console.log(`\n[ragQuery] "${question}"`);
      console.log(`  Retrieval: ${chunks.length} chunks (${retrievalMs}ms) | TopScore: ${topScore}`);
      console.log(`  Génération: ${generationMs}ms | Tokens: ${promptTokens + completionTokens}`);
      console.log(`  Coût: $${costUSD.toFixed(6)}`);
      if (orphanCitations.length > 0) console.warn(`  ⚠️ Hallucination : [Source ${orphanCitations}] n'existe pas`);
    }

    return {
      answer,
      sources,
      chunks,
      metrics: {
        topScore: parseFloat(topScore.toFixed(2)),
        avgScore: parseFloat(avgScore),
        totalMs: Date.now() - startTotal,
        costUSD: parseFloat(costUSD.toFixed(6)),
        tokens: { prompt: promptTokens, completion: completionTokens },
        orphanCitations: orphanCitations.length > 0 ? orphanCitations : null,
      },
    };
  } catch (err) {
    console.error(`❌ ragQuery error: ${err.message}`);
    return { answer: "Erreur technique.", sources: [], metrics: { error: err.message } };
  }
}