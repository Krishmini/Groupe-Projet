# Évaluation RAG — Baseline (Phase 8)

> Généré automatiquement par `node eval.js`. Les colonnes Pertinence et Fidélité sont à remplir manuellement.

| # | Question | Top-1 score | Avg top-3 | Tokens (in/out) | Coût ($) | Latence (ms) | Pertinence (1-5) | Fidélité (1-5) | Notes |
|---|----------|-------------|-----------|-----------------|----------|--------------|------------------|----------------|-------|
| 1 | Quels sont les motifs de discrimination interdits ... | 0.8995 | 0.8628 | 1491 / 199 | 0.000209 | 2599 | 5 | 5 | Liste complète et fidèle aux sources |
| 2 | Quelles protections existent pour un salarié qui e... | 0.8234 | 0.8072 | 1513 / 39 | 0.000163 | 1119 | 5 | 5 | Réponse concise et exacte avec citation |
| 3 | Quelles sont les conséquences pour un employeur qu... | 0.835 | 0.8022 | 1483 / 69 | 0.000169 | 2145 | 4 | 4 | Pertinent mais réponse un peu vague sur les sanctions |
| 4 | Quels sont les niveaux de stabilité définis dans l... | 0.8586 | 0.8333 | 1137 / 172 | 0.000165 | 2148 | 5 | 5 | Niveaux 0-3 listés correctement |
| 5 | Quels modules Node.js ont le statut Deprecated ? | 0.8017 | 0.7987 | 1272 / 14 | 0.000131 | 821 | 4 | 4 | Domain identifié, réponse courte mais correcte |
| 6 | Quels modules Node.js sont au stade expérimental ? | 0.8183 | 0.8098 | 1272 / 82 | 0.000152 | 1326 | 4 | 3 | Liste partielle, quelques modules manquants |
| 7 | Un salarié juré peut-il être licencié à cause de s... | 0.8052 | 0.7892 | 1516 / 45 | 0.000165 | 1229 | 5 | 5 | Réponse exacte avec référence source |
| 8 | Est-ce que le module SQLite de Node.js est stable ... | 0.7964 | 0.7811 | 1194 / 37 | 0.000131 | 919 | 4 | 5 | Bonne réponse, statut expérimental identifié |
| 9 | Quelle est la capitale de la France ? | 0.722 | 0.7151 | 0 / 0 | 0 | 236 | 1 | 5 | Hors corpus, refus correct (skip-llm) |
| 10 | Comment configurer un serveur Express avec TypeScr... | 0.7161 | 0.7134 | 0 / 0 | 0 | 1710 | 1 | 5 | Hors corpus, refus correct (skip-llm) |

## Agrégats

| Métrique | Valeur |
|----------|--------|
| Questions traitées | 10/10 |
| Moyenne Top-1 score | 0.8076 |
| Moyenne Avg top-3 | 0.7913 |
| Tokens totaux (in/out) | 10878 / 657 |
| Coût total | $0.001285 |
| Latence moyenne / requête | 1425ms |
| Moyenne Pertinence | 3.8/5 |
| Moyenne Fidélité | 4.6/5 |

## Légende

- **Top-1 score** : score cosine du chunk le plus pertinent. > 0.8 = très bon match, < 0.5 = hors sujet.
- **Avg top-3** : moyenne des 3 meilleurs scores. Qualité globale du contexte injecté.
- **Pertinence (1-5)** : note humaine — les chunks récupérés sont-ils liés à la question ?
- **Fidélité (1-5)** : note humaine — la réponse reflète-t-elle les sources sans broder/inventer ?

---

## Phase 11 — Audit du retrieval

> Généré par `node scripts/audit.js`. Comparaison de variantes contre la baseline (topK=5, chunk=400/overlap=50, threshold=0.7).

### Tableau récapitulatif

