// Floor plans. x in [-w/2, w/2], z in [-h/2, h/2], north (-z) is the far wall.

export type Rot = 0 | 1 | 2 | 3;
export interface Placement { kind: string; x: number; z: number; rot?: Rot }
export interface Optional { kinds: string[]; zone: [number, number, number, number]; count: [number, number]; rot?: Rot | 'any' }
export interface WallItem { kind: string; wall: 'n' | 'w' | 'e' | 'i'; at: number; y: number; z?: number; ry?: number }
export type FloorStyle = 'marble' | 'marbleLight' | 'lecture' | 'gym' | 'paving' | 'grass' | 'asphalt' | 'wood' | 'canteen' | 'dorm' | 'kitchen' | 'lab' | 'deans';
export interface FloorRect { x0: number; z0: number; x1: number; z1: number; style: FloorStyle }
export interface InteriorWall { x: number; z: number; w: number; d: number; h: number }
/** flat coloured strips on the floor: parking lines, carpet runners */
export interface Decal { x: number; z: number; w: number; d: number; color: number }

export interface Layout {
  id: string;
  name: string;
  w: number;
  h: number;
  mood: 'golden' | 'gym' | 'dark' | 'evening';
  /** open sky: low curbs instead of walls, a building facade along the north edge */
  outdoor?: boolean;
  facade?: { portico: boolean };
  wall: { upper: number; lower: number; height: number };
  floors: FloorRect[];
  interior: InteriorWall[];
  /** unwalkable areas with no visuals of their own (the office behind the dean's counter) */
  blockers?: { x: number; z: number; w: number; d: number }[];
  decals?: Decal[];
  props: Placement[];
  optional: Optional[];
  wallItems: WallItem[];
  /** gaps in the low south wall (x centre, width) */
  southGaps: [number, number][];
  exits: { x: number; z: number }[];
  start: { x: number; z: number };
  zones: Record<string, { x: number; z: number }>;
  lightPools: { x: number; z: number; w: number; d: number; r?: number }[];
  laps?: { x: number; z: number }[];
}

const turnstileRow = (x0: number, x1: number, z: number, skip: number[] = []) => {
  const out: Placement[] = [];
  for (let x = x0; x <= x1 + 0.01; x += 1.5) if (!skip.some((s) => Math.abs(s - x) < 0.1)) out.push({ kind: 'turnstile', x, z });
  return out;
};

/** Week 1: Main building hall (west half) + Building 2 hall (east half), joined by a passage. */
export const FOYER: Layout = {
  id: 'foyer',
  name: 'Main hall · Building 2 hall',
  w: 40, h: 26,
  mood: 'golden',
  wall: { upper: 0xe6dac4, lower: 0xb9a88c, height: 3.6 },
  floors: [
    { x0: -20, z0: -13, x1: 0, z1: 13, style: 'marble' },
    { x0: 0, z0: -13, x1: 20, z1: 13, style: 'marbleLight' },
  ],
  interior: [
    { x: 0, z: -7.4, w: 0.5, d: 11.2, h: 3 },
    { x: 0, z: 7.4, w: 0.5, d: 11.2, h: 3 },
  ],
  props: [
    // main hall
    { kind: 'stairs', x: -10, z: -11.4 },
    { kind: 'pillar', x: -16, z: -6 }, { kind: 'pillar', x: -4, z: -6 },
    { kind: 'pillar', x: -16, z: 1 }, { kind: 'pillar', x: -4, z: 1 },
    ...turnstileRow(-16.5, -3.5, 6.5, [-10.5, -9]),
    { kind: 'sign', x: -13, z: 9.5 },
    { kind: 'planter', x: -17.5, z: 11 }, { kind: 'planter', x: -2.8, z: 11 },
    { kind: 'vending', x: -19.5, z: -2.5, rot: 1 },
    // flush against the staircase so no unreachable pocket is left behind them
    { kind: 'plant', x: -13.45, z: -12.4 }, { kind: 'plant', x: -6.55, z: -12.4 },
    // Building 2 hall
    { kind: 'stairs', x: 16.8, z: -11.4 },
    { kind: 'pillar', x: 4, z: -6 }, { kind: 'pillar', x: 11, z: -6 }, { kind: 'pillar', x: 4, z: 1 },
    { kind: 'reception', x: 15.2, z: 1.5 },
    ...turnstileRow(3, 12, 6.5, [7.5, 9]),
    { kind: 'seatRow', x: 19.5, z: -4.5, rot: 3 },
    { kind: 'waterCooler', x: 19.4, z: 8.5 },
    { kind: 'planter', x: 3, z: 11 }, { kind: 'planter', x: 17.5, z: 11 },
    { kind: 'radiator', x: 6, z: -12.7 },
  ],
  optional: [
    { kinds: ['bench'], zone: [-19.2, -9, -18.5, 4], count: [1, 2], rot: 1 },
    { kinds: ['plant', 'trash'], zone: [-18, -5, -2, 4], count: [2, 4] },
    { kinds: ['plant'], zone: [2, -5, 18, 4], count: [2, 3] },
    { kinds: ['seatRow', 'bench'], zone: [2, -10, 12, -9], count: [1, 1], rot: 0 },
    { kinds: ['trash'], zone: [1.5, 8, 18, 9.5], count: [1, 2] },
    { kinds: ['bag', 'papers'], zone: [-18, -9, 18, 10], count: [3, 6], rot: 'any' },
  ],
  wallItems: [
    { kind: 'banner', wall: 'n', at: -14.8, y: 2.1 }, { kind: 'banner', wall: 'n', at: -5.2, y: 2.1 },
    { kind: 'clock', wall: 'n', at: -10, y: 3.1 },
    { kind: 'window', wall: 'n', at: -17.8, y: 2.0 }, { kind: 'window', wall: 'n', at: -2.4, y: 2.0 },
    { kind: 'window', wall: 'w', at: -6, y: 2.0 }, { kind: 'window', wall: 'w', at: 7, y: 2.0 },
    { kind: 'door', wall: 'w', at: -10, y: 1.2 }, { kind: 'door', wall: 'w', at: 2, y: 1.2 },
    { kind: 'noticeBoard', wall: 'i', at: -0.26, z: -9, y: 1.7, ry: -Math.PI / 2 },
    { kind: 'noticeBoard', wall: 'i', at: 0.26, z: 9.5, y: 1.7, ry: Math.PI / 2 },
    { kind: 'banner', wall: 'n', at: 3.4, y: 2.1 }, { kind: 'banner', wall: 'n', at: 12.4, y: 2.1 },
    { kind: 'door', wall: 'n', at: 8, y: 1.2 },
    { kind: 'extinguisher', wall: 'n', at: 10.4, y: 1.2 },
    { kind: 'window', wall: 'e', at: 3, y: 2.0 }, { kind: 'window', wall: 'e', at: 10, y: 2.0 },
    { kind: 'directory', wall: 'e', at: -1, y: 1.7 },
    { kind: 'door', wall: 'e', at: -8.2, y: 1.2 },
  ],
  southGaps: [[-10, 4], [10, 4]],
  exits: [{ x: -10, z: 12.3 }, { x: 10, z: 12.3 }, { x: -19.3, z: -10 }, { x: -19.3, z: 2 }, { x: 8, z: -12.3 }, { x: 19.3, z: -8.2 }],
  start: { x: -10, z: 2.5 },
  zones: { hallA: { x: -10, z: 3 }, hallB: { x: 9, z: 3 } },
  lightPools: [
    { x: -15.5, z: -5, w: 7, d: 3, r: 0.25 }, { x: -15.5, z: 8, w: 7, d: 3, r: 0.25 },
    { x: -17.8, z: -10, w: 2.6, d: 4 }, { x: -2.4, z: -10, w: 2.6, d: 4 },
  ],
};

