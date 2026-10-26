// Click through the real menus headless: main menu → Dean's Office → Quick game → a week with
// the pause menu (restart, quit) → Arcade → every mode's card. Catches wiring crashes the
// per-mode smokes can't see. `npm run smoke:flow`
import { win } from './dom-shim';
import { loadModels } from './load-models';
import * as THREE from 'three';
import { Game } from '../src/game/flow';

(globalThis as Record<string, unknown>).location ??= win.location;
await loadModels();
const scene = new THREE.Scene();
const world = new THREE.Group();
scene.add(world);
const stage = {
  scene, world, renderer: { domElement: win.document.getElementById('view') },
  camera: new THREE.PerspectiveCamera(), fpCam: new THREE.PerspectiveCamera(), view: 'top', override: null as unknown,
  setArena() {}, setLighting() {}, dim() {}, shake() {}, closeUp() {}, sweep() {}, punch() {}, direct() {}, showcase() {}, sun: { intensity: 1 }, hemi: { intensity: 1 }, post: { setLook() {}, resetLook() {} },
  groundPoint: () => null, crosshairPoint: () => null, toScreen: (_p: unknown, out = { x: 0, y: 0 }) => out,
  clearWorld() { world.clear(); }, get active() { return this.camera; },
};
const game = new Game(stage as never);
const ui = win.document.getElementById('ui')!;
const steps: string[] = [];
let failed = 0;
const click = (sel: string, label: string) => {
  const el = ui.querySelector(sel) as HTMLElement | null;
  if (!el) { console.log(`  ✗ ${label}: no ${sel}`); failed++; return false; }
  el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }) as unknown as Event);
  steps.push(label);
  return true;
};
const run = (sec: number) => { for (let i = 0; i < sec * 60; i++) { game.update(1 / 60); game.render(); } };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

