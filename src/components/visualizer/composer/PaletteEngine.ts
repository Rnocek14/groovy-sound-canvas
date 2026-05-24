import * as THREE from "three";

// Curated 4-color palettes (HSL-ish picks)
const PALETTES: number[][] = [
  [0xff00ff, 0x00ffff, 0x9b51ff, 0xff3da4], // vaporwave
  [0xff5e3a, 0xff2a68, 0xffdb4d, 0xff8c42], // sunset
  [0x00ffd1, 0x00b3ff, 0x7c4dff, 0xff00aa], // cyber
  [0x39ff14, 0xfff200, 0x00f0ff, 0xff00ff], // acid
  [0xff006e, 0xfb5607, 0xffbe0b, 0x8338ec], // neon pop
  [0xc7f9cc, 0x80ed99, 0x57cc99, 0x38a3a5], // mint chrome
  [0xffffff, 0xff3366, 0x33ddff, 0xffe066], // hi-contrast
  [0xff4d6d, 0xc9184a, 0x7400b8, 0x5a189a], // deep berry
];

export class PaletteEngine {
  private a: THREE.Color[] = [];
  private b: THREE.Color[] = [];
  private cur: THREE.Color[] = [];
  private mix = 1;
  private rotation = 0;
  constructor(initialIndex = 0) {
    this.a = PALETTES[initialIndex].map((h) => new THREE.Color(h));
    this.b = this.a.map((c) => c.clone());
    this.cur = this.a.map((c) => c.clone());
  }
  flipTo(index?: number) {
    const i = index ?? Math.floor(Math.random() * PALETTES.length);
    this.b = PALETTES[i].map((h) => new THREE.Color(h));
    this.mix = 0;
  }
  setCustom(hex: string[]) {
    const safe = hex.slice(0, 4).map((s) => {
      try { return new THREE.Color(s); } catch { return new THREE.Color(0xffffff); }
    });
    while (safe.length < 4) safe.push(safe[safe.length - 1] || new THREE.Color(0xffffff));
    this.b = safe;
    this.mix = 0;
  }
  rotateHue(deg: number) {
    this.rotation = (this.rotation + deg / 360) % 1;
  }
  update(dt: number) {
    if (this.mix < 1) {
      this.mix = Math.min(1, this.mix + dt * 0.8);
      for (let i = 0; i < this.cur.length; i++) {
        this.cur[i].copy(this.a[i]).lerp(this.b[i], this.mix);
      }
      if (this.mix >= 1) this.a = this.b.map((c) => c.clone());
    }
  }
  get(i: number, hueShift = 0): THREE.Color {
    const c = this.cur[i % this.cur.length].clone();
    const h = { h: 0, s: 0, l: 0 };
    c.getHSL(h);
    c.setHSL((h.h + this.rotation + hueShift) % 1, h.s, h.l);
    return c;
  }
  hueOffset() { return this.rotation; }
}
