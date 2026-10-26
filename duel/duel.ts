import * as THREE from 'three';
import { Person, type PersonLook, type Pose } from '../hero/person';
import { PLACEHOLDER_LOOKS } from '../hero/look';
import { sfx } from '../core/audio';
import { el } from '../ui/dom';
import { t } from '../i18n';
import type { Stage } from '../render/stage';
import balance from '../data/balance.json';
import { bindKeyButtons } from '../arcade/common';
import { makeCharacter, BoneRig } from '../assets';
import { announce } from '../ui/juice';
import { music, juice } from '../core/audio';

// Side-view fighting duel, best of three. Combos, launchers, highs/lows, blocks.

export type DuelFoe = 'nina' | 'dean' | 'finalExam' | 'romchik' | 'sonya' | 'masha';

export interface DuelSpec {
  foe: DuelFoe;
  kirillLook: PersonLook;
  /** Kirill's health each round (0..1): the horde phase wears him down */
  kirillHp: number;
  /** Kirill's damage multiplier (he levelled up during the semester) */
  kirillPower: number;
  onDone: (win: boolean) => void;
  /** arcade ladder: how sharp Kirill's AI is (1 = story duels) */
  aiLevel?: number;
  /** arcade: name over Kirill's bar and the end banners */
  kirillName?: string;
  victoryText?: string;
  defeatText?: string;
  /** local 2-player: Kirill is player 2 on the arrow keys + , . / Enter */
  versus?: boolean;
}

/** which keys drive a fighter; 'c:' entries are physical key codes (layout independent) */
interface KeyMap { l: string[]; r: string[]; up: string[]; down: string[]; block: string[]; j: string[]; k: string[]; sp: string[] }
const SOLO: KeyMap = { l: ['a', 'arrowleft'], r: ['d', 'arrowright'], up: ['w', 'arrowup'], down: ['s', 'arrowdown'], block: ['l', 'shift'], j: ['j'], k: ['k'], sp: [' ', 'i'] };
const P1: KeyMap = { l: ['a'], r: ['d'], up: ['w'], down: ['s'], block: ['l'], j: ['j'], k: ['k'], sp: [' ', 'i'] };
const P2: KeyMap = {
  l: ['arrowleft'], r: ['arrowright'], up: ['arrowup'], down: ['arrowdown'],
  j: ['c:Comma', 'c:Numpad1'], k: ['c:Period', 'c:Numpad2'], block: ['c:Slash', 'c:Numpad3', 'c:ShiftRight'], sp: ['c:Enter', 'c:NumpadEnter', 'c:Numpad0'],
};

const D = balance.duel;
type Height = 'high' | 'mid' | 'low' | 'air';
type MoveId = 'jab' | 'jab2' | 'hook' | 'kick' | 'spin' | 'roundhouse' | 'dashKick' | 'sweep' | 'uppercut' | 'airPunch' | 'flyKick' | 'special';
interface Move {
  pose: Pose; windup: number; active: number; recovery: number; range: number; dmg: number; knock: number;
  height?: Height;
  /** pops the target into the air (juggle) */
  launch?: number;
  /** knocks the target down */
  down?: boolean;
  /** lunges forward this far when it comes out */
  dash?: number;
  /** crouching move: the fighter stays low */
  low?: boolean;
  spin?: boolean;
  projectile?: { speed: number; count: number; size: number };
}

const m = (pose: Pose, windup: number, active: number, recovery: number, range: number, dmg: number, knock: number, extra: Partial<Move> = {}): Move =>
  ({ pose, windup, active, recovery, range, dmg, knock, height: 'mid', ...extra });

const MOVES: Record<Exclude<MoveId, 'special'>, Move> = {
  jab: m('punch', 0.07, 0.08, 0.2, D.punch.range, D.punch.dmg - 1, 0.15, { height: 'high' }),
  jab2: m('punch', 0.06, 0.08, 0.22, D.punch.range, D.punch.dmg - 1, 0.15, { height: 'high' }),
  hook: m('hook', 0.1, 0.1, 0.32, D.punch.range + 0.05, D.punch.dmg + 3, 0.75, { height: 'high' }),
  kick: m('kick', D.kick.windup, D.kick.active, D.kick.recovery, D.kick.range, D.kick.dmg, D.kick.knock * 0.5),
  spin: m('spin', 0.14, 0.12, 0.4, D.kick.range + 0.1, D.kick.dmg + 1, 1.0, { spin: true }),
  roundhouse: m('spin', 0.16, 0.12, 0.42, D.kick.range + 0.05, D.kick.dmg + 2, 0.6, { spin: true, down: true }),
  dashKick: m('kick', 0.12, 0.14, 0.36, D.kick.range - 0.1, D.kick.dmg - 1, 0.9, { dash: 1.8 }),
  sweep: m('sweep', 0.12, 0.12, 0.36, D.kick.range - 0.1, D.kick.dmg - 3, 0.25, { height: 'low', down: true, low: true }),
  uppercut: m('uppercut', 0.1, 0.1, 0.34, D.punch.range - 0.05, D.punch.dmg + 3, 0.1, { launch: 9.5 }),
  airPunch: m('punch', 0.05, 0.14, 0.16, D.punch.range, D.punch.dmg + 1, 0.3, { height: 'air' }),
  flyKick: m('airkick', 0.08, 0.22, 0.2, D.kick.range - 0.1, D.kick.dmg - 1, 0.8, { height: 'air' }),
};
/** what each button turns a move into when pressed during its recovery */
const CHAINS: Partial<Record<MoveId, { j?: MoveId; k?: MoveId }>> = {
  jab: { j: 'jab2', k: 'roundhouse' },
  jab2: { j: 'hook', k: 'roundhouse' },
  hook: { k: 'roundhouse' },
  kick: { k: 'spin' },
  uppercut: { j: 'jab', k: 'kick' },
  dashKick: { j: 'jab' },
};
const SPECIALS: Record<DuelFoe | 'kirill', Move> = {
  // Romchik's zigzag dash that ends in a party grab
  romchik: { pose: 'kick', ...D.specials.romchik, dash: 2.6, down: true },
  nina: { pose: 'special', ...D.specials.nina, projectile: { speed: 8, count: 1, size: 0.34 } },
  dean: { pose: 'special', ...D.specials.dean, down: true },
  finalExam: { pose: 'special', ...D.specials.finalExam, projectile: { speed: 7, count: 3, size: 0.26 } },
  kirill: { pose: 'special', ...D.specials.kirill, projectile: { speed: 13, count: 1, size: 0.16 } },
  // Sonya's selfie stick lunge and Masha's camera flash (a wide, slow burst)
  sonya: { pose: 'special', ...D.specials.romchik, dash: 2.0 },
  masha: { pose: 'special', ...D.specials.finalExam, projectile: { speed: 9, count: 3, size: 0.3 } },
};


type State = 'idle' | 'walk' | 'crouch' | 'jump' | 'dash' | 'attack' | 'block' | 'hit' | 'down' | 'ko';

