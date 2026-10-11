// NIMBUS — illustrative infrastructure model + topology layout. Pure functions, no DOM.
// The numbers are a teaching model, not a benchmark of any real cloud.

export const REGIONS = [
  { id: 'eu', name: 'EU Central', short: 'eu-central' },
  { id: 'us', name: 'US East', short: 'us-east' },
  { id: 'ap', name: 'Asia Pacific', short: 'ap-south' }
];

export const PRESETS = {
  launch: { traffic: 400, regions: 1, autoscale: true, instances: 2, cdn: false, cache: false, replicas: 0, async: false, outage: false },
  growth: { traffic: 6000, regions: 1, autoscale: true, instances: 4, cdn: true, cache: true, replicas: 1, async: true, outage: false },
  global: { traffic: 32000, regions: 3, autoscale: true, instances: 6, cdn: true, cache: true, replicas: 2, async: true, outage: false }
};

export const CAP = 1200;          // requests/s one app instance handles comfortably
export const EDGE_OFFLOAD = 0.45; // share of requests answered by the edge cache
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function instancesFor(cfg) {
  if (!cfg.autoscale) return clamp(Math.round(cfg.instances), 1, 12);
  const origin = cfg.traffic * (1 - (cfg.cdn ? EDGE_OFFLOAD : 0));
  return clamp(Math.ceil(origin / cfg.regions / (CAP * 0.62)), 2, 12);
}

export function simulate(cfg) {
  const regions = clamp(cfg.regions, 1, 3);
  const per = instancesFor(cfg);
  const healthy = Array.from({ length: regions }, (_, r) => (r === 0 && cfg.outage ? per - Math.floor(per / 2) : per));
  const totalHealthy = healthy.reduce((a, b) => a + b, 0);
  const capacity = totalHealthy * CAP;
  const offload = cfg.cdn ? EDGE_OFFLOAD : 0;
  const origin = cfg.traffic * (1 - offload);
  const util = origin / Math.max(1, capacity);
  const served = Math.min(origin, capacity) + cfg.traffic * offload;
  const errorRate = util > 1 ? (1 - 1 / util) * 100 : 0.01 + (cfg.outage ? 0.04 : 0);
  const queue = 1 / (1 - Math.min(util, 0.95));
  const rtt = cfg.cdn ? 18 : [46, 34, 26][regions - 1];
  const appLat = 14 * queue * (cfg.async ? 0.86 : 1);
  const cacheHit = cfg.cache ? 0.84 : 0;
  const dbCap = 5200 * (1 + cfg.replicas) * regions;
  const reads = origin * 0.72 * (1 - cacheHit);
  const writes = origin * 0.08 * (cfg.async ? 0.35 : 1);
  const dbLoad = (reads + writes) / dbCap;
  const dbLat = 6 / (1 - Math.min(dbLoad, 0.95));
  const p95 = Math.round((rtt + appLat + cacheHit * 1.5 + (1 - cacheHit) * dbLat) * 1.9);
  let availability = [99.9, 99.95, 99.99][regions - 1] - (cfg.replicas === 0 ? 0.04 : 0);
  if (cfg.outage && regions === 1 && util > 1) availability -= 0.3;
  const costParts = {
    compute: per * regions * 42,
    network: regions * 55 + origin * 0.004,
    database: regions * 140 + cfg.replicas * regions * 110,
    cache: cfg.cache ? regions * 75 : 0,
    async: cfg.async ? regions * 48 : 0,
    edge: cfg.cdn ? 40 + cfg.traffic * 0.01 : 0
  };
  const cost = Math.round(Object.values(costParts).reduce((a, b) => a + b, 0) / 10) * 10;
  const regionShare = healthy.map((h) => h / Math.max(1, totalHealthy));
  let plan = 'orbit';
  if (regions === 1 && per <= 4 && cfg.replicas === 0) plan = 'starter';
  else if (regions <= 2 && per * regions <= 16) plan = 'scale';
  return {
    per, healthy, totalHealthy, total: per * regions, capacity, origin, util, served, errorRate, p95,
    availability: Math.round(availability * 100) / 100, cacheHit, dbLoad, cost, costParts,
    headroom: Math.max(0, 1 - util), regionShare, plan, regions
  };
}

export const fmt = (n) => (n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : Math.round(n).toLocaleString('en-US'));

