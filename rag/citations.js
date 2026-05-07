// citations.js — Formatage du contexte et gestion des citations (J4 Phase 7)
import { MAX_CONTEXT_CHARS } from '../config.js';

// Chaque chunk → [Source N - nom_fichier], séparés par ---, tronqué si > MAX_CONTEXT_CHARS
export function formatContext(context) {
  let formatted = context
    .map((c, i) => `[Source ${i + 1} - ${c.source || 'inconnu'}]\n${c.text}`)
    .join('\n\n---\n\n');

  if (formatted.length > MAX_CONTEXT_CHARS) {
    formatted = formatted.slice(0, MAX_CONTEXT_CHARS) + '\n[...contexte tronqué]';
  }

  return formatted;
}

// Sources dédupliquées par fichier, triées par meilleur score
export function formatSourceCitations(chunks) {
  const byFile = new Map();

  for (const c of chunks) {
    const file = c.source || 'Source inconnue';
    const existing = byFile.get(file);
    if (!existing || c.score > existing.score) {
      byFile.set(file, { file, score: c.score });
    }
  }

  return [...byFile.values()]
    .sort((a, b) => b.score - a.score)
    .map((s, i) => ({
      index:     i + 1,
      file:      s.file,
      relevance: s.score
    }));
}

// Détecte [Source N] citées par le LLM mais inexistantes dans les chunks réels
export function detectOrphanCitations(answer, maxSourceIndex) {
  const cited = [...answer.matchAll(/\[Source\s+(\d+)\]/gi)]
    .map(m => parseInt(m[1], 10));

  const unique = [...new Set(cited)];
  return unique.filter(n => n < 1 || n > maxSourceIndex);
}
