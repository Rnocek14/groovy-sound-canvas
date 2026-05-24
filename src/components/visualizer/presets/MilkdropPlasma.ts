import type { PresetFactory } from "./types";

const VS = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FS = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uLevel;
uniform float uBeat;

vec3 palette(float t){
  vec3 a = vec3(0.5, 0.4, 0.6);
  vec3 b = vec3(0.5, 0.5, 0.5);
  vec3 c = vec3(1.0, 1.0, 1.0);
  vec3 d = vec3(0.0, 0.33, 0.67);
  return a + b * cos(6.28318 * (c * t + d));
}

vec2 kaleido(vec2 uv, float seg){
  float a = atan(uv.y, uv.x);
  float r = length(uv);
  float pi = 3.14159265;
  a = mod(a, 2.0*pi/seg);
  a = abs(a - pi/seg);
  return vec2(cos(a), sin(a)) * r;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  float seg = 4.0 + floor(uTreble * 8.0) * 2.0;
  uv = kaleido(uv, seg);

  float zoom = 1.0 - uBass * 0.4 - uBeat * 0.1;
  uv *= zoom;

  vec3 col = vec3(0.0);
  float t = uTime * 0.3;
  for (float i = 0.0; i < 4.0; i++){
    uv = abs(uv) / dot(uv, uv) - vec2(0.7 + sin(t + i) * 0.1, 0.6 + cos(t*1.3 + i) * 0.1);
    float d = length(uv);
    col += palette(d + t + i * 0.1 + uMid * 0.5) * (0.04 / max(d, 0.02));
  }
  col *= 0.7 + uLevel * 0.8;
  col = pow(col, vec3(0.85));
  gl_FragColor = vec4(col, 1.0);
}
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
  const vs = compile(VS, gl.VERTEX_SHADER);
  const fs = compile(FS, gl.FRAGMENT_SHADER);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, "uRes");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uBass = gl.getUniformLocation(prog, "uBass");
  const uMid = gl.getUniformLocation(prog, "uMid");
  const uTreble = gl.getUniformLocation(prog, "uTreble");
  const uLevel = gl.getUniformLocation(prog, "uLevel");
  const uBeat = gl.getUniformLocation(prog, "uBeat");

  let beatPulse = 0;
  let W = 1, H = 1;

  return {
    resize(w, h, dpr) {
      W = Math.floor(w * dpr);
      H = Math.floor(h * dpr);
      canvas.width = W;
      canvas.height = H;
      gl.viewport(0, 0, W, H);
    },
    render(t, dt) {
      const f = getFrame();
      if (f.beat) beatPulse = 1;
      beatPulse *= Math.pow(0.01, dt);
      gl.uniform2f(uRes, W, H);
      gl.uniform1f(uTime, t);
      gl.uniform1f(uBass, f.bass);
      gl.uniform1f(uMid, f.mid);
      gl.uniform1f(uTreble, f.treble);
      gl.uniform1f(uLevel, f.level);
      gl.uniform1f(uBeat, beatPulse);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    },
  };
};
