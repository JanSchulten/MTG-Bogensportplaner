/**
 * Wettervorhersage über Open-Meteo (kostenlos, ohne API-Schlüssel).
 * Die Auswertung (`summarizeWindow`) ist rein und damit testbar.
 */

import { timeToMinutes } from './appointments.js';

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const TIMEZONE = 'Europe/Berlin';
/** Open-Meteo liefert maximal 16 Tage im Voraus. */
export const FORECAST_DAYS = 16;
const CACHE_TTL_MS = 30 * 60 * 1000;

/** WMO-Wettercodes -> Symbol und deutscher Text. */
const WMO = {
  0: ['☀️', 'Klar'],
  1: ['🌤️', 'Überwiegend klar'],
  2: ['⛅', 'Teils bewölkt'],
  3: ['☁️', 'Bewölkt'],
  45: ['🌫️', 'Nebel'],
  48: ['🌫️', 'Reifnebel'],
  51: ['🌦️', 'Leichter Nieselregen'],
  53: ['🌦️', 'Nieselregen'],
  55: ['🌧️', 'Starker Nieselregen'],
  56: ['🌧️', 'Gefrierender Niesel'],
  57: ['🌧️', 'Gefrierender Niesel'],
  61: ['🌦️', 'Leichter Regen'],
  63: ['🌧️', 'Regen'],
  65: ['🌧️', 'Starker Regen'],
  66: ['🌧️', 'Gefrierender Regen'],
  67: ['🌧️', 'Gefrierender Regen'],
  71: ['🌨️', 'Leichter Schneefall'],
  73: ['🌨️', 'Schneefall'],
  75: ['❄️', 'Starker Schneefall'],
  77: ['❄️', 'Schneegriesel'],
  80: ['🌦️', 'Leichte Schauer'],
  81: ['🌧️', 'Schauer'],
  82: ['⛈️', 'Starke Schauer'],
  85: ['🌨️', 'Schneeschauer'],
  86: ['❄️', 'Starke Schneeschauer'],
  95: ['⛈️', 'Gewitter'],
  96: ['⛈️', 'Gewitter mit Hagel'],
  99: ['⛈️', 'Schweres Gewitter mit Hagel'],
};

export function describeCode(code) {
  const [icon, text] = WMO[code] || ['🌡️', 'Unbekannt'];
  return { icon, text };
}

/** Wie viele Tage liegt `dateISO` von heute entfernt? */
export function daysFromToday(dateISO, today = new Date()) {
  const a = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const [y, m, d] = dateISO.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - a) / 86400000);
}

export function isForecastable(dateISO, today = new Date()) {
  const diff = daysFromToday(dateISO, today);
  return diff >= 0 && diff < FORECAST_DAYS;
}

/**
 * Verdichtet die Stundenwerte im Terminfenster zu einer Kurzfassung.
 * Berücksichtigt werden die vollen Stunden von abgerundetem Beginn bis
 * aufgerundetem Ende (17:30–19:00 → 17, 18, 19 Uhr).
 *
 * @returns {object|null} null, wenn für das Fenster keine Daten vorliegen
 */
export function summarizeWindow(hourly, dateISO, startTime, endTime) {
  if (!hourly || !Array.isArray(hourly.time)) return null;

  const firstHour = Math.floor(timeToMinutes(startTime) / 60);
  const lastHour = Math.ceil(timeToMinutes(endTime) / 60);

  const idx = [];
  hourly.time.forEach((stamp, i) => {
    if (!String(stamp).startsWith(dateISO)) return;
    const hour = Number(String(stamp).slice(11, 13));
    if (hour >= firstHour && hour <= lastHour) idx.push(i);
  });
  if (idx.length === 0) return null;

  const pick = (key) => idx.map((i) => hourly[key]?.[i]).filter((v) => v != null);
  const temps = pick('temperature_2m');
  const precip = pick('precipitation_probability');
  const wind = pick('wind_speed_10m');
  const codes = pick('weather_code');
  if (temps.length === 0) return null;

  // Höherer WMO-Code = grober das Wetter; für Training draußen zählt der schlechteste Wert.
  const worstCode = codes.length ? Math.max(...codes) : null;

  return {
    tempMin: Math.round(Math.min(...temps)),
    tempMax: Math.round(Math.max(...temps)),
    precipMax: precip.length ? Math.max(...precip) : null,
    windMax: wind.length ? Math.round(Math.max(...wind)) : null,
    code: worstCode,
    ...(worstCode == null ? { icon: '🌡️', text: 'Unbekannt' } : describeCode(worstCode)),
    hours: idx.length,
  };
}

/* ------------------------------------------------------------ Netzwerkteil */

function cacheGet(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { at, data } = JSON.parse(raw);
    if (Date.now() - at > CACHE_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function cacheSet(key, data) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* Speicher voll oder gesperrt — Cache ist optional */
  }
}

/** Ortssuche für die Admin-Eingabe. */
export async function searchPlaces(query) {
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(query)}&count=8&language=de&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Ortssuche fehlgeschlagen (${res.status})`);
  const data = await res.json();
  return (data.results || []).map((r) => ({
    name: r.name,
    lat: r.latitude,
    lon: r.longitude,
    label: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
  }));
}

/** Stündliche Vorhersage für ein Koordinatenpaar (ein Request pro Ort). */
export async function fetchForecast(lat, lon) {
  const key = `wx:${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const url =
    `${FORECAST_URL}?latitude=${lat}&longitude=${lon}` +
    '&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m' +
    `&forecast_days=${FORECAST_DAYS}&timezone=${encodeURIComponent(TIMEZONE)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Wetterabruf fehlgeschlagen (${res.status})`);
  const data = await res.json();
  cacheSet(key, data.hourly);
  return data.hourly;
}

/**
 * Holt die Vorhersage für viele Termine mit möglichst wenigen Requests:
 * ein Abruf je Koordinatenpaar, danach wird nur noch ausgewertet.
 *
 * @returns {Map<string, {state:string, data?:object, message?:string}>} je Termin-ID
 */
export async function forecastForAppointments(appointments, today = new Date()) {
  const result = new Map();
  const groups = new Map();

  for (const appt of appointments) {
    if (appt.lat == null || appt.lon == null) {
      result.set(appt.id, { state: 'no-location' });
      continue;
    }
    if (!isForecastable(appt.date, today)) {
      result.set(appt.id, {
        state: 'too-far',
        message: daysFromToday(appt.date, today) < 0
          ? 'Termin liegt in der Vergangenheit.'
          : `Vorhersage erst ${FORECAST_DAYS} Tage vorher verfügbar.`,
      });
      continue;
    }
    const key = `${Number(appt.lat).toFixed(3)},${Number(appt.lon).toFixed(3)}`;
    if (!groups.has(key)) groups.set(key, { lat: appt.lat, lon: appt.lon, items: [] });
    groups.get(key).items.push(appt);
  }

  await Promise.all(
    [...groups.values()].map(async (group) => {
      try {
        const hourly = await fetchForecast(group.lat, group.lon);
        for (const appt of group.items) {
          const summary = summarizeWindow(hourly, appt.date, appt.start_time, appt.end_time);
          result.set(appt.id, summary
            ? { state: 'ok', data: summary }
            : { state: 'unavailable', message: 'Keine Werte für dieses Zeitfenster.' });
        }
      } catch (err) {
        for (const appt of group.items) {
          result.set(appt.id, { state: 'error', message: err.message });
        }
      }
    })
  );

  return result;
}
