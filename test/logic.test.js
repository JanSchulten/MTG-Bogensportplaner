import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TRAINERS, STATUS_DA, STATUS_NICHT_DA,
  computeStatus, generateRecurring, missingRecurring,
  toISODate, fromISODate, timeToMinutes, sortAppointments,
} from '../assets/js/appointments.js';

import {
  summarizeWindow, describeCode, daysFromToday, isForecastable, FORECAST_DAYS,
} from '../assets/js/weather.js';

import { parseYouTubeId } from '../assets/js/ui.js';

/** Kurzschreibweise: statusOf({chris:'da', jans:'nicht_da'}) */
const statusOf = (map, appointment = {}) =>
  computeStatus(
    appointment,
    Object.entries(map).map(([trainer_id, status]) => ({ trainer_id, status })),
    TRAINERS
  );

/* ------------------------------------------------------------- Ampel-Logik */

test('rot, solange niemand zugesagt hat', () => {
  assert.equal(statusOf({}).level, 'red');
  assert.match(statusOf({}).detail, /Noch keine Rückmeldung/);

  const alleAb = statusOf({ chris: STATUS_NICHT_DA, jan: STATUS_NICHT_DA, jans: STATUS_NICHT_DA });
  assert.equal(alleAb.level, 'red');
  assert.match(alleAb.detail, /Kein Trainer hat zugesagt/);
});

test('gelb, wenn nur JanS da ist — Chris und Jan haben die Schlüssel', () => {
  const status = statusOf({ jans: STATUS_DA, chris: STATUS_NICHT_DA, jan: STATUS_NICHT_DA });
  assert.equal(status.level, 'yellow');
  assert.equal(status.label, 'Kein Schlüssel');
  assert.deepEqual(status.missingKeyHolders.map((t) => t.name), ['Chris', 'Jan']);
});

test('grün, sobald ein Schlüsselträger da ist', () => {
  assert.equal(statusOf({ chris: STATUS_DA }).level, 'green');
  assert.equal(statusOf({ jan: STATUS_DA }).level, 'green');
  assert.equal(statusOf({ jan: STATUS_DA, jans: STATUS_DA }).level, 'green');
});

test('abgesagte Termine sind grau, unabhängig von den Zusagen', () => {
  const status = statusOf({ chris: STATUS_DA, jan: STATUS_DA }, { cancelled: true });
  assert.equal(status.level, 'cancelled');
});

test('alle 27 Kombinationen ergeben genau die erwartete Farbe', () => {
  const werte = [STATUS_DA, STATUS_NICHT_DA, null];
  let geprueft = 0;

  for (const chris of werte) {
    for (const jan of werte) {
      for (const jans of werte) {
        const map = {};
        if (chris) map.chris = chris;
        if (jan) map.jan = jan;
        if (jans) map.jans = jans;

        const anwesend = [chris, jan, jans].filter((v) => v === STATUS_DA).length;
        const schluessel = chris === STATUS_DA || jan === STATUS_DA;
        const erwartet = anwesend === 0 ? 'red' : schluessel ? 'green' : 'yellow';

        assert.equal(statusOf(map).level, erwartet, `chris=${chris} jan=${jan} jans=${jans}`);
        geprueft++;
      }
    }
  }
  assert.equal(geprueft, 27);
});

test('Zählungen im Status stimmen', () => {
  const status = statusOf({ chris: STATUS_DA, jan: STATUS_NICHT_DA });
  assert.equal(status.present.length, 1);
  assert.equal(status.declined.length, 1);
  assert.equal(status.answered, 2);
  assert.equal(status.total, 3);
});

/* ---------------------------------------------------------- Terminserie */

test('Serie enthält nur Sonntage und Dienstage mit den richtigen Zeiten', () => {
  // 2026-08-17 ist ein Montag, 2026-09-13 ein Sonntag.
  const serie = generateRecurring('2026-08-17', '2026-09-13');

  for (const termin of serie) {
    const wochentag = fromISODate(termin.date).getDay();
    assert.ok(wochentag === 0 || wochentag === 2, `${termin.date} ist weder So noch Di`);
    if (wochentag === 0) {
      assert.equal(termin.start_time, '16:00');
      assert.equal(termin.end_time, '19:00');
    } else {
      assert.equal(termin.start_time, '17:30');
      assert.equal(termin.end_time, '19:00');
    }
  }

  // 4 Wochen: je 4 Dienstage und 4 Sonntage.
  assert.equal(serie.length, 8);
  assert.equal(serie[0].date, '2026-08-18');
  assert.equal(serie.at(-1).date, '2026-09-13');
});

test('Serie schließt Anfangs- und Endtag ein', () => {
  const nurEinTag = generateRecurring('2026-08-23', '2026-08-23'); // Sonntag
  assert.equal(nurEinTag.length, 1);
  assert.equal(nurEinTag[0].start_time, '16:00');

  assert.equal(generateRecurring('2026-08-24', '2026-08-24').length, 0); // Montag
});

test('missingRecurring meldet nur wirklich fehlende Termine', () => {
  const vorhanden = [{ date: '2026-08-18', start_time: '17:30' }];
  const fehlend = missingRecurring(vorhanden, '2026-08-17', '2026-08-23');
  assert.deepEqual(fehlend.map((a) => a.date), ['2026-08-23']);
  assert.equal(missingRecurring(vorhanden, '2026-08-18', '2026-08-18').length, 0);
});

