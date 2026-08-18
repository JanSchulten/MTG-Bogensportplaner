/** Startseite: Kalender, Terminliste, Trainer-Zusagen, Verwaltung. */

import { api } from './api.js';
import { MONTHS_AHEAD } from './config.js';
import {
  TRAINERS, STATUS_DA, STATUS_NICHT_DA,
  computeStatus, sortAppointments, toISODate,
} from './appointments.js';
import { renderCalendar } from './calendar.js';
import { placeField } from './place-field.js';
import { forecastForAppointments } from './weather.js';
import { ADMIN, isAuthed, onAuthChange, requireAdmin, withSecret } from './auth.js';
import { mountShell, renderLoadError } from './shell.js';
import {
  $, h, clear, field, openDialog, confirmDialog, toast,
  fmtDate, fmtTimeRange, fmtRelativeDay, emptyState,
} from './ui.js';

const UPCOMING_LIMIT = 8;

const state = {
  today: new Date(),
  month: new Date(),
  trainers: TRAINERS,
  appointments: [],
  attendance: new Map(), // Termin-ID -> [{trainer_id, status}]
  settings: {},
  weather: new Map(),
  showAll: false,
  range: { from: null, to: null },
  openCard: null, // { id, host } — Termindetails im Dialog, damit sie mitziehen
};

/* ------------------------------------------------------------------ Laden */

async function loadAll() {
  const today = state.today;
  const from = toISODate(new Date(today.getFullYear(), today.getMonth(), 1));
  const toDate = new Date(today.getFullYear(), today.getMonth() + MONTHS_AHEAD + 1, 0);
  const to = toISODate(toDate);
  state.range = { from, to };

  try {
    await api.ensureAppointments(from, to);
  } catch (err) {
    // Fehlende Standardtermine sind ärgerlich, aber kein Grund, gar nichts zu zeigen.
    toast(`Termine konnten nicht ergänzt werden: ${err.message}`, 'error');
  }

  const [trainers, appointments, attendance, settings] = await Promise.all([
    api.listTrainers(),
    api.listAppointments(from, to),
    api.listAttendance(from, to),
    api.getSettings(),
  ]);

  state.trainers = trainers?.length ? trainers : TRAINERS;
  state.appointments = sortAppointments(appointments);
  state.settings = settings || {};
  state.attendance = new Map();
  for (const row of attendance) {
    if (!state.attendance.has(row.appointment_id)) state.attendance.set(row.appointment_id, []);
    state.attendance.get(row.appointment_id).push(row);
  }
}

function statusOf(appt) {
  return computeStatus(appt, state.attendance.get(appt.id) || [], state.trainers);
}

async function loadWeather() {
  const visible = state.appointments.filter((a) => a.date >= toISODate(state.today)).slice(0, 40);
  if (visible.length === 0) return;
  state.weather = await forecastForAppointments(visible, state.today);
  render();
}

/* -------------------------------------------------------------- Wetterzeile */

function weatherNode(appt) {
  const entry = state.weather.get(appt.id);
  if (!entry) {
    return h('span', { class: 'meta-item weather muted', text: '🌡️ Wetter wird geladen …' });
  }
  if (entry.state === 'ok') {
    const w = entry.data;
    const parts = [`${w.tempMin}–${w.tempMax} °C`];
    if (w.precipMax != null) parts.push(`${w.precipMax} % Regen`);
    if (w.windMax != null) parts.push(`${w.windMax} km/h Wind`);
    return h(
      'span',
      { class: 'meta-item weather', title: `${w.text} während des Trainings` },
      h('span', { class: 'weather-icon', 'aria-hidden': 'true', text: w.icon }),
      h('span', { text: `${w.text}, ${parts.join(' · ')}` })
    );
  }
  const messages = {
    // Ein Ortsname allein reicht nicht — Open-Meteo braucht Koordinaten.
    'no-location': appt.location
      ? 'Ort ohne Koordinaten — im Bearbeiten-Dialog „Ort suchen“ nutzen'
      : 'Kein Ort hinterlegt — keine Vorhersage',
    'too-far': entry.message,
    unavailable: entry.message,
    error: `Wetter nicht abrufbar (${entry.message})`,
  };
  return h('span', {
    class: 'meta-item weather weather-missing muted',
    text: `🌡️ ${messages[entry.state] || 'Keine Vorhersage'}`,
  });
}

/* ------------------------------------------------------------- Terminkarte */

