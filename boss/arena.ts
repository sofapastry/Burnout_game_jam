import * as THREE from 'three';
import { makeCharacter, type Rig } from '../assets';
import { Person, type Pose } from '../hero/person';
import { randomKirillLook, type KirillLook } from '../hero/look';
import { buildEldenArena, PALETTES, type EldenArena } from './elden';
import { buildMap } from '../maps/builder';
import { LAYOUTS } from '../maps/layouts';
import { buildUnitModel } from '../horde/unitModels';
import type { UnitKind } from '../horde/units';
import { CARDS, type CardId } from '../data/cards';
import { Fx } from '../render/fx';
import { outlineMaterial } from '../render/toon';
import { Rng } from '../core/rng';
import { sfx, juice, music } from '../core/audio';
import { voice } from '../core/voice';
import { announce } from '../ui/juice';
import { fate } from '../story/fate';
import { KirillMarker } from '../render/marker';
import { icon, iconHtml } from '../ui/icons';

const hexCol = (c: number) => '#' + c.toString(16).padStart(6, '0');
import { t } from '../i18n';
import { Input, hudLayer, clamp, fitAspect, type ArcadeCtx, type ArcadeMode } from '../arcade/common';
import { Spells, SPELLS, ULT, SPELL_R, SPELL_COLOR, SPELL_ICON, SPELL_CD, ULT_PER_HIT, ULT_PER_SEC, runeDecal, type SpellId } from './spells';
import { BOSSES, MOVE_CD, MOVE_ICON, SUMMON, DEFAULT_SUMMONS, type BossId, type MoveId, type SummonKind } from './bosses';

// Boss fight: you play the boss in third person, Kirill is a souls-like AI (rolls, heals, beam).
// 1/2 moves, 3/4 aimed spells, R ultimate, F lock-on. Your deck summons waves on its own.

export interface BossSetup {
  boss: BossId;
  weekId: number;
  look?: KirillLook;
  /** Kirill's level (the semester's), how worn down he is coming in */
  level?: number;
  mood?: 'tired' | 'fired' | null;
  weekNum?: number;
  /** your loadout: cards and their levels */
  summons?: { card: CardId; level: number }[];
  /** your horde upgrades' boss bonus: damage and health */
  might?: number;
  /** how many lives Kirill has ("He Returns"): 1 by default — beat him once and the story goes on */
  tries?: number;
  /** fight in this real location (a layout id) instead of the Tree arena */
  map?: string;
  /** a second boss fighting beside you, run by the AI (Grisha with Pasha, Masha with Sonya) */
  partner?: BossId;
  /** Artem shows up to help Kirill when he's in trouble */
  artem?: boolean;
}

interface Partner { id: BossId; body: Body; cds: Record<string, number>; atk: number; t: number; swinging: boolean; struck: boolean; lineT: number; down: boolean; spellT: number }

type BState = 'idle' | 'light' | 'heavy' | 'roll' | 'special' | 'hit' | 'dead';
type KState = 'idle' | 'slash' | 'beam' | 'roll' | 'drink' | 'hit' | 'stun' | 'dead';

interface Body { x: number; z: number; vx: number; vz: number; yaw: number; hp: number; maxHp: number; stam: number; t: number; iframes: number; holder: THREE.Group; rig: Rig }
interface Minion { kind: string; obj: THREE.Object3D; x: number; z: number; vx: number; vz: number; hp: number; speed: number; dmg: number; t: number; life: number; level: number; alive: boolean; cd: number; rig?: Rig }

/** you're a colossus: everything about the boss is scaled to this */
const BOSS_SCALE = 2.3;
/** indoors, in a real location, the boss is big but fits */
const MAP_SCALE = 1.55;
const LIGHT = [{ w: 0.12, a: 0.1, r: 0.24, dmg: 8, pose: 'punch' as Pose }, { w: 0.1, a: 0.1, r: 0.24, dmg: 9, pose: 'hook' as Pose }, { w: 0.16, a: 0.12, r: 0.42, dmg: 14, pose: 'spin' as Pose }];
const HEAVY = { w: 0.55, a: 0.15, r: 0.45, dmg: 24 };
const BOSS_REACH = 3.7;
const ROLL = { dur: 0.42, speed: 9.5, iframes: 0.32, stam: 22 };
const K_REACH = 1.9;
/** the boss's body radius (Kirill hits it from further away, bodies keep this apart) */
const BOSS_R = 1.1;
const FIGHT_SEC = 150;
/** the bell gives each extra attempt this much more time */
const TRY_SEC = 60;
/** everything the boss side deals is scaled by this (tuned so a fight lasts about a minute) */
const BOSS_DMG = 0.85;

