import { S, save, saveMany, remove, uid } from './db.js';
import {
  today, addDays, relDay, fmtDate, esc, r0, r1, fmt, num, sum, toast, openSheet, confirmSheet, on, ICON, changed, $, $$,
} from './util.js';
import { MEALS, defaultMeal, entryMacros, entriesOn, dayTotals, targets } from './state.js';

// ============================================================
// Open Food Facts
// ============================================================
const OFF = 'https://world.openfoodfacts.org';
const FIELDS = 'code,product_name,product_name_en,generic_name,brands,nutriments,serving_size,serving_quantity,categories_tags,countries_tags,quantity';

const FV_TAGS = ['en:fruits', 'en:vegetables', 'en:fresh-vegetables', 'en:fresh-fruits', 'en:frozen-vegetables', 'en:frozen-fruits',
  'en:salads', 'en:fruits-based-foods', 'en:vegetables-based-foods', 'en:legumes', 'en:berries', 'en:dried-fruits', 'en:fruit-juices-and-nectars-not'];
const FV_WORDS = /\b(apples?|bananas?|berr(y|ies)|blueberr|strawberr|raspberr|grapes?|oranges?|satsumas?|clementines?|kiwis?|pears?|peach(es)?|plums?|mangos?|mangoes|pineapple|melon|watermelon|cherr(y|ies)|lemons?|limes?|avocados?|tomato(es)?|broccoli|spinach|kale|lettuce|salad|rocket|carrots?|peppers?|onions?|courgettes?|zucchini|cucumber|celery|cabbage|cauliflower|sprouts|peas|green beans|beans|lentils|chickpeas|mushrooms?|asparagus|beetroot|sweetcorn|corn on the cob|parsnips?|turnips?|swede|leeks?|garlic|aubergine|eggplant|veg|vegetables?|fruit|stir[- ]fry mix|coleslaw|potato(es)?|sweet potato(es)?)\b/i;
export function guessFV(name, tags = []) {
  if (tags.some(t => FV_TAGS.includes(t))) return true;
  return FV_WORDS.test(name || '');
}

function offToFood(p) {
  const n = p.nutriments || {};
  const pick = (k) => {
    const v = n[`${k}_100g`];
    if (v != null && v !== '') return Number(v);
    const sv = n[`${k}_serving`];
    if (sv != null && p.serving_quantity) return Number(sv) / Number(p.serving_quantity) * 100;
    return null;
  };
  let kcal = pick('energy-kcal');
  if (kcal == null) { const kj = pick('energy-kj') ?? pick('energy'); if (kj != null) kcal = kj / 4.184; }
  const protein = pick('proteins'), carbs = pick('carbohydrates'), fat = pick('fat'), fiber = pick('fiber');
  if (kcal == null && protein == null && carbs == null && fat == null) return null;
  const name = (p.product_name_en || p.product_name || p.generic_name || '').trim() || 'Unnamed product';
  const brand = (p.brands || '').split(',')[0].trim();
  const sq = Number(p.serving_quantity);
  const per100 = {
    kcal: r1(kcal ?? ((protein || 0) * 4 + (carbs || 0) * 4 + (fat || 0) * 9)),
    protein: r1(protein || 0), carbs: r1(carbs || 0), fat: r1(fat || 0), fiber: r1(fiber || 0),
  };
  return {
    id: 'off:' + p.code, barcode: p.code, source: 'off', name, brand, per100,
    serving: sq > 0 && sq < 2000 ? r0(sq) : null, servingLabel: p.serving_size || '', pack: p.quantity || '',
    fv: guessFV(name, p.categories_tags || []),
    local: (p.countries_tags || []).some(c => c === 'en:ireland' || c === 'en:united-kingdom'),
  };
}

async function fetchJSON(url, ms = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}

export async function lookupBarcode(code) {
  const cached = S.foods.find(f => f.barcode === code);
  if (cached) return cached;
  if (!navigator.onLine) throw new Error('offline');
  const j = await fetchJSON(`${OFF}/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`);
  if (!j || j.status !== 1 || !j.product) return null;
  return offToFood({ code, ...j.product });
}

export async function searchOFF(q) {
  if (!navigator.onLine) throw new Error('offline');
  const url = `${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=30&sort_by=unique_scans_n&fields=${FIELDS}`;
  const j = await fetchJSON(url, 15000);
  const foods = (j.products || []).map(offToFood).filter(Boolean);
  foods.sort((a, b) => (b.local ? 1 : 0) - (a.local ? 1 : 0));
  return foods;
}

