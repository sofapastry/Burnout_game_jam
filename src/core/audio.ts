// All audio is synthesized with WebAudio (SFX, sequenced music, ambience) through one reverb bus.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
/** the reverb's input: anything connected here rings out */
let verb: GainNode | null = null;
let muted = false;

/** a generated impulse response: stereo noise decaying over `sec` (a big stone room) */
function impulse(c: AudioContext, sec: number, decay: number) {
  const len = Math.floor(c.sampleRate * sec);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function ac() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    try {
      const conv = ctx.createConvolver();
      conv.buffer = impulse(ctx, 3.2, 3.2);
      verb = ctx.createGain();
      verb.gain.value = 0.32;
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass'; damp.frequency.value = 4200;
      verb.connect(damp).connect(conv).connect(master);
    } catch { verb = null; }
    queueMicrotask(() => settings.apply());
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** where a sound goes: dry, plus a share into the reverb */
function out(c: AudioContext, g: AudioNode, wet: number) {
  g.connect(master!);
  if (wet > 0 && verb) { const s = c.createGain(); s.gain.value = wet; g.connect(s).connect(verb); }
}

function tone(freq: number, dur: number, type: OscillatorType, vol = 0.3, slideTo?: number, delay = 0, wet = 0) {
  if (muted) return;
  const c = ac();
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g);
  out(c, g, wet);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur: number, vol = 0.3, lowpass = 2000, wet = 0) {
  if (muted) return;
  const c = ac();
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lowpass;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g);
  out(c, g, wet);
  src.start();
}

/** noise through a bandpass that sweeps f0 → f1: whooshes, swings, wind */
function sweep(dur: number, f0: number, f1: number, vol: number, q = 2, wet = 0.2, delay = 0) {
  if (muted) return;
  const c = ac();
  const t0 = c.currentTime + delay;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t0);
  f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f).connect(g);
  out(c, g, wet);
  src.start(t0);
}

/** a struck bell: inharmonic partials with a long ring (the great bell of a souls boss) */
function bellTone(f: number, dur: number, vol: number, delay = 0, wet = 0.6) {
  for (const [m, v] of [[0.5, 0.5], [1, 1], [1.19, 0.5], [1.5, 0.45], [2, 0.35], [2.74, 0.2], [4.07, 0.1]]) tone(f * m, dur * (1.2 - m * 0.15), 'sine', vol * v, undefined, delay, wet);
}

const lastAt: Record<string, number> = {};
function throttle(key: string, ms: number) {
  const now = performance.now();
  if ((lastAt[key] ?? 0) + ms > now) return false;
  lastAt[key] = now;
  return true;
}

