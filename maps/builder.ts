import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../core/rng';
import { Grid, FREE, SOLID } from './grid';
import { Layout, Placement, Rot } from './layouts';
import { PROPS, WALL_ITEMS } from './props';
import { part, box, cyl, toon, at } from '../render/toon';
import * as T from '../render/textures';
import { MapLife } from './life';

export interface BuiltMap {
  layout: Layout;
  grid: Grid;
  group: THREE.Group;
  /** background life (seated students, dust); call update every frame */
  life: MapLife;
}

const ROT_Y = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

function footprint(kind: string, rot: Rot) {
  const d = PROPS[kind];
  return rot % 2 === 0 ? { w: d.w, d: d.d } : { w: d.d, d: d.w };
}

/** Build walls, floors and props for a layout; the seed varies the optional clutter. */
export function buildMap(layout: Layout, rng: Rng): BuiltMap {
  const { w, h } = layout;
  const grid = new Grid(w, h);
  const statics = new THREE.Group();
  const dynamic = new THREE.Group();
  const life = new MapLife(rng.fork('life'));

  // ---- floor
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(w + 60, h + 40), toon(0x2a2420));
  outside.rotation.x = -Math.PI / 2;
  outside.position.y = -0.02;
  dynamic.add(outside);
  layout.floors.forEach((f, i) => {
    const fw = f.x1 - f.x0, fd = f.z1 - f.z0;
    const map = floorTexture(f.style, fw, fd);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(fw, fd), toon(0xffffff, { map }));
    floor.rotation.x = -Math.PI / 2;
    // later floors (lawns on the plaza) sit a hair above the base so they don't z-fight
    floor.position.set((f.x0 + f.x1) / 2, i * 0.003, (f.z0 + f.z1) / 2);
    floor.receiveShadow = true;
    dynamic.add(floor);
  });
  for (const d of layout.decals ?? []) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.d), toon(d.color));
    m.rotation.x = -Math.PI / 2;
    m.position.set(d.x, 0.012, d.z);
    m.receiveShadow = true;
    dynamic.add(m);
  }
  for (const b of layout.blockers ?? []) grid.mark(b.x, b.z, b.w, b.d, SOLID);

  // ---- perimeter walls (south wall is a low cutaway so the camera sees in)
  const W = layout.wall;
  const t = 0.5;
  const wallSeg = (x: number, z: number, sx: number, sz: number, height: number) => {
    const g = new THREE.Group();
    g.add(at(part(box(sx, height, sz), W.upper, { outline: 0.03 }), x, height / 2, z));
    const lowerH = Math.min(1.1, height);
    g.add(at(part(box(sx + 0.06, lowerH, sz + 0.06), W.lower, { outline: false }), x, lowerH / 2, z));
    g.add(at(part(box(sx + 0.04, 0.08, sz + 0.04), 0x4a3a30, { outline: false }), x, height, z));
    statics.add(g);
  };
  if (layout.outdoor) {
    // stone curbs instead of walls, and the university building along the north edge
    wallSeg(-w / 2 - t / 2, 0, t, h, W.height);
    wallSeg(w / 2 + t / 2, 0, t, h, W.height);
    statics.add(buildFacade(w, h, layout.facade?.portico ?? false));
  } else {
    wallSeg(0, -h / 2 - t / 2, w + 2 * t, t, W.height);
    wallSeg(-w / 2 - t / 2, 0, t, h, W.height);
    wallSeg(w / 2 + t / 2, 0, t, h, W.height);
  }
  // south: split around entrance gaps
  const gaps = [...layout.southGaps].sort((a, b) => a[0] - b[0]);
  let cursor = -w / 2 - t;
  for (const [gx, gw] of [...gaps, [w / 2 + t + 100, 0] as [number, number]]) {
    const end = Math.min(gx - gw / 2, w / 2 + t);
    if (end > cursor + 0.05) wallSeg((cursor + end) / 2, h / 2 + t / 2, end - cursor, t, layout.outdoor ? W.height : 0.55);
    cursor = gx + gw / 2;
    if (gw > 0 && !layout.outdoor) {
      const mat = new THREE.Mesh(new THREE.PlaneGeometry(gw - 0.4, 1.6), toon(0x4a3d34));
      mat.rotation.x = -Math.PI / 2;
      mat.position.set(gx, 0.01, h / 2 - 0.7);
      mat.receiveShadow = true;
      dynamic.add(mat);
    }
  }
  for (const iw of layout.interior) {
    wallSeg(iw.x, iw.z, iw.w, iw.d, iw.h);
    grid.mark(iw.x, iw.z, iw.w, iw.d, SOLID);
  }

  // ---- props
  const place = (p: Placement, r: Rng) => {
    const def = PROPS[p.kind];
    const rot = (p.rot ?? 0) as Rot;
    const obj = def.build(r);
    obj.position.set(p.x, 0, p.z);
    obj.rotation.y = ROT_Y[rot];
    statics.add(obj);
    life.seat(p.kind, p.x, p.z, rot);
    if (def.block !== FREE) {
      const f = footprint(p.kind, rot);
      grid.mark(p.x, p.z, f.w, f.d, def.block);
    }
  };
  for (const p of layout.props) place(p, rng);

  // ---- seeded clutter, each candidate kept only if every open area stays reachable
  const start = layout.start;
  for (const opt of layout.optional) {
    const n = rng.int(opt.count[0], opt.count[1]);
    let placed = 0;
    for (let tries = 0; tries < n * 12 && placed < n; tries++) {
      const kind = rng.pick(opt.kinds);
      const rot: Rot = opt.rot === 'any' ? (rng.int(0, 3) as Rot) : (opt.rot ?? 0);
      const [x0, z0, x1, z1] = opt.zone;
      const x = Math.round(rng.range(x0, x1) * 2) / 2;
      const z = Math.round(rng.range(z0, z1) * 2) / 2;
      const def = PROPS[kind];
      const f = footprint(kind, rot);
      if (Math.hypot(x - start.x, z - start.z) < 2.5) continue;
      if (!areaFree(grid, x, z, f.w, f.d)) continue;
      if (def.block === FREE) {
        place({ kind, x, z, rot }, rng);
        placed++;
        continue;
      }
      const snap = grid.snapshot();
      grid.mark(x, z, f.w, f.d, def.block);
      if (!grid.connected(start.x, start.z)) {
        grid.restore(snap);
        continue;
      }
      grid.restore(snap);
      place({ kind, x, z, rot }, rng);
      placed++;
    }
  }

  // ---- wall decorations
  for (const wi of layout.wallItems) {
    const obj = WALL_ITEMS[wi.kind](rng);
    if (wi.wall === 'n') { obj.position.set(wi.at, wi.y, -h / 2); }
    else if (wi.wall === 'w') { obj.position.set(-w / 2, wi.y, wi.at); obj.rotation.y = Math.PI / 2; }
    else if (wi.wall === 'e') { obj.position.set(w / 2, wi.y, wi.at); obj.rotation.y = -Math.PI / 2; }
    else { obj.position.set(wi.at, wi.y, wi.z ?? 0); obj.rotation.y = wi.ry ?? 0; }
    statics.add(obj);
  }

  // ---- golden-hour light pools under the windows
  const poolMat = new THREE.MeshBasicMaterial({
    map: T.radialTex(layout.mood === 'gym' ? 'rgba(255,236,190,0.28)' : 'rgba(255,205,130,0.32)', 'rgba(255,205,130,0)'),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  for (const lp of layout.lightPools) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(lp.w, lp.d), poolMat);
    m.rotation.set(-Math.PI / 2, 0, lp.r ?? 0);
    m.position.set(lp.x, 0.015, lp.z);
    m.renderOrder = 1;
    dynamic.add(m);
  }

  if (!layout.outdoor) life.addDust(w, h, Math.min(3.4, layout.wall.height - 0.2), layout.mood !== 'dark');
  const group = new THREE.Group();
  group.add(staticBatch(statics), dynamic, life.group);
  grid.freeze();
  return { layout, grid, group, life };
}

