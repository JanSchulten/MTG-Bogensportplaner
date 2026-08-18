/**
 * Wählt das Backend: Supabase, sobald in config.js Zugangsdaten stehen —
 * sonst der Demo-Modus im Browser. Beide bieten dieselbe Schnittstelle,
 * der restliche Code kennt den Unterschied nicht.
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { localApi } from './api-local.js';
import { supabaseApi } from './api-supabase.js';

export const isConfigured = Boolean(
  SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_URL.startsWith('http')
);

export const api = isConfigured ? supabaseApi : localApi;
