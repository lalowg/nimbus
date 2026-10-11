// NIMBUS — architecture story, incident drill, plans, migration, review form.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ---------- architecture: sticky layer stack ----------
function initArch() {
  const steps = $$('.arch-steps .step');
  const plates = $$('[data-stack] .plate');
  if (!steps.length) return;
  const set = (i) => {
    steps.forEach((s, k) => s.classList.toggle('is-active', k === i));
    plates.forEach((p, k) => { p.classList.toggle('is-active', k === i); p.classList.toggle('is-below', k > i); });
  };
  set(0);
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((en) => en.forEach((e) => { if (e.isIntersecting) set(Number(e.target.dataset.step)); }), { rootMargin: '-45% 0px -45% 0px' });
  steps.forEach((s) => io.observe(s));
}

// ---------- incident drill ----------
const EVENTS = [
  { t: 0, title: 'Steady state', text: 'Two zones share traffic evenly. The database primary lives in zone A with a synchronous replica in zone B.' },
  { t: 42, title: 'Zone A loses power', text: 'Four app instances and the database primary in zone A stop responding at the same moment.' },
  { t: 47, title: 'Health checks fail', text: 'After three missed checks, five seconds apart, the load balancer marks zone A unhealthy.' },
  { t: 58, title: 'Traffic drained', text: 'Every request now goes to zone B. Latency rises while four instances absorb the full load.' },
  { t: 90, title: 'Replica promoted', text: 'The zone B replica becomes the new primary. Writes resume; reads never stopped.' },
  { t: 130, title: 'Capacity restored', text: 'The autoscaler adds two instances in zone B and latency settles back towards normal.' },
  { t: 480, title: 'Zone A returns', text: 'Zone A rejoins as a standby. Traffic rebalances gradually so nothing is shocked twice.' }
];
const T_MAX = 600;
export function drillLatency(t) {
  if (t < 42) return 82;
  if (t < 58) return 82 + ((t - 42) / 16) * 140;
  if (t < 90) return 205;
  if (t < 130) return 205 - ((t - 90) / 40) * 95;
  if (t < 160) return 110 - ((t - 130) / 30) * 26;
  if (t < 480) return 84;
  if (t < 520) return 84 + Math.sin(((t - 480) / 40) * Math.PI) * 12;
  return 82;
}
const mmss = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function initDrill(reduced) {
  const range = $('[data-drill-range]');
  if (!range) return;
  const map = $('[data-drill-map]'), chart = $('[data-drill-chart]'), marks = $('[data-drill-marks]');
  const play = $('[data-drill-play]'), label = $('[data-drill-label]');
  const yOf = (lat) => 112 - ((lat - 40) / 220) * 104;
  let d = '';
  for (let t = 0; t <= T_MAX; t += 3) d += `${t ? 'L' : 'M'}${((t / T_MAX) * 1000).toFixed(1)} ${yOf(drillLatency(t)).toFixed(1)}`;
  $('.dc-line', chart).setAttribute('d', d);
  $('.dc-area', chart).setAttribute('d', `${d}L1000 120L0 120Z`);
  EVENTS.forEach((e) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dmark';
    b.style.left = `${(e.t / T_MAX) * 100}%`;
    b.setAttribute('aria-label', `Jump to T+${mmss(e.t)}: ${e.title}`);
    b.innerHTML = `<span>${mmss(e.t)}</span>`;
    b.addEventListener('click', () => { stop(); render(e.t); range.value = String(e.t); });
    marks.appendChild(b);
  });
  const markEls = $$('.dmark', marks);
  let lastIdx = -1;
  function render(t) {
    const idx = EVENTS.reduce((acc, e, i) => (t >= e.t ? i : acc), 0);
    const e = EVENTS[idx];
    if (idx !== lastIdx) {
      lastIdx = idx;
      $('[data-de-title]').textContent = e.title;
      $('[data-de-text]').textContent = e.text;
      markEls.forEach((m, i) => m.classList.toggle('is-past', i <= idx));
    }
    $('[data-de-time]').textContent = `T+${mmss(t)}`;
    $('[data-de-lat]').textContent = `${Math.round(drillLatency(t))} ms`;
    $('[data-de-inst]').textContent = t < 42 ? '8' : t < 130 ? '4' : t < 480 ? '6' : '6 + 4 standby';
    map.dataset.a = t >= 480 ? 'standby' : t >= 42 ? 'down' : 'ok';
    map.dataset.lb = t >= 58 && t < 480 ? 'cut' : t >= 42 && t < 480 ? 'failing' : 'ok';
    map.dataset.promoted = String(t >= 90);
    map.dataset.extra = String(t >= 130);
    $('[data-role-a]').textContent = t < 42 ? 'Primary' : t < 480 ? 'Offline' : 'Standby';
    $('[data-role-b]').textContent = t < 90 ? 'Replica' : 'Primary';
    const x = (t / T_MAX) * 1000;
    const head = $('.dc-head', chart);
    head.setAttribute('x1', x.toFixed(1)); head.setAttribute('x2', x.toFixed(1));
    range.setAttribute('aria-valuetext', `T plus ${mmss(t)}, ${e.title}`);
    range.style.setProperty('--p', String(t / T_MAX));
  }
  let raf = 0, timer = 0, last = 0, cur = 0;
  function stop() {
    cancelAnimationFrame(raf); clearInterval(timer); raf = 0; timer = 0;
    play.setAttribute('aria-pressed', 'false'); label.textContent = 'Play drill';
  }
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    cur += dt * 30;
    if (cur >= T_MAX) { cur = T_MAX; range.value = String(T_MAX); render(T_MAX); stop(); return; }
    range.value = String(Math.round(cur)); render(cur);
    raf = requestAnimationFrame(tick);
  }
  play.addEventListener('click', () => {
    if (raf || timer) { stop(); return; }
    if (Number(range.value) >= T_MAX) range.value = '0';
    play.setAttribute('aria-pressed', 'true'); label.textContent = 'Pause drill';
    if (reduced) {
      // step event to event instead of animating
      timer = setInterval(() => {
        const t = Number(range.value);
        const next = EVENTS.find((e) => e.t > t);
        if (!next) { range.value = String(T_MAX); render(T_MAX); stop(); return; }
        range.value = String(next.t); render(next.t);
      }, 1600);
    } else { cur = Number(range.value); last = performance.now(); raf = requestAnimationFrame(tick); }
  });
  range.addEventListener('input', () => { stop(); render(Number(range.value)); });
  render(0);
}

