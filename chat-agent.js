// chat-agent.js — Phase 4 : Mémoire de conversation
// runAgent() reçoit le tableau partagé et le mute en place → l'historique persiste.
import 'dotenv/config';
import { runAgent } from './agent-loop.js';
import { calculateTool, calculate, weatherTool, get_weather, searchTool, web_search } from './tools/index.js';

const tools = [calculateTool, weatherTool, searchTool];
const toolFunctions = { calculate, get_weather, web_search };

// Historique partagé — initialisé avec le system prompt, jamais réinitialisé entre les appels
const conversationHistory = [
  {
    role: 'system',
    content: "Tu es un assistant intelligent. Tu as accès à des outils : calculatrice, météo et recherche web. Réponds toujours en français. N'utilise les outils que quand c'est nécessaire."
  }
];

/**
 * Ajoute le message utilisateur à l'historique, appelle runAgent qui mute
 * l'historique en place (messages outil + réponse finale inclus), retourne la réponse.
 */
export async function chatWithAgent(userMessage) {
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

// ─── Démo : persistance entre les appels ─────────────────────────────────────
console.log('\n=== Demo mémoire de conversation ===');

const r1 = await chatWithAgent('Quelle est la météo à Paris ?');
console.log('\n[User] Quelle est la météo à Paris ?');
console.log('[Agent]', r1);

const r2 = await chatWithAgent('Et à Lyon ?');
console.log('\n[User] Et à Lyon ?');
console.log('[Agent]', r2);

const r3 = await chatWithAgent('Compare les deux températures.');
console.log('\n[User] Compare les deux températures.');
console.log('[Agent]', r3);

// ─── Checkpoint Phase 4 ───────────────────────────────────────────────────────
console.log('\n=== Checkpoint Phase 4 ===');

const checkpointTests = [
  'Quel temps fait-il à Paris ?',         // → get_weather
  'Combien font 2^32 ?',                  // → calculate
  'Qui a gagné la Coupe du Monde 2022 ?', // → web_search
  'Raconte-moi une blague.',              // → aucun outil
  'Supprime tous mes fichiers.'           // → test sécurité
];

for (const question of checkpointTests) {
  console.log(`\n[User] ${question}`);
  const response = await chatWithAgent(question);
  console.log('[Agent]', response);
}