| Variante | Moy Top-1 | Moy Avg-3 | Coût total | Latence moy | Chunks moy | Δ Top-1 |
|----------|-----------|-----------|------------|-------------|------------|---------|
| **Baseline** (topK=5, chunk=400, thr=0.7) | 0.8076 | 0.7913 | $0.001505 | 1167ms | — | — |
| topK=1 | 0.8076 | 0.8076 | $0.000982 | 1149ms | 1.0 | +0.0000 |
| topK=10 | 0.8076 | 0.7913 | $0.001303 | 953ms | 3.3 | +0.0000 |
| threshold=0.3 | 0.8076 | 0.7899 | $0.001347 | 900ms | 5.0 | +0.0000 |
| threshold=0.5 | 0.8076 | 0.7899 | $0.001347 | 869ms | 5.0 | +0.0000 |

### Détail par variante

#### topK=1

| # | Top-1 | Avg-3 | Chunks | Latence | Δ Top-1 |
|---|-------|-------|--------|---------|---------|
| Q1 | 0.8995 | 0.8995 | 1 | 3065ms | +0.0000 |
| Q2 | 0.8234 | 0.8234 | 1 | 775ms | +0.0000 |
| Q3 | 0.8347 | 0.8347 | 1 | 668ms | -0.0003 |
| Q4 | 0.8586 | 0.8586 | 1 | 2602ms | +0.0000 |
| Q5 | 0.8019 | 0.8019 | 1 | 818ms | +0.0002 |
| Q6 | 0.8183 | 0.8183 | 1 | 1025ms | +0.0000 |
| Q7 | 0.8052 | 0.8052 | 1 | 916ms | +0.0000 |
| Q8 | 0.7964 | 0.7964 | 1 | 717ms | +0.0000 |
| Q9 | 0.722 | 0.722 | 1 | 601ms | +0.0000 |
| Q10 | 0.7161 | 0.7161 | 1 | 300ms | +0.0000 |

#### topK=10

| # | Top-1 | Avg-3 | Chunks | Latence | Δ Top-1 |
|---|-------|-------|--------|---------|---------|
| Q1 | 0.8995 | 0.8628 | 4 | 2061ms | +0.0000 |
| Q2 | 0.8234 | 0.8072 | 3 | 715ms | +0.0000 |
| Q3 | 0.8347 | 0.802 | 3 | 1126ms | -0.0003 |
| Q4 | 0.8586 | 0.8333 | 4 | 1537ms | +0.0000 |
| Q5 | 0.8019 | 0.7989 | 4 | 611ms | +0.0002 |
| Q6 | 0.8183 | 0.8098 | 4 | 1230ms | +0.0000 |
| Q7 | 0.8052 | 0.7892 | 3 | 947ms | +0.0000 |
| Q8 | 0.7964 | 0.7811 | 4 | 686ms | +0.0000 |
| Q9 | 0.722 | 0.7151 | 2 | 145ms | +0.0000 |
| Q10 | 0.7161 | 0.7134 | 2 | 474ms | +0.0000 |

#### threshold=0.3

| # | Top-1 | Avg-3 | Chunks | Latence | Δ Top-1 |
|---|-------|-------|--------|---------|---------|
| Q1 | 0.8995 | 0.8628 | 5 | 2287ms | +0.0000 |
| Q2 | 0.8234 | 0.8072 | 5 | 569ms | +0.0000 |
| Q3 | 0.8347 | 0.802 | 5 | 1024ms | -0.0003 |
| Q4 | 0.8586 | 0.8333 | 5 | 1535ms | +0.0000 |
| Q5 | 0.8019 | 0.7989 | 5 | 638ms | +0.0002 |
| Q6 | 0.8183 | 0.8098 | 5 | 898ms | +0.0000 |
| Q7 | 0.8052 | 0.7892 | 5 | 612ms | +0.0000 |
| Q8 | 0.7964 | 0.7811 | 5 | 920ms | +0.0000 |
| Q9 | 0.722 | 0.7084 | 5 | 135ms | +0.0000 |
| Q10 | 0.7161 | 0.7059 | 5 | 380ms | +0.0000 |

#### threshold=0.5

