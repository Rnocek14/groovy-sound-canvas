import * as THREE from "three";
import type { PresetFactory } from "./types";

export const createChromeTunnel: PresetFactory = ({ canvas, getFrame }) => {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setClearColor(0x07020d, 1);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x07020d, 10, 42);
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);

  // Tunnel of jelly-deformed rings, colors cycling through full HSL
  const RING_COUNT = 70;
  const RING_SPACING = 1.4;
  const rings: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; basePositions: Float32Array }[] = [];
  const ringGeoBase = new THREE.TorusGeometry(5, 0.08, 10, 96);

  const ringVS = `
    uniform float uTime; uniform float uBass; uniform float uIndex;
    varying float vGlow;
    void main(){
      vec3 p = position;
      float a = atan(p.y, p.x);
      float wob = sin(a*3.0 + uTime*1.3 + uIndex*0.4) * 0.25
                + sin(a*5.0 - uTime*0.8) * 0.15;
      float r = length(p.xy);
      vec2 dir = vec2(cos(a), sin(a));
      p.xy = dir * (r + wob * (0.6 + uBass*1.8));
      vGlow = 0.5 + 0.5*sin(a*4.0 + uTime*2.0);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }
  `;
  const ringFS = `
    uniform float uHue; uniform float uBass;
    varying float vGlow;
    vec3 hsv2rgb(vec3 c){
      vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz)*6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }
    void main(){
      vec3 col = hsv2rgb(vec3(uHue, 1.0, 1.0));
      col *= (0.7 + vGlow*0.6) * (0.9 + uBass*0.8);
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  for (let i = 0; i < RING_COUNT; i++) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 },
        uHue: { value: i / RING_COUNT },
        uIndex: { value: i },
      },
      vertexShader: ringVS,
      fragmentShader: ringFS,
    });
    const mesh = new THREE.Mesh(ringGeoBase, mat);
    mesh.position.z = -i * RING_SPACING;
    scene.add(mesh);
    rings.push({ mesh, mat, basePositions: new Float32Array(0) });
  }

  // Neon grid floor
  const gridGeo = new THREE.PlaneGeometry(80, 220, 30, 100);
  const gridMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uBass: { value: 0 }, uHue: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime; uniform float uBass; uniform float uHue;
      vec3 hsv2rgb(vec3 c){
        vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz)*6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
      }
      void main(){
        vec2 g = fract(vec2(vUv.x*30.0, vUv.y*100.0 + uTime*3.0));
        float lineX = smoothstep(0.0, 0.05, g.x) * smoothstep(0.05, 0.0, g.x-0.05);
        float lineY = smoothstep(0.0, 0.05, g.y) * smoothstep(0.05, 0.0, g.y-0.05);
        float line = 1.0 - min(lineX, lineY);
        vec3 a = hsv2rgb(vec3(uHue, 1.0, 1.0));
        vec3 b = hsv2rgb(vec3(uHue + 0.4, 1.0, 1.0));
        vec3 col = mix(a, b, vUv.y);
        float fade = smoothstep(0.0, 0.25, vUv.y);
        gl_FragColor = vec4(col * line * fade * (0.8 + uBass*1.2), 1.0);
      }
    `,
  });
  const grid = new THREE.Mesh(gridGeo, gridMat);
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = -3;
  scene.add(grid);

  // Melting sun on horizon
  const sunGeo = new THREE.CircleGeometry(3.2, 96);
  const sunMat = new THREE.ShaderMaterial({
    uniforms: { uBass: { value: 0 }, uTime: { value: 0 }, uHue: { value: 0 } },
    transparent: true,
    vertexShader: `
      uniform float uTime; uniform float uBass;
      varying vec2 vUv;
      void main(){
        vUv = uv;
        vec3 p = position;
        float a = atan(p.y, p.x);
        float r = length(p.xy);
        float wob = sin(a*6.0 + uTime*1.5) * 0.15 + sin(a*3.0 - uTime) * 0.1;
        r += wob * (0.5 + uBass*1.5);
        p.xy = vec2(cos(a), sin(a)) * r;
        gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv; uniform float uBass; uniform float uTime; uniform float uHue;
      vec3 hsv2rgb(vec3 c){
        vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz)*6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
      }
      void main(){
        vec2 p = vUv - 0.5;
        float d = length(p);
        float band = step(0.02, mod(vUv.y*12.0 - uTime*0.8, 1.0)) * smoothstep(0.5, 0.0, vUv.y);
        vec3 hot = mix(hsv2rgb(vec3(uHue + 0.1, 0.9, 1.0)),
                       hsv2rgb(vec3(uHue + 0.5, 1.0, 1.0)), 1.0 - vUv.y);
        float mask = smoothstep(0.5, 0.47, d);
        float glow = smoothstep(0.6, 0.0, d) * (0.4 + uBass*0.8);
        gl_FragColor = vec4(hot * (mask * (0.7 + band*0.3) + glow), mask + glow*0.7);
      }
    `,
  });
  const sun = new THREE.Mesh(sunGeo, sunMat);
  sun.position.set(0, 0.5, -32);
  scene.add(sun);

  let hue = 0;
  let camShake = 0;

  return {
    resize(w, h, dpr) {
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    render(t, dt) {
      const f = getFrame();
      hue = (hue + dt * (0.04 + f.mid * 0.25)) % 1;

      gridMat.uniforms.uTime.value = t;
      gridMat.uniforms.uBass.value = f.bass;
      gridMat.uniforms.uHue.value = hue;
      sunMat.uniforms.uTime.value = t;
      sunMat.uniforms.uBass.value = f.bass;
      sunMat.uniforms.uHue.value = hue;

      // Always flying through; audio adds
      const speed = 9 + f.level * 16 + f.bass * 12;
      for (let i = 0; i < rings.length; i++) {
        const r = rings[i];
        r.mesh.position.z += speed * dt;
        if (r.mesh.position.z > 2) r.mesh.position.z -= RING_COUNT * RING_SPACING;
        r.mat.uniforms.uTime.value = t;
        r.mat.uniforms.uBass.value = f.bass;
        // hue cycles by distance + global hue drift
        r.mat.uniforms.uHue.value = (hue + r.mesh.position.z * 0.012) % 1;
        r.mesh.rotation.z = t * 0.3 + i * 0.07;
      }

      if (f.beat) camShake = Math.min(1, camShake + 0.6);
      camShake *= Math.pow(0.001, dt);
      // Continuous lazy lissajous orbit so framing never sits still
      camera.position.x = Math.sin(t * 0.43) * 0.6 + Math.sin(t * 1.7) * 0.15 + (Math.random() - 0.5) * camShake * 0.4;
      camera.position.y = Math.cos(t * 0.31) * 0.5 + Math.cos(t * 1.3) * 0.12 + (Math.random() - 0.5) * camShake * 0.4;
      camera.rotation.z = Math.sin(t * 0.2) * 0.15;
      camera.fov = 75 + Math.sin(t * 0.6) * 6 + f.bass * 14;
      camera.updateProjectionMatrix();

      renderer.render(scene, camera);
    },
    dispose() {
      ringGeoBase.dispose();
      for (const r of rings) r.mat.dispose();
      gridGeo.dispose();
      gridMat.dispose();
      sunGeo.dispose();
      sunMat.dispose();
      renderer.dispose();
    },
  };
};
