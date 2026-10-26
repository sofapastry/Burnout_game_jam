import * as THREE from 'three';
import { Grid, SOLID } from '../maps/grid';
import { buildUnitModel } from '../horde/unitModels';
import { makeCharacter, type Rig } from '../assets';
import { Person } from '../hero/person';
import { randomKirillLook } from '../hero/look';
import { PROPS } from '../maps/props';
import { staticBatch } from '../maps/builder';
import { Fx } from '../render/fx';
import { Rng } from '../core/rng';
import { sfx } from '../core/audio';
import { part, box, cyl, toon, at, outlineMaterial } from '../render/toon';
import * as T from '../render/textures';
import { el } from '../ui/dom';
import { t } from '../i18n';
import balance from '../data/balance.json';
import { Input, hudLayer, clamp, fitAspect, type ArcadeCtx, type ArcadeMode } from './common';

// Dorm Dungeon: you are a living Deadline crawling the dorm basement room by room.
// Doors lock until a room is clear; pick an upgrade; Kirill waits in the last room.

const DG = balance.arcade.dungeon;
const RW = DG.roomW, RH = DG.roomH;

type RoomKind = 'start' | 'fight' | 'treasure' | 'boss';
interface Room { cx: number; cy: number; kind: RoomKind; doors: Record<Dir, boolean>; cleared: boolean; visited: boolean; depth: number; seed: number }
type Dir = 'n' | 's' | 'e' | 'w';
const DIRS: Record<Dir, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const OPP: Record<Dir, Dir> = { n: 's', s: 'n', e: 'w', w: 'e' };
const DOOR_POS: Record<Dir, { x: number; z: number }> = { n: { x: 0, z: -RH / 2 }, s: { x: 0, z: RH / 2 }, e: { x: RW / 2, z: 0 }, w: { x: -RW / 2, z: 0 } };

type EnemyKind = 'coffee' | 'artem' | 'shady' | 'grisha' | 'notebook' | 'kirill';
interface Enemy {
  kind: EnemyKind; obj: THREE.Object3D; rig: Rig | null;
  x: number; z: number; vx: number; vz: number; r: number;
  hp: number; maxHp: number; speed: number; dmg: number;
  cd: number; act: number; flash: number; alive: boolean; t: number;
}
interface Bolt { mesh: THREE.Mesh; x: number; z: number; vx: number; vz: number; dmg: number; life: number; fromPlayer: boolean }

const UPGRADES = ['sharp', 'quick', 'sturdy', 'alarm', 'reach', 'vampire', 'dash'] as const;
type Upgrade = typeof UPGRADES[number];

