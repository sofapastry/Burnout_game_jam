import * as THREE from 'three';
import type { Stage } from '../render/stage';
import type { KirillLook } from '../hero/look';
import { el } from '../ui/dom';

// Shared bits for the arcade modes: input, lighting, a HUD layer, results and best scores.

export type ModeId = 'fight' | 'race' | 'run' | 'dungeon' | 'show' | 'drone' | 'versus' | 'show2' | 'boss';

export interface ArcadeResult {
  mode: ModeId;
  win: boolean;
  score: number;
  /** one line for the results card (already translated) */
  detail: string;
  /** story: how much of Kirill's health the mode took (0..1) */
  progress?: number;
}

export interface ArcadeCtx {
  stage: Stage;
  onExit: (r: ArcadeResult | null) => void;
  /** played between story weeks: this semester's Kirill, a shorter variant */
  story?: { look: KirillLook; level: number; /** 0..1 how much he has left after the week (slower when worn down) */ hp?: number };
  /** local 2-player: a second player takes Kirill (arrow keys + , . / Enter) */
  twoPlayer?: boolean;
}

export interface ArcadeMode {
  update(dt: number): void;
  render(): void;
  dispose(): void;
}

const BEST_KEY = 'burnout.arcade.best';
export function bestScores(): Partial<Record<ModeId, number>> {
  try { return JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}'); } catch { return {}; }
}
/** Store the score if it's a new best; returns true when it is. */
export function recordScore(mode: ModeId, score: number) {
  const b = bestScores();
  if ((b[mode] ?? -1) >= score) return false;
  b[mode] = score;
  try { localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch { /* blocked storage */ }
  return true;
}

// Russian-layout keys map to the same physical keys
const RU: Record<string, string> = { 'ц': 'w', 'ф': 'a', 'ы': 's', 'в': 'd', 'й': 'q', 'у': 'e', 'к': 'r', 'о': 'j', 'л': 'k', 'д': 'l', 'а': 'f' };

/** Held keys and per-frame presses, plus mouse buttons and the pointer position. */
export class Input {
  keys = new Set<string>();
  private pressed = new Set<string>();
  mouse = { x: 0, y: 0, l: false, r: false };
  /** mouse movement since the last frame (works with or without pointer lock) */
  dx = 0;
  dy = 0;
  /** capture the mouse on click (mouse-look modes); must happen inside the click handler */
  autoLock = false;
  private listeners: [EventTarget, string, EventListener][] = [];
  constructor(private canvas: HTMLElement) {
    const key = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); return RU[k] ?? k; };
    const on = (t: EventTarget, type: string, fn: EventListener) => { t.addEventListener(type, fn); this.listeners.push([t, type, fn]); };
    on(window, 'keydown', ((e: KeyboardEvent) => {
      const k = key(e);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab'].includes(k)) e.preventDefault();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      // physical key codes too ('c:Comma'), for player 2's keys on any keyboard layout
      const c = 'c:' + e.code;
      if (['c:Comma', 'c:Period', 'c:Slash', 'c:Enter'].includes(c)) e.preventDefault();
      if (!this.keys.has(c)) this.pressed.add(c);
      this.keys.add(c);
    }) as EventListener);
    on(window, 'keyup', ((e: KeyboardEvent) => { this.keys.delete(key(e)); this.keys.delete('c:' + e.code); }) as EventListener);
    on(window, 'blur', (() => { this.keys.clear(); this.mouse.l = this.mouse.r = false; }) as EventListener);
    on(canvas, 'mousemove', ((e: MouseEvent) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.dx += e.movementX ?? 0; this.dy += e.movementY ?? 0; }) as EventListener);
    on(canvas, 'mousedown', ((e: MouseEvent) => {
      if (this.autoLock) this.lock();
      if (e.button === 0) { this.mouse.l = true; this.pressed.add('mouse0'); }
      if (e.button === 2) { this.mouse.r = true; this.pressed.add('mouse2'); }
      if (e.button === 1) { e.preventDefault(); this.pressed.add('mouse1'); }
    }) as EventListener);
    on(window, 'mouseup', ((e: MouseEvent) => { if (e.button === 0) this.mouse.l = false; if (e.button === 2) this.mouse.r = false; }) as EventListener);
    on(canvas, 'contextmenu', ((e: Event) => e.preventDefault()) as EventListener);
  }
  /** make the HUD's [data-key] buttons press keys (see bindKeyButtons) */
  buttons(root: HTMLElement) {
    bindKeyButtons(root, (k) => this.pressed.add(k), (k, on) => { if (on) this.keys.add(k); else this.keys.delete(k); });
  }
  down(...ks: string[]) { return ks.some((k) => this.keys.has(k)); }
  hit(...ks: string[]) { return ks.some((k) => this.pressed.has(k)); }
  /** for tests and bots */
  press(k: string) { this.pressed.add(k); }
  endFrame() { this.pressed.clear(); this.dx = this.dy = 0; }
  /** capture the mouse for mouse-look (browsers may refuse; mouse-look still works uncaptured) */
  lock() {
    if (document.pointerLockElement === this.canvas) return;
    try { (this.canvas.requestPointerLock?.() as unknown as Promise<void> | undefined)?.catch?.(() => {}); } catch { /* refused */ }
  }
  get locked() { return document.pointerLockElement === this.canvas; }
  dispose() {
    for (const [t, type, fn] of this.listeners) t.removeEventListener(type, fn);
    if (this.locked) document.exitPointerLock();
  }
}

