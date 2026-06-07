import * as THREE from "three";
import type { ModuleFactory, VModule } from "./types";

/**
 * Waveform tracer — reads the time-domain audio samples and draws them as
 * two overlapping line strips:
 *   1) Polar ring (closed loop), pulsing with the beat
 *   2) Cartesian horizon (oscilloscope line) across the middle
 *
 * This is the single most legible music→visual mapping (every classic
 * visualizer has it). Always-on top-layer overlay.
 */
export const createWaveform: ModuleFactory = ({ scene, palette }) => {
  const SAMPLES = 256; // downsampled from analyser.time
  const group = new THREE.Group();

  // Polar ring
  const ringGeom = new THREE.BufferGeometry();
  const ringPos = new Float32Array((SAMPLES + 1) * 3);
  ringGeom.setAttribute("position", new THREE.BufferAttribute(ringPos, 3));
  const ringMat = new THREE.LineBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const ring = new THREE.LineLoop(ringGeom, ringMat);
  ring.renderOrder = 999;
  group.add(ring);

  // Cartesian horizon
  const lineGeom = new THREE.BufferGeometry();
  const linePos = new Float32Array(SAMPLES * 3);
  lineGeom.setAttribute("position", new THREE.BufferAttribute(linePos, 3));
  const lineMat = new THREE.LineBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const line = new THREE.Line(lineGeom, lineMat);
  line.renderOrder = 999;
  group.add(line);

  group.position.set(0, 0, -6);
  scene.add(group);

  let intensity = 0;
  let pulseR = 1.4; // current ring radius

  const mod: VModule = {
    id: "waveform",
    layer: "fg",
    setIntensity: (v) => { intensity = v; },
    update: (_t, dt, f) => {
      if (intensity < 0.01) {
        ring.visible = false;
        line.visible = false;
        return;
      }
      ring.visible = true;
      line.visible = true;
      const td = f.time;
      if (!td || td.length === 0) return;
      const step = Math.max(1, Math.floor(td.length / SAMPLES));

      // Ring radius pulses on beat, breathes with bass.
      const tgtR = 1.3 + f.bass * 0.45 + (f.bassTransient ?? 0) * 0.6;
      pulseR += (tgtR - pulseR) * Math.min(1, dt * 12);
      const amp = 0.18 + f.level * 0.25 + (f.midTransient ?? 0) * 0.4;

      const rp = ringGeom.attributes.position as THREE.BufferAttribute;
      const lp = lineGeom.attributes.position as THREE.BufferAttribute;

      for (let i = 0; i < SAMPLES; i++) {
        const s = (td[i * step] - 128) / 128; // -1..1
        // polar ring
        const ang = (i / SAMPLES) * Math.PI * 2;
        const r = pulseR + s * amp;
        rp.setXYZ(i, Math.cos(ang) * r, Math.sin(ang) * r, 0);
        // horizon
        const x = (i / (SAMPLES - 1) - 0.5) * 4.2;
        const y = s * (0.6 + f.level * 0.6);
        lp.setXYZ(i, x, y, 0);
      }
      // close the ring loop
      rp.setXYZ(SAMPLES, rp.getX(0), rp.getY(0), 0);
      rp.needsUpdate = true;
      lp.needsUpdate = true;

      // Color from palette, brightness pulses on beat
      const c0 = palette.get(0).getHex();
      const c1 = palette.get(1).getHex();
      ringMat.color.setHex(c0);
      lineMat.color.setHex(c1);
      ringMat.opacity = (0.6 + (f.bassTransient ?? 0) * 0.5) * intensity;
      lineMat.opacity = (0.5 + f.level * 0.4) * intensity;
    },
    dispose: () => {
      scene.remove(group);
      ringGeom.dispose(); ringMat.dispose();
      lineGeom.dispose(); lineMat.dispose();
    },
  };
  return mod;
};
