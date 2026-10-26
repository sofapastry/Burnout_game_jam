import * as THREE from 'three';
import { Rng } from '../core/rng';
import type { PersonLook, HairStyle, Glasses, Accessory, BackpackStyle } from './person';
import { lang } from '../i18n';

// Kirill is re-rolled every semester so no two runs look alike, but he always keeps
// his identity: teal hoodie, orange backpack, big glasses (GDD §5).

const hsl = (h: number, s: number, l: number) => new THREE.Color().setHSL(h, s, l).getHex();

const SKIN = [0xf6d6bf, 0xf0c6a4, 0xe8b893, 0xdca983, 0xf9dfcc, 0xd09a72];
const HAIR: [number, string][] = [
  [0x2a211d, 'black'], [0x4a3326, 'dark brown'], [0x6b4630, 'chestnut'], [0x8c5a35, 'auburn'],
  [0xc9a46a, 'sandy blond'], [0x3b3f52, 'ink-blue'], [0x7a3b2c, 'copper'], [0x56504a, 'ash'],
];
const HAIR_STYLES: [HairStyle, string][] = [
  ['spiky', 'spiky'], ['messy', 'messy'], ['bowl', 'bowl-cut'], ['curly', 'curly'],
  ['sidepart', 'side-parted'], ['swept', 'swept-back'], ['buzz', 'buzz-cut'], ['bun', 'top-knot'],
];
const GLASSES: [Glasses, string][] = [['round', 'round'], ['square', 'square'], ['thick', 'thick-rimmed'], ['aviator', 'wire']];
const GLASS_COLORS = [0x1d1a1a, 0x2a2f45, 0x7a2a2a, 0xc9a24a, 0x3a5a40];
const ACCESSORIES: [Accessory, string][] = [
  ['none', ''], ['headphones', 'headphones round his neck'], ['scarf', 'a scarf from his grandma'], ['pins', 'a hoodie full of pins'],
  ['lanyard', 'a student-ID lanyard'], ['cap', 'a backwards cap'], ['beanie', 'a beanie'],
];
const PANTS = [0x2f3d5c, 0x23252b, 0x5b6170, 0x8a7a5c, 0x3e4a3a, 0x4a6080];
const SHOES = [0xf2f0ea, 0x22252b, 0xc94a3a, 0x3c62b0, 0xe8c547, 0x6a6f78];
const PACK_STYLES: [BackpackStyle, string][] = [['classic', ''], ['roll', 'a yoga mat strapped on top'], ['patches', 'patches'], ['tablet', 'a laptop sleeve']];

export interface KirillLook extends PersonLook {
  /** what was rolled, so the description can be phrased in either language */
  parts: { hair: number; style: HairStyle; glasses: Glasses; acc: Accessory; pack: BackpackStyle };
}

// Russian: adjectives agree with «волосы» (plural); {c} is the colour.
const RU_HAIR = ['чёрные', 'тёмно-каштановые', 'каштановые', 'рыжевато-каштановые', 'песочно-светлые', 'чернильно-синие', 'медно-рыжие', 'пепельные'];
const RU_STYLE: Record<HairStyle, string> = {
  spiky: '{c} торчащие волосы', messy: '{c} растрёпанные волосы', bowl: '{c} волосы «под горшок»', curly: '{c} кудрявые волосы',
  sidepart: '{c} волосы с косым пробором', swept: '{c} зачёсанные назад волосы', buzz: '{c} волосы ёжиком', bun: '{c} волосы в пучке', long: '{c} длинные волосы',
};
const RU_GLASSES: Record<Glasses, string> = { none: '', round: 'круглые очки', square: 'квадратные очки', thick: 'очки в толстой оправе', aviator: 'очки в тонкой оправе' };
const RU_ACC: Partial<Record<Accessory, string>> = {
  headphones: 'наушники на шее', scarf: 'бабушкин шарф', pins: 'худи в значках', lanyard: 'студенческий на шнурке', cap: 'кепка козырьком назад', beanie: 'шапка-бини',
};
const RU_PACK: Partial<Record<BackpackStyle, string>> = { roll: 'коврик для йоги на рюкзаке', patches: 'нашивки на рюкзаке', tablet: 'чехол для ноутбука' };