export const sfx = {
  unlock() { ac(); },
  toggleMute() { muted = !muted; return muted; },
  place() { if (throttle('place', 40)) { tone(520, 0.07, 'triangle', 0.14, 900); tone(1040, 0.05, 'sine', 0.05, undefined, 0.03); } },
  paper() { if (throttle('paper', 50)) noise(0.08, 0.15, 3500); },
  kill() { if (throttle('kill', 45)) { tone(420, 0.09, 'triangle', 0.14, 140); noise(0.06, 0.08, 2600); } },
  ding() { if (throttle('ding', 60)) tone(1320, 0.12, 'sine', 0.12, 1760); },
  hurt() { if (throttle('hurt', 90)) { tone(240, 0.1, 'square', 0.07, 120); tone(130, 0.14, 'sine', 0.22, 60); noise(0.08, 0.14, 2400, 0.15); } },
  boom() { noise(0.5, 0.5, 900, 0.35); tone(90, 0.45, 'sine', 0.42, 32, 0, 0.3); tone(45, 0.6, 'sine', 0.3, 28); },
  alarm() { for (let i = 0; i < 4; i++) tone(i % 2 ? 880 : 660, 0.12, 'square', 0.12, undefined, i * 0.13); },
  whistle() { tone(2400, 0.5, 'sine', 0.2, 2600); tone(2420, 0.5, 'sine', 0.1, 2550); },
  beat() { tone(70, 0.25, 'sine', 0.5, 40); noise(0.05, 0.15, 6000); },
  email() { tone(990, 0.08, 'sine', 0.2); tone(1320, 0.12, 'sine', 0.2, undefined, 0.09); },
  levelUp() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'triangle', 0.15, undefined, i * 0.07, 0.4)); },
  debt() { tone(220, 0.6, 'sawtooth', 0.2, 110); noise(0.2, 0.3, 1200); },
  pass() { tone(440, 0.2, 'triangle', 0.15); tone(330, 0.3, 'triangle', 0.15, undefined, 0.15); },
  click() { if (throttle('click', 30)) tone(800, 0.04, 'square', 0.06); },
  reveal() { [392, 466, 587].forEach((f, i) => tone(f, 0.3, 'sine', 0.15, undefined, i * 0.12, 0.5)); },
  teleport() { tone(300, 0.3, 'sine', 0.2, 1200, 0, 0.3); },
  /** Soul Jump: a rising whoosh and a shimmer that rings out */
  soulJump() { sweep(0.32, 300, 3200, 0.32, 1.6, 0.35); tone(620, 0.4, 'sine', 0.08, 1860, 0.02, 0.6); tone(930, 0.4, 'sine', 0.05, 2790, 0.04, 0.6); },
  /** the first hit after a jump: a hard crack and a bright ping */
  ambush() { tone(140, 0.25, 'sine', 0.45, 40); noise(0.12, 0.4, 6000, 0.3); tone(1760, 0.5, 'sine', 0.08, undefined, 0.02, 0.6); },
  /** a heavy weapon cutting the air */
  swoosh() { if (throttle('swoosh', 60)) sweep(0.22, 1800, 380, 0.22, 1.2, 0.15); },
  /** the great bell: phase two, an ultimate, a hero rising again */
  bell(f = 98) { bellTone(f, 4.5, 0.22); },
  /** the hero gets up: a low swell into a bright chord */
  rise() { sweep(1.4, 120, 900, 0.12, 0.8, 0.5); [55, 62, 67, 71].forEach((n, i) => tone(440 * Math.pow(2, (n - 57) / 12), 2.2, 'triangle', 0.06, undefined, 0.5 + i * 0.08, 0.7)); },
  /** a soft piano note (the dialogue's lament) */
  piano(n: number, delay = 0) { const f = 440 * Math.pow(2, (n - 69) / 12); tone(f, 2.4, 'triangle', 0.11, undefined, delay, 0.6); tone(f * 2, 1.2, 'sine', 0.035, undefined, delay, 0.6); tone(f * 3, 0.5, 'sine', 0.015, undefined, delay, 0.5); },
  denied() { tone(150, 0.12, 'square', 0.1); },
  /** the lecturer's droning syllable: a muffled square with a little fall at the end */
  droneNote(f: number, vol = 1) { tone(f, 0.26, 'square', 0.07 * vol, f * 0.94); tone(f * 2, 0.18, 'sine', 0.03 * vol); },
};

// ---------------------------------------------------------------- juice sounds

