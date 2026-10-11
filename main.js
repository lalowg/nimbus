// NIMBUS — bootstrap: chrome, reveals, console and sections.
import { initConsole } from './console.js';
import { initSections } from './sections.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduced) root.classList.add('reduced');

function initChrome() {
  const header = $('[data-header]');
  const onScroll = () => header.classList.toggle('is-solid', scrollY > 24);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  const btn = $('[data-menu-btn]'), menu = $('#menu');
  const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); root.classList.remove('menu-open'); };
  btn.addEventListener('click', () => {
    const open = menu.hidden;
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    root.classList.toggle('menu-open', open);
    if (open) $('a', menu).focus();
  });
  $$('a', menu).forEach((a) => a.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { close(); btn.focus(); } });
  addEventListener('resize', () => { if (innerWidth >= 1000 && !menu.hidden) close(); });

  // blueprint reveals: outlines draw, then content settles
  const els = $$('.h2, .kicker, .panel:not(.cfg):not(.topo):not(.telemetry), .step, .mig, .ptable, .stack');
  if (reduced || !('IntersectionObserver' in window)) return;
  els.forEach((e) => e.classList.add('rv'));
  const io = new IntersectionObserver((en) => en.forEach((x) => { if (x.isIntersecting) { x.target.classList.add('is-in'); io.unobserve(x.target); } }), { rootMargin: '0px 0px -10% 0px' });
  els.forEach((e) => io.observe(e));
}

initChrome();
initSections({ reduced });
try {
  initConsole({ root: $('[data-console]'), reduced });
  root.classList.add('console-live');
} catch (err) {
  root.classList.add('console-failed');
  const s = $('[data-config-summary]');
  if (s) s.textContent = 'The live console could not start in this browser.';
}
requestAnimationFrame(() => root.classList.add('is-ready'));
