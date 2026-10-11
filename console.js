// NIMBUS — live topology console: DOM nodes over a canvas of orthogonal links and packets.
import { simulate, layout, route, polyLength, pointAt, pickRoute, nodeInfo, fmt, REGIONS, PRESETS, EDGE_OFFLOAD } from './sim.js';

const ICONS = {
  users: '<circle cx="7" cy="7" r="3"/><circle cx="14.5" cy="8" r="2.3"/><path d="M2 17c0-3 2.3-5 5-5s5 2 5 5M12 16.5c.3-2.3 1.6-3.6 3.4-3.6 2 0 3.3 1.5 3.3 3.8"/>',
  edge: '<circle cx="10" cy="10" r="7.5"/><path d="M2.5 10h15M10 2.5c-2.4 2.2-3.4 4.7-3.4 7.5s1 5.3 3.4 7.5c2.4-2.2 3.4-4.7 3.4-7.5S12.4 4.7 10 2.5"/>',
  lb: '<path d="M2 10h5M7 10l4-5h7M7 10h11M7 10l4 5h7"/><circle cx="7" cy="10" r="1.6"/>',
  app: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="11" y="3" width="6" height="6" rx="1"/><rect x="3" y="11" width="6" height="6" rx="1"/><rect x="11" y="11" width="6" height="6" rx="1"/>',
  cache: '<path d="M11 2 4 11h5l-1 7 7-9h-5z"/>',
  work: '<path d="M3 5h9M3 10h9M3 15h9M14 7l3 3-3 3"/>',
  db: '<ellipse cx="10" cy="4.5" rx="6.5" ry="2.5"/><path d="M3.5 4.5v11c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-11M3.5 10c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5"/>'
};
const STATUS_WORD = { ok: 'healthy', busy: 'under pressure', down: 'degraded' };
const clock = () => new Date().toLocaleTimeString('en-GB', { hour12: false });