try {
  game.start();
  run(0.5);
  click('[data-a=deans]', "Dean's Office");
  const perks = ui.querySelectorAll('[data-perk]').length;
  click('[data-a=back]', 'back to the menu');
  // the new default: a boss-style semester
  click('[data-a=quick]', 'Quick game (boss)');
  // first time: the prologue plays all the way through (every shot builds and runs)
  const proOn = !!ui.querySelector('.pro');
  let shotsSeen = 0, lastCard = '';
  for (let i = 0; i < 60 * 60 && ui.querySelector('.pro'); i++) {
    game.update(1 / 60); game.render();
    const card = (ui.querySelector('.pc-name') as HTMLElement | null)?.textContent ?? '';
    if (card && card !== lastCard) { lastCard = card; shotsSeen++; }
  }
  steps.push(`prologue played: ${proOn}, characters met: ${shotsSeen}, finished: ${!ui.querySelector('.pro')}`);
  if (!proOn || shotsSeen < 8 || ui.querySelector('.pro')) failed++;
  click('[data-a=go]', 'start the semester');
  // the boss title card (with Kirill's diary): a click starts the fight
  const diary = !!ui.querySelector('.tc-diary');
  steps.push(`diary on the title card: ${diary}`);
  if (!diary) failed++;
  (ui.querySelector('.boss-card') as HTMLElement)?.dispatchEvent(new win.MouseEvent('click', { bubbles: true }) as unknown as Event);
  run(4);
  const ga = game as unknown as { arcade: { constructor: { name: string }; state?: { bossHp: number } } | null };
  const bossOn = ga.arcade?.constructor.name === 'BossArena';
  steps.push(`boss arena running: ${bossOn}`);
  if (!bossOn) failed++;
  win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape' }) as unknown as Event);
  run(0.1);
  win.dispatchEvent(new win.KeyboardEvent('keyup', { key: 'Escape' }) as unknown as Event);
  click('.bs-pause [data-pz=quit]', 'boss pause → quit');
  run(0.5);
  // the classic horde semester still works
  click('[data-a=classic]', 'Classic semester');
  click('[data-a=go]', 'start the classic semester');
  await wait(2300); // the title card
  run(3);
  const g = game as unknown as { week: { togglePause(): void; onMenu?: (a: string) => void; paused: boolean } | null };
  if (!g.week) throw new Error('no week running');
  g.week.togglePause();
  const pauseShown = !ui.querySelector('.hud-pause')?.classList.contains('hidden');
  click('[data-pz=restart]', 'pause → restart week');
  await wait(2300);
  run(2);
  g.week!.togglePause();
  click('[data-pz=quit]', 'pause → quit to menu');
  run(0.5);
  click('[data-a=arcade]', 'Arcade');
  const cards = [...ui.querySelectorAll('[data-mode]')].map((e) => e.getAttribute('data-mode'));
  for (const m of cards) {
    click(`[data-mode=${m}]`, `arcade: ${m}`);
    run(1.5);
    click('.arc-quit', `quit ${m}`);
    run(0.2);
    if (!ui.querySelector('[data-mode]')) click('[data-a=arcade]', 'back to Arcade');
  }
  // a whole Quick boss semester, start to the end screen: the bot plays each boss,
  // the test clicks through results, the mini-game offer (skip) and the Break
  click('[data-a=back]', 'arcade → menu');
  run(0.3);
  click('[data-a=quick]', 'Quick game again');
  click('[data-a=go]', 'start');
  const gx = game as unknown as { arcade: { autopilot?: boolean; constructor: { name: string } } | null };
  const seen: string[] = [];
  for (let i = 0; i < 400 && !ui.querySelector('.screen.end'); i++) {
    await wait(120);
    if (gx.arcade?.constructor.name === 'BossArena') { gx.arcade.autopilot = true; run(4); if (seen.at(-1) !== 'fight') seen.push('fight'); continue; }
    if (ui.querySelector('[data-a=skip]')) { click('[data-a=skip]', 'skip mini-game'); seen.push('interlude'); continue; }
    if (ui.querySelector('[data-a=go]')) { click('[data-a=go]', 'continue'); continue; }
    if (ui.querySelector('[data-a=start]')) { click('[data-a=start]', 'break → next week'); seen.push('break'); continue; }
    if (ui.querySelector('.hol-card')) { (ui.querySelector('.screen.holiday') as HTMLElement).dispatchEvent(new win.MouseEvent('click', { bubbles: true }) as unknown as Event); continue; }
    run(0.5);
  }
  const ended = !!ui.querySelector('.screen.end');
  console.log(`quick boss semester: ${seen.join(' → ')} → ${ended ? 'END SCREEN' : 'did not finish'}`);
  if (!ended) failed++;
  // the whole story campaign: cutscenes, horde weeks (idle: Kirill plays them out), the race and
  // the presentation, the boss fights (bot), the Lab duel (bot), the Break, to the end screen
  run(0.5);
  if (!ui.querySelector('[data-a=enroll]')) click('[data-a=menu]', 'end → menu');
  click('[data-a=enroll]', 'Enroll (story)');
  const gs = game as unknown as { arcade: { constructor: { name: string }; autopilot?: boolean; duel?: { autoplay: boolean } } | null; week: { race?: { autopilot: boolean } | null; time: number } | null };
  const story: string[] = [];
  for (let i = 0; i < 3000 && !ui.querySelector('.screen.end'); i++) {
    await wait(5);
    const cut = ui.querySelector('.cut-title b')?.textContent;
    if (cut && story.at(-1) !== 'cut:' + cut) story.push('cut:' + cut);
    if (ui.querySelector('.pro')) { (ui.querySelector('.pro') as HTMLElement).dispatchEvent(new win.MouseEvent('click', { bubbles: true }) as unknown as Event); run(0.05); continue; }
    if (gs.arcade) {
      const name = gs.arcade.constructor.name;
      if (name === 'BossArena') gs.arcade.autopilot = true;
      if (gs.arcade.duel) gs.arcade.duel.autoplay = true;
      if (name === 'ThePresentation') (gs.arcade as unknown as { autopilot: boolean }).autopilot = true;
      const tag = name === 'BossArena' ? 'boss' : name === 'ThePresentation' ? 'presentation' : 'duel';
      if (story.at(-1) !== tag) story.push(tag);
      run(5);
      continue;
    }
    if (gs.week) {
      if (gs.week.race) { gs.week.race.autopilot = true; if (story.at(-1) !== 'race') story.push('race'); }
      if (story.at(-1) !== 'horde' && story.at(-1) !== 'race') story.push('horde');
      run(10);
      continue;
    }
    const boonCard = ui.querySelector('.boon-card') as HTMLElement | null;
    if (boonCard) { story.push('upgrade:' + boonCard.dataset.b); boonCard.dispatchEvent(new win.MouseEvent('click', { bubbles: true }) as unknown as Event); continue; }
    if (ui.querySelector('.boss-card')) { (ui.querySelector('.boss-card') as HTMLElement).dispatchEvent(new win.MouseEvent('click', { bubbles: true }) as unknown as Event); continue; }
    if (ui.querySelector('[data-a=go]')) { click('[data-a=go]', 'go'); continue; }
    if (ui.querySelector('[data-a=start]')) { click('[data-a=start]', 'break → next'); story.push('break'); continue; }
    if (ui.querySelector('.screen.holiday')) { (ui.querySelector('.screen.holiday') as HTMLElement).dispatchEvent(new win.MouseEvent('click', { bubbles: true }) as unknown as Event); continue; }
    run(0.5);
  }
  const storyEnd = !!ui.querySelector('.screen.end');
  console.log(`story: ${story.join(' → ')} → ${storyEnd ? 'END SCREEN' : 'did not finish'}`);
  if (!storyEnd) failed++;
  console.log(`clicked: ${steps.join(' → ')}`);
  console.log(`Dean's Office perks: ${perks} · pause menu shown: ${pauseShown} · arcade modes: ${cards.join(', ')}`);
  if (perks !== 4 || !pauseShown || cards.length < 9) failed++;
} catch (e) {
  console.log('CRASH', (e as Error).stack?.split('\n').slice(0, 6).join('\n'));
  failed++;
}
console.log(failed ? `\n${failed} problem(s)` : '\nflow ok');
process.exit(failed ? 1 : 0);
