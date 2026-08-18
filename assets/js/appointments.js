/**
 * Termin-Kernlogik — bewusst frei von DOM-Zugriffen, damit sie sowohl im
 * Browser als auch unter `node --test` laufen kann.
 */

/** Feste Trainingszeiten je Wochentag (0 = Sonntag ... 6 = Samstag). */
export const SLOTS = {
  0: { start_time: '16:00', end_time: '19:00' },
  2: { start_time: '17:30', end_time: '19:00' },
};

/** Trainer inklusive Schlüsselbesitz. Dient als Fallback, wenn die DB nichts liefert. */
export const TRAINERS = [
  { id: 'chris', name: 'Chris', has_key: true, sort: 1 },
  { id: 'jan', name: 'Jan', has_key: true, sort: 2 },
  { id: 'jans', name: 'JanS', has_key: false, sort: 3 },
];

export const STATUS_DA = 'da';
export const STATUS_NICHT_DA = 'nicht_da';

/* ------------------------------------------------------------------ Datum */

/** Datum -> 'YYYY-MM-DD', immer in lokaler Zeit (nicht UTC, sonst Tagesversatz). */
export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 'YYYY-MM-DD' -> Date um 12:00 Uhr lokal (Mittag vermeidet Sommerzeit-Kanten). */
export function fromISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addDays(date, days) {
  const copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** 'HH:MM' -> Minuten seit Mitternacht. */
export function timeToMinutes(time) {
  const [h, m] = String(time).split(':').map(Number);
  return h * 60 + (m || 0);
}

/* ---------------------------------------------------- Terminserie erzeugen */

/**
 * Erzeugt alle Standardtermine (Sonntag + Dienstag) im Zeitraum.
 * Idempotent gedacht: das Ergebnis wird gegen vorhandene Termine abgeglichen.
 */
export function generateRecurring(fromISO, toISO) {
  const out = [];
  const end = fromISODate(toISO);
  let cursor = fromISODate(fromISO);
  while (cursor.getTime() <= end.getTime()) {
    const slot = SLOTS[cursor.getDay()];
    if (slot) {
      out.push({ date: toISODate(cursor), ...slot, is_custom: false });
    }
    cursor = addDays(cursor, 1);
  }
  return out;
}

/** Standardtermine, die im Zeitraum noch fehlen. */
export function missingRecurring(existing, fromISO, toISO) {
  const seen = new Set(existing.map((a) => `${a.date}|${a.start_time}`));
  return generateRecurring(fromISO, toISO).filter(
    (a) => !seen.has(`${a.date}|${a.start_time}`)
  );
}

/* -------------------------------------------------------------- Ampel-Logik */

/**
 * Ampelstatus eines Termins.
 *
 *   grau  – Termin abgesagt
 *   rot   – niemand hat zugesagt (auch: noch gar keine Rückmeldung)
 *   gelb  – jemand ist da, aber weder Chris noch Jan → kein Schlüssel vor Ort
 *   grün  – mindestens ein Schlüsselträger ist da
 *
 * @param {object} appointment  Termin (nutzt nur `cancelled`)
 * @param {Array}  attendance   Einträge {trainer_id, status} dieses Termins
 * @param {Array}  trainers     Trainerliste inkl. has_key
 */
export function computeStatus(appointment, attendance = [], trainers = TRAINERS) {
  const byTrainer = new Map(attendance.map((a) => [a.trainer_id, a.status]));
  const present = trainers.filter((t) => byTrainer.get(t.id) === STATUS_DA);
  const declined = trainers.filter((t) => byTrainer.get(t.id) === STATUS_NICHT_DA);
  const answered = present.length + declined.length;
  const keyHolders = trainers.filter((t) => t.has_key);
  const keyPresent = present.filter((t) => t.has_key);

  const base = {
    present,
    declined,
    answered,
    total: trainers.length,
    keyPresent,
    missingKeyHolders: keyHolders.filter((t) => !keyPresent.includes(t)),
  };

  if (appointment && appointment.cancelled) {
    return { ...base, level: 'cancelled', icon: '✕', label: 'Abgesagt',
      detail: 'Dieser Termin findet nicht statt.' };
  }

  if (present.length === 0) {
    return {
      ...base,
      level: 'red',
      icon: '✖',
      label: 'Niemand da',
      detail: answered === 0
        ? 'Noch keine Rückmeldung von den Trainern.'
        : 'Kein Trainer hat zugesagt — Training fällt vermutlich aus.',
    };
  }

  if (keyPresent.length === 0) {
    const namen = keyHolders.map((t) => t.name).join(' und ');
    return {
      ...base,
      level: 'yellow',
      icon: '🔑',
      label: 'Kein Schlüssel',
      detail: `${namen} fehlen — niemand kann aufschließen.`,
    };
  }

  return {
    ...base,
    level: 'green',
    icon: '✔',
    label: 'Training findet statt',
    detail: `${present.map((t) => t.name).join(', ')} ${present.length === 1 ? 'ist' : 'sind'} da.`,
  };
}

/** Sortierung: nach Datum, dann Startzeit. */
export function sortAppointments(list) {
  return [...list].sort((a, b) =>
    a.date === b.date
      ? timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
      : a.date < b.date ? -1 : 1
  );
}
