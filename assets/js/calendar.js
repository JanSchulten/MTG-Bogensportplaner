/** Monatsraster mit farblich markierten Trainingstagen (Woche beginnt montags). */

import { h, clear } from './ui.js';
import { toISODate, SLOTS } from './appointments.js';

const DOW = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** Wochentag 0..6 (So..Sa) auf Spalte 0..6 (Mo..So) abbilden. */
const column = (jsDay) => (jsDay + 6) % 7;

const LEGEND = [
  ['green', 'Training findet statt'],
  ['yellow', 'Kein Schlüssel vor Ort'],
  ['red', 'Niemand da'],
  ['cancelled', 'Abgesagt'],
];

/**
 * @param {HTMLElement} host
 * @param {object} o
 * @param {Date}   o.month          beliebiger Tag im anzuzeigenden Monat
 * @param {Map<string, object[]>} o.byDate    Termine je 'YYYY-MM-DD'
 * @param {Map<string, object>}   o.statusById Ampelstatus je Termin-ID
 * @param {(appointment:object)=>void} o.onSelect
 * @param {(month:Date)=>void}         o.onMonthChange
 */
export function renderCalendar(host, { month, byDate, statusById, onSelect, onMonthChange, today = new Date() }) {
  clear(host);

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const first = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const todayISO = toISODate(today);

  const step = (delta) => onMonthChange(new Date(year, monthIndex + delta, 1));

  host.append(
    h(
      'div',
      { class: 'calendar-head' },
      h('button', {
        class: 'btn btn-ghost btn-small', type: 'button',
        'aria-label': 'Vorheriger Monat', text: '‹',
        on: { click: () => step(-1) },
      }),
      h('h2', {
        class: 'calendar-title',
        text: first.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }),
      }),
      h(
        'div',
        { style: 'display:flex;gap:.25rem' },
        h('button', {
          class: 'btn btn-ghost btn-small', type: 'button', text: 'Heute',
          on: { click: () => onMonthChange(new Date(today.getFullYear(), today.getMonth(), 1)) },
        }),
        h('button', {
          class: 'btn btn-ghost btn-small', type: 'button',
          'aria-label': 'Nächster Monat', text: '›',
          on: { click: () => step(1) },
        })
      )
    )
  );

  const grid = h('div', { class: 'calendar-grid' });
  for (const label of DOW) grid.append(h('div', { class: 'calendar-dow', text: label }));

  for (let i = 0; i < column(first.getDay()); i++) {
    grid.append(h('div', { class: 'calendar-cell is-empty' }));
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, monthIndex, day);
    const iso = toISODate(date);
    const entries = byDate.get(iso) || [];
    const isTrainingDay = SLOTS[date.getDay()] != null;

    const classes = ['calendar-cell'];
    if (iso === todayISO) classes.push('is-today');
    if (iso < todayISO) classes.push('is-past');

    if (entries.length === 0) {
      grid.append(
        h('div', {
          class: classes.join(' ') + (isTrainingDay ? ' lvl-past' : ''),
          text: String(day),
        })
      );
      continue;
    }

    // Bei mehreren Terminen an einem Tag zählt der ungünstigste Zustand.
    const order = { green: 0, yellow: 1, red: 2, cancelled: 3 };
    const worst = entries
      .map((a) => statusById.get(a.id))
      .filter(Boolean)
      .sort((a, b) => order[b.level] - order[a.level])[0];

    classes.push('is-training');
    // Vergangenes wird neutral dargestellt: die Ampel gilt der Planung.
    classes.push(iso < todayISO ? 'lvl-past' : worst ? `lvl-${worst.level}` : 'lvl-past');

    grid.append(
      h('button', {
        class: classes.join(' '),
        type: 'button',
        title: worst ? `${day}. — ${worst.label}` : `${day}.`,
        'aria-label': `${date.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })}${worst ? `, ${worst.label}` : ''}`,
        on: { click: () => onSelect(entries[0]) },
      },
      h('span', { text: String(day) }),
      worst ? h('span', { class: 'calendar-dot', 'aria-hidden': 'true', text: worst.icon }) : null)
    );
  }

  host.append(grid);

  host.append(
    h(
      'div',
      { class: 'calendar-legend' },
      ...LEGEND.map(([level, label]) =>
        h(
          'span',
          { class: 'legend-item' },
          h('span', { class: `legend-swatch lvl-${level}`, 'aria-hidden': 'true' }),
          label
        )
      )
    )
  );
}