/** "This semester's Kirill: …" in the current language. */
export function lookBlurb(look: KirillLook): string {
  const p = look.parts;
  const join = (bits: string[], and: string) => (bits.length > 1 ? `${bits.slice(0, -1).join(', ')} ${and} ${bits[bits.length - 1]}` : bits[0]);
  if (lang() === 'ru') {
    const bits = [RU_STYLE[p.style].replace('{c}', RU_HAIR[p.hair]), RU_GLASSES[p.glasses]];
    if (RU_ACC[p.acc]) bits.push(RU_ACC[p.acc]!);
    if (RU_PACK[p.pack]) bits.push(RU_PACK[p.pack]!);
    return `Кирилл этого семестра: ${join(bits, 'и')}.`;
  }
  const bits = [`${HAIR[p.hair][1]} ${HAIR_STYLES.find((h) => h[0] === p.style)![1]} hair`, `${GLASSES.find((g) => g[0] === p.glasses)![1]} glasses`];
  const acc = ACCESSORIES.find((a) => a[0] === p.acc)![1];
  if (acc) bits.push(acc);
  const pack = PACK_STYLES.find((a) => a[0] === p.pack)![1];
  if (pack) bits.push(pack);
  return `This semester's Kirill: ${join(bits, 'and')}.`;
}

export function randomKirillLook(rng: Rng): KirillLook {
  const hairIdx = rng.int(0, HAIR.length - 1);
  const hair = HAIR[hairIdx][0];
  const [hairStyle] = rng.pick(HAIR_STYLES);
  const [glasses] = rng.pick(GLASSES);
  const [accessory] = rng.chance(0.75) ? rng.pick(ACCESSORIES.slice(1)) : ACCESSORIES[0];
  const [backpackStyle] = rng.pick(PACK_STYLES);
  const teal = hsl(rng.range(0.47, 0.515), rng.range(0.45, 0.7), rng.range(0.36, 0.47));
  const orange = hsl(rng.range(0.05, 0.09), rng.range(0.75, 0.9), rng.range(0.48, 0.56));
  const accColor = accessory === 'headphones' ? rng.pick([0x22252b, 0xf2f0ea, 0xe86a8a]) : rng.pick([0xc94a3a, 0xe8c547, 0x2f3d5c, 0xf2efe6, 0x7a3b9a]);
  const height = rng.range(0.95, 1.05);
  const build = rng.range(0.94, 1.08);


  return {
    skin: rng.pick(SKIN),
    hair,
    hairStyle,
    eyes: rng.pick([0x2a1d18, 0x3a2a20, 0x24324a, 0x2f3f2a]),
    top: teal,
    topTrim: new THREE.Color(teal).offsetHSL(0, -0.1, rng.chance(0.5) ? 0.18 : -0.1).getHex(),
    topKind: 'hoodie',
    pants: rng.pick(PANTS),
    shoes: rng.pick(SHOES),
    sole: 0xf2efe6,
    backpack: orange,
    backpackStyle,
    backpackAccent: rng.pick([0x6fb7e8, 0x8a5ad8, 0x4aa36a, 0xe8c547]),
    keychain: rng.chance(0.6) ? rng.pick([0xe8c547, 0xe86a8a, 0x6fb7e8, 0x7adf8a]) : null,
    glasses,
    glassesColor: rng.pick(GLASS_COLORS),
    accessory,
    accessoryColor: accColor,
    chestPrint: rng.chance(0.5) ? rng.pick([0xf2efe6, 0xe8c547, 0x2b3f6b]) : null,
    height,
    build,
    blush: rng.chance(0.4),
    parts: { hair: hairIdx, style: hairStyle, glasses, acc: accessory, pack: backpackStyle },
  };
}

