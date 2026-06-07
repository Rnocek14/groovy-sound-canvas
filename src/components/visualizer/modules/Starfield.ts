import * as THREE from "three";
import type { ModuleFactory } from "./types";

export const createStarfield: ModuleFactory = ({ scene, palette }) => {
  const N = 1200;
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 40;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 25;
    pos[i * 3 + 2] = -Math.random() * 60;
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color(1, 1, 1) } },
    vertexShader: `
      attribute float seed; uniform float uTime;
      varying float vS;
      void main(){
        vS = seed;
        vec3 p = position;
        p.z = mod(p.z + uTime * (4.0 + seed*8.0), 60.0) - 60.0;
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (1.0 + seed*2.0) * 30.0 / max(-mv.z, 1.0);
      }`,
    fragmentShader: `
      uniform float uOpacity; uniform vec3 uColor; varying float vS;
      void main(){
        vec2 c = gl_PointCoord - 0.5; float d = length(c);
        if (d > 0.5) discard;
        float a = (1.0 - d*2.0) * (0.5 + vS*0.5);
        gl_FragColor = vec4(uColor, a * uOpacity);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);
  let intensity = 0;
  let audioPhase = 0;
  return {
    id: "starfield",
    layer: "bg",
    setIntensity(v) { intensity = v; points.visible = v > 0.02; },
    update(_t, dt, f) {
      const energyGate = Math.min(1, f.level * 4);
      audioPhase += dt * (f.level * 3.5 + f.bass * 5 + f.flux * 2) * energyGate;
      mat.uniforms.uTime.value = audioPhase;
      mat.uniforms.uOpacity.value = intensity * (0.7 + f.treble * 0.5);
      (mat.uniforms.uColor.value as THREE.Color).copy(palette.get(0)).lerp(new THREE.Color(0xffffff), 0.5);
    },
    dispose() { geo.dispose(); mat.dispose(); scene.remove(points); },
  };
};
