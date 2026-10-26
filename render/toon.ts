import * as THREE from 'three';

// Cel-shading: 4-step toon ramp + inverted-hull outlines (GDD §13, §15).

let grad: THREE.DataTexture | null = null;
export function gradientMap() {
  if (!grad) {
    grad = new THREE.DataTexture(new Uint8Array([95, 165, 225, 255]), 4, 1, THREE.RedFormat);
    grad.minFilter = THREE.NearestFilter;
    grad.magFilter = THREE.NearestFilter;
    grad.generateMipmaps = false;
    grad.needsUpdate = true;
  }
  return grad;
}

export interface ToonOpts {
  map?: THREE.Texture | null;
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
}

const matCache = new Map<string, THREE.MeshToonMaterial>();

export function toon(color: THREE.ColorRepresentation, opts: ToonOpts = {}): THREE.MeshToonMaterial {
  const cacheable = !opts.map && !opts.transparent;
  const key = cacheable ? `${new THREE.Color(color).getHexString()}|${opts.emissive ?? 0}|${opts.emissiveIntensity ?? 1}|${opts.side ?? 0}` : '';
  if (cacheable && matCache.has(key)) return matCache.get(key)!;
  const m = new THREE.MeshToonMaterial({
    color,
    gradientMap: gradientMap(),
    map: opts.map ?? null,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
  });
  if (cacheable) matCache.set(key, m);
  return m;
}

const outlineCache = new Map<string, THREE.MeshBasicMaterial>();
export const INK = 0x1d1613;

/** Back-face hull pushed out along normals in object space. */
export function outlineMaterial(thickness = 0.025, color = INK): THREE.MeshBasicMaterial {
  const key = thickness.toFixed(4) + '|' + color;
  let m = outlineCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
    const th = thickness.toFixed(4);
    m.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += normalize(normal) * ${th};`);
    };
    m.customProgramCacheKey = () => 'outline' + key;
    outlineCache.set(key, m);
  }
  return m;
}

export function addOutline(mesh: THREE.Mesh, thickness = 0.025) {
  const o = new THREE.Mesh(mesh.geometry, outlineMaterial(thickness));
  o.raycast = () => {};
  o.name = 'outline';
  mesh.add(o);
  return o;
}

export interface PartOpts extends ToonOpts {
  outline?: number | false;
  shadow?: boolean;
  receive?: boolean;
}

/** A toon mesh with outline and shadows, the building block for everything procedural. */
export function part(geom: THREE.BufferGeometry, color: THREE.ColorRepresentation, opts: PartOpts = {}): THREE.Mesh {
  const mesh = new THREE.Mesh(geom, toon(color, opts));
  mesh.castShadow = opts.shadow ?? true;
  mesh.receiveShadow = opts.receive ?? false;
  if (opts.outline !== false) addOutline(mesh, opts.outline ?? 0.025);
  return mesh;
}

export function at<T extends THREE.Object3D>(obj: T, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): T {
  obj.position.set(x, y, z);
  obj.rotation.set(rx, ry, rz);
  return obj;
}

// Shared geometry cache so props don't allocate the same box 200 times.
const geoCache = new Map<string, THREE.BufferGeometry>();
export function box(w: number, h: number, d: number) {
  const k = `b${w}|${h}|${d}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(k)!;
}
export function cyl(rt: number, rb: number, h: number, seg = 16) {
  const k = `c${rt}|${rb}|${h}|${seg}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.CylinderGeometry(rt, rb, h, seg));
  return geoCache.get(k)!;
}
export function sphere(r: number, ws = 16, hs = 12) {
  const k = `s${r}|${ws}|${hs}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.SphereGeometry(r, ws, hs));
  return geoCache.get(k)!;
}
export function capsule(r: number, len: number) {
  const k = `p${r}|${len}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.CapsuleGeometry(r, len, 4, 12));
  return geoCache.get(k)!;
}
