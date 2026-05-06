// eval.js — Runner d'évaluation + génération de eval-table.md (Phase 8)
// Usage : node eval.js                (exécute + génère eval-table.md)
//         node eval.js --verbose      (affiche les chunks récupérés)
//         node eval.js --dry          (affiche sans régénérer le fichier)
import { readFileSync, writeFileSync } from 'fs';
import { ragQuery }       from './agent.js';
import { QUESTIONS_FILE } from './config.js';

// ─── Parsing de questions-test.txt ────────

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
    const match = trimmed.match(/^Q(\d+):\s*(.+)/);
    if (match) {
      questions.push({ id: parseInt(match[1], 10), text: match[2].trim() });
    }
  }

  if (questions.length === 0) {
    console.error('[eval] Aucune question trouvée. Format attendu : "Q1: Votre question ?"');
    process.exit(1);
  }
  return questions;
}

// ─── Calcul avg top-3 score ──────────

function avgTop3(chunks) {
  if (chunks.length === 0) return 0;
  const sorted = chunks.map(c => c.score).sort((a, b) => b - a);
  const top3   = sorted.slice(0, 3);
  return parseFloat((top3.reduce((a, b) => a + b, 0) / top3.length).toFixed(4));
}

// ─── Affichage console d'un résultat ───────────

