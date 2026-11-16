import { S, getKV, setKV, exportAll, importAll, wipeAll, uid } from './db.js';
import { today, addDays, fmtDate, esc, num, r1, toast, openSheet, confirmSheet, closeAllSheets, on, changed, downloadFile, $, $$ } from './util.js';
import { settings, saveSettings, defaultCutPhase, macrosFromKcal, phaseInfo, sessions, schedule, SESSION_ORDER, currentBodyweight } from './state.js';
import { weightAnalysis } from './progress.js';

const COOL_OFF_HOURS = 24;

// ---------- first run ----------
export function needsOnboarding() { return !settings(); }

export function openOnboarding() {
  const s = openSheet({ title: 'Set up', full: true });
  s.el.querySelector('[data-sheet-close]').style.display = 'none';
  s.body.innerHTML = `
    <p style="margin-bottom:12px">This app is built around one rule: <b>commit to the plan and judge it by the weekly trend, not by the mirror</b>. Weigh-ins are Saturday only, photos every 4 weeks, and the home screen shows consistency, not body metrics.</p>
    <div class="card tight">
      <div class="eyebrow" style="margin-bottom:6px">Phase 1 · 8-week cut</div>
      <dl class="kv"><dt>Calories</dt><dd>2,600</dd><dt>Protein</dt><dd>200 g</dd><dt>Fat</dt><dd>75 g</dd><dt>Carbs</dt><dd>${macrosFromKcal(2600, 200, 75)} g</dd><dt>Target rate</dt><dd>−0.3 kg / week</dd><dt>Goal</dt><dd>~72 kg, 9–10% BF</dd></dl>
      <p class="xsmall muted" style="margin-top:8px">Carbs are calculated so the macros add up exactly to the calorie target.</p>
    </div>
    <label class="field"><span>Phase start date</span><input class="input" type="date" data-start value="${today()}"></label>
    <label class="field"><span>Current weight (kg) — your starting point</span><input class="input" data-w inputmode="decimal" value="74"></label>
    <div class="card tight small muted">Training split: Push A, Pull A, Legs A, Push B, Pull B, Legs B, Monday to Saturday, Sunday rest. No overhead pressing. You can change the weekday mapping and exercises later.</div>
    <button class="btn primary block" data-go style="margin-top:12px">Start the phase</button>`;
  $('[data-go]', s.body).addEventListener('click', async () => {
    const start = $('[data-start]', s.body).value || today();
    const w = num($('[data-w]', s.body).value) || 74;
    await saveSettings({ restSeconds: 120, phase: defaultCutPhase(start, r1(w)), phaseHistory: [] });
    if (!getKV('installDate')) await setKV('installDate', today());
    s.close(); changed();
    toast('Phase started. Log your first meal.');
  });
}

