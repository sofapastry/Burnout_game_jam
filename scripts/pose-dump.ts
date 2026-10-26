// Pose a rigged character with the game's own BoneRig and write the skinned meshes to an OBJ
// (one copy per pose, side by side) so the result can be rendered and checked outside a browser.
// npx esbuild … scripts/pose-dump.ts → node … public/models/nina.glb out.obj
import './dom-shim';
import * as fs from 'fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BoneRig } from '../src/assets';
import { stripImages } from './load-models';
import type { Pose } from '../src/hero/person';

const [src, out] = process.argv.slice(2);
// [pose, frames simulated] — the four runs land at different points of the stride
const POSES: [Pose, number][] = process.argv[4] === 'cycle'
  ? [['run', 60], ['run', 64], ['run', 68], ['run', 72], ['stance', 90], ['punch', 90], ['sit', 90], ['idle', 90]]
  : [['idle', 90], ['run', 90], ['sit', 90], ['cheer', 90], ['punch', 90], ['kick', 90], ['crouch', 90], ['talk', 90]];

const gltf = await new GLTFLoader().parseAsync(stripImages(fs.readFileSync(src)), '');
const lines: string[] = [];
let base = 1;
POSES.forEach(([pose, frames], i) => {
  const rig = new BoneRig(gltf);
  (rig as unknown as { t: number }).t = 0;
  rig.pose = pose;
  for (let f = 0; f < frames; f++) rig.update(1 / 60, 3);
  rig.root.position.x = i * 1.4;
  rig.root.updateMatrixWorld(true);
  rig.root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh || (m.material as THREE.Material).side === THREE.BackSide) return; // skip outline hulls
    m.skeleton.update();
    const pos = m.geometry.attributes.position, v = new THREE.Vector3();
    for (let k = 0; k < pos.count; k++) {
      m.getVertexPosition(k, v);
      v.applyMatrix4(m.matrixWorld);
      lines.push(`v ${v.x.toFixed(4)} ${v.y.toFixed(4)} ${v.z.toFixed(4)}`);
    }
    const idx = m.geometry.index!;
    for (let k = 0; k < idx.count; k += 3) lines.push(`f ${base + idx.getX(k)} ${base + idx.getX(k + 1)} ${base + idx.getX(k + 2)}`);
    base += pos.count;
  });
});
fs.writeFileSync(out, lines.join('\n'));
console.log(`wrote ${POSES.map((p) => p[0]).join(', ')} → ${out}`);
process.exit(0);
