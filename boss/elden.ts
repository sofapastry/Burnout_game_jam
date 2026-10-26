import * as THREE from 'three';
import { Grid, SOLID } from '../maps/grid';
import { Rng } from '../core/rng';

// Final arena: floating stone platform, ruined pillars, rune circles and the Tree of Knowledge.

export const ARENA_R = 15;

export interface ArenaPalette { gold: number; accent: number; sky: [number, number]; fog: number }
export const PALETTES: Record<string, ArenaPalette> = {
  nina: { gold: 0xffc65a, accent: 0xff5a3a, sky: [0x14060a, 0x6a2a18], fog: 0x1a0c10 },
  romchik: { gold: 0xffc65a, accent: 0xff4ab0, sky: [0x0c0618, 0x5a1a4a], fog: 0x140a1c },
  masha: { gold: 0xf0e6d0, accent: 0xc8d8ff, sky: [0x08080e, 0x3a3a50], fog: 0x101016 },
  sonya: { gold: 0xffd27a, accent: 0xff7ad8, sky: [0x100814, 0x6a3050], fog: 0x160c18 },
  shady: { gold: 0xffc65a, accent: 0x23e4c8, sky: [0x04100e, 0x14504a], fog: 0x081412 },
  grisha: { gold: 0xffb84a, accent: 0x9a7ae8, sky: [0x0a0814, 0x3a2a5a], fog: 0x100c18 },
  artem: { gold: 0xffd27a, accent: 0x6ab7ff, sky: [0x060a16, 0x1a3a6a], fog: 0x0a1018 },
  pasha: { gold: 0xffc65a, accent: 0xb06aff, sky: [0x0a0614, 0x401a6a], fog: 0x100a1a },
  finalExam: { gold: 0xffd27a, accent: 0xff3a2a, sky: [0x08040a, 0x5a2a10], fog: 0x0e0808 },
};

export interface EldenArena {
  grid: Grid;
  /** per-frame: drifting ash, swaying light shafts, the Tree's pulse; `flare` 0..1 brightens everything (phase 2) */
  update(dt: number, time: number, flare: number): void;
}

