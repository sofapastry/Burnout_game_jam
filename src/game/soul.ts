import * as THREE from 'three';
import type { WeekRun } from './week';
import { Possession } from './possess';
import type { Unit } from '../horde/units';
import { sfx, juice } from '../core/audio';
import { t } from '../i18n';
import { boon } from './boons';

// Soul Jump: in the story you always control a unit and jump between them (C/Tab).
// First hit after a jump is an ambush. Units are summoned automatically from the loadout.

const JUMP_RANGE = 26;
const JUMP_CONE = 0.6;
const JUMP_CD = 0.6;
const AMBUSH_SEC = 2.5;
const SPAWN_EVERY = 2.6;
const MAX_BODIES = 7;
/** week cards that are the week's own objective (Kirill's job is to clear them), never auto-summoned */
const OBJECTIVE = new Set<string>(['credit', 'cgCredit', 'task', 'starTask', 'test', 'fuse']);

export class SoulJump {
  /** seconds of slow motion left (the week scales its tick by it) */
  slow = 0;
  /** the first hit within this window after a jump doubles */
  ambush = 0;
  jumps = 0;
  private cd = 0;
  private spawnT = 0.2;
  private orb: THREE.Sprite;
  private marker: THREE.Sprite;
  /** the soul in flight: where from, where to, how far (0..1), how long it takes, and why */
  private flight: { from: THREE.Vector3; to: Unit; t: number; dur: number; death: boolean } | null = null;
  private camLook = new THREE.Vector3();
  private camAt = new THREE.Vector3();
  private target: Unit | null = null;
  private started = false;
  private guestCame = false;

  constructor(private w: WeekRun) {
    const tex = soulTexture();
    this.orb = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x9ff6ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.orb.scale.setScalar(1.4);
    this.orb.visible = false;
    this.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x4ae0d0, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.marker.scale.setScalar(0.9);
    this.marker.visible = false;
    w.fx.group.add(this.orb, this.marker);
  }

  private get p() { return this.w.possess; }

  /** the body you'd jump into right now */
  private pickTarget(): Unit | null {
    const cur = this.p.unit, k = this.w.kirill;
    const f = this.p.forward();
    let best: Unit | null = null, bs = Infinity;
    for (const u of this.w.horde.units) {
      if (u === cur || !Possession.canPossess(u)) continue;
      const ox = cur ? cur.x : k.x, oz = cur ? cur.z : k.z;
      const dx = u.x - ox, dz = u.z - oz, d = Math.hypot(dx, dz);
      if (d > JUMP_RANGE || d < 0.5) continue;
      let a = Math.atan2(dx, dz) - Math.atan2(f.x, f.z);
      a = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
      // in your sight first (closest to the middle of the view), else the one nearest Kirill
      const score = cur && a < JUMP_CONE ? a * 10 + d * 0.05 : 100 + Math.hypot(u.x - k.x, u.z - k.z);
      if (score < bs) { bs = score; best = u; }
    }
    return best;
  }

  /** C / Tab: fly into the marked body */
  jump() {
    if (this.cd > 0 || this.flight) return;
    const to = this.target ?? this.pickTarget();
    if (!to) { sfx.denied(); this.w.hud.toast(t('soul.none')); return; }
    this.fly(to);
  }

  private fly(to: Unit, death = false) {
    const cur = this.p.unit;
    const from = new THREE.Vector3(cur ? cur.x : to.x, 1, cur ? cur.z : to.z);
    this.cd = JUMP_CD * boon.jumpCd(this.w.sem.boons);
    this.jumps++;
    // a short flight in slow motion; a longer, heavier one when your body was destroyed
    const dist = Math.hypot(to.x - from.x, to.z - from.z);
    const dur = (death ? 0.95 : 0.5) + Math.min(0.35, dist * 0.015);
    this.flight = { from, to, t: 0, dur, death };
    this.slow = dur + 0.1;
    this.orb.visible = !!cur;
    sfx.soulJump();
    if (death) { sfx.bell(147); this.w.stage.shake(0.3); }
    this.w.hud.root.classList.toggle('soulfly', !!cur);
    this.w.hud.root.classList.toggle('souldeath', death);
    if (cur) {
      this.w.fx.burst(cur.x, cur.z, 0x9ff6ff, death ? 18 : 10, 0.8, death ? 5 : 3);
      this.w.fx.ring(cur.x, cur.z, 0.2, death ? 2.6 : 1.4, 0.4, 0x9ff6ff, 0.9);
      this.camAt.copy(this.w.stage.fpCam.position);
    }
  }

  // camera follows the soul during the jump
  camera() {
    const f = this.flight;
    if (!f || !this.p.active || !this.orb.visible) return;
    const cam = this.w.stage.fpCam;
    const o = this.orb.position, to = f.to;
    const dx = to.x - f.from.x, dz = to.z - f.from.z, dl = Math.hypot(dx, dz) || 1;
    const want = new THREE.Vector3(o.x - (dx / dl) * 2.4, o.y + 0.9, o.z - (dz / dl) * 2.4);
    this.camAt.lerp(want, 0.35);
    cam.position.copy(this.camAt);
    this.camLook.lerp(new THREE.Vector3(to.x, 0.8, to.z), 0.3);
    cam.lookAt(this.camLook);
    const fov = 82 + Math.sin(Math.min(1, f.t) * Math.PI) * 14;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }

