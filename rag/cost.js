// cost.js — Calcul et suivi des coûts API Mistral (J5 Phase 2)

const MODEL_PRICING = {
  'mistral-small-latest':  { input: 0.1  / 1_000_000, output: 0.3  / 1_000_000 },
  'mistral-large-latest':  { input: 2.0  / 1_000_000, output: 6.0  / 1_000_000 },
};

let sessionCostUSD = 0;

export function getSessionCost() { return sessionCostUSD; }
export function resetSessionCost() { sessionCostUSD = 0; }
export function addSessionCost(amount) { sessionCostUSD += amount; }

export function calculateCost(promptTokens, completionTokens, model = 'mistral-small-latest') {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['mistral-small-latest'];
  const costUSD = parseFloat(
    (promptTokens * pricing.input + completionTokens * pricing.output).toFixed(6)
  );
  return { costUSD, promptTokens, completionTokens };
}