/** one frame of intent, from the keyboard or from Kirill's AI */
interface Ctl { dir: number; down: boolean; block: boolean; jump: boolean; j: boolean; k: boolean; special: boolean; dash: number }

class Fighter {
  person: Person | BoneRig;
  x: number;
  y = 0;
  vy = 0;
  facing = 1;
  hp = 100;
  maxHp = 100;
  state: State = 'idle';
  t = 0;
  move: Move | null = null;
  moveId: MoveId | null = null;
  struck = false;
  special = 0;
  vx = 0;
  fall = 0;
  crouching = false;
  iframes = 0;
  airAttack = false;
  /** popped up by a launcher: falls to a knockdown */
  juggled = false;
  buffer: { b: 'j' | 'k'; t: number } | null = null;
  /** hits taken in the current combo (damage scales down, the counter shows it) */
  hitsTaken = 0;
  sinceHit = 0;
  squash = 1;
  constructor(body: Person | BoneRig, x: number, public scale: number, public name: string, public isKirill: boolean) {
    this.person = body;
    this.person.snap = 26;
    this.person.stars.visible = false;
    this.person.root.traverse((o) => {
      const mm = o as THREE.Mesh;
      if (mm.isMesh) mm.castShadow = true;
    });
    this.person.root.scale.multiplyScalar(scale);
    this.x = x;
  }
  get busy() { return this.state === 'attack' || this.state === 'hit' || this.state === 'ko' || this.state === 'down' || this.state === 'dash'; }
  get air() { return this.y > 0.001 || this.vy > 0; }
  /** low profile: high attacks and most projectiles pass over */
  get low() { return this.crouching || (this.state === 'attack' && !!this.move?.low) || this.state === 'down'; }
  start(id: MoveId, move: Move) {
    this.state = 'attack';
    this.move = move;
    this.moveId = id;
    this.t = 0;
    this.struck = false;
    this.buffer = null;
    if (this.air) this.airAttack = true;
  }
  /** attack phase: 0 windup, 1 active, 2 recovery, 3 done */
  phase() {
    if (!this.move) return 3;
    const mv = this.move;
    return this.t < mv.windup ? 0 : this.t < mv.windup + mv.active ? 1 : this.t < mv.windup + mv.active + mv.recovery ? 2 : 3;
  }
  pose(): Pose {
    switch (this.state) {
      case 'walk': case 'dash': return 'walk';
      case 'jump': return 'jump';
      case 'crouch': return 'crouch';
      case 'attack': return this.phase() === 0 && this.moveId !== 'special' ? (this.air ? 'jump' : this.move!.low ? 'crouch' : 'stance') : this.move!.pose;
      case 'block': return this.crouching ? 'crouch' : 'block';
      case 'hit': return 'hit';
      case 'down': case 'ko': return 'stun';
      default: return 'stance';
    }
  }
  sync(dt: number) {
    const r = this.person.root;
    this.person.pose = this.pose();
    this.person.update(dt, Math.abs(this.vx));
    r.position.set(this.x, this.y, 0);
    r.rotation.set(0, this.facing > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
    // spinning kicks turn the whole body once
    if (this.state === 'attack' && this.move?.spin) r.rotation.y += Math.min(1, this.t / (this.move.windup + this.move.active)) * Math.PI * 2;
    // crouching squashes the silhouette
    const sy = this.low && this.state !== 'down' ? 0.7 : 1;
    this.squash += (sy - this.squash) * Math.min(1, dt * 22);
    r.scale.set(this.scale, this.scale * this.squash, this.scale);
    // knocked down / out: topple backwards
    const lying = this.state === 'ko' || this.state === 'down' || (this.state === 'hit' && this.juggled);
    this.fall += ((lying ? 1 : 0) - this.fall) * Math.min(1, dt * (lying ? 9 : 6));
    if (this.fall > 0.01) r.rotateX(-this.fall * Math.PI / 2 * (this.state === 'hit' ? 0.6 : 1));
    // flicker while invulnerable (wake-up, dash)
    r.visible = this.iframes <= 0 || Math.floor(this.iframes * 30) % 2 === 0;
  }
}

interface Projectile { mesh: THREE.Mesh; x: number; y: number; vx: number; vy: number; owner: Fighter; move: Move; life: number }
interface Spark { mesh: THREE.Mesh; vx: number; vy: number; life: number }
type AiStep = { b: 'j' | 'k'; down?: boolean; fwd?: boolean; jump?: boolean };

/** Kirill's combo book; longer strings unlock as his AI level rises */
const AI_COMBOS: AiStep[][] = [
  [{ b: 'j' }, { b: 'j' }],
  [{ b: 'k' }],
  [{ b: 'k', down: true }],
  [{ b: 'j' }, { b: 'j' }, { b: 'j' }],
  [{ b: 'k' }, { b: 'k' }],
  [{ b: 'j', down: true }, { b: 'j' }],
  [{ b: 'j' }, { b: 'j' }, { b: 'k' }],
  [{ b: 'j', down: true }, { b: 'k' }],
];

interface Mind { think: number; plan: { act: 'walk' | 'back' | 'block' | 'crouch' | 'idle'; t: number }; queue: AiStep[] }
const newMind = (): Mind => ({ think: 0, plan: { act: 'idle', t: 0 }, queue: [] });

const FOE_NAMES: Record<DuelFoe, string> = { nina: 'duel.nina', dean: 'duel.dean', finalExam: 'duel.finalExam', romchik: 'duel.romchik', sonya: 'duel.sonya', masha: 'duel.masha' };
const NO_CTL: Ctl = { dir: 0, down: false, block: false, jump: false, j: false, k: false, special: false, dash: 0 };

export class Duel {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 100);
  player: Fighter;
  kirill: Fighter;
  private projectiles: Projectile[] = [];
  private sparks: Spark[] = [];
  private round = 1;
  private wins = { player: 0, kirill: 0 };
  private phase: 'intro' | 'fight' | 'roundEnd' | 'finish' | 'fatality' | 'done' = 'intro';
  private fatalityT = 0;
  private phaseT = 0;
  private timer = D.roundSec;
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private listeners: [EventTarget, string, EventListener][] = [];
  private hud: HTMLElement;
  private hitStop = 0;
  private slowmo = 0;
  private shake = 0;
  private clock = 0;
  private taps: Record<string, number> = {};
  private kMind = newMind();
  private pMind = newMind();
  /** tests: the player is driven by the same AI as Kirill */
  autoplay = false;
  private comboShow = { left: 0, right: 0 };
  private ghost = { p: 100, k: 100 };
  paused = false;
  done = false;

