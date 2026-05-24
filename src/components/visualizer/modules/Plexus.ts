import * as THREE from "three";
import type { ModuleFactory } from "./types";

export const createPlexus: ModuleFactory = ({ scene, palette }) => {
  const N = 80;
  const positions: THREE.Vector3[] = [];
  const vel: THREE.Vector3[] = [];
  for (let i = 0; i < N; i++) {
    positions.push(new THREE.Vector3(
      (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 6,
    ));
    vel.push(new THREE.Vector3(
      (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4,
    ));
  }
  // points
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  const pMat = new THREE.PointsMaterial({
    size: 0.12, color: 0xffffff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const points = new THREE.Points(pGeo, pMat);
  // lines (max N*8 connections)
  const MAX_LINES = N * 6;
  const lGeo = new THREE.BufferGeometry();
  const linePos = new Float32Array(MAX_LINES * 2 * 3);
  lGeo.setAttribute("position", new THREE.BufferAttribute(linePos, 3));
  const lMat = new THREE.LineBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const lines = new THREE.LineSegments(lGeo, lMat);
  scene.add(points);
  scene.add(lines);
  let intensity = 0;

  return {
    id: "plexus",
    layer: "mid",
    setIntensity(v) { intensity = v; points.visible = v > 0.02; lines.visible = v > 0.02; },
    update(t, dt, f) {
      const arr = (pGeo.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
      const range = 4.5;
      for (let i = 0; i < N; i++) {
        const p = positions[i], v = vel[i];
        v.x += (Math.random() - 0.5) * 0.1 * dt;
        v.y += (Math.random() - 0.5) * 0.1 * dt;
        v.z += (Math.random() - 0.5) * 0.1 * dt;
        v.multiplyScalar(0.98);
        p.addScaledVector(v, dt * (1 + f.mid * 2));
        if (Math.abs(p.x) > range) v.x -= Math.sign(p.x) * 0.5;
        if (Math.abs(p.y) > range * 0.7) v.y -= Math.sign(p.y) * 0.5;
        if (Math.abs(p.z) > range * 0.8) v.z -= Math.sign(p.z) * 0.5;
        arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
      }
      (pGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;

      const maxDist = 1.4 + f.treble * 1.2;
      const maxDist2 = maxDist * maxDist;
      let li = 0;
      for (let i = 0; i < N && li < MAX_LINES; i++) {
        for (let j = i + 1; j < N && li < MAX_LINES; j++) {
          const a = positions[i], b = positions[j];
          const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < maxDist2) {
            const off = li * 6;
            linePos[off] = a.x; linePos[off + 1] = a.y; linePos[off + 2] = a.z;
            linePos[off + 3] = b.x; linePos[off + 4] = b.y; linePos[off + 5] = b.z;
            li++;
          }
        }
      }
      // zero rest
      for (let k = li * 6; k < MAX_LINES * 6; k++) linePos[k] = 0;
      (lGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;

      pMat.color.copy(palette.get(0));
      lMat.color.copy(palette.get(1));
      pMat.opacity = intensity * 0.9;
      lMat.opacity = intensity * 0.45;
      points.rotation.y += dt * 0.05;
      lines.rotation.y = points.rotation.y;
    },
    dispose() {
      pGeo.dispose(); pMat.dispose(); lGeo.dispose(); lMat.dispose();
      scene.remove(points); scene.remove(lines);
    },
  };
};