/** Weeks 2, 6, 15: main lecture hall — rows of wooden desks facing the green board, windows west. */
const deskRows: Placement[] = [];
// 3 units between rows (2 m walkway after the desk) and 2-unit aisles between the blocks
for (const z of [-7, -4, -1, 2, 5, 8]) for (const x of [-11, 0, 11]) deskRows.push({ kind: 'deskRow', x, z });

export const LECTURE: Layout = {
  id: 'lecture',
  name: 'Main lecture hall',
  w: 40, h: 26,
  mood: 'golden',
  wall: { upper: 0xeadfc8, lower: 0x8a5a33, height: 3.6 },
  floors: [{ x0: -20, z0: -13, x1: 20, z1: 13, style: 'lecture' }],
  interior: [],
  props: [
    ...deskRows,
    { kind: 'teacherDesk', x: 0, z: -10 },
    { kind: 'plant', x: -19.2, z: -12.2 }, { kind: 'plant', x: 19.2, z: -12.2 },
    { kind: 'radiator', x: -19.7, z: -2, rot: 1 }, { kind: 'radiator', x: -19.7, z: 6, rot: 1 },
  ],
  optional: [
    { kinds: ['bag', 'papers'], zone: [-17, -8, 17, 11], count: [6, 10], rot: 'any' },
    { kinds: ['plant', 'trash'], zone: [17.5, -10, 19.3, 11], count: [1, 2] },
    { kinds: ['bench'], zone: [-8, 11.6, 8, 12], count: [0, 1], rot: 0 },
  ],
  wallItems: [
    { kind: 'chalkboard', wall: 'n', at: 0, y: 1.9 },
    { kind: 'banner', wall: 'n', at: -9, y: 2.1 }, { kind: 'banner', wall: 'n', at: 9, y: 2.1 },
    { kind: 'clock', wall: 'n', at: 14, y: 2.8 },
    { kind: 'noticeBoard', wall: 'n', at: -15, y: 1.7 },
    { kind: 'window', wall: 'w', at: -8, y: 2.0 }, { kind: 'window', wall: 'w', at: -2, y: 2.0 },
    { kind: 'window', wall: 'w', at: 4, y: 2.0 }, { kind: 'window', wall: 'w', at: 10, y: 2.0 },
    { kind: 'door', wall: 'e', at: -8, y: 1.2 }, { kind: 'door', wall: 'e', at: 5, y: 1.2 },
    { kind: 'extinguisher', wall: 'e', at: 0, y: 1.2 },
  ],
  southGaps: [[-17, 2.5]],
  exits: [{ x: 19.3, z: -8 }, { x: 19.3, z: 5 }, { x: -17, z: 12.3 }],
  // Kirill's chair, behind the desk row at z = 2 (in the walkway, not inside the desk)
  start: { x: 0, z: 2.75 },
  zones: { seat: { x: 0, z: 2.75 } },
  lightPools: [
    { x: -15, z: -6, w: 8, d: 3, r: 0.3 }, { x: -15, z: 0, w: 8, d: 3, r: 0.3 },
    { x: -15, z: 6, w: 8, d: 3, r: 0.3 }, { x: -15, z: 12, w: 8, d: 2.4, r: 0.3 },
  ],
};