  constructor(private stage: Stage, private spec: DuelSpec) {
    const foeScale = spec.foe === 'finalExam' ? 1.25 : spec.foe === 'dean' ? 1.08 : 1;
    // bosses with a character model (Nina, Romchik) fight as that model's silhouette
    const boss = makeCharacter(spec.foe);
    const body = boss instanceof BoneRig || boss instanceof Person ? boss : new Person(PLACEHOLDER_LOOKS[spec.foe] ?? PLACEHOLDER_LOOKS.nina);
    this.player = new Fighter(body, -2.6, foeScale, t(FOE_NAMES[spec.foe]), false);
    this.kirill = new Fighter(new Person(spec.kirillLook), 2.6, 1, spec.kirillName ?? t('hud.kirill'), true);
    this.kirill.facing = -1;
    if (spec.foe === 'finalExam') this.addPaperSpikes(this.player);
    this.buildSet();
    this.scene.add(this.player.person.root, this.kirill.person.root);
    this.camera.position.set(0, 1.55, 11.5);
    this.camera.lookAt(0, 1.25, 0);

    this.hud = el(`
      <div class="duel">
        <div class="duel-top">
          <div class="duel-side left"><div class="dn">${this.player.name}</div><div class="dbar"><div class="ghost"></div><div class="fill"></div></div><div class="pips"><i></i><i></i></div></div>
          <div class="duel-timer">${D.roundSec}</div>
          <div class="duel-side right"><div class="dn">${this.kirill.name}</div><div class="dbar"><div class="ghost"></div><div class="fill"></div></div><div class="pips"><i></i><i></i></div></div>
        </div>
        <div class="duel-combo left"></div>
        <div class="duel-combo right"></div>
        <div class="duel-center"></div>
        <div class="duel-bottom">
          <div class="sp"><span>${t('duel.special')}</span><div class="spbar"><div class="fill"></div></div></div>
          <div class="duel-pad${spec.versus ? ' hidden' : ''}">
            <b data-key="a" data-hold>◀</b><b data-key="w">▲ ${t('duel.b.jump')}</b><b data-key="s" data-hold>▼ ${t('duel.b.crouch')}</b><b data-key="d" data-hold>▶</b>
            <b data-key="j" class="atk">J ${t('duel.b.punch')}</b><b data-key="k" class="atk">K ${t('duel.b.kick')}</b><b data-key="l" data-hold>L ${t('duel.b.block')}</b><b data-key=" " class="sp-b">␣ ${t('duel.special')}</b>
          </div>
          <div class="duel-keys">${t(spec.versus ? 'vs.keys' : 'duel.keys')}</div>
          <div class="duel-keys moves">${t('duel.moves')}</div>
        </div>
      </div>`);
    document.getElementById('ui')!.appendChild(this.hud);
    // the pad: ◀/▶ taps also count toward the double-tap dash, like keys
    bindKeyButtons(this.hud, (k) => this.pressed.add(k), (k, on) => { if (on) this.keys.add(k); else this.keys.delete(k); });
    this.bind();
    stage.override = { scene: this.scene, camera: this.camera };
    this.resetRound();
    this.banner(t('duel.round', { n: this.round }), 'round');
    sfx.whistle();
  }

  // ---------------------------------------------------------------- set dressing

  private embers: THREE.Points | null = null;
  private torches: THREE.PointLight[] = [];

