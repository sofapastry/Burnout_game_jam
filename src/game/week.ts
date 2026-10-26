import * as THREE from 'three';
import { Cutscene } from '../story/cutscene';
import type { Chapter } from '../story/campaign';
import { boon } from './boons';
import type { Stage } from '../render/stage';
import { Fx } from '../render/fx';
import { buildMap, type BuiltMap } from '../maps/builder';
import { LAYOUTS } from '../maps/layouts';
import type { Grid } from '../maps/grid';
import { Horde, type Unit } from '../horde/units';
import { Pickups } from '../horde/pickups';
import { Pasha, Nina, Artem, Romchik, Sonya, Masha, Grisha, Shady, type Character } from '../horde/characters';
import { Kirill } from '../hero/kirill';
import { CARDS, type CardId } from '../data/cards';
import { weekById, type WeekDef } from '../data/weeks';
import { LINES, pickLine } from '../data/lines';
import { Rng } from '../core/rng';
import { sfx } from '../core/audio';
import balance from '../data/balance.json';
import type { Semester, WeekResult } from './semester';
import { Hud } from '../ui/hud';
import { Possession, CONTACT_BONUS } from './possess';
import { SoulJump } from './soul';
import { makeRules, type Rules } from './rules';
import { toon, box } from '../render/toon';
import { t } from '../i18n';
import { Duel } from '../duel/duel';
import { PERace } from '../arcade/race';
import { stamp, announce, comboTier } from '../ui/juice';
import { esc } from '../ui/dom';
import { music, juice } from '../core/audio';
import { Director } from './director';
import type { Rig } from '../assets';
import type { Pose } from '../hero/person';
import { voice } from '../core/voice';
import { ThePresentation } from '../arcade/presentation';
import type { ArcadeResult } from '../arcade/common';

export interface HandSlot { card: CardId; level: number; source: 'loadout' | 'week' | 'guest'; used: boolean }
export type SkillKey = 'q' | 'w' | 'e';

const C = balance.cards, WU = balance.weekUnits, AB = balance.abilities;
const SAFE_RADIUS = 2.5;

/** One ~40 s week: map, Kirill, your horde, the week's rules. */
export class WeekRun {
  def: WeekDef;
  rng: Rng;
  map: BuiltMap;
  grid: Grid;
  fx: Fx;
  horde: Horde;
  pickups: Pickups;
  kirill: Kirill;
  rules: Rules;
  hud: Hud;
  time = 0;
  duration: number;
  chaos: number;
  pile = 0;
  hand: HandSlot[] = [];
  selected = 0;
  cds: Record<SkillKey, number> = { q: 0, w: 0, e: 0 };
  /** skills Shady disabled for the rest of the week */
  hacked = new Set<SkillKey>();
  usage: Record<string, number> = {};
  /** Pasha, Romchik, Sonya, Masha, plus Grisha/Shady when they show up */
  guests: Character[] = [];
  nina: Nina | null = null;
  artem: Artem | null = null;
  private artemAt = Infinity;
  private grishaAt = Infinity;
  private shadyAt = Infinity;
  private zones: { x: number; z: number; r: number; t: number; mesh: THREE.Group }[] = [];
  private hitStop = 0;
  private hitStopCd = 0;
  private flowT = 0;
  ended = false;
  paused = false;
  private endT = 0;
  private result: WeekResult | null = null;
  private doneCalled = false;
  private cursor: { x: number; z: number; ok: boolean } | null = null;
  private cursorDisc: THREE.Group;
  private safeRing: THREE.Group;
  private listeners: [EventTarget, string, EventListener][] = [];
  private clock = 0;
  tutorialStep = -1;
  private tutorialT = 0;
  possess: Possession;
  /** ceiling + full-height south wall, only shown in first person */
  private fpOnly = new THREE.Group();
  /** where the mouse points on the floor (week verbs use it: aiming, gaze, dragging) */
  cursorGround: { x: number; z: number } | null = null;
  private lastCause = '';
  duel: Duel | null = null;
  /** PE week: the climax is Nina's norm race instead of a duel */
  race: PERace | ThePresentation | null = null;
  private duelDone = false;
  // hit combos (GDD §17 feel): hits on Kirill within a short window chain up
  combo = 0;
  comboT = 0;
  maxCombo = 0;
  // Kirill's All-Nighter comeback, once per week
  private allNighterUsed = false;
  private story = false;
  /** the story's horde stages: you play from inside your units and jump between them */
  soul: SoulJump | null = null;
  private secondWind = false;
  private wave = 1;
  private musicOn = false;
  allNighterCharge = 0;

  constructor(public stage: Stage, public sem: Semester, private onDone: (r: WeekResult) => void) {
    this.def = weekById(sem.order[sem.slot]);
    this.rng = sem.rng.fork('week' + sem.slot);
    stage.clearWorld();
    const layout = LAYOUTS[this.def.location];
    this.map = buildMap(layout, this.rng.fork('map'));
    this.grid = this.map.grid;
    stage.world.add(this.map.group);
    stage.setArena(layout.w, layout.h);
    stage.setLighting(layout.mood);

    this.fx = new Fx(stage);
    this.horde = new Horde(this.grid);
    this.pickups = new Pickups();
    stage.world.add(this.horde.group, this.pickups.group);
    // rules first: Kirill's stats read them
    this.rules = makeRules(this);
    // the story's horde stages run a little longer, in three waves, and Kirill gets one second wind
    this.story = sem.style === 'story';
    if (this.story) this.rules.duration *= this.rules.meterMode === 'fail' ? 1.3 : 1.1;
    this.duration = this.rules.duration;
    this.kirill = new Kirill(this, sem.look, sem.kirill, this.def.heroMode, sem.weekNum, sem.year, this.def.id);
    this.chaos = sem.chaosStart;

    for (const id of sem.loadout) if (id !== 'pasha') this.hand.push({ card: id, level: sem.level(id), source: 'loadout', used: false });
    const [w4, w5, guest] = this.def.cards;
    if (w4) this.hand.push({ card: w4, level: 1, source: 'week', used: false });
    if (w5) this.hand.push({ card: w5, level: 1, source: 'week', used: false });
    if (guest && !sem.loadout.includes(guest)) this.hand.push({ card: guest, level: sem.level(guest), source: 'guest', used: false });

    const AR = balance.allies;
    if (this.def.artem) this.artemAt = this.rng.range(AR.artem.arrivesSec[0], AR.artem.arrivesSec[1]);
    if (this.def.id !== 1 && this.rng.chance(balance.guests.grisha.chancePerWeek)) this.grishaAt = this.rng.range(10, 25);
    if (sem.artemHelped || (this.def.id === 14 && sem.artemHelped)) this.shadyAt = this.rng.range(AR.shady.arrivesSec[0], AR.shady.arrivesSec[1]);

    this.cursorDisc = this.fx.disc(0.45, 0x5fe07a, 0.35);
    this.safeRing = this.fx.disc(SAFE_RADIUS, 0xe8573a, 0.08);
    this.cursorDisc.visible = false;

    this.possess = new Possession(this);
    if (this.story) this.soul = new SoulJump(this);
    this.buildFirstPersonShell();
    this.hud = new Hud(this);
    this.rules.setup();
    if (this.rules.verbHint) this.hud.hint(t(this.rules.verbHint));
    this.bindInput();
    this.feed(t('feed.pressF'), 'yours');
    this.kirill.say(this.def.heroMode === 'lost' ? LINES.kirillLost : LINES.kirillStart, true);
    // the three-step guide, the first time only
    let tutDone = false;
    try { tutDone = localStorage.getItem('burnout.tutorial') === 'done'; } catch { /* storage blocked */ }
    if (this.def.id === 1 && sem.weekNum === 1 && !tutDone) this.tutorialStep = 0;
    this.computeFlow();
    this.director = new Director(this);
    // open on a low sweep onto Kirill (under the title card)
    stage.sweep(this.kirill.x, this.kirill.z);
  }
  director: Director;
  /** when a card was last played (events only help a semester that's actually playing) */
  lastCardAt = -99;

