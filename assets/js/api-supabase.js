/**
 * Supabase-Backend — spricht die REST-Schnittstelle direkt per fetch an,
 * ohne Client-Bibliothek. Das hält die Seite abhängigkeitsfrei und ohne
 * Build-Schritt auf GitHub Pages lauffähig.
 *
 * Gelesen wird direkt aus den Tabellen (RLS erlaubt `anon` nur SELECT).
 * Geschrieben wird ausschließlich über Datenbankfunktionen, die Passwort
 * bzw. PIN serverseitig prüfen.
 */

import { SUPABASE_URL, SUPABASE_KEY, STORAGE_BUCKET } from './config.js';

const base = SUPABASE_URL.replace(/\/+$/, '');

const headers = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
});

async function readError(res, fallback) {
  try {
    const body = await res.json();
    return body.message || body.error_description || body.error || fallback;
  } catch {
    return fallback;
  }
}

async function select(table, query) {
  const res = await fetch(`${base}/rest/v1/${table}?${query}`, { headers: headers() });
  if (!res.ok) throw new Error(await readError(res, `Laden von „${table}“ fehlgeschlagen.`));
  return res.json();
}

async function rpc(fn, args) {
  const res = await fetch(`${base}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(await readError(res, 'Die Aktion konnte nicht ausgeführt werden.'));
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const publicUrl = (path) =>
  path ? `${base}/storage/v1/object/public/${STORAGE_BUCKET}/${path}` : null;

export const supabaseApi = {
  isDemo: false,

  async verifySecret(role, secret) {
    return rpc('verify_secret', { p_role: role, p_secret: secret });
  },

  async listTrainers() {
    return select('trainers', 'select=id,name,has_key,sort&order=sort.asc');
  },

  async ensureAppointments(fromISO, untilISO) {
    return rpc('ensure_appointments', { p_from: fromISO, p_until: untilISO });
  },

  async listAppointments(fromISO, toISO) {
    return select(
      'appointments',
      `select=*&date=gte.${fromISO}&date=lte.${toISO}&order=date.asc,start_time.asc`
    );
  },

  async listAttendance(fromISO, toISO) {
    // Ein Join über die View spart einen zweiten Rundlauf mit ID-Liste.
    return select(
      'attendance_in_range',
      `select=appointment_id,trainer_id,status,updated_at&date=gte.${fromISO}&date=lte.${toISO}`
    );
  },

  async setAttendance(appointmentId, trainerId, status, pin) {
    return rpc('set_attendance', {
      p_appointment: appointmentId,
      p_trainer: trainerId,
      p_status: status,
      p_pin: pin,
    });
  },

  async saveAppointment(appt, password) {
    return rpc('save_appointment', {
      p_id: appt.id ?? null,
      p_date: appt.date,
      p_start: appt.start_time,
      p_end: appt.end_time,
      p_location: appt.location ?? null,
      p_lat: appt.lat ?? null,
      p_lon: appt.lon ?? null,
      p_note: appt.note ?? null,
      p_cancelled: appt.cancelled ?? false,
      p_password: password,
    });
  },

  async deleteAppointment(id, password) {
    return rpc('delete_appointment', { p_id: id, p_password: password });
  },

  async listNews() {
    return select('news', 'select=*&order=pinned.desc,created_at.desc');
  },

  async saveNews(item, password) {
    return rpc('save_news', {
      p_id: item.id ?? null,
      p_title: item.title,
      p_body: item.body,
      p_pinned: item.pinned ?? false,
      p_password: password,
    });
  },

  async deleteNews(id, password) {
    return rpc('delete_news', { p_id: id, p_password: password });
  },

  async listLostFound() {
    const rows = await select('lost_found', 'select=*&order=resolved.asc,created_at.desc');
    return rows.map((r) => ({ ...r, image_url: publicUrl(r.image_path) }));
  },

  async uploadImage(blob) {
    const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.jpg`;
    const res = await fetch(`${base}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'image/jpeg',
        'x-upsert': 'false',
      },
      body: blob,
    });
    if (!res.ok) throw new Error(await readError(res, 'Bild konnte nicht hochgeladen werden.'));
    return { path, url: publicUrl(path) };
  },

  async saveLostFound(item) {
    return rpc('save_lost_found', {
      p_id: item.id ?? null,
      p_title: item.title,
      p_description: item.description ?? null,
      p_image_path: item.image_path ?? null,
      p_found_date: item.found_date ?? null,
    });
  },

  async setLostFoundResolved(id, resolved, password) {
    return rpc('set_lost_found_resolved', {
      p_id: id,
      p_resolved: resolved,
      p_password: password,
    });
  },

  async deleteLostFound(id, password) {
    return rpc('delete_lost_found', { p_id: id, p_password: password });
  },

  async listVideos() {
    return select('videos', 'select=*&order=sort.asc,created_at.asc');
  },

  async saveVideo(item, password) {
    return rpc('save_video', {
      p_id: item.id ?? null,
      p_title: item.title,
      p_youtube_id: item.youtube_id,
      p_description: item.description ?? null,
      p_sort: item.sort ?? null,
      p_password: password,
    });
  },

  async deleteVideo(id, password) {
    return rpc('delete_video', { p_id: id, p_password: password });
  },

  async getSettings() {
    const rows = await select('settings', 'select=key,value');
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  },

  async saveSetting(key, value, password) {
    return rpc('save_setting', { p_key: key, p_value: value, p_password: password });
  },
};
