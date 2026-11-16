import { S, save, remove, uid, savePhoto, photoBlob, getKV, setKV } from './db.js';
import { today, addDays, weekday, diffDays, nextWeekday, fmtDate, relDay, esc, r1, r0, num, sign, toast, openSheet, confirmSheet, on, changed, $, $$ } from './util.js';
import { phase, phaseInfo, settings, saveSettings, macrosFromKcal } from './state.js';
import { lineChart, linreg } from './charts.js';

const WEIGH_DAY = 6; // Saturday
const PHOTO_EVERY = 28;
const POSES = [['front', 'Front'], ['side', 'Side'], ['back', 'Back']];

// ---------- weight trend & recommendation ----------
export function weightPoints() {
  const p = phase();
  const pts = [...S.weights].sort((a, b) => (a.date < b.date ? -1 : 1)).map(w => ({ x: w.date, y: w.kg }));
  if (p && p.startWeight && !pts.some(x => x.x <= p.start)) pts.unshift({ x: p.start, y: p.startWeight, start: true });
  return pts;
}
export function phasePoints() {
  const p = phase();
  return weightPoints().filter(x => !p || x.x >= p.start);
}

// Weekly rate = regression slope over the last 4 weigh-ins of this phase (kg/week).
export function weightAnalysis() {
  const p = phase();
  const pts = phasePoints();
  const recent = pts.slice(-4);
  const lr = linreg(recent);
  const rate = lr ? lr.slope * 7 : null;
  const target = p ? p.rateTarget : -0.3;
  const tol = 0.15;
  let status = null, rec = null, delta = 0;
  if (rate != null && pts.length >= 2) {
    if (target < 0) {
      if (rate > target + tol) { status = 'behind'; delta = -150; }
      else if (rate < target - tol) { status = 'ahead'; delta = 150; }
      else status = 'on track';
    } else {
      if (rate < target - tol) { status = 'behind'; delta = 150; }
      else if (rate > target + tol) { status = 'ahead'; delta = -150; }
      else status = 'on track';
    }
    rec = delta === 0 ? 'Hold calories where they are.' : delta > 0 ? 'Add 150 kcal per day (from carbs).' : 'Cut 150 kcal per day (from carbs).';
  }
  const lastAdj = p && p.adjustments && p.adjustments.length ? p.adjustments[p.adjustments.length - 1] : null;
  const canAdjust = delta !== 0 && (!lastAdj || diffDays(today(), lastAdj.date) >= 7) && pts.length >= 3;
  let projected = null;
  const pi = phaseInfo();
  if (rate != null && pts.length >= 2 && pi) {
    const last = pts[pts.length - 1];
    projected = last.y + rate * (diffDays(pi.end, last.x) / 7);
  }
  return { pts, rate, target, status, rec, delta, canAdjust, lastAdj, projected, n: pts.length };
}

export function weighInState() {
  const t = today();
  const isDay = weekday(t) === WEIGH_DAY;
  const todays = S.weights.find(w => w.date === t);
  const next = isDay ? t : nextWeekday(addDays(t, 1), WEIGH_DAY);
  return { isDay, todays, next, daysToNext: diffDays(next, t) };
}

// ---------- photo schedule ----------
export function photoSets() {
  const by = {};
  for (const p of S.photos) (by[p.setId] = by[p.setId] || { id: p.setId, date: p.date, photos: [] }).photos.push(p);
  return Object.values(by).sort((a, b) => (a.date < b.date ? -1 : 1));
}
export function photoState() {
  const sets = photoSets();
  const last = sets[sets.length - 1];
  const t = today();
  if (!last) return { due: true, sets, last: null, daysLeft: 0, next: t };
  const next = addDays(last.date, PHOTO_EVERY);
  const daysLeft = diffDays(next, t);
  // A set taken today stays open (add/replace poses) and its comparison stays visible for 2 days.
  const open = last.date === t;
  const reviewWindow = diffDays(t, last.date) <= 2;
  return { due: daysLeft <= 0, open, reviewWindow, sets, last, daysLeft, next };
}

