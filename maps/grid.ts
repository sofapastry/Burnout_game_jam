// Walkability grid + BFS flow fields. Circle collisions against cells, no physics engine (GDD §15).

export const CELL = 0.5;
export const FREE = 0, LOW = 1, SOLID = 2;

export interface Rect { x: number; z: number; w: number; d: number; v: number }

/** A BFS distance field toward one target, over cells below `blockAt`, with obstacles grown by one cell. */
export class Flow {
  dist: Int32Array;
  constructor(private g: Grid, private blockAt: number) {
    this.dist = new Int32Array(g.cols * g.rows).fill(-1);
  }

  // seedRadius > 0 seeds cells around the target; avoid = extra blocked cells
  compute(tx: number, tz: number, seedRadius = 0, avoid?: Uint8Array) {
    const g = this.g, dist = this.dist, q = g.queue;
    const wide = g.inflated(this.blockAt);
    dist.fill(-1);
    const c0 = Math.max(0, Math.min(g.cols - 1, g.col(tx)));
    const r0 = Math.max(0, Math.min(g.rows - 1, g.row(tz)));
    let head = 0, tail = 0;
    const sr = Math.ceil(seedRadius / CELL);
    for (let dr = -sr; dr <= sr; dr++)
      for (let dc = -sr; dc <= sr; dc++) {
        const c = c0 + dc, r = r0 + dr;
        if (!g.inside(c, r) || dc * dc + dr * dr > sr * sr + 0.5) continue;
        const i = r * g.cols + c;
        if (dist[i] === 0) continue;
        if ((dc || dr) && g.cells[i] >= SOLID) continue;
        dist[i] = 0;
        q[tail++] = i;
      }
    while (head < tail) {
      const i = q[head++];
      const c = i % g.cols, r = (i / g.cols) | 0;
      const d = dist[i] + 1;
      for (const [dc, dr] of DIR8) {
        const nc = c + dc, nr = r + dr;
        if (!g.inside(nc, nr)) continue;
        const ni = nr * g.cols + nc;
        if (dist[ni] !== -1 || wide[ni] || (avoid && avoid[ni])) continue;
        // no corner cutting
        const a = r * g.cols + nc, b = nr * g.cols + c;
        if (dc && dr && (wide[a] || wide[b] || (avoid && (avoid[a] || avoid[b])))) continue;
        dist[ni] = d;
        q[tail++] = ni;
      }
    }
  }

  /** Direction of steepest descent toward the target. Returns false if unreachable from here. */
  dir(x: number, z: number, out: { x: number; z: number }) {
    const g = this.g, dist = this.dist;
    const c = g.col(x), r = g.row(z);
    if (!g.inside(c, r)) return false;
    const here = dist[r * g.cols + c];
    let best = here < 0 ? 1e9 : here, bx = 0, bz = 0;
    for (const [dc, dr] of DIR8) {
      const nc = c + dc, nr = r + dr;
      if (!g.inside(nc, nr)) continue;
      const d = dist[nr * g.cols + nc];
      if (d >= 0 && d < best) { best = d; bx = dc; bz = dr; }
    }
    if (bx === 0 && bz === 0) return false;
    const l = Math.hypot(bx, bz);
    out.x = bx / l;
    out.z = bz / l;
    return true;
  }

  /** Steepest ascent: the way to get further from the target (fleeing tasks in Week 6). */
  away(x: number, z: number, out: { x: number; z: number }) {
    const g = this.g, dist = this.dist;
    const c = g.col(x), r = g.row(z);
    if (!g.inside(c, r)) return false;
    let best = dist[r * g.cols + c], bx = 0, bz = 0;
    for (const [dc, dr] of DIR8) {
      const nc = c + dc, nr = r + dr;
      if (!g.inside(nc, nr)) continue;
      const d = dist[nr * g.cols + nc];
      if (d > best) { best = d; bx = dc; bz = dr; }
    }
    if (bx === 0 && bz === 0) return false;
    const l = Math.hypot(bx, bz);
    out.x = bx / l;
    out.z = bz / l;
    return true;
  }

  at(x: number, z: number) {
    const c = this.g.col(x), r = this.g.row(z);
    if (!this.g.inside(c, r)) return -1;
    return this.dist[r * this.g.cols + c];
  }

  /** Path distance, also looking one cell around (bodies hug obstacles, whose own cells are inflated). */
  near(x: number, z: number) {
    const g = this.g;
    const c0 = g.col(x), r0 = g.row(z);
    let best = -1;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!g.inside(c0 + dc, r0 + dr)) continue;
        const d = this.dist[(r0 + dr) * g.cols + c0 + dc];
        if (d >= 0 && (best < 0 || d < best)) best = d;
      }
    return best;
  }
}