  /** A Mortal Kombat-style stage: a painted location far behind, a glossy stone floor with the
   * university crest, torches, coloured rim lights on the fighters, embers rising, fog. */
  private buildSet() {
    const pal = PALETTE[this.spec.foe];
    const tex = new THREE.CanvasTexture(backdrop(this.spec.foe));
    tex.colorSpace = THREE.SRGBColorSpace;
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(60, 26), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: 0xb0a0a0 }));
    bg.position.set(0, 7, -16);
    const floorTex = new THREE.CanvasTexture(arenaFloor(pal.rim));
    floorTex.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.32, metalness: 0.25 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -2);
    floor.receiveShadow = true;
    this.scene.add(bg, floor);
    // pillars with torches at the sides
    for (const sx of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 7, 1.1), new THREE.MeshStandardMaterial({ color: 0x3a3440, roughness: 0.8 }));
      pillar.position.set(sx * 7.5, 3.5, -4);
      pillar.castShadow = pillar.receiveShadow = true;
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.8, 8), new THREE.MeshBasicMaterial({ color: 0xffa040, toneMapped: false }));
      flame.position.set(sx * 7.5, 4.6, -3.3);
      const light = new THREE.PointLight(0xff8a3a, 25, 14, 1.6);
      light.position.set(sx * 7.5, 4.8, -3);
      this.torches.push(light);
      this.scene.add(pillar, flame, light);
    }
    // lighting: dim ambient, a warm key from above the camera, coloured rims from behind
    this.scene.add(new THREE.HemisphereLight(0xb8a8d8, 0x201018, 0.55));
    const key = new THREE.SpotLight(0xfff0dc, 140, 40, 0.55, 0.45, 1.3);
    key.position.set(0, 9, 8);
    key.target.position.set(0, 1, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0005;
    this.scene.add(key, key.target);
    for (const [sx, col] of [[-1, pal.rim], [1, pal.rim2]] as [number, number][]) {
      const rim = new THREE.SpotLight(col, 120, 30, 0.6, 0.5, 1.2);
      rim.position.set(sx * 5, 6, -7);
      rim.target.position.set(sx * -1.5, 1.2, 0);
      this.scene.add(rim, rim.target);
    }
    // embers drifting up
    const n = 160;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 22; pos[i * 3 + 1] = Math.random() * 8; pos[i * 3 + 2] = -2 - Math.random() * 10; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.embers = new THREE.Points(g, new THREE.PointsMaterial({ color: pal.ember, size: 0.08, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false }));
    this.scene.add(this.embers);
    this.scene.background = new THREE.Color(pal.sky);
    this.scene.fog = new THREE.Fog(pal.sky, 14, 34);
  }

  private addPaperSpikes(f: Fighter) {
    // THE FINAL EXAM: sheets of paper sticking out of its back
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.56, 0.02), new THREE.MeshStandardMaterial({ color: 0xf6f3ea, roughness: 0.9 }));
      s.position.set((Math.random() - 0.5) * 0.5, 1.0 + Math.random() * 0.9, -0.25);
      s.rotation.set(Math.random() - 0.5, Math.random() - 0.5, (Math.random() - 0.5) * 1.6);
      f.person.torso.add(s);
    }
  }

  // ---------------------------------------------------------------- input

  private on(target: EventTarget, type: string, fn: EventListener) {
    target.addEventListener(type, fn);
    this.listeners.push([target, type, fn]);
  }

  private bind() {
    const map: Record<string, string> = { 'ф': 'a', 'в': 'd', 'ц': 'w', 'ы': 's', 'о': 'j', 'л': 'k', 'д': 'l', 'ш': 'i' };
    const key = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); return map[k] ?? k; };
    this.on(window, 'keydown', ((e: KeyboardEvent) => {
      const k = key(e);
      if (k === 'escape') { this.paused = !this.paused; this.banner(this.paused ? t('hud.paused') : '', 'round'); return; }
      if (['a', 'd', 'w', 's', 'j', 'k', 'l', 'i', ' ', 'shift', 'arrowleft', 'arrowright', 'arrowdown', 'arrowup'].includes(k)) e.preventDefault();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      const c = 'c:' + e.code;
      if (['c:Comma', 'c:Period', 'c:Slash', 'c:Enter', 'c:NumpadEnter'].includes(c)) e.preventDefault();
      if (!this.keys.has(c)) this.pressed.add(c);
      this.keys.add(c);
    }) as EventListener);
    this.on(window, 'keyup', ((e: KeyboardEvent) => { this.keys.delete(key(e)); this.keys.delete('c:' + e.code); }) as EventListener);
    this.on(window, 'blur', (() => this.keys.clear()) as EventListener);
    const canvas = this.stage.renderer.domElement;
    this.on(canvas, 'mousedown', ((e: MouseEvent) => {
      sfx.unlock();
      this.pressed.add(e.button === 2 ? 'k' : 'j');
    }) as EventListener);
    this.on(canvas, 'contextmenu', ((e: Event) => e.preventDefault()) as EventListener);
  }

  /** keyboard → intent; a double tap on a direction dashes */
  private playerCtl(m: KeyMap = this.spec.versus ? P1 : SOLO): Ctl {
    const k = this.keys, p = this.pressed;
    const held = (ks: string[]) => ks.some((x) => k.has(x));
    const hit = (ks: string[]) => ks.some((x) => p.has(x));
    let dash = 0;
    for (const [keyName, dir] of [...m.r.map((x) => [x, 1]), ...m.l.map((x) => [x, -1])] as [string, number][]) {
      if (!p.has(keyName)) continue;
      if (this.clock - (this.taps[keyName] ?? -9) < 0.26) { dash = dir; this.taps[keyName] = -9; }
      else this.taps[keyName] = this.clock;
    }
    return {
      dir: (held(m.r) ? 1 : 0) - (held(m.l) ? 1 : 0),
      down: held(m.down),
      block: held(m.block),
      jump: hit(m.up),
      j: hit(m.j), k: hit(m.k),
      special: hit(m.sp),
      dash,
    };
  }

  // ---------------------------------------------------------------- flow

  private resetRound() {
    for (const f of [this.player, this.kirill]) {
      f.state = 'idle'; f.t = 0; f.move = null; f.vx = 0; f.fall = 0; f.y = 0; f.vy = 0;
      f.crouching = false; f.juggled = false; f.iframes = 0; f.buffer = null; f.hitsTaken = 0;
    }
    this.player.x = -2.6; this.kirill.x = 2.6;
    this.player.maxHp = this.spec.foe === 'dean' ? 115 : this.spec.foe === 'finalExam' ? 130 : 100;
    this.player.hp = this.player.maxHp;
    this.kirill.maxHp = 100;
    this.kirill.hp = Math.max(25, 100 * this.spec.kirillHp);
    this.ghost = { p: 100, k: (this.kirill.hp / this.kirill.maxHp) * 100 };
    this.timer = D.roundSec;
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.projectiles = [];
    this.kMind = newMind();
    this.pMind = newMind();
    this.phase = 'intro';
    this.phaseT = 1.6;
  }

  private banner(text: string, cls: string) {
    const c = this.hud.querySelector('.duel-center') as HTMLElement;
    c.innerHTML = '';
    if (!text) return;
    const b = el(`<div class="duel-banner ${cls}"></div>`);
    b.textContent = text;
    c.appendChild(b);
  }

  update(dtReal: number) {
    if (this.done) return;
    if (this.paused) { this.render(0); return; }
    if (this.hitStop > 0) { this.hitStop -= dtReal; this.render(0); return; }
    const scale = this.slowmo > 0 ? 0.3 : 1;
    if (this.slowmo > 0) this.slowmo -= dtReal;
    const dt = dtReal * scale;
    this.clock += dtReal;
    music.start(0.8, 'duel');
    music.set(0.7 + 0.3 * (1 - Math.min(this.player.hp / this.player.maxHp, this.kirill.hp / this.kirill.maxHp)));

    this.phaseT -= dtReal;
    if (this.phase === 'intro') {
      if (this.phaseT < 0.6 && this.phaseT + dtReal >= 0.6) { this.banner(t('duel.fight'), 'fight'); sfx.boom(); }
      if (this.phaseT <= 0) { this.phase = 'fight'; this.banner('', ''); }
    } else if (this.phase === 'fight') {
      this.timer -= dt;
      this.drive(this.player, this.autoplay ? this.aiCtl(dt, this.player, this.kirill, this.pMind, 1, 1) : this.playerCtl(), dt);
      this.drive(this.kirill, this.spec.versus ? this.playerCtl(P2) : this.aiCtl(dt, this.kirill, this.player, this.kMind, this.spec.kirillPower * (this.spec.aiLevel ?? 1), this.spec.aiLevel ?? 1), dt);
      if (this.timer <= 0) this.endRound(this.player.hp / this.player.maxHp >= this.kirill.hp / this.kirill.maxHp ? 'player' : 'kirill', true);
    } else if (this.phase === 'done') {
      if (this.phaseT <= 0) this.finish(this.wins.player >= 2);
    } else if (this.phase === 'finish') {
      // ДОБЕЙ ЕГО!: press an attack to perform the fatality, or let him fall
      if (this.autoplay || this.pressed.has('j') || this.pressed.has('k') || this.pressed.has(' ') || this.pressed.has('c:Comma')) this.fatality();
      else if (this.phaseT <= 0) { this.kirill.state = 'ko'; sfx.boom(); this.phase = 'roundEnd'; this.phaseT = 1.2; }
    } else if (this.phase === 'fatality') {
      this.fatalityT += dtReal;
      if (this.phaseT <= 0) { this.phase = 'roundEnd'; this.phaseT = 0.6; }
    } else if (this.phase === 'roundEnd' && this.phaseT <= 0) {
      if (this.wins.player >= 2 || this.wins.kirill >= 2) {
        this.phase = 'done';
        this.phaseT = 1.9;
        const win = this.wins.player >= 2;
        this.banner(win ? this.spec.victoryText ?? t('duel.victory') : this.spec.defeatText ?? t('duel.defeat'), win ? 'win' : 'lose');
        win ? sfx.levelUp() : sfx.debt();
      } else {
        this.round++;
        this.resetRound();
        this.banner(t('duel.round', { n: this.round }), 'round');
      }
    }
    if (this.phase !== 'fight') for (const f of [this.player, this.kirill]) this.drive(f, NO_CTL, dt);
    this.pressed.clear();

    for (const f of [this.player, this.kirill]) this.tickFighter(f, dt);
    this.separate();
    this.tickProjectiles(dt);
    this.render(dtReal);
  }

  private endRound(winner: 'player' | 'kirill', timeUp = false) {
    if (this.phase !== 'fight') return;
    this.phase = 'roundEnd';
    this.phaseT = 2.2;
    this.wins[winner]++;
    const loser = winner === 'player' ? this.kirill : this.player;
    // the deciding round: he stands there dazed — ДОБЕЙ ЕГО!
    if (!timeUp && winner === 'player' && this.wins.player >= 2) {
      loser.state = 'hit'; loser.t = -99; loser.move = null; loser.y = 0; loser.vy = 0;
      this.phase = 'finish';
      this.phaseT = 2.6;
      this.banner(t('duel.finishHim'), 'finish');
      sfx.alarm();
      const pips = this.hud.querySelectorAll('.duel-side.left .pips i');
      pips[this.wins.player - 1]?.classList.add('on');
      return;
    }
    if (!timeUp) { loser.state = 'ko'; loser.move = null; this.slowmo = 1.0; sfx.boom(); this.shake = 0.35; }
    this.banner(t(timeUp ? 'duel.time' : 'duel.ko'), 'ko');
    const pips = this.hud.querySelectorAll(`.duel-side.${winner === 'player' ? 'left' : 'right'} .pips i`);
    pips[this.wins[winner] - 1]?.classList.add('on');
  }

  private finish(win: boolean) {
    this.done = true;
    this.spec.onDone(win);
  }

  /** ОТЧИСЛЕНИЕ: the camera circles Kirill, the screen bleeds red, he's launched off his feet */
  private fatality() {
    this.phase = 'fatality';
    this.phaseT = 3.2;
    this.fatalityT = 0;
    const p = this.player, k = this.kirill;
    p.state = 'attack'; p.move = SPECIALS[this.spec.foe]; p.moveId = 'special'; p.t = 0; p.struck = true;
    k.state = 'ko'; k.vy = 9; k.y = 0.01; k.vx = Math.sign(k.x - p.x) * 5;
    this.slowmo = 2.2;
    this.shake = 0.5;
    this.banner(t('duel.fatality'), 'fatality');
    this.hud.classList.add('bleed');
    setTimeout(() => this.hud.classList.remove('bleed'), 2600);
    this.spark(k.x, 1.4, 0xff2a1a, 30);
    sfx.boom(); sfx.debt();
    juice.stamp();
  }

  // ---------------------------------------------------------------- movement and attacks (both fighters)

  private drive(f: Fighter, c: Ctl, dt: number) {
    const foe = f === this.player ? this.kirill : this.player;
    if (c.j || c.k) f.buffer = { b: c.j ? 'j' : 'k', t: 0.3 };
    if (f.buffer && (f.buffer.t -= dt) <= 0) f.buffer = null;
    if (f.state === 'hit' || f.state === 'down' || f.state === 'ko') return;
    if (f.state === 'dash') return;

    // chains: a buffered button during recovery cancels into the next move of the string
    if (f.state === 'attack') {
      const ph = f.phase();
      const next = f.buffer && f.moveId ? CHAINS[f.moveId]?.[f.buffer.b] : undefined;
      if (next && (ph === 2 || (ph === 1 && f.struck)) && !f.air) this.attack(f, next);
      return;
    }
    if (c.special && f.special >= 100) { this.attack(f, 'special'); return; }

    if (f.air) {
      // in the air: drift a little, one aerial attack per jump
      f.vx += (c.dir * D.walkSpeed * 0.9 - f.vx) * Math.min(1, dt * 3);
      if (f.buffer && !f.airAttack) this.attack(f, f.buffer.b === 'j' ? 'airPunch' : 'flyKick');
      return;
    }
    f.crouching = c.down;
    if (c.dash) {
      f.state = 'dash'; f.t = 0; f.vx = c.dash * D.dashSpeed; f.iframes = 0.15; f.crouching = false;
      sfx.click();
      return;
    }
    if (c.jump) {
      f.vy = D.jumpV; f.y = 0.001; f.state = 'jump'; f.airAttack = false; f.crouching = false;
      f.vx = c.dir * D.walkSpeed * 1.15;
      return;
    }
    if (c.block) { f.state = 'block'; f.vx = 0; return; }
    if (f.buffer) {
      const toward = c.dir !== 0 && Math.sign(c.dir) === Math.sign(foe.x - f.x);
      const id: MoveId = c.down ? (f.buffer.b === 'j' ? 'uppercut' : 'sweep') : f.buffer.b === 'j' ? 'jab' : toward ? 'dashKick' : 'kick';
      this.attack(f, id);
      return;
    }
    if (c.down) { f.state = 'crouch'; f.vx = 0; return; }
    f.vx = c.dir * D.walkSpeed;
    f.state = c.dir ? 'walk' : 'idle';
  }

  private attack(f: Fighter, id: MoveId) {
    const move = id === 'special' ? SPECIALS[f.isKirill ? 'kirill' : this.spec.foe] : MOVES[id];
    f.start(id, move);
    if (!f.air) f.vx = 0;
    f.crouching = !!move.low;
    if (id === 'special') { f.special = 0; sfx.whistle(); }
    else sfx.place();
  }

  // ---------------------------------------------------------------- Kirill's AI

  private aiCtl(dt: number, k: Fighter, p: Fighter, mind: Mind, lvl: number, ai: number): Ctl {
    const c: Ctl = { ...NO_CTL };
    mind.think -= dt;
    mind.plan.t -= dt;
    const d = Math.abs(p.x - k.x);
    const toward = Math.sign(p.x - k.x) || 1;

    if (k.state === 'hit' || k.state === 'down' || k.state === 'ko') mind.queue = [];
    // feeding a combo string: press the next button once the current move is recovering
    if (mind.queue.length && (!k.busy || (k.state === 'attack' && k.phase() >= 1 && k.struck))) {
      if (k.state === 'attack' || !k.busy) {
        const s = mind.queue.shift()!;
        c[s.b] = true;
        c.down = !!s.down;
        if (s.fwd) c.dir = toward;
        if (s.jump) c.jump = true;
        return c;
      }
    }
    if (k.air) {
      c.dir = toward;
      if (d < 1.7 && !k.airAttack && Math.random() < 0.3 * ai) c[Math.random() < 0.5 ? 'j' : 'k'] = true;
      return c;
    }
    if (mind.think <= 0 && !k.busy) {
      mind.think = D.ai.thinkEvery;
      const r = Math.random();
      const swing = p.state === 'attack' && p.phase() <= 1 && d < (p.move?.range ?? 1) * p.scale + 0.7 ? p.move : null;
      const shot = this.projectiles.find((pr) => pr.owner === p && Math.sign(k.x - pr.x) === Math.sign(pr.vx) && Math.abs(k.x - pr.x) < 4);
      if (swing && r < D.ai.blockChance * lvl) {
        // read the attack: jump lows, duck highs (and punish with an uppercut), block the rest
        if (swing.height === 'low') { if (Math.random() < 0.6) c.jump = true; else { mind.plan = { act: 'crouch', t: 0.35 }; c.down = c.block = true; } }
        else if (swing.height === 'high' && Math.random() < 0.45) { mind.plan = { act: 'crouch', t: 0.3 }; mind.queue = [{ b: 'j', down: true }]; }
        else mind.plan = { act: 'block', t: 0.4 };
      } else if (shot && r < 0.75 * lvl) {
        if (shot.y > 0.9 && Math.random() < 0.65) mind.plan = { act: 'crouch', t: 0.45 };
        else c.jump = true;
        c.dir = toward;
      } else if (p.state === 'down') mind.plan = { act: 'back', t: 0.25 };
      else if (p.state === 'hit' && p.juggled && d < 1.7) mind.queue = [{ b: 'j' }, { b: 'j' }];
      else if (k.hp / k.maxHp < 0.3 && d < 2 && r < 0.3) c.dash = -toward;
      else if (k.special >= 100 && d > 2.5) c.special = true;
      else if (d > 3.2) {
        if (r < 0.12 * ai) c.dash = toward;
        else if (r < 0.2 * ai) { c.jump = true; c.dir = toward; }
        else mind.plan = { act: 'walk', t: 0.3 };
      } else if (d > 1.5) {
        if (r < 0.22 * ai) mind.queue = [{ b: 'k', fwd: true }];
        else mind.plan = { act: 'walk', t: 0.25 };
      } else if (r < Math.min(0.9, D.ai.aggression * ai)) {
        const reach = Math.min(AI_COMBOS.length, 3 + Math.round(ai * 2.5));
        mind.queue = [...AI_COMBOS[Math.floor(Math.random() * reach)]];
      } else {
        const pick = Math.random();
        mind.plan = { act: pick < 0.4 ? 'back' : pick < 0.75 ? 'block' : 'crouch', t: 0.3 };
      }
    }
    if (!k.busy && !c.jump && !c.dash && !c.special && !mind.queue.length) {
      if (mind.plan.t > 0 && mind.plan.act === 'block') c.block = true;
      else if (mind.plan.t > 0 && mind.plan.act === 'crouch') { c.down = true; c.block = Math.random() < 0.5 * lvl; }
      else if (mind.plan.t > 0 && mind.plan.act === 'walk') c.dir = toward;
      else if (mind.plan.t > 0 && mind.plan.act === 'back') c.dir = -toward;
    }
    return c;
  }

  // ---------------------------------------------------------------- combat

  private tickFighter(f: Fighter, dt: number) {
    const foe = f === this.player ? this.kirill : this.player;
    const grounded = !f.air;
    if (grounded && f.state !== 'ko' && f.state !== 'hit' && f.state !== 'attack' && f.state !== 'down' && f.state !== 'dash') f.facing = Math.sign(foe.x - f.x) || f.facing;
    f.t += dt;
    f.iframes = Math.max(0, f.iframes - dt);
    f.sinceHit += dt;
    if (f.sinceHit > 0.45 && f.state !== 'hit' && f.state !== 'down') f.hitsTaken = 0;
    // gravity
    if (f.air) {
      f.vy -= D.gravity * dt;
      f.y += f.vy * dt;
      if (f.y <= 0) {
        f.y = 0; f.vy = 0;
        if (f.juggled && f.state === 'hit') this.knockDown(f, true);
        else if (f.state === 'jump' || (f.state === 'attack' && f.airAttack)) { f.state = 'idle'; f.move = null; }
        f.airAttack = false;
      }
    }
    if (f.state === 'attack' && f.move) {
      const ph = f.phase();
      if (ph === 1 && !f.struck) {
        f.struck = true;
        if (f.move.dash) f.x += f.facing * Math.min(f.move.dash, Math.max(0, Math.abs(foe.x - f.x) - 0.8));
        if (f.move.projectile) this.fire(f, f.move);
        else if (this.reaches(f, foe, f.move)) this.land(f, foe, f.move);
        else sfx.click();
      }
      if (ph === 3) { f.state = f.air ? 'jump' : 'idle'; f.move = null; f.crouching = false; }
    } else if (f.state === 'hit' && f.t >= D.hitstun && !f.air) {
      f.state = 'idle';
      f.juggled = false;
    } else if (f.state === 'down' && f.t >= D.downSec) {
      f.state = 'idle';
      f.iframes = 0.4; // wake-up
    } else if (f.state === 'dash') {
      if (f.t >= D.dashSec) { f.state = 'idle'; f.vx = 0; }
    }
    if (f.state === 'hit' || f.state === 'down' || f.state === 'ko') f.vx *= Math.pow(0.02, dt);
    if (f.state !== 'attack' || f.air) f.x += f.vx * dt;
    const lim = D.arena;
    f.x = Math.max(-lim, Math.min(lim, f.x));
    f.sync(dt);
  }

  /** melee reach: distance, facing, and height (highs whiff over crouchers, lows under jumpers) */
  private reaches(att: Fighter, def: Fighter, move: Move) {
    if (Math.abs(def.x - att.x) > move.range * att.scale) return false;
    if (Math.sign(def.x - att.x) !== att.facing) return false;
    if (def.iframes > 0 || def.state === 'down' || def.state === 'ko') return false;
    if (move.height === 'high' && def.low && !def.air) return false;
    if (move.height === 'low' && def.y > 0.25) return false;
    // ground moves reach a juggled body only while it's low enough; aerials need to be near in height
    if (move.height !== 'air' && !move.launch && def.y > 1.6) return false;
    if (move.height === 'air' && Math.abs(att.y - def.y) > 2.2) return false;
    return true;
  }

  private knockDown(f: Fighter, landed = false) {
    f.state = 'down';
    f.t = 0;
    f.move = null;
    f.juggled = false;
    f.crouching = false;
    this.shake = Math.max(this.shake, landed ? 0.16 : 0.24);
    sfx.boom();
  }

  private separate() {
    const a = this.player, b = this.kirill;
    if (a.y > 0.9 || b.y > 0.9) return; // jump over each other
    const min = 0.75;
    const d = b.x - a.x;
    if (Math.abs(d) < min) {
      const push = (min - Math.abs(d)) / 2 * (Math.sign(d) || 1);
      a.x -= push; b.x += push;
    }
  }

  /** a hit lands (melee or projectile) */
  private land(att: Fighter, def: Fighter, move: Move) {
    if (def.state === 'ko' || def.state === 'down' || def.iframes > 0) return;
    const power = att.isKirill ? this.spec.kirillPower : 1;
    const guardOk = move.height === 'low' ? def.crouching : move.height === 'air' ? !def.crouching : true;
    const blocked = def.state === 'block' && !def.air && guardOk && Math.sign(att.x - def.x) === def.facing;
    const scaling = Math.max(0.45, 1 - D.comboScale * def.hitsTaken);
    let dmg = move.dmg * power * scaling * (blocked ? (move.projectile ? 0.5 : D.blockFactor) : 1);
    dmg = Math.max(1, Math.round(dmg));
    def.hp = Math.max(0, def.hp - dmg);
    const dir = Math.sign(def.x - att.x) || 1;
    att.special = Math.min(100, att.special + (blocked ? 8 : D.specialGain.hit));
    def.special = Math.min(100, def.special + D.specialGain.taken);
    if (!blocked) {
      def.hitsTaken++;
      def.sinceHit = 0;
      def.t = 0;
      def.move = null;
      def.crouching = false;
      if (move.launch || def.air) {
        // juggle: pop (back) up, drift away a little
        def.vy = Math.max(def.vy, move.launch ?? 4.2);
        def.y = Math.max(def.y, 0.01);
        def.juggled = true;
        def.state = 'hit';
        def.vx = dir * (move.launch ? 0.8 : 1.6);
      } else if (move.down) {
        this.knockDown(def);
        def.vx = dir * 3.2;
      } else {
        def.state = 'hit';
        def.vx = 0;
        def.x += dir * move.knock;
      }
      this.hitStop = move.dmg >= 13 || move.down || move.launch ? 0.09 : 0.05;
      this.shake = Math.max(this.shake, move.dmg >= 13 ? 0.22 : 0.1);
      sfx.hurt();
      if (def.hitsTaken >= 2) this.showCombo(att, def.hitsTaken);
    } else {
      def.x += dir * move.knock * 0.35;
      sfx.click();
    }
    this.spark(def.x - dir * 0.3, def.y + 1.3 * def.scale, blocked ? 0x8fd0ff : 0xffd27a, blocked ? 4 : def.hitsTaken >= 3 ? 14 : 9);
    this.popup(def, blocked ? t('duel.blocked') : dmg >= 15 ? '2!' : dmg >= 9 ? '3-' : '4', blocked ? 'skill' : dmg >= 15 ? 'grade-2' : 'grade-3');
    if (def.hp <= 0) this.endRound(def === this.kirill ? 'player' : 'kirill');
  }

  private showCombo(att: Fighter, n: number) {
    const side = att === this.player ? 'left' : 'right';
    const e = this.hud.querySelector(`.duel-combo.${side}`) as HTMLElement;
    e.innerHTML = `<b>${n}</b> ${t('duel.hits')}`;
    e.classList.remove('pop');
    void e.offsetWidth;
    e.classList.add('pop', 'on');
    this.comboShow[side] = 1.2;
    if (n === 3 || n === 5 || n === 7 || n === 10) announce(n >= 10 ? 4 : n >= 7 ? 3 : n >= 5 ? 2 : 1, 'duel');
  }

  private fire(f: Fighter, move: Move) {
    const pr = move.projectile!;
    for (let i = 0; i < pr.count; i++) {
      const mesh = new THREE.Mesh(pr.count > 1 ? new THREE.BoxGeometry(pr.size * 1.4, pr.size, 0.02) : new THREE.SphereGeometry(pr.size, 12, 10), new THREE.MeshBasicMaterial({ color: f.isKirill ? 0xb6ff3a : PALETTE[this.spec.foe].ember, toneMapped: false }));
      const y = f.y + 1.25 * f.scale + (i - (pr.count - 1) / 2) * 0.45;
      mesh.position.set(f.x + f.facing * 0.6, y, 0);
      this.scene.add(mesh);
      this.projectiles.push({ mesh, x: f.x + f.facing * 0.6, y, vx: f.facing * pr.speed, vy: (i - (pr.count - 1) / 2) * 0.3, owner: f, move, life: 2 });
    }
  }

  private tickProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      p.mesh.position.set(p.x, p.y, 0);
      p.mesh.rotation.z += dt * 8;
      const target = p.owner === this.player ? this.kirill : this.player;
      // crouch under it, or jump over it
      const top = target.y + (target.low ? 1.15 : 2.4) * target.scale;
      if (Math.abs(target.x - p.x) < 0.45 && p.y < top && p.y > target.y && target.state !== 'ko' && target.state !== 'down' && target.iframes <= 0) {
        this.land(p.owner, target, p.move);
        p.life = 0;
      }
      if (p.life <= 0 || Math.abs(p.x) > D.arena + 2) { this.scene.remove(p.mesh); this.projectiles.splice(i, 1); }
    }
  }

  private spark(x: number, y: number, color: number, n: number) {
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.09), new THREE.MeshBasicMaterial({ color, transparent: true, toneMapped: false }));
      mesh.position.set(x, y, 0.3);
      this.scene.add(mesh);
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 4;
      this.sparks.push({ mesh, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35 + Math.random() * 0.2 });
    }
  }

  private popup(f: Fighter, text: string, cls: string) {
    const v = new THREE.Vector3(f.x, f.y + 2.3 * f.scale, 0).project(this.camera);
    const e = el(`<div class="popup ${cls}"></div>`);
    e.textContent = text;
    e.style.transform = `translate(${((v.x * 0.5 + 0.5) * innerWidth).toFixed(0)}px, ${((-v.y * 0.5 + 0.5) * innerHeight).toFixed(0)}px) translate(-50%, -100%)`;
    e.style.transition = 'opacity 0.7s, margin-top 0.7s';
    document.getElementById('world-ui')!.appendChild(e);
    globalThis.requestAnimationFrame?.(() => { e.style.opacity = '0'; e.style.marginTop = '-40px'; });
    setTimeout(() => e.remove(), 750);
  }

  // ---------------------------------------------------------------- per-frame visuals

  private render(dt: number) {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      s.vy -= 9 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, s.life * 3);
      if (s.life <= 0) { this.scene.remove(s.mesh); this.sparks.splice(i, 1); }
    }
    // camera drifts with the fight, lifts a little for jumps, shakes on heavy hits
    const mid = (this.player.x + this.kirill.x) / 2;
    const spread = Math.abs(this.player.x - this.kirill.x);
    const lift = Math.max(this.player.y, this.kirill.y) * 0.25;
    const cx = mid * 0.6 + (Math.random() - 0.5) * this.shake;
    if (this.phase === 'fatality') {
      const k = this.kirill, a = -0.9 + this.fatalityT * 0.9;
      this.camera.position.set(k.x + Math.sin(a) * 3.4, 1.4 + k.y * 0.4, Math.cos(a) * 3.4);
      this.camera.lookAt(k.x, 1.1 + k.y * 0.6, 0);
    } else {
      this.camera.position.set(cx, 1.35 + lift + (Math.random() - 0.5) * this.shake, 7.6 + Math.min(3, spread * 0.45));
      this.camera.lookAt(cx, 1.3 + lift, 0);
    }
    // embers drift, torches flicker
    if (this.embers) {
      const pa = this.embers.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pa.count; i++) { let y = pa.getY(i) + (dt || 0.016) * (0.4 + (i % 7) * 0.08); if (y > 8) y = 0; pa.setY(i, y); }
      pa.needsUpdate = true;
    }
    for (const l of this.torches) l.intensity = 22 + Math.random() * 8;
    this.shake *= Math.pow(0.02, dt || 0.016);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();

    // HUD
    const q = (s: string) => this.hud.querySelector(s) as HTMLElement;
    const pp = (this.player.hp / this.player.maxHp) * 100, kp = (this.kirill.hp / this.kirill.maxHp) * 100;
    this.ghost.p = Math.max(pp, this.ghost.p - (dt || 0.016) * 40);
    this.ghost.k = Math.max(kp, this.ghost.k - (dt || 0.016) * 40);
    q('.left .fill').style.width = `${pp}%`;
    q('.right .fill').style.width = `${kp}%`;
    q('.left .ghost').style.width = `${this.ghost.p}%`;
    q('.right .ghost').style.width = `${this.ghost.k}%`;
    q('.duel-timer').textContent = String(Math.max(0, Math.ceil(this.timer)));
    const sp = q('.spbar .fill');
    sp.style.width = `${this.player.special}%`;
    sp.classList.toggle('ready', this.player.special >= 100);
    for (const side of ['left', 'right'] as const) {
      if (this.comboShow[side] <= 0) continue;
      this.comboShow[side] -= dt;
      if (this.comboShow[side] <= 0) q(`.duel-combo.${side}`).classList.remove('on');
    }
  }

  dispose() {
    for (const [tg, type, fn] of this.listeners) tg.removeEventListener(type, fn);
    this.hud.remove();
    if (this.stage.override?.scene === this.scene) this.stage.override = null;
  }
}

