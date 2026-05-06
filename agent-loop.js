
// agent-loop.js
import 'dotenv/config';

// Vérifie la présence des variables d'environnement requises au démarrage
if (!process.env.MISTRAL_API_KEY) {
  throw new Error('[Sécurité] Variable d\'environnement MISTRAL_API_KEY manquante.');
}

// Appel HTTP à l'API Mistral avec retry automatique (429/503 transitoires)
async function callMistral(messages, tools, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`
      },
      body: JSON.stringify({ model: 'mistral-small-latest', messages, tools, tool_choice: 'auto' })
    });

    if (response.ok) return response.json();

    const isRetryable = response.status === 429 || response.status === 503;
    if (isRetryable && attempt < retries) {
      const wait = attempt * 10000; // 10s, 20s, 30s, 40s
      console.log(`[Agent] Erreur ${response.status} — retry ${attempt}/${retries} dans ${wait / 1000}s...`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }

    throw new Error(`Erreur Mistral API : ${response.status} ${await response.text()}`);
  }
}

/**
 * Boucle agentique — tourne jusqu'à finish_reason === 'stop'.
 * @param {Array}  tools         — définitions JSON Schema des outils
 * @param {Object} toolFunctions — { nomOutil: fn } pour l'exécution locale
 * @param {Array}  messages      — tableau muté en place (permet la mémoire de conversation)
 * @param {number} maxHistory    — garde les N derniers messages (hors system) pour limiter les tokens
 * @returns {string}             — réponse textuelle finale
 */
export async function runAgent(tools, toolFunctions, messages, maxHistory = 20) {
  // Limite la taille de l'historique : garde le system prompt + les maxHistory derniers messages
  const truncate = () => {
    const system = messages.filter(m => m.role === 'system');
    const rest   = messages.filter(m => m.role !== 'system');
    if (rest.length > maxHistory) {
      messages.splice(0, messages.length, ...system, ...rest.slice(-maxHistory));
    }
  };
  let iterations = 0;

  while (iterations < 20) {
    iterations++;
    truncate(); // applique la limite avant chaque appel
    const callStart = Date.now();
    const data = await callMistral(messages, tools);
    const choice = data.choices[0];

    console.log(`[Agent] Tour ${iterations} — ${data.usage?.total_tokens ?? '?'} tokens, ${Date.now() - callStart}ms`);

    // Toujours ajouter le message du modèle à l'historique (avec ou sans tool_calls)
    messages.push(choice.message);

    if (choice.finish_reason === 'stop') {
      return choice.message.content;
    }

    if (choice.finish_reason === 'tool_calls') {
      for (const toolCall of choice.message.tool_calls) {
        const toolName = toolCall.function.name;

        // Allowlist : rejette tout nom d'outil qui ne serait pas un identifiant simple
        // (protection contre prototype pollution : __proto__, constructor, etc.)
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(toolName)) {
          throw new Error(`Nom d'outil invalide : "${toolName}"`);
        }

        const fn = Object.prototype.hasOwnProperty.call(toolFunctions, toolName)
          ? toolFunctions[toolName]
          : undefined;
        if (!fn) throw new Error(`Outil inconnu : ${toolName}`);

        let args;
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          throw new Error(`Arguments JSON invalides pour l'outil "${toolName}" : ${toolCall.function.arguments}`);
        }

        console.log(`  → ${toolName}(${toolCall.function.arguments})`);
        const result = await fn(args);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
      }
    }
  }

  throw new Error("[Agent] Nombre maximum d'itérations atteint");
}
 