function localSearch(q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const pool = [...S.foods].sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
  if (!words.length) return pool.slice(0, 30);
  return pool.filter(f => { const h = `${f.name} ${f.brand || ''}`.toLowerCase(); return words.every(w => h.includes(w)); }).slice(0, 30);
}

// ============================================================
// Logging
// ============================================================
async function rememberFood(food, grams, fv) {
  const existing = S.foods.find(f => f.id === food.id);
  const f = { ...(existing || food), ...food, fv: fv ?? food.fv, lastUsed: Date.now(), lastGrams: grams, uses: ((existing && existing.uses) || 0) + 1 };
  delete f.local;
  await save('foods', f);
  return f;
}

export async function logFood(food, grams, date, meal, fv) {
  const f = await rememberFood(food, grams, fv);
  const entry = {
    id: uid(), date, meal, foodId: f.id, name: f.name, brand: f.brand || '', per100: { ...f.per100 },
    grams, fv: !!(fv ?? f.fv), createdAt: Date.now(),
  };
  await save('entries', entry);
  return entry;
}

function macroLine(m) {
  return `${fmt(m.kcal)} kcal · ${r0(m.protein)}P · ${r0(m.carbs)}C · ${r0(m.fat)}F`;
}
function per100Line(p) {
  return `per 100g: ${fmt(p.kcal)} kcal · ${r1(p.protein)}P · ${r1(p.carbs)}C · ${r1(p.fat)}F`;
}

// ============================================================
// Views
// ============================================================
let viewDate = null;
export function foodDate() { return viewDate || today(); }
export function resetFoodDate() { viewDate = null; }

export function macroCard(dateKey, { compact = false } = {}) {
  const t = dayTotals(dateKey);
  const tg = targets();
  const remK = tg.kcal - t.kcal, remP = tg.protein - t.protein;
  const bar = (v, max, color) => {
    const pct = Math.min(100, max ? (v / max) * 100 : 0);
    return `<div class="bar ${v > max * 1.05 ? 'over' : ''}"><i style="width:${pct}%;background:${color}"></i></div>`;
  };
  const row = (lbl, v, max, color, unit) => `<div class="macro-row"><span class="lbl">${lbl}</span>${bar(v, max, color)}<span class="val">${fmt(v)} / ${fmt(max)}${unit}</span></div>`;
  return `<div class="card">
    <div class="remaining">
      <div><div class="big ${remK < 0 ? 'bad' : ''}">${remK < 0 ? '−' : ''}${fmt(Math.abs(remK))}</div><div class="lbl">${remK < 0 ? 'kcal over' : 'kcal left'}</div></div>
      <div><div class="big" style="color:${remP <= 0 ? 'var(--good)' : 'var(--protein)'}">${remP <= 0 ? 'Done' : fmt(remP) + 'g'}</div><div class="lbl">${remP <= 0 ? `protein ${fmt(t.protein)}g` : 'protein left'}</div></div>
    </div>
    ${row('Calories', t.kcal, tg.kcal, 'var(--kcal)', '')}
    ${row('Protein', t.protein, tg.protein, 'var(--protein)', 'g')}
    ${compact ? '' : row('Carbs', t.carbs, tg.carbs, 'var(--carbs)', 'g')}
    ${compact ? '' : row('Fat', t.fat, tg.fat, 'var(--fat)', 'g')}
    ${compact ? `<div class="small muted" style="margin-top:6px">${r0(t.carbs)}g carbs · ${r0(t.fat)}g fat · ${t.fv ? `${t.fv} fruit/veg` : 'no fruit/veg yet'}</div>` : `<div class="small muted" style="margin-top:6px">${r0(t.fiber)}g fibre · ${t.fv ? `${t.fv} fruit/veg item${t.fv > 1 ? 's' : ''}` : 'no fruit/veg logged'}</div>`}
  </div>`;
}

