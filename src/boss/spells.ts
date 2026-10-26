import * as THREE from 'three';
import type { Fx } from '../render/fx';
import type { Rng } from '../core/rng';
import { sfx, juice } from '../core/audio';
import type { BossId, MoveId } from './bosses';

// Boss spells: a rune circle telegraphs the area, then the effect plays out (meteors, shockwaves,
// sweeping beams...). Two aimed spells and one ultimate per boss.

export type SpellId =
  // aimed spells (two per boss)
  | 'byteMeteors' | 'finalLap' | 'subDrop' | 'snoozeCloud' | 'discoInferno'
  | 'rumorMill' | 'paparazzi' | 'redPen' | 'coffeeRain'
  | 'firewall' | 'hurdleLine' | 'equalizer' | 'pillowFort' | 'champagne'
  | 'hotTake' | 'ringLight' | 'ticketDraw' | 'notesShare'
  // ultimates (one per boss, cast on Kirill)
  | 'blueScreen' | 'marathon' | 'micDrop' | 'endlessLecture' | 'afterparty'
  | 'viralScandal' | 'liveStream' | 'session' | 'groupStudy';

/** each boss's two aimed spells (keys 3 and 4; 1 and 2 are its signature moves) */
export const SPELLS: Record<BossId, [SpellId, SpellId]> = {
  shady: ['byteMeteors', 'firewall'], nina: ['finalLap', 'hurdleLine'], pasha: ['subDrop', 'equalizer'],
  grisha: ['snoozeCloud', 'pillowFort'], romchik: ['discoInferno', 'champagne'], masha: ['rumorMill', 'hotTake'],
  sonya: ['paparazzi', 'ringLight'], finalExam: ['redPen', 'ticketDraw'], artem: ['coffeeRain', 'notesShare'],
};

/** each boss's ultimate (R, once the bar is full) */
export const ULT: Record<BossId, SpellId> = {
  shady: 'blueScreen', nina: 'marathon', pasha: 'micDrop', grisha: 'endlessLecture', romchik: 'afterparty',
  masha: 'viralScandal', sonya: 'liveStream', finalExam: 'session', artem: 'groupStudy',
};

/** the spell's reach on the floor (the aiming circle) */
export const SPELL_R: Record<SpellId, number> = {
  byteMeteors: 3.8, finalLap: 3.6, subDrop: 2.6, snoozeCloud: 4, discoInferno: 5,
  rumorMill: 3.6, paparazzi: 3.4, redPen: 3.3, coffeeRain: 3.6,
  firewall: 3.2, hurdleLine: 1.4, equalizer: 1.6, pillowFort: 3, champagne: 3,
  hotTake: 1.5, ringLight: 3.4, ticketDraw: 1.6, notesShare: 3.2,
  blueScreen: 6, marathon: 6, micDrop: 2.4, endlessLecture: 5, afterparty: 8,
  viralScandal: 5, liveStream: 7, session: 5, groupStudy: 6,
};

export const SPELL_COLOR: Record<SpellId, number> = {
  byteMeteors: 0x3cffb0, finalLap: 0xff5a3c, subDrop: 0xa070ff, snoozeCloud: 0xb6a4ff, discoInferno: 0xff5ac8,
  rumorMill: 0xe8dcc0, paparazzi: 0xfff2c8, redPen: 0xff2a2a, coffeeRain: 0xd29a5a,
  firewall: 0x3cff6a, hurdleLine: 0xff7a4a, equalizer: 0xc070ff, pillowFort: 0xd8d0ff, champagne: 0xffe08a,
  hotTake: 0xffb04a, ringLight: 0xf8f4ff, ticketDraw: 0xf4efe2, notesShare: 0xd29a5a,
  blueScreen: 0x2a7aff, marathon: 0xff4a2a, micDrop: 0xb070ff, endlessLecture: 0x9a8ae8, afterparty: 0xff4ab0,
  viralScandal: 0xffd8a0, liveStream: 0xff2a3a, session: 0xff2a2a, groupStudy: 0xd29a5a,
};

/** the drawn icon (ui/icons.ts) on each spell's HUD slot */
export const SPELL_ICON: Record<SpellId, string> = {
  byteMeteors: 'invader', firewall: 'shield', finalLap: 'runner', hurdleLine: 'barrier', subDrop: 'speaker', equalizer: 'signal',
  snoozeCloud: 'zzz', pillowFort: 'sleepy', discoInferno: 'disco', champagne: 'sparkle', rumorMill: 'wind', hotTake: 'fire',
  paparazzi: 'camera', ringLight: 'target', redPen: 'quill', ticketDraw: 'ticket', coffeeRain: 'coffee', notesShare: 'book',
  blueScreen: 'laptop', marathon: 'ball', micDrop: 'mic', endlessLecture: 'clock', afterparty: 'party',
  viralScandal: 'phone', liveStream: 'film', session: 'paper', groupStudy: 'people',
};

/** the colour of each signature move's light */
export const MOVE_COLOR: Record<MoveId, number> = {
  whistle: 0xfff0a0, ballStorm: 0xff7a4a, danceShock: 0xff4ab0, partyGrab: 0xffd24a, flash: 0xffffff, gossip: 0xffd8a0,
  selfie: 0xff8ac8, laser: 0xff2a2a, codeBolt: 0x3cffb0, glitch: 0x23c4b8, yawn: 0xb6a4ff, slam: 0xd8a060,
  shield: 0x6fb7e8, heal: 0x5fe07a, bassDrop: 0xa070ff, lecture: 0x9a8ae8,
};

/** seconds between casts of an aimed spell (phase 2 is quicker) */
export const SPELL_CD = 14;
/** the ultimate's bar: how it fills */
export const ULT_PER_HIT = 3;
export const ULT_PER_SEC = 0.9;

/** what a spell may do to the fight */
export interface SpellHost {
  root: THREE.Object3D;
  fx: Fx;
  rng: Rng;
  /** Kirill now */
  kirill(): { x: number; z: number };
  /** `src` says which spell did it (Kirill learns from what kills him) */
  hurt(dmg: number, effect: 'knock' | 'down' | 'stun' | null, nx: number, nz: number, poise: boolean, src?: string): void;
  status(kind: 'slow' | 'drowsy' | 'blind', sec: number): void;
  /** nudge Kirill (a pull toward a point, a shove) in metres per second */
  push(vx: number, vz: number, dt: number): void;
  shake(v: number): void;
  /** a full-screen effect on the HUD for a moment (the blue screen, the lecture's gloom) */
  overlay(cls: string, sec: number): void;
  power: number;
}

// ---------------------------------------------------------------- textures (drawn, cached)

const texCache = new Map<string, THREE.CanvasTexture>();
function canvasTex(key: string, size: number, draw: (g: CanvasRenderingContext2D, s: number) => void) {
  let tex = texCache.get(key);
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (g) draw(g, size);
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
}

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

/** a magic circle: rings, ticks and a band of glyphs, in the spell's colour */
export function runeTexture(color: number, glyphs = '01ЗАЧЁТ∑λ∫πΔΩ') {
  return canvasTex('rune' + color + glyphs, 512, (g, s) => {
    const c = s / 2, col = hex(color);
    g.strokeStyle = col; g.fillStyle = col;
    g.shadowColor = col; g.shadowBlur = 10;
    const ring = (r: number, w: number) => { g.lineWidth = w; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke(); };
    ring(c * 0.97, 6); ring(c * 0.9, 2); ring(c * 0.66, 3); ring(c * 0.6, 1.5); ring(c * 0.2, 2);
    // ticks between the outer rings
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2, r0 = c * 0.9, r1 = c * (i % 6 ? 0.86 : 0.8);
      g.lineWidth = i % 6 ? 1.5 : 3;
      g.beginPath(); g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); g.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1); g.stroke();
    }
    // the glyph band
    g.font = `bold ${Math.round(s * 0.055)}px "Cormorant SC", serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const n = 24;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      g.save(); g.translate(c + Math.cos(a) * c * 0.755, c + Math.sin(a) * c * 0.755); g.rotate(a + Math.PI / 2);
      g.fillText(glyphs[i % glyphs.length], 0, 0); g.restore();
    }
    // a star inside
    g.lineWidth = 2.5; g.beginPath();
    for (let i = 0; i <= 5; i++) { const a = -Math.PI / 2 + i * (Math.PI * 4 / 5); const x = c + Math.cos(a) * c * 0.58, y = c + Math.sin(a) * c * 0.58; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
  });
}

/** a glowing glyph (a byte, a Z, a letter) on a transparent square */
function glyphTexture(ch: string, color: number) {
  return canvasTex('gl' + ch + color, 128, (g, s) => {
    g.font = `900 ${s * 0.78}px "Russo One", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = hex(color); g.shadowBlur = 18;
    g.fillStyle = hex(color); g.fillText(ch, s / 2, s / 2 + 4);
    g.shadowBlur = 0; g.fillStyle = '#ffffff'; g.globalAlpha = 0.65; g.fillText(ch, s / 2, s / 2 + 4);
  });
}

/** a soft round glow */
function glowTexture() {
  return canvasTex('glow', 128, (g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  });
}

