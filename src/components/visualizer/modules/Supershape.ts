import * as THREE from "three";
import type { ModuleFactory } from "./types";

export const createSupershape: ModuleFactory = ({ scene, palette, events }) => {
  // Build an icosahedron and displace via shader using superformula-like rules
  const geo = new THREE.IcosahedronGeometry(1.4, 5);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 }, uBass: { value: 0 }, uTreble: { value: 0 },
      uM: { value: 6 }, uOpacity: { value: 0 },
      uColorA: { value: new THREE.Color() }, uColorB: { value: new THREE.Color() },
    },
    vertexShader: `
      uniform float uTime; uniform float uBass; uniform float uTreble; uniform float uM;
      varying vec3 vN; varying float vBand;
      // simple superformula radius (m, n1, n2, n3)
      float superR(float phi, float m, float n1, float n2, float n3){
        float a = abs(cos(m*phi/4.0));
        float b = abs(sin(m*phi/4.0));
        return pow(pow(a,n2) + pow(b,n3), -1.0/n1);
      }
      void main(){
        vec3 p = normalize(position);
        float lat = asin(p.y);
        float lon = atan(p.z, p.x);
        float m = uM + sin(uTime*0.3)*3.0;
        float r1 = superR(lat, m, 0.4 + uBass*0.6, 1.0, 1.0);
        float r2 = superR(lon, m, 0.4 + uTreble*0.6, 1.0, 1.0);
        float r = clamp(r1*r2, 0.3, 2.0) * 1.4;
        vec3 disp = p * r;
        vN = normalize(normalMatrix * normalize(disp));
        vBand = r;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(disp,1.0);
      }`,
    fragmentShader: `
      varying vec3 vN; varying float vBand;
      uniform float uOpacity; uniform vec3 uColorA; uniform vec3 uColorB;
      void main(){
        float l = max(dot(vN, normalize(vec3(0.5,0.7,1.0))), 0.0);
        vec3 col = mix(uColorA, uColorB, fract(vBand*0.7));
        gl_FragColor = vec4(col * (0.4 + l*0.9), uOpacity);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);
  let intensity = 0;
  let audioPhase = 0;
  const off = events.on("kaleido-flip", () => { mat.uniforms.uM.value = 3 + Math.floor(Math.random() * 10); });
  return {
    id: "supershape",
    layer: "mid",
    setIntensity(v) { intensity = v; mesh.visible = v > 0.02; },
    update(_t, dt, f) {
      const gate = Math.min(1, f.level * 4);
      audioPhase += dt * (f.mid * 1.3 + f.bass * 1.0) * gate;
      mat.uniforms.uTime.value = audioPhase;
      mat.uniforms.uBass.value = f.bass;
      mat.uniforms.uTreble.value = f.treble;
      mat.uniforms.uOpacity.value = intensity;
      (mat.uniforms.uColorA.value as THREE.Color).copy(palette.get(0));
      (mat.uniforms.uColorB.value as THREE.Color).copy(palette.get(3));
      mesh.rotation.x += dt * (f.mid * 0.6 + f.bass * 0.3) * gate;
      mesh.rotation.y += dt * (f.treble * 0.7 + f.bass * 0.2) * gate;
      mesh.scale.setScalar(1 + f.bass * 0.4);
    },
    dispose() { off(); geo.dispose(); mat.dispose(); scene.remove(mesh); },
  };
};
