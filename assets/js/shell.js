/** Gemeinsame Kopfzeile, Demo-Hinweis und verständliche Fehlerausgabe. */

import { api, isConfigured, isDemoForced } from './api.js';
import { mountAuthButton } from './auth.js';
import { $, h } from './ui.js';

export function mountShell() {
  const button = $('#authBtn');
  if (button) mountAuthButton(button);

  const host = $('#demoBanner');
  if (!host || !api.isDemo) return;

  const s = api.demoSecrets;
  const zugangsdaten = `Passwort „${s.admin}“, PINs Chris ${s.chris}, Jan ${s.jan}, JanS ${s.jans}.`;

  host.append(
    isDemoForced
      ? h(
          'div',
          { class: 'banner banner-demo' },
          h('strong', { text: 'Demo-Modus — nur auf diesem Gerät.' }),
          h('span', {
            text:
              'Änderungen hier berühren die echten Vereinsdaten nicht. ' +
              'Für den Normalbetrieb die Seite ohne „?demo=1“ aufrufen. ',
          }),
          h('span', { text: zugangsdaten })
        )
      : h(
          'div',
          { class: 'banner banner-demo' },
          h('strong', { text: 'Demo-Modus — die Daten bleiben nur auf diesem Gerät.' }),
          h('span', {
            text:
              'Trage in assets/js/config.js die Supabase-Zugangsdaten ein, damit alle ' +
              'dieselben Termine sehen. Zum Ausprobieren: ',
          }),
          h('span', { text: zugangsdaten })
        )
  );
}

/**
 * Übersetzt die typischen Fehlerlagen in eine Aussage, mit der man etwas
 * anfangen kann. Roh durchgereichte PostgREST-Meldungen wie
 * `relation "public.trainers" does not exist` helfen niemandem weiter.
 *
 * @returns {{title: string, hint: string}}
 */
export function describeLoadError(err) {
  const text = String(err?.message || err || '');

  if (/relation .* does not exist|schema cache|PGRST\d+/i.test(text)) {
    return {
      title: 'Die Datenbank ist noch nicht eingerichtet.',
      hint:
        'Im Supabase-Projekt zuerst supabase/schema.sql und danach supabase/seed.sql ' +
        'im SQL-Editor ausführen. Die Anleitung dazu steht im README.',
    };
  }

  if (/failed to fetch|networkerror|load failed|fetch|ERR_/i.test(text)) {
    return {
      title: 'Keine Verbindung zum Supabase-Projekt.',
      hint:
        'Prüfe die Internetverbindung sowie SUPABASE_URL und SUPABASE_KEY in ' +
        'assets/js/config.js. Zum Weiterarbeiten ohne Verbindung die Seite mit ' +
        '„?demo=1“ aufrufen.',
    };
  }

  if (/invalid api key|jwt|unauthorized|401|403/i.test(text)) {
    return {
      title: 'Der Zugangsschlüssel wird abgelehnt.',
      hint:
        'In Supabase unter Project Settings → API den Publishable key prüfen und ' +
        'in assets/js/config.js eintragen.',
    };
  }

  return { title: 'Daten konnten nicht geladen werden.', hint: text };
}

/** Einheitliche Fehlerausgabe für fehlgeschlagenes Laden. */
export function renderLoadError(host, err) {
  const { title, hint } = describeLoadError(err);
  host.replaceChildren(
    h(
      'div',
      { class: 'empty' },
      h('div', { class: 'empty-icon', 'aria-hidden': 'true', text: '⚠️' }),
      h('p', { class: 'empty-title', text: title }),
      h('p', { class: 'muted', text: hint }),
      !isConfigured
        ? null
        : h('p', { class: 'small muted', text: `Technische Meldung: ${err?.message || err}` })
    )
  );
}

/** Hinweis, wenn das Schema steht, aber seed.sql noch nicht gelaufen ist. */
export function renderSetupHint(host) {
  host.replaceChildren(
    h(
      'div',
      { class: 'empty' },
      h('div', { class: 'empty-icon', 'aria-hidden': 'true', text: '🗄️' }),
      h('p', { class: 'empty-title', text: 'Es sind noch keine Trainer angelegt.' }),
      h('p', {
        class: 'muted',
        text:
          'Führe supabase/seed.sql im SQL-Editor des Supabase-Projekts aus — dort ' +
          'werden Chris, Jan und JanS sowie Passwort und PINs gesetzt.',
      })
    )
  );
}
