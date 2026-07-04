// Landmark braziers: a warm flickering point light + flame sprite at each
// named zone location. Pure atmosphere, but also a practical navigation
// cue — each location now reads as visually distinct, not just coordinates.

import * as THREE from 'three';
import { flame } from '../fx/textures.js';

const SPOTS = [
  { name: 'tutorialPocket', pos: [-38, 1.6, -2], color: 0xff8844 },
  { name: 'chokepoint', pos: [-28, 1.6, -29], color: 0xff5533 },
  { name: 'openGround', pos: [0, 1.6, -30], color: 0xffaa55 },
  { name: 'rivalBase', pos: [30, 1.8, -42], color: 0xff3344 },
  { name: 'arenaGate', pos: [0, 1.6, -13], color: 0xffcc66 },
];

export class Landmarks {
  constructor(scene) {
    this.lights = [];
    for (const s of SPOTS) {
      const light = new THREE.PointLight(s.color, 1.8, 9, 2);
      light.position.set(...s.pos);
      scene.add(light);

      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: flame, color: s.color, transparent: true,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      sprite.scale.set(0.6, 0.8, 1);
      sprite.position.set(s.pos[0], s.pos[1] - 0.15, s.pos[2]);
      scene.add(sprite);

      this.lights.push({ light, sprite, base: light.intensity, seed: Math.random() * 10 });
    }
  }

  update(t) {
    for (const l of this.lights) {
      const flicker = Math.sin(t * 9 + l.seed) * 0.15 + Math.sin(t * 23 + l.seed) * 0.08;
      l.light.intensity = l.base + flicker;
      l.sprite.scale.set(0.55 + flicker * 0.3, 0.75 + flicker * 0.4, 1);
    }
  }
}
