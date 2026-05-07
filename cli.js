// cli.js — Interface CLI interactive Mini-Perplexity (Phase 10)
// Usage : node cli.js
import { createInterface } from 'readline';
import { ragQuery }        from './rag-pipeline.js';

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

// ─── Formatage de la réponse ───────────────────

function formatResponse(result) {
  const lines = [];

  // Réponse
  lines.push(result.answer);

  // Sources
  if (result.sources.length > 0) {
    const files = result.sources.map(s => s.file).join(', ');
    lines.push(`\nSources : [${files}]`);
  }

  // Pertinence moyenne (avg top-3)
  if (result.chunks.length > 0) {
    const sorted = result.chunks.map(c => c.score).sort((a, b) => b - a);
    const top3   = sorted.slice(0, 3);
    const avg    = (top3.reduce((a, b) => a + b, 0) / top3.length).toFixed(2);
    lines.push(`Pertinence moyenne : ${avg}`);
  }

  // Métriques
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
      console.log(formatResponse(result));
    } catch (err) {
      console.error(`  ⚠️  Erreur : ${err.message}`);
    }
  }
}

main();
