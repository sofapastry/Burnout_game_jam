// Line-art icons (24x24 paths) used as inline SVG and on canvas.
// installIcons() replaces emoji in UI text with the matching icon.

type Part = [d: string, mode?: 'f'];

const FACE: Part = ['M12 3a9 9 0 1 0 .001 0z'];
const EYES: Part = ['M8 9.8a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0-2.2 0M13.8 9.8a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0-2.2 0', 'f'];

export const ICONS: Record<string, Part[]> = {
  coffee: [['M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z'], ['M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16'], ['M8.5 2.8c-1 1.2 1 2 0 3.5M12.5 2.8c-1 1.2 1 2 0 3.5'], ['M3.5 21.5h15']],
  paper: [['M6 2.5h8l4 4v15H6z'], ['M14 2.5v4h4'], ['M9 11h6M9 14h6M9 17h4']],
  camera: [['M3 8h4l2-2.5h6L17 8h4v11H3z'], ['M12 9.5a3.7 3.7 0 1 0 .001 0z'], ['M18.2 10.5h.6']],
  envelope: [['M3 6h18v12H3z'], ['M3 6l9 7 9-7']],
  hand: [['M7 12V6.5a1.5 1.5 0 0 1 3 0V11M10 11V4.5a1.5 1.5 0 0 1 3 0V11M13 11V5.5a1.5 1.5 0 0 1 3 0V12M16 12V8.5a1.5 1.5 0 0 1 3 0V14c0 4-3 7-7 7h-1c-3 0-4.5-2-6-4.5L3.5 13a1.5 1.5 0 0 1 2.5-1.5L7 13']],
  bell: [['M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z'], ['M10 20.5a2 2 0 0 0 4 0'], ['M12 3v2']],
  fire: [['M12 21.5c-4 0-6.5-2.8-6.5-6.3 0-3.2 2.2-5.2 3.5-7.7.4 1.8 1.4 2.8 2.4 3.3C12 7 13 4.5 14.8 3c.3 3 4.7 5.6 4.7 11.2 0 4-3.5 7.3-7.5 7.3z'], ['M12 21.5c-1.8 0-3-1.2-3-3 0-1.7 1.5-2.7 2.2-4 .8 1.2 3.8 2.4 3.8 4.4 0 1.5-1.3 2.6-3 2.6z', 'f']],
  smile: [FACE, EYES, ['M8.5 14.5c1.8 2 5.2 2 7 0']],
  cool: [FACE, ['M5.5 9h13l-.8 2.6a2 2 0 0 1-2 1.4h-1.4a2 2 0 0 1-2-1.6L12 10l-.3 1.4a2 2 0 0 1-2 1.6H8.3a2 2 0 0 1-2-1.4z', 'f'], ['M9 16c1.5 1 4.5 1 6 0']],
  sleepy: [FACE, ['M7.5 10.5c.8.8 2.2.8 3 0M13.5 10.5c.8.8 2.2.8 3 0'], ['M10.5 15.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0']],
  dizzy: [FACE, ['M7.5 8.5l3 3M10.5 8.5l-3 3M13.5 8.5l3 3M16.5 8.5l-3 3'], ['M8.5 16c1-1 2-1 3 0s2 1 3 0']],
  angry: [FACE, ['M7 7.8l3.2 1.5M17 7.8l-3.2 1.5'], EYES, ['M9 16.5c1.8-1.6 4.2-1.6 6 0']],
  sad: [FACE, ['M7.5 8.8l3-1M16.5 8.8l-3-1'], EYES, ['M8.5 16.5c1.8-2 5.2-2 7 0'], ['M17.2 12.5c0 1.2.8 2 .8 2.6a.8.8 0 0 1-1.6 0c0-.6.8-1.4.8-2.6z', 'f']],
  wow: [FACE, EYES, ['M12 13.5a2 2.4 0 1 0 .001 0z']],
  party: [FACE, EYES, ['M8 14c1.8 2.6 6.2 2.6 8 0z', 'f'], ['M2.5 4l1.5 1.5M21.5 3.5L20 5.5M22 9.5h-2']],
  bolt: [['M13 2L4.5 13.5H11L10 22l8.5-11.5H12z']],
  quill: [['M20 3c-6 1-10 5-12 12l-1.5 5 2-1.5c1-4 3-6.5 5-8-1.5 2.5-2.5 4.5-3 7C16 16 19 10 20 3z'], ['M4 21.5h8']],
  clock: [['M12 3.5a8.5 8.5 0 1 0 .001 0z'], ['M12 7.5V12l3 2']],
  alarm: [['M12 5a8 8 0 1 0 .001 0z'], ['M12 9v4l2.5 1.5'], ['M3.5 6L6.5 3M20.5 6L17.5 3'], ['M6.5 20l-1.5 1.5M17.5 20l1.5 1.5']],
  laptop: [['M5 5h14v10H5z'], ['M2.5 18.5h19l-1.5-3.5H4z'], ['M10 8l-2 2 2 2M14 8l2 2-2 2']],
  invader: [['M7 4l2 2h6l2-2M5 8h14v6h-2v2h-2v-2H9v2H7v-2H5zM8 18l-2 2M16 18l2 2'], ['M8.5 10h2v2h-2zM13.5 10h2v2h-2z', 'f']],
  eye: [['M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z'], ['M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0'], ['M11 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0', 'f']],
  dice: [['M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z'], ['M7.3 8.5a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0M14.3 8.5a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0M10.8 12a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0M7.3 15.5a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0M14.3 15.5a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0', 'f']],
  zzz: [['M3.5 10h5l-5 6h5M12 4h4l-4 5h4M16.5 13h4.5l-4.5 5.5H21']],
  bookmark: [['M6 3h12v18l-6-4.5L6 21z']],
  shield: [['M12 2.5l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6z'], ['M12 6.5v11M8 10.5h8']],
  target: [['M12 3a9 9 0 1 0 .001 0zM12 7.5a4.5 4.5 0 1 0 .001 0z'], ['M10.5 12a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0', 'f']],
  dot: [['M12 5a7 7 0 1 0 .001 0z', 'f']],
  runner: [['M13 3.8a2 2 0 1 0 4 0a2 2 0 1 0-4 0', 'f'], ['M8.5 21.5l3.5-6.5 3 2.5v4M12 15l1.3-5.5-4.3 1-2 3.3M13.3 9.5l2.7 3H19']],
  ball: [['M12 3a9 9 0 1 0 .001 0z'], ['M12 3c-1 4 0 8 5 11M3.5 9.5c4 0 8 1 11 5.5M7 19.5c1-4 4-7 9-8.5']],
  note: [['M9 18V5l11-2v13'], ['M4 18a2.5 2 0 1 0 5 0a2.5 2 0 1 0-5 0M15 16a2.5 2 0 1 0 5 0a2.5 2 0 1 0-5 0', 'f']],
  mic: [['M9 3h6v10a3 3 0 0 1-6 0z'], ['M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7']],
  speaker: [['M4 9h4l5-4v14l-5-4H4z'], ['M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11']],
  glove: [['M6 10c0-4 2.5-7 6.5-7S19 5.5 19 9v4c0 3-2 5-5 5H9.5C7.5 18 6 16.5 6 14.5z'], ['M8 18v3h7v-3'], ['M6 12.5c2 0 3.5-1 4-3']],
  people: [['M5.5 7.5a2.8 2.8 0 1 0 5.6 0a2.8 2.8 0 1 0-5.6 0M14 8a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0-4.6 0'], ['M2.5 20.5c0-4 2.6-6.5 5.8-6.5s5.8 2.5 5.8 6.5M14.5 13.6c3.2 0 5.8 2 5.8 5.6']],
  person: [['M9 6a3 3 0 1 0 6 0a3 3 0 1 0-6 0'], ['M5 21c0-4.5 3-7.5 7-7.5s7 3 7 7.5']],
  coin: [['M12 3a9 9 0 1 0 .001 0zM12 6.5a5.5 5.5 0 1 0 .001 0z'], ['M12 9v6']],
  money: [['M2.5 7h19v10h-19z'], ['M12 9.5a2.5 2.5 0 1 0 .001 0z'], ['M5.5 10v4M18.5 10v4']],
  sword: [['M20.5 3.5L9.5 14.5'], ['M20.5 3.5V6L11 15.5l-2.5-2.5L18 3.5z'], ['M6 12l6 6M7.5 16.5l-4 4']],
  ruler: [['M3 16L16 3l5 5L8 21z'], ['M7 12l2 2M10 9l1.5 1.5M13 6l2 2']],
  drop: [['M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z']],
  wind: [['M3 9h11a3 3 0 1 0-3-3M3 13h15a3 3 0 1 1-3 3M3 17h7']],
  question: [['M8.5 8.5a3.5 3.5 0 1 1 5 3.2c-1 .5-1.5 1.3-1.5 2.3v.5'], ['M11 18.5a1 1 0 1 0 2 0a1 1 0 1 0-2 0', 'f']],
  star: [['M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z']],
  sparkle: [['M12 2.5c.6 4 2 5.4 6 6-4 .6-5.4 2-6 6-.6-4-2-5.4-6-6 4-.6 5.4-2 6-6zM18.5 15c.3 1.8.9 2.4 2.5 2.7-1.6.3-2.2.9-2.5 2.7-.3-1.8-.9-2.4-2.5-2.7 1.6-.3 2.2-.9 2.5-2.7z']],
  columns: [['M3 9l9-5.5L21 9zM5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 20.5h18']],
  leaf: [['M5 19C5 10 10 4.5 20 4c-.5 10-6 15-15 15zM5 19l8-8']],
  briefcase: [['M3.5 8h17v11h-17zM9 8V5.5h6V8M3.5 13h17']],
  book: [['M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2zM5 18a2 2 0 0 1 2-2h11']],
  clipboard: [['M7 4.5H5.5v16h13v-16H17M8.5 3h7v3h-7z'], ['M8.5 11h7M8.5 14.5h7M8.5 18h4']],
  food: [['M12 6a6 6 0 1 0 .001 0z'], ['M3.5 3v6a1.5 1.5 0 0 0 3 0V3M5 9v12M20 3c-1.5 0-2.5 2-2.5 5s1 4 2.5 4M20 3v18']],
  crown: [['M3 8l4.5 4L12 5l4.5 7L21 8l-1.5 10h-15zM4.5 21h15']],
  lock: [['M6 10.5h12V20H6zM8.5 10.5v-3a3.5 3.5 0 0 1 7 0v3']],
  picture: [['M3.5 5h17v14h-17zM3.5 16l5-5 4 4 3-3 5 5'], ['M15.5 7.5a1.5 1.5 0 1 0 .001 0z']],
  phone: [['M7.5 2.5h9a1 1 0 0 1 1 1v17a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-17a1 1 0 0 1 1-1zM11 18.5h2']],
  signal: [['M4 20v-3M9 20v-7M14 20V9M19 20V4']],
  flag: [['M5 21V3.5M5 4h13l-2.5 4.5L18 13H5']],
  chair: [['M7 3v10h10V3M6 13h12M7 13v8M17 13v8M7 7h10']],
  barrier: [['M3 8h18v6H3zM6 14v6M18 14v6M7 8l-3 6M13 8l-3 6M19 8l-3 6']],
  snail: [['M13 17a6 6 0 1 1 0-12 6 6 0 0 1 0 12zm0-3.5a2.5 2.5 0 1 1 0-5'], ['M2.5 19.5h17c1.5 0 2.5-1.5 2.5-3V11M20 11l-1.5-3M22 11l.5-3']],
  speech: [['M4 5h16v10H10l-4 4v-4H4z'], ['M8 9h8M8 12h5']],
  burst: [['M12 2l2 6 6-3-3 6 6 2-6 2 3 6-6-3-2 6-2-6-6 3 3-6-6-2 6-2-3-6 6 3z']],
  pill: [['M10.5 20.5a5 5 0 0 1-7-7l6-6a5 5 0 0 1 7 7zM6.5 10.5l7 7']],
  ticket: [['M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z'], ['M14 7v2M14 11v2M14 15v2']],
  car: [['M3 16v-3l2-5h14l2 5v3zM3 16v2.5h3V16M18 16v2.5h3V16'], ['M6 12.5h1M17 12.5h1']],
  bug: [['M8 9a4 4 0 0 1 8 0v6a4 4 0 0 1-8 0zM12 9v10M3 10l5 1M3 15h5M21 10l-5 1M21 15h-5M9.5 5L8 3M14.5 5L16 3']],
  brain: [['M12 5a3 3 0 0 0-5.5 1.5A3 3 0 0 0 4 10a3 3 0 0 0 1 5 3 3 0 0 0 3.5 4A3 3 0 0 0 12 19zM12 5a3 3 0 0 1 5.5 1.5A3 3 0 0 1 20 10a3 3 0 0 1-1 5 3 3 0 0 1-3.5 4A3 3 0 0 1 12 19z']],
  backpack: [['M6 9a6 6 0 0 1 12 0v11H6zM9.5 3.5h5M8.5 13h7v4h-7z']],
  film: [['M3.5 10h17v10h-17zM3.5 10l1.5-5.5 16 4.3M8 5.5l2 4.5M13 6.9l2 3.4']],
  hbox: [['M4 4h16v16H4zM9 8v8M15 8v8M9 12h6']],
  disco: [['M12 4a8 8 0 1 0 .001 0zM4 12h16M12 4c-3 3-3 13 0 16M12 4c3 3 3 13 0 16M5.5 7.5h13M5.5 16.5h13M12 1v3']],
  tree: [['M12 2l5 7h-3l4 6h-4l3 5H7l3-5H6l4-6H7zM12 20v2']],
  heart: [['M12 20s-8-4.8-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.2 12 20 12 20z']],
};

