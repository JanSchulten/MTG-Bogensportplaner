/**
 * Zugangsdaten für das Supabase-Projekt.
 *
 * Solange SUPABASE_URL leer ist, läuft die Seite im Demo-Modus: alle Daten
 * liegen dann nur lokal im Browser (localStorage) und werden NICHT geteilt.
 * Sobald hier eine Projekt-URL steht, schaltet die Seite automatisch auf
 * Supabase um.
 *
 * Beide Werte stehen in Supabase unter  Project Settings → API:
 *   Project URL      -> SUPABASE_URL      (z. B. https://abcdefgh.supabase.co)
 *   Publishable key  -> SUPABASE_KEY      (beginnt mit sb_publishable_)
 *
 * Der Publishable key ist für den Einsatz im Browser gedacht und darf
 * öffentlich sein. Geschützt wird nicht der Schlüssel, sondern die Datenbank:
 * Schreibrechte hat der öffentliche Zugang keine — jede Änderung läuft über
 * Datenbankfunktionen, die Passwort bzw. PIN serverseitig prüfen
 * (siehe supabase/schema.sql).
 */

// TODO: Projekt-URL eintragen, dann ist die Einrichtung abgeschlossen.
export const SUPABASE_URL = '';

export const SUPABASE_KEY = 'sb_publishable_LYpssl-5syTEc9cHGTxcnQ_-CdCeIct';

/** Bucket im Supabase-Storage für die Lost-&-Found-Bilder. */
export const STORAGE_BUCKET = 'lostfound';

/** Wie weit im Voraus Standardtermine angelegt werden. */
export const MONTHS_AHEAD = 12;
