/** News-Dashboard — lesen für alle, pflegen mit dem Verwaltungspasswort. */

import { api } from './api.js';
import { ADMIN, isAuthed, onAuthChange, requireAdmin, withSecret } from './auth.js';
import { mountShell, renderLoadError } from './shell.js';
import {
  $, h, clear, field, openDialog, confirmDialog, toast, emptyState, fmtDateShort,
} from './ui.js';

let items = [];

function newsForm(item = {}) {
  const title = h('input', { class: 'input', name: 'title', required: true, maxlength: '120', value: item.title || '' });
  const body = h('textarea', { class: 'textarea', name: 'body', required: true, placeholder: 'Was gibt es Neues?' }, item.body || '');
  const pinned = h('input', { type: 'checkbox', name: 'pinned', ...(item.pinned ? { checked: true } : {}) });

  return {
    body: [
      field('Überschrift', title),
      field('Text', body),
      h('label', { class: 'checkbox-row' }, pinned, h('span', { text: 'Oben anheften' })),
    ],
    read: () => ({
      ...(item.id ? { id: item.id } : {}),
      title: title.value.trim(),
      body: body.value.trim(),
      pinned: pinned.checked,
    }),
  };
}

async function edit(item) {
  const isNew = !item;
  if (isNew && !(await requireAdmin('Zum Anlegen einer News wird das Passwort gebraucht.'))) return;

  const form = newsForm(item || {});
  const saved = await openDialog({
    title: isNew ? 'Neue News' : 'News bearbeiten',
    body: form.body,
    actions: [
      { label: 'Abbrechen', value: null },
      { label: isNew ? 'Veröffentlichen' : 'Speichern', value: 'save', variant: 'primary', type: 'submit' },
    ],
    onSubmit: async () => {
      const data = form.read();
      const result = await withSecret(ADMIN, (pw) => api.saveNews(data, pw));
      return result.cancelled ? false : true;
    },
  });
  if (saved) await load(isNew ? 'News veröffentlicht.' : 'News gespeichert.');
}

async function remove(item) {
  if (!(await confirmDialog('News löschen?', `„${item.title}“ wird endgültig entfernt.`))) return;
  const result = await withSecret(ADMIN, (pw) => api.deleteNews(item.id, pw)).catch((err) => {
    toast(err.message, 'error');
    return { failed: true };
  });
  if (result.cancelled || result.failed) return;
  await load('News gelöscht.');
}

function tile(item) {
  return h(
    'article',
    { class: 'tile' },
    h(
      'div',
      { class: 'tile-body' },
      h(
        'div',
        { class: 'tile-meta' },
        item.pinned ? h('span', { class: 'badge', text: '📌 Angeheftet' }) : null,
        h('span', { text: fmtDateShort(String(item.created_at).slice(0, 10)) })
      ),
      h('h2', { class: 'tile-title', text: item.title }),
      h('p', { class: 'tile-text', text: item.body })
    ),
    isAuthed(ADMIN)
      ? h(
          'div',
          { class: 'tile-actions' },
          h('button', { class: 'btn btn-small', type: 'button', text: 'Bearbeiten', on: { click: () => edit(item) } }),
          h('button', { class: 'btn btn-small btn-danger', type: 'button', text: 'Löschen', on: { click: () => remove(item) } })
        )
      : null
  );
}

function render() {
  const list = clear($('#newsList'));
  if (items.length === 0) {
    list.append(emptyState('📰', 'Noch keine News', 'Mit dem Verwaltungspasswort kannst du den ersten Eintrag anlegen.'));
  } else {
    for (const item of items) list.append(tile(item));
  }

  const actions = clear($('#pageActions'));
  actions.append(
    isAuthed(ADMIN)
      ? h('button', { class: 'btn btn-primary', type: 'button', text: 'Neue News', on: { click: () => edit(null) } })
      : h('button', {
          class: 'btn', type: 'button', text: 'News pflegen',
          on: { click: async () => { if (await requireAdmin()) render(); } },
        })
  );
}

async function load(message) {
  items = await api.listNews();
  render();
  if (message) toast(message, 'success');
}

async function init() {
  mountShell();
  onAuthChange(render);
  try {
    await load();
  } catch (err) {
    renderLoadError($('#newsList'), err);
  }
}

init();
