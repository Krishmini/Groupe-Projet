# Mini-Perplexity — Agent IA multi-outils + RAG

Projet pédagogique IPSSI — Jour 3 : construction d'un agent IA avec boucle agentique, outils externes et vector store Pinecone.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     AGENT HYBRIDE                        │
│                                                          │
│  Question utilisateur                                    │
│         ▼                                                │
│  [ LLM Mistral ] lit la question + 5 descriptions        │
│         ▼                                                │
│  ┌──────────┬────────────┬────────────┬────────────┐    │
│  │calculate │ get_weather│ web_search │ rag_search │    │
│  │(calculs) │(météo live)│ (DuckDuckGo│ (Pinecone) │    │
│  └──────────┴────────────┴────────────┴────────────┘    │
│         ▼                                                │
│  Réponse finale avec sources                             │
└──────────────────────────────────────────────────────────┘
```

---

## Structure du projet

```
tool-ai-rag/
├── agent-loop.js          # Boucle agentique partagée (runAgent)
├── tools.js               # Outils partagés : calculate, get_weather, web_search, fetch_page
│
├── calculatrice-agent.js  # Phase 1 — calculatrice seule
├── weather-agent.js       # Phase 2 — météo + calculatrice
├── search-agent.js        # Phase 3 — web search + fetch_page + météo + calculatrice
├── chat-agent.js          # Phase 4 — mémoire de conversation (chatWithAgent)
│
├── vector-store.js        # Phases 5-8 — Pinecone : connexion, embed, upsert, RAG
├── hybrid-agent.js        # Phase 9 — agent hybride (4 outils + rag_search)
│
└── .env                   # Clés API (ne pas commiter)
```

---

## Prérequis

- Node.js ≥ 18
- Compte [Mistral AI](https://console.mistral.ai) avec clé API
- Compte [Pinecone](https://app.pinecone.io) avec un index `mini-perplexity` (dimension 1024, métrique cosine)

---

## Installation

```bash
# 1. Cloner le projet
git clone <url-du-repo>
cd tool-ai-rag

# 2. Installer les dépendances
npm install

# 3. Créer le fichier .env
cp .env.example .env
# Puis remplir les valeurs dans .env
```

### Variables d'environnement (`.env`)

```env
MISTRAL_API_KEY=votre_cle_mistral
PINECONE_API_KEY=votre_cle_pinecone
PINECONE_INDEX_NAME=mini-perplexity
PINECONE_INDEX_HOST=https://mini-perplexity-xxxx.svc.aped-xxxx.pinecone.io
```

---

## Lancer les phases

### Track A — Agent multi-outils

```bash
# Phase 1 : calculatrice
npm run calculatrice
# Attendu : "17 au carré vaut 289, et 4 à la puissance 5 vaut 1024. Donc 289 + 1024 = 1313."

# Phase 2 : météo + conversion Fahrenheit
npm run weather
# Attendu : "À Londres, il fait X°C (Y°F)..."

# Phase 3 : web search + calcul de jours
npm run search
# Attendu : version Node.js + 856 jours depuis le 1er janvier 2024. Sources : [url]

# Phase 4 : mémoire de conversation
npm run chat
# Attendu : Paris → Lyon → comparaison, puis checkpoint sécurité
```

### Track B — Vector store

```bash
# Phases 5 + 6 + 7 : connexion Pinecone, indexation corpus Node.js, recherche sémantique
npm run vector-store
# Attendu :
#   Index connecté : { name: 'mini-perplexity', dimension: 1024, metric: 'cosine', ... }
#   3 chunks générés → upsertedCount: 3
#   Score: 0.863 | Node.js est un environnement créé par Ryan Dahl en 2009...
```

### Phase 9 — Agent hybride

```bash
npm run hybrid
# Attendu : chaque question déclenche le bon outil automatiquement
#   "Qui a créé Node.js ?"          → rag_search  (corpus Pinecone)
#   "Coupe du Monde 2022 ?"         → web_search
#   "Météo à Lyon ?"                → get_weather
#   "Surface sphère rayon 5 ?"      → calculate → 314.159...
```

---

## APIs utilisées

| API | Usage | Clé requise |
|-----|-------|-------------|
| [Mistral AI](https://api.mistral.ai) | LLM + embeddings (mistral-embed 1024 dims) | Oui |
| [wttr.in](https://wttr.in) | Météo temps réel | Non |
| [DuckDuckGo Instant Answers](https://api.duckduckgo.com) | Recherche web | Non |
| [Pinecone](https://api.pinecone.io) | Vector store | Oui |

---

## Dépendances

| Package | Usage |
|---------|-------|
| `dotenv` | Chargement des variables d'environnement |
| `mathjs` | Évaluation sécurisée des expressions mathématiques |
| `validator` | Validation et sanitisation des entrées |
| `express` | (disponible pour extensions futures) |

---

## Sécurité

| Vecteur | Mesure |
|---------|--------|
| Entrées outils | `validator` : `isEmpty`, `isLength`, `stripLow`, `matches` sur chaque paramètre |
| SSRF (`fetch_page`) | `validator.isURL` + blocage IP privées (RFC 1918, loopback, `169.254.x.x`) |
| Prototype pollution | Nom d'outil validé par regex + lookup via `hasOwnProperty` |
| JSON malformé | `JSON.parse` des arguments dans un `try/catch` |
| Boucle infinie | Max 20 itérations dans `agent-loop.js` |
| Clés API | Vérifiées au démarrage — arrêt immédiat si absentes |

