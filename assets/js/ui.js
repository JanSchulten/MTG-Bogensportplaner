/** Kleine DOM- und Formatierungs-Helfer, die alle Seiten teilen. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/**
 * Element bauen. `props` kennt `class`, `text`, `html`, `dataset`,
 * `on` (Ereignisse) und sonst beliebige Attribute.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'html') el.innerHTML = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'on') for (const [ev, fn] of Object.entries(value)) el.addEventListener(ev, fn);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/* ------------------------------------------------------------ Formatierung */

const DE = 'de-DE';

export function fmtDate(iso, opts = { weekday: 'long', day: '2-digit', month: 'long' }) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(DE, opts);
}

export function fmtDateShort(iso) {
  return fmtDate(iso, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtTimeRange(start, end) {
  return `${String(start).slice(0, 5)}–${String(end).slice(0, 5)} Uhr`;
}

export function fmtRelativeDay(iso, today = new Date()) {
  const [y, m, d] = iso.split('-').map(Number);
  const diff = Math.round(
    (Date.UTC(y, m - 1, d) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) /
      86400000
  );
  if (diff === 0) return 'heute';
  if (diff === 1) return 'morgen';
  if (diff === -1) return 'gestern';
  if (diff > 1 && diff < 7) return `in ${diff} Tagen`;
  return null;
}

/* ------------------------------------------------------------------ Toasts */

let toastHost;

export function toast(message, type = 'info') {
  if (!toastHost) {
    toastHost = h('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  const node = h('div', { class: `toast toast-${type}`, text: message });
  toastHost.append(node);
  // Bei schneller Bedienung sonst eine Wand aus Meldungen.
  while (toastHost.children.length > 3) toastHost.firstChild.remove();
  setTimeout(() => {
    node.classList.add('toast-out');
    setTimeout(() => node.remove(), 300);
  }, type === 'error' ? 6000 : 3500);
}

/* ------------------------------------------------------------------ Dialoge */

/**
 * Öffnet einen modalen Dialog.
 * @param {object} o
 * @param {string} o.title
 * @param {Node|Node[]} o.body
 * @param {Array<{label:string, value:any, variant?:string, type?:string}>} o.actions
 * @param {(value:any, form:HTMLFormElement)=>any} [o.onSubmit] darf werfen, um offen zu bleiben
 * @returns {Promise<any>} Wert der gedrückten Schaltfläche, `null` bei Abbruch
 */
export function openDialog({ title, body, actions = [], onSubmit, wide = false }) {
  return new Promise((resolve) => {
    const error = h('p', { class: 'dialog-error', hidden: true, role: 'alert' });
    const form = h('form', { method: 'dialog', class: 'dialog-form' });
    const dialog = h(
      'dialog',
      { class: `dialog${wide ? ' dialog-wide' : ''}` },
      h('h2', { class: 'dialog-title', text: title }),
      form
    );

    const bodyWrap = h('div', { class: 'dialog-body' });
    for (const node of [body].flat().filter(Boolean)) bodyWrap.append(node);
    form.append(bodyWrap, error);

    const footer = h('div', { class: 'dialog-actions' });
    for (const action of actions) {
      footer.append(
        h('button', {
          class: `btn ${action.variant ? `btn-${action.variant}` : 'btn-ghost'}`,
          type: action.type || 'button',
          value: String(action.value),
          on: {
            click: async (ev) => {
              ev.preventDefault();
              error.hidden = true;
              if (action.value === null || action.value === 'cancel') return close(null);
              if (!onSubmit) return close(action.value);
              if (action.type === 'submit' && !form.reportValidity()) return;
              const button = ev.currentTarget;
              button.disabled = true;
              try {
                const result = await onSubmit(action.value, form);
                if (result !== false) close(result === undefined ? action.value : result);
              } catch (err) {
                error.textContent = err.message || String(err);
                error.hidden = false;
              } finally {
                button.disabled = false;
              }
            },
          },
          text: action.label,
        })
      );
    }
    form.append(footer);

    let settled = false;
    function close(value) {
      if (settled) return;
      settled = true;
      dialog.close();
      dialog.remove();
      resolve(value);
    }

    dialog.addEventListener('cancel', (ev) => {
      ev.preventDefault();
      close(null);
    });

    document.body.append(dialog);
    dialog.showModal();
    const first = dialog.querySelector('input, textarea, select, button');
    first?.focus();
  });
}

export async function confirmDialog(title, message, confirmLabel = 'Ja, löschen') {
  const value = await openDialog({
    title,
    body: h('p', { class: 'muted', text: message }),
    actions: [
      { label: 'Abbrechen', value: null },
      { label: confirmLabel, value: true, variant: 'danger' },
    ],
  });
  return value === true;
}

/** Beschriftetes Formularfeld. */
export function field(label, input, hint) {
  return h(
    'label',
    { class: 'field' },
    h('span', { class: 'field-label', text: label }),
    input,
    hint ? h('span', { class: 'field-hint', text: hint }) : null
  );
}

/** Platzhaltertext für leere Listen. */
export function emptyState(icon, title, text) {
  return h(
    'div',
    { class: 'empty' },
    h('div', { class: 'empty-icon', 'aria-hidden': 'true', text: icon }),
    h('p', { class: 'empty-title', text: title }),
    text ? h('p', { class: 'muted', text }) : null
  );
}

/** YouTube-Video-ID aus Link oder ID herauslösen. */
export function parseYouTubeId(input) {
  const value = String(input || '').trim();
  if (/^[\w-]{11}$/.test(value)) return value;
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/(?:embed|shorts|live)\/)([\w-]{11})/,
  ];
  for (const re of patterns) {
    const match = value.match(re);
    if (match) return match[1];
  }
  return null;
}
