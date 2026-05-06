// agent.js — Couche LLM : injecte le contexte récupéré et génère une réponse
import { retrieveContext }                             from './query.js';
import { MISTRAL_API_KEY, CHAT_MODEL, MAX_CONTEXT_CHARS, MAX_RETRIES, RETRY_BASE_MS } from './config.js';

// ─── System prompt ────────────
const SYSTEM_PROMPT = `Tu es un assistant de recherche documentaire.
Réponds UNIQUEMENT en te basant sur le contexte fourni ci-dessous.
Ne jamais inventer ni compléter avec des connaissances externes.
Si la réponse n'est pas dans le contexte, réponds exactement :
"Je ne trouve pas cette information dans les documents disponibles."
Réponds en français, en texte brut, sans markdown.`;

// ─── Appel Mistral Chat (avec retry) ────────────

async function callMistral(messages) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${MISTRAL_API_KEY}`
      },
      body: JSON.stringify({
        model:       CHAT_MODEL,
        messages,
        temperature: 0,       // déterministe — réduit les variations aléatoires
        max_tokens:  512      // limite la réponse pour éviter les débordements
      })
    });

    if (res.ok) {
      const data = await res.json();
      return data.choices[0].message.content.trim();
    }

    const isRetryable = res.status === 429 || res.status === 503;
    if (isRetryable && attempt < MAX_RETRIES) {
      const wait = attempt * RETRY_BASE_MS;
      console.warn(`  [agent] Erreur ${res.status} — retry ${attempt}/${MAX_RETRIES} dans ${wait / 1000}s...`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }

    throw new Error(`Mistral chat → HTTP ${res.status}`);
  }
}

// ─── Construction du prompt ───────────────────────────────────────────────────

function buildUserMessage(question, chunks) {
  // Formatage : [source] texte — séparés par des lignes vides
  let context = chunks
    .map(c => `[${c.source}] ${c.text}`)
    .join('\n\n');

  // Troncature si le contexte dépasse la limite
  if (context.length > MAX_CONTEXT_CHARS) {
    context = context.slice(0, MAX_CONTEXT_CHARS) + '\n[...contexte tronqué]';
  }

  return `Contexte :\n${context}\n\nQuestion : ${question}`;
}

// ─── Fonction principale ──────────────────────────────────────────────────────

/**
 * Répond à une question en utilisant uniquement le corpus indexé.
 *
 * @param {string} rawQuestion — question brute de l'utilisateur
 * @returns {{
 *   question:       string,
 *   answer:         string,
 *   contextFound:   boolean,
 *   chunks:         Array<{ score: number, text: string, source: string }>,
 *   sources:        string[]
 * }}
 */
export async function ask(rawQuestion) {
  // 1. Retrieval — embed + Pinecone
  const chunks = await retrieveContext(rawQuestion);
  const contextFound = chunks.length > 0;

  // 2. Si aucun chunk pertinent → réponse directe sans appeler le LLM
  //    (évite un appel API inutile + garantit la réponse attendue)
  if (!contextFound) {
    return {
      question:     rawQuestion,
      answer:       "Je ne trouve pas cette information dans les documents disponibles.",
      contextFound: false,
      chunks:       [],
      sources:      []
    };
  }

  // 3. Construction du prompt
  const userMessage = buildUserMessage(rawQuestion, chunks);
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user',   content: userMessage   }
  ];

  // 4. Génération de la réponse
  const answer = await callMistral(messages);

  // 5. Sources uniques (pour affichage / traçabilité)
  const sources = [...new Set(chunks.map(c => c.source))];

  return { question: rawQuestion, answer, contextFound, chunks, sources };
}