/** a running track: red lanes and white lines */
function trackTexture() {
  return canvasTex('track', 512, (g, s) => {
    const c = s / 2;
    for (let i = 0; i < 5; i++) {
      const r = c * (0.98 - i * 0.09);
      g.fillStyle = i % 2 ? '#a8382a' : '#b8432f'; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#f4efe2'; g.lineWidth = 4; g.stroke();
    }
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.arc(c, c, c * 0.53, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#f4efe2'; g.fillRect(c - 3, 0, 6, c * 0.47);
  });
}

/** newspaper sheets (gossip) */
function paperTexture() {
  return canvasTex('paper', 128, (g, s) => {
    g.fillStyle = '#efe6cf'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#2a2420'; g.font = `900 ${s * 0.16}px "Russo One", sans-serif`; g.fillText('СЛУХИ', 8, s * 0.2);
    g.fillStyle = '#6a6056';
    for (let y = s * 0.32; y < s - 8; y += s * 0.08) g.fillRect(8, y, s * (0.45 + ((y * 7) % 5) * 0.08), s * 0.035);
    g.fillStyle = '#a89a86'; g.fillRect(s * 0.62, s * 0.32, s * 0.3, s * 0.3);
  });
}

/** falling columns of green code (Shady's firewall); scrolls when its offset moves */
function codeTexture() {
  const tex = canvasTex('code', 256, (g, s) => {
    g.font = '700 18px "JetBrains Mono", monospace';
    g.textAlign = 'center';
    for (let cx = 9; cx < s; cx += 18) {
      for (let y = 0; y < s; y += 20) {
        const a = ((cx * 7 + y * 3) % 11) / 11;
        g.fillStyle = `rgba(80,255,140,${0.25 + a * 0.75})`;
        g.fillText('01{};<>/=#'[(cx + y) % 10], cx, y + 16);
      }
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** an exam ticket: "БИЛЕТ №" and two questions */
function ticketTexture() {
  return canvasTex('ticket', 256, (g, s) => {
    g.fillStyle = '#f4efe2'; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#2b3f6b'; g.lineWidth = 6; g.strokeRect(10, 10, s - 20, s - 20);
    g.fillStyle = '#2b3f6b'; g.font = '900 34px "Russo One", sans-serif'; g.textAlign = 'center';
    g.fillText('БИЛЕТ №13', s / 2, 64);
    g.fillStyle = '#6a6056';
    for (let y = 100; y < s - 30; y += 26) g.fillRect(30, y, s - 60 - ((y * 13) % 50), 8);
    g.fillStyle = '#c8302a'; g.font = '900 60px "Russo One", sans-serif'; g.fillText('2', s - 50, s - 30);
  });
}

/** a twister of paper sheets around its own centre; userData.spin(dt) turns it */
function tornado(tex: THREE.Texture, n: number) {
  const g = new THREE.Group();
  const pages = Array.from({ length: n }, (_, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.65), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide }));
    m.userData = { a: (i / n) * Math.PI * 6, y: (i / n) * 3.6, rr: 0.4 + (i % 4) * 0.35 };
    g.add(m);
    return m;
  });
  let t = 0;
  g.userData.spin = (dt: number) => {
    t += dt;
    for (const m of pages) {
      const d = m.userData;
      d.a += dt * (3.4 - d.rr * 0.5);
      const rr = d.rr * (0.6 + d.y * 0.18);
      m.position.set(Math.cos(d.a) * rr, 0.3 + ((d.y + t * 1.1) % 3.8), Math.sin(d.a) * rr);
      m.rotation.set(t * 3 + d.a, d.a, t * 2);
    }
  };
  return g;
}

const glowMat = (color: number, opacity = 1) => new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
const flatMat = (map: THREE.Texture, opacity = 1, color = 0xffffff) => new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });

/** a rune circle on the floor (the cast marker, and the aiming reticle) */
export function runeDecal(r: number, color: number) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.1, r * 2.1), flatMat(runeTexture(color), 0.85));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.06;
  m.renderOrder = 2;
  return m;
}

// ---------------------------------------------------------------- the spells

interface Live {
  t: number;
  dur: number;
  x: number;
  z: number;
  r: number;
  update(dt: number): void;
  objs: THREE.Object3D[];
  /** where it's dangerous, if not the whole circle (lines, moving things) */
  zones?: () => { x: number; z: number; r: number }[];
}

export class Spells {
  private live: Live[] = [];
  constructor(private h: SpellHost) {}

  /** where it's dangerous to stand right now (Kirill reads these and rolls out) */
  dangerAt(x: number, z: number) {
    for (const s of this.live) {
      if (s.t < 0.2) continue;
      const zs = s.zones ? s.zones() : [{ x: s.x, z: s.z, r: s.r }];
      const hit = zs.find((q) => Math.hypot(x - q.x, z - q.z) < q.r + 0.4);
      if (hit) return hit;
    }
    return null;
  }

  get active() { return this.live.length; }

