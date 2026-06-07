import * as THREE from "three";
import type { ModuleFactory, VModule } from "../types";
import { MediaBank } from "../../media/MediaBank";

// Slit-scan: sample texture rows at time-offset. Audio level expands slit width.
export const createSlitScan: ModuleFactory = ({ scene }): VModule => {
  const geo = new THREE.PlaneGeometry(2, 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uTex: { value: MediaBank.getFallback() },
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uLevel: { value: 0 },
      uTreble: { value: 0 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.997, 1.0); }`,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uTex;
      uniform float uTime, uIntensity, uLevel, uTreble;
      void main(){
        vec2 uv = vUv;
        // time-shift per row
        float t = uTime * (0.3 + uTreble*1.2);
        float shift = sin(uv.y * 8.0 + t) * (0.15 + uLevel*0.4);
        uv.x = fract(uv.x + shift);
        // vertical squash bands driven by level
        float band = 0.5 + 0.5 * sin(uv.x * 40.0 + t * 2.0);
        uv.y = fract(uv.y + band * 0.05 * uLevel);
        vec3 col = texture2D(uTex, uv).rgb;
        // chromatic aberration on the slit edges
        float ca = 0.01 * uLevel;
        col.r = texture2D(uTex, uv + vec2(ca, 0.0)).r;
        col.b = texture2D(uTex, uv - vec2(ca, 0.0)).b;
        col *= 0.8 + uIntensity*0.5;
        gl_FragColor = vec4(col, uIntensity);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -700;
  scene.add(mesh);

  let intensity = 0;
  let currentTex: THREE.Texture | null = null;
  let lastSwap = 0;
  let audioPhase = 0;

  return {
    id: "media-slitscan",
    layer: "bg",
    setIntensity(v){ intensity = v; mat.uniforms.uIntensity.value = v; mesh.visible = v > 0.01; },
    update(t, dt, f){
      if (!currentTex || (intensity > 0.01 && t - lastSwap > 6 + Math.random() * 6)) {
        currentTex = MediaBank.pick();
        mat.uniforms.uTex.value = currentTex;
        lastSwap = t;
      }
      const gate = Math.min(1, f.level * 4);
      audioPhase += dt * (f.treble * 1.4 + f.level * 1.0 + f.bass * 0.7) * gate;
      mat.uniforms.uTime.value = audioPhase;
      mat.uniforms.uLevel.value = f.level;
      mat.uniforms.uTreble.value = f.treble;
    },
    dispose(){ scene.remove(mesh); geo.dispose(); mat.dispose(); },
  };
};
