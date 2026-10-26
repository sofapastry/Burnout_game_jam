// Headless check of the four arcade modes with simple bots. `npm run smoke:arcade [mode] [--idle]`
import { win } from './dom-shim';
import { loadModels } from './load-models';
// the real rigged character models, so the tests drive BoneRig like the game does
console.log('models: ' + ((await loadModels()).join(', ') || 'none (placeholders)'));
import * as THREE from 'three';
import { PartyFight } from '../src/arcade/fight';
import { PERace } from '../src/arcade/race';
import { SemesterRun } from '../src/arcade/run';
import { DormDungeon } from '../src/arcade/dungeon';
import { ThePresentation } from '../src/arcade/presentation';
import { VersusFight } from '../src/arcade/versus';
import { LectureDrone } from '../src/arcade/drone';
import { BossArena } from '../src/boss/arena';
import { SPELLS, ULT } from '../src/boss/spells';
import { MOVE_CD } from '../src/boss/bosses';
import type { BossId } from '../src/boss/bosses';
import type { ArcadeResult, ModeId } from '../src/arcade/common';
import { randomKirillLook } from '../src/hero/look';
import { Rng } from '../src/core/rng';

const scene = new THREE.Scene();
const world = new THREE.Group();
scene.add(world);
let aimAt: { x: number; z: number } | null = null;
const stage = {
  scene, world,
  renderer: { domElement: win.document.getElementById('view') },
  camera: new THREE.PerspectiveCamera(), fpCam: new THREE.PerspectiveCamera(),
  view: 'top', override: null as unknown,
  setArena() {}, setLighting() {}, dim() {}, shake() {}, closeUp() {}, sweep() {}, punch() {}, direct() {}, showcase() {}, sun: { intensity: 1 }, hemi: { intensity: 1 }, post: { setLook() {}, resetLook() {} },
  groundPoint: () => (aimAt ? new THREE.Vector3(aimAt.x, 0, aimAt.z) : null),
  crosshairPoint: () => null,
  toScreen: (_p: unknown, out = { x: 0, y: 0 }) => out,
  clearWorld() { world.clear(); },
  get active() { return this.camera; },
};

const idle = process.argv.includes('--idle');
// --story: the shorter versions played between semester weeks
const story = process.argv.includes('--story') ? { look: randomKirillLook(new Rng(7)), level: 3 } : undefined;
const ALL: ModeId[] = ['boss', 'fight', 'race', 'run', 'dungeon', 'show', 'drone', 'versus', 'show2'];
const only = process.argv.slice(2).find((a) => (ALL as string[]).includes(a)) as ModeId | undefined;
const modes: ModeId[] = only ? [only] : ALL;
let failed = 0;
const DT = 1 / 60;

/** click every [data-key] button in the HUD and check its key registers */
function checkButtons(id: string, pressed: () => { has(k: string): boolean }) {
  const btns = [...win.document.querySelectorAll('#ui [data-key]')] as HTMLElement[];
  const bad: string[] = [];
  for (const b of btns) {
    b.dispatchEvent(new win.PointerEvent('pointerdown', { bubbles: true }) as unknown as Event);
    if (!pressed().has(b.dataset.key!)) bad.push(b.dataset.key!);
    b.dispatchEvent(new win.PointerEvent('pointerup', { bubbles: true }) as unknown as Event);
  }
  console.log(`  ${id}: ${btns.length} clickable buttons${bad.length ? ' · NOT WORKING: ' + bad.join(',') : ' · all register'}`);
  if (!btns.length || bad.length) failed++;
}

