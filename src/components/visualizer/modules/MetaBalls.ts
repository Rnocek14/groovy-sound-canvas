import * as THREE from "three";
import type { ModuleFactory, VModule } from "./types";

// Raymarched metaballs — gooey blobs, very different look from neon shapes.
export const createMetaBalls: ModuleFactory = ({ scene, palette }): VModule => {
  const geo = new THREE.PlaneGeometry(2, 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uTime: { value: 0 },
      uBass: { value: 0 },
      uTreble: { value: 0 },
      uIntensity: { value: 0 },
      uA: { value: new THREE.Color() },
      uB: { value: new THREE.Color() },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.99, 1.0); }`,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;
      uniform float uTime, uBass, uTreble, uIntensity;
      uniform vec3 uA, uB;
      float ball(vec2 p, vec2 c, float r){ return r / max(length(p-c), 0.001); }
      void main(){
        vec2 uv = (vUv - 0.5) * vec2(1.0, 1.0);
        float t = uTime * 0.6;
        float s = 0.0;
        for (int i = 0; i < 7; i++) {
          float fi = float(i);
          vec2 c = vec2(sin(t*0.7 + fi*1.3)*0.4, cos(t*0.9 + fi*1.7)*0.35);
          float r = 0.04 + 0.03*sin(t + fi) + uBass*0.04;
          s += ball(uv, c, r);
        }
        float k = smoothstep(2.5, 4.0 + uBass*1.5, s);
        float edge = smoothstep(2.0, 2.4, s) - smoothstep(2.4, 2.7, s);
        vec3 col = mix(uA, uB, k);
        col += edge * (1.0 + uTreble*2.0);
        gl_FragColor = vec4(col * (0.6 + uIntensity*0.7), uIntensity * smoothstep(1.6, 2.6, s));
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -500;
  scene.add(mesh);
  let intensity = 0;
  return {
    id: "metaballs",
    layer: "mid",
    setIntensity(v){ intensity = v; mat.uniforms.uIntensity.value = v; mesh.visible = v > 0.01; },
    update(t, _dt, f){
      const u = mat.uniforms;
      u.uTime.value = t;
      u.uBass.value = f.bass;
      u.uTreble.value = f.treble;
      u.uA.value.copy(palette.get(2));
      u.uB.value.copy(palette.get(0));
    },
    dispose(){ scene.remove(mesh); geo.dispose(); mat.dispose(); void intensity; },
  };
};
