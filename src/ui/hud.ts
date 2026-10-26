import { CARDS } from '../data/cards';
import { settings } from '../core/audio';
import { Post } from '../render/post';
import { voice } from '../core/voice';
import { SKILLS } from '../data/weeks';
import balance from '../data/balance.json';
import { xpForNext } from '../hero/kirill';
import type { WeekRun } from '../game/week';
import { el } from './dom';
import { POSSESS_NAMES, type Possession } from '../game/possess';
import type { Unit } from '../horde/units';
import { t } from '../i18n';
import { LINES, pickLine } from '../data/lines';
import { sfx } from '../core/audio';

// In-week HUD (GDD §12.6): Kirill card + fail meter top-left, week/timer top-centre,
// feed top-right, Chaos and cards 1–6 + Q/W/E along the bottom.

const TUTORIAL = ['tut.1', 'tut.2', 'tut.3'];

export class Hud {
  root: HTMLElement;
  private meterFill: HTMLElement;
  private meterText: HTMLElement;
  private xpFill: HTMLElement;
  private lvl: HTMLElement;
  private timer: HTMLElement;
  private chaosFill: HTMLElement;
  private chaosText: HTMLElement;
  private cards: HTMLElement[] = [];
  private skills: Record<'q' | 'w' | 'e', HTMLElement>;
  private feedBox: HTMLElement;
  private center: HTMLElement;
  private tut: HTMLElement;
  private pauseEl: HTMLElement;
  private vignette: HTMLElement;
  private last = new Map<string, string>();
  private tutShown = -2;