  /** From the top-down camera the room is open-topped with a low south wall; at eye level it needs closing. */
  private buildFirstPersonShell() {
    const L = this.map.layout;
    if (L.outdoor) { this.stage.world.add(this.fpOnly); this.fpOnly.visible = false; return; }
    const H = L.wall.height;
    const ceilMat = toon(0xf1ead8, { emissive: L.mood === 'dark' ? 0x0a0a0c : 0x4a4438 });
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(L.w + 1, L.h + 1), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = H;
    this.fpOnly.add(ceil);
    // fluorescent light panels like the corridor sheets (off in the blackout)
    const panel = toon(0xffffff, { emissive: L.mood === 'dark' ? 0x111111 : 0xfff4dc, emissiveIntensity: 0.9 });
    for (let x = -L.w / 2 + 4; x < L.w / 2; x += 8)
      for (let z = -L.h / 2 + 3.5; z < L.h / 2; z += 6.5) {
        const m = new THREE.Mesh(box(2.4, 0.06, 0.6), panel);
        m.position.set(x, H - 0.04, z);
        this.fpOnly.add(m);
      }
    const south = new THREE.Mesh(box(L.w + 1, H, 0.4), toon(L.wall.upper));
    south.position.set(0, H / 2, L.h / 2 + 0.2);
    const southLow = new THREE.Mesh(box(L.w + 1.02, 1.1, 0.42), toon(L.wall.lower));
    southLow.position.set(0, 0.55, L.h / 2 + 0.2);
    this.fpOnly.add(south, southLow);
    this.fpOnly.visible = false;
    this.stage.world.add(this.fpOnly);
  }

  get progress() { return this.rules.progress(); }
  get pashaOn() { return this.guests.some((g) => g.alive && g instanceof Pasha); }

  // ---------------------------------------------------------------- input

  private on(target: EventTarget, type: string, fn: EventListener) {
    target.addEventListener(type, fn);
    this.listeners.push([target, type, fn]);
  }

