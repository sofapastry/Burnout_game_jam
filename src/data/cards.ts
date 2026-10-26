// Card pool (GDD §6) and Kirill's counter-picks (§11).
import { localize } from '../i18n';
import { RU_CARDS, RU_COUNTERS, RU_USAGE, RU_UPGRADES } from './ru';

export type CardId =
  | 'popQuiz' | 'deadline' | 'pasha' | 'partner' | 'guard' | 'medBall' | 'ticket'
  | 'sonya' | 'romchik' | 'masha'
  | 'drawing' | 'gost' | 'volley'
  | 'leafPile' | 'maple' | 'envelope' | 'receipt' | 'task' | 'starTask' | 'queue' | 'senior'
  | 'car' | 'towTruck' | 'fuse' | 'roach' | 'secretary' | 'teacup' | 'speaker' | 'applause'
  | 'absence' | 'register' | 'olivier' | 'tangerine' | 'garland' | 'credit' | 'cgCredit' | 'test';

const week = (id: CardId, name: string, icon: string, cost: number, desc: string): CardDef =>
  ({ id, name, icon, cost, deck: false, desc, levels: ['', '', ''] });

export interface CardDef {
  id: CardId;
  name: string;
  icon: string;
  cost: number;
  /** in the draftable deck pool (vs. week-only units) */
  deck: boolean;
  start?: boolean;
  guest?: boolean;
  desc: string;
  levels: [string, string, string];
}

