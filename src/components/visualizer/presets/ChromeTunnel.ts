import * as THREE from "three";
import type { PresetFactory } from "./types";
import { SceneDirector, type SceneState } from "./SceneDirector";

/**
 * Hyperspeed Journey — 5-scene auto-cycling tunnel adventure.
 * scenes: approach -> warp -> break -> corridor -> rebirth
 */
export const createChromeTunnel: PresetFactory = ({ canvas, getFrame }) => {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setClearColor(0x07020d, 1);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x07020d, 10, 55);
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 200);

  const director = new SceneDirector({
    scenes: ["approach", "warp", "break", "corridor", "rebirth"],
    minDuration: 16,
    maxDuration: 26,
    transitionTime: 1.4,
    seed: 7,
  });

  // ---------- Torus ring tunnel (used by approach, warp, break) ----------
  const RING_COUNT = 90;
  const RING_SPACING = 1.4;
  const ringGeo = new THREE.TorusGeometry(5, 0.08, 10, 96);
  const ringVS = `
    uniform float uTime; uniform float uBass; uniform float uMid; uniform float uIndex; uniform float uWarp;
    varying float vGlow;
    void main(){
      vec3 p = position;
      float a = atan(p.y, p.x);
      float wob = sin(a*3.0 + uTime*1.3 + uIndex*0.4) * 0.25
                + sin(a*5.0 - uTime*0.8) * 0.15;
      float r = length(p.xy);
      vec2 dir = vec2(cos(a), sin(a));
      p.xy = dir * (r + wob * (0.5 + uBass*1.6 + uMid*0.6) * uWarp);
      vGlow = 0.5 + 0.5*sin(a*4.0 + uTime*2.0);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }
  `;
  const ringFS = `
    uniform float uHue; uniform float uBass; uniform vec3 uTint;
    varying float vGlow;
    vec3 hsv2rgb(vec3 c){
      vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz)*6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }
    void main(){
      vec3 col = mix(hsv2rgb(vec3(uHue, 1.0, 1.0)), uTint, 0.35);
      col *= (0.7 + vGlow*0.6) * (0.9 + uBass*0.8);
      gl_FragColor = vec4(col, 1.0);
    }
  `;
  type Ring = { mesh: THREE.Mesh; mat: THREE.ShaderMaterial };
  const rings: Ring[] = [];
  for (let i = 0; i < RING_COUNT; i++) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uBass: { value: 0 }, uMid: { value: 0 },
        uHue: { value: i / RING_COUNT }, uIndex: { value: i },
        uWarp: { value: 1 }, uTint: { value: new THREE.Color(1, 1, 1) },
      },
      vertexShader: ringVS, fragmentShader: ringFS, transparent: true,
    });
    const mesh = new THREE.Mesh(ringGeo, mat);
    mesh.position.z = -i * RING_SPACING;
    scene.add(mesh);
    rings.push({ mesh, mat });
  }
  // Branching side passage (corridor scene)
  const branchRings: Ring[] = [];
  for (let i = 0; i < 40; i++) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uBass: { value: 0 }, uMid: { value: 0 },
        uHue: { value: 0.3 + i / 80 }, uIndex: { value: i },
        uWarp: { value: 1 }, uTint: { value: new THREE.Color(0.4, 1, 0.6) },
      },
      vertexShader: ringVS, fragmentShader: ringFS, transparent: true,
    });
    const mesh = new THREE.Mesh(ringGeo, mat);
    mesh.position.set(7, 0, -i * RING_SPACING * 1.1);
    mesh.rotation.y = 0.25;
    mesh.scale.setScalar(0.55);
    mesh.visible = false;
    scene.add(mesh);
    branchRings.push({ mesh, mat });
  }

  // ---------- Hex-prism corridor (corridor scene) ----------
  const hexGeo = new THREE.CylinderGeometry(5, 5, 1.0, 6, 1, true);
  const hexMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true,
    uniforms: { uTime: { value: 0 }, uBass: { value: 0 }, uOpacity: { value: 0 }, uHue: { value: 0.3 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vUv; uniform float uTime; uniform float uBass; uniform float uOpacity; uniform float uHue;
      vec3 hsv2rgb(vec3 c){
        vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz)*6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
      }
      void main(){
        float band = step(0.5, fract(vUv.x*6.0));
        float scroll = fract(vUv.y*3.0 + uTime*1.5);
        float line = smoothstep(0.45, 0.5, scroll) * smoothstep(0.55, 0.5, scroll);
        vec3 col = hsv2rgb(vec3(uHue + band*0.15, 0.9, 1.0));
        gl_FragColor = vec4(col * (line*1.8 + 0.15 + uBass*0.5), uOpacity);
      }
    `,
  });
  type Hex = { mesh: THREE.Mesh };
  const hexes: Hex[] = [];
  for (let i = 0; i < 30; i++) {
    const m = new THREE.Mesh(hexGeo, hexMat);
    m.rotation.x = Math.PI / 2;
    m.position.z = -i * 4 + 4;
    m.visible = false;
    scene.add(m);
    hexes.push({ mesh: m });
  }

  // ---------- Neon grid floor + melting sun (break scene) ----------
  const gridGeo = new THREE.PlaneGeometry(80, 220, 30, 100);
  const gridMat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { uTime: { value: 0 }, uBass: { value: 0 }, uHue: { value: 0 }, uOpacity: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime; uniform float uBass; uniform float uHue; uniform float uOpacity;
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
        gl_FragColor = vec4(col * line * fade * (0.8 + uBass*1.2), uOpacity);
      }
    `,
  });
  const grid = new THREE.Mesh(gridGeo, gridMat);
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = -3;
  grid.visible = false;
  scene.add(grid);

  const sunGeo = new THREE.CircleGeometry(3.6, 96);
  const sunMat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { uBass: { value: 0 }, uTime: { value: 0 }, uHue: { value: 0 }, uOpacity: { value: 0 } },
    vertexShader: `
      uniform float uTime; uniform float uBass; varying vec2 vUv;
      void main(){
        vUv = uv; vec3 p = position;
        float a = atan(p.y, p.x); float r = length(p.xy);
        float wob = sin(a*6.0 + uTime*1.5) * 0.15 + sin(a*3.0 - uTime) * 0.1;
        r += wob * (0.5 + uBass*1.5);
        p.xy = vec2(cos(a), sin(a)) * r;
        gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv; uniform float uBass; uniform float uTime; uniform float uHue; uniform float uOpacity;
      vec3 hsv2rgb(vec3 c){
        vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz)*6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
      }
      void main(){
        vec2 p = vUv - 0.5; float d = length(p);
        float band = step(0.02, mod(vUv.y*12.0 - uTime*0.8, 1.0)) * smoothstep(0.5, 0.0, vUv.y);
        vec3 hot = mix(hsv2rgb(vec3(uHue + 0.1, 0.9, 1.0)),
                       hsv2rgb(vec3(uHue + 0.5, 1.0, 1.0)), 1.0 - vUv.y);
        float mask = smoothstep(0.5, 0.47, d);
        float glow = smoothstep(0.6, 0.0, d) * (0.4 + uBass*0.8);
        gl_FragColor = vec4(hot * (mask * (0.7 + band*0.3) + glow), (mask + glow*0.7) * uOpacity);
      }
    `,
  });
  const sun = new THREE.Mesh(sunGeo, sunMat);
  sun.position.set(0, 0.5, -38);
  sun.visible = false;
  scene.add(sun);

  // ---------- Particle wormhole (rebirth scene) ----------
  const PC = 2200;
  const wormPos = new Float32Array(PC * 3);
  const wormSeed = new Float32Array(PC);
  for (let i = 0; i < PC; i++) {
    const z = -Math.random() * 120;
    const a = Math.random() * Math.PI * 2;
    const r = 1.2 + Math.random() * 4;
    wormPos[i * 3] = Math.cos(a) * r;
    wormPos[i * 3 + 1] = Math.sin(a) * r;
    wormPos[i * 3 + 2] = z;
    wormSeed[i] = Math.random();
  }
  const wormGeo = new THREE.BufferGeometry();
  wormGeo.setAttribute("position", new THREE.BufferAttribute(wormPos, 3));
  wormGeo.setAttribute("seed", new THREE.BufferAttribute(wormSeed, 1));
  const wormMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uHue: { value: 0.75 }, uSpeed: { value: 1 } },
    vertexShader: `
      attribute float seed;
      uniform float uTime; uniform float uSpeed;
      varying float vSeed;
      void main(){
        vSeed = seed;
        vec3 p = position;
        float z = mod(p.z + uTime*8.0*uSpeed + seed*30.0, 120.0) - 60.0;
        float a = atan(p.y, p.x) + uTime*0.6 + seed*6.28;
        float r = length(p.xy) + sin(uTime*2.0 + seed*10.0)*0.2;
        p = vec3(cos(a)*r, sin(a)*r, z);
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 80.0 / max(-mv.z, 0.5);
      }
    `,
    fragmentShader: `
      uniform float uOpacity; uniform float uHue; varying float vSeed;
      vec3 hsv2rgb(vec3 c){
        vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz)*6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
      }
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        float a = (1.0 - d*2.0);
        vec3 col = hsv2rgb(vec3(uHue + vSeed*0.3, 0.8, 1.0));
        gl_FragColor = vec4(col, a * uOpacity);
      }
    `,
  });
  const wormPoints = new THREE.Points(wormGeo, wormMat);
  wormPoints.visible = false;
  scene.add(wormPoints);

  // Smoothed scene visibility + per-scene knobs
  type SceneCfg = {
    rings: number;        // ring opacity 0..1
    branch: number;       // branching rings 0..1
    hex: number;          // hex tunnel 0..1
    grid: number;         // grid+sun 0..1
    worm: number;         // wormhole 0..1
    speedMul: number;     // forward speed multiplier
    fovBase: number;
    paletteHue: number;   // base hue for ring tint
    tint: THREE.Color;    // overlay tint for rings
    ringWarp: number;     // warp amplitude
  };
  const CFG: Record<string, SceneCfg> = {
    approach: { rings: 1, branch: 0, hex: 0, grid: 0, worm: 0, speedMul: 1.0, fovBase: 70, paletteHue: 0.85, tint: new THREE.Color(1, 0.4, 1), ringWarp: 1.0 },
    warp:     { rings: 1, branch: 0, hex: 0, grid: 0, worm: 0, speedMul: 2.4, fovBase: 95, paletteHue: 0.6,  tint: new THREE.Color(0.7, 0.9, 1), ringWarp: 0.6 },
    break:    { rings: 0.5, branch: 0, hex: 0, grid: 1, worm: 0, speedMul: 0.7, fovBase: 78, paletteHue: 0.05, tint: new THREE.Color(1, 0.5, 0.3), ringWarp: 1.4 },
    corridor: { rings: 0.8, branch: 1, hex: 1, grid: 0, worm: 0, speedMul: 1.3, fovBase: 82, paletteHue: 0.3, tint: new THREE.Color(0.5, 1, 0.6), ringWarp: 1.0 },
    rebirth:  { rings: 0.2, branch: 0, hex: 0, grid: 0, worm: 1, speedMul: 1.8, fovBase: 88, paletteHue: 0.75, tint: new THREE.Color(0.8, 0.6, 1), ringWarp: 1.8 },
  };

  // smoothed per-channel opacities
  const cur = { rings: 1, branch: 0, hex: 0, grid: 0, worm: 0, speedMul: 1, fov: 70, hue: 0.85, ringWarp: 1 };
  const tintCur = new THREE.Color(1, 0.4, 1);
  const tintTgt = new THREE.Color();

  let hue = 0;
  let camShake = 0;
  let flash = 0;

  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

  const apply = (s: SceneState, dt: number) => {
    const target = CFG[s.id] ?? CFG.approach;
    // exponential smoothing toward target
    const k = 1 - Math.pow(0.001, dt * 1.6);
    cur.rings = lerp(cur.rings, target.rings, k);
    cur.branch = lerp(cur.branch, target.branch, k);
    cur.hex = lerp(cur.hex, target.hex, k);
    cur.grid = lerp(cur.grid, target.grid, k);
    cur.worm = lerp(cur.worm, target.worm, k);
    cur.speedMul = lerp(cur.speedMul, target.speedMul, k);
    cur.fov = lerp(cur.fov, target.fovBase, k * 0.8);
    cur.hue = lerp(cur.hue, target.paletteHue, k * 0.6);
    cur.ringWarp = lerp(cur.ringWarp, target.ringWarp, k);
    tintTgt.copy(target.tint);
    tintCur.lerp(tintTgt, k);
  };

  return {
    resize(w, h, dpr) {
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    render(t, dt) {
      const f = getFrame();
      const s = director.update(t, f);
      apply(s, dt);

      // drop = visible punctuation
      if (f.drop) {
        flash = 1;
        camShake = Math.min(1, camShake + 0.9);
      }
      flash *= Math.pow(0.002, dt);

      hue = (hue + dt * (0.05 + f.mid * 0.25)) % 1;
      const baseHue = (cur.hue + hue * 0.5) % 1;

      // Toggle visibility cheaply
      for (let i = 0; i < rings.length; i++) rings[i].mesh.visible = cur.rings > 0.02;
      for (let i = 0; i < branchRings.length; i++) branchRings[i].mesh.visible = cur.branch > 0.02;
      for (let i = 0; i < hexes.length; i++) hexes[i].mesh.visible = cur.hex > 0.02;
      grid.visible = cur.grid > 0.02;
      sun.visible = cur.grid > 0.02;
      wormPoints.visible = cur.worm > 0.02;

      // Forward speed (always alive)
      const speed = (6 + f.level * 16 + f.bass * 14) * cur.speedMul;

      // Rings update
      for (let i = 0; i < rings.length; i++) {
        const r = rings[i];
        r.mesh.position.z += speed * dt;
        if (r.mesh.position.z > 2) r.mesh.position.z -= RING_COUNT * RING_SPACING;
        const u = r.mat.uniforms;
        u.uTime.value = t;
        u.uBass.value = f.bass;
        u.uMid.value = f.mid;
        u.uHue.value = (baseHue + r.mesh.position.z * 0.012) % 1;
        u.uWarp.value = cur.ringWarp;
        (u.uTint.value as THREE.Color).copy(tintCur);
        r.mesh.rotation.z = t * 0.3 + i * 0.07;
        r.mat.opacity = cur.rings;
        // fade via alpha in fragment? We multiply by transparent blending — instead scale wob alpha by setting material.opacity? Custom shaders ignore .opacity. Cheap path: scale mesh.
        r.mesh.scale.setScalar(0.4 + cur.rings * 0.6 + (cur.rings > 0.5 ? 0 : 0));
      }
      // Branch rings
      for (let i = 0; i < branchRings.length; i++) {
        const r = branchRings[i];
        r.mesh.position.z += speed * 1.1 * dt;
        if (r.mesh.position.z > 2) r.mesh.position.z -= 40 * RING_SPACING * 1.1;
        const u = r.mat.uniforms;
        u.uTime.value = t; u.uBass.value = f.bass; u.uMid.value = f.mid;
        u.uHue.value = (baseHue + 0.3 + i * 0.02) % 1;
        u.uWarp.value = cur.ringWarp;
        r.mesh.scale.setScalar(0.55 * cur.branch);
      }
      // Hex tunnel
      hexMat.uniforms.uTime.value = t;
      hexMat.uniforms.uBass.value = f.bass;
      hexMat.uniforms.uHue.value = baseHue;
      hexMat.uniforms.uOpacity.value = cur.hex * 0.85;
      for (let i = 0; i < hexes.length; i++) {
        const m = hexes[i].mesh;
        m.position.z += speed * 0.9 * dt;
        if (m.position.z > 4) m.position.z -= 30 * 4;
      }
      // Grid + sun
      gridMat.uniforms.uTime.value = t;
      gridMat.uniforms.uBass.value = f.bass;
      gridMat.uniforms.uHue.value = baseHue;
      gridMat.uniforms.uOpacity.value = cur.grid;
      sunMat.uniforms.uTime.value = t;
      sunMat.uniforms.uBass.value = f.bass;
      sunMat.uniforms.uHue.value = baseHue;
      sunMat.uniforms.uOpacity.value = cur.grid;
      // Wormhole
      wormMat.uniforms.uTime.value = t;
      wormMat.uniforms.uOpacity.value = cur.worm * (0.85 + f.level * 0.4);
      wormMat.uniforms.uHue.value = baseHue;
      wormMat.uniforms.uSpeed.value = cur.speedMul * (1 + f.bass * 1.5);

      // Camera: scene-driven behaviors blended
      const tShake = (Math.random() - 0.5) * camShake * 0.5;
      camShake *= Math.pow(0.001, dt);
      // approach/warp = forward dolly w/ lissajous
      const liss = 0.6 * (1 - cur.speedMul * 0.15);
      camera.position.x = Math.sin(t * 0.43) * liss + Math.sin(t * 1.7) * 0.15 + tShake;
      camera.position.y = Math.cos(t * 0.31) * (0.5 + cur.grid * 0.8) + Math.cos(t * 1.3) * 0.12 + tShake;
      // break: pull up
      camera.position.y += cur.grid * 1.2;
      camera.rotation.z = Math.sin(t * 0.2) * 0.15 + cur.branch * Math.sin(t * 0.6) * 0.25;
      // corridor: bank
      camera.position.x += Math.sin(t * 0.8) * cur.branch * 1.2;
      // rebirth: spin
      camera.rotation.z += cur.worm * t * 0.4;
      camera.fov = cur.fov + Math.sin(t * 0.6) * 4 + f.bass * 10 + flash * 18;
      camera.updateProjectionMatrix();

      // Fog matches scene
      scene.fog = new THREE.Fog(0x07020d, 8 + cur.grid * 6, 42 + cur.worm * 30);
      renderer.setClearColor(0x07020d, 1);

      renderer.render(scene, camera);
    },
    dispose() {
      ringGeo.dispose();
      for (const r of rings) r.mat.dispose();
      for (const r of branchRings) r.mat.dispose();
      hexGeo.dispose(); hexMat.dispose();
      gridGeo.dispose(); gridMat.dispose();
      sunGeo.dispose(); sunMat.dispose();
      wormGeo.dispose(); wormMat.dispose();
      renderer.dispose();
    },
  };
};
