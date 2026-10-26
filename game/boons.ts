// Story upgrades: pick 1 of 3 before each chapter, they stack.

export type BoonId = 'spawn' | 'dmg' | 'atkSpeed' | 'level' | 'hp' | 'horde' | 'soul' | 'dull' | 'boss';

export const BOONS: { id: BoonId; icon: string; max: number }[] = [
  { id: 'spawn', icon: 'alarm', max: 4 },
  { id: 'dmg', icon: 'sword', max: 5 },
  { id: 'atkSpeed', icon: 'bolt', max: 4 },
  { id: 'level', icon: 'star', max: 2 },
  { id: 'hp', icon: 'shield', max: 4 },
  { id: 'horde', icon: 'people', max: 3 },
  { id: 'soul', icon: 'sparkle', max: 2 },
  { id: 'dull', icon: 'eye', max: 3 },
  { id: 'boss', icon: 'crown', max: 4 },
];

export type Boons = Partial<Record<BoonId, number>>;

/** what the stacks mean, in one place */
export const boon = {
  spawnEvery: (b: Boons) => Math.pow(0.8, b.spawn ?? 0),
  unitDmg: (b: Boons) => 1 + 0.25 * (b.dmg ?? 0),
  swingCd: (b: Boons) => Math.pow(0.82, b.atkSpeed ?? 0),
  levelUp: (b: Boons) => b.level ?? 0,
  unitHp: (b: Boons) => 1 + 0.4 * (b.hp ?? 0),
  extraBodies: (b: Boons) => 2 * (b.horde ?? 0),
  jumpCd: (b: Boons) => Math.pow(0.5, b.soul ?? 0),
  ambush: (b: Boons) => 2 + (b.soul ?? 0),
  kirillFire: (b: Boons) => Math.pow(0.85, b.dull ?? 0),
  bossMight: (b: Boons) => 1 + 0.15 * (b.boss ?? 0),
};

/** three different boons that aren't maxed out */
export function offer(b: Boons, rnd: () => number) {
  const pool = BOONS.filter((x) => (b[x.id] ?? 0) < x.max);
  const out: typeof BOONS = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out;
}
