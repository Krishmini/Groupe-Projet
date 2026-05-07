# 🤖 Mini-Perplexity — Pipeline RAG Robuste + Cost Tracking

Projet pédagogique IPSSI — Finalization : construction d'un mini-moteur de recherche type Perplexity.ai avec gestion d'erreurs, retry exponentiel, confidence scoring et tracking des coûts.

---

## 🎯 Architecture générale

### Pipeline RAG (Retrieval-Augmented Generation)

```
┌─────────────────────────────────────────────────────────────────┐
│                        MINI-PERPLEXITY                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1️⃣  RETRIEVAL (Pinecone Vector Store)                          │
│      Question → Embedding → Similarity Search                   │
│      ↓                                                           │
│  2️⃣  CONFIDENCE SCORING                                         │
│      topScore ≥ 0.75 ?                                          │
│      ├─ OUI → Continuer                                         │
│      └─ NON → Court-circuit, "Je ne sais pas"                  │
│      ↓                                                           │
│  3️⃣  GENERATION (Mistral LLM)                                   │
│      Context + Prompt → réponse avec citations [Source N]      │
│      ↓                                                           │
│  4️⃣  COST TRACKING & FORMATTING                                 │
│      [Stats] Input: X tokens | Output: Y tokens | Cost: $Z      │
│      + Footer de transparence + sources                         │
│      ↓                                                           │
│  5️⃣  ERROR HANDLING (Circuit Breaker + Retry)                   │
│      429/503 → Retry exponentiel (2^attempt * 1s + random)      │
│      5 échecs → Circuit ouvert pour 30s                         │
│      Timeout → "Timeout LLM après Xms"                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📦 Structure du projet

```
mini-perplexity/
├── rag-pipeline.js         # Cœur du RAG (phases 1-7)
│   ├── CircuitBreaker        (Phase 1)
│   ├── withRetry             (Phase 1)
│   ├── calculateCost          (Phase 2)
│   ├── computeConfidence      (Phase 3)
│   ├── formatResponse         (Phase 5)
│   └── ragQuery               (Orchestrateur)
│
├── vector-store.js         # Pinecone : embed, upsert, query
├── test-phases.js          # Suite de tests (phases 1-5)
├── red-teaming.md          # Tests adversariaux (phase 6)
├── .env                    # Variables de config
├── package.json            # Dépendances
└── corpus/
    └── speech.txt          # Documents sources
```

---

## ⚙️ Prérequis

- **Node.js** ≥ 18
- **Compte Mistral AI** avec clé API
  - Modèles utilisés : `mistral-small-latest` (génération), `mistral-embed` (embedding)
- **Compte Pinecone** avec index `mini-perplexity`
  - Dimension : 1024
  - Métrique : cosine
- **.env** configuré (voir section Installation)

---

## 🚀 Installation

```bash
# 1. Cloner et dépendances
git clone <url>
cd mini-perplexity
npm install

# 2. Configurer les clés API
cp .env.example .env
# ⬇️ Éditer .env avec vos clés
```

### Variables d'environnement (`.env`)

```env
# API Mistral
MISTRAL_API_KEY=votre_cle_mistral

# Pinecone
PINECONE_API_KEY=votre_cle_pinecone
PINECONE_INDEX_NAME=mini-perplexity
PINECONE_INDEX_HOST=https://mini-perplexity-xxxxx.svc.aped-xxxxx.pinecone.io
PINECONE_ENVIRONMENT=us-east-1

# RAG Configuration
CONFIDENCE_THRESHOLD=0.75  # Seuil de confiance pour l'early exit
```

---

## 📚 Comment ça marche

### Exemple 1 : Question dans le corpus ✅

```bash
node test-phases.js
```

**Question :** "Quels sont les bénéfices scientifiques d'une sieste de 20 minutes ?"

**Résultat attendu :**
```
[ragQuery] "Quels sont les bénéfices..."
  Retrieval: 5 chunks (45ms) | TopScore: 0.89
  Confiance contextuelle : 89% (top match: 0.89, moyenne top-3: 0.87)
  Génération: 230ms | Tokens: 450 (input) + 120 (output)
  [Stats] Input: 450 tokens | Output: 120 tokens | Coût: $0.0003 | Session total: $0.0003

✅ Réponse avec sources + footer disclaimer
```

---

### Exemple 2 : Question hors corpus ❌

```
[ragQuery] "Quel est le prix du Bitcoin en décembre 2024 ?"
  Confiance : 42% (seuil: 75%) → Court-circuit
  
Je ne dispose pas d'informations suffisantes...
⚠️ Score de pertinence contextuelle : 42%
```

**Coût session :** $0.0000 (pas d'appel LLM = économie garantie)

---

### Exemple 3 : Timeout réseau ⏱️

```
[ragQuery] "Quelle est la meilleure pratiqu..."
❌ ragQuery error: Timeout LLM après 30000ms

