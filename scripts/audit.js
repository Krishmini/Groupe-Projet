// scripts/audit.js — Phase 11 : Audit du retrieval
// Usage : node scripts/audit.js          (toutes les variantes, y compris re-indexation)
//         node scripts/audit.js --quick  (topK + threshold seulement, sans re-indexation)
import { ragQuery }                              from '../rag-pipeline.js';
import { loadCorpus, chunkWithOverlap, embedAndIndex } from './create-index.js';
import { Pinecone }                              from '@pinecone-database/pinecone';
import { readFileSync, appendFileSync }          from 'fs';
import { resolve, dirname }                      from 'path';
import { fileURLToPath }                         from 'url';
import {
  QUESTIONS_FILE, PINECONE_API_KEY, PINECONE_INDEX_NAME,
  PINECONE_NAMESPACE, CORPUS_DIR
} from '../config.js';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const CORPUS_PATH = resolve(__dirname, '..', CORPUS_DIR.replace('./', ''));
const quick       = process.argv.includes('--quick');

// ─── Chargement des questions ────────────

function loadQuestions() {
  const raw = readFileSync(resolve(__dirname, '..', QUESTIONS_FILE), 'utf-8');
  const questions = [];
  for (const line of raw.split('\n')) {
    const m = line.trim().match(/^Q(\d+):\s*(.+)/);
    if (m) questions.push({ id: parseInt(m[1], 10), text: m[2].trim() });
  }
  return questions;
}

// ─── Parsing baseline depuis eval-table.md ──────────

function parseBaseline() {
  const content = readFileSync(resolve(__dirname, '..', 'eval-table.md'), 'utf-8');
  const baseline = new Map();
  for (const line of content.split('\n')) {
    const parts = line.split('|').map(s => s.trim()).filter(Boolean);
    const id = parseInt(parts[0], 10);
    if (isNaN(id) || id < 1 || id > 10) continue;

    const top1 = parseFloat(parts[2]) || 0;
    baseline.set(id, {
      top1Score:    top1,
      avgTop3Score: parseFloat(parts[3]) || 0,
      contextFound: top1 >= 0.7,              // basé sur le seuil réel, pas les notes
      pertinence:   parseInt(parts[7]) || 0,  // note humaine 1-5
      fidelite:     parseInt(parts[8]) || 0,   // note humaine 1-5
      notes:        parts[9] || ''
    });
  }
  return baseline;
}

// ─── Avg top-3 ───────────

function avgTop3(chunks) {
  if (chunks.length === 0) return 0;
  const sorted = chunks.map(c => c.score).sort((a, b) => b - a);
  return parseFloat((sorted.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(3, sorted.length)).toFixed(4));
}

// ─── Exécution d'une variante sur toutes les questions ───────────────────────

