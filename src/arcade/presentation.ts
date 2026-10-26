import * as THREE from 'three';
import { drawIcon } from '../ui/icons';
import { makeCharacter, type Rig } from '../assets';
import { Person } from '../hero/person';
import { randomKirillLook, PLACEHOLDER_LOOKS } from '../hero/look';
import { Rng } from '../core/rng';
import { sfx, juice } from '../core/audio';
import { part, box, cyl, sphere, toon, at } from '../render/toon';
import { staticBatch } from '../maps/builder';
import { t } from '../i18n';
import balance from '../data/balance.json';
import { Input, Lights, hudLayer, perspective, fitAspect, countdownText, clamp, type ArcadeCtx, type ArcadeMode } from './common';

// Presentation: Kirill defends his project, you distract him (Masha: flash, Sonya: laser and
// ringtone). Don't get caught by the commission member watching the hall. Win at grade 2.

const P = balance.arcade.show;
const STAGE_Y = 1.0;
const KZ = -7.6; // Kirill's line on the stage
const SCREEN = { x: 2.4, y: 3.6, z: -9.6, w: 4.6, h: 2.7 };
const MASHA = new THREE.Vector3(-4.4, 0, 2.2);
const SONYA = new THREE.Vector3(4.4, 0, 2.2);

type Side = 'masha' | 'sonya';

export class ThePresentation implements ArcadeMode {
  scene = new THREE.Scene();
  camera = perspective(46);
  private input: Input;
  private lights: Lights;
  private rng = new Rng(Math.floor(Math.random() * 1e9));
  private kirill: Person;
  private masha: Rig;
  private sonya: Rig;
  private watcher: Person;
  private jury: Person[] = [];
  private screenTex: THREE.CanvasTexture;
  private screenCtx: CanvasRenderingContext2D;
  private laser: THREE.Mesh;
  private dot: THREE.Mesh;
  private flashLight = new THREE.PointLight(0xffffff, 0, 14, 1.2);
  private spot: THREE.SpotLight;
  private hud: HTMLElement;
  private ray = new THREE.Raycaster();
  private aim = new THREE.Vector3(0, 2.4, KZ);
  private headY = 1.45;

  private time = -3;
  private realT = 0;
  // Kirill
  private kx = -1.8;
  private kTarget = -1.8;
  private facingScreen = false;
  private beatT = 3;
  private slide = 0;
  private slideP = 0;
  private composure: number;
  private grade = 5;
  private blind = 0;
  private melt = 0;
  private wary = 0;
  private calm = 0;
  private lastHit = -9;
  private lineT = 0;
  // the girls
  private flashCd = 0;
  private ringCd = 0;
  private lasering = false;
  private laserOn = false;
  private hackCd = 4;
  private memeHitIn = 0;
  private memeT = 0;
  private memeN = 0;
  private lastLaserFace = -9;
  private shades = 0;
  private shadesIn = 0;
  private shadesMesh!: THREE.Group;
  private strikes = 0;
  // the commission member who checks the hall
  private look: { state: 'idle' | 'turning' | 'looking' | 'back'; side: Side | 'both'; t: number } = { state: 'idle', side: 'masha', t: 5 };
  private caughtCd = 0;
  private finished = false;
  private outro = 0;
  private won = false;
  private cutT = 0;
  /** tests: play the girls automatically */
  autopilot = false;

