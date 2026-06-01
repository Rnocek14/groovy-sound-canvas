import * as THREE from "three";
import type { AudioFrame } from "@/lib/audio/AudioEngine";
import type { PaletteEngine } from "../composer/PaletteEngine";
import type { EventBus } from "../composer/EventBus";
import type { BarClock } from "../composer/BarClock";
import { pickClip, type ClipTag } from "./clips";
import type { VibeConfig } from "@/lib/vibe/types";

export type SilhouetteState = "idle" | "showing" | "evaporating" | "void" | "precipitating";

export class SilhouetteStage {
  private renderer: THREE.WebGLRenderer;
  private palette: PaletteEngine;
  private events: EventBus;
  private barClock: BarClock;

  private overlayScene = new THREE.Scene();
  private overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  private video: HTMLVideoElement | null = null;
  private videoTex: THREE.VideoTexture | null = null;
  private videoFailed = false;

  private silMat: THREE.ShaderMaterial | null = null;
  private interiorMat: THREE.ShaderMaterial | null = null;
  private godRayMat: THREE.ShaderMaterial | null = null;
  private rimMat: THREE.ShaderMaterial | null = null;
  private haloMat: THREE.ShaderMaterial | null = null;
  private haloPoints: THREE.Points | null = null;
  private silMesh: THREE.Mesh | null = null;
  private interiorMesh: THREE.Mesh | null = null;
  private rimMesh: THREE.Mesh | null = null;

  private state: SilhouetteState = "idle";
  private transitionPhase = 0;
  private transitionDuration = 2.5;
  private barsBeforeTransition = 8;
  private barsSinceTransition = 0;

  private currentClip: ClipTag | null = null;
  private lastClipId: string | null = null;
  private pendingClip: ClipTag | null = null;
  private clipHint: string | null = null;

  private fftBands = new Float32Array(8);
  private vibeKeywords: string[] = [];
  private sceneRT: THREE.WebGLRenderTarget | null = null;

  private enabled = true;
  private intensity = 0;
  private unsubscribers: (() => void)[] = [];

  constructor(opts: {
    renderer: THREE.WebGLRenderer;
    palette: PaletteEngine;
    events: EventBus;
    barClock: BarClock;
    vibeConfig: VibeConfig | null;
  }) {
    this.renderer = opts.renderer;
    this.palette = opts.palette;
    this.events = opts.events;
    this.barClock = opts.barClock;
    if (opts.vibeConfig?.words) this.vibeKeywords = opts.vibeConfig.words.map((w) => w.toLowerCase());
    if (opts.vibeConfig?.moodLabel) this.vibeKeywords.push(...opts.vibeConfig.moodLabel.toLowerCase().split(/\s+/));
    this.buildOverlay();
    this.subscribeEvents();
  }

  setSceneRT(rt: THREE.WebGLRenderTarget) {
    this.sceneRT = rt;
    if (this.interiorMat) this.interiorMat.uniforms.uScene.value = rt.texture;
  }

  setClipHint(hint: string) { this.clipHint = hint; }

