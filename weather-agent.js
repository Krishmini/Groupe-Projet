
// weather-agent.js — Phase 2 : Météo + Calculatrice
// Le modèle choisit seul entre les deux outils (ex: météo puis conversion Fahrenheit).
import 'dotenv/config';
import { runAgent } from './agent-loop.js';
import { calculateTool, calculate, weatherTool, get_weather } from './tools/index.js';

const tools = [weatherTool, calculateTool];
const toolFunctions = { get_weather, calculate };

// Devrait : appeler get_weather(London) puis calculate((temp*9/5)+32)
const answer = await runAgent(
  tools,
  toolFunctions,
  [
    {
      role: 'system',
      content: "Réponds en texte brut, sans markdown ni bullet points. Exemple : \"À Londres, il fait 16°C (60.8°F), ciel nuageux, humidité 51%.\""
    },
    { role: 'user', content: "Quelle est la météo à Londres, et si je convertis la température en Fahrenheit ?" }
  ]
);

console.log('\nRéponse :', answer);