  constructor(private ctx: ArcadeCtx) {
    this.input = new Input(ctx.stage.renderer.domElement);
    this.scene.background = new THREE.Color(0x120d12);
    this.scene.fog = new THREE.Fog(0x120d12, 26, 60);
    this.lights = new Lights(this.scene, new THREE.Vector3(-4, 18, 10), 16);
    this.lights.hemi.intensity = 0.55;
    this.lights.sun.intensity = 0.7;
    this.lights.follow(0, -3);
    this.spot = new THREE.SpotLight(0xfff0d8, 60, 30, 0.42, 0.5, 1.2);
    this.spot.position.set(0, 9, -1);
    this.spot.castShadow = true;
    this.scene.add(this.spot, this.spot.target, this.flashLight);
    const level = ctx.story?.level ?? 1;
    this.composure = 100 * (0.75 + 0.25 * (ctx.story?.hp ?? 1));

    const c = document.createElement('canvas');
    c.width = 512; c.height = 300;
    this.screenCtx = c.getContext('2d')!;
    this.screenTex = new THREE.CanvasTexture(c);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    this.buildHall();

    this.kirill = new Person(ctx.story?.look ?? randomKirillLook(this.rng));
    this.scene.add(this.kirill.root);
    const bb = new THREE.Box3().setFromObject(this.kirill.root);
    this.headY = bb.max.y - 0.28;
    this.masha = this.seat(makeCharacter('masha'), MASHA);
    this.sonya = this.seat(makeCharacter('sonya'), SONYA);
    // the commission: three at a table under the stage; the middle one checks the hall
    const looks = [randomKirillLook(this.rng.fork('j1')), PLACEHOLDER_LOOKS.dean, randomKirillLook(this.rng.fork('j2'))];
    looks.forEach((lk, i) => {
      const p = new Person(lk);
      p.pose = 'sit';
      p.root.position.set(-2.2 + i * 2.2, 0, -4.6);
      p.root.rotation.y = Math.PI;
      p.facing = Math.PI;
      this.scene.add(p.root);
      this.jury.push(p);
    });
    this.watcher = this.jury[1];
    // the sunglasses he puts on once he's cracked twice
    this.shadesMesh = new THREE.Group();
    const lens = new THREE.MeshBasicMaterial({ color: 0x0b0b10 });
    for (const sx of [-0.13, 0.13]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.11, 0.03), lens); l.position.x = sx; this.shadesMesh.add(l); }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.03, 0.03), lens);
    bridge.position.y = 0.03;
    this.shadesMesh.add(bridge);
    this.shadesMesh.visible = false;
    this.scene.add(this.shadesMesh);

    this.laser = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.55, toneMapped: false }));
    this.dot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3a3a, toneMapped: false }));
    this.laser.visible = this.dot.visible = false;
    this.scene.add(this.laser, this.dot);
    ctx.stage.override = { scene: this.scene, camera: this.camera };
    this.speed = P.slideSec / (1 + 0.04 * (level - 1));
    this.drawSlide();

    this.hud = hudLayer(`
      <div class="sh-top">
        <div class="sh-grade"><span>${t('show.grade')}</span><b class="g">5</b></div>
        <div class="sh-meters">
          <div class="sh-row"><span>${t('show.slides')}</span><div class="bar"><div class="fill slides"></div></div><b class="sl-t"></b></div>
          <div class="sh-row"><span>${t('show.composure')}</span><div class="bar"><div class="fill comp"></div></div></div>
        </div>
        <div class="sh-strikes"><span>${t('show.strikes')}</span><b class="st"></b></div>
      </div>
      <div class="sh-watch hidden"></div>
      <div class="sh-tag tag-m">${t('char.masha')} 📸</div>
      <div class="sh-tag tag-s">${t('char.sonya')} 🔴</div>
      <div class="rc-bub bub-k hidden"></div>
      <div class="rc-bars"><i></i><i></i></div>
      <div class="sh-flash"></div>
      <div class="sh-reticle"><i></i><span></span></div>
      <div class="ar-center"></div>
      <div class="ar-bottom">
        <div class="ar-skill sk-flash" data-key="q">📸 <b>Q</b> ${t('show.flash')} <i class="cd"></i></div>
        <div class="ar-skill sk-laser" data-key="e">🔴 <b>E</b> ${t('show.laser')}</div>
        <div class="ar-skill sk-hack" data-key="r">🖼️ <b>R</b> ${t('show.hack')} <i class="cd"></i></div>
        <div class="ar-skill sk-ring" data-key=" ">📱 <b>␣</b> ${t('show.ring')} <i class="cd"></i></div>
        <div class="ar-keys">${t('show.keys')}</div>
        ${ctx.twoPlayer ? `<div class="ar-keys p2">${t('show.p2keys')}</div>` : ''}
      </div>`);
    this.input.buttons(this.hud);
  }
  private speed: number;

  private seat(rig: Rig, p: THREE.Vector3) {
    rig.pose = 'sit';
    rig.root.position.copy(p);
    rig.root.rotation.y = Math.PI;
    rig.faceTowards(Math.PI, 1, 100);
    this.scene.add(rig.root);
    return rig;
  }

  // ---------------------------------------------------------------- the hall

  private buildHall() {
    const s = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 34), toon(0x6a4630));
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    // stage, curtains, the projector screen and a lectern
    s.add(at(part(box(14, STAGE_Y, 5), 0x5a3422), 0, STAGE_Y / 2, -8.6));
    s.add(at(part(box(14.2, 0.12, 0.2), 0xd8b35a, { outline: false }), 0, STAGE_Y, -6.1));
    for (let x = -7; x <= 7; x += 0.7) s.add(at(part(box(0.7, 6.4, 0.25), (x * 10) % 2 ? 0x8a1e22 : 0x9a2428, { outline: false }), x, 3.2 + STAGE_Y, -11.1));
    s.add(at(part(box(14.4, 0.9, 0.4), 0x7a1a1e), 0, 6.9 + STAGE_Y - 0.4, -10.8));
    s.add(at(part(box(SCREEN.w + 0.3, SCREEN.h + 0.3, 0.08), 0x1d1d22), SCREEN.x, SCREEN.y, SCREEN.z - 0.06));
    s.add(at(part(box(0.9, 1.25, 0.6), 0x6a4a30), -2.6, STAGE_Y + 0.62, KZ + 0.5));
    s.add(at(part(box(1.0, 0.08, 0.7), 0x4a3020), -2.6, STAGE_Y + 1.27, KZ + 0.45, -0.3, 0, 0));
    // commission table with a cloth and name cards
    s.add(at(part(box(7.4, 0.8, 1.1), 0x2b3f6b), 0, 0.4, -5.6));
    s.add(at(part(box(7.5, 0.06, 1.15), 0x223355, { outline: false }), 0, 0.82, -5.6));
    for (const x of [-2.2, 0, 2.2]) s.add(at(part(box(0.4, 0.22, 0.05), 0xf2efe6, { outline: false }), x, 0.95, -5.15));
    // the audience: rows of seats with silhouettes; two seats left free for Masha and Sonya
    const tops = [0xc0392b, 0x2b3f6b, 0xe8c547, 0x23c4b8, 0x6a4a8a, 0x3a6a4a, 0x8a8f99, 0x1d1d22];
    const skins = [0xf0c6a4, 0xe0b090, 0xc89470];
    for (let r = 0; r < 5; r++) {
      const z = -1.2 + r * 1.7, y0 = r * 0.25;
      s.add(at(part(box(8.6, 0.25 + y0, 1.6), 0x3b2a20, { outline: false }), -5.5, (0.25 + y0) / 2, z + 0.2));
      s.add(at(part(box(8.6, 0.25 + y0, 1.6), 0x3b2a20, { outline: false }), 5.5, (0.25 + y0) / 2, z + 0.2));
      for (let x = -9.4; x <= 9.4; x += 0.9) {
        if (Math.abs(x) < 1.4) continue;
        s.add(at(part(box(0.75, 0.9, 0.12), 0x7a1e22, { outline: false }), x, y0 + 0.7, z + 0.45));
        const free = (Math.abs(x - MASHA.x) < 0.5 || Math.abs(x - SONYA.x) < 0.5) && Math.abs(z - MASHA.z) < 0.9;
        if (free || this.rng.chance(0.3)) continue;
        this.crowd.push({ x, y: y0, z: z + 0.25, top: this.rng.pick(tops), skin: this.rng.pick(skins), ph: this.rng.range(0, 6.28) });
      }
    }
    // side walls with tall windows (dark: it's evening) and the hall lamps
    for (const sx of [-1, 1]) {
      s.add(at(part(box(0.4, 9, 34), 0xe4d8c4, { outline: false }), sx * 12, 4.5, -2));
      for (let z = -8; z <= 8; z += 4) s.add(at(part(box(0.1, 3.2, 1.6), 0x1a2238, { emissive: 0x0a1020, outline: false }), sx * 11.78, 4.2, z));
    }
    s.add(at(part(cyl(0.1, 0.1, 0.1), 0x000000, { outline: false }), 0, 0, 0));
    this.scene.add(staticBatch(s));
    this.buildCrowd();
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), new THREE.MeshBasicMaterial({ map: this.screenTex, color: 0xb8b8b8 }));
    scr.position.set(SCREEN.x, SCREEN.y, SCREEN.z);
    this.scene.add(scr);
    // projector glow on the screen
    const pl = new THREE.PointLight(0x9fc6ff, 2.2, 7, 1.6);
    pl.position.set(SCREEN.x, SCREEN.y, SCREEN.z + 1.5);
    this.scene.add(pl);
  }

  private crowd: { x: number; y: number; z: number; top: number; skin: number; ph: number }[] = [];
  private bodies!: THREE.InstancedMesh;
  private heads!: THREE.InstancedMesh;
  private phones!: THREE.InstancedMesh;
  /** crowd reactions: laughing (bounce, and it covers for you), gasping (lean back), phones up */
  private laughT = 0;
  private gaspT = 0;
  private phonesT = 0;

  private buildCrowd() {
    const n = this.crowd.length;
    this.bodies = new THREE.InstancedMesh(box(0.5, 0.62, 0.34), toon(0xffffff), n);
    this.heads = new THREE.InstancedMesh(sphere(0.2, 10, 8), toon(0xffffff), n);
    this.phones = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.26), new THREE.MeshBasicMaterial({ color: 0xcfe8ff, toneMapped: false }), n);
    const c = new THREE.Color();
    this.crowd.forEach((p, i) => {
      this.bodies.setColorAt(i, c.setHex(p.top));
      this.heads.setColorAt(i, c.setHex(p.skin));
    });
    this.scene.add(this.bodies, this.heads, this.phones);
    this.poseCrowd(0);
  }

  private poseCrowd(tm: number) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    const e = new THREE.Euler();
    const laugh = Math.min(1, this.laughT), gasp = Math.min(1, this.gaspT * 2);
    this.crowd.forEach((p, i) => {
      const bob = laugh * Math.abs(Math.sin(tm * 14 + p.ph)) * 0.12;
      const lean = gasp * 0.35 + laugh * Math.sin(tm * 7 + p.ph) * 0.12;
      q.setFromEuler(e.set(-lean, 0, 0));
      m.compose(v.set(p.x, p.y + 0.75 + bob, p.z), q, one);
      this.bodies.setMatrixAt(i, m);
      m.compose(v.set(p.x, p.y + 1.25 + bob * 1.4, p.z + lean * 0.3), q, one);
      this.heads.setMatrixAt(i, m);
      // phones go up (a third of the hall) while something worth filming happens
      const up = this.phonesT > 0 && (i * 7 + 3) % 3 === 0;
      m.compose(v.set(p.x + 0.12, up ? p.y + 1.55 : -5, p.z - 0.18), q.identity(), one);
      this.phones.setMatrixAt(i, m);
    });
    this.bodies.instanceMatrix.needsUpdate = this.heads.instanceMatrix.needsUpdate = this.phones.instanceMatrix.needsUpdate = true;
  }

  private react(kind: 'laugh' | 'gasp') {
    if (kind === 'laugh') { this.laughT = P.laughSec; this.phonesT = P.laughSec; juice.laugh(); }
    else { this.gaspT = 0.8; this.phonesT = Math.max(this.phonesT, 1.2); juice.gasp(); }
  }

  /** The slide hack's memes: drawn over the real slide for a few seconds. */
  private drawMeme(n: number) {
    const g = this.screenCtx;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 512, 300);
    g.textAlign = 'center';
    g.fillStyle = '#1d1d22';
    if (n === 0) {
      // a cat, sitting where the chart should be
      g.fillStyle = '#f2a65a';
      g.beginPath(); g.ellipse(256, 190, 90, 70, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(256, 110, 62, 0, Math.PI * 2); g.fill();
      for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(256 + sx * 52, 80); g.lineTo(256 + sx * 34, 30); g.lineTo(256 + sx * 14, 64); g.fill(); }
      g.fillStyle = '#1d1d22';
      for (const sx of [-1, 1]) { g.beginPath(); g.arc(256 + sx * 22, 104, 8, 0, Math.PI * 2); g.fill(); }
      g.font = 'bold 30px sans-serif';
      g.fillText(t('show.meme0'), 256, 290);
    } else if (n === 1) {
      g.font = 'bold 54px sans-serif';
      g.fillText(t('show.meme1a'), 256, 120);
      g.font = 'bold 30px sans-serif';
      g.fillStyle = '#e0201a';
      g.fillText(t('show.meme1b'), 256, 190);
      for (let i = -1; i <= 1; i++) drawIcon(g, 'coffee', 256 + i * 90, 262, 76, '#e0201a', 2);
    } else if (n === 2) {
      // a chart that goes the wrong way
      g.strokeStyle = '#e0201a'; g.lineWidth = 8;
      g.beginPath(); g.moveTo(60, 70); g.lineTo(180, 120); g.lineTo(280, 110); g.lineTo(450, 260); g.stroke();
      g.font = 'bold 30px sans-serif';
      g.fillText(t('show.meme2'), 256, 50);
    } else {
      g.font = 'bold 44px sans-serif';
      g.fillText(t('show.meme3a'), 256, 110);
      drawIcon(g, 'party', 256, 220, 110, '#e0b020', 1.8);
      g.font = 'bold 24px sans-serif';
      g.fillText(t('show.meme3b'), 256, 288);
    }
    g.textAlign = 'left';
    this.screenTex.needsUpdate = true;
  }

  private drawSlide() {
    const g = this.screenCtx, n = Math.min(this.slide, P.slides - 1);
    g.fillStyle = '#f6f3ea';
    g.fillRect(0, 0, 512, 300);
    g.fillStyle = '#2b3f6b';
    g.fillRect(0, 0, 512, 54);
    g.fillStyle = '#ffffff';
    g.font = 'bold 26px sans-serif';
    g.fillText(t('show.slide' + (n % 8)), 18, 37);
    g.fillStyle = '#2b3f6b';
    g.font = '20px sans-serif';
    const r = new Rng(n * 97 + 3);
    for (let i = 0; i < 4; i++) { g.fillRect(28, 92 + i * 46, 8, 8); g.fillRect(48, 90 + i * 46, 140 + r.range(60, 260), 10); }
    if (n % 3 === 1) { g.fillStyle = '#e8573a'; for (let i = 0; i < 5; i++) g.fillRect(360 + i * 24, 250 - (i + 1) * 28, 16, (i + 1) * 28); }
    g.fillStyle = '#8a8f99';
    g.font = '16px sans-serif';
    g.fillText(`${n + 1} / ${P.slides}`, 450, 288);
    this.screenTex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- tick

  update(dt: number) {
    if (this.finished) return;
    fitAspect(this.camera);
    this.realT += dt;
    if (this.outro > 0) {
      this.outro -= dt;
      this.animate(dt);
      if (this.outro <= 0) this.exit();
      this.input.endFrame();
      return;
    }
    const before = this.time;
    this.time += dt;
    if (before < 0 && this.time >= 0) { sfx.reveal(); this.say(t('show.open')); }
    this.flashCd = Math.max(0, this.flashCd - dt);
    this.ringCd = Math.max(0, this.ringCd - dt);
    this.caughtCd = Math.max(0, this.caughtCd - dt);
    this.cutT = Math.max(0, this.cutT - dt);
    this.hackCd = Math.max(0, this.hackCd - dt);
    this.laughT = Math.max(0, this.laughT - dt);
    this.gaspT = Math.max(0, this.gaspT - dt);
    this.phonesT = Math.max(0, this.phonesT - dt);
    if (this.shadesIn > 0) { this.shadesIn -= dt; if (this.shadesIn <= 0) { this.say(t('show.shadesOn')); sfx.click(); } }
    else this.shades = Math.max(0, this.shades - dt);
    if (this.memeT > 0) {
      this.memeT -= dt;
      if (this.memeHitIn > 0 && (this.memeHitIn -= dt) <= 0) {
        this.say(t('show.memeLine' + this.memeN));
        this.distract(P.memeDmg, true);
        this.pop('🤡', 'grade-2');
        this.react('laugh');
        this.facingScreen = true;
        this.beatT = 1.4;
      }
      if (this.memeT <= 0) this.drawSlide();
    }
    if (this.time >= 0) {
      this.aimAt();
      this.girls(dt);
      this.commission(dt);
      this.presenter(dt);
    }
    this.animate(dt);
    this.input.endFrame();
  }

  /** the cursor on Kirill's plane (or the screen, when the ray reaches it first) */
  private aimAt() {
    if (this.autopilot) return;
    const m = this.input.mouse;
    const ndc = new THREE.Vector2((m.x / innerWidth) * 2 - 1, -(m.y / innerHeight) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -KZ), hit)) this.aim.copy(hit);
  }

  private headPos() { return new THREE.Vector3(this.kx, STAGE_Y + this.headY, KZ); }
  private scr(p: THREE.Vector3) {
    const v = p.clone().project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
  }
  /** on screen, near his face (generous: a circle ~9% of the screen height; the flash also takes his body) */
  private onFace(p: THREE.Vector3, body = false) {
    if (this.covering) return false;
    const a = this.scr(p), h = this.scr(this.headPos());
    const r = Math.max(48, innerHeight * P.faceRadius);
    if (Math.hypot(a.x - h.x, a.y - h.y) < r) return true;
    if (!body) return false;
    const b = this.scr(new THREE.Vector3(this.kx, STAGE_Y + this.headY * 0.5, KZ));
    return Math.hypot(a.x - b.x, a.y - b.y) < r * 1.1;
  }
  /** the aim projected back onto the screen plane, when Kirill is turned to it */
  private onSlide() {
    const cam = this.camera.position;
    const dir = this.aim.clone().sub(cam);
    const k = (SCREEN.z - cam.z) / dir.z;
    const p = cam.clone().addScaledVector(dir, k);
    return Math.abs(p.x - SCREEN.x) < SCREEN.w / 2 && Math.abs(p.y - SCREEN.y) < SCREEN.h / 2 ? p : null;
  }

  private watched(side: Side) {
    const l = this.look;
    return l.state === 'looking' && (l.side === side || l.side === 'both');
  }

  private girls(dt: number) {
    const k = this.input;
    // the flash and laser aim where the mouse last was over the hall (HUD clicks don't move it)
    let flash = k.hit('mouse0', 'q');
    if (k.hit('e')) { this.laserOn = !this.laserOn; sfx.click(); }
    let laser = this.laserOn || k.mouse.r;
    let ring = k.hit(' ');
    if (this.autopilot) {
      // aim at his face (or the slide behind him), act only on the side nobody's watching
      // a human-ish hand: the aim wanders around the target
      const tgt = this.facingScreen ? new THREE.Vector3(SCREEN.x * 0.55, SCREEN.y * 0.85, KZ) : this.headPos();
      this.aim.lerp(tgt.add(new THREE.Vector3(Math.sin(this.realT * 2.3) * 0.6, Math.cos(this.realT * 1.7) * 0.45, 0)), 0.1);
      const warn = this.look.state !== 'idle';
      flash = !warn && this.flashCd <= 0 && !this.facingScreen && this.melt <= 0;
      laser = !warn && this.melt <= 0;
      ring = !warn && this.ringCd <= 0 && this.composure < 45;
    }
    // Masha: the camera flash
    if (flash && this.flashCd <= 0) {
      this.flashCd = P.flashCd;
      this.act('masha');
      this.flashLight.position.set(MASHA.x, 1.6, MASHA.z - 0.6);
      this.flashLight.intensity = 60;
      const el = this.hud.querySelector('.sh-flash') as HTMLElement;
      el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
      sfx.click();
      if (this.onFace(this.aim, true) && this.shades > 0 && this.shadesIn <= 0 && !this.facingScreen) {
        this.pop('😎', 'skill');
        this.say(t('show.shadesOn'));
      } else if (this.onFace(this.aim, true)) {
        // full blast in the face; from behind it only startles him. Right after the laser: FLASH-BANG
        const bang = !this.facingScreen && this.time - this.lastLaserFace < P.bangWindow;
        const f = (this.wary > 0 ? 0.6 : 1) * (this.facingScreen ? 0.45 : 1) * (bang ? P.bangMul : 1);
        this.distract(P.flashDmg * f, true);
        this.pop(`−${Math.round(P.flashDmg * f)}`, this.facingScreen ? 'grade-3' : 'grade-2');
        this.blind = Math.min(1.4, 0.6 * f);
        this.wary = 2;
        this.say(t(this.facingScreen ? 'show.startled' : 'show.blinded'));
        if (bang) { this.flash(t('show.bang')); this.react('gasp'); juice.sting(3); this.cutT = 0.9; }
      } else if (this.facingScreen && this.onSlide()) { this.distract(P.flashDmg * 0.35, false); this.pop(t('show.washed'), 'grade-3'); }
      else this.pop(t('show.missed'), 'skill');
    }
    // Sonya: the laser pointer (held)
    this.lasering = laser && this.melt <= 0;
    if (this.lasering) {
      this.act('sonya', dt);
      const face = !this.facingScreen && this.onFace(this.aim);
      const slide = this.facingScreen && this.onSlide();
      if (face) { this.lastLaserFace = this.time; this.distract(P.laserFace * dt * (this.shades > 0 && this.shadesIn <= 0 ? 0.3 : 1), false); if (this.lineT <= 0) { this.say(t('show.squint')); this.pop('😵', 'grade-2'); this.lineT = 2.2; } }
      else if (slide) { this.distract(P.laserSlide * dt, false); this.slideP = Math.max(0, this.slideP - dt * 0.06); if (this.lineT <= 0) { this.say(t('show.whatDot')); this.pop('❓', 'grade-3'); this.lineT = 2.2; } }
    }
    // Masha: hack the clicker and put a meme up instead of his slide
    let hack = k.hit('r');
    if (this.autopilot) hack = this.look.state === 'idle' && this.hackCd <= 0 && this.melt <= 0;
    if (hack && this.hackCd <= 0 && this.melt <= 0) {
      this.hackCd = P.hackCd;
      this.act('masha');
      this.memeN = (this.memeN + 1 + this.rng.int(0, 2)) % 4;
      this.memeT = P.memeSec;
      this.drawMeme(this.memeN);
      sfx.click();
      // he notices a beat later (sooner if he's looking at the screen)
      this.memeHitIn = this.facingScreen ? 0.3 : 1.1;
    }
    // Sonya: the ringtone
    if (ring && this.ringCd <= 0) {
      this.ringCd = P.ringCd;
      this.act('sonya');
      sfx.email(); sfx.alarm();
      this.distract(P.ringDmg, true);
      this.slideP = Math.max(0, this.slideP - 0.5);
      this.say(t('show.lost'));
    }
  }

  /** a girl does something: if the commission is watching her side, that's a strike */
  private act(side: Side, dt = 0) {
    if (!this.watched(side) || this.caughtCd > 0 || this.laughT > 0) return;
    void dt;
    this.strikes++;
    this.caughtCd = 1.5;
    sfx.denied();
    this.flash(t('show.caught', { name: t('char.' + side) }));
    if (this.strikes >= P.strikes) this.finish(false, 'strikes');
  }

  private distract(n: number, burst: boolean) {
    if (this.melt > 0) return;
    const combo = burst && this.time - this.lastHit < 2 ? 1.3 : 1;
    if (burst) this.lastHit = this.time;
    this.composure -= n * combo;
    this.calm = 0;
    if (burst) sfx.hurt();
    if (this.composure <= 0) this.meltdown();
  }

  private meltdown() {
    this.grade--;
    this.composure = P.afterMelt;
    this.melt = P.meltSec;
    this.slideP = 0;
    sfx.debt();
    this.say(t('show.melt' + this.rng.int(0, 2)));
    this.flash(t('show.meltFlash', { g: this.grade }));
    this.cutT = 1.6;
    this.react('laugh');
    if (this.grade <= 3) { this.shades = P.shadesSec; this.shadesIn = P.meltSec; }
    if (this.grade <= 2) this.finish(true, 'grade');
  }

  /** the commission: every few seconds the middle one turns round to check one side of the hall */
  private commission(dt: number) {
    const l = this.look;
    l.t -= dt;
    if (l.t > 0) return;
    if (l.state === 'idle') {
      const both = this.rng.chance(P.bothChance);
      l.side = both ? 'both' : this.rng.chance(0.5) ? 'masha' : 'sonya';
      l.state = 'turning';
      l.t = P.warnSec;
      sfx.click();
    } else if (l.state === 'turning') { l.state = 'looking'; l.t = this.rng.range(P.lookSec[0], P.lookSec[1]); }
    else if (l.state === 'looking') { l.state = 'back'; l.t = 0.4; }
    else { l.state = 'idle'; l.t = this.rng.range(P.lookGap[0], P.lookGap[1]) * (this.ctx.twoPlayer ? 1.7 : 1); }
  }

  // player 2 (Kirill): arrows to move/read/cover, , and . to point at Masha/Sonya, / to breathe
  private kirillPlayer(dt: number) {
    const k = this.input;
    this.accuseCd = Math.max(0, this.accuseCd - dt);
    this.breathCd = Math.max(0, this.breathCd - dt);
    const dir = (k.down('arrowright') ? 1 : 0) - (k.down('arrowleft') ? 1 : 0);
    this.kTarget = dir ? clamp(this.kx + dir * 1.5, -3.2, 2.6) : this.kx;
    this.facingScreen = k.down('arrowup');
    this.covering = k.down('arrowdown');
    for (const [code, side] of [['c:Comma', 'masha'], ['c:Period', 'sonya']] as [string, Side][]) {
      if (!k.hit(code) || this.accuseCd > 0) continue;
      this.accuseCd = P.accuseCd;
      this.look = { state: 'looking', side, t: P.accuseSec };
      this.say(t('show.p2accuse', { name: t('char.' + side) }));
      sfx.whistle();
    }
    if (k.hit('c:Slash') && this.breathCd <= 0) {
      this.breathCd = P.breathCd;
      this.composure = Math.min(100, this.composure + P.breath);
      this.say(t('show.p2breath'));
      sfx.levelUp();
    }
    void dt;
  }
  private accuseCd = 0;
  private breathCd = 0;
  /** player-2 Kirill holding his hands over his eyes */
  private covering = false;

  /** Kirill talks through his slides, turning to the screen now and then */
  private presenter(dt: number) {
    this.blind = Math.max(0, this.blind - dt);
    this.wary = Math.max(0, this.wary - dt);
    this.lineT = Math.max(0, this.lineT - dt);
    if (this.melt > 0) { this.melt -= dt; return; }
    this.calm += dt;
    if (this.calm > 1.5 && !this.covering) this.composure = Math.min(100, this.composure + P.regen * dt);
    if (this.blind > 0) return;
    if (this.ctx.twoPlayer) {
      this.kirillPlayer(dt);
      if (this.covering) return;
    } else this.beatT -= dt;
    if (!this.ctx.twoPlayer && this.beatT <= 0) {
      this.facingScreen = !this.facingScreen;
      this.beatT = this.facingScreen ? this.rng.range(1.6, 2.6) : this.rng.range(2.8, 4.4);
      this.kTarget = this.facingScreen ? this.rng.range(0.6, 1.6) : this.rng.range(-2.4, 0.4);
    }
    // nerves slow him down
    const pace = (0.75 + 0.25 * clamp(this.composure / 100, 0, 1)) * (this.ctx.twoPlayer && this.facingScreen ? P.readPace : 1);
    this.slideP += (dt / this.speed) * pace;
    if (this.slideP >= 1) {
      this.slideP = 0;
      this.slide++;
      if (this.slide >= P.slides) { this.finish(this.grade <= 2, 'done'); return; }
      if (this.memeT <= 0) this.drawSlide();
      if (this.rng.chance(0.4)) this.say(t('show.next'));
    }
  }

  private animate(dt: number) {
    const k = this.kirill;
    this.kx += (this.kTarget - this.kx) * Math.min(1, dt * 2);
    const moving = Math.abs(this.kTarget - this.kx) > 0.1 && this.melt <= 0 && this.blind <= 0;
    k.pose = this.outro > 0 ? (this.won ? 'panic' : 'cheer') : this.melt > 0 ? 'panic' : this.blind > 0 ? 'stun' : this.covering ? 'block' : moving ? 'run' : this.facingScreen ? 'throw' : 'talk';
    const face = this.facingScreen && this.melt <= 0 && this.blind <= 0 ? Math.PI : moving ? (this.kTarget > this.kx ? Math.PI / 2 : -Math.PI / 2) : 0;
    k.faceTowards(face, dt, 8);
    k.update(dt, moving ? 1.2 : 0);
    k.root.position.set(this.kx, STAGE_Y, KZ);
    this.spot.target.position.set(this.kx, STAGE_Y, KZ);
    // the watcher turns round toward the side he checks
    const l = this.look;
    const sideX = l.side === 'masha' ? MASHA.x : l.side === 'sonya' ? SONYA.x : 0;
    const want = l.state === 'turning' || l.state === 'looking' ? Math.atan2(sideX - this.watcher.root.position.x, MASHA.z - this.watcher.root.position.z) : Math.PI;
    this.watcher.faceTowards(want, dt, l.state === 'turning' ? 5 : 8);
    for (const j of this.jury) j.update(dt, 0);
    for (const g of [this.masha, this.sonya]) g.update(dt, 0);
    this.flashLight.intensity *= Math.pow(0.0005, dt);
  }

  private finish(win: boolean, why: 'grade' | 'done' | 'strikes') {
    if (this.outro > 0 || this.finished) return;
    this.won = win;
    this.why = why;
    this.outro = 2;
    this.cutT = 2;
    this.flash(t(win ? 'show.failed' : why === 'strikes' ? 'show.thrownOut' : 'show.passed', { g: this.grade }));
    if (win) sfx.levelUp(); else sfx.debt();
  }
  private why: 'grade' | 'done' | 'strikes' = 'done';

  private exit() {
    this.finished = true;
    const score = Math.max(0, Math.round((this.won ? 3000 : 0) + (5 - this.grade) * 600 + (P.strikes - this.strikes) * 300 + (this.won ? Math.max(0, 1200 - this.time * 10) : this.slide * 40)));
    let detail = this.why === 'strikes' ? t('show.endStrikes', { s: this.slide + 1 }) : t(this.won ? 'show.endWon' : 'show.endLost', { g: this.grade, s: this.slide + 1, n: this.strikes });
    if (this.ctx.twoPlayer) detail = t(this.won ? 'vs.p1wins' : 'vs.p2wins') + ' ' + detail;
    this.ctx.onExit({ mode: this.ctx.twoPlayer ? 'show2' : 'show', win: this.won, score, detail });
  }

  // ---------------------------------------------------------------- view

  render() {
    if (this.finished) return;
    const cam = this.camera;
    // from the back of the hall, over the girls' heads; close in on Kirill when he cracks
    const drift = Math.sin(this.realT * 0.3) * 0.3;
    const base = new THREE.Vector3(drift, 4.6, 11.5);
    const baseLook = new THREE.Vector3(0.2, 2.3, -6.5);
    const w = clamp(this.cutT / 0.4, 0, 1) * clamp((this.cutT > 0 ? 1 : 0), 0, 1);
    const close = new THREE.Vector3(this.kx + 1.6, STAGE_Y + 1.6, KZ + 4.2);
    const closeLook = this.headPos();
    cam.position.copy(base.lerp(close, w * 0.85));
    cam.lookAt(baseLook.lerp(closeLook, w * 0.85));
    this.hud.querySelector('.rc-bars')?.classList.toggle('on', w > 0.3);

    // laser beam from Sonya's phone to the dot
    const from = new THREE.Vector3(SONYA.x - 0.2, 1.45, SONYA.z - 0.4);
    let to = this.aim.clone();
    if (this.facingScreen) { const s = this.onSlide(); if (s) to = s; }
    this.laser.visible = this.dot.visible = this.lasering;
    if (this.lasering) {
      const d = to.clone().sub(from);
      this.laser.scale.set(1, d.length(), 1);
      this.laser.position.copy(from).addScaledVector(d, 0.5);
      this.laser.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      this.dot.position.copy(to);
    }
    // HUD
    const q = (s: string) => this.hud.querySelector(s) as HTMLElement;
    q('.g').textContent = String(this.grade);
    q('.g').className = 'g g' + this.grade;
    q('.slides').style.width = `${clamp((this.slide + this.slideP) / P.slides, 0, 1) * 100}%`;
    q('.sl-t').textContent = `${Math.min(P.slides, this.slide + 1)}/${P.slides}`;
    q('.comp').style.width = `${clamp(this.composure, 0, 100)}%`;
    q('.comp').classList.toggle('hurt', this.calm < 0.25 && this.time > 0);
    // the reticle under the mouse: red when it's on something that will distract him
    const ret = q('.sh-reticle');
    const m = this.input.mouse;
    const target = this.onFace(this.aim, true) ? (this.facingScreen ? 'back' : 'face') : this.facingScreen && this.onSlide() ? 'slide' : null;
    ret.style.left = `${this.autopilot ? this.scr(this.aim).x : m.x}px`;
    ret.style.top = `${this.autopilot ? this.scr(this.aim).y : m.y}px`;
    ret.className = 'sh-reticle' + (target ? ' on ' + target : '') + (this.lasering ? ' laser' : '');
    (ret.querySelector('span') as HTMLElement).textContent = target ? t('show.tgt.' + target) : '';
    q('.st').textContent = '✖'.repeat(this.strikes) + '○'.repeat(Math.max(0, P.strikes - this.strikes));
    const l = this.look;
    const watch = q('.sh-watch');
    const warn = l.state === 'turning' || l.state === 'looking';
    watch.classList.toggle('hidden', !warn);
    watch.classList.toggle('now', l.state === 'looking');
    if (warn) watch.textContent = t(l.state === 'turning' ? 'show.turning' : 'show.looking', { side: t('show.side.' + l.side) });
    for (const [sel, side, pos] of [['.tag-m', 'masha', MASHA], ['.tag-s', 'sonya', SONYA]] as [string, Side, THREE.Vector3][]) {
      const v = new THREE.Vector3(pos.x, 2.1, pos.z).project(cam);
      const e = q(sel);
      e.style.left = `${((v.x * 0.5 + 0.5) * innerWidth).toFixed(0)}px`;
      e.style.top = `${((-v.y * 0.5 + 0.5) * innerHeight).toFixed(0)}px`;
      e.classList.toggle('watched', warn && (l.side === side || l.side === 'both'));
    }
    const fcd = q('.sk-flash'); fcd.classList.toggle('cooling', this.flashCd > 0); (fcd.querySelector('.cd') as HTMLElement).textContent = this.flashCd > 0 ? this.flashCd.toFixed(1) : '';
    this.poseCrowd(this.realT);
    const on = this.shades > 0 && this.shadesIn <= 0;
    this.shadesMesh.visible = on && this.melt <= 0;
    if (on) {
      const f = this.kirill.facing, hp = this.headPos();
      this.shadesMesh.position.set(hp.x + Math.sin(f) * 0.27, hp.y + 0.02, hp.z + Math.cos(f) * 0.27);
      this.shadesMesh.rotation.y = f;
    }
    const hcd = q('.sk-hack'); hcd.classList.toggle('cooling', this.hackCd > 0); (hcd.querySelector('.cd') as HTMLElement).textContent = this.hackCd > 0 ? this.hackCd.toFixed(0) : '';
    const rcd = q('.sk-ring'); rcd.classList.toggle('cooling', this.ringCd > 0); (rcd.querySelector('.cd') as HTMLElement).textContent = this.ringCd > 0 ? this.ringCd.toFixed(0) : '';
    q('.sk-laser').classList.toggle('on', this.lasering);
    const b = q('.bub-k');
    if (!b.classList.contains('hidden')) {
      if (this.realT - +(b.dataset.t ?? 0) > 1.8) b.classList.add('hidden');
      const v = new THREE.Vector3(this.kx, STAGE_Y + this.headY + 0.7, KZ).project(cam);
      b.style.left = `${((v.x * 0.5 + 0.5) * innerWidth).toFixed(0)}px`;
      b.style.top = `${((-v.y * 0.5 + 0.5) * innerHeight).toFixed(0)}px`;
    }
    if (this.time < 0.8) {
      const c = countdownText(-this.time, t('show.go'));
      q('.ar-center').innerHTML = c ? `<div class="ar-count">${c}</div>` : '';
    }
  }

  /** a number or emoji popping off Kirill's head */
  private pop(text: string, cls: string) {
    const h = this.scr(this.headPos().add(new THREE.Vector3(0, 0.4, 0)));
    const e = document.createElement('div');
    e.className = `popup ${cls}`;
    e.textContent = text;
    e.style.transform = `translate(${(h.x + (Math.random() - 0.5) * 50).toFixed(0)}px, ${h.y.toFixed(0)}px) translate(-50%, -100%)`;
    e.style.transition = 'opacity 0.8s, margin-top 0.8s';
    document.getElementById('world-ui')?.appendChild(e);
    globalThis.requestAnimationFrame?.(() => { e.style.opacity = '0'; e.style.marginTop = '-50px'; });
    setTimeout(() => e.remove(), 850);
  }

  private say(text: string) {
    const b = this.hud?.querySelector('.bub-k') as HTMLElement | null;
    if (!b) return;
    b.textContent = text;
    b.dataset.t = String(this.realT);
    b.classList.remove('hidden');
  }

  private flash(text: string) {
    const c = this.hud.querySelector('.ar-center') as HTMLElement;
    c.innerHTML = `<div class="ar-flash">${text}</div>`;
    setTimeout(() => { if (c.firstElementChild?.textContent === text) c.innerHTML = ''; }, 1300);
  }

  /** for tests */
  get inputs() { return this.input; }
  headScreen() { return this.scr(this.headPos()); }
  get facing() { return this.facingScreen ? 'screen' : 'hall'; }
  get state() { return { grade: this.grade, slide: this.slide, strikes: this.strikes, composure: this.composure }; }

  dispose() {
    this.input.dispose();
    this.hud.remove();
    if (this.ctx.stage.override?.scene === this.scene) this.ctx.stage.override = null;
  }
}
