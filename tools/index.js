// tools/index.js — Point d'entrée unique du dossier tools/
// Tous les agents importent depuis './tools/index.js' (ou '../tools/index.js')
// Pour ajouter un outil : créer tools/mon-outil.js puis l'exporter ici.

export { calculateTool, calculate }       from './calculate.js';
export { weatherTool,   get_weather }     from './weather.js';
export { searchTool,    web_search }      from './search.js';
export { fetchPageTool, fetch_page }      from './fetch-page.js';
