import { loadAll, getKV, setKV } from './db.js';
import { today, initActions, on, esc, fmtDate, dayName, ICON, $, $$, toast } from './util.js';
import { renderHome } from './home.js';
import { renderFood, resetFoodDate } from './food.js';
import { renderTrain, activeWorkout } from './train.js';
import { renderProgress } from './progress.js';
import { renderCoach } from './coach.js';
import { needsOnboarding, openOnboarding, openSettings } from './settings.js';
import { phaseInfo } from './state.js';

const VIEWS = {
  home: { title: () => 'Today', sub: () => `${dayName(today(), true)} ${fmtDate(today())}`, render: renderHome },
  food: { title: () => 'Food', render: renderFood },
  train: { title: () => (activeWorkout() ? 'Workout' : 'Train'), render: renderTrain },
  progress: { title: () => 'Progress', sub: () => 'Weekly weigh-ins · 4-weekly photos', render: renderProgress },
  coach: { title: () => 'Coach', sub: () => { const p = phaseInfo(); return p && p.started && !p.done ? `Day ${p.day} of ${p.total} · ${p.left} days left` : ''; }, render: renderCoach },
};

let current = null;
let lastDay = today();

function route() {
  const name = (location.hash || '#home').slice(1);
  return VIEWS[name] ? name : 'home';
}

function render(keepScroll) {
  const name = route();
  const v = VIEWS[name];
  if (name !== current) { if (current === 'food' || name === 'home') resetFoodDate(); }
  const y = keepScroll && name === current ? window.scrollY : 0;
  current = name;
  const sub = v.sub ? v.sub() : '';
  $('#topbar').innerHTML = `<div class="grow"><h1>${esc(v.title())}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>
    ${name === 'home' ? `<button class="icon-btn" data-act="settings" aria-label="Settings">${ICON.gear}</button>` : ''}`;
  const view = $('#view');
  try {
    v.render(view);
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="card"><b>Something went wrong rendering this screen.</b><p class="small muted" style="margin-top:6px">${esc(err.message)}</p><p class="small muted">Your data is safe. Try reloading.</p></div>`;
  }
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  window.scrollTo(0, y);
}

async function boot() {
  initActions();
  try {
    await loadAll();
  } catch (err) {
    $('#view').innerHTML = `<div class="card"><b>Storage unavailable</b><p class="small muted" style="margin-top:6px">${esc(err.message)}. Private browsing blocks storage — open the app normally.</p></div>`;
    return;
  }
  if (!getKV('installDate')) await setKV('installDate', today());
  $('#tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    if (location.hash === '#' + b.dataset.tab) { render(false); } else location.hash = '#' + b.dataset.tab;
  });
  window.addEventListener('hashchange', () => render(false));
  window.addEventListener('datachanged', () => render(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && today() !== lastDay) { lastDay = today(); render(false); }
  });
  setInterval(() => { if (today() !== lastDay) { lastDay = today(); render(true); } }, 60000);
  on('settings', () => openSettings());
  render(false);
  if (needsOnboarding()) openOnboarding();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw && nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('Update ready — reopen the app to load it.', 4000);
        });
      });
    }).catch(() => {});
  }
}

boot();
