// tools/weather.js — Outil météo (wttr.in)
import validator from 'validator';

export const weatherTool = {
  type: 'function',
  function: {
    name: 'get_weather',
    description: 'Récupère la météo actuelle pour une ville donnée. Utiliser quand on parle de météo, température, conditions climatiques.',
    parameters: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: "Le nom de la ville (ex: 'Paris', 'London', 'Tokyo')"
        }
      },
      required: ['city']
    }
  }
};

export async function get_weather({ city }) {
  if (!city || typeof city !== 'string' || validator.isEmpty(city.trim())) {
    return { error: 'Ville invalide : doit être une chaîne non vide.' };
  }
  const sanitizedCity = validator.trim(city);
  if (!validator.isLength(sanitizedCity, { min: 1, max: 100 })) {
    return { error: 'Nom de ville invalide : trop long (max 100 caractères).' };
  }
  if (!validator.matches(sanitizedCity, /^[\p{L}\s\-'.]+$/u)) {
    return { error: 'Nom de ville invalide : caractères non autorisés.' };
  }

  const response = await fetch(`https://wttr.in/${encodeURIComponent(sanitizedCity)}?format=j1`);
  if (!response.ok) {
    return { error: `Impossible de récupérer la météo pour ${sanitizedCity}` };
  }
  const data = await response.json();
  const current = data.current_condition[0];
  return {
    city: sanitizedCity,
    temperature_c: current.temp_C,
    feels_like_c:  current.FeelsLikeC,
    description:   current.weatherDesc[0].value,
    humidity:      current.humidity + '%',
    wind_kmph:     current.windspeedKmph
  };
}
