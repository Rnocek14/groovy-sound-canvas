import * as THREE from "three";
import type { AudioFrame } from "@/lib/audio/AudioEngine";
import { EventBus } from "./EventBus";
import { PaletteEngine } from "./PaletteEngine";
import { CameraDirector, type CameraBehavior } from "./CameraDirector";
import { RemixDirector } from "./RemixDirector";
import { ArchetypeDirector } from "./ArchetypeDirector";
import { ARCHETYPES, type ArchetypeDef, type ArchetypeId } from "./archetypes";
import { POOLS } from "./presetPools";
import { MediaBank } from "../media/MediaBank";
import type { PresetId } from "../presets/types";
import type { VModule } from "../modules/types";
import type { AIDirection } from "@/lib/visualizer-ai.functions";

export class Composer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private sceneRT!: THREE.WebGLRenderTarget;
  private feedbackTex!: THREE.FramebufferTexture;
  private postScene = new THREE.Scene();
  private postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private postMat: THREE.ShaderMaterial;
  private postQuad: THREE.Mesh;
  private sizeW = 2;
  private sizeH = 2;

  private events = new EventBus();
  private palette: PaletteEngine;
  private cam: CameraDirector;
  private director: RemixDirector;
  private arch: ArchetypeDirector;
  private currentArchetype: ArchetypeDef = ARCHETYPES.house;

  private all: VModule[] = [];
  private active: VModule[] = [];
  private active_intensity = new Map<string, number>();
  private active_target = new Map<string, number>();
  private pool: typeof POOLS[PresetId];
  private hintWeights = new Map<string, number>(); // id -> weight from AI

  // post-effect state (current values, blended toward targets)
  private kaleido = 0; private kaleidoT = 0;
  private warp = 0; private warpT = 0;
  private chroma = 0; private chromaT = 0;
  private scanlines = 0; private scanlinesT = 0;
  private glitch = 0; private glitchT = 0;
  private feedback = 0.6; private feedbackT = 0.6;
  private flash = 0;
  private invert = 0;
  private kaleidoSeg = 6;
  private feedbackReady = false;

  constructor(canvas: HTMLCanvasElement, preset: PresetId) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: false });
    this.renderer.autoClear = false;
    this.pool = POOLS[preset];
    this.renderer.setClearColor(this.pool.bgColor, 1);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);
    this.scene.fog = new THREE.Fog(this.pool.bgColor, 10, 60);

    this.sceneRT = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: true });
    this.feedbackTex = new THREE.FramebufferTexture(2, 2);

    this.palette = new PaletteEngine(this.pool.initialPalette);
    this.cam = new CameraDirector(this.camera, this.pool.cameraBias);
    this.cam.pick();
    // RemixDirector handles micro/meso punctuation; ArchetypeDirector owns macros (bar-locked)
    this.director = new RemixDirector({ events: this.events, macroMin: 40, macroMax: 80 });
    this.arch = new ArchetypeDirector(this.events);
    this.arch.onArchetypeChange((a) => this.applyArchetype(a));

    // Load media bank assets (built-in + restore user uploads)
    MediaBank.init().catch(() => {});

    for (const f of this.pool.factories) {
      const m = f({ scene: this.scene, palette: this.palette, events: this.events });
      m.setIntensity(0);
      this.all.push(m);
    }

    // Initial post bias targets from pool
    this.kaleidoT = this.pool.postBias.kaleido ?? 0;
    this.warpT = this.pool.postBias.warp ?? 0;
    this.chromaT = this.pool.postBias.chroma ?? 0;
    this.scanlinesT = this.pool.postBias.scanlines ?? 0;
    this.glitchT = this.pool.postBias.glitch ?? 0;
    this.feedbackT = this.pool.postBias.feedback ?? 0.5;
    this.kaleido = this.kaleidoT;
    this.warp = this.warpT;
    this.chroma = this.chromaT;
    this.scanlines = this.scanlinesT;
    this.glitch = this.glitchT;
    this.feedback = this.feedbackT;

    this.remix(true);

    this.events.on("remix", () => this.remix(false));
    this.events.on("palette-flip", () => this.palette.flipTo());
    this.events.on("kaleido-flip", () => {
      this.kaleidoSeg = 3 + Math.floor(Math.random() * 10);
      this.kaleidoT = Math.max(this.kaleidoT, 0.3 + Math.random() * 0.5);
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
    this.events.on("ai-direction", (d) => this.applyAI(d as AIDirection));

    this.postMat = new THREE.ShaderMaterial({
      uniforms: {
        uTex: { value: this.sceneRT.texture },
        uPrev: { value: this.feedbackTex },
        uTime: { value: 0 },
        uKaleido: { value: 0 },
        uSeg: { value: 6 },
        uWarp: { value: 0 },
        uChroma: { value: 0 },
        uScanlines: { value: 0 },
        uGlitch: { value: 0 },
        uFlash: { value: 0 },
        uInvert: { value: 0 },
        uBass: { value: 0 },
        uVignette: { value: 0.4 },
        uFeedback: { value: 0.6 },
        uFbReady: { value: 0 },
        uFbZoom: { value: 0 },
        uFbRot: { value: 0 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uTex;
        uniform sampler2D uPrev;
        uniform float uTime, uKaleido, uSeg, uWarp, uChroma;
        uniform float uScanlines, uGlitch, uFlash, uInvert, uBass, uVignette;
        uniform float uFeedback, uFbReady, uFbZoom, uFbRot;
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
        mat2 rot(float a){ float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }
        void main(){
          vec2 uv = vUv;
          vec2 kuv = kaleido(uv, uSeg);
          uv = mix(uv, kuv, uKaleido);
          uv += vec2(sin(uv.y*6.0 + uTime*0.8), cos(uv.x*6.0 - uTime*0.7)) * uWarp * 0.02;
          if (uGlitch > 0.05) {
            float band = step(0.97, hash(vec2(floor(uv.y*40.0), floor(uTime*10.0))));
            uv.x += band * (hash(vec2(uTime, uv.y)) - 0.5) * 0.1 * uGlitch;
          }
          float c = uChroma * (0.003 + uBass*0.01);
          vec3 col;
          col.r = texture2D(uTex, uv + vec2(c, 0.0)).r;
          col.g = texture2D(uTex, uv).g;
          col.b = texture2D(uTex, uv - vec2(c, 0.0)).b;

          // Feedback echo of previous frame (warped + faded)
          if (uFbReady > 0.5 && uFeedback > 0.01) {
            vec2 p = vUv - 0.5;
            p = rot(uFbRot) * p;
            p *= 1.0 - uFbZoom;
            vec2 fuv = p + 0.5;
            vec3 prev = texture2D(uPrev, fuv).rgb;
            // screen-blend so bright trails stay bright
            vec3 fade = prev * (0.86 + uFeedback*0.12);
            col = 1.0 - (1.0 - col) * (1.0 - fade * uFeedback);
          }

          if (uScanlines > 0.05) {
            float sl = 0.85 + 0.15 * sin(vUv.y * 800.0);
            col *= mix(1.0, sl, uScanlines);
          }
          if (uGlitch > 0.05) {
            float n = hash(vUv + uTime) - 0.5;
            col += n * 0.08 * uGlitch;
          }
          col = mix(col, 1.0 - col, uInvert);
          col += vec3(uFlash);
          float vd = distance(vUv, vec2(0.5)) * 1.4;
          col *= 1.0 - smoothstep(0.5, 1.2, vd) * uVignette;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat);
    this.postScene.add(this.postQuad);
  }

  private applyAI(d: AIDirection) {
    if (!d) return;
    if (Array.isArray(d.paletteHex) && d.paletteHex.length) this.palette.setCustom(d.paletteHex);
    if (typeof d.feedback === "number") this.feedbackT = THREE.MathUtils.clamp(d.feedback, 0, 0.95);
    if (typeof d.warp === "number") this.warpT = THREE.MathUtils.clamp(d.warp, 0, 1);
    if (typeof d.chroma === "number") this.chromaT = THREE.MathUtils.clamp(d.chroma, 0, 1);
    if (typeof d.kaleido === "number") this.kaleidoT = THREE.MathUtils.clamp(d.kaleido, 0, 1);
    if (typeof d.scanlines === "number") this.scanlinesT = THREE.MathUtils.clamp(d.scanlines, 0, 1);
    if (typeof d.glitch === "number") this.glitchT = THREE.MathUtils.clamp(d.glitch, 0, 1);
    if (typeof d.cameraBias === "string") {
      const all: CameraBehavior[] = ["dolly-forward","slow-orbit","free-roam","spin","snap-zoom","side-track","barrel-roll"];
      if (all.includes(d.cameraBias as CameraBehavior)) this.cam.pick(d.cameraBias as CameraBehavior);
    }
    if (Array.isArray(d.moduleHints)) {
      this.hintWeights.clear();
      for (const h of d.moduleHints) this.hintWeights.set(h, 3);
      this.remix(false);
    }
    if (d.word) this.events.emit("type-burst", d.word);
    // also push word list to TypeBurst if present
    const tb = this.all.find((m) => m.id === "typeburst") as VModule & { setWords?: (w: string[]) => void } | undefined;
    if (tb?.setWords && d.mood) tb.setWords([d.mood, ...(d.word ? [d.word] : [])]);
  }

  private remix(initial: boolean) {
    // weighted pick honoring AI hints; boost camera-echo strongly when camera is live
    const camLive = MediaBank.hasCamera();
    const weighted = this.all.map((m) => {
      const base = this.hintWeights.get(m.id) ?? 1;
      const camBoost = camLive && m.id === "camera-echo" ? 5 : 1;
      return { m, w: base * camBoost * (0.5 + Math.random()) };
    });
    weighted.sort((a, b) => b.w - a.w);
    const target = this.pool.activeCount;
    const pick: VModule[] = [];
    const layers = new Set<string>();
    for (const { m } of weighted) {
      if (pick.length >= target) break;
      if (layers.has(m.layer) && Math.random() < 0.35) continue;
      pick.push(m);
      layers.add(m.layer);
    }
    if (!pick.some((m) => m.layer === "bg")) {
      const bg = this.all.find((m) => m.layer === "bg");
      if (bg && !pick.includes(bg)) {
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
      if (Math.random() < 0.5) this.kaleidoT = (this.pool.postBias.kaleido ?? 0) + Math.random() * 0.4;
      else this.kaleidoT = this.pool.postBias.kaleido ?? 0;
    }
    void this.active;
  }

  /**
   * Apply an archetype: bias module weights, post-FX, palette, camera bank, bg color.
   * Called automatically when the local classifier switches or when AI overrides.
   */
  private applyArchetype(a: ArchetypeDef) {
    this.currentArchetype = a;
    // post-FX targets blend toward archetype values (ease in render)
    if (a.post.kaleido !== undefined) this.kaleidoT = a.post.kaleido;
    if (a.post.warp !== undefined) this.warpT = a.post.warp;
    if (a.post.chroma !== undefined) this.chromaT = a.post.chroma;
    if (a.post.scanlines !== undefined) this.scanlinesT = a.post.scanlines;
    if (a.post.glitch !== undefined) this.glitchT = a.post.glitch;
    if (a.post.feedback !== undefined) this.feedbackT = a.post.feedback;
    // palette family
    if (a.paletteHints.length) {
      const idx = a.paletteHints[Math.floor(Math.random() * a.paletteHints.length)];
      this.palette.flipTo(idx);
    }
    // module weights
    this.hintWeights.clear();
    for (const [id, w] of Object.entries(a.moduleWeights)) this.hintWeights.set(id, w);
    // camera bank
    if (a.cameras.length) this.cam.pick(a.cameras[Math.floor(Math.random() * a.cameras.length)]);
    // bg
    this.renderer.setClearColor(a.bg, 1);
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.setHex(a.bg);
    // flash to mark transition + remix on next bar
    this.flash = Math.max(this.flash, 0.8);
    this.remix(false);
  }

  /** Allow external code (e.g. AI server fn) to force an archetype. */
  setArchetypeId(id: ArchetypeId) { this.arch.setAIArchetype(id); }
  get archetypeId(): ArchetypeId { return this.currentArchetype.id; }

  skip() { this.events.emit("skip"); }

  applyDirection(d: AIDirection) { this.events.emit("ai-direction", d); }


  resize(w: number, h: number, dpr: number) {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    const pw = Math.floor(w * dpr);
    const ph = Math.floor(h * dpr);
    this.sceneRT.setSize(pw, ph);
    this.sizeW = pw; this.sizeH = ph;
    // Recreate feedback texture at new size
    this.feedbackTex.dispose();
    this.feedbackTex = new THREE.FramebufferTexture(pw, ph);
    this.postMat.uniforms.uPrev.value = this.feedbackTex;
    this.feedbackReady = false;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(t: number, dt: number, f: AudioFrame) {
    this.arch.update(t, dt, f);
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

    // ease post values toward targets
    const ease = 1 - Math.pow(0.001, dt * 0.6);
    this.kaleido += (this.kaleidoT - this.kaleido) * ease;
    this.warp += (this.warpT - this.warp) * ease;
    this.chroma += (this.chromaT - this.chroma) * ease;
    this.scanlines += (this.scanlinesT - this.scanlines) * ease;
    this.glitch += (this.glitchT - this.glitch) * ease;
    this.feedback += (this.feedbackT - this.feedback) * ease;

    // decay one-shots
    this.flash *= Math.pow(0.001, dt);
    this.invert *= Math.pow(0.0001, dt);

    const u = this.postMat.uniforms;
    u.uTime.value = t;
    u.uKaleido.value = this.kaleido;
    u.uSeg.value = this.kaleidoSeg;
    u.uWarp.value = this.warp + f.mid * 0.2;
    u.uChroma.value = this.chroma + f.bass * 0.2;
    u.uScanlines.value = this.scanlines;
    u.uGlitch.value = this.glitch;
    u.uFlash.value = this.flash * 0.6;
    u.uInvert.value = this.invert > 0.1 ? 1 : 0;
    u.uBass.value = f.bass;
    u.uFeedback.value = this.feedback;
    u.uFbReady.value = this.feedbackReady ? 1 : 0;
    u.uFbZoom.value = 0.004 + f.bass * 0.008 + (f.drop ? 0.02 : 0);
    u.uFbRot.value = 0.0008 + Math.sin(t * 0.13) * 0.001 + f.treble * 0.0015;

    // render scene to sceneRT
    this.renderer.setRenderTarget(this.sceneRT);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.scene, this.camera);
    // post to screen
    this.renderer.setRenderTarget(null);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.postScene, this.postCamera);

    // capture screen into feedback texture for next frame
    if (this.sizeW > 0 && this.sizeH > 0) {
      this.renderer.copyFramebufferToTexture(this.feedbackTex, new THREE.Vector2(0, 0));
      this.feedbackReady = true;
    }
  }

  dispose() {
    for (const m of this.all) m.dispose();
    this.sceneRT.dispose();
    this.feedbackTex.dispose();
    (this.postQuad.geometry as THREE.BufferGeometry).dispose();
    this.postMat.dispose();
    this.renderer.dispose();
    this.events.clear();
  }
}