/** Week 3: sports complex indoor gym — parquet, blue walls, wall bars, hoops on the short walls. */
export const GYM: Layout = {
  id: 'gym',
  name: 'Sports complex · gym',
  w: 40, h: 26,
  mood: 'gym',
  wall: { upper: 0xe9e3d6, lower: 0x2c5aa8, height: 3.9 },
  floors: [{ x0: -20, z0: -13, x1: 20, z1: 13, style: 'gym' }],
  interior: [],
  props: [
    { kind: 'hoopWall', x: -19.3, z: 0, rot: 1 },
    { kind: 'hoopWall', x: 19.3, z: 0, rot: 3 },
    { kind: 'gymBench', x: -12, z: 12.3 }, { kind: 'gymBench', x: 12, z: 12.3 },
    { kind: 'ballCart', x: 17.8, z: 10.5 },
  ],
  optional: [
    { kinds: ['mat'], zone: [-18, -11.5, -12, -10], count: [1, 2], rot: 0 },
    { kinds: ['mat'], zone: [12, -11.5, 18, -10], count: [1, 2], rot: 0 },
    { kinds: ['gymBench'], zone: [-6, -12.3, 6, -12.2], count: [0, 1], rot: 0 },
    { kinds: ['bag'], zone: [-18, 10, 18, 11.5], count: [2, 4], rot: 'any' },
  ],
  wallItems: [
    { kind: 'window', wall: 'n', at: -16.5, y: 2.7 }, { kind: 'window', wall: 'n', at: -5, y: 2.7 },
    { kind: 'window', wall: 'n', at: 5, y: 2.7 }, { kind: 'window', wall: 'n', at: 16.5, y: 2.7 },
    { kind: 'banner', wall: 'n', at: -1, y: 2.4 }, { kind: 'banner', wall: 'n', at: 1, y: 2.4 },
    { kind: 'wallBars', wall: 'n', at: -11.5, y: 1.3 }, { kind: 'wallBars', wall: 'n', at: -9, y: 1.3 },
    { kind: 'wallBars', wall: 'n', at: 9, y: 1.3 }, { kind: 'wallBars', wall: 'n', at: 11.5, y: 1.3 },
    { kind: 'window', wall: 'w', at: -8, y: 2.6 }, { kind: 'window', wall: 'w', at: 8, y: 2.6 },
    { kind: 'clock', wall: 'e', at: -6, y: 3.0 },
    { kind: 'door', wall: 'e', at: -9.5, y: 1.2 },
  ],
  southGaps: [[-6, 2.5]],
  exits: [{ x: -6, z: 12.3 }, { x: 19.3, z: -9.5 }, { x: -19.3, z: 9 }],
  start: { x: 0, z: 5 },
  zones: { nina: { x: 0, z: -2.5 } },
  lightPools: [
    { x: -16.5, z: -8.5, w: 2.8, d: 6 }, { x: -5, z: -8.5, w: 2.8, d: 6 },
    { x: 5, z: -8.5, w: 2.8, d: 6 }, { x: 16.5, z: -8.5, w: 2.8, d: 6 },
  ],
  laps: [{ x: -15, z: -8.5 }, { x: 15, z: -8.5 }, { x: 15, z: 8.5 }, { x: -15, z: 8.5 }],
};

// ======================================================================= weeks 4–15

const grid = (kind: string, xs: number[], zs: number[], rot: Rot = 0): Placement[] =>
  xs.flatMap((x) => zs.map((z) => ({ kind, x, z, rot })));

/** Week 4: plaza in front of the main building — pavers, lawns, autumn trees, the bust. */
export const PLAZA: Layout = {
  id: 'plaza',
  name: 'Main building plaza',
  w: 46, h: 28,
  mood: 'golden',
  outdoor: true,
  facade: { portico: true },
  wall: { upper: 0xcfc6b6, lower: 0xb9a88c, height: 0.4 },
  floors: [
    { x0: -23, z0: -14, x1: 23, z1: 14, style: 'paving' },
    { x0: -23, z0: -14, x1: -13, z1: -4, style: 'grass' },
    { x0: 13, z0: -14, x1: 23, z1: -4, style: 'grass' },
    { x0: -23, z0: 5, x1: -11, z1: 14, style: 'grass' },
    { x0: 11, z0: 5, x1: 23, z1: 14, style: 'grass' },
  ],
  interior: [],
  props: [
    { kind: 'stairs', x: 0, z: -12.4 },
    { kind: 'bust', x: 8, z: -8 },
    { kind: 'fir', x: -19, z: -10 }, { kind: 'fir', x: 19, z: -10 }, { kind: 'fir', x: -15, z: -10.5 },
    { kind: 'tree', x: -18, z: -6 }, { kind: 'tree', x: 17, z: -6.5 }, { kind: 'tree', x: 15, z: -11.5 },
    { kind: 'tree', x: -19, z: 9 }, { kind: 'tree', x: -14, z: 11.5 }, { kind: 'tree', x: 19.5, z: 8.5 }, { kind: 'tree', x: 14.5, z: 11 },
    { kind: 'planter', x: -5.5, z: -9 }, { kind: 'planter', x: 5.5, z: -5 },
    { kind: 'bench', x: -6, z: 3 }, { kind: 'bench', x: 6, z: 3 },
    { kind: 'bench', x: -11.5, z: -1.5, rot: 1 }, { kind: 'bench', x: 11.5, z: -1.5, rot: 3 },
    { kind: 'lampPost', x: -9.5, z: 0.5 }, { kind: 'lampPost', x: 9.5, z: 0.5 }, { kind: 'lampPost', x: -9.5, z: 9 }, { kind: 'lampPost', x: 9.5, z: 9 },
    { kind: 'trash', x: -2.6, z: 4.2 }, { kind: 'trash', x: 2.6, z: 4.2 },
    { kind: 'hedge', x: -18.5, z: 13.4 }, { kind: 'hedge', x: -7.5, z: 13.4 }, { kind: 'hedge', x: 7.5, z: 13.4 }, { kind: 'hedge', x: 18.5, z: 13.4 },
  ],
  optional: [
    { kinds: ['tree'], zone: [-21, 6, -13, 12], count: [1, 2] },
    { kinds: ['tree'], zone: [13, 6, 21, 12], count: [1, 2] },
    { kinds: ['bench', 'trash'], zone: [-8, 6, 8, 10], count: [1, 2], rot: 0 },
    { kinds: ['papers', 'bag'], zone: [-10, -6, 10, 10], count: [2, 4], rot: 'any' },
  ],
  wallItems: [],
  southGaps: [[0, 6]],
  exits: [{ x: 0, z: 13.4 }, { x: -22.4, z: 0 }, { x: 22.4, z: 0 }, { x: 0, z: -10.2 }],
  start: { x: 0, z: 2 },
  zones: {},
  lightPools: [],
};

