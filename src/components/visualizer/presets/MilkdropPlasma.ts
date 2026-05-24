import type { PresetFactory } from "./types";

const VS = `attribute vec2 p; varying vec2 vUv;
void main(){ vUv = p*0.5+0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

// Main pass: domain-warped kaleido plasma + samples previous frame for feedback
const FS_MAIN = `
precision highp float;
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uLevel;
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

  // continuously morphing segments (no audio gating)
  float seg = 5.0 + 3.0*sin(uTime*0.13) + uTreble*4.0;
  uv = kaleido(uv, seg);

  // slow rotation + zoom, always
  float rot = uTime*0.07 + uBass*0.5;
  float ca = cos(rot), sa = sin(rot);
  uv = mat2(ca,-sa,sa,ca) * uv;
  float zoom = 1.0 + 0.25*sin(uTime*0.2) - uBass*0.3;
  uv *= zoom;

  // domain warp by previous-frame brightness for fractal feedback
  vec2 fbUv = vUv;
  // sample feedback warped slightly inward (zoom-in feedback)
  vec2 toCenter = (vec2(0.5) - fbUv);
  vec2 fbSample = fbUv + toCenter * (0.012 + uBass*0.02)
                  + vec2(sin(uTime*0.5 + fbUv.y*6.0), cos(uTime*0.4 + fbUv.x*6.0)) * 0.004;
  vec3 prev = texture2D(uPrev, fbSample).rgb;
  float warpAmt = (prev.r + prev.g + prev.b) * 0.06;
  uv += vec2(sin(uv.y*3.0 + uTime), cos(uv.x*3.0 - uTime)) * warpAmt;

  // plasma core
  vec3 col = vec3(0.0);
  float t = uTime * 0.25;
  vec2 z = uv;
  for (float i = 0.0; i < 5.0; i++){
    z = abs(z) / dot(z, z) - vec2(0.72 + sin(t + i*0.7)*0.12,
                                  0.6 + cos(t*1.3 + i*0.9)*0.12);
    float d = length(z);
    col += palette(d + t + i*0.18, fract(uTime*0.05 + i*0.07))
         * (0.05 / max(d, 0.02));
  }
  col *= 0.55 + uLevel*0.8;
  col = pow(col, vec3(0.82));

  // mix with feedback for trails
  vec3 trail = prev * (0.85 - uMid*0.15);
  col = max(col, trail * 0.95);

  gl_FragColor = vec4(col, 1.0);
}
`;

// Copy pass — render the FBO to the screen
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
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
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

  // Ping-pong FBOs
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
  const uMain = {
    uRes: gl.getUniformLocation(progMain, "uRes"),
    uTime: gl.getUniformLocation(progMain, "uTime"),
    uBass: gl.getUniformLocation(progMain, "uBass"),
    uMid: gl.getUniformLocation(progMain, "uMid"),
    uTreble: gl.getUniformLocation(progMain, "uTreble"),
    uLevel: gl.getUniformLocation(progMain, "uLevel"),
    uPrev: gl.getUniformLocation(progMain, "uPrev"),
  };
  const uCopy = {
    uTex: gl.getUniformLocation(progCopy, "uTex"),
  };

  return {
    resize(w, h, dpr) {
      W = Math.floor(w * dpr);
      H = Math.floor(h * dpr);
      canvas.width = W;
      canvas.height = H;
      if (fboA) { gl.deleteTexture(fboA.tex); gl.deleteFramebuffer(fboA.fb); }
      if (fboB) { gl.deleteTexture(fboB.tex); gl.deleteFramebuffer(fboB.fb); }
      fboA = makeFBO(W, H);
      fboB = makeFBO(W, H);
    },
    render(t) {
      if (!fboA || !fboB) return;
      const f = getFrame();

      // Render main to fboB, sampling fboA as previous
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboB.fb);
      gl.viewport(0, 0, W, H);
      gl.useProgram(progMain);
      setupAttrib(progMain);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fboA.tex);
      gl.uniform1i(uMain.uPrev, 0);
      gl.uniform2f(uMain.uRes, W, H);
      gl.uniform1f(uMain.uTime, t);
      gl.uniform1f(uMain.uBass, f.bass);
      gl.uniform1f(uMain.uMid, f.mid);
      gl.uniform1f(uMain.uTreble, f.treble);
      gl.uniform1f(uMain.uLevel, f.level);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Copy fboB to screen
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.useProgram(progCopy);
      setupAttrib(progCopy);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fboB.tex);
      gl.uniform1i(uCopy.uTex, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // swap
      const tmp = fboA; fboA = fboB; fboB = tmp;
    },
    dispose() {
      if (fboA) { gl.deleteTexture(fboA.tex); gl.deleteFramebuffer(fboA.fb); }
      if (fboB) { gl.deleteTexture(fboB.tex); gl.deleteFramebuffer(fboB.fb); }
      gl.deleteBuffer(buf);
      gl.deleteProgram(progMain);
      gl.deleteProgram(progCopy);
      gl.deleteShader(vs);
      gl.deleteShader(fsMain);
      gl.deleteShader(fsCopy);
    },
  };
};
