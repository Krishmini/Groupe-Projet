# Évaluation RAG — Baseline (Phase 8)

> Généré automatiquement par `node eval.js`. Les colonnes Pertinence et Fidélité sont à remplir manuellement.

| # | Question | Top-1 score | Avg top-3 | Tokens (in/out) | Coût ($) | Latence (ms) | Pertinence (1-5) | Fidélité (1-5) | Notes |
|---|----------|-------------|-----------|-----------------|----------|--------------|------------------|----------------|-------|
| 1 | Quels sont les motifs de discrimination interdits ... | 0.8995 | 0.8628 | 1491 / 205 | 0.000211 | 2353 | 5 | 5 | Top-3 chunks tous issus de article-droit-travail.txt. Synthèse correcte des motifs avec [Source N]. |
| 2 | Quelles protections existent pour un salarié qui e... | 0.8234 | 0.8072 | 1513 / 45 | 0.000165 | 1144 | 5 | 5 | Chunks pertinents. Réponse exacte citant L1132-2 avec [Source 1]. |
| 3 | Que se passe-t-il si un acte est pris en violation... | 0.8275 | 0.7918 | 1486 / 13 | 0.000153 | 983 | 4 | 3 | L1132-4 ("est nul") présent dans le chunk mais le LLM répond "je ne trouve pas". Sûr mais réponse manquée. |
| 4 | Quels sont les niveaux de stabilité définis dans l... | 0.8586 | 0.8333 | 1137 / 180 | 0.000168 | 1636 | 5 | 5 | Énumération correcte des 4 niveaux (Deprecated, Experimental, Stable, Legacy). |
| 5 | Quels modules Node.js ont le statut Deprecated ? | 0.8019 | 0.7989 | 1272 / 27 | 0.000135 | 870 | 4 | 2 | ⚠️ LLM cite "Domain + Query string" mais le corpus indique Query string = (2) Stable. Punycode (0) Deprecated oublié. Mauvaise lecture du tableau. |
| 6 | Quelle est la différence entre les stades 1.0, 1.1... | 0.7533 | 0.7415 | 1365 / 13 | 0.00014 | 766 | 3 | 4 | Chunk ne contient pas les définitions 1.0/1.1/1.2 (problème de chunking). Refus correct du LLM. |
| 7 | Un salarié juré peut-il être licencié à cause de s... | 0.8052 | 0.7892 | 1516 / 45 | 0.000165 | 1129 | 5 | 5 | Chunk contient L1132-3-1. Réponse exacte "fonctions de juré" avec [Source 1]. |
| 8 | Est-ce que le module SQLite de Node.js est stable ... | 0.7964 | 0.7811 | 1194 / 32 | 0.000129 | 943 | 4 | 5 | Correct : SQLite = (1.2) Release candidate. Bien cité avec [Source 1]. |
| 9 | Quelle est la capitale de la France ? | 0.722 | 0.7151 | 1304 / 13 | 0.000134 | 1061 | 1 | 5 | Question adversariale hors corpus. Chunks non pertinents. Refus correct du LLM (pas d'hallucination). |
| 10 | Comment configurer un serveur Express avec TypeScr... | 0.7161 | 0.7134 | 1007 / 13 | 0.000105 | 786 | 1 | 5 | Question adversariale hors corpus. Chunks non pertinents. Refus correct du LLM (pas d'hallucination). |

## Agrégats

| Métrique | Valeur |
|----------|--------|
| Questions traitées | 10/10 |
| Moyenne Top-1 score | 0.8004 |
| Moyenne Avg top-3 | 0.7834 |
| Tokens totaux (in/out) | 13285 / 586 |
| Coût total | $0.001505 |
| Latence moyenne / requête | 1167ms |
| Moyenne Pertinence | 3.7 / 5 |
| Moyenne Fidélité | 4.4 / 5 |

## Légende

- **Top-1 score** : score cosine du chunk le plus pertinent. > 0.8 = très bon match, < 0.5 = hors sujet.
- **Avg top-3** : moyenne des 3 meilleurs scores. Qualité globale du contexte injecté.
- **Pertinence (1-5)** : note humaine — les chunks récupérés sont-ils liés à la question ?
- **Fidélité (1-5)** : note humaine — la réponse reflète-t-elle les sources sans broder/inventer ?

---
---

## Phase 11 — Audit du retrieval

> Généré par `node scripts/audit.js`. Comparaison de variantes contre la baseline (topK=5, chunk=400/overlap=50, threshold=0.7).

### Tableau récapitulatif

| Variante | Moy Top-1 | Moy Avg-3 | Coût total | Latence moy | Chunks moy | Δ Top-1 |
|----------|-----------|-----------|------------|-------------|------------|---------|
| **Baseline** (topK=5, chunk=400, thr=0.7) | 0.8004 | 0.7834 | $0.001505 | 1167ms | — | — |
| topK=1 | 0.8004 | 0.8004 | $0.000927 | 1771ms | 1.0 | +0.0000 |
| topK=10 | 0.8005 | 0.7835 | $0.001257 | 857ms | 3.6 | +0.0001 |
| threshold=0.3 | 0.8004 | 0.7821 | $0.001285 | 1191ms | 5.0 | +0.0000 |
| threshold=0.5 | 0.8004 | 0.7820 | $0.001282 | 926ms | 5.0 | +0.0000 |
| chunk=200/overlap=50 | 0.8031 | 0.7864 | $0.001261 | 1055ms | 4.2 | +0.0027 |
| chunk=1000/overlap=200 | 0.7930 | 0.7730 | $0.001114 | 1062ms | 3.3 | -0.0074 |

### Détail par variante

#### topK=1

| # | Top-1 | Avg-3 | Chunks | Latence | Δ Top-1 |
|---|-------|-------|--------|---------|---------|
| Q1 | 0.8995 | 0.8995 | 1 | 2032ms | +0.0000 |
| Q2 | 0.8234 | 0.8234 | 1 | 918ms | +0.0000 |
| Q3 | 0.8275 | 0.8275 | 1 | 1089ms | +0.0000 |
| Q4 | 0.8586 | 0.8586 | 1 | 9507ms | +0.0000 |
| Q5 | 0.8019 | 0.8019 | 1 | 1162ms | +0.0000 |
| Q6 | 0.7533 | 0.7533 | 1 | 684ms | +0.0000 |
| Q7 | 0.8052 | 0.8052 | 1 | 923ms | +0.0000 |
| Q8 | 0.7964 | 0.7964 | 1 | 778ms | +0.0000 |
| Q9 | 0.722 | 0.722 | 1 | 308ms | +0.0000 |
| Q10 | 0.7161 | 0.7161 | 1 | 310ms | +0.0000 |

#### topK=10

| # | Top-1 | Avg-3 | Chunks | Latence | Δ Top-1 |
|---|-------|-------|--------|---------|---------|
| Q1 | 0.8995 | 0.8628 | 4 | 1638ms | +0.0000 |
| Q2 | 0.8234 | 0.8072 | 3 | 729ms | +0.0000 |
| Q3 | 0.8275 | 0.7918 | 3 | 790ms | +0.0000 |
| Q4 | 0.8586 | 0.8333 | 4 | 1530ms | +0.0000 |
| Q5 | 0.8021 | 0.7991 | 4 | 980ms | +0.0002 |
| Q6 | 0.7533 | 0.7415 | 7 | 677ms | +0.0000 |
| Q7 | 0.8052 | 0.7892 | 3 | 765ms | +0.0000 |
| Q8 | 0.7964 | 0.7811 | 4 | 950ms | +0.0000 |
| Q9 | 0.722 | 0.7151 | 2 | 255ms | +0.0000 |
| Q10 | 0.7166 | 0.7139 | 2 | 253ms | +0.0005 |

#### threshold=0.3

| # | Top-1 | Avg-3 | Chunks | Latence | Δ Top-1 |
|---|-------|-------|--------|---------|---------|
| Q1 | 0.8995 | 0.8628 | 5 | 1544ms | +0.0000 |
| Q2 | 0.824 | 0.8078 | 5 | 2802ms | +0.0006 |
| Q3 | 0.8275 | 0.7918 | 5 | 954ms | +0.0000 |
| Q4 | 0.8586 | 0.8333 | 5 | 2253ms | +0.0000 |
| Q5 | 0.8019 | 0.7989 | 5 | 746ms | +0.0000 |
| Q6 | 0.7533 | 0.7415 | 5 | 910ms | +0.0000 |
| Q7 | 0.8052 | 0.7892 | 5 | 894ms | +0.0000 |
| Q8 | 0.7963 | 0.781 | 5 | 1238ms | -0.0001 |
| Q9 | 0.722 | 0.7084 | 5 | 267ms | +0.0000 |
| Q10 | 0.7161 | 0.7059 | 5 | 300ms | +0.0000 |

#### threshold=0.5

| # | Top-1 | Avg-3 | Chunks | Latence | Δ Top-1 |
|---|-------|-------|--------|---------|---------|
| Q1 | 0.8995 | 0.8628 | 5 | 2029ms | +0.0000 |
| Q2 | 0.8234 | 0.8072 | 5 | 829ms | +0.0000 |
| Q3 | 0.8275 | 0.7918 | 5 | 748ms | +0.0000 |
| Q4 | 0.8586 | 0.8333 | 5 | 1610ms | +0.0000 |
| Q5 | 0.8019 | 0.7989 | 5 | 730ms | +0.0000 |
| Q6 | 0.7533 | 0.7415 | 5 | 648ms | +0.0000 |
| Q7 | 0.8052 | 0.7892 | 5 | 1062ms | +0.0000 |
| Q8 | 0.7964 | 0.7811 | 5 | 1027ms | +0.0000 |
| Q9 | 0.7219 | 0.7083 | 5 | 325ms | -0.0001 |
| Q10 | 0.7161 | 0.7059 | 5 | 253ms | +0.0000 |

#### chunk=200/overlap=50

| # | Top-1 | Avg-3 | Chunks | Latence | Δ Top-1 |
|---|-------|-------|--------|---------|---------|
| Q1 | 0.8995 | 0.8628 | 4 | 2006ms | +0.0000 |
| Q2 | 0.8254 | 0.8184 | 5 | 865ms | +0.0020 |
| Q3 | 0.8275 | 0.7918 | 3 | 782ms | +0.0000 |
| Q4 | 0.8586 | 0.8333 | 4 | 2086ms | +0.0000 |
| Q5 | 0.8035 | 0.8004 | 5 | 1061ms | +0.0016 |
| Q6 | 0.7533 | 0.7415 | 5 | 645ms | +0.0000 |
| Q7 | 0.8158 | 0.8036 | 5 | 1784ms | +0.0106 |
| Q8 | 0.7964 | 0.7811 | 4 | 847ms | +0.0000 |
| Q9 | 0.7357 | 0.7182 | 5 | 235ms | +0.0137 |
| Q10 | 0.7148 | 0.7131 | 2 | 243ms | -0.0013 |

#### chunk=1000/overlap=200

| # | Top-1 | Avg-3 | Chunks | Latence | Δ Top-1 |
|---|-------|-------|--------|---------|---------|
| Q1 | 0.8915 | 0.7912 | 3 | 2760ms | -0.0080 |
| Q2 | 0.8234 | 0.8072 | 3 | 1201ms | +0.0000 |
| Q3 | 0.8264 | 0.8186 | 5 | 939ms | -0.0011 |
| Q4 | 0.853 | 0.8227 | 4 | 1577ms | -0.0056 |
| Q5 | 0.8014 | 0.7939 | 4 | 909ms | -0.0005 |
| Q6 | 0.7319 | 0.7272 | 5 | 264ms | -0.0214 |
| Q7 | 0.7871 | 0.7711 | 2 | 963ms | -0.0181 |
| Q8 | 0.7809 | 0.7725 | 3 | 1526ms | -0.0155 |
| Q9 | 0.7188 | 0.7125 | 2 | 244ms | -0.0032 |
| Q10 | 0.7161 | 0.7134 | 2 | 232ms | +0.0000 |

### Régressions identifiées

**Régression 1** — Variante `topK=1`, Q1
- Question : "Quels sont les motifs de discrimination interdits par l'article L1132-1 du Code ..."
- Type : contexte_incomplet
- Explication : Avec un seul chunk, la réponse perd en complétude. Baseline utilisait ~3-5 chunks pour couvrir la question.

**Régression 2** — Variante `topK=1`, Q2
- Question : "Quelles protections existent pour un salarié qui exerce son droit de grève ?"
- Type : contexte_incomplet
- Explication : Avec un seul chunk, la réponse perd en complétude. Baseline utilisait ~3-5 chunks pour couvrir la question.

**Régression 3** — Variante `topK=1`, Q4
- Question : "Quels sont les niveaux de stabilité définis dans la documentation Node.js ?"
- Type : contexte_incomplet
- Explication : Avec un seul chunk, la réponse perd en complétude. Baseline utilisait ~3-5 chunks pour couvrir la question.

**Régression 4** — Variante `topK=1`, Q7
- Question : "Un salarié juré peut-il être licencié à cause de ses fonctions de juré ?"
- Type : contexte_incomplet
- Explication : Avec un seul chunk, la réponse perd en complétude. Baseline utilisait ~3-5 chunks pour couvrir la question.

**Régression 5** — Variante `topK=1`, Q8
- Question : "Est-ce que le module SQLite de Node.js est stable ?"
- Type : refus_inattendu
- Explication : Baseline répondait bien (pertinence=4/5, fidélité=5/5), la variante refuse malgré le contexte.

**Régression 6** — Variante `threshold=0.3`, Q9
- Question : "Quelle est la capitale de la France ?"
- Type : hallucination_risque
- Explication : Question hors corpus (pertinence baseline=1/5) mais variante fournit 5 chunks et le LLM tente de répondre.

**Régression 7** — Variante `threshold=0.3`, Q10
- Question : "Comment configurer un serveur Express avec TypeScript ?"
- Type : hallucination_risque
- Explication : Question hors corpus (pertinence baseline=1/5) mais variante fournit 5 chunks et le LLM tente de répondre.

**Régression 8** — Variante `threshold=0.5`, Q9
- Question : "Quelle est la capitale de la France ?"
- Type : hallucination_risque
- Explication : Question hors corpus (pertinence baseline=1/5) mais variante fournit 5 chunks et le LLM tente de répondre.

**Régression 9** — Variante `threshold=0.5`, Q10
- Question : "Comment configurer un serveur Express avec TypeScript ?"
- Type : hallucination_risque
- Explication : Question hors corpus (pertinence baseline=1/5) mais variante fournit 5 chunks et le LLM tente de répondre.

**Régression 10** — Variante `chunk=200/overlap=50`, Q9
- Question : "Quelle est la capitale de la France ?"
- Type : hallucination_risque
- Explication : Question hors corpus (pertinence baseline=1/5) mais variante fournit 5 chunks et le LLM tente de répondre.