/** Week 5: Building 2 entrance hall; the reception desk becomes the trade-union desk. */
export const B2HALL: Layout = {
  id: 'b2hall',
  name: 'Building 2 hall',
  w: 40, h: 26,
  mood: 'golden',
  wall: { upper: 0xe6dac4, lower: 0xb9a88c, height: 3.6 },
  floors: [{ x0: -20, z0: -13, x1: 20, z1: 13, style: 'marbleLight' }],
  interior: [],
  props: [
    { kind: 'stairs', x: 16.8, z: -11.4 },
    { kind: 'pillar', x: -12, z: -6 }, { kind: 'pillar', x: -4, z: -6 }, { kind: 'pillar', x: 4, z: -6 }, { kind: 'pillar', x: 12, z: -6 },
    { kind: 'pillar', x: -12, z: 2 }, { kind: 'pillar', x: 12, z: 2 },
    { kind: 'reception', x: 0, z: -2.5 },
    ...turnstileRow(-12, 12, 6.5, [-1.5, 0, 1.5]),
    { kind: 'seatRow', x: -19.5, z: -5, rot: 1 }, { kind: 'seatRow', x: -19.5, z: -0.5, rot: 1 }, { kind: 'seatRow', x: 19.5, z: -2, rot: 3 },
    { kind: 'waterCooler', x: -19.3, z: -10 },
    { kind: 'radiator', x: -2, z: -12.7 },
    { kind: 'planter', x: -15, z: 11 }, { kind: 'planter', x: 15, z: 11 },
    { kind: 'sign', x: -4.5, z: 9.5 },
  ],
  optional: [
    { kinds: ['plant', 'trash'], zone: [-17, -5, 17, 4], count: [3, 5] },
    { kinds: ['bag', 'papers'], zone: [-17, -10, 17, 10], count: [3, 6], rot: 'any' },
  ],
  wallItems: [
    { kind: 'banner', wall: 'n', at: -12, y: 2.1 }, { kind: 'banner', wall: 'n', at: -4, y: 2.1 },
    { kind: 'window', wall: 'n', at: -16.5, y: 2.0 }, { kind: 'window', wall: 'n', at: 4, y: 2.0 },
    { kind: 'door', wall: 'n', at: -8, y: 1.2 }, { kind: 'clock', wall: 'n', at: 8.5, y: 2.8 },
    { kind: 'noticeBoard', wall: 'w', at: -9, y: 1.7 }, { kind: 'door', wall: 'w', at: 5, y: 1.2 },
    { kind: 'window', wall: 'w', at: 9.5, y: 2.0 },
    { kind: 'directory', wall: 'e', at: 4, y: 1.7 }, { kind: 'door', wall: 'e', at: -7, y: 1.2 },
    { kind: 'extinguisher', wall: 'e', at: 8, y: 1.2 },
  ],
  southGaps: [[0, 4]],
  exits: [{ x: 0, z: 12.3 }, { x: -8, z: -12.3 }, { x: -19.3, z: 5 }, { x: 19.3, z: -7 }],
  start: { x: 0, z: 2.5 },
  zones: {},
  lightPools: [{ x: -15.5, z: 9.5, w: 7, d: 3, r: 0.25 }, { x: -16.5, z: -10, w: 2.6, d: 4 }, { x: 4, z: -10, w: 2.6, d: 4 }],
};

/** Week 7: canteen «Зодчие» — serving line along the top, tables below, booths on the walls. */
export const CANTEEN: Layout = {
  id: 'canteen',
  name: 'Canteen «Зодчие»',
  w: 40, h: 26,
  mood: 'golden',
  wall: { upper: 0xe0d4c0, lower: 0x6e4a2a, height: 3.8 },
  floors: [{ x0: -20, z0: -13, x1: 20, z1: 13, style: 'canteen' }],
  interior: [],
  // the strip behind the serving line is staff-only
  blockers: [{ x: 0, z: -12.65, w: 12.4, d: 0.7 }],
  props: [
    { kind: 'servingCounter', x: 0, z: -11.6 },
    { kind: 'vending', x: -19.5, z: -11, rot: 1 }, { kind: 'vending', x: -19.5, z: -9.6, rot: 1 },
    { kind: 'pillarWood', x: -9, z: -5 }, { kind: 'pillarWood', x: 9, z: -5 }, { kind: 'pillarWood', x: -9, z: 4 }, { kind: 'pillarWood', x: 9, z: 4 },
    ...grid('canteenTable', [-4, 4], [-5.5, -1, 3.5]),
    ...grid('canteenTable', [-14, 14], [-4, 1.5, 7], 1),
    ...grid('booth', [-18.9, 18.9], [-3, 2, 7]),
    { kind: 'menuBoard', x: 3, z: 10 },
    { kind: 'planterBox', x: -9, z: 9.5 }, { kind: 'planterBox', x: 9, z: 9.5 },
    { kind: 'trash', x: -3, z: 11 },
  ],
  optional: [
    { kinds: ['plant'], zone: [-10.5, -7, -7.5, 7], count: [1, 2] },
    { kinds: ['plant'], zone: [7.5, -7, 10.5, 7], count: [1, 2] },
    { kinds: ['bag'], zone: [-12, -8, 12, 9], count: [2, 4], rot: 'any' },
  ],
  wallItems: [
    { kind: 'zodchieMenu', wall: 'n', at: 0, y: 2.7 },
    { kind: 'bigWindow', wall: 'w', at: -5, y: 2.0 }, { kind: 'bigWindow', wall: 'w', at: 0, y: 2.0 }, { kind: 'bigWindow', wall: 'w', at: 5, y: 2.0 },
    { kind: 'poster', wall: 'e', at: -6, y: 1.9 }, { kind: 'clock', wall: 'e', at: 0, y: 2.6 },
    { kind: 'door', wall: 'e', at: 10, y: 1.2 },
  ],
  southGaps: [[0, 4]],
  exits: [{ x: 0, z: 12.3 }, { x: 19.3, z: 10 }, { x: -19.3, z: -6 }],
  start: { x: 0, z: 8.5 },
  zones: {
    food0: { x: -5, z: -10.2 }, food1: { x: -3, z: -10.2 }, food2: { x: -1, z: -10.2 },
    food3: { x: 1, z: -10.2 }, food4: { x: 3, z: -10.2 }, food5: { x: 5, z: -10.2 },
  },
  lightPools: [{ x: -15.5, z: -5, w: 7, d: 3.4, r: 0.3 }, { x: -15.5, z: 0, w: 7, d: 3.4, r: 0.3 }, { x: -15.5, z: 5, w: 7, d: 3.4, r: 0.3 }],
};

