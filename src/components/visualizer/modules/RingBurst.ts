import * as THREE from "three";
import type { ModuleFactory } from "./types";

export const createRingBurst: ModuleFactory = ({ scene, palette, events }) => {
  const MAX = 12;
  const group = new THREE.Group();
  type Ring = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; age: number; max: number; alive: boolean };
  const rings: Ring[] = [];
  const ringGeo = new THREE.RingGeometry(0.95, 1, 96);
  for (let i = 0; i < MAX; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(ringGeo, mat);
    mesh.visible = false;
    group.add(mesh);
    rings.push({ mesh, mat, age: 0, max: 1.5, alive: false });
  }
  scene.add(group);
  let intensity = 0;
  let pi = 0;
  const spawn = () => {
    if (intensity < 0.1) return;
    const r = rings.find((x) => !x.alive) ?? rings[pi++ % MAX];
    r.alive = true; r.age = 0; r.max = 1.2 + Math.random() * 0.8;
    r.mesh.visible = true;
    r.mesh.position.set(0, 0, -2 - Math.random() * 3);
    r.mesh.rotation.set(0, 0, Math.random() * Math.PI);
    r.mat.color.copy(palette.get(Math.floor(Math.random() * 4)));
  };
  const offB = events.on("beat", spawn);
  const offD = events.on("drop", () => { spawn(); spawn(); spawn(); });
  return {
    id: "ring-burst",
    layer: "fg",
    setIntensity(v) { intensity = v; group.visible = v > 0.02; },
    update(_t, dt, _f) {
      for (const r of rings) {
        if (!r.alive) continue;
        r.age += dt;
        const k = r.age / r.max;
        if (k >= 1) { r.alive = false; r.mesh.visible = false; r.mat.opacity = 0; continue; }
        const s = 0.2 + k * 10;
        r.mesh.scale.set(s, s, 1);
        r.mat.opacity = intensity * (1 - k) * 0.9;
      }
    },
    dispose() {
      offB(); offD(); ringGeo.dispose();
      for (const r of rings) r.mat.dispose();
      scene.remove(group);
    },
  };
};