export class DormDungeon implements ArcadeMode {
  private input: Input;
  private rng = new Rng(Math.floor(Math.random() * 1e9));
  private rooms: Room[] = [];
  private room!: Room;
  private root = new THREE.Group();
  private roomGroup = new THREE.Group();
  private grid!: Grid;
  private fx: Fx;
  private hud: HTMLElement;
  // the player (a living Deadline)
  private me = new THREE.Group();
  private aimMark: THREE.Mesh;
  private px = 0; private pz = 0; private pvx = 0; private pvz = 0;
  private hp: number = DG.playerHp;
  private maxHp: number = DG.playerHp;
  private aim = Math.PI;
  /** third-person camera: its own heading (orbit with Q/E or the captured mouse), smoothed position */
  private cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 120);
  private yaw = Math.PI;
  private camPos = new THREE.Vector3();
  private orbitT = 0;
  /** lock-on target (F / middle mouse); slashes also soft-lock the nearest enemy in front */
  private lock: Enemy | null = null;
  private lockRing: THREE.Mesh;
  private combo = 0;
  private comboT = 0;
  private freeze = 0;
  private shakeAmt = 0;
  private lamp = new THREE.PointLight(0xffe2b0, 14, 11, 1.4);
  /** tests: world-space movement instead of keys */
  botMove: { x: number; z: number } | null = null;
  private hitCd = 0; private dashCd = 0; private ringCd = 0; private dashT = 0; private iframes = 0;
  private mods = { dmg: 1, speed: 1, ringCd: 1, reach: 1, vampire: 0, dashCd: 1 };
  private picked: Upgrade[] = [];
  private enemies: Enemy[] = [];
  private bolts: Bolt[] = [];
  private hearts: { x: number; z: number; mesh: THREE.Object3D }[] = [];
  private telegraph: THREE.Mesh | null = null;
  private waves = 0;
  private choosing: HTMLElement | null = null;
  private time = 0;
  private finished = false;
  private bossAllNighter = false;
  private kirillLook;
  private cleared = 0;
  private flowT = 0;

  constructor(private ctx: ArcadeCtx) {
    const st = ctx.stage;
    this.kirillLook = ctx.story?.look ?? randomKirillLook(this.rng);
    this.input = new Input(st.renderer.domElement);
    this.input.autoLock = true;
    st.clearWorld();
    st.world.add(this.root);
    this.root.add(this.roomGroup);
    this.fx = new Fx(st);
    st.setLighting('evening');
    st.scene.background = new THREE.Color(0x141014);
    st.override = { scene: st.scene, camera: this.cam };
    this.root.add(this.lamp);
    // the Deadline: the same alarm clock as the horde unit, bigger
    const model = buildUnitModel('deadline');
    for (const p of model.parts) { const m = new THREE.Mesh(p.geom, p.mat); m.castShadow = true; this.me.add(m); }
    this.me.add(new THREE.Mesh(model.outline, outlineMaterial(0.025)));
    this.me.scale.setScalar(1.6);
    this.root.add(this.me);
    this.aimMark = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 3), new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.85, toneMapped: false }));
    this.aimMark.rotation.x = -Math.PI / 2;
    this.root.add(this.aimMark);
    this.lockRing = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 32), new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
    this.lockRing.rotation.x = -Math.PI / 2;
    this.lockRing.visible = false;
    this.root.add(this.lockRing);
    this.generate();
    this.enter(this.rooms.find((r) => r.kind === 'start')!, null);

    this.hud = hudLayer(`
      <div class="dg-top">
        <div class="dg-hp"><span>${t('dg.hp')}</span><div class="bar"><div class="fill hp"></div></div><b class="hp-t"></b></div>
        <div class="dg-room"></div>
        <canvas class="dg-map" width="96" height="96"></canvas>
      </div>
      <div class="dg-boss hidden"><span>${t('hud.kirill')}</span><div class="bar"><div class="fill boss"></div></div></div>
      <div class="ar-center"></div>
      <div class="ar-bottom">
        <div class="ar-pad"><b class="ar-skill" data-key="q" data-hold>⟲ Q</b><b class="ar-skill" data-key="e" data-hold>⟳ E</b></div>
        <div class="ar-skill sk-hit" data-key="j"><b>J</b> ${t('dg.slash')} <i class="combo"></i></div>
        <div class="ar-skill sk-lock" data-key="f"><b>F</b> ${t('dg.lock')}</div>
        <div class="ar-skill sk-dash" data-key="k"><b>K</b> ${t('dg.dash')} <i class="cd"></i></div>
        <div class="ar-skill sk-ring" data-key=" "><b>␣</b> ${t('dg.ring')} <i class="cd"></i></div>
        <div class="dg-ups"></div>
        <div class="ar-keys">${t('dg.keys')}</div>
      </div>`);
    this.input.buttons(this.hud);
    this.flash(t('dg.intro'));
  }

  // ---------------------------------------------------------------- floor plan

  /** 3×3 rooms (2×2 between story weeks) joined by a random spanning tree; the boss is the room furthest from the start. */
  private generate() {
    const n = this.ctx.story ? 2 : 3;
    for (let cy = 0; cy < n; cy++) for (let cx = 0; cx < n; cx++)
      this.rooms.push({ cx, cy, kind: 'fight', doors: { n: false, s: false, e: false, w: false }, cleared: false, visited: false, depth: 0, seed: this.rng.int(0, 1e9) });
    const at = (cx: number, cy: number) => this.rooms.find((r) => r.cx === cx && r.cy === cy);
    const start = at(n === 2 ? 0 : 1, n - 1)!;
    start.kind = 'start';
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length) {
      const r = stack[stack.length - 1];
      const opts = (Object.keys(DIRS) as Dir[]).map((d) => [d, at(r.cx + DIRS[d][0], r.cy + DIRS[d][1])] as const).filter(([, n]) => n && !seen.has(n));
      if (!opts.length) { stack.pop(); continue; }
      const [d, n] = this.rng.pick(opts);
      r.doors[d] = true;
      n!.doors[OPP[d]] = true;
      n!.depth = r.depth + 1;
      seen.add(n!);
      stack.push(n!);
    }
    const boss = [...this.rooms].sort((a, b) => b.depth - a.depth)[0];
    boss.kind = 'boss';
    const leaves = this.rooms.filter((r) => r.kind === 'fight' && Object.values(r.doors).filter(Boolean).length === 1);
    if (leaves.length) this.rng.pick(leaves).kind = 'treasure';
  }

  private neighbor(d: Dir) {
    return this.rooms.find((r) => r.cx === this.room.cx + DIRS[d][0] && r.cy === this.room.cy + DIRS[d][1]);
  }

  // ---------------------------------------------------------------- building a room

  private enter(room: Room, from: Dir | null) {
    this.room = room;
    room.visited = true;
    for (const e of this.enemies) this.root.remove(e.obj);
    for (const b of this.bolts) this.root.remove(b.mesh);
    for (const h of this.hearts) this.root.remove(h.mesh);
    this.enemies = []; this.bolts = []; this.hearts = [];
    this.roomGroup.clear();
    this.fx.clear();
    this.root.add(this.fx.group);
    this.ctx.stage.setArena(RW, RH);
    this.grid = new Grid(RW, RH);
    const rng = new Rng(room.seed);
    const statics = new THREE.Group();

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(RW, RH), toon(0xffffff, { map: T.tileFloor(RW, RH, room.seed % 97, '#8f8a80', '#847f75', 1.5) }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.roomGroup.add(floor);
    const wall = (x: number, z: number, w: number, d: number, h: number) => {
      statics.add(at(part(box(w, h, d), 0xd8d2c4, { outline: 0.03 }), x, h / 2, z));
      statics.add(at(part(box(w + 0.06, 1.0, d + 0.06), 0x5f7a62, { outline: false }), x, 0.5, z));
    };
    // walls with door gaps
    const gap = 3;
    for (const [d, horiz] of [['n', true], ['s', true], ['e', false], ['w', false]] as [Dir, boolean][]) {
      const len = horiz ? RW + 1 : RH;
      const p = DOOR_POS[d];
      const h = 3.4;
      const ox = horiz ? 0 : p.x + Math.sign(p.x) * 0.25, oz = horiz ? p.z + Math.sign(p.z) * 0.25 : 0;
      if (!room.doors[d]) { wall(ox, oz, horiz ? len : 0.5, horiz ? 0.5 : len, h); continue; }
      const half = (len - gap) / 2;
      for (const s of [-1, 1]) {
        const c = s * (gap / 2 + half / 2);
        wall(horiz ? c : ox, horiz ? oz : c, horiz ? half : 0.5, horiz ? 0.5 : half, h);
      }
    }
    // basement dressing: pipes, a boiler, crates, washing machines, shelves
    statics.add(at(part(cyl(0.12, 0.12, RW, 8), 0x8a8f99), 0, 3.0, -RH / 2 + 0.25, 0, 0, Math.PI / 2));
    statics.add(at(part(cyl(0.08, 0.08, RW, 8), 0xb0703a), 0, 2.6, -RH / 2 + 0.3, 0, 0, Math.PI / 2));
    const pieces: [string, number][] = [['crate', 0.35], ['washer', 0.25], ['shelf', 0.2], ['boiler', 0.1], ['plant', 0.1]];
    const n = room.kind === 'boss' ? 2 : rng.int(3, 6);
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 20; tries++) {
        const roll = rng.next();
        let acc = 0, kind = 'crate';
        for (const [k, w] of pieces) { acc += w; if (roll < acc) { kind = k; break; } }
        const x = rng.range(-RW / 2 + 2.5, RW / 2 - 2.5), z = rng.range(-RH / 2 + 2.2, RH / 2 - 2.2);
        if (Math.hypot(x, z) < 3 || Object.values(DOOR_POS).some((p) => Math.hypot(p.x - x, p.z - z) < 3.5)) continue;
        const obj = basementProp(kind, rng);
        const fw = kind === 'shelf' ? 1.8 : 1.1, fd = kind === 'shelf' ? 0.6 : 1.1;
        const snap = this.grid.snapshot();
        this.grid.mark(x, z, fw, fd, SOLID);
        if (!this.grid.connected(0, 0)) { this.grid.restore(snap); continue; }
        obj.position.set(x, 0, z);
        statics.add(obj);
        break;
      }
    }
    this.roomGroup.add(staticBatch(statics));
    this.grid.freeze();
    // dim bulbs
    const bulb = new THREE.PointLight(0xffd29a, 18, 16, 1.6);
    bulb.position.set(0, 3.2, 0);
    this.roomGroup.add(bulb);

    // arrive at the door you came through
    if (from) {
      const p = DOOR_POS[OPP[from]];
      this.px = p.x * 0.82; this.pz = p.z * 0.75;
      this.yaw = this.aim = Math.atan2(DIRS[from][0], DIRS[from][1]);
    } else { this.px = 0; this.pz = 2; this.yaw = this.aim = Math.PI; }
    this.lock = null;
    this.camPos.set(0, 0, 0);
    this.pvx = this.pvz = 0;

    if (room.kind === 'fight' && !room.cleared) { this.waves = room.depth >= 3 ? 2 : 1; this.lockDoors(true); this.spawnWave(); }
    else if (room.kind === 'boss' && !room.cleared) { this.lockDoors(true); this.spawnBoss(); }
    else if (room.kind === 'treasure' && !room.cleared) { room.cleared = true; this.dropHeart(0, -2); this.offerUpgrades(); }
    this.labelRoom();
  }

  private lockDoors(lock: boolean) {
    for (const d of Object.keys(DOOR_POS) as Dir[]) {
      if (!this.room.doors[d]) continue;
      const p = DOOR_POS[d];
      const horiz = d === 'n' || d === 's';
      const id = 'bars' + d;
      this.grid.setDynamic(id, lock ? { x: p.x - Math.sign(p.x) * 0.3, z: p.z - Math.sign(p.z) * 0.3, w: horiz ? 3.2 : 0.6, d: horiz ? 0.6 : 3.2, v: SOLID } : null);
      const old = this.roomGroup.getObjectByName(id);
      if (old) this.roomGroup.remove(old);
      if (lock) {
        const bars = new THREE.Group();
        bars.name = id;
        for (let i = -1; i <= 1; i += 0.5) bars.add(at(part(box(0.1, 2.4, 0.1), 0xc0392b), horiz ? i : 0, 1.2, horiz ? 0 : i));
        bars.position.set(p.x - Math.sign(p.x) * 0.2, 0, p.z - Math.sign(p.z) * 0.2);
        this.roomGroup.add(bars);
      }
    }
    if (!lock) sfx.levelUp();
  }

  // ---------------------------------------------------------------- enemies

  private spawnWave() {
    const depth = this.room.depth;
    const count = 2 + depth + this.rng.int(0, 1);
    const pool: EnemyKind[] = ['coffee', 'coffee', 'notebook', 'artem', 'shady', 'grisha'];
    for (let i = 0; i < count; i++) {
      const kind = i === 0 && depth >= 2 ? this.rng.pick(['artem', 'shady', 'grisha'] as EnemyKind[]) : this.rng.pick(pool);
      const p = this.grid.randomFree(() => this.rng.next());
      if (!p || Math.hypot(p.x - this.px, p.z - this.pz) < 4.5) { i--; if (i < -20) break; continue; }
      this.spawnEnemy(kind, p.x, p.z);
    }
  }

  private spawnEnemy(kind: EnemyKind, x: number, z: number) {
    const S: Record<EnemyKind, [number, number, number, number]> = {
      // hp, speed, contact dmg, radius
      coffee: [14, 4.2, 5, 0.32], notebook: [18, 3.0, 5, 0.34], artem: [48, 2.1, 8, 0.45],
      shady: [28, 2.5, 4, 0.42], grisha: [38, 1.5, 6, 0.45],
      kirill: [DG.bossHp * (this.ctx.story ? 0.7 + 0.05 * this.ctx.story.level : 1), 3.2, 12, 0.55],
    };
    const [hp, speed, dmg, r] = S[kind];
    let obj: THREE.Object3D, rig: Rig | null = null;
    if (kind === 'coffee') obj = coffeeCup();
    else if (kind === 'notebook') obj = notebook();
    else if (kind === 'kirill') { const p = new Person(this.kirillLook); p.root.scale.multiplyScalar(1.25); rig = p; obj = p.root; }
    else { rig = makeCharacter(kind); obj = rig.root; }
    obj.position.set(x, 0, z);
    this.root.add(obj);
    const scale = 1 + this.room.depth * 0.08;
    this.enemies.push({ kind, obj, rig, x, z, vx: 0, vz: 0, r, hp: hp * scale, maxHp: hp * scale, speed, dmg, cd: 1, act: this.rng.range(1, 2.5), flash: 0, alive: true, t: 0 });
    this.fx.ring(x, z, 0.2, 1.4, 0.4, 0x9a5ae8, 0.8);
  }

  private spawnBoss() {
    this.spawnEnemy('kirill', 0, -3);
    this.bossAllNighter = false;
    this.hud?.querySelector('.dg-boss')?.classList.remove('hidden');
    this.flash(t('dg.boss'));
    sfx.alarm();
  }

  // ---------------------------------------------------------------- tick

  update(dt: number) {
    if (this.finished) return;
    if (this.choosing) {
      for (const [i, key] of ['1', '2', '3'].entries()) if (this.input.hit(key)) (this.choosing.querySelectorAll('.up')[i] as HTMLElement | undefined)?.click();
      this.input.endFrame();
      return;
    }
    if (this.freeze > 0) { this.freeze -= dt; this.input.endFrame(); return; }
    this.time += dt;
    this.comboT = Math.max(0, this.comboT - dt);
    this.hitCd = Math.max(0, this.hitCd - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.ringCd = Math.max(0, this.ringCd - dt);
    this.iframes = Math.max(0, this.iframes - dt);
    this.fx.update(dt);

    this.controls(dt);
    this.tickEnemies(dt);
    this.tickBolts(dt);
    this.pickHearts();
    this.checkRoomDone();
    this.checkDoors();
    this.input.endFrame();
    if (this.hp <= 0) this.end(false);
  }

  private controls(dt: number) {
    const k = this.input;
    // camera orbit: Q/E or ←/→, or the mouse once it's captured; otherwise the camera follows you
    const orbit = (k.down('q', 'arrowleft') ? 1 : 0) - (k.down('e', 'arrowright') ? 1 : 0);
    this.yaw += orbit * 2.4 * dt;
    if (k.locked) this.yaw -= k.dx * 0.0022;
    if (orbit || (k.locked && Math.abs(k.dx) > 1)) this.orbitT = 0.8;
    this.orbitT = Math.max(0, this.orbitT - dt);
    // lock-on: F / middle mouse toggles the nearest enemy
    if (k.hit('f', 'tab', 'mouse1')) {
      this.lock = this.lock ? null : this.nearestEnemy(14, null);
      if (this.lock) sfx.click();
    }
    if (this.lock && !this.lock.alive) this.lock = this.nearestEnemy(14, null);
    // WASD relative to the camera; you turn to face where you run
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = -fz, rz = fx;
    const fwd = (k.down('w', 'arrowup') ? 1 : 0) - (k.down('s', 'arrowdown') ? 1 : 0);
    const side = (k.down('d') ? 1 : 0) - (k.down('a') ? 1 : 0);
    let mx = fx * fwd + rx * side, mz = fz * fwd + rz * side;
    if (this.botMove) { mx = this.botMove.x; mz = this.botMove.z; }
    const ml = Math.hypot(mx, mz);
    if (this.lock) this.aim = turnTo(this.aim, Math.atan2(this.lock.x - this.px, this.lock.z - this.pz), dt * 14);
    else if (ml) this.aim = turnTo(this.aim, Math.atan2(mx, mz), dt * 12);
    // the camera settles in behind you: behind the lock target line, or behind your run
    if (this.lock) {
      this.yaw = turnTo(this.yaw, Math.atan2(this.lock.x - this.px, this.lock.z - this.pz), dt * 4);
    } else if (ml && this.orbitT <= 0 && !this.botMove) {
      const along = (mx * fx + mz * fz) / ml;
      if (along > 0.3) this.yaw = turnTo(this.yaw, Math.atan2(mx, mz), dt * 1.6 * along);
    }
    let speed = DG.speed * this.mods.speed;
    if (this.enemies.some((e) => e.alive && e.kind === 'grisha' && Math.hypot(e.x - this.px, e.z - this.pz) < 2.6)) speed *= 0.6; // contagious yawn
    if (this.dashT > 0) { this.dashT -= dt; }
    else { this.pvx = ml ? (mx / ml) * speed : 0; this.pvz = ml ? (mz / ml) * speed : 0; }
    if (k.hit('k', 'mouse2', 'shift') && this.dashCd <= 0) {
      const a = ml ? Math.atan2(mx, mz) : this.aim + Math.PI; // no direction: hop back
      this.pvx = Math.sin(a) * 22; this.pvz = Math.cos(a) * 22;
      this.dashT = 0.2; this.iframes = 0.3;
      this.dashCd = DG.dashCd * this.mods.dashCd;
      this.fx.ring(this.px, this.pz, 0.2, 1.2, 0.25, 0xffd24a, 0.6);
      sfx.click();
    }
    this.px += this.pvx * dt; this.pz += this.pvz * dt;
    const p = { x: this.px, z: this.pz };
    this.grid.resolve(p, 0.5);
    this.px = p.x; this.pz = p.z;
    if (k.hit('j', 'mouse0') && this.hitCd <= 0) this.slash();
    if (k.hit(' ') && this.ringCd <= 0) this.ring();
  }

  /** the nearest living enemy within reach, optionally only inside a cone around a heading */
  private nearestEnemy(maxD: number, heading: number | null, cone = 1.9) {
    let best: Enemy | null = null, bd = Infinity;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.x - this.px, dz = e.z - this.pz, d = Math.hypot(dx, dz);
      if (d > maxD) continue;
      if (heading !== null && d > 2.2) {
        let a = Math.atan2(dx, dz) - heading;
        a = Math.atan2(Math.sin(a), Math.cos(a));
        if (Math.abs(a) > cone / 2) continue;
      }
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  private slash() {
    this.combo = this.comboT > 0 ? (this.combo % 3) + 1 : 1;
    this.comboT = 0.7;
    const finisher = this.combo === 3;
    this.hitCd = finisher ? DG.hitCd * 1.6 : DG.hitCd * 0.8;
    const range = DG.hitRange * this.mods.reach * (finisher ? 1.25 : 1);
    // soft lock: snap to the nearest enemy roughly in front and lunge at it
    const tgt = this.lock ?? this.nearestEnemy(range * 2.4, this.aim, 2.4);
    if (tgt) {
      const dx = tgt.x - this.px, dz = tgt.z - this.pz, d = Math.hypot(dx, dz) || 1;
      this.aim = Math.atan2(dx, dz);
      const lunge = clamp(d - range * 0.6, 0, finisher ? 1.8 : 1.1);
      if (lunge > 0) {
        const p = { x: this.px + (dx / d) * lunge, z: this.pz + (dz / d) * lunge };
        this.grid.resolve(p, 0.5);
        this.px = p.x; this.pz = p.z;
      }
    }
    const sweep = finisher ? 3.4 : 1.8;
    const arc = new THREE.Mesh(new THREE.RingGeometry(range * 0.4, range, 20, 1, -sweep / 2, sweep), new THREE.MeshBasicMaterial({ color: finisher ? 0xff7a2a : 0xffd24a, transparent: true, opacity: 0.75, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
    arc.rotation.x = -Math.PI / 2;
    arc.rotation.z = this.aim - Math.PI / 2;
    arc.position.set(this.px, 0.3, this.pz);
    this.root.add(arc);
    setTimeout(() => this.root.remove(arc), 110);
    if (finisher) sfx.boom(); else sfx.place();
    let landed = false;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.x - this.px, dz = e.z - this.pz, d = Math.hypot(dx, dz);
      if (d > range + e.r) continue;
      let a = Math.atan2(dx, dz) - this.aim;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      if (Math.abs(a) < sweep / 2 + 0.15 || d < 0.9) { this.damage(e, DG.hitDmg * this.mods.dmg * (finisher ? 1.8 : 1), finisher ? 2.2 : 0.8); landed = true; }
    }
    if (landed) { this.freeze = finisher ? 0.09 : 0.04; this.shakeAmt = Math.max(this.shakeAmt, finisher ? 0.3 : 0.1); }
    if (finisher) this.fx.ring(this.px, this.pz, 0.4, range, 0.25, 0xff7a2a, 0.7);
    // slashes cut Shady's code bolts out of the air
    for (const b of this.bolts) if (!b.fromPlayer && Math.hypot(b.x - this.px, b.z - this.pz) < range) b.life = 0;
  }

  /** the alarm: everything around you takes a hit and gets shoved back */
  private ring() {
    this.ringCd = DG.ringCd * this.mods.ringCd;
    sfx.alarm();
    this.fx.ring(this.px, this.pz, 0.5, DG.ringRadius, 0.35, 0xff7a2a, 0.9);
    this.shakeAmt = Math.max(this.shakeAmt, 0.35);
    this.freeze = 0.06;
    for (const e of this.enemies) if (e.alive && Math.hypot(e.x - this.px, e.z - this.pz) < DG.ringRadius + e.r) this.damage(e, DG.ringDmg * this.mods.dmg, 2.4);
  }

  private damage(e: Enemy, dmg: number, knock: number) {
    e.hp -= dmg;
    e.flash = 0.1;
    const dx = e.x - this.px, dz = e.z - this.pz, d = Math.hypot(dx, dz) || 1;
    if (e.kind !== 'kirill') { e.vx = (dx / d) * knock * 6; e.vz = (dz / d) * knock * 6; }
    this.fx.popup(e.x, 2, e.z, dmg >= 20 ? '2!' : dmg >= 12 ? '3-' : '4', dmg >= 20 ? 'grade-2' : 'grade-3');
    sfx.hurt();
    if (e.hp <= 0) {
      e.alive = false;
      this.root.remove(e.obj);
      this.fx.burst(e.x, e.z, e.kind === 'coffee' ? 0x6a3a1a : 0xf6f3ea, 8);
      sfx.kill();
      if (this.mods.vampire) this.hp = Math.min(this.maxHp, this.hp + this.mods.vampire);
      if (this.rng.chance(0.25)) this.dropHeart(e.x, e.z);
      if (e.kind === 'kirill') this.end(true);
    }
  }

  private tickEnemies(dt: number) {
    this.flowT -= dt;
    if (this.flowT <= 0) { this.flowT = 0.25; this.grid.computeFlow(this.px, this.pz, 0.6); }
    const dir = { x: 0, z: 0 };
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.t += dt; e.cd -= dt; e.act -= dt; e.flash -= dt;
      const dx = this.px - e.x, dz = this.pz - e.z, d = Math.hypot(dx, dz) || 1;
      let tx = dx / d, tz = dz / d;
      if (d > 1.6 && this.grid.flowDir(e.x, e.z, false, dir)) { tx = dir.x; tz = dir.z; }
      let speed = e.speed;
      switch (e.kind) {
        case 'shady':
          // keeps his distance and fires code bolts
          if (d < 5.5) { tx = -tx; tz = -tz; } else if (d < 7.5) speed = 0;
          if (e.act <= 0) { e.act = 2.3; this.shoot(e.x, e.z, Math.atan2(dx, dz), 8, 7); }
          break;
        case 'artem':
          if (e.act <= 0) {
            e.act = 3;
            for (const o of this.enemies) if (o.alive && o !== e && Math.hypot(o.x - e.x, o.z - e.z) < 4) o.hp = Math.min(o.maxHp, o.hp + 8);
            this.fx.ring(e.x, e.z, 0.4, 4, 0.5, 0x5fe07a, 0.6);
          }
          break;
        case 'notebook': {
          const s = Math.sin(e.t * 6) * 0.9;
          const ox = -tz * s, oz = tx * s;
          tx += ox; tz += oz;
          break;
        }
        case 'kirill':
          speed = this.bossTick(e, dt, dx, dz, d);
          break;
      }
      const l = Math.hypot(tx, tz) || 1;
      e.vx += ((tx / l) * speed - e.vx) * Math.min(1, dt * 6);
      e.vz += ((tz / l) * speed - e.vz) * Math.min(1, dt * 6);
      e.x += e.vx * dt; e.z += e.vz * dt;
      for (const o of this.enemies) {
        if (o === e || !o.alive) continue;
        const ox = e.x - o.x, oz = e.z - o.z, od = Math.hypot(ox, oz), min = e.r + o.r;
        if (od < min && od > 1e-4) { e.x += (ox / od) * (min - od) * 0.5; e.z += (oz / od) * (min - od) * 0.5; }
      }
      const p = { x: e.x, z: e.z };
      this.grid.resolve(p, e.r);
      e.x = p.x; e.z = p.z;
      // contact damage
      if (d < e.r + 0.6 && e.cd <= 0 && this.iframes <= 0 && e.t > 0.6) { e.cd = 1.0; this.hurt(e.dmg); }
      e.obj.position.set(e.x, e.kind === 'notebook' ? 0.6 + Math.sin(e.t * 4) * 0.2 : 0, e.z);
      if (e.rig) {
        e.rig.pose = e.kind === 'kirill' && e.act > 0 && this.telegraph ? 'throw' : Math.hypot(e.vx, e.vz) > 0.4 ? 'run' : 'idle';
        e.rig.faceTowards(Math.atan2(dx, dz), dt, 8);
        e.rig.update(dt, Math.hypot(e.vx, e.vz) / 3);
      } else e.obj.rotation.y += dt * 4;
      e.obj.scale.setScalar((e.kind === 'kirill' ? 1 : 1) * (e.flash > 0 ? 1.12 : 1));
    }
  }

  /** Kirill's boss pattern: highlighter beam, dash, summon coffee; faster after his All-Nighter at 50%. */
  private bossTick(e: Enemy, _dt: number, dx: number, dz: number, d: number) {
    const rage = this.bossAllNighter ? 1.4 : 1;
    if (!this.bossAllNighter && e.hp < e.maxHp / 2) {
      this.bossAllNighter = true;
      this.flash(t('an.title'));
      sfx.alarm();
      this.fx.ring(e.x, e.z, 0.5, 6, 0.6, 0x23c4b8, 0.9);
      for (let i = 0; i < 3; i++) this.spawnEnemy('coffee', e.x + (i - 1) * 1.5, e.z + 1);
    }
    if (this.telegraph) {
      // beam wind-up: the line follows the aim it locked
      if (e.act <= 0) {
        const a = this.telegraph.userData.a as number;
        const ux = Math.sin(a), uz = Math.cos(a);
        const px = this.px - e.x, pz = this.pz - e.z;
        const along = px * ux + pz * uz, perp = Math.abs(px * uz - pz * ux);
        if (along > 0 && along < 18 && perp < 0.7 && this.iframes <= 0) this.hurt(18);
        this.fx.beam(e.x, e.z, e.x + ux * 18, e.z + uz * 18, 0xb6ff3a, 0.25, 0.4);
        this.root.remove(this.telegraph);
        this.telegraph = null;
        e.act = 1.4 / rage;
        sfx.boom();
      }
      return 0;
    }
    if (e.act <= 0) {
      const roll = this.rng.next();
      if (roll < 0.45) {
        const a = Math.atan2(dx, dz);
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 18), new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.6, toneMapped: false }));
        line.position.set(e.x + Math.sin(a) * 9, 0.1, e.z + Math.cos(a) * 9);
        line.rotation.y = a;
        line.userData.a = a;
        this.root.add(line);
        this.telegraph = line;
        e.act = 0.75 / rage;
      } else if (roll < 0.75) {
        e.vx = (dx / d) * 16; e.vz = (dz / d) * 16;
        e.act = 1.6 / rage;
        sfx.place();
      } else if (roll < 0.9) {
        for (let i = 0; i < 2; i++) this.spawnEnemy('coffee', e.x + (i ? 1.2 : -1.2), e.z);
        e.act = 2 / rage;
      } else {
        for (const off of [-0.3, 0, 0.3]) this.shoot(e.x, e.z, Math.atan2(dx, dz) + off, 10, 8);
        e.act = 1.2 / rage;
      }
    }
    return d < 4 ? -e.speed * 0.6 * rage : e.speed * 0.5 * rage;
  }

  private shoot(x: number, z: number, a: number, speed: number, dmg: number) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: 0x5fe07a, toneMapped: false }));
    mesh.position.set(x, 1.0, z);
    mesh.rotation.y = a + Math.PI / 2;
    this.root.add(mesh);
    this.bolts.push({ mesh, x, z, vx: Math.sin(a) * speed, vz: Math.cos(a) * speed, dmg, life: 2.4, fromPlayer: false });
  }

  private tickBolts(dt: number) {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt;
      b.mesh.position.set(b.x, 1.0, b.z);
      if (!b.fromPlayer && Math.hypot(b.x - this.px, b.z - this.pz) < 0.7 && this.iframes <= 0) { this.hurt(b.dmg); b.life = 0; }
      if (this.grid.blocked(b.x, b.z) || Math.abs(b.x) > RW / 2 || Math.abs(b.z) > RH / 2) b.life = 0;
      if (b.life <= 0) { this.root.remove(b.mesh); this.bolts.splice(i, 1); }
    }
  }

  private hurt(dmg: number) {
    this.hp = Math.max(0, this.hp - dmg);
    this.iframes = 0.6;
    this.shakeAmt = Math.max(this.shakeAmt, 0.25);
    this.fx.popup(this.px, 2.4, this.pz, `−${dmg}`, 'grade-2');
    sfx.hurt();
  }

  private dropHeart(x: number, z: number) {
    const mesh = new THREE.Group();
    mesh.add(part(new THREE.SphereGeometry(0.22, 10, 8), 0xe8573a, { emissive: 0x501010 }));
    mesh.position.set(x, 0.5, z);
    this.root.add(mesh);
    this.hearts.push({ x, z, mesh });
  }

  private pickHearts() {
    for (let i = this.hearts.length - 1; i >= 0; i--) {
      const h = this.hearts[i];
      h.mesh.rotation.y += 0.05;
      if (Math.hypot(h.x - this.px, h.z - this.pz) < 0.9) {
        this.hp = Math.min(this.maxHp, this.hp + 20);
        this.root.remove(h.mesh);
        this.hearts.splice(i, 1);
        sfx.ding();
      }
    }
  }

  private checkRoomDone() {
    const r = this.room;
    if (r.cleared || (r.kind !== 'fight')) return;
    if (this.enemies.some((e) => e.alive)) return;
    if (--this.waves > 0) { this.spawnWave(); this.flash(t('dg.wave')); return; }
    r.cleared = true;
    this.cleared++;
    this.lockDoors(false);
    this.flash(t('dg.clear'));
    this.offerUpgrades();
  }

  /** walk into an open doorway to change rooms */
  private checkDoors() {
    if (this.enemies.some((e) => e.alive) && !this.room.cleared) return;
    for (const d of Object.keys(DOOR_POS) as Dir[]) {
      if (!this.room.doors[d]) continue;
      const p = DOOR_POS[d];
      const horiz = d === 'n' || d === 's';
      const nearEdge = horiz ? Math.abs(this.pz - p.z) < 0.9 && Math.abs(this.px) < 1.5 : Math.abs(this.px - p.x) < 0.9 && Math.abs(this.pz) < 1.5;
      const pushing = horiz ? Math.sign(this.pvz) === Math.sign(p.z) && this.pvz !== 0 : Math.sign(this.pvx) === Math.sign(p.x) && this.pvx !== 0;
      if (nearEdge && pushing) {
        const next = this.neighbor(d);
        if (next) { this.enter(next, d); this.labelRoom(); }
        return;
      }
    }
  }

  // ---------------------------------------------------------------- upgrades

  private offerUpgrades() {
    const options = this.rng.shuffle([...UPGRADES]).slice(0, 3);
    const card = el(`<div class="screen dg-choose"><div class="panel dg-choose-in"><h2>${t('dg.choose')}</h2><div class="dg-opts">${options.map((u, i) => `<button class="up" data-u="${u}"><b>${i + 1}</b><span class="u-n">${t('dg.up.' + u)}</span><small>${t('dg.upd.' + u)}</small></button>`).join('')}</div></div></div>`);
    card.addEventListener('click', (e) => {
      const u = (e.target as HTMLElement).closest('[data-u]')?.getAttribute('data-u') as Upgrade | undefined;
      if (!u) return;
      this.apply(u);
      card.remove();
      this.choosing = null;
    });
    document.getElementById('ui')!.appendChild(card);
    this.choosing = card;
    sfx.reveal();
  }

  private apply(u: Upgrade) {
    this.picked.push(u);
    switch (u) {
      case 'sharp': this.mods.dmg *= 1.25; break;
      case 'quick': this.mods.speed *= 1.15; break;
      case 'sturdy': this.maxHp += 25; this.hp = Math.min(this.maxHp, this.hp + 40); break;
      case 'alarm': this.mods.ringCd *= 0.7; break;
      case 'reach': this.mods.reach *= 1.25; break;
      case 'vampire': this.mods.vampire += 3; break;
      case 'dash': this.mods.dashCd *= 0.65; break;
    }
    sfx.levelUp();
  }

  /** Raised chase camera behind you (or behind the line to your lock target); pulls in at walls. */
  private placeCamera() {
    fitAspect(this.cam);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const want = 6.2;
    let dist = want;
    for (let d = 0.4; d <= want; d += 0.2) {
      const x = this.px - fx * d, z = this.pz - fz * d;
      if (Math.abs(x) > RW / 2 - 0.35 || Math.abs(z) > RH / 2 - 0.35 || this.grid.blocked(x, z)) { dist = Math.max(1.2, d - 0.35); break; }
    }
    // closer to the wall: rise higher so the view tips down instead of clipping
    const target = new THREE.Vector3(this.px - fx * dist, 2.4 + (want - dist) * 0.55 + dist * 0.32, this.pz - fz * dist);
    if (this.camPos.lengthSq() === 0) this.camPos.copy(target);
    this.camPos.lerp(target, 0.18);
    const sh = this.shakeAmt;
    this.shakeAmt *= 0.86;
    this.cam.position.set(this.camPos.x + (Math.random() - 0.5) * sh, this.camPos.y + (Math.random() - 0.5) * sh, this.camPos.z + (Math.random() - 0.5) * sh);
    if (this.lock) {
      const lx = (this.px + this.lock.x) / 2, lz = (this.pz + this.lock.z) / 2;
      this.cam.lookAt(lx, 0.9, lz);
    } else this.cam.lookAt(this.px + fx * 2.2, 0.8, this.pz + fz * 2.2);
  }

  // ---------------------------------------------------------------- HUD and end

  private labelRoom() {
    if (!this.hud) return;
    (this.hud.querySelector('.dg-room') as HTMLElement).textContent = t('dg.room.' + this.room.kind);
    this.hud.querySelector('.dg-boss')?.classList.toggle('hidden', this.room.kind !== 'boss' || this.room.cleared);
  }

  private flash(text: string) {
    const c = this.hud?.querySelector('.ar-center') as HTMLElement | null;
    if (!c) return;
    c.innerHTML = `<div class="ar-flash">${text}</div>`;
    setTimeout(() => { if (c.firstElementChild?.textContent === text) c.innerHTML = ''; }, 1600);
  }

  private end(win: boolean) {
    if (this.finished) return;
    this.finished = true;
    this.choosing?.remove();
    const score = this.cleared * 300 + (win ? 3000 + Math.round(this.hp * 10) + Math.max(0, Math.round(1500 - this.time * 5)) : 0);
    win ? sfx.levelUp() : sfx.debt();
    this.ctx.onExit({ mode: 'dungeon', win, score, detail: win ? t('dg.won', { s: Math.round(this.time) }) : t('dg.lost', { n: this.cleared }) });
  }

  render() {
    if (this.finished) return;
    this.me.position.set(this.px, Math.abs(Math.sin(this.time * 12)) * (Math.hypot(this.pvx, this.pvz) > 0.5 ? 0.12 : 0.03), this.pz);
    this.me.rotation.z = Math.sin(this.time * 30) * 0.05;
    this.me.rotation.y = this.aim;
    this.lockRing.visible = !!this.lock;
    if (this.lock) { this.lockRing.position.set(this.lock.x, 0.06, this.lock.z); this.lockRing.rotation.z += 0.04; }
    this.placeCamera();
    this.lamp.position.set(this.px, 2.6, this.pz);
    this.me.visible = this.iframes <= 0 || Math.floor(this.time * 20) % 2 === 0;
    this.aimMark.position.set(this.px + Math.sin(this.aim) * 1.3, 0.08, this.pz + Math.cos(this.aim) * 1.3);
    this.aimMark.rotation.z = -this.aim + Math.PI;
    const q = (s: string) => this.hud.querySelector(s) as HTMLElement;
    q('.hp').style.width = `${(this.hp / this.maxHp) * 100}%`;
    q('.hp-t').textContent = `${Math.ceil(this.hp)}/${this.maxHp}`;
    const boss = this.enemies.find((e) => e.kind === 'kirill' && e.alive);
    if (boss) q('.boss').style.width = `${(boss.hp / boss.maxHp) * 100}%`;
    for (const [sel, cd] of [['.sk-dash', this.dashCd], ['.sk-ring', this.ringCd]] as [string, number][]) {
      q(sel).classList.toggle('cooling', cd > 0);
      (q(sel).querySelector('.cd') as HTMLElement).textContent = cd > 0 ? cd.toFixed(0) : '';
    }
    (q('.sk-hit .combo') as HTMLElement).textContent = this.comboT > 0 ? '•'.repeat(this.combo) : '';
    q('.sk-lock').classList.toggle('on', !!this.lock);
    q('.dg-ups').textContent = this.picked.map((u) => t('dg.icon.' + u)).join(' ');
    // minimap
    const m = (q('.dg-map') as HTMLCanvasElement).getContext('2d')!;
    m.clearRect(0, 0, 96, 96);
    for (const r of this.rooms) {
      if (!r.visited && !this.rooms.some((o) => o.visited && Math.abs(o.cx - r.cx) + Math.abs(o.cy - r.cy) === 1)) continue;
      m.fillStyle = r === this.room ? '#ffd24a' : r.kind === 'boss' ? '#e8573a' : r.visited ? '#8a8f99' : '#3b3f47';
      m.fillRect(6 + r.cx * 30, 6 + r.cy * 30, 24, 24);
    }
  }

  /** for tests */
  get inputs() { return this.input; }
  get state() { return { hp: this.hp, room: this.room, enemies: this.enemies, choosing: this.choosing, px: this.px, pz: this.pz, rooms: this.rooms }; }
  teleportNear(x: number, z: number) { this.px = x; this.pz = z; }
  /** tests: turn to face a point */
  faceTo(x: number, z: number) { this.yaw = this.aim = Math.atan2(x - this.px, z - this.pz); }
  /** tests: walk through a door of the current room */
  goThrough(d: Dir) { const n = this.neighbor(d); if (n && this.room.doors[d]) this.enter(n, d); }
  pick(i = 0) { (this.choosing?.querySelectorAll('.up')[i] as HTMLElement | undefined)?.click(); }

  dispose() {
    this.input.dispose();
    this.hud?.remove();
    this.choosing?.remove();
    this.fx.clear();
    this.ctx.stage.clearWorld();
    if (this.ctx.stage.override?.camera === this.cam) this.ctx.stage.override = null;
    this.ctx.stage.scene.background = new THREE.Color(0x1d1a22);
    this.ctx.stage.setLighting('golden');
  }
}

