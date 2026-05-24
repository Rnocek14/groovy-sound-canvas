import * as THREE from "three";
import type { AudioFrame } from "@/lib/audio/AudioEngine";
import { EventBus } from "./EventBus";
import { PaletteEngine } from "./PaletteEngine";
import { CameraDirector } from "./CameraDirector";
import { RemixDirector } from "./RemixDirector";
import { POOLS } from "./presetPools";
import type { PresetId } from "../presets/types";
import type { VModule } from "../modules/types";

export class Composer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private rt!: THREE.WebGLRenderTarget;
  private postScene = new THREE.Scene();
  private postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private postMat: THREE.ShaderMaterial;
  private postQuad: THREE.Mesh;

  private events = new EventBus();
  private palette: PaletteEngine;
  private cam: CameraDirector;
  private director: RemixDirector;

  private all: VModule[] = [];
  private active: VModule[] = [];
  private active_intensity = new Map<string, number>(); // smoothed
  private active_target = new Map<string, number>();
  private pool: typeof POOLS[PresetId];

  // post-effect state
  private kaleido = 0;
  private warp = 0;
  private chroma = 0;
  private flash = 0;
  private invert = 0;
  private kaleidoSeg = 6;

  constructor(canvas: HTMLCanvasElement, preset: PresetId) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.autoClear = false;
    this.pool = POOLS[preset];
    this.renderer.setClearColor(this.pool.bgColor, 1);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);
    this.scene.fog = new THREE.Fog(this.pool.bgColor, 10, 60);

    this.rt = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: true });

    this.palette = new PaletteEngine(this.pool.initialPalette);
    this.cam = new CameraDirector(this.camera, this.pool.cameraBias);
    this.cam.pick();
    this.director = new RemixDirector({ events: this.events });

    // Build all modules up front (cheap; intensity controls visibility)
    for (const f of this.pool.factories) {
      const m = f({ scene: this.scene, palette: this.palette, events: this.events });
      m.setIntensity(0);
      this.all.push(m);
    }
    this.remix(true);

    // Wire event handlers
    this.events.on("remix", () => this.remix(false));
    this.events.on("palette-flip", () => this.palette.flipTo());
    this.events.on("kaleido-flip", () => {
      this.kaleidoSeg = 3 + Math.floor(Math.random() * 10);
      this.kaleido = Math.max(this.kaleido, (this.pool.postBias.kaleido ?? 0.3) + Math.random() * 0.5);
    });
    this.events.on("flash", () => { this.flash = Math.max(this.flash, 0.7); });
    this.events.on("invert", () => { this.invert = Math.max(this.invert, 0.5); });
    this.events.on("snap-zoom", () => this.cam.impulse("zoom"));
    this.events.on("drop", () => {
      this.flash = 1;
      if (Math.random() < 0.5) this.palette.flipTo();
      if (Math.random() < 0.3) this.cam.impulse("roll");
      else this.cam.impulse("zoom");
    });
    this.events.on("skip", () => this.remix(false));

    // Post-process quad
    this.postMat = new THREE.ShaderMaterial({
      uniforms: {
        uTex: { value: this.rt.texture },
        uTime: { value: 0 },
        uKaleido: { value: 0 },
        uSeg: { value: 6 },
        uWarp: { value: 0 },
        uChroma: { value: 0 },
        uScanlines: { value: this.pool.postBias.scanlines ?? 0 },
        uGlitch: { value: this.pool.postBias.glitch ?? 0 },
        uFlash: { value: 0 },
        uInvert: { value: 0 },
        uBass: { value: 0 },
        uVignette: { value: 0.4 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uTex;
        uniform float uTime, uKaleido, uSeg, uWarp, uChroma;
        uniform float uScanlines, uGlitch, uFlash, uInvert, uBass, uVignette;
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
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        void main(){
          vec2 uv = vUv;
          // kaleido
          vec2 kuv = kaleido(uv, uSeg);
          uv = mix(uv, kuv, uKaleido);
          // warp
          uv += vec2(sin(uv.y*6.0 + uTime*0.8), cos(uv.x*6.0 - uTime*0.7)) * uWarp * 0.02;
          // glitch slice
          if (uGlitch > 0.05) {
            float band = step(0.97, hash(vec2(floor(uv.y*40.0), floor(uTime*10.0))));
            uv.x += band * (hash(vec2(uTime, uv.y)) - 0.5) * 0.1 * uGlitch;
          }
          // chroma
          float c = uChroma * (0.003 + uBass*0.01);
          vec3 col;
          col.r = texture2D(uTex, uv + vec2(c, 0.0)).r;
          col.g = texture2D(uTex, uv).g;
          col.b = texture2D(uTex, uv - vec2(c, 0.0)).b;
          // scanlines
          if (uScanlines > 0.05) {
            float sl = 0.85 + 0.15 * sin(vUv.y * 800.0);
            col *= mix(1.0, sl, uScanlines);
          }
          // static (only if glitch)
          if (uGlitch > 0.05) {
            float n = hash(vUv + uTime) - 0.5;
            col += n * 0.08 * uGlitch;
          }
          // invert
          col = mix(col, 1.0 - col, uInvert);
          // flash
          col += vec3(uFlash);
          // vignette
          float vd = distance(vUv, vec2(0.5)) * 1.4;
          col *= 1.0 - smoothstep(0.5, 1.2, vd) * uVignette;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat);
    this.postScene.add(this.postQuad);

    // initial post bias
    this.kaleido = this.pool.postBias.kaleido ?? 0;
    this.warp = this.pool.postBias.warp ?? 0;
    this.chroma = this.pool.postBias.chroma ?? 0;
  }

  private remix(initial: boolean) {
    const pool = this.all.slice();
    // shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    // pick at least one bg, prefer variety of layers
    const pick: VModule[] = [];
    const target = this.pool.activeCount;
    const layers = new Set<string>();
    for (const m of pool) {
      if (pick.length >= target) break;
      if (layers.has(m.layer) && Math.random() < 0.4) continue;
      pick.push(m);
      layers.add(m.layer);
    }
    // ensure bg present
    if (!pick.some((m) => m.layer === "bg")) {
      const bg = pool.find((m) => m.layer === "bg");
      if (bg) {
        pick.pop();
        pick.push(bg);
      }
    }
    this.active = pick;
    const activeIds = new Set(pick.map((m) => m.id));
    this.active_target.clear();
    for (const m of this.all) this.active_target.set(m.id, activeIds.has(m.id) ? 1 : 0);

    this.cam.pick();
    if (!initial) {
      this.flash = Math.max(this.flash, 0.5);
      // randomize post bias
      if (Math.random() < 0.5) this.kaleido = (this.pool.postBias.kaleido ?? 0) + Math.random() * 0.4;
      else this.kaleido = this.pool.postBias.kaleido ?? 0;
      this.warp = (this.pool.postBias.warp ?? 0) + Math.random() * 0.4;
    }
  }

  skip() { this.events.emit("skip"); }

  resize(w: number, h: number, dpr: number) {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.rt.setSize(Math.floor(w * dpr), Math.floor(h * dpr));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(t: number, dt: number, f: AudioFrame) {
    this.director.update(t, f);
    this.palette.update(dt);
    this.cam.update(t, dt, f);

    // smooth module intensities
    const k = 1 - Math.pow(0.001, dt * 2);
    for (const m of this.all) {
      const cur = this.active_intensity.get(m.id) ?? 0;
      const tgt = this.active_target.get(m.id) ?? 0;
      const nv = cur + (tgt - cur) * k;
      this.active_intensity.set(m.id, nv);
      m.setIntensity(nv);
      m.update(t, dt, f, nv);
    }

    // decay post effects
    this.flash *= Math.pow(0.001, dt);
    this.invert *= Math.pow(0.0001, dt);
    // kaleido slowly relaxes to base
    const baseK = this.pool.postBias.kaleido ?? 0;
    this.kaleido += (baseK - this.kaleido) * (1 - Math.pow(0.5, dt * 0.5));

    const u = this.postMat.uniforms;
    u.uTime.value = t;
    u.uKaleido.value = this.kaleido;
    u.uSeg.value = this.kaleidoSeg;
    u.uWarp.value = this.warp + f.mid * 0.2;
    u.uChroma.value = this.chroma + f.bass * 0.2;
    u.uFlash.value = this.flash * 0.6;
    u.uInvert.value = this.invert > 0.1 ? 1 : 0;
    u.uBass.value = f.bass;

    // render scene to RT
    this.renderer.setRenderTarget(this.rt);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.scene, this.camera);
    // post to screen
    this.renderer.setRenderTarget(null);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.postScene, this.postCamera);
  }

  dispose() {
    for (const m of this.all) m.dispose();
    this.rt.dispose();
    (this.postQuad.geometry as THREE.BufferGeometry).dispose();
    this.postMat.dispose();
    this.renderer.dispose();
    this.events.clear();
  }
}