  update(dt: number) {
    const w = this.w;
    if (w.ended || w.duel || w.race) { this.marker.visible = false; return; }
    this.cd = Math.max(0, this.cd - dt);
    this.slow = Math.max(0, this.slow - dt);
    this.ambush = Math.max(0, this.ambush - dt);
    // the horde comes on its own: your deck, free, around Kirill (never on top of him)
    this.spawnT -= dt;
    const bodies = w.horde.units.filter((u) => Possession.canPossess(u)).length;
    const B = w.sem.boons;
    if (this.spawnT <= 0 && bodies < MAX_BODIES + boon.extraBodies(B)) {
      // objective weeks (count down / race) get a thinner free horde: the week's own task matters there
      this.spawnT = SPAWN_EVERY * boon.spawnEvery(B) * (w.rules.meterMode === 'fail' ? 1 : 1.9);
      this.spawnWave(bodies === 0);
    }
    // the week's guest turns up once, on their own, a third of the way in
    if (!this.guestCame && w.time > w.duration * 0.33) {
      this.guestCame = true;
      const g = w.hand.find((s) => s.source === 'guest');
      if (g) {
        const k = w.kirill;
        for (let i = 0; i < 10; i++) {
          const a = Math.random() * Math.PI * 2, x = k.x + Math.sin(a) * 6, z = k.z + Math.cos(a) * 6;
          const spot = w.grid.blocked(x, z) ? null : w.freeSpot(g.card, x, z);
          if (spot) { w.playCard(g.card, g.level, spot.x, spot.z); g.used = true; w.feed(t('soul.guest', { name: t('char.' + g.card) }), 'ally'); break; }
        }
      }
    }
    // the soul in flight: an arc of light, then you're in
    if (this.flight) {
      const f = this.flight;
      if (f.t === 0) this.camLook.set(f.to.x, 0.8, f.to.z);
      f.t += dt / f.dur;
      // ease in and out: it hangs at the top of the arc for a moment
      const u = Math.min(1, f.t), e = u * u * (3 - 2 * u);
      const tx = f.to.x, tz = f.to.z;
      this.orb.position.set(f.from.x + (tx - f.from.x) * e, 1 + Math.sin(e * Math.PI) * (f.death ? 3.2 : 2.2), f.from.z + (tz - f.from.z) * e);
      this.orb.scale.setScalar(1.2 + Math.sin(u * Math.PI) * 0.8);
      w.fx.burst(this.orb.position.x, this.orb.position.z, 0x9ff6ff, 2, this.orb.position.y, 0.6);
      if (u >= 1) {
        this.flight = null;
        this.orb.visible = false;
        w.hud.root.classList.remove('soulfly', 'souldeath');
        if (Possession.canPossess(f.to)) {
          if (this.p.active) { this.p.transfer(f.to); this.p.setCamPos(this.camAt); } else this.p.enter(f.to);
          this.ambush = AMBUSH_SEC;
          w.fx.ring(f.to.x, f.to.z, 0.2, 1.6, 0.35, 0x9ff6ff, 0.9);
          w.stage.punch(0.04);
          if (!this.started) { this.started = true; w.hud.announce(t('soul.title'), t('soul.sub')); }
        }
      }
      return;
    }
    // no body (the stage just began, or yours was destroyed): your soul takes the nearest one
    if (!this.p.active || !this.p.valid()) {
      const at = this.p.unit;
      const ox = at ? at.x : w.kirill.x, oz = at ? at.z : w.kirill.z;
      let best: Unit | null = null, bd = Infinity;
      for (const u of w.horde.units) {
        if (u === at || !Possession.canPossess(u)) continue;
        const d = Math.hypot(u.x - ox, u.z - oz) + (at ? 0 : -Math.min(8, Math.hypot(u.x - w.kirill.x, u.z - w.kirill.z)));
        if (d < bd) { bd = d; best = u; }
      }
      if (best) {
        if (at) { w.fx.popup(ox, 1.6, oz, t('soul.escaped'), 'skill'); juice.gasp(); }
        this.fly(best, !!at);
      }
      return;
    }
    // mark where C would take you
    this.target = this.pickTarget();
    this.marker.visible = !!this.target;
    if (this.target) {
      this.marker.position.set(this.target.x, (this.target.r ?? 0.3) * 2 + 1.0 + Math.sin(w.time * 6) * 0.08, this.target.z);
      this.marker.material.opacity = this.cd > 0 ? 0.3 : 0.85;
    }
  }

  /** a free card from your deck lands somewhere 7–14 m from Kirill */
  private spawnWave(noBodies: boolean) {
    const w = this.w, k = w.kirill;
    // your own deck only (the week's own cards, like Credit Week's credits, are its objective);
    // with no body on the floor at all, a Pop Quiz swarm (your soul always needs somewhere to be)
    const cards = w.hand.filter((s) => s.source === 'loadout' || (s.source === 'week' && !OBJECTIVE.has(s.card)));
    const slot = noBodies || !cards.length ? { card: 'popQuiz' as const, level: 1 } : cards[Math.floor(Math.random() * cards.length)];
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, d = 7 + Math.random() * 7;
      const x = k.x + Math.sin(a) * d, z = k.z + Math.cos(a) * d;
      if (w.grid.blocked(x, z)) continue;
      const spot = w.freeSpot(slot.card, x, z);
      if (!spot) continue;
      w.playCard(slot.card, Math.min(3, slot.level + boon.levelUp(w.sem.boons)), spot.x, spot.z);
      return;
    }
  }

  dispose() {
    this.w.fx.group.remove(this.orb, this.marker);
  }
}

let soulTex: THREE.CanvasTexture | null = null;
/** a wisp: a bright core in a soft halo */
function soulTexture() {
  if (soulTex) return soulTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.18, 'rgba(220,255,255,0.95)');
    gr.addColorStop(0.45, 'rgba(120,230,255,0.35)');
    gr.addColorStop(1, 'rgba(80,200,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  }
  soulTex = new THREE.CanvasTexture(c);
  return soulTex;
}
