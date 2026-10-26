import * as THREE from 'three';
import { offer, boon } from './boons';
import { icon } from '../ui/icons';
import { fate } from '../story/fate';
import type { Stage } from '../render/stage';
import { buildEldenArena, PALETTES, type EldenArena } from '../boss/elden';
import { Prologue, prologueSeen } from '../story/prologue';
import { Cutscene } from '../story/cutscene';
import { CHAPTERS, type Chapter } from '../story/campaign';
import { Duel } from '../duel/duel';
import { Semester, loadSave, writeSave, YEARS, PERKS, type Save, type WeekResult } from './semester';
import { WeekRun } from './week';
import { buildMap } from '../maps/builder';
import { FOYER } from '../maps/layouts';
import { Person, type Pose } from '../hero/person';
import { makeCharacter, CHARACTER_NAMES, type Rig } from '../assets';
import { randomKirillLook, lookBlurb, type KirillLook } from '../hero/look';
import { CARDS, COUNTERS, type CardId } from '../data/cards';
import { weekById } from '../data/weeks';
import { HOLIDAYS, BURNOUT_ENDINGS, GRADUATED_LINES, pickLine } from '../data/lines';
import { Rng, randomSeedString, seedFromUrl } from '../core/rng';
import { sfx } from '../core/audio';
import balance from '../data/balance.json';
import { el, esc } from '../ui/dom';
import { xpForNext, pickLabel } from '../hero/kirill';
import { t, lang, setLang, type Lang } from '../i18n';
import { PartyFight } from '../arcade/fight';
import { PERace } from '../arcade/race';
import { SemesterRun } from '../arcade/run';
import { DormDungeon } from '../arcade/dungeon';
import { ThePresentation } from '../arcade/presentation';
import { VersusFight } from '../arcade/versus';
import { LectureDrone } from '../arcade/drone';
import { BossArena } from '../boss/arena';
import { BossRush } from '../boss/rush';
import { WEEK_BOSS } from '../boss/bosses';
import { music } from '../core/audio';
import { stamp } from '../ui/juice';
import { bestScores, recordScore, type ArcadeMode, type ArcadeResult, type ModeId } from '../arcade/common';

type Scene = { update(dt: number): void; render(): void; dispose(): void };

const yearName = (y: number) => YEARS[Math.min(y - 1, YEARS.length - 1)];

/** Top-level state machine: menu → intro → (title → week → result → holidays → break)* → end. */
export class Game {
  private ui = document.getElementById('ui')!;
  private scene: Scene | null = null;
  private overlay: HTMLElement | null = null;
  private sem: Semester | null = null;
  private save: Save = loadSave();
  private week: WeekRun | null = null;
  private weekLive = false;
  private arcade: ArcadeMode | null = null;
  private arcadeId: ModeId | null = null;
  private arcadeOut: ArcadeResult | null | undefined = undefined;
  private quitBtn: HTMLElement | null = null;
  /** set while a mini-game runs between story weeks: gets the result instead of the arcade screen */
  private storyDone: ((r: ArcadeResult | null) => void) | null = null;

  constructor(private stage: Stage) {}

  start() { this.menu(); }

  update(dt: number) {
    if (this.arcade) {
      this.arcade.update(dt);
      // a mode reports its end from inside its own update: tear it down afterwards
      if (this.arcadeOut !== undefined) this.arcadeDone();
      return;
    }
    if (this.week && this.weekLive) this.week.update(dt);
    else this.scene?.update(dt);
  }

  render() {
    if (this.arcade) { this.arcade.render(); return; }
    if (this.week) this.week.render();
    else this.scene?.render();
  }

  private setOverlay(html: string) {
    this.overlay?.remove();
    this.overlay = el(html);
    this.ui.appendChild(this.overlay);
    return this.overlay;
  }

  private clearOverlay() {
    this.overlay?.remove();
    this.overlay = null;
  }

  private setScene(s: Scene | null) {
    this.scene?.dispose();
    this.scene = s;
  }

  private endWeek() {
    this.week?.dispose();
    this.week = null;
    this.weekLive = false;
  }

  // ------------------------------------------------------------------ menu