  private buildOverlay() {
    const quadGeo = new THREE.PlaneGeometry(2, 2);

    // God rays
    this.godRayMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uColorA: { value: new THREE.Color() }, uColorB: { value: new THREE.Color() },
        uIntensity: { value: 0 }, uBass: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 1 },
        uFigureX: { value: 0.5 }, uFigureY: { value: 0.45 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform vec3 uColorA, uColorB;
        uniform float uIntensity, uBass, uTime, uAspect, uFigureX, uFigureY;
        float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5); }
        void main(){
          vec2 uv = vUv;
          uv.x = (uv.x - uFigureX) * uAspect + uFigureX;
          vec2 origin = vec2(uFigureX, uFigureY);
          vec2 dir = uv - origin;
          float dist = length(dir);
          float angle = atan(dir.y, dir.x);
          float rays = 0.0;
          for(int i=0; i<12; i++){
            float a = float(i) * 3.14159 * 2.0 / 12.0 + uTime * 0.08;
            float spread = 0.07 + hash(vec2(float(i), 0.1)) * 0.12;
            float d = abs(mod(angle - a + 3.14159, 3.14159*2.0) - 3.14159);
            float ray = exp(-d * d / (spread * spread));
            ray *= exp(-dist * (2.5 - uBass * 1.2));
            rays += ray * (0.5 + hash(vec2(float(i), uTime * 0.3)) * 0.5);
          }
          vec3 col = mix(uColorA, uColorB, dist * 1.5 + sin(uTime * 0.4) * 0.2);
          float alpha = rays * uIntensity * (0.4 + uBass * 0.6);
          alpha *= 1.0 - smoothstep(0.3, 0.9, dist);
          gl_FragColor = vec4(col * alpha, alpha * 0.7);
        }
      `,
    });
    const godRayMesh = new THREE.Mesh(quadGeo, this.godRayMat);
    godRayMesh.renderOrder = 10; godRayMesh.frustumCulled = false;
    this.overlayScene.add(godRayMesh);

    // Silhouette stencil write
    this.silMat = new THREE.ShaderMaterial({
      transparent: false, colorWrite: false, depthWrite: false, depthTest: false,
      stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
      uniforms: {
        uVideo: { value: null }, uThreshold: { value: 0.5 },
        uInvert: { value: 0 }, uSoftness: { value: 0.08 },
        uEvaporate: { value: 0 }, uPrecipitate: { value: 0 },
        uTime: { value: 0 }, uBass: { value: 0 }, uMid: { value: 0 }, uHigh: { value: 0 },
        uBands: { value: new Float32Array(8) },
        uAspect: { value: 1 }, uFigureScale: { value: 0.85 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uVideo;
        uniform float uThreshold, uInvert, uSoftness, uEvaporate, uPrecipitate, uTime;
        uniform float uBass, uMid, uHigh, uAspect, uFigureScale;
        uniform float uBands[8];
        float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        // Returns figure mask 0..1 with soft edges.
        float figureMask(float lum){
          float t0 = uThreshold - uSoftness;
          float t1 = uThreshold + uSoftness;
          float m = smoothstep(t0, t1, lum);
          return uInvert > 0.5 ? m : (1.0 - m);
        }
        void main(){
          // Map full-frame, centered figure. Letterbox via aspect.
          vec2 fuv = vUv;
          float figW = uFigureScale / uAspect;
          fuv.x = (fuv.x - 0.5) / figW + 0.5;
          fuv.y = (fuv.y - 0.5) / uFigureScale + 0.5;
          if(fuv.x < 0.0 || fuv.x > 1.0 || fuv.y < 0.0 || fuv.y > 1.0) discard;
          vec4 vid = texture2D(uVideo, fuv);
          float lum = dot(vid.rgb, vec3(0.299, 0.587, 0.114));
          float mask = figureMask(lum);
          if(mask < 0.4) discard;
          if(uEvaporate > 0.01){
            float evapTime = hash(fuv) * 0.7 + fuv.y * 0.3;
            if(evapTime < uEvaporate) discard;
          }
          if(uPrecipitate < 0.99){
            float precipTime = hash(fuv) * 0.7 + (1.0 - fuv.y) * 0.3;
            if(precipTime > uPrecipitate) discard;
          }
          gl_FragColor = vec4(0.0);
        }
      `,
    });
    const silMesh = new THREE.Mesh(quadGeo.clone(), this.silMat);
    silMesh.renderOrder = 11; silMesh.frustumCulled = false; silMesh.visible = false;
    this.silMesh = silMesh;
    this.overlayScene.add(silMesh);

    // Interior — renders only where stencil = 1
    this.interiorMat = new THREE.ShaderMaterial({
      transparent: false, depthWrite: false, depthTest: false,
      stencilWrite: false, stencilFunc: THREE.EqualStencilFunc, stencilRef: 1,
      uniforms: {
        uScene: { value: null },
        uIntensity: { value: 1 }, uTime: { value: 0 }, uBass: { value: 0 },
        uBrightness: { value: 2.6 }, uHueShift: { value: 0 }, uSaturation: { value: 1.7 },
        uTint: { value: new THREE.Color(0xffffff) },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uScene;
        uniform float uIntensity, uBass, uBrightness, uHueShift, uSaturation;
        uniform vec3 uTint;
        vec3 hueShift(vec3 col, float shift){
          float angle = shift * 6.28318;
          float s = sin(angle), c = cos(angle);
          mat3 m = mat3(
            0.299 + 0.701*c + 0.168*s, 0.587 - 0.587*c + 0.330*s, 0.114 - 0.114*c - 0.497*s,
            0.299 - 0.299*c - 0.328*s, 0.587 + 0.413*c + 0.035*s, 0.114 - 0.114*c + 0.292*s,
            0.299 - 0.300*c + 1.250*s, 0.587 - 0.588*c - 1.050*s, 0.114 + 0.886*c - 0.203*s
          );
          return clamp(m * col, 0.0, 4.0);
        }
        void main(){
          // Sample scene with slight zoom so the inside reveals more of the universe.
          vec2 uv = (vUv - 0.5) * 0.85 + 0.5;
          vec3 scene = texture2D(uScene, uv).rgb;
          // Saturation boost
          float lum = dot(scene, vec3(0.299, 0.587, 0.114));
          scene = mix(vec3(lum), scene, uSaturation);
          vec3 col = scene * uBrightness * (1.0 + uBass * 0.6);
          col = hueShift(col, uHueShift + uBass * 0.08);
          col *= uTint;
          gl_FragColor = vec4(col * uIntensity, 1.0);
        }
      `,
    });
    const interiorMesh = new THREE.Mesh(quadGeo.clone(), this.interiorMat);
    interiorMesh.renderOrder = 12; interiorMesh.frustumCulled = false; interiorMesh.visible = false;
    this.interiorMesh = interiorMesh;
    this.overlayScene.add(interiorMesh);

    // Rim glow (outside silhouette)
    this.rimMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      stencilWrite: false, stencilFunc: THREE.NotEqualStencilFunc, stencilRef: 1,
      uniforms: {
        uVideo: { value: null }, uThreshold: { value: 0.4 },
        uInvert: { value: 0 },
        uColor: { value: new THREE.Color() },
        uIntensity: { value: 0 }, uBass: { value: 0 },
        uEvaporate: { value: 0 }, uPrecipitate: { value: 0 },
        uTime: { value: 0 }, uAspect: { value: 1 }, uFigureScale: { value: 0.85 },
        uRimWidth: { value: 0.022 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uVideo;
        uniform float uThreshold, uInvert, uRimWidth, uIntensity, uBass, uTime, uAspect, uFigureScale;
        uniform float uEvaporate, uPrecipitate;
        uniform vec3 uColor;
        void main(){
          vec2 fuv = vUv;
          float figW = uFigureScale / uAspect;
          fuv.x = (fuv.x - 0.5) / figW + 0.5;
          fuv.y = (fuv.y - 0.5) / uFigureScale + 0.5;
          if(fuv.x < -uRimWidth || fuv.x > 1.0+uRimWidth || fuv.y < -uRimWidth || fuv.y > 1.0+uRimWidth) discard;
          float rimVal = 0.0;
          vec2 clamped = clamp(fuv, 0.0, 1.0);
          for(int dx=-2; dx<=2; dx++){
            for(int dy=-2; dy<=2; dy++){
              if(dx==0 && dy==0) continue;
              vec2 offset = vec2(float(dx), float(dy)) * uRimWidth * 0.5;
              vec4 s = texture2D(uVideo, clamp(clamped + offset, 0.0, 1.0));
              float lum = dot(s.rgb, vec3(0.299, 0.587, 0.114));
              bool inFig = uInvert > 0.5 ? lum > uThreshold : lum < uThreshold;
              if(inFig) rimVal += 1.0;
            }
          }
          rimVal /= 24.0;
          if(rimVal < 0.05) discard;
          float alpha = rimVal * uIntensity * (0.6 + uBass * 0.8);
          if(uEvaporate > 0.01) alpha *= (1.0 - uEvaporate * 1.2);
          if(uPrecipitate < 0.99) alpha *= uPrecipitate * 1.5;
          float pulse = 1.0 + uBass * 0.5;
          gl_FragColor = vec4(uColor * pulse, clamp(alpha, 0.0, 1.0));
        }
      `,
    });
    const rimMesh = new THREE.Mesh(quadGeo.clone(), this.rimMat);
    rimMesh.renderOrder = 13; rimMesh.frustumCulled = false; rimMesh.visible = false;
    this.rimMesh = rimMesh;
    this.overlayScene.add(rimMesh);

    // Halo particles
    const N = 600;
    const haloPos = new Float32Array(N * 3);
    const haloSeed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 0.3 + Math.random() * 0.4;
      haloPos[i*3] = Math.cos(angle) * r;
      haloPos[i*3+1] = (Math.random() - 0.5) * 1.2;
      haloPos[i*3+2] = Math.sin(angle) * r * 0.3;
      haloSeed[i] = Math.random();
    }
    const haloGeo = new THREE.BufferGeometry();
    haloGeo.setAttribute("position", new THREE.BufferAttribute(haloPos, 3));
    haloGeo.setAttribute("seed", new THREE.BufferAttribute(haloSeed, 1));
    this.haloMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 }, uBass: { value: 0 }, uIntensity: { value: 0 },
        uColorA: { value: new THREE.Color() }, uColorB: { value: new THREE.Color() },
      },
      vertexShader: `
        attribute float seed;
        uniform float uTime, uBass;
        varying float vSeed;
        void main(){
          vSeed = seed;
          vec3 p = position;
          float speed = 0.3 + seed * 0.4;
          float angle = atan(p.z, p.x) + uTime * speed * (0.5 + uBass * 0.8);
          float r = length(vec2(p.x, p.z));
          r *= 1.0 - uBass * 0.25 * seed;
          p.x = cos(angle) * r;
          p.z = sin(angle) * r;
          p.y += sin(uTime * (0.5 + seed) + seed * 6.28) * 0.05;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (40.0 + uBass * 30.0) / max(-gl_Position.z, 0.5);
        }
      `,
      fragmentShader: `
        uniform float uIntensity;
        uniform vec3 uColorA, uColorB;
        varying float vSeed;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if(d > 0.5) discard;
          float a = (1.0 - d * 2.0) * uIntensity * 0.6;
          gl_FragColor = vec4(mix(uColorA, uColorB, vSeed), a);
        }
      `,
    });
    this.haloPoints = new THREE.Points(haloGeo, this.haloMat);
    this.haloPoints.renderOrder = 5;
    this.haloPoints.position.set(0, 0.2, 2);
    this.haloPoints.frustumCulled = false;
  }

  private subscribeEvents() {
    this.unsubscribers.push(
      this.events.on("drop", () => {
        if (this.silMat) {
          const bands = this.silMat.uniforms.uBands.value as Float32Array;
          for (let i = 0; i < 8; i++) bands[i] = Math.min(1, bands[i] + 0.5);
        }
      })
    );
  }

  private loadClip(clip: ClipTag) {
    if (this.video) {
      try { this.video.pause(); } catch { /* noop */ }
      this.video.src = "";
      try { this.video.load(); } catch { /* noop */ }
    }
    if (this.videoTex) { this.videoTex.dispose(); this.videoTex = null; }
    this.videoFailed = false;
    this.currentClip = clip;
    const vid = document.createElement("video");
    const isUrl = /^(https?:)?\/\//.test(clip.src) || clip.src.startsWith("/");
    vid.src = isUrl ? clip.src : `/silhouette-clips/${clip.src}`;
    vid.loop = true; vid.muted = true; vid.playsInline = true; vid.preload = "auto";
    vid.setAttribute("muted", "");
    vid.setAttribute("playsinline", "");
    const tryPlay = () => { vid.play().catch(() => {}); };
    tryPlay();
    vid.addEventListener("canplay", tryPlay, { once: true });
    vid.addEventListener("loadedmetadata", tryPlay, { once: true });
    vid.addEventListener("error", () => {
      this.videoFailed = true;
      console.warn("[Silhouette] video failed:", clip.id, clip.src, vid.error);
    }, { once: true });
    vid.addEventListener("loadeddata", () => {
      const tex = new THREE.VideoTexture(vid);
      tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
      this.videoTex = tex;
      const threshold = clip.threshold ?? (clip.invertLuma ? 0.5 : 0.35);
      const invert = clip.invertLuma ? 1 : 0;
      if (this.silMat) {
        this.silMat.uniforms.uVideo.value = tex;
        this.silMat.uniforms.uThreshold.value = threshold;
        this.silMat.uniforms.uInvert.value = invert;
      }
      if (this.rimMat) {
        this.rimMat.uniforms.uVideo.value = tex;
        this.rimMat.uniforms.uThreshold.value = threshold + 0.05;
        this.rimMat.uniforms.uInvert.value = invert;
      }
      console.log("[Silhouette] loaded", clip.id, vid.videoWidth, "x", vid.videoHeight);
    }, { once: true });
    this.video = vid;
  }

  private startTransition() {
    this.state = "evaporating";
    this.transitionPhase = 0;
    this.barsSinceTransition = 0;
  }

  private advanceStateMachine(dt: number, archetype: string, phase: string, energy: number) {
    switch (this.state) {
      case "idle": {
        if (this.video === null) {
          const clip = pickClip({ archetype, phase, energy, vibeKeywords: this.vibeKeywords, lastClipId: null, clipHint: this.clipHint });
          this.loadClip(clip);
          this.lastClipId = clip.id;
          this.state = "precipitating";
          this.transitionPhase = 0;
        }
        break;
      }
      case "showing": {
        if (this.barClock.consumeBar()) {
          this.barsSinceTransition++;
          if (this.barsSinceTransition >= this.barsBeforeTransition) {
            this.pendingClip = pickClip({ archetype, phase, energy, vibeKeywords: this.vibeKeywords, lastClipId: this.lastClipId, clipHint: this.clipHint });
            this.startTransition();
          }
        }
        break;
      }
      case "evaporating": {
        this.transitionPhase += dt / this.transitionDuration;
        if (this.transitionPhase >= 1) {
          this.transitionPhase = 1;
          this.state = "void";
          if (this.pendingClip) {
            this.loadClip(this.pendingClip);
            this.lastClipId = this.pendingClip.id;
            this.pendingClip = null;
          }
          setTimeout(() => {
            this.state = "precipitating";
            this.transitionPhase = 0;
          }, (60 / Math.max(60, this.barClock.currentBpm)) * 2000);
        }
        break;
      }
      case "void": break;
      case "precipitating": {
        this.transitionPhase += dt / this.transitionDuration;
        if (this.transitionPhase >= 1) {
          this.transitionPhase = 1;
          this.state = "showing";
          this.barsSinceTransition = 0;
          this.clipHint = null;
        }
        break;
      }
    }
  }

  update(t: number, dt: number, f: AudioFrame, archetype: string, phase: string, w: number, h: number) {
    if (!this.enabled) { this.intensity += (0 - this.intensity) * Math.min(1, dt * 2); return; }
    // Halo + god-rays ride at full strength even before the video loads.
    this.intensity += (1 - this.intensity) * Math.min(1, dt * 0.8);
    this.advanceStateMachine(dt, archetype, phase, f.energy);

    const evap = this.state === "evaporating" ? this.transitionPhase : 0;
    const precip = this.state === "precipitating" ? this.transitionPhase : this.state === "showing" ? 1 : 0;

    const fft = f.fft;
    const binCount = fft.length;
    const bandRanges: [number, number][] = [
      [1, 4], [4, 8], [8, 16], [16, 32], [32, 64], [64, 128], [128, 200], [200, 256],
    ];
    for (let b = 0; b < 8; b++) {
      const [lo, hi] = bandRanges[b];
      const top = Math.min(hi, binCount);
      const count = top - lo;
      if (count <= 0) { this.fftBands[b] = 0; continue; }
      let sum = 0;
      for (let i = lo; i < top; i++) sum += fft[i];
      this.fftBands[b] = Math.min(1, (sum / count / 255) * 2.5);
    }

    const aspect = w / h;
    if (this.video && this.currentClip) {
      const ratio = Math.max(0.3, Math.min(2.5, (f.bpm || 120) / this.currentClip.naturalBpm));
      try { this.video.playbackRate = ratio; } catch { /* noop */ }
    }

    if (this.silMat && this.videoTex) {
      const u = this.silMat.uniforms;
      u.uVideo.value = this.videoTex;
      u.uEvaporate.value = evap;
      u.uPrecipitate.value = precip;
      u.uTime.value = t; u.uBass.value = f.bass; u.uMid.value = f.mid; u.uHigh.value = f.treble;
      u.uBands.value = this.fftBands;
      u.uAspect.value = aspect;
    }
    if (this.rimMat && this.videoTex) {
      const u = this.rimMat.uniforms;
      u.uVideo.value = this.videoTex;
      (u.uColor.value as THREE.Color).copy(this.palette.get(0));
      u.uIntensity.value = this.intensity * (0.5 + f.bass * 0.7);
      u.uBass.value = f.bass; u.uEvaporate.value = evap; u.uPrecipitate.value = precip;
      u.uTime.value = t; u.uAspect.value = aspect;
    }
    if (this.interiorMat) {
      const u = this.interiorMat.uniforms;
      u.uIntensity.value = this.intensity; u.uTime.value = t; u.uBass.value = f.bass;
      u.uHueShift.value = Math.sin(t * 0.07) * 0.08;
    }
    if (this.godRayMat) {
      const u = this.godRayMat.uniforms;
      (u.uColorA.value as THREE.Color).copy(this.palette.get(0));
      (u.uColorB.value as THREE.Color).copy(this.palette.get(2));
      u.uIntensity.value = this.intensity * 0.8;
      u.uBass.value = f.bass; u.uTime.value = t; u.uAspect.value = aspect;
    }
    if (this.haloMat) {
      const u = this.haloMat.uniforms;
      u.uTime.value = t; u.uBass.value = f.bass; u.uIntensity.value = this.intensity * 0.6;
      (u.uColorA.value as THREE.Color).copy(this.palette.get(1));
      (u.uColorB.value as THREE.Color).copy(this.palette.get(3));
    }
    if (this.videoTex) this.videoTex.needsUpdate = true;
  }

  renderOverlay() {
    if (!this.enabled || this.intensity < 0.01) return;
    // God-rays + halo show immediately. Silhouette/interior/rim require the video texture.
    const hasVideo = !!this.videoTex && !this.videoFailed;
    if (this.silMesh) this.silMesh.visible = hasVideo;
    if (this.interiorMesh) this.interiorMesh.visible = hasVideo;
    if (this.rimMesh) this.rimMesh.visible = hasVideo;
    // Clear stencil for this overlay pass (the post pass preserved it).
    this.renderer.clearStencil();
    this.renderer.render(this.overlayScene, this.overlayCamera);
  }

  getHaloPoints(): THREE.Points | null { return this.haloPoints; }
  setEnabled(v: boolean) { this.enabled = v; }

  dispose() {
    this.unsubscribers.forEach((u) => u());
    if (this.video) { try { this.video.pause(); } catch { /* noop */ } this.video.src = ""; }
    this.videoTex?.dispose();
    this.silMat?.dispose();
    this.interiorMat?.dispose();
    this.godRayMat?.dispose();
    this.rimMat?.dispose();
    this.haloMat?.dispose();
    if (this.haloPoints) (this.haloPoints.geometry as THREE.BufferGeometry).dispose();
  }
}
