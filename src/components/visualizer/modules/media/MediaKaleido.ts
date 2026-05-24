import * as THREE from "three";
import type { ModuleFactory, VModule } from "../types";
import { MediaBank } from "../../media/MediaBank";

// Radial mirror of a media texture. Beat-driven segment count + rotation.
export const createMediaKaleido: ModuleFactory = ({ scene, events }): VModule => {
  void events;
  const geo = new THREE.PlaneGeometry(2, 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uTex: { value: MediaBank.getFallback() },
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uSeg: { value: 8 },
      uZoom: { value: 1.2 },
      uRot: { value: 0 },
      uBass: { value: 0 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.998, 1.0); }`,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uTex;
      uniform float uTime, uIntensity, uSeg, uZoom, uRot, uBass;
      void main(){
        vec2 p = vUv - 0.5;
        float a = atan(p.y, p.x) + uRot;
        float r = length(p);
        float pi = 3.14159265;
        float s = 2.0*pi/uSeg;
        a = mod(a, s);
        a = abs(a - s*0.5);
        vec2 uv = vec2(cos(a), sin(a)) * r * uZoom + 0.5;
        uv += vec2(sin(uTime*0.3), cos(uTime*0.27)) * 0.05;
        vec3 col = texture2D(uTex, uv).rgb;
        // pump on bass
        col *= 0.7 + uBass*0.8 + uIntensity*0.4;
        gl_FragColor = vec4(col, uIntensity);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -800;
  scene.add(mesh);

  let intensity = 0;
  let segTarget = 8;
  let currentTex: THREE.Texture | null = null;
  let lastSwapBeat = 0;

  return {
    id: "media-kaleido",
    layer: "bg",
    setIntensity(v){ intensity = v; mat.uniforms.uIntensity.value = v; mesh.visible = v > 0.01; },
    update(t, dt, f){
      if (!currentTex || intensity > 0.01 && Math.random() < dt * 0.05) {
        currentTex = MediaBank.pick();
        mat.uniforms.uTex.value = currentTex;
      }
      if (f.beat && t - lastSwapBeat > 0.4) {
        lastSwapBeat = t;
        if (Math.random() < 0.3) segTarget = [3,4,6,8,10,12][Math.floor(Math.random()*6)];
      }
      mat.uniforms.uSeg.value += (segTarget - mat.uniforms.uSeg.value) * 0.1;
      mat.uniforms.uTime.value = t;
      mat.uniforms.uRot.value += dt * (0.1 + f.mid * 0.5);
      mat.uniforms.uZoom.value = 1.1 + Math.sin(t * 0.2) * 0.25 + f.bass * 0.3;
      mat.uniforms.uBass.value = f.bass;
    },
    dispose(){ scene.remove(mesh); geo.dispose(); mat.dispose(); },
  };
};