/** which icon each emoji stands for */
const EMOJI: Record<string, string> = {
  '☕': 'coffee', '🍵': 'coffee', '🫖': 'coffee', '📄': 'paper', '📸': 'camera', '✉': 'envelope', '✋': 'hand', '👏': 'hand',
  '🔔': 'bell', '🔥': 'fire', '😎': 'cool', '🧐': 'cool', '🙂': 'smile', '😴': 'sleepy', '🥱': 'sleepy', '😵': 'dizzy', '😤': 'angry',
  '😩': 'sad', '😰': 'sad', '😭': 'sad', '😬': 'sad', '🤯': 'wow', '🫠': 'wow', '🥳': 'party', '🤪': 'party', '😜': 'party', '🤡': 'party',
  '⚡': 'bolt', '📝': 'quill', '⏰': 'alarm', '🕙': 'clock', '💻': 'laptop', '👾': 'invader', '👁': 'eye', '👀': 'eye', '🎲': 'dice',
  '🔖': 'bookmark', '🛡': 'shield', '🔴': 'dot', '🎯': 'target', '🏃': 'runner', '👟': 'runner', '🏐': 'ball', '🎵': 'note',
  '🎤': 'mic', '🎙': 'mic', '🔊': 'speaker', '🥊': 'glove', '👥': 'people', '🧍': 'person', '🧑': 'person', '👩': 'person', '💂': 'person',
  '🪙': 'coin', '💸': 'money', '🗡': 'sword', '📏': 'ruler', '📐': 'ruler', '🩸': 'drop', '💨': 'wind', '🌪': 'wind', '❓': 'question',
  '🌟': 'star', '⭐': 'star', '✨': 'sparkle', '💅': 'sparkle', '🏛': 'columns', '🍂': 'leaf', '🍁': 'leaf', '💼': 'briefcase',
  '📕': 'book', '📘': 'book', '📋': 'clipboard', '🗂': 'clipboard', '🧾': 'clipboard', '📜': 'clipboard', '🥗': 'food', '🍔': 'food',
  '🍽': 'food', '🍊': 'food', '👑': 'crown', '🔒': 'lock', '🖼': 'picture', '📱': 'phone', '📞': 'phone', '🤳': 'phone', '📶': 'signal',
  '🏁': 'flag', '🪑': 'chair', '🚧': 'barrier', '🐌': 'snail', '🗣': 'speech', '💥': 'burst', '🚨': 'burst', '💊': 'pill', '🎫': 'ticket',
  '🚗': 'car', '🚛': 'car', '🪳': 'bug', '🧠': 'brain', '🎒': 'backpack', '🎬': 'film', '🕹': 'film', '🅷': 'hbox', '🪩': 'disco', '🎄': 'tree',
};

