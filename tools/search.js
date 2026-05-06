// tools/search.js — Outil web search (DuckDuckGo Instant Answers)
import validator from 'validator';

export const searchTool = {
  type: 'function',
  function: {
    name: 'web_search',
    description: "Recherche des informations récentes sur le web. Utiliser pour des faits actuels, des événements récents, des données en temps réel, ou quand on n'est pas certain d'une information.",
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'La requête de recherche, en anglais pour de meilleurs résultats'
        }
      },
      required: ['query']
    }
  }
};

// Cache en mémoire — évite de rappeler DuckDuckGo pour la même query dans la session
const searchCache = new Map();

export async function web_search({ query }) {
  if (!query || typeof query !== 'string' || validator.isEmpty(query.trim())) {
    return { error: 'Requête invalide : query doit être une chaîne non vide.' };
  }
  const q = validator.trim(validator.stripLow(query)).slice(0, 200);

  if (searchCache.has(q)) {
    console.log(`  [cache] web_search("${q}")`);
    return searchCache.get(q);
  }

  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (educational project)' }
  });
  if (!response.ok) {
    return { error: `Erreur DuckDuckGo : ${response.status}` };
  }
  const data = await response.json();

  const results = (data.RelatedTopics || [])
    .filter(t => t.Text)
    .slice(0, 5)
    .map(t => ({ text: t.Text, url: t.FirstURL }));

  if (results.length === 0 && data.AbstractText) {
    return [{ text: data.AbstractText, url: data.AbstractURL }];
  }
  const output = results.length > 0 ? results : { message: 'Aucun résultat trouvé.' };
  searchCache.set(q, output);
  return output;
}
