import { Duel, type DuelFoe } from '../duel/duel';
import { randomKirillLook } from '../hero/look';
import { Rng } from '../core/rng';
import { sfx } from '../core/audio';
import { el } from '../ui/dom';
import { t } from '../i18n';
import type { ArcadeCtx, ArcadeMode } from './common';

// Roles Reversed, local versus: player 1 picks a boss (WASD + J K L Space), player 2 is
// Kirill (arrows + , . / Enter). Best of three, Shadow Fight-style.

const BOSSES: [DuelFoe, string][] = [['romchik', '🥳'], ['nina', '🏃‍♀️'], ['sonya', '🌟'], ['masha', '📸'], ['dean', '🏛️'], ['finalExam', '📝']];

export class VersusFight implements ArcadeMode {
  private duel: Duel | null = null;
  private pick: HTMLElement | null = null;
  private finished = false;
  private boss: DuelFoe = 'romchik';
  private keyFn: (e: KeyboardEvent) => void;

  constructor(private ctx: ArcadeCtx) {
    this.pick = el(`
      <div class="screen vs-pick">
        <div class="panel vs-card">
          <div class="kicker">${t('vs.kicker')}</div>
          <h1>${t('vs.title')}</h1>
          <p>${t('vs.pick6')}</p>
          <div class="vs-bosses">
            ${BOSSES.map(([id, icon], i) => `<button class="arc-card" data-boss="${id}"><span class="arc-icon">${icon}</span><b>${i + 1}. ${t('duel.' + id)}</b></button>`).join('')}
          </div>
          <div class="vs-sides">
            <div><b>${t('vs.p1')}</b><small>${t('vs.p1keys')}</small></div>
            <div><b>${t('vs.p2')}</b><small>${t('vs.p2keys')}</small></div>
          </div>
        </div>
      </div>`);
    document.getElementById('ui')!.appendChild(this.pick);
    this.pick.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-boss]')?.getAttribute('data-boss') as DuelFoe | null;
      if (b) this.start(b);
    });
    this.keyFn = (e: KeyboardEvent) => { const i = +e.key - 1; if (this.pick && i >= 0 && i < BOSSES.length) this.start(BOSSES[i][0]); };
    addEventListener('keydown', this.keyFn);
  }

  private start(boss: DuelFoe) {
    sfx.unlock();
    sfx.click();
    this.boss = boss;
    this.pick?.remove();
    this.pick = null;
    removeEventListener('keydown', this.keyFn);
    this.duel = new Duel(this.ctx.stage, {
      foe: boss,
      kirillLook: randomKirillLook(new Rng(Math.floor(Math.random() * 1e9))),
      kirillHp: 1,
      kirillPower: 1,
      versus: true,
      kirillName: t('vs.p2name'),
      victoryText: t('vs.p1wins'),
      defeatText: t('vs.p2wins'),
      onDone: (win) => this.done(win),
    });
  }

  private done(p1: boolean) {
    const d = this.duel!;
    const hp = Math.round(p1 ? d.player.hp : d.kirill.hp);
    d.dispose();
    this.duel = null;
    this.finished = true;
    this.ctx.onExit({ mode: 'versus', win: p1, score: hp * 10, detail: t(p1 ? 'vs.p1result' : 'vs.p2result', { boss: t('duel.' + this.boss), hp }) });
  }

  update(dt: number) {
    if (this.finished) return;
    this.duel?.update(dt);
  }

  render() {}

  /** for tests */
  get current() { return this.duel; }
  choose(boss: DuelFoe) { this.start(boss); }

  dispose() {
    removeEventListener('keydown', this.keyFn);
    this.pick?.remove();
    this.duel?.dispose();
  }
}