export function buildEldenArena(root: THREE.Object3D, scene: THREE.Scene, boss: string, seed = 7): EldenArena {
  const pal = PALETTES[boss] ?? PALETTES.nina;
  const rng = new Rng(seed);
  const R = ARENA_R;

  // ---- the void: a gradient sky dome with stars
  const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(pal.sky[0]) }, horizon: { value: new THREE.Color(pal.sky[1]) }, glow: { value: new THREE.Color(pal.gold) } },
    vertexShader: 'varying vec3 vP; void main() { vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 glow; varying vec3 vP;
      void main() {
        float h = clamp(vP.y * 1.6 + 0.15, 0.0, 1.0);
        vec3 c = mix(horizon, top, h);
        // the Tree's glow behind the arena (toward -z)
        float g = pow(max(0.0, dot(normalize(vP), normalize(vec3(0.0, 0.25, -1.0)))), 6.0);
        c += glow * g * 0.9;
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  root.add(sky);
  const starN = 900, starPos = new Float32Array(starN * 3);
  for (let i = 0; i < starN; i++) {
    const a = rng.range(0, Math.PI * 2), y = rng.range(0.05, 1), r = Math.sqrt(1 - y * y);
    starPos.set([Math.cos(a) * r * 160, y * 160, Math.sin(a) * r * 160], i * 3);
  }
  const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(starPos, 3)),
    new THREE.PointsMaterial({ color: 0xfff4dc, size: 0.6, sizeAttenuation: true, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, fog: false }));
  root.add(stars);

  // ---- the platform: dark stone, a rim of broken blocks, rune circles
  const floorTex = new THREE.CanvasTexture(runeFloor(pal.gold));
  floorTex.colorSpace = THREE.SRGBColorSpace;
  floorTex.anisotropy = 8;
  const top = new THREE.Mesh(new THREE.CircleGeometry(R + 1.2, 72), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55, metalness: 0.15, emissive: new THREE.Color(pal.gold), emissiveMap: floorTex, emissiveIntensity: 0.25 }));
  top.rotation.x = -Math.PI / 2;
  top.receiveShadow = true;
  root.add(top);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x4a4450, roughness: 0.9 });
  const side = new THREE.Mesh(new THREE.CylinderGeometry(R + 1.2, R - 2, 6, 72, 1, true), stoneMat);
  side.position.y = -3.01;
  root.add(side);
  // hanging rubble under the platform
  for (let i = 0; i < 26; i++) {
    const a = rng.range(0, Math.PI * 2), r = rng.range(2, R);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rng.range(0.6, 1.8)), stoneMat);
    rock.position.set(Math.cos(a) * r, -6 - rng.range(0, 6), Math.sin(a) * r);
    rock.rotation.set(rng.range(0, 3), rng.range(0, 3), 0);
    root.add(rock);
  }
  // broken rim blocks
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + rng.range(-0.03, 0.03);
    if (rng.chance(0.25)) continue;
    const h = rng.range(0.3, 1.1);
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.6, h, 0.9), stoneMat);
    b.position.set(Math.cos(a) * (R + 0.6), h / 2, Math.sin(a) * (R + 0.6));
    b.rotation.y = -a + Math.PI / 2;
    b.castShadow = b.receiveShadow = true;
    root.add(b);
  }
  // ---- ruined pillars around the edge (two left standing tall)
  const pillars: { x: number; z: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.cos(a) * (R - 1.8), z = Math.sin(a) * (R - 1.8);
    const h = i % 3 === 0 ? 14 : rng.range(3, 8);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.95, h, 14), stoneMat);
    col.position.set(x, h / 2, z);
    col.castShadow = col.receiveShadow = true;
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.6, 2.3), stoneMat);
    base.position.set(x, 0.3, z);
    root.add(col, base);
    if (h < 10) {
      // its fallen top lies beside it
      const piece = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, rng.range(2, 4), 14), stoneMat);
      piece.position.set(x * 0.92 + rng.range(-1, 1), 0.8, z * 0.92 + rng.range(-1, 1));
      piece.rotation.set(Math.PI / 2, 0, rng.range(0, Math.PI));
      piece.castShadow = true;
      root.add(piece);
    }
    pillars.push({ x, z });
  }
  // ---- the Tree of Knowledge on the horizon: a glowing trunk, branches, a canopy of light
  const tree = new THREE.Group();
  // (the Tree, its canopy and the stars shine through the arena's fog)
  const gold = new THREE.MeshBasicMaterial({ color: pal.gold, toneMapped: false, fog: false });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(3, 7, 70, 12), gold);
  trunk.position.y = 35;
  tree.add(trunk);
  for (let i = 0; i < 14; i++) {
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 2.2, rng.range(25, 45), 6), gold);
    const a = (i / 14) * Math.PI * 2;
    br.position.set(Math.cos(a) * 8, 62 + rng.range(-6, 8), Math.sin(a) * 4);
    br.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 1.1);
    tree.add(br);
  }
  const leafN = 2600, leafPos = new Float32Array(leafN * 3);
  for (let i = 0; i < leafN; i++) {
    const a = rng.range(0, Math.PI * 2), r = Math.pow(rng.next(), 0.6) * 42;
    leafPos.set([Math.cos(a) * r, 78 + rng.range(-14, 14) * (1 - r / 50), Math.sin(a) * r * 0.5], i * 3);
  }
  const canopy = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(leafPos, 3)),
    new THREE.PointsMaterial({ color: pal.gold, size: 1.6, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
  tree.add(canopy);
  tree.position.set(0, -30, -120);
  root.add(tree);

  // ---- light: dim and cold overall, the Tree's warm rim from behind, a soft key on the arena
  const hemi = new THREE.HemisphereLight(0x8a90c8, 0x1a1020, 0.6);
  const treeLight = new THREE.DirectionalLight(pal.gold, 2.6);
  treeLight.position.set(0, 30, -40);
  const key = new THREE.DirectionalLight(0xdcd8ff, 1.1);
  key.position.set(12, 22, 16);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -R - 2; sc.right = R + 2; sc.top = R + 2; sc.bottom = -R - 2; sc.near = 1; sc.far = 80;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.04;
  const accent = new THREE.PointLight(pal.accent, 40, 30, 1.5);
  accent.position.set(0, 6, 0);
  root.add(hemi, treeLight, key, accent);
  scene.fog = new THREE.FogExp2(pal.fog, 0.012);

  // ---- shafts of light from above
  const shafts: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(rng.range(2.5, 4.5), 40, 24, 1, true), new THREE.MeshBasicMaterial({ color: pal.gold, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    cone.position.set(rng.range(-10, 10), 20, rng.range(-10, 6));
    cone.rotation.z = rng.range(-0.15, 0.15);
    shafts.push(cone);
    root.add(cone);
  }
  // ---- golden ash drifting down
  const ashN = 500, ashPos = new Float32Array(ashN * 3);
  for (let i = 0; i < ashN; i++) ashPos.set([rng.range(-22, 22), rng.range(0, 20), rng.range(-22, 22)], i * 3);
  const ashGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(ashPos, 3));
  const ashMat = new THREE.PointsMaterial({ color: pal.gold, size: 0.09, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  root.add(new THREE.Points(ashGeo, ashMat));
  // ---- floating rune circles that turn slowly over the arena
  const runeRings: THREE.Mesh[] = [];
  for (const [r, y] of [[R * 0.55, 0.04], [R * 0.85, 0.05]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.12, r, 96), new THREE.MeshBasicMaterial({ color: pal.gold, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = y;
    runeRings.push(ring);
    root.add(ring);
  }

  // ---- collisions: everything outside the circle and the pillars is solid
  const grid = new Grid(2 * R + 6, 2 * R + 6);
  for (let x = -R - 3; x <= R + 3; x += 0.5) for (let z = -R - 3; z <= R + 3; z += 0.5) if (Math.hypot(x, z) > R - 0.4) grid.mark(x, z, 0.5, 0.5, SOLID);
  for (const p of pillars) grid.mark(p.x, p.z, 2.2, 2.2, SOLID);
  grid.freeze();

  return {
    grid,
    update(dt, time, flare) {
      const pa = ashGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < ashN; i++) {
        let y = pa.getY(i) - dt * (0.6 + (i % 5) * 0.15);
        if (y < 0) y = 20;
        pa.setXYZ(i, pa.getX(i) + Math.sin(time * 0.7 + i) * dt * 0.3, y, pa.getZ(i));
      }
      pa.needsUpdate = true;
      for (const [i, s] of shafts.entries()) (s.material as THREE.MeshBasicMaterial).opacity = (0.04 + Math.sin(time * 0.6 + i) * 0.015) * (1 + flare * 2);
      runeRings[0].rotation.z += dt * 0.05; runeRings[1].rotation.z -= dt * 0.03;
      for (const r of runeRings) (r.material as THREE.MeshBasicMaterial).opacity = 0.4 + flare * 0.5 + Math.sin(time * 2) * 0.08;
      (canopy.material as THREE.PointsMaterial).size = 1.6 + flare * 1.2 + Math.sin(time * 0.8) * 0.15;
      treeLight.intensity = 2.6 + flare * 3;
      accent.intensity = 40 + flare * 80;
      (top.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.25 + flare * 0.6;
    },
  };
}

/** the platform's face: worn flagstones, two rings of glowing runes, a crest in the middle */
function runeFloor(gold: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 2048;
  const g = c.getContext('2d')!;
  g.fillStyle = '#25222a';
  g.fillRect(0, 0, 2048, 2048);
  // flagstones in rings
  g.strokeStyle = 'rgba(0,0,0,0.6)';
  g.lineWidth = 6;
  for (let r = 120; r < 1024; r += 120) {
    g.beginPath(); g.arc(1024, 1024, r, 0, Math.PI * 2); g.stroke();
    const n = Math.round(r / 40);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r;
      g.beginPath(); g.moveTo(1024 + Math.cos(a) * (r - 120), 1024 + Math.sin(a) * (r - 120)); g.lineTo(1024 + Math.cos(a) * r, 1024 + Math.sin(a) * r); g.stroke();
    }
  }
  for (let i = 0; i < 4000; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.08)'; g.fillRect(Math.random() * 2048, Math.random() * 2048, 6, 6); }
  const col = '#' + gold.toString(16).padStart(6, '0');
  g.strokeStyle = col; g.fillStyle = col;
  g.shadowColor = col; g.shadowBlur = 18;
  g.lineWidth = 10;
  for (const r of [560, 600, 900]) { g.beginPath(); g.arc(1024, 1024, r, 0, Math.PI * 2); g.stroke(); }
  // runes between the circles
  g.font = 'bold 44px serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    g.save(); g.translate(1024 + Math.cos(a) * 580, 1024 + Math.sin(a) * 580); g.rotate(a + Math.PI / 2);
    g.fillText(runes[i % runes.length], 0, 0); g.restore();
  }
  // the crest
  g.lineWidth = 8;
  g.beginPath();
  for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI * 2 - Math.PI / 2; g.lineTo(1024 + Math.cos(a) * 220, 1024 + Math.sin(a) * 220); }
  g.stroke();
  g.font = 'bold 120px serif';
  g.fillText('БрГТУ', 1024, 1030);
  g.shadowBlur = 0;
  return c;
}
