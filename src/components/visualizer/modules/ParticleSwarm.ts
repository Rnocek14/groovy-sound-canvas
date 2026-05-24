import * as THREE from "three";
import type { ModuleFactory } from "./types";

export const createParticleSwarm: ModuleFactory = ({ scene, palette, events }) => {
  const N = 2200;
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const r = 1 + Math.random() * 3;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = Math.sin(ph) * Math.cos(th) * r;
    pos[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * r;
    pos[i * 3 + 2] = Math.cos(ph) * r;
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uOpacity: { value: 0 }, uBurst: { value: 0 },
      uColorA: { value: new THREE.Color() }, uColorB: { value: new THREE.Color() },
      uSize: { value: 1 },
    },
    vertexShader: `
      attribute float seed;
      uniform float uTime; uniform float uBurst; uniform float uSize;
      varying float vSeed; varying float vDist;
      void main(){
        vSeed = seed;
        vec3 p = position;
        // curl-noise-ish flow
        float t = uTime*0.4 + seed*6.28;
        p += vec3(sin(t + p.y*0.7), cos(t*1.1 + p.z*0.5), sin(t*0.7 + p.x*0.6)) * 0.4;
        // burst outward
        vec3 dir = normalize(p + 0.0001);
        p += dir * uBurst * (1.0 + seed);
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (uSize * 90.0) / max(-mv.z, 0.5);
      }`,
    fragmentShader: `
      uniform float uOpacity; uniform vec3 uColorA; uniform vec3 uColorB;
      varying float vSeed; varying float vDist;
      void main(){
        vec2 c = gl_PointCoord - 0.5; float d = length(c);
        if (d > 0.5) discard;
        float a = (1.0 - d*2.0);
        vec3 col = mix(uColorA, uColorB, vSeed);
        gl_FragColor = vec4(col, a * uOpacity);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);

  let intensity = 0;
  let burst = 0;
  const offB = events.on("beat", () => { burst = Math.min(1, burst + 0.3); });
  const offD = events.on("drop", () => { burst = 1; });
  return {
    id: "particle-swarm",
    layer: "mid",
    setIntensity(v) { intensity = v; points.visible = v > 0.02; },
    update(t, dt, f) {
      burst *= Math.pow(0.001, dt);
      mat.uniforms.uTime.value = t;
      mat.uniforms.uOpacity.value = intensity * (0.7 + f.level * 0.5);
      mat.uniforms.uBurst.value = burst * (1 + f.bass * 0.5);
      mat.uniforms.uSize.value = 0.7 + f.treble * 1.2;
      (mat.uniforms.uColorA.value as THREE.Color).copy(palette.get(0));
      (mat.uniforms.uColorB.value as THREE.Color).copy(palette.get(2));
      points.rotation.y += dt * (0.05 + f.mid * 0.2);
      points.rotation.x += dt * 0.02;
    },
    dispose() { offB(); offD(); geo.dispose(); mat.dispose(); scene.remove(points); },
  };
};
