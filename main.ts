import './style.css';
import { Stage } from './render/stage';
import { Game } from './game/flow';
import { preloadCharacters } from './assets';
import { installIcons } from './ui/icons';

installIcons();

const stage = new Stage(document.getElementById('view') as HTMLCanvasElement);
const game = new Game(stage);

// Fixed 60 Hz simulation, render every frame (GDD §15).
const STEP = 1 / 60;
let acc = 0;
let last = performance.now();

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  while (acc >= STEP) {
    game.update(STEP);
    acc -= STEP;
  }
  game.render();
  stage.render(dt);
  requestAnimationFrame(frame);
}

preloadCharacters().finally(() => {
  game.start();
  requestAnimationFrame(frame);
});

// handy in the console while tuning
Object.assign(window, { __game: game, __stage: stage });