export function renderFood(view) {
  const d = foodDate();
  const es = entriesOn(d);
  const isToday = d === today();
  view.innerHTML = `
    <div class="datebar">
      <button class="icon-btn" data-act="food-day" data-n="-1" aria-label="Previous day">${ICON.back}</button>
      <b>${relDay(d)}${isToday ? '' : ` · ${fmtDate(d)}`}</b>
      <button class="icon-btn" data-act="food-day" data-n="1" aria-label="Next day" ${isToday ? 'disabled style="opacity:.3"' : ''}>${ICON.fwd}</button>
    </div>
    ${macroCard(d)}
    <div class="btn-grid">
      <button class="btn primary" data-act="food-scan">${ICON.scan} Scan</button>
      <button class="btn" data-act="food-add">${ICON.search} Search</button>
      <button class="btn" data-act="food-copy-yesterday">${ICON.copy} Copy ${isToday ? 'yesterday' : 'previous day'}</button>
      <button class="btn" data-act="meals-open">${ICON.book} Saved meals</button>
    </div>
    ${MEALS.map(m => mealSection(m, es.filter(e => e.meal === m.id))).join('')}
    <button class="btn block ghost" data-act="food-manual" style="margin-top:4px">${ICON.plus} Manual entry / quick add</button>
  `;
}

function mealSection(m, es) {
  const tot = es.reduce((a, e) => { const x = entryMacros(e); a.kcal += x.kcal; a.protein += x.protein; return a; }, { kcal: 0, protein: 0 });
  const sorted = [...es].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return `<div class="card meal-card">
    <div class="card-h"><h2>${m.name}</h2><span class="meta tnum">${es.length ? `${fmt(tot.kcal)} kcal · ${r0(tot.protein)}g P` : ''}</span></div>
    <ul class="list">${sorted.map(e => {
      const x = entryMacros(e);
      return `<li><button class="item" data-act="entry-edit" data-id="${e.id}">
        <div class="grow"><div class="t">${esc(e.name)}</div><div class="s">${r0(e.grams)}g${e.brand ? ' · ' + esc(e.brand) : ''}${e.fv ? ' · fruit/veg' : ''}</div></div>
        <div class="r"><b>${fmt(x.kcal)}</b>${r0(x.protein)}g P</div></button></li>`;
    }).join('')}</ul>
    <div class="row add">
      <button class="link-btn" data-act="food-add" data-meal="${m.id}">+ Add food</button>
      <span class="grow"></span>
      ${es.length ? `<button class="link-btn" style="color:var(--muted)" data-act="meal-from-section" data-meal="${m.id}">Save as meal</button>` : ''}
    </div>
  </div>`;
}

// ============================================================
// Add sheet (search / scan / manual / meals)
// ============================================================
// target: {kind:'log', date, meal} | {kind:'draft', add(item), label}
function logTarget(meal) { return { kind: 'log', date: foodDate(), meal: meal || (foodDate() === today() ? defaultMeal() : 'snacks') }; }

export function openAdd(target, tab = 'search') {
  const s = openSheet({ title: target.kind === 'log' ? 'Add food' : `Add to ${target.label}`, full: true });
  const tabs = target.kind === 'log' ? ['search', 'scan', 'manual', 'meals'] : ['search', 'scan', 'manual'];
  const names = { search: 'Search', scan: 'Scan', manual: 'Manual', meals: 'Meals' };
  s.body.innerHTML = `<div class="seg" style="margin-bottom:12px">${tabs.map(t => `<button data-tab="${t}">${names[t]}</button>`).join('')}</div><div class="pane"></div>`;
  const pane = $('.pane', s.body);
  let stopScan = null;
  const show = t => {
    if (stopScan) { stopScan(); stopScan = null; }
    $$('.seg button', s.body).forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    if (t === 'search') searchPane(pane, target, s);
    if (t === 'scan') stopScan = scanPane(pane, target, s);
    if (t === 'manual') manualPane(pane, target, s);
    if (t === 'meals') mealsPane(pane, target, s);
  };
  $('.seg', s.body).addEventListener('click', e => { const b = e.target.closest('button'); if (b) show(b.dataset.tab); });
  const origClose = s.close;
  s.close = () => { if (stopScan) stopScan(); origClose(); };
  show(tab);
  return s;
}

function foodRow(f) {
  return `<li><button class="item" data-food="${esc(f.id)}">
    <div class="grow"><div class="t">${esc(f.name)}</div><div class="s">${f.brand ? esc(f.brand) + ' · ' : ''}${f.source === 'custom' ? 'My food · ' : ''}${f.lastGrams ? 'last ' + r0(f.lastGrams) + 'g' : (f.pack ? esc(f.pack) : '')}</div></div>
    <div class="r"><b>${fmt(f.per100.kcal)}</b>${r1(f.per100.protein)}P /100g</div></button></li>`;
}