export class Grid {
  cols: number;
  rows: number;
  ox: number;
  oz: number;
  cells: Uint8Array;
  queue: Int32Array;
  /** horde → Kirill fields: walking units, and drawings that slide over desks */
  flowN: Flow;
  flowG: Flow;
  private base: Uint8Array | null = null;
  private dyn = new Map<string, Rect>();
  private wide = new Map<number, Uint8Array>();
  private probe: Flow;

  constructor(public w: number, public h: number) {
    this.cols = Math.ceil(w / CELL);
    this.rows = Math.ceil(h / CELL);
    this.ox = -w / 2;
    this.oz = -h / 2;
    const n = this.cols * this.rows;
    this.cells = new Uint8Array(n);
    this.queue = new Int32Array(n);
    this.flowN = new Flow(this, LOW);
    this.flowG = new Flow(this, SOLID);
    this.probe = new Flow(this, LOW);
  }

  col(x: number) { return Math.floor((x - this.ox) / CELL); }
  row(z: number) { return Math.floor((z - this.oz) / CELL); }
  inside(c: number, r: number) { return c >= 0 && r >= 0 && c < this.cols && r < this.rows; }
  at(c: number, r: number) { return this.inside(c, r) ? this.cells[r * this.cols + c] : SOLID; }
  cx(c: number) { return this.ox + (c + 0.5) * CELL; }
  cz(r: number) { return this.oz + (r + 0.5) * CELL; }

  /** Mark an axis-aligned rect (world coords, centre + size). Keeps the strongest value. */
  mark(x: number, z: number, w: number, d: number, v: number) {
    this.stamp(x, z, w, d, v);
    this.wide.clear();
  }