  private bindInput() {
    const canvas = this.stage.renderer.domElement;
    // Russian layout keys map to the same physical keys
    const RU: Record<string, string> = { 'й': 'q', 'ц': 'w', 'у': 'e', 'к': 'r', 'а': 'f', 'ф': 'a', 'ы': 's', 'в': 'd' };
    const keyOf = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); return RU[k] ?? k; };
    this.on(window, 'keydown', ((e: KeyboardEvent) => {
      if (this.duel || this.race || this.cut) return;
      const k = keyOf(e);
      const fp = this.possess.active;
      if (!fp && k === 'r' && !e.repeat && this.rules.onRotate) { this.rules.onRotate(); return; }
      if (fp) {
        if (['w', 'a', 's', 'd', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { this.possess.keys.add(k); e.preventDefault(); return; }
      }
      if (this.soul && (k === 'c' || k === 'tab' || k === 'с')) { e.preventDefault(); if (!e.repeat) this.soul.jump(); return; }
      if (this.soul && k === 'escape') { this.togglePause(); return; }

      if (e.repeat) return;
      if (fp && !e.repeat && (k === 'x' || (this.soul && k === 'f'))) { this.possess.skill(0); return; }
      if (fp && !e.repeat && (k === 'z' || (this.soul && k === 'g'))) { this.possess.skill(1); return; }
      if (k === 'g' && fp) { this.throwAtCrosshair(); return; }
      // the action controls while possessing: J/click attack, Space dash, V camera
      if (fp && k === 'j') { this.possess.attack(); return; }
      if (fp && k === ' ') { this.possess.dash(); e.preventDefault(); return; }
      if (fp && k === 'v') { this.possess.toggleView(); return; }
      if (k >= '1' && k <= '6') this.select(+k - 1);
      else if (k === 'f') this.togglePossess();
      else if (k === 'q') this.useSkill('q');
      else if (k === 'e') this.useSkill('e');
      else if ((k === 'w' && !fp) || (k === 'r' && fp)) this.useSkill('w');
      else if (k === 'escape' && fp) this.possess.exit();
      else if (k === ' ' || k === 'escape') {
        this.togglePause();
        e.preventDefault();
      }
    }) as EventListener);
    this.on(window, 'keyup', ((e: KeyboardEvent) => { this.possess.keys.delete(keyOf(e)); }) as EventListener);
    this.on(window, 'blur', (() => this.possess.keys.clear()) as EventListener);
    this.on(canvas, 'mousemove', ((e: MouseEvent) => {
      if (this.duel) return;
      if (this.possess.active) this.possess.look(e.movementX, e.movementY);
      else {
        this.hover(e.clientX, e.clientY);
        if (this.cursorGround) this.rules.onPointerMove?.(this.cursorGround.x, this.cursorGround.z);
      }
    }) as EventListener);
    this.on(window, 'mouseup', (() => this.rules.onPointerUp?.()) as EventListener);
    this.on(canvas, 'mousedown', ((e: MouseEvent) => {
      sfx.unlock();
      if (this.duel || this.race) return;
      if (this.possess.active) {
        if (document.pointerLockElement !== canvas) {
          try { (canvas.requestPointerLock?.() as unknown as Promise<void> | undefined)?.catch?.(() => {}); } catch { /* ignore */ }
          return;
        }
        if (this.paused) { this.paused = false; this.hud.setPaused(false); }
        if (e.button === 0) this.possess.attack();
        else if (e.button === 2) this.throwAtCrosshair();
        return;
      }
      this.hover(e.clientX, e.clientY);
      if (e.button === 2 && this.rules.onRotate) { this.rules.onRotate(); return; }
      // week verbs first (grabbing food in Week 13), then card placement
      if (e.button === 0 && this.cursorGround && this.rules.onPointerDown?.(this.cursorGround.x, this.cursorGround.z)) return;
      if (e.button === 0) this.click();
    }) as EventListener);
    this.on(canvas, 'contextmenu', ((e: Event) => e.preventDefault()) as EventListener);
    // Losing the mouse capture doesn't end first person (browsers drop it for many reasons);
    // the HUD just asks for a click to capture again. F or Esc leaves.
    this.on(document, 'pointerlockchange', (() => this.hud.setMouseCaptured(document.pointerLockElement === canvas)) as EventListener);
    this.on(document, 'pointerlockerror', (() => {
      console.warn('[possess] pointer lock was refused by the browser');
      this.hud.setMouseCaptured(false);
    }) as EventListener);
  }

  /** the pause menu's buttons: restart this week or quit to the main menu (set by the game) */
  onMenu?: (a: 'restart' | 'quit') => void;

  togglePause() {
    if (this.ended || this.duel || this.race) return;
    this.paused = !this.paused;
    this.hud.setPaused(this.paused);
    if (this.paused && this.possess.active) document.exitPointerLock();
  }

  togglePossess() {
    if (this.ended || this.paused) return;
    if (this.possess.active) { this.possess.exit(); return; }
    const g = this.cursorGround;
    // nearest to the cursor; without one, the unit furthest from Kirill's beam
    const u = g ? this.possess.pick(g.x, g.z) : this.possess.pickSafest(this.kirill.x, this.kirill.z);
    if (!u) { sfx.denied(); this.hud.toast(t('toast.spawnFirst')); return; }
    this.possess.enter(u);
  }

  // melee hit from a possessed unit
  strikeKirill(u: Unit, power: number, finisher: boolean) {
    const k = this.kirill;
    if (this.ended) return;
    let mult = this.registerHit();
    if (this.soul && this.soul.ambush > 0) {
      this.soul.ambush = 0;
      mult *= boon.ambush(this.sem.boons);
      this.fx.popup(k.x, 3.0, k.z, t('soul.ambush'), 'grade-2');
      sfx.ambush();
    }
    this.rules.hurt(Math.max(1, u.touchDmg) * CONTACT_BONUS * power * mult, CARDS[(u.card ?? 'popQuiz') as CardId]?.name ?? '');
    this.hitStop = finisher ? 0.1 : 0.05;
    this.stage.shake(finisher ? 0.45 : 0.18);
    this.fx.burst(k.x, k.z, finisher ? 0xff7a2a : 0xffd24a, finisher ? 12 : 6);
    if (finisher) {
      const dx = k.x - u.x, dz = k.z - u.z, d = Math.hypot(dx, dz) || 1;
      k.standUp();
      k.x += (dx / d) * 1.4; k.z += (dz / d) * 1.4;
      this.grid.resolve(k, k.r);
      k.stun = Math.max(k.stun, 0.35);
      this.fx.popup(k.x, 2.6, k.z, t('pop.finisher'), 'grade-2');
      juice.sting(2);
    }
    sfx.hurt();
    // his notes fly out: coins for whoever is faster
    // (they land just outside his pickup magnet, so it's a real race)
    const ring = k.stats.pickup + 0.7;
    for (let i = 0; i < (finisher ? 3 : 1); i++) {
      const ang = Math.random() * Math.PI * 2;
      const p = { x: k.x + Math.sin(ang) * ring, z: k.z + Math.cos(ang) * ring };
      this.grid.resolve(p, 0.2);
      this.pickups.drop(p.x, p.z, 1, 0.2);
    }
  }

  /** First person: G (or RMB) spawns the selected card where the crosshair hits the floor. */
  private throwAtCrosshair() {
    if (this.soul) return;
    const slot = this.hand[this.selected];
    const p = this.stage.crosshairPoint();
    if (!slot || !p) { sfx.denied(); this.hud.toast(t('toast.aimFloor')); return; }
    const spot = this.spawnSpot(slot.card, p.x, p.z);
    this.cursor = { x: spot?.x ?? p.x, z: spot?.z ?? p.z, ok: !!spot && this.chaos >= this.costOf(slot) && !(slot.source === 'guest' && slot.used) };
    this.click();
  }

  setFirstPerson(on: boolean) {
    this.fpOnly.visible = on;
    this.hud.setFirstPerson(on, this.possess.unit);
    // outdoors there's a sky above
    this.stage.scene.background = new THREE.Color(on && this.map.layout.outdoor ? 0x9cc7ea : 0x1d1a22);
    if (on) this.cursor = null;
  }

  detonate(u: Unit) {
    if (u.alive) this.explode(u);
  }

  select(i: number) {
    // the story summons by itself (your squad comes on its own): nothing to pick
    if (this.soul) return;
    if (i < this.hand.length) { this.selected = i; sfx.click(); }
  }

  private hover(cx: number, cy: number) {
    const p = this.stage.groundPoint(cx, cy);
    this.cursorGround = p ? { x: p.x, z: p.z } : null;
    if (!p || Math.abs(p.x) > this.grid.w / 2 || Math.abs(p.z) > this.grid.h / 2) { this.cursor = null; return; }
    const slot = this.hand[this.selected];
    const spot = slot ? this.spawnSpot(slot.card, p.x, p.z, true) : null;
    const cost = slot ? this.costOf(slot) : 99;
    this.cursor = { x: spot?.x ?? p.x, z: spot?.z ?? p.z, ok: !!spot && this.chaos >= cost && !(slot.source === 'guest' && slot.used) };
  }

  costOf(s: HandSlot) {
    return s.source === 'guest' ? 0 : CARDS[s.card].cost;
  }

  /** a legal spot for a card near (x, z), or null (Soul Jump's free waves use it) */
  freeSpot(card: CardId, x: number, z: number) { return this.spawnSpot(card, x, z); }

  private spawnSpot(card: CardId, x: number, z: number, hovering = false) {
    const k = this.kirill;
    if (card === 'ticket') return { x, z };
    // cars and the Queue run a route check that's too slow (and too chatty) for every mouse move
    if (!hovering || !['car', 'queue'].includes(card)) {
      const custom = this.rules.spawnSpot(card, x, z);
      if (custom !== undefined) return custom;
    }
    const ghost = card === 'drawing';
    let spot: { x: number; z: number } | null = { x, z };
    if (this.grid.blocked(x, z, ghost)) spot = this.grid.nearestFree(x, z, ghost, 1.5);
    if (!spot || Math.hypot(spot.x - k.x, spot.z - k.z) < SAFE_RADIUS) return null;
    return spot;
  }

  private click() {
    if (this.ended || this.paused || !this.cursor || this.soul) return;
    const slot = this.hand[this.selected];
    if (!slot) return;
    // re-check with the full rules (route checks are skipped while hovering)
    const spot = this.cursor.ok ? this.spawnSpot(slot.card, this.cursor.x, this.cursor.z) : null;
    if (!this.cursor.ok || !spot) {
      sfx.denied();
      if (this.cursor.ok) return; // the rules already explained why
      const why = t(this.chaos < this.costOf(slot) ? 'toast.noChaos' : slot.used && slot.source === 'guest' ? 'toast.guestUsed' : 'toast.tooClose');
      this.hud.toast(why);
      return;
    }
    this.chaos -= this.costOf(slot);
    if (slot.source === 'guest') slot.used = true;
    if (slot.source !== 'week') this.usage[slot.card] = (this.usage[slot.card] ?? 0) + 1;
    this.playCard(slot.card, slot.level, spot.x, spot.z);
    sfx.place();
    if (this.tutorialStep === 0) { this.tutorialStep = 1; this.tutorialT = 0; }
  }

  // ---------------------------------------------------------------- cards

  /** Spawn a unit with settings; the week's rules get to adjust it. */
  spawnUnit(kind: Unit['kind'], x: number, z: number, o: Partial<Unit> = {}) {
    const u = this.horde.spawn(kind, x, z);
    if (u) Object.assign(u, o);
    // the story's horde upgrades: tougher bodies that hit harder
    if (u && this.soul && !u.stationary) {
      const B = this.sem.boons, hp = boon.unitHp(B) * 1.3;
      u.hp = Math.ceil(u.hp * hp); u.maxHp = Math.ceil(u.maxHp * hp);
      u.touchDmg *= boon.unitDmg(B);
    }
    return u;
  }

  playCard(card: CardId, level: number, x: number, z: number) {
    const k = this.kirill;
    this.fx.ring(x, z, 0.2, 1.1, 0.35, 0xffd24a, 0.8);
    this.lastCardAt = this.time;
    // units land with a thump and a shout
    juice.thump();
    this.stage.punch(0.012);
    this.fx.say('shout', () => new THREE.Vector3(x, 0, z), CARDS[card].name.toUpperCase() + '!', 1.0, 1.7, 'shout');
    const before = new Set(this.horde.units.filter((u) => u.alive).map((u) => u.index));
    if (this.rules.playCard(card, level, x, z)) return;
    const unit = (kind: Unit['kind'], o: Partial<Unit>) => this.spawnUnit(kind, x, z, { card, level, ...o });
    switch (card) {
      case 'popQuiz': {
        const n = 3; // a quiz comes as a small swarm
        for (let i = 0; i < n; i++) {
          const u = unit('quiz', { hp: C.popQuiz.hp, maxHp: 1, speed: C.popQuiz.speed * (level >= 2 ? 1.5 : 1) * (0.9 + Math.random() * 0.2), r: 0.28, touchDmg: C.popQuiz.touchDmg, pile: C.popQuiz.pile });
          if (u) { u.x += (Math.random() - 0.5) * 0.8; u.z += (Math.random() - 0.5) * 0.8; }
        }
        break;
      }
      case 'deadline':
        unit('deadline', { hp: C.deadline.hp, maxHp: C.deadline.hp, speed: C.deadline.speed, r: 0.34, touchDmg: C.deadline.touchDmg, pile: C.deadline.pile });
        break;
      case 'partner':
        unit('partner', { hp: C.partner.hp, maxHp: C.partner.hp, speed: C.partner.speed, r: 0.4, pile: C.partner.pile });
        break;
      case 'guard': {
        const g = unit('guard', { stationary: true, targetable: false, life: C.guard.lifeSec, r: 0.38, cd: 0.5 });
        if (g && level >= 3) {
          const s2 = this.grid.nearestFree(x + 1.2, z, false, 2);
          if (s2) this.spawnUnit('guard', s2.x, s2.z, { card, level, stationary: true, targetable: false, life: C.guard.lifeSec, r: 0.38 });
        }
        break;
      }
      case 'medBall':
        unit('medBall', { hp: C.medBall.hp, maxHp: C.medBall.hp, speed: C.medBall.speed, r: 0.42, touchDmg: C.medBall.touchDmg, pile: C.medBall.pile, bounces: level >= 3 ? 2 : 0 });
        break;
      case 'drawing':
        unit('drawing', { hp: WU.drawing.hp, maxHp: WU.drawing.hp, speed: WU.drawing.speed, r: 0.45, ghost: true, pile: WU.drawing.pile, touchDmg: 3 });
        break;
      case 'gost': {
        const u = unit('gost', { hp: WU.gost.hp, maxHp: WU.gost.hp, stationary: true, life: WU.gost.lifeSec, r: 0.38 });
        if (u) {
          const disc = this.fx.disc(WU.gost.auraRadius, 0xc0392b, 0.08);
          disc.position.set(x, 0.035, z);
          this.addZone(x, z, 0, WU.gost.lifeSec, disc);
          this.fx.say('gost' + u.index, () => new THREE.Vector3(u.x, 0, u.z), pickLine(LINES.gost), 2, 1.9);
        }
        break;
      }
      case 'volley': {
        const dx = k.x - x, dz = k.z - z, d = Math.hypot(dx, dz) || 1;
        unit('volley', { projectile: false, targetable: false, r: 0.26, touchDmg: WU.volley.touchDmg, bounces: WU.volley.bounces, vx: (dx / d) * WU.volley.speed, vz: (dz / d) * WU.volley.speed, speed: WU.volley.speed, life: 10 });
        break;
      }
      case 'pasha':
        this.guests.push(new Pasha(this, x, z, level));
        this.feed(t('feed.pasha'), 'yours');
        break;
      case 'romchik':
        this.guests.push(new Romchik(this, x, z, level));
        break;
      case 'sonya':
        this.guests.push(new Sonya(this, x, z, level));
        break;
      case 'masha':
        this.guests.push(new Masha(this, x, z, level));
        break;
      case 'ticket':
        this.examTicket(level);
        break;
    }
    for (const u of this.horde.units) if (u.alive && !before.has(u.index)) this.rules.adopt(u);
  }

  private examTicket(level: number) {
    const k = this.kirill;
    const soft = k.has('luckyPen') ? 0.5 : 1;
    const effects = [
      () => { k.stun = Math.max(k.stun, 2 * soft); this.fx.popup(k.x, 2.4, k.z, t('pop.ticketBlank'), 'grade-bad'); },
      () => { this.rules.hurt(15 * soft, t('cause.ticket')); },
      () => { if (!this.rules.ticketBonus()) { this.chaos = Math.min(balance.chaos.max, this.chaos + 6); this.hud.toast(t('toast.ticketChaos')); } },
    ];
    const picks = level >= 2 ? [0] : [this.rng.int(0, 2)];
    if (level >= 3) picks.push(this.rng.int(1, 2));
    for (const i of picks) effects[i]();
    this.fx.ring(k.x, k.z, 0.3, 2, 0.4, 0xe8c547);
  }

  // ---------------------------------------------------------------- skills

  useSkill(key: SkillKey) {
    if (this.ended || this.paused) return;
    if (this.hacked.has(key)) { sfx.denied(); this.hud.toast(t('toast.hacked')); return; }
    if (this.cds[key] > 0) { sfx.denied(); return; }
    const k = this.kirill;
    if (key === 'w') {
      k.stun = Math.max(k.stun, AB.email.stunSec * (k.has('inboxZero') ? 0.7 : 1));
      this.cds.w = AB.email.cooldown;
      sfx.email();
      this.fx.ring(k.x, k.z, 0.3, 1.6, 0.4, 0x6fb7e8);
      this.fx.popup(k.x, 2.6, k.z, t('pop.email'), 'skill');
      this.usage.email = (this.usage.email ?? 0) + 1;
    } else if (key === 'e') {
      const ex = this.rng.pick(this.map.layout.exits);
      k.panic = Math.max(0.5, AB.fireAlarm.panicSec - (k.has('knowsExits') ? 1 : 0));
      k.panicTarget = ex;
      this.cds.e = AB.fireAlarm.cooldown;
      sfx.alarm();
      k.say(LINES.kirillPanic, true);
      this.stage.shake(0.15);
      this.usage.fireAlarm = (this.usage.fireAlarm ?? 0) + 1;
    } else {
      if (!this.def.skill) return;
      this.cds.q = this.skillCooldown();
      this.rules.skill();
      this.computeFlow();
    }
    if (this.tutorialStep === 1) { this.tutorialStep = 2; this.tutorialT = 0; }
  }

  skillCooldown() {
    return balance.skillCooldowns[this.def.skill as keyof typeof balance.skillCooldowns] ?? 14;
  }

  /** Shady disables one of your skills for the rest of the week. */
  hackSkill(): SkillKey | null {
    const options = (['q', 'w', 'e'] as SkillKey[]).filter((s) => !this.hacked.has(s) && (s !== 'q' || this.def.skill));
    if (!options.length) return null;
    const key = this.rng.pick(options);
    this.hacked.add(key);
    this.feed(t('feed.hacked', { key: key === 'w' && this.possess.active ? 'R' : key.toUpperCase() }), 'ally');
    sfx.denied();
    return key;
  }

  // ---------------------------------------------------------------- world queries used by Kirill & co.

  /** Solid circles Kirill can't walk through: guards, inspectors, fans, Nina. */
  solids() {
    const out: { x: number; z: number; r: number }[] = [];
    for (const u of this.horde.units) if (u.alive && u.stationary && u.kind !== 'garland' && u.kind !== 'teacup') out.push(u);
    if (this.nina) out.push({ x: this.nina.x, z: this.nina.z, r: this.nina.r });
    return out;
  }

  /** Non-unit things Kirill flees from. */
  threats() {
    const out: { x: number; z: number }[] = this.guests.filter((g) => g.alive && g instanceof Pasha);
    if (this.nina) out.push(this.nina);
    return out;
  }

  inPanicZone(x: number, z: number) {
    return this.zones.some((zn) => zn.r > 0 && Math.hypot(zn.x - x, zn.z - z) < zn.r);
  }

  addZone(x: number, z: number, r: number, life: number, mesh: THREE.Group) {
    this.zones.push({ x, z, r, t: life, mesh });
  }

  feed(text: string, cls = '') { this.hud.feed(text, cls); }

  onKirillLevel(label: string, desc: string, free = false) {
    sfx.levelUp();
    this.hud.announce(t(free ? 'kirill.freeUpgrade' : 'kirill.picked', { x: label }), desc);
    this.feed(t('feed.picked', { x: label }), 'kirill');
    this.fx.ring(this.kirill.x, this.kirill.z, 0.5, 2.5, 0.5, 0x23c4b8);
    this.kirill.say(LINES.kirillLevel);
  }

  artemHelps() {
    this.rules.artemHelp();
    this.sem.artemHelped = true;
    this.feed(t('feed.artemHelped'), 'ally');
  }

  // ---------------------------------------------------------------- damage helpers for the rules

  private gradeText(dmg: number) {
    return dmg >= 10 ? ['2!', 'grade-2'] : dmg >= 5 ? ['3-', 'grade-3'] : ['4', 'grade-4'];
  }

  /** Sanity weeks: a hit takes Sanity. */
  sanityHit(dmg: number, cause = '') {
    const k = this.kirill;
    if (this.ended) return;
    k.sanity -= dmg;
    this.chaosBonus(dmg * balance.chaos.bonusPerHeroDamage);
    this.flashHit(dmg, cause);
  }

  /** The visible/audible part of a hit (grade pop-up, flinch, line), whatever the meter. */
  flashHit(dmg: number, cause = '') {
    const k = this.kirill;
    if (dmg <= 0) return;
    k.rig.hurt();
    const [g, cls] = this.gradeText(dmg);
    if (cls === 'grade-2') { this.director.bigHit(); this.stage.punch(0.035); }
    if (Math.random() < 0.3) voice.play('kirill_hurt');
    this.fx.popup(k.x, 2.4, k.z, g, cls);
    sfx.hurt();
    if (cause) this.lastCause = cause;
    if (Math.random() < 0.35) k.say(LINES.kirillHurt);
  }

  /** A hit from your side landed on Kirill: chain the combo and return the damage multiplier. */
  registerHit() {
    const CB = balance.combo;
    this.combo = this.comboT > 0 ? this.combo + 1 : 1;
    this.comboT = CB.window;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    if (this.combo >= 2) this.chaosBonus(CB.chaosPerStep * Math.min(this.combo, 10));
    this.hud.combo(this.combo);
    if ([5, 10, 18, 30].includes(this.combo)) { announce(comboTier(this.combo)); this.stage.punch(0.03 + comboTier(this.combo) * 0.015); }
    return 1 + Math.min(CB.maxBonus, (this.combo - 1) * CB.dmgPerStep);
  }

  chaosBonus(v: number) {
    this.chaos = Math.min(balance.chaos.max, this.chaos + v);
  }

  /** Back-compat for rules that convert damage elsewhere. */
  hurtKirill(dmg: number, cause = '') { this.rules.hurt(dmg, cause); }

  addPile(v: number, icon = '📄') {
    this.pile += v;
    this.chaosBonus(v * 3);
    this.kirill.rig.hurt();
    this.fx.popup(this.kirill.x, 2.3, this.kirill.z, `+${v % 1 ? v.toFixed(1) : v} ${icon}`, 'grade-3');
    sfx.paper();
  }

  damageUnit(u: Unit, dmg: number) {
    if (!u.alive) return;
    if (this.rules.damage(u, dmg)) return;
    if (u.kind === 'drawing') {
      for (const g of this.horde.units)
        if (g.alive && g.kind === 'gost' && Math.hypot(g.x - u.x, g.z - u.z) < WU.gost.auraRadius) { dmg *= WU.gost.drawingDamageTaken; break; }
    }
    u.hp -= dmg;
    u.flash = 0.08;
    if (u.hp <= 0.001) this.killUnit(u, true);
  }

  /** Remove a unit (and any obstacle it put on the grid). */
  removeUnit(u: Unit) {
    if (u.dyn) { this.grid.setDynamic(u.dyn, null); u.dyn = null; }
    this.horde.kill(u);
  }

  killUnit(u: Unit, drop: boolean) {
    this.removeUnit(u);
    const color = u.kind === 'deadline' ? 0xd8382a : u.kind === 'partner' ? 0x8bc34a : u.kind === 'medBall' ? 0x7a4a2a : u.kind === 'leafPile' ? 0xd9a63a : 0xf6f3ea;
    this.fx.burst(u.x, u.z, color, u.mini ? 3 : 6);
    if (drop) {
      sfx.kill();
      this.director.unitKilled();
      const value = u.kind === 'quiz' ? 1 : u.kind === 'gost' ? 3 : 2;
      this.pickups.drop(u.x, u.z, value);
      if (this.hitStopCd <= 0) { this.hitStop = 0.04; this.hitStopCd = 0.15; }
      if (u.kind === 'quiz' && u.level >= 3 && !u.mini && u.card === 'popQuiz') {
        for (let i = 0; i < 2; i++)
          this.spawnUnit('quiz', u.x + (i ? 0.3 : -0.3), u.z, { card: u.card, level: 1, mini: true, scale: 0.6, hp: 1, maxHp: 1, speed: u.speed * 1.1, r: 0.2, touchDmg: 2, pile: 0.25, behavior: u.behavior });
      }
      if (u.kind === 'partner' && u.level >= 3) {
        this.kirill.state.xp = Math.max(0, this.kirill.state.xp - 3);
        this.fx.popup(u.x, 1.6, u.z, t('pop.credit'), 'skill');
      }
    }
    if ((u.kind === 'partner' || u.kind === 'envelope') && u.attached && this.kirill.has('justSaysNo')) this.kirill.noStick = 5;
    this.rules.onKill(u);
  }

  private explode(u: Unit) {
    const k = this.kirill;
    const rad = C.deadline.blastRadius * (u.level >= 2 ? 1.5 : 1);
    this.fx.ring(u.x, u.z, 0.3, rad, 0.35, 0xff7a2a, 0.9);
    this.fx.burst(u.x, u.z, 0xd8382a, 10, 0.5, 5);
    this.stage.shake(0.45);
    sfx.boom();
    this.hitStop = Math.max(this.hitStop, 0.06);
    if (Math.hypot(k.x - u.x, k.z - u.z) < rad + k.r) {
      if (k.has('laptopShield') && k.shieldCd <= 0) {
        k.shieldCd = 8;
        this.fx.popup(k.x, 2.4, k.z, t('pop.blocked'), 'skill');
      } else {
        u.touchDmg *= this.registerHit();
        this.rules.blast(u);
      }
    }
    if (u.level >= 3) {
      const disc = this.fx.disc(2, 0xff7a2a, 0.18);
      disc.position.set(u.x, 0.035, u.z);
      this.addZone(u.x, u.z, 2, 2, disc);
    }
    this.killUnit(u, false);
  }

  private contact(u: Unit) {
    const k = this.kirill;
    if (this.rules.contact(u)) return;
    if (u.behavior !== 'chase' && u.touchDmg <= 0) return;
    if (u.kind === 'deadline') { this.explode(u); return; }
    if (u.kind === 'partner') {
      if (!u.attached && k.noStick <= 0) {
        u.attached = true;
        u.yaw = Math.atan2(u.x - k.x, u.z - k.z);
        this.fx.popup(k.x, 2.2, k.z, t('pop.group'), 'grade-3');
      }
      return;
    }
    if (u.cd > 0 || u.touchDmg <= 0) return;
    const personal = u === this.possess.unit;
    const mult = this.registerHit();
    this.rules.hurt(u.touchDmg * mult * (personal ? CONTACT_BONUS : 1), CARDS[(u.card ?? 'popQuiz') as CardId]?.name ?? '');
    if (personal) this.stage.shake(0.25);
    u.cd = personal ? 0.6 : 1;
    const dx = u.x - k.x, dz = u.z - k.z, d = Math.hypot(dx, dz) || 1;
    if (u.kind === 'medBall') {
      const kb = C.medBall.knockback * (u.level >= 2 ? 2 : 1) * (k.has('gymMembership') ? 0.5 : 1);
      k.standUp();
      k.x -= (dx / d) * kb; k.z -= (dz / d) * kb;
      this.grid.resolve(k, k.r);
      if (u.projectile || u.bounces <= 0) { this.killUnit(u, false); return; }
      u.bounces--;
      u.vx = (dx / d) * 4; u.vz = (dz / d) * 4;
      return;
    }
    if (u.kind === 'volley' || u.projectile) { this.killUnit(u, false); return; }
    // bounce off and come back
    u.vx = (dx / d) * 5; u.vz = (dz / d) * 5;
  }

  // ---------------------------------------------------------------- tick

  private computeFlow() {
    this.grid.computeFlow(this.kirill.x, this.kirill.z, 0.6);
  }

  update(dt: number) {
    this.clock += dt;
    if (this.cut) { this.cut.update(dt); return; }
    if (this.duel) { this.duel.update(dt); return; }
    if (this.race) { music.set(0.85); this.race.update(dt); if (this.raceOut !== undefined) this.raceDone(); return; }
    this.fx.update(dt);
    // an intro card pauses the week for a few seconds (or until clicked)
    if (this.introT > 0) {
      this.introT -= dt;
      if (this.introRig) { this.introRig.rig.pose = this.introRig.pose; this.introRig.rig.update(dt, 0); }
      if (this.introT <= 0) { this.hud.closeIntro(); this.introRig = null; }
      return;
    }
    if (this.paused) return;
    if (this.ended) {
      this.endT -= dt;
      this.kirill.rig.update(dt, 0);
      for (const g of this.guests) if (g.alive) g.rig.update(dt, 0);
      if (this.endT <= 0 && !this.doneCalled) { this.doneCalled = true; this.onDone(this.result!); }
      return;
    }
    this.hitStopCd -= dt;
    if (this.hitStop > 0) { this.hitStop -= dt; return; }
    if (this.soul) { this.soul.update(dt); if (this.soul.slow > 0) dt *= 0.3; }

    this.time += dt;
    this.map.life.update(dt);
    // the soundtrack follows the tension; Kirill's All-Nighter strips it down to the bass
    if (!this.musicOn) { this.musicOn = true; music.start(0.2, this.soul ? 'soul' : 'week'); }
    music.set(0.12 + 0.8 * Math.max(this.rules.progress(), this.time / this.duration * 0.7), this.kirill.buff > 0);
    this.director.update(dt);
    this.chaos = Math.min(balance.chaos.max, this.chaos + balance.chaos.regenPerSec * dt * this.director.chaosMul);
    this.cds.q = Math.max(0, this.cds.q - dt);
    this.cds.w = Math.max(0, this.cds.w - dt);
    this.cds.e = Math.max(0, this.cds.e - dt);

    this.flowT -= dt;
    if (this.flowT <= 0) { this.flowT = 0.2; this.computeFlow(); }

    // multipliers and pulls are rebuilt every tick; guests add to them before Kirill moves
    const k = this.kirill;
    const pashaOn = this.pashaOn;
    k.fireMul = pashaOn ? (k.has('earplugs') ? 0.85 : C.pasha.fireRateMul) : 1;
    k.regenMul = pashaOn ? C.pasha.regenMul : 1;
    let slow = 1;
    for (const u of this.horde.units) if (u.alive && u.attached && u.kind === 'partner') slow *= 1 - (u.level >= 2 ? 0.6 : C.partner.slow);
    k.slowMul = Math.max(0.2, slow) * this.director.kirillSpeed;
    k.fireMul *= this.director.kirillFire;
    // in the story you fight from inside one body: his beam is slower, or he'd mow the horde down
    if (this.soul) k.fireMul *= 0.6 * boon.kirillFire(this.sem.boons);
    k.pullX = k.pullZ = 0;
    for (const g of this.guests) if (g.alive) g.update(dt);
    this.guests = this.guests.filter((g) => g.alive);
    this.tickAllNighter(dt);
    k.update(dt);
    this.comboT -= dt;
    if (this.combo > 0 && this.comboT <= 0) { this.combo = 0; this.hud.combo(0); }

    this.horde.rebuildHash();
    this.updateUnits(dt);
    if (this.possess.active && !this.possess.valid() && !this.soul) {
      const u = this.possess.unit!;
      this.possess.exit(t(u.attached ? 'toast.latched' : 'toast.gone'));
    }

    const got = this.pickups.update(dt, k.x, k.z, k.stats.pickup);
    if (got) { k.addXp(got); sfx.ding(); }

    this.nina?.update(dt);
    this.spawnAllies();
    if (this.artem?.alive) this.artem.update(dt);
    this.rules.update(dt);

    for (let i = this.zones.length - 1; i >= 0; i--) {
      const zn = this.zones[i];
      zn.t -= dt;
      if (zn.t <= 0) { this.fx.group.remove(zn.mesh); this.zones.splice(i, 1); }
    }

    if (this.tutorialStep >= 0) {
      this.tutorialT += dt;
      if (this.tutorialStep === 2 && this.tutorialT > 7) {
        this.tutorialStep = -1;
        try { localStorage.setItem('burnout.tutorial', 'done'); } catch { /* storage blocked */ }
      }
    }

    // boss weeks end in a duel that decides the debt (GDD extension: Shadow Fight-style bosses)
    const R = this.rules;
    if (this.story) this.storyBeats();
    if (R.passedEarly()) this.end(false);
    else if (R.instantDebt()) { if (R.duelFoe && R.duelOnInstant) this.beginDuel(); else this.end(true); }
    else if (this.time >= this.duration) { if (R.duelFoe && R.duelAtBell) this.beginDuel(); else this.end(R.debtAtBell()); }
    if (!this.duel) this.hud.update();
  }

  // story: three waves, and one second wind for Kirill if he breaks early
  private storyBeats() {
    const k = this.kirill;
    const n = Math.min(3, 1 + Math.floor((this.time / this.duration) * 3));
    if (n > this.wave) {
      this.wave = n;
      this.hud.announce(t('wave.title', { n }), t('wave.sub' + n));
      this.feed(t('wave.title', { n }), 'yours');
      this.chaosBonus(10 + n * 4);
      this.stage.punch(0.06);
      juice.sting(3);
      sfx.alarm();
    }
    if (!this.secondWind && this.rules.meterMode === 'fail' && this.rules.instantDebt() && this.time < this.duration * 0.9) {
      this.secondWind = true;
      this.rules.restore(0.5);
      k.standUp();
      for (const u of this.horde.units) if (u.alive && !u.stationary && Math.hypot(u.x - k.x, u.z - k.z) < 6) this.killUnit(u, false);
      this.fx.ring(k.x, k.z, 0.5, 7, 0.6, 0x23c4b8, 0.95);
      this.fx.burst(k.x, k.z, 0x23c4b8, 24, 0.8, 6);
      this.stage.shake(0.6);
      this.stage.punch(0.08);
      k.buff = 8;
      this.hud.announce(t('sw.title'), t('sw.sub'));
      this.feed(t('sw.title'), 'kirill');
      k.say([t('sw.shout')], true);
      sfx.boom(); juice.sting(4);
    }
  }

  /** Kirill's comeback at ~70%: a 1.3 s wind-up you can interrupt with a stun, then a blast and a buff. */
  private tickAllNighter(dt: number) {
    const k = this.kirill, AN = balance.allNighter;
    if (!this.allNighterUsed && this.rules.allNighterReady()) {
      this.allNighterUsed = true;
      this.allNighterCharge = AN.charge;
      k.standUp();
      this.hud.announce(t('an.title'), t('an.sub'));
      this.feed(t('an.title'), 'kirill');
      k.say([t('an.shout')], true);
      sfx.alarm();
    }
    if (this.allNighterCharge <= 0) { k.charge = 0; return; }
    if (k.stun > 0 || k.drag > 0 || k.dance > 0) {
      // you interrupted it: reward that
      this.allNighterCharge = 0;
      k.charge = 0;
      this.fx.popup(k.x, 2.7, k.z, t('an.interrupted'), 'skill');
      this.feed(t('an.interruptedFeed'), 'yours');
      this.chaosBonus(8);
      sfx.levelUp();
      return;
    }
    const before = this.allNighterCharge;
    this.allNighterCharge -= dt;
    k.charge = this.allNighterCharge;
    if (Math.floor(before * 4) !== Math.floor(this.allNighterCharge * 4)) this.fx.ring(k.x, k.z, AN.radius, 0.6, 0.25, 0x23c4b8, 0.6);
    if (this.allNighterCharge > 0) return;
    // burst: clears your units around him, heals, and he's fired up for a few seconds
    k.charge = 0;
    for (const u of this.horde.units) if (u.alive && !u.stationary && u.behavior === 'chase' && Math.hypot(u.x - k.x, u.z - k.z) < AN.radius) this.killUnit(u, false);
    this.fx.ring(k.x, k.z, 0.5, AN.radius + 1, 0.5, 0x23c4b8, 0.95);
    this.stage.shake(0.5);
    sfx.boom();
    this.rules.heal(AN.heal);
    k.buff = AN.buffSec;
    this.feed(t('an.burst'), 'kirill');
  }

  private raceOut: ArcadeResult | null | undefined = undefined;

  private raceDone() {
    const r = this.raceOut;
    this.raceOut = undefined;
    this.race?.dispose();
    this.race = null;
    this.duelDone = true;
    this.hud.root.style.display = '';
    this.end(!!r?.win);
  }

  /** the quick cut before the week's climax (it runs instead of the week until it's done) */
  cut: Cutscene | null = null;
  private cutDone = false;

  private beginDuel() {
    if (this.duel || this.race || this.duelDone || this.cut) return;
    this.possess.exit();
    this.hud.root.style.display = 'none';
    this.fx.clear();
    if (!this.cutDone) {
      // a quick cut first: Kirill and who he's up against, in this place
      this.cutDone = true;
      const c = this.rules.climax;
      const who = c === 'race' ? ['nina'] : c === 'duel' ? [this.rules.duelFoe ?? 'nina'] : ['masha', 'sonya'];
      const lines = who.map((x) => [x, 'taunt.' + x] as [string, string]);
      const title = c === 'race' ? t('tr.race') : c === 'duel' ? t('tr.duel', { name: t('boss.name.' + who[0]) }) : t('tr.show');
      const chapter: Chapter = { id: 'climax', week: this.def.id, map: c === 'duel' ? this.def.location : c === 'race' ? 'gym' : 'assembly', cast: who, lines, reply: 'reply.' + who[0], after: null };
      music.start(0.5, 'lament');
      this.cut = new Cutscene(this.stage, chapter, this.sem.slot + 1, this.sem.look, () => { this.cut = null; this.beginDuel(); }, { kicker: t('tr.kicker'), title, place: this.def.title, quick: true });
      return;
    }
    if (this.rules.climax !== 'duel') {
      // the PE week ends on the track (the norm race); the assembly week on stage (the presentation)
      const ctx = {
        stage: this.stage,
        story: { look: this.sem.look, level: this.kirill.state.level, hp: this.rules.duelHp() },
        onExit: (r: ArcadeResult | null) => { this.raceOut = r; },
      };
      this.race = this.rules.climax === 'race' ? new PERace(ctx) : new ThePresentation(ctx);
      return;
    }
    this.duel = new Duel(this.stage, {
      foe: this.rules.duelFoe!,
      kirillLook: this.sem.look,
      kirillHp: this.rules.duelHp(),
      kirillPower: 1 + 0.05 * (this.kirill.state.level - 1),
      onDone: (win) => {
        this.duel?.dispose();
        this.duel = null;
        this.duelDone = true;
        this.hud.root.style.display = '';
        this.end(win);
      },
    });
  }

  // ---------------------------------------------------------------- intro cards

  private introT = 0;

  /** First time a character shows up (ever, in this browser): their sheet portrait and a line. */
  /** the guest being introduced: posed in a close shot while the card is up */
  private introRig: { rig: Rig; pose: Pose } | null = null;

  introduce(name: string, who?: { rig: Rig; x: number; z: number }) {
    let seen: string[] = [];
    try { seen = JSON.parse(localStorage.getItem('burnout.seen') ?? '[]'); } catch { /* blocked storage */ }
    if (seen.includes(name)) return;
    seen.push(name);
    try { localStorage.setItem('burnout.seen', JSON.stringify(seen)); } catch { /* blocked storage */ }
    this.introT = 3.2;
    this.hud.introCard(name, () => { this.introT = 0; this.hud.closeIntro(); this.stage.showcase(0, 0, 0); });
    if (who) {
      // their signature move, up close
      const SIG: Record<string, Pose> = { nina: 'throw', romchik: 'dance', masha: 'talk', sonya: 'cheer', pasha: 'talk', artem: 'talk', grisha: 'stun', shady: 'throw' };
      this.introRig = { rig: who.rig, pose: SIG[name] ?? 'cheer' };
      who.rig.faceTowards(Math.atan2(2.6, 3.6), 1, 100);
      this.stage.showcase(who.x, who.z, 3.2);
      voice.play(name + '_line');
    }
  }

  private spawnAllies() {
    const ex = () => this.rng.pick(this.map.layout.exits);
    // Masha at level 3 keeps Artem away while she's on the map
    const mashaBlocks = this.guests.some((g) => g instanceof Masha && g.level >= 3);
    if (!this.artem && this.time >= this.artemAt && !mashaBlocks) {
      const e = ex();
      this.artem = new Artem(this, e.x, e.z);
      this.artemAt = Infinity;
    }
    if (this.time >= this.grishaAt) {
      const e = ex();
      this.guests.push(new Grisha(this, e.x, e.z));
      this.grishaAt = Infinity;
    }
    if (this.time >= this.shadyAt) {
      const e = ex();
      this.guests.push(new Shady(this, e.x, e.z));
      this.shadyAt = Infinity;
    }
  }

  private updateUnits(dt: number) {
    const k = this.kirill;
    const dir = { x: 0, z: 0 };
    for (const u of this.horde.units) {
      if (!u.alive) continue;
      u.age += dt; u.cd -= dt; u.hitCd -= dt; u.flash -= dt;
      if (u.life && u.age > u.life) { this.fx.burst(u.x, u.z, 0xcccccc, 4); this.removeUnit(u); this.rules.onKill(u); continue; }

      if (u.attached) {
        u.yaw += dt * 0.6;
        u.x = k.x + Math.sin(u.yaw) * 0.6;
        u.z = k.z + Math.cos(u.yaw) * 0.6;
        u.vx = u.vz = 0;
        const rate = u.kind === 'envelope' ? WU.envelope.drainPerSec : C.partner.drainPerSec;
        this.rules.drain(rate * dt);
        continue;
      }

      const custom = this.rules.unitTick(u, dt);
      if (custom === 'skip' || !u.alive) continue;

      if (custom !== 'move') {
        if (u.stationary) {
          // most stationary units watch Kirill; parked cars, queues and cups keep their placement
          if (!['secretary', 'car', 'queue', 'teacup'].includes(u.kind)) u.yaw = Math.atan2(k.x - u.x, k.z - u.z);
          if (u.kind === 'guard') {
            const d = Math.hypot(k.x - u.x, k.z - u.z);
            if (d < C.guard.radius + k.r && u.cd <= 0 && !k.busy) {
              u.cd = C.guard.cooldownSec;
              k.standUp();
              k.stun = C.guard.stopSec * (u.level >= 2 ? 1.5 : 1) * (k.has('lanyard') ? 0.5 : 1);
              this.rules.hurt(C.guard.dmg * this.registerHit(), CARDS.guard.name);
              this.fx.say('guard' + u.index, () => new THREE.Vector3(u.x, 0, u.z), pickLine(LINES.guard), 1.8, 2.0);
            }
          }
          continue;
        }

        if (u === this.possess.unit) {
          this.possess.move(u, dt);
        } else if (u.kind === 'volley' || u.projectile) {
          const px = u.x, pz = u.z;
          u.x += u.vx * dt; u.z += u.vz * dt;
          const hit = this.grid.resolve(u, u.r, true);
          if (hit) {
            if (u.projectile) { this.fx.burst(u.x, u.z, 0x7a4a2a, 4); this.removeUnit(u); continue; }
            if (Math.abs(u.x - (px + u.vx * dt)) > 1e-4) u.vx = -u.vx;
            if (Math.abs(u.z - (pz + u.vz * dt)) > 1e-4) u.vz = -u.vz;
            if (--u.bounces < 0) { this.fx.burst(u.x, u.z, 0xf2d64a, 4); this.removeUnit(u); continue; }
          }
        } else if (u.behavior === 'flee') {
          // Week 6 tasks: run from Kirill when he's close, drift otherwise
          const d = Math.hypot(k.x - u.x, k.z - u.z);
          let tx = 0, tz = 0;
          if (d < balance.weekRules.attestation.fleeWithin) {
            if (this.grid.flowN.away(u.x, u.z, dir)) { tx = dir.x; tz = dir.z; }
            else { tx = (u.x - k.x) / (d || 1); tz = (u.z - k.z) / (d || 1); }
          } else {
            u.t2 -= dt;
            if (u.t2 <= 0) { u.t2 = 1 + Math.random() * 2; const a = Math.random() * Math.PI * 2; u.tx = Math.cos(a); u.tz = Math.sin(a); }
            tx = u.tx * 0.35; tz = u.tz * 0.35;
          }
          this.steerUnit(u, tx, tz, dt, 5);
        } else if (u.behavior === 'wander') {
          u.t2 -= dt;
          if (u.t2 <= 0) {
            u.t2 = 1.5 + Math.random() * 2;
            // tests drift around, slowly toward the middle of the room
            const a = Math.random() * Math.PI * 2;
            u.tx = Math.cos(a) - u.x * 0.03; u.tz = Math.sin(a) - u.z * 0.03;
          }
          this.steerUnit(u, u.tx, u.tz, dt, 3);
        } else {
          const d = Math.hypot(k.x - u.x, k.z - u.z);
          let tx = (k.x - u.x) / (d || 1), tz = (k.z - u.z) / (d || 1);
          // straight at Kirill only when he's close by path, not just as the crow flies (desks!)
          const fd = this.grid.flowDist(u.x, u.z, u.ghost);
          const near = d < 1.6 && fd >= 0 && fd <= 3;
          if (!near && this.grid.flowDir(u.x, u.z, u.ghost, dir)) { tx = dir.x; tz = dir.z; }
          this.steerUnit(u, tx, tz, dt, u.kind === 'deadline' ? 6 : 4);
        }
      }

      const reach = u.r + k.r + (k.sitting ? 0.75 : 0);
      if (Math.hypot(k.x - u.x, k.z - u.z) < reach) this.contact(u);
    }
  }

  private steerUnit(u: Unit, tx: number, tz: number, dt: number, rate: number) {
    const l = Math.hypot(tx, tz);
    const s = l > 1 ? 1 / l : 1;
    const accel = Math.min(1, dt * rate);
    const hs = this.director.hordeSpeed;
    u.vx += (tx * s * u.speed * hs - u.vx) * accel;
    u.vz += (tz * s * u.speed * hs - u.vz) * accel;
    u.x += u.vx * dt; u.z += u.vz * dt;
    this.horde.separate(u, dt);
    this.grid.resolve(u, u.r, u.ghost);
  }

  private end(debt: boolean) {
    this.possess.exit();
    this.ended = true;
    this.endT = 2.3;
    this.cursorDisc.visible = false;
    this.result = { debt, progress: debt ? 1 : Math.min(1, this.rules.meterMode === 'fail' ? this.progress : 0.5), chaosLeft: this.chaos, usage: this.usage, cause: this.lastCause, maxCombo: this.maxCombo };
    const k = this.kirill;
    k.sitting = false;
    music.stop();
    this.director.dispose();
    if (debt) {
      voice.play('kirill_debt');
      // the finisher: close in on Kirill and slam the НЕЗАЧЁТ stamp down
      sfx.debt();
      k.rig.pose = 'stun';
      k.say(LINES.kirillDebt, true);
      this.stage.closeUp(k.x, 1.1, k.z, 7.5);
      this.stage.shake(0.45);
      this.endT = 3.0;
      stamp('debt', esc(this.def.title));
    } else {
      sfx.pass();
      k.rig.pose = 'cheer';
      k.say(LINES.kirillPass, true);
      voice.play('kirill_pass');
      stamp('pass');
    }
  }

  /** Per-frame visuals (between fixed ticks). */
  render() {
    if (this.cut) { this.cut.render(); return; }
    if (this.duel) return;
    if (this.race) { this.race.render(); return; }
    if (this.possess.active) {
      this.possess.updateCamera(1 / 60);
      this.soul?.camera();
      this.hud.updateFirstPerson(this.possess);
    }
    this.horde.render(this.clock);
    this.pickups.render(this.clock);
    this.rules.render(this.clock);
    const k = this.kirill;
    this.safeRing.position.set(k.x, 0.03, k.z);
    if (this.cursor && !this.ended) {
      this.cursorDisc.visible = true;
      this.cursorDisc.position.set(this.cursor.x, 0.05, this.cursor.z);
      const col = this.cursor.ok ? 0x5fe07a : 0xe8573a;
      for (const c of this.cursorDisc.children) ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(col);
    } else this.cursorDisc.visible = false;
  }

  dispose() {
    music.stop();
    this.soul?.dispose();
    this.director.dispose();
    this.cut?.dispose();
    this.cut = null;
    this.duel?.dispose();
    this.duel = null;
    this.race?.dispose();
    this.race = null;
    this.possess.exit();
    this.stage.scene.background = new THREE.Color(0x1d1a22);
    for (const [target, type, fn] of this.listeners) target.removeEventListener(type, fn);
    this.rules.dispose();
    this.hud.dispose();
    this.fx.clear();
    this.kirill.dispose();
    this.horde.dispose();
    this.pickups.dispose();
    this.stage.clearWorld();
  }
}