export const juice = {
  /** the НЕЗАЧЁТ stamp: a heavy thud with a paper slap */
  stamp() { tone(70, 0.55, 'sine', 0.6, 32, 0, 0.4); noise(0.3, 0.55, 700, 0.4); tone(140, 0.12, 'square', 0.15, 60, 0.02); },
  /** announcer sting, higher for bigger tiers */
  sting(tier: number) { const b = 392 * Math.pow(1.19, tier); [b, b * 1.26, b * 1.5].forEach((f, i) => tone(f, 0.16, 'sawtooth', 0.06, undefined, i * 0.06, 0.45)); if (tier >= 3) tone(b / 4, 0.8, 'sine', 0.25, b / 8, 0, 0.4); },
  /** an audience laughing: a few bursts of filtered noise and wobbling voices */
  laugh() {
    for (let i = 0; i < 5; i++) {
      setTimeout(() => noise(0.12, 0.18, 1400 + Math.random() * 800), i * 120);
      tone(220 + Math.random() * 120, 0.1, 'triangle', 0.05, 180, i * 0.12);
    }
  },
  gasp() { noise(0.35, 0.2, 2600); },
  /** the end-of-week countdown: a clock tick, a bell-ish ping for the last three */
  tick(urgent: boolean) { tone(urgent ? 1760 : 1200, 0.06, 'square', urgent ? 0.12 : 0.07); if (urgent) tone(880, 0.25, 'sine', 0.1, undefined, 0.05); },
  /** a unit lands on the floor */
  thump() { tone(95, 0.18, 'sine', 0.32, 45, 0, 0.2); noise(0.08, 0.12, 900); },
};

// ---------------------------------------------------------------- music
// step sequencer; intensity 0..1 adds tempo and layers

let musicGain: GainNode | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let nextT = 0;
let step = 0;
let intensity = 0;
let drop = false;
const BASS = [[45, 45, 48, 43], [41, 41, 43, 40], [43, 43, 46, 41], [40, 40, 43, 38]]; // A minor-ish, MIDI
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

function at(t: number, freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) {
  const c = ctx!;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(musicGain!);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function hit(t: number, dur: number, vol: number, freq: number, type: BiquadFilterType) {
  const c = ctx!;
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(musicGain!);
  src.start(t);
}

/** a soft chord: detuned saws through a lowpass, slow attack, long release */
function pad(t: number, notes: number[], dur: number, vol: number, cutoff = 900) {
  const c = ctx!;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + dur * 0.3);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  f.connect(g).connect(musicGain!);
  for (const n of notes) for (const det of [-6, 6]) {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = midi(n);
    o.detune.value = det;
    o.connect(f);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

/** a choir: sawtooth voices through two vowel formants ("aah"), slow swell, gentle vibrato */
function choir(t: number, notes: number[], dur: number, vol: number) {
  const c = ctx!;
  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.linearRampToValueAtTime(vol, t + dur * 0.35);
  out.gain.linearRampToValueAtTime(0.0001, t + dur);
  out.connect(musicGain!);
  const lfo = c.createOscillator();
  lfo.frequency.value = 5.2;
  const depth = c.createGain();
  depth.gain.value = 14;
  lfo.connect(depth);
  lfo.start(t); lfo.stop(t + dur + 0.05);
  for (const [f, q, g] of [[780, 7, 1], [1160, 9, 0.6]] as [number, number, number][]) {
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    const fg = c.createGain(); fg.gain.value = g;
    bp.connect(fg).connect(out);
    for (const n of notes) for (const det of [-9, 0, 9]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midi(n);
      o.detune.value = det;
      depth.connect(o.detune);
      o.connect(bp);
      o.start(t); o.stop(t + dur + 0.05);
    }
  }
}

// 'soul' = horde stages, 'lament' = slow piano/choir
export type MusicStyle = 'menu' | 'week' | 'boss' | 'duel' | 'soul' | 'lament';
let style: MusicStyle = 'week';
const CHORDS: Record<MusicStyle, number[][]> = {
  menu: [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62]],
  week: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]],
  boss: [[50, 53, 57], [46, 50, 53], [48, 51, 55], [45, 49, 52]],
  duel: [[52, 55, 59], [52, 55, 59], [48, 52, 55], [50, 53, 57]],
  soul: [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]],
  lament: [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]],
};
/** the bell line over 'soul' and 'boss' (one note per bar, in the chord) */
const BELLS = [74, 70, 67, 69];