function trainerTile(appt, trainer) {
  const current = (state.attendance.get(appt.id) || [])
    .find((a) => a.trainer_id === trainer.id)?.status ?? null;

  const makeButton = (status, label) =>
    h('button', {
      class: 'btn btn-small',
      type: 'button',
      'aria-pressed': String(current === status),
      dataset: { status },
      text: label,
      on: { click: () => setAttendance(appt, trainer, current === status ? null : status) },
    });

  return h(
    'div',
    { class: 'trainer' },
    h(
      'div',
      { class: 'trainer-name' },
      h('span', { text: trainer.name }),
      trainer.has_key
        ? h('span', { class: 'trainer-key', title: 'hat einen Schlüssel', text: '🔑' })
        : null
    ),
    h('div', { class: 'trainer-buttons' }, makeButton(STATUS_DA, 'Bin da'), makeButton(STATUS_NICHT_DA, 'Bin nicht da'))
  );
}

async function setAttendance(appt, trainer, status) {
  const result = await withSecret(
    trainer.id,
    (pin) => api.setAttendance(appt.id, trainer.id, status, pin),
    `Zum Eintragen für ${trainer.name} wird die PIN gebraucht.`
  ).catch((err) => {
    toast(err.message, 'error');
    return { failed: true };
  });

  if (result.cancelled || result.failed) return;

  const list = state.attendance.get(appt.id) || [];
  const rest = list.filter((a) => a.trainer_id !== trainer.id);
  state.attendance.set(appt.id, status === null ? rest : [...rest, { appointment_id: appt.id, trainer_id: trainer.id, status }]);

  render();
  toast(
    status === null
      ? `${trainer.name}: Eintrag entfernt.`
      : `${trainer.name}: ${status === STATUS_DA ? 'ist da' : 'ist nicht da'}.`,
    'success'
  );
}

function appointmentCard(appt) {
  const status = statusOf(appt);
  const relative = fmtRelativeDay(appt.date, state.today);

  const card = h('article', {
    class: `appointment status-${status.level}${appt.cancelled ? ' is-cancelled' : ''}`,
    dataset: { id: appt.id },
  });

  card.append(h('div', { class: 'appointment-bar' }));

  card.append(
    h(
      'div',
      { class: 'appointment-head' },
      h(
        'div',
        { class: 'appointment-when' },
        h(
          'div',
          { class: 'appointment-date' },
          fmtDate(appt.date),
          relative ? h('span', { class: 'appointment-relative', text: relative }) : null
        ),
        h('div', { class: 'appointment-time', text: fmtTimeRange(appt.start_time, appt.end_time) })
      ),
      h(
        'span',
        { class: `status-pill lvl-${status.level}` },
        h('span', { 'aria-hidden': 'true', text: status.icon }),
        h('span', { text: status.label })
      )
    )
  );

  const meta = h('div', { class: 'appointment-meta' });
  meta.append(
    h('span', { class: 'meta-item', text: `📍 ${appt.location || 'Ort noch nicht festgelegt'}` }),
    weatherNode(appt),
    h('span', { class: 'meta-item', text: `👥 ${status.present.length}/${status.total} Trainer da` })
  );
  card.append(meta);

  if (appt.note) card.append(h('div', { class: 'appointment-note', text: appt.note }));
  card.append(h('p', { class: 'appointment-detail', text: status.detail }));

  if (!appt.cancelled) {
    const grid = h('div', { class: 'trainer-grid' });
    for (const trainer of state.trainers) grid.append(trainerTile(appt, trainer));
    card.append(grid);
  }

  if (isAuthed(ADMIN)) {
    card.append(
      h(
        'div',
        { class: 'appointment-admin' },
        h('button', {
          class: 'btn btn-small', type: 'button', text: 'Bearbeiten',
          on: { click: () => editAppointment(appt) },
        }),
        h('button', {
          class: 'btn btn-small', type: 'button',
          text: appt.cancelled ? 'Wieder ansetzen' : 'Absagen',
          on: { click: () => toggleCancelled(appt) },
        }),
        appt.is_custom
          ? h('button', {
              class: 'btn btn-small btn-danger', type: 'button', text: 'Löschen',
              on: { click: () => removeAppointment(appt) },
            })
          : null
      )
    );
  }

  return card;
}

/* ------------------------------------------------------------- Verwaltung */

