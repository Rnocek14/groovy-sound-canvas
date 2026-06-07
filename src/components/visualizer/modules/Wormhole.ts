import * as THREE from "three";
import type { ModuleFactory } from "./types";

export const createWormhole: ModuleFactory = ({ scene, palette, events }) => {
  const geo = new THREE.CylinderGeometry(2.5, 2.5, 60, 24, 1, true);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true,
    uniforms: {
      uTime: { value: 0 }, uBass: { value: 0 }, uOpacity: { value: 0 },
      uColorA: { value: new THREE.Color() }, uColorB: { value: new THREE.Color() },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime; uniform float uBass; uniform float uOpacity;
      uniform vec3 uColorA; uniform vec3 uColorB;
      void main(){
        float scroll = vUv.y * 12.0 + uTime * (1.5 + uBass*4.0);
        float bands = sin(scroll * 6.28) * 0.5 + 0.5;
        float fine = sin(vUv.x * 80.0 + uTime*2.0) * 0.15;
        vec3 col = mix(uColorA, uColorB, bands);
        float br = bands * (0.5 + uBass*0.8) + fine;
        gl_FragColor = vec4(col * (0.3 + br*1.2), uOpacity);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.z = -25;
  scene.add(mesh);
  let intensity = 0;
  let audioPhase = 0;
  let beatPush = 0;
  const off = events.on("beat", () => { beatPush = Math.min(1.2, beatPush + 0.75); });
  return {
    id: "wormhole",
    layer: "bg",
    setIntensity(v) { intensity = v; mesh.visible = v > 0.02; },
    update(_t, dt, f) {
      const energyGate = Math.min(1, f.level * 4);
      audioPhase += dt * (f.bass * 3.0 + beatPush * 3.0 + f.flux * 1.2) * energyGate;
      beatPush *= Math.pow(0.001, dt);
      mat.uniforms.uTime.value = audioPhase;
      mat.uniforms.uBass.value = f.bass;
      mat.uniforms.uOpacity.value = intensity;
      (mat.uniforms.uColorA.value as THREE.Color).copy(palette.get(0));
      (mat.uniforms.uColorB.value as THREE.Color).copy(palette.get(1));
      mesh.position.z = -25 - beatPush * 1.2;
    },
    dispose() { off(); geo.dispose(); mat.dispose(); scene.remove(mesh); },
  };
};