function scheduleStyled(t: number, s: number, bar: number, sixteenth: number) {
  const ch = CHORDS[style][bar];
  if (style === 'menu') {
    // lo-fi: lazy kick, rim on 2 and 4, vinyl dust, warm chords
    if (s === 0 || s === 10) at(t, 90, 0.25, 'sine', 0.4, 40);
    if (s === 4 || s === 12) hit(t, 0.05, 0.12, 2500, 'bandpass');
    if (s % 4 === 2) hit(t, 0.02, 0.04, 8000, 'highpass');
    if (s === 0) pad(t, ch, sixteenth * 16, 0.05, 1200);
    if (s % 8 === 0) at(t, midi(ch[0] - 12), sixteenth * 6, 'triangle', 0.14);
    if (s === 6 || s === 14) at(t, midi(ch[(s / 4) % ch.length | 0] + 12), 0.4, 'sine', 0.05);
  } else if (style === 'boss') {
    // epic: half-time war drums, dark pads, a slow bass, a high choir-ish line at full tension
    if (s === 0 || s === 7 || s === 10) at(t, 70, 0.4, 'sine', 0.6, 32);
    if (s === 8) { hit(t, 0.25, 0.4, 900, 'lowpass'); at(t, 160, 0.2, 'triangle', 0.25, 80); }
    if (intensity > 0.6 && s % 2 === 1) hit(t, 0.03, 0.06, 6000, 'highpass');
    if (s === 0) pad(t, ch, sixteenth * 16, 0.07, 700 + intensity * 900);
    if (s % 4 === 0) at(t, midi(ch[0] - 12), sixteenth * 3.5, 'sawtooth', 0.09);
    if (intensity > 0.8 && (s === 0 || s === 8)) at(t, midi(ch[2] + 12), sixteenth * 7, 'sine', 0.06);
    // the choir comes in as the fight builds, and carries the second phase
    if (s === 0 && intensity > 0.7) choir(t, ch.map((n) => n + 12), sixteenth * 16, intensity > 0.95 ? 0.16 : 0.09);
    // timpani rolls into each bar at full tension
    if (intensity > 0.95 && s >= 13) at(t, 82, 0.2, 'sine', 0.35, 55);
    // strings dig in under the drums, and the bell tolls at each bar as the fight builds
    if (s % 2 === 0) stringNote(t, midi(ch[0] - 12 + (s % 8 === 6 ? 7 : 0)), sixteenth * 1.8, 0.035 + intensity * 0.035);
    if (s === 0 && intensity > 0.4) bellAt(t, midi(BELLS[bar] - 12), 0.06 + intensity * 0.06);
  } else if (style === 'soul') {
    // a dark chase: taiko on the off-beats, a low string ostinato in sixteenths, a bell per bar
    if (s === 0 || s === 3 || s === 6 || s === 10 || (intensity > 0.5 && s === 13)) at(t, s === 0 ? 62 : 78, 0.35, 'sine', s === 0 ? 0.6 : 0.42, 34);
    if (s === 4 || s === 12) { hit(t, 0.18, 0.28, 1200, 'bandpass'); at(t, 190, 0.12, 'triangle', 0.14, 90); }
    if (s % 2 === 1 && intensity > 0.35) hit(t, 0.03, 0.05, 7000, 'highpass');
    const ost = [0, 0, 12, 0, 7, 0, 12, 7];
    stringNote(t, midi(ch[0] - 12 + ost[s % 8]), sixteenth * 0.9, 0.05 + intensity * 0.03);
    if (s === 0) pad(t, ch, sixteenth * 16, 0.05, 600 + intensity * 900);
    if (s === 0) bellAt(t, midi(BELLS[bar]), 0.08 + intensity * 0.05);
    if (s === 8 && intensity > 0.6) bellAt(t, midi(BELLS[bar] - 5), 0.05);
    if (s === 0 && intensity > 0.75) choir(t, ch.map((n) => n + 12), sixteenth * 16, 0.08);
  } else if (style === 'lament') {
    // the hero's return: a slow broken chord on piano, a soft choir under it
    if (s % 4 === 0) pianoAt(t, ch[(s / 4) % 3] + 12, 0.1);
    if (s === 0) { pianoAt(t, ch[0] - 12, 0.12); choir(t, ch, sixteenth * 16, 0.05); }
    if (s === 14 && bar === 3) pianoAt(t, ch[2] + 24, 0.06);
  } else if (style === 'duel') {
    // four on the floor, offbeat hats, a saw bass arpeggio
    if (s % 4 === 0) at(t, 110, 0.18, 'sine', 0.6, 40);
    if (s % 4 === 2) hit(t, 0.04, 0.14, 7000, 'highpass');
    if (s === 4 || s === 12) hit(t, 0.12, 0.3, 1500, 'highpass');
    at(t, midi(ch[s % 3] - 12 + (s % 8 === 7 ? 12 : 0)), sixteenth * 0.9, 'sawtooth', 0.07);
    if (s === 0 && bar % 2 === 0) pad(t, ch.map((n) => n + 12), sixteenth * 32, 0.035, 1600);
  }
}

