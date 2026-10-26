import { BossArena } from './arena';
import { BOSSES, WEEK_BOSS, type BossId } from './bosses';
import { randomKirillLook } from '../hero/look';
import { Rng } from '../core/rng';
import { sfx } from '../core/audio';
import { el } from '../ui/dom';
import { t } from '../i18n';
import type { ArcadeCtx, ArcadeMode } from '../arcade/common';

// Arcade "Boss Rush": pick any boss; you fight Kirill in that boss's home arena.

const HOME: Record<BossId, number> = Object.fromEntries(
  (Object.keys(BOSSES) as BossId[]).map((b) => [b, +(Object.entries(WEEK_BOSS).find(([, v]) => v === b)?.[0] ?? 15)]),
) as Record<BossId, number>;

export class BossRush implements ArcadeMode {
  private arena: BossArena | null = null;
  private pick: HTMLElement | null;
  private keyFn: (e: KeyboardEvent) => void;

  constructor(private ctx: ArcadeCtx) {
    const ids = (Object.keys(BOSSES) as BossId[]).filter((b) => b !== 'artem'); // Artem is on Kirill's side
    this.pick = el(`
      <div class="screen vs-pick">
        <div class="panel vs-card">
          <div class="kicker">${t('br2.kicker')}</div>
          <h1>${t('br2.title')}</h1>
          <p>${t('br2.sub')}</p>
          <div class="vs-bosses four">
            ${ids.map((id, i) => `<button class="arc-card boss-pick" data-boss="${id}"><img src="portraits/${id}-face.jpg" alt="" onerror="this.style.visibility='hidden'"><b>${i + 1}. ${t('boss.name.' + id)}</b><small>${t('boss.title.' + id)}</small></button>`).join('')}
          </div>
        </div>
      </div>`);
    document.getElementById('ui')!.appendChild(this.pick);
    this.pick.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-boss]')?.getAttribute('data-boss') as BossId | null;
      if (b) this.start(b);
    });
    this.keyFn = (e: KeyboardEvent) => { const i = +e.key - 1; if (this.pick && i >= 0 && i < ids.length) this.start(ids[i]); };
    addEventListener('keydown', this.keyFn);
  }

  /** start a fight (tests call this directly) */
  start(boss: BossId) {
    sfx.unlock();
    sfx.click();
    this.pick?.remove();
    this.pick = null;
    removeEventListener('keydown', this.keyFn);
    this.arena = new BossArena(this.ctx, { boss, weekId: HOME[boss], level: 3, weekNum: 6, look: randomKirillLook(new Rng(Math.floor(Math.random() * 1e9))) });
  }

  get current() { return this.arena; }

  update(dt: number) { this.arena?.update(dt); }
  render() { this.arena?.render(); }

  dispose() {
    removeEventListener('keydown', this.keyFn);
    this.pick?.remove();
    this.arena?.dispose();
  }
}