function searchPane(pane, target, sheet) {
  pane.innerHTML = `
    <form class="row" autocomplete="off"><input class="input grow" type="search" placeholder="Search your foods or the database" enterkeyhint="search"><button class="btn primary" type="submit">Go</button></form>
    <div class="small muted" style="margin:8px 2px">Recent and saved foods filter as you type. Press Go to search Open Food Facts.</div>
    <ul class="list local"></ul>
    <div class="remote"></div>`;
  const input = $('input', pane);
  const localEl = $('.local', pane), remoteEl = $('.remote', pane);
  let remote = [];
  const pool = new Map();
  const renderLocal = () => {
    const res = localSearch(input.value);
    res.forEach(f => pool.set(f.id, f));
    localEl.innerHTML = res.length ? res.map(foodRow).join('') : (input.value ? '' : '<li class="empty">No recent foods yet. Scan or search to start.</li>');
  };
  input.addEventListener('input', renderLocal);
  $('form', pane).addEventListener('submit', async e => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    input.blur();
    remoteEl.innerHTML = '<div class="section-title">Open Food Facts</div><div class="empty">Searching…</div>';
    try {
      remote = await searchOFF(q);
      remote.forEach(f => pool.set(f.id, f));
      remoteEl.innerHTML = `<div class="section-title">Open Food Facts</div>` + (remote.length
        ? `<ul class="list">${remote.map(foodRow).join('')}</ul>`
        : `<div class="empty">Nothing found for “${esc(q)}”. Try fewer words or a brand name, or add it manually.</div>`);
    } catch (err) {
      remoteEl.innerHTML = `<div class="section-title">Open Food Facts</div><div class="empty">${err.message === 'offline' ? 'You are offline. Recent foods and manual entry still work.' : 'Search failed (the database can be slow). Try again in a moment.'}</div>`;
    }
  });
  pane.addEventListener('click', e => {
    const b = e.target.closest('[data-food]');
    if (!b) return;
    const f = pool.get(b.dataset.food);
    if (f) openFoodDetail(f, target, { parent: sheet });
  });
  renderLocal();
  setTimeout(() => input.focus(), 250);
}

let libPromise = null;
function loadScannerLib() {
  if (window.__Html5QrcodeLibrary__) return Promise.resolve();
  if (!libPromise) {
    libPromise = new Promise((res, rej) => {
      const sc = document.createElement('script');
      sc.src = 'vendor/html5-qrcode.min.js';
      sc.onload = res; sc.onerror = () => { libPromise = null; rej(new Error('Scanner failed to load')); };
      document.head.appendChild(sc);
    });
  }
  return libPromise;
}

