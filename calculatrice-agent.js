// calculatrice-agent.js — Phase 1 : Calculatrice avec boucle agentique
// Branche l'outil calculate sur runAgent() — le modèle résout les maths sans inventer.
import 'dotenv/config';
import { runAgent } from './agent-loop.js';
import { calculateTool, calculate } from './tools/index.js';

const answer = await runAgent(
  [calculateTool],
  { calculate },
  [
    {
      role: 'system',
      content: "Réponds en texte brut, sans markdown. Utilise ce format exact : \"X au carré vaut Y, et Z à la puissance W vaut V.\\nDonc Y + V = résultat.\""
    },
    { role: 'user', content: 'Calcule 17 au carré et 4 à la puissance 5, puis additionne les deux résultats.' }
  ]
);

// Devrait afficher : 17 au carré vaut 289, et 4 à la puissance 5 vaut 1024. Donc 289 + 1024 = 1313.
console.log('\nRéponse :', answer);

