# Mini-Perplexity — Pipeline RAG bout en bout

Pipeline RAG (Retrieval-Augmented Generation) complet construit avec Node.js, Mistral AI et Pinecone. Le système indexe un corpus documentaire, retrouve les passages pertinents par recherche sémantique, et génère des réponses sourcées via LLM.

---

## Table des matières

- [Mini-Perplexity — Pipeline RAG bout en bout](#mini-perplexity--pipeline-rag-bout-en-bout)
  - [Table des matières](#table-des-matières)
  - [Architecture](#architecture)
  - [Structure du projet](#structure-du-projet)
  - [Prérequis](#prérequis)
  - [Installation](#installation)
  - [Configuration](#configuration)
    - [Variables d'environnement (`.env`)](#variables-denvironnement-env)
    - [Paramètres de retrieval (`config.js`)](#paramètres-de-retrieval-configjs)
  - [Utilisation](#utilisation)
    - [CLI interactive](#cli-interactive)
    - [Question unique](#question-unique)
    - [Indexation du corpus](#indexation-du-corpus)
    - [Commandes disponibles](#commandes-disponibles)
  - [Tests et évaluation](#tests-et-évaluation)
    - [Évaluation baseline](#évaluation-baseline)
    - [Comparaison LangChain](#comparaison-langchain)
    - [Résultats attendus](#résultats-attendus)
  - [Sécurité](#sécurité)
    - [Mesures implémentées](#mesures-implémentées)
    - [System prompt anti-hallucination](#system-prompt-anti-hallucination)
  - [Détails techniques](#détails-techniques)
    - [Stack](#stack)
    - [Coûts API Mistral](#coûts-api-mistral)
    - [Chunking](#chunking)

---

## Architecture

```
                    ┌─────────────────────────┐
                    │    CLI Interactive       │  cli.js
                    │    (readline loop)       │
                    └──────────┬──────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────┐
│                    ragQuery()                            │  rag-pipeline.js
│                                                          │
│  Question ──► sanitize ──► embed ──► Pinecone query      │  retrieval.js
│                                         │                │
│                              chunks pertinents           │
│                                         │                │
│               formatContext ◄───────────┘                │
│                    │                                     │
│                    ▼                                     │
│              Mistral Chat API                            │
│         (system prompt anti-hallucination)                │
│                    │                                     │
│                    ▼                                     │
│     Réponse + Sources [Source N] + Métriques             │
└──────────────────────────────────────────────────────────┘
```

---

## Structure du projet

```
Groupe-Projet/
├── config.js                # Configuration centralisée (clés, modèles, seuils)
├── retrieval.js             # Retrieval : embed question + query Pinecone + filtrage
├── rag-pipeline.js          # Pipeline RAG principal : prompt LLM + citations + métriques
├── cli.js                   # Interface CLI interactive (readline)
├── eval.js                  # Évaluation automatique sur 10 questions
├── rag-pipeline-langchain.js # Refactoring LangChain (Phase 9)
├── test-compare.js          # Comparaison manual vs LangChain
│
├── scripts/
│   ├── create-index.js      # Chunking + embedding + indexation Pinecone
│   └── audit.js             # Audit retrieval : 6 variantes + détection régressions
│
├── corpus/                  # Documents source (indexés dans Pinecone)
│   ├── article-droit-travail.txt
│   ├── guide-nodejs.txt
│   └── nodejs/
│       ├── nodejs-streams.txt
│       └── nodejs-advanced.txt
│
├── questions-test.txt       # 10 questions d'évaluation (Q1–Q10)
├── eval-table.md            # Résultats baseline + audit Phase 11
├── red-teaming.md           # Résultats des tests adversariaux (J5 Phase 6)
│
├── .env                     # Variables d'environnement (non commité)
├── .env.example             # Template des variables requises
├── .gitignore
├── package.json
└── package-lock.json
```

---

## Prérequis

- **Node.js** ≥ 18 (testé sur v24.12.0)
- **Compte Mistral AI** — clé API pour embeddings (`mistral-embed`) et chat (`mistral-small-latest`)
- **Compte Pinecone** — index `mini-perplexity` (dimension 1024, métrique cosine)

---

## Installation

```bash
# 1. Cloner le projet
git clone <url-du-repo>
cd Groupe-Projet

# 2. Installer les dépendances
npm install

# 3. Créer le fichier .env à partir du template
cp .env.example .env
# Puis remplir les valeurs (voir section Configuration)

# 4. Indexer le corpus dans Pinecone
npm run index
```

---

## Configuration

### Variables d'environnement (`.env`)

| Variable | Description | Obligatoire |
|----------|-------------|:-----------:|
| `MISTRAL_API_KEY` | Clé API Mistral AI | ✅ |
| `PINECONE_API_KEY` | Clé API Pinecone | ✅ |
| `PINECONE_INDEX_NAME` | Nom de l'index Pinecone (ex: `mini-perplexity`) | ✅ |
| `PINECONE_INDEX_HOST` | URL complète de l'index Pinecone | ✅ |
| `PINECONE_NAMESPACE` | Namespace pour isoler les datasets (défaut: `default`) | ❌ |
| `CONFIDENCE_THRESHOLD` | Seuil de confiance pour skip LLM (défaut: `0.75`) | ❌ |

```env
MISTRAL_API_KEY=votre_cle_mistral
PINECONE_API_KEY=votre_cle_pinecone
PINECONE_INDEX_NAME=mini-perplexity
PINECONE_INDEX_HOST=https://mini-perplexity-xxxx.svc.aped-xxxx.pinecone.io
PINECONE_NAMESPACE=option-c-groupe-1
```

### Paramètres de retrieval (`config.js`)

| Paramètre | Valeur | Description |
|-----------|--------|-------------|
| `TOP_K` | 5 | Nombre de chunks récupérés par requête |
| `SCORE_THRESHOLD` | 0.7 | Score cosine minimum (en dessous = filtré) |
| `MAX_CONTEXT_CHARS` | 4000 | Limite du contexte injecté dans le prompt |
| `MAX_RETRIES` | 4 | Nombre de retries sur 429/503 |
| `RETRY_BASE_MS` | 5000 | Backoff de base entre retries |
| `CONFIDENCE_THRESHOLD` | 0.75 | Score minimum pour appeler le LLM (sinon skip) |

---

## Utilisation

### CLI interactive

```bash
npm run cli
```

Lance une boucle de questions/réponses :

```
════════════════════════════════════════════════════════════
  Mini-Perplexity — posez vos questions sur le corpus
  (Ctrl+C pour quitter)
════════════════════════════════════════════════════════════

> Quels sont les motifs de discrimination interdits ?
  Recherche en cours...

Les motifs de discrimination interdits incluent l'origine,
le sexe, les mœurs, l'orientation sexuelle... [Source 1]

Sources : [article-droit-travail.txt]
Pertinence moyenne : 0.86
(2353ms | 1491 tokens in | $0.000211)
```

- **Enter vide** → re-prompt sans appel API
- **Ctrl+C** → sortie propre ("Au revoir !")
- **Question > 2000 chars** → avertissement (tronquée à 500)

### Question unique

```bash
npm run ask -- "Quels modules Node.js sont deprecated ?"
```

### Indexation du corpus

```bash
npm run index
```

Lit tous les fichiers `.txt` / `.md` / `.json` du dossier `corpus/`, les découpe en chunks de 400 mots (overlap 50), les embède via Mistral et les upsert dans Pinecone.

### Commandes disponibles

| Commande | Description |
|----------|-------------|
| `npm run cli` | CLI interactive |
| `npm run ask -- "question"` | Question unique |
| `npm run index` | Indexer le corpus |
| `npm run eval` | Évaluation baseline (10 questions) |
| `npm run eval:verbose` | Évaluation avec détail des chunks |

---

## Tests et évaluation

### Évaluation baseline

```bash
npm run eval
```

Exécute les 10 questions de `questions-test.txt` via le pipeline RAG et génère `eval-table.md` avec :
- Score cosine Top-1 et moyenne Top-3 par question
- Tokens consommés, coût USD, latence
- Colonnes Pertinence et Fidélité (notation humaine 1-5)

**Résultats baseline** : Top-1 moyen = 0.80, Pertinence = 3.7/5, Fidélité = 4.4/5

### Comparaison LangChain

```bash
node test-compare.js
```

Compare les résultats du pipeline manuel (`ragQuery`) avec le pipeline LangChain (`ragQueryLangChain`) sur 3 scénarios : happy path, hors corpus, prompt injection.

### Résultats attendus

| Scénario | Comportement attendu |
|----------|---------------------|
| Question dans le corpus | Réponse sourcée avec `[Source N]`, pertinence > 0.75, footer disclaimer |
| Question hors corpus | Skip LLM (confidence < 0.75), message "je ne dispose pas...", coût $0 |
| Prompt injection | Refus — même réponse que hors corpus |
| Question vide | Aucun appel API, re-prompt immédiat |

### Red teaming

Voir [`red-teaming.md`](red-teaming.md) pour les résultats des 5 tests adversariaux :
- 4/5 attaques bloquées (hallucination, leak system prompt, budget, PII)
- 1 attaque passée (omission des sources) + correctif identifié

---

## Sécurité

### Mesures implémentées

| Vecteur | Mesure | Fichier |
|---------|--------|---------|
| **Prompt injection** | System prompt avec 7 règles strictes, refus systématique des tentatives de contournement | `rag-pipeline.js` |
| **Sanitisation input** | Suppression caractères de contrôle, limite 500 chars, trim | `retrieval.js` |
| **Anti-hallucination** | Citation obligatoire `[Source N]`, détection citations orphelines, réponse "je ne sais pas" si hors contexte | `rag-pipeline.js` |
| **Clés API** | Vérification au démarrage — arrêt immédiat si manquantes | `config.js` |
| **Rate limiting** | Retry exponentiel (2^n × baseDelay + jitter) sur 429/503 | `rag-pipeline.js` |
| **Circuit Breaker** | Après 5 échecs consécutifs, refuse les requêtes pendant 30s (auto-recovery) | `rag-pipeline.js` |
| **Timeout** | AbortController coupe les requêtes LLM après 30s | `rag-pipeline.js` |
| **Confidence gate** | Si topScore < 0.75, skip LLM entièrement (coût $0, pas d'hallucination) | `rag-pipeline.js` |
| **Contexte limité** | `MAX_CONTEXT_CHARS=4000` empêche l'injection de contexte trop volumineux | `config.js` |
| **Données sensibles** | `.env` dans `.gitignore`, corps HTTP d'erreur non exposé dans les messages | `.gitignore`, `retrieval.js` |
| **Template injection** | Échappement `{}` → `{{}}` dans le contexte LangChain pour éviter l'interprétation comme variable | `rag-pipeline-langchain.js` |

### System prompt anti-hallucination

Le system prompt impose 7 règles absolues :
1. Répondre uniquement à partir du contexte `<context>...</context>`
2. Chaque affirmation factuelle doit être suivie de `[Source N]`
3. Si la réponse n'est pas dans le contexte → phrase de refus exacte
4. Interdiction d'utiliser les connaissances générales
5. Résistance aux tentatives de changement de rôle
6. Ambiguïté → citer toutes les sources pertinentes
7. Répondre en français, texte brut, synthétiser au lieu de citer mot à mot

---

## Détails techniques

### Stack

| Composant | Technologie | Version |
|-----------|-------------|---------|
| Runtime | Node.js (ESM) | ≥ 18 |
| Embeddings | Mistral `mistral-embed` | 1024 dimensions |
| Chat LLM | Mistral `mistral-small-latest` | temperature 0.1 |
| Vector Store | Pinecone | SDK v7.2 |
| Framework LLM | LangChain | v0.3 |

### Coûts API Mistral

| Modèle | Input | Output |
|--------|-------|--------|
| `mistral-small-latest` | $0.10 / 1M tokens | $0.30 / 1M tokens |
| `mistral-embed` | $0.10 / 1M tokens | — |

Coût typique pour 10 questions d'évaluation : ~$0.0015

Chaque requête affiche automatiquement le coût :
```
[Stats] Input: 1221 tokens | Output: 219 tokens | Coût: $0.0002 | Session total: $0.0004
```

### Chunking

- **Taille** : 400 mots par chunk (configurable)
- **Overlap** : 50 mots (~12%) pour préserver le contexte aux frontières
- **Déduplication** : chunks identiques supprimés avant indexation

---