async function runVariant(label, options, questions) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  Variante : ${label}`);
  console.log('─'.repeat(60));

  const rows = [];
  for (const q of questions) {
    process.stdout.write(`  Q${q.id}...`);
    try {
      const result = await ragQuery(q.text, options);
      const totalMs = result.metrics.retrievalMs + result.metrics.generationMs;
      rows.push({
        id: q.id, question: q.text, answer: result.answer,
        contextFound: result.chunks.length > 0,
        top1Score: result.metrics.topScore,
        avgTop3Score: avgTop3(result.chunks),
        tokensIn: result.metrics.promptTokens,
        tokensOut: result.metrics.completionTokens,
        costUSD: result.metrics.costUSD,
        latencyMs: totalMs,
        chunksCount: result.chunks.length,
        error: null
      });
      process.stdout.write(` ✓ top1=${result.metrics.topScore} chunks=${result.chunks.length} (${totalMs}ms)\n`);
    } catch (err) {
      rows.push({
        id: q.id, question: q.text, answer: '', contextFound: false,
        top1Score: 0, avgTop3Score: 0, tokensIn: 0, tokensOut: 0,
        costUSD: 0, latencyMs: 0, chunksCount: 0, error: err.message
      });
      process.stdout.write(` ✗ ${err.message}\n`);
    }
  }
  return { label, rows };
}

// ─── Re-indexation avec nouveaux paramètres de chunking ──────────────────────

async function reindex(chunkSize, overlap) {
  console.log(`\n  ⟳ Re-indexation : chunk=${chunkSize}, overlap=${overlap}`);

  const pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });
  const index    = pinecone.index(PINECONE_INDEX_NAME);

  // 1. Supprimer tous les vecteurs du namespace
  await index.namespace(PINECONE_NAMESPACE).deleteAll();
  console.log('    Vecteurs supprimés.');

  // 2. Re-chunk le corpus
  const docs      = loadCorpus(CORPUS_PATH);
  const allChunks = [];
  for (const { filename, text } of docs) {
    const rawChunks    = chunkWithOverlap(text, chunkSize, overlap);
    const uniqueChunks = [...new Set(rawChunks)];
    for (let i = 0; i < uniqueChunks.length; i++) {
      allChunks.push({ text: uniqueChunks[i], source: filename, chunkIndex: i });
    }
  }
  console.log(`    ${allChunks.length} chunks créés.`);

  // 3. Embed + upsert via create-index.js
  const total = await embedAndIndex(allChunks);
  console.log(`    ${total} vecteurs indexés.`);

  // 4. Attente de propagation Pinecone (eventual consistency)
  console.log('    Attente 15s pour propagation...');
  await new Promise(r => setTimeout(r, 15000));
  console.log('    Re-indexation terminée.');

  return allChunks.length;
}

// ─── Détection automatique de régressions ────────────────────────────────────

function findRegressions(baseline, variantResults) {
  const regressions = [];

  for (const v of variantResults) {
    for (const row of v.rows) {
      if (row.error) continue;
      const base = baseline.get(row.id);
      if (!base) continue;

      // Cas 1 : baseline avait un contexte, variante n'en a plus
      if (base.contextFound && !row.contextFound) {
        regressions.push({
          variant: v.label, qId: row.id, question: row.question,
          type: 'perte_contexte',
          detail: `Baseline trouvait un contexte (top1=${base.top1Score}), variante renvoie 0 chunk → LLM forcé de répondre "je ne sais pas".`
        });
      }

      // Cas 2 : chute significative du score top-1 (> 0.05)
      if (base.top1Score > 0.5 && row.top1Score > 0 && (base.top1Score - row.top1Score) > 0.05) {
        regressions.push({
          variant: v.label, qId: row.id, question: row.question,
          type: 'score_dégradé',
          detail: `Top-1 passe de ${base.top1Score} à ${row.top1Score} (Δ=${(row.top1Score - base.top1Score).toFixed(4)}).`
        });
      }

      // Cas 3 : LLM refuse alors que baseline répondait BIEN
      // (pertinence >= 4 ET fidélité >= 4 → baseline avait une bonne réponse)
      if (base.pertinence >= 4 && base.fidelite >= 4 &&
          row.answer.includes('Je ne trouve pas cette information')) {
        regressions.push({
          variant: v.label, qId: row.id, question: row.question,
          type: 'refus_inattendu',
          detail: `Baseline répondait bien (pertinence=${base.pertinence}/5, fidélité=${base.fidelite}/5), la variante refuse malgré le contexte.`
        });
      }

      // Cas 4 : topK=1 perte de complétude — baseline avait besoin de multi-chunks
      if (v.label.includes('topK=1') && row.chunksCount === 1 && base.pertinence === 5) {
        regressions.push({
          variant: v.label, qId: row.id, question: row.question,
          type: 'contexte_incomplet',
          detail: `Avec un seul chunk, la réponse perd en complétude. Baseline utilisait ~3-5 chunks pour couvrir la question.`
        });
      }

      // Cas 5 : plus de bruit pour les questions hors corpus (pertinence baseline ≤ 2)
      if (base.pertinence <= 2 && row.chunksCount > 3 &&
          !row.answer.includes('Je ne trouve pas cette information')) {
        regressions.push({
          variant: v.label, qId: row.id, question: row.question,
          type: 'hallucination_risque',
          detail: `Question hors corpus (pertinence baseline=${base.pertinence}/5) mais variante fournit ${row.chunksCount} chunks et le LLM tente de répondre.`
        });
      }
    }
  }

  // Dédupliquer (même question/variante/type)
  const seen = new Set();
  return regressions.filter(r => {
    const key = `${r.variant}-Q${r.qId}-${r.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Génération du rapport Markdown ──────────────────────────────────────────

function generateAuditReport(variantResults, baseline, regressions) {
  const lines = [];

  lines.push('\n---\n');
  lines.push('## Phase 11 — Audit du retrieval');
  lines.push('');
  lines.push('> Généré par `node scripts/audit.js`. Comparaison de variantes contre la baseline (topK=5, chunk=400/overlap=50, threshold=0.7).');
  lines.push('');

  // ─── Tableau récapitulatif ─────
  lines.push('### Tableau récapitulatif');
  lines.push('');
  lines.push('| Variante | Moy Top-1 | Moy Avg-3 | Coût total | Latence moy | Chunks moy | Δ Top-1 |');
  lines.push('|----------|-----------|-----------|------------|-------------|------------|---------|');

  // Baseline row
  const baseRows  = [...baseline.values()];
  const baseTop1  = (baseRows.reduce((s, r) => s + r.top1Score, 0) / baseRows.length).toFixed(4);
  const baseAvg3  = (baseRows.reduce((s, r) => s + r.avgTop3Score, 0) / baseRows.length).toFixed(4);
  lines.push(`| **Baseline** (topK=5, chunk=400, thr=0.7) | ${baseTop1} | ${baseAvg3} | $0.001505 | 1167ms | — | — |`);

  for (const v of variantResults) {
    const valid = v.rows.filter(r => !r.error);
    if (valid.length === 0) continue;

    const avgTop1    = (valid.reduce((s, r) => s + r.top1Score, 0) / valid.length).toFixed(4);
    const avgAvg3    = (valid.reduce((s, r) => s + r.avgTop3Score, 0) / valid.length).toFixed(4);
    const totalCost  = valid.reduce((s, r) => s + r.costUSD, 0).toFixed(6);
    const avgLatency = Math.round(valid.reduce((s, r) => s + r.latencyMs, 0) / valid.length);
    const avgChunks  = (valid.reduce((s, r) => s + r.chunksCount, 0) / valid.length).toFixed(1);

    const delta = (parseFloat(avgTop1) - parseFloat(baseTop1)).toFixed(4);
    const sign  = parseFloat(delta) >= 0 ? '+' : '';

    lines.push(`| ${v.label} | ${avgTop1} | ${avgAvg3} | $${totalCost} | ${avgLatency}ms | ${avgChunks} | ${sign}${delta} |`);
  }

  // ─── Détail par variante ─────
  lines.push('');
  lines.push('### Détail par variante');

  for (const v of variantResults) {
    lines.push('');
    lines.push(`#### ${v.label}`);
    lines.push('');
    lines.push('| # | Top-1 | Avg-3 | Chunks | Latence | Δ Top-1 |');
    lines.push('|---|-------|-------|--------|---------|---------|');

    for (const r of v.rows) {
      const base  = baseline.get(r.id);
      const delta = base ? (r.top1Score - base.top1Score).toFixed(4) : 'N/A';
      const sign  = parseFloat(delta) >= 0 ? '+' : '';
      lines.push(`| Q${r.id} | ${r.top1Score} | ${r.avgTop3Score} | ${r.chunksCount} | ${r.latencyMs}ms | ${sign}${delta} |`);
    }
  }

  // ─── Régressions ─────
  lines.push('');
  lines.push('### Régressions identifiées');
  lines.push('');

  if (regressions.length === 0) {
    lines.push('Aucune régression significative détectée automatiquement.');
  } else {
    for (let i = 0; i < regressions.length; i++) {
      const reg = regressions[i];
      lines.push(`**Régression ${i + 1}** — Variante \`${reg.variant}\`, Q${reg.qId}`);
      lines.push(`- Question : "${reg.question.slice(0, 80)}${reg.question.length > 80 ? '...' : ''}"`);
      lines.push(`- Type : ${reg.type}`);
      lines.push(`- Explication : ${reg.detail}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(60));
  console.log('  AUDIT DU RETRIEVAL — Phase 11');
  console.log('═'.repeat(60));

  const questions = loadQuestions();
  const baseline  = parseBaseline();

  console.log(`${questions.length} questions, ${baseline.size} lignes baseline chargées.`);

  const results = [];

  // ─── Variantes retrieval-only (pas de re-indexation) ──────
  results.push(await runVariant('topK=1',        { topK: 1 },                           questions));
  results.push(await runVariant('topK=10',       { topK: 10 },                          questions));
  results.push(await runVariant('threshold=0.3', { topK: 5, scoreThreshold: 0.3 },      questions));
  results.push(await runVariant('threshold=0.5', { topK: 5, scoreThreshold: 0.5 },      questions));

  // ─── Variantes chunk_size (nécessite re-indexation) ──────
  if (!quick) {
    await reindex(200, 50);
    results.push(await runVariant('chunk=200/overlap=50', { topK: 5 }, questions));

    await reindex(1000, 200);
    results.push(await runVariant('chunk=1000/overlap=200', { topK: 5 }, questions));

    // Restaurer la baseline
    console.log('\n  ⟳ Restauration de la baseline (chunk=400/overlap=50)...');
    await reindex(400, 50);
    console.log('  ✓ Baseline restaurée.');
  } else {
    console.log('\n  ⏭ --quick : re-indexation chunk_size ignorée.');
  }

  // ─── Analyse + rapport ─────
  const regressions = findRegressions(baseline, results);
  const report      = generateAuditReport(results, baseline, regressions);

  appendFileSync(resolve(__dirname, '..', 'eval-table.md'), report, 'utf-8');

  console.log('\n' + '═'.repeat(60));
  console.log('  AUDIT TERMINÉ');
  console.log('═'.repeat(60));
  console.log(`  ${results.length} variantes testées`);
  console.log(`  ${regressions.length} régressions détectées`);
  console.log('  Résultats ajoutés à eval-table.md');
}

main().catch(err => {
  console.error('[audit] Erreur fatale :', err.message);
  process.exit(1);
});
