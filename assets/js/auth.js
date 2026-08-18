/**
 * Anmeldung für Verwaltung (Passwort) und Trainer (PIN).
 *
 * Mehrere Rollen können gleichzeitig angemeldet sein — wer als Chris
 * eingetragen ist, verliert das nicht, wenn Jan sich kurz einträgt.
 *
 * Das Geheimnis liegt für die Dauer der Sitzung im sessionStorage, weil jede
 * schreibende Aktion es erneut mitschicken muss. Geprüft wird es serverseitig
 * in der Datenbank; hier findet keine Zugriffsentscheidung statt.
 */

import { api } from './api.js';
import { TRAINERS } from './appointments.js';
import { h, field, openDialog, toast } from './ui.js';

const STORE_KEY = 'mtg-auth-v1';
const TTL_MS = 8 * 60 * 60 * 1000;

export const ADMIN = 'admin';

export const ROLES = [
  { id: ADMIN, label: 'Verwaltung', secretLabel: 'Passwort', kind: 'password' },
  ...TRAINERS.map((t) => ({ id: t.id, label: t.name, secretLabel: 'PIN', kind: 'pin' })),
];

export const roleLabel = (role) => ROLES.find((r) => r.id === role)?.label || role;

const listeners = new Set();
export function onAuthChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = () => listeners.forEach((fn) => fn());

function readStore() {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const store = JSON.parse(raw);
    const now = Date.now();
    let changed = false;
    for (const [role, entry] of Object.entries(store)) {
      if (!entry || entry.exp < now) {
        delete store[role];
        changed = true;
      }
    }
    if (changed) writeStore(store);
    return store;
  } catch {
    return {};
  }
}

function writeStore(store) {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* privater Modus o. Ä. — dann eben nur für diese Seite */
  }
}

export const getSecret = (role) => readStore()[role]?.secret ?? null;
export const isAuthed = (role) => Boolean(getSecret(role));
export const authedRoles = () => Object.keys(readStore());

function remember(role, secret) {
  const store = readStore();
  store[role] = { secret, exp: Date.now() + TTL_MS };
  writeStore(store);
  notify();
}

export function logout(role) {
  const store = readStore();
  if (role) delete store[role];
  else for (const key of Object.keys(store)) delete store[key];
  writeStore(store);
  notify();
}

/**
 * Liefert das Geheimnis der Rolle — fragt es bei Bedarf ab und prüft es.
 * @returns {Promise<string|null>} null, wenn abgebrochen wurde
 */
export async function requireSecret(role, reason) {
  const known = getSecret(role);
  if (known) return known;

  const meta = ROLES.find((r) => r.id === role) || { label: role, secretLabel: 'Passwort', kind: 'password' };
  const input = h('input', {
    class: 'input',
    type: 'password',
    name: 'secret',
    required: true,
    autocomplete: 'current-password',
    inputmode: meta.kind === 'pin' ? 'numeric' : 'text',
    placeholder: meta.kind === 'pin' ? '••••' : 'Passwort',
  });

  const result = await openDialog({
    title: meta.id === ADMIN ? 'Verwaltung anmelden' : `Anmelden als ${meta.label}`,
    body: [
      reason ? h('p', { class: 'muted', text: reason }) : null,
      field(meta.secretLabel, input),
    ],
    actions: [
      { label: 'Abbrechen', value: null },
      { label: 'Anmelden', value: 'ok', variant: 'primary', type: 'submit' },
    ],
    onSubmit: async () => {
      const secret = input.value;
      const ok = await api.verifySecret(role, secret);
      if (!ok) throw new Error(meta.kind === 'pin' ? 'Falsche PIN.' : 'Falsches Passwort.');
      remember(role, secret);
      return { secret };
    },
  });

  if (result && typeof result === 'object' && result.secret) {
    toast(`Angemeldet als ${meta.label}.`, 'success');
    return result.secret;
  }
  return null;
}

/** Kurzform für Verwaltungsaktionen. */
export const requireAdmin = (reason) => requireSecret(ADMIN, reason);

/**
 * Führt `action(secret)` aus und wiederholt die Abfrage, falls das
 * gespeicherte Geheimnis inzwischen ungültig ist (z. B. Passwort geändert).
 */
export async function withSecret(role, action, reason) {
  let secret = await requireSecret(role, reason);
  if (!secret) return { cancelled: true };
  try {
    return { value: await action(secret) };
  } catch (err) {
    if (/passwort|pin/i.test(err.message || '')) {
      logout(role);
      secret = await requireSecret(role, err.message);
      if (!secret) return { cancelled: true };
      return { value: await action(secret) };
    }
    throw err;
  }
}

/* ------------------------------------------------------- Kopfzeilen-Element */

export function mountAuthButton(button) {
  const render = () => {
    const roles = authedRoles();
    button.textContent = roles.length
      ? `Angemeldet: ${roles.map(roleLabel).join(', ')}`
      : 'Anmelden';
    button.classList.toggle('is-authed', roles.length > 0);
  };

  button.addEventListener('click', () => openAuthPanel());
  onAuthChange(render);
  render();
}

export async function openAuthPanel() {
  const list = h('ul', { class: 'auth-list' });

  const build = () => {
    list.replaceChildren(
      ...ROLES.map((role) => {
        const active = isAuthed(role.id);
        return h(
          'li',
          { class: `auth-row${active ? ' is-active' : ''}` },
          h(
            'div',
            { class: 'auth-row-main' },
            h('span', { class: 'auth-name', text: role.label }),
            h('span', {
              class: 'auth-state',
              text: active ? 'angemeldet' : role.id === ADMIN ? 'Passwort nötig' : 'PIN nötig',
            })
          ),
          h('button', {
            class: `btn btn-small ${active ? 'btn-ghost' : 'btn-primary'}`,
            type: 'button',
            text: active ? 'Abmelden' : 'Anmelden',
            on: {
              click: async () => {
                if (active) {
                  logout(role.id);
                  build();
                } else if (await requireSecret(role.id)) {
                  build();
                }
              },
            },
          })
        );
      })
    );
  };

  build();

  await openDialog({
    title: 'Anmeldung',
    body: [
      h('p', {
        class: 'muted',
        text:
          'Die Verwaltung darf Termine, News und Videos ändern. Trainer tragen mit ihrer ' +
          'PIN ein, ob sie bei einem Termin da sind.',
      }),
      list,
    ],
    actions: [{ label: 'Schließen', value: null }],
  });
}