for (const id of modes) {
  let result: ArcadeResult | null | undefined;
  const ctx = { stage: stage as never, story, onExit: (r: ArcadeResult | null) => { result = r; } };
  let t = 0;
  let error = '';
  try {
    if (id === 'fight') {
      const m = new PartyFight(ctx);
      let checked = false;
      while (result === undefined && t < 400) {
        if (!checked && m.current) { checked = true; checkButtons('fight', () => (m.current as unknown as { pressed: Set<string> }).pressed); }
        const d = m.current as unknown as { autoplay: boolean; keys: Set<string>; pressed: Set<string>; player: { x: number; special: number }; kirill: { x: number; state: string } } | null;
        // the player side plays with the same AI as Kirill (jumps, crouches, combos)
        if (d && !idle && process.env.DUMBBOT === undefined) d.autoplay = true;
        else if (d && !idle) {
          d.keys.clear();
          const dx = d.kirill.x - d.player.x;
          if (Math.abs(dx) > 1.3) d.keys.add(dx > 0 ? 'd' : 'a');
          else if (d.kirill.state === 'attack' && Math.random() < 0.5) d.keys.add('l');
          else if (Math.random() < 0.12) d.pressed.add(Math.random() < 0.55 ? 'j' : 'k');
          if (d.player.special >= 100) d.pressed.add(' ');
        }
        m.update(DT); m.render(); t += DT;
      }
      m.dispose();
    } else if (id === 'race') {
      const m = new PERace(ctx);
      checkButtons('race', () => (m.inputs as unknown as { pressed: Set<string> }).pressed);
      m.autopilot = !idle;
      while (result === undefined && t < 200) {
        m.update(DT); m.render(); t += DT;
      }
      m.dispose();
    } else if (id === 'boss') {
      // You are the Boss: the bot plays a few bosses in their arenas
      // the campaign's fights: real maps, duo bosses, Artem helping Kirill; the finale in the Tree arena
      const fights: [BossId, number, string | undefined, BossId | undefined][] = [['shady', 1, 'foyer', undefined], ['pasha', 2, 'lecture', 'grisha'], ['sonya', 11, 'assembly', 'masha'], ['finalExam', 15, undefined, undefined]];
      const lines: string[] = [];
      let last: ArcadeResult | null | undefined;
      for (const [boss, weekId, map, partner] of fights) {
        result = undefined;
        const m = new BossArena(ctx, { boss, weekId, level: 3, weekNum: weekId, look: story?.look, map, partner, artem: true });
        m.autopilot = !idle;
        let tt = 0;
        while (result === undefined && tt < 340) { m.update(DT); m.render(); tt += DT; }
        const s = m.state;
        lines.push(`${boss}${partner ? '+' + partner : ''}${map ? ' @' + map : ' @tree'}: ${result === undefined ? 'NEVER ENDED' : (result as ArcadeResult).win ? 'WIN' : 'LOSS'} ${tt.toFixed(0)}s (boss ${s.bossHp.toFixed(0)} hp, Kirill ${s.kirillHp.toFixed(0)} hp, ${s.hits} hits, estus left ${s.estus}, attempt ${s.attempt}, learned ${s.learned.join('+') || '—'})`);
        m.dispose();
        t += tt;
        last = result;
        if (result === undefined) break;
      }
      for (const l of lines) console.log('  ' + l);
      // every boss's two aimed spells and its ultimate, cast on Kirill and run to the end
      let cast = 0;
      for (const boss of Object.keys(SPELLS) as BossId[]) {
        result = undefined;
        const m = new BossArena(ctx, { boss, weekId: 1, level: 3, weekNum: 3, map: 'foyer' });
        for (let i = 0; i < 4 / DT; i++) { m.update(DT); m.render(); }
        for (const id of [...SPELLS[boss], ULT[boss]]) {
          const s = m.state;
          (m as unknown as { spells: { cast(id: string, x: number, z: number, fx: number, fz: number): void } }).spells.cast(id, s.kx, s.kz, s.bx, s.bz);
          for (let i = 0; i < 7 / DT && result === undefined; i++) { m.update(DT); m.render(); }
          cast++;
        }
        m.dispose();
      }
      // and every signature move's look
      {
        const m = new BossArena(ctx, { boss: 'shady', weekId: 1, level: 3, weekNum: 3, map: 'foyer' });
        const sp = (m as unknown as { spells: { moveFx(id: string, at: () => { x: number; z: number; yaw: number }, kx: number, kz: number): void } }).spells;
        for (const id of Object.keys(MOVE_CD)) { const s = m.state; sp.moveFx(id, () => ({ x: s.bx, z: s.bz, yaw: 0 }), s.kx, s.kz); }
        for (let i = 0; i < 6 / DT; i++) { m.update(DT); m.render(); }
        m.dispose();
      }
      console.log(`  spells: ${cast} cast (2 aimed + 1 ultimate for each of ${Object.keys(SPELLS).length} bosses)`);
      result = last;
    } else if (id === 'drone') {
      const m = new LectureDrone(ctx);
      checkButtons('drone', () => (m.inputs as unknown as { pressed: Set<string> }).pressed);
      m.inputs.endFrame();
      m.autopilot = !idle;
      while (result === undefined && t < 200) { m.update(DT); m.render(); t += DT; }
      if (!idle) console.log(`  drone: drowsy ${m.state.drowsy.toFixed(0)}, best combo ${m.state.best}, hits ${m.state.hits}/${m.state.total}`);
      m.dispose();
    } else if (id === 'versus') {
      // two humans on one keyboard: drive P1 with the boss keys and P2 with arrows and , . /
      const m = new VersusFight(ctx);
      m.choose('dean');
      const press = (k: string) => win.dispatchEvent(new win.KeyboardEvent('keydown', { key: k.startsWith('c:') ? '' : k, code: k.startsWith('c:') ? k.slice(2) : '' }) as unknown as Event);
      const release = (k: string) => win.dispatchEvent(new win.KeyboardEvent('keyup', { key: k.startsWith('c:') ? '' : k, code: k.startsWith('c:') ? k.slice(2) : '' }) as unknown as Event);
      let p2hits = 0;
      while (result === undefined && t < 300) {
        const d = m.current as unknown as { player: { x: number }; kirill: { x: number; state: string } } | null;
        if (d && !idle) {
          const dx = d.kirill.x - d.player.x;
          for (const k of ['a', 'd', 'arrowleft', 'arrowright']) release(k);
          if (Math.abs(dx) > 1.3) { press(dx > 0 ? 'd' : 'a'); press(dx > 0 ? 'arrowleft' : 'arrowright'); }
          if (Math.random() < 0.08) { const k = Math.random() < 0.5 ? 'j' : 'k'; press(k); release(k); }
          if (Math.random() < 0.08) { const k = Math.random() < 0.5 ? 'c:Comma' : 'c:Period'; press(k); release(k); p2hits++; }
        }
        m.update(DT); m.render(); t += DT;
      }
      if (!idle) console.log(`  versus: player 2 pressed , and . ${p2hits} times`);
      m.dispose();
    } else if (id === 'show2') {
      // player 2 Kirill: covers his eyes when the reticle is on him, points the commission at whoever is acting
      const m = new ThePresentation({ ...ctx, twoPlayer: true });
      m.autopilot = !idle;
      const press = (code: string, key = '') => win.dispatchEvent(new win.KeyboardEvent('keydown', { key, code }) as unknown as Event);
      const release = (code: string, key = '') => win.dispatchEvent(new win.KeyboardEvent('keyup', { key, code }) as unknown as Event);
      let accusations = 0;
      while (result === undefined && t < 200) {
        if (!idle) {
          if (Math.random() < 0.01) { press(Math.random() < 0.5 ? 'Comma' : 'Period'); accusations++; }
          if (Math.random() < 0.02) press('', 'arrowdown'); else if (Math.random() < 0.05) release('', 'arrowdown');
        }
        m.update(DT); m.render(); t += DT;
        for (const c of ['Comma', 'Period']) release(c);
      }
      if (!idle) console.log(`  show2: grade ${m.state.grade}, slide ${m.state.slide + 1}, strikes ${m.state.strikes}, P2 accusations ${accusations}`);
      m.dispose();
    } else if (id === 'show') {
      const m = new ThePresentation(ctx);
      checkButtons('show', () => (m.inputs as unknown as { pressed: Set<string> }).pressed);
      if (!idle) {
        // like a player: move the real mouse onto his face, click (flash), then hold the laser on him
        const canvas = win.document.getElementById('view')!;
        const mouse = (type: string, x: number, y: number, button = 0) => canvas.dispatchEvent(new win.MouseEvent(type, { clientX: x, clientY: y, button, bubbles: true }) as unknown as Event);
        m.inputs.endFrame();
        while (m.state.composure > 0 && t < 4) { m.update(DT); m.render(); t += DT; }
        let c0 = m.state.composure;
        for (let i = 0; i < 400 && m.facing !== 'hall'; i++) { m.update(DT); m.render(); t += DT; }
        let h = m.headScreen();
        mouse('mousemove', h.x, h.y); mouse('mousedown', h.x, h.y); mouse('mouseup', h.x, h.y);
        m.update(DT); m.render(); t += DT;
        const flashDrop = c0 - m.state.composure;
        for (let i = 0; i < 400 && m.facing !== 'hall'; i++) { m.update(DT); m.render(); t += DT; }
        c0 = m.state.composure;
        m.inputs.press('e');
        for (let i = 0; i < 40; i++) { h = m.headScreen(); mouse('mousemove', h.x, h.y); m.update(DT); m.render(); t += DT; }
        const laserDrop = c0 - m.state.composure;
        m.inputs.press('e');
        console.log(`  mouse test: flash on his face −${flashDrop.toFixed(1)} composure · laser on his face for 0.66 s −${laserDrop.toFixed(1)}`);
        if (flashDrop <= 0 || laserDrop <= 0) { console.log('  MOUSE AIM BROKEN'); failed++; }
      }
      m.autopilot = !idle;
      while (result === undefined && t < 200) { m.update(DT); m.render(); t += DT; }
      if (!idle) console.log(`  presentation: grade ${m.state.grade}, slide ${m.state.slide + 1}, strikes ${m.state.strikes}`);
      m.dispose();
    } else if (id === 'run') {
      const m = new SemesterRun(ctx);
      checkButtons('run', () => (m.inputs as unknown as { pressed: Set<string> }).pressed);
      while (result === undefined && t < 200) {
        if (!idle) {
          const s = m.state;
          const LANE = 2.2;
          for (const o of s.obstacles) {
            const ahead = s.z - o.z;
            if (ahead < 0 || ahead > 9 || o.lane !== s.lane) continue;
            if (o.kind === 'block') {
              const blocked = new Set(s.obstacles.filter((b) => b.kind === 'block' && Math.abs(b.z - o.z) < 0.5).map((b) => b.lane));
              const free = [-1, 0, 1].filter((l) => !blocked.has(l)).sort((a, b) => Math.abs(a - s.lane) - Math.abs(b - s.lane))[0];
              if (free !== undefined && free !== s.lane) m.inputs.press(free < s.lane ? 'a' : 'd');
            } else if (o.kind === 'low' && ahead < 2.6) m.inputs.press('w');
            else if (o.kind === 'high' && ahead < 2.2) m.inputs.press('s');
          }
          // sabotage: drop a trap whenever there's ammo (a burst of two now and then), boost when rich
          if (s.chaos >= 3 && Math.random() < 0.03) m.inputs.press(['j', 'k', 'l'][Math.floor(Math.random() * 3)]);
          if (s.chaos >= 11) m.inputs.press('shift');
          if (s.mails >= 3) m.inputs.press('e');
          void LANE;
        }
        m.update(DT); m.render(); t += DT;
      }
      m.dispose();
    } else {
      const m = new DormDungeon(ctx);
      checkButtons('dungeon', () => (m.inputs as unknown as { pressed: Set<string> }).pressed);
      m.inputs.endFrame();
      let rooms = 0;
      let bestD = Infinity, stall = 0, sidestep = 0, sideKey = 'w';
      while (result === undefined && t < 400) {
        const s = m.state;
        if (s.choosing) m.pick(Math.floor(Math.random() * 3));
        if (!idle) {
          const k = m.inputs.keys;
          k.clear();
          const foe = s.enemies.filter((e) => e.alive).sort((a, b) => Math.hypot(a.x - s.px, a.z - s.pz) - Math.hypot(b.x - s.px, b.z - s.pz))[0];
          m.botMove = null;
          if (foe) {
            m.faceTo(foe.x, foe.z);
            const dx = foe.x - s.px, dz = foe.z - s.pz, d = Math.hypot(dx, dz);
            // straight at it; if that stops working (a crate in the way), sidestep for a moment
            if (d < bestD - 0.3) { bestD = d; stall = 0; } else stall += DT;
            if (stall > 1.0) { sidestep = 0.7; stall = 0; bestD = d; sideKey = Math.random() < 0.5 ? (Math.abs(dx) > Math.abs(dz) ? 'w' : 'a') : (Math.abs(dx) > Math.abs(dz) ? 's' : 'd'); }
            if (sidestep > 0) { sidestep -= DT; m.botMove = { x: sideKey === 'a' || sideKey === 'w' ? -dz / d : dz / d, z: sideKey === 'a' || sideKey === 'w' ? dx / d : -dx / d }; }
            else if (d > 1.4) m.botMove = { x: dx / d, z: dz / d };
            if (d < 2.2) m.inputs.press('j');
            if (d < 3) m.inputs.press(' ');
          } else if (!s.choosing && (s.room.cleared || s.room.kind === 'start' || s.room.kind === 'treasure')) {
            // head for the boss room: breadth-first search over the room tree, take the first step
            const D = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] } as const;
            type R = typeof s.room;
            const find = (cx: number, cy: number) => s.rooms.find((r) => r.cx === cx && r.cy === cy);
            const prev = new Map<R, [R, keyof typeof D]>();
            const q: R[] = [s.room];
            const seen = new Set<R>([s.room]);
            while (q.length) {
              const r = q.shift()!;
              for (const d of Object.keys(D) as (keyof typeof D)[]) {
                const n = r.doors[d] ? find(r.cx + D[d][0], r.cy + D[d][1]) : undefined;
                if (n && !seen.has(n)) { seen.add(n); prev.set(n, [r, d]); q.push(n); }
              }
            }
            let cur = s.rooms.find((r) => r.kind === 'boss')!;
            let step: keyof typeof D | null = null;
            while (prev.has(cur)) { const [p, d] = prev.get(cur)!; if (p === s.room) { step = d; break; } cur = p; }
            if (step) { m.goThrough(step); rooms++; }
          }
        }
        m.update(DT); m.render(); t += DT;
      }
      if (!idle) console.log(`  dungeon bot walked through ${rooms} doors, hp ${Math.round(m.state.hp)}`);
      if (result === undefined) {
        const s = m.state;
        console.log(`  STUCK in ${s.room.kind} room (${s.room.cx},${s.room.cy}) depth ${s.room.depth} cleared=${s.room.cleared} choosing=${!!s.choosing} player (${s.px.toFixed(1)},${s.pz.toFixed(1)})`);
        for (const e of s.enemies.filter((e) => e.alive)) console.log(`    alive ${e.kind} at (${e.x.toFixed(1)},${e.z.toFixed(1)}) hp ${e.hp.toFixed(0)}`);
      }
      m.dispose();
    }
  } catch (e) {
    error = (e as Error).stack?.split('\n').slice(0, 7).join('\n') ?? String(e);
  }
  const r = result as ArcadeResult | null | undefined;
  const status = error ? 'CRASH' : r === undefined ? 'NEVER ENDED' : r ? (r.win ? 'WIN' : 'LOSS') : 'quit';
  // idle in the dungeon you just stand in the peaceful first room: never ending is expected
  if (error || (r === undefined && !(idle && id === 'dungeon'))) failed++;
  console.log(`${id.padEnd(8)} ${status.padEnd(11)} after ${t.toFixed(1)}s · score ${r?.score ?? '-'} · ${r?.detail ?? ''}`);
  if (error) console.log('   ' + error.replace(/\n/g, '\n   '));
}
console.log(failed ? `\n${failed} mode(s) failed` : '\nall modes ran');
process.exit(failed ? 1 : 0);