function scanPane(pane, target, sheet) {
  pane.innerHTML = `
    <div id="scanner" class="scanner"></div>
    <div class="scan-msg">Starting camera…</div>
    <form class="row" autocomplete="off"><input class="input grow" inputmode="numeric" pattern="[0-9]*" placeholder="Or type the barcode number"><button class="btn" type="submit">Look up</button></form>`;
  const msg = $('.scan-msg', pane);
  let scanner = null, stopped = false, busy = false;
  const stop = () => {
    stopped = true;
    if (scanner) { try { scanner.stop().then(() => scanner.clear()).catch(() => {}); } catch (e) { /* ignore */ } scanner = null; }
  };
  const handle = async code => {
    if (busy) return;
    busy = true;
    msg.textContent = `Looking up ${code}…`;
    try {
      const f = await lookupBarcode(code);
      if (!f) {
        msg.innerHTML = `Barcode ${esc(code)} isn't in Open Food Facts. <button class="link-btn" data-manual>Enter it manually</button>`;
        $('[data-manual]', msg)?.addEventListener('click', () => { stop(); manualPane(pane, target, sheet, { barcode: code }); });
        busy = false;
        return;
      }
      stop();
      openFoodDetail(f, target, { parent: sheet, scanned: true });
    } catch (err) {
      msg.textContent = err.message === 'offline' ? 'Offline: can only find products you have logged before. Use manual entry.' : 'Lookup failed. Check your connection and try again.';
      busy = false;
    }
  };
  $('form', pane).addEventListener('submit', e => { e.preventDefault(); const v = $('input', pane).value.replace(/\D/g, ''); if (v) handle(v); });

  loadScannerLib().then(() => {
    if (stopped) return;
    const L = window.__Html5QrcodeLibrary__;
    const F = L.Html5QrcodeSupportedFormats;
    scanner = new L.Html5Qrcode('scanner', { formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128], verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
    return scanner.start(
      { facingMode: 'environment' },
      { fps: 12, qrbox: (w, h) => ({ width: Math.min(w * 0.85, 320), height: Math.min(h * 0.45, 160) }), aspectRatio: 1.333 },
      text => { if (!stopped) handle(text.trim()); },
      () => {},
    ).then(() => { if (!stopped) msg.textContent = 'Point at the barcode. Hold steady, fill the box.'; });
  }).catch(err => {
    const denied = /permission|NotAllowed/i.test(String(err && (err.name || err.message || err)));
    msg.textContent = denied ? 'Camera access was blocked. Allow it in Settings › Safari › Camera, or type the number below.' : 'Camera unavailable here. Type the barcode number below.';
  });
  return stop;
}

function manualPane(pane, target, sheet, preset = {}) {
  pane.innerHTML = `
    <form autocomplete="off">
      <label class="field"><span>Name</span><input class="input" name="fname" placeholder="e.g. Chicken fillet (leave blank for quick add)"></label>
      <div class="grid2">
        <label class="field"><span>Amount (g)</span><input class="input" name="grams" inputmode="decimal" value="100"></label>
        <div class="field"><span>Macros are</span><div class="seg" data-mode><button type="button" class="on" data-m="100">per 100g</button><button type="button" data-m="total">for this amount</button></div></div>
      </div>
      <div class="grid4">
        <label class="field"><span>kcal</span><input class="input" name="kcal" inputmode="decimal" placeholder="auto"></label>
        <label class="field"><span>Protein</span><input class="input" name="protein" inputmode="decimal"></label>
        <label class="field"><span>Carbs</span><input class="input" name="carbs" inputmode="decimal"></label>
        <label class="field"><span>Fat</span><input class="input" name="fat" inputmode="decimal"></label>
      </div>
      <label class="field"><span>Fibre (optional)</span><input class="input" name="fiber" inputmode="decimal"></label>
      <div class="toggle"><span>Counts as fruit / veg</span><label class="switch"><input type="checkbox" name="fv"><i></i></label></div>
      <div class="toggle"><span>Save as my food for reuse</span><label class="switch"><input type="checkbox" name="keep" checked><i></i></label></div>
      ${target.kind === 'log' ? `<div class="field"><span>Meal</span>${mealSeg(target.meal)}</div>` : ''}
      <button class="btn primary block" type="submit" style="margin-top:8px">${target.kind === 'log' ? 'Log it' : 'Add to meal'}</button>
    </form>`;
  const form = $('form', pane);
  let mode = '100';
  let meal = target.meal;
  $('[data-mode]', form).addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; mode = b.dataset.m; $$('[data-mode] button', form).forEach(x => x.classList.toggle('on', x === b)); });
  bindMealSeg(form, m => { meal = m; });
  form.fname.addEventListener('blur', () => { if (!form.fv.dataset.touched) form.fv.checked = guessFV(form.fname.value); });
  form.fv.addEventListener('change', () => { form.fv.dataset.touched = '1'; });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const grams = num(form.grams.value);
    if (grams <= 0) { toast('Enter an amount in grams'); return; }
    let p = num(form.protein.value), c = num(form.carbs.value), f = num(form.fat.value), fi = num(form.fiber.value);
    let k = form.kcal.value.trim() ? num(form.kcal.value) : p * 4 + c * 4 + f * 9;
    if (k <= 0) { toast('Enter calories or macros'); return; }
    if (mode === 'total') { const s = 100 / grams; k *= s; p *= s; c *= s; f *= s; fi *= s; }
    const name = form.fname.value.trim() || 'Quick add';
    const keep = form.keep.checked && form.fname.value.trim();
    const food = {
      id: keep ? 'custom:' + uid() : 'quick:' + uid(), source: keep ? 'custom' : 'quick', name, brand: '',
      per100: { kcal: r1(k), protein: r1(p), carbs: r1(c), fat: r1(f), fiber: r1(fi) }, serving: grams, fv: form.fv.checked,
      barcode: preset.barcode || null,
    };
    if (target.kind === 'log') {
      if (keep) await logFood(food, grams, target.date, meal, food.fv);
      else await save('entries', { id: uid(), date: target.date, meal, foodId: null, name, brand: '', per100: food.per100, grams, fv: food.fv, createdAt: Date.now() });
      toast(`Logged ${name}`);
      sheet.close(); changed();
    } else {
      if (keep) await rememberFood(food, grams, food.fv);
      target.add({ foodId: keep ? food.id : null, name, brand: '', per100: food.per100, grams, fv: food.fv });
      sheet.close();
    }
  });
}

