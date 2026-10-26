// Headless smoke test: play every week for real (rules, AI, cards, skills, possession, render code)
// with a stub renderer, and report crashes or weeks that never end. `npm run smoke [weekId]`.
import { win } from './dom-shim';
import { loadModels } from './load-models';
// the real rigged character models, so the tests drive BoneRig like the game does
console.log('models: ' + ((await loadModels()).join(', ') || 'none (placeholders)'));
import * as THREE from 'three';
import { Semester, SHORT_SEMESTER } from '../src/game/semester';
import { WeekRun } from '../src/game/week';
import type { WeekResult } from '../src/game/semester';
import type { CardId } from '../src/data/cards';
import { setLang } from '../src/i18n';

const scene = new THREE.Scene();
const world = new THREE.Group();
scene.add(world);
const canvas = win.document.getElementById('view');
const stage = {
  scene, world,
  renderer: { domElement: canvas },
  camera: new THREE.PerspectiveCamera(),
  fpCam: new THREE.PerspectiveCamera(),
  view: 'top',
  setArena() {}, setLighting() {}, dim() {}, shake() {}, closeUp() {}, sweep() {}, punch() {}, direct() {}, showcase() {}, sun: { intensity: 1 }, hemi: { intensity: 1 }, post: { setLook() {}, resetLook() {} },
  groundPoint: () => null,
  crosshairPoint: () => null,
  toScreen: (_p: unknown, out = { x: 0, y: 0 }) => out,
  clearWorld() { world.clear(); },
  get active() { return this.camera; },
};

const weekArg = process.argv.slice(2).find((a) => /^\d+$/.test(a));
const all = process.argv.includes('--all');
// --story: the campaign's horde stages (Soul Jump: always inside a unit, jumping between them)
const story = process.argv.includes('--story');
const only = weekArg ? [+weekArg] : story ? [1, 3, 2, 14, 11, 15] : all ? Array.from({ length: 15 }, (_, i) => i + 1) : SHORT_SEMESTER;
const langs = process.argv.includes('--ru') ? ['ru'] : ['en'];
// --idle: no cards or skills — Kirill alone should pass every week (his objectives are reachable)
const idle = process.argv.includes('--idle');
let failed = 0;

