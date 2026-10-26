import type { CardId } from './cards';
import { localize } from '../i18n';
import { RU_SKILLS, RU_WEEKS } from './ru';

// The semester (GDD §8). Every week is data; its behaviour lives in game/rules.ts.

export type HeroMode = 'lost' | 'seated' | 'wander' | 'seek' | 'goal' | 'sneak' | 'desk';
export type SkillId =
  | 'wrongDoor' | 'lectureDrone' | 'ninasWhistle' | 'windGust' | 'annualFee' | 'extraVariant' | 'outOfCutlets'
  | 'barrier' | 'powerCut' | 'kettleBoils' | 'encore' | 'rollCall' | 'chimes' | 'retake' | 'everythingAtOnce';

export interface WeekDef {
  id: number;
  title: string;
  location: string;
  locationName: string;
  heroMode: HeroMode;
  meter: { label: string; color: string; icon: string };
  cards: [CardId | null, CardId | null, CardId | null];
  skill?: SkillId;
  artem: boolean;
  waiting: string;
  built: boolean;
}

const SKILLS_EN: Record<SkillId, { name: string; desc: string }> = {
  wrongDoor: { name: 'Wrong Door', desc: "Teleports Kirill to the other building's hall." },
  lectureDrone: { name: 'Lecture Drone', desc: "Kirill's fire rate −50% for 4 s." },
  ninasWhistle: { name: "Nina's Whistle", desc: 'Kirill runs laps on a predictable path for 4 s.' },
  windGust: { name: 'Wind Gust', desc: 'Every leaf slides toward Kirill.' },
  annualFee: { name: 'Annual Fee', desc: '−20 BYN at once. "It\'s voluntary. And mandatory."' },
  extraVariant: { name: 'Extra Variant', desc: '5 more tasks appear across the room.' },
  outOfCutlets: { name: 'Out of Cutlets', desc: 'All food disappears for 5 s.' },
  barrier: { name: 'Barrier', desc: 'The gate closes for 4 s.' },
  powerCut: { name: 'Power Cut', desc: 'The floor goes dark for 5 s; the laptop drains twice as fast.' },
  kettleBoils: { name: 'The Kettle Boils', desc: "Every secretary turns toward Kirill's area." },
  encore: { name: 'Encore!', desc: 'All doors lock for 5 s.' },
  rollCall: { name: 'Roll Call', desc: 'Every «Н» on the map rushes Kirill.' },
  chimes: { name: 'The Chimes', desc: 'Kirill dances for 3 s no matter what.' },
  retake: { name: 'Retake', desc: 'The last 5 credits Kirill passed come back.' },
  everythingAtOnce: { name: 'Everything at Once', desc: 'Lecture Drone + Email + Fire Alarm together.' },
};
export const SKILLS = localize(SKILLS_EN, RU_SKILLS);

const sanity = { label: 'Sanity', color: '#e8574a', icon: '🧠' };
const main = 'Main lecture hall';

