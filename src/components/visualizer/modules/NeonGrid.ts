import * as THREE from "three";
import type { ModuleFactory } from "./types";

export const createNeonGrid: ModuleFactory = ({ scene, palette }) => {
  const geo = new THREE.PlaneGeometry(80, 220, 30, 100);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
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
        vec2 g = fract(vec2(vUv.x*30.0, vUv.y*100.0 + uTime*3.0));
        float lineX = smoothstep(0.0, 0.05, g.x) * smoothstep(0.05, 0.0, g.x-0.05);
        float lineY = smoothstep(0.0, 0.05, g.y) * smoothstep(0.05, 0.0, g.y-0.05);
        float line = 1.0 - min(lineX, lineY);
        vec3 col = mix(uColorA, uColorB, vUv.y);
        float fade = smoothstep(0.0, 0.25, vUv.y);
        gl_FragColor = vec4(col * line * fade * (0.8 + uBass*1.2), uOpacity);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -3;
  scene.add(mesh);
  let intensity = 0;
  return {
    id: "neon-grid",
    layer: "bg",
    setIntensity(v) { intensity = v; mesh.visible = v > 0.02; },
    update(t, _dt, f) {
      mat.uniforms.uTime.value = t;
      mat.uniforms.uBass.value = f.bass;
      mat.uniforms.uOpacity.value = intensity;
      (mat.uniforms.uColorA.value as THREE.Color).copy(palette.get(0));
      (mat.uniforms.uColorB.value as THREE.Color).copy(palette.get(2));
    },
    dispose() { geo.dispose(); mat.dispose(); scene.remove(mesh); },
  };
};
