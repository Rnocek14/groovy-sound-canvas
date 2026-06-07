import * as THREE from "three";
import type { AudioFrame } from "@/lib/audio/AudioEngine";

export type CameraBehavior =
  | "dolly-forward"
  | "slow-orbit"
  | "free-roam"
  | "spin"
  | "snap-zoom"
  | "side-track"
  | "barrel-roll";

const ALL: CameraBehavior[] = [
  "dolly-forward", "slow-orbit", "free-roam", "spin", "snap-zoom", "side-track", "barrel-roll",
];

export class CameraDirector {
  private camera: THREE.PerspectiveCamera;
  private bias: CameraBehavior[];
  private cur: CameraBehavior = "dolly-forward";
  private next: CameraBehavior = "dolly-forward";
  private mix = 1;
  private kick = 0; // 0..1 short impulse (snap zoom / barrel)
  private kickKind: "zoom" | "roll" = "zoom";
  private rollPhase = 0;
  private driftPhase = 0;

  constructor(camera: THREE.PerspectiveCamera, bias?: CameraBehavior[]) {
    this.camera = camera;
    this.bias = bias && bias.length ? bias : ALL;
  }
  pick(force?: CameraBehavior) {
    const pool = this.bias;
    const choice = force ?? pool[Math.floor(Math.random() * pool.length)];
    this.next = choice;
    this.mix = 0;
  }
  impulse(kind: "zoom" | "roll" = "zoom") {
    this.kick = 1;
    this.kickKind = kind;
    if (kind === "roll") this.rollPhase = 0;
  }
  update(t: number, dt: number, f: AudioFrame) {
    const gate = Math.min(1, f.level * 4);
    this.driftPhase += dt * (f.level * 0.6 + f.bass * 0.9 + f.mid * 0.2) * gate;
    const mt = this.driftPhase;
    if (this.mix < 1) {
      this.mix = Math.min(1, this.mix + dt * 1.2);
      if (this.mix >= 1) this.cur = this.next;
    }
    const A = this.cur, B = this.next;
    const w = this.mix;
    const apos = new THREE.Vector3();
    const bpos = new THREE.Vector3();
    let fovA = 70, fovB = 70;
    let rzA = 0, rzB = 0;
    const lookA = new THREE.Vector3();
    const lookB = new THREE.Vector3();
    const apply = (b: CameraBehavior, out: THREE.Vector3, look: THREE.Vector3, fovBox: { v: number }, rzBox: { v: number }) => {
      switch (b) {
        case "dolly-forward":
          out.set(Math.sin(mt * 0.43) * 0.5, Math.cos(mt * 0.31) * 0.4, 4 - f.bass * 1.1);
          look.set(0, 0, -10);
          fovBox.v = 70 + f.bass * 12;
          rzBox.v = Math.sin(mt * 0.2) * 0.05;
          break;
        case "slow-orbit": {
          const r = 5;
          const a = mt * 0.18;
          out.set(Math.sin(a) * r, Math.sin(mt * 0.12) * 1.2, Math.cos(a) * r);
          look.set(0, 0, 0);
          fovBox.v = 55 + f.bass * 8;
          rzBox.v = Math.sin(mt * 0.1) * 0.03;
          break;
        }
        case "free-roam":
          out.set(Math.sin(mt * 0.27) * 3 + Math.sin(mt * 0.91) * 1.2,
                  Math.cos(mt * 0.31) * 2 + Math.cos(mt * 0.71) * 0.8,
                  3 + Math.sin(mt * 0.13) * 2);
          look.set(Math.sin(mt * 0.5) * 1.5, 0, -2);
          fovBox.v = 65 + Math.sin(mt * 0.4) * 5 + f.bass * 5;
          rzBox.v = Math.sin(mt * 0.3) * 0.08;
          break;
        case "spin":
          out.set(Math.sin(mt * 0.6) * 3, Math.cos(mt * 0.5) * 2, 5);
          look.set(0, 0, 0);
          fovBox.v = 75;
          rzBox.v = mt * 0.45;
          break;
        case "snap-zoom":
          out.set(0, 0, 6.5 - f.level * 1.5);
          look.set(0, 0, 0);
          fovBox.v = 60 - f.bass * 18;
          rzBox.v = Math.sin(mt * 0.4) * 0.04;
          break;
        case "side-track":
          out.set(Math.sin(mt * 0.4) * 4, 0.5, 4.5);
          look.set(Math.cos(mt * 0.4) * 1.5, 0, -2);
          fovBox.v = 75;
          rzBox.v = Math.sin(mt * 0.6) * 0.07;
          break;
        case "barrel-roll":
          out.set(0, 0, 5);
          look.set(0, 0, 0);
          fovBox.v = 80;
          rzBox.v = mt * 0.7;
          break;
      }
    };
    const fa = { v: fovA }, ra = { v: rzA };
    const fb = { v: fovB }, rb = { v: rzB };
    apply(A, apos, lookA, fa, ra);
    apply(B, bpos, lookB, fb, rb);
    const pos = apos.lerp(bpos, w);
    const look = lookA.lerp(lookB, w);
    let fov = fa.v + (fb.v - fa.v) * w;
    let rz = ra.v + (rb.v - ra.v) * w;

    // kick impulse
    if (this.kick > 0) {
      this.kick *= Math.pow(0.001, dt);
      if (this.kickKind === "zoom") fov -= this.kick * 22;
      else { this.rollPhase += dt * 8; rz += Math.sin(this.rollPhase) * this.kick * 0.8; }
    }

    this.camera.position.copy(pos);
    this.camera.lookAt(look);
    this.camera.rotation.z += rz;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }
}
