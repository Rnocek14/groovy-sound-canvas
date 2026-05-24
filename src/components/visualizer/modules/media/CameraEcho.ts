import * as THREE from "three";
import type { ModuleFactory, VModule } from "../types";
import { MediaBank } from "../../media/MediaBank";

/**
 * Dedicated showcase for the live camera feed: Sobel edge-detect +
 * kaleido + RGB split + tempo-locked palette wash + invert pulses.
 * Stays mostly invisible when no camera is attached.
 */
export const createCameraEcho: ModuleFactory = ({ scene, palette }): VModule => {
  const geo = new THREE.PlaneGeometry(2, 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uTex: { value: MediaBank.getFallback() },
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uBass: { value: 0 },
      uTreble: { value: 0 },
      uBeat: { value: 0 },
      uMirror: { value: 0 },
      uSeg: { value: 6 },
      uKaleido: { value: 0.45 },
      uEdge: { value: 0.6 },
      uInvert: { value: 0 },
      uC0: { value: new THREE.Color(0xff00ff) },
      uC1: { value: new THREE.Color(0x00ffff) },
      uC2: { value: new THREE.Color(0xffff00) },
      uAspect: { value: 1.0 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.995, 1.0); }`,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uTex;
      uniform float uTime, uIntensity, uBass, uTreble, uBeat, uMirror;
      uniform float uSeg, uKaleido, uEdge, uInvert, uAspect;
      uniform vec3 uC0, uC1, uC2;

      vec2 kaleido(vec2 uv, float seg){
        vec2 p = uv - 0.5;
        float a = atan(p.y, p.x);
        float r = length(p);
        float pi = 3.14159265;
        float s = 2.0*pi/seg;
        a = mod(a, s);
        a = abs(a - s*0.5);
        return vec2(cos(a), sin(a)) * r + 0.5;
      }

      float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

      float sobel(vec2 uv, vec2 px){
        float tl = lum(texture2D(uTex, uv + vec2(-px.x,  px.y)).rgb);
        float t  = lum(texture2D(uTex, uv + vec2( 0.0,   px.y)).rgb);
        float tr = lum(texture2D(uTex, uv + vec2( px.x,  px.y)).rgb);
        float l  = lum(texture2D(uTex, uv + vec2(-px.x,  0.0)).rgb);
        float r  = lum(texture2D(uTex, uv + vec2( px.x,  0.0)).rgb);
        float bl = lum(texture2D(uTex, uv + vec2(-px.x, -px.y)).rgb);
        float b  = lum(texture2D(uTex, uv + vec2( 0.0,  -px.y)).rgb);
        float br = lum(texture2D(uTex, uv + vec2( px.x, -px.y)).rgb);
        float gx = -tl - 2.0*l - bl + tr + 2.0*r + br;
        float gy = -tl - 2.0*t - tr + bl + 2.0*b + br;
        return clamp(sqrt(gx*gx + gy*gy), 0.0, 1.0);
      }

      void main(){
        vec2 uv = vUv;
        // Mirror selfie horizontally
        if (uMirror > 0.5) uv.x = 1.0 - uv.x;
        // Aspect-correct centered crop so portrait camera fills screen
        vec2 c = uv - 0.5;
        c.x *= uAspect;
        vec2 base = c + 0.5;
        // Kaleido warp
        vec2 kuv = kaleido(base, uSeg);
        vec2 suv = mix(base, kuv, uKaleido);
        // RGB split
        float ca = 0.003 + uBass * 0.012;
        vec3 col;
        col.r = texture2D(uTex, suv + vec2(ca, 0.0)).r;
        col.g = texture2D(uTex, suv).g;
        col.b = texture2D(uTex, suv - vec2(ca, 0.0)).b;
        // Edge wash colored by palette
        float e = sobel(suv, vec2(1.0/640.0));
        vec3 edgeCol = mix(uC0, uC1, sin(uTime*0.6 + e*4.0)*0.5+0.5);
        edgeCol = mix(edgeCol, uC2, uBeat * 0.6);
        col = mix(col, edgeCol, clamp(e * uEdge * (0.8 + uTreble*0.8), 0.0, 1.0));
        // Beat-driven invert flash
        col = mix(col, 1.0 - col, uInvert);
        // Pump
        col *= 0.85 + uBass * 0.5 + uIntensity * 0.3;
        // Vignette
        float v = smoothstep(1.0, 0.3, length(vUv - 0.5));
        col *= mix(0.5, 1.0, v);
        gl_FragColor = vec4(col, uIntensity);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -600; // sits above other media bg modules
  scene.add(mesh);

  let intensity = 0;
  let invertPulse = 0;
  let beatPulse = 0;
  let lastBeat = 0;

  return {
    id: "camera-echo",
    layer: "bg",
    setIntensity(v) {
      intensity = v;
      mat.uniforms.uIntensity.value = v;
      // Hide entirely when no camera attached — don't pollute the scene
      mesh.visible = v > 0.01 && MediaBank.hasCamera();
    },
    update(t, dt, f) {
      const camTex = MediaBank.getCamera();
      if (camTex) {
        mat.uniforms.uTex.value = camTex;
        mat.uniforms.uMirror.value = MediaBank.isCameraMirrored() ? 1.0 : 0.0;
        const v = (camTex as THREE.VideoTexture).image as HTMLVideoElement | undefined;
        if (v && v.videoWidth > 0) {
          const camAspect = v.videoWidth / v.videoHeight;
          const canvasAspect = window.innerWidth / Math.max(1, window.innerHeight);
          mat.uniforms.uAspect.value = camAspect / canvasAspect;
        }
      }
      mesh.visible = intensity > 0.01 && MediaBank.hasCamera();
      if (!mesh.visible) return;

      mat.uniforms.uTime.value = t;
      mat.uniforms.uBass.value = f.bass;
      mat.uniforms.uTreble.value = f.treble;

      if (f.beat && t - lastBeat > 0.15) {
        lastBeat = t;
        beatPulse = 1;
        if (Math.random() < 0.18) invertPulse = 1;
        if (Math.random() < 0.12) {
          mat.uniforms.uSeg.value = [3, 4, 6, 8, 12][Math.floor(Math.random() * 5)];
        }
      }
      beatPulse *= Math.pow(0.001, dt * 4);
      invertPulse *= Math.pow(0.001, dt * 6);
      mat.uniforms.uBeat.value = beatPulse;
      mat.uniforms.uInvert.value = invertPulse > 0.3 ? 1.0 : 0.0;

      // Palette wash from current PaletteEngine
      mat.uniforms.uC0.value.copy(palette.get(0));
      mat.uniforms.uC1.value.copy(palette.get(2));
      mat.uniforms.uC2.value.copy(palette.get(1));
    },
    dispose() {
      scene.remove(mesh);
      geo.dispose();
      mat.dispose();
    },
  };
};
