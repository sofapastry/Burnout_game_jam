import * as THREE from 'three';
import { Rng } from '../core/rng';

// Canvas-drawn textures standing in for painted ones. Colours follow the location sheet palettes.

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function tex(c: HTMLCanvasElement, repeat?: [number, number]) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

const cache = new Map<string, THREE.Texture>();
function cached(key: string, make: () => THREE.Texture) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key)!;
}

function shade(hex: string, amt: number) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amt);
  return '#' + c.getHexString();
}

/** Polished stone tiles (main hall, Building 2 hall). One canvas covers the whole floor so tiles can vary. */
export function tileFloor(w: number, h: number, seed: number, base = '#d9c7a8', alt = '#cbb592', tile = 2) {
  return cached(`tile${w}x${h}|${seed}|${base}`, () => {
    const px = 32;
    const [c, g] = canvas(Math.ceil(w / tile) * px, Math.ceil(h / tile) * px);
    const rng = new Rng(seed);
    for (let y = 0; y < c.height / px; y++)
      for (let x = 0; x < c.width / px; x++) {
        const checker = (x + y) % 2 === 0;
        g.fillStyle = shade(checker ? base : alt, rng.range(-0.025, 0.025));
        g.fillRect(x * px, y * px, px, px);
        // marble streak
        g.strokeStyle = 'rgba(255,255,255,0.12)';
        g.beginPath();
        g.moveTo(x * px + rng.range(0, px), y * px);
        g.quadraticCurveTo(x * px + rng.range(0, px), y * px + px / 2, x * px + rng.range(0, px), y * px + px);
        g.stroke();
      }
    g.strokeStyle = 'rgba(90,70,50,0.35)';
    g.lineWidth = 1.5;
    for (let x = 0; x <= c.width; x += px) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke(); }
    for (let y = 0; y <= c.height; y += px) { g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke(); }
    return tex(c);
  });
}

/** Gym parquet with basketball/volleyball court lines. */
export function gymFloor(w: number, h: number) {
  return cached(`gym${w}x${h}`, () => {
    const s = 24;
    const [c, g] = canvas(w * s, h * s);
    const rng = new Rng(7);
    // planks
    const plank = 0.25 * s;
    for (let y = 0; y < c.height; y += plank) {
      let x = -rng.range(0, 3 * s);
      while (x < c.width) {
        const len = rng.range(2, 4) * s;
        g.fillStyle = shade('#d9a066', rng.range(-0.05, 0.03));
        g.fillRect(x, y, len, plank);
        g.fillStyle = 'rgba(80,40,10,0.18)';
        g.fillRect(x, y + plank - 1, len, 1);
        g.fillRect(x + len - 1, y, 1, plank);
        x += len;
      }
    }
    const cx = c.width / 2, cy = c.height / 2;
    const cw = (w - 6) * s, ch = (h - 5) * s;
    // basketball key areas tinted
    g.fillStyle = 'rgba(40,90,170,0.35)';
    g.fillRect(cx - cw / 2, cy - 2 * s, 5 * s, 4 * s);
    g.fillRect(cx + cw / 2 - 5 * s, cy - 2 * s, 5 * s, 4 * s);
    g.strokeStyle = '#f4efe6';
    g.lineWidth = 3;
    g.strokeRect(cx - cw / 2, cy - ch / 2, cw, ch);
    g.beginPath(); g.moveTo(cx, cy - ch / 2); g.lineTo(cx, cy + ch / 2); g.stroke();
    g.beginPath(); g.arc(cx, cy, 2 * s, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(cx - cw / 2, cy, 6 * s, -Math.PI / 2, Math.PI / 2); g.stroke();
    g.beginPath(); g.arc(cx + cw / 2, cy, 6 * s, Math.PI / 2, Math.PI * 1.5); g.stroke();
    // volleyball court in blue
    g.strokeStyle = '#2b5fb0';
    g.strokeRect(cx - 9 * s, cy - 4.5 * s, 18 * s, 9 * s);
    g.beginPath(); g.moveTo(cx - 3 * s, cy - 4.5 * s); g.lineTo(cx - 3 * s, cy + 4.5 * s); g.moveTo(cx + 3 * s, cy - 4.5 * s); g.lineTo(cx + 3 * s, cy + 4.5 * s); g.stroke();
    // centre logo
    g.fillStyle = 'rgba(30,70,150,0.5)';
    hexLogo(g, cx, cy, 1.2 * s);
    return tex(c);
  });
}

/** Lecture-hall floor: warm beige linoleum tiles. */
export function lectureFloor(w: number, h: number) {
  return cached(`lect${w}x${h}`, () => {
    const px = 24;
    const [c, g] = canvas(w * px / 1.5, h * px / 1.5);
    const rng = new Rng(11);
    for (let y = 0; y < c.height; y += px)
      for (let x = 0; x < c.width; x += px) {
        g.fillStyle = shade('#cdb48e', rng.range(-0.03, 0.02));
        g.fillRect(x, y, px, px);
      }
    g.strokeStyle = 'rgba(110,80,50,0.25)';
    for (let x = 0; x <= c.width; x += px) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke(); }
    for (let y = 0; y <= c.height; y += px) { g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke(); }
    return tex(c);
  });
}

