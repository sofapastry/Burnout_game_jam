import { Rng, hashSeed } from '../core/rng';
import type { Boons } from './boons';
import { CARDS, DRAFT_POOL, COUNTERS, USAGE_NAMES, counterFor, type CardId, type CounterId } from '../data/cards';
import { WEEKS, weekById } from '../data/weeks';
import { randomKirillLook, type KirillLook } from '../hero/look';
import { newKirillState, type KirillState } from '../hero/kirill';
import balance from '../data/balance.json';
import { localize, t } from '../i18n';
import { RU_YEARS } from '../data/ru';
import type { ModeId } from '../arcade/common';
import { CAMPAIGN_WEEKS } from '../story/campaign';

/** Mini-games between weeks of the default semester: after week N comes this one. */
/** (the PE norm race isn't here: it is how the PE week itself ends) */
export const INTERLUDES: Record<number, ModeId> = { 1: 'run', 8: 'dungeon', 10: 'fight', 13: 'drone' };
const LONG_CYCLE: ModeId[] = ['run', 'drone', 'race', 'dungeon', 'fight'];
/** Kirill's state going into the next week after a mini-game: worn out (you won) or fired up (you lost) */
export type KirillMood = 'tired' | 'fired' | null;

export interface DeckCard { id: CardId; level: number }
export interface TranscriptRow { slot: number; weekId: number; title: string; holiday: boolean; debt?: boolean; grade?: number; progress?: number }
export interface WeekResult { debt: boolean; progress: number; chaosLeft: number; usage: Record<string, number>; cause: string; maxCombo?: number }

const SAVE_KEY = 'burnout.save.v1';
export interface Save { stamps: number; year: number; semesters: number; burnouts: number; perks?: string[] }

/** Dean's Office: permanent perks bought with stamps */
export const PERKS: { id: string; icon: string; cost: number }[] = [
  { id: 'reroll', icon: '🎲', cost: 8 },
  { id: 'coffee', icon: '☕', cost: 12 },
  { id: 'tired', icon: '⏰', cost: 15 },
  { id: 'slot', icon: '🎒', cost: 20 },
];

/** Quick game: three weeks and a mini-game, about six minutes */
export const QUICK_SEMESTER = [1, 3, 11];

export function loadSave(): Save {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) ?? '');
    if (s && typeof s.stamps === 'number') return s;
  } catch { /* first run or blocked storage */ }
  return { stamps: 0, year: 1, semesters: 0, burnouts: 0 };
}
export function writeSave(s: Save) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
}

export const YEARS = localize(['1st year', '2nd year', '3rd year', '4th year', "Master's", 'PhD', 'POSTDOC'], RU_YEARS);

/** The default semester: six hand-picked weeks, each with its own verb, three of them ending in a boss duel. */
export const SHORT_SEMESTER = [1, 3, 8, 10, 11, 13, 15];

export class Semester {
  rng: Rng;
  /** weekId for each slot */
  order: number[];
  slot = 0;
  debts = 0;
  debtLimit: number;
  stress = 0;
  deck: DeckCard[] = [];
  loadout: CardId[] = [];
  kirill: KirillState = newKirillState();
  look: KirillLook;
  transcript: TranscriptRow[] = [];
  artemHelped = false;
  /** the story's horde upgrades (picked at the start and after each chapter) */
  boons: Boons = {};
  breaks = 0;
  lastUsage: Record<string, number> = {};
  chaosCarry: number = balance.chaos.start;
  draftOffer: CardId[] = [];
  lastStudy: { usage: string; counter: CounterId } | null = null;
  finalSlot = 0;
  mood: KirillMood = null;
  interludes: { mode: ModeId; win: boolean | null }[] = [];

  perks: string[];
  quick: boolean;
  /** 'boss': each week is a boss fight in third person (default); 'classic': the horde weeks */
  style: 'story' | 'boss' | 'classic';
  /** one free draft reroll per break (perk) */
  freeReroll = false;

  constructor(public seed: string, public year: number, public long = false, opts: { perks?: string[]; quick?: boolean; style?: 'story' | 'boss' | 'classic' } = {}) {
    this.rng = new Rng(hashSeed(seed + '|' + year));
    this.perks = opts.perks ?? [];
    this.style = opts.style ?? 'boss';
    this.quick = !!opts.quick && !long;
    if (this.style === 'story') {
      // the campaign: six chapters, three debts and he's out
      this.order = [...CAMPAIGN_WEEKS];
      this.debtLimit = 3;
    } else if (this.quick) {
      this.order = [...QUICK_SEMESTER];
      this.debtLimit = 2;
    } else if (long) {
      // the full 15: fixed weeks 1, 6, 15; the other twelve shuffled by the seed (GDD §8)
      const rest = this.rng.shuffle(WEEKS.map((w) => w.id).filter((id) => ![1, 6, 15].includes(id)));
      this.order = [];
      for (let s = 1; s <= 15; s++) this.order.push(s === 1 ? 1 : s === 6 ? 6 : s === 15 ? 15 : rest.shift()!);
      this.debtLimit = balance.debts.fullSemesterLimit;
    } else {
      this.order = [...SHORT_SEMESTER];
      this.debtLimit = balance.debts.curatedLimit;
    }
    this.look = randomKirillLook(this.rng.fork('look'));
    this.deck = (Object.values(CARDS).filter((c) => c.start).map((c) => ({ id: c.id, level: 1 })));
    this.loadout = this.deck.map((d) => d.id).slice(0, this.loadoutSlots);
    if (this.perks.includes('tired')) this.mood = 'tired';
  }