function floorTexture(style: string, fw: number, fd: number) {
  switch (style) {
    case 'gym': return T.gymFloor(fw, fd);
    case 'lecture': return T.lectureFloor(fw, fd);
    case 'marbleLight': return T.tileFloor(fw, fd, 23, '#e2d7c4', '#d3c6ae');
    case 'paving': return T.pavingFloor(fw, fd);
    case 'grass': return T.grassFloor(fw, fd);
    case 'asphalt': return T.asphaltFloor(fw, fd);
    case 'wood': return T.woodFloor(fw, fd);
    case 'canteen': return T.tileFloor(fw, fd, 41, '#d8cdb8', '#cdc0a6');
    case 'dorm': return T.tileFloor(fw, fd, 43, '#b9a98c', '#ab9b7e', 1.5);
    case 'kitchen': return T.tileFloor(fw, fd, 47, '#dcd5c6', '#c8bfae', 1);
    case 'lab': return T.tileFloor(fw, fd, 53, '#e2dccd', '#d6cfbf', 1.5);
    case 'deans': return T.tileFloor(fw, fd, 59, '#e3d6bc', '#d6c6a8');
    default: return T.tileFloor(fw, fd, 17);
  }
}

/** The university building along the north edge of an outdoor map. */
function buildFacade(w: number, h: number, portico: boolean) {
  const g = new THREE.Group();
  const depth = 3, height = 7.5;
  const front = toon(0xffffff, { map: T.facadeTex(Math.round(w / 2), 4) });
  const body = new THREE.Mesh(box(w + 1, height, depth), [toon(0xd6c9b0), toon(0xd6c9b0), toon(0xc9b99e), toon(0xd6c9b0), front, toon(0xd6c9b0)] as unknown as THREE.Material);
  body.position.set(0, height / 2, -h / 2 - depth / 2);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  if (portico) {
    const z = -h / 2 + 0.2;
    for (const x of [-4, -1.4, 1.4, 4]) g.add(at(part(cyl(0.32, 0.36, 3.6, 12), 0xe8dcc4), x, 1.8, z - 0.3));
    g.add(at(part(box(10, 0.9, 2.2), 0xd6c9b0), 0, 4.0, z - 0.8));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 0.9), toon(0xffffff, { map: T.universityLetteringTex() }));
    sign.position.set(0, 4.0, z + 0.32);
    g.add(sign);
    g.add(at(part(box(4.4, 2.8, 0.1), 0x6e4a2a), 0, 1.4, -h / 2 - 0.02));
  }
  return g;
}

