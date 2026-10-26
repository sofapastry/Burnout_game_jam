// Load public/models/*.glb in node for the headless tests (textures stripped: no image decoding here).
import * as fs from 'fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CHARACTER_NAMES, registerCharacter } from '../src/assets';

/** drop images/textures from a GLB and repack it */
export function stripImages(buf: Buffer) {
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString());
  delete json.images; delete json.textures; delete json.samplers;
  for (const m of json.materials ?? []) { delete m.normalTexture; if (m.pbrMetallicRoughness) { delete m.pbrMetallicRoughness.baseColorTexture; delete m.pbrMetallicRoughness.metallicRoughnessTexture; } }
  const bin = buf.subarray(20 + jsonLen + 8);
  let js = Buffer.from(JSON.stringify(json));
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const head = Buffer.alloc(12); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.write('JSON', 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.write('BIN\0', 4);
  const all = Buffer.concat([head, jh, js, bh, bin]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.length);
}

/** register every character model found in public/models; returns their names */
export async function loadModels() {
  const found: string[] = [];
  for (const n of CHARACTER_NAMES) {
    const f = `public/models/${n}.glb`;
    if (!fs.existsSync(f)) continue;
    registerCharacter(n, await new GLTFLoader().parseAsync(stripImages(fs.readFileSync(f)), ''));
    found.push(n);
  }
  return found;
}