function mealSeg(current) {
  return `<div class="seg" data-mealseg>${MEALS.map(m => `<button type="button" data-meal="${m.id}" class="${m.id === current ? 'on' : ''}">${m.name === 'Breakfast' ? 'Bkfst' : m.name}</button>`).join('')}</div>`;
}
function bindMealSeg(root, cb) {
  const seg = $('[data-mealseg]', root);
  if (!seg) return;
  seg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $$('button', seg).forEach(x => x.classList.toggle('on', x === b)); cb(b.dataset.meal);
  });
}

// ============================================================
// Food detail: choose grams, log
// ============================================================
export function openFoodDetail(food, target, { parent, entry, scanned } = {}) {
  const isEdit = !!entry;
  const startGrams = entry ? entry.grams : (food.lastGrams || food.serving || 100);
  let meal = entry ? entry.meal : target.meal;
  const s = openSheet({ title: isEdit ? 'Edit entry' : (scanned ? 'Scanned' : 'Add food') });
  const chips = [...new Set([food.serving, food.lastGrams, 50, 100, 150, 200].filter(x => x > 0).map(r0))].slice(0, 6);
  s.body.innerHTML = `
    <div style="margin-bottom:6px"><div style="font-weight:700;font-size:18px">${esc(food.name)}</div>
      <div class="small muted">${food.brand ? esc(food.brand) + ' · ' : ''}${per100Line(food.per100)}${food.servingLabel ? ` · serving ${esc(food.servingLabel)}` : ''}</div></div>
    <label class="field"><span>Grams</span><input class="input big" inputmode="decimal" value="${r0(startGrams)}" data-g></label>
    <div class="chips" style="margin-bottom:6px">${chips.map(g => `<button class="chip" data-chip="${g}">${g}g${g === r0(food.serving || 0) ? ' (serving)' : ''}</button>`).join('')}</div>
    <div class="preview-macros" data-prev></div>
    ${target.kind === 'log' || isEdit ? `<div class="field"><span>Meal</span>${mealSeg(meal)}</div>` : ''}
    <div class="toggle"><span>Counts as fruit / veg</span><label class="switch"><input type="checkbox" data-fv ${(entry ? entry.fv : food.fv) ? 'checked' : ''}><i></i></label></div>
    <button class="btn primary block" data-go style="margin-top:10px">${isEdit ? 'Save' : target.kind === 'log' ? 'Log it' : 'Add to meal'}</button>
    ${isEdit ? '<button class="btn danger block ghost" data-del style="margin-top:8px">Delete entry</button>' : ''}
    ${!isEdit && food.source === 'custom' ? '<button class="btn danger block ghost" data-delfood style="margin-top:8px">Delete this saved food</button>' : ''}`;
  const gEl = $('[data-g]', s.body);
  const prev = $('[data-prev]', s.body);
  const upd = () => {
    const g = num(gEl.value);
    const m = entryMacros({ grams: g, per100: food.per100 });
    prev.innerHTML = `<div><b>${fmt(m.kcal)}</b><span>kcal</span></div><div><b>${r0(m.protein)}</b><span>protein</span></div><div><b>${r0(m.carbs)}</b><span>carbs</span></div><div><b>${r0(m.fat)}</b><span>fat</span></div>`;
  };
  gEl.addEventListener('input', upd);
  gEl.addEventListener('focus', () => gEl.select());
  upd();
  bindMealSeg(s.body, m => { meal = m; });
  s.body.addEventListener('click', async e => {
    const chip = e.target.closest('[data-chip]');
    if (chip) { gEl.value = chip.dataset.chip; upd(); return; }
    if (e.target.closest('[data-go]')) {
      const g = num(gEl.value);
      if (g <= 0) { toast('Enter grams'); return; }
      const fv = $('[data-fv]', s.body).checked;
      if (isEdit) {
        await save('entries', { ...entry, grams: g, meal, fv });
        toast('Saved');
      } else if (target.kind === 'log') {
        await logFood(food, g, target.date, meal, fv);
        toast(`Logged ${r0(g)}g ${food.name}`);
      } else {
        await rememberFood(food, g, fv);
        target.add({ foodId: food.id, name: food.name, brand: food.brand || '', per100: { ...food.per100 }, grams: g, fv });
      }
      s.close();
      if (parent) parent.close();
      changed();
      return;
    }
    if (e.target.closest('[data-del]')) {
      await remove('entries', entry.id);
      toast('Deleted');
      s.close(); changed();
      return;
    }
    if (e.target.closest('[data-delfood]')) {
      if (await confirmSheet({ title: 'Delete saved food?', message: `“${esc(food.name)}” will be removed from your foods. Past log entries stay.`, ok: 'Delete', danger: true })) {
        await remove('foods', food.id);
        s.close(); if (parent) parent.close(); toast('Food deleted');
      }
    }
  });
  if (!scanned) setTimeout(() => { gEl.focus(); gEl.select(); }, 250);
  return s;
}

