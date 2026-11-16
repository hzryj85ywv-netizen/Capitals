// ---------- dates (all local, keyed as YYYY-MM-DD) ----------
const pad = n => String(n).padStart(2, '0');
export function dkey(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
export function today() { return dkey(new Date()); }
export function addDays(k, n) { const d = parseKey(k); d.setDate(d.getDate() + n); return dkey(d); }
export function diffDays(a, b) { return Math.round((parseKey(a) - parseKey(b)) / 86400000); } // a - b
export function weekday(k) { return parseKey(k).getDay(); } // 0 = Sunday
export function weekStart(k) { const wd = weekday(k); return addDays(k, wd === 0 ? -6 : 1 - wd); } // Monday
export function range(from, to) { const out = []; for (let k = from; k <= to; k = addDays(k, 1)) out.push(k); return out; }
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayName = (k, long) => (long ? DAYS_LONG : DAYS)[weekday(k)];
export const dayLetter = k => 'SMTWTFS'[weekday(k)];
export function fmtDate(k, opts = {}) {
  const d = parseKey(k);
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return opts.weekday ? `${DAYS[d.getDay()]} ${base}` : base;
}
export function relDay(k) {
  const t = today();
  if (k === t) return 'Today';
  if (k === addDays(t, -1)) return 'Yesterday';
  if (k === addDays(t, 1)) return 'Tomorrow';
  return fmtDate(k, { weekday: true });
}
export function nextWeekday(fromKey, wd) { // next date (>= from) that falls on weekday wd
  let k = fromKey; for (let i = 0; i < 7; i++) { if (weekday(k) === wd) return k; k = addDays(k, 1); } return k;
}
export function hourOf(ts) { return new Date(ts).getHours() + new Date(ts).getMinutes() / 60; }

// ---------- numbers ----------
export const r0 = n => Math.round(n || 0);
export const r1 = n => Math.round((n || 0) * 10) / 10;
export const fmt = n => r0(n).toLocaleString('en-IE');
export const sign = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
export const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; };
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const sum = (arr, f = x => x) => arr.reduce((s, x) => s + (f(x) || 0), 0);
export const plural = (n, w, p) => `${n} ${n === 1 ? w : (p || w + 's')}`;

// ---------- strings / dom ----------
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  fwd: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  scan: '<svg viewBox="0 0 24 24"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z M5 17a3 3 0 0 1 3-3h11"/></svg>',
};

// ---------- toast ----------
let toastTimer;
export function toast(msg, ms = 2200) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ---------- bottom sheets ----------
const sheetStack = [];
export function openSheet({ title, body, full = false, onClose, headerExtra = '' }) {
  const root = document.getElementById('sheet-root');
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="sheet-backdrop"></div>
    <section class="sheet ${full ? 'full' : ''}" role="dialog" aria-modal="true">
      <div class="grabber"></div>
      <div class="sheet-h"><h2>${esc(title || '')}</h2>${headerExtra}<button class="icon-btn" data-sheet-close aria-label="Close">${ICON.close}</button></div>
      <div class="sheet-b"></div>
    </section>`;
  root.appendChild(wrap);
  const sheet = wrap.querySelector('.sheet');
  const bodyEl = wrap.querySelector('.sheet-b');
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
  const api = {
    el: sheet, body: bodyEl,
    setTitle(t) { sheet.querySelector('.sheet-h h2').textContent = t; },
    close() {
      const i = sheetStack.indexOf(api);
      if (i >= 0) sheetStack.splice(i, 1);
      wrap.remove();
      if (onClose) onClose();
    },
  };
  wrap.querySelector('.sheet-backdrop').addEventListener('click', () => api.close());
  wrap.querySelector('[data-sheet-close]').addEventListener('click', () => api.close());
  sheetStack.push(api);
  return api;
}
export function closeAllSheets() { while (sheetStack.length) sheetStack[sheetStack.length - 1].close(); }
export function topSheet() { return sheetStack[sheetStack.length - 1]; }

export function confirmSheet({ title, message, ok = 'Confirm', cancel = 'Cancel', danger = false }) {
  return new Promise(resolve => {
    let done = false;
    const s = openSheet({
      title,
      body: `<p class="muted" style="margin-bottom:16px">${message}</p>
        <div class="btn-grid"><button class="btn" data-x="no">${esc(cancel)}</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" data-x="yes">${esc(ok)}</button></div>`,
      onClose: () => { if (!done) resolve(false); },
    });
    s.body.addEventListener('click', e => {
      const b = e.target.closest('[data-x]');
      if (!b) return;
      done = true; s.close(); resolve(b.dataset.x === 'yes');
    });
  });
}

// ---------- action delegation ----------
const actions = {};
export function on(name, fn) { actions[name] = fn; }
export function initActions() {
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = actions[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
}

// ---------- seeded shuffle (stable fact order) ----------
export function seededShuffle(n, seed) {
  let s = seed >>> 0 || 1;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function downloadFile(name, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

// ---------- change bus: views re-render when data changes ----------
export function changed() { window.dispatchEvent(new Event('datachanged')); }
