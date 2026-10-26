import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Post-processing for every screen: bloom on lights and effects, then a grade (contrast,
// saturation, a warm lift in the shadows) and a vignette. "Quality: low" skips all of it.

const GRADE = {
  uniforms: { tDiffuse: { value: null }, contrast: { value: 1.08 }, saturation: { value: 1.12 }, vignette: { value: 0.32 }, tint: { value: new THREE.Color(1.03, 1.0, 0.96) } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float contrast; uniform float saturation; uniform float vignette; uniform vec3 tint;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb * tint;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, saturation);
      col = (col - 0.5) * contrast + 0.5;
      float d = distance(vUv, vec2(0.5));
      col *= 1.0 - vignette * smoothstep(0.35, 0.85, d);
      gl_FragColor = vec4(max(col, 0.0), c.a);
    }`,
};

let quality: 'high' | 'low' = 'high';
try { quality = localStorage.getItem('burnout.fx') === 'low' ? 'low' : 'high'; } catch { /* storage blocked */ }

export class Post {
  private composer: EffectComposer;
  private pass: RenderPass;
  private bloom: UnrealBloomPass;

  constructor(private renderer: THREE.WebGLRenderer) {
    const size = renderer.getSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.pass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.4, 0.92);
    this.composer.addPass(this.pass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(new ShaderPass(GRADE));
  }

  static get quality() { return quality; }
  static set quality(q: 'high' | 'low') {
    quality = q;
    try { localStorage.setItem('burnout.fx', q); } catch { /* storage blocked */ }
  }

  /** a scene's own look: bloom strength and threshold (resetLook() returns to the defaults) */
  setLook(strength: number, threshold: number) {
    this.bloom.strength = strength;
    this.bloom.threshold = threshold;
  }
  resetLook() { this.setLook(0.32, 0.92); }

  setSize(w: number, h: number) {
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
  }

  render(scene: THREE.Scene, camera: THREE.Camera) {
    if (quality === 'low') { this.renderer.render(scene, camera); return; }
    this.pass.scene = scene;
    this.pass.camera = camera;
    this.composer.render();
  }
}