// Week 8 parking: three rows of parked cars, each with one gap, so the walk zig-zags.
const carRow = (z: number, gapX: number): Placement[] => {
  const out: Placement[] = [];
  for (let x = -21.85; x <= 21.9; x += 2.3) if (Math.abs(x - gapX) > 2.4) out.push({ kind: 'car', x, z });
  return out;
};
const stallLines = (z: number): Decal[] => {
  const out: Decal[] = [];
  for (let x = -23 + 0.0; x <= 23; x += 2.3) out.push({ x, z, w: 0.08, d: 4.4, color: 0xf2efe6 });
  return out;
};

/** Week 8: parking lot in front of the main entrance (no sheet yet — GDD §20). */
export const PARKING: Layout = {
  id: 'parking',
  name: 'Parking lot',
  w: 46, h: 30,
  mood: 'golden',
  outdoor: true,
  facade: { portico: true },
  wall: { upper: 0xcfc6b6, lower: 0xb9a88c, height: 0.4 },
  floors: [{ x0: -23, z0: -15, x1: 23, z1: 15, style: 'asphalt' }],
  interior: [],
  props: [
    ...carRow(8, -12),
    ...carRow(0.5, 4),
    ...carRow(-6.5, -6),
    { kind: 'hedge', x: -21.5, z: -11.6 }, { kind: 'hedge', x: -18.5, z: -11.6 }, { kind: 'hedge', x: -15.5, z: -11.6 }, { kind: 'hedge', x: -12.5, z: -11.6 },
    { kind: 'hedge', x: -9.5, z: -11.6 }, { kind: 'hedge', x: -6.5, z: -11.6 }, { kind: 'hedge', x: -3.8, z: -11.6 },
    { kind: 'hedge', x: 3.8, z: -11.6 }, { kind: 'hedge', x: 6.5, z: -11.6 }, { kind: 'hedge', x: 9.5, z: -11.6 }, { kind: 'hedge', x: 12.5, z: -11.6 },
    { kind: 'hedge', x: 15.5, z: -11.6 }, { kind: 'hedge', x: 18.5, z: -11.6 }, { kind: 'hedge', x: 21.5, z: -11.6 },
    { kind: 'barrierPost', x: -2.5, z: -10.8 }, { kind: 'barrierPost', x: 2.5, z: -10.8 },
    { kind: 'lampPost', x: -14, z: 3 }, { kind: 'lampPost', x: 14, z: 3 }, { kind: 'lampPost', x: 0, z: 11.5 },
    { kind: 'tree', x: -21.5, z: 13 }, { kind: 'tree', x: 21.5, z: 13 },
    { kind: 'car', x: -21.8, z: 12.6, rot: 1 },
  ],
  optional: [{ kinds: ['trash'], zone: [-18, 10.5, 18, 12], count: [1, 2] }],
  wallItems: [],
  southGaps: [[0, 8]],
  decals: [...stallLines(8), ...stallLines(0.5), ...stallLines(-6.5), { x: 0, z: -11.6, w: 5, d: 0.3, color: 0xe8c547 }],
  exits: [{ x: 0, z: -13.6 }, { x: -22.4, z: 14 }, { x: 22.4, z: 14 }],
  start: { x: -18.5, z: 12.6 },
  zones: { goal: { x: 0, z: -13.6 }, gate: { x: 0, z: -11.6 } },
  lightPools: [],
};

// Week 9 dorm: corridor with rooms on both sides (partition walls with door gaps).
const roomWalls = (zFront: number, zBack: number): InteriorWall[] => {
  const out: InteriorWall[] = [];
  const mid = (zFront + zBack) / 2, depth = Math.abs(zBack - zFront);
  for (const x of [-10, 0, 10]) out.push({ x, z: mid, w: 0.3, d: depth, h: 3 });
  // front wall with a 2-unit door in each room
  for (const [a, b] of [[-20, -16], [-14, -6], [-4, 4], [6, 14], [16, 20]]) out.push({ x: (a + b) / 2, z: zFront, w: b - a, d: 0.3, h: 3 });
  return out;
};