// an emoji, maybe with a skin/gender sequence and variation selector after it
const RE = new RegExp(`(${Object.keys(EMOJI).sort((a, b) => b.length - a.length).map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\ufe0f?(?:\\u200d(?:[\\u2640\\u2642]|\\p{Extended_Pictographic})\\ufe0f?)*`, 'gu');
// pictographs with no icon of their own are dropped
const STRAY = /[\u{1F300}-\u{1FAFF}]️?/gu;

export function iconFor(emoji: string) { return EMOJI[emoji.replace(/️/g, '').split('‍')[0]]; }

/** an icon as inline SVG markup */
export function icon(name: string, cls = '') {
  const parts = ICONS[name];
  if (!parts) return '';
  return `<svg class="ico ico-${name}${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${parts.map(([d, m]) => (m === 'f' ? `<path d="${d}" class="f"/>` : `<path d="${d}"/>`)).join('')}</svg>`;
}

/** a string's emoji turned into icons (for innerHTML) */
export function iconHtml(s: string) {
  return s.replace(RE, (m) => icon(iconFor(m) ?? '')).replace(STRAY, '');
}

/** draw an icon into a canvas, centred on (x, y) */
export function drawIcon(g: CanvasRenderingContext2D, name: string, x: number, y: number, size: number, color: string, width = 1.9) {
  const parts = ICONS[name];
  if (!parts || typeof Path2D === 'undefined') return;
  g.save();
  g.translate(x - size / 2, y - size / 2);
  g.scale(size / 24, size / 24);
  g.strokeStyle = g.fillStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const [d, m] of parts) { const p = new Path2D(d); if (m === 'f') g.fill(p); else g.stroke(p); }
  g.restore();
}