const CARDS_EN: Record<CardId, CardDef> = {
  popQuiz: {
    id: 'popQuiz', name: 'Pop Quiz', icon: '📝', cost: 1, deck: true, start: true,
    desc: 'Fast, fragile swarm unit.',
    levels: ['Fast, fragile swarm unit', '+50% speed', 'Splits into 2 mini quizzes when killed'],
  },
  deadline: {
    id: 'deadline', name: 'Deadline', icon: '⏰', cost: 3, deck: true, start: true,
    desc: 'Alarm clock (23:59) that sprints in and explodes.',
    levels: ['Sprints and explodes', '+50% blast radius', 'Leaves a panic zone: no shooting inside for 2 s'],
  },
  pasha: {
    id: 'pasha', name: 'Pasha', icon: '🎤', cost: 5, deck: false, start: false, guest: true, // boss only
    desc: 'Drops a beat every 3 s; Kirill nods along. Distracts the class.',
    levels: ['Beat ring every 3 s', 'Beat every 2 s', 'Kirill dances 1.5 s instead of 1 s'],
  },
  partner: {
    id: 'partner', name: 'Group Project Partner', icon: '🫠', cost: 4, deck: true, start: true,
    desc: 'Sticks to Kirill and slows him 40%.',
    levels: ['Sticks, slows 40%', 'Slow 60%', 'When killed, steals 3 grade points'],
  },
  guard: {
    id: 'guard', name: 'Security Guard', icon: '💂', cost: 3, deck: true,
    desc: '"Student ID, please!" Stationary; stops Kirill for 2 s.',
    levels: ['Stops Kirill 2 s', 'Stops for 3 s', 'Calls a second guard'],
  },
  medBall: {
    id: 'medBall', name: 'Medicine Ball', icon: '🏐', cost: 3, deck: true,
    desc: 'Slow roll, heavy knockback.',
    levels: ['Slow roll, heavy knockback', 'Knockback ×2', 'Bounces twice'],
  },
  ticket: {
    id: 'ticket', name: 'Exam Ticket', icon: '🎫', cost: 2, deck: true,
    desc: 'Instant random effect: stun, sanity hit or +6 Chaos.',
    levels: ['Random effect', 'Always the best effect', 'Two effects'],
  },
  drawing: {
    id: 'drawing', name: 'A1 Drawing', icon: '📐', cost: 2, deck: false,
    desc: 'Slides over desks; 3 hits to finish. Adds to the pile.',
    levels: ['', '', ''],
  },
  gost: {
    id: 'gost', name: 'GOST Inspector', icon: '🧐', cost: 4, deck: false,
    desc: '"The frame doesn\'t meet the standard." Drawings nearby need +1 hit.',
    levels: ['', '', ''],
  },
  volley: {
    id: 'volley', name: 'Volleyball', icon: '🏐', cost: 1, deck: false,
    desc: 'Bounces off walls 3 times. Can\'t be shot.',
    levels: ['', '', ''],
  },
  // guests unlocked in the Dean's Office; until then they're each week's featured guest (key 6)
  sonya: {
    id: 'sonya', name: 'Sonya', icon: '🌟', cost: 4, deck: false, guest: true,
    desc: 'Star power pulls Kirill in; her fan club blocks the paths.',
    levels: ['Pulls Kirill; fans block paths', 'Pull radius +50%', 'Fans also slow Kirill 30%'],
  },
  romchik: {
    id: 'romchik', name: 'Romchik', icon: '🤪', cost: 6, deck: false, guest: true,
    desc: 'Hyperactive; grabs Kirill and drags him to a party for 2 s.',
    levels: ['Grabs and drags for 2 s', 'Grab 3 s', 'Drags him into your units'],
  },
  masha: {
    id: 'masha', name: 'Masha', icon: '💅', cost: 5, deck: false, guest: true,
    desc: 'Gossip aura: no Sanity regen near her.',
    levels: ['No regen near her', 'Aura also −20% fire rate', "Artem won't come while she's here"],
  },
  leafPile: week('leafPile', 'Leaf Pile', '🍂', 1, 'Shuffles toward Kirill spreading leaves; bursts when raked.'),
  maple: week('maple', 'Maple Tree', '🍁', 4, 'Keeps dropping leaves around it.'),
  envelope: week('envelope', 'Fee Envelope', '✉️', 2, 'Sticks to Kirill and drains 2 BYN/s.'),
  receipt: week('receipt', 'Receipt', '🧾', 1, 'Fast and cheap; every touch costs money.'),
  task: week('task', 'Task', '❓', 1, 'Runs from Kirill. Unsolved at the bell = trouble.'),
  starTask: week('starTask', 'Starred Task', '⭐', 3, 'Splits into 2 tasks when solved.'),
  queue: week('queue', 'Queue', '🧍', 2, 'A line of students blocking a path for 12 s.'),
  senior: week('senior', 'Hungry Senior', '🍔', 3, 'Beats Kirill to the food and eats it.'),
  car: week('car', 'Car', '🚗', 2, 'Parks for the week and blocks the way. One route must stay open.'),
  towTruck: week('towTruck', 'Tow Truck', '🚛', 5, 'Drags Kirill back toward his car.'),
  fuse: week('fuse', 'Fuse', '⚡', 3, 'Kills the sockets around it.'),
  roach: week('roach', 'Cockroach', '🪳', 1, 'A swarm of three, fast in the dark.'),
  secretary: week('secretary', 'Secretary', '👩‍💼', 3, 'Behind the glass; a rotating vision cone.'),
  teacup: week('teacup', 'Teacup', '🍵', 1, 'Clinks if Kirill brushes past: every secretary turns.'),
  speaker: week('speaker', 'Guest Speaker', '🎙️', 3, 'Every speech adds 15 minutes.'),
  applause: week('applause', 'Applause Wave', '👏', 2, 'Pushes Kirill back toward the seats.'),
  absence: week('absence', 'Absence Mark «Н»', '🅷', 1, '+1 make-up hour per hit.'),
  register: week('register', 'Attendance Register', '📕', 4, 'A turret that fires «Н» marks.'),
  olivier: week('olivier', 'Olivier Salad', '🥗', 2, "Strong pull: he can't resist it."),
  tangerine: week('tangerine', 'Tangerines', '🍊', 1, 'Weak pull, but there are three.'),
  garland: week('garland', 'Garland', '🎄', 3, 'A zone where Kirill dances.'),
  credit: week('credit', 'Credit', '📘', 2, 'Splits into 2 when passed, like a hydra.'),
  cgCredit: week('cgCredit', 'CG Credit', '🫖', 6, "Can't be passed, only stunned — unless Shady is here."),
  test: week('test', 'Test', '📝', 1, '+10 tests on the counter.'),
};