export const DORM: Layout = {
  id: 'dorm',
  name: 'Dorm · rooms and corridor',
  w: 40, h: 26,
  mood: 'dark',
  wall: { upper: 0xe6e0d0, lower: 0x6f8f6a, height: 3.2 },
  floors: [{ x0: -20, z0: -13, x1: 20, z1: 13, style: 'dorm' }],
  interior: [...roomWalls(-3, -13), ...roomWalls(5, 13)],
  props: [
    // Kirill's room (north, second from the left)
    { kind: 'studyDesk', x: -5, z: -12.3, rot: 0 }, { kind: 'bed', x: -9.35, z: -8.5 }, { kind: 'wardrobe', x: -1.2, z: -12.5 },
    // other north rooms
    { kind: 'bed', x: -19.45, z: -8.5 }, { kind: 'studyDesk', x: -14, z: -12.3 }, { kind: 'wardrobe', x: -10.45, z: -6, rot: 3 },
    { kind: 'bed', x: 0.65, z: -8.5 }, { kind: 'studyDesk', x: 6, z: -12.3 }, { kind: 'wardrobe', x: 8.6, z: -12.5 },
    { kind: 'bed', x: 19.45, z: -8.5 }, { kind: 'studyDesk', x: 14, z: -12.3 },
    // south rooms
    { kind: 'bed', x: -19.45, z: 9.5 }, { kind: 'studyDesk', x: -14, z: 12.3, rot: 2 },
    { kind: 'bed', x: -0.65, z: 9.5 }, { kind: 'studyDesk', x: -6, z: 12.3, rot: 2 }, { kind: 'wardrobe', x: -8.8, z: 12.5, rot: 2 },
    { kind: 'bed', x: 9.35, z: 9.5 }, { kind: 'studyDesk', x: 4, z: 12.3, rot: 2 },
    { kind: 'fridge', x: 18.6, z: 12.3, rot: 2 }, { kind: 'bed', x: 10.65, z: 9.5 },
    // corridor
    { kind: 'plant', x: -12, z: -2.2 }, { kind: 'plant', x: 8, z: 4.2 }, { kind: 'radiator', x: 2, z: -2.75 },
  ],
  optional: [
    { kinds: ['rug'], zone: [-18, -1, 18, 3], count: [2, 3], rot: 0 },
    { kinds: ['bag', 'papers'], zone: [-18, -11, 18, 11], count: [4, 8], rot: 'any' },
  ],
  wallItems: [
    { kind: 'poster', wall: 'i', at: -6, z: -2.84, y: 1.7 },
    { kind: 'noticeBoard', wall: 'i', at: 12, z: 4.84, y: 1.7, ry: Math.PI },
    { kind: 'window', wall: 'n', at: -15, y: 2.0 }, { kind: 'window', wall: 'n', at: 5, y: 2.0 }, { kind: 'window', wall: 'n', at: 15, y: 2.0 },
    { kind: 'socket', wall: 'n', at: -3.2, y: 0.5 }, { kind: 'socket', wall: 'n', at: -16, y: 0.5 }, { kind: 'socket', wall: 'n', at: 11, y: 0.5 },
    { kind: 'socket', wall: 'i', at: -18, z: -2.84, y: 0.5 }, { kind: 'socket', wall: 'i', at: 17.5, z: 4.84, y: 0.5, ry: Math.PI },
    { kind: 'socket', wall: 'w', at: 1, y: 0.5 }, { kind: 'socket', wall: 'e', at: 1, y: 0.5 },
  ],
  southGaps: [],
  exits: [{ x: -19.3, z: 1 }, { x: 19.3, z: 1 }],
  start: { x: -5, z: -11.2 },
  zones: {
    desk: { x: -5, z: -11.2 },
    socket0: { x: -3.2, z: -12.3 }, socket1: { x: -16, z: -12.3 }, socket2: { x: 11, z: -12.3 },
    socket3: { x: -18, z: -2.3 }, socket4: { x: 17.5, z: 4.3 }, socket5: { x: -19.3, z: 1 }, socket6: { x: 19.3, z: 1 },
  },
  lightPools: [],
};

/** Week 10: dean's office — glass counter across the top, waiting hall below with chairs and plants for cover. */
export const DEANS: Layout = {
  id: 'deans',
  name: "Dean's office",
  w: 40, h: 26,
  mood: 'golden',
  wall: { upper: 0xece4d4, lower: 0xb9a88c, height: 3.6 },
  floors: [{ x0: -20, z0: -13, x1: 20, z1: 13, style: 'deans' }],
  interior: [
    { x: -18.6, z: -7, w: 2.8, d: 0.5, h: 3 },
    { x: 18.6, z: -7, w: 2.8, d: 0.5, h: 3 },
  ],
  blockers: [{ x: 0, z: -10.25, w: 40, d: 5.5 }],
  props: [
    { kind: 'glassCounter', x: -13.2, z: -7 }, { kind: 'glassCounter', x: -5.2, z: -7 },
    { kind: 'counterWindow', x: 0, z: -7 },
    { kind: 'glassCounter', x: 5.2, z: -7 }, { kind: 'glassCounter', x: 13.2, z: -7 },
    { kind: 'officeDesk', x: -12, z: -9.6 }, { kind: 'officeDesk', x: -6, z: -9.6 }, { kind: 'officeDesk', x: 6, z: -9.6 }, { kind: 'officeDesk', x: 12, z: -9.6 },
    { kind: 'filingShelf', x: -16, z: -12.6 }, { kind: 'filingShelf', x: -9, z: -12.6 }, { kind: 'filingShelf', x: 9, z: -12.6 }, { kind: 'filingShelf', x: 16, z: -12.6 },
    { kind: 'printer', x: 2.5, z: -12.4 }, { kind: 'flagStand', x: -3, z: -12.4 },
    // the hall: cover for sneaking
    { kind: 'blackSeats', x: -7, z: -3 }, { kind: 'blackSeats', x: 7, z: -3 },
    { kind: 'blackSeats', x: -2.6, z: 1 }, { kind: 'blackSeats', x: 2.6, z: 1 },
    { kind: 'blackSeats', x: -8, z: 5 }, { kind: 'blackSeats', x: 8, z: 5 },
    { kind: 'coffeeTable', x: -13, z: 1 }, { kind: 'coffeeTable', x: 13, z: 1 },
    { kind: 'blackSeats', x: -13, z: 2.4 }, { kind: 'blackSeats', x: 13, z: 2.4 },
    { kind: 'plant', x: -3.4, z: -4.8 }, { kind: 'plant', x: 3.4, z: -4.8 },
    { kind: 'plant', x: -11, z: -3 }, { kind: 'plant', x: 11, z: -3 },
    { kind: 'plant', x: 0, z: 4.6 }, { kind: 'plant', x: -5, z: 8 }, { kind: 'plant', x: 5, z: 8 },
    { kind: 'waterCooler', x: -19.3, z: -5.2 },
    { kind: 'plant', x: 19.2, z: -5.6 },
  ],
  optional: [{ kinds: ['plant'], zone: [-17, 6, 17, 10], count: [1, 2] }],
  wallItems: [
    { kind: 'deanSign', wall: 'n', at: 0, y: 2.6 },
    { kind: 'clock', wall: 'n', at: 7, y: 2.9 },
    { kind: 'window', wall: 'w', at: -10, y: 2.0 },
    { kind: 'facultyBoard', wall: 'w', at: 2, y: 1.6 },
    { kind: 'noticeBoard', wall: 'e', at: 2, y: 1.7 },
    { kind: 'window', wall: 'e', at: -10, y: 2.0 },
    { kind: 'door', wall: 'w', at: 8, y: 1.2 }, { kind: 'door', wall: 'e', at: 8, y: 1.2 },
  ],
  southGaps: [[0, 4]],
  exits: [{ x: 0, z: 12.3 }, { x: -19.3, z: 8 }, { x: 19.3, z: 8 }],
  start: { x: 0, z: 11.4 },
  zones: { goal: { x: 0, z: -6.0 }, sec0: { x: -6, z: -8.4 }, sec1: { x: 6, z: -8.4 } },
  lightPools: [{ x: -16, z: -3, w: 6, d: 3, r: 0.3 }],
};