/** turn an angle toward another by at most `step` radians */
function turnTo(a: number, b: number, step: number) {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + clamp(d, -step, step);
}

// ---------------------------------------------------------------- small models

function coffeeCup() {
  const g = new THREE.Group();
  g.add(at(part(cyl(0.28, 0.22, 0.55, 14), 0xf2efe6), 0, 0.3, 0));
  g.add(at(part(cyl(0.29, 0.29, 0.12, 14), 0x6a3a1a), 0, 0.5, 0));
  g.add(at(part(new THREE.TorusGeometry(0.13, 0.04, 6, 10), 0xf2efe6), 0.3, 0.3, 0));
  for (const x of [-0.09, 0.09]) g.add(at(part(new THREE.SphereGeometry(0.05, 8, 6), 0x1d1613, { outline: false }), x, 0.36, 0.26));
  return g;
}

function notebook() {
  const g = new THREE.Group();
  g.add(at(part(box(0.55, 0.06, 0.7), 0x2b5aa8), -0.22, 0, 0, 0, 0, 0.5));
  g.add(at(part(box(0.55, 0.06, 0.7), 0x2b5aa8), 0.22, 0, 0, 0, 0, -0.5));
  g.add(at(part(box(0.5, 0.04, 0.65), 0xf6f3ea, { outline: false }), 0, 0.03, 0));
  for (const x of [-0.12, 0.12]) g.add(at(part(new THREE.SphereGeometry(0.05, 8, 6), 0x1d1613, { outline: false }), x, 0.12, 0.3));
  return g;
}

