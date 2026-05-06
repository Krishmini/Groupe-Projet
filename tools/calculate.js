// tools/calculate.js — Outil calculatrice
import { evaluate } from 'mathjs';
import validator from 'validator';

export const calculateTool = {
  type: 'function',
  function: {
    name: 'calculate',
    description: 'Évalue une expression mathématique et retourne le résultat numérique. À utiliser pour tout calcul arithmétique : additions, multiplications, puissances, conversions, etc.',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: "L'expression mathématique à évaluer, ex: '2 ^ 32', '(15 * 4) / 3', '(12 * 9/5) + 32'"
        }
      },
      required: ['expression']
    }
  }
};

// mathjs.evaluate est sûr : il n'exécute pas de code arbitraire (contrairement à eval)
export function calculate({ expression }) {
  if (!expression || typeof expression !== 'string' || validator.isEmpty(expression.trim())) {
    return { error: 'Expression invalide : doit être une chaîne non vide.' };
  }
  if (!validator.isLength(expression.trim(), { min: 1, max: 500 })) {
    return { error: 'Expression invalide : trop longue (max 500 caractères).' };
  }
  try {
    const result = evaluate(validator.trim(expression));
    return { result };
  } catch (err) {
    return { error: `Expression invalide : ${err.message}` };
  }
}