function areaFree(grid: Grid, x: number, z: number, w: number, d: number) {
  for (let zz = z - d / 2 + 0.05; zz <= z + d / 2 - 0.05 + 1e-6; zz += 0.25)
    for (let xx = x - w / 2 + 0.05; xx <= x + w / 2 - 0.05 + 1e-6; xx += 0.25)
      if (grid.blocked(xx, zz) || Math.abs(xx) > grid.w / 2 - 0.2 || Math.abs(zz) > grid.h / 2 - 0.2) return false;
  return true;
}

/** Merge every opaque static mesh by material: a whole map in a few dozen draw calls. */
export function staticBatch(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const keep: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.Material;
    if (Array.isArray(m.material) || mat.transparent) { keep.push(m); return; }
    let g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!buckets.has(mat)) buckets.set(mat, []);
    buckets.get(mat)!.push(g);
  });
  const out = new THREE.Group();
  for (const [mat, geoms] of buckets) {
    const mesh = new THREE.Mesh(mergeGeometries(geoms), mat);
    const isOutline = (mat as THREE.MeshBasicMaterial).side === THREE.BackSide;
    mesh.castShadow = !isOutline && !(mat as THREE.MeshBasicMaterial).isMeshBasicMaterial;
    mesh.receiveShadow = !isOutline;
    out.add(mesh);
  }
  for (const m of keep) out.attach(m);
  return out;
}