function appointmentForm(appt = {}) {
  const dateInput = h('input', { class: 'input', type: 'date', name: 'date', required: true, value: appt.date || '' });
  const startInput = h('input', { class: 'input', type: 'time', name: 'start', required: true, value: (appt.start_time || '16:00').slice(0, 5) });
  const endInput = h('input', { class: 'input', type: 'time', name: 'end', required: true, value: (appt.end_time || '19:00').slice(0, 5) });
  const noteInput = h('textarea', { class: 'textarea', name: 'note', placeholder: 'z. B. Materialausgabe, Anfängerkurs, Vereinsmeisterschaft' }, appt.note || '');
  const cancelledInput = h('input', { type: 'checkbox', name: 'cancelled', ...(appt.cancelled ? { checked: true } : {}) });

  const defaults = state.settings.default_location || {};
  const place = placeField({
    location: appt.location ?? defaults.name ?? '',
    lat: appt.lat ?? defaults.lat ?? null,
    lon: appt.lon ?? defaults.lon ?? null,
  });

  const body = [
    field('Datum', dateInput),
    h('div', { class: 'field-row' }, field('Beginn', startInput), field('Ende', endInput)),
    place.node,
    field('Notiz', noteInput),
    h('label', { class: 'checkbox-row' }, cancelledInput, h('span', { text: 'Termin ist abgesagt' })),
  ];

  const read = () => {
    if (startInput.value >= endInput.value) throw new Error('Das Ende muss nach dem Beginn liegen.');
    return {
      ...(appt.id ? { id: appt.id } : {}),
      date: dateInput.value,
      start_time: startInput.value,
      end_time: endInput.value,
      note: noteInput.value.trim() || null,
      cancelled: cancelledInput.checked,
      ...place.getValue(),
    };
  };

  return { body, read };
}

async function editAppointment(appt) {
  const form = appointmentForm(appt);
  const saved = await openDialog({
    title: 'Termin bearbeiten',
    wide: true,
    body: form.body,
    actions: [
      { label: 'Abbrechen', value: null },
      { label: 'Speichern', value: 'save', variant: 'primary', type: 'submit' },
    ],
    onSubmit: async () => {
      const data = form.read();
      const result = await withSecret(ADMIN, (pw) => api.saveAppointment(data, pw));
      if (result.cancelled) return false;
      return true;
    },
  });
  if (saved) await reload('Termin gespeichert.');
}

async function createAppointment() {
  if (!(await requireAdmin('Zum Anlegen eines Sondertermins wird das Passwort gebraucht.'))) return;
  const form = appointmentForm({ date: toISODate(state.today), start_time: '16:00', end_time: '19:00' });
  const saved = await openDialog({
    title: 'Sondertermin anlegen',
    wide: true,
    body: form.body,
    actions: [
      { label: 'Abbrechen', value: null },
      { label: 'Anlegen', value: 'save', variant: 'primary', type: 'submit' },
    ],
    onSubmit: async () => {
      const data = { ...form.read(), is_custom: true };
      const result = await withSecret(ADMIN, (pw) => api.saveAppointment(data, pw));
      if (result.cancelled) return false;
      return true;
    },
  });
  if (saved) await reload('Sondertermin angelegt.');
}

async function toggleCancelled(appt) {
  const result = await withSecret(ADMIN, (pw) =>
    api.saveAppointment({ ...appt, cancelled: !appt.cancelled }, pw)
  ).catch((err) => {
    toast(err.message, 'error');
    return { failed: true };
  });
  if (result.cancelled || result.failed) return;
  await reload(appt.cancelled ? 'Termin wieder angesetzt.' : 'Termin abgesagt.');
}

async function removeAppointment(appt) {
  const ok = await confirmDialog(
    'Termin löschen?',
    `${fmtDate(appt.date)} — der Termin und alle Rückmeldungen werden entfernt.`
  );
  if (!ok) return;
  const result = await withSecret(ADMIN, (pw) => api.deleteAppointment(appt.id, pw)).catch((err) => {
    toast(err.message, 'error');
    return { failed: true };
  });
  if (result.cancelled || result.failed) return;
  await reload('Termin gelöscht.');
}