  constructor(private w: WeekRun) {
    const ui = document.getElementById('ui')!;
    const d = w.def;
    const sem = w.sem;
    const debts = Array.from({ length: sem.debtLimit }, (_, i) => `<span class="dot ${i < sem.debts ? 'on' : ''}"></span>`).join('');
    this.root = el(`
      <div class="hud">
        <div class="vignette"></div>
        <div class="hud-kirill panel">
          <div class="hk-top"><span class="hk-name">${t('hud.kirill')}</span><span class="hk-lvl">${t('hud.lv', { n: 1 })}</span></div>
          <div class="bar xp"><div class="fill"></div></div>
          <div class="hk-meter-label">${d.meter.icon} ${d.meter.label} <span class="hk-meter-text"></span></div>
          <div class="bar meter ${w.rules.meterMode}"><div class="fill" style="background:${d.meter.color}"></div></div>
          ${w.rules.meterMode === 'race' ? `<div class="hk-hint">${t('hud.race')}</div>` : ''}
          <div class="meter2 hidden"><span class="m2-label"></span><div class="bar"><div class="fill" style="background:#e8574a"></div></div></div>
          <div class="hk-debts"><span>${t('hud.debts')}</span>${debts}</div>
        </div>
        <div class="hud-week">
          <div class="hw-num">${t('hud.week')} ${sem.weekNum} <span>· ${sem.slot + 1}/${sem.order.length}</span></div>
          <div class="hw-title">${d.title}</div>
          <div class="hw-timer">40.0</div>
        </div>
        <div class="hud-feed"></div>
        <div class="hud-center"></div>
        <div class="hud-tutorial"></div>
        <div class="hud-pause hidden">
          <div class="pz-card panel">
            <div class="pz-title">${t('hud.paused')}</div>
            <button class="btn big primary" data-pz="resume">▶ ${t('pz.resume')}</button>
            <button class="btn" data-pz="restart">↺ ${t('pz.restart')}</button>
            <div class="pz-set">
              <label>🔊 ${t('pz.volume')} <input type="range" min="0" max="100" class="pz-vol"></label>
              <label><input type="checkbox" class="pz-music"> 🎵 ${t('pz.music')}</label>
              <button class="btn small" data-pz="full">⛶ ${t('pz.fullscreen')}</button>
              <label><input type="checkbox" class="pz-fx"> ✨ ${t('pz.fx')}</label>
            </div>
            <div class="pz-keys">${t('pz.keys')}</div>
            <button class="btn small danger" data-pz="quit">✕ ${t('pz.quit')}</button>
          </div>
        </div>
        <div class="fp-cross hidden"></div>
        <div class="fp-lock hidden">${t('hud.fpLock')}</div>
        <div class="fp-panel panel hidden">
          <div class="fp-title">${t('hud.possessing')} <b class="fp-name"></b></div>
          <div class="fp-bars">
            <div><span>${t('hud.sprint')}</span><div class="bar"><div class="fill fp-sprint"></div></div></div>
            <div><span>${t('hud.dash')}</span><div class="bar"><div class="fill fp-dash"></div></div></div>
          </div>
          <div class="fp-action"><span class="fp-atk">COMBO</span> <b class="fp-combo"></b> <span class="fp-coins"></span></div>
          <div class="fp-skills">${[0, 1].map((i) => `<button class="fp-skill" data-s="${i}"><span class="key">${w.soul ? 'FG'[i] : 'XZ'[i]}</span> <b class="fp-skill-name"></b> <i class="fp-skill-cd"></i></button>`).join('')}</div>
          <div class="fp-keys">${t(w.soul ? 'soul.keys' : 'hud.fpKeys', { atk: '<span class="fp-atk2"></span>' })}</div>
        </div>
        <div class="hud-bottom">
          <div class="chaos panel"><div class="chaos-label">${t('hud.chaos')} <b class="chaos-text">10</b></div><div class="bar chaosbar"><div class="fill"></div></div></div>
          <div class="cards"></div>
          <div class="skills"></div>
        </div>
      </div>`);
    ui.appendChild(this.root);
    const q = (s: string) => this.root.querySelector(s) as HTMLElement;
    this.meterFill = q('.meter .fill');
    this.meterText = q('.hk-meter-text');
    this.xpFill = q('.xp .fill');
    this.lvl = q('.hk-lvl');
    this.timer = q('.hw-timer');
    this.chaosFill = q('.chaosbar .fill');
    this.chaosText = q('.chaos-text');
    this.feedBox = q('.hud-feed');
    this.center = q('.hud-center');
    this.tut = q('.hud-tutorial');
    this.pauseEl = q('.hud-pause');
    const vol = this.pauseEl.querySelector('.pz-vol') as HTMLInputElement;
    const mus = this.pauseEl.querySelector('.pz-music') as HTMLInputElement;
    vol.value = String(Math.round(settings.volume * 100));
    mus.checked = settings.music;
    vol.addEventListener('input', () => { settings.volume = +vol.value / 100; voice.setVolume(settings.volume); });
    mus.addEventListener('change', () => { settings.music = mus.checked; });
    const fxBox = this.pauseEl.querySelector('.pz-fx') as HTMLInputElement;
    fxBox.checked = Post.quality === 'high';
    fxBox.addEventListener('change', () => { Post.quality = fxBox.checked ? 'high' : 'low'; });
    this.pauseEl.addEventListener('mousedown', (e) => e.stopPropagation());
    this.pauseEl.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('[data-pz]')?.getAttribute('data-pz');
      if (a === 'resume') w.togglePause();
      if (a === 'restart' || a === 'quit') w.onMenu?.(a);
      if (a === 'full') { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {}); }
    });
    this.vignette = q('.vignette');

    const cardsBox = q('.cards');
    w.hand.forEach((s, i) => {
      const c = CARDS[s.card];
      const tag = s.source === 'guest' ? `<span class="tag guest">${t('hud.freeGuest')}</span>` : s.source === 'week' ? `<span class="tag week">${t('hud.thisWeek')}</span>` : '';
      const stars = s.source === 'week' ? '' : `<span class="lv">${'★'.repeat(s.level)}${'☆'.repeat(3 - s.level)}</span>`;
      // the story summons on its own: the cards are your squad (no keys, no costs)
      const card = el(w.soul
        ? `<button class="card squad">${tag}<span class="icon">${c.icon}</span><span class="name">${c.name}</span>${stars}</button>`
        : `<button class="card"><span class="key">${i + 1}</span>${tag}<span class="icon">${c.icon}</span><span class="name">${c.name}</span>${stars}<span class="cost">${s.source === 'guest' ? 0 : c.cost}</span></button>`);
      card.title = `${c.name} — ${s.source === 'week' ? c.desc : c.levels[s.level - 1]}`;
      card.addEventListener('mousedown', (e) => { e.stopPropagation(); w.select(i); });
      cardsBox.appendChild(card);
      this.cards.push(card);
    });
    if (w.soul) cardsBox.insertAdjacentHTML('afterbegin', `<div class="squad-label">${t('soul.squad')}</div>`);
    const sk = q('.skills');
    const skill = (key: 'q' | 'w' | 'e', name: string, icon: string, desc: string) => {
      const b = el(`<button class="skill"><span class="key">${key.toUpperCase()}</span><span class="icon">${icon}</span><span class="name">${name}</span><span class="cdov"></span></button>`);
      b.title = desc;
      b.addEventListener('mousedown', (e) => { e.stopPropagation(); w.useSkill(key); });
      sk.appendChild(b);
      return b;
    };
    const qs = d.skill ? SKILLS[d.skill] : null;
    this.skills = {
      q: skill('q', qs?.name ?? '—', '⚡', qs?.desc ?? ''),
      w: skill('w', t('hud.email'), '✉️', t('hud.emailDesc')),
      e: skill('e', t('hud.alarm'), '🚨', t('hud.alarmDesc')),
    };
    // the story plays from inside your units: the button jumps your soul to the next body
    const fpBtn = w.soul
      ? el(`<button class="skill fp-btn soul-btn"><span class="key">C</span><span class="icon">✨</span><span class="name">${t('soul.btn')}</span></button>`)
      : el(`<button class="skill fp-btn"><span class="key">F</span><span class="icon">👁️</span><span class="name">${t('hud.fp')}</span></button>`);
    fpBtn.title = t(w.soul ? 'soul.sub' : 'hud.fpDesc');
    fpBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); if (w.soul) w.soul.jump(); else w.togglePossess(); });
    this.root.querySelectorAll<HTMLElement>('.fp-skill').forEach((b) => b.addEventListener('mousedown', (e) => { e.stopPropagation(); w.possess.skill(+b.dataset.s!); }));
    sk.appendChild(fpBtn);
    // weeks with a turn verb (parking: rotate the car) get a button for it too
    if (w.rules.onRotate) {
      const rot = el(`<button class="skill"><span class="key">R</span><span class="icon">↻</span><span class="name">${t('hud.rotate')}</span></button>`);
      rot.addEventListener('mousedown', (e) => { e.stopPropagation(); w.rules.onRotate?.(); });
      sk.appendChild(rot);
    }
  }

  private set(key: string, elm: HTMLElement, prop: 'text' | 'width' | 'class', v: string) {
    if (this.last.get(key) === v) return;
    this.last.set(key, v);
    if (prop === 'text') elm.textContent = v;
    else if (prop === 'width') elm.style.width = v;
    else elm.className = v;
  }

  update() {
    const w = this.w, k = w.kirill;
    const p = w.progress;
    this.set('meter', this.meterFill, 'width', `${(p * 100).toFixed(1)}%`);
    this.set('meterT', this.meterText, 'text', w.rules.meterText());
    const m2 = w.rules.meter2();
    if (m2) {
      const box2 = this.root.querySelector('.meter2') as HTMLElement;
      box2.classList.remove('hidden');
      this.set('m2l', box2.querySelector('.m2-label') as HTMLElement, 'text', m2.label);
      this.set('m2', box2.querySelector('.fill') as HTMLElement, 'width', `${(m2.p * 100).toFixed(1)}%`);
    }
    this.set('xp', this.xpFill, 'width', `${Math.min(100, (k.state.xp / xpForNext(k.state.level)) * 100).toFixed(0)}%`);
    this.set('lvl', this.lvl, 'text', t('hud.lv', { n: k.state.level }));
    const left = Math.max(0, w.duration - w.time);
    this.set('timer', this.timer, 'text', left.toFixed(1));
    this.set('timerC', this.timer, 'class', left < 10 ? 'hw-timer low' : 'hw-timer');
    this.set('chaos', this.chaosFill, 'width', `${(w.chaos / balance.chaos.max) * 100}%`);
    this.set('chaosT', this.chaosText, 'text', String(Math.floor(w.chaos)));
    // red vignette as the fail meter fills; in race weeks as time runs out on an unfinished job
    const danger = w.rules.meterMode === 'race' ? (w.time / w.duration) * (1 - p) : Math.max(p, w.rules.meter2()?.p ?? 0);
    this.vignette.style.opacity = String(Math.max(0, (danger - 0.35) * 1.4));
    w.hand.forEach((s, i) => {
      const afford = w.chaos >= w.costOf(s) && !(s.source === 'guest' && s.used);
      this.set('card' + i, this.cards[i], 'class', `card${i === w.selected ? ' sel' : ''}${afford ? '' : ' poor'}${s.used ? ' used' : ''}`);
    });
    for (const key of ['q', 'w', 'e'] as const) {
      const cd = w.cds[key];
      const off = key === 'q' && !w.def.skill;
      const hacked = w.hacked.has(key);
      this.set('sk' + key, this.skills[key], 'class', `skill${cd > 0 || off || hacked ? ' cooling' : ''}${hacked ? ' hacked' : ''}`);
      this.set('skT' + key, this.skills[key].querySelector('.cdov') as HTMLElement, 'text', cd > 0 ? cd.toFixed(0) : '');
    }
    if (w.tutorialStep !== this.tutShown) {
      this.tutShown = w.tutorialStep;
      this.tut.innerHTML = w.tutorialStep >= 0 ? `<span class="tstep">${w.tutorialStep + 1}/3</span> ${t(TUTORIAL[w.tutorialStep])}<i class="tut-arrow a${w.tutorialStep}"></i>` : '';
      this.tut.className = 'hud-tutorial step' + w.tutorialStep;
      this.tut.style.display = w.tutorialStep >= 0 ? 'block' : 'none';
    }
  }

  feed(text: string, cls = '') {
    const item = el(`<div class="feed-item ${cls}"></div>`);
    item.textContent = text;
    this.feedBox.prepend(item);
    while (this.feedBox.children.length > 6) this.feedBox.lastElementChild!.remove();
    setTimeout(() => item.classList.add('old'), 6000);
  }

  announce(title: string, sub = '') {
    const a = el(`<div class="announce"><div class="a-title"></div><div class="a-sub"></div></div>`);
    (a.querySelector('.a-title') as HTMLElement).textContent = title;
    (a.querySelector('.a-sub') as HTMLElement).textContent = sub;
    this.center.querySelectorAll('.announce').forEach((n) => n.remove());
    this.center.appendChild(a);
    setTimeout(() => a.remove(), 2200);
  }

  banner(text: string, cls: string) {
    this.center.innerHTML = '';
    const b = el(`<div class="banner ${cls}">${text}</div>`);
    this.center.appendChild(b);
  }

  toast(text: string) {
    const t = el(`<div class="toast"></div>`);
    t.textContent = text;
    this.root.appendChild(t);
    setTimeout(() => t.remove(), 1200);
  }

  setFirstPerson(on: boolean, u: Unit | null) {
    const q = (s: string) => this.root.querySelector(s) as HTMLElement;
    q('.fp-cross').classList.toggle('hidden', !on);
    q('.fp-panel').classList.toggle('hidden', !on);
    // the key list shows again for a few seconds each time you take a body
    const keys = q('.fp-keys');
    if (on && keys) { keys.style.animation = 'none'; void keys.offsetWidth; keys.style.animation = ''; }
    this.root.classList.toggle('fp', on);
    this.setMouseCaptured(document.pointerLockElement === this.w.stage.renderer.domElement);
    (this.skills.w.querySelector('.key') as HTMLElement).textContent = on ? 'R' : 'W';
    if (on && u) {
      const info = POSSESS_NAMES[u.kind]!;
      q('.fp-name').textContent = info.name;
      q('.fp-atk').textContent = u.kind === 'deadline' ? info.attack.toUpperCase() : t('hud.combo3');
      q('.fp-atk2').textContent = u.kind === 'deadline' ? info.attack.toLowerCase() : t('hud.combo3').toLowerCase();
    }
  }

  setMouseCaptured(captured: boolean) {
    const n = this.root.querySelector('.fp-lock') as HTMLElement;
    n.classList.toggle('hidden', captured || !this.root.classList.contains('fp'));
  }

  updateFirstPerson(p: Possession) {
    const sprint = this.root.querySelector('.fp-sprint') as HTMLElement;
    const dash = this.root.querySelector('.fp-dash') as HTMLElement;
    this.set('fpS', sprint, 'width', `${(p.stamina * 100).toFixed(0)}%`);
    this.set('fpD', dash, 'width', `${((1 - p.dashCd / 1.2) * 100).toFixed(0)}%`);
    this.set('fpC', this.root.querySelector('.fp-combo') as HTMLElement, 'text', '●'.repeat(p.combo) + '○'.repeat(3 - p.combo));
    this.set('fpCoins', this.root.querySelector('.fp-coins') as HTMLElement, 'text', p.coins ? t('hud.coins', { n: p.coins }) : '');
    this.root.querySelectorAll<HTMLElement>('.fp-skill').forEach((b, i) => {
      if (p.unit) this.set('fpSk' + i, b.querySelector('.fp-skill-name') as HTMLElement, 'text', t(`uskill.${p.unit.kind}.${i}`));
      this.set('fpSkCd' + i, b.querySelector('.fp-skill-cd') as HTMLElement, 'text', p.skillCd[i] > 0 ? p.skillCd[i].toFixed(0) : t('bs.ready'));
      b.classList.toggle('cooling', p.skillCd[i] > 0);
    });
  }

  // ---------------------------------------------------------------- combos

  private comboEl: HTMLElement | null = null;
  private lastStamp = 0;

  /** COMBO ×n with Russian-grade stamps at 3 / 5 / 8 / 12 hits */
  combo(n: number) {
    if (!this.comboEl) {
      this.comboEl = el(`<div class="combo hidden"><div class="c-n"></div><div class="c-stamp"></div></div>`);
      this.root.appendChild(this.comboEl);
    }
    const c = this.comboEl;
    c.classList.toggle('hidden', n < 2);
    if (n < 2) { this.lastStamp = 0; return; }
    (c.querySelector('.c-n') as HTMLElement).textContent = t('combo.n', { n });
    c.classList.remove('bump');
    void c.offsetWidth;
    c.classList.add('bump');
    const tiers = [12, 8, 5, 3];
    const tier = tiers.find((x) => n >= x) ?? 0;
    if (tier && tier !== this.lastStamp) {
      this.lastStamp = tier;
      const st = c.querySelector('.c-stamp') as HTMLElement;
      st.textContent = t('combo.' + tier);
      st.className = 'c-stamp tier' + tier;
      void st.offsetWidth;
      st.classList.add('show');
      sfx.levelUp();
    }
  }

  // ---------------------------------------------------------------- intro cards & hints

  private introEl: HTMLElement | null = null;

  /** A character's first appearance: their sheet portrait, name, role and a line. */
  introCard(name: string, onClose: () => void) {
    this.closeIntro();
    const portrait = ['dean', 'finalExam'].includes(name)
      ? `<div class="ic-emoji">${name === 'dean' ? '🧑‍💼' : '📜'}</div>`
      : `<img src="portraits/${name}-face.jpg" alt="">`;
    const lines = (LINES as unknown as Record<string, string[]>)[name];
    const card = el(`<div class="intro-card-x"><div class="ic-inner">${portrait}<div class="ic-text"><div class="ic-role"></div><div class="ic-name"></div><div class="ic-line"></div><small>${t('hol.click')}</small></div></div></div>`);
    (card.querySelector('.ic-name') as HTMLElement).textContent = t('char.' + name);
    (card.querySelector('.ic-role') as HTMLElement).textContent = t('role.' + name);
    (card.querySelector('.ic-line') as HTMLElement).textContent = lines ? `«${pickLine(lines)}»` : '';
    card.addEventListener('mousedown', (e) => { e.stopPropagation(); onClose(); });
    this.root.appendChild(card);
    this.introEl = card;
    sfx.reveal();
  }

  closeIntro() {
    this.introEl?.remove();
    this.introEl = null;
  }

  /** One-line hint for the week's own verb (aim, rotate, drag…), shown for a few seconds. */
  hint(text: string) {
    const h = el(`<div class="verb-hint"></div>`);
    h.innerHTML = text;
    this.root.appendChild(h);
    setTimeout(() => h.classList.add('fade'), 7000);
    setTimeout(() => h.remove(), 8000);
  }

  setPaused(p: boolean) {
    this.pauseEl.classList.toggle('hidden', !p);
  }

  dispose() {
    this.root.remove();
  }
}
