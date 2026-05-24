import type { PresetFactory } from "./types";
import { SceneDirector } from "./SceneDirector";

const VS = `attribute vec2 p; varying vec2 vUv;
void main(){ vUv = p*0.5+0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const FS_MAIN = `
precision highp float;
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uLevel;
uniform float uTunnel;     // 0..1 polar tunnel projection
uniform float uKaleido;    // 0..1 mirror amount
uniform float uZoom;       // continuous zoom-in factor
uniform float uShatter;    // 0..1 fragment displacement
uniform float uPaletteRot; // hue offset
uniform float uFeedback;   // feedback persistence 0..1
uniform float uBloom;      // 0..1 momentary bloom flash
uniform sampler2D uPrev;

vec3 hsv2rgb(vec3 c){
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz)*6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
vec3 palette(float t, float hueOffset){
  return hsv2rgb(vec3(hueOffset + t*0.4, 0.9, 1.0));
}
vec2 kaleido(vec2 uv, float seg){
  float a = atan(uv.y, uv.x);
  float r = length(uv);
  float pi = 3.14159265;
  float s = 2.0*pi/seg;
  a = mod(a, s);
  a = abs(a - s*0.5);
  return vec2(cos(a), sin(a)) * r;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);

  // optional tunnel projection: maps to angle / inverse radius
  if (uTunnel > 0.01) {
    float a = atan(uv.y, uv.x);
    float r = length(uv) + 0.0001;
    vec2 tunUv = vec2(a / 3.14159, 0.5 / r + uTime*0.4);
    uv = mix(uv, tunUv, uTunnel);
  }

  float seg = 4.0 + 4.0*sin(uTime*0.13) + uTreble*4.0;
  vec2 kuv = kaleido(uv, seg);
  uv = mix(uv, kuv, uKaleido);

  float rot = uTime*0.07 + uBass*0.5;
  float ca = cos(rot), sa = sin(rot);
  uv = mat2(ca,-sa,sa,ca) * uv;
  uv *= uZoom;

  // shatter: jagged triangle displacement
  if (uShatter > 0.01) {
    vec2 g = floor(uv * 8.0);
    float n = fract(sin(dot(g, vec2(12.9898, 78.233))) * 43758.5453);
    uv += (vec2(fract(n*7.0), fract(n*13.0)) - 0.5) * uShatter * 0.6;
  }

  // domain warp from previous frame
  vec2 fbUv = vUv;
  vec2 toCenter = (vec2(0.5) - fbUv);
  vec2 fbSample = fbUv + toCenter * (0.012 + uBass*0.02)
                  + vec2(sin(uTime*0.5 + fbUv.y*6.0), cos(uTime*0.4 + fbUv.x*6.0)) * 0.004;
  vec3 prev = texture2D(uPrev, fbSample).rgb;
  float warpAmt = (prev.r + prev.g + prev.b) * 0.06;
  uv += vec2(sin(uv.y*3.0 + uTime), cos(uv.x*3.0 - uTime)) * warpAmt;

  vec3 col = vec3(0.0);
  float t = uTime * 0.25;
  vec2 z = uv;
  for (float i = 0.0; i < 5.0; i++){
    z = abs(z) / dot(z, z) - vec2(0.72 + sin(t + i*0.7)*0.12,
                                  0.6 + cos(t*1.3 + i*0.9)*0.12);
    float d = length(z);
    col += palette(d + t + i*0.18, fract(uPaletteRot + i*0.07))
         * (0.05 / max(d, 0.02));
  }
  col *= 0.55 + uLevel*0.8;
  col = pow(col, vec3(0.82));

  vec3 trail = prev * uFeedback;
  col = max(col, trail);
  col += vec3(uBloom * 0.6);

  gl_FragColor = vec4(col, 1.0);
}
`;

const FS_COPY = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
void main(){ gl_FragColor = texture2D(uTex, vUv); }
`;

