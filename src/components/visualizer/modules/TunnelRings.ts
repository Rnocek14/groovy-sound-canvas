import * as THREE from "three";
import type { ModuleFactory } from "./types";

export const createTunnelRings: ModuleFactory = ({ scene, palette, events }) => {
  const RING_COUNT = 70;
  const RING_SPACING = 1.4;
  const group = new THREE.Group();
  const ringGeo = new THREE.TorusGeometry(5, 0.08, 10, 96);
  const mats: THREE.ShaderMaterial[] = [];
  const meshes: THREE.Mesh[] = [];
  const ringVS = `
    uniform float uTime; uniform float uBass; uniform float uMid; uniform float uIndex;
    void main(){
      vec3 p = position;
      float a = atan(p.y, p.x);
      float wob = sin(a*3.0 + uTime*1.3 + uIndex*0.4) * 0.25
                + sin(a*5.0 - uTime*0.8) * 0.15;
      float r = length(p.xy);
      vec2 dir = vec2(cos(a), sin(a));
      p.xy = dir * (r + wob * (0.5 + uBass*1.6 + uMid*0.6));
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`;
  const ringFS = `
    uniform vec3 uColor; uniform float uOpacity; uniform float uBass;
    void main(){
      gl_FragColor = vec4(uColor * (0.7 + uBass*0.8), uOpacity);
    }`;
  for (let i = 0; i < RING_COUNT; i++) {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: { value: 0 }, uBass: { value: 0 }, uMid: { value: 0 }, uIndex: { value: i },
        uColor: { value: new THREE.Color() }, uOpacity: { value: 1 },
      },
      vertexShader: ringVS, fragmentShader: ringFS,
    });
    const m = new THREE.Mesh(ringGeo, mat);
    m.position.z = -i * RING_SPACING;
    group.add(m);
    mats.push(mat);
    meshes.push(m);
  }
  scene.add(group);

  let intensity = 0;
  let speedBoost = 0;
  const off = events.on("beat", () => { speedBoost = Math.min(2, speedBoost + 0.4); });

  return {
    id: "tunnel-rings",
    layer: "mid",
    setIntensity(v) { intensity = v; group.visible = v > 0.02; },
    update(t, dt, f) {
      const speed = (5 + f.level * 14 + f.bass * 12) * (1 + speedBoost);
      speedBoost *= Math.pow(0.001, dt);
      for (let i = 0; i < meshes.length; i++) {
        const m = meshes[i];
        m.position.z += speed * dt;
        if (m.position.z > 2) m.position.z -= RING_COUNT * RING_SPACING;
        const u = mats[i].uniforms;
        u.uTime.value = t; u.uBass.value = f.bass; u.uMid.value = f.mid;
        (u.uColor.value as THREE.Color).copy(palette.get(i % 4, m.position.z * 0.005));
        u.uOpacity.value = intensity;
        m.rotation.z = t * 0.3 + i * 0.07;
      }
    },
    dispose() {
      off();
      ringGeo.dispose();
      for (const m of mats) m.dispose();
      scene.remove(group);
    },
  };
};