/** canvas text with icons: draws the emoji in `s` as icons and the rest as text (centred) */
export function fillTextIcons(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string) {
  const bits = s.split(RE).filter((b) => b);
  const name = (b: string) => iconFor(b);
  const w = bits.reduce((n, b) => n + (name(b) ? size * 1.1 : g.measureText(b.replace(STRAY, '')).width), 0);
  let cx = x - w / 2;
  const align = g.textAlign;
  g.textAlign = 'left';
  for (const b of bits) {
    const n = name(b);
    if (n) { drawIcon(g, n, cx + size * 0.55, y - size * 0.05, size, color, 2.2); cx += size * 1.1; }
    else { const tx = b.replace(STRAY, ''); g.fillText(tx, cx, y); cx += g.measureText(tx).width; }
  }
  g.textAlign = align;
}

const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'svg', 'path']);

function iconizeText(node: Text) {
  const s = node.data;
  RE.lastIndex = 0;
  const has = RE.test(s);
  STRAY.lastIndex = 0;
  if (!has && !STRAY.test(s)) return;
  const parent = node.parentElement;
  if (!parent || SKIP.has(parent.tagName)) return;
  // an <option> can't hold SVG: the emoji just go
  if (parent.tagName === 'OPTION' || parent.closest('select')) { node.data = s.replace(RE, '').replace(STRAY, ''); return; }
  const span = document.createElement('span');
  span.innerHTML = iconHtml(s.replace(/&/g, '&amp;').replace(/</g, '&lt;'));
  const frag = document.createDocumentFragment();
  while (span.firstChild) frag.appendChild(span.firstChild);
  parent.replaceChild(frag, node);
}

function iconizeTree(root: Node) {
  if (root.nodeType === 3) { iconizeText(root as Text); return; }
  if (root.nodeType !== 1 && root.nodeType !== 11) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text);
  for (const t of texts) iconizeText(t);
}

/** swap every emoji the game puts on screen for its icon, now and from here on */
export function installIcons(root: HTMLElement = document.body) {
  if (typeof MutationObserver === 'undefined') return;
  iconizeTree(root);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') iconizeText(m.target as Text);
      else m.addedNodes.forEach((n) => iconizeTree(n));
    }
  }).observe(root, { childList: true, subtree: true, characterData: true });
}
