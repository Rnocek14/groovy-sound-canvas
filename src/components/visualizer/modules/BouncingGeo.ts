import * as THREE from "three";
import type { ModuleFactory } from "./types";

export const createBouncingGeo: ModuleFactory = ({ scene, palette, events }) => {
  const N = 6;
  const group = new THREE.Group();
  type Item = {
    mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial;
    pos: THREE.Vector3; vel: THREE.Vector3; rotAxis: THREE.Vector3; rotSpeed: number;
  };
  const items: Item[] = [];
  const geos = [
    new THREE.IcosahedronGeometry(0.55, 0),
    new THREE.OctahedronGeometry(0.6, 0),
    new THREE.TetrahedronGeometry(0.7, 0),
    new THREE.DodecahedronGeometry(0.55, 0),
    new THREE.BoxGeometry(0.8, 0.8, 0.8),
    new THREE.TorusKnotGeometry(0.4, 0.14, 64, 8),
  ];
  for (let i = 0; i < N; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, metalness: 0.9, roughness: 0.15, transparent: true, opacity: 0,
      emissive: 0x000000, emissiveIntensity: 0.4,
    });
    const mesh = new THREE.Mesh(geos[i % geos.length], mat);
    group.add(mesh);
    items.push({
      mesh, mat,
      pos: new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3),
      vel: new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2),
      rotAxis: new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize(),
      rotSpeed: 0.5 + Math.random() * 1.5,
    });
  }
  scene.add(group);
  const light = new THREE.PointLight(0xffffff, 2, 30);
  light.position.set(0, 4, 4);
  scene.add(light);
  const ambient = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambient);

  let intensity = 0;
  const impulse = () => {
    for (const it of items) {
      it.vel.x += (Math.random() - 0.5) * 4;
      it.vel.y += (Math.random() - 0.5) * 4;
      it.vel.z += (Math.random() - 0.5) * 4;
      it.rotAxis.set(Math.random(), Math.random(), Math.random()).normalize();
    }
  };
  const offD = events.on("drop", impulse);
  const offB = events.on("beat", () => { items[Math.floor(Math.random() * N)].vel.y += 2; });

  const tmpQ = new THREE.Quaternion();
  return {
    id: "bouncing-geo",
    layer: "mid",
    setIntensity(v) {
      intensity = v;
      group.visible = v > 0.02;
      light.visible = v > 0.02;
      ambient.visible = v > 0.02;
    },
    update(_t, dt, f) {
      const bound = 3.2;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        it.vel.y -= 4 * dt * 0.4; // gentle gravity
        it.vel.multiplyScalar(Math.pow(0.6, dt));
        it.pos.addScaledVector(it.vel, dt);
        if (it.pos.x > bound) { it.pos.x = bound; it.vel.x = -Math.abs(it.vel.x) * 0.8; }
        if (it.pos.x < -bound) { it.pos.x = -bound; it.vel.x = Math.abs(it.vel.x) * 0.8; }
        if (it.pos.y > bound * 0.7) { it.pos.y = bound * 0.7; it.vel.y = -Math.abs(it.vel.y) * 0.8; }
        if (it.pos.y < -bound * 0.7) { it.pos.y = -bound * 0.7; it.vel.y = Math.abs(it.vel.y) * 0.8; }
        if (it.pos.z > bound) { it.pos.z = bound; it.vel.z = -Math.abs(it.vel.z) * 0.8; }
        if (it.pos.z < -bound) { it.pos.z = -bound; it.vel.z = Math.abs(it.vel.z) * 0.8; }
        it.mesh.position.copy(it.pos);
        tmpQ.setFromAxisAngle(it.rotAxis, it.rotSpeed * dt * (1 + f.mid * 2));
        it.mesh.quaternion.multiplyQuaternions(tmpQ, it.mesh.quaternion);
        const col = palette.get(i % 4);
        it.mat.color.copy(col);
        it.mat.emissive.copy(col).multiplyScalar(0.4 + f.bass * 0.6);
        it.mat.opacity = intensity;
      }
    },
    dispose() {
      offD(); offB();
      for (const g of geos) g.dispose();
      for (const it of items) it.mat.dispose();
      scene.remove(group); scene.remove(light); scene.remove(ambient);
    },
  };
};
