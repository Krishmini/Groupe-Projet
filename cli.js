// cli.js — Interface CLI interactive Mini-Perplexity (Phase 10)
// Usage : node cli.js
import { createInterface } from 'readline';
import { ragQuery, formatResponse } from './rag-pipeline.js';

// ─── Prompt utilisateur via Promise ─────────

function createCLI() {
  const rl = createInterface({
    input:  process.stdin,
    output: process.stdout
  });

  // Fermeture propre sur Ctrl+C (SIGINT) — pas de promesse pendante
  rl.on('SIGINT', () => {
    console.log('\n\nAu revoir !');
    rl.close();
    process.exit(0);
  });

  function prompt(text) {
    return new Promise((resolve) => {
      rl.question(text, (answer) => resolve(answer));
    });
  }

  return { rl, prompt };
}

// ─── Formatage de la réponse (délègue à rag-pipeline.js J5 Phase 5) ─────────

function formatCLIResponse(result) {
  const lines = [];

  // Réponse + sources + disclaimer (via formatResponse exporté)
  lines.push(formatResponse(result.answer, result.sources, result.metrics.confidence));

  // Métriques CLI
  const m = result.metrics;
  const totalMs = m.retrievalMs + m.generationMs;
  lines.push(`(${totalMs}ms | ${m.promptTokens} tokens in | $${m.costUSD})`);

  return lines.join('\n');
}

// ─── Boucle principale ───────────
async function main() {
  console.log('═'.repeat(60));
  console.log('  Mini-Perplexity — posez vos questions sur le corpus');
  console.log('  (Ctrl+C pour quitter)');
  console.log('═'.repeat(60));

  const { rl, prompt } = createCLI();

  while (true) {
    const question = await prompt('\n> ');

    // Question vide → redemander sans appeler le pipeline
    const trimmed = question.trim();
    if (trimmed.length === 0) {
      console.log('  (question vide — tapez votre question ou Ctrl+C pour quitter)');
      continue;
    }

    // Question ultra longue → avertissement (sanitizeQuestion dans query.js coupe à 500 chars)
    if (trimmed.length > 2000) {
      console.log(`  ⚠️  Question très longue (${trimmed.length} chars) — elle sera tronquée à 500 caractères.`);
    }

    console.log('  Recherche en cours...\n');

    try {
      const result = await ragQuery(trimmed, { topK: 5, verbose: false });
      console.log(formatCLIResponse(result));
    } catch (err) {
      console.error(`  ⚠️  Erreur : ${err.message}`);
    }
  }
}

main();
