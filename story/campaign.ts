import type { BossId } from '../boss/bosses';
import type { DuelFoe } from '../duel/duel';

// Story campaign: each chapter = cutscene, horde stage, then a fight (boss / duel / race).

export type After =
  | { kind: 'boss'; boss: BossId; partner?: BossId; map?: string }
  | { kind: 'duel'; foe: DuelFoe }
  | null;

export interface Chapter {
  id: string;
  /** the horde week (weeks.ts id) */
  week: number;
  /** the map the cutscene plays in */
  map: string;
  /** who's in the cutscene with Kirill, and the dialogue (speaker, i18n key) */
  cast: string[];
  lines: [string, string][];
  /** Kirill's reaction to close the cutscene */
  reply: string;
  /** a story beat between the horde week and the fight (the presentation, always) */
  pre?: 'show';
  after: After;
  /** a second fight after the first (the Lab: the duel, then Romchik as a boss) */
  then?: After;
}

export const CHAPTERS: Chapter[] = [
  {
    id: 'enroll', week: 1, map: 'foyer', cast: ['shady', 'artem'],
    lines: [['shady', 'ch.enroll.1'], ['artem', 'ch.enroll.2'], ['shady', 'ch.enroll.3']],
    reply: 'ch.enroll.k', after: { kind: 'boss', boss: 'shady', map: 'foyer' },
  },
  {
    id: 'track', week: 3, map: 'gym', cast: ['nina'],
    lines: [['nina', 'ch.track.1'], ['nina', 'ch.track.2']],
    reply: 'ch.track.k', after: null,
  },
  {
    id: 'class', week: 2, map: 'lecture', cast: ['pasha', 'grisha'],
    lines: [['pasha', 'ch.class.1'], ['grisha', 'ch.class.2'], ['pasha', 'ch.class.3']],
    reply: 'ch.class.k', after: { kind: 'boss', boss: 'pasha', partner: 'grisha', map: 'lecture' },
  },
  {
    id: 'lab', week: 14, map: 'lab317', cast: ['romchik'],
    lines: [['romchik', 'ch.lab.1'], ['romchik', 'ch.lab.2']],
    reply: 'ch.lab.k', after: { kind: 'duel', foe: 'romchik' }, then: { kind: 'boss', boss: 'romchik', map: 'lab317' },
  },
  {
    id: 'show', week: 11, map: 'assembly', cast: ['masha', 'sonya'],
    lines: [['masha', 'ch.show.1'], ['sonya', 'ch.show.2'], ['masha', 'ch.show.3']],
    reply: 'ch.show.k', pre: 'show', after: { kind: 'boss', boss: 'sonya', partner: 'masha', map: 'assembly' },
  },
  {
    id: 'final', week: 15, map: 'lecture', cast: ['artem'],
    lines: [['artem', 'ch.final.1'], ['artem', 'ch.final.2']],
    reply: 'ch.final.k', after: { kind: 'boss', boss: 'finalExam' },
  },
];

export const CAMPAIGN_WEEKS = CHAPTERS.map((c) => c.week);