/** on-screen hotkey buttons: data-key="j" taps J, data-hold also holds it */
export function bindKeyButtons(root: HTMLElement, tap: (k: string) => void, hold: (k: string, on: boolean) => void) {
  root.querySelectorAll<HTMLElement>('[data-key]').forEach((b) => {
    const k = b.dataset.key!;
    const held = b.dataset.hold !== undefined;
    b.classList.add('tap');
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      b.classList.add('down');
      if (held) hold(k, true);
      tap(k);
    });
    const up = () => { b.classList.remove('down'); if (held) hold(k, false); };
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });
}

/** Golden-hour light for a standalone scene; the sun follows a target so shadows stay sharp. */
export class Lights {
  hemi = new THREE.HemisphereLight(0xfff1dc, 0x6a5a48, 1.25);
  sun = new THREE.DirectionalLight(0xffcf8f, 2.3);
  constructor(scene: THREE.Scene, private offset = new THREE.Vector3(-18, 26, -8), span = 30) {
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 1; sc.far = 120;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.hemi, this.sun, this.sun.target);
  }
  follow(x: number, z: number) {
    this.sun.position.set(x + this.offset.x, this.offset.y, z + this.offset.z);
    this.sun.target.position.set(x, 0, z);
  }
}

/** A HUD layer for a mode, removed on dispose. */
export function hudLayer(html: string) {
  const root = el(`<div class="arcade-hud">${html}</div>`);
  document.getElementById('ui')!.appendChild(root);
  return root;
}

export function perspective(fov = 55) {
  const cam = new THREE.PerspectiveCamera(fov, innerWidth / innerHeight, 0.1, 400);
  return cam;
}

/** Keep a camera's aspect right after window resizes. */
export function fitAspect(cam: THREE.PerspectiveCamera) {
  const a = innerWidth / innerHeight;
  if (Math.abs(cam.aspect - a) > 1e-3) { cam.aspect = a; cam.updateProjectionMatrix(); }
}

/** Countdown helper: "3", "2", "1", "GO!" */
export function countdownText(t: number, go: string) {
  return t > 2 ? '3' : t > 1 ? '2' : t > 0 ? '1' : t > -0.8 ? go : '';
}

export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const damp = (dt: number, rate: number) => 1 - Math.exp(-dt * rate);
