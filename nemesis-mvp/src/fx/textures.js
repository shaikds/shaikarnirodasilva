// Procedural canvas textures — no external image assets (NFR-1: the game
// must run with zero network dependencies). Generated once at boot.

import * as THREE from 'three';

function canvas(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

// soft radial dot: white-hot core fading to transparent — the base sprite
// for sparks, dust, and glow halos (tinted per-use via material.color)
export const softDot = canvas(64, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
});

// blood droplet: irregular soft blob, darker edge — used for decals + spray
export const bloodBlob = canvas(64, (ctx, s) => {
  ctx.translate(s / 2, s / 2);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = (s / 2) * (0.65 + Math.sin(i * 3.7) * 0.25);
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
});

// flame flicker sprite for landmark braziers
export const flame = canvas(48, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s * 0.6, 0, s / 2, s * 0.6, s / 2);
  g.addColorStop(0, 'rgba(255,240,200,1)');
  g.addColorStop(0.4, 'rgba(255,150,50,0.85)');
  g.addColorStop(1, 'rgba(255,80,20,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(s / 2, s * 0.55, s * 0.34, s * 0.46, 0, 0, Math.PI * 2);
  ctx.fill();
});

// checker + fine grid floor texture — gives real spatial/distance cues
export function makeFloorTexture() {
  const tex = canvas(256, (ctx, s) => {
    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(0, 0, s, s);
    const cell = s / 8;
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      if ((x + y) % 2 === 0) ctx.fillRect(x * cell, y * cell, cell, cell);
    }
    ctx.strokeStyle = 'rgba(110,110,190,0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(s, i * cell); ctx.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(30, 30);
  return tex;
}

// vertical gradient sky, used as scene.background
export function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#0c0c1c');
  g.addColorStop(0.55, '#08080f');
  g.addColorStop(1, '#020204');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
