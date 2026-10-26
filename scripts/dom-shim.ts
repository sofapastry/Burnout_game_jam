// Minimal browser for headless runs: happy-dom for the DOM, a do-nothing stand-in for
// canvas 2D and WebAudio (textures and sounds are drawn into the void).
import { Window } from 'happy-dom';

const win = new Window({ url: 'http://localhost/', width: 1280, height: 720 });
const g = globalThis as Record<string, unknown>;

// anything → itself; numbers coerce to 0
const anything: unknown = new Proxy(function () {}, {
  get: (_t, p) => (p === Symbol.toPrimitive ? () => 0 : p === 'then' ? undefined : anything),
  apply: () => anything,
  construct: () => anything as object,
  set: () => true,
});

for (const k of ['window', 'document', 'HTMLElement', 'HTMLCanvasElement', 'Event', 'KeyboardEvent', 'MouseEvent', 'Node', 'localStorage']) {
  Object.defineProperty(g, k, { value: (win as unknown as Record<string, unknown>)[k], configurable: true, writable: true });
}
Object.defineProperty(g, 'navigator', { value: win.navigator, configurable: true });
g.innerWidth = 1280;
g.innerHeight = 720;
g.devicePixelRatio = 1;
g.addEventListener = win.addEventListener.bind(win);
g.removeEventListener = win.removeEventListener.bind(win);
g.AudioContext = function () { return anything; };
(win.HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => anything;
win.document.body.innerHTML = '<canvas id="view"></canvas><div id="world-ui"></div><div id="ui"></div>';

export { win };