export function initConsole({ root, reduced }) {
  const area = root.querySelector('[data-topo]');
  const canvas = area.querySelector('canvas');
  const layer = area.querySelector('[data-nodes]');
  const ctx = canvas.getContext('2d');
  const form = root.querySelector('[data-config]');
  const logEl = root.querySelector('[data-log]');
  const insp = root.querySelector('[data-inspector]');
  const summaryEl = root.querySelector('[data-route-summary]');
  const spark = root.querySelector('[data-spark]');
  const sctx = spark ? spark.getContext('2d') : null;
  const trafficEl = root.querySelector('#c-traffic');
  const announceEl = root.querySelector('[data-announce]');

  const css = getComputedStyle(document.documentElement);
  const C = {
    sky: css.getPropertyValue('--sky').trim() || '#3FA9F5',
    signal: css.getPropertyValue('--signal').trim() || '#2EE59D',
    white: '#F5F9FF', coral: '#FF6B6B', line: 'rgba(245,249,255,0.3)'
  };

  let cfg = { ...PRESETS.growth };
  let m = simulate(cfg);
  let lay = null;
  let orient = 'h';
  let W = 1, H = 1, dpr = 1;
  let selected = null;
  let visible = true, raf = 0, last = performance.now(), dirty = true;
  let spawnAcc = 0, replAcc = 0, sampleAcc = 0;
  const nodes = new Map();
  const links = new Map();
  let packets = [];
  const history = Array.from({ length: 64 }, () => m.p95);
  const shown = {};

  // ---------- nodes ----------
  function makeNode(n) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `node k-${n.kind}`;
    el.dataset.id = n.id;
    el.innerHTML = `<span class="n-ico" aria-hidden="true"><svg viewBox="0 0 20 20">${ICONS[n.kind]}</svg></span><span class="n-txt"><span class="n-name"></span><span class="n-meta"></span></span><span class="n-dot" aria-hidden="true"></span><span class="n-pips" aria-hidden="true"></span>`;
    el.addEventListener('click', () => select(selected === n.id ? null : n.id));
    layer.appendChild(el);
    return { id: n.id, el, x: n.x, y: n.y, w: n.w, h: n.h, tx: n.x, ty: n.y, tw: n.w, th: n.h, a: reduced ? 1 : 0, ta: 1, n };
  }
  function paintNode(o) {
    const info = nodeInfo(o.n, cfg, m);
    o.info = info;
    const el = o.el;
    const narrow = o.n.w < 112;
    el.classList.toggle('is-narrow', narrow);
    el.querySelector('.n-name').textContent = narrow ? info.short || info.name : info.name;
    el.querySelector('.n-meta').textContent = info.meta;
    el.dataset.status = info.status;
    el.classList.toggle('is-compact', !!o.n.compact);
    const pips = el.querySelector('.n-pips');
    if (info.pips) {
      const want = Math.min(info.pips, 12);
      let html = '';
      for (let i = 0; i < want; i++) html += `<i class="${i >= want - (info.bad || 0) ? 'bad' : ''}"></i>`;
      pips.innerHTML = html;
    } else pips.innerHTML = '';
    const reg = o.n.region != null ? `, ${REGIONS[o.n.region].name}` : '';
    el.setAttribute('aria-label', `${info.name}${reg}: ${info.meta}. ${STATUS_WORD[info.status]}. Inspect component.`);
    el.setAttribute('aria-pressed', String(selected === o.id));
  }

  function relayout(snap = false) {
    orient = W < 640 ? 'v' : 'h';
    if (orient === 'v') {
      const rows = 4 + (cfg.cdn ? 1 : 0) + (cfg.cache || cfg.async ? 1 : 0);
      const want = rows * 94 + 24;
      if (Math.abs(area.offsetHeight - want) > 2) area.style.height = `${want}px`;
    } else if (area.style.height) area.style.height = '';
    lay = layout(cfg, W, H, orient);
    const seen = new Set();
    lay.nodes.forEach((n) => {
      seen.add(n.id);
      let o = nodes.get(n.id);
      if (!o) { o = makeNode(n); nodes.set(n.id, o); }
      o.n = n; o.tx = n.x; o.ty = n.y; o.tw = n.w; o.th = n.h; o.ta = 1; o.dying = false;
      if (snap || reduced) { o.x = n.x; o.y = n.y; o.w = n.w; o.h = n.h; o.a = 1; }
      paintNode(o);
    });
    nodes.forEach((o, id) => { if (!seen.has(id)) { o.ta = 0; o.dying = true; o.el.disabled = true; o.el.tabIndex = -1; if (reduced) o.a = 0; } });
    const keys = new Set(lay.links.map((l) => l.key));
    lay.links.forEach((l, i) => {
      const old = links.get(l.key);
      if (old) { old.dead = false; old.kind = l.kind; old.idx = l.kind === 'repl' ? Number(l.to.split('-')[1]) - 1 : 0; }
      else links.set(l.key, { ...l, idx: l.kind === 'repl' ? Number(l.to.split('-')[1]) - 1 : 0, prog: snap || reduced ? 1 : 0, dead: false });
    });
    links.forEach((l, k) => { if (!keys.has(k)) { l.dead = true; if (reduced) links.delete(k); } });
    packets = packets.filter((p) => p.path.every((id) => lay.nodes.some((n) => n.id === id)));
    // reorder DOM so tab order follows the flow of traffic
    lay.nodes.forEach((n) => layer.appendChild(nodes.get(n.id).el));
    nodes.forEach((o) => { if (o.dying) layer.appendChild(o.el); });
    dirty = true;
  }

  // ---------- inspector ----------
  function select(id) {
    selected = id;
    nodes.forEach((o) => { o.el.setAttribute('aria-pressed', String(o.id === id)); o.el.classList.toggle('is-selected', o.id === id); });
    if (!id) { insp.hidden = true; dirty = true; return; }
    fillInspector();
    insp.hidden = false;
    const o = nodes.get(id);
    if (announceEl && o && o.info) { announceEl.textContent = ''; setTimeout(() => { announceEl.textContent = `Inspecting ${o.info.name}. ${o.info.role}`; }, 30); }
    dirty = true;
  }
  function fillInspector() {
    const o = nodes.get(selected);
    if (!o || o.dying) { select(null); return; }
    const info = o.info;
    insp.querySelector('[data-i-name]').textContent = info.name + (o.n.region != null ? ` · ${REGIONS[o.n.region].short}` : '');
    insp.querySelector('[data-i-role]').textContent = info.role;
    insp.querySelector('[data-i-status]').textContent = STATUS_WORD[info.status];
    insp.querySelector('[data-i-status]').dataset.status = info.status;
    insp.querySelector('[data-i-stats]').innerHTML = info.stats.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  }
  insp.querySelector('[data-i-close]').addEventListener('click', () => { const id = selected; select(null); nodes.get(id)?.el.focus(); });
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && selected) { const id = selected; select(null); nodes.get(id)?.el.focus(); } });

  // ---------- metrics ----------
  const metricEls = Object.fromEntries([...root.querySelectorAll('[data-m]')].map((el) => [el.dataset.m, el]));
  const targets = () => ({ p95: m.p95, served: m.served, err: m.errorRate, avail: m.availability, hit: m.cacheHit * 100, cost: m.cost, head: m.headroom * 100, inst: m.total });
  const format = {
    p95: (v) => `${Math.round(v)}`, served: (v) => fmt(v), err: (v) => v.toFixed(2), avail: (v) => v.toFixed(2),
    hit: (v) => `${Math.round(v)}`, cost: (v) => Math.round(v).toLocaleString('en-US'), head: (v) => `${Math.round(v)}`, inst: (v) => `${Math.round(v)}`
  };
  function paintMetrics(dt) {
    const t = targets();
    let moving = false;
    for (const k of Object.keys(t)) {
      if (shown[k] == null || reduced || dt == null) shown[k] = t[k];
      else {
        const d = t[k] - shown[k];
        if (Math.abs(d) > Math.abs(t[k]) * 0.002 + 0.004) { shown[k] += d * (1 - Math.exp(-dt * 7)); moving = true; } else shown[k] = t[k];
      }
      const el = metricEls[k];
      if (el) el.textContent = format[k](shown[k]);
    }
    const lvl = (v, warn, bad) => (v >= bad ? 'bad' : v >= warn ? 'warn' : 'ok');
    root.querySelector('[data-mc="p95"]')?.setAttribute('data-level', lvl(m.p95, 180, 400));
    root.querySelector('[data-mc="err"]')?.setAttribute('data-level', lvl(m.errorRate, 1, 5));
    root.querySelector('[data-mc="head"]')?.setAttribute('data-level', m.headroom <= 0 ? 'bad' : m.headroom < 0.25 ? 'warn' : 'ok');
    const bar = root.querySelector('[data-head-bar]');
    if (bar) bar.style.setProperty('--v', String(Math.max(0, Math.min(1, shown.head / 100))));
    return moving;
  }
  function drawSpark() {
    if (!sctx) return;
    const w = spark.clientWidth || 200, h = spark.clientHeight || 40;
    if (spark.width !== Math.round(w * dpr)) { spark.width = Math.round(w * dpr); spark.height = Math.round(h * dpr); }
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.clearRect(0, 0, w, h);
    const max = Math.max(160, ...history) * 1.15;
    sctx.beginPath();
    history.forEach((v, i) => { const x = (i / (history.length - 1)) * w, y = h - (v / max) * h; i ? sctx.lineTo(x, y) : sctx.moveTo(x, y); });
    sctx.strokeStyle = m.p95 >= 400 ? C.coral : C.sky;
    sctx.lineWidth = 1.5;
    sctx.stroke();
    sctx.lineTo(w, h); sctx.lineTo(0, h); sctx.closePath();
    sctx.fillStyle = 'rgba(63,169,245,0.12)';
    sctx.fill();
    // 180 ms guide
    const gy = h - (180 / max) * h;
    sctx.setLineDash([3, 4]); sctx.strokeStyle = 'rgba(245,249,255,0.25)'; sctx.lineWidth = 1;
    sctx.beginPath(); sctx.moveTo(0, gy); sctx.lineTo(w, gy); sctx.stroke(); sctx.setLineDash([]);
  }

  // ---------- log ----------
  function log(text, level = 'info') {
    const li = document.createElement('li');
    li.className = `lg-${level}`;
    const t = document.createElement('time');
    t.textContent = clock();
    const s = document.createElement('span');
    s.textContent = text;
    li.append(t, s);
    logEl.prepend(li);
    while (logEl.children.length > 5) logEl.lastChild.remove();
  }
  function diff(a, am, b, bm) {
    if (bm.per !== am.per) log(`autoscaler: app fleet ${am.per} → ${bm.per} instances per region`);
    if (b.regions > a.regions) for (let r = a.regions; r < b.regions; r++) log(`region ${REGIONS[r].short} online · replication link up`, 'ok');
    if (b.regions < a.regions) for (let r = b.regions; r < a.regions; r++) log(`region ${REGIONS[r].short} drained and retired`);
    if (b.cdn !== a.cdn) log(b.cdn ? `edge: CDN on · ~${Math.round(EDGE_OFFLOAD * 100)}% of requests answered at the edge` : 'edge: CDN off · every request now reaches origin', b.cdn ? 'ok' : 'info');
    if (b.cache !== a.cache) log(b.cache ? 'cache: layer added · hot reads served from memory' : 'cache: layer removed · reads go straight to the database');
    if (b.async !== a.async) log(b.async ? 'queue: workers attached · slow jobs leave the request path' : 'queue: workers detached · jobs run inside requests');
    if (b.replicas !== a.replicas) log(`database: read replicas ${a.replicas} → ${b.replicas}`);
    if (b.autoscale !== a.autoscale) log(b.autoscale ? 'autoscaler: enabled' : 'autoscaler: disabled · fleet size is manual');
    if (b.outage !== a.outage) log(b.outage ? `chaos: zone A in ${REGIONS[0].short} offline · traffic rerouted` : `recovery: zone A back in rotation`, b.outage ? 'bad' : 'ok');
    if (bm.util > 1 && am.util <= 1) log(`alert: fleet saturated · ${bm.errorRate.toFixed(1)}% of requests rejected`, 'bad');
    if (bm.util <= 1 && am.util > 1) log('recovered: capacity back above demand', 'ok');
  }

  // ---------- config ----------
  const toTraffic = (v) => Math.round((100 * Math.pow(600, v / 1000)) / 10) * 10;
  const fromTraffic = (t) => Math.round((Math.log(t / 100) / Math.log(600)) * 1000);
  function syncForm() {
    trafficEl.value = String(fromTraffic(cfg.traffic));
    [...form.querySelectorAll('input[name="regions"]')].forEach((r) => { r.checked = Number(r.value) === cfg.regions; });
    form.querySelector('#c-autoscale').checked = cfg.autoscale;
    form.querySelector('#c-instances').value = String(cfg.instances);
    form.querySelector('#c-instances').disabled = cfg.autoscale;
    form.querySelector('#c-cdn').checked = cfg.cdn;
    form.querySelector('#c-cache').checked = cfg.cache;
    form.querySelector('#c-async').checked = cfg.async;
    form.querySelector('#c-replicas').value = String(cfg.replicas);
    const ob = root.querySelector('[data-outage]');
    ob.setAttribute('aria-pressed', String(cfg.outage));
    ob.querySelector('[data-outage-label]').textContent = cfg.outage ? 'End zone outage' : 'Simulate zone outage';
    outputs();
  }
  function outputs() {
    root.querySelector('[data-out="traffic"]').textContent = `${fmt(cfg.traffic)} req/s`;
    root.querySelector('[data-out="instances"]').textContent = cfg.autoscale ? `${m.per} (auto)` : String(cfg.instances);
    root.querySelector('[data-out="replicas"]').textContent = String(cfg.replicas);
    trafficEl.setAttribute('aria-valuetext', `${fmt(cfg.traffic)} requests per second`);
  }
  function readForm() {
    return {
      traffic: toTraffic(Number(trafficEl.value)),
      regions: Number((form.querySelector('input[name="regions"]:checked') || { value: 1 }).value),
      autoscale: form.querySelector('#c-autoscale').checked,
      instances: Number(form.querySelector('#c-instances').value),
      cdn: form.querySelector('#c-cdn').checked,
      cache: form.querySelector('#c-cache').checked,
      async: form.querySelector('#c-async').checked,
      replicas: Number(form.querySelector('#c-replicas').value),
      outage: cfg.outage
    };
  }
  let logBase = { cfg, m };
  function apply(next, { logNow = true, preset = null } = {}) {
    const pm = m;
    cfg = next;
    m = simulate(cfg);
    form.querySelector('#c-instances').disabled = cfg.autoscale;
    outputs();
    if (logNow) { diff(logBase.cfg, logBase.m, cfg, m); logBase = { cfg, m }; }
    relayout(false);
    if (selected) fillInspector();
    root.querySelectorAll('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === preset)));
    const planName = { starter: 'Starter', scale: 'Scale', orbit: 'Orbit' }[m.plan];
    const pl = root.querySelector('[data-plan-name]');
    if (pl) pl.textContent = planName;
    summaryEl.textContent = summary();
    document.dispatchEvent(new CustomEvent('nimbus:config', { detail: { plan: m.plan, summary: summary(), cfg, m } }));
    if (pm.p95 !== m.p95 && reduced) { history.push(m.p95); history.shift(); }
    dirty = true;
    start();
  }
  function summary() {
    const R = cfg.regions;
    return `${R} region${R > 1 ? 's' : ''} · ${m.per} app instances per region (${cfg.autoscale ? 'autoscaled' : 'manual'}) · CDN ${cfg.cdn ? 'on' : 'off'} · cache ${cfg.cache ? 'on' : 'off'} · ${cfg.replicas} read replica${cfg.replicas === 1 ? '' : 's'} · queue ${cfg.async ? 'on' : 'off'} · ~${fmt(cfg.traffic)} req/s · est. €${m.cost.toLocaleString('en-US')}/month`;
  }

  form.addEventListener('input', (e) => {
    const n = readForm();
    apply(n, { logNow: e.target.type !== 'range' });
  });
  form.addEventListener('change', (e) => { if (e.target.type === 'range') apply(readForm(), { logNow: true }); });
  form.addEventListener('submit', (e) => e.preventDefault());
  root.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    const p = { ...PRESETS[b.dataset.preset] };
    cfg = { ...cfg, outage: false };
    log(`preset: ${b.textContent.trim()} loaded`);
    apply(p, { preset: b.dataset.preset });
    syncForm();
  }));
  root.querySelector('[data-outage]').addEventListener('click', () => { apply({ ...readForm(), outage: !cfg.outage }); syncForm(); });

  // ---------- drawing ----------
  const box = (o) => ({ x: o.x, y: o.y, w: o.w, h: o.h });
  function linkPts(l) {
    const a = nodes.get(l.from), b = nodes.get(l.to);
    if (!a || !b) return null;
    return route(box(a), box(b), orient, l.kind, l.idx);
  }
  function hopPts(fromId, toId) {
    let l = links.get(`${fromId}>${toId}`);
    if (l && !l.dead) return linkPts(l);
    l = links.get(`${toId}>${fromId}`);
    if (l && !l.dead) { const p = linkPts(l); return p ? p.slice().reverse() : null; }
    return null;
  }
  function strokePoly(pts, frac) {
    let use = pts;
    if (frac < 1) {
      const L = polyLength(pts) * frac;
      use = [pts[0]];
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        if (acc + seg >= L) { const k = (L - acc) / (seg || 1); use.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]); break; }
        use.push(pts[i]); acc += seg;
      }
    }
    ctx.beginPath();
    ctx.moveTo(use[0][0], use[0][1]);
    for (let i = 1; i < use.length - 1; i++) {
      const p = use[i], n = use[i + 1], q = use[i - 1];
      const r = Math.min(9, Math.hypot(p[0] - q[0], p[1] - q[1]) / 2, Math.hypot(n[0] - p[0], n[1] - p[1]) / 2);
      ctx.arcTo(p[0], p[1], n[0], n[1], r);
    }
    ctx.lineTo(use[use.length - 1][0], use[use.length - 1][1]);
    ctx.stroke();
  }
  function chevron(pts) {
    const [x, y] = pointAt(pts, 0.55), [x2, y2] = pointAt(pts, 0.56);
    const a = Math.atan2(y2 - y, x2 - x);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(1, 0); ctx.lineTo(-4, 4); ctx.stroke();
    ctx.restore();
  }
  function draw() {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    links.forEach((l) => {
      const pts = linkPts(l);
      if (!pts) return;
      const a = nodes.get(l.from), b = nodes.get(l.to);
      const alpha = Math.min(a.a, b.a);
      const hot = selected && (l.from === selected || l.to === selected);
      const down = b.info && b.info.status === 'down';
      ctx.globalAlpha = alpha;
      ctx.setLineDash(l.kind === 'repl' ? [4, 5] : []);
      ctx.strokeStyle = hot ? C.sky : down ? C.coral : l.kind === 'repl' ? 'rgba(245,249,255,0.55)' : C.line;
      ctx.lineWidth = hot ? 2 : 1.25;
      strokePoly(pts, Math.max(0.001, l.prog));
      if (l.prog >= 1 && l.kind !== 'repl' && (reduced || hot)) { ctx.setLineDash([]); ctx.strokeStyle = hot ? C.sky : 'rgba(245,249,255,0.6)'; chevron(pts); }
    });
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    for (const p of packets) {
      const pts = hopPts(p.path[p.hop], p.path[p.hop + 1]);
      if (!pts) continue;
      const [x, y] = pointAt(pts, p.t);
      const col = p.kind === 'repl' ? C.white : p.back ? (p.kind === 'error' ? C.coral : C.signal) : p.kind === 'job' ? C.white : C.sky;
      const [tx, ty] = pointAt(pts, Math.max(0, p.t - 18 / Math.max(20, polyLength(pts))));
      ctx.strokeStyle = col; ctx.globalAlpha = 0.35; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = col;
      if (p.back) { ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
    }
  }

  function stepPackets(dt) {
    const speed = Math.max(170, Math.min(330, W * 0.3));
    const rate = Math.max(4, Math.min(40, 3 + (Math.log10(cfg.traffic) - 2) * 12));
    spawnAcc += dt * rate;
    while (spawnAcc >= 1 && packets.length < 320) {
      spawnAcc -= 1;
      const r = pickRoute(cfg, m);
      if (r.path.every((id) => nodes.has(id) && !nodes.get(id).dying)) packets.push({ path: r.path, kind: r.kind, hop: 0, t: 0, back: false });
    }
    if (cfg.regions > 1) {
      replAcc += dt * 1.1 * (cfg.regions - 1);
      while (replAcc >= 1) { replAcc -= 1; const r = 1 + Math.floor(Math.random() * (cfg.regions - 1)); packets.push({ path: ['db-0', `db-${r}`], kind: 'repl', hop: 0, t: 0, back: true }); }
    }
    packets = packets.filter((p) => {
      const pts = hopPts(p.path[p.hop], p.path[p.hop + 1]);
      if (!pts) return false;
      p.t += (speed * dt) / Math.max(20, polyLength(pts));
      if (p.t >= 1) {
        p.hop++; p.t = 0;
        if (p.hop >= p.path.length - 1) {
          if (p.back) return false;
          p.back = true; p.path = p.path.slice().reverse(); p.hop = 0;
        }
      }
      return true;
    });
  }

  function frame(now) {
    raf = 0;
    if (!visible) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    let moving = false;
    const k = 1 - Math.exp(-dt * 7);
    nodes.forEach((o, id) => {
      const dx = o.tx - o.x, dy = o.ty - o.y, da = o.ta - o.a;
      if (Math.abs(dx) + Math.abs(dy) + Math.abs(da) + Math.abs(o.tw - o.w) > 0.05) {
        o.x += dx * k; o.y += dy * k; o.a += da * Math.min(1, k * 1.4); o.w += (o.tw - o.w) * k; o.h += (o.th - o.h) * k;
        moving = true;
      } else { o.x = o.tx; o.y = o.ty; o.a = o.ta; o.w = o.tw; o.h = o.th; }
      if (o.dying && o.a < 0.02) { o.el.remove(); nodes.delete(id); return; }
      o.el.style.width = `${o.w.toFixed(1)}px`;
      o.el.style.height = `${o.h.toFixed(1)}px`;
      o.el.style.transform = `translate3d(${(o.x - o.w / 2).toFixed(1)}px, ${(o.y - o.h / 2).toFixed(1)}px, 0) scale(${(0.92 + 0.08 * o.a).toFixed(3)})`;
      o.el.style.opacity = o.a.toFixed(3);
    });
    links.forEach((l, key) => {
      if (l.dead) { l.prog -= dt * 3; if (l.prog <= 0) links.delete(key); moving = true; }
      else if (l.prog < 1) { l.prog = Math.min(1, l.prog + dt * 1.8); moving = true; }
    });
    if (!reduced) {
      stepPackets(dt);
      sampleAcc += dt;
      if (sampleAcc > 0.4) { sampleAcc = 0; history.push(m.p95 * (1 + (Math.random() - 0.5) * 0.08)); history.shift(); }
    }
    const tweening = paintMetrics(dt);
    if (!reduced || moving || tweening || dirty) { draw(); drawSpark(); dirty = false; }
    if (!reduced || moving || tweening) raf = requestAnimationFrame(frame);
  }
  function start() { if (!raf && visible) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  function resize() {
    const r = area.getBoundingClientRect();
    const nw = Math.max(1, Math.round(r.width)), nh = Math.max(1, Math.round(r.height));
    if (nw === W && nh === H) return;
    W = nw; H = nh;
    dpr = Math.min(window.devicePixelRatio || 1, W < 640 ? 1.5 : 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    relayout(true);
    draw(); drawSpark();
    start();
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((en) => { visible = en[0].isIntersecting && !document.hidden; if (visible) start(); }, { threshold: 0.02 }).observe(area);
  }
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; if (visible) start(); });
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(area);
  addEventListener('resize', resize);

  syncForm();
  resize();
  if (!lay) relayout(true);
  paintMetrics(null);
  summaryEl.textContent = summary();
  log('console ready · preset Growth loaded', 'ok');
  root.querySelector('[data-preset="growth"]')?.setAttribute('aria-pressed', 'true');
  const pl = root.querySelector('[data-plan-name]');
  if (pl) pl.textContent = { starter: 'Starter', scale: 'Scale', orbit: 'Orbit' }[m.plan];
  document.dispatchEvent(new CustomEvent('nimbus:config', { detail: { plan: m.plan, summary: summary(), cfg, m } }));
  start();
  return { get summary() { return summary(); }, get plan() { return m.plan; } };
}
