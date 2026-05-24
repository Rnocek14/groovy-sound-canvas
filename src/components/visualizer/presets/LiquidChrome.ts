import * as THREE from "three";
import type { PresetFactory } from "./types";

export const createLiquidChrome: PresetFactory = ({ canvas, getFrame }) => {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setClearColor(0x000000, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 4.5);

  // Iridescent blob via custom shader (no env map needed)
  const geo = new THREE.IcosahedronGeometry(1, 48);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBass: { value: 0 },
      uTreble: { value: 0 },
      uLevel: { value: 0 },
    },
    vertexShader: `
      uniform float uTime; uniform float uBass; uniform float uTreble;
      varying vec3 vN; varying vec3 vP;
      // simplex-ish cheap noise
      vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
      vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
      vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
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
      void main(){
        float n = snoise(position * (1.2 + uTreble*1.5) + vec3(uTime*0.4));
        float disp = n * (0.25 + uBass*0.6);
        vec3 p = position + normal * disp;
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vP = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vN; varying vec3 vP;
      uniform float uTime; uniform float uLevel;
      vec3 iri(float t){
        return 0.5 + 0.5*cos(6.2831*(vec3(0.0,0.33,0.67) + t));
      }
      void main(){
        vec3 V = normalize(-vP);
        float fres = pow(1.0 - max(dot(vN, V), 0.0), 2.5);
        vec3 R = reflect(-V, vN);
        float t = R.y*0.5 + R.x*0.3 + uTime*0.1;
        vec3 col = iri(t) * (0.4 + uLevel*0.9);
        col += iri(t + 0.3) * fres * 1.4;
        col = pow(col, vec3(0.9));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const blob = new THREE.Mesh(geo, mat);
  scene.add(blob);

  // GPU particles
  const PCOUNT = 1200;
  const pPos = new Float32Array(PCOUNT * 3);
  const pVel = new Float32Array(PCOUNT * 3);
  for (let i = 0; i < PCOUNT; i++) {
    const r = 1.1 + Math.random() * 0.4;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pPos[i * 3] = Math.sin(ph) * Math.cos(th) * r;
    pPos[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * r;
    pPos[i * 3 + 2] = Math.cos(ph) * r;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({
    size: 0.02,
    color: 0xffffff,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const points = new THREE.Points(pGeo, pMat);
  scene.add(points);

  return {
    resize(w, h, dpr) {
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    render(t, dt) {
      const f = getFrame();
      mat.uniforms.uTime.value = t;
      mat.uniforms.uBass.value = f.bass;
      mat.uniforms.uTreble.value = f.treble;
      mat.uniforms.uLevel.value = f.level;

      blob.rotation.y += dt * (0.2 + f.mid * 0.6);
      blob.rotation.x += dt * 0.15;
      const s = 1 + f.bass * 0.3;
      blob.scale.setScalar(s);

      // particles drift; on beat: outward burst
      const pos = pGeo.getAttribute("position") as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < PCOUNT; i++) {
        const ix = i * 3;
        if (f.beat) {
          const px = arr[ix], py = arr[ix + 1], pz = arr[ix + 2];
          const r = Math.hypot(px, py, pz) || 1;
          const k = 0.04 + f.bass * 0.12;
          pVel[ix] += (px / r) * k;
          pVel[ix + 1] += (py / r) * k;
          pVel[ix + 2] += (pz / r) * k;
        }
        arr[ix] += pVel[ix];
        arr[ix + 1] += pVel[ix + 1];
        arr[ix + 2] += pVel[ix + 2];
        pVel[ix] *= 0.94;
        pVel[ix + 1] *= 0.94;
        pVel[ix + 2] *= 0.94;
        // pull back toward shell
        const px = arr[ix], py = arr[ix + 1], pz = arr[ix + 2];
        const r = Math.hypot(px, py, pz) || 1;
        const target = 1.3;
        const pull = (target - r) * 0.01;
        arr[ix] += (px / r) * pull;
        arr[ix + 1] += (py / r) * pull;
        arr[ix + 2] += (pz / r) * pull;
      }
      pos.needsUpdate = true;
      points.rotation.y -= dt * 0.1;

      camera.position.z = 4.5 - f.bass * 0.6;
      renderer.render(scene, camera);
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      pGeo.dispose();
      pMat.dispose();
      renderer.dispose();
    },
  };
};
