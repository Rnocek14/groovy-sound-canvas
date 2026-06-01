import * as THREE from "three";
import type { ModuleFactory, VModule } from "../types";
import { MediaBank } from "../../media/MediaBank";

// Grid of N×N tiles, each a random crop of a random media. Swaps tiles on beat.
export const createCollageStrobe: ModuleFactory = ({ scene }): VModule => {
  const geo = new THREE.PlaneGeometry(2, 2);
  // up to 16 tiles (4×4). uTex0..uTex15 + per-tile offset/scale.
  const N = 16;
  const uniforms: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
    uIntensity: { value: 0 },
    uGrid: { value: 4 }, // grid size
    uBeat: { value: 0 },
    uBass: { value: 0 },
  };
  for (let i = 0; i < N; i++) {
    uniforms[`uTex${i}`] = { value: MediaBank.getFallback() };
    uniforms[`uOff${i}`] = { value: new THREE.Vector4(Math.random(), Math.random(), 0.6 + Math.random() * 0.4, 0) };
  }

  // GLSL ES 1.0 disallows assigning samplers to locals — sample directly in each branch.
  let sampleBranches = "";
  for (let i = 0; i < N; i++) {
    sampleBranches += `${i === 0 ? "if" : "else if"} (idx == ${i}) { off = uOff${i}; vec2 uv = off.xy + local * off.z; col = texture2D(uTex${i}, fract(uv)).rgb; }\n`;
  }

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.996, 1.0); }`,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;
      uniform float uTime, uIntensity, uGrid, uBeat, uBass;
      ${Array.from({ length: N }, (_, i) => `uniform sampler2D uTex${i}; uniform vec4 uOff${i};`).join("\n")}
      void main(){
        vec2 cell = floor(vUv * uGrid);
        vec2 local = fract(vUv * uGrid);
        int idx = int(cell.y * uGrid + cell.x);
        if (idx >= 16) idx = idx - 16;
        vec3 col = vec3(0.0);
        vec4 off = vec4(0.0);
        ${sampleBranches}
        // strobe on beat - invert random tiles
        float r = fract(sin(dot(cell, vec2(12.9898,78.233))) * 43758.5453);
        if (r < uBeat * 0.4) col = 1.0 - col;
        // gutters
        float gut = step(0.04, local.x) * step(local.x, 0.96) * step(0.04, local.y) * step(local.y, 0.96);
        col *= gut;
        col *= 0.8 + uBass*0.6 + uIntensity*0.4;
        gl_FragColor = vec4(col, uIntensity);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -750;
  scene.add(mesh);

  let intensity = 0;
  let beatPulse = 0;
  let lastBeatSwap = 0;
  let gridTarget = 4;

  const reshuffle = () => {
    const texes = MediaBank.pickMultiple(N);
    for (let i = 0; i < N; i++) {
      (uniforms[`uTex${i}`] as THREE.IUniform).value = texes[i];
      (uniforms[`uOff${i}`] as THREE.IUniform).value = new THREE.Vector4(
        Math.random(), Math.random(), 0.4 + Math.random() * 0.5, 0
      );
    }
  };
  reshuffle();

  return {
    id: "media-collage",
    layer: "mid",
    setIntensity(v){ intensity = v; uniforms.uIntensity.value = v; mesh.visible = v > 0.01; },
    update(t, dt, f){
      uniforms.uTime.value = t;
      uniforms.uBass.value = f.bass;
      if (f.beat && t - lastBeatSwap > 0.18) {
        lastBeatSwap = t;
        beatPulse = 1;
        // swap a few tiles every beat, full shuffle on drop
        if (f.drop) {
          reshuffle();
          gridTarget = [2,3,4,4,5][Math.floor(Math.random()*5)];
        } else {
          const swaps = 2 + Math.floor(Math.random() * 4);
          for (let i = 0; i < swaps; i++) {
            const idx = Math.floor(Math.random() * N);
            (uniforms[`uTex${idx}`] as THREE.IUniform).value = MediaBank.pick();
            (uniforms[`uOff${idx}`] as THREE.IUniform).value = new THREE.Vector4(
              Math.random(), Math.random(), 0.4 + Math.random() * 0.5, 0
            );
          }
        }
      }
      beatPulse *= Math.pow(0.001, dt * 2);
      uniforms.uBeat.value = beatPulse;
      uniforms.uGrid.value += (gridTarget - uniforms.uGrid.value) * 0.05;
    },
    dispose(){ scene.remove(mesh); geo.dispose(); mat.dispose(); },
  };
};
