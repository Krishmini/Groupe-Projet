// eval.js — Runner d'évaluation automatique
// Usage : node eval.js
//         node eval.js --verbose   (affiche les chunks récupérés)
import { readFileSync } from 'fs';
import { ask }          from './agent.js';
import { QUESTIONS_FILE } from './config.js';

// ─── Parsing de questions-test.txt ───────────────────────────────────────────
// Extrait les lignes qui commencent par "Q<n>:" — ignore les commentaires (#)
// et les lignes de section (##).

function loadQuestions(filePath) {
  let raw;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    console.error(`[eval] Fichier introuvable : ${filePath}`);
    console.error('       Créez questions-test.txt avec des lignes "Q1: Votre question ?"');
    process.exit(1);
  }

  const questions = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    // Ligne de question : "Q1: texte", "Q10: texte", etc.
    const match = trimmed.match(/^Q(\d+):\s*(.+)/);
    if (match) {
      questions.push({ id: `Q${match[1]}`, text: match[2].trim() });
    }
  }

  if (questions.length === 0) {
    console.error('[eval] Aucune question trouvée dans le fichier.');
    console.error('       Format attendu : "Q1: Votre question ?"');
    process.exit(1);
  }

  return questions;
}

// ─── Affichage d'un résultat ───────

function printResult(id, result, verbose) {
  const status = result.contextFound ? '✅ contexte trouvé' : '❌ hors corpus';
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`${id} — ${status}`);
  console.log(`Question : ${result.question}`);

  if (result.sources.length > 0) {
    console.log(`Sources  : ${result.sources.join(', ')}`);
  }

  if (verbose && result.chunks.length > 0) {
    console.log('Chunks   :');
    result.chunks.forEach(c =>
      console.log(`  [${c.score}] ${c.text.slice(0, 100)}...`)
    );
  }

  console.log(`Réponse  : ${result.answer}`);
}

// ─── Runner principal ──────────────

async function main() {
  const verbose = process.argv.includes('--verbose');

  console.log('═'.repeat(60));
  console.log('  ÉVALUATION RAG — questions-test.txt');
  console.log('═'.repeat(60));

  const questions = loadQuestions(QUESTIONS_FILE);
  console.log(`\n${questions.length} questions chargées depuis ${QUESTIONS_FILE}\n`);

  const results = [];
  let withContext = 0;

  for (const q of questions) {
    process.stdout.write(`  ${q.id} en cours...`);

    try {
      const result = await ask(q.text);
      results.push({ id: q.id, ...result, error: null });
      if (result.contextFound) withContext++;
      process.stdout.write(' ✓\n');
    } catch (err) {
      results.push({ id: q.id, question: q.text, answer: null, contextFound: false, sources: [], chunks: [], error: err.message });
      process.stdout.write(` ✗ (${err.message})\n`);
    }
  }

  // Affichage détaillé de chaque résultat
  for (const r of results) {
    if (r.error) {
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`${r.id} — ⚠️  ERREUR`);
      console.log(`Question : ${r.question}`);
      console.log(`Erreur   : ${r.error}`);
    } else {
      printResult(r.id, r, verbose);
    }
  }

  // ─── Résumé ─────────────
  const errors   = results.filter(r => r.error).length;
  const answered = results.length - errors;

  console.log(`\n${'═'.repeat(60)}`);
  console.log('  RÉSUMÉ');
  console.log('═'.repeat(60));
  console.log(`Questions traitées : ${answered}/${results.length}`);
  console.log(`Contexte trouvé    : ${withContext}/${answered} (${Math.round(withContext / answered * 100)}%)`);
  console.log(`Hors corpus        : ${answered - withContext}/${answered}`);
  if (errors > 0) console.log(`Erreurs API        : ${errors}`);
  console.log(`\nNB : notez chaque réponse (0/1/2) dans questions-test.txt`);
  console.log(`     Score /20 = Σ notes | Précision happy paths = Q1–Q6 | Adversarial = Q9–Q10`);
}

main().catch(err => {
  console.error('[eval] Erreur fatale :', err.message);
  process.exit(1);
});
