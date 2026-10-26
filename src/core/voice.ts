// optional recorded lines: public/voice/<id>_1.mp3 etc. Missing files are skipped.

const IDS = [
  'kirill_hurt', 'kirill_debt', 'kirill_pass', 'kirill_taunt', 'kirill_sweat', 'kirill_brag', 'kirill_phone', 'kirill_panic',
  'nina_whistle', 'dean_line', 'masha_line', 'sonya_line', 'romchik_line', 'crowd_laugh', 'stamp',
];
const EXT = ['mp3', 'ogg', 'wav'];
const found = new Map<string, string[]>();
let lastAt = 0;
let volume = 1;

async function probe(url: string) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    // the dev server answers unknown paths with index.html: only real audio counts
    return r.ok && (r.headers.get('content-type') ?? '').startsWith('audio');
  } catch { return false; }
}

export const voice = {
  /** look for recorded lines once at startup (a few HEAD requests, all optional) */
  async preload() {
    if (typeof fetch === 'undefined' || typeof Audio === 'undefined') return;
    await Promise.all(IDS.map(async (id) => {
      const urls: string[] = [];
      for (let i = 1; i <= 5; i++) {
        for (const ext of EXT) {
          const u = `voice/${id}_${i}.${ext}`;
          if (await probe(u)) { urls.push(u); break; }
        }
        if (urls.length < i) break;
      }
      if (urls.length) found.set(id, urls);
    }));
    if (found.size) console.info(`[voice] recorded lines: ${[...found.keys()].join(', ')}`);
  },
  /** play a random recording for this id (at most one line every 1.2 s) */
  play(id: string) {
    const urls = found.get(id);
    if (!urls || volume <= 0) return;
    const now = performance.now();
    if (now - lastAt < 1200) return;
    lastAt = now;
    const a = new Audio(urls[Math.floor(Math.random() * urls.length)]);
    a.volume = Math.min(1, volume);
    a.play().catch(() => {});
  },
  setVolume(v: number) { volume = v; },
  get any() { return found.size > 0; },
};
