import type { CardId } from '../data/cards';

// "You are the Boss": who you play in each week's arena, and their signature moves.

export type BossId = 'nina' | 'romchik' | 'masha' | 'sonya' | 'shady' | 'grisha' | 'artem' | 'pasha' | 'finalExam';
export type MoveId =
  | 'whistle' | 'ballStorm' | 'danceShock' | 'partyGrab' | 'flash' | 'gossip' | 'selfie' | 'laser'
  | 'codeBolt' | 'glitch' | 'yawn' | 'slam' | 'shield' | 'heal' | 'bassDrop' | 'lecture';

export interface BossDef { moves: [MoveId, MoveId]; hp: number; speed: number; power: number; color: number }

export const BOSSES: Record<BossId, BossDef> = {
  nina: { moves: ['whistle', 'ballStorm'], hp: 300, speed: 5.0, power: 1.0, color: 0xc8312a },
  romchik: { moves: ['danceShock', 'partyGrab'], hp: 320, speed: 4.8, power: 1.05, color: 0xe0b860 },
  masha: { moves: ['flash', 'gossip'], hp: 280, speed: 4.9, power: 0.95, color: 0x8a5a35 },
  sonya: { moves: ['selfie', 'laser'], hp: 280, speed: 4.9, power: 1.0, color: 0xe0b870 },
  shady: { moves: ['codeBolt', 'glitch'], hp: 270, speed: 5.1, power: 1.0, color: 0x23c4b8 },
  grisha: { moves: ['yawn', 'slam'], hp: 360, speed: 4.2, power: 1.15, color: 0x9a6a3a },
  artem: { moves: ['shield', 'heal'], hp: 320, speed: 4.7, power: 0.95, color: 0x6b4630 },
  pasha: { moves: ['bassDrop', 'lecture'], hp: 380, speed: 4.6, power: 1.1, color: 0x1d1a1a },
  finalExam: { moves: ['ballStorm', 'slam'], hp: 460, speed: 4.4, power: 1.2, color: 0xf6f3ea },
};

/** the boss of each week's arena (the story's weeks and the rest of the calendar) */
export const WEEK_BOSS: Record<number, BossId> = {
  1: 'shady', 2: 'pasha', 3: 'nina', 4: 'romchik', 5: 'masha', 6: 'artem', 7: 'sonya', 8: 'grisha',
  9: 'grisha', 10: 'artem', 11: 'sonya', 12: 'masha', 13: 'romchik', 14: 'shady', 15: 'finalExam',
};

/** seconds between uses */
export const MOVE_CD: Record<MoveId, number> = {
  whistle: 9, ballStorm: 7, danceShock: 8, partyGrab: 10, flash: 8, gossip: 12, selfie: 9, laser: 8,
  codeBolt: 6, glitch: 9, yawn: 11, slam: 8, shield: 14, heal: 22, bassDrop: 9, lecture: 14,
};

export const MOVE_ICON: Record<MoveId, string> = {
  whistle: '🔔', ballStorm: '🏐', danceShock: '🪩', partyGrab: '🤪', flash: '📸', gossip: '🗣️', selfie: '🤳', laser: '🔴',
  codeBolt: '💻', glitch: '👾', yawn: '🥱', slam: '💥', shield: '🛡️', heal: '💊', bassDrop: '🔊', lecture: '😴',
};

/** what each deck card summons in the arena; costs are paid in chaos */
export type SummonKind = 'swarm' | 'bomb' | 'stick' | 'hold' | 'ball' | 'aura' | 'heavy' | 'guest' | 'random';
export const SUMMON: Partial<Record<CardId, { kind: SummonKind; unit: string; cost: number }>> = {
  popQuiz: { kind: 'swarm', unit: 'quiz', cost: 4 },
  deadline: { kind: 'bomb', unit: 'deadline', cost: 8 },
  partner: { kind: 'stick', unit: 'partner', cost: 9 },
  guard: { kind: 'hold', unit: 'guard', cost: 8 },
  medBall: { kind: 'ball', unit: 'medBall', cost: 6 },
  volley: { kind: 'ball', unit: 'medBall', cost: 4 },
  pasha: { kind: 'aura', unit: 'speaker', cost: 12 },
  ticket: { kind: 'random', unit: 'ticket', cost: 5 },
  drawing: { kind: 'swarm', unit: 'drawing', cost: 5 },
  gost: { kind: 'heavy', unit: 'gost', cost: 9 },
  sonya: { kind: 'guest', unit: 'sonya', cost: 12 },
  romchik: { kind: 'guest', unit: 'romchik', cost: 14 },
  masha: { kind: 'guest', unit: 'masha', cost: 12 },
};

export const DEFAULT_SUMMONS: CardId[] = ['popQuiz', 'deadline', 'medBall'];