// ---------- settings sheet ----------
export function openSettings() {
  const st = settings();
  const p = st.phase;
  const pi = phaseInfo();
  const ss = sessions();
  const sch = schedule();
  const days = [[1, 'Monday'], [2, 'Tuesday'], [3, 'Wednesday'], [4, 'Thursday'], [5, 'Friday'], [6, 'Saturday'], [0, 'Sunday']];
  const s = openSheet({ title: 'Settings', full: true });
  s.body.innerHTML = `
    <div class="section-title" style="margin-top:4px">Current phase</div>
    <div class="card tight">
      <div style="font-weight:700;margin-bottom:6px">${esc(p.name)}</div>
      <dl class="kv">
        <dt>Dates</dt><dd>${fmtDate(p.start)} – ${fmtDate(pi.end)}</dd>
        <dt>Progress</dt><dd>${pi.started ? `Day ${pi.day} of ${pi.total}` : 'Not started'}</dd>
        <dt>Calories</dt><dd>${p.kcal.toLocaleString()}</dd>
        <dt>Protein / fat / carbs</dt><dd>${p.protein} / ${p.fat} / ${p.carbs} g</dd>
        <dt>Target rate</dt><dd>${p.rateTarget > 0 ? '+' : ''}${p.rateTarget} kg/wk</dd>
        <dt>Goal weight</dt><dd>${p.goalWeight || '—'} kg</dd>
        ${(p.adjustments || []).length ? `<dt>Adjustments</dt><dd>${p.adjustments.map(a => `${a.delta > 0 ? '+' : ''}${a.delta} (${fmtDate(a.date)})`).join(', ')}</dd>` : ''}
      </dl>
      <p class="xsmall muted" style="margin-top:8px">Calories change only through the weekly-trend recommendation on the Progress tab.</p>
      <button class="btn block" data-act="change-plan" style="margin-top:10px">Change plan / start new phase</button>
    </div>

    <div class="section-title">Training days</div>
    <div class="card tight">${days.map(([d, name]) => `<label class="spread" style="padding:4px 0"><span>${name}</span>
      <select class="input" style="width:150px;min-height:40px" data-day="${d}"><option value="">Rest</option>${Object.keys(ss).map(id => `<option value="${id}" ${sch[d] === id ? 'selected' : ''}>${esc(ss[id].name)}</option>`).join('')}</select></label>`).join('')}
    </div>

    <div class="section-title">Workout</div>
    <div class="card tight"><label class="spread"><span>Rest timer (seconds)</span><input class="input" style="width:100px;text-align:center" data-rest inputmode="numeric" value="${st.restSeconds || 120}"></label></div>

    <div class="section-title">Backup</div>
    <div class="card tight">
      <p class="small muted" style="margin-bottom:10px">Everything lives only on this phone. Export a backup now and then (save it to Files or iCloud Drive).</p>
      <div class="toggle"><span>Include photos</span><label class="switch"><input type="checkbox" data-photos><i></i></label></div>
      <div class="btn-grid"><button class="btn" data-act="export">Export JSON</button><label class="btn">Import<input type="file" accept="application/json,.json" data-import hidden></label></div>
    </div>

    <div class="section-title">Install</div>
    <div class="card tight small muted">In Safari: tap Share, then “Add to Home Screen”. Open it from the icon — it runs full screen and works offline.</div>

    <div class="section-title">Danger zone</div>
    <button class="btn danger block" data-act="wipe">Delete all data</button>
    <p class="xsmall faint center" style="margin-top:16px">Food data from Open Food Facts (openfoodfacts.org), ODbL.</p>`;
  s.body.addEventListener('change', async e => {
    if (e.target.matches('[data-day]')) {
      const next = { ...schedule(), [e.target.dataset.day]: e.target.value || null };
      await setKV('schedule', next); toast('Schedule saved'); changed();
    }
    if (e.target.matches('[data-rest]')) { const v = Math.max(15, Math.min(600, num(e.target.value) || 120)); st.restSeconds = v; await saveSettings(st); toast('Saved'); }
    if (e.target.matches('[data-import]') && e.target.files[0]) {
      try {
        const json = JSON.parse(await e.target.files[0].text());
        if (!(await confirmSheet({ title: 'Replace all data?', message: `This replaces everything on this phone with the backup from ${esc((json.exportedAt || '').slice(0, 10))}.`, ok: 'Replace', danger: true }))) return;
        await importAll(json); closeAllSheets(); changed(); toast('Backup restored');
      } catch (err) { toast(err.message || 'Import failed'); }
    }
  });
}

on('export', async el => {
  const withPhotos = !!$('[data-photos]', el.closest('.sheet'))?.checked;
  toast('Preparing backup…');
  const data = await exportAll(withPhotos);
  downloadFile(`physique-backup-${today()}.json`, JSON.stringify(data));
  await setKV('lastExport', today());
});
on('wipe', async () => {
  if (!(await confirmSheet({ title: 'Delete everything?', message: 'All food logs, workouts, weigh-ins and photos on this phone will be erased. Export first if you might want them.', ok: 'Delete all', danger: true }))) return;
  if (!(await confirmSheet({ title: 'Really?', message: 'This cannot be undone.', ok: 'Yes, delete', danger: true }))) return;
  await wipeAll(); closeAllSheets(); changed(); location.reload();
});

