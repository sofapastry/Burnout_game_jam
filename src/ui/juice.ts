import { juice } from '../core/audio';
import { t } from '../i18n';

// Screen-space juice: the НЕЗАЧЁТ stamp that slams down on every debt, and the announcer
// that calls out combos.

const layer = () => document.getElementById('ui');

/** A giant rubber stamp slams onto the screen with a burst of exam papers. */
export function stamp(kind: 'debt' | 'pass', sub = '') {
  const ui = layer();
  if (!ui) return;
  const e = document.createElement('div');
  e.className = `jc-stamp ${kind}`;
  e.innerHTML = `<div class="jc-ink">${t(kind === 'debt' ? 'jc.debt' : 'jc.pass')}</div>${sub ? `<div class="jc-sub">${sub}</div>` : ''}`;
  ui.appendChild(e);
  juice.stamp();
  if (kind === 'debt') {
    document.body.classList.add('jc-shake');
    setTimeout(() => document.body.classList.remove('jc-shake'), 420);
    confetti(26);
  }
  setTimeout(() => e.classList.add('out'), 2300);
  setTimeout(() => e.remove(), 2800);
}

/** exam papers flying out from the centre of the screen */
export function confetti(n: number) {
  const ui = layer();
  if (!ui) return;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.className = 'jc-paper';
    const a = Math.random() * Math.PI * 2, d = 160 + Math.random() * 420;
    p.style.setProperty('--dx', `${(Math.cos(a) * d).toFixed(0)}px`);
    p.style.setProperty('--dy', `${(Math.sin(a) * d * 0.7 + 260).toFixed(0)}px`);
    p.style.setProperty('--r', `${(Math.random() * 900 - 450).toFixed(0)}deg`);
    p.style.animationDelay = `${(Math.random() * 0.12).toFixed(2)}s`;
    if (Math.random() < 0.35) p.textContent = Math.random() < 0.5 ? '2' : 'Н';
    ui.appendChild(p);
    setTimeout(() => p.remove(), 1800);
  }
}

let lastTier = 0;
let lastAt = 0;
// combo call-outs, repeated tiers within a second are skipped
export function announce(tier: number, key: 'combo' | 'duel' = 'combo') {
  const ui = layer();
  if (!ui) return;
  const now = performance.now();
  if (tier <= lastTier && now - lastAt < 1000) return;
  lastTier = tier;
  lastAt = now;
  const e = document.createElement('div');
  e.className = `jc-announce tier${Math.min(4, tier)}`;
  e.textContent = t(`jc.${key}${Math.min(4, tier)}`);
  ui.appendChild(e);
  juice.sting(tier);
  setTimeout(() => e.remove(), 1300);
}

/** combo count → announcer tier (0 = nothing to say) */
export function comboTier(n: number) {
  return n >= 30 ? 4 : n >= 18 ? 3 : n >= 10 ? 2 : n >= 5 ? 1 : 0;
}