/** Week 11: assembly hall (no sheet yet — GDD §20): stage, rows of seats, doors at the sides and back. */
export const ASSEMBLY: Layout = {
  id: 'assembly',
  name: 'Assembly hall',
  w: 40, h: 26,
  mood: 'evening',
  wall: { upper: 0xe4d8c4, lower: 0x7a3b2c, height: 4.4 },
  floors: [{ x0: -20, z0: -13, x1: 20, z1: 13, style: 'wood' }],
  interior: [],
  props: [
    { kind: 'stage', x: 0, z: -11 },
    ...grid('theaterRow', [-12.5, 0, 12.5], [-6, -3.5, -1, 1.5, 4, 6.5]),
    { kind: 'flagStand', x: -9, z: -12.4 }, { kind: 'plant', x: 9.5, z: -8.4 }, { kind: 'plant', x: -9.5, z: -8.4 },
  ],
  optional: [{ kinds: ['bag', 'papers'], zone: [-17, -7, 17, 9], count: [3, 6], rot: 'any' }],
  wallItems: [
    { kind: 'curtain', wall: 'n', at: 0, y: 2.2 },
    { kind: 'banner', wall: 'w', at: -2, y: 2.4 }, { kind: 'banner', wall: 'e', at: -2, y: 2.4 },
    { kind: 'door', wall: 'w', at: -4, y: 1.2 }, { kind: 'door', wall: 'w', at: 6, y: 1.2 },
    { kind: 'door', wall: 'e', at: -4, y: 1.2 }, { kind: 'door', wall: 'e', at: 6, y: 1.2 },
    { kind: 'clock', wall: 'e', at: 1, y: 3.4 },
  ],
  southGaps: [[-6, 2], [6, 2]],
  exits: [{ x: -19.3, z: -4 }, { x: -19.3, z: 6 }, { x: 19.3, z: -4 }, { x: 19.3, z: 6 }, { x: -6, z: 12.3 }, { x: 6, z: 12.3 }],
  start: { x: 0, z: 2.75 },
  zones: { stage: { x: 0, z: -10.5 } },
  lightPools: [],
};

/** Week 12: Building 2 classroom — two-seat desks facing the board, green lower walls. */
export const B2CLASS: Layout = {
  id: 'b2class',
  name: 'Building 2 classroom',
  w: 40, h: 26,
  mood: 'golden',
  wall: { upper: 0xe9e3d0, lower: 0x5e8a6a, height: 3.4 },
  floors: [{ x0: -20, z0: -13, x1: 20, z1: 13, style: 'lecture' }],
  interior: [],
  props: [
    ...grid('desk2', [-13, -8, -3, 3, 8, 13], [-6, -3, 0, 3, 6]),
    { kind: 'teacherDesk', x: 0, z: -10 },
    { kind: 'radiator', x: -19.7, z: -4, rot: 1 }, { kind: 'radiator', x: -19.7, z: 5, rot: 1 },
    { kind: 'plant', x: -19.2, z: -12.2 }, { kind: 'plant', x: 19.2, z: -12.2 },
  ],
  optional: [{ kinds: ['bag', 'papers'], zone: [-17, -8, 17, 11], count: [5, 9], rot: 'any' }],
  wallItems: [
    { kind: 'chalkboard', wall: 'n', at: 0, y: 1.9 },
    { kind: 'clock', wall: 'n', at: 9, y: 2.8 }, { kind: 'noticeBoard', wall: 'n', at: -11, y: 1.7 },
    { kind: 'window', wall: 'w', at: -7, y: 2.0 }, { kind: 'window', wall: 'w', at: 0, y: 2.0 }, { kind: 'window', wall: 'w', at: 7, y: 2.0 },
    { kind: 'door', wall: 'e', at: -8, y: 1.2 }, { kind: 'door', wall: 'e', at: 6, y: 1.2 },
    { kind: 'poster', wall: 'e', at: -1, y: 1.8 },
  ],
  southGaps: [],
  exits: [{ x: 19.3, z: -8 }, { x: 19.3, z: 6 }],
  start: { x: 0, z: 9.5 },
  zones: {},
  lightPools: [{ x: -15, z: -6, w: 8, d: 3, r: 0.3 }, { x: -15, z: 1, w: 8, d: 3, r: 0.3 }, { x: -15, z: 8, w: 8, d: 3, r: 0.3 }],
};