function hexLogo(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.8)';
  g.lineWidth = r * 0.12;
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    g.lineTo(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55);
  }
  g.closePath();
  g.stroke();
}

/** BrSTU navy banner with the hexagon logo. */
export function bannerTex(label = 'БрГТУ') {
  return cached('banner' + label, () => {
    const [c, g] = canvas(128, 256);
    g.fillStyle = '#2b3f6b';
    g.fillRect(0, 0, 128, 256);
    g.fillStyle = '#e9eef7';
    hexLogo(g, 64, 90, 34);
    g.font = 'bold 26px Nunito, sans-serif';
    g.textAlign = 'center';
    g.fillText(label, 64, 170);
    g.fillStyle = '#c9a24a';
    g.fillRect(0, 236, 128, 6);
    return tex(c);
  });
}

export function chalkboardTex() {
  return cached('chalk', () => {
    const [c, g] = canvas(512, 160);
    g.fillStyle = '#2f5a45';
    g.fillRect(0, 0, 512, 160);
    g.strokeStyle = 'rgba(240,240,230,0.75)';
    g.fillStyle = 'rgba(240,240,230,0.85)';
    g.lineWidth = 2;
    g.font = '20px JetBrains Mono, monospace';
    g.fillText('∫ f(x) dx = F(b) − F(a)', 30, 45);
    g.fillText('ГОСТ 2.104-2006', 300, 45);
    g.strokeRect(40, 70, 120, 60);
    g.beginPath(); g.moveTo(40, 130); g.lineTo(160, 70); g.stroke();
    g.beginPath(); g.arc(260, 100, 28, 0, Math.PI * 2); g.stroke();
    g.fillText('A1: 594×841', 320, 110);
    return tex(c);
  });
}