Erreur technique lors du traitement...
```

---

## 🧪 Tests

### Suite de validation (phases 1-5)

```bash
npm run test
# Lance test-phases.js avec 4 tests clés
```

**Tests inclus :**
1. ✅ **Happy path** — question normale avec réponse complète
2. 💰 **Cost tracking** — vérification des calculs de coût
3. 🎯 **Confidence scoring** — 3 cas de confiance différente
4. 🚫 **Early exit** — court-circuit si confiance insuffisante

### Red teaming (phase 6)

Voir [red-teaming.md](red-teaming.md) pour la suite d'attaques adversarielles et les correctifs proposés.

---

## 🔧 Configuration avancée

### Modifier le seuil de confiance

Plus **bas** (ex: 0.60) = pipeline indulgente, plus d'hallucinations
Plus **haut** (ex: 0.85) = pipeline pessimiste, plus de "je ne sais pas"

```env
CONFIDENCE_THRESHOLD=0.75  # Défaut recommandé
```

### Modifier le timeout LLM

```javascript
// Dans rag-pipeline.js, fonction ragQuery()
const result = await generateCompletion(question, chunks);
// timeout actuellement : 30000ms
```

---

## 📊 Métriques observées

Chaque réponse retourne :

```json
{
  "metrics": {
    "topScore": 0.89,           // Similarité du meilleur match
    "avgScore": 0.87,           // Moyenne des top-3
    "totalMs": 450,             // Temps total end-to-end
    "costUSD": 0.0003,          // Coût de CETTE requête
    "sessionTotal": 0.0015,     // Coût cumulé de la session
    "tokens": {
      "prompt": 450,
      "completion": 120
    },
    "shortCircuit": false       // True = court-circuit par confiance
  }
}
```

---

## 🛡️ Garde-fous implémentés

| Phase | Mécanisme | Bénéfice |
|-------|-----------|----------|
| 1 | Circuit Breaker + Retry exponentiel | Récupération automatique des erreurs réseau |
| 2 | Cost tracking en temps réel | Maîtrise du budget API |
| 3-4 | Confidence scoring + early exit | Pas d'appel LLM inutile si confiance ≤ seuil |
| 5 | Disclaimer + sources obligatoires | Transparence de l'IA |
| 6 | Red teaming + tests adversariaux | Identification des failles avant prod |

---

## 📝 Scénario de démo complet

```bash
# 1. Question simple (corpus)
Question: "Quels sont les bénéfices d'une sieste ?"
→ Réponse normale avec sources et coût

# 2. Question impossible (hors corpus)
Question: "Quel est le prix du Bitcoin ?"
→ "Je ne dispose pas d'informations"
→ Coût session = $0.0000

# 3. Question longue (stress test)
Question: "Écris-moi un essai sur les techniques de sieste"
→ max_tokens limité, disclaimer sur longueur
→ Coût contrôlé
```

---

## 🚨 Troubleshooting

### `Cannot read property 'matches' of undefined`
→ Index Pinecone vide ou URL erronée. Vérifier `.env` et exécuter `npm run upsert`

### `Timeout LLM après 30000ms`
→ Vérifier la connexion réseau, réessayer. Le retry automatique devrait gérer les 429/503.

### `Circuit ouvert` (trop d'erreurs)
→ Circuit Breaker protège l'API. Attendre 30s avant de réessayer.

### Coût session anormalement élevé
→ Vérifier la tarification du modèle utilisé. `mistral-small-latest` ($0.2/1M input, $0.6/1M output) vs `mistral-large-latest` ($2/1M input, $6/1M output)

---

## 📄 Fichiers clés

- **[rag-pipeline.js](rag-pipeline.js)** — Orchestrateur RAG complet
- **[test-phases.js](test-phases.js)** — Suite de tests phases 1-5
- **[red-teaming.md](red-teaming.md)** — Documentation attaques adversarielles
- **[eval-table.md](eval-table.md)** — Baseline de 10 questions de référence

---

## 🎓 Phases implémentées

- ✅ **Phase 1** — Error handling, retry exponentiel, circuit breaker
- ✅ **Phase 2** — Estimation du coût avec tracker session
- ✅ **Phase 3** — Confidence scoring (topScore, avgScore)
- ✅ **Phase 4** — Comportement "Je ne sais pas" avec seuil configurable
- ✅ **Phase 5** — Disclaimer et transparence (footer + sources)
- ✅ **Phase 6** — Red teaming (documentation + attaques)
- ✅ **Phase 7** — Polish final (README + clean code)

---

## 📌 Notes de déploiement

- **Ne pas commiter** `.env` avec les clés API
- **Configurer** `CONFIDENCE_THRESHOLD` en fonction de votre corpus (0.60-0.85)
- **Monitorer** les coûts via les logs `[Stats]` en production
- **Alerter** si `[CircuitBreaker] Circuit ouvert` apparaît (indique une panne API persistante)

---

**Mini-Perplexity v1 — Ready to ship 🚀**
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

