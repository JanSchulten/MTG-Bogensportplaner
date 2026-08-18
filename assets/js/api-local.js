/**
 * Demo-Backend: hält alle Daten in localStorage.
 *
 * Zweck ist ausschließlich das Ausprobieren der Seite, solange Supabase noch
 * nicht eingerichtet ist. Die Daten bleiben auf diesem Gerät — Trainer sehen
 * die Eintragungen der anderen NICHT. Die Passwortprüfung findet hier im
 * Browser statt und ist damit kein echter Schutz; im Supabase-Backend prüft
 * die Datenbank.
 */

import { TRAINERS, missingRecurring } from './appointments.js';

const KEY = 'mtg-demo-v1';

/** Nur für den Demo-Modus. Die echten Geheimnisse liegen in Supabase. */
const DEMO_SECRETS = {
  admin: 'RobinHood',
  chris: '1111',
  jan: '2222',
  jans: '3333',
};

const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);

function emptyDb() {
  return {
    appointments: [],
    attendance: [],
    news: [
      {
        id: uid(),
        title: 'Willkommen im Bogensportplaner',
        body:
          'Hier siehst du alle Trainingstermine. Trage dich als Trainer mit deiner PIN ' +
          'bei „Bin da“ oder „Bin nicht da“ ein.\n\n' +
          'Dieser Eintrag stammt aus dem Demo-Modus und verschwindet, sobald Supabase ' +
          'eingerichtet ist.',
        pinned: true,
        created_at: new Date().toISOString(),
      },
    ],
    lost_found: [],
    videos: [],
    settings: {},
    images: {},
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...emptyDb(), ...JSON.parse(raw) };
  } catch {
    /* beschädigte Daten -> frisch anfangen */
  }
  return emptyDb();
}

let db = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    throw new Error('Der lokale Speicher ist voll. Bitte ältere Bilder löschen.');
  }
}

function checkSecret(role, secret) {
  if (!secret || DEMO_SECRETS[role] !== secret) {
    throw new Error(role === 'admin' ? 'Falsches Passwort.' : 'Falsche PIN.');
  }
}

const clone = (v) => JSON.parse(JSON.stringify(v));