// ---------- view ----------
export function renderProgress(view) {
  const pi = phaseInfo();
  view.innerHTML = `
    ${weighCard()}
    ${trendCard()}
    ${photoCard()}
    ${pi ? `<div class="card tight small muted">Weigh-ins are Saturday only and photos every 4 weeks. Daily numbers are mostly water, salt and gut content; checking them more often gives you noise to react to, not information.</div>` : ''}`;
  hydratePhotos(view);
}

function weighCard() {
  const w = weighInState();
  if (!w.isDay) {
    return `<div class="card"><div class="card-h"><h2>Weigh-in</h2><span class="meta">Saturdays only</span></div>
      <div class="lock"><div class="big">${w.daysToNext}</div><div class="muted">${w.daysToNext === 1 ? 'day' : 'days'} until ${dayLabel(w.next)}</div></div>
      <p class="small muted">Daily weight swings 0.5–1.5 kg from water, salt, carbs and food still in your gut. One weigh-in a week, same conditions, and the trend across weeks is the signal. Logging mid-week only gives you noise to react to.</p>
      <button class="btn block ghost" data-act="weigh-try" style="margin-top:10px">Log weight</button></div>`;
  }
  return `<div class="card"><div class="card-h"><h2>Saturday weigh-in</h2><span class="meta">${w.todays ? 'Logged' : 'Due today'}</span></div>
    <p class="small muted" style="margin-bottom:8px">Morning, after the toilet, before food or water, same scale.</p>
    <div class="row"><input class="input big grow" data-wkg inputmode="decimal" placeholder="kg" value="${w.todays ? w.todays.kg : ''}"><button class="btn primary" data-act="weigh-save" style="min-height:64px">${w.todays ? 'Update' : 'Save'}</button></div></div>`;
}
const dayLabel = k => (k === addDays(today(), 1) ? 'tomorrow (Saturday)' : `Saturday ${fmtDate(k)}`);

function trendCard() {
  const a = weightAnalysis();
  const p = phase();
  if (a.n < 1) return '';
  const lr = linreg(a.pts);
  const trend = lr && a.n >= 2 ? [{ x: a.pts[0].x, y: lr.at(a.pts[0].x) }, { x: a.pts[a.n - 1].x, y: lr.at(a.pts[a.n - 1].x) }] : [];
  const tgt = p ? [{ x: p.start, y: p.startWeight }, { x: phaseInfo().end, y: p.startWeight + p.rateTarget * p.weeks }] : [];
  const statusCls = a.status === 'on track' ? 'good' : a.status ? 'warn' : '';
  return `<div class="card">
    <div class="card-h"><h2>Weight trend</h2><span class="meta">${a.n} weigh-in${a.n > 1 ? 's' : ''}</span></div>
    ${lineChart({ series: [{ points: tgt, color: 'var(--faint)', dashed: true, dots: false, width: 1.5 }, { points: a.pts, color: 'var(--text)' }, { points: trend, color: 'var(--accent)', dots: false }], yFmt: v => r1(v), minRangeY: 2 })}
    <div class="legend"><span><i style="background:var(--text)"></i>Weekly weight</span><span><i style="background:var(--accent)"></i>Trend</span><span><i style="background:var(--faint)"></i>Target path</span></div>
    <div class="hr"></div>
    ${a.rate == null || a.n < 2 ? '<p class="small muted">Two weigh-ins are needed before a rate means anything.</p>' : `
      <dl class="kv">
        <dt>Rate (last ${Math.min(4, a.n)} weigh-ins)</dt><dd>${sign(r1(a.rate))} kg/wk</dd>
        <dt>Target rate</dt><dd>${sign(a.target)} kg/wk</dd>
        <dt>Status</dt><dd class="${statusCls}">${a.status}</dd>
        ${a.projected != null ? `<dt>Projected at phase end</dt><dd>${r1(a.projected)} kg${p && p.goalWeight ? ` (goal ${p.goalWeight})` : ''}</dd>` : ''}
      </dl>
      <p style="margin-top:10px;font-weight:600">${esc(a.rec)}</p>
      ${a.delta !== 0 ? (a.canAdjust
        ? `<button class="btn primary block" data-act="apply-adjust" style="margin-top:10px">Apply: ${a.delta > 0 ? 'add' : 'cut'} 150 kcal → ${p.kcal + a.delta} kcal</button>`
        : `<p class="small muted" style="margin-top:6px">${a.n < 3 ? 'Wait for a third weigh-in before changing calories — early cut weeks include water loss that exaggerates the rate.' : `Last change was ${relDay(a.lastAdj.date).toLowerCase()}. Give any change 7+ days to show in the trend before adjusting again.`}</p>`) : ''}
    `}
  </div>`;
}

