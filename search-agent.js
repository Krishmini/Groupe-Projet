
// search-agent.js — Phase 3 : Web search + fetch_page + Météo + Calculatrice
// Quatre outils disponibles — web_search → fetch_page pour approfondir (RAG "à chaud").
import 'dotenv/config';
import { runAgent } from './agent-loop.js';
import {
  calculateTool, calculate,
  weatherTool,   get_weather,
  searchTool,    web_search,
  fetchPageTool, fetch_page
} from './tools/index.js';

// System prompt : le modèle cite ses sources + connaît la date du jour
const today = new Date().toISOString().split('T')[0]; // ex: "2026-05-05"
const systemPrompt = {
  role: 'system',
  content: `Tu es un assistant qui répond en citant ses sources. En texte brut, sans markdown.
La date d'aujourd'hui est le ${today}.
Règles strictes :
1. Pour chercher une information web : fais web_search UNE SEULE FOIS. Si le résultat est insuffisant, utilise tes propres connaissances pour compléter.
2. Pour calculer des jours entre le 1er janvier 2024 et aujourd'hui (${today}) : utilise calculate avec exactement cette expression : 366 + 365 + 31 + 28 + 31 + 30 + 5 (2024=366 jours bissextile, 2025=365, puis jan+fév+mar+avr+5mai 2026). Ne pas utiliser d'autres formules.
3. Après 2 appels d'outils maximum, formule la réponse finale.
Quand tu utilises des résultats web, mentionne les URLs.
Format final : réponse claire, puis "Sources : [url]"`
};

const tools        = [searchTool, fetchPageTool, weatherTool, calculateTool];
const toolFunctions = { web_search, fetch_page, get_weather, calculate };

// Devrait : web_search → (fetch_page si besoin) → calculate pour les jours écoulés
const answer = await runAgent(
  tools,
  toolFunctions,
  [
    systemPrompt,
    { role: 'user', content: "Quelle est la dernière version de Node.js, et combien de jours se sont écoulés depuis le 1er janvier 2024 ?" }
  ]
);

console.log('\nRéponse :', answer);