// ---------- plan switching (with deliberate friction) ----------
on('change-plan', () => {
  const pi = phaseInfo();
  const req = getKV('switchRequest', null);
  const hoursSince = req ? (Date.now() - req.at) / 36e5 : 0;
  if (!pi.started || pi.done || pi.left <= 14 || (req && req.phaseId === pi.p.id && hoursSince >= COOL_OFF_HOURS)) { openPhaseEditor(); return; }
  const a = weightAnalysis();
  const wtLine = a.status ? `Your weight trend is <b>${a.status}</b> (${a.rate > 0 ? '+' : ''}${r1(a.rate)} kg/wk vs ${a.target}). ${a.delta ? 'The fix for that is a 150 kcal adjustment on the Progress tab — not a new plan.' : 'Nothing in the data says the plan needs changing.'}` : 'There is not enough weigh-in data yet to judge this plan at all. That alone means it is too early to change it.';
  const pending = req && req.phaseId === pi.p.id;
  const s = openSheet({
    title: 'Before you switch',
    body: `
      <div class="lock" style="padding-top:4px"><div class="big">${pi.left}</div><div class="muted">days left of ${pi.total} · day ${pi.day}</div></div>
      <p style="margin-bottom:10px">You have changed plans every few weeks before, and that is the reason progress kept resetting — not the plans themselves. Switching now restarts the phase clock, and throws away ${pi.day} days of trend data the calorie adjustments depend on.</p>
      <p class="small muted" style="margin-bottom:10px">${wtLine}</p>
      <p class="small muted" style="margin-bottom:14px">Plan changes unlock freely in the last 14 days (from ${fmtDate(addDays(pi.end, -14))}). Before that, a switch needs a ${COOL_OFF_HOURS}-hour cooling-off period — most urges to switch are gone by the next day.</p>
      <button class="btn primary block" data-keep>Keep the plan</button>
      ${pending ? `<p class="small center muted" style="margin-top:12px">Switch requested ${Math.floor(hoursSince)}h ago. Unlocks in ${Math.ceil(COOL_OFF_HOURS - hoursSince)}h.</p><button class="btn ghost block" data-cancel style="margin-top:6px">Cancel the request</button>`
        : '<button class="btn ghost block" data-req style="margin-top:8px">Request a switch (unlocks in 24h)</button>'}`,
  });
  s.body.addEventListener('click', async e => {
    if (e.target.closest('[data-keep]')) { s.close(); toast(`Good. ${pi.left} days to go.`); }
    if (e.target.closest('[data-req]')) { await setKV('switchRequest', { at: Date.now(), phaseId: pi.p.id }); s.close(); toast('Request logged. Come back tomorrow if you still want it.', 3500); }
    if (e.target.closest('[data-cancel]')) { await setKV('switchRequest', null); s.close(); toast('Request cancelled. Staying the course.'); }
  });
});