export const localApi = {
  isDemo: true,

  /** Zugangsdaten des Demo-Modus, damit das Hinweisbanner sie anzeigen kann. */
  demoSecrets: DEMO_SECRETS,

  async verifySecret(role, secret) {
    await new Promise((r) => setTimeout(r, 150));
    return DEMO_SECRETS[role] === secret;
  },

  async listTrainers() {
    return clone(TRAINERS);
  },

  async ensureAppointments(fromISO, untilISO) {
    const fresh = missingRecurring(db.appointments, fromISO, untilISO);
    if (fresh.length === 0) return 0;
    const defaults = db.settings.default_location || {};
    for (const a of fresh) {
      db.appointments.push({
        id: uid(),
        ...a,
        location: defaults.name || null,
        lat: defaults.lat ?? null,
        lon: defaults.lon ?? null,
        note: null,
        cancelled: false,
      });
    }
    save();
    return fresh.length;
  },

  async listAppointments(fromISO, toISO) {
    return clone(db.appointments.filter((a) => a.date >= fromISO && a.date <= toISO));
  },

  async listAttendance(fromISO, toISO) {
    const ids = new Set(
      db.appointments.filter((a) => a.date >= fromISO && a.date <= toISO).map((a) => a.id)
    );
    return clone(db.attendance.filter((a) => ids.has(a.appointment_id)));
  },

  async setAttendance(appointmentId, trainerId, status, pin) {
    checkSecret(trainerId, pin);
    const existing = db.attendance.find(
      (a) => a.appointment_id === appointmentId && a.trainer_id === trainerId
    );
    if (status === null) {
      db.attendance = db.attendance.filter((a) => a !== existing);
    } else if (existing) {
      existing.status = status;
      existing.updated_at = new Date().toISOString();
    } else {
      db.attendance.push({
        appointment_id: appointmentId,
        trainer_id: trainerId,
        status,
        updated_at: new Date().toISOString(),
      });
    }
    save();
  },

  async saveAppointment(appt, password) {
    checkSecret('admin', password);
    if (appt.id) {
      const idx = db.appointments.findIndex((a) => a.id === appt.id);
      if (idx === -1) throw new Error('Termin nicht gefunden.');
      db.appointments[idx] = { ...db.appointments[idx], ...appt };
      save();
      return clone(db.appointments[idx]);
    }
    const created = { id: uid(), cancelled: false, is_custom: true, ...appt };
    db.appointments.push(created);
    save();
    return clone(created);
  },

  async deleteAppointment(id, password) {
    checkSecret('admin', password);
    db.appointments = db.appointments.filter((a) => a.id !== id);
    db.attendance = db.attendance.filter((a) => a.appointment_id !== id);
    save();
  },

  async listNews() {
    return clone(
      [...db.news].sort((a, b) =>
        a.pinned !== b.pinned ? (a.pinned ? -1 : 1) : b.created_at.localeCompare(a.created_at)
      )
    );
  },

  async saveNews(item, password) {
    checkSecret('admin', password);
    if (item.id) {
      const idx = db.news.findIndex((n) => n.id === item.id);
      if (idx === -1) throw new Error('Eintrag nicht gefunden.');
      db.news[idx] = { ...db.news[idx], ...item };
    } else {
      db.news.push({ id: uid(), created_at: new Date().toISOString(), pinned: false, ...item });
    }
    save();
  },

  async deleteNews(id, password) {
    checkSecret('admin', password);
    db.news = db.news.filter((n) => n.id !== id);
    save();
  },

  async listLostFound() {
    return clone(
      [...db.lost_found].sort((a, b) =>
        a.resolved !== b.resolved
          ? (a.resolved ? 1 : -1)
          : b.created_at.localeCompare(a.created_at)
      )
    ).map((i) => ({ ...i, image_url: i.image_path ? db.images[i.image_path] || null : null }));
  },

  async uploadImage(blob) {
    const path = `demo/${uid()}.jpg`;
    const dataUrl = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(new Error('Bild konnte nicht gelesen werden.'));
      fr.readAsDataURL(blob);
    });
    db.images[path] = dataUrl;
    save();
    return { path, url: dataUrl };
  },

  async saveLostFound(item) {
    if (item.id) {
      const idx = db.lost_found.findIndex((i) => i.id === item.id);
      if (idx === -1) throw new Error('Eintrag nicht gefunden.');
      db.lost_found[idx] = { ...db.lost_found[idx], ...item };
    } else {
      db.lost_found.push({
        id: uid(),
        created_at: new Date().toISOString(),
        resolved: false,
        ...item,
      });
    }
    save();
  },

  async setLostFoundResolved(id, resolved, password) {
    checkSecret('admin', password);
    const item = db.lost_found.find((i) => i.id === id);
    if (!item) throw new Error('Eintrag nicht gefunden.');
    item.resolved = resolved;
    save();
  },

  async deleteLostFound(id, password) {
    checkSecret('admin', password);
    const item = db.lost_found.find((i) => i.id === id);
    if (item?.image_path) delete db.images[item.image_path];
    db.lost_found = db.lost_found.filter((i) => i.id !== id);
    save();
  },

  async listVideos() {
    return clone([...db.videos].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)));
  },

  async saveVideo(item, password) {
    checkSecret('admin', password);
    if (item.id) {
      const idx = db.videos.findIndex((v) => v.id === item.id);
      if (idx === -1) throw new Error('Video nicht gefunden.');
      db.videos[idx] = { ...db.videos[idx], ...item };
    } else {
      db.videos.push({
        id: uid(),
        created_at: new Date().toISOString(),
        sort: db.videos.length + 1,
        ...item,
      });
    }
    save();
  },

  async deleteVideo(id, password) {
    checkSecret('admin', password);
    db.videos = db.videos.filter((v) => v.id !== id);
    save();
  },

  async getSettings() {
    return clone(db.settings);
  },

  async saveSetting(key, value, password) {
    checkSecret('admin', password);
    db.settings[key] = value;
    save();
  },

  /** Nur im Demo-Modus: alles zurücksetzen. */
  async resetDemo() {
    db = emptyDb();
    save();
  },
};
