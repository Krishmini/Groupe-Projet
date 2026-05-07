// rag-pipeline.js — Mini-Perplexity RAG Pipeline
// ==============================================
// Phases 1-7 : Error handling, retry, cost tracking, confidence scoring, disclaimer

import { Pinecone } from '@pinecone-database/pinecone';
import 'dotenv/config';

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

// ========== PHASE 1 : CircuitBreaker ==========
class CircuitBreaker {
  constructor(options = {}) {
    this.threshold = options.threshold || 5;
    this.timeout = options.timeout || 30000;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure > this.timeout) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
      } else {
        throw new Error('[CircuitBreaker] Circuit ouvert, requête refusée');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 3) {
        this.state = 'CLOSED';
      }
    }
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.threshold) {
      console.log('[CircuitBreaker] Circuit ouvert');
      this.state = 'OPEN';
    }
  }
}

const llmBreaker = new CircuitBreaker({ threshold: 5, timeout: 30000 });

// ========== PHASE 1 : withRetry wrapper ==========
async function withRetry(fn, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable = err.message.includes('429') || err.message.includes('503');
      if (!isRetryable || attempt === maxRetries) throw err;

      const delay = Math.pow(2, attempt) * baseDelay + Math.random() * 500;
      console.log(`Tentative ${attempt + 1}/${maxRetries} dans ${Math.round(delay)}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// ========== PHASE 1 : callLLM avec timeout et circuit breaker ==========
async function callLLM(prompt, options = {}) {
  const timeout = options.timeout || 30000;
  const model = options.model || 'mistral-large-latest';

  return llmBreaker.execute(async () => {
    return withRetry(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
          },
          body: JSON.stringify(prompt),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`HTTP ${response.status}: ${errorData.message || 'Unknown error'}`);
        }

        const data = await response.json();
        if (!data.choices) throw new Error('No choices in response');

        return data;
      } catch (err) {
        if (err.name === 'AbortError') {
          throw new Error(`Timeout LLM après ${timeout}ms`);
        }
        throw err;
      } finally {
        clearTimeout(timeoutId);
      }
    }, 3, 1000);
  });
}

// ========== PHASE 2 : calculateCost ==========
let sessionCostUSD = 0;

function calculateCost(promptTokens, completionTokens, model = 'mistral-large-latest') {
  let costUSD = 0;
  
  if (model === 'mistral-large-latest') {
    // $2.00/1M input, $6.00/1M output
    costUSD = (promptTokens * 2.00) / 1_000_000 + (completionTokens * 6.00) / 1_000_000;
  } else if (model === 'mistral-small-latest') {
    // $0.2/1M input, $0.6/1M output
    costUSD = (promptTokens * 0.2) / 1_000_000 + (completionTokens * 0.6) / 1_000_000;
  }

  sessionCostUSD += costUSD;
  
  return {
    costUSD: parseFloat(costUSD.toFixed(6)),
    promptTokens,
    completionTokens,
    sessionTotal: parseFloat(sessionCostUSD.toFixed(6)),
  };
}

// ========== PHASE 3 : computeConfidence ==========
function computeConfidence(matches) {
  if (!matches || matches.length === 0) {
    return { topScore: 0, avgScore: 0, sufficient: false };
  }

  const scores = matches.map(m => m.score);
  const topScore = Math.max(...scores);
  const topThreeScores = scores.slice(0, 3);
  const avgScore = topThreeScores.reduce((a, b) => a + b, 0) / topThreeScores.length;
  
  const threshold = parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.75');
  const sufficient = topScore >= threshold;

  return {
    topScore: parseFloat(topScore.toFixed(2)),
    avgScore: parseFloat(avgScore.toFixed(2)),
    sufficient,
  };
}

// ========== PHASE 5 : formatResponse ==========
function formatResponse(answer, sources, confidence) {
  let formatted = answer;

  if (sources && sources.length > 0) {
    const sourcesList = sources.map(s => `- ${s.file}${s.page ? ` (page ${s.page})` : ''}`).join('\n');
    formatted += `\n\n**Sources:**\n${sourcesList}`;
  }

  // Footer avec note de confiance si < 0.80
  let footer = '\n\n---\n*Réponse générée par IA à partir des documents fournis. Vérifiez les sources avant toute décision importante.*';
  
  if (confidence && confidence.topScore < 0.80 && confidence.topScore > 0) {
    footer += `\n\n⚠️ Score de pertinence contextuelle : ${Math.round(confidence.topScore * 100)}%`;
  }

  formatted += footer;

  return formatted;
}


// ========== Embedding avec robustesse ==========
async function embedText(text) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch('https://api.mistral.ai/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({ model: 'mistral-embed', input: text }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Mistral embed error (${response.status})`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Timeout embedding après 15000ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
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

    const threshold = 0.70;
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

  const promptData = {
    model: 'mistral-small-latest',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Contexte :\n${contextText}\n\nQuestion : ${query}` },
    ],
    temperature: 0.1,
  };

  const data = await callLLM(promptData, { timeout: 30000, model: 'mistral-small-latest' });

  if (!data.choices) {
    throw new Error('No choices in response');
  }

  return {
    answer: data.choices[0].message.content,
    usage: data.usage,
  };
}

// ========== PHASE 6 & 7 : ragQuery (Pipeline complète avec confidence, cost, disclaimer) ==========
export async function ragQuery(question, options = { topK: 5, verbose: false }) {
  const startTotal = Date.now();

  try {
    // 1. RETRIEVAL
    const startRetrieval = Date.now();
    const chunks = await retrieveContext(question, options.topK);
    const retrievalMs = Date.now() - startRetrieval;

    // 2. CONFIDENCE SCORING (Phase 3)
    const confidence = computeConfidence(chunks);
    
    // 3. EARLY EXIT si confiance insuffisante (Phase 4)
    if (!confidence.sufficient) {
      const answer = "Je ne dispose pas d'informations suffisantes dans les documents fournis pour répondre à cette question.";
      const formatted = formatResponse(answer, [], confidence);
      
      if (options.verbose) {
        console.log(`\n[ragQuery] "${question}"`);
        console.log(`  Confiance : ${Math.round(confidence.topScore * 100)}% (seuil: ${Math.round(parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.75') * 100)}%) → Court-circuit`);
      }

      return {
        answer: formatted,
        sources: [],
        chunks: [],
        confidence,
        metrics: {
          topScore: confidence.topScore,
          avgScore: confidence.avgScore,
          totalMs: Date.now() - startTotal,
          costUSD: 0,
          tokens: { prompt: 0, completion: 0 },
          orphanCitations: null,
          shortCircuit: true,
        },
      };
    }

    // 4. GENERATION (si confiance suffisante)
    const startGen = Date.now();
    const genResult = await generateCompletion(question, chunks);
    const answer = genResult.answer;
    const generationMs = Date.now() - startGen;

    // 5. COST TRACKING (Phase 2)
    const costData = calculateCost(genResult.usage.prompt_tokens, genResult.usage.completion_tokens, 'mistral-small-latest');

    const scores = chunks.map(c => c.score);
    const topScore = scores.length > 0 ? Math.max(...scores) : 0;
    const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : 0;

    // 6. CITATIONS STRUCTURÉES
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

    // 7. FORMATTED RESPONSE avec disclaimer (Phase 5)
    const formatted = formatResponse(answer, sources, confidence);

    // 8. DETECTION DES HALLUCINATIONS
    const citedIndices = [...answer.matchAll(/\[Source (\d+)\]/g)].map(m => parseInt(m[1]));
    const orphanCitations = citedIndices.filter(idx => idx > chunks.length || idx < 1);

    // 9. LOGS VERBOSE
    if (options.verbose) {
      console.log(`\n[ragQuery] "${question}"`);
      console.log(`  Retrieval: ${chunks.length} chunks (${retrievalMs}ms) | TopScore: ${topScore}`);
      console.log(`  Confiance contextuelle : ${Math.round(confidence.topScore * 100)}% (top match: ${confidence.topScore}, moyenne top-3: ${confidence.avgScore})`);
      console.log(`  Génération: ${generationMs}ms | Tokens: ${costData.promptTokens} (input) + ${costData.completionTokens} (output)`);
      console.log(`  [Stats] Input: ${costData.promptTokens} tokens | Output: ${costData.completionTokens} tokens | Coût: $${costData.costUSD.toFixed(4)} | Session total: $${costData.sessionTotal.toFixed(4)}`);
      if (orphanCitations.length > 0) console.warn(`  ⚠️ Hallucination : [Source ${orphanCitations}] n'existe pas`);
    }

    return {
      answer: formatted,
      sources,
      chunks,
      confidence,
      metrics: {
        topScore: parseFloat(topScore.toFixed(2)),
        avgScore: parseFloat(avgScore),
        totalMs: Date.now() - startTotal,
        costUSD: costData.costUSD,
        sessionTotal: costData.sessionTotal,
        tokens: { prompt: costData.promptTokens, completion: costData.completionTokens },
        orphanCitations: orphanCitations.length > 0 ? orphanCitations : null,
      },
    };
  } catch (err) {
    console.error(`❌ ragQuery error: ${err.message}`);
    return { 
      answer: "Erreur technique lors du traitement de votre question.", 
      sources: [], 
      metrics: { error: err.message } 
    };
  }
}

// ========== Exports utiles pour les tests et intégration ==========
export { calculateCost, computeConfidence, formatResponse };
export { llmBreaker };
export function getSessionCost() {
  return parseFloat(sessionCostUSD.toFixed(6));
}
export function resetSessionCost() {
  sessionCostUSD = 0;
}