// ---------- topology layout ----------
// orient 'h': tiers run left → right, regions stacked; orient 'v': tiers run top → bottom, regions side by side.
export function layout(cfg, W, H, orient = 'h') {
  const R = clamp(cfg.regions, 1, 3);
  const nodes = [];
  const links = [];
  const add = (id, kind, x, y, w, h, extra = {}) => nodes.push({ id, kind, x, y, w, h, ...extra });
  const link = (from, to, kind = 'flow') => links.push({ from, to, kind, key: `${from}>${to}` });
  const mid = cfg.cache || cfg.async;

  if (orient === 'h') {
    const w = clamp(W / 6.4, 100, 150), h = R === 3 ? 50 : 58;
    const padX = w / 2 + 14, padT = 24 + h / 2, padB = 24 + h / 2;
    const col = (i) => padX + (i * (W - padX * 2)) / 5;
    const bandH = (H - padT - padB + h) / R;
    const yr = (r) => padT - h / 2 + bandH * (r + 0.5);
    const cy = H / 2;
    add('users', 'users', col(0), cy, w, h);
    if (cfg.cdn) add('edge', 'edge', col(1), cy, w, h);
    const off = Math.max(h * 0.62, Math.min(bandH * 0.27, 58));
    for (let r = 0; r < R; r++) {
      const y = yr(r);
      add(`lb-${r}`, 'lb', col(2), y, w, h, { region: r });
      add(`app-${r}`, 'app', col(3), y, w, h, { region: r });
      if (cfg.cache) add(`cache-${r}`, 'cache', col(4), y - off, w * 0.92, h, { region: r });
      if (cfg.async) add(`work-${r}`, 'work', col(4), y + off, w * 0.92, h, { region: r });
      add(`db-${r}`, 'db', col(5), y, w, h, { region: r });
    }
  } else {
    const colW = (W - 16) / R;
    const w = clamp(colW - 14, 62, 150), h = 50;
    const rows = ['users', ...(cfg.cdn ? ['edge'] : []), 'lb', 'app', ...(mid ? ['mid'] : []), 'db'];
    const padT = 18 + h / 2, padB = 18 + h / 2;
    const rowY = (name) => padT + (rows.indexOf(name) * (H - padT - padB)) / (rows.length - 1);
    const xr = (r) => 8 + colW * (r + 0.5);
    add('users', 'users', W / 2, rowY('users'), Math.min(170, W * 0.5), h);
    if (cfg.cdn) add('edge', 'edge', W / 2, rowY('edge'), Math.min(170, W * 0.5), h);
    for (let r = 0; r < R; r++) {
      const x = xr(r);
      add(`lb-${r}`, 'lb', x, rowY('lb'), w, h, { region: r });
      add(`app-${r}`, 'app', x, rowY('app'), w, h, { region: r });
      const mw = cfg.cache && cfg.async ? Math.max(30, colW * 0.46 - 6) : w * 0.62;
      const dx = cfg.cache && cfg.async ? colW * 0.24 : mw / 2 + 10;
      if (cfg.cache) add(`cache-${r}`, 'cache', x - dx, rowY('mid'), mw, h * 0.86, { region: r, compact: mw < 90 });
      if (cfg.async) add(`work-${r}`, 'work', cfg.cache ? x + dx : x - dx, rowY('mid'), mw, h * 0.86, { region: r, compact: mw < 90 });
      add(`db-${r}`, 'db', x, rowY('db'), w, h, { region: r });
    }
  }
  for (let r = 0; r < R; r++) {
    link(cfg.cdn ? 'edge' : 'users', `lb-${r}`);
    link(`lb-${r}`, `app-${r}`);
    if (cfg.cache) { link(`app-${r}`, `cache-${r}`); link(`cache-${r}`, `db-${r}`); }
    if (cfg.async) { link(`app-${r}`, `work-${r}`); link(`work-${r}`, `db-${r}`); }
    link(`app-${r}`, `db-${r}`);
    if (r > 0) link('db-0', `db-${r}`, 'repl');
  }
  if (cfg.cdn) link('users', 'edge');
  return { nodes, links, orient };
}

// orthogonal route between two node boxes; returns polyline points
export function route(a, b, orient, kind, idx = 0) {
  if (kind === 'repl') {
    if (orient === 'h') {
      const x = Math.max(a.x + a.w / 2, b.x + b.w / 2) + 16 + idx * 12;
      return [[a.x + a.w / 2, a.y + 8], [x, a.y + 8], [x, b.y - 8], [b.x + b.w / 2, b.y - 8]];
    }
    const y = Math.max(a.y + a.h / 2, b.y + b.h / 2) + 14 + idx * 10;
    return [[a.x + 10, a.y + a.h / 2], [a.x + 10, y], [b.x - 10, y], [b.x - 10, b.y + b.h / 2]];
  }
  if (orient === 'h') {
    if (Math.abs(a.x - b.x) < 2) return [[a.x, a.y + a.h / 2], [b.x, b.y - b.h / 2]];
    const p0 = [a.x + a.w / 2, a.y], p3 = [b.x - b.w / 2, b.y];
    if (Math.abs(a.y - b.y) < 1) return [p0, p3];
    const mx = (p0[0] + p3[0]) / 2;
    return [p0, [mx, a.y], [mx, b.y], p3];
  }
  if (Math.abs(a.y - b.y) < 2) return [[a.x + a.w / 2, a.y], [b.x - b.w / 2, b.y]];
  const p0 = [a.x, a.y + a.h / 2], p3 = [b.x, b.y - b.h / 2];
  if (Math.abs(a.x - b.x) < 1) return [p0, p3];
  const my = (p0[1] + p3[1]) / 2;
  return [p0, [a.x, my], [b.x, my], p3];
}

