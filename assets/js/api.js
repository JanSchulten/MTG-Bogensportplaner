/**
 * Wählt das Backend: Supabase, sobald in config.js eine Projekt-URL steht —
 * sonst der Demo-Modus im Browser. Beide bieten dieselbe Schnittstelle,
 * der restliche Code kennt den Unterschied nicht.
 *
 * Mit `?demo=1` in der Adresszeile lässt sich der Demo-Modus erzwingen, auch
 * wenn Supabase eingerichtet ist. Das ist der gefahrlose Weg zum Ausprobieren
 * und Vorführen: Änderungen bleiben dann auf dem eigenen Gerät und rühren die
 * echten Vereinsdaten nicht an. `?demo=0` schaltet zurück.
 */

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { localApi } from './api-local.js';
import { supabaseApi } from './api-supabase.js';

const DEMO_FLAG = 'mtg-force-demo';

/** Merkt die Wahl für die Sitzung, damit sie beim Seitenwechsel erhalten bleibt. */
function readDemoOverride() {
  let stored = null;
  try {
    stored = sessionStorage.getItem(DEMO_FLAG);
  } catch {
    /* privater Modus — dann gilt nur der Parameter dieser Seite */
  }

  let param = null;
  try {
    param = new URLSearchParams(location.search).get('demo');
  } catch {
    /* kein Browser-Kontext (z. B. Tests) */
  }

  if (param === null) return stored === '1';

  const forced = param !== '0' && param !== 'false';
  try {
    if (forced) sessionStorage.setItem(DEMO_FLAG, '1');
    else sessionStorage.removeItem(DEMO_FLAG);
  } catch {
    /* nicht schlimm: dann gilt die Wahl nur für diese Seite */
  }
  return forced;
}

export const isConfigured = Boolean(
  SUPABASE_URL && SUPABASE_KEY && SUPABASE_URL.startsWith('http')
);

/** true, wenn Supabase zwar eingerichtet ist, aber bewusst umgangen wird. */
export const isDemoForced = isConfigured && readDemoOverride();

export const api = isConfigured && !isDemoForced ? supabaseApi : localApi;
