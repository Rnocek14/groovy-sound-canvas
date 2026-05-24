import * as THREE from "three";
import type { PresetFactory } from "./types";

export const createChromeTunnel: PresetFactory = ({ canvas, getFrame }) => {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setClearColor(0x07020d, 1);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x07020d, 8, 38);
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
  camera.position.set(0, 0, 0);

  // Tunnel: stack of torus rings
  const rings: THREE.Mesh[] = [];
  const ringGeo = new THREE.TorusGeometry(5, 0.06, 8, 64);
  const ringMatA = new THREE.MeshBasicMaterial({ color: 0xff2bd6 });
  const ringMatB = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
  const RING_COUNT = 60;
  const RING_SPACING = 1.6;
  for (let i = 0; i < RING_COUNT; i++) {
    const m = new THREE.Mesh(ringGeo, i % 2 ? ringMatA : ringMatB);
    m.position.z = -i * RING_SPACING;
    scene.add(m);
    rings.push(m);
  }

  // Neon grid floor
  const gridGeo = new THREE.PlaneGeometry(60, 200, 30, 100);
  const gridMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uBass: { value: 0 } },
    vertexShader: `
      varying vec2 vUv; varying float vZ;
      void main(){ vUv = uv; vec3 p = position; vZ = p.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }
    `,
    fragmentShader: `
      varying vec2 vUv; varying float vZ;
      uniform float uTime; uniform float uBass;
      void main(){
        vec2 g = fract(vec2(vUv.x*30.0, vUv.y*100.0 + uTime*2.0));
        float line = min(smoothstep(0.0, 0.04, g.x) * smoothstep(0.04, 0.0, g.x-0.04),
                          smoothstep(0.0, 0.04, g.y) * smoothstep(0.04, 0.0, g.y-0.04));
        line = 1.0 - line;
        vec3 col = mix(vec3(1.0, 0.16, 0.84), vec3(0.0, 0.94, 1.0), vUv.y);
        float fade = smoothstep(0.0, 0.2, vUv.y);
        gl_FragColor = vec4(col * line * fade * (0.8 + uBass*1.2), 1.0);
      }
    `,
  });
  const grid = new THREE.Mesh(gridGeo, gridMat);
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = -3;
  scene.add(grid);

  // Sun
  const sunGeo = new THREE.CircleGeometry(3, 64);
  const sunMat = new THREE.ShaderMaterial({
    uniforms: { uBass: { value: 0 }, uTime: { value: 0 } },
    transparent: true,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vUv; uniform float uBass; uniform float uTime;
      void main(){
        vec2 p = vUv - 0.5;
        float d = length(p);
        float band = step(0.02, mod(vUv.y*10.0 - uTime*0.5, 1.0)) * smoothstep(0.5, 0.0, vUv.y);
        vec3 hot = mix(vec3(1.0, 0.85, 0.2), vec3(1.0, 0.2, 0.55), 1.0 - vUv.y);
        float mask = smoothstep(0.5, 0.48, d);
        float glow = smoothstep(0.55, 0.0, d) * (0.4 + uBass*0.6);
        gl_FragColor = vec4(hot * (mask * (0.7 + band*0.3) + glow), mask + glow*0.6);
      }
    `,
  });
  const sun = new THREE.Mesh(sunGeo, sunMat);
  sun.position.set(0, 0.5, -30);
  scene.add(sun);

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
      gridMat.uniforms.uTime.value = t;
      gridMat.uniforms.uBass.value = f.bass;
      sunMat.uniforms.uTime.value = t;
      sunMat.uniforms.uBass.value = f.bass;

      const speed = 6 + f.level * 14 + f.bass * 10;
      for (const r of rings) {
        r.position.z += speed * dt;
        if (r.position.z > 2) r.position.z -= RING_COUNT * RING_SPACING;
        const k = (r.position.z + 30) * 0.1;
        const s = 1 + Math.sin(k * 2 + t * 2) * 0.08 + f.bass * 0.15;
        r.scale.setScalar(s);
        r.rotation.z = t * 0.2 + k;
      }

      if (f.beat) camShake = Math.min(1, camShake + 0.6);
      camShake *= Math.pow(0.001, dt);
      camera.position.x = Math.sin(t * 0.7) * 0.15 + (Math.random() - 0.5) * camShake * 0.3;
      camera.position.y = Math.cos(t * 0.5) * 0.15 + (Math.random() - 0.5) * camShake * 0.3;
      camera.fov = 75 + f.bass * 12;
      camera.updateProjectionMatrix();

      renderer.render(scene, camera);
    },
    dispose() {
      ringGeo.dispose();
      ringMatA.dispose();
      ringMatB.dispose();
      gridGeo.dispose();
      gridMat.dispose();
      sunGeo.dispose();
      sunMat.dispose();
      renderer.dispose();
    },
  };
};
