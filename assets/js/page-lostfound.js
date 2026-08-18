/**
 * Lost & Found — Fundsachen mit Foto.
 *
 * Eintragen darf jeder (wer etwas findet, soll keine Hürde haben).
 * Als erledigt markieren oder löschen darf nur die Verwaltung.
 */

import { api } from './api.js';
import { shrinkImage } from './image.js';
import { ADMIN, isAuthed, onAuthChange, requireAdmin, withSecret } from './auth.js';
import { mountShell, renderLoadError } from './shell.js';
import {
  $, h, clear, field, openDialog, confirmDialog, toast, emptyState, fmtDateShort,
} from './ui.js';

let items = [];

function entryForm() {
  const title = h('input', { class: 'input', name: 'title', required: true, maxlength: '120', placeholder: 'z. B. Schwarzer Armschutz' });
  const description = h('textarea', { class: 'textarea', name: 'description', placeholder: 'Wo gefunden? Besonderheiten? Wo abzuholen?' });
  const foundDate = h('input', { class: 'input', type: 'date', name: 'found_date', value: new Date().toISOString().slice(0, 10) });

  const preview = h('img', { class: 'image-preview', alt: 'Vorschau des ausgewählten Bildes', hidden: true });
  const status = h('span', { class: 'field-hint', text: 'JPG, PNG oder HEIC bis 10 MB. Wird vor dem Hochladen verkleinert.' });
  let prepared = null;

  const fileInput = h('input', {
    class: 'input', type: 'file', name: 'image', accept: 'image/*',
    on: {
      change: async (ev) => {
        const file = ev.target.files?.[0];
        prepared = null;
        preview.hidden = true;
        if (!file) return;
        status.textContent = 'Bild wird verarbeitet …';
        try {
          const result = await shrinkImage(file);
          prepared = result.blob;
          preview.src = result.dataUrl;
          preview.hidden = false;
          status.textContent = `Bereit: ${result.width}×${result.height} px, ${Math.round(result.blob.size / 1024)} kB`;
        } catch (err) {
          status.textContent = err.message;
          ev.target.value = '';
        }
      },
    },
  });

  return {
    body: [
      field('Gegenstand', title),
      field('Beschreibung', description),
      field('Gefunden am', foundDate),
      h('div', { class: 'field' }, h('span', { class: 'field-label', text: 'Foto' }), fileInput, status, preview),
    ],
    read: () => ({
      title: title.value.trim(),
      description: description.value.trim() || null,
      found_date: foundDate.value || null,
      blob: prepared,
    }),
  };
}

async function add() {
  const form = entryForm();
  const saved = await openDialog({
    title: 'Fundsache eintragen',
    wide: true,
    body: form.body,
    actions: [
      { label: 'Abbrechen', value: null },
      { label: 'Eintragen', value: 'save', variant: 'primary', type: 'submit' },
    ],
    onSubmit: async () => {
      const data = form.read();
      let image_path = null;
      if (data.blob) {
        const uploaded = await api.uploadImage(data.blob);
        image_path = uploaded.path;
      }
      await api.saveLostFound({
        title: data.title,
        description: data.description,
        found_date: data.found_date,
        image_path,
      });
      return true;
    },
  });
  if (saved) await load('Fundsache eingetragen.');
}

async function toggleResolved(item) {
  const result = await withSecret(ADMIN, (pw) => api.setLostFoundResolved(item.id, !item.resolved, pw))
    .catch((err) => {
      toast(err.message, 'error');
      return { failed: true };
    });
  if (result.cancelled || result.failed) return;
  await load(item.resolved ? 'Wieder als offen markiert.' : 'Als abgeholt markiert.');
}

async function remove(item) {
  if (!(await confirmDialog('Eintrag löschen?', `„${item.title}“ wird samt Bild entfernt.`))) return;
  const result = await withSecret(ADMIN, (pw) => api.deleteLostFound(item.id, pw)).catch((err) => {
    toast(err.message, 'error');
    return { failed: true };
  });
  if (result.cancelled || result.failed) return;
  await load('Eintrag gelöscht.');
}

function showImage(item) {
  openDialog({
    title: item.title,
    wide: true,
    body: h('img', { src: item.image_url, alt: item.title, style: 'width:100%;border-radius:10px' }),
    actions: [{ label: 'Schließen', value: null }],
  });
}

function tile(item) {
  return h(
    'article',
    { class: `tile${item.resolved ? ' is-resolved' : ''}` },
    item.image_url
      ? h('img', {
          class: 'tile-image', src: item.image_url, alt: item.title, loading: 'lazy',
          on: { click: () => showImage(item) },
        })
      : null,
    h(
      'div',
      { class: 'tile-body' },
      h(
        'div',
        { class: 'tile-meta' },
        item.resolved ? h('span', { class: 'badge badge-done', text: '✓ Abgeholt' }) : null,
        item.found_date ? h('span', { text: `Gefunden am ${fmtDateShort(item.found_date)}` }) : null
      ),
      h('h2', { class: 'tile-title', text: item.title }),
      item.description ? h('p', { class: 'tile-text', text: item.description }) : null
    ),
    isAuthed(ADMIN)
      ? h(
          'div',
          { class: 'tile-actions' },
          h('button', {
            class: 'btn btn-small', type: 'button',
            text: item.resolved ? 'Wieder offen' : 'Abgeholt',
            on: { click: () => toggleResolved(item) },
          }),
          h('button', { class: 'btn btn-small btn-danger', type: 'button', text: 'Löschen', on: { click: () => remove(item) } })
        )
      : null
  );
}

function render() {
  const list = clear($('#lostList'));
  if (items.length === 0) {
    list.append(emptyState('🔎', 'Nichts gefunden — im besten Sinne', 'Wer etwas liegen sieht, trägt es hier mit Foto ein.'));
  } else {
    for (const item of items) list.append(tile(item));
  }

  const actions = clear($('#pageActions'));
  actions.append(
    h('button', { class: 'btn btn-primary', type: 'button', text: 'Fundsache eintragen', on: { click: add } })
  );
  if (!isAuthed(ADMIN)) {
    actions.append(
      h('button', {
        class: 'btn', type: 'button', text: 'Verwalten',
        on: { click: async () => { if (await requireAdmin()) render(); } },
      })
    );
  }
}

async function load(message) {
  items = await api.listLostFound();
  render();
  if (message) toast(message, 'success');
}

async function init() {
  mountShell();
  onAuthChange(render);
  try {
    await load();
  } catch (err) {
    renderLoadError($('#lostList'), err);
  }
}

init();
