// Speech bubbles, joke cards and endings (EN here, RU in ru.ts).
import { localize } from '../i18n';
import { RU_LINES, RU_HOLIDAYS, RU_BURNOUT_ENDINGS, RU_GRADUATED } from './ru';

const LINES_EN = {
  kirillStart: ['This is fine.', "I'll just do it the night before.", 'Is attendance mandatory?', 'Okay. Focus.'],
  kirillLost: ['Where is room 312?', 'Is this Building 2?', 'Excuse me, where is…', 'I swear this hall moved.'],
  kirillHurt: ['Wait, that was due TODAY?', 'Ow!', 'Not now!', 'I studied for this!', 'That\'s not on the syllabus!'],
  kirillLevel: ['I am SPEED.', 'Level up!', "Let's go!", 'Getting the hang of it.'],
  kirillPanic: ['FIRE?!', 'Which exit?!', 'My notes!'],
  kirillStun: ['Quick question?', '…', 'Huh?'],
  kirillDance: ['…okay this slaps.', '*nods*', 'Banger.'],
  kirillDebt: ['Retake? Again?', 'This is NOT fine.', 'I need a nap.'],
  kirillPass: ['Passed!', 'Easy.', "Next week can't be worse."],
  kirillTeleport: ['This is Building 2.', 'How did I get here?'],
  kirillLaps: ['Another lap?!', 'My lungs…'],
  kirillDrone: ['zzz…', 'So… sleepy…'],
  guard: ['Student ID, please!', 'Where do you think you\'re going?'],
  nina: ["A doctor's note doesn't count!", 'Another lap!', 'Faster!'],
  pasha: ['Yo, this is my new track.', 'Rate my flow, professor.'],
  artem: ['Hang in there, bro.', "I'll share my notes."],
  gost: ["The frame doesn't meet the standard.", 'Redo it.'],
  romchik: ["Let's party!", 'Sleep is for the weak!'],
  sonya: ['Take a picture of me!', 'Romchik, over here!'],
  masha: ['Did you hear about Kirill?', 'Oh, did you know…'],
  mashaHost: ['And now, one more act!', "Don't go anywhere!", 'A big hand for…'],
  shady: ["Can't you even turn a computer off?", 'For Artem, no problem.'],
  grisha: ['Why did the student cross the road? …I forgot.', '*yawns*'],
  finalExam: ['Two hundred questions. No calculators.', 'You may begin.'],
};

export const LINES = localize(LINES_EN, RU_LINES);

export const HOLIDAYS = localize([
  'Class cancelled: the lecturer is at a conference.',
  'Everyone was sent to pick potatoes.',
  'Health Day. Attendance mandatory.',
  'Subbotnik: the whole faculty is painting the curbs.',
  'The heating is off. Lectures postponed.',
  'Anniversary concert rehearsal. Everyone to the assembly hall.',
  'The dean is on vacation. Nobody knows anything.',
], RU_HOLIDAYS);

export const BURNOUT_ENDINGS = localize([
  'Kirill moved back home and now sells phone cases at the market.',
  'Kirill transferred to a culinary college. He is thriving.',
  'Kirill joined a rock band. The band is called «Отчислен».',
  'Kirill is taking a gap year. He calls it "a gap semester".',
  'Kirill applied to the army. The army sent him back with a note.',
], RU_BURNOUT_ENDINGS);

export const GRADUATED_LINES = localize(['Kirill graduated with honors. You failed.', 'Red diploma. Proud parents. You lost.'], RU_GRADUATED);

export function pickLine(list: string[]) {
  return list[Math.floor(Math.random() * list.length)];
}
