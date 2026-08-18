/**
 * Zugangsdaten für das Supabase-Projekt.
 *
 * Solange beide Werte leer sind, läuft die Seite im Demo-Modus: alle Daten
 * liegen dann nur lokal im Browser (localStorage) und werden NICHT geteilt.
 * Sobald hier echte Werte stehen, schaltet die Seite automatisch auf Supabase um.
 *
 * Beide Werte findest du in Supabase unter:
 *   Project Settings → API  →  "Project URL" und "anon public"
 *
 * Der anon-Key ist für den Einsatz im Browser gedacht und darf öffentlich sein.
 * Geschützt wird nicht der Key, sondern die Datenbank: Schreibrechte hat `anon`
 * keine — jede Änderung läuft über Datenbankfunktionen, die Passwort bzw. PIN
 * serverseitig prüfen (siehe supabase/schema.sql).
 */

export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

/** Bucket im Supabase-Storage für die Lost-&-Found-Bilder. */
export const STORAGE_BUCKET = 'lostfound';

/** Wie weit im Voraus Standardtermine angelegt werden. */
export const MONTHS_AHEAD = 12;
