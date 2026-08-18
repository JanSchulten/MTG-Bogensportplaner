/** Gemeinsame Kopfzeile: Anmelde-Schaltfläche und Hinweis auf den Demo-Modus. */

import { api } from './api.js';
import { mountAuthButton } from './auth.js';
import { $, h } from './ui.js';

export function mountShell() {
  const button = $('#authBtn');
  if (button) mountAuthButton(button);

  const host = $('#demoBanner');
  if (host && api.isDemo) {
    const s = api.demoSecrets;
    host.append(
      h(
        'div',
        { class: 'banner banner-demo' },
        h('strong', { text: 'Demo-Modus — die Daten bleiben nur auf diesem Gerät.' }),
        h('span', {
          text:
            'Trage in assets/js/config.js die Supabase-Zugangsdaten ein, damit alle ' +
            'dieselben Termine sehen. Zum Ausprobieren: ',
        }),
        h('span', {
          text: `Passwort „${s.admin}“, PINs Chris ${s.chris}, Jan ${s.jan}, JanS ${s.jans}.`,
        })
      )
    );
  }
}

/** Einheitliche Fehlerausgabe für fehlgeschlagenes Laden. */
export function renderLoadError(host, err) {
  host.replaceChildren(
    h(
      'div',
      { class: 'empty' },
      h('div', { class: 'empty-icon', text: '⚠️' }),
      h('p', { class: 'empty-title', text: 'Daten konnten nicht geladen werden.' }),
      h('p', { class: 'muted', text: err.message || String(err) })
    )
  );
}
