import { Duel } from '../duel/duel';
import { randomKirillLook } from '../hero/look';
import { Rng } from '../core/rng';
import { sfx } from '../core/audio';
import { el } from '../ui/dom';
import { t } from '../i18n';
import balance from '../data/balance.json';
import type { ArcadeCtx, ArcadeMode } from './common';

// Party Fight: you are Romchik. Three silhouette duels against an ever-sharper Kirill.

const ARCADE_LADDER = balance.arcade.fight.ladder;

export class PartyFight implements ArcadeMode {
  private duel: Duel | null = null;
  private fight = 0;
  private card: HTMLElement | null = null;
  private cardT = 0;
  private score = 0;
  private look;
  private finished = false;
  /** the story version is a single duel against this semester's Kirill */
  private ladder: { hp: number; power: number; ai: number }[];

  constructor(private ctx: ArcadeCtx) {
    this.look = ctx.story?.look ?? randomKirillLook(new Rng(Math.floor(Math.random() * 1e9)));
    const lv = ctx.story?.level ?? 1;
    this.ladder = ctx.story ? [{ hp: 0.85, power: 0.95 + 0.03 * (lv - 1), ai: 0.8 + 0.03 * lv }] : ARCADE_LADDER;
    this.showCard();
  }

  /** "FIGHT 2/3 — Kirill drank a triple espresso" between duels */
  private showCard() {
    this.card?.remove();
    this.card = el(`
      <div class="screen ladder-card">
        <div class="kicker">${t('fight.ladder')}</div>
        <div class="lc-title">${t('fight.n', { n: this.fight + 1 })}</div>
        <div class="lc-sub">${t(this.ctx.story ? 'fight.storyFlavor' : 'fight.flavor' + this.fight)}</div>
        <div class="lc-steps">${this.ladder.map((_, i) => `<span class="${i < this.fight ? 'done' : i === this.fight ? 'now' : ''}">${t('fight.kirill' + i)}</span>`).join('')}</div>
      </div>`);
    document.getElementById('ui')!.appendChild(this.card);
    this.cardT = 2.2;
    sfx.reveal();
  }

  private startDuel() {
    this.card?.remove();
    this.card = null;
    const L = this.ladder[this.fight];
    this.duel = new Duel(this.ctx.stage, {
      foe: 'romchik',
      kirillLook: this.look,
      kirillHp: L.hp,
      kirillPower: L.power,
      aiLevel: L.ai,
      kirillName: this.ctx.story ? t('hud.kirill') : t('fight.kirill' + this.fight),
      victoryText: t('fight.won'),
      defeatText: t('fight.lost'),
      onDone: (win) => this.duelDone(win),
    });
  }

  private duelDone(win: boolean) {
    const d = this.duel!;
    this.score += win ? 1000 + Math.round(d.player.hp * 5) : Math.round((1 - d.kirill.hp / d.kirill.maxHp) * 300);
    d.dispose();
    this.duel = null;
    if (win && this.fight < this.ladder.length - 1) {
      this.fight++;
      this.showCard();
      return;
    }
    this.finished = true;
    const champ = win && this.fight === this.ladder.length - 1;
    this.ctx.onExit({
      mode: 'fight', win: champ, score: this.score,
      detail: this.ctx.story ? t(champ ? 'fight.storyWon' : 'fight.storyLost') : champ ? t('fight.champ') : t('fight.reached', { n: this.fight + 1, of: this.ladder.length }),
    });
  }

  update(dt: number) {
    if (this.finished) return;
    if (this.duel) { this.duel.update(dt); return; }
    this.cardT -= dt;
    if (this.cardT <= 0) this.startDuel();
  }

  render() {}

  /** for tests: the current duel (null between fights) */
  get current() { return this.duel; }

  dispose() {
    this.duel?.dispose();
    this.card?.remove();
  }
}
