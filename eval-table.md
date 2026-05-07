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