test('Serie überspringt keinen Tag über den Sommerzeitwechsel hinweg', () => {
  // Ende Oktober 2026: Umstellung in der Nacht auf Sonntag, 25.10.
  const serie = generateRecurring('2026-10-20', '2026-11-03').map((a) => a.date);
  assert.deepEqual(serie, [
    '2026-10-20', '2026-10-25', '2026-10-27', '2026-11-01', '2026-11-03',
  ]);
});

test('Datumshelfer arbeiten in lokaler Zeit', () => {
  assert.equal(toISODate(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(toISODate(fromISODate('2026-12-31')), '2026-12-31');
  assert.equal(timeToMinutes('17:30'), 1050);
  assert.equal(timeToMinutes('16:00'), 960);
});

test('Termine werden nach Datum und Startzeit sortiert', () => {
  const sortiert = sortAppointments([
    { date: '2026-08-23', start_time: '17:30' },
    { date: '2026-08-18', start_time: '17:30' },
    { date: '2026-08-23', start_time: '10:00' },
  ]);
  assert.deepEqual(
    sortiert.map((a) => `${a.date} ${a.start_time}`),
    ['2026-08-18 17:30', '2026-08-23 10:00', '2026-08-23 17:30']
  );
});

/* ------------------------------------------------------------------ Wetter */

// Gespeicherte Beispielantwort von Open-Meteo (Struktur wie im echten Abruf).
const hourly = {
  time: [
    '2026-08-23T15:00', '2026-08-23T16:00', '2026-08-23T17:00',
    '2026-08-23T18:00', '2026-08-23T19:00', '2026-08-23T20:00',
    '2026-08-25T17:00', '2026-08-25T18:00', '2026-08-25T19:00',
  ],
  temperature_2m: [24.0, 21.4, 22.9, 20.1, 18.6, 17.0, 15.2, 14.8, 14.1],
  precipitation_probability: [70, 10, 45, 30, 5, 0, 80, 85, 60],
  weather_code: [95, 1, 61, 3, 2, 0, 3, 3, 2],
  wind_speed_10m: [30, 9, 14, 12, 8, 5, 20, 22, 19],
};

test('Sonntagsfenster 16–19 Uhr wertet genau vier Stunden aus', () => {
  const w = summarizeWindow(hourly, '2026-08-23', '16:00', '19:00');
  assert.equal(w.hours, 4);
  assert.equal(w.tempMin, 19); // 18,6 gerundet
  assert.equal(w.tempMax, 23); // 22,9 gerundet
  assert.equal(w.precipMax, 45);
  assert.equal(w.windMax, 14);
  // Die 15-Uhr-Stunde mit Gewitter (Code 95) darf nicht einfließen.
  assert.equal(w.code, 61);
  assert.equal(w.text, 'Leichter Regen');
});

test('Dienstagsfenster 17:30–19 Uhr rundet auf volle Stunden 17 bis 19', () => {
  const w = summarizeWindow(hourly, '2026-08-23', '17:30', '19:00');
  assert.equal(w.hours, 3);
  assert.equal(w.tempMax, 23);
  assert.equal(w.tempMin, 19);
});

test('das schlechteste Wetter im Fenster bestimmt die Anzeige', () => {
  const w = summarizeWindow(hourly, '2026-08-25', '17:30', '19:00');
  assert.equal(w.code, 3);
  assert.equal(w.text, 'Bewölkt');
  assert.equal(w.precipMax, 85);
});

test('ohne Daten für den Tag gibt es keine Zusammenfassung', () => {
  assert.equal(summarizeWindow(hourly, '2026-09-01', '16:00', '19:00'), null);
  assert.equal(summarizeWindow(null, '2026-08-23', '16:00', '19:00'), null);
  assert.equal(summarizeWindow({}, '2026-08-23', '16:00', '19:00'), null);
});

test('Wettercodes haben Symbol und deutschen Text', () => {
  assert.deepEqual(describeCode(0), { icon: '☀️', text: 'Klar' });
  assert.equal(describeCode(95).text, 'Gewitter');
  assert.equal(describeCode(1234).text, 'Unbekannt');
});

test('Vorhersage nur innerhalb des Open-Meteo-Zeitraums', () => {
  const heute = new Date(2026, 7, 18); // 18.08.2026
  assert.equal(daysFromToday('2026-08-18', heute), 0);
  assert.equal(daysFromToday('2026-08-23', heute), 5);
  assert.equal(daysFromToday('2026-08-17', heute), -1);

  assert.equal(isForecastable('2026-08-18', heute), true);
  assert.equal(isForecastable('2026-08-17', heute), false, 'Vergangenheit');
  assert.equal(isForecastable('2026-09-02', heute), true, `${FORECAST_DAYS - 1} Tage voraus`);
  assert.equal(isForecastable('2026-09-03', heute), false, `${FORECAST_DAYS} Tage voraus`);
});

/* --------------------------------------------------------------- YouTube */

test('YouTube-IDs werden aus allen üblichen Linkformen gelesen', () => {
  const id = 'dQw4w9WgXcQ';
  assert.equal(parseYouTubeId(`https://www.youtube.com/watch?v=${id}`), id);
  assert.equal(parseYouTubeId(`https://www.youtube.com/watch?list=PL1&v=${id}`), id);
  assert.equal(parseYouTubeId(`https://youtu.be/${id}?t=42`), id);
  assert.equal(parseYouTubeId(`https://www.youtube.com/embed/${id}`), id);
  assert.equal(parseYouTubeId(`https://www.youtube.com/shorts/${id}`), id);
  assert.equal(parseYouTubeId(id), id);

  assert.equal(parseYouTubeId('https://vimeo.com/12345'), null);
  assert.equal(parseYouTubeId(''), null);
  assert.equal(parseYouTubeId(null), null);
});
