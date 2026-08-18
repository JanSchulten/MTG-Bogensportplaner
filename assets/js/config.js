/**
 * Zugangsdaten für das Supabase-Projekt.
 *
 * Steht hier eine Projekt-URL, arbeitet die Seite gegen Supabase und alle
 * sehen denselben Stand. Ist SUPABASE_URL leer, läuft sie im Demo-Modus mit
 * localStorage — die Daten bleiben dann auf dem jeweiligen Gerät.
 *
 * Zum gefahrlosen Ausprobieren lässt sich der Demo-Modus jederzeit mit
 * ?demo=1 in der Adresszeile erzwingen, ohne diese Datei zu ändern.
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

export const SUPABASE_URL = 'https://ipikdpqeismkbzbpnjlp.supabase.co';

export const SUPABASE_KEY = 'sb_publishable_LYpssl-5syTEc9cHGTxcnQ_-CdCeIct';

/** Bucket im Supabase-Storage für die Lost-&-Found-Bilder. */
export const STORAGE_BUCKET = 'lostfound';

/** Wie weit im Voraus Standardtermine angelegt werden. */
export const MONTHS_AHEAD = 12;
