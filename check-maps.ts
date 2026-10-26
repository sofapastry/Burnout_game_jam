// Reachability check: spawn a body at every free cell, walk it along the flow field with
// the game's own collision, and count how many get stuck before reaching Kirill.
// Run with `npm run check:maps` after editing a layout.
import { Grid, FREE, SOLID } from '../src/maps/grid';
import { LAYOUTS } from '../src/maps/layouts';
import { PROPS } from '../src/maps/props';

function buildGrid(id: string) {
  const L = LAYOUTS[id];
  const g = new Grid(L.w, L.h);
  for (const b of L.blockers ?? []) g.mark(b.x, b.z, b.w, b.d, SOLID);
  for (const iw of L.interior) g.mark(iw.x, iw.z, iw.w, iw.d, SOLID);
  for (const p of L.props) {
    const d = PROPS[p.kind];
    if (!d) throw new Error(`${id}: unknown prop ${p.kind}`);
    if (d.block === FREE) continue;
    const rot = p.rot ?? 0;
    const [w, dd] = rot % 2 === 0 ? [d.w, d.d] : [d.d, d.w];
    g.mark(p.x, p.z, w, dd, d.block);
  }
  return { L, g };
}

let failures = 0;
const only = process.argv[2];
for (const id of Object.keys(LAYOUTS)) {
  if (only && id !== only) continue;
  const { L, g } = buildGrid(id);
  const k = L.start;
  if (g.blocked(k.x, k.z)) { console.log(`${id}: Kirill's start (${k.x}, ${k.z}) is inside an obstacle`); failures++; }
  for (const [name, p] of Object.entries(L.zones)) if (g.blocked(p.x, p.z) && !name.startsWith('sec') && name !== 'stage') console.log(`${id}: zone ${name} (${p.x}, ${p.z}) is inside an obstacle`);
  g.computeFlow(k.x, k.z, 0.6);
  for (const [label, r] of [['r0.30', 0.3], ['r0.45', 0.45], ['Artem r0.35', 0.35]] as const) {
    let tried = 0, stuck = 0;
    const stuckAt: string[] = [];
    for (let row = 0; row < g.rows; row += 2)
      for (let col = 0; col < g.cols; col += 2) {
        const x = g.cx(col), z = g.cz(row);
        if (g.blocked(x, z) || Math.hypot(x - k.x, z - k.z) < 2.5) continue;
        tried++;
        const u = { x, z };
        const dir = { x: 0, z: 0 };
        const reach = r + 0.42 + 0.3;
        let ok = false;
        for (let step = 0; step < 30 * 50; step++) {
          const d = Math.hypot(k.x - u.x, k.z - u.z);
          if (d < reach) { ok = true; break; }
          let tx = (k.x - u.x) / d, tz = (k.z - u.z) / d;
          const fd = g.flowDist(u.x, u.z);
          const near = d < 1.6 && fd >= 0 && fd <= 3;
          if (!near && g.flowDir(u.x, u.z, false, dir)) { tx = dir.x; tz = dir.z; }
          u.x += tx * 2 / 30; u.z += tz * 2 / 30;
          g.resolve(u, r);
        }
        if (!ok) { stuck++; if (stuckAt.length < 4) stuckAt.push(`(${x.toFixed(1)},${z.toFixed(1)})→(${u.x.toFixed(1)},${u.z.toFixed(1)})`); }
      }
    if (stuck) failures++;
    console.log(`${id.padEnd(12)} ${label.padEnd(12)} reached ${tried - stuck}/${tried}${stuck ? '  STUCK e.g. ' + stuckAt.join(' ') : ''}`);
  }
  // goal weeks: Kirill himself must be able to walk to every exit / goal
  for (const [name, p] of Object.entries({ ...Object.fromEntries(L.exits.map((e, i) => ['exit' + i, e])), ...(L.zones.goal ? { goal: L.zones.goal } : {}) })) {
    if (!g.reachable(k.x, k.z, p.x, p.z)) { console.log(`${id.padEnd(12)} Kirill can't reach ${name} (${p.x}, ${p.z})`); failures++; }
  }
}
if (failures) { console.log(`\n${failures} problem(s)`); process.exitCode = 1; }
else console.log('\nall maps reachable');