// ============================================================
// Saved meals
// ============================================================
function mealTotals(items) {
  return items.reduce((a, it) => { const m = entryMacros(it); a.kcal += m.kcal; a.protein += m.protein; return a; }, { kcal: 0, protein: 0 });
}

async function logSavedMeal(meal, date, slot) {
  const now = Date.now();
  const es = meal.items.map((it, i) => ({
    id: uid(), date, meal: slot, foodId: it.foodId || null, name: it.name, brand: it.brand || '', per100: { ...it.per100 },
    grams: it.grams, fv: !!it.fv, createdAt: now + i, savedMeal: meal.id,
  }));
  await saveMany('entries', es);
  await save('meals', { ...meal, uses: (meal.uses || 0) + 1, lastUsed: now });
}

function mealsPane(pane, target, sheet) {
  let slot = target.meal;
  const render = () => {
    const meals = [...S.meals].sort((a, b) => (b.lastUsed || b.createdAt || 0) - (a.lastUsed || a.createdAt || 0));
    pane.innerHTML = `
      <div class="field"><span>Log into</span>${mealSeg(slot)}</div>
      <ul class="list">${meals.length ? meals.map(m => {
        const t = mealTotals(m.items);
        return `<li class="row"><button class="item grow" data-edit="${m.id}"><div class="grow"><div class="t">${esc(m.name)}</div><div class="s">${m.items.length} items · ${fmt(t.kcal)} kcal · ${r0(t.protein)}g P</div></div></button>
          <button class="btn sm primary" data-log="${m.id}">Log</button></li>`;
      }).join('') : '<li class="empty">No saved meals yet. Build one below, or tap “Save as meal” under any meal on the Food tab.</li>'}</ul>
      <button class="btn block" data-new style="margin-top:12px">${ICON.plus} New meal</button>`;
    bindMealSeg(pane, m => { slot = m; });
  };
  render();
  pane.onclick = async e => {
    const lg = e.target.closest('[data-log]');
    if (lg) {
      const m = S.meals.find(x => x.id === lg.dataset.log);
      await logSavedMeal(m, target.date, slot);
      toast(`Logged ${m.name}`);
      sheet.close(); changed();
      return;
    }
    const ed = e.target.closest('[data-edit]');
    if (ed) { openMealBuilder(S.meals.find(x => x.id === ed.dataset.edit), render); return; }
    if (e.target.closest('[data-new]')) openMealBuilder(null, render);
  };
}

export function openMealsSheet() {
  const s = openSheet({ title: 'Saved meals', full: true });
  mealsPane(s.body, logTarget(), s);
}

function openMealBuilder(existing, onDone) {
  const draft = existing ? JSON.parse(JSON.stringify(existing)) : { id: uid(), name: '', items: [], createdAt: Date.now() };
  const s = openSheet({ title: existing ? 'Edit meal' : 'New meal', full: true });
  const render = () => {
    const t = mealTotals(draft.items);
    s.body.innerHTML = `
      <label class="field"><span>Meal name</span><input class="input" data-name value="${esc(draft.name)}" placeholder="e.g. Oats and whey"></label>
      <div class="small muted" style="margin:4px 2px 8px">${draft.items.length} items · ${fmt(t.kcal)} kcal · ${r0(t.protein)}g protein</div>
      <ul class="list">${draft.items.map((it, i) => {
        const m = entryMacros(it);
        return `<li class="row" style="padding:8px 0"><div class="grow"><div style="font-weight:600;font-size:15px">${esc(it.name)}</div><div class="small muted">${fmt(m.kcal)} kcal · ${r0(m.protein)}g P</div></div>
          <input class="input" style="width:86px;text-align:center" inputmode="decimal" data-gi="${i}" value="${r0(it.grams)}"><span class="small muted">g</span>
          <button class="icon-btn" data-rm="${i}" aria-label="Remove">${ICON.close}</button></li>`;
      }).join('')}</ul>
      <button class="btn block" data-additem style="margin-top:10px">${ICON.plus} Add item</button>
      <button class="btn primary block" data-save style="margin-top:10px">Save meal</button>
      ${existing ? '<button class="btn danger ghost block" data-delete style="margin-top:8px">Delete meal</button>' : ''}`;
  };
  render();
  s.body.addEventListener('input', e => {
    if (e.target.matches('[data-name]')) draft.name = e.target.value;
    if (e.target.matches('[data-gi]')) { draft.items[+e.target.dataset.gi].grams = num(e.target.value); }
  });
  s.body.addEventListener('change', e => { if (e.target.matches('[data-gi]')) render(); });
  s.body.addEventListener('click', async e => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { draft.items.splice(+rm.dataset.rm, 1); render(); return; }
    if (e.target.closest('[data-additem]')) {
      openAdd({ kind: 'draft', label: draft.name || 'meal', add: it => { draft.items.push(it); render(); } });
      return;
    }
    if (e.target.closest('[data-save]')) {
      if (!draft.name.trim()) { toast('Give the meal a name'); return; }
      if (!draft.items.length) { toast('Add at least one item'); return; }
      draft.items = draft.items.filter(i => i.grams > 0);
      await save('meals', draft);
      toast('Meal saved'); s.close(); if (onDone) onDone();
      return;
    }
    if (e.target.closest('[data-delete]')) {
      if (await confirmSheet({ title: 'Delete meal?', message: `“${esc(draft.name)}” will be deleted. Logged entries are kept.`, ok: 'Delete', danger: true })) {
        await remove('meals', draft.id); s.close(); if (onDone) onDone();
      }
    }
  });
}

