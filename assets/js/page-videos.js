/** Sammlung nützlicher YouTube-Videos — pflegbar mit dem Verwaltungspasswort. */

import { api } from './api.js';
import { ADMIN, isAuthed, onAuthChange, requireAdmin, withSecret } from './auth.js';
import { mountShell, renderLoadError } from './shell.js';
import {
  $, h, clear, field, openDialog, confirmDialog, toast, emptyState, parseYouTubeId,
} from './ui.js';

let items = [];

function videoForm(item = {}) {
  const title = h('input', { class: 'input', name: 'title', required: true, maxlength: '140', value: item.title || '' });
  const link = h('input', {
    class: 'input', name: 'link', required: true,
    value: item.youtube_id ? `https://www.youtube.com/watch?v=${item.youtube_id}` : '',
    placeholder: 'https://www.youtube.com/watch?v=…',
  });
  const description = h('textarea', { class: 'textarea', name: 'description', placeholder: 'Worum geht es? Für wen ist das nützlich?' }, item.description || '');
  const sort = h('input', { class: 'input', type: 'number', name: 'sort', min: '1', value: item.sort ?? '' });

  return {
    body: [
      field('Titel', title),
      field('YouTube-Link', link, 'Normaler Link, youtu.be-Kurzlink oder die reine Video-ID.'),
      field('Beschreibung', description),
      field('Reihenfolge', sort, 'Kleinere Zahl steht weiter oben.'),
    ],
    read: () => {
      const youtube_id = parseYouTubeId(link.value);
      if (!youtube_id) throw new Error('Das sieht nicht nach einem YouTube-Link aus.');
      return {
        ...(item.id ? { id: item.id } : {}),
        title: title.value.trim(),
        youtube_id,
        description: description.value.trim() || null,
        sort: sort.value ? Number(sort.value) : null,
      };
    },
  };
}

async function edit(item) {
  const isNew = !item;
  if (isNew && !(await requireAdmin('Zum Hinzufügen eines Videos wird das Passwort gebraucht.'))) return;

  const form = videoForm(item || {});
  const saved = await openDialog({
    title: isNew ? 'Video hinzufügen' : 'Video bearbeiten',
    body: form.body,
    actions: [
      { label: 'Abbrechen', value: null },
      { label: isNew ? 'Hinzufügen' : 'Speichern', value: 'save', variant: 'primary', type: 'submit' },
    ],
    onSubmit: async () => {
      const data = form.read();
      const result = await withSecret(ADMIN, (pw) => api.saveVideo(data, pw));
      return result.cancelled ? false : true;
    },
  });
  if (saved) await load(isNew ? 'Video hinzugefügt.' : 'Video gespeichert.');
}

async function remove(item) {
  if (!(await confirmDialog('Video entfernen?', `„${item.title}“ wird aus der Liste entfernt.`))) return;
  const result = await withSecret(ADMIN, (pw) => api.deleteVideo(item.id, pw)).catch((err) => {
    toast(err.message, 'error');
    return { failed: true };
  });
  if (result.cancelled || result.failed) return;
  await load('Video entfernt.');
}

function tile(item) {
  return h(
    'article',
    { class: 'tile' },
    h('iframe', {
      class: 'video-frame',
      src: `https://www.youtube-nocookie.com/embed/${item.youtube_id}`,
      title: item.title,
      loading: 'lazy',
      allow: 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
      allowfullscreen: true,
      referrerpolicy: 'strict-origin-when-cross-origin',
    }),
    h(
      'div',
      { class: 'tile-body' },
      h('h2', { class: 'tile-title', text: item.title }),
      item.description ? h('p', { class: 'tile-text', text: item.description }) : null,
      h('p', { class: 'small', style: 'margin:.5rem 0 0' },
        h('a', {
          class: 'link-out',
          href: `https://www.youtube.com/watch?v=${item.youtube_id}`,
          target: '_blank', rel: 'noopener noreferrer',
          text: 'Auf YouTube öffnen ↗',
        })
      )
    ),
    isAuthed(ADMIN)
      ? h(
          'div',
          { class: 'tile-actions' },
          h('button', { class: 'btn btn-small', type: 'button', text: 'Bearbeiten', on: { click: () => edit(item) } }),
          h('button', { class: 'btn btn-small btn-danger', type: 'button', text: 'Entfernen', on: { click: () => remove(item) } })
        )
      : null
  );
}

function render() {
  const list = clear($('#videoList'));
  if (items.length === 0) {
    list.append(emptyState('🎬', 'Noch keine Videos', 'Mit dem Verwaltungspasswort kannst du hilfreiche YouTube-Videos sammeln.'));
  } else {
    for (const item of items) list.append(tile(item));
  }

  const actions = clear($('#pageActions'));
  actions.append(
    isAuthed(ADMIN)
      ? h('button', { class: 'btn btn-primary', type: 'button', text: 'Video hinzufügen', on: { click: () => edit(null) } })
      : h('button', {
          class: 'btn', type: 'button', text: 'Videos pflegen',
          on: { click: async () => { if (await requireAdmin()) render(); } },
        })
  );
}

async function load(message) {
  items = await api.listVideos();
  render();
  if (message) toast(message, 'success');
}

async function init() {
  mountShell();
  onAuthChange(render);
  try {
    await load();
  } catch (err) {
    renderLoadError($('#videoList'), err);
  }
}

init();