export function polyLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}
export function pointAt(pts, f) {
  const total = polyLength(pts);
  let d = f * total;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (d <= seg || i === pts.length - 1) {
      const k = seg ? Math.min(1, d / seg) : 0;
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
    }
    d -= seg;
  }
  return pts[pts.length - 1];
}

// pick a request path through the current topology
export function pickRoute(cfg, m, rnd = Math.random) {
  if (cfg.cdn && rnd() < EDGE_OFFLOAD) return { path: ['users', 'edge'], kind: 'static' };
  let r = 0, x = rnd(), acc = 0;
  for (let i = 0; i < m.regionShare.length; i++) { acc += m.regionShare[i]; if (x <= acc) { r = i; break; } }
  const head = cfg.cdn ? ['users', 'edge', `lb-${r}`] : ['users', `lb-${r}`];
  if (m.util > 1 && rnd() < 1 - 1 / m.util) return { path: head, kind: 'error' };
  const app = [...head, `app-${r}`];
  if (cfg.async && rnd() < 0.22) return { path: [...app, `work-${r}`, `db-${r}`], kind: 'job' };
  if (cfg.cache) {
    if (rnd() < 0.8) return { path: [...app, `cache-${r}`], kind: 'req' };
    return { path: [...app, `cache-${r}`, `db-${r}`], kind: 'req' };
  }
  return { path: [...app, `db-${r}`], kind: 'req' };
}

export function nodeInfo(n, cfg, m) {
  const reg = n.region != null ? REGIONS[n.region] : null;
  const busy = (v) => (v > 1 ? 'down' : v > 0.82 ? 'busy' : 'ok');
  switch (n.kind) {
    case 'users': return { name: 'Visitors', short: 'Visitors', meta: `${fmt(cfg.traffic)} req/s`, status: 'ok', role: 'Everyone using your product, from every device and network.', stats: [['Demand', `${fmt(cfg.traffic)} req/s`], ['Served', `${fmt(m.served)} req/s`], ['Errors', `${m.errorRate.toFixed(2)}%`]] };
    case 'edge': return { name: 'Global edge', short: 'Edge', meta: `${Math.round(EDGE_OFFLOAD * 100)}% at edge`, status: 'ok', role: 'Caches pages and assets close to visitors so most requests never reach your servers.', stats: [['Answered at edge', `${Math.round(EDGE_OFFLOAD * 100)}%`], ['Passed to origin', `${fmt(m.origin)} req/s`], ['Locations', 'Worldwide']] };
    case 'lb': return { name: 'Load balancer', short: 'LB', meta: reg.short, status: cfg.outage && n.region === 0 ? 'busy' : 'ok', role: 'Spreads traffic across healthy instances and stops sending it to anything that fails a health check.', stats: [['Region', reg.name], ['Share of traffic', `${Math.round(m.regionShare[n.region] * 100)}%`], ['Health checks', 'Every 5 s']] };
    case 'app': {
      const h = m.healthy[n.region];
      const st = cfg.outage && n.region === 0 ? 'down' : busy(m.util);
      return { name: 'App service', short: 'App', meta: `${h}/${m.per} healthy`, status: st === 'down' && m.util <= 1 ? 'busy' : st, role: 'Your containers. The autoscaler adds or removes instances as demand changes.', stats: [['Instances', `${h} healthy of ${m.per}`], ['Utilisation', `${Math.min(999, Math.round(m.util * 100))}%`], ['Scaling', cfg.autoscale ? 'Automatic' : 'Manual']], pips: m.per, bad: m.per - h };
    }
    case 'cache': return { name: 'Cache', short: 'Cache', meta: `${Math.round(m.cacheHit * 100)}% hits`, status: 'ok', role: 'In-memory store for hot data. Every hit is a database query you did not have to make.', stats: [['Hit ratio', `${Math.round(m.cacheHit * 100)}%`], ['Region', reg.name], ['Eviction', 'Least recently used']] };
    case 'work': return { name: 'Workers', short: 'Jobs', meta: 'queue · async', status: 'ok', role: 'Slow work such as emails, exports and image processing moves off the request path.', stats: [['Jobs off the request path', '≈ 22%'], ['Retries', 'Automatic, with backoff'], ['Region', reg.name]] };
    case 'db': return { name: n.region === 0 ? 'Database' : 'DB replica', short: 'DB', meta: n.region === 0 ? `1 + ${cfg.replicas} replica${cfg.replicas === 1 ? '' : 's'}` : reg.short, status: busy(m.dbLoad), role: n.region === 0 ? 'Managed relational database. Writes go to the primary; read replicas share the read load.' : 'A read copy of the primary kept in sync across regions, ready to take over if the primary region fails.', stats: [['Load', `${Math.min(999, Math.round(m.dbLoad * 100))}%`], ['Read replicas', String(cfg.replicas)], ['Backups', 'Continuous']], pips: n.region === 0 ? 1 + cfg.replicas : 1 + cfg.replicas, bad: 0 };
    default: return { name: n.id, meta: '', status: 'ok', role: '', stats: [] };
  }
}