/** stage colours per fighter: rim lights, embers, sky */
const PALETTE: Record<DuelFoe, { rim: number; rim2: number; ember: number; sky: number }> = {
  nina: { rim: 0xff6a3a, rim2: 0x3ac86a, ember: 0xffa040, sky: 0x1a0c0a },
  dean: { rim: 0xffc27a, rim2: 0x6a7ad8, ember: 0xffd27a, sky: 0x120c14 },
  finalExam: { rim: 0xff4ab0, rim2: 0x9a5ae8, ember: 0xff7ad8, sky: 0x140a18 },
  romchik: { rim: 0xff4ab0, rim2: 0x4ad8ff, ember: 0xff7ad8, sky: 0x10081a },
  sonya: { rim: 0xffd84a, rim2: 0xff4ab0, ember: 0xfff07a, sky: 0x160e08 },
  masha: { rim: 0xffffff, rim2: 0xc8a05a, ember: 0xfff4d0, sky: 0x0e0c10 },
};

/** the arena floor: dark stone with a glowing ring and the university crest */
function arenaFloor(rim: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1c1a20';
  g.fillRect(0, 0, 1024, 1024);
  for (let y = 0; y < 1024; y += 128) for (let x = (y / 128) % 2 ? 64 : 0; x < 1024; x += 128) {
    g.fillStyle = `rgba(${60 + Math.random() * 20},${55 + Math.random() * 20},${70 + Math.random() * 20},1)`;
    g.fillRect(x + 3, y + 3, 122, 122);
  }
  const col = '#' + rim.toString(16).padStart(6, '0');
  g.strokeStyle = col; g.globalAlpha = 0.55; g.lineWidth = 10;
  g.beginPath(); g.arc(512, 512, 360, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 4; g.beginPath(); g.arc(512, 512, 320, 0, Math.PI * 2); g.stroke();
  g.globalAlpha = 0.35; g.fillStyle = col; g.font = 'bold 150px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('БрГТУ', 512, 512);
  g.globalAlpha = 1;
  return c;
}

/** The glowing backdrop: sunset light through the location, everything else in black. */
function backdrop(foe: DuelFoe): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, 512);
  const pal = foe === 'nina' ? ['#ffd59a', '#ff9a4a', '#c8402a'] : foe === 'dean' ? ['#ffe6b0', '#f2a860', '#8a3a4a'] : foe === 'romchik' || foe === 'sonya' ? ['#b88aff', '#ff4ab0', '#2a0a40'] : foe === 'masha' ? ['#ffe6b0', '#c8a05a', '#3a2a1a'] : ['#f2b0d8', '#c060a0', '#401838'];
  sky.addColorStop(0, pal[0]);
  sky.addColorStop(0.55, pal[1]);
  sky.addColorStop(1, pal[2]);
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 512);
  // big low sun
  const sun = g.createRadialGradient(512, 330, 10, 512, 330, 220);
  sun.addColorStop(0, 'rgba(255,250,230,0.95)');
  sun.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = sun;
  g.fillRect(0, 0, 1024, 512);
  g.fillStyle = '#0b0708';
  const floorY = 452;
  if (foe === 'nina') {
    // gym: tall window grid, wall bars, a basketball hoop
    for (let x = 40; x < 1024; x += 150) { g.fillRect(x, 60, 10, 300); }
    g.fillRect(0, 60, 1024, 10); g.fillRect(0, 210, 1024, 8); g.fillRect(0, 352, 1024, 14);
    for (let y = 370; y < floorY; y += 14) g.fillRect(60, y, 140, 4);
    for (let x = 60; x <= 200; x += 35) g.fillRect(x, 366, 6, 90);
    g.fillRect(860, 230, 10, 230); g.fillRect(820, 200, 90, 60); g.fillRect(835, 262, 40, 6);
  } else if (foe === 'dean') {
    // dean's office: the long glass counter, a flag, plants, ceiling lamps
    g.fillRect(0, 330, 1024, 20); g.fillRect(0, 380, 1024, 80);
    for (let x = 0; x < 1024; x += 128) g.fillRect(x, 230, 8, 100);
    g.fillRect(0, 226, 1024, 8);
    g.fillRect(140, 120, 6, 260); g.fillRect(146, 124, 60, 34);
    for (const x of [300, 760]) { g.beginPath(); g.ellipse(x, 360, 42, 60, 0, 0, Math.PI * 2); g.fill(); g.fillRect(x - 20, 380, 40, 70); }
    for (let x = 200; x < 1024; x += 260) g.fillRect(x, 30, 90, 10);
  } else if (foe === 'romchik') {
    // dorm party: speaker stacks, a crowd with raised hands, a disco ball, string lights
    for (const x of [60, 880]) { g.fillRect(x, 240, 90, 212); g.fillStyle = 'rgba(255,120,220,0.5)'; g.beginPath(); g.arc(x + 45, 300, 26, 0, Math.PI * 2); g.arc(x + 45, 390, 30, 0, Math.PI * 2); g.fill(); g.fillStyle = '#0b0708'; }
    for (let x = 170; x < 860; x += 34) {
      const h = 40 + ((x * 37) % 30);
      g.beginPath(); g.arc(x, floorY - h, 15, 0, Math.PI * 2); g.fill();
      g.fillRect(x - 13, floorY - h, 26, h);
      if ((x / 34) % 3 < 1) { g.fillRect(x - 3, floorY - h - 60, 6, 48); g.fillRect(x + 10, floorY - h - 50, 6, 40); }
    }
    g.fillRect(509, 0, 6, 70); g.beginPath(); g.arc(512, 100, 34, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 14; i++) { const a = i * 0.45; g.fillRect(512 + Math.cos(a) * 26 - 3, 100 + Math.sin(a) * 26 - 3, 6, 6); }
    for (let x = 0; x < 1024; x += 26) { g.fillStyle = ['#ffd84a', '#ff4ab0', '#4ad8ff'][(x / 26) % 3 | 0]; g.beginPath(); g.arc(x, 40 + Math.sin(x / 90) * 18, 5, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#0b0708';
  } else {
    // exam hall: chalkboard, rows of desks, a giant «2»
    g.fillRect(262, 90, 500, 200); g.fillStyle = 'rgba(255,240,240,0.18)'; g.fillRect(272, 100, 480, 180); g.fillStyle = '#0b0708';
    for (let r = 0; r < 3; r++) for (let x = r * 30; x < 1024; x += 170) g.fillRect(x, 360 + r * 28, 130, 10 + r * 3);
    g.font = 'bold 150px Russo One, sans-serif';
    g.fillStyle = 'rgba(11,7,8,0.85)';
    g.fillText('2', 470, 255);
    g.fillStyle = '#0b0708';
  }
  g.fillRect(0, floorY, 1024, 512 - floorY);
  return c;
}