/** Week 13: dorm kitchen on New Year's Eve — stoves and counters, a long table, the tree. */
export const DORM_KITCHEN: Layout = {
  id: 'dormKitchen',
  name: 'Dorm kitchen',
  w: 40, h: 26,
  mood: 'evening',
  wall: { upper: 0xe6e0d0, lower: 0x5f8a72, height: 3.2 },
  floors: [{ x0: -20, z0: -13, x1: 20, z1: 13, style: 'kitchen' }],
  interior: [],
  props: [
    { kind: 'fridge', x: -19.1, z: -12.4 }, { kind: 'kitchenCounter', x: -16.2, z: -12.5 }, { kind: 'stove', x: -13.6, z: -12.5 },
    { kind: 'stove', x: -12.7, z: -12.5 }, { kind: 'kitchenCounter', x: -11.1, z: -12.5 },
    { kind: 'kitchenCounter', x: 11.1, z: -12.5 }, { kind: 'stove', x: 12.7, z: -12.5 }, { kind: 'stove', x: 13.6, z: -12.5 },
    { kind: 'kitchenCounter', x: 16.2, z: -12.5 }, { kind: 'fridge', x: 19.1, z: -12.4 },
    { kind: 'kitchenCounter', x: -19.5, z: -6, rot: 1 },
    { kind: 'diningTable', x: 0, z: -0.5 },
    { kind: 'diningTable', x: -11, z: 6 }, { kind: 'diningTable', x: 11, z: 6 },
    { kind: 'newYearTree', x: 15, z: -6 },
    { kind: 'plant', x: -19.2, z: 12.2 }, { kind: 'radiator', x: 0, z: 12.7, rot: 2 },
  ],
  optional: [{ kinds: ['rug'], zone: [-6, 4, 6, 9], count: [1, 1], rot: 0 }, { kinds: ['bag'], zone: [-17, -8, 17, 10], count: [2, 4], rot: 'any' }],
  wallItems: [
    { kind: 'bigWindow', wall: 'n', at: 0, y: 2.0 },
    { kind: 'poster', wall: 'w', at: 4, y: 1.8 }, { kind: 'clock', wall: 'e', at: 2, y: 2.5 },
    { kind: 'door', wall: 'e', at: 8, y: 1.2 },
  ],
  southGaps: [[0, 2.5]],
  exits: [{ x: 0, z: 12.3 }, { x: 19.3, z: 8 }],
  start: { x: 0, z: 1.25 },
  zones: { seat: { x: 0, z: 1.25 }, romchik: { x: -2.4, z: -2.4 }, sonya: { x: 2.4, z: -2.4 } },
  lightPools: [{ x: 0, z: -9.5, w: 3.4, d: 5 }],
};

/** Week 14: Computer Lab 317 — PC clusters in rows, a long side row, the server rack. */
export const LAB317: Layout = {
  id: 'lab317',
  name: 'Computer Lab 317',
  w: 40, h: 26,
  mood: 'golden',
  wall: { upper: 0xe9e3d6, lower: 0x8a7a5a, height: 3.6 },
  floors: [{ x0: -20, z0: -13, x1: 20, z1: 13, style: 'lab' }],
  interior: [],
  props: [
    ...grid('pcCluster', [-13, -6, 1], [-5.5, -0.5, 4.5]),
    { kind: 'pcRowV', x: 9, z: -0.5 }, { kind: 'pcRowV', x: 14, z: -0.5 },
    { kind: 'serverRack', x: 18.8, z: -6 }, { kind: 'serverRack', x: 18.8, z: -5 },
    { kind: 'teacherDesk', x: -6, z: -10.5 },
    { kind: 'plant', x: -19.2, z: -10 }, { kind: 'plant', x: -19.2, z: -3 }, { kind: 'plant', x: -19.2, z: 4 }, { kind: 'plant', x: -19.2, z: 10.5 },
    { kind: 'coatRack', x: 19.2, z: 12.2 }, { kind: 'trash', x: 12, z: 12.2 },
  ],
  optional: [{ kinds: ['bag', 'papers'], zone: [-17, -8, 17, 10], count: [4, 7], rot: 'any' }],
  wallItems: [
    { kind: 'projectorScreen', wall: 'n', at: 0, y: 2.2 },
    { kind: 'whiteboard', wall: 'n', at: -11, y: 1.6 },
    { kind: 'clock', wall: 'n', at: 6, y: 2.9 }, { kind: 'banner', wall: 'n', at: 11, y: 2.1 },
    { kind: 'window', wall: 'w', at: -8, y: 2.0 }, { kind: 'window', wall: 'w', at: 0.5, y: 2.0 }, { kind: 'window', wall: 'w', at: 8, y: 2.0 },
    { kind: 'door', wall: 'e', at: -10, y: 1.2 },
  ],
  southGaps: [],
  exits: [{ x: 19.3, z: -10 }, { x: -6, z: 12.3 }],
  start: { x: -3, z: 9.5 },
  zones: {},
  lightPools: [{ x: -15, z: -6, w: 8, d: 3, r: 0.3 }, { x: -15, z: 2, w: 8, d: 3, r: 0.3 }],
};

export const LAYOUTS: Record<string, Layout> = {
  foyer: FOYER, lecture: LECTURE, gym: GYM,
  plaza: PLAZA, b2hall: B2HALL, canteen: CANTEEN, parking: PARKING, dorm: DORM,
  deans: DEANS, assembly: ASSEMBLY, b2class: B2CLASS, dormKitchen: DORM_KITCHEN, lab317: LAB317,
};
