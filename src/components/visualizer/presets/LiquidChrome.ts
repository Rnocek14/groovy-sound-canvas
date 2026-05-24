import * as THREE from "three";
import type { PresetFactory } from "./types";
import { SceneDirector } from "./SceneDirector";

const SNOISE = `
  vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
  vec4 mod289v4(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289v4(((x*34.0)+1.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }
`;

export const createLiquidChrome: PresetFactory = ({ canvas, getFrame }) => {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setClearColor(0x000000, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(0, 0, 4.5);

  const director = new SceneDirector({
    scenes: ["bloom", "wormhole", "shatter-orbit", "liquid-rebirth"],
    minDuration: 15, maxDuration: 25, transitionTime: 1.2, seed: 41,
  });

  // BG
  const bgGeo = new THREE.PlaneGeometry(2, 2);
  const bgMat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uHue: { value: 0 }, uLevel: { value: 0 } },
    vertexShader: `void main(){ gl_Position = vec4(position.xy, 0.999, 1.0); }`,
    fragmentShader: `
      uniform float uTime; uniform float uHue; uniform float uLevel;
      vec3 hsv2rgb(vec3 c){
        vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz)*6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
      }
      void main(){
        vec2 uv = gl_FragCoord.xy / vec2(800.0);
        vec2 p = uv - 0.5;
        float a = atan(p.y, p.x);
        float r = length(p);
        float swirl = sin(a*3.0 + r*8.0 - uTime*0.6);
        float swirl2 = sin(a*5.0 - r*12.0 + uTime*0.8);
        float t = uHue + r*0.3 + swirl*0.1 + swirl2*0.08;
        vec3 col = hsv2rgb(vec3(t, 0.7, 0.55 + uLevel*0.4));
        col *= 0.5 + 0.5*sin(uTime*0.4 + r*6.0);
        gl_FragColor = vec4(col * 0.55, 1.0);
      }
    `,
  });
  const bg = new THREE.Mesh(bgGeo, bgMat); bg.frustumCulled = false; scene.add(bg);

  // Blob
  const geo = new THREE.IcosahedronGeometry(1, 48);
  const blobMat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 }, uBass: { value: 0 }, uTreble: { value: 0 },
      uLevel: { value: 0 }, uHue: { value: 0 }, uExplode: { value: 0 }, uOpacity: { value: 1 },
    },
    vertexShader: `
      uniform float uTime; uniform float uBass; uniform float uTreble; uniform float uExplode;
      varying vec3 vN; varying vec3 vP;
      ${SNOISE}
      void main(){
        float freq = 1.4 + uTreble*2.0 + sin(uTime*0.3)*0.4;
        float n = snoise(position * freq + vec3(uTime*0.5, uTime*0.3, -uTime*0.4));
        float n2 = snoise(position * 3.0 + vec3(-uTime*0.7));
        float disp = n * (0.35 + uBass*0.7) + n2 * 0.08 + uExplode * (0.5 + n*1.5);
        vec3 p = position + normal * disp;
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vP = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vN; varying vec3 vP;
      uniform float uTime; uniform float uLevel; uniform float uHue; uniform float uOpacity;
      vec3 iri(float t){ return 0.5 + 0.5*cos(6.2831*(vec3(0.0,0.33,0.67) + t)); }
      void main(){
        vec3 V = normalize(-vP);
        float fres = pow(1.0 - max(dot(vN, V), 0.0), 2.5);
        vec3 R = reflect(-V, vN);
        float t = R.y*0.5 + R.x*0.3 + uTime*0.15 + uHue;
        vec3 col = iri(t) * (0.5 + uLevel*0.9);
        col += iri(t + 0.3) * fres * 1.5;
        col = pow(col, vec3(0.9));
        gl_FragColor = vec4(col, uOpacity);
      }
    `,
  });
  const blob = new THREE.Mesh(geo, blobMat);
  scene.add(blob);

  // === Chrome wormhole tunnel (cylinder, viewed from inside) ===
  const wormGeo = new THREE.CylinderGeometry(2.5, 2.5, 60, 24, 1, true);
  const wormMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true,
    uniforms: { uTime: { value: 0 }, uBass: { value: 0 }, uOpacity: { value: 0 }, uHue: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vUv; uniform float uTime; uniform float uBass; uniform float uOpacity; uniform float uHue;
      vec3 iri(float t){ return 0.5 + 0.5*cos(6.2831*(vec3(0.0,0.33,0.67) + t)); }
      void main(){
        float scroll = vUv.y * 12.0 + uTime * (1.5 + uBass*4.0);
        float bands = sin(scroll * 6.28) * 0.5 + 0.5;
        float fine = sin(vUv.x * 80.0 + uTime*2.0) * 0.15;
        vec3 col = iri(uHue + vUv.y*0.6 + bands*0.2);
        float br = bands * (0.5 + uBass*0.8) + fine;
        gl_FragColor = vec4(col * (0.3 + br*1.2), uOpacity);
      }
    `,
  });
  const wormhole = new THREE.Mesh(wormGeo, wormMat);
  wormhole.rotation.x = Math.PI / 2;
  wormhole.position.z = -25;
  wormhole.visible = false;
  scene.add(wormhole);

  // Particles
  const PCOUNT = 1400;
  const pPos = new Float32Array(PCOUNT * 3);
  const pVel = new Float32Array(PCOUNT * 3);
  for (let i = 0; i < PCOUNT; i++) {
    const r = 1.2 + Math.random() * 0.5;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pPos[i * 3] = Math.sin(ph) * Math.cos(th) * r;
    pPos[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * r;
    pPos[i * 3 + 2] = Math.cos(ph) * r;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({
    size: 0.022, color: 0xffffff, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const points = new THREE.Points(pGeo, pMat);
  scene.add(points);

  type Cfg = { worm: number; explode: number; blobOpacity: number; particleStreak: number };
  const CFG: Record<string, Cfg> = {
    "bloom":          { worm: 0,    explode: 0,    blobOpacity: 1, particleStreak: 0 },
    "wormhole":       { worm: 1,    explode: 0,    blobOpacity: 0.5, particleStreak: 1 },
    "shatter-orbit":  { worm: 0.3,  explode: 1,    blobOpacity: 0.7, particleStreak: 0.4 },
    "liquid-rebirth": { worm: 0,    explode: 0.2,  blobOpacity: 1, particleStreak: 0 },
  };
  const cur: Cfg = { worm: 0, explode: 0, blobOpacity: 1, particleStreak: 0 };
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

  let hue = 0;
  let burst = 0;

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
      const tgt = CFG[s.id] ?? CFG.bloom;
      const k = 1 - Math.pow(0.001, dt * 1.4);
      cur.worm = lerp(cur.worm, tgt.worm, k);
      cur.explode = lerp(cur.explode, tgt.explode, k);
      cur.blobOpacity = lerp(cur.blobOpacity, tgt.blobOpacity, k);
      cur.particleStreak = lerp(cur.particleStreak, tgt.particleStreak, k);

      hue = (hue + dt * (0.03 + f.mid * 0.15)) % 1;
      if (f.drop) burst = 1;
      burst *= Math.pow(0.001, dt);

      bgMat.uniforms.uTime.value = t;
      bgMat.uniforms.uHue.value = hue;
      bgMat.uniforms.uLevel.value = f.level;

      blobMat.uniforms.uTime.value = t;
      blobMat.uniforms.uBass.value = f.bass;
      blobMat.uniforms.uTreble.value = f.treble;
      blobMat.uniforms.uLevel.value = f.level;
      blobMat.uniforms.uHue.value = hue;
      blobMat.uniforms.uExplode.value = cur.explode * (0.6 + f.bass * 0.8);
      blobMat.uniforms.uOpacity.value = cur.blobOpacity;

      blob.rotation.x = Math.sin(t * 0.31) * 0.6 + t * 0.15;
      blob.rotation.y = Math.cos(t * 0.27) * 0.7 + t * (0.2 + f.mid * 0.6);
      blob.rotation.z = Math.sin(t * 0.19) * 0.4 + cur.explode * t * 0.8;
      const ss = 1 + Math.sin(t * 0.6) * 0.05 + f.bass * 0.3 + burst * 0.3;
      blob.scale.setScalar(ss);

      // Wormhole
      wormhole.visible = cur.worm > 0.02;
      wormMat.uniforms.uTime.value = t;
      wormMat.uniforms.uBass.value = f.bass;
      wormMat.uniforms.uOpacity.value = cur.worm;
      wormMat.uniforms.uHue.value = hue;
      wormhole.position.z = -25 + Math.sin(t * 0.3) * 2;

      // Particles
      const pos = pGeo.getAttribute("position") as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const orbitalK = 0.6 + f.mid * 1.2;
      const streak = cur.particleStreak * (4 + f.bass * 8);
      for (let i = 0; i < PCOUNT; i++) {
        const ix = i * 3;
        const px = arr[ix], py = arr[ix + 1];
        const tx = -py, ty = px;
        const tlen = Math.hypot(tx, ty) || 1;
        const orbStep = orbitalK * dt;
        arr[ix] += (tx / tlen) * orbStep * 0.06;
        arr[ix + 1] += (ty / tlen) * orbStep * 0.06;
        arr[ix + 2] += Math.sin(t * 0.5 + i * 0.01) * dt * 0.04;
        // wormhole streaming
        arr[ix + 2] += streak * dt;
        if (arr[ix + 2] > 4) arr[ix + 2] -= 10;

        if (f.beat || f.drop) {
          const r = Math.hypot(arr[ix], arr[ix + 1], arr[ix + 2]) || 1;
          const kk = 0.04 + f.bass * 0.12 + (f.drop ? 0.2 : 0);
          pVel[ix] += (arr[ix] / r) * kk;
          pVel[ix + 1] += (arr[ix + 1] / r) * kk;
          pVel[ix + 2] += (arr[ix + 2] / r) * kk;
        }
        arr[ix] += pVel[ix];
        arr[ix + 1] += pVel[ix + 1];
        arr[ix + 2] += pVel[ix + 2];
        pVel[ix] *= 0.94; pVel[ix + 1] *= 0.94; pVel[ix + 2] *= 0.94;

        // pull back to shell (weakened during wormhole)
        const pullW = 1 - cur.particleStreak * 0.8;
        const nr = Math.hypot(arr[ix], arr[ix + 1], arr[ix + 2]) || 1;
        const target = 1.4;
        const pull = (target - nr) * 0.01 * pullW;
        arr[ix] += (arr[ix] / nr) * pull;
        arr[ix + 1] += (arr[ix + 1] / nr) * pull;
        arr[ix + 2] += (arr[ix + 2] / nr) * pull;
      }
      pos.needsUpdate = true;
      points.rotation.y -= dt * 0.1;
      pMat.size = 0.022 + cur.particleStreak * 0.04;

      // Camera: pull in during wormhole; orbit otherwise
      const camZ = 4.5 - cur.worm * 3.5 - f.bass * 0.6 + Math.sin(t * 0.3) * 0.2;
      camera.position.x = Math.sin(t * 0.2) * 0.4 * (1 - cur.worm * 0.7);
      camera.position.y = Math.cos(t * 0.17) * 0.3 * (1 - cur.worm * 0.7);
      camera.position.z = camZ;
      camera.lookAt(0, 0, -cur.worm * 5);
      camera.fov = 50 + burst * 20 + cur.worm * 15;
      camera.updateProjectionMatrix();

      renderer.render(scene, camera);
    },
    dispose() {
      geo.dispose(); blobMat.dispose();
      bgGeo.dispose(); bgMat.dispose();
      wormGeo.dispose(); wormMat.dispose();
      pGeo.dispose(); pMat.dispose();
      renderer.dispose();
    },
  };
};