function basementProp(kind: string, rng: Rng): THREE.Object3D {
  const g = new THREE.Group();
  if (kind === 'crate') {
    g.add(at(part(box(1.0, 0.9, 1.0), 0x9a6b3a), 0, 0.45, 0, 0, rng.range(-0.2, 0.2), 0));
    if (rng.chance(0.5)) g.add(at(part(box(0.7, 0.6, 0.7), 0xa87a4a), 0.05, 1.2, 0, 0, rng.range(-0.4, 0.4), 0));
  } else if (kind === 'washer') {
    g.add(at(part(box(0.95, 1.1, 0.9), 0xf2f0ea), 0, 0.55, 0));
    g.add(at(part(cyl(0.3, 0.3, 0.05, 18), 0x9fc6e6), 0, 0.55, 0.46, Math.PI / 2, 0, 0));
  } else if (kind === 'shelf') {
    g.add(at(part(box(1.8, 1.9, 0.55), 0x6e6a62), 0, 0.95, 0));
    for (let i = 0; i < 4; i++) g.add(at(part(box(0.4, 0.35, 0.4), rng.pick([0x9a6b3a, 0x2b3f6b, 0xc0392b])), -0.6 + i * 0.4, 0.4 + (i % 2) * 0.8, 0.05));
  } else if (kind === 'boiler') {
    g.add(at(part(cyl(0.55, 0.55, 2.2, 16), 0x8a8f99), 0, 1.1, 0));
    g.add(at(part(cyl(0.12, 0.12, 0.8, 8), 0xb0703a), 0.6, 1.6, 0, 0, 0, Math.PI / 2));
  } else return PROPS.plant.build(rng);
  return g;
}