  /** cast `id` at (x, z); (fromX, fromZ) is the caster, for the spells that travel out of them */
  cast(id: SpellId, x: number, z: number, fromX = x, fromZ = z - 1) {
    const r = SPELL_R[id], color = SPELL_COLOR[id];
    const s: Live = { t: 0, dur: 4, x, z, r, update: () => {}, objs: [] };
    const add = <T extends THREE.Object3D>(o: T) => { this.h.root.add(o); s.objs.push(o); return o; };
    // every spell telegraphs its area with a rune circle that spins in, then fades
    const rune = add(runeDecal(r, color));
    rune.position.set(x, 0.06, z);
    const runeMat = rune.material as THREE.MeshBasicMaterial;
    const base = (dt: number) => {
      rune.rotation.z += dt * 0.6;
      const u = s.t / s.dur;
      runeMat.opacity = 0.85 * Math.min(1, s.t * 3) * (u > 0.85 ? (1 - u) / 0.15 : 1);
      const sc = Math.min(1, 0.3 + s.t * 2.5);
      rune.scale.set(sc, sc, sc);
    };
    this.h.fx.ring(x, z, 0.2, r, 0.5, color, 0.7);
    juice.sting(3);
    // everything this spell does to him is signed with its name
    const h: SpellHost = { ...this.h, hurt: (d, e, nx, nz, p) => this.h.hurt(d, e, nx, nz, p, id) }, P = h.power;
    const kd = () => { const k = h.kirill(); return { k, d: Math.hypot(k.x - x, k.z - z), nx: (k.x - x) / (Math.hypot(k.x - x, k.z - z) || 1), nz: (k.z - z) / (Math.hypot(k.x - x, k.z - z) || 1) }; };

    // a falling projectile used by the meteor-like spells
    const meteors = (n: number, over: number, glyphs: string[], col: number, dmg: number, follow = false, rad = r) => {
      const rocks: { o: THREE.Group; t: number; x: number; z: number; done: boolean; sx: number; sz: number }[] = [];
      let next = 0.5;
      return (dt: number) => {
        next -= dt;
        while (next <= 0 && rocks.length < n) {
          next += over / n;
          const a = h.rng.next() * Math.PI * 2, rr = Math.sqrt(h.rng.next()) * rad;
          // half of them hunt where he stands (an ultimate's rain follows him everywhere)
          const k = h.kirill();
          const cx = follow ? k.x : x, cz = follow ? k.z : z;
          const onHim = rocks.length % 2 === 0 && Math.hypot(k.x - cx, k.z - cz) < rad + 1;
          const px = onHim ? k.x + h.rng.range(-0.6, 0.6) : cx + Math.cos(a) * rr, pz = onHim ? k.z + h.rng.range(-0.6, 0.6) : cz + Math.sin(a) * rr;
          const o = new THREE.Group();
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyphTexture(glyphs[rocks.length % glyphs.length], col), transparent: true, depthWrite: false, toneMapped: false }));
          sp.scale.setScalar(1.3);
          const halo = new THREE.Sprite(glowMat(col, 0.55)); halo.scale.setScalar(2.2);
          const core = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), new THREE.MeshBasicMaterial({ color: col, toneMapped: false }));
          o.add(halo, core, sp);
          add(o);
          h.fx.ring(px, pz, 1.0, 1.1, 0.6, col, 0.75);
          rocks.push({ o, t: 0, x: px, z: pz, done: false, sx: px - 5, sz: pz - 3 });
        }
        for (const m of rocks) {
          if (m.done) continue;
          m.t += dt;
          const u = Math.min(1, m.t / 0.6);
          m.o.position.set(m.sx + (m.x - m.sx) * u, 18 * (1 - u) + 0.3, m.sz + (m.z - m.sz) * u);
          m.o.children[1].rotation.set(m.t * 9, m.t * 7, 0);
          if (h.rng.chance(0.5)) h.fx.burst(m.o.position.x, m.o.position.z, col, 1, m.o.position.y, 0.6);
          if (u >= 1) {
            m.done = true;
            m.o.visible = false;
            h.fx.ring(m.x, m.z, 0.2, 1.5, 0.35, col, 0.9);
            h.fx.burst(m.x, m.z, col, 8, 0.3, 4);
            h.shake(0.14);
            sfx.boom();
            const { d, nx, nz } = (() => { const k = h.kirill(); const dd = Math.hypot(k.x - m.x, k.z - m.z); return { d: dd, nx: (k.x - m.x) / (dd || 1), nz: (k.z - m.z) / (dd || 1) }; })();
            if (d < 1.2) h.hurt(dmg * P, 'knock', nx, nz, false);
          }
        }
      };
    };

    // what happens where something lands or erupts: a ring, dust, a thud, and the hit
    const impact = (px: number, pz: number, rad: number, dmg: number, effect: 'knock' | 'down' | 'stun' | null, col = color, big = false) => {
      h.fx.ring(px, pz, 0.2, rad + 0.6, 0.4, col, 0.9);
      h.fx.burst(px, pz, col, big ? 18 : 8, 0.4, big ? 6 : 4);
      h.shake(big ? 0.5 : 0.2);
      sfx.boom();
      if (big) juice.thump();
      const k = h.kirill(), d = Math.hypot(k.x - px, k.z - pz);
      if (d < rad) h.hurt(dmg * P, effect, (k.x - px) / (d || 1), (k.z - pz) / (d || 1), effect !== null);
    };

    // things falling on spots one after another (pillows, tickets); each spot is picked when its warning shows
    const drops = (count: number, spotAt: (i: number) => { x: number; z: number }, first: number, step: number, make: () => THREE.Object3D, rad: number, dmg: number, effect: 'knock' | 'down' | 'stun') => {
      const fall = 0.55;
      const ps: { x: number; z: number; o: THREE.Object3D; landed: boolean }[] = [];
      s.zones = () => ps.filter((p) => !p.landed).map((p) => ({ x: p.x, z: p.z, r: rad }));
      return (dt: number) => {
        // the warning circle goes down 0.5 s before it starts to fall
        while (ps.length < count && s.t >= first + ps.length * step - 0.5) {
          const sp = spotAt(ps.length);
          const o = add(make());
          o.position.set(sp.x, 12, sp.z);
          o.visible = false;
          h.fx.ring(sp.x, sp.z, rad * 0.9, rad, 1.05, color, 0.85);
          ps.push({ ...sp, o, landed: false });
        }
        ps.forEach((p, i) => {
          const u = (s.t - (first + i * step)) / fall;
          if (u < 0) return;
          p.o.visible = true;
          if (!p.landed) {
            p.o.position.y = 12 * (1 - Math.min(1, u * u)) + 0.4;
            if (u >= 1) { p.landed = true; impact(p.x, p.z, rad, dmg, effect); }
          } else if (s.t > s.dur - 0.6) p.o.position.y -= dt * 3;
        });
      };
    };

    // things erupting from the floor at spots one after another (hurdles, EQ bars, geysers)
    const erupts = (pts: { x: number; z: number }[], first: number, step: number, make: (i: number) => THREE.Object3D, rad: number, dmg: number, effect: 'knock' | 'down' | 'stun' | null, anim?: (o: THREE.Object3D, i: number, t: number) => void) => {
      const yaw = Math.atan2(x - fromX, z - fromZ);
      const ps = pts.map((p, i) => {
        const o = add(make(i));
        o.position.set(p.x, -3, p.z);
        o.rotation.y = yaw;
        h.fx.ring(p.x, p.z, rad * 0.9, rad, first + i * step, color, 0.7);
        return { ...p, o, at: first + i * step, up: false };
      });
      s.zones = () => ps.filter((p) => s.t < p.at + 0.3).map((p) => ({ x: p.x, z: p.z, r: rad }));
      return (dt: number) => {
        ps.forEach((p, i) => {
          if (s.t < p.at) return;
          const u = (s.t - p.at) / 0.15;
          p.o.position.y = s.t > s.dur - 0.6 ? p.o.position.y - dt * 6 : Math.min(0, -3 + u * 3);
          if (!p.up) { p.up = true; impact(p.x, p.z, rad, dmg, effect); }
          anim?.(p.o, i, s.t - p.at);
        });
      };
    };
    /** n spots on a line from the caster through the target */
    const linePts = (n: number, len: number) => {
      const dx = x - fromX, dz = z - fromZ, dl = Math.hypot(dx, dz) || 1;
      return Array.from({ length: n }, (_, i) => { const d = 1.8 + (i / (n - 1)) * len; return { x: fromX + (dx / dl) * d, z: fromZ + (dz / dl) * d }; });
    };

    // something that hunts him across the floor
    const chaser = (o: THREE.Object3D, sx: number, sz: number, speed: number, rad: number, tick: number, dmg: number, pull: number) => {
      const p = { x: sx, z: sz };
      let cd = 0;
      o.position.set(sx, 0, sz);
      return {
        p,
        step(dt: number) {
          const k = h.kirill(), dx = k.x - p.x, dz = k.z - p.z, d = Math.hypot(dx, dz) || 1;
          p.x += (dx / d) * Math.min(d, speed * dt);
          p.z += (dz / d) * Math.min(d, speed * dt);
          o.position.x = p.x; o.position.z = p.z;
          cd -= dt;
          if (d < rad && cd <= 0) { cd = tick; h.hurt(dmg * P, null, 0, 0, false); }
          if (pull && d < rad + 2.5) h.push(-(dx / d) * pull, -(dz / d) * pull, dt);
        },
      };
    };

    // a big red X carved into the floor (the examiner's mark); boom() when it's done
    const redX = (px: number, pz: number, rad: number) => {
      const mat = new THREE.MeshBasicMaterial({ color: SPELL_COLOR.redPen, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
      const bars = [Math.PI / 4, -Math.PI / 4].map((a) => {
        const m = add(new THREE.Mesh(new THREE.PlaneGeometry(1, rad * 0.3), mat));
        m.rotation.set(-Math.PI / 2, 0, a);
        m.position.set(px, 0.09, pz);
        m.scale.x = 0.01;
        return m;
      });
      h.fx.ring(px, pz, rad * 0.95, rad, 1, SPELL_COLOR.redPen, 0.6);
      return {
        grow(u: number) { bars[0].scale.x = Math.max(0.01, Math.min(1, u * 2) * rad * 2); bars[1].scale.x = Math.max(0.01, Math.max(0, u * 2 - 1) * rad * 2); },
        fade(dt: number) { mat.opacity = Math.max(0, mat.opacity - dt * 0.6); },
      };
    };

    switch (id) {
      case 'byteMeteors': case 'coffeeRain': {
        s.dur = 3.8;
        const glyphs = id === 'byteMeteors' ? ['0', '1', '1', '0', '{', '}', ';'] : ['C', 'O', 'F', 'F', 'E', 'E'];
        const rain = meteors(id === 'byteMeteors' ? 16 : 12, 2.8, glyphs, color, id === 'byteMeteors' ? 9 : 8);
        s.update = (dt) => { base(dt); rain(dt); };
        break;
      }
      case 'finalLap': {
        // a running track lays itself around him; the whistle counts down, then hurdles burst up
        s.dur = 3.6;
        const track = add(new THREE.Mesh(new THREE.PlaneGeometry(r * 2.1, r * 2.1), new THREE.MeshBasicMaterial({ map: trackTexture(), transparent: true, opacity: 0, depthWrite: false })));
        track.rotation.x = -Math.PI / 2; track.position.set(x, 0.05, z);
        const hurdles: THREE.Group[] = [];
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2, rr = r * 0.78;
          const hg = new THREE.Group();
          const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 0.08), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xf4efe2 : 0xd8332a }));
          bar.position.y = 0.9;
          const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), new THREE.MeshStandardMaterial({ color: 0x9a9aa0 }));
          l1.position.set(-0.55, 0.45, 0); const l2 = l1.clone(); l2.position.x = 0.55;
          hg.add(bar, l1, l2);
          hg.position.set(x + Math.cos(a) * rr, -1.2, z + Math.sin(a) * rr);
          hg.rotation.y = -a;
          hurdles.push(add(hg));
        }
        let beeps = 0, banged = false;
        s.update = (dt) => {
          base(dt);
          (track.material as THREE.MeshBasicMaterial).opacity = Math.min(0.9, s.t * 2) * (s.t > 3.2 ? (s.dur - s.t) / 0.4 : 1);
          const { d } = kd();
          if (d < r) h.status('slow', 0.2);
          if (s.t > 0.4 + beeps * 0.6 && beeps < 3) { beeps++; sfx.click(); h.fx.ring(x, z, r * 0.3, r, 0.3, color, 0.6); }
          if (!banged && s.t > 2.2) {
            banged = true;
            sfx.whistle(); sfx.boom(); h.shake(0.4);
            const q = kd();
            if (q.d < r) h.hurt(16 * P, 'down', q.nx, q.nz, true);
            for (const hg of hurdles) h.fx.burst(hg.position.x, hg.position.z, 0xf4efe2, 4, 0.3, 3);
          }
          for (const hg of hurdles) hg.position.y = banged ? Math.min(0, hg.position.y + dt * 9) - Math.max(0, s.t - 3.1) * 3 : -1.2;
        };
        break;
      }
      case 'subDrop': {
        // a subwoofer the size of a car falls from the sky, then pumps three shockwaves
        s.dur = 4.6;
        const box = new THREE.Group();
        const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 2.4), new THREE.MeshStandardMaterial({ color: 0x18161c, roughness: 0.6 }));
        const coneMat = new THREE.MeshStandardMaterial({ color: 0x2c2834, emissive: color, emissiveIntensity: 0.25 });
        const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.5, 0.2, 28), coneMat);
        cone.rotation.x = Math.PI / 2; cone.position.z = 1.22; cone.position.y = 0.2;
        const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.18, 0.15, 16), coneMat);
        tw.rotation.x = Math.PI / 2; tw.position.set(0, -0.85, 1.22);
        box.add(cab, cone, tw);
        box.position.set(x, 20, z);
        box.rotation.y = h.rng.next() * Math.PI;
        add(box);
        h.fx.ring(x, z, r * 0.95, r, 1.1, color, 0.85);
        let landed = false, waves = 0;
        const rings: { m: THREE.Mesh; t: number; hit: boolean }[] = [];
        s.update = (dt) => {
          base(dt);
          if (!landed) {
            box.position.y = Math.max(1.2, 20 - Math.pow(s.t / 1.1, 2) * 19);
            if (s.t >= 1.1) {
              landed = true;
              h.shake(0.6); sfx.boom(); juice.thump();
              h.fx.ring(x, z, 0.3, r + 1.5, 0.5, color, 0.9);
              h.fx.burst(x, z, 0xd8d0c8, 16, 0.4, 5);
              const q = kd();
              if (q.d < r) h.hurt(22 * P, 'down', q.nx, q.nz, true);
            }
            return;
          }
          // the pump
          const want = Math.floor((s.t - 1.4) / 0.9) + 1;
          if (s.t > 1.4 && want > waves && waves < 3) {
            waves++;
            sfx.beat(); juice.thump();
            const m = add(new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));
            m.rotation.x = -Math.PI / 2; m.position.set(x, 0.12, z);
            rings.push({ m, t: 0, hit: false });
          }
          const pulse = Math.max(0, 1 - ((s.t - 1.4) % 0.9) * 4);
          box.scale.setScalar(1 + pulse * 0.08);
          coneMat.emissiveIntensity = 0.25 + pulse * 0.9;
          for (const w of rings) {
            w.t += dt;
            const rr = 0.5 + w.t * 7.5;
            w.m.scale.setScalar(rr);
            (w.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 * (1 - w.t / 0.9));
            const q = kd();
            if (!w.hit && w.t < 0.9 && Math.abs(q.d - rr) < 0.55) { w.hit = true; h.hurt(7 * P, 'knock', q.nx, q.nz, false); h.status('slow', 1.2); }
          }
          if (s.t > s.dur - 0.5) box.position.y -= dt * 6;
        };
        break;
      }
      case 'snoozeCloud': {
        // a lilac cloud settles over the spot; under it he nods off; then a pillow drops on him
        s.dur = 5;
        const cloud = new THREE.Group();
        const cm = new THREE.MeshStandardMaterial({ color: 0xcfc4f4, transparent: true, opacity: 0.0, roughness: 1, emissive: 0x4a3a8a, emissiveIntensity: 0.25 });
        for (let i = 0; i < 11; i++) {
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.9 + h.rng.next() * 0.7, 14, 10), cm);
          const a = (i / 11) * Math.PI * 2;
          b.position.set(Math.cos(a) * r * 0.55 * h.rng.range(0.5, 1), h.rng.range(-0.3, 0.4), Math.sin(a) * r * 0.55 * h.rng.range(0.5, 1));
          cloud.add(b);
        }
        cloud.position.set(x, 4.2, z);
        add(cloud);
        const zs: THREE.Sprite[] = [];
        for (let i = 0; i < 8; i++) {
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyphTexture('Z', color), transparent: true, depthWrite: false, opacity: 0, toneMapped: false }));
          sp.scale.setScalar(0.7);
          zs.push(add(sp));
        }
        const pillow = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), new THREE.MeshStandardMaterial({ color: 0xf4f0ff }));
        pillow.scale.set(1.5, 0.55, 1.1);
        pillow.visible = false;
        add(pillow);
        let px = x, pz = z, dropped = false;
        s.update = (dt) => {
          base(dt);
          cm.opacity = Math.min(0.75, s.t * 1.2) * (s.t > s.dur - 0.6 ? (s.dur - s.t) / 0.6 : 1);
          cloud.rotation.y += dt * 0.25;
          cloud.position.y = 4.2 + Math.sin(s.t * 1.6) * 0.15;
          zs.forEach((sp, i) => {
            const u = ((s.t * 0.4 + i / zs.length) % 1);
            const a = i * 2.4;
            sp.position.set(x + Math.cos(a) * r * 0.6, 0.6 + u * 3.2, z + Math.sin(a) * r * 0.6);
            sp.material.opacity = Math.sin(u * Math.PI) * 0.9 * Math.min(1, s.t);
          });
          const q = kd();
          if (q.d < r && s.t > 0.4) { h.status('drowsy', 0.4); h.status('slow', 0.3); }
          if (!dropped && s.t > 3.4) {
            dropped = true;
            if (q.d < r + 1) { px = q.k.x; pz = q.k.z; }
            pillow.visible = true;
            h.fx.ring(px, pz, 1.4, 1.5, 0.45, color, 0.9);
          }
          if (dropped && pillow.visible) {
            const u = Math.min(1, (s.t - 3.4) / 0.45);
            pillow.position.set(px, 6 * (1 - u) + 0.5, pz);
            if (u >= 1 && pillow.userData.hit !== true) {
              pillow.userData.hit = true;
              sfx.boom(); h.shake(0.3);
              h.fx.burst(px, pz, 0xffffff, 18, 0.5, 4);
              const k = h.kirill();
              if (Math.hypot(k.x - px, k.z - pz) < 1.6) h.hurt(14 * P, 'stun', 0, 0, true);
            }
            if (s.t > s.dur - 0.5) pillow.scale.multiplyScalar(0.9);
          }
        };
        break;
      }
      case 'discoInferno': {
        // a disco ball comes down; four coloured beams sweep the floor around it
        s.dur = 5;
        const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), new THREE.MeshStandardMaterial({ color: 0xd8d8e0, metalness: 0.9, roughness: 0.25, flatShading: true, emissive: 0x302838 }));
        ball.position.set(x, 12, z);
        add(ball);
        const halo = add(new THREE.Sprite(glowMat(0xffd8f0, 0.5)));
        halo.scale.setScalar(3);
        const cols = [0xff4ab0, 0x4ad8ff, 0xffd24a, 0x7aff5a];
        const beams = cols.map((c) => {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(r, 0.5), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
          m.rotation.x = -Math.PI / 2;
          return add(m);
        });
        const shafts = cols.map((c) => add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.35, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))));
        let hitCd = 0;
        s.update = (dt) => {
          base(dt);
          hitCd -= dt;
          ball.position.y = Math.max(4.4, 12 - s.t * 10);
          ball.rotation.y += dt * 2.2;
          halo.position.copy(ball.position);
          const on = s.t > 0.8 && s.t < s.dur - 0.3;
          const spin = s.t * 1.5;
          const q = kd();
          const ka = Math.atan2(q.k.z - z, q.k.x - x);
          beams.forEach((m, i) => {
            const a = spin + (i / beams.length) * Math.PI * 2;
            const mat = m.material as THREE.MeshBasicMaterial;
            mat.opacity = on ? 0.55 : Math.max(0, mat.opacity - dt * 3);
            m.position.set(x + Math.cos(a) * r / 2, 0.1, z + Math.sin(a) * r / 2);
            m.rotation.z = -a;
            // the light shaft from the ball to the far end of the beam
            const sh = shafts[i], ex = x + Math.cos(a) * r * 0.85, ez = z + Math.sin(a) * r * 0.85;
            const dx = ex - x, dy = 0 - ball.position.y, dz = ez - z, len = Math.hypot(dx, dy, dz);
            sh.position.set((x + ex) / 2, ball.position.y / 2, (z + ez) / 2);
            sh.scale.set(1, len, 1);
            sh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize().negate());
            (sh.material as THREE.MeshBasicMaterial).opacity = mat.opacity * 0.5;
            let da = ka - a; da = Math.atan2(Math.sin(da), Math.cos(da));
            if (on && hitCd <= 0 && q.d < r && Math.abs(da) * Math.max(q.d, 0.5) < 0.45) { hitCd = 0.45; h.hurt(6 * P, null, q.nx, q.nz, false); h.fx.burst(q.k.x, q.k.z, cols[i], 6, 1, 2); }
          });
          if (s.t > s.dur - 0.4) ball.position.y += dt * 20;
        };
        break;
      }
      case 'rumorMill': {
        // a tornado of gossip pages: it drags him in and cuts him with paper
        s.dur = 4.6;
        const tex = paperTexture();
        const pages = Array.from({ length: 30 }, (_, i) => {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.7), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide }));
          m.userData = { a: (i / 30) * Math.PI * 2 * 3, y: (i / 30) * 4, rr: 0.6 + (i % 5) * 0.55 };
          return add(m);
        });
        let tick = 0;
        s.update = (dt) => {
          base(dt);
          const grow = Math.min(1, s.t * 1.5) * (s.t > s.dur - 0.5 ? (s.dur - s.t) / 0.5 : 1);
          for (const m of pages) {
            const d = m.userData;
            d.a += dt * (3.2 - d.rr * 0.4);
            const rr = d.rr * grow * (0.7 + d.y * 0.12);
            m.position.set(x + Math.cos(d.a) * rr, 0.3 + ((d.y + s.t * 0.9) % 4.2), z + Math.sin(d.a) * rr);
            m.rotation.set(s.t * 3 + d.a, d.a, s.t * 2);
          }
          const q = kd();
          if (q.d < r + 1.5 && s.t > 0.3) h.push(-q.nx * 3.2, -q.nz * 3.2, dt);
          tick -= dt;
          if (q.d < 1.6 && tick <= 0) { tick = 0.5; h.hurt(4 * P, null, 0, 0, false); }
        };
        break;
      }
      case 'paparazzi': {
        // a ring of flashbulbs pops one after another, then all at once
        s.dur = 3.8;
        const n = 7;
        const bulbs = Array.from({ length: n }, (_, i) => {
          const a = (i / n) * Math.PI * 2;
          const g = new THREE.Group();
          const cam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.24), new THREE.MeshStandardMaterial({ color: 0x1c1c22 }));
          const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.14, 14), new THREE.MeshStandardMaterial({ color: 0x484858, metalness: 0.6, roughness: 0.3 }));
          lens.rotation.x = Math.PI / 2; lens.position.z = 0.17;
          const fl = new THREE.Sprite(glowMat(0xffffff, 0)); fl.scale.setScalar(4); fl.position.z = 0.25;
          g.add(cam, lens, fl);
          g.position.set(x + Math.cos(a) * r, 1.6, z + Math.sin(a) * r);
          g.lookAt(x, 1.0, z);
          g.userData = { fl, done: false, at: 0.7 + i * 0.3 };
          return add(g);
        });
        let finale = false;
        s.update = (dt) => {
          base(dt);
          for (const g of bulbs) {
            const fl = g.userData.fl as THREE.Sprite;
            g.position.y = 1.6 + Math.sin(s.t * 3 + g.id) * 0.08;
            fl.material.opacity = Math.max(0, fl.material.opacity - dt * 3);
            if (!g.userData.done && s.t > g.userData.at) {
              g.userData.done = true;
              fl.material.opacity = 0.9;
              sfx.click(); juice.gasp();
              const k = h.kirill();
              const dd = Math.hypot(k.x - g.position.x, k.z - g.position.z);
              if (dd < 2.6) { h.hurt(6 * P, null, 0, 0, false); h.status('blind', 1.4); }
            }
          }
          if (!finale && s.t > 3.0) {
            finale = true;
            for (const g of bulbs) (g.userData.fl as THREE.Sprite).material.opacity = 1;
            h.fx.ring(x, z, 0.3, r + 1, 0.4, 0xffffff, 0.9);
            sfx.boom();
            const q = kd();
            if (q.d < r) { h.hurt(10 * P, 'stun', 0, 0, true); h.status('blind', 2.5); }
          }
        };
        break;
      }
      case 'redPen': {
        // the examiner's red pen carves a huge X into the floor, then it erupts; tickets fall around it
        s.dur = 3.6;
        const xm = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
        const bars = [Math.PI / 4, -Math.PI / 4].map((a) => {
          const m = add(new THREE.Mesh(new THREE.PlaneGeometry(1, 0.55), xm));
          m.rotation.set(-Math.PI / 2, 0, a);
          m.position.set(x, 0.09, z);
          m.scale.x = 0.01;
          return m;
        });
        const rain = meteors(8, 2.2, ['5', '4', '3', '2', '?'], 0xf4efe2, 7);
        let boom = false;
        s.update = (dt) => {
          base(dt);
          rain(dt);
          const u = Math.min(1, s.t / 1.4);
          bars[0].scale.x = Math.min(1, u * 2) * r * 2;
          bars[1].scale.x = Math.max(0, u * 2 - 1) * r * 2;
          if (!boom && s.t > 1.6) {
            boom = true;
            sfx.boom(); juice.thump(); h.shake(0.7);
            h.fx.ring(x, z, 0.4, r + 1.6, 0.6, color, 1);
            h.fx.burst(x, z, color, 26, 0.5, 7);
            const q = kd();
            if (q.d < r) h.hurt(26 * P, 'down', q.nx, q.nz, true);
          }
          if (boom) xm.opacity = Math.max(0, xm.opacity - dt * 0.5);
        };
        break;
      }

      // ------------------------------------------------ the second aimed spells

      case 'firewall': {
        // a cage of green code rises around the spot: crossing it burns, and then it compiles inward
        s.dur = 4.6;
        const n = 26;
        const mat = flatMat(codeTexture(), 0);
        const walls = Array.from({ length: n }, (_, i) => {
          const a = (i / n) * Math.PI * 2;
          const m = add(new THREE.Mesh(new THREE.PlaneGeometry((Math.PI * 2 * r) / n + 0.06, 2.6), mat));
          m.position.set(x + Math.cos(a) * r, -1.3, z + Math.sin(a) * r);
          m.rotation.y = Math.PI / 2 - a;
          return m;
        });
        let cd = 0, compiled = false;
        let wasIn = Math.hypot(h.kirill().x - x, h.kirill().z - z) < r;
        s.update = (dt) => {
          base(dt);
          cd -= dt;
          const up = Math.min(1, s.t / 0.45), down = s.t > s.dur - 0.5 ? (s.dur - s.t) / 0.5 : 1;
          for (const m of walls) m.position.y = -1.3 + up * 2.6 * down;
          mat.opacity = 0.7 * up * down;
          (mat.map as THREE.Texture).offset.y = -s.t * 0.6;
          const q = kd(), inside = q.d < r;
          if (!compiled && s.t > 0.45 && cd <= 0 && (inside !== wasIn || Math.abs(q.d - r) < 0.35)) {
            // thrown back to the side he came from
            cd = 0.5;
            const sgn = wasIn ? -1 : 1;
            h.hurt(7 * P, 'knock', q.nx * sgn, q.nz * sgn, true);
            h.fx.burst(q.k.x, q.k.z, color, 8, 1, 3);
          }
          wasIn = inside;
          if (!compiled && s.t > 3.5) {
            compiled = true;
            h.fx.ring(x, z, r, 0.3, 0.35, color, 0.95);
            sfx.boom(); h.shake(0.35);
            if (q.d < r) h.hurt(16 * P, 'down', -q.nx, -q.nz, true);
          }
        };
        break;
      }
      case 'hurdleLine': {
        // a line of hurdles bursts out of the floor from her toward the spot
        s.dur = 2.8;
        const hurdle = () => {
          const g = new THREE.Group();
          const bar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.16, 0.1), new THREE.MeshStandardMaterial({ color: 0xd8332a }));
          bar.position.y = 1.0;
          const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.0, 0.07), new THREE.MeshStandardMaterial({ color: 0xf4efe2 }));
          l1.position.set(-0.72, 0.5, 0); const l2 = l1.clone(); l2.position.x = 0.72;
          g.add(bar, l1, l2);
          return g;
        };
        const go = erupts(linePts(9, 12), 0.45, 0.1, hurdle, 1.1, 11, 'knock');
        s.update = (dt) => { base(dt); go(dt); };
        sfx.whistle();
        break;
      }
      case 'equalizer': {
        // the beat made solid: a row of EQ bars punches up toward the spot and keeps bouncing
        s.dur = 3.2;
        const cols = [0x6a3aff, 0xa04aff, 0xff4ad8];
        const bar = (i: number) => {
          const g = new THREE.Group();
          for (let j = -1; j <= 1; j++) {
            const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.4, 0.5), new THREE.MeshStandardMaterial({ color: 0x1a1424, emissive: cols[(i + j + 3) % 3], emissiveIntensity: 0.55 }));
            m.position.set(j * 0.6, 1.2, 0);
            g.add(m);
          }
          return g;
        };
        const go = erupts(linePts(10, 13), 0.4, 0.08, bar, 1.2, 9, 'knock', (o, i, tt) => {
          o.children.forEach((m, j) => { m.scale.y = 0.5 + Math.abs(Math.sin(tt * 9 + i * 0.7 + j * 1.3)) * 0.9; m.position.y = 1.2 * m.scale.y; });
        });
        s.update = (dt) => { base(dt); go(dt); };
        sfx.beat();
        break;
      }
      case 'pillowFort': {
        // five pillows, one after another, in a cross on the spot
        s.dur = 3.4;
        const offs = [[0, 0], [1.8, 0], [-1.8, 0], [0, 1.8], [0, -1.8]];
        const pillow = () => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshStandardMaterial({ color: 0xf4f0ff })); m.scale.set(1.1, 0.42, 0.8); return m; };
        const go = drops(5, (i) => ({ x: x + offs[i][0], z: z + offs[i][1] }), 0.6, 0.28, pillow, 1.3, 12, 'stun');
        s.update = (dt) => { base(dt); go(dt); };
        break;
      }
      case 'champagne': {
        // champagne geysers spiral out of the floor around the spot
        s.dur = 3.4;
        const pts = [{ x, z }, ...Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2; return { x: x + Math.cos(a) * r * 0.8, z: z + Math.sin(a) * r * 0.8 }; })];
        const geyser = () => {
          const g = new THREE.Group();
          const col = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, 5, 14, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }));
          col.position.y = 2.5;
          const top = new THREE.Sprite(glowMat(0xfff2c8, 0.7)); top.scale.setScalar(2); top.position.y = 5;
          g.add(col, top);
          return g;
        };
        const go = erupts(pts, 0.55, 0.16, geyser, 1.1, 10, 'knock', (o, _i, tt) => {
          o.scale.set(1, Math.max(0.05, 1 - Math.max(0, tt - 0.6) * 1.2), 1);
          if (Math.random() < 0.3) h.fx.burst(o.position.x, o.position.z, 0xfff2c8, 1, 3, 2);
        });
        s.update = (dt) => { base(dt); go(dt); };
        break;
      }
      case 'hotTake': {
        // a spotlight lands on the spot, then hunts him; when it stops, it burns
        s.dur = 4.3;
        const g = new THREE.Group();
        const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
        disc.rotation.x = -Math.PI / 2; disc.position.y = 0.07;
        const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.25, r, 11, 28, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }));
        cone.position.y = 5.5;
        g.add(disc, cone);
        add(g);
        const ch = chaser(g, x, z, 3.4, 0, 9, 0, 0);
        let burnt = false;
        s.zones = () => (s.t > 2.6 && !burnt ? [{ x: ch.p.x, z: ch.p.z, r }] : []);
        s.update = (dt) => {
          base(dt);
          if (s.t > 0.4 && s.t < 3.0) ch.step(dt);
          const blink = s.t > 3.0 ? (Math.sin(s.t * 40) > 0 ? 0.75 : 0.25) : 0.4;
          (disc.material as THREE.MeshBasicMaterial).opacity = burnt ? Math.max(0, 0.4 - (s.t - 3.6)) : blink;
          if (!burnt && s.t > 3.6) { burnt = true; impact(ch.p.x, ch.p.z, r, 16, 'down', color, true); h.fx.burst(ch.p.x, ch.p.z, 0xffffff, 10, 1.5, 3); }
        };
        break;
      }
      case 'ringLight': {
        // a giant ring light over the spot: first the ring flashes, then the middle
        s.dur = 3.4;
        const inner = 1.6;
        const band = add(new THREE.Mesh(new THREE.RingGeometry(inner, r, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.15, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));
        band.rotation.x = -Math.PI / 2; band.position.set(x, 0.08, z);
        const core = add(new THREE.Mesh(new THREE.CircleGeometry(inner, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));
        core.rotation.x = -Math.PI / 2; core.position.set(x, 0.08, z);
        const lamp = add(new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.14, 10, 40), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6 })));
        lamp.position.set(x, 4.2, z); lamp.rotation.x = Math.PI / 2;
        let a = false, b = false;
        s.zones = () => (s.t < 1.2 ? [{ x, z, r }] : s.t < 2.2 ? [{ x, z, r: inner }] : []);
        s.update = (dt) => {
          base(dt);
          lamp.rotation.z += dt * 2;
          const bm = band.material as THREE.MeshBasicMaterial, cm = core.material as THREE.MeshBasicMaterial;
          if (!a) bm.opacity = 0.12 + Math.abs(Math.sin(s.t * 10)) * 0.12;
          else bm.opacity = Math.max(0, bm.opacity - dt * 1.5);
          if (a && !b) cm.opacity = 0.1 + Math.abs(Math.sin(s.t * 12)) * 0.15;
          else if (b) cm.opacity = Math.max(0, cm.opacity - dt * 1.5);
          const q = kd();
          if (!a && s.t > 1.2) { a = true; bm.opacity = 0.85; sfx.click(); juice.gasp(); if (q.d > inner && q.d < r) { h.hurt(14 * P, 'stun', 0, 0, true); h.status('blind', 1.6); } }
          if (!b && s.t > 2.2) { b = true; cm.opacity = 0.9; sfx.boom(); if (q.d < inner) { h.hurt(14 * P, 'stun', 0, 0, true); h.status('blind', 1.6); } }
        };
        break;
      }
      case 'ticketDraw': {
        // three exam tickets slam down: on the spot, then marching toward him
        s.dur = 3.2;
        const k0 = h.kirill();
        const dx = k0.x - x, dz = k0.z - z, dl = Math.hypot(dx, dz);
        const ux = dl > 0.5 ? dx / dl : 0, uz = dl > 0.5 ? dz / dl : 1;
        const ticket = () => { const m = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 2.4), [0, 0, 1, 0, 0, 0].map((f) => new THREE.MeshStandardMaterial(f ? { map: ticketTexture() } : { color: 0xe8e0cc }))); m.rotation.y = h.rng.range(-0.4, 0.4); return m; };
        const go = drops(3, (i) => ({ x: x + ux * i * 2.2, z: z + uz * i * 2.2 }), 0.6, 0.45, ticket, 1.5, 15, 'down');
        s.update = (dt) => { base(dt); go(dt); };
        break;
      }
      case 'notesShare': {
        s.dur = 3.6;
        const rain = meteors(10, 2.4, ['A', 'B', 'C'], color, 7);
        s.update = (dt) => { base(dt); rain(dt); };
        break;
      }

      // ------------------------------------------------ ultimates

      case 'blueScreen': {
        // the whole fight crashes: a blue screen, he freezes, and the bytes come down on him wherever he runs
        s.dur = 5.8;
        h.overlay('bsod', 0.8);
        h.hurt(3 * P, 'stun', 0, 0, true);
        const rain = meteors(30, 4.6, ['0', '1', '{', '}', '#', '!', ';'], color, 8, true, 5);
        s.update = (dt) => { base(dt); rain(dt); };
        break;
      }
      case 'marathon': {
        // four giant medicine balls roll through the arena in lanes; the gaps between them are the way out
        s.dur = 5.6;
        sfx.whistle();
        const dx = x - fromX, dz = z - fromZ, dl = Math.hypot(dx, dz) || 1;
        const ux = dx / dl, uz = dz / dl, px = -uz, pz = ux;
        const lanes = [-4.6, -1.5, 1.5, 4.6], order = [1, 2, 0, 3];
        const balls = lanes.map((off, i) => {
          const m = add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 1), new THREE.MeshStandardMaterial({ color: 0x8a2a1a, roughness: 0.8, flatShading: true })));
          const strip = add(new THREE.Mesh(new THREE.PlaneGeometry(2.6, 30), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));
          const cx = x + px * off, cz = z + pz * off;
          strip.rotation.set(-Math.PI / 2, 0, -Math.atan2(ux, uz) + Math.PI);
          strip.position.set(cx, 0.07, cz);
          return { m, strip, sx: cx - ux * 15, sz: cz - uz * 15, at: 0.6 + order.indexOf(i) * 0.5, hit: false, x: 0, z: 0 };
        });
        s.zones = () => balls.filter((b) => s.t > b.at - 0.6 && s.t < b.at + 3).map((b) => ({ x: b.x + ux * 2, z: b.z + uz * 2, r: 2.4 }));
        s.update = (dt) => {
          base(dt);
          for (const b of balls) {
            const tt = s.t - b.at;
            (b.strip.material as THREE.MeshBasicMaterial).opacity = tt < -0.6 ? 0 : tt < 0 ? 0.18 + Math.abs(Math.sin(s.t * 12)) * 0.12 : Math.max(0, 0.18 - tt * 0.1);
            const d = Math.max(0, tt) * 10;
            b.x = b.sx + ux * d; b.z = b.sz + uz * d;
            b.m.position.set(b.x, 1.25, b.z);
            b.m.visible = tt > -0.2 && d < 30;
            b.m.rotateOnWorldAxis(new THREE.Vector3(px, 0, pz), dt * 8);
            if (tt > 0 && d < 30 && Math.random() < 0.5) h.fx.burst(b.x, b.z, 0xd8c8a8, 1, 0.2, 2);
            const k = h.kirill();
            if (!b.hit && tt > 0 && d < 30 && Math.hypot(k.x - b.x, k.z - b.z) < 1.7) {
              b.hit = true;
              const side = (k.x - b.x) * px + (k.z - b.z) * pz >= 0 ? 1 : -1;
              h.hurt(18 * P, 'down', px * side + ux * 0.5, pz * side + uz * 0.5, true);
              h.shake(0.4); sfx.boom();
            }
          }
        };
        break;
      }
      case 'micDrop': {
        // a microphone the size of a lamp post drops on him; then the beat drops, four times
        s.dur = 5.6;
        const mic = new THREE.Group();
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.22, 3.4, 16), new THREE.MeshStandardMaterial({ color: 0x18161c, metalness: 0.4, roughness: 0.4 }));
        handle.position.y = 1.7;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.85, 18, 14), new THREE.MeshStandardMaterial({ color: 0x9a9aa8, metalness: 0.7, roughness: 0.35, wireframe: false }));
        head.position.y = 3.7;
        mic.add(handle, head);
        mic.rotation.z = 0.25;
        mic.position.set(x, 22, z);
        add(mic);
        h.fx.ring(x, z, r * 0.95, r, 1.2, color, 0.9);
        let landed = false, beats = 0;
        const rings: { m: THREE.Mesh; t: number; hit: boolean }[] = [];
        s.update = (dt) => {
          base(dt);
          if (!landed) {
            mic.position.y = Math.max(0, 22 - Math.pow(s.t / 1.2, 2) * 22);
            if (s.t >= 1.2) { landed = true; impact(x, z, r, 24, 'down', color, true); }
            return;
          }
          const want = Math.floor((s.t - 1.6) / 0.75) + 1;
          if (s.t > 1.6 && want > beats && beats < 4) {
            beats++;
            sfx.beat(); juice.thump(); h.shake(0.25);
            const m = add(new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 72), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));
            m.rotation.x = -Math.PI / 2; m.position.set(x, 0.12, z);
            rings.push({ m, t: 0, hit: false });
          }
          head.scale.setScalar(1 + Math.max(0, 1 - ((s.t - 1.6) % 0.75) * 5) * 0.15);
          for (const w of rings) {
            w.t += dt;
            const rr = 0.6 + w.t * 12;
            w.m.scale.setScalar(rr);
            (w.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 * (1 - w.t / 1.2));
            const q = kd();
            if (!w.hit && w.t < 1.2 && Math.abs(q.d - rr) < 0.6) { w.hit = true; h.hurt(9 * P, 'knock', q.nx, q.nz, false); h.status('slow', 1); }
          }
          if (s.t > s.dur - 0.5) mic.position.y -= dt * 8;
        };
        break;
      }
      case 'endlessLecture': {
        // the lights go down, a huge clock ticks over him, he can barely keep his eyes open, and the pillows rain
        s.dur = 6.6;
        h.overlay('lecture', 6.2);
        const clock = new THREE.Group();
        const face = new THREE.Mesh(new THREE.CircleGeometry(1.6, 40), new THREE.MeshStandardMaterial({ color: 0xf4efe2, emissive: 0x3a3450, emissiveIntensity: 0.4, side: THREE.DoubleSide }));
        const rim = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.12, 8, 40), new THREE.MeshStandardMaterial({ color: 0x3a2a22 }));
        const hh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.05), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
        const mh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.35, 0.05), new THREE.MeshStandardMaterial({ color: 0xc8302a }));
        hh.geometry.translate(0, 0.45, 0.04); mh.geometry.translate(0, 0.67, 0.05);
        clock.add(face, rim, hh, mh);
        add(clock);
        const pillow = () => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshStandardMaterial({ color: 0xe8e0ff })); m.scale.set(1, 0.4, 0.75); return m; };
        const go = drops(7, () => { const k = h.kirill(); return { x: k.x + h.rng.range(-0.5, 0.5), z: k.z + h.rng.range(-0.5, 0.5) }; }, 1.0, 0.72, pillow, 1.3, 10, 'stun');
        s.update = (dt) => {
          base(dt);
          const k = h.kirill();
          h.status('drowsy', 0.3); h.status('slow', 0.3);
          clock.position.set(k.x, 5 + Math.sin(s.t * 1.5) * 0.2, k.z);
          clock.rotation.y = s.t * 0.3;
          mh.rotation.z = -s.t * 6; hh.rotation.z = -s.t * 0.5;
          go(dt);
        };
        break;
      }
      case 'afterparty': {
        // the floor turns into a dance floor: half the tiles light up, then the other half; lit tiles burn
        s.dur = 6.6;
        const N = 8, T = 2;
        const cols = [0xff4ab0, 0x4ad8ff, 0xffd24a, 0x7aff5a];
        const tiles: { m: THREE.Mesh; par: number; x: number; z: number }[] = [];
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
          const tx = x + (i - (N - 1) / 2) * T, tz = z + (j - (N - 1) / 2) * T;
          const m = add(new THREE.Mesh(new THREE.PlaneGeometry(T * 0.92, T * 0.92), new THREE.MeshBasicMaterial({ color: cols[(i * 3 + j) % 4], transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));
          m.rotation.x = -Math.PI / 2; m.position.set(tx, 0.07, tz);
          tiles.push({ m, par: (i + j) % 2, x: tx, z: tz });
        }
        const ball = add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 1), new THREE.MeshStandardMaterial({ color: 0xd8d8e0, metalness: 0.9, roughness: 0.25, flatShading: true })));
        ball.position.set(x, 7, z);
        const cyc = 1.3, first = 0.6, cycles = 4;
        let cd = 0;
        const phase = () => { const c = Math.floor((s.t - first) / cyc); const u = (s.t - first) % cyc; return { c, u, on: s.t > first && c < cycles }; };
        const tileOf = (px: number, pz: number) => tiles.find((tl) => Math.abs(px - tl.x) <= T / 2 && Math.abs(pz - tl.z) <= T / 2);
        s.zones = () => { const p = phase(); const k = h.kirill(); const tl = tileOf(k.x, k.z); return p.on && tl && tl.par === p.c % 2 ? [{ x: tl.x, z: tl.z, r: T * 0.6 }] : []; };
        s.update = (dt) => {
          base(dt);
          ball.rotation.y += dt * 2;
          cd -= dt;
          const p = phase();
          for (const tl of tiles) {
            const mine = p.on && tl.par === p.c % 2;
            (tl.m.material as THREE.MeshBasicMaterial).opacity = !mine ? 0.04 : p.u < 0.5 ? 0.12 + Math.abs(Math.sin(s.t * 14)) * 0.1 : 0.62;
          }
          if (p.on && p.u >= 0.5 && cd <= 0) {
            const k = h.kirill(), tl = tileOf(k.x, k.z);
            if (tl && tl.par === p.c % 2) { cd = 0.45; h.hurt(7 * P, null, 0, 0, false); h.fx.burst(k.x, k.z, cols[p.c % 4], 6, 0.5, 3); }
          }
          if (p.on && Math.abs(p.u - 0.5) < dt) { sfx.beat(); juice.thump(); }
        };
        break;
      }
      case 'viralScandal': {
        // three tornadoes of gossip close in on him from three sides
        s.dur = 6.2;
        const k0 = h.kirill();
        const twisters = [0, 1, 2].map((i) => {
          const a = (i / 3) * Math.PI * 2 + h.rng.next();
          const g = add(tornado(paperTexture(), 16));
          return { g, c: chaser(g, k0.x + Math.cos(a) * 6.5, k0.z + Math.sin(a) * 6.5, 2.5, 1.6, 0.5, 5, 2.2) };
        });
        s.zones = () => twisters.map((tw) => ({ x: tw.c.p.x, z: tw.c.p.z, r: 2 }));
        s.update = (dt) => {
          base(dt);
          const grow = Math.min(1, s.t * 1.5) * (s.t > s.dur - 0.5 ? (s.dur - s.t) / 0.5 : 1);
          for (const tw of twisters) {
            if (s.t > 0.5) tw.c.step(dt);
            tw.g.scale.set(grow, 1, grow);
            (tw.g.userData.spin as (dt: number) => void)(dt);
          }
        };
        break;
      }
      case 'liveStream': {
        // the stream goes live: red laser lines sweep across the arena, one after another
        s.dur = 6.4;
        const base0 = h.rng.next() * Math.PI;
        const k0 = h.kirill();
        const sweeps = [0, 1, 2].map((i) => {
          const th = base0 + (i * Math.PI) / 3;
          const g = new THREE.Group();
          const beam = new THREE.Mesh(new THREE.BoxGeometry(30, 0.1, 0.1), new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: 0 }));
          beam.position.y = 1.0;
          const glow = new THREE.Mesh(new THREE.PlaneGeometry(30, 0.7), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
          glow.rotation.x = -Math.PI / 2; glow.position.y = 0.07;
          g.add(beam, glow);
          g.rotation.y = -th;
          add(g);
          return { g, beam, glow, th, nx: -Math.sin(th), nz: Math.cos(th), at: 0.8 + i * 1.3, hit: false, off: -9 };
        });
        s.zones = () => sweeps.filter((w) => s.t > w.at - 0.5 && w.off < 9).map((w) => ({ x: k0.x + w.nx * (w.off + 1.2), z: k0.z + w.nz * (w.off + 1.2), r: 1.4 }));
        s.update = (dt) => {
          base(dt);
          const k = h.kirill();
          for (const w of sweeps) {
            const tt = s.t - w.at;
            w.off = -9 + Math.max(0, tt) * 5;
            w.g.position.set(k0.x + w.nx * w.off, 0, k0.z + w.nz * w.off);
            const on = tt > 0 && w.off < 9;
            (w.beam.material as THREE.MeshBasicMaterial).opacity = on ? 0.95 : tt > -0.6 && tt <= 0 ? 0.25 : 0;
            (w.glow.material as THREE.MeshBasicMaterial).opacity = on ? 0.35 : tt > -0.6 && tt <= 0 ? 0.12 : 0;
            if (on && !w.hit && Math.abs((k.x - k0.x) * w.nx + (k.z - k0.z) * w.nz - w.off) < 0.4) { w.hit = true; h.hurt(12 * P, 'knock', w.nx, w.nz, true); h.status('blind', 1); }
          }
        };
        break;
      }
      case 'session': {
        // the examiner marks him three times, wherever he is, then fails the whole floor
        s.dur = 6.4;
        const marks: { x: number; z: number; at: number; mk: ReturnType<typeof redX> | null; done: boolean; rad: number }[] = [
          { x: 0, z: 0, at: 0.4, mk: null, done: false, rad: 2.4 }, { x: 0, z: 0, at: 1.6, mk: null, done: false, rad: 2.4 },
          { x: 0, z: 0, at: 2.8, mk: null, done: false, rad: 2.4 }, { x, z, at: 4.0, mk: null, done: false, rad: 5 },
        ];
        const rain = meteors(10, 5, ['2', '2', '3', '?'], 0xf4efe2, 6, true, 4);
        s.zones = () => marks.filter((m) => m.mk && !m.done).map((m) => ({ x: m.x, z: m.z, r: m.rad }));
        s.update = (dt) => {
          base(dt);
          rain(dt);
          marks.forEach((m, i) => {
            if (!m.mk && s.t >= m.at) {
              if (i < 3) { const k = h.kirill(); m.x = k.x; m.z = k.z; }
              m.mk = redX(m.x, m.z, m.rad);
            }
            if (!m.mk) return;
            const u = (s.t - m.at) / 1.1;
            m.mk.grow(u);
            if (!m.done && u >= 1) { m.done = true; impact(m.x, m.z, m.rad, i === 3 ? 28 : 16, 'down', SPELL_COLOR.redPen, true); }
            if (m.done) m.mk.fade(dt);
          });
        };
        break;
      }
      case 'groupStudy': {
        s.dur = 5.4;
        const rain = meteors(24, 4.4, ['C', 'O', 'F', 'E'], color, 7, true, 5);
        s.update = (dt) => { base(dt); rain(dt); };
        break;
      }
    }
    this.live.push(s);
  }

  // visuals for the signature moves (damage is handled in the arena)
  moveFx(id: MoveId, at: () => { x: number; z: number; yaw: number }, kx: number, kz: number) {
    const h = this.h;
    const c0 = at();
    const color = MOVE_COLOR[id];
    // only a look: Kirill doesn't run from it (zones: none)
    const s: Live = { t: 0, dur: 1.2, x: c0.x, z: c0.z, r: 0, update: () => {}, objs: [], zones: () => [] };
    const add = <T extends THREE.Object3D>(o: T) => { h.root.add(o); s.objs.push(o); return o; };
    const addMat = (o: THREE.Mesh | THREE.Sprite) => o.material as THREE.MeshBasicMaterial;
    const fade = (u: number) => Math.max(0, Math.min(1, u < 0.15 ? u / 0.15 : (1 - u) / 0.85));
    // every move: a small rune circle flares under the caster
    const rune = add(runeDecal(1.7, color));
    rune.position.set(c0.x, 0.06, c0.z);
    const runeUp = (dt: number) => {
      const u = s.t / s.dur;
      rune.rotation.z += dt * 2.5;
      addMat(rune).opacity = 0.8 * fade(u);
      const p = at(); rune.position.x = p.x; rune.position.z = p.z;
      rune.scale.setScalar(0.6 + Math.min(1, s.t * 4) * 0.5);
    };
    const flat = (geo: THREE.BufferGeometry, op = 0.7, col = color) => {
      const m = add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide })));
      return m;
    };
    const glyphs = (chars: string[], n: number, x: number, z: number, spread: number, rise: number, col = color) => {
      const g = Array.from({ length: n }, (_, i) => {
        const sp = add(new THREE.Sprite(new THREE.SpriteMaterial({ map: glyphTexture(chars[i % chars.length], col), transparent: true, depthWrite: false, toneMapped: false })));
        sp.scale.setScalar(0.7);
        sp.userData = { ox: h.rng.range(-spread, spread), oz: h.rng.range(-spread, spread), d: h.rng.range(0, 0.3) };
        return sp;
      });
      return (u: number) => g.forEach((sp) => {
        const v = Math.max(0, u - sp.userData.d);
        sp.position.set(x + sp.userData.ox, 1.2 + v * rise, z + sp.userData.oz);
        sp.material.opacity = fade(v);
      });
    };
    const ka = Math.atan2(kx - c0.x, kz - c0.z);
    let step: (dt: number, u: number) => void = () => {};

    switch (id) {
      case 'whistle': case 'flash': {
        // a cone of sound (or light) bursting out in front
        const cone = id === 'whistle' ? 0.8 : 0.9, range = id === 'whistle' ? 7.5 : 8;
        const arcs = [0, 1, 2].map(() => { const m = flat(new THREE.RingGeometry(0.9, 1, 40, 1, -cone, cone * 2), 0.8); m.rotation.set(-Math.PI / 2, ka - Math.PI / 2, 0, 'YXZ'); return m; });
        const wedge = flat(new THREE.CircleGeometry(range, 32, -cone, cone * 2), id === 'flash' ? 0.45 : 0.15);
        wedge.rotation.set(-Math.PI / 2, ka - Math.PI / 2, 0, 'YXZ'); wedge.position.set(c0.x, 0.08, c0.z);
        const pop = id === 'flash' ? add(new THREE.Sprite(glowMat(0xffffff, 1))) : null;
        step = (_dt, u) => {
          arcs.forEach((m, i) => {
            const v = Math.max(0, u * 1.6 - i * 0.18);
            m.position.set(c0.x, 1.2 + i * 0.25, c0.z);
            m.scale.setScalar(0.5 + v * range);
            addMat(m).opacity = 0.8 * Math.max(0, 1 - v);
          });
          addMat(wedge).opacity = (id === 'flash' ? 0.45 : 0.15) * Math.max(0, 1 - u * 2);
          if (pop) { pop.position.set(c0.x + Math.sin(ka) * 1.2, 2.2, c0.z + Math.cos(ka) * 1.2); pop.scale.setScalar(2 + u * 10); pop.material.opacity = Math.max(0, 1 - u * 2.5); }
        };
        break;
      }
      case 'ballStorm': case 'codeBolt': {
        // the launch: a burst of light in front and streaks along the three paths
        const streaks = [-1, 0, 1].map((i) => {
          const m = flat(new THREE.PlaneGeometry(0.25, 6), 0.6);
          const a = ka + i * (id === 'codeBolt' ? 0.18 : 0.25);
          m.rotation.set(-Math.PI / 2, 0, -a);
          m.position.set(c0.x + Math.sin(a) * 3.6, 0.1, c0.z + Math.cos(a) * 3.6);
          return m;
        });
        const g = id === 'codeBolt' ? glyphs(['0', '1', '<', '>', '/'], 8, c0.x, c0.z, 1.2, 2.5) : null;
        const pop = add(new THREE.Sprite(glowMat(color, 0.9)));
        pop.position.set(c0.x + Math.sin(ka) * 1.4, 1.4, c0.z + Math.cos(ka) * 1.4);
        step = (_dt, u) => {
          streaks.forEach((m) => { addMat(m).opacity = 0.6 * Math.max(0, 1 - u * 1.8); });
          pop.scale.setScalar(1 + u * 4); pop.material.opacity = Math.max(0, 0.9 - u * 2);
          g?.(u);
        };
        break;
      }
      case 'danceShock': case 'bassDrop': case 'yawn': case 'slam': {
        // a dome of force around the caster, with its own particles
        const R = id === 'danceShock' ? 4.2 : id === 'bassDrop' ? 5 : id === 'yawn' ? 5.5 : 3;
        const dome = flat(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), 0.35);
        const rings = [0, 1, 2].map(() => { const m = flat(new THREE.RingGeometry(0.92, 1, 56), 0.8); m.rotation.x = -Math.PI / 2; return m; });
        const cols = [0xff4ab0, 0x4ad8ff, 0xffd24a, 0x7aff5a];
        const tiles = id === 'danceShock' ? Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2; const m = flat(new THREE.PlaneGeometry(1.1, 1.1), 0.5, cols[i % 4]); m.rotation.x = -Math.PI / 2; m.position.set(c0.x + Math.cos(a) * 2.6, 0.07, c0.z + Math.sin(a) * 2.6); return m; }) : [];
        const g = id === 'yawn' ? glyphs(['Z', 'z', 'Z'], 9, c0.x, c0.z, 3, 3) : id === 'bassDrop' ? glyphs(['♪', '♫'], 6, c0.x, c0.z, 2.5, 3) : null;
        if (id === 'slam') {
          // cracks and rocks
          for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 + h.rng.next() * 0.4; const m = add(new THREE.Mesh(new THREE.PlaneGeometry(0.12, R * 1.1), new THREE.MeshBasicMaterial({ color: 0x1a0f0a, transparent: true, opacity: 0.8, depthWrite: false }))); m.rotation.set(-Math.PI / 2, 0, -a); m.position.set(c0.x + Math.sin(a) * R * 0.55, 0.075, c0.z + Math.cos(a) * R * 0.55); }
          h.fx.burst(c0.x, c0.z, 0x9a7a5a, 18, 0.3, 6);
        }
        step = (_dt, u) => {
          dome.position.set(c0.x, 0, c0.z);
          dome.scale.setScalar(0.3 + Math.min(1, u * 3) * R);
          addMat(dome).opacity = 0.35 * Math.max(0, 1 - u * 1.6);
          rings.forEach((m, i) => { const v = Math.max(0, u * 1.8 - i * 0.2); m.position.set(c0.x, 0.1, c0.z); m.scale.setScalar(0.4 + v * R); addMat(m).opacity = 0.8 * Math.max(0, 1 - v); });
          tiles.forEach((m, i) => { addMat(m).opacity = (Math.sin(u * 30 + i) > 0 ? 0.55 : 0.12) * Math.max(0, 1 - u); });
          g?.(u);
        };
        break;
      }
      case 'partyGrab': case 'glitch': case 'selfie': {
        // a streak of light between where things were and where they ended up
        const ribbon = flat(new THREE.PlaneGeometry(id === 'glitch' ? 0.18 : 0.6, 1), 0.7);
        const slices = id === 'glitch' ? [0, 1, 2, 3, 4, 5].map(() => flat(new THREE.PlaneGeometry(1.4, 0.12), 0.8)) : [];
        const g = id === 'partyGrab' ? glyphs(['★', '♪', '!'], 10, kx, kz, 1.4, 2.5, 0xffd24a) : id === 'selfie' ? glyphs(['♥', '★'], 6, (c0.x + kx) / 2, (c0.z + kz) / 2, 1, 2, 0xff8ac8) : null;
        const ring = id === 'selfie' ? flat(new THREE.TorusGeometry(0.9, 0.08, 8, 32), 0.9, 0xffffff) : null;
        step = (_dt, u) => {
          const p = at();
          const x0 = id === 'selfie' ? kx : c0.x, z0 = id === 'selfie' ? kz : c0.z;
          const x1 = p.x, z1 = p.z, len = Math.hypot(x1 - x0, z1 - z0) || 0.01;
          ribbon.position.set((x0 + x1) / 2, 1.1, (z0 + z1) / 2);
          ribbon.rotation.set(-Math.PI / 2, 0, -Math.atan2(x1 - x0, z1 - z0));
          ribbon.scale.y = len;
          addMat(ribbon).opacity = 0.7 * Math.max(0, 1 - u * 1.5);
          slices.forEach((m, i) => {
            const at0 = i % 2 ? { x: x1, z: z1 } : { x: x0, z: z0 };
            m.position.set(at0.x + Math.sin(u * 40 + i) * 0.4, 0.4 + i * 0.35, at0.z);
            m.lookAt(at0.x, 0.4 + i * 0.35, at0.z + 1);
            addMat(m).opacity = (Math.sin(u * 60 + i * 2) > 0 ? 0.8 : 0.1) * Math.max(0, 1 - u * 1.4);
          });
          if (ring) { ring.position.set(p.x + Math.sin(p.yaw) * 0.9, 2.2, p.z + Math.cos(p.yaw) * 0.9); ring.rotation.y = p.yaw; addMat(ring).opacity = 0.9 * fade(u); }
          g?.(u);
        };
        break;
      }
      case 'gossip': case 'lecture': {
        // words fill the air: bubbles of gossip round her, or a lecture's pages over him
        const tx = id === 'gossip' ? c0.x : kx, tz = id === 'gossip' ? c0.z : kz;
        const g = glyphs(id === 'gossip' ? ['?', '!', '…', '#'] : ['Z', 'Z', '§', '∑'], 12, tx, tz, 2, 3.2);
        const halo = flat(new THREE.RingGeometry(1.4, 1.6, 40), 0.6);
        halo.rotation.x = -Math.PI / 2; halo.position.set(tx, 0.08, tz);
        step = (_dt, u) => { g(u); halo.scale.setScalar(1 + u * 1.5); addMat(halo).opacity = 0.6 * fade(u); };
        break;
      }
      case 'laser': {
        // the charge: a red glow gathering at the caster's hand
        const orb = add(new THREE.Sprite(glowMat(0xff2a2a, 0.9)));
        step = (_dt, u) => { const p = at(); orb.position.set(p.x + Math.sin(p.yaw) * 0.7, 1.9, p.z + Math.cos(p.yaw) * 0.7); orb.scale.setScalar(0.4 + Math.sin(u * Math.PI) * 1.4); orb.material.opacity = 0.9 * fade(u); };
        s.dur = 1.8;
        break;
      }
      case 'shield': {
        // a dome of pale blue light that stays with the caster
        s.dur = 5;
        const dome = flat(new THREE.IcosahedronGeometry(1, 2), 0.25);
        (dome.material as THREE.MeshBasicMaterial).wireframe = true;
        const shell = flat(new THREE.SphereGeometry(1, 24, 16), 0.1);
        step = (dt, u) => {
          const p = at();
          for (const m of [dome, shell]) { m.position.set(p.x, 1.6, p.z); m.scale.setScalar(2.2 * Math.min(1, s.t * 4)); }
          dome.rotation.y += dt * 0.8;
          addMat(dome).opacity = 0.3 * (u > 0.85 ? (1 - u) / 0.15 : 1);
          addMat(shell).opacity = 0.1 * (u > 0.85 ? (1 - u) / 0.15 : 1);
        };
        break;
      }
      case 'heal': {
        // green motes rising round the caster, and a column of soft light
        s.dur = 1.6;
        const col = flat(new THREE.CylinderGeometry(1.2, 1.2, 5, 20, 1, true), 0.25);
        const g = glyphs(['+', '+', '✚'], 12, c0.x, c0.z, 1.2, 3.5);
        step = (_dt, u) => { const p = at(); col.position.set(p.x, 2.5, p.z); addMat(col).opacity = 0.25 * fade(u); g(u); };
        break;
      }
    }
    s.update = (dt) => { runeUp(dt); step(dt, s.t / s.dur); };
    this.live.push(s);
  }

  update(dt: number) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const s = this.live[i];
      s.t += dt;
      s.update(dt);
      if (s.t >= s.dur) {
        for (const o of s.objs) disposeObj(o, this.h.root);
        this.live.splice(i, 1);
      }
    }
  }

  dispose() {
    for (const s of this.live) for (const o of s.objs) disposeObj(o, this.h.root);
    this.live = [];
  }
}

function disposeObj(o: THREE.Object3D, root: THREE.Object3D) {
  root.remove(o);
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    m.geometry?.dispose?.();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    // textures are cached and shared; only the materials go
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose?.();
  });
}