function photoCard() {
  const ps = photoState();
  if (!ps.last) {
    return `<div class="card"><div class="card-h"><h2>Progress photos</h2><span class="meta">Baseline</span></div>
      <p class="small muted" style="margin-bottom:10px">Take a baseline set now: front, side, back. Same spot, same light, same time of day, relaxed. The next set unlocks in 4 weeks.</p>
      ${poseSlots(null)}</div>`;
  }
  if (ps.open || ps.due) {
    const setId = ps.open ? ps.last.id : null;
    const prev = ps.open ? ps.sets[ps.sets.length - 2] : ps.last;
    return `<div class="card"><div class="card-h"><h2>Progress photos</h2><span class="meta">${ps.open ? 'Taken today' : 'Due'}</span></div>
      <p class="small muted" style="margin-bottom:10px">${ps.open ? 'Add or retake any pose today.' : 'Four weeks are up. Match the conditions of your last set.'}</p>
      ${poseSlots(setId)}
      ${prev && ps.open ? compareBlock(prev, ps.last) : ''}</div>`;
  }
  if (ps.reviewWindow && ps.sets.length > 1) {
    return `<div class="card"><div class="card-h"><h2>Progress photos</h2><span class="meta">Next in ${ps.daysLeft} days</span></div>
      ${compareBlock(ps.sets[ps.sets.length - 2], ps.last)}</div>`;
  }
  return `<div class="card"><div class="card-h"><h2>Progress photos</h2><span class="meta">${ps.sets.length} set${ps.sets.length > 1 ? 's' : ''} stored</span></div>
    <div class="lock"><div class="big">${ps.daysLeft}</div><div class="muted">days until the next set (${fmtDate(ps.next, { weekday: true })})</div></div>
    <p class="small muted">Visible change takes weeks. Looking more often shows you lighting, pump and water, and that is what drives plan-hopping. Photos are locked until then.</p></div>`;
}

function poseSlots(setId) {
  return `<div class="photo-grid" style="grid-template-columns:repeat(3,1fr)">${POSES.map(([id, name]) => {
    const p = setId && S.photos.find(x => x.setId === setId && x.pose === id);
    return `<label class="pose-slot">${p ? `<img data-photo="${p.id}" alt="${name}">` : `<span>+ ${name}</span>`}
      <input type="file" accept="image/*" data-pose="${id}" data-set="${setId || ''}"></label>`;
  }).join('')}</div>`;
}