const base = (o: Partial<PersonLook>): PersonLook => ({
  skin: 0xf0c6a4, hair: 0x3a2a20, hairStyle: 'messy', eyes: 0x2a1d18,
  top: 0x555555, topTrim: 0x333333, topKind: 'hoodie', pants: 0x2f3d5c, shoes: 0x22252b, sole: 0xf2efe6,
  backpack: null, backpackStyle: 'classic', backpackAccent: 0, keychain: null,
  glasses: 'none', glassesColor: 0x222222, accessory: 'none', accessoryColor: 0x222222,
  chestPrint: null, height: 1, build: 1, blush: false, ...o,
});

/** Placeholder looks for side characters until their GLBs are dropped into public/models/. */
// Matched to the team's character sheets: most of the cast wears the black BrSTU 60th-anniversary merch.
const MERCH = 0x1f1d22, MERCH_TRIM = 0x3a3840;
export const PLACEHOLDER_LOOKS: Record<string, PersonLook> = {
  nina: base({ hair: 0x8a5a35, hairStyle: 'bun', top: 0xc8312a, topTrim: 0x2f8a3a, topKind: 'tracksuit', pants: 0x1d1d22, shoes: 0xd23a2a, accessory: 'whistle', accessoryColor: 0xd23a2a, eyes: 0x3a7a3a, height: 1.02 }),
  pasha: base({ hair: 0x1d1a1a, hairStyle: 'messy', top: MERCH, topTrim: MERCH_TRIM, topKind: 'shirt', pants: 0x23252b, shoes: 0xf2f0ea, chestPrint: 0xf2efe6 }),
  artem: base({ hair: 0x6b4630, hairStyle: 'messy', top: MERCH, topTrim: MERCH_TRIM, pants: 0x23252b, shoes: 0xf2f0ea, eyes: 0x3a5a8a, chestPrint: 0xf2efe6 }),
  shady: base({ hair: 0x1d1a1a, hairStyle: 'curly', skin: 0xb07a55, top: MERCH, topTrim: MERCH_TRIM, pants: 0x23252b, glasses: 'thick', glassesColor: 0x111111, shoes: 0xf2f0ea }),
  sonya: base({ hair: 0xe0b870, hairStyle: 'long', top: MERCH, topTrim: MERCH_TRIM, topKind: 'shirt', pants: 0x5a7aa8, blush: true, shoes: 0xf2f0ea, eyes: 0x3a6a5a }),
  romchik: base({ hair: 0xe0b860, hairStyle: 'spiky', top: MERCH, topTrim: MERCH_TRIM, topKind: 'shirt', pants: 0xd8ccb0, shoes: 0x23252b, glasses: 'thick', glassesColor: 0x0a0a0a }),
  masha: base({ hair: 0x8a5a35, hairStyle: 'long', top: MERCH, topTrim: MERCH_TRIM, topKind: 'jacket', pants: 0x23252b, blush: true, eyes: 0x5a6a3a }),
  grisha: base({ hair: 0x9a6a3a, hairStyle: 'messy', top: MERCH, topTrim: MERCH_TRIM, topKind: 'shirt', pants: 0x23252b, eyes: 0x3a6aa8 }),
  guard: base({ hair: 0x56504a, hairStyle: 'buzz', top: 0x2b3550, topTrim: 0x1d2233, topKind: 'uniform', pants: 0x1d2233, accessory: 'cap', accessoryColor: 0x1d2233 }),
  // duel-only fighters (seen as silhouettes)
  dean: base({ hair: 0x8a8a8a, hairStyle: 'buzz', top: 0x2a2f3a, topTrim: 0x8a1f24, topKind: 'jacket', pants: 0x2a2f3a, glasses: 'square', glassesColor: 0x222222, height: 1.08, build: 1.18 }),
  finalExam: base({ hair: 0xf6f3ea, hairStyle: 'spiky', top: 0xf6f3ea, topTrim: 0xd8d0b8, topKind: 'shirt', pants: 0xece6d6, height: 1.35, build: 1.45 }),
};