// ---------- plans ----------
function initPlans() {
  const table = $('[data-ptable]');
  if (!table) return;
  $$('[data-billing]').forEach((b) => b.addEventListener('click', () => {
    const annual = b.dataset.billing === 'annual';
    $$('[data-billing]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    $$('[data-price]', table).forEach((p) => {
      const base = Number(p.dataset.price);
      p.textContent = `€${annual ? Math.round(base * 0.85) : base}`;
      p.nextElementSibling.textContent = annual ? '/month, billed yearly' : '/month';
    });
  }));
  $$('[data-show]').forEach((b) => b.addEventListener('click', () => {
    $$('[data-show]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    table.dataset.show = b.dataset.show;
  }));
  document.addEventListener('nimbus:config', (e) => { table.dataset.fit = e.detail.plan; });
}

// ---------- migration accordion ----------
function initMigration() {
  $$('.mig-btn').forEach((b) => b.addEventListener('click', () => {
    const open = b.getAttribute('aria-expanded') !== 'true';
    b.setAttribute('aria-expanded', String(open));
    document.getElementById(b.getAttribute('aria-controls')).hidden = !open;
  }));
}

// ---------- review form ----------
function initReview() {
  const form = $('#review-form');
  if (!form) return;
  let summary = '';
  const sumEl = $('[data-config-summary]');
  document.addEventListener('nimbus:config', (e) => { summary = e.detail.summary; if (sumEl) sumEl.textContent = summary; });
  const F = { name: $('#r-name'), email: $('#r-email'), size: $('#r-size'), attach: $('#r-attach'), notes: $('#r-notes') };
  const rules = {
    'r-name': () => (F.name.value.trim().length < 2 ? 'Please enter your name.' : ''),
    'r-email': () => { const v = F.email.value.trim(); if (!v) return 'Please enter your work email.'; return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? '' : 'That email looks incomplete, for example name@company.com.'; },
    'r-size': () => (F.size.value ? '' : 'Please choose your team size.'),
    'r-now': () => (form.querySelector('input[name="now"]:checked') ? '' : 'Please choose where you run today.')
  };
  const show = (id, msg) => {
    const err = $(`#${id}-err`);
    err.textContent = msg; err.hidden = !msg;
    const input = document.getElementById(id);
    if (input) input.setAttribute('aria-invalid', String(!!msg));
    if (id === 'r-now') form.querySelector('fieldset').classList.toggle('is-invalid', !!msg);
  };
  [F.name, F.email].forEach((el) => {
    el.addEventListener('blur', () => { if (el.value) show(el.id, rules[el.id]()); });
    el.addEventListener('input', () => { if (el.getAttribute('aria-invalid') === 'true') show(el.id, rules[el.id]()); });
  });
  F.size.addEventListener('change', () => show('r-size', rules['r-size']()));
  $$('input[name="now"]', form).forEach((r) => r.addEventListener('change', () => show('r-now', '')));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let first = null;
    Object.keys(rules).forEach((id) => { const msg = rules[id](); show(id, msg); if (msg && !first) first = id; });
    if (first) { (document.getElementById(first) || form.querySelector('input[name="now"]')).focus(); return; }
    const done = $('[data-done]', form);
    done.innerHTML = '';
    const h = document.createElement('p'); h.className = 'done-h'; h.textContent = 'Request logged — in this tab only';
    const p = document.createElement('p'); p.textContent = `Thanks, ${F.name.value.trim().split(' ')[0]}. NIMBUS is a fictional service and this is a portfolio demo: nothing was sent and no session was booked.`;
    done.append(h, p);
    if (F.attach.checked && summary) {
      const pre = document.createElement('p'); pre.className = 'done-sum'; pre.textContent = summary; done.append(pre);
    }
    const again = document.createElement('button'); again.type = 'button'; again.className = 'btn btn-ghost'; again.textContent = 'Start over';
    again.addEventListener('click', () => { form.reset(); done.hidden = true; form.classList.remove('is-done'); F.name.focus(); });
    done.append(again);
    done.hidden = false;
    form.classList.add('is-done');
    done.focus();
  });
}

export function initSections({ reduced }) {
  initArch();
  initDrill(reduced);
  initPlans();
  initMigration();
  initReview();
}