async function editDefaultLocation() {
  if (!(await requireAdmin('Zum Ändern des Standardorts wird das Passwort gebraucht.'))) return;
  const current = state.settings.default_location || {};
  const place = placeField({ location: current.name, lat: current.lat, lon: current.lon });
  const applyAll = h('input', { type: 'checkbox', name: 'applyAll' });

  const saved = await openDialog({
    title: 'Standard-Trainingsort',
    wide: true,
    body: [
      h('p', {
        class: 'muted',
        text: 'Dieser Ort wird für neu angelegte Termine verwendet und liefert die Wettervorhersage.',
      }),
      place.node,
      h(
        'label',
        { class: 'checkbox-row' },
        applyAll,
        h('span', { text: 'Auch auf alle künftigen Termine ohne eigenen Ort anwenden' })
      ),
    ],
    actions: [
      { label: 'Abbrechen', value: null },
      { label: 'Speichern', value: 'save', variant: 'primary', type: 'submit' },
    ],
    onSubmit: async () => {
      const { location, lat, lon } = place.getValue();
      if (!location) throw new Error('Bitte einen Ortsnamen eingeben.');
      const result = await withSecret(ADMIN, async (pw) => {
        await api.saveSetting('default_location', { name: location, lat, lon }, pw);
        if (applyAll.checked) {
          const todayISO = toISODate(state.today);
          const targets = state.appointments.filter((a) => a.date >= todayISO && !a.location);
          for (const appt of targets) {
            await api.saveAppointment({ ...appt, location, lat, lon }, pw);
          }
        }
      });
      if (result.cancelled) return false;
      return true;
    },
  });
  if (saved) await reload('Standardort gespeichert.');
}

/* --------------------------------------------------------------- Rendering */

function openAppointmentDialog(appt) {
  // Eigener Wirt, damit render() den Inhalt des offenen Dialogs mit auffrischt.
  const host = h('div', {}, appointmentCard(appt));
  state.openCard = { id: appt.id, host };

  openDialog({
    title: fmtDate(appt.date),
    wide: true,
    body: host,
    actions: [{ label: 'Schließen', value: null }],
  }).finally(() => {
    state.openCard = null;
  });
}

function render() {
  const byDate = new Map();
  const statusById = new Map();
  for (const appt of state.appointments) {
    if (!byDate.has(appt.date)) byDate.set(appt.date, []);
    byDate.get(appt.date).push(appt);
    statusById.set(appt.id, statusOf(appt));
  }

  renderCalendar($('#calendar'), {
    month: state.month,
    byDate,
    statusById,
    today: state.today,
    onSelect: openAppointmentDialog,
    onMonthChange: (month) => {
      state.month = month;
      render();
    },
  });

  const todayISO = toISODate(state.today);
  const upcoming = state.appointments.filter((a) => a.date >= todayISO);
  const shown = state.showAll ? upcoming : upcoming.slice(0, UPCOMING_LIMIT);

  const list = clear($('#appointments'));
  if (shown.length === 0) {
    list.append(emptyState('📅', 'Keine kommenden Termine', 'Standardtermine werden automatisch angelegt.'));
  } else {
    for (const appt of shown) list.append(appointmentCard(appt));
  }

  const more = clear($('#listActions'));
  if (upcoming.length > UPCOMING_LIMIT) {
    more.append(
      h('button', {
        class: 'btn btn-small', type: 'button',
        text: state.showAll ? 'Weniger anzeigen' : `Alle ${upcoming.length} Termine anzeigen`,
        on: {
          click: () => {
            state.showAll = !state.showAll;
            render();
          },
        },
      })
    );
  }

  if (state.openCard) {
    const current = state.appointments.find((a) => a.id === state.openCard.id);
    state.openCard.host.replaceChildren(
      current ? appointmentCard(current) : h('p', { class: 'muted', text: 'Termin gelöscht.' })
    );
  }

  const actions = clear($('#pageActions'));
  if (isAuthed(ADMIN)) {
    actions.append(
      h('button', { class: 'btn btn-primary', type: 'button', text: 'Sondertermin', on: { click: createAppointment } }),
      h('button', { class: 'btn', type: 'button', text: 'Standardort', on: { click: editDefaultLocation } })
    );
  } else {
    actions.append(
      h('button', {
        class: 'btn', type: 'button', text: 'Termine verwalten',
        on: { click: async () => { if (await requireAdmin()) render(); } },
      })
    );
  }
}

async function reload(message) {
  await loadAll();
  render();
  if (message) toast(message, 'success');
  loadWeather();
}

/* ------------------------------------------------------------------- Start */

async function init() {
  mountShell();
  onAuthChange(render);
  try {
    await loadAll();
  } catch (err) {
    renderLoadError($('#appointments'), err);
    return;
  }
  render();
  loadWeather();
}

init();