  private stamp(x: number, z: number, w: number, d: number, v: number) {
    const c0 = this.col(x - w / 2 + 0.01), c1 = this.col(x + w / 2 - 0.01);
    const r0 = this.row(z - d / 2 + 0.01), r1 = this.row(z + d / 2 - 0.01);
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++)
        if (this.inside(c, r)) {
          const i = r * this.cols + c;
          if (v > this.cells[i]) this.cells[i] = v;
        }
  }

  snapshot() { return this.cells.slice(); }
  restore(s: Uint8Array) { this.cells.set(s); this.wide.clear(); }

  /** The map is built: from now on obstacles come and go through setDynamic(). */
  freeze() { this.base = this.cells.slice(); }

  /** Add (rect) or remove (null) a runtime obstacle: parked cars, the Queue, locked doors… */
  setDynamic(id: string, rect: Rect | null) {
    if (rect) this.dyn.set(id, rect);
    else if (!this.dyn.delete(id)) return;
    if (!this.base) this.freeze();
    this.cells.set(this.base!);
    for (const r of this.dyn.values()) this.stamp(r.x, r.z, r.w, r.d, r.v);
    this.wide.clear();
  }

  hasDynamic(id: string) { return this.dyn.has(id); }

  // obstacles grown by one cell so units don't route through 1-cell gaps
  inflated(blockAt: number) {
    let out = this.wide.get(blockAt);
    if (out) return out;
    out = new Uint8Array(this.cells.length);
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) {
        let hit = 0;
        for (let dr = -1; dr <= 1 && !hit; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const nc = c + dc, nr = r + dr;
            // the arena edge doesn't count: resolve() already keeps bodies inside it
            if (this.inside(nc, nr) && this.cells[nr * this.cols + nc] >= blockAt) { hit = 1; break; }
          }
        out[r * this.cols + c] = hit;
      }
    this.wide.set(blockAt, out);
    return out;
  }

  blocked(x: number, z: number, ghost = false) {
    const v = this.at(this.col(x), this.row(z));
    return ghost ? v >= SOLID : v >= LOW;
  }

  /** Count cells reachable from (x,z) vs all free cells (connectivity check, GDD §10). */
  connected(x: number, z: number) {
    const seen = new Uint8Array(this.cells.length);
    const start = this.row(z) * this.cols + this.col(x);
    if (this.cells[start] !== FREE) return false;
    let head = 0, tail = 0, count = 0;
    this.queue[tail++] = start;
    seen[start] = 1;
    while (head < tail) {
      const i = this.queue[head++];
      count++;
      const c = i % this.cols, r = (i / this.cols) | 0;
      for (const [dc, dr] of DIR4) {
        const nc = c + dc, nr = r + dr;
        if (!this.inside(nc, nr)) continue;
        const ni = nr * this.cols + nc;
        if (!seen[ni] && this.cells[ni] === FREE) { seen[ni] = 1; this.queue[tail++] = ni; }
      }
    }
    let free = 0;
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i] === FREE) free++;
    return count === free;
  }

  /** Can a body walk from a to b (with clearance)? Used to keep one route open past parked cars. */
  reachable(ax: number, az: number, bx: number, bz: number) {
    this.probe.compute(bx, bz, 0.6);
    return this.probe.near(ax, az) >= 0;
  }

  // compatibility helpers for the horde fields
  computeFlow(tx: number, tz: number, seedRadius = 0) {
    this.flowN.compute(tx, tz, seedRadius);
    this.flowG.compute(tx, tz, seedRadius);
  }
  flowDir(x: number, z: number, ghost: boolean, out: { x: number; z: number }) {
    return (ghost ? this.flowG : this.flowN).dir(x, z, out);
  }
  flowDist(x: number, z: number, ghost = false) {
    return (ghost ? this.flowG : this.flowN).at(x, z);
  }

  /** Push a circle out of blocked cells and arena bounds. Returns true if it hit something. */
  resolve(p: { x: number; z: number }, rad: number, ghost = false) {
    const lim = ghost ? SOLID : LOW;
    let hit = false;
    const c0 = this.col(p.x - rad), c1 = this.col(p.x + rad);
    const r0 = this.row(p.z - rad), r1 = this.row(p.z + rad);
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        if (!this.inside(c, r) || this.cells[r * this.cols + c] < lim) continue;
        const minX = this.ox + c * CELL, minZ = this.oz + r * CELL;
        const qx = Math.max(minX, Math.min(p.x, minX + CELL));
        const qz = Math.max(minZ, Math.min(p.z, minZ + CELL));
        let dx = p.x - qx, dz = p.z - qz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rad * rad) continue;
        hit = true;
        if (d2 < 1e-8) {
          // centre inside the cell: push out along the shortest axis
          const cxm = minX + CELL / 2, czm = minZ + CELL / 2;
          dx = p.x - cxm; dz = p.z - czm;
          if (Math.abs(dx) > Math.abs(dz)) p.x = dx > 0 ? minX + CELL + rad : minX - rad;
          else p.z = dz > 0 ? minZ + CELL + rad : minZ - rad;
        } else {
          const d = Math.sqrt(d2);
          p.x = qx + (dx / d) * rad;
          p.z = qz + (dz / d) * rad;
        }
      }
    const hw = this.w / 2 - rad, hh = this.h / 2 - rad;
    if (p.x < -hw) { p.x = -hw; hit = true; }
    if (p.x > hw) { p.x = hw; hit = true; }
    if (p.z < -hh) { p.z = -hh; hit = true; }
    if (p.z > hh) { p.z = hh; hit = true; }
    return hit;
  }

  /** Nearest walkable point (spiral search), for spawn clicks that land on a desk. */
  nearestFree(x: number, z: number, ghost = false, maxR = 6): { x: number; z: number } | null {
    const c0 = this.col(x), r0 = this.row(z);
    const lim = ghost ? SOLID : LOW;
    for (let rad = 0; rad <= maxR / CELL; rad++)
      for (let dr = -rad; dr <= rad; dr++)
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
          const c = c0 + dc, r = r0 + dr;
          if (this.inside(c, r) && this.at(c, r) < lim) return { x: this.cx(c), z: this.cz(r) };
        }
    return null;
  }

  /** A random walkable point (with clearance), for coins, tasks, food… */
  randomFree(rnd: () => number, minX = -Infinity, maxX = Infinity, minZ = -Infinity, maxZ = Infinity) {
    const wide = this.inflated(LOW);
    for (let i = 0; i < 400; i++) {
      const c = Math.floor(rnd() * this.cols), r = Math.floor(rnd() * this.rows);
      const x = this.cx(c), z = this.cz(r);
      if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
      if (!wide[r * this.cols + c]) return { x, z };
    }
    return null;
  }

  /** Free space in a direction, sampled; used by Kirill's wall avoidance. */
  clearance(x: number, z: number, dx: number, dz: number, maxD = 2) {
    for (let d = 0.3; d <= maxD; d += 0.3) if (this.blocked(x + dx * d, z + dz * d)) return d;
    return maxD;
  }

  /** Line of sight at crouch height: LOW furniture and SOLID both block. `ignore` skips cells (glass counter). */
  sees(ax: number, az: number, bx: number, bz: number, ignore?: (x: number, z: number) => boolean) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / (CELL * 0.5));
    for (let i = 1; i < n; i++) {
      const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * i) / n;
      if (ignore?.(x, z)) continue;
      if (this.blocked(x, z)) return false;
    }
    return true;
  }
}

const DIR4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const DIR8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
