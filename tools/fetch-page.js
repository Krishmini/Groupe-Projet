// tools/fetch-page.js — Outil lecture de page web (avec protection SSRF)
import validator from 'validator';

export const fetchPageTool = {
  type: 'function',
  function: {
    name: 'fetch_page',
    description: "Récupère et lit le contenu textuel d'une page web à partir de son URL. Utiliser après web_search pour approfondir un résultat et obtenir des détails précis.",
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: "L'URL complète de la page à lire (ex: 'https://nodejs.org/en/blog/...')"
        }
      },
      required: ['url']
    }
  }
};

// Plages IP privées — protection anti-SSRF
const PRIVATE_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fe80/i,
];

function assertSafeUrl(rawUrl) {
  const isValidUrl = validator.isURL(rawUrl, {
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: true,
    disallow_auth: true,
    allow_query_components: true
  });
  if (!isValidUrl) throw new Error('URL invalide ou protocole non autorisé.');

  const host = new URL(rawUrl).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '0.0.0.0') {
    throw new Error('Accès aux ressources locales interdit.');
  }
  if (PRIVATE_IP_RANGES.some(re => re.test(host))) {
    throw new Error('Accès aux adresses IP privées/internes interdit (SSRF).');
  }
}

export async function fetch_page({ url }) {
  if (!url || typeof url !== 'string' || validator.isEmpty(url.trim())) {
    return { error: 'URL invalide : doit être une chaîne non vide.' };
  }
  const cleanUrl = validator.trim(url);
  try {
    assertSafeUrl(cleanUrl);
  } catch (err) {
    return { error: `URL refusée : ${err.message}` };
  }

  const response = await fetch(cleanUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (educational project)' }
  });
  if (!response.ok) {
    return { error: `Impossible de lire la page : ${response.status}` };
  }
  const html = await response.text();

  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 3000);

  return { url: cleanUrl, content: text };
}