function printResult(row, verbose) {
  const status = row.contextFound ? '✅ contexte trouvé' : '❌ hors corpus';
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Q${row.id} — ${status}`);
  console.log(`Question : ${row.question}`);
  console.log(`Top-1    : ${row.top1Score}  |  Avg top-3 : ${row.avgTop3Score}`);
  console.log(`Tokens   : ${row.tokensIn}/${row.tokensOut}  |  Coût : $${row.costUSD}`);
  console.log(`Latence  : ${row.latencyMs}ms`);

  if (row.sources.length > 0) {
    console.log(`Sources  : ${row.sources.map(s => s.file).join(', ')}`);
  }

  if (verbose && row.chunks.length > 0) {
    console.log('Chunks   :');
    row.chunks.forEach(c =>
      console.log(`  [${c.score}] ${c.source}, "${c.text.slice(0, 80)}..."`)
    );
  }

  console.log(`Réponse  : ${row.answer.slice(0, 200)}${row.answer.length > 200 ? '...' : ''}`);
}

// ─── Génération de eval-table.md ────────────

function generateEvalTable(rows) {
  const lines = [];
  lines.push('# Évaluation RAG — Baseline (Phase 8)');
  lines.push('');
  lines.push('> Généré automatiquement par `node eval.js`. Les colonnes Pertinence et Fidélité sont à remplir manuellement.');
  lines.push('');
  lines.push('| # | Question | Top-1 score | Avg top-3 | Tokens (in/out) | Coût ($) | Latence (ms) | Pertinence (1-5) | Fidélité (1-5) | Notes |');
  lines.push('|---|----------|-------------|-----------|-----------------|----------|--------------|------------------|----------------|-------|');

  for (const r of rows) {
    if (r.error) {
      lines.push(`| ${r.id} | ${r.question.slice(0, 50)}... | - | - | - | - | - | - | - | ⚠️ ${r.error.slice(0, 30)} |`);
    } else {
      lines.push(
        `| ${r.id} | ${r.question.slice(0, 50)}${r.question.length > 50 ? '...' : ''} ` +
        `| ${r.top1Score} | ${r.avgTop3Score} ` +
        `| ${r.tokensIn} / ${r.tokensOut} | ${r.costUSD} ` +
        `| ${r.latencyMs} | ___ | ___ ` +
        `| ${r.contextFound ? 'Sources: ' + r.sources.map(s => s.file).join(', ') : 'Hors corpus'} |`
      );
    }
  }

  // ─── Agrégats ──────────
  const valid = rows.filter(r => !r.error);
  if (valid.length > 0) {
    const totalCost     = valid.reduce((s, r) => s + r.costUSD, 0);
    const avgLatency    = Math.round(valid.reduce((s, r) => s + r.latencyMs, 0) / valid.length);
    const avgTop1       = parseFloat((valid.reduce((s, r) => s + r.top1Score, 0) / valid.length).toFixed(4));
    const avgAvgTop3    = parseFloat((valid.reduce((s, r) => s + r.avgTop3Score, 0) / valid.length).toFixed(4));
    const totalTokensIn = valid.reduce((s, r) => s + r.tokensIn, 0);
    const totalTokensOut= valid.reduce((s, r) => s + r.tokensOut, 0);

    lines.push('');
    lines.push('## Agrégats');
    lines.push('');
    lines.push('| Métrique | Valeur |');
    lines.push('|----------|--------|');
    lines.push(`| Questions traitées | ${valid.length}/${rows.length} |`);
    lines.push(`| Moyenne Top-1 score | ${avgTop1} |`);
    lines.push(`| Moyenne Avg top-3 | ${avgAvgTop3} |`);
    lines.push(`| Tokens totaux (in/out) | ${totalTokensIn} / ${totalTokensOut} |`);
    lines.push(`| Coût total | $${parseFloat(totalCost.toFixed(6))} |`);
    lines.push(`| Latence moyenne / requête | ${avgLatency}ms |`);
    lines.push(`| Moyenne Pertinence | ___ (à remplir) |`);
    lines.push(`| Moyenne Fidélité | ___ (à remplir) |`);
  }

  lines.push('');
  lines.push('## Légende');
  lines.push('');
  lines.push('- **Top-1 score** : score cosine du chunk le plus pertinent. > 0.8 = très bon match, < 0.5 = hors sujet.');
  lines.push('- **Avg top-3** : moyenne des 3 meilleurs scores. Qualité globale du contexte injecté.');
  lines.push('- **Pertinence (1-5)** : note humaine — les chunks récupérés sont-ils liés à la question ?');
  lines.push('- **Fidélité (1-5)** : note humaine — la réponse reflète-t-elle les sources sans broder/inventer ?');
  lines.push('');

  return lines.join('\n');
}

// ─── Runner principal ────────

async function main() {
  const verbose  = process.argv.includes('--verbose');
  const dryRun   = process.argv.includes('--dry');

  console.log('═'.repeat(60));
  console.log('  ÉVALUATION RAG — Phase 8 Baseline');
  console.log('═'.repeat(60));

  const questions = loadQuestions(QUESTIONS_FILE);
  console.log(`\n${questions.length} questions chargées depuis ${QUESTIONS_FILE}\n`);

  const rows = [];

  for (const q of questions) {
    process.stdout.write(`  Q${q.id} en cours...`);

    try {
      const result = await ragQuery(q.text, { topK: 5, verbose: false });

      const top1  = result.metrics.topScore;
      const avg3  = avgTop3(result.chunks);
      const totalMs = result.metrics.retrievalMs + result.metrics.generationMs;

      rows.push({
        id:            q.id,
        question:      q.text,
        answer:        result.answer,
        contextFound:  result.chunks.length > 0,
        top1Score:     top1,
        avgTop3Score:  avg3,
        tokensIn:      result.metrics.promptTokens,
        tokensOut:     result.metrics.completionTokens,
        costUSD:       result.metrics.costUSD,
        latencyMs:     totalMs,
        sources:       result.sources,
        chunks:        result.chunks,
        orphans:       result.metrics.orphanCitations,
        error:         null
      });

      process.stdout.write(` ✓ (${totalMs}ms)\n`);
    } catch (err) {
      rows.push({
        id: q.id, question: q.text, answer: null, contextFound: false,
        top1Score: 0, avgTop3Score: 0, tokensIn: 0, tokensOut: 0,
        costUSD: 0, latencyMs: 0, sources: [], chunks: [], orphans: [],
        error: err.message
      });
      process.stdout.write(` ✗ (${err.message})\n`);
    }
  }

  // ─── Affichage détaillé ──────────
  for (const r of rows) {
    if (r.error) {
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`Q${r.id} — ⚠️ ERREUR : ${r.error}`);
    } else {
      printResult(r, verbose);
    }
  }

  // ─── Résumé console ────────────────
  const valid   = rows.filter(r => !r.error);
  const errors  = rows.length - valid.length;

  console.log(`\n${'═'.repeat(60)}`);
  console.log('  RÉSUMÉ');
  console.log('═'.repeat(60));
  console.log(`Questions traitées : ${valid.length}/${rows.length}`);
  if (valid.length > 0) {
    const withCtx = valid.filter(r => r.contextFound).length;
    console.log(`Contexte trouvé    : ${withCtx}/${valid.length}`);
    console.log(`Coût total         : $${parseFloat(valid.reduce((s, r) => s + r.costUSD, 0).toFixed(6))}`);
    console.log(`Latence moyenne    : ${Math.round(valid.reduce((s, r) => s + r.latencyMs, 0) / valid.length)}ms`);
  }
  if (errors > 0) console.log(`Erreurs API        : ${errors}`);

  // ─── Génération eval-table.md ───────────
  if (!dryRun) {
    const md = generateEvalTable(rows);
    writeFileSync('./eval-table.md', md, 'utf-8');
    console.log(`\n✓ eval-table.md généré — remplissez les colonnes Pertinence et Fidélité manuellement.`);
  }
}

main().catch(err => {
  console.error('[eval] Erreur fatale :', err.message);
  process.exit(1);
});
