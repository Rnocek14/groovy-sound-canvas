import * as THREE from "three";
import type { ModuleFactory } from "./types";

export const createRibbonField: ModuleFactory = ({ scene, palette }) => {
  const COUNT = 48;
  const SEG = 60;
  const group = new THREE.Group();
  const ribbons: { line: THREE.Line; mat: THREE.LineBasicMaterial; seed: number }[] = [];
  for (let i = 0; i < COUNT; i++) {
    const pos = new Float32Array(SEG * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    group.add(line);
    ribbons.push({ line, mat, seed: Math.random() });
  }
  scene.add(group);
  let intensity = 0;
  let audioPhase = 0;

  return {
    id: "ribbon-field",
    layer: "mid",
    setIntensity(v) { intensity = v; group.visible = v > 0.02; },
    update(_t, dt, f) {
      const gate = Math.min(1, f.level * 4);
      audioPhase += dt * (f.mid * 1.4 + f.bass * 1.0 + f.level * 0.6) * gate;
      const tp = audioPhase;
      const amp = 1 + f.level * 2.5;
      const twist = 1 + f.mid * 3;
      for (let i = 0; i < ribbons.length; i++) {
        const r = ribbons[i];
        const arr = (r.line.geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
        const phase = r.seed * Math.PI * 2;
        const offs = (i / ribbons.length - 0.5) * 6;
        for (let s = 0; s < SEG; s++) {
          const u = s / SEG;
          const x = offs + Math.sin(tp * 0.9 + phase + u * twist * 4) * amp;
          const y = Math.sin(tp * 1.2 + phase + u * 6) * amp;
          const z = -u * 14;
          arr[s * 3] = x; arr[s * 3 + 1] = y; arr[s * 3 + 2] = z;
        }
        (r.line.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
        r.mat.color.copy(palette.get(i % 4));
        r.mat.opacity = intensity * (0.5 + f.level * 0.5);
      }
      group.rotation.z = Math.sin(tp * 0.5) * 0.4;
    },
    dispose() {
      for (const r of ribbons) { r.line.geometry.dispose(); r.mat.dispose(); }
      scene.remove(group);
    },
  };
};