for (const lang of langs) {
  setLang(lang as 'en' | 'ru');
  for (const id of only) {
    const sem = story ? new Semester('SMOKE-' + id, 1, false, { style: 'story' }) : new Semester('SMOKE-' + id, 1, !SHORT_SEMESTER.includes(id));
    sem.slot = sem.order.indexOf(id);
    sem.deck = (['popQuiz', 'deadline', 'pasha', 'partner', 'guard', 'medBall', 'ticket'] as CardId[]).map((c) => ({ id: c, level: 2 + (id % 2) }));
    const pool = sem.deck.map((d) => d.id);
    sem.loadout = [pool[id % 7], pool[(id + 2) % 7], pool[(id + 4) % 7]];
    sem.artemHelped = !idle;
    let result: WeekResult | null = null;
    const errors: string[] = [];
    let w: WeekRun;
    try {
      w = new WeekRun(stage as never, sem, (r) => (result = r));
    } catch (e) {
      console.log(`week ${id}: CONSTRUCTOR FAILED\n${(e as Error).stack}`);
      failed++;
      continue;
    }
    const rnd = () => Math.random();
    let t = 0, step = 0, cards = 0, possessed = false, dueled = false, skills = 0;
    let fought = { hits: 0, coins: 0 };
    const counts: Record<string, number> = {};
    while (!result && t < 220) {
      try {
        if (w.race) {
          // the PE week's norm race: autopilot plays Nina's skills (idle: she just runs)
          dueled = true;
          w.race.autopilot = !idle || !!process.env.DUELBOT;
          w.update(1 / 60);
          w.render();
          t += 1 / 60;
          step++;
          continue;
        }
        if (w.duel) {
          dueled = true;
          // a simple duel bot: walk in, punch/kick, block when Kirill swings, special when ready
          const d = w.duel as unknown as { keys: Set<string>; pressed: Set<string>; player: { x: number; special: number }; kirill: { x: number; state: string } };
          d.keys.clear();
          // DUELBOT=1 with --idle: no horde phase, but fight the duel (a fair fight against a fresh Kirill)
          if (!idle || process.env.DUELBOT) {
            const dx = d.kirill.x - d.player.x;
            if (Math.abs(dx) > 1.2) d.keys.add(dx > 0 ? 'd' : 'a');
            else if (d.kirill.state === 'attack' && Math.random() < 0.5) d.keys.add('l');
            else if (step % 9 === 0) d.pressed.add(Math.random() < 0.6 ? 'j' : 'k');
            if (d.player.special >= 100) d.pressed.add(' ');
          }
          w.update(1 / 60);
          t += 1 / 60;
          step++;
          continue;
        }
        if (!idle && step % 25 === 0 && !w.ended) {
          const slot = w.hand[Math.floor(rnd() * w.hand.length)];
          const p = w.grid.randomFree(rnd);
          if (p) {
            // go through the same placement rules as a click (route checks, office zone…)
            const spot = (w as unknown as { spawnSpot(c: CardId, x: number, z: number): { x: number; z: number } | null }).spawnSpot(slot.card, p.x, p.z);
            if (spot) { w.playCard(slot.card, slot.level, spot.x, spot.z); cards++; counts[slot.card] = (counts[slot.card] ?? 0) + 1; }
          }
        }
        // the random bot rarely steers the gaze well: force a sighting so the Dean's duel gets exercised
        if (!idle && id === 10 && step === 1150) (w.rules as unknown as { suspicion: number }).suspicion = 400;
        if (!idle && step % 300 === 150) for (const k of ['q', 'w', 'e'] as const) w.useSkill(k);
        if (story && w.soul) {
          // the soul bot: always in a body; run at him, combo, jump to the next body now and then
          const P = w.possess;
          if (P.active) {
            possessed = true;
            const u = P.unit!, k = w.kirill;
            P.keys.add('w');
            P.yaw = Math.atan2(-(k.x - u.x), -(k.z - u.z));
            if (!idle && step % 9 === 0) P.attack();
            if (!idle && step % 140 === 70) w.soul.jump();
            if (!idle && step % 200 === 100) { P.skill(step % 400 === 100 ? 0 : 1); skills++; }
            fought = { hits: P.hits, coins: P.coins };
          }
        } else if (!idle && step >= 420 && step < 700 && !possessed && step % 20 === 0) {
          // a melee unit (a Deadline would just detonate on the first swing)
          const canP = (w.possess.constructor as unknown as { canPossess(u: unknown): boolean }).canPossess;
          const u = w.horde.units.find((x) => canP(x) && x.kind !== 'deadline');
          if (u) { w.possess.enter(u); possessed = true; w.possess.keys.add('w'); }
        }
        // fight in person: face Kirill, run in, combo, dash now and then, grab the coins, try the other camera
        const P = w.possess;
        if (!story && P.active && step > 420 && step < 1100) {
          const u = P.unit!, k = w.kirill;
          const d = Math.hypot(k.x - u.x, k.z - u.z);
          const coin = w.pickups.nearest(u.x, u.z, 5);
          const tx = coin && d < 2.5 && step % 120 > 60 ? coin.x : k.x, tz = coin && d < 2.5 && step % 120 > 60 ? coin.z : k.z;
          P.yaw = Math.atan2(-(tx - u.x), -(tz - u.z));
          if (step % 9 === 0) P.attack();
          if (step % 150 === 0) P.dash();
          if (step === 600) P.toggleView();
          fought = { hits: P.hits, coins: P.coins };
          if (process.env.TRACEP && step % 30 === 0) console.log(`  [p] step ${step} d=${d.toFixed(2)} unit ${u.kind} spd ${u.speed.toFixed(1)} v=${Math.hypot(u.vx, u.vz).toFixed(1)} hp ${u.hp} hits ${P.hits} kirill stun ${k.stun.toFixed(1)}`);
        }
        if (!story && step === 1100 && w.possess.active) w.togglePossess();
        w.update(1 / 60);
        w.render();
        if (process.env.TRACE && step % 120 === 0) {
          const k = w.kirill;
          console.log(`  t=${t.toFixed(0).padStart(2)} kirill (${k.x.toFixed(1)}, ${k.z.toFixed(1)}) sit=${k.sitting} drag=${k.drag.toFixed(1)} stun=${k.stun.toFixed(1)} pose=${k.rig.pose} meter="${w.rules.meterText()}" guests=${w.guests.map((g) => g.name).join(',')}`);
        }
      } catch (e) {
        errors.push(`t=${t.toFixed(2)}s: ${(e as Error).stack?.split('\n').slice(0, 6).join('\n')}`);
        break;
      }
      t += 1 / 60;
      step++;
    }
    const r = result as WeekResult | null;
    const status = errors.length ? 'CRASH' : r ? (r.debt ? 'DEBT' : 'passed') : 'NEVER ENDED';
    if (errors.length || !r) failed++;
    console.log(`week ${String(id).padStart(2)} ${w.def.title.padEnd(40)} ${status.padEnd(11)} at ${t.toFixed(1)}s · meter "${w.rules.meterText()}" · ${cards} cards · combo ${w.maxCombo} · ${dueled ? 'DUEL' : 'no duel'} · possessed ${possessed}${possessed ? ` (hits ${fought.hits}, coins ${fought.coins})` : ''}${w.soul ? ` · soul jumps ${w.soul.jumps}, unit skills ${skills}` : ''}`);
    if (errors.length) console.log('   ' + errors[0].replace(/\n/g, '\n   '));
    try { w.dispose(); } catch (e) { console.log(`week ${id}: dispose failed ${(e as Error).message}`); failed++; }
  }
}
console.log(failed ? `\n${failed} week(s) failed` : '\nall weeks ran');
process.exit(failed ? 1 : 0);