function openPhaseEditor() {
  const st = settings();
  const cur = st.phase;
  const pi = phaseInfo();
  const a = weightAnalysis();
  // Estimate maintenance from the observed rate: each 0.1 kg/week ≈ 110 kcal/day.
  const maint = a.rate != null && a.n >= 3 ? Math.round((cur.kcal - (a.rate * 7700) / 7) / 50) * 50 : null;
  const presets = {
    bulk: { type: 'bulk', name: 'Lean bulk', weeks: 16, kcal: maint ? maint + 200 : cur.kcal + 450, protein: 180, fat: 80, rateTarget: 0.25, goalWeight: 80 },
    cut: { type: 'cut', name: 'Cut', weeks: 8, kcal: cur.kcal, protein: 200, fat: 75, rateTarget: -0.3, goalWeight: cur.goalWeight },
    maintain: { type: 'maintain', name: 'Maintenance', weeks: 4, kcal: maint || cur.kcal + 300, protein: 180, fat: 80, rateTarget: 0, goalWeight: null },
  };
  const s = openSheet({ title: 'New phase', full: true });
  const render = pr => {
    s.body.innerHTML = `
      ${pi.done ? '<p class="small good" style="margin-bottom:8px">Current phase complete. Set up the next one.</p>' : ''}
      ${maint ? `<p class="small muted" style="margin-bottom:8px">Estimated maintenance from your trend: ~${maint.toLocaleString()} kcal.</p>` : ''}
      <div class="seg" data-type style="margin-bottom:8px">${Object.keys(presets).map(k => `<button type="button" data-k="${k}" class="${pr.type === k ? 'on' : ''}">${presets[k].name}</button>`).join('')}</div>
      <label class="field"><span>Name</span><input class="input" data-f="name" value="${esc(pr.name)}"></label>
      <div class="grid2"><label class="field"><span>Start</span><input class="input" type="date" data-f="start" value="${today()}"></label>
      <label class="field"><span>Length (weeks)</span><input class="input" data-f="weeks" inputmode="numeric" value="${pr.weeks}"></label></div>
      <div class="grid2"><label class="field"><span>Calories</span><input class="input" data-f="kcal" inputmode="numeric" value="${pr.kcal}"></label>
      <label class="field"><span>Protein (g)</span><input class="input" data-f="protein" inputmode="numeric" value="${pr.protein}"></label></div>
      <div class="grid2"><label class="field"><span>Fat (g)</span><input class="input" data-f="fat" inputmode="numeric" value="${pr.fat}"></label>
      <label class="field"><span>Target rate (kg/wk)</span><input class="input" data-f="rateTarget" inputmode="decimal" value="${pr.rateTarget}"></label></div>
      <div class="grid2"><label class="field"><span>Goal weight</span><input class="input" data-f="goalWeight" inputmode="decimal" value="${pr.goalWeight || ''}"></label>
      <label class="field"><span>Start weight</span><input class="input" data-f="startWeight" inputmode="decimal" value="${currentBodyweight()}"></label></div>
      <p class="small muted" data-carbs></p>
      <button class="btn primary block" data-save style="margin-top:8px">Start this phase</button>`;
    const upd = () => { const g = n => num($(`[data-f="${n}"]`, s.body).value); $('[data-carbs]', s.body).textContent = `Carbs: ${macrosFromKcal(g('kcal'), g('protein'), g('fat'))} g (calculated)`; };
    s.body.oninput = upd; upd();
  };
  render(presets[cur.type === 'cut' && pi.done ? 'bulk' : cur.type] || presets.bulk);
  s.body.addEventListener('click', async e => {
    const t = e.target.closest('[data-k]');
    if (t) { render(presets[t.dataset.k]); return; }
    if (e.target.closest('[data-save]')) {
      const g = n => $(`[data-f="${n}"]`, s.body).value;
      const type = $('[data-type] .on', s.body).dataset.k;
      const ph = {
        id: uid(), type, name: g('name') || presets[type].name, start: g('start') || today(), weeks: Math.max(1, Math.round(num(g('weeks')))),
        kcal: Math.round(num(g('kcal'))), protein: Math.round(num(g('protein'))), fat: Math.round(num(g('fat'))),
        rateTarget: num(g('rateTarget')), goalWeight: num(g('goalWeight')) || null, startWeight: num(g('startWeight')) || currentBodyweight(), adjustments: [],
      };
      ph.carbs = macrosFromKcal(ph.kcal, ph.protein, ph.fat);
      if (ph.kcal < 1200) { toast('Calories look wrong'); return; }
      st.phaseHistory = [...(st.phaseHistory || []), { ...cur, endedAt: today() }];
      st.phase = ph;
      await saveSettings(st);
      await setKV('switchRequest', null);
      closeAllSheets(); changed(); toast(`${ph.name} started`);
    }
  });
}
