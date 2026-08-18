/**
 * Eingabefeld für den Trainingsort mit Ortssuche über Open-Meteo.
 *
 * Der Anzeigename ist frei wählbar ("Bogenwiese am Sportplatz"); für die
 * Wettervorhersage werden zusätzlich Koordinaten gebraucht, die über die
 * Suche gesetzt werden.
 */

import { h, field, toast } from './ui.js';
import { searchPlaces } from './weather.js';

/**
 * @param {{location?:string, lat?:number, lon?:number}} initial
 * @returns {{node: Node, getValue: () => {location:string|null, lat:number|null, lon:number|null}}}
 */
export function placeField(initial = {}) {
  let lat = initial.lat ?? null;
  let lon = initial.lon ?? null;

  const nameInput = h('input', {
    class: 'input', type: 'text', name: 'location',
    value: initial.location || '', placeholder: 'z. B. Bogenplatz am Vereinsheim',
  });

  const coords = h('div', { class: 'place-current' });
  const results = h('div', { class: 'place-results' });

  const showCoords = () => {
    coords.textContent = lat != null && lon != null
      ? `Koordinaten für die Wettervorhersage: ${Number(lat).toFixed(3)}, ${Number(lon).toFixed(3)}`
      : 'Noch keine Koordinaten — ohne sie gibt es keine Wettervorhersage.';
  };
  showCoords();

  const searchInput = h('input', {
    class: 'input', type: 'search',
    placeholder: 'Ort suchen, z. B. Marburg',
    on: {
      keydown: (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          run();
        }
      },
    },
  });

  const searchButton = h('button', {
    class: 'btn btn-small', type: 'button', text: 'Suchen',
    on: { click: () => run() },
  });

  async function run() {
    const query = searchInput.value.trim();
    if (query.length < 2) return;
    results.replaceChildren(h('p', { class: 'muted small', text: 'Suche läuft …' }));
    try {
      const places = await searchPlaces(query);
      if (places.length === 0) {
        results.replaceChildren(h('p', { class: 'muted small', text: 'Nichts gefunden.' }));
        return;
      }
      results.replaceChildren(
        ...places.map((place) =>
          h('button', {
            class: 'place-result', type: 'button', text: place.label,
            on: {
              click: () => {
                lat = place.lat;
                lon = place.lon;
                if (!nameInput.value.trim()) nameInput.value = place.label;
                showCoords();
                results.replaceChildren();
                searchInput.value = '';
              },
            },
          })
        )
      );
    } catch (err) {
      results.replaceChildren();
      toast(`Ortssuche nicht möglich: ${err.message}`, 'error');
    }
  }

  const node = h(
    'div',
    { class: 'field' },
    field('Ort', nameInput),
    field(
      'Ort suchen (setzt die Koordinaten)',
      h('div', { style: 'display:flex;gap:.4rem' }, searchInput, searchButton)
    ),
    coords,
    results
  );

  return {
    node,
    getValue: () => ({
      location: nameInput.value.trim() || null,
      lat,
      lon,
    }),
  };
}
