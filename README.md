# Mini-Perplexity — Pipeline RAG

Un moteur de questions-réponses qui ne répond que quand il sait. Le système indexe vos documents, retrouve les passages pertinents par recherche sémantique, et génère des réponses sourcées — avec citations vérifiées, détection d'injection, et un coût maîtrisé (~$0.0002/requête).

Construit avec Node.js, Mistral AI et Pinecone.

---

## Structure du projet

```
Groupe-Projet/
├── config.js                  Configuration + validation env vars
├── retrieval.js               Recherche sémantique + sécurité input
├── rag-pipeline.js            Orchestration du pipeline RAG
├── rag/
│   ├── llm.js                 Résilience appels LLM
│   ├── cost.js                Suivi des coûts API
│   └── citations.js           Gestion des sources et citations
├── cli.js                     Interface interactive
├── eval.js                    Évaluation qualité
├── scripts/
│   ├── create-index.js        Indexation du corpus
│   └── audit.js               Audit retrieval multi-variantes
├── rag-pipeline-langchain.js  Pipeline alternatif LangChain
├── test-compare.js            Comparaison manual vs LangChain
├── corpus/                    Documents source
├── questions-test.txt         Questions de test
└── red-teaming.md             Tests adversariaux
```

---

## Installation & Commandes

```bash
npm install && cp .env.example .env && npm run index   # setup

npm run cli              # CLI interactive
npm run ask -- "question"
npm run eval             # 10 questions → eval-table.md (Top-1: 0.80, Fidélité: 4.4/5)
npm run audit:quick      # 4 variantes retrieval, régressions auto
node test-compare.js     # manual vs LangChain (3 scénarios)
```

Prérequis : Node.js ≥ 18, Mistral AI, Pinecone (1024 dim, cosine).

---

## Pipeline (5 étapes)

1. **Retrieval** — sanitize (500 chars max) → injection detect (10 regex) → embed (cache LRU 100) → Pinecone top-K → filter score ≥ 0.7
2. **Confidence** — topScore < 0.75 → skip LLM, coût $0, ~300ms
3. **Génération** — CircuitBreaker (5 fails → OPEN 30s → auto-recovery) + retry 429/503 (2^n + jitter) + timeout 30s
4. **Post-traitement** — citations dédupliquées + orphan detection + calcul coût (~$0.0002/req)
5. **Output** — réponse + sources + disclaimer

---

## Sécurité

- **Input** — sanitize (contrôle chars, 500 chars) + 10 regex injection (DAN, jailbreak, ignore previous…)
- **LLM** — system prompt 7 règles (citation `[Source N]` obligatoire, refus hors corpus) + orphan detection post-LLM
- **Résilience** — CircuitBreaker + retry sélectif + AbortController 30s
- **Config** — clés validées au boot, `.env` gitignored, `MAX_CONTEXT_CHARS=4000`, template injection échappé (LangChain)

---

## Performance

- **2 caches** — LRU embeddings (100 entrées) + LLM réponses (TTL 1h)
- **Confidence gating** — 20-30% questions hors-corpus → $0
- **Chunking** — 400 mots + overlap 50

---

## Maintenance

- **Ajouter un doc** — `corpus/` → `npm run index` → `npm run ask`
- **Seuils** — `SCORE_THRESHOLD` (0.7), `CONFIDENCE_THRESHOLD` (0.75), `TOP_K` (5) dans `.env`
- **Logs** — `[Stats]` coût · `[skip-llm]` confidence · `[security] ⚠️` injection · `[CircuitBreaker]` état
- **Modules `rag/`** — `llm.js`, `cost.js`, `citations.js` → testables isolément (pur / mock fetch)

---

Node.js ESM ≥ 18 | Mistral (`mistral-embed` + `mistral-small-latest`) | Pinecone v7.2 | LangChain v0.3 | ISC
