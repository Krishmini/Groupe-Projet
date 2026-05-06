// hybrid-agent.js — Phase 9 : Agent hybride (Track A + Track B)
// Quatre outils : calculate, get_weather, web_search, rag_search
// Le modèle choisit autonomiquement lequel appeler selon la question.
import 'dotenv/config';
import { runAgent } from './agent-loop.js';
import {
  calculateTool, calculate,
  weatherTool,   get_weather,
  searchTool,    web_search,
  fetchPageTool, fetch_page
} from './tools/index.js';
import { getEmbedding } from './vector-store.js';

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_HOST    = process.env.PINECONE_INDEX_HOST;

// Vérifie la présence des variables d'environnement Pinecone au démarrage
if (!PINECONE_API_KEY || !PINECONE_HOST) {
  throw new Error('[Sécurité] Variables d\'environnement PINECONE_API_KEY et/ou PINECONE_INDEX_HOST manquantes.');
}

// ─── Outil rag_search ────────

const ragTool = {
  type: 'function',
  function: {
    name: 'rag_search',
    description: "Cherche des informations dans la base de documents internes indexée. Utiliser pour des questions sur le contenu du corpus privé, la documentation interne, ou quand web_search ne retourne pas de résultats pertinents.",
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'La requête de recherche sémantique' }
      },
      required: ['query']
    }
  }
};

async function rag_search({ query }) {
  const vector = await getEmbedding(query);

  const res = await fetch(`${PINECONE_HOST}/query`, {
    method: 'POST',
    headers: {
      'Api-Key':      PINECONE_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ vector, topK: 3, includeMetadata: true })
  });

  if (!res.ok) throw new Error(`Pinecone query → ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.matches.map(m => ({ score: m.score, text: m.metadata.text }));
}

// ─── Agent hybride ──────

const tools = [calculateTool, weatherTool, searchTool, fetchPageTool, ragTool];
const toolFunctions = { calculate, get_weather, web_search, fetch_page, rag_search };

const conversationHistory = [
  {
    role: 'system',
    content: `Tu es un assistant intelligent avec accès à cinq outils :
- calculate    : pour tout calcul arithmétique
- get_weather  : pour la météo en temps réel (wttr.in)
- web_search   : pour les informations récentes sur le web (DuckDuckGo)
- fetch_page   : pour lire le contenu d'une page web après web_search
- rag_search   : pour les documents internes indexés dans Pinecone (corpus privé Node.js)
Choisis l'outil le plus adapté. Réponds en français, en texte brut sans markdown.
Pour web_search : une seule recherche, complète avec tes connaissances si nécessaire.`
  }
];

async function chatWithHybridAgent(userMessage) {
  // Validation input : rejette les messages vides ou trop longs
  if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length === 0) {
    return "Message invalide : veuillez entrer une question.";
  }
  if (userMessage.length > 2000) {
    return "Message trop long : maximum 2000 caractères.";
  }
  conversationHistory.push({ role: 'user', content: userMessage.trim() });
  return runAgent(tools, toolFunctions, conversationHistory);
}

// ─── Tests Phase 9 ──────────
const tests = [
  { q: "Qui a créé Node.js ?",                              expected: "rag_search"  },
  { q: "Qui a gagné la Coupe du Monde 2022 ?",              expected: "web_search"  },
  { q: "Quel temps fait-il à Lyon ?",                       expected: "get_weather" },
  { q: "Combien fait la surface d'une sphère de rayon 5 ?", expected: "calculate"   }
];

console.log('=== Phase 9 : Agent Hybride ===\n');

for (const { q, expected } of tests) {
  console.log(`[User] ${q}  (outil attendu : ${expected})`);
  const answer = await chatWithHybridAgent(q);
  console.log(`[Agent] ${answer}\n`);
}