const WEEKS_EN: WeekDef[] = [
  { id: 1, title: 'Foyer: "Where\'s room 312?"', location: 'foyer', locationName: 'Main hall + Building 2 hall', heroMode: 'lost', meter: sanity, cards: ['guard', 'partner', null], skill: 'wrongDoor', artem: false, waiting: 'A lost freshman is waiting.', built: true },
  { id: 2, title: 'Buried in Drawings', location: 'lecture', locationName: main, heroMode: 'seated', meter: { label: 'Paper pile', color: '#e8c547', icon: '📄' }, cards: ['drawing', 'gost', 'masha'], skill: 'lectureDrone', artem: true, waiting: 'Pasha is in the back row.', built: true },
  { id: 3, title: 'PE: Dodgeball', location: 'gym', locationName: 'Sports complex gym', heroMode: 'wander', meter: sanity, cards: ['volley', 'medBall', null], skill: 'ninasWhistle', artem: true, waiting: 'Nina is waiting.', built: true },
  { id: 4, title: 'Campus Cleanup: Leaves', location: 'plaza', locationName: 'Main building plaza', heroMode: 'wander', meter: { label: 'Buried', color: '#d9a63a', icon: '🍂' }, cards: ['leafPile', 'maple', 'romchik'], skill: 'windGust', artem: true, waiting: 'Romchik is jumping in the piles.', built: true },
  { id: 5, title: 'Trade Union Fees', location: 'b2hall', locationName: 'Building 2 hall', heroMode: 'wander', meter: { label: 'Wallet', color: '#6fd08a', icon: '💸' }, cards: ['envelope', 'receipt', 'masha'], skill: 'annualFee', artem: true, waiting: 'Masha is collecting signatures.', built: true },
  { id: 6, title: 'Attestation', location: 'lecture', locationName: main, heroMode: 'seek', meter: { label: 'Unsolved tasks', color: '#e8c547', icon: '📋' }, cards: ['task', 'starTask', 'sonya'], skill: 'extraVariant', artem: true, waiting: 'Midterms. The tasks are running.', built: true },
  { id: 7, title: 'Canteen «Зодчие»: Out of Food', location: 'canteen', locationName: 'Canteen «Зодчие»', heroMode: 'seek', meter: { label: 'Hunger', color: '#e8843a', icon: '🍽️' }, cards: ['queue', 'senior', 'sonya'], skill: 'outOfCutlets', artem: true, waiting: 'Sonya is holding court by the counter.', built: true },
  { id: 8, title: 'Parking: Traffic Jam', location: 'parking', locationName: 'Parking lot', heroMode: 'goal', meter: { label: 'Clock', color: '#6fb7e8', icon: '⏰' }, cards: ['car', 'towTruck', 'romchik'], skill: 'barrier', artem: true, waiting: 'First class at 8:00.', built: true },
  { id: 9, title: 'Dorm Blackout', location: 'dorm', locationName: 'Dorm rooms + corridor', heroMode: 'desk', meter: { label: 'Lab done', color: '#23c4b8', icon: '💻' }, cards: ['fuse', 'roach', 'romchik'], skill: 'powerCut', artem: true, waiting: 'The lab is due at midnight.', built: true },
  { id: 10, title: "Dean's Office: Tea Ceremony", location: 'deans', locationName: "Dean's office", heroMode: 'sneak', meter: { label: 'Suspicion', color: '#e8573a', icon: '👁️' }, cards: ['secretary', 'teacup', 'masha'], skill: 'kettleBoils', artem: false, waiting: "It's lunch. Don't get seen.", built: true },
  { id: 11, title: 'Assembly Hall: Endless Event', location: 'assembly', locationName: 'Assembly hall', heroMode: 'goal', meter: { label: 'Clock', color: '#9a5ae8', icon: '🕙' }, cards: ['speaker', 'applause', 'sonya'], skill: 'encore', artem: true, waiting: 'Masha is hosting.', built: true },
  { id: 12, title: 'Nobody Showed Up', location: 'b2class', locationName: 'Building 2 classroom', heroMode: 'wander', meter: { label: 'Make-up hours', color: '#d8382a', icon: '📕' }, cards: ['absence', 'register', 'romchik'], skill: 'rollCall', artem: true, waiting: 'Everybody makes it up.', built: true },
  { id: 13, title: "New Year's Table", location: 'dormKitchen', locationName: 'Dorm kitchen', heroMode: 'desk', meter: { label: 'Prep', color: '#23c4b8', icon: '🥗' }, cards: ['olivier', 'tangerine', 'garland'], skill: 'chimes', artem: true, waiting: 'Romchik and Sonya are at the table.', built: true },
  { id: 14, title: 'Credit Week: It Never Ends', location: 'lab317', locationName: 'Computer Lab 317', heroMode: 'seek', meter: { label: 'Credits left', color: '#3a74c8', icon: '📘' }, cards: ['credit', 'cgCredit', 'romchik'], skill: 'retake', artem: true, waiting: 'Nobody passes computer graphics.', built: true },
  { id: 15, title: 'Exams: 200 Tests', location: 'lecture', locationName: main, heroMode: 'seek', meter: { label: 'Tests', color: '#e8573a', icon: '📝' }, cards: ['test', 'ticket', 'masha'], skill: 'everythingAtOnce', artem: true, waiting: 'THE FINAL EXAM is waiting.', built: true },
];

export const WEEKS = localize(WEEKS_EN, RU_WEEKS);

export const weekById = (id: number) => WEEKS.find((w) => w.id === id)!;