export const createMilkdropPlasma: PresetFactory = ({ canvas, getFrame }) => {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false });
  if (!gl) throw new Error("WebGL unavailable");

  const compile = (src: string, type: number) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh) || "shader");
    }
    return sh;
  };
  const link = (vs: WebGLShader, fs: WebGLShader) => {
    const p = gl.createProgram()!;
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    return p;
  };

  const vs = compile(VS, gl.VERTEX_SHADER);
  const fsMain = compile(FS_MAIN, gl.FRAGMENT_SHADER);
  const fsCopy = compile(FS_COPY, gl.FRAGMENT_SHADER);
  const progMain = link(vs, fsMain);
  const progCopy = link(vs, fsCopy);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const setupAttrib = (prog: WebGLProgram) => {
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  };

  type FBO = { fb: WebGLFramebuffer; tex: WebGLTexture };
  const makeFBO = (w: number, h: number): FBO => {
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex };
  };
  let fboA: FBO | null = null;
  let fboB: FBO | null = null;
  let W = 1, H = 1;

  const u = {
    uRes: gl.getUniformLocation(progMain, "uRes"),
    uTime: gl.getUniformLocation(progMain, "uTime"),
    uBass: gl.getUniformLocation(progMain, "uBass"),
    uMid: gl.getUniformLocation(progMain, "uMid"),
    uTreble: gl.getUniformLocation(progMain, "uTreble"),
    uLevel: gl.getUniformLocation(progMain, "uLevel"),
    uTunnel: gl.getUniformLocation(progMain, "uTunnel"),
    uKaleido: gl.getUniformLocation(progMain, "uKaleido"),
    uZoom: gl.getUniformLocation(progMain, "uZoom"),
    uShatter: gl.getUniformLocation(progMain, "uShatter"),
    uPaletteRot: gl.getUniformLocation(progMain, "uPaletteRot"),
    uFeedback: gl.getUniformLocation(progMain, "uFeedback"),
    uBloom: gl.getUniformLocation(progMain, "uBloom"),
    uPrev: gl.getUniformLocation(progMain, "uPrev"),
  };
  const uCopy = { uTex: gl.getUniformLocation(progCopy, "uTex") };

  const director = new SceneDirector({
    scenes: ["kaleido", "tunnel", "fractal-zoom", "shatter"],
    minDuration: 14, maxDuration: 24, transitionTime: 1.0, seed: 11,
  });

  type Cfg = { tunnel: number; kaleido: number; zoom: number; shatter: number; feedback: number };
  const CFG: Record<string, Cfg> = {
    "kaleido":      { tunnel: 0,    kaleido: 1,    zoom: 1.0, shatter: 0,    feedback: 0.85 },
    "tunnel":       { tunnel: 0.85, kaleido: 0.3,  zoom: 1.1, shatter: 0,    feedback: 0.9  },
    "fractal-zoom": { tunnel: 0.2,  kaleido: 0.6,  zoom: 1.4, shatter: 0,    feedback: 0.93 },
    "shatter":      { tunnel: 0.4,  kaleido: 0.7,  zoom: 1.0, shatter: 0.7,  feedback: 0.6  },
  };
  const cur: Cfg = { tunnel: 0, kaleido: 1, zoom: 1, shatter: 0, feedback: 0.85 };
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
  let paletteRot = 0;
  let bloom = 0;

  return {
    resize(w, h, dpr) {
      W = Math.floor(w * dpr); H = Math.floor(h * dpr);
      canvas.width = W; canvas.height = H;
      if (fboA) { gl.deleteTexture(fboA.tex); gl.deleteFramebuffer(fboA.fb); }
      if (fboB) { gl.deleteTexture(fboB.tex); gl.deleteFramebuffer(fboB.fb); }
      fboA = makeFBO(W, H); fboB = makeFBO(W, H);
    },
    render(t, dt) {
      if (!fboA || !fboB) return;
      const f = getFrame();
      const s = director.update(t, f);
      const tgt = CFG[s.id] ?? CFG.kaleido;
      const k = 1 - Math.pow(0.001, dt * 1.5);
      cur.tunnel = lerp(cur.tunnel, tgt.tunnel, k);
      cur.kaleido = lerp(cur.kaleido, tgt.kaleido, k);
      cur.zoom = lerp(cur.zoom, tgt.zoom, k);
      cur.shatter = lerp(cur.shatter, tgt.shatter, k);
      cur.feedback = lerp(cur.feedback, tgt.feedback, k);

      paletteRot = (paletteRot + dt * (0.05 + f.treble * 0.4)) % 1;
      if (f.drop) bloom = 1;
      bloom *= Math.pow(0.0005, dt);

      // bass-driven extra zoom + scroll for tunnel scene
      const zoom = cur.zoom + Math.sin(t * 0.2) * 0.15 - f.bass * 0.25;

      gl.bindFramebuffer(gl.FRAMEBUFFER, fboB.fb);
      gl.viewport(0, 0, W, H);
      gl.useProgram(progMain);
      setupAttrib(progMain);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fboA.tex);
      gl.uniform1i(u.uPrev, 0);
      gl.uniform2f(u.uRes, W, H);
      gl.uniform1f(u.uTime, t);
      gl.uniform1f(u.uBass, f.bass);
      gl.uniform1f(u.uMid, f.mid);
      gl.uniform1f(u.uTreble, f.treble);
      gl.uniform1f(u.uLevel, f.level);
      gl.uniform1f(u.uTunnel, cur.tunnel);
      gl.uniform1f(u.uKaleido, cur.kaleido);
      gl.uniform1f(u.uZoom, zoom);
      gl.uniform1f(u.uShatter, cur.shatter * (0.6 + f.mid * 0.8));
      gl.uniform1f(u.uPaletteRot, paletteRot);
      gl.uniform1f(u.uFeedback, cur.feedback);
      gl.uniform1f(u.uBloom, bloom * 0.6);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.useProgram(progCopy);
      setupAttrib(progCopy);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fboB.tex);
      gl.uniform1i(uCopy.uTex, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      const tmp = fboA; fboA = fboB; fboB = tmp;
    },
    dispose() {
      if (fboA) { gl.deleteTexture(fboA.tex); gl.deleteFramebuffer(fboA.fb); }
      if (fboB) { gl.deleteTexture(fboB.tex); gl.deleteFramebuffer(fboB.fb); }
      gl.deleteBuffer(buf);
      gl.deleteProgram(progMain); gl.deleteProgram(progCopy);
      gl.deleteShader(vs); gl.deleteShader(fsMain); gl.deleteShader(fsCopy);
    },
  };
};