  private menu(keepScene = false, seedValue?: string) {
    this.endWeek();
    music.start(0.3, 'menu');
    if (!keepScene || !this.scene) this.setScene(new MenuArena(this.stage));
    const s = this.save;
    const seed = seedValue ?? seedFromUrl() ?? randomSeedString();
    const langBtn = (l: Lang, label: string) => `<button class="lang-btn ${lang() === l ? 'on' : ''}" data-lang="${l}">${label}</button>`;
    const o = this.setOverlay(`
      <div class="screen menu">
        <div class="lang-switch" title="${t('menu.lang')}">${langBtn('en', 'EN')}${langBtn('ru', 'RU')}</div>
        <div class="logo"><div class="logo-main">BURNOUT</div><div class="logo-sub">${t('menu.sub')}</div></div>
        <div class="menu-box panel">
          <button class="btn big primary" data-a="enroll">${t('menu.enroll')}</button>
          <div class="row">
            <label>${t('menu.seed')} <input class="seed" maxlength="24" value="${esc(seed)}"></label>
            <button class="btn" data-a="dice" title="${t('menu.dice')}">🎲</button>
          </div>
          <button class="btn" data-a="daily">${t('menu.daily')}</button>
          <button class="btn quick-btn" data-a="quick" title="${t('menu.quickDesc')}">⚡ ${t('menu.quick')}</button>
          <button class="btn" data-a="classic" title="${t('menu.classicDesc')}">${t('menu.classic')}</button>
          <button class="btn" data-a="long" title="${t('menu.longDesc')}">${t('menu.long')}</button>
          <button class="btn" data-a="prologue">🎬 ${t('menu.prologue')}</button>
          <button class="btn arcade-btn" data-a="arcade">🕹️ ${t('menu.arcade')}</button>
          <button class="btn" data-a="deans" title="${t('menu.deansDesc')}">🏛️ ${t('menu.deans')} · ${s.stamps} 🔖</button>
          <div class="meta">${t('menu.meta', { year: yearName(s.year), sem: s.semesters, burn: s.burnouts })}</div>
        </div>
        <div class="menu-help panel">
          ${t('menu.help')}<br>
          <span class="keys">${t('menu.keys')}</span>
        </div>
        <div class="credits">${t('menu.credits')}</div>
      </div>`);
    const seedIn = o.querySelector('.seed') as HTMLInputElement;
    o.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const l = target.closest('[data-lang]')?.getAttribute('data-lang') as Lang | null;
      if (l) {
        sfx.click();
        setLang(l);
        this.menu(true, seedIn.value);
        return;
      }
      const a = target.closest('[data-a]')?.getAttribute('data-a');
      if (!a) return;
      sfx.unlock();
      sfx.click();
      if (a === 'dice') seedIn.value = randomSeedString();
      if (a === 'daily') { const d = new Date(); seedIn.value = `DAILY-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
      if (a === 'enroll') this.enroll(seedIn.value.trim() || randomSeedString(), false, false, 'story');
      if (a === 'classic') this.enroll(seedIn.value.trim() || randomSeedString(), false, false, 'classic');
      if (a === 'long') this.enroll(seedIn.value.trim() || randomSeedString(), true, false, 'classic');
      if (a === 'quick') this.enroll(seedIn.value.trim() || randomSeedString(), false, true, 'boss');
      if (a === 'deans') this.deansOffice();
      if (a === 'prologue') this.prologue();
      if (a === 'arcade') this.arcadeMenu();
    });
  }

  // ------------------------------------------------------------------ the Dean's Office (perks)

  private deansOffice() {
    const s = this.save;
    s.perks = s.perks ?? [];
    const o = this.setOverlay(`
      <div class="screen deans">
        <div class="panel deans-card">
          <div class="kicker">${t('menu.deans')}</div>
          <h1>${t('dn.title')}</h1>
          <p>${t('dn.sub')}</p>
          <div class="dn-stamps">${s.stamps} 🔖</div>
          <div class="dn-grid">
            ${PERKS.map((p) => {
              const owned = s.perks!.includes(p.id);
              return `<button class="dn-perk ${owned ? 'owned' : ''}" data-perk="${p.id}" ${owned || s.stamps < p.cost ? 'disabled' : ''}>
                <span class="dn-icon">${p.icon}</span><b>${t('dn.' + p.id)}</b><small>${t('dn.' + p.id + '.d')}</small>
                <span class="dn-cost">${owned ? t('dn.owned') : p.cost + ' 🔖'}</span></button>`;
            }).join('')}
          </div>
          <button class="btn" data-a="back">${t('end.menu')}</button>
        </div>
      </div>`);
    o.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const id = target.closest('[data-perk]')?.getAttribute('data-perk');
      const p = PERKS.find((x) => x.id === id);
      if (p && !s.perks!.includes(p.id) && s.stamps >= p.cost) {
        s.stamps -= p.cost;
        s.perks!.push(p.id);
        writeSave(s);
        sfx.levelUp();
        this.deansOffice();
        return;
      }
      if (target.closest('[data-a=back]')) { sfx.click(); this.menu(true); }
    });
  }

  // ------------------------------------------------------------------ arcade modes

  private arcadeMenu() {
    this.endArcade();
    this.endWeek();
    if (!this.scene) this.setScene(new MenuArena(this.stage));
    const best = bestScores();
    const modes: [ModeId, string][] = [['boss', '👑'], ['drone', '🎵'], ['fight', '🥊'], ['race', '🏃‍♀️'], ['run', '🌪️'], ['dungeon', '⏰'], ['show', '📸']];
    const o = this.setOverlay(`
      <div class="screen arcade-menu">
        <h1>${t('arc.title')}</h1>
        <p class="arc-sub">${t('arc.sub')}</p>
        <div class="arc-grid">
          ${modes.map(([id, icon]) => `
            <button class="arc-card" data-mode="${id}">
              <span class="arc-icon">${icon}</span>
              <b>${t('arc.' + id)}</b>
              <small>${t('arc.' + id + '.desc')}</small>
              <span class="arc-best">${best[id] !== undefined ? t('arc.best', { n: best[id]! }) : t('arc.new')}</span>
            </button>`).join('')}
        </div>
        <h2 class="arc-2p">👥 ${t('arc.twoP')}</h2>
        <div class="arc-grid two">
          ${([['versus', '🥊'], ['show2', '📸']] as [ModeId, string][]).map(([id, icon]) => `
            <button class="arc-card p2" data-mode="${id}">
              <span class="arc-icon">${icon}</span>
              <b>${t('arc.' + id)}</b>
              <small>${t('arc.' + id + '.desc')}</small>
            </button>`).join('')}
        </div>
        <button class="btn" data-a="back">${t('end.menu')}</button>
      </div>`);
    o.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const m = target.closest('[data-mode]')?.getAttribute('data-mode') as ModeId | null;
      if (m) { sfx.unlock(); sfx.click(); this.startArcade(m); return; }
      if (target.closest('[data-a=back]')) { sfx.click(); this.menu(true); }
    });
  }

  private startArcade(id: ModeId, story?: { look: KirillLook; level: number }) {
    this.clearOverlay();
    this.setScene(null);
    this.stage.clearWorld();
    const ctx = { stage: this.stage, story, onExit: (r: ArcadeResult | null) => { this.arcadeOut = r; } };
    this.arcadeOut = undefined;
    this.arcadeId = id;
    this.arcade = id === 'fight' ? new PartyFight(ctx) : id === 'race' ? new PERace(ctx) : id === 'run' ? new SemesterRun(ctx)
      : id === 'show' ? new ThePresentation(ctx) : id === 'show2' ? new ThePresentation({ ...ctx, twoPlayer: true })
        : id === 'versus' ? new VersusFight(ctx) : id === 'drone' ? new LectureDrone(ctx) : id === 'boss' ? new BossRush(ctx) : new DormDungeon(ctx);
    music.start(0.6, id === 'boss' ? 'boss' : id === 'fight' || id === 'versus' ? 'duel' : 'week');
    this.quitBtn = el(`<button class="btn small arc-quit">✕ ${t(story ? 'il.skipNow' : 'arc.quit')}</button>`);
    this.quitBtn.addEventListener('click', () => { this.arcadeOut = null; this.arcadeDone(); });
    this.ui.appendChild(this.quitBtn);
  }

  private endArcade() {
    music.stop();
    this.arcade?.dispose();
    this.arcade = null;
    this.quitBtn?.remove();
    this.quitBtn = null;
    this.stage.override = null;
  }

  private arcadeDone() {
    const r = this.arcadeOut;
    const id = this.arcadeId!;
    this.arcadeOut = undefined;
    this.endArcade();
    // a mini-game won is Kirill's loss: the stamp comes down
    if (r?.win) stamp('debt', t('arc.' + id));
    if (this.storyDone) { const cb = this.storyDone; this.storyDone = null; cb(r ?? null); return; }
    if (!r) { this.arcadeMenu(); return; }
    const fresh = recordScore(r.mode, r.score);
    this.setScene(new ShowcaseScene(this.stage, r.win ? 'graduated' : 'burnout'));
    const o = this.setOverlay(`
      <div class="screen arcade-result ${r.win ? 'win' : 'lose'}">
        <div class="panel ar-res">
          <div class="kicker">${t('arc.' + r.mode)}</div>
          <div class="ar-res-head">${t(r.win ? 'arc.win' : 'arc.lose')}</div>
          <p>${esc(r.detail)}</p>
          <div class="ar-score">${r.score}${fresh ? `<span class="new-best">${t('arc.newBest')}</span>` : ''}</div>
          <div class="end-btns">
            <button class="btn big primary" data-a="retry">${t('arc.retry')}</button>
            <button class="btn" data-a="arcade">${t('arc.title')}</button>
          </div>
        </div>
      </div>`);
    o.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('[data-a]')?.getAttribute('data-a');
      if (a === 'retry') { sfx.click(); this.startArcade(id); }
      if (a === 'arcade') { sfx.click(); this.arcadeMenu(); }
    });
  }

  // ------------------------------------------------------------------ semester intro

  private enroll(seed: string, long = this.sem?.long ?? false, quick = this.sem?.quick ?? false, style = this.sem?.style ?? 'boss') {
    this.sem = new Semester(seed, this.save.year, long, { perks: this.save.perks ?? [], quick, style });
    fate.reset();
    // the first time: the prologue (who Kirill is, who he'll meet, who you are)
    if (style !== 'classic' && !prologueSeen()) {
      this.clearOverlay();
      this.setScene(new Prologue(this.stage, this.sem.look, () => this.enrollCard(seed)));
      return;
    }
    this.enrollCard(seed);
  }

  /** watch the prologue again from the menu */
  private prologue() {
    this.clearOverlay();
    this.setScene(new Prologue(this.stage, randomKirillLook(new Rng(Math.random() * 1e9)), () => this.menu()));
  }

  private enrollCard(seed: string) {
    const sem = this.sem!;
    this.setScene(new ShowcaseScene(this.stage, 'intro', sem.look));
    const o = this.setOverlay(`
      <div class="screen intro">
        <div class="intro-card panel">
          <div class="kicker">${esc(t('intro.kicker', { year: sem.yearName }))}</div>
          <h1>${t('intro.title')}</h1>
          <p class="blurb">${esc(lookBlurb(sem.look))}</p>
          <div class="facts">
            <div><span>${t('intro.seed')}</span><b>${esc(seed)}</b></div>
            <div><span>${t('intro.debts')}</span><b>${sem.debtLimit}</b></div>
            <div><span>${t('intro.weeks')}</span><b>${sem.order.length}</b></div>
            <div><span>${t('intro.traits')}</span><b>${t('intro.none')}</b></div>
          </div>
          <p class="hint">${t('intro.hint')}</p>
          <button class="btn big primary" data-a="go">${t('intro.start')}</button>
        </div>
      </div>`);
    o.querySelector('[data-a=go]')!.addEventListener('click', () => { sfx.click(); this.nextWeek(); });
  }

  // ------------------------------------------------------------------ weeks

  private nextWeek() {
    const sem = this.sem!;
    if (sem.style === 'boss') { this.bossWeek(); return; }
    // the story: first an upgrade for your horde, then the chapter's cutscene
    if (sem.style === 'story' && !this.boonPicked) {
      this.boonPicked = true;
      this.pickBoon(() => this.nextWeek());
      return;
    }
    if (sem.style === 'story' && !this.cutPlayed) {
      const ch = CHAPTERS[sem.slot];
      this.setScene(null);
      this.clearOverlay();
      this.endWeek();
      this.cutPlayed = true;
      this.setScene(new Cutscene(this.stage, ch, sem.slot + 1, sem.look, () => this.nextWeek()));
      return;
    }
    this.setScene(null);
    this.clearOverlay();
    this.endWeek();
    // Kirill's progress at the start of the week, so "restart week" is fair
    const snap = JSON.stringify(sem.kirill);
    this.week = new WeekRun(this.stage, sem, (r) => (sem.style === 'story' ? this.afterHorde(r) : this.weekDone(r)));
    // a chapter with its own fight afterwards doesn't end the week in a duel too
    const chapter = sem.style === 'story' ? CHAPTERS[sem.slot] : null;
    if (chapter?.after && this.week.rules.climax === 'duel') this.week.rules.duelFoe = null;
    // the presentation is the chapter's own beat (it always comes), not the week's bell
    if (chapter?.pre === 'show') this.week.rules.duelFoe = null;
    this.week.onMenu = (a) => {
      sfx.click();
      if (a === 'restart') { sem.kirill = JSON.parse(snap); this.nextWeek(); }
      else this.menu();
    };
    this.weekLive = false;
    const d = this.week.def;
    const o = this.setOverlay(`
      <div class="screen title-card">
        <div class="tc-week">${t('tc.week', { n: sem.weekNum })}</div>
        <div class="tc-title">${esc(d.title)}</div>
        <div class="tc-sub">${esc(d.locationName)}${d.waiting ? ' · ' + esc(d.waiting) : ''}</div>
        <div class="tc-meter">${d.meter.icon} ${t('tc.meter', { label: esc(d.meter.label) })}</div>
        ${sem.mood ? `<div class="tc-mood ${sem.mood}">${t('il.mood.' + sem.mood)}</div>` : ''}
      </div>`);
    setTimeout(() => {
      if (this.overlay === o) {
        o.classList.add('out');
        setTimeout(() => { if (this.overlay === o) this.clearOverlay(); }, 300);
        this.weekLive = true;
      }
    }, 2100);
  }

  private cutPlayed = false;
  private boonPicked = false;

  /** pick one of three upgrades for your horde (they stack over the semester) */
  private pickBoon(done: () => void) {
    const sem = this.sem!;
    const opts = offer(sem.boons, () => sem.rng.next());
    if (!opts.length) { done(); return; }
    this.setScene(null);
    this.endWeek();
    const o = this.setOverlay(`
      <div class="screen boon-pick">
        <div class="boon-head"><small>${t('ch.chapter', { n: sem.slot + 1 })}</small><b>${t('boon.title')}</b><i>${t('boon.sub')}</i></div>
        <div class="boon-cards">
          ${opts.map((b, i) => `<button class="boon-card" data-b="${b.id}"><span class="key">${i + 1}</span>${icon(b.icon)}<b>${t('boon.' + b.id)}</b><small>${t('boon.' + b.id + '.d')}</small><em>${'◆'.repeat(sem.boons[b.id] ?? 0)}${'◇'.repeat(b.max - (sem.boons[b.id] ?? 0))}</em></button>`).join('')}
        </div>
      </div>`);
    sfx.reveal();
    let picked = false;
    const pick = (id: string | null | undefined) => {
      if (!id || picked || this.overlay !== o) return;
      picked = true;
      const k = id as keyof typeof sem.boons;
      sem.boons[k] = (sem.boons[k] ?? 0) + 1;
      sfx.levelUp();
      removeEventListener('keydown', keyFn);
      this.clearOverlay();
      done();
    };
    const keyFn = (e: KeyboardEvent) => { const i = +e.key - 1; if (i >= 0 && i < opts.length) pick(opts[i].id); };
    addEventListener('keydown', keyFn);
    o.addEventListener('click', (e) => pick((e.target as HTMLElement).closest('[data-b]')?.getAttribute('data-b')));
    // tests (and an idle player) take the first one after a while
    this.boonAuto = () => pick(opts[0].id);
  }
  /** tests: take the offered upgrade */
  boonAuto: (() => void) | null = null;
  private preDone = false;

  // story: after the horde week comes the chapter's fight (boss, duel or presentation)
  private afterHorde(r: WeekResult) {
    const sem = this.sem!;
    const ch = CHAPTERS[sem.slot];
    this.cutPlayed = false;
    this.boonPicked = false;
    // every switch of play (horde → presentation, presentation → boss, horde → duel…) gets a quick cut
    const next = ch?.pre === 'show' && !this.preDone ? 'pre' : this.thenStage ? 'then' : ch?.after ? 'after' : null;
    if (next && this.cutFor !== sem.slot + next) {
      this.cutFor = sem.slot + next;
      this.endWeek();
      this.quickCut(ch, next, () => this.afterHorde(r));
      return;
    }
    if (ch?.pre === 'show' && !this.preDone) {
      // Sonya and Masha's laser-and-camera presentation, then their boss fight
      this.preDone = true;
      this.endWeek();
      this.setScene(null);
      this.arcadeOut = undefined;
      this.arcadeId = 'show';
      this.storyDone = (res) => {
        if (!res) { this.menu(); return; }
        this.afterHorde({ ...r, debt: r.debt || res.win, progress: Math.max(r.progress, res.progress ?? (res.win ? 1 : 0.4)) });
      };
      music.start(0.6, 'week');
      const ctx = { stage: this.stage, story: { look: sem.look, level: sem.kirill.level, hp: 1 - r.progress * 0.5 }, onExit: (res: ArcadeResult | null) => { this.arcadeOut = res; } };
      this.arcade = new ThePresentation(ctx);
      return;
    }
    this.preDone = false;
    const after = this.thenStage ? ch?.then : ch?.after;
    if (!after) { this.thenStage = false; this.weekDone(r); return; }
    this.endWeek();
    this.setScene(null);
    const finish = (res: ArcadeResult | null) => {
      if (!res) { this.thenStage = false; this.menu(); return; }
      const merged = { ...r, debt: r.debt || res.win, progress: Math.max(r.progress, res.progress ?? (res.win ? 1 : 0)) };
      // a second fight in this chapter (the Lab: Romchik as a boss after the duel)
      if (!this.thenStage && ch.then) { this.thenStage = true; this.afterHorde(merged); return; }
      this.thenStage = false;
      this.weekDone(merged);
    };
    const ctx = { stage: this.stage, onExit: (res: ArcadeResult | null) => { this.arcadeOut = res; } };
    this.arcadeOut = undefined;
    this.storyDone = finish;
    if (after.kind === 'duel') {
      this.arcadeId = 'fight';
      music.start(0.8, 'duel');
      const d = new Duel(this.stage, {
        foe: after.foe, kirillLook: sem.look, kirillHp: Math.max(0.5, 1 - r.progress * 0.4), kirillPower: 1 + 0.05 * (sem.kirill.level - 1),
        onDone: (win) => { this.arcadeOut = { mode: 'fight', win, score: 0, detail: '', progress: win ? 1 : 0 }; },
      });
      this.arcade = Object.assign({ update: (dt: number) => d.update(dt), render() {}, dispose: () => d.dispose() }, { duel: d });
      return;
    }
    // a boss fight: its title card first
    const o = this.setOverlay(`
      <div class="screen title-card boss-card">
        <div class="tc-week">${t('ch.chapter', { n: sem.slot + 1 })}</div>
        <div class="tc-boss"><img src="portraits/${after.boss}-face.jpg" alt="" onerror="this.style.display='none'"><div><small>${t('bs.youAre')}</small><b>${t('boss.name.' + after.boss)}${after.partner ? ' & ' + t('boss.name.' + after.partner) : ''}</b><i>${t('boss.title.' + after.boss)}</i></div></div>
        <small class="tc-click">${t('hol.click')}</small>
      </div>`);
    const go = () => {
      if (this.overlay !== o) return;
      this.clearOverlay();
      this.arcadeId = 'boss';
      music.start(0.75, 'boss');
      this.arcade = new BossArena(ctx, {
        boss: after.boss, partner: after.partner, map: after.map, artem: true, weekId: ch.week,
        look: sem.look, level: sem.kirill.level, mood: sem.mood, weekNum: sem.weekNum, might: boon.bossMight(sem.boons),
        summons: sem.loadout.map((c) => ({ card: c, level: sem.level(c) })),
      });
    };
    o.addEventListener('click', go);
    setTimeout(go, 3500);
  }

  private cutFor = '';
  /** playing a chapter's second fight (its `then`) */
  private thenStage = false;

  // short cutscene before switching to a different kind of gameplay
  private quickCut(ch: Chapter, next: 'pre' | 'after' | 'then', done: () => void) {
    const sem = this.sem!;
    const after = next === 'then' ? ch.then : ch.after;
    let cast: string[], lines: [string, string][], reply: string, title: string, map = ch.map;
    if (next === 'pre') {
      cast = ['masha', 'sonya']; lines = [['masha', 'taunt.masha'], ['sonya', 'taunt.sonya']]; reply = 'reply.sonya'; title = t('tr.show'); map = 'assembly';
    } else if (after?.kind === 'duel') {
      cast = [after.foe]; lines = [[after.foe, 'taunt.' + after.foe]]; reply = 'reply.' + after.foe; title = t('tr.duel', { name: t('boss.name.' + after.foe) });
    } else if (after?.kind === 'boss' && after.boss === 'finalExam') {
      cast = ['artem']; lines = [['artem', 'tr.final']]; reply = 'reply.finalExam'; title = t('boss.name.finalExam');
    } else if (after?.kind === 'boss') {
      cast = after.partner ? [after.boss, after.partner] : [after.boss];
      lines = cast.map((c) => [c, 'taunt.' + c] as [string, string]);
      reply = 'reply.' + after.boss;
      title = t('tr.vs', { name: cast.map((c) => t('boss.name.' + c)).join(' & ') });
      map = after.map ?? ch.map;
    } else { done(); return; }
    this.setScene(null);
    this.clearOverlay();
    music.start(0.5, 'lament');
    this.setScene(new Cutscene(this.stage, { ...ch, map, cast, lines, reply }, sem.slot + 1, sem.look, done, { kicker: t('tr.kicker'), title, place: t('ch.place.' + ch.id), quick: true }));
  }

  /** a boss-style week: the title card, then you fight Kirill in this week's arena as its boss */
  private bossWeek() {
    const sem = this.sem!;
    this.setScene(null);
    this.clearOverlay();
    this.endWeek();
    const weekId = sem.order[sem.slot];
    const d = weekById(weekId);
    const boss = WEEK_BOSS[weekId] ?? 'nina';
    const o = this.setOverlay(`
      <div class="screen title-card boss-card">
        <div class="tc-week">${t('tc.week', { n: sem.weekNum })}</div>
        <div class="tc-title">${esc(d.title)}</div>
        <div class="tc-sub">${esc(d.locationName)}</div>
        <div class="tc-diary">${t('diary.w' + weekId)}</div>
        <small class="tc-click">${t('hol.click')}</small>
        <div class="tc-boss"><img src="portraits/${boss}-face.jpg" alt=""><div><small>${t('bs.youAre')}</small><b>${t('boss.name.' + boss)}</b><i>${t('boss.title.' + boss)}</i></div></div>
        ${sem.mood ? `<div class="tc-mood ${sem.mood}">${t('il.mood.' + sem.mood)}</div>` : ''}
      </div>`);
    // time to read the diary; a click starts the fight sooner
    const go = () => {
      if (this.overlay !== o) return;
      this.clearOverlay();
      const ctx = { stage: this.stage, onExit: (r: ArcadeResult | null) => { this.arcadeOut = r; } };
      this.arcadeOut = undefined;
      this.arcadeId = 'boss';
      this.storyDone = (r) => {
        if (!r) { this.menu(); return; }
        // Kirill gets a level out of every week he lives through
        sem.kirill.level += 1;
        this.weekDone({ debt: r.win, progress: r.progress ?? (r.win ? 1 : 0.4), chaosLeft: 10, usage: {}, cause: '', maxCombo: 0 });
      };
      music.start(0.75, 'boss');
      this.arcade = new BossArena(ctx, {
        boss, weekId, look: sem.look, level: sem.kirill.level, mood: sem.mood, weekNum: sem.weekNum,
        summons: sem.loadout.map((c) => ({ card: c, level: sem.level(c) })),
      });
    };
    o.addEventListener('click', go);
    setTimeout(go, 6000);
  }

  private weekDone(r: WeekResult) {
    const sem = this.sem!;
    const earned = sem.applyWeek(r);
    this.weekLive = false;
    // (the story plays every chapter to the Final Exam; the debts decide the ending there)
    if (sem.expelled && sem.style !== 'story') { this.end(true); return; }
    const holidays = sem.takeHolidays();
    if (sem.done) { this.end(sem.style === 'story' && sem.expelled); return; }
    const o = this.setOverlay(`
      <div class="screen result">
        <div class="res-card panel">
          <div class="res-head ${r.debt ? 'debt' : 'pass'}">${t(r.debt ? 'res.debt' : 'res.pass')}</div>
          <div class="res-line">${t('res.debts', { d: sem.debts, l: sem.debtLimit })}</div>
          <div class="res-stress">+<span class="count">0</span> ${t('res.stress')}</div>
          <div class="res-break">
            <span>${t('res.base', { n: balance.stress.base })}</span>
            <span>${t('res.meter', { n: Math.min(10, Math.floor(r.progress * 10)) })}</span>
            ${r.debt ? `<span>${t('res.debtBonus', { n: balance.stress.perDebt })}</span>` : ''}
            <span>${t('res.chaos', { n: Math.floor(r.chaosLeft * balance.stress.perUnspentChaos) })}</span>
            ${(r.maxCombo ?? 0) >= balance.combo.stressPer ? `<span>${t('res.combo', { c: r.maxCombo ?? 0, n: Math.floor((r.maxCombo ?? 0) / balance.combo.stressPer) })}</span>` : ''}
          </div>
        </div>
      </div>`);
    const cnt = o.querySelector('.count') as HTMLElement;
    let n = 0;
    const tick = setInterval(() => { n = Math.min(earned, n + 1); cnt.textContent = String(n); sfx.click(); if (n >= earned) clearInterval(tick); }, 45);
    setTimeout(() => {
      clearInterval(tick);
      this.endWeek();
      // the cast reacts to how the week went
      const reaction = r.debt ? 'debt' : 'pass';
      this.setScene(new ShowcaseScene(this.stage, 'break', sem.look, reaction));
      const toBreak = () => {
        this.setScene(new ShowcaseScene(this.stage, 'break', sem.look, reaction));
        if (holidays.length) this.holidayCards(holidays, () => this.breakScreen());
        else this.breakScreen();
      };
      const mode = sem.interludeNext();
      if (mode) this.interlude(mode, toBreak);
      else toBreak();
    }, 2200);
  }

  // ------------------------------------------------------------------ mini-games between weeks

  private interlude(mode: ModeId, then: () => void) {
    const sem = this.sem!;
    const icon: Record<ModeId, string> = { fight: '🥊', race: '🏃‍♀️', run: '🌪️', dungeon: '⏰', show: '📸', drone: '🎵', versus: '👥', show2: '👥', boss: '👑' };
    const o = this.setOverlay(`
      <div class="screen interlude">
        <div class="panel il-card">
          <div class="kicker">${t('il.kicker', { n: sem.order[sem.slot - 1] })}</div>
          <div class="il-head"><span class="il-icon">${icon[mode]}</span> ${t('il.' + mode)}</div>
          <p class="il-story">${t('il.' + mode + '.story')}</p>
          <div class="il-stakes">
            <div class="good">${t('il.win', { n: balance.interlude.winStress })}</div>
            <div class="bad">${t('il.lose')}</div>
          </div>
          <div class="end-btns">
            <button class="btn big primary" data-a="play">${t('il.play')}</button>
            <button class="btn" data-a="skip">${t('il.skip')}</button>
          </div>
        </div>
      </div>`);
    o.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('[data-a]')?.getAttribute('data-a');
      if (a === 'skip') { sfx.click(); sem.applyInterlude(mode, null); then(); }
      if (a === 'play') {
        sfx.unlock(); sfx.click();
        this.storyDone = (r) => this.interludeResult(mode, r, then);
        this.startArcade(mode, { look: sem.look, level: sem.kirill.level });
      }
    });
  }

  private interludeResult(mode: ModeId, r: ArcadeResult | null, then: () => void) {
    const sem = this.sem!;
    const win = r ? r.win : null;
    const gained = sem.applyInterlude(mode, win);
    this.setScene(new ShowcaseScene(this.stage, win ? 'burnout' : win === false ? 'graduated' : 'break', sem.look));
    const head = win === null ? t('il.skipped') : t(win ? 'arc.win' : 'arc.lose');
    const o = this.setOverlay(`
      <div class="screen arcade-result ${win ? 'win' : 'lose'}">
        <div class="panel ar-res">
          <div class="kicker">${t('il.' + mode)}</div>
          <div class="ar-res-head">${head}</div>
          ${r ? `<p>${esc(r.detail)}</p>` : ''}
          ${win !== null ? `<div class="il-effect ${win ? 'good' : 'bad'}">${t(win ? 'il.effect.tired' : 'il.effect.fired')}${gained ? ` · +${gained} ${t('res.stress')}` : ''}</div>` : ''}
          <div class="end-btns"><button class="btn big primary" data-a="go">${t('il.continue')}</button></div>
        </div>
      </div>`);
    o.querySelector('[data-a=go]')!.addEventListener('click', () => { sfx.click(); then(); });
  }

  private holidayCards(ids: number[], then: () => void) {
    const rng = new Rng(ids.reduce((a, b) => a * 31 + b, 7));
    const jokes = rng.shuffle([...HOLIDAYS]);
    let i = 0;
    const show = () => {
      if (i >= ids.length) { then(); return; }
      const id = ids[i];
      const slot = this.sem!.transcript.find((r) => r.weekId === id)?.slot ?? 0;
      const o = this.setOverlay(`
        <div class="screen holiday">
          <div class="hol-card panel">
            <div class="kicker">${esc(t('hol.week', { n: slot, title: weekById(id).title }))}</div>
            <div class="hol-joke">${esc(jokes[i % jokes.length])}</div>
            <div class="hol-bonus">${t('hol.bonus', { n: balance.stress.holiday })}</div>
            <small>${t('hol.click')}</small>
          </div>
        </div>`);
      i++;
      const go = () => { clearTimeout(timer); o.removeEventListener('click', go); show(); };
      const timer = setTimeout(go, ids.length > 3 ? 1400 : 2600);
      o.addEventListener('click', go);
    };
    show();
  }

  // ------------------------------------------------------------------ the Break

  private breakScreen() {
    const sem = this.sem!;
    sem.breaks++;
    sem.freeReroll = sem.perks.includes('reroll');
    const b = sem.breaks;
    if (b >= 1) sem.rollDraft();
    const study = b >= 2 ? sem.kirillStudies() : null;
    let drafted = false;
    const next = weekById(sem.order[sem.slot]);

    const render = () => {
      const upgradesOn = b >= 2;
      const draftHtml = !drafted && sem.draftOffer.length
        ? sem.draftOffer.map((id) => {
          const c = CARDS[id];
          const owned = sem.deck.find((d) => d.id === id);
          return `<button class="dcard" data-draft="${id}"><span class="icon">${c.icon}</span><b>${esc(c.name)}</b><span class="cost">${t('br.chaos', { n: c.cost })}</span><small>${owned ? esc(t('br.levelUp', { n: owned.level + 1, txt: c.levels[owned.level] })) : esc(c.desc)}</small></button>`;
        }).join('') + `<button class="btn small" data-a="reroll" ${sem.stress < balance.break.reroll && !sem.freeReroll ? 'disabled' : ''}>${sem.freeReroll ? t('br.rerollFree') : t('br.reroll', { n: balance.break.reroll })}</button>`
        : `<div class="done-note">${t(drafted ? 'br.drafted' : 'br.nothing')}</div>`;
      const deckHtml = sem.deck.map((d) => {
        const c = CARDS[d.id];
        const inLo = sem.loadout.includes(d.id);
        const cost = sem.upgradeCost(d.id);
        const up = upgradesOn && d.level < 3
          ? `<button class="btn small" data-up="${d.id}" ${sem.stress < cost ? 'disabled' : ''}>${t('br.upgrade', { n: cost })}</button>`
          : d.level >= 3 ? `<span class="maxed">${t('br.max')}</span>` : '';
        return `<div class="deck-card ${inLo ? 'in' : ''}" data-lo="${d.id}">
          <span class="icon">${c.icon}</span>
          <div class="dc-body"><b>${esc(c.name)}</b> <span class="lv">${'★'.repeat(d.level)}${'☆'.repeat(3 - d.level)}</span>
          <small>${esc(c.levels[d.level - 1])}${d.level < 3 ? ` · ${t('br.nextLv')}: ${esc(c.levels[d.level])}` : ''}</small></div>
          <span class="cost">${c.cost}</span>${up}
        </div>`;
      }).join('');
      const k = sem.kirill;
      const ups = Object.entries(k.upgrades).map(([id, lv]) => `<li>${esc(pickLabel(`${id}:${lv}`))}</li>`).join('') || `<li class="muted">${t('nb.nothingYet')}</li>`;
      const cts = k.counters.map((c) => `<li class="${study?.counter === c ? 'new' : ''}">${esc(COUNTERS[c].name)} <small>${esc(COUNTERS[c].desc)}</small></li>`).join('') || `<li class="muted">${t('nb.noneYet')}</li>`;
      const st = sem.studyText();
      const reveal = b < 2
        ? `<div class="nb-reveal muted">${t('nb.notes')}</div>`
        : st ? `<div class="nb-reveal hot">${esc(st.line)}</div>` : `<div class="nb-reveal muted">${t('nb.nothing')}</div>`;
      const o = this.setOverlay(`
        <div class="screen break">
          <div class="br-head">
            <div><div class="kicker">${t('br.kicker')}</div><h1>${t('br.after', { n: sem.order[sem.slot - 1] })}</h1></div>
            <div class="br-stats"><div class="stress">${sem.stress} <span>${t('br.stress')}</span></div><div>${t('br.debts', { d: sem.debts, l: sem.debtLimit })}</div></div>
          </div>
          <div class="br-cols">
            <div class="panel br-draft"><h2>${t('br.draft')} <small>${t('br.draftSub')}</small></h2>${draftHtml}</div>
            <div class="panel br-deck"><h2>${t('br.deck')} <small>${t('br.deckSub', { n: sem.loadout.length, m: sem.loadoutSlots })}${upgradesOn ? '' : t('br.upgradesNext')}</small></h2>${deckHtml}</div>
            <div class="panel notebook">
              <h2>${t('nb.title')} <small>${t('nb.sub')}</small></h2>
              ${reveal}
              ${sem.mood ? `<div class="nb-reveal ${sem.mood === 'tired' ? 'hot' : 'muted'}">${t('il.mood.' + sem.mood)}</div>` : ''}
              <div class="nb-stats">
                <div><span>${t('nb.level')}</span><b>${k.level}</b> <small>${k.xp.toFixed(0)}/${xpForNext(k.level).toFixed(0)} XP</small></div>
                <div><span>${t('nb.scaling')}</span><b>×${(1 + 0.06 * sem.order[sem.slot]).toFixed(2)}</b></div>
              </div>
              <h3>${t('nb.build')}</h3><ul>${ups}</ul>
              <h3>${t('nb.counters')}</h3><ul>${cts}</ul>
            </div>
          </div>
          <div class="br-foot">
            <div class="next">${t('br.next')} <b>${esc(t('tc.week', { n: sem.order[sem.slot] }))} · ${esc(next.title)}</b> <span>${esc(next.locationName)}${next.waiting ? ' · ' + esc(next.waiting) : ''}</span></div>
            <button class="btn big primary" data-a="start" ${sem.loadout.length ? '' : 'disabled'}>${t('br.start', { n: sem.order[sem.slot] })}</button>
          </div>
        </div>`);
      if (study && b >= 2 && !o.dataset.revealed) sfx.reveal();
      o.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const dr = target.closest('[data-draft]')?.getAttribute('data-draft');
        const upg = target.closest('[data-up]')?.getAttribute('data-up');
        const lo = target.closest('[data-lo]')?.getAttribute('data-lo');
        const a = target.closest('[data-a]')?.getAttribute('data-a');
        if (dr) { sem.draft(dr as CardId); drafted = true; sfx.levelUp(); render(); }
        else if (upg) { if (sem.upgrade(upg as CardId)) sfx.levelUp(); render(); }
        else if (a === 'reroll') {
          if (sem.freeReroll) { sem.freeReroll = false; sem.rollDraft(); sfx.click(); render(); }
          else if (sem.stress >= balance.break.reroll) { sem.stress -= balance.break.reroll; sem.rollDraft(); sfx.click(); render(); }
        }
        else if (a === 'start') { sfx.click(); this.nextWeek(); }
        else if (lo) {
          const id = lo as CardId;
          if (sem.loadout.includes(id)) sem.loadout = sem.loadout.filter((x) => x !== id);
          else if (sem.loadout.length < sem.loadoutSlots) sem.loadout.push(id);
          else { sem.loadout.shift(); sem.loadout.push(id); }
          sfx.click();
          render();
        }
      });
    };
    render();
  }

  // ------------------------------------------------------------------ end of semester

  private end(win: boolean) {
    const sem = this.sem!;
    this.endWeek();
    const stamps = sem.stamps(win);
    this.save.stamps += stamps;
    this.save.semesters++;
    if (win) { this.save.burnouts++; this.save.year++; }
    writeSave(this.save);
    this.setScene(new ShowcaseScene(this.stage, win ? 'burnout' : 'graduated', sem.look));
    const rows = sem.transcript.map((r) => `<tr class="${r.holiday ? 'hol' : r.debt ? 'debt' : ''}">
      <td>${r.slot}</td><td>${esc(weekById(r.weekId).title)}</td><td>${r.holiday ? t('end.holiday') : r.debt ? `<b>${t('end.debt')}</b>` : `<b>${r.grade}</b>`}</td></tr>`).join('');
    const build = sem.kirill.picks.length ? sem.kirill.picks.slice(-6).map(pickLabel).join(', ') : '—';
    const o = this.setOverlay(`
      <div class="screen end ${win ? 'win' : 'lose'}">
        <div class="end-card panel">
          <div class="end-head">${t(win ? 'end.burnout' : 'end.graduated')}</div>
          <p class="end-line">${esc(win ? pickLine(BURNOUT_ENDINGS) : pickLine(GRADUATED_LINES))}</p>
          ${sem.style === 'story' && fate.cruel + fate.kind > 0 ? `<div class="end-fate ${fate.ending}"><b>${t('fate.' + fate.ending)}</b><span>${t('fate.' + fate.ending + '.d', { c: fate.cruel, k: fate.kind })}</span></div>` : ''}
          <div class="transcript">
            <div class="tr-title">${t('end.transcript', { year: esc(sem.yearName), seed: esc(sem.seed) })}</div>
            <table>${rows}</table>
            <div class="tr-foot">${esc(t('end.build', { b: build }))}<br>${esc(t('end.counters', { c: sem.kirill.counters.map((c) => COUNTERS[c].name).join(', ') || '—' }))}</div>
          </div>
          <div class="stamps">+${stamps} 🔖 ${t('end.stamps')} <small>(${t('end.total', { n: this.save.stamps })})</small></div>
          <div class="up-note">${win ? t('end.up', { year: esc(yearName(this.save.year)) }) : t('end.same')}</div>
          <div class="end-btns">
            <button class="btn big primary" data-a="next">${t('end.next')}</button>
            <button class="btn" data-a="copy">${t('end.copy')}</button>
            <button class="btn" data-a="menu">${t('end.menu')}</button>
          </div>
        </div>
      </div>`);
    win ? sfx.levelUp() : sfx.debt();
    o.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('[data-a]')?.getAttribute('data-a');
      if (a === 'next') this.enroll(randomSeedString());
      if (a === 'menu') this.menu();
      if (a === 'copy') navigator.clipboard?.writeText(sem.seed).catch(() => {});
    });
  }
}

// title screen scene
class MenuArena implements Scene {
  private cam = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 420);
  private arena: EldenArena;
  private root = new THREE.Group();
  private rigs: Rig[] = [];
  private t = 0;
  constructor(private stage: Stage) {
    stage.clearWorld();
    stage.world.add(this.root);
    stage.sun.intensity = 0; stage.hemi.intensity = 0;
    const bosses = ['nina', 'romchik', 'sonya', 'grisha', 'shady', 'pasha'];
    const boss = bosses[Math.floor(Math.random() * bosses.length)];
    this.arena = buildEldenArena(this.root, stage.scene, boss, 99);
    stage.scene.background = new THREE.Color(PALETTES[boss].fog);
    stage.post.setLook(0.6, 0.84);
    // the boss, colossal, facing the camera's side of the arena
    const b = makeCharacter(boss);
    b.root.scale.multiplyScalar(2.3);
    b.root.position.set(0, 0, -3.5);
    b.pose = 'stance';
    this.root.add(b.root);
    this.rigs.push(b);
    // Kirill kneels before it, his highlighter glowing
    const k = new Person(randomKirillLook(new Rng(Math.random() * 1e9)));
    k.root.position.set(0, 0, 2.5);
    k.root.rotation.y = Math.PI;
    k.facing = Math.PI;
    k.pose = 'crouch';
    this.root.add(k.root);
    this.rigs.push(k);
    // the rest of the cast in a ring, watching
    CHARACTER_NAMES.filter((n) => n !== boss).forEach((name, i, all) => {
      const a = Math.PI * 0.15 + (i / (all.length - 1)) * Math.PI * 1.7;
      const r = makeCharacter(name);
      const x = Math.sin(a) * 9, z = Math.cos(a) * 9 - 1;
      r.root.position.set(x, 0, z);
      r.faceTowards(Math.atan2(-x, 1 - z), 1, 100);
      r.pose = i % 3 === 0 ? 'talk' : 'idle';
      this.root.add(r.root);
      this.rigs.push(r);
    });
    stage.override = { scene: stage.scene, camera: this.cam };
  }
  update(dt: number) {
    this.t += dt;
    this.arena.update(dt, this.t, 0.15 + Math.sin(this.t * 0.4) * 0.1);
    for (const r of this.rigs) r.update(dt, 0);
  }
  render() {
    const a = this.t * 0.06 + 0.4;
    if (Math.abs(this.cam.aspect - innerWidth / innerHeight) > 1e-3) { this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix(); }
    this.cam.position.set(Math.sin(a) * 15, 2.4 + Math.sin(this.t * 0.2) * 0.6, Math.cos(a) * 15);
    this.cam.lookAt(0, 3.2, -2);
  }
  dispose() {
    if (this.stage.override?.camera === this.cam) this.stage.override = null;
    this.stage.clearWorld();
    this.stage.scene.fog = null;
    this.stage.scene.background = new THREE.Color(0x1d1a22);
    this.stage.setLighting('golden');
    this.stage.post.resetLook();
  }
}

/** Background 3D for menus: the main-building hall with a Kirill, and the cast hanging around. */
class ShowcaseScene implements Scene {
  private person: Person;
  private t = 0;
  private cast: { rig: Rig; x: number; z: number; pose: Pose }[] = [];
  constructor(private stage: Stage, private kind: 'menu' | 'intro' | 'break' | 'burnout' | 'graduated', look: KirillLook = randomKirillLook(new Rng(Math.random() * 1e9)), private reaction: 'debt' | 'pass' | null = null) {
    stage.clearWorld();
    const map = buildMap(FOYER, new Rng(42));
    stage.world.add(map.group);
    stage.setLighting('golden');
    this.person = new Person(look);
    this.person.root.position.set(-10, 0, 3);
    stage.world.add(this.person.root);
    if (kind === 'menu' || kind === 'break') {
      stage.setArena(40, 26);
    } else {
      stage.closeUp(-10, 1.1, 3, 6.5, kind === 'intro' ? -1.6 : 0);
    }
    this.person.pose = kind === 'burnout' ? 'stun' : kind === 'graduated' ? 'cheer' : 'idle';
    this.person.facing = 0;
    // the guests: in a loose ring around Kirill's corner of the hall (on free floor), each doing
    // their own thing; when the semester wins they all cheer, when he graduates they sulk
    const poses: Pose[] = ['talk', 'cheer', 'idle', 'dance', 'talk', 'throw', 'idle', 'dance'];
    CHARACTER_NAMES.forEach((name, i) => {
      const a = -0.4 + (i / CHARACTER_NAMES.length) * Math.PI * 2;
      let x = -10 + Math.cos(a) * 7.5, z = 3 + Math.sin(a) * 4.6;
      for (let k = 0; k < 12 && map.grid.blocked(x, z); k++) { x += Math.cos(a) * 0.5; z += Math.sin(a) * 0.5; }
      if (map.grid.blocked(x, z)) return;
      const rig = makeCharacter(name);
      rig.root.position.set(x, 0, z);
      rig.faceTowards(Math.atan2(-10 - x, 3 - z), 1, 100);
      const happy = kind === 'burnout' || reaction === 'debt', glum = kind === 'graduated' || reaction === 'pass';
      const pose: Pose = happy ? (i % 2 ? 'cheer' : 'dance') : glum ? (i % 3 ? 'idle' : 'stun') : poses[i];
      rig.pose = pose;
      stage.world.add(rig.root);
      this.cast.push({ rig, x, z, pose });
    });
  }
  update(dt: number) {
    this.t += dt;
    if (this.kind === 'menu' || this.kind === 'break') {
      // wander the hall like a lost freshman
      const a = this.t * 0.25;
      const x = -10 + Math.cos(a) * 5, z = 3 + Math.sin(a * 2) * 3;
      const dx = x - this.person.root.position.x, dz = z - this.person.root.position.z;
      this.person.root.position.set(x, 0, z);
      this.person.pose = this.reaction === 'debt' ? 'panic' : 'run';
      this.person.faceTowards(Math.atan2(dx, dz), dt);
      this.person.update(dt, 1.2);
    } else {
      if (this.kind === 'intro') this.person.root.rotation.y = Math.sin(this.t * 0.6) * 0.6;
      this.person.update(dt, 0);
    }
    for (const c of this.cast) c.rig.update(dt, 0);
  }
  render() {}
  dispose() {
    this.stage.clearWorld();
    this.stage.setArena(40, 26);
  }
}