  /** the calendar week (Week 8 = Parking), used for titles and Kirill's weekly scaling */
  get weekNum() { return this.order[Math.min(this.slot, this.order.length - 1)]; }
  get done() { return this.slot >= this.order.length; }
  get yearName() { return YEARS[Math.min(this.year - 1, YEARS.length - 1)]; }

  /** Holidays from the current slot up to (not including) the next built week. */
  takeHolidays(): number[] {
    const out: number[] = [];
    while (this.slot < this.order.length && !weekById(this.order[this.slot]).built) {
      const id = this.order[this.slot];
      out.push(id);
      this.transcript.push({ slot: this.slot + 1, weekId: id, title: weekById(id).title, holiday: true });
      this.stress += balance.stress.holiday;
      this.slot++;
    }
    return out;
  }

  level(id: CardId) { return this.deck.find((d) => d.id === id)?.level ?? 1; }

  stressFor(r: WeekResult) {
    const S = balance.stress;
    return S.base + Math.min(10, Math.floor(r.progress * 10) * S.perMeter10pct) + (r.debt ? S.perDebt : 0) + Math.floor(r.chaosLeft * S.perUnspentChaos)
      + Math.floor((r.maxCombo ?? 0) / balance.combo.stressPer);
  }

  applyWeek(r: WeekResult) {
    const id = this.order[this.slot];
    const earned = this.stressFor(r);
    this.stress += earned;
    if (r.debt) this.debts++;
    // grade on the 5-point scale: debt = 2; otherwise how badly you rattled him
    const grade = r.debt ? 2 : r.progress > 0.66 ? 3 : r.progress > 0.33 ? 4 : 5;
    this.transcript.push({ slot: this.slot + 1, weekId: id, title: weekById(id).title, holiday: false, debt: r.debt, grade, progress: r.progress });
    this.lastUsage = r.usage;
    this.mood = null;
    this.chaosCarry = Math.max(balance.chaos.carryOver[0], Math.min(balance.chaos.carryOver[1], r.chaosLeft));
    this.slot++;
    this.finalSlot = this.slot;
    return earned;
  }

  /** the mini-game after the week that just ended, if any */
  interludeNext(): ModeId | null {
    if (this.slot <= 0 || this.slot >= this.order.length || this.style === 'story') return null;
    if (!this.long) return INTERLUDES[this.order[this.slot - 1]] ?? null;
    return this.slot % 3 === 2 ? LONG_CYCLE[Math.floor(this.slot / 3) % LONG_CYCLE.length] : null;
  }

  /** win: Kirill goes into the next week worn out, you get stress; loss: he's fired up */
  applyInterlude(mode: ModeId, win: boolean | null) {
    this.interludes.push({ mode, win });
    if (win === null) return 0;
    const I = balance.interlude;
    this.mood = win ? 'tired' : 'fired';
    const s = win ? I.winStress : I.loseStress;
    this.stress += s;
    return s;
  }

  get loadoutSlots() { return balance.break.loadoutSlots + (this.perks.includes('slot') ? 1 : 0); }
  /** chaos at the start of each week (perk: +15) */
  get chaosStart() { return Math.min(balance.chaos.max, this.chaosCarry + (this.perks.includes('coffee') ? 15 : 0)); }

  get expelled() { return this.debts >= this.debtLimit; }

  /** Kirill studies what you used most and buys its counter (GDD §11). From Break 2. */
  kirillStudies() {
    this.lastStudy = null;
    const sorted = Object.entries(this.lastUsage).sort((a, b) => b[1] - a[1]);
    for (const [usage, n] of sorted) {
      if (n <= 0) continue;
      const c = counterFor(usage);
      if (c && !this.kirill.counters.includes(c)) {
        this.kirill.counters.push(c);
        this.lastStudy = { usage, counter: c };
        return this.lastStudy;
      }
    }
    return null;
  }

  studyText() {
    if (!this.lastStudy) return null;
    const c = COUNTERS[this.lastStudy.counter];
    return { line: t('nb.study', { usage: USAGE_NAMES[this.lastStudy.usage], name: c.name }), name: c.name, desc: c.desc };
  }

  rollDraft() {
    const owned = new Set(this.deck.map((d) => d.id));
    const fresh = this.rng.shuffle(DRAFT_POOL.filter((id) => !owned.has(id)));
    const upgrades = this.rng.shuffle(DRAFT_POOL.filter((id) => owned.has(id) && this.level(id) < 3));
    this.draftOffer = [...fresh, ...upgrades].slice(0, 3);
  }

  draft(id: CardId) {
    const have = this.deck.find((d) => d.id === id);
    if (have) have.level = Math.min(3, have.level + 1);
    else {
      this.deck.push({ id, level: 1 });
      if (this.loadout.length < this.loadoutSlots) this.loadout.push(id);
    }
    this.draftOffer = [];
  }

  upgradeCost(id: CardId) {
    const l = this.level(id);
    return l === 1 ? balance.break.upgradeL2 : l === 2 ? balance.break.upgradeL3 : Infinity;
  }

  upgrade(id: CardId) {
    const cost = this.upgradeCost(id);
    const d = this.deck.find((x) => x.id === id);
    if (!d || this.stress < cost) return false;
    this.stress -= cost;
    d.level++;
    return true;
  }

  stamps(win: boolean) {
    const S = balance.stamps;
    const base = win ? S.burnoutBase + S.perWeekLeft * (this.order.length - this.finalSlot) * (this.long ? 1 : 2) : S.graduatedBase + S.perDebt * this.debts;
    return Math.round(base * (1 + S.perYear * (this.year - 1)));
  }
}
