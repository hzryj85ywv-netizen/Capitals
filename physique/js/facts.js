import { getKV, setKV } from './db.js';
import { today, diffDays, seededShuffle, esc, openSheet, on, $ } from './util.js';
import { TRAINING_FACTS, CATEGORIES } from './data/training-facts.js';
import { FUN_FACTS } from './data/fun-facts.js';

// Each library is walked in a stable shuffled order: one item per day, no repeats until
// the library is exhausted, then a fresh shuffle for the next cycle.
function state(key) {
  let st = getKV(key, null);
  if (!st) { st = { seed: Math.floor(Math.random() * 2 ** 31), start: today() }; setKV(key, st); }
  return st;
}
function pick(lib, key, offset = 0) {
  const st = state(key);
  const idx = Math.max(0, diffDays(today(), st.start) + offset);
  const cycle = Math.floor(idx / lib.length);
  const order = seededShuffle(lib.length, st.seed + cycle * 7919);
  return { item: lib[order[idx % lib.length]], idx, n: lib.length };
}
function seen(lib, key) {
  const st = state(key);
  const idx = Math.max(0, diffDays(today(), st.start));
  const out = [];
  for (let i = idx; i >= 0 && out.length < lib.length; i--) {
    const order = seededShuffle(lib.length, st.seed + Math.floor(i / lib.length) * 7919);
    out.push(lib[order[i % lib.length]]);
  }
  return out;
}

export function trainingFact() { return pick(TRAINING_FACTS, 'factState'); }
export function funFact() { return pick(FUN_FACTS, 'funState'); }

export function trainingFactCard() {
  const { item, idx, n } = trainingFact();
  const [cat, title, body, src] = item;
  return `<div class="card fact">
    <div class="spread cat"><span class="eyebrow">Training fact · ${esc(CATEGORIES[cat])}</span><span class="xsmall faint">${(idx % n) + 1}/${n}</span></div>
    <h3>${esc(title)}</h3><p>${esc(body)}</p>${src ? `<div class="src">Source: ${esc(src)}</div>` : ''}
    <button class="link-btn" data-act="facts-library" style="margin-top:6px">Past facts</button>
  </div>`;
}
export function funFactCard() {
  const { item } = funFact();
  return `<div class="card fact"><div class="eyebrow cat">Fun fact</div><p>${esc(item)}</p></div>`;
}

on('facts-library', () => {
  const list = seen(TRAINING_FACTS, 'factState');
  let cat = 'all';
  const s = openSheet({ title: 'Facts so far', full: true });
  const render = () => {
    const items = list.filter(f => cat === 'all' || f[0] === cat);
    s.body.innerHTML = `<div class="chips scroll" style="margin-bottom:10px"><button class="chip ${cat === 'all' ? 'on' : ''}" data-c="all">All</button>${Object.entries(CATEGORIES).map(([k, v]) => `<button class="chip ${cat === k ? 'on' : ''}" data-c="${k}">${v}</button>`).join('')}</div>
      ${items.map(([c, t, b, src]) => `<div class="card fact"><div class="eyebrow cat">${esc(CATEGORIES[c])}</div><h3>${esc(t)}</h3><p>${esc(b)}</p>${src ? `<div class="src">Source: ${esc(src)}</div>` : ''}</div>`).join('') || '<div class="empty">None in this category yet. One new fact unlocks each day.</div>'}`;
  };
  render();
  s.body.addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (b) { cat = b.dataset.c; render(); } });
});