export class BossArena implements ArcadeMode {
  private input: Input;
  private rng = new Rng(Math.floor(Math.random() * 1e9));
  private stage: ArcadeCtx['stage'];
  private root = new THREE.Group();
  private fx: Fx;
  private grid: import('../maps/grid').Grid;
  private arena: EldenArena;
  private cam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 420);
  private camPos = new THREE.Vector3();
  private camYaw = 0;
  private lock = true;
  private hud: HTMLElement;
  private boss: Body;
  private kirill: Body;
  private def;
  private bossId: BossId;
  // boss state
  private bs: BState = 'idle';
  private combo = 0;
  private comboT = 0;
  private struck = false;
  private stamIdle = 0;
  private cds: Record<string, number> = {};
  private shield = 0;
  /** the horde comes on its own: seconds to the next wave, and whose turn it is */
  private waveT = 4;
  private waveI = 0;
  private summons: { card: CardId; level: number }[];
  private hits = 0;
  private hitChain = 0;
  private hitChainT = 0;
  // Kirill
  private ks: KState = 'idle';
  private kAtk = 0;
  private kStruck = false;
  private kThink = 0;
  private kCombo = 0;
  private kBeamCd = 6;
  private kRollCd = 0;
  private estus: number;
  private kSlow = 0;
  private kBlind = 0;
  private kDrowsy = 0;
  private kPower: number;
  private kSpeed: number;
  private kRollSkill: number;
  private beamLine: THREE.Mesh | null = null;
  private strafe = 1;
  private minions: Minion[] = [];
  private auras: { x: number; z: number; t: number; mesh: THREE.Object3D }[] = [];
  private time = -3.6;
  /** phase 2 (from half health): you rise, the arena flares, everything hits harder */
  private phase2 = false;
  private flare = 0;
  private rage = 1;
  private trails: { mesh: THREE.Mesh; t: number; dur: number }[] = [];
  private stepT = 0;
  private freeze = 0;
  private slowmo = 0;
  private shake = 0;
  private finished = false;
  private outro = 0;
  private won = false;
  /** tests: the boss plays itself */
  autopilot = false;
  /** how far the boss reaches, and how wide its body is (scaled with the boss) */
  private reach = BOSS_REACH;
  private bodyR = BOSS_R;
  private partner: Partner | null = null;
  private artem: { rig: Rig; x: number; z: number; t: number; done: boolean; helped: boolean } | null = null;
  private artemUsed = false;
  /** your spells: 3/4 to aim (a rune circle on the floor), J/click to cast, K to cancel */
  private spells!: Spells;
  private spellIds: [SpellId, SpellId];
  private ultId: SpellId;
  /** the ultimate's bar (0..100) and its cinematic */
  private ult = 0;
  private ultCine = 0;
  private aimSpell: SpellId | null = null;
  private aiming = false;
  private aimT = 0;
  private aim = { x: 0, z: 0 };
  private reticle: THREE.Mesh;
  /** the cast's cinematic: seconds left, and where to look */
  private castCine = 0;
  private castAt = { x: 0, z: 0 };
  private ray = new THREE.Raycaster();
  private lookPos = new THREE.Vector3();
  private kMark = new KirillMarker(2.2, 0.9);
  private life: { update(dt: number): void } | null = null;
  // optional extra lives for Kirill: he talks, you answer, he gets up resistant to what killed him
  private tries: number;
  private attempt = 1;
  private learned = new Set<string>();
  private dmgBy: Record<string, number> = {};
  /** what is hurting him right now (set by each attack before it lands) */
  private src = 'light';
  private kStart = { x: 0, z: 0 };
  private kBaseHp = 0;
  private mh: { t: number; phase: 'fall' | 'talk' | 'reply'; el: HTMLElement; choice: 'cruel' | 'kind' | null } | null = null;

  constructor(private ctx: ArcadeCtx, private setup: BossSetup) {
    const st = this.stage = ctx.stage;
    this.input = new Input(st.renderer.domElement);
    this.input.autoLock = true;
    this.bossId = setup.boss;
    this.def = BOSSES[setup.boss];
    st.clearWorld();
    st.world.add(this.root);
    let kStart = { x: 0, z: 9 }, bStart = { x: 0, z: -4 };
    let scale = BOSS_SCALE;
    if (setup.map && LAYOUTS[setup.map]) {
      // a real location: the week's map, its own light
      const layout = LAYOUTS[setup.map];
      const map = buildMap(layout, new Rng(setup.weekId * 7 + 1));
      this.life = map.life;
      this.root.add(map.group);
      st.setLighting(layout.mood);
      st.scene.background = new THREE.Color(layout.outdoor ? 0x9cc7ea : 0x1d1a22);
      st.post.setLook(0.4, 0.9);
      this.grid = map.grid;
      this.arena = { grid: map.grid, update() {} };
      scale = MAP_SCALE;
      kStart = layout.start;
      // the boss waits as far from Kirill as the room allows (but not in a corner)
      let best = -1;
      for (let i = 0; i < 60; i++) {
        const p = this.grid.randomFree(() => this.rng.next());
        if (!p) continue;
        const d = Math.hypot(p.x - kStart.x, p.z - kStart.z);
        const score = d > 10 ? 20 - d : d;
        if (score > best && !this.grid.blocked(p.x + 1.2, p.z) && !this.grid.blocked(p.x - 1.2, p.z) && !this.grid.blocked(p.x, p.z + 1.2) && !this.grid.blocked(p.x, p.z - 1.2)) { best = score; bStart = p; }
      }
    } else {
      // the final arena under the Tree of Knowledge; the stage's own sun stays out of it
      st.sun.intensity = 0; st.hemi.intensity = 0;
      this.arena = buildEldenArena(this.root, st.scene, setup.boss, setup.weekId * 7 + 1);
      st.scene.background = new THREE.Color(PALETTES[setup.boss]?.fog ?? 0x100a14);
      st.post.setLook(0.6, 0.84);
      this.grid = this.arena.grid;
    }
    this.reach = BOSS_REACH * (scale / BOSS_SCALE);
    this.bodyR = BOSS_R * (scale / BOSS_SCALE);
    this.camDist = 9.5 * (scale / BOSS_SCALE) + 1.2;
    this.fx = new Fx(st);
    this.root.add(this.fx.group);
    this.spellIds = SPELLS[setup.boss];
    this.ultId = ULT[setup.boss];
    this.reticle = runeDecal(1, 0xffffff);
    this.reticle.visible = false;
    this.root.add(this.reticle);
    this.spells = new Spells({
      root: this.root, fx: this.fx, rng: this.rng, power: this.def.power,
      kirill: () => this.kirill,
      hurt: (dmg, effect, nx, nz, poise, src) => this.hurtKirill(dmg * this.rage, effect, nx, nz, poise, src),
      status: (kind, sec) => {
        if (kind === 'slow') this.kSlow = Math.max(this.kSlow, sec);
        else if (kind === 'drowsy') this.kDrowsy = Math.max(this.kDrowsy, sec);
        else this.kBlind = Math.max(this.kBlind, sec);
      },
      push: (vx, vz, dt) => { const k = this.kirill; const p = { x: k.x + vx * dt, z: k.z + vz * dt }; this.grid.resolve(p, 0.3); k.x = p.x; k.z = p.z; },
      shake: (v) => { this.shake = Math.max(this.shake, v); },
      overlay: (cls, sec) => {
        const ov = this.hud.querySelector('.bs-ov') as HTMLElement;
        ov.className = 'bs-ov ' + cls;
        ov.innerHTML = cls === 'bsod' ? `<div><b>:(</b>${t('bs.bsod')}</div>` : '';
        setTimeout(() => { if (ov.classList.contains(cls)) ov.className = 'bs-ov hidden'; }, sec * 1000);
      },
    });
    st.override = { scene: st.scene, camera: this.cam };

    // Kirill, levelled by the semester
    const level = setup.level ?? 1;
    const weekNum = setup.weekNum ?? 1;
    const moodMul = setup.mood === 'tired' ? 0.82 : setup.mood === 'fired' ? 1.12 : 1;
    const kHp = Math.round(340 * (1 + 0.05 * weekNum) * (1 + 0.05 * (level - 1)) * moodMul * (setup.partner ? 1.3 : 1));
    this.kPower = 1 + 0.06 * (level - 1);
    this.kSpeed = 4.3 * (1 + 0.03 * (level - 1)) * (setup.mood === 'tired' ? 0.9 : setup.mood === 'fired' ? 1.06 : 1);
    this.kRollSkill = Math.min(0.75, 0.35 + 0.05 * level);
    this.estus = 2 + Math.floor(level / 3);
    const kRig = new Person(setup.look ?? randomKirillLook(this.rng));
    // He Returns: he has several lives, each a little shorter than one big one
    this.tries = Math.max(1, setup.tries ?? 1);
    const lifeHp = Math.round(kHp * (this.tries > 1 ? 0.5 : 1));
    this.kBaseHp = lifeHp;
    this.kStart = { x: kStart.x, z: kStart.z };
    this.kirill = this.body(kRig, kStart.x, kStart.z, lifeHp, 1);
    // he's small next to you: always marked in red
    this.root.add(this.kMark.group);
    this.giveSword(kRig);
    // the boss: a colossus (in the Tree arena), merely huge indoors
    const bRig = makeCharacter(setup.boss);
    const bx = bStart.x, bz = bStart.z;
    this.boss = this.body(bRig, bx, bz, Math.round(this.def.hp * (1 + ((setup.might ?? 1) - 1) * 0.66)), scale);
    if (setup.partner) {
      // the partner stands beside you
      const p = { x: bx + 2.2, z: bz };
      this.grid.resolve(p, 0.6);
      const body = this.body(makeCharacter(setup.partner), p.x, p.z, Math.round(BOSSES[setup.partner].hp * 0.6), scale * 0.92);
      this.partner = { id: setup.partner, body, cds: Object.fromEntries(BOSSES[setup.partner].moves.map((m) => [m, 4])), atk: 2, t: 0, swinging: false, struck: false, lineT: 3, down: false, spellT: 12 };
    }
    this.boss.yaw = Math.atan2(this.kirill.x - bx, this.kirill.z - bz);
    this.kirill.yaw = Math.atan2(bx - this.kirill.x, bz - this.kirill.z);
    this.camYaw = this.boss.yaw;
    this.summons = (setup.summons?.length ? setup.summons : DEFAULT_SUMMONS.map((c) => ({ card: c, level: 1 }))).filter((s) => SUMMON[s.card] && s.card !== 'pasha').slice(0, 3);
    for (const m of this.def.moves) this.cds[m] = 2;
    this.cds[this.spellIds[0]] = 5;
    this.cds[this.spellIds[1]] = 10;

    const bossName = t('boss.name.' + setup.boss);
    this.hud = hudLayer(`
      <div class="bs-kirill">
        <div class="bs-kname">${t('hud.kirill')} <small>${t('bs.level', { n: level })}</small></div>
        <div class="bs-bar hp"><i class="ghost"></i><i class="fill"></i></div>
        <div class="bs-bar st"><i class="fill"></i></div>
        <div class="bs-estus"></div>
        <div class="bs-tries"></div>
      </div>
      <div class="bs-timer"></div>
      <div class="bs-lock">🎯 ${t('bs.lock')}</div>
      <div class="bs-center"></div>
      <div class="bs-boss">
        <div class="bs-bname">${bossName}<small>${t('boss.title.' + setup.boss)}</small></div>
        <div class="bs-bar hp big"><i class="ghost"></i><i class="fill"></i></div>
        <div class="bs-bar st small"><i class="fill"></i></div>
        ${setup.partner ? `<div class="bs-partner"><span>${t('boss.name.' + setup.partner)}</span><div class="bs-bar hp"><i class="ghost"></i><i class="fill"></i></div></div>` : ''}
      </div>
      <div class="bs-skills">
        <div class="bs-chaos bs-wave"><span>${t('bs.nextWave')}</span><div class="bar"><div class="fill"></div></div><b></b></div>
        ${this.def.moves.map((m, i) => `<div class="ar-skill bs-mv" data-key="${i + 1}" data-mv="${m}"><b>${i + 1}</b> ${MOVE_ICON[m]} ${t('mv.' + m)} <i class="cd"></i></div>`).join('')}
        ${this.spellIds.map((id, i) => `<div class="ar-skill bs-mv bs-spell" data-key="${i + 3}" data-mv="${id}" style="--sc:${hexCol(SPELL_COLOR[id])}"><b>${i + 3}</b> ${icon(SPELL_ICON[id])} <span class="sp-name">${t('sp.' + id)}</span> <i class="cd"></i></div>`).join('')}
        <div class="ar-skill bs-ult" data-key="r" style="--sc:${hexCol(SPELL_COLOR[this.ultId])}"><b>R</b> ${icon(SPELL_ICON[this.ultId])} <span class="sp-name"><small>${t('bs.ultimate')}</small>${t('sp.' + this.ultId)}</span> <i class="pct"></i><div class="ultbar"><i></i></div></div>
      </div>
      <div class="bs-pad">
        <b class="ar-skill" data-key="j">J ${t('bs.light')}</b><b class="ar-skill" data-key="k">K ${t('bs.heavy')}</b><b class="ar-skill" data-key=" ">␣ ${t('bs.roll')}</b><b class="ar-skill" data-key="f">F ${t('bs.lockKey')}</b>
      </div>
      <div class="bs-aimhint hidden"></div>
      <div class="bs-ov hidden"></div>
      <div class="bs-letterbox"><i></i><i></i></div>
      <div class="ar-keys bs-keys">${t('bs.keys')}</div>
      <div class="souls hidden"><div class="souls-text"></div><div class="souls-sub"></div></div>
      <div class="bs-pause hidden"><div class="panel pz-card"><div class="pz-title">${t('hud.paused')}</div>
        <button class="btn big primary" data-pz="resume">▶ ${t('pz.resume')}</button>
        <div class="pz-keys">${t('bs.keys')}</div>
        <button class="btn small danger" data-pz="quit">✕ ${t('pz.quit')}</button></div></div>`);
    const pause = this.hud.querySelector('.bs-pause') as HTMLElement;
    pause.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('[data-pz]')?.getAttribute('data-pz');
      if (a === 'resume') this.togglePause();
      if (a === 'quit') { this.finished = true; this.ctx.onExit(null); }
    });
    this.input.buttons(this.hud);
    this.intro(bossName);
  }

  private body(rig: Rig, x: number, z: number, hp: number, scale: number): Body {
    const holder = new THREE.Group();
    rig.root.scale.multiplyScalar(scale);
    holder.add(rig.root);
    holder.position.set(x, 0, z);
    this.root.add(holder);
    return { x, z, vx: 0, vz: 0, yaw: 0, hp, maxHp: hp, stam: 100, t: 0, iframes: 0, holder, rig };
  }

  private intro(name: string) {
    const c = this.hud.querySelector('.bs-center') as HTMLElement;
    c.innerHTML = `<div class="bs-title">${name}</div><div class="bs-subtitle">${t('boss.title.' + this.bossId)}</div>`;
    sfx.reveal();
    voice.play(this.bossId + '_line');
    setTimeout(() => { if (c.querySelector('.bs-title')) c.innerHTML = ''; }, 2400);
    // the boss's greeting, and Kirill's answer
    setTimeout(() => this.say(t('taunt.' + this.bossId)), 900);
    setTimeout(() => this.say(t('reply.' + this.bossId), undefined, true), 2600);
  }

  // ---------------------------------------------------------------- tick

  private paused = false;
  private togglePause() {
    this.paused = !this.paused;
    this.hud.querySelector('.bs-pause')?.classList.toggle('hidden', !this.paused);
    if (this.paused && document.pointerLockElement) document.exitPointerLock();
  }

  update(dtReal: number) {
    if (this.finished) return;
    fitAspect(this.cam);
    if (this.input.hit('escape', 'p')) this.togglePause();
    if (this.paused) { this.input.endFrame(); return; }
    if (this.mh) { this.mhTick(dtReal); this.input.endFrame(); return; }
    if (this.freeze > 0) { this.freeze -= dtReal; this.input.endFrame(); return; }
    // the ultimate's cinematic all but stops time; aiming slows it
    const dt = dtReal * (this.ultCine > 1.0 ? 0.08 : this.slowmo > 0 ? 0.3 : this.aiming ? 0.25 : 1);
    this.castCine = Math.max(0, this.castCine - dtReal);
    this.ultCine = Math.max(0, this.ultCine - dtReal);
    this.hud.querySelector('.bs-letterbox')?.classList.toggle('on', this.ultCine > 0.3);
    this.slowmo = Math.max(0, this.slowmo - dtReal);
    this.fx.update(dt);
    if (this.outro > 0) {
      this.outro -= dtReal;
      this.animate(dt);
      if (this.outro <= 0) this.exit();
      this.input.endFrame();
      return;
    }
    this.time += dt;
    music.set(0.75 + 0.25 * (1 - this.kirill.hp / this.kirill.maxHp));
    this.arena.update(dt, this.time, this.flare);
    this.tickTrails(dt);
    this.spells.update(dt);
    if (this.time < 0) { this.animate(dt); this.input.endFrame(); return; }
    this.waveTick(dt);
    for (const k of Object.keys(this.cds)) this.cds[k] = Math.max(0, this.cds[k] - dt);
    this.shield = Math.max(0, this.shield - dt);
    this.hitChainT = Math.max(0, this.hitChainT - dt);
    if (this.hitChainT <= 0) this.hitChain = 0;
    this.controls(dt);
    this.bossTick(dt);
    this.ult = Math.min(100, this.ult + ULT_PER_SEC * dt * (this.phase2 ? 1.5 : 1));
    // half health: the second phase
    if (!this.phase2 && this.boss.hp > 0 && this.boss.hp < this.boss.maxHp / 2) this.enterPhase2();
    this.flare += ((this.phase2 ? 0.45 : 0) - this.flare) * Math.min(1, dt * 0.8);
    this.kirillAI(dt);
    this.kirillTick(dt);
    this.partnerTick(dt);
    this.artemTick(dt);
    this.minionTick(dt);
    this.animate(dt);
    if (this.kirill.hp <= 0) { if (this.attempt < this.tries) this.heroFalls(); else this.finish(true); }
    else if (this.boss.hp <= 0) this.finish(false);
    else if (this.time >= FIGHT_SEC + TRY_SEC * (this.tries - 1)) this.finish(false, true);
    this.input.endFrame();
  }

  // ---------------------------------------------------------------- you, the boss

  private controls(dt: number) {
    const k = this.input, b = this.boss;
    if (k.hit('f', 'tab', 'mouse1')) { this.lock = !this.lock; sfx.click(); }
    if (!this.lock) {
      if (k.locked) this.camYaw -= k.dx * 0.0025;
      this.camYaw += ((k.down('arrowleft') ? 1 : 0) - (k.down('arrowright') ? 1 : 0)) * 2.4 * dt;
    } else {
      this.camYaw = turnTo(this.camYaw, Math.atan2(this.kirill.x - b.x, this.kirill.z - b.z), dt * 6);
    }
    if (this.bs === 'dead' || this.bs === 'hit') { this.endAim(); return; }
    if (this.aiming) { this.aimControls(dt); return; }
    let fwd = (k.down('w', 'arrowup') ? 1 : 0) - (k.down('s', 'arrowdown') ? 1 : 0);
    let side = (k.down('d') ? 1 : 0) - (k.down('a') ? 1 : 0);
    let light = k.hit('j', 'mouse0'), heavy = k.hit('k'), roll = k.hit(' ');
    let mv: number | null = k.hit('q', '1') ? 0 : k.hit('e', '2') ? 1 : null;
    let sprint = k.down('shift');
    if (this.autopilot) ({ fwd, side, light, heavy, roll, mv, sprint } = this.bot());
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    let mx = fx * fwd - fz * side, mz = fz * fwd + fx * side;
    const ml = Math.hypot(mx, mz);
    if (ml) { mx /= ml; mz /= ml; }
    if (this.bs === 'idle') {
      if (roll && b.stam >= ROLL.stam) { this.startRoll(mx, mz); return; }
      if (light && b.stam >= 8) { this.startLight(); return; }
      if (heavy && b.stam >= 20) { this.startHeavy(); return; }
      if (mv !== null) { const id = this.def.moves[mv]; if (this.cds[id] <= 0) { this.special(id); return; } sfx.denied(); }
      const cast = k.hit('3', 'g') ? this.spellIds[0] : k.hit('4') ? this.spellIds[1] : null;
      if (cast) { if (this.cds[cast] <= 0) this.startAim(cast); else sfx.denied(); return; }
      if (k.hit('r')) { if (this.ult >= 100) this.castUlt(); else { sfx.denied(); this.flashText(t('bs.ultNotReady')); } return; }
      if (this.autopilot && this.time > 3) {
        const ready = this.spellIds.find((id) => this.cds[id] <= 0);
        if (this.ult >= 100) { this.castUlt(); return; }
        if (ready) { this.aimSpell = ready; this.castSpell(this.kirill.x, this.kirill.z); return; }
      }
      const run = sprint && ml > 0 && b.stam > 5;
      const sp = this.def.speed * 0.9 * (this.phase2 ? 1.12 : 1) * (run ? 1.5 : 1);
      // the ground shakes under a colossus
      if (ml && (this.stepT -= dt) <= 0) { this.stepT = run ? 0.32 : 0.45; juice.thump(); this.shake = Math.max(this.shake, run ? 0.08 : 0.05); }
      if (run) { b.stam -= 18 * dt; this.stamIdle = 0; }
      b.vx += (mx * sp - b.vx) * Math.min(1, dt * 10);
      b.vz += (mz * sp - b.vz) * Math.min(1, dt * 10);
      if (ml) b.yaw = turnTo(b.yaw, this.lock ? Math.atan2(this.kirill.x - b.x, this.kirill.z - b.z) : Math.atan2(mx, mz), dt * 12);
      else if (this.lock) b.yaw = turnTo(b.yaw, Math.atan2(this.kirill.x - b.x, this.kirill.z - b.z), dt * 8);
    } else if (this.bs === 'light' && light && b.t > LIGHT[this.combo].w && b.stam >= 8) {
      // chain the next hit of the combo
      this.queued = true;
    }
  }
  private queued = false;
  private camDist = 9.5;

  // ---------------------------------------------------------------- your spell

  private startAim(id: SpellId) {
    const k = this.kirill;
    this.aimSpell = id;
    // the reticle is the spell's own rune circle, at its size
    this.root.remove(this.reticle);
    this.reticle.geometry.dispose();
    (this.reticle.material as THREE.Material).dispose();
    this.reticle = runeDecal(SPELL_R[id], SPELL_COLOR[id]);
    this.root.add(this.reticle);
    const hint = this.hud.querySelector('.bs-aimhint') as HTMLElement;
    hint.innerHTML = t('bs.aimHint', { spell: t('sp.' + id) });
    this.aiming = true;
    this.aimT = 0;
    // it starts on Kirill: a nudge and a click
    this.aim.x = k.x; this.aim.z = k.z;
    this.reticle.visible = true;
    this.boss.vx = this.boss.vz = 0;
    this.hud.querySelector('.bs-aimhint')?.classList.remove('hidden');
    sfx.reveal();
  }

  private endAim() {
    if (!this.aiming) return;
    this.aiming = false;
    this.reticle.visible = false;
    this.hud.querySelector('.bs-aimhint')?.classList.add('hidden');
  }

  private aimControls(dt: number) {
    const k = this.input, b = this.boss;
    const real = dt / 0.25;
    this.aimT += real;
    // WASD moves the circle (relative to the camera); the mouse points at the floor
    const fwd = (k.down('w', 'arrowup') ? 1 : 0) - (k.down('s', 'arrowdown') ? 1 : 0);
    const side = (k.down('d') ? 1 : 0) - (k.down('a') ? 1 : 0);
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    this.aim.x += (fx * fwd - fz * side) * 11 * real;
    this.aim.z += (fz * fwd + fx * side) * 11 * real;
    if (k.locked) {
      this.aim.x += (-fz * k.dx - fx * k.dy) * 0.03;
      this.aim.z += (fx * k.dx - fz * k.dy) * 0.03;
    } else if (k.dx || k.dy) {
      const rect = this.stage.renderer.domElement.getBoundingClientRect();
      const nx = ((k.mouse.x - rect.left) / (rect.width || 1)) * 2 - 1, ny = -((k.mouse.y - rect.top) / (rect.height || 1)) * 2 + 1;
      this.ray.setFromCamera(new THREE.Vector2(nx, ny), this.cam);
      const o = this.ray.ray.origin, d = this.ray.ray.direction;
      if (d.y < -0.01) { const s = -o.y / d.y; this.aim.x = o.x + d.x * s; this.aim.z = o.z + d.z * s; }
    }
    // in reach of you
    const dx = this.aim.x - b.x, dz = this.aim.z - b.z, dd = Math.hypot(dx, dz), max = 16;
    if (dd > max) { this.aim.x = b.x + (dx / dd) * max; this.aim.z = b.z + (dz / dd) * max; }
    this.reticle.position.set(this.aim.x, 0.08, this.aim.z);
    this.reticle.rotation.z += real * 1.2;
    const pulse = 1 + Math.sin(this.aimT * 8) * 0.04;
    this.reticle.scale.set(pulse, pulse, pulse);
    b.yaw = turnTo(b.yaw, Math.atan2(dx, dz), real * 8);
    if (k.hit('j', 'mouse0', 'g', 'enter') || this.aimT > 6) { this.castSpell(this.aim.x, this.aim.z); return; }
    if (k.hit('k', ' ')) { this.endAim(); sfx.click(); }
  }

  /** the cast: a short cinematic (slow motion, the camera rises over the spot, the spell's name), then it lands */
  private castSpell(x: number, z: number) {
    const b = this.boss, id = this.aimSpell ?? this.spellIds[0];
    this.endAim();
    this.seesItComing(id);
    this.cds[id] = SPELL_CD * (this.phase2 ? 0.7 : 1);
    this.bs = 'special'; b.t = -0.5;
    b.yaw = Math.atan2(x - b.x, z - b.z);
    this.castCine = 1.3;
    this.castAt = { x, z };
    this.slowmo = 0.7;
    this.spells.cast(id, x, z, b.x, b.z);
    this.fx.ring(b.x, b.z, 0.4, 3, 0.6, SPELL_COLOR[id], 0.8);
    this.pillar(b.x, b.z, 0.9, 0.7);
    this.banner(id, false);
    this.say(t('spl.' + id));
    sfx.boom(); juice.gasp();
  }

  /** the spell's name across the screen */
  private banner(id: SpellId, ult: boolean) {
    const c = this.hud.querySelector('.bs-center') as HTMLElement;
    c.innerHTML = `<div class="bs-spellcast${ult ? ' ult' : ''}" style="--sc:${hexCol(SPELL_COLOR[id])}"><small>${ult ? t('bs.ultimate') + ' · ' : ''}${t('boss.name.' + this.bossId)}</small><b>${t('sp.' + id)}</b></div>`;
    setTimeout(() => { if (c.querySelector('.bs-spellcast')) c.innerHTML = ''; }, ult ? 2600 : 1900);
  }

  // ultimate: near-freeze, letterbox, camera orbit, then it lands on Kirill
  private castUlt() {
    const b = this.boss, k = this.kirill;
    this.endAim();
    this.ult = 0;
    this.bs = 'special'; b.t = -1.4; b.iframes = 2.6;
    b.yaw = Math.atan2(k.x - b.x, k.z - b.z);
    this.ultCine = 2.6;
    this.castAt = { x: k.x, z: k.z };
    this.seesItComing(this.ultId);
    this.spells.cast(this.ultId, k.x, k.z, b.x, b.z);
    this.fx.ring(b.x, b.z, 0.5, 7, 1.2, SPELL_COLOR[this.ultId], 0.9);
    this.pillar(b.x, b.z, 1.6, 1.4);
    this.flare = 1.6;
    this.shake = 0.5;
    this.banner(this.ultId, true);
    this.say(t('spl.' + this.ultId));
    juice.sting(4); sfx.boom(); juice.gasp(); sfx.bell();
    music.set(1);
  }

  private startLight() {
    const b = this.boss;
    this.combo = this.comboT > 0 ? (this.combo + 1) % 3 : 0;
    this.bs = 'light'; b.t = 0; this.struck = false; this.queued = false;
    b.stam -= 8 + this.combo * 2; this.stamIdle = 0;
    b.yaw = this.faceKirill(b.yaw, 0.9);
    sfx.swoosh();
  }

  private startHeavy() {
    const b = this.boss;
    this.bs = 'heavy'; b.t = 0; this.struck = false;
    b.stam -= 24; this.stamIdle = 0;
    b.yaw = this.faceKirill(b.yaw, 0.9);
    this.fx.ring(b.x, b.z, 0.3, 2.2, HEAVY.w, 0xff7a2a, 0.7);
    sfx.swoosh();
  }

  private startRoll(mx: number, mz: number) {
    const b = this.boss;
    if (!mx && !mz) { mx = -Math.sin(b.yaw); mz = -Math.cos(b.yaw); }
    this.bs = 'roll'; b.t = 0; b.iframes = ROLL.iframes;
    b.vx = mx * ROLL.speed; b.vz = mz * ROLL.speed;
    b.yaw = Math.atan2(mx, mz);
    b.stam -= ROLL.stam; this.stamIdle = 0;
    sfx.click();
  }

  /** soft lock: turn toward Kirill by at most `max` radians */
  private faceKirill(yaw: number, max: number) {
    return turnTo(yaw, Math.atan2(this.kirill.x - this.boss.x, this.kirill.z - this.boss.z), max);
  }

  private bossTick(dt: number) {
    const b = this.boss;
    b.t += dt;
    b.iframes = Math.max(0, b.iframes - dt);
    this.comboT = Math.max(0, this.comboT - dt);
    this.stamIdle += dt;
    if (this.stamIdle > 0.6 && this.bs !== 'roll') b.stam = Math.min(100, b.stam + 30 * dt);
    if (this.bs === 'light') {
      const s = LIGHT[this.combo];
      if (!this.struck && b.t >= s.w) {
        this.struck = true;
        const lunge = this.combo === 2 ? 4.5 : 3;
        b.vx += Math.sin(b.yaw) * lunge; b.vz += Math.cos(b.yaw) * lunge;
        this.src = 'light';
        this.swing(this.reach, 1.2, s.dmg, this.combo === 2 ? 'knock' : null);
      }
      if (b.t >= s.w + s.a + s.r) {
        this.comboT = 0.45;
        if (this.queued && this.combo < 2) { this.bs = 'idle'; this.startLight(); }
        else { this.bs = 'idle'; if (this.combo === 2) this.comboT = 0; }
      }
    } else if (this.bs === 'heavy') {
      if (!this.struck && b.t >= HEAVY.w) {
        this.struck = true;
        b.vx += Math.sin(b.yaw) * 5; b.vz += Math.cos(b.yaw) * 5;
        this.src = 'heavy';
        this.swing(this.reach + 0.4, 1.5, HEAVY.dmg, 'down');
        this.shake = Math.max(this.shake, 0.35);
        const ix = b.x + Math.sin(b.yaw) * 2.6, iz = b.z + Math.cos(b.yaw) * 2.6;
        this.fx.ring(ix, iz, 0.3, 3.6, 0.45, this.gold, 0.9);
        this.pillar(ix, iz, 1.4, 0.55);
        sfx.boom();
      }
      if (b.t >= HEAVY.w + HEAVY.a + HEAVY.r) this.bs = 'idle';
    } else if (this.bs === 'roll') {
      if (b.t >= ROLL.dur) { this.bs = 'idle'; b.vx *= 0.3; b.vz *= 0.3; }
    } else if (this.bs === 'special' || this.bs === 'hit') {
      if (b.t >= (this.bs === 'hit' ? 0.35 : 0.6)) this.bs = 'idle';
    }
    if (this.bs !== 'roll') { b.vx *= Math.pow(0.0015, dt); b.vz *= Math.pow(0.0015, dt); }
    this.move(b, dt, 0.7);
  }

  /** a boss strike in front: damage to Kirill (unless he rolled) and minions don't mind */
  private swing(reach: number, arc: number, dmg: number, effect: 'knock' | 'down' | null) {
    const b = this.boss, k = this.kirill;
    const dx = k.x - b.x, dz = k.z - b.z, d = Math.hypot(dx, dz);
    let a = Math.atan2(dx, dz) - b.yaw;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    this.trail(reach, arc, effect === 'down' ? 0.9 : 2.2 + this.combo * 0.4);
    dmg *= this.rage;
    if (d > reach + 0.3 || Math.abs(a) > arc || this.ks === 'dead') { sfx.place(); return; }
    if (k.iframes > 0) { this.fx.popup(k.x, 2.2, k.z, t('bs.dodged'), 'skill'); return; }
    this.hurtKirill(dmg * this.def.power, effect, dx / (d || 1), dz / (d || 1));
  }

  private get gold() { return PALETTES[this.bossId]?.gold ?? 0xffc65a; }

  /** a golden arc of light where the swing went, fading out */
  private trail(reach: number, arc: number, height: number) { this.trailFrom(this.boss, reach, arc, height); }

  private trailFrom(b: Body, reach: number, arc: number, height: number) {
    const geo = new THREE.RingGeometry(reach * 0.35, reach, 32, 1, -arc, arc * 2);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: this.gold, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    mesh.position.set(b.x, height, b.z);
    // the ring's arc is centred on its local +x: lay it flat, then turn +x to face where you face
    mesh.rotation.set(-Math.PI / 2, b.yaw - Math.PI / 2, 0, 'YXZ');
    this.root.add(mesh);
    this.trails.push({ mesh, t: 0, dur: 0.28 });
  }

  /** a column of light (heavy slams, spell casts) */
  private pillar(x: number, z: number, r: number, dur: number) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.2, 26, 20, 1, true), new THREE.MeshBasicMaterial({ color: this.gold, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    mesh.position.set(x, 13, z);
    this.root.add(mesh);
    this.trails.push({ mesh, t: 0, dur });
    this.fx.burst(x, z, this.gold, 14, 0.4, 6);
  }

  private tickTrails(dt: number) {
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const tr = this.trails[i];
      tr.t += dt;
      const u = tr.t / tr.dur;
      (tr.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - u));
      tr.mesh.scale.x = tr.mesh.scale.z = 1 + u * 0.15;
      if (u >= 1) { this.root.remove(tr.mesh); tr.mesh.geometry.dispose(); this.trails.splice(i, 1); }
    }
  }

  /** the hero's weapon: a glowing highlighter-sword in Kirill's right hand */
  private giveSword(p: Person) {
    const sword = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.95, 0.025), new THREE.MeshBasicMaterial({ color: 0xc8ff4a, toneMapped: false }));
    blade.position.y = -0.55;
    const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.06), new THREE.MeshStandardMaterial({ color: 0x2b2b30 }));
    hilt.position.y = -0.06;
    sword.add(blade, hilt);
    sword.position.set(0, -0.5, 0.06);
    sword.rotation.x = -Math.PI / 2;
    p.armR.add(sword);
  }

  /** half health: you rise into the air, light bursts out, the Tree flares, you hit harder */
  private enterPhase2() {
    const b = this.boss, k = this.kirill;
    this.phase2 = true;
    this.rage = 1.25;
    this.bs = 'special'; b.t = -2.2; b.iframes = 2.8;
    this.slowmo = 1.4;
    this.shake = 0.6;
    this.flare = 1.4;
    this.fx.ring(b.x, b.z, 0.5, 9, 0.9, this.gold, 1);
    this.pillar(b.x, b.z, 2.4, 1.6);
    const d = Math.hypot(k.x - b.x, k.z - b.z) || 1;
    if (d < 7) this.hurtKirill(8, 'down', (k.x - b.x) / d, (k.z - b.z) / d);
    const c = this.hud.querySelector('.bs-center') as HTMLElement;
    c.innerHTML = `<div class="bs-title p2">${t('boss.name.' + this.bossId)}</div><div class="bs-subtitle">${t('bs.awakened')}</div>`;
    setTimeout(() => { if (c.querySelector('.p2')) c.innerHTML = ''; }, 3000);
    this.hud.querySelector('.bs-boss')?.classList.add('p2');
    juice.sting(4); sfx.boom(); juice.gasp(); sfx.bell();
    music.set(1);
  }

  private hurtKirill(dmg: number, effect: 'knock' | 'down' | 'stun' | null, nx = 0, nz = 0, poiseBreak = true, src = this.src) {
    const k = this.kirill;
    if (this.ks === 'dead' || k.iframes > 0 || this.mh) return;
    dmg *= BOSS_DMG * (this.setup.might ?? 1);
    // he remembers what killed him last time: it only grazes him now
    if (this.learned.has(src)) {
      dmg *= 0.5;
      if (Math.random() < 0.25) this.fx.popup(k.x, 3.0, k.z, t('mh.read'), 'skill');
    }
    this.dmgBy[src] = (this.dmgBy[src] ?? 0) + dmg;
    k.hp = Math.max(0, k.hp - dmg);
    if (this.ultCine <= 0) this.ult = Math.min(100, this.ult + ULT_PER_HIT * (this.phase2 ? 1.5 : 1));
    this.hits++;
    this.hitChain++;
    this.hitChainT = 2;
    if ([5, 10, 18].includes(this.hitChain)) announce(this.hitChain >= 18 ? 3 : this.hitChain >= 10 ? 2 : 1);
    this.fx.popup(k.x, 2.4, k.z, dmg >= 18 ? '2!' : dmg >= 10 ? '3-' : '4', dmg >= 18 ? 'grade-2' : 'grade-3');
    this.fx.burst(k.x, k.z, 0xf6f3ea, dmg >= 18 ? 12 : 6, 1.1);
    k.rig.hurt();
    sfx.hurt();
    if (Math.random() < 0.3) voice.play('kirill_hurt');
    // a hit interrupts his coffee and his attacks
    if (this.ks === 'drink') {
      // spilled: the charge is gone and the drink is over, whatever hit him
      this.estus = Math.max(0, this.estus - 1);
      this.fx.popup(k.x, 2.9, k.z, t('bs.spilled'), 'grade-2');
      this.ks = 'hit'; k.t = 0; this.kAtk = 0.25;
    }
    this.freeze = dmg >= 18 ? 0.09 : 0.045;
    this.shake = Math.max(this.shake, dmg >= 18 ? 0.3 : 0.12);
    if (effect === 'knock' || effect === 'down') { k.vx = nx * (effect === 'down' ? 9 : 6); k.vz = nz * (effect === 'down' ? 9 : 6); }
    // poise: chip damage and light hits don't stop him mid-swing (trading blows, like a player)
    if (!poiseBreak || (effect === null && (this.ks === 'slash' || this.ks === 'beam' || this.ks === 'roll'))) return;
    this.ks = effect === 'down' || effect === 'stun' ? 'stun' : 'hit';
    k.t = 0;
    this.kAtk = effect === 'down' ? 0.9 : effect === 'stun' ? 1.2 : 0.2;
    this.clearBeam();
    // like a player: two hits in a row and he rolls out of the combo
    this.kRecent = this.time - this.kLastHit < 1 ? this.kRecent + 1 : 1;
    this.kLastHit = this.time;
    if (this.kRecent >= 2 && effect === null && k.stam >= 20 && this.rng.chance(0.55 + 0.04 * (this.setup.level ?? 1))) {
      this.kAtk = 0.08;
      this.escape = true;
    }
  }

  // ---------------------------------------------------------------- signature moves

  private special(id: MoveId, who?: Body) {
    const b = who ?? this.boss, k = this.kirill;
    if (b === this.boss) { this.cds[id] = MOVE_CD[id]; this.bs = 'special'; b.t = 0; }
    this.src = id;
    this.seesItComing(id);
    b.yaw = this.faceKirill(b.yaw, Math.PI);
    const d = Math.hypot(k.x - b.x, k.z - b.z);
    const inCone = (range: number, cone: number) => {
      let a = Math.atan2(k.x - b.x, k.z - b.z) - b.yaw;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      return d < range && Math.abs(a) < cone;
    };
    this.say(t('mvl.' + id));
    juice.sting(2);
    // its look in light (before the move: dashes and teleports streak from where it started)
    this.spells.moveFx(id, () => ({ x: b.x, z: b.z, yaw: b.yaw }), k.x, k.z);
    switch (id) {
      case 'whistle':
        sfx.whistle();
        this.fx.ring(b.x, b.z, 0.5, 7, 0.4, 0xfff0a0, 0.6);
        if (inCone(7.5, 0.8)) this.hurtKirill(4, 'stun');
        break;
      case 'ballStorm':
        for (let i = -1; i <= 1; i++) this.spawnBall(b.x, b.z, Math.atan2(k.x - b.x, k.z - b.z) + i * 0.25, 1, 'medBall', 12);
        break;
      case 'danceShock':
        sfx.boom();
        this.fx.ring(b.x, b.z, 0.5, 4.2, 0.45, 0xff4ab0, 0.8);
        if (d < 4.3) this.hurtKirill(16 * this.def.power, 'down', (k.x - b.x) / (d || 1), (k.z - b.z) / (d || 1));
        break;
      case 'partyGrab': {
        // dash to him and drag him into a dance
        const reach = Math.min(6, Math.max(0, d - 1));
        const nx = (k.x - b.x) / (d || 1), nz = (k.z - b.z) / (d || 1);
        const p = { x: b.x + nx * reach, z: b.z + nz * reach };
        this.grid.resolve(p, 0.6);
        b.x = p.x; b.z = p.z;
        if (d - reach < 1.8) { this.hurtKirill(10, 'stun'); this.kDance = 2; }
        break;
      }
      case 'flash':
        juice.gasp();
        this.fx.ring(b.x, b.z, 0.3, 6, 0.25, 0xffffff, 0.9);
        if (inCone(8, 0.9)) { this.kBlind = 3.5; this.fx.popup(k.x, 2.8, k.z, t('bs.blinded'), 'grade-2'); }
        break;
      case 'gossip':
        for (let i = 0; i < 4; i++) this.spawnMinion('swarm', 'quiz', b.x + (i - 1.5) * 0.8, b.z, 1);
        break;
      case 'selfie': {
        // pulls him in for a selfie (and stuns him)
        const nx = (b.x - k.x) / (d || 1), nz = (b.z - k.z) / (d || 1);
        const pull = Math.max(0, d - 1.6);
        const p = { x: k.x + nx * pull, z: k.z + nz * pull };
        this.grid.resolve(p, 0.4);
        k.x = p.x; k.z = p.z;
        this.hurtKirill(6, 'stun');
        juice.gasp();
        break;
      }
      case 'laser':
        this.laserT = 1.8;
        break;
      case 'codeBolt':
        for (let i = -1; i <= 1; i++) this.spawnBall(b.x, b.z, Math.atan2(k.x - b.x, k.z - b.z) + i * 0.18, 1, 'bolt', 9);
        break;
      case 'glitch': {
        // reappear behind him; the next hit of yours lands harder
        const p = { x: k.x - Math.sin(this.kirill.yaw) * 1.6, z: k.z - Math.cos(this.kirill.yaw) * 1.6 };
        this.grid.resolve(p, 0.6);
        this.fx.burst(b.x, b.z, 0x23c4b8, 12);
        b.x = p.x; b.z = p.z;
        b.yaw = Math.atan2(k.x - b.x, k.z - b.z);
        this.fx.burst(b.x, b.z, 0x23c4b8, 12);
        sfx.teleport();
        break;
      }
      case 'yawn':
        this.fx.ring(b.x, b.z, 0.5, 5.5, 0.6, 0x9a8ad8, 0.6);
        if (d < 5.5) { this.kSlow = 4; this.fx.popup(k.x, 2.8, k.z, '🥱', 'skill'); }
        break;
      case 'slam':
        sfx.boom();
        this.shake = 0.5;
        this.fx.ring(b.x, b.z, 0.5, 3, 0.4, 0x9a6a3a, 0.9);
        if (d < 3) this.hurtKirill(20 * this.def.power, 'down', (k.x - b.x) / (d || 1), (k.z - b.z) / (d || 1));
        break;
      case 'shield':
        this.shield = 5;
        this.fx.ring(b.x, b.z, 0.5, 1.6, 0.6, 0x6fb7e8, 0.8);
        break;
      case 'heal':
        b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.2);
        this.fx.ring(b.x, b.z, 0.3, 1.8, 0.6, 0x5fe07a, 0.8);
        sfx.levelUp();
        break;
      case 'bassDrop':
        sfx.boom(); sfx.beat();
        this.fx.ring(b.x, b.z, 0.5, 5, 0.5, 0x9a5ae8, 0.8);
        if (d < 5) { this.hurtKirill(10, null); this.kSlow = 3; }
        break;
      case 'lecture':
        this.kDrowsy = 5;
        this.fx.popup(k.x, 2.8, k.z, '😴', 'skill');
        sfx.droneNote(131, 1);
        break;
    }
  }
  private laserT = 0;
  private kDance = 0;
  private kRecent = 0;
  private kLastHit = -9;
  /** roll away as soon as the hit-stun ends */
  private escape = false;
  private flowT = 0;
  private flowDir = { x: 0, z: 0 };

  // ---------------------------------------------------------------- summons (your deck)

  /** the next wave of your deck, on its own clock — faster in phase 2, held back while the floor is full */
  private waveTick(dt: number) {
    if (!this.summons.length || this.bs === 'dead') return;
    this.waveT -= dt;
    if (this.waveT > 0) return;
    const alive = this.minions.filter((m) => m.alive && m.kind !== 'ball' && !m.kind.startsWith('guest:')).length;
    if (alive >= 6) { this.waveT = 1.5; return; }
    // your horde fights beside you: a wave every few seconds, in a ring of light round you
    const i = this.waveI++ % this.summons.length;
    const b = this.boss;
    this.fx.ring(b.x, b.z, 0.5, 4, 0.5, 0x9ff6ff, 0.8);
    this.summon(i);
    this.waveT = (this.phase2 ? 5 : 7) + this.rng.next() * 1.5;
    const s = this.summons[i];
    this.flashText(`${t('bs.hordeArrives')} · ${CARDS[s.card].icon} ${CARDS[s.card].name}`);
    sfx.soulJump();
  }

  private summon(i: number) {
    const s = this.summons[i];
    if (!s) return;
    const spec = SUMMON[s.card]!;
    const b = this.boss, k = this.kirill;
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    let kind: SummonKind = spec.kind, unit = spec.unit;
    if (kind === 'random') { const opts: [SummonKind, string][] = [['swarm', 'quiz'], ['bomb', 'deadline'], ['ball', 'medBall'], ['hold', 'guard']]; [kind, unit] = this.rng.pick(opts); }
    juice.thump();
    this.fx.ring(b.x + fx * 1.5, b.z + fz * 1.5, 0.2, 1.4, 0.35, 0xffd24a, 0.8);
    switch (kind) {
      case 'swarm': for (let n = 0; n < Math.min(4, 1 + s.level); n++) this.spawnMinion('swarm', unit, b.x + fx * 1.5 + (n - 1) * 0.6, b.z + fz * 1.5, s.level); break;
      case 'bomb': this.spawnMinion('bomb', unit, b.x + fx * 1.5, b.z + fz * 1.5, s.level); break;
      case 'stick': this.spawnMinion('stick', unit, b.x + fx * 1.5, b.z + fz * 1.5, s.level); break;
      case 'hold': this.spawnMinion('hold', unit, b.x + fx * 1.5, b.z + fz * 1.5, s.level); break;
      case 'heavy': this.spawnMinion('heavy', unit, b.x + fx * 1.5, b.z + fz * 1.5, s.level); break;
      case 'ball': for (let n = 0; n < s.level; n++) this.spawnBall(b.x, b.z, Math.atan2(k.x - b.x, k.z - b.z) + (n - (s.level - 1) / 2) * 0.2, s.level, 'medBall', 14); break;
      case 'aura': this.spawnAura(b.x, b.z, s.level); break;
      case 'guest': this.spawnGuest(unit, s.level); break;
    }
  }

  private spawnMinion(kind: string, unit: string, x: number, z: number, level: number) {
    const S: Record<string, [number, number, number, number]> = {
      // hp, speed, contact damage, life
      swarm: [10, 5.5, 4, 14], bomb: [12, 4.2, 22, 10], stick: [16, 4.6, 0, 14], hold: [24, 3.8, 3, 14], heavy: [40, 2.8, 10, 18],
    };
    const [hp, speed, dmg, life] = S[kind];
    const obj = unitObject(unit);
    obj.position.set(x, 0, z);
    this.root.add(obj);
    const p = { x, z };
    this.grid.resolve(p, 0.3);
    this.minions.push({ kind, obj, x: p.x, z: p.z, vx: 0, vz: 0, hp: hp * (1 + 0.3 * (level - 1)), speed, dmg: dmg * (1 + 0.25 * (level - 1)), t: 0, life, level, alive: true, cd: 0.4 });
  }

  private spawnBall(x: number, z: number, a: number, level: number, unit: string, speed: number) {
    const obj = unit === 'bolt'
      ? new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.14), new THREE.MeshBasicMaterial({ color: 0x5fe07a, toneMapped: false }))
      : unitObject(unit);
    obj.position.set(x, 0.6, z);
    this.root.add(obj);
    this.minions.push({ kind: 'ball', obj, x: x + Math.sin(a) * 0.8, z: z + Math.cos(a) * 0.8, vx: Math.sin(a) * speed, vz: Math.cos(a) * speed, hp: 1, speed, dmg: (unit === 'bolt' ? 8 : 12) * (1 + 0.25 * (level - 1)), t: 0, life: 2.5, level, alive: true, cd: 0 });
  }

  private spawnAura(x: number, z: number, level: number) {
    const mesh = unitObject('speaker');
    mesh.position.set(x, 0, z);
    this.root.add(mesh);
    const ring = this.fx.disc(5, 0x9a5ae8, 0.15);
    ring.position.set(x, 0.04, z);
    this.auras.push({ x, z, t: 6 + level * 2, mesh });
    setTimeout(() => this.fx.group.remove(ring), (6 + level * 2) * 1000);
    sfx.beat();
  }

  private spawnGuest(name: string, level: number) {
    const k = this.kirill;
    const rig = makeCharacter(name);
    const a = this.rng.range(0, Math.PI * 2);
    const p = { x: k.x + Math.sin(a) * 2, z: k.z + Math.cos(a) * 2 };
    this.grid.resolve(p, 0.4);
    rig.root.position.set(p.x, 0, p.z);
    rig.faceTowards(Math.atan2(k.x - p.x, k.z - p.z), 1, 100);
    this.root.add(rig.root);
    this.minions.push({ kind: 'guest:' + name, obj: rig.root, x: p.x, z: p.z, vx: 0, vz: 0, hp: 999, speed: 0, dmg: 0, t: 0, life: 3.5, level, alive: true, cd: 0, rig });
    // their thing: Sonya pulls him in for a selfie, Romchik drags him into a dance, Masha's gossip slows him
    if (name === 'romchik') { this.hurtKirill(6, 'stun'); this.kDance = 2 + level * 0.5; rig.pose = 'dance'; }
    else if (name === 'sonya') { this.hurtKirill(4, 'stun'); this.kAtk = 1.5 + level * 0.3; rig.pose = 'cheer'; }
    else { this.kSlow = 4 + level; this.kBlind = 2; rig.pose = 'talk'; }
    voice.play(name + '_line');
    this.say(t('bs.guest.' + name), rig.root.position);
  }

  private minionTick(dt: number) {
    const k = this.kirill;
    this.src = 'horde';
    for (const m of this.minions) {
      if (!m.alive) continue;
      m.t += dt; m.cd -= dt;
      if (m.t > m.life) { this.killMinion(m); continue; }
      const dx = k.x - m.x, dz = k.z - m.z, d = Math.hypot(dx, dz) || 1;
      if (m.kind.startsWith('guest:')) { m.rig?.update(dt, 0); continue; }
      if (m.kind === 'ball') {
        m.x += m.vx * dt; m.z += m.vz * dt;
        m.obj.position.set(m.x, 0.6, m.z);
        m.obj.rotation.y += dt * 10;
        if (this.grid.blocked(m.x, m.z)) { this.killMinion(m); continue; }
        if (d < 0.8 && this.ks !== 'dead') { this.hurtKirill(m.dmg, 'knock', m.vx / m.speed, m.vz / m.speed); this.killMinion(m); }
        continue;
      }
      // walk to him
      m.vx += ((dx / d) * m.speed - m.vx) * Math.min(1, dt * 6);
      m.vz += ((dz / d) * m.speed - m.vz) * Math.min(1, dt * 6);
      const p = { x: m.x + m.vx * dt, z: m.z + m.vz * dt };
      this.grid.resolve(p, 0.3);
      m.x = p.x; m.z = p.z;
      m.obj.position.set(m.x, m.kind === 'swarm' ? 0.1 + Math.abs(Math.sin(m.t * 9)) * 0.12 : 0, m.z);
      m.obj.rotation.y = Math.atan2(m.vx, m.vz);
      if (d > 1.0 || m.cd > 0 || this.ks === 'dead') continue;
      m.cd = 1;
      if (m.kind === 'bomb') {
        sfx.boom();
        this.fx.ring(m.x, m.z, 0.3, 2.6, 0.4, 0xff4a2a, 0.9);
        this.hurtKirill(m.dmg, 'down', dx / d, dz / d);
        this.killMinion(m);
      } else if (m.kind === 'stick') { this.kSlow = 4; this.fx.popup(k.x, 2.6, k.z, t('pop.group'), 'grade-3'); this.killMinion(m); }
      else if (m.kind === 'hold') { this.hurtKirill(m.dmg, 'stun'); this.killMinion(m); }
      else this.hurtKirill(m.dmg, null, 0, 0, false);
    }
    this.minions = this.minions.filter((m) => m.alive);
    for (let i = this.auras.length - 1; i >= 0; i--) {
      const a = this.auras[i];
      a.t -= dt;
      a.mesh.scale.setScalar(1 + Math.abs(Math.sin(this.time * 8)) * 0.1);
      if (Math.hypot(k.x - a.x, k.z - a.z) < 5) { this.kSlow = Math.max(this.kSlow, 0.2); if (Math.random() < dt * 1.5) this.hurtKirill(3, null, 0, 0, false); }
      if (a.t <= 0) { this.root.remove(a.mesh); this.auras.splice(i, 1); }
    }
    // Sonya's laser: a beam from you that follows him for a moment
    if (this.laserT > 0) {
      this.laserT -= dt;
      const b = this.boss;
      this.fx.beam(b.x, b.z, k.x, k.z, 0xff3a3a, 0.05, 0.12);
      if (Math.random() < dt * 4) this.hurtKirill(3, null, 0, 0, false, 'laser');
    }
  }

  private killMinion(m: Minion) {
    m.alive = false;
    this.root.remove(m.obj);
    if (!m.kind.startsWith('guest:') && m.kind !== 'ball') this.fx.burst(m.x, m.z, 0xf6f3ea, 5);
  }

  // ---------------------------------------------------------------- Kirill, the hero

  /** decisions: like a souls player — punish, roll through swings, heal when safe, poke from range */
  /** the boss Kirill is fighting right now: the nearer of you and your partner */
  private foe(): Body {
    const k = this.kirill, p = this.partner;
    if (!p || p.down) return this.boss;
    return Math.hypot(p.body.x - k.x, p.body.z - k.z) < Math.hypot(this.boss.x - k.x, this.boss.z - k.z) - 0.5 ? p.body : this.boss;
  }

  private kirillAI(dt: number) {
    const k = this.kirill, b = this.foe();
    this.kThink -= dt;
    this.kRollCd = Math.max(0, this.kRollCd - dt);
    this.kBeamCd = Math.max(0, this.kBeamCd - dt);
    if (this.ks !== 'idle') return;
    const dx = b.x - k.x, dz = b.z - k.z, d = Math.hypot(dx, dz) || 1;
    if (this.escape) { this.escape = false; this.kRoll(-dx / d + this.rng.range(-0.6, 0.6), -dz / d + this.rng.range(-0.6, 0.6)); return; }
    // the way to you around the furniture
    this.flowT -= dt;
    if (this.flowT <= 0) { this.flowT = 0.3; this.grid.computeFlow(b.x, b.z, 0.5); }
    // standing in a spell's circle: get out (a roll if he can)
    const zone = this.spells.dangerAt(k.x, k.z);
    if (zone && this.kRollCd <= 0 && k.stam >= 20 && this.rng.chance(this.kRollSkill * dt * 5)) {
      const ex = k.x - zone.x, ez = k.z - zone.z, el = Math.hypot(ex, ez) || 1;
      this.kRoll(ex / el + this.rng.range(-0.3, 0.3), ez / el + this.rng.range(-0.3, 0.3));
      return;
    }
    // read your windups: roll away (to the side) if he sees it coming
    const threat = (this.bs === 'light' && b.t < LIGHT[this.combo].w) || (this.bs === 'heavy' && b.t < HEAVY.w);
    if (threat && d < this.reach + 1.2 && this.kRollCd <= 0 && k.stam >= 20 && this.rng.chance(this.kRollSkill * dt * 12)) {
      const side = this.rng.chance(0.5) ? 1 : -1;
      this.kRoll(-dz / d * side - dx / d * 0.5, dx / d * side - dz / d * 0.5);
      return;
    }
    if (this.kThink > 0) { this.kWalk(dt, d, dx, dz); return; }
    this.kThink = 0.22;
    // swat minions next to him first
    const near = this.minions.find((m) => m.alive && !m.kind.startsWith('guest:') && m.kind !== 'ball' && Math.hypot(m.x - k.x, m.z - k.z) < 1.6);
    if (near && this.rng.chance(0.6)) { k.yaw = Math.atan2(near.x - k.x, near.z - k.z); this.kSlash(); return; }
    if (k.hp / k.maxHp < 0.45 && this.estus > 0 && (d > 4 || (d > 2.6 && this.bs !== 'idle' && this.rng.chance(0.3)))) { this.kDrink(); return; }
    // hurt and close: back off to drink
    if (k.hp / k.maxHp < 0.45 && this.estus > 0 && k.stam >= 20 && this.kRollCd <= 0) { this.kRoll(-dx / d, -dz / d); return; }
    if (d > 6 && this.kBeamCd <= 0) { this.kBeam(); return; }
    // punish recovery: you just swung and missed
    const recovering = (this.bs === 'light' && b.t > LIGHT[this.combo].w + 0.05) || (this.bs === 'heavy' && b.t > HEAVY.w + 0.1) || this.bs === 'special';
    if (d < K_REACH + this.bodyR + 0.3 && (recovering || this.rng.chance(0.45))) { this.kCombo = this.rng.int(1, 3); this.kSlash(); return; }
    if (d < 1.4 && this.kRollCd <= 0 && this.rng.chance(0.15)) { this.kRoll(-dx / d, -dz / d); return; }
    if (this.rng.chance(0.3)) this.strafe = -this.strafe;
  }

  private kWalk(dt: number, d: number, dx: number, dz: number) {
    const k = this.kirill;
    const nx = dx / d, nz = dz / d;
    // keep at about sword's length, circling
    const want = d > 2.4 + this.bodyR * 0.5 ? 1 : d < 1.4 + this.bodyR * 0.5 ? -0.6 : 0;
    let mx = nx * want - nz * this.strafe * 0.7, mz = nz * want + nx * this.strafe * 0.7;
    // far away: follow the flow field around obstacles
    if (d > 3.2 && this.grid.flowDir(k.x, k.z, false, this.flowDir)) { mx = this.flowDir.x; mz = this.flowDir.z; }
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml; mz /= ml;
    const sp = this.kSpeed * (this.kSlow > 0 ? 0.55 : 1) * (this.kDrowsy > 0 ? 0.8 : 1);
    k.vx += (mx * sp - k.vx) * Math.min(1, dt * 8);
    k.vz += (mz * sp - k.vz) * Math.min(1, dt * 8);
    k.yaw = turnTo(k.yaw, Math.atan2(dx, dz), dt * 10);
  }

  private kSlash() {
    const k = this.kirill;
    this.ks = 'slash'; k.t = 0; this.kStruck = false;
    const f = this.foe();
    k.yaw = turnTo(k.yaw, Math.atan2(f.x - k.x, f.z - k.z), 1.2);
    this.fx.popup(k.x, 2.5, k.z, '!', 'grade-2');
  }

  private kRoll(nx: number, nz: number) {
    const k = this.kirill;
    const l = Math.hypot(nx, nz) || 1;
    this.ks = 'roll'; k.t = 0; k.iframes = 0.32;
    k.vx = (nx / l) * 8.5; k.vz = (nz / l) * 8.5;
    k.yaw = Math.atan2(nx, nz);
    k.stam -= 22;
    this.kRollCd = 0.7;
  }

  private kDrink() {
    this.ks = 'drink'; this.kirill.t = 0;
    this.say(t('bs.estus'), undefined, true);
  }

  private kBeam() {
    const k = this.kirill, b = this.foe();
    this.ks = 'beam'; k.t = 0;
    this.kBeamCd = this.rng.range(7, 10);
    k.yaw = Math.atan2(b.x - k.x, b.z - k.z);
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 10), new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.6, toneMapped: false }));
    line.position.set(k.x + Math.sin(k.yaw) * 5, 0.1, k.z + Math.cos(k.yaw) * 5);
    line.rotation.y = k.yaw;
    line.userData.yaw = k.yaw;
    this.root.add(line);
    this.beamLine = line;
  }

  private clearBeam() {
    if (this.beamLine) { this.root.remove(this.beamLine); this.beamLine = null; }
  }

  private kirillTick(dt: number) {
    const k = this.kirill, b = this.foe();
    k.t += dt;
    k.iframes = Math.max(0, k.iframes - dt);
    this.kSlow = Math.max(0, this.kSlow - dt);
    this.kBlind = Math.max(0, this.kBlind - dt);
    this.kDrowsy = Math.max(0, this.kDrowsy - dt);
    this.kDance = Math.max(0, this.kDance - dt);
    k.stam = Math.min(100, k.stam + 22 * dt);
    const atkMul = this.kDrowsy > 0 ? 1.6 : 1;
    switch (this.ks) {
      case 'slash': {
        const w = 0.2 * atkMul;
        if (!this.kStruck && k.t >= w) {
          this.kStruck = true;
          k.vx += Math.sin(k.yaw) * 3; k.vz += Math.cos(k.yaw) * 3;
          this.kHit(K_REACH, 1.1, 10 * this.kPower);
        }
        if (k.t >= w + 0.32) {
          if (--this.kCombo > 0) { this.kSlash(); this.kCombo = Math.max(0, this.kCombo); }
          else this.ks = 'idle';
        }
        break;
      }
      case 'beam': {
        if (k.t >= 0.75 && this.beamLine) {
          const a = this.beamLine.userData.yaw as number;
          const ux = Math.sin(a), uz = Math.cos(a);
          const px = b.x - k.x, pz = b.z - k.z;
          const along = px * ux + pz * uz, perp = Math.abs(px * uz - pz * ux);
          this.fx.beam(k.x, k.z, k.x + ux * 10, k.z + uz * 10, 0xb6ff3a, 0.25, 0.35);
          if (along > 0 && along < 10 && perp < 0.9 && b.iframes <= 0 && this.kBlind <= 0) this.hurtBody(b, 14 * this.kPower);
          this.clearBeam();
          sfx.boom();
        }
        if (k.t >= 1.1) this.ks = 'idle';
        break;
      }
      case 'roll':
        if (k.t >= 0.4) { this.ks = 'idle'; k.vx *= 0.3; k.vz *= 0.3; }
        break;
      case 'drink':
        if (k.t >= 1.3) {
          this.estus = Math.max(0, this.estus - 1);
          k.hp = Math.min(k.maxHp, k.hp + k.maxHp * 0.3);
          this.fx.ring(k.x, k.z, 0.3, 1.6, 0.5, 0x5fe07a, 0.8);
          this.fx.popup(k.x, 2.6, k.z, '☕ +', 'skill');
          this.ks = 'idle';
        }
        break;
      case 'hit':
      case 'stun':
        this.kAtk -= dt;
        if (this.kAtk <= 0) this.ks = 'idle';
        break;
    }
    if (this.ks !== 'roll') { k.vx *= Math.pow(0.002, dt); k.vz *= Math.pow(0.002, dt); }
    this.move(k, dt, 0.5);
  }

  /** Kirill's highlighter slash: hurts you (unless you roll; blinded he mostly misses) and your minions */
  private kHit(reach: number, arc: number, dmg: number) {
    const k = this.kirill, b = this.foe();
    for (const m of this.minions) {
      if (!m.alive || m.kind === 'ball' || m.kind.startsWith('guest:')) continue;
      if (Math.hypot(m.x - k.x, m.z - k.z) < reach + 0.3) { m.hp -= dmg * 1.5; if (m.hp <= 0) this.killMinion(m); }
    }
    const dx = b.x - k.x, dz = b.z - k.z, d = Math.hypot(dx, dz);
    let a = Math.atan2(dx, dz) - k.yaw;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    if (d > reach + this.bodyR + 0.3 || Math.abs(a) > arc + 0.3) return;
    if (b.iframes > 0) { this.fx.popup(b.x, 2.9, b.z, t('bs.rolled'), 'skill'); return; }
    if (this.kBlind > 0 && this.rng.chance(0.7)) { this.fx.popup(k.x, 2.6, k.z, t('bs.missed'), 'skill'); return; }
    this.hurtBody(b, dmg);
  }

  /** a hit on you or on your partner */
  private hurtBody(b: Body, dmg: number) {
    const p = this.partner;
    if (p && b === p.body) {
      if (p.down) return;
      b.hp = Math.max(0, b.hp - dmg);
      b.rig.hurt();
      this.fx.burst(b.x, b.z, 0xffd27a, 5, 1.2);
      sfx.hurt();
      if (b.hp <= 0) { p.down = true; this.say(t('pdown.' + p.id), new THREE.Vector3(b.x, 0, b.z)); this.hud.querySelector('.bs-partner')?.classList.add('down'); }
      return;
    }
    this.hurtBoss(dmg);
  }

  // ---------------------------------------------------------------- your partner (AI)

  /** a second boss beside you: closes in, swings, uses its moves, and won't stop talking */
  private partnerTick(dt: number) {
    const p = this.partner;
    if (!p) return;
    const b = p.body, k = this.kirill;
    b.t += dt;
    if (p.down) { b.vx *= 0.9; b.vz *= 0.9; return; }
    for (const m of Object.keys(p.cds)) p.cds[m] = Math.max(0, p.cds[m] - dt);
    const dx = k.x - b.x, dz = k.z - b.z, d = Math.hypot(dx, dz) || 1;
    b.yaw = turnTo(b.yaw, Math.atan2(dx, dz), dt * 6);
    // Pasha raps, Grisha jokes, Masha gossips…
    p.lineT -= dt;
    if (p.lineT <= 0) { p.lineT = this.rng.range(6, 10); this.say(t('pline.' + p.id + this.rng.int(0, 3)), new THREE.Vector3(b.x, 0, b.z)); }
    if (p.swinging) {
      if (!p.struck && b.t >= 0.4) {
        p.struck = true;
        this.trailFrom(b, this.reach * 0.85, 1.0, 1.8);
        let a = Math.atan2(dx, dz) - b.yaw;
        a = Math.atan2(Math.sin(a), Math.cos(a));
        if (d < this.reach * 0.85 + 0.3 && Math.abs(a) < 1.1 && k.iframes <= 0) this.hurtKirill(9 * BOSSES[p.id].power * this.rage, null, dx / d, dz / d, true, 'partner');
      }
      if (b.t >= 0.9) p.swinging = false;
      return;
    }
    // one of its own spells, every so often, on him
    p.spellT -= dt;
    if (p.spellT <= 0 && this.time > 6) {
      p.spellT = this.rng.range(16, 22) * (this.phase2 ? 0.75 : 1);
      const id = this.rng.pick(SPELLS[p.id]);
      this.spells.cast(id, k.x, k.z, b.x, b.z);
      this.say(t('spl.' + id), new THREE.Vector3(b.x, 0, b.z));
      b.t = 0; p.atk = 1.4;
      return;
    }
    // a move when it's ready and he's in range
    const ready = BOSSES[p.id].moves.find((m) => p.cds[m] <= 0);
    if (ready && d < 6.5 && this.time > 4) { p.cds[ready] = MOVE_CD[ready] * 1.4; this.special(ready, b); return; }
    p.atk -= dt;
    if (d < this.reach * 0.85 && p.atk <= 0) { p.atk = this.rng.range(1.6, 2.6); p.swinging = true; p.struck = false; b.t = 0; return; }
    // close in (around the furniture)
    const want = d > 2.4 ? 1 : d < 1.6 ? -0.5 : 0;
    const sp = BOSSES[p.id].speed * 0.75;
    b.vx += ((dx / d) * want * sp - b.vx) * Math.min(1, dt * 6);
    b.vz += ((dz / d) * want * sp - b.vz) * Math.min(1, dt * 6);
  }

  // ---------------------------------------------------------------- Artem (Kirill's friend)

  /** once, when Kirill is in trouble, Artem runs in: a coffee, a shield, a pep talk */
  private artemTick(dt: number) {
    const k = this.kirill;
    if (this.setup.artem && !this.artemUsed && k.hp > 0 && k.hp < k.maxHp * 0.35) {
      this.artemUsed = true;
      const rig = makeCharacter('artem');
      const a = this.rng.range(0, Math.PI * 2);
      const p = { x: k.x + Math.sin(a) * 6, z: k.z + Math.cos(a) * 6 };
      this.grid.resolve(p, 0.4);
      rig.root.position.set(p.x, 0, p.z);
      this.root.add(rig.root);
      this.artem = { rig, x: p.x, z: p.z, t: 0, done: false, helped: false };
      this.say(t('artem.arrive'), new THREE.Vector3(p.x, 0, p.z));
      voice.play('artem_line');
    }
    const ar = this.artem;
    if (!ar || ar.done) return;
    ar.t += dt;
    const dx = k.x - ar.x, dz = k.z - ar.z, d = Math.hypot(dx, dz) || 1;
    if (ar.t < 4 && d > 1.4) {
      const p = { x: ar.x + (dx / d) * 6 * dt, z: ar.z + (dz / d) * 6 * dt };
      this.grid.resolve(p, 0.4);
      ar.x = p.x; ar.z = p.z;
      ar.rig.pose = 'run';
    } else if (ar.t < 6) {
      ar.rig.pose = 'cheer';
      if (!ar.helped) {
        // the help (once): a coffee, a moment of cover, a few words
        ar.helped = true;
        this.estus++;
        k.hp = Math.min(k.maxHp, k.hp + k.maxHp * 0.2);
        k.iframes = 1.5;
        this.fx.ring(k.x, k.z, 0.3, 2, 0.6, 0x6fb7e8, 0.9);
        this.fx.popup(k.x, 2.8, k.z, '☕ +1', 'skill');
        this.say(t('artem.help'), new THREE.Vector3(ar.x, 0, ar.z));
        this.say(t('artem.thanks'), undefined, true);
      }
    } else {
      ar.done = true;
      this.root.remove(ar.rig.root);
      this.fx.burst(ar.x, ar.z, 0x6fb7e8, 8);
      return;
    }
    ar.rig.faceTowards(Math.atan2(dx, dz), dt, 10);
    ar.rig.update(dt, 2);
    ar.rig.root.position.set(ar.x, 0, ar.z);
  }

  private hurtBoss(dmg: number) {
    const b = this.boss;
    const v = dmg * (this.shield > 0 ? 0.5 : 1);
    b.hp = Math.max(0, b.hp - v);
    b.rig.hurt();
    this.fx.burst(b.x, b.z, 0xffd27a, 6, 1.4);
    this.shake = Math.max(this.shake, 0.18);
    this.hitChain = 0;
    sfx.hurt();
    // heavy hits stagger you out of light attacks
    if (v >= 12 && this.bs !== 'heavy' && this.bs !== 'roll') { this.bs = 'hit'; b.t = 0; }
  }

  // ---------------------------------------------------------------- movement, view

  private move(f: Body, dt: number, r: number) {
    const p = { x: f.x + f.vx * dt, z: f.z + f.vz * dt };
    this.grid.resolve(p, r);
    f.x = p.x; f.z = p.z;
    // keep the two apart
    const o = f === this.boss ? this.kirill : this.boss;
    const dx = f.x - o.x, dz = f.z - o.z, d = Math.hypot(dx, dz), min = this.bodyR + 0.7;
    if (d < min && d > 1e-4) { f.x += (dx / d) * (min - d) * 0.5; f.z += (dz / d) * (min - d) * 0.5; }
  }

  private animate(dt: number) {
    this.life?.update(dt);
    this.kMark.update(this.kirill.x, this.kirill.z, this.time);
    const b = this.boss, k = this.kirill;
    // the partner
    const pt = this.partner;
    if (pt) {
      const pb = pt.body, pm = Math.hypot(pb.vx, pb.vz);
      this.move(pb, dt, this.bodyR * 0.8);
      pb.rig.pose = pt.down ? 'stun' : pt.swinging ? (pb.t < 0.4 ? 'stance' : 'hook') : pm > 0.4 ? 'run' : 'stance';
      pb.rig.update(dt, pm / 2.6);
      pb.holder.position.set(pb.x, 0, pb.z);
      pb.holder.rotation.set(pt.down ? -1.2 : pm * 0.012, pb.yaw, this.bank(pb, dt), 'YXZ');
    }
    // the boss
    const bm = Math.hypot(b.vx, b.vz);
    const bPose: Pose = this.bs === 'dead' ? 'stun' : this.bs === 'hit' ? 'hit' : this.bs === 'light' ? (b.t < LIGHT[this.combo].w ? 'stance' : LIGHT[this.combo].pose)
      : this.bs === 'heavy' ? (b.t < HEAVY.w ? 'crouch' : 'uppercut') : this.bs === 'roll' ? 'crouch' : this.bs === 'special' ? 'special'
        : this.outro > 0 ? (this.won ? 'cheer' : 'stun') : bm > 0.5 ? 'run' : 'stance';
    b.rig.pose = bPose;
    b.rig.update(dt, bm / 2.6);
    const rise = this.phase2 ? (this.bs === 'special' && b.t < 0 ? Math.min(2.4, (b.t + 2.2) * 2) : 0.55 + Math.sin(this.time * 1.6) * 0.15) : 0;
    b.holder.position.set(b.x, rise, b.z);
    b.holder.rotation.set(this.bs === 'roll' ? Math.sin((b.t / ROLL.dur) * Math.PI) * 0.9 : bm * 0.012, b.yaw, this.bank(b, dt), 'YXZ');
    b.holder.visible = b.iframes <= 0 || Math.floor(b.iframes * 30) % 2 === 0 || this.bs === 'roll';
    // Kirill
    const km = Math.hypot(k.vx, k.vz);
    const kPose: Pose = this.ks === 'dead' ? 'stun' : this.kDance > 0 ? 'dance' : this.ks === 'stun' ? 'stun' : this.ks === 'hit' ? 'hit' : this.ks === 'slash' ? (k.t < 0.2 ? 'stance' : 'punch')
      : this.ks === 'beam' ? 'throw' : this.ks === 'drink' ? 'talk' : this.ks === 'roll' ? 'crouch' : this.outro > 0 ? (this.won ? 'stun' : 'cheer') : km > 0.5 ? 'run' : 'stance';
    k.rig.pose = kPose;
    k.rig.update(dt, km / 2.6);
    k.holder.position.set(k.x, 0, k.z);
    const fall = this.ks === 'dead' ? Math.min(1, k.t * 2) * 1.5 : 0;
    k.holder.rotation.set(this.ks === 'roll' ? Math.sin((k.t / 0.4) * Math.PI) * 0.9 : -fall + km * 0.012, k.yaw, this.bank(k, dt), 'YXZ');
  }

  /** lean into turns: roll proportional to how fast the heading changes while moving */
  private banks = new Map<Body, { yaw: number; roll: number }>();
  private bank(f: Body, dt: number) {
    const st = this.banks.get(f) ?? { yaw: f.yaw, roll: 0 };
    let dy = f.yaw - st.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    st.yaw = f.yaw;
    const speed = Math.min(1, Math.hypot(f.vx, f.vz) / 4);
    const want = dt > 0 ? clamp((-dy / dt) * 0.05 * speed, -0.25, 0.25) : 0;
    st.roll += (want - st.roll) * Math.min(1, dt * 8);
    this.banks.set(f, st);
    return st.roll;
  }

  private say(text: string, at?: THREE.Vector3, hero = false) {
    const who = hero ? this.kirill : this.boss;
    this.fx.say(hero ? 'k' : 'b', () => at ?? new THREE.Vector3(who.x, 0, who.z), text, 1.8, hero ? 2.4 : 3.0, hero ? 'hero' : '');
  }

  private flashText(text: string) {
    const c = this.hud.querySelector('.bs-center') as HTMLElement;
    c.innerHTML = `<div class="ar-flash">${text}</div>`;
    setTimeout(() => { if (c.firstElementChild?.textContent === text) c.innerHTML = ''; }, 1000);
  }

  // ---------------------------------------------------------------- He Returns

  /** a learned attack: he reads the wind-up and rolls clear (if he has the legs for it) */
  private seesItComing(id: string) {
    const k = this.kirill;
    if (!this.learned.has(id) || this.ks === 'dead' || k.stam < 20 || this.kRollCd > 0 || !this.rng.chance(0.7)) return;
    const b = this.boss, dx = k.x - b.x, dz = k.z - b.z, d = Math.hypot(dx, dz) || 1;
    const side = this.rng.chance(0.5) ? 1 : -1;
    this.ks = 'idle';
    this.kRoll(dx / d * 0.6 - dz / d * side, dz / d * 0.6 + dx / d * side);
    k.iframes = 0.6;
    this.say(t('mh.seen' + this.rng.int(0, 2)), undefined, true);
  }

  /** he's down, but not out: the world slows, he talks, you answer */
  private heroFalls() {
    const k = this.kirill;
    this.endAim();
    this.clearBeam();
    this.ks = 'dead'; k.t = 0;
    k.vx = k.vz = 0;
    this.slowmo = 0;
    voice.play('kirill_hurt');
    sfx.debt();
    music.start(0.3, 'lament');
    const el = document.createElement('div');
    el.className = 'mh-talk';
    this.hud.appendChild(el);
    this.mh = { t: 0, phase: 'fall', el, choice: null };
  }

  private mhTick(dt: number) {
    const m = this.mh!;
    m.t += dt;
    this.animate(dt * 0.4);
    this.fx.update(dt * 0.4);
    if (m.phase === 'fall' && m.t > 1.6) {
      m.phase = 'talk'; m.t = 0;
      const n = this.attempt;
      m.el.innerHTML = `<div class="mh-card">
        <div class="mh-who">${t('hud.kirill')} <small>${t('mh.tries', { n, t: this.tries })}</small></div>
        <div class="mh-line">${t('mh.k' + Math.min(2, n), { boss: t('boss.name.' + this.bossId) })}</div>
        <div class="mh-choices">
          <button class="mh-c cruel" data-c="cruel"><b>1</b> ${t('mh.cruel' + Math.min(2, n))}</button>
          <button class="mh-c kind" data-c="kind"><b>2</b> ${t('mh.kind' + Math.min(2, n))}</button>
        </div></div>`;
      m.el.querySelectorAll<HTMLElement>('[data-c]').forEach((btn) => btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.answer(btn.dataset.c as 'cruel' | 'kind'); }));
      sfx.piano(64);
    } else if (m.phase === 'talk') {
      if (this.input.hit('1')) this.answer('cruel');
      else if (this.input.hit('2')) this.answer('kind');
      else if (this.autopilot && m.t > 0.5) this.answer(this.rng.chance(0.5) ? 'cruel' : 'kind');
    } else if (m.phase === 'reply' && m.t > 2.4) {
      this.heroRises();
    }
  }

  private answer(c: 'cruel' | 'kind') {
    const m = this.mh;
    if (!m || m.phase !== 'talk') return;
    m.choice = c;
    m.phase = 'reply'; m.t = 0;
    fate[c]++;
    const n = Math.min(2, this.attempt);
    m.el.innerHTML = `<div class="mh-card"><div class="mh-who">${t('hud.kirill')}</div><div class="mh-line">${t((c === 'cruel' ? 'mh.rc' : 'mh.rk') + n)}</div></div>`;
    sfx.piano(c === 'cruel' ? 57 : 69);
  }

  /** he gets up: full health, a little stronger, and he remembers what got him */
  private heroRises() {
    const m = this.mh!, k = this.kirill, b = this.boss;
    m.el.remove();
    this.mh = null;
    // what hurt him most this life
    let top = '', most = 0;
    for (const [s, d] of Object.entries(this.dmgBy)) if (d > most && !this.learned.has(s)) { most = d; top = s; }
    this.dmgBy = {};
    if (top) this.learned.add(top);
    if (top === 'light' || top === 'heavy') this.kRollSkill = Math.min(0.9, this.kRollSkill + 0.2);
    this.attempt++;
    // cruel words make him angry (hits harder); kind ones steady him (one more coffee)
    this.kPower *= m.choice === 'cruel' ? 1.14 : 1.06;
    this.estus = 2 + Math.floor((this.setup.level ?? 1) / 3) + (m.choice === 'kind' ? 1 : 0);
    k.maxHp = Math.round(this.kBaseHp * (1 + 0.08 * (this.attempt - 1)));
    k.hp = k.maxHp;
    k.stam = 100;
    const p = { ...this.kStart };
    this.grid.resolve(p, 0.4);
    k.x = p.x; k.z = p.z; k.vx = k.vz = 0;
    k.iframes = 2.2;
    this.ks = 'idle'; k.t = 0;
    this.kSlow = this.kBlind = this.kDrowsy = 0;
    // you catch your breath too
    b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.15);
    for (const mm of this.minions) mm.alive = false;
    this.fx.ring(k.x, k.z, 0.3, 4, 0.8, 0x9ff6ff, 0.95);
    this.pillar(k.x, k.z, 1.2, 1.2);
    sfx.rise(); sfx.bell(73);
    music.start(0.8, 'boss');
    const label = !top ? '' : (this.def.moves as string[]).includes(top) ? t('mv.' + top) : t('sp.' + top) !== 'sp.' + top ? t('sp.' + top) : t('mh.src.' + top);
    const c = this.hud.querySelector('.bs-center') as HTMLElement;
    c.innerHTML = `<div class="bs-spellcast mh-rise" style="--sc:#9ff6ff"><small>${t('mh.tries', { n: this.attempt, t: this.tries })}</small><b>${t('mh.title')}</b>${label ? `<i>${t('mh.remembers', { m: label })}</i>` : ''}</div>`;
    setTimeout(() => { if (c.querySelector('.mh-rise')) c.innerHTML = ''; }, 3200);
    this.say(t(m.choice === 'cruel' ? 'mh.backCruel' : 'mh.backKind'), undefined, true);
  }

  private finish(kirillDown: boolean, bell = false) {
    if (this.outro > 0 || this.finished) return;
    this.won = kirillDown;
    this.outro = 3.6;
    this.slowmo = 1.4;
    this.clearBeam();
    if (kirillDown) { this.ks = 'dead'; this.kirill.t = 0; voice.play('kirill_debt'); } else { this.bs = 'dead'; voice.play('kirill_pass'); }
    // the souls screen, reversed: his death is your win
    const s = this.hud.querySelector('.souls') as HTMLElement;
    s.className = 'souls ' + (kirillDown ? 'won' : 'died');
    (s.querySelector('.souls-text') as HTMLElement).textContent = t(kirillDown ? 'bs.felled' : bell ? 'bs.bell' : 'bs.youDied');
    (s.querySelector('.souls-sub') as HTMLElement).textContent = t(kirillDown ? 'bs.felledSub' : 'bs.youDiedSub');
    if (kirillDown) sfx.debt(); else sfx.levelUp();
  }

  private exit() {
    this.finished = true;
    const k = this.kirill, b = this.boss;
    const score = Math.round((this.won ? 4000 : 0) + this.hits * 40 + (b.hp / b.maxHp) * 1500 + (1 - k.hp / k.maxHp) * 1000);
    const detail = this.won ? t('bs.endWon', { s: Math.round(this.time), hp: Math.round((b.hp / b.maxHp) * 100) }) : t('bs.endLost', { hp: Math.round((k.hp / k.maxHp) * 100) });
    this.ctx.onExit({ mode: 'boss', win: this.won, score, detail, progress: 1 - k.hp / k.maxHp });
  }

  render() {
    if (this.finished) return;
    const b = this.boss, k = this.kirill;
    // third-person: behind you, lock-on frames both of you
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    const want = this.camDist;
    let dist = want;
    for (let s = 0.6; s <= want; s += 0.25) if (this.grid.blocked(b.x - fx * s, b.z - fz * s)) { dist = Math.max(1.6, s - 0.4); break; }
    const target = new THREE.Vector3(b.x - fx * dist, want * 0.55 + (want - dist) * 0.45, b.z - fz * dist);
    if (this.time < 0) {
      // the opening: a slow low orbit around you, ending behind your shoulder
      const u = 1 - -this.time / 3.6, a = this.camYaw + Math.PI * (1 - u) * 1.1;
      target.set(b.x - Math.sin(a) * (6 + u * 3.5), 1.6 + u * 3.6, b.z - Math.cos(a) * (6 + u * 3.5));
      this.camPos.copy(target);
    }
    // aiming: up and back, looking down at the circle; the cast: a low side-on shot of where it lands
    const spot = this.aiming ? this.aim : this.castCine > 0 || (this.ultCine > 0 && this.ultCine <= 1.0) ? this.castAt : null;
    if (this.ultCine > 1.0) {
      // the ultimate: low, circling you as you call it
      const a = this.camYaw + Math.PI * 0.75 + (2.6 - this.ultCine) * 0.9, r = this.camDist * 0.75;
      target.set(b.x + Math.sin(a) * r, 1.6 + (2.6 - this.ultCine) * 0.8, b.z + Math.cos(a) * r);
    } else if (spot) {
      if (this.castCine > 0.55) {
        const ax = spot.x - b.x, az = spot.z - b.z, al = Math.hypot(ax, az) || 1;
        target.set(spot.x - (az / al) * 9 - (ax / al) * 3, 3.2, spot.z + (ax / al) * 9 - (az / al) * 3);
      } else target.set(b.x - fx * dist * 0.7, want * 1.3 + 2, b.z - fz * dist * 0.7);
    }
    if (this.camPos.lengthSq() === 0) this.camPos.copy(target);
    this.camPos.lerp(target, 0.15);
    const sh = this.shake;
    this.shake *= 0.86;
    this.cam.position.set(this.camPos.x + (Math.random() - 0.5) * sh, this.camPos.y + (Math.random() - 0.5) * sh, this.camPos.z + (Math.random() - 0.5) * sh);
    const look = this.time < 0 ? new THREE.Vector3(b.x, 2.6, b.z)
      : this.lock ? new THREE.Vector3((b.x + k.x) / 2, 2.0, (b.z + k.z) / 2) : new THREE.Vector3(b.x + fx * 3, 2.0, b.z + fz * 3);
    if (this.outro > 0) look.set(this.won ? k.x : b.x, 1.0, this.won ? k.z : b.z);
    if (this.ultCine > 1.0 && this.outro <= 0) look.set(b.x, 2.4 * (this.camDist / 11), b.z);
    else if (spot && this.outro <= 0) look.set(this.castCine > 0.55 ? spot.x : (b.x + spot.x * 2) / 3, this.castCine > 0.55 ? 1.6 : 0.5, this.castCine > 0.55 ? spot.z : (b.z + spot.z * 2) / 3);
    // the look point eases too (cuts to the spell and back don't snap)
    if (this.lookPos.lengthSq() === 0 || this.time < 0) this.lookPos.copy(look); else this.lookPos.lerp(look, spot || this.castCine > 0 || this.ultCine > 0 ? 0.12 : 0.35);
    this.cam.lookAt(this.lookPos);
    // HUD
    const q = (s: string) => this.hud.querySelector(s) as HTMLElement;
    const kp = (k.hp / k.maxHp) * 100, bp = (b.hp / b.maxHp) * 100;
    q('.bs-kirill .hp .fill').style.width = `${kp}%`;
    ghost(q('.bs-kirill .hp .ghost'), kp);
    q('.bs-kirill .st .fill').style.width = `${k.stam}%`;
    // his coffee flasks and what's on him (drawn icons; rebuilt only when it changes)
    const est = `${this.estus}${this.kSlow > 0 ? 's' : ''}${this.kBlind > 0 ? 'b' : ''}${this.kDrowsy > 0 ? 'd' : ''}`;
    const estEl = q('.bs-estus');
    if (estEl.dataset.v !== est) {
      estEl.dataset.v = est;
      estEl.innerHTML = Array.from({ length: Math.max(0, this.estus) }, () => `<span class="flask">${icon('coffee')}</span>`).join('')
        + (this.kSlow > 0 ? `<span class="st">${icon('snail')}</span>` : '') + (this.kBlind > 0 ? `<span class="st">${icon('dizzy')}</span>` : '') + (this.kDrowsy > 0 ? `<span class="st">${icon('zzz')}</span>` : '');
    }
    q('.bs-boss .hp .fill').style.width = `${bp}%`;
    ghost(q('.bs-boss .hp .ghost'), bp);
    q('.bs-boss .st .fill').style.width = `${b.stam}%`;
    q('.bs-boss').classList.toggle('shielded', this.shield > 0);
    if (this.partner) {
      const pp = (this.partner.body.hp / this.partner.body.maxHp) * 100;
      q('.bs-partner .fill').style.width = `${pp}%`;
      ghost(q('.bs-partner .ghost'), pp);
    }
    const tr = `${this.attempt}/${this.tries}`;
    const trEl = q('.bs-tries');
    if (trEl.dataset.v !== tr) {
      trEl.dataset.v = tr;
      trEl.innerHTML = this.tries > 1 ? `<span>${t('mh.lives')}</span>` + Array.from({ length: this.tries }, (_, i) => `<i class="${i < this.attempt - 1 ? 'spent' : ''}">${icon('heart')}</i>`).join('') : '';
    }
    const tm = this.time < 0 ? '' : String(Math.max(0, Math.ceil(FIGHT_SEC + TRY_SEC * (this.tries - 1) - this.time)));
    const tmEl = q('.bs-timer');
    if (tmEl.dataset.v !== tm) { tmEl.dataset.v = tm; tmEl.innerHTML = tm ? `${icon('bell')}${tm}` : ''; }
    q('.bs-lock').classList.toggle('off', !this.lock);
    const next = this.summons[this.waveI % Math.max(1, this.summons.length)];
    q('.bs-wave .fill').style.width = `${Math.max(0, 1 - this.waveT / 10) * 100}%`;
    const wv = next ? `${next.card}${Math.max(0, Math.ceil(this.waveT))}` : '';
    const wvEl = q('.bs-wave b');
    if (wvEl.dataset.v !== wv) { wvEl.dataset.v = wv; wvEl.innerHTML = next ? `${iconHtml(CARDS[next.card].icon)} ${Math.max(0, Math.ceil(this.waveT))}` : ''; }
    const ue = q('.bs-ult');
    ue.classList.toggle('ready', this.ult >= 100);
    (ue.querySelector('.ultbar i') as HTMLElement).style.width = `${this.ult}%`;
    const up = this.ult >= 100 ? t('bs.ready') : `${Math.floor(this.ult)}%`;
    const upEl = ue.querySelector('.pct') as HTMLElement;
    if (upEl.textContent !== up) upEl.textContent = up;
    for (const el of this.hud.querySelectorAll<HTMLElement>('.bs-mv')) {
      const cd = this.cds[el.dataset.mv!];
      el.classList.toggle('cooling', cd > 0);
      // the cooldown sweeps round the slot like a clock hand
      const id = el.dataset.mv!;
      const full = (this.spellIds as string[]).includes(id) ? SPELL_CD * (this.phase2 ? 0.7 : 1) : MOVE_CD[id as MoveId] ?? 1;
      el.style.setProperty('--p', cd > 0 ? Math.min(1, cd / full).toFixed(3) : '0');
      const txt = cd > 0 ? cd.toFixed(0) : '';
      const cdEl = el.querySelector('.cd') as HTMLElement;
      if (cdEl.textContent !== txt) cdEl.textContent = txt;
    }
  }

  /** tests: a boss that plays itself */
  private bot() {
    const b = this.boss, k = this.kirill;
    const d = Math.hypot(k.x - b.x, k.z - b.z);
    const r = this.rng.next();
    const kThreat = this.ks === 'slash' && k.t < 0.2 && d < 2.6;
    return {
      fwd: d > 1.9 ? 1 : 0, side: 0,
      light: d < 2.4 && r < 0.5,
      heavy: d < 2.6 && r > 0.97,
      roll: kThreat && r < 0.5,
      mv: this.cds[this.def.moves[0]] <= 0 && d < 5 ? 0 : this.cds[this.def.moves[1]] <= 0 && d < 6 ? 1 : null,
      sprint: d > 6,
    };
  }

  /** for tests */
  get state() { return { bossHp: this.boss.hp, kirillHp: this.kirill.hp, hits: this.hits, estus: this.estus, minions: this.minions.length, kx: this.kirill.x, kz: this.kirill.z, bx: this.boss.x, bz: this.boss.z, ks: this.ks, attempt: this.attempt, learned: [...this.learned] }; }
  get inputs() { return this.input; }

  dispose() {
    this.input.dispose();
    this.spells.dispose();
    this.mh?.el.remove();
    this.hud.remove();
    this.fx.clear();
    this.stage.clearWorld();
    if (this.stage.override?.camera === this.cam) this.stage.override = null;
    this.stage.scene.background = new THREE.Color(0x1d1a22);
    this.stage.setLighting('golden');
    this.stage.scene.fog = null;
    this.stage.post.resetLook();
  }
}

// ---------------------------------------------------------------- helpers

function turnTo(a: number, b: number, step: number) {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + clamp(d, -step, step);
}

function ghost(el: HTMLElement, pct: number) {
  const cur = parseFloat(el.style.width) || 100;
  el.style.width = `${Math.max(pct, cur - 0.4)}%`;
}

/** a horde unit's model, bigger, for the arena */
function unitObject(kind: string) {
  const model = buildUnitModel(kind as UnitKind);
  const g = new THREE.Group();
  for (const p of model.parts) { const m = new THREE.Mesh(p.geom, p.mat); m.castShadow = true; m.position.y = model.lift; g.add(m); }
  const ol = new THREE.Mesh(model.outline, outlineMaterial(0.02));
  ol.position.y = model.lift;
  g.add(ol);
  g.scale.setScalar(1.35);
  return g;
}