export function noticeBoardTex() {
  return cached('notice', () => {
    const [c, g] = canvas(256, 160);
    const rng = new Rng(3);
    g.fillStyle = '#b98a55';
    g.fillRect(0, 0, 256, 160);
    for (let i = 0; i < 9; i++) {
      g.fillStyle = rng.pick(['#f6f1e4', '#fff7c8', '#e3eef8', '#f9e0e0']);
      const x = rng.range(8, 200), y = rng.range(8, 110);
      g.save();
      g.translate(x + 22, y + 22);
      g.rotate(rng.range(-0.15, 0.15));
      g.fillRect(-22, -22, 44, 50);
      g.fillStyle = 'rgba(60,60,80,0.5)';
      for (let l = 0; l < 5; l++) g.fillRect(-16, -14 + l * 8, rng.range(18, 32), 2);
      g.fillStyle = '#c0392b';
      g.beginPath(); g.arc(0, -20, 3, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    g.strokeStyle = '#6b4a2b';
    g.lineWidth = 10;
    g.strokeRect(0, 0, 256, 160);
    return tex(c);
  });
}

/** Bright window: sky and tree tops behind the frame, used emissively for golden-hour light. */
export function windowTex() {
  return cached('window', () => {
    const [c, g] = canvas(128, 192);
    const sky = g.createLinearGradient(0, 0, 0, 192);
    sky.addColorStop(0, '#9cc7ea');
    sky.addColorStop(0.55, '#f6d9a4');
    sky.addColorStop(1, '#f2b46e');
    g.fillStyle = sky;
    g.fillRect(0, 0, 128, 192);
    g.fillStyle = 'rgba(70,110,60,0.85)';
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.arc(i * 26 + 6, 165 + (i % 2) * 8, 26, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#e8e2d6';
    g.fillRect(0, 0, 128, 6); g.fillRect(0, 186, 128, 6);
    g.fillRect(0, 0, 6, 192); g.fillRect(122, 0, 6, 192);
    g.fillRect(61, 0, 6, 192); g.fillRect(0, 70, 128, 5);
    return tex(c);
  });
}

export function directoryTex(lines: string[], title = 'БрГТУ') {
  return cached('dir' + lines.join(), () => {
    const [c, g] = canvas(128, 256);
    g.fillStyle = '#f2f2ee';
    g.fillRect(0, 0, 128, 256);
    g.fillStyle = '#2b3f6b';
    g.fillRect(0, 0, 128, 70);
    g.fillStyle = '#fff';
    hexLogo(g, 64, 28, 16);
    g.font = 'bold 15px Nunito, sans-serif';
    g.textAlign = 'center';
    g.fillText(title, 64, 62);
    g.textAlign = 'left';
    g.fillStyle = '#2b3f6b';
    g.font = '13px Nunito, sans-serif';
    lines.forEach((l, i) => {
      g.fillText(l, 10, 100 + i * 26);
      g.fillRect(10, 106 + i * 26, 108, 1);
    });
    return tex(c);
  });
}

export function clockFaceTex(text = '23:59') {
  return cached('clock' + text, () => {
    const [c, g] = canvas(128, 128);
    g.fillStyle = '#fbf6ea';
    g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#d23a2a';
    g.font = 'bold 34px JetBrains Mono, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 64, 66);
    return tex(c);
  });
}

export function quizTex() {
  return cached('quiz', () => {
    const [c, g] = canvas(96, 128);
    g.fillStyle = '#fbfaf4';
    g.fillRect(0, 0, 96, 128);
    g.fillStyle = '#9db7d8';
    for (let y = 30; y < 128; y += 12) g.fillRect(6, y, 84, 1.5);
    g.fillStyle = '#d23a2a';
    g.fillRect(16, 0, 1.5, 128);
    g.font = 'bold 30px Russo One, sans-serif';
    g.fillStyle = '#2b3f6b';
    g.textAlign = 'center';
    g.fillText('?', 62, 30);
    g.strokeStyle = '#d23a2a';
    g.lineWidth = 3;
    g.beginPath(); g.arc(70, 100, 14, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#d23a2a';
    g.font = 'bold 16px Nunito, sans-serif';
    g.fillText('2', 70, 106);
    return tex(c);
  });
}

export function drawingTex() {
  return cached('drawing', () => {
    const [c, g] = canvas(192, 136);
    g.fillStyle = '#fbfaf4';
    g.fillRect(0, 0, 192, 136);
    g.strokeStyle = '#2a3a66';
    g.lineWidth = 2;
    g.strokeRect(10, 6, 176, 124);
    g.strokeRect(120, 100, 66, 30);
    g.lineWidth = 1.5;
    g.strokeRect(30, 25, 60, 50);
    g.beginPath(); g.arc(60, 50, 16, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(100, 30); g.lineTo(150, 30); g.lineTo(150, 80); g.lineTo(100, 80); g.closePath(); g.stroke();
    g.setLineDash([4, 3]);
    g.beginPath(); g.moveTo(20, 50); g.lineTo(170, 50); g.stroke();
    return tex(c);
  });
}

export function receiptTex(text: string, bg = '#fbfaf4', fg = '#2b3f6b') {
  return cached('label' + text + bg, () => {
    const [c, g] = canvas(128, 64);
    g.fillStyle = bg;
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = fg;
    g.font = 'bold 26px Russo One, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 64, 34);
    return tex(c);
  });
}

/** Soft radial blob for fake window light pools and ground rings. */
export function radialTex(inner = 'rgba(255,220,150,0.55)', outer = 'rgba(255,220,150,0)') {
  return cached('radial' + inner, () => {
    const [c, g] = canvas(128, 128);
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, inner);
    gr.addColorStop(1, outer);
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return tex(c);
  });
}

// ---------------------------------------------------------------- floors for weeks 4–15

/** Stone pavers in a running bond (main building plaza). */
export function pavingFloor(w: number, h: number) {
  return cached(`paving${w}x${h}`, () => {
    const s = 20;
    const [c, g] = canvas(w * s, h * s);
    const rng = new Rng(31);
    g.fillStyle = '#8a8070';
    g.fillRect(0, 0, c.width, c.height);
    const bw = 1.2 * s, bh = 0.6 * s;
    for (let y = 0, row = 0; y < c.height; y += bh, row++)
      for (let x = row % 2 ? -bw / 2 : 0; x < c.width; x += bw) {
        g.fillStyle = shade(rng.pick(['#c9bca4', '#bfb196', '#d2c6ae']), rng.range(-0.04, 0.03));
        g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
      }
    return tex(c);
  });
}

export function grassFloor(w: number, h: number) {
  return cached(`grass${w}x${h}`, () => {
    const s = 16;
    const [c, g] = canvas(w * s, h * s);
    const rng = new Rng(5);
    g.fillStyle = '#6f9a4a';
    g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < w * h * 6; i++) {
      g.fillStyle = rng.pick(['#628c40', '#7aa855', '#5d8538', '#86b060', '#a7a04a']);
      g.fillRect(rng.range(0, c.width), rng.range(0, c.height), 3, 3);
    }
    return tex(c);
  });
}

export function asphaltFloor(w: number, h: number) {
  return cached(`asphalt${w}x${h}`, () => {
    const s = 16;
    const [c, g] = canvas(w * s, h * s);
    const rng = new Rng(9);
    g.fillStyle = '#4a4a50';
    g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < w * h * 8; i++) {
      g.fillStyle = rng.pick(['#424248', '#55555c', '#3d3d42', '#5c5a58']);
      g.fillRect(rng.range(0, c.width), rng.range(0, c.height), 2, 2);
    }
    // a few cracks
    g.strokeStyle = 'rgba(20,20,22,0.5)';
    for (let i = 0; i < 12; i++) {
      g.beginPath();
      let x = rng.range(0, c.width), y = rng.range(0, c.height);
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += rng.range(-20, 20); y += rng.range(-20, 20); g.lineTo(x, y); }
      g.stroke();
    }
    return tex(c);
  });
}

/** Plank floor without court lines (assembly hall). */
export function woodFloor(w: number, h: number, base = '#b98550') {
  return cached(`wood${w}x${h}${base}`, () => {
    const s = 20;
    const [c, g] = canvas(w * s, h * s);
    const rng = new Rng(13);
    const plank = 0.22 * s;
    for (let y = 0; y < c.height; y += plank) {
      let x = -rng.range(0, 3 * s);
      while (x < c.width) {
        const len = rng.range(1.5, 3.5) * s;
        g.fillStyle = shade(base, rng.range(-0.06, 0.03));
        g.fillRect(x, y, len, plank);
        g.fillStyle = 'rgba(60,30,10,0.2)';
        g.fillRect(x, y + plank - 1, len, 1);
        g.fillRect(x + len - 1, y, 1, plank);
        x += len;
      }
    }
    return tex(c);
  });
}

// ---------------------------------------------------------------- signs and wall graphics

function label(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const [c, g] = canvas(w, h);
  draw(g);
  return tex(c);
}

/** «Зодчие» menu wall above the serving line. */
export function zodchieMenuTex() {
  return cached('zodchie', () => label(512, 128, (g) => {
    g.fillStyle = '#23201f';
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#f2d6a8';
    g.font = 'italic bold 52px Nunito, serif';
    g.textAlign = 'center';
    g.fillText('Зодчие', 130, 78);
    g.strokeStyle = '#f2d6a8';
    g.strokeRect(250, 20, 240, 88);
    g.font = '14px Nunito, sans-serif';
    g.textAlign = 'left';
    ['Борщ ........ 3.20', 'Котлета ..... 2.80', 'Пюре ........ 1.40', 'Компот ...... 0.90'].forEach((s, i) => g.fillText(s, 265, 42 + i * 19));
  }));
}

export function deanSignTex() {
  return cached('deansign', () => label(256, 160, (g) => {
    g.fillStyle = '#ece8e0';
    g.fillRect(0, 0, 256, 160);
    g.fillStyle = '#2b3f6b';
    hexLogo(g, 128, 50, 26);
    g.font = 'bold 26px Russo One, sans-serif';
    g.textAlign = 'center';
    g.fillText('БрГТУ', 128, 108);
    g.font = 'bold 22px Russo One, sans-serif';
    g.fillText('ДЕКАНАТ', 128, 140);
  }));
}

export function facultyBoardTex() {
  return cached('faculty', () => label(160, 256, (g) => {
    g.fillStyle = '#f4f4f0';
    g.fillRect(0, 0, 160, 256);
    g.fillStyle = '#2b3f6b';
    g.fillRect(0, 0, 160, 34);
    g.fillStyle = '#fff';
    g.font = 'bold 15px Nunito, sans-serif';
    g.textAlign = 'center';
    g.fillText('ФАКУЛЬТЕТЫ', 80, 23);
    g.textAlign = 'left';
    g.fillStyle = '#2b3f6b';
    g.font = '12px Nunito, sans-serif';
    ['Машиностроительный', 'Строительный', 'Энергетический', 'Информационных техн.', 'Транспортный', 'Гуманитарный', 'Заочное отделение'].forEach((s, i) => {
      g.fillText(`${i + 1}  ${s}`, 10, 60 + i * 28);
      g.fillRect(10, 66 + i * 28, 140, 1);
    });
  }));
}

export function posterTex() {
  return cached('poster', () => label(128, 180, (g) => {
    g.fillStyle = '#efe6d2';
    g.fillRect(0, 0, 128, 180);
    g.fillStyle = '#c0392b';
    g.beginPath(); g.arc(64, 62, 38, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#efe6d2';
    g.beginPath(); g.arc(64, 62, 22, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c0392b';
    g.font = 'bold 15px Russo One, sans-serif';
    g.textAlign = 'center';
    ['ЗНАНИЯ', 'СТРОЯТ', 'БУДУЩЕЕ'].forEach((s, i) => g.fillText(s, 64, 124 + i * 18));
  }));
}

export function projectorTex() {
  return cached('projector', () => label(256, 160, (g) => {
    g.fillStyle = '#f4f6f8';
    g.fillRect(0, 0, 256, 160);
    g.fillStyle = 'rgba(43,63,107,0.85)';
    hexLogo(g, 128, 66, 30);
    g.font = 'bold 22px Russo One, sans-serif';
    g.textAlign = 'center';
    g.fillText('БрГТУ', 128, 128);
  }));
}

export function whiteboardTex() {
  return cached('whiteboard', () => label(256, 160, (g) => {
    g.fillStyle = '#fbfbf8';
    g.fillRect(0, 0, 256, 160);
    g.strokeStyle = '#2a4a9a';
    g.fillStyle = '#2a4a9a';
    g.font = '15px JetBrains Mono, monospace';
    ['for i = 0..n-1', '  if (a[i] > x)', '    a[i] = x'].forEach((s, i) => g.fillText(s, 16, 30 + i * 20));
    g.strokeRect(150, 80, 70, 30);
    g.beginPath(); g.moveTo(185, 110); g.lineTo(185, 140); g.stroke();
  }));
}

/** Week 6 tasks: a yellow sheet with a task number. */
export function taskTex(star: boolean) {
  return cached('task' + star, () => label(96, 128, (g) => {
    g.fillStyle = star ? '#fff1c8' : '#fdf8e2';
    g.fillRect(0, 0, 96, 128);
    g.fillStyle = '#2b3f6b';
    g.font = 'bold 22px Russo One, sans-serif';
    g.textAlign = 'center';
    g.fillText(star ? '№7*' : '№3', 48, 34);
    g.fillStyle = 'rgba(43,63,107,0.5)';
    for (let i = 0; i < 5; i++) g.fillRect(12, 50 + i * 12, 72 - (i % 2) * 18, 3);
    g.fillStyle = '#2b3f6b';
    g.font = 'bold 18px JetBrains Mono, monospace';
    g.fillText('x = ?', 48, 118);
  }));
}

/** Зачётка (record book) for Week 14 credits. */
export function creditTex() {
  return cached('credit', () => label(96, 128, (g) => {
    g.fillStyle = '#1f3566';
    g.fillRect(0, 0, 96, 128);
    g.strokeStyle = '#d8b84a';
    g.lineWidth = 3;
    g.strokeRect(8, 8, 80, 112);
    g.fillStyle = '#d8b84a';
    g.font = 'bold 15px Russo One, sans-serif';
    g.textAlign = 'center';
    g.fillText('ЗАЧЁТНАЯ', 48, 56);
    g.fillText('КНИЖКА', 48, 76);
  }));
}

/** Building facade for outdoor maps: windows in a grid. */
export function facadeTex(cols: number, rows: number) {
  return cached(`facade${cols}x${rows}`, () => label(cols * 32, rows * 48, (g) => {
    g.fillStyle = '#ddd0b8';
    g.fillRect(0, 0, cols * 32, rows * 48);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const x = c * 32 + 6, y = r * 48 + 8;
        g.fillStyle = '#c9b99e';
        g.fillRect(x - 3, y - 3, 26, 36);
        const sky = g.createLinearGradient(0, y, 0, y + 30);
        sky.addColorStop(0, '#8fb6d8');
        sky.addColorStop(1, '#f2c98a');
        g.fillStyle = sky;
        g.fillRect(x, y, 20, 30);
        g.fillStyle = '#e8e2d6';
        g.fillRect(x + 9, y, 2, 30);
      }
  }));
}

export function universityLetteringTex() {
  return cached('univ', () => label(512, 64, (g) => {
    g.fillStyle = '#d6c9b0';
    g.fillRect(0, 0, 512, 64);
    g.fillStyle = '#4a3a2c';
    g.font = 'bold 18px Russo One, sans-serif';
    g.textAlign = 'center';
    g.fillText('БРЕСТСКИЙ ГОСУДАРСТВЕННЫЙ', 256, 26);
    g.fillText('ТЕХНИЧЕСКИЙ УНИВЕРСИТЕТ', 256, 50);
  }));
}