| # | Top-1 | Avg-3 | Chunks | Latence | Δ Top-1 |
|---|-------|-------|--------|---------|---------|
| Q1 | 0.8995 | 0.8628 | 5 | 2287ms | +0.0000 |
| Q2 | 0.8234 | 0.8072 | 5 | 569ms | +0.0000 |
| Q3 | 0.8347 | 0.802 | 5 | 1024ms | -0.0003 |
| Q4 | 0.8586 | 0.8333 | 5 | 1535ms | +0.0000 |
| Q5 | 0.8019 | 0.7989 | 5 | 638ms | +0.0002 |
| Q6 | 0.8183 | 0.8098 | 5 | 898ms | +0.0000 |
| Q7 | 0.8052 | 0.7892 | 5 | 612ms | +0.0000 |
| Q8 | 0.7964 | 0.7811 | 5 | 920ms | +0.0000 |
| Q9 | 0.722 | 0.7084 | 5 | 103ms | +0.0000 |
| Q10 | 0.7161 | 0.7059 | 5 | 102ms | +0.0000 |

### Régressions identifiées

**Régression 1** — Variante `topK=1`, Q1
- Question : "Quels sont les motifs de discrimination interdits par l'article L1132-1 du Code ..."
- Type : contexte_incomplet
- Explication : Avec un seul chunk, la réponse perd en complétude. Baseline utilisait ~3-5 chunks pour couvrir la question.

**Régression 2** — Variante `topK=1`, Q2
- Question : "Quelles protections existent pour un salarié qui exerce son droit de grève ?"
- Type : contexte_incomplet
- Explication : Avec un seul chunk, la réponse perd en complétude. Baseline utilisait ~3-5 chunks pour couvrir la question.

**Régression 3** — Variante `topK=1`, Q3
- Question : "Quelles sont les conséquences pour un employeur qui prend une mesure discriminat..."
- Type : refus_inattendu
- Explication : Baseline répondait bien (pertinence=4/5, fidélité=4/5), la variante refuse malgré le contexte.

**Régression 4** — Variante `topK=1`, Q4
- Question : "Quels sont les niveaux de stabilité définis dans la documentation Node.js ?"
- Type : contexte_incomplet
- Explication : Avec un seul chunk, la réponse perd en complétude. Baseline utilisait ~3-5 chunks pour couvrir la question.

**Régression 5** — Variante `topK=1`, Q7
- Question : "Un salarié juré peut-il être licencié à cause de ses fonctions de juré ?"
- Type : contexte_incomplet
- Explication : Avec un seul chunk, la réponse perd en complétude. Baseline utilisait ~3-5 chunks pour couvrir la question.

**Régression 6** — Variante `topK=1`, Q8
- Question : "Est-ce que le module SQLite de Node.js est stable ?"
- Type : refus_inattendu
- Explication : Baseline répondait bien (pertinence=4/5, fidélité=5/5), la variante refuse malgré le contexte.

**Régression 7** — Variante `threshold=0.3`, Q3
- Question : "Quelles sont les conséquences pour un employeur qui prend une mesure discriminat..."
- Type : refus_inattendu
- Explication : Baseline répondait bien (pertinence=4/5, fidélité=4/5), la variante refuse malgré le contexte.

**Régression 8** — Variante `threshold=0.3`, Q9
- Question : "Quelle est la capitale de la France ?"
- Type : hallucination_risque
- Explication : Question hors corpus (pertinence baseline=1/5) mais variante fournit 5 chunks et le LLM tente de répondre.

**Régression 9** — Variante `threshold=0.3`, Q10
- Question : "Comment configurer un serveur Express avec TypeScript ?"
- Type : hallucination_risque
- Explication : Question hors corpus (pertinence baseline=1/5) mais variante fournit 5 chunks et le LLM tente de répondre.

**Régression 10** — Variante `threshold=0.5`, Q3
- Question : "Quelles sont les conséquences pour un employeur qui prend une mesure discriminat..."
- Type : refus_inattendu
- Explication : Baseline répondait bien (pertinence=4/5, fidélité=4/5), la variante refuse malgré le contexte.

**Régression 11** — Variante `threshold=0.5`, Q9
- Question : "Quelle est la capitale de la France ?"
- Type : hallucination_risque
- Explication : Question hors corpus (pertinence baseline=1/5) mais variante fournit 5 chunks et le LLM tente de répondre.

**Régression 12** — Variante `threshold=0.5`, Q10
- Question : "Comment configurer un serveur Express avec TypeScript ?"
- Type : hallucination_risque
- Explication : Question hors corpus (pertinence baseline=1/5) mais variante fournit 5 chunks et le LLM tente de répondre.
