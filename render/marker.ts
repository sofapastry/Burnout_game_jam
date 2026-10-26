import * as THREE from 'three';

// Kirill is always marked in red: a pulsing ring on the floor and an arrow over his head that
// shows through walls and crowds, so you can find him from inside any body.

let arrowTex: THREE.CanvasTexture | null = null;
function arrowTexture() {
  if (arrowTex) return arrowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    g.shadowColor = 'rgba(255,40,30,0.9)'; g.shadowBlur = 14;
    g.fillStyle = '#ff3a2a';
    g.beginPath(); g.moveTo(24, 30); g.lineTo(104, 30); g.lineTo(64, 98); g.closePath(); g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = '#fff2e8'; g.lineWidth = 5; g.lineJoin = 'round'; g.stroke();
  }
  arrowTex = new THREE.CanvasTexture(c);
  arrowTex.colorSpace = THREE.SRGBColorSpace;
  return arrowTex;
}

export class KirillMarker {
  group = new THREE.Group();
  private ring: THREE.Mesh;
  private arrow: THREE.Sprite;

  constructor(private height = 2.4, radius = 0.75) {
    this.ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.82, radius, 40), new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 3;
    this.arrow = new THREE.Sprite(new THREE.SpriteMaterial({ map: arrowTexture(), transparent: true, depthTest: false, depthWrite: false }));
    this.arrow.scale.setScalar(0.55);
    this.arrow.renderOrder = 20;
    this.group.add(this.ring, this.arrow);
  }

  update(x: number, z: number, time: number, scale = 1) {
    this.ring.position.set(x, 0.05, z);
    const p = 1 + Math.sin(time * 5) * 0.06;
    this.ring.scale.set(p * scale, p * scale, 1);
    this.arrow.position.set(x, this.height * scale + 0.35 + Math.sin(time * 4) * 0.12, z);
  }

  set visible(v: boolean) { this.group.visible = v; }

  dispose() {
    this.group.parent?.remove(this.group);
    this.ring.geometry.dispose();
    (this.ring.material as THREE.Material).dispose();
    this.arrow.material.dispose();
  }
}