function saveSectionAsMeal(mealId) {
  const es = entriesOn(foodDate()).filter(e => e.meal === mealId);
  if (!es.length) return;
  const s = openSheet({
    title: 'Save as meal',
    body: `<label class="field"><span>Name</span><input class="input" data-n placeholder="e.g. Usual breakfast"></label>
      <div class="small muted">${es.length} items: ${esc(es.map(e => e.name).join(', '))}</div>
      <button class="btn primary block" data-ok style="margin-top:14px">Save</button>`,
  });
  setTimeout(() => $('[data-n]', s.body).focus(), 200);
  $('[data-ok]', s.body).addEventListener('click', async () => {
    const name = $('[data-n]', s.body).value.trim();
    if (!name) { toast('Name it first'); return; }
    await save('meals', { id: uid(), name, createdAt: Date.now(), items: es.map(e => ({ foodId: e.foodId, name: e.name, brand: e.brand, per100: { ...e.per100 }, grams: e.grams, fv: e.fv })) });
    s.close(); toast(`Saved “${name}” — re-log it from Saved meals`);
  });
}

// ============================================================
// Copy previous day
// ============================================================
async function copyPrevious() {
  const d = foodDate();
  const src = addDays(d, -1);
  const from = entriesOn(src);
  if (!from.length) { toast(`Nothing logged ${d === today() ? 'yesterday' : 'that day'}`); return; }
  const existing = entriesOn(d).length;
  const ok = await confirmSheet({
    title: `Copy ${relDay(src).toLowerCase()}?`,
    message: `${from.length} items (${fmt(sum(from, e => entryMacros(e).kcal))} kcal) will be added to ${relDay(d).toLowerCase()}${existing ? `, on top of the ${existing} already logged` : ''}. Edit anything that differs.`,
    ok: 'Copy',
  });
  if (!ok) return;
  const now = Date.now();
  await saveMany('entries', from.map((e, i) => ({ ...e, id: uid(), date: d, createdAt: now + i, copied: true })));
  toast(`Copied ${from.length} items`);
  changed();
}

// ============================================================
// Actions
// ============================================================
on('food-day', el => {
  const n = +el.dataset.n;
  const next = addDays(foodDate(), n);
  if (next > today()) return;
  viewDate = next === today() ? null : next;
  changed();
});
on('food-add', el => openAdd(logTarget(el.dataset.meal), 'search'));
on('food-scan', () => openAdd(logTarget(), 'scan'));
on('food-manual', () => openAdd(logTarget(), 'manual'));
on('meals-open', () => openMealsSheet());
on('food-copy-yesterday', copyPrevious);
on('meal-from-section', el => saveSectionAsMeal(el.dataset.meal));
on('entry-edit', el => {
  const e = S.entries.find(x => x.id === el.dataset.id);
  if (!e) return;
  const food = { id: e.foodId || 'entry', name: e.name, brand: e.brand, per100: e.per100, fv: e.fv };
  openFoodDetail(food, { kind: 'log', date: e.date, meal: e.meal }, { entry: e });
});