function compareBlock(a, b) {
  return `<div class="section-title">${fmtDate(a.date)} vs ${fmtDate(b.date)} · ${Math.round(diffDays(b.date, a.date) / 7)} weeks</div>
    ${POSES.map(([id, name]) => {
      const pa = a.photos.find(x => x.pose === id), pb = b.photos.find(x => x.pose === id);
      if (!pa && !pb) return '';
      return `<div class="photo-grid" style="margin-bottom:10px">
        <figure>${pa ? `<img data-photo="${pa.id}" alt="">` : '<div class="pose-slot">none</div>'}<figcaption>${name} · ${fmtDate(a.date)}</figcaption></figure>
        <figure>${pb ? `<img data-photo="${pb.id}" alt="">` : '<div class="pose-slot">none</div>'}<figcaption>${name} · ${fmtDate(b.date)}</figcaption></figure></div>`;
    }).join('')}`;
}

const urlCache = new Map();
async function hydratePhotos(root) {
  for (const img of $$('img[data-photo]', root)) {
    const id = img.dataset.photo;
    let url = urlCache.get(id);
    if (!url) { const b = await photoBlob(id); if (!b) continue; url = URL.createObjectURL(b); urlCache.set(id, url); }
    img.src = url;
  }
}

function downscale(file, max = 1280) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

document.addEventListener('change', async e => {
  const inp = e.target.closest('input[type=file][data-pose]');
  if (!inp || !inp.files || !inp.files[0]) return;
  const ps = photoState();
  if (!ps.due && !ps.open) { toast('Photos are locked until the next 4-week mark.'); return; }
  try {
    const blob = await downscale(inp.files[0]);
    const setId = inp.dataset.set || (ps.open ? ps.last.id : uid());
    const old = S.photos.find(x => x.setId === setId && x.pose === inp.dataset.pose);
    const id = old ? old.id : uid();
    urlCache.delete(id);
    await savePhoto({ id, setId, date: today(), pose: inp.dataset.pose }, blob);
    toast('Photo saved on this device');
    changed();
  } catch (err) { toast('Could not save that photo'); }
});

// ---------- actions ----------
on('weigh-try', () => {
  const w = weighInState();
  openSheet({
    title: 'Not today',
    body: `<p style="margin-bottom:10px">Weigh-ins are Saturday only. Next one is ${dayLabel(w.next)}, in ${w.daysToNext} ${w.daysToNext === 1 ? 'day' : 'days'}.</p>
      <p class="muted small">A single day's weight can move 1 kg or more on nothing: a salty dinner, more carbs, less sleep, a late meal, or simply when you last went to the toilet. At a 0.3 kg/week target, that noise is three weeks of real change. One weigh-in a week under the same conditions removes most of it, and the trend across several weeks is what the calorie recommendations use. Checking mid-week will not change what you should do today: hit your calories and protein, and train.</p>`,
  });
});
on('weigh-save', async el => {
  const v = num($('[data-wkg]', el.closest('.card')).value);
  if (weekday(today()) !== WEIGH_DAY) { toast('Saturday only'); return; }
  if (v < 30 || v > 250) { toast('Enter your weight in kg'); return; }
  await save('weights', { date: today(), kg: r1(v) });
  toast('Weigh-in saved'); changed();
});
on('apply-adjust', async () => {
  const a = weightAnalysis();
  if (!a.canAdjust) return;
  const st = settings();
  const p = st.phase;
  const ok = await confirmSheet({
    title: `${a.delta > 0 ? 'Add' : 'Cut'} 150 kcal?`,
    message: `Rate is ${sign(r1(a.rate))} kg/wk against a ${sign(p.rateTarget)} target. Calories go from ${p.kcal} to ${p.kcal + a.delta}; carbs from ${p.carbs}g to ${macrosFromKcal(p.kcal + a.delta, p.protein, p.fat)}g. Protein and fat stay. This is an adjustment, not a new plan — the phase clock keeps running.`,
    ok: 'Apply',
  });
  if (!ok) return;
  p.kcal += a.delta;
  p.carbs = macrosFromKcal(p.kcal, p.protein, p.fat);
  p.adjustments = [...(p.adjustments || []), { date: today(), delta: a.delta, rate: r1(a.rate) }];
  await saveSettings(st);
  toast(`Target now ${p.kcal} kcal`); changed();
});