export const CARDS = localize(CARDS_EN, RU_CARDS);

export const DRAFT_POOL: CardId[] = ['partner', 'guard', 'medBall', 'ticket', 'popQuiz', 'deadline'];

export type CounterId =
  | 'headphones' | 'laptopShield' | 'justSaysNo' | 'lanyard' | 'gymMembership' | 'earplugs' | 'luckyPen' | 'inboxZero' | 'knowsExits'
  | 'alreadySelfie' | 'noParties' | 'thickSkin';

const COUNTERS_EN: Record<CounterId, { name: string; vs: string; desc: string }> = {
  headphones: { name: 'Noise-Cancelling Headphones', vs: 'popQuiz', desc: 'Damage aura, radius 1.5' },
  laptopShield: { name: 'Laptop Shield', vs: 'deadline', desc: 'Blocks one explosion every 8 s' },
  justSaysNo: { name: '"Just Says No"', vs: 'partner', desc: "Can't be stuck to for 5 s after shaking one off" },
  lanyard: { name: 'Student ID on a Lanyard', vs: 'guard', desc: 'Guard stops −50%' },
  gymMembership: { name: 'Gym Membership', vs: 'medBall', desc: 'Knockback −50%' },
  earplugs: { name: 'Earplugs', vs: 'pasha', desc: 'Beat effects −50%' },
  luckyPen: { name: 'Lucky Pen', vs: 'ticket', desc: 'Bad ticket effects −50%' },
  inboxZero: { name: 'Inbox Zero', vs: 'email', desc: 'Email stuns −30%' },
  knowsExits: { name: 'Knows the Exits', vs: 'fireAlarm', desc: 'Fire Alarm panic −1 s' },
  alreadySelfie: { name: 'Already Has Her Selfie', vs: 'sonya', desc: 'Sonya pull −50%' },
  noParties: { name: 'Says No to Parties', vs: 'romchik', desc: 'Romchik grab −1 s' },
  thickSkin: { name: 'Thick Skin', vs: 'masha', desc: 'Gossip has no effect' },
};

export const COUNTERS = localize(COUNTERS_EN, RU_COUNTERS);

const USAGE_EN: Record<string, string> = {
  popQuiz: 'Pop Quizzes', deadline: 'Deadlines', pasha: 'Pasha', partner: 'Group Project Partners', guard: 'Security Guards',
  medBall: 'Medicine Balls', ticket: 'Exam Tickets', email: 'Emails from the Professor', fireAlarm: 'Fire Alarms',
  sonya: 'Sonya', romchik: 'Romchik', masha: 'Masha',
};

export const USAGE_NAMES = localize(USAGE_EN, RU_USAGE);

export function counterFor(usage: string): CounterId | null {
  for (const [id, c] of Object.entries(COUNTERS)) if (c.vs === usage) return id as CounterId;
  return null;
}

/** Kirill's in-week level-up upgrades (GDD §5). */
const HERO_UPGRADES_EN = {
  espresso: { name: 'Triple Espresso', desc: 'Speed ×1.1', max: 5 },
  laserPlus: { name: 'Highlighter Laser+', desc: 'Fire interval ×0.85', max: 5 },
  mugs: { name: 'Orbiting Coffee Mugs', desc: '+1 orbiting mug', max: 4 },
  powerNap: { name: 'Power Nap', desc: 'Regen +0.5/s', max: 5 },
  groupChat: { name: 'Group Chat', desc: 'Pickup radius +1', max: 4 },
  longBeam: { name: 'Long Highlighter', desc: 'Beam range +1', max: 3 },
} as const;
export const HERO_UPGRADES = localize(HERO_UPGRADES_EN, RU_UPGRADES);
export type HeroUpgradeId = keyof typeof HERO_UPGRADES;