/** a bowed string: a sawtooth through a lowpass, a quick swell (the ostinato) */
function stringNote(t: number, f: number, dur: number, vol: number) {
  const c = ctx!;
  const o = c.createOscillator(), o2 = c.createOscillator();
  o.type = o2.type = 'sawtooth';
  o.frequency.value = f; o2.frequency.value = f; o2.detune.value = 8;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + Math.min(0.04, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(lp); o2.connect(lp); lp.connect(g).connect(musicGain!);
  o.start(t); o2.start(t); o.stop(t + dur + 0.02); o2.stop(t + dur + 0.02);
}

function bellAt(t: number, f: number, vol: number) {
  for (const [m, v] of [[1, 1], [2, 0.4], [2.74, 0.25], [4.07, 0.12]]) at(t, f * m, 2.6 / m + 0.4, 'sine', vol * v);
}

function pianoAt(t: number, n: number, vol: number) {
  at(t, midi(n), 2.2, 'triangle', vol);
  at(t, midi(n) * 2, 1.0, 'sine', vol * 0.3);
}

function schedule() {
  if (!ctx || !musicGain) return;
  const bpm = style === 'menu' ? 82 : style === 'boss' ? 88 + intensity * 16 : style === 'duel' ? 138 : style === 'soul' ? 104 + intensity * 24 : style === 'lament' ? 64 : 96 + intensity * 54;
  const sixteenth = 60 / bpm / 4;
  if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.05;
  for (let n = 0; n < 8 && nextT < ctx.currentTime + 0.12; n++) {
    const t = nextT, s = step % 16, bar = Math.floor(step / 16) % 4;
    if (!muted && style !== 'week') scheduleStyled(t, s, bar, 60 / bpm / 4);
    else if (!muted) {
      const chord = BASS[bar];
      if (!drop) {
        if (s % 8 === 0 || (intensity > 0.5 && s % 4 === 0)) at(t, 120, 0.22, 'sine', 0.55, 40);
        if (intensity > 0.25 && (s === 4 || s === 12)) hit(t, 0.12, 0.35, 1800, 'highpass');
        if (s % 2 === 0 || intensity > 0.7) hit(t, 0.03, s % 4 === 2 ? 0.16 : 0.08, 7000, 'highpass');
        if (intensity > 0.75 && s % 2 === 1) at(t, midi(chord[s % 4] + 24 + (s % 3) * 3), 0.09, 'square', 0.035);
      }
      if (s % 4 === 0 || (intensity > 0.4 && s % 4 === 3)) at(t, midi(chord[(s / 4) | 0] ?? chord[0]), sixteenth * 2.5, drop ? 'sine' : 'triangle', drop ? 0.22 : 0.18);
    }
    nextT += sixteenth;
    step++;
  }
}

export const music = {
  start(level = 0.2, mood: MusicStyle = 'week') {
    intensity = level;
    drop = false;
    if (mood !== style) { style = mood; step = 0; }
    if (timer) return;
    try {
      const c = ac();
      if (!musicGain) {
        musicGain = c.createGain(); musicGain.gain.value = 0.16; musicGain.connect(master!);
        // the score rings out in the hall too
        if (verb) { const s = c.createGain(); s.gain.value = 0.9; musicGain.connect(s).connect(verb); }
      }
      settings.apply();
      nextT = 0;
      step = 0;
      timer = setInterval(schedule, 25);
    } catch { /* no audio */ }
  },
  stop() { if (timer) clearInterval(timer); timer = null; },
  set(level: number, isDrop = false) { intensity = Math.max(0, Math.min(1, level)); drop = isDrop; },
};

// ---------------------------------------------------------------- settings

let musicOn = true;
try { musicOn = localStorage.getItem('burnout.music') !== 'off'; } catch { /* storage blocked */ }
let vol = 1;
try { vol = +(localStorage.getItem('burnout.volume') ?? '1'); if (!(vol >= 0 && vol <= 1)) vol = 1; } catch { /* storage blocked */ }

export const settings = {
  get volume() { return vol; },
  set volume(v: number) {
    vol = Math.max(0, Math.min(1, v));
    if (master) master.gain.value = 0.35 * vol;
    try { localStorage.setItem('burnout.volume', String(vol)); } catch { /* storage blocked */ }
  },
  get music() { return musicOn; },
  set music(on: boolean) {
    musicOn = on;
    if (musicGain) musicGain.gain.value = on ? 0.16 : 0;
    try { localStorage.setItem('burnout.music', on ? 'on' : 'off'); } catch { /* storage blocked */ }
  },
  /** apply the saved volume once the audio context exists */
  apply() { if (master) master.gain.value = 0.35 * vol; if (musicGain) musicGain.gain.value = musicOn ? 0.16 : 0; },
};

// ---------------------------------------------------------------- ambience

let ambGain: GainNode | null = null;
let ambSrc: AudioBufferSourceNode | null = null;
let ambTimer: ReturnType<typeof setInterval> | null = null;

export const ambience = {
  start(location: string) {
    ambience.stop();
    if (muted) return;
    try {
      const c = ac();
      settings.apply();
      const outdoor = ['plaza', 'parking'].includes(location);
      const busy = ['foyer', 'b2hall', 'canteen', 'assembly', 'dormKitchen'].includes(location);
      const len = 4;
      const buf = c.createBuffer(1, c.sampleRate * len, c.sampleRate);
      const d = buf.getChannelData(0);
      // brown-ish noise; busy places get a slow "murmur" swell in it
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        const swell = busy ? 0.6 + 0.4 * Math.sin(i / c.sampleRate * 2.3) * Math.sin(i / c.sampleRate * 0.7) : 1;
        d[i] = last * 3.5 * swell;
      }
      ambSrc = c.createBufferSource();
      ambSrc.buffer = buf;
      ambSrc.loop = true;
      const f = c.createBiquadFilter();
      f.type = outdoor ? 'lowpass' : 'bandpass';
      f.frequency.value = outdoor ? 500 : busy ? 700 : 300;
      ambGain = c.createGain();
      ambGain.gain.value = busy ? 0.5 : 0.35;
      ambSrc.connect(f).connect(ambGain).connect(master!);
      ambSrc.start();
      // little details every few seconds
      ambTimer = setInterval(() => {
        if (muted || Math.random() < 0.4) return;
        if (outdoor) tone(2200 + Math.random() * 1400, 0.08, 'sine', 0.025, 2800 + Math.random() * 900);
        else if (location === 'gym') { tone(110, 0.18, 'sine', 0.12, 60); }
        else if (busy) noise(0.25, 0.04, 1800);
      }, 1700);
    } catch { /* no audio */ }
  },
  stop() {
    try { ambSrc?.stop(); } catch { /* already stopped */ }
    ambSrc = null;
    ambGain?.disconnect();
    ambGain = null;
    if (ambTimer) clearInterval(ambTimer);
    ambTimer = null;
  },
};
