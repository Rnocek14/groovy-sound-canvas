import * as THREE from "three";
import type { ModuleFactory, VModule } from "./types";

// Full-screen background "plasma/fluid" shader — utterly different from neon geometry modules.
export const createFluidShader: ModuleFactory = ({ scene, palette }): VModule => {
  const geo = new THREE.PlaneGeometry(2, 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTreble: { value: 0 },
      uIntensity: { value: 0 },
      uC0: { value: new THREE.Color() },
      uC1: { value: new THREE.Color() },
      uC2: { value: new THREE.Color() },
      uC3: { value: new THREE.Color() },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }`,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;
      uniform float uTime, uBass, uMid, uTreble, uIntensity;
      uniform vec3 uC0, uC1, uC2, uC3;
      // simplex-ish noise
      vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
      vec2 mod289(vec2 x){return x-floor(x*(1./289.))*289.;}
      vec3 permute(vec3 x){return mod289(((x*34.)+1.)*x);}
      float snoise(vec2 v){
        const vec4 C=vec4(.211324865405187,.366025403784439,-.577350269189626,.024390243902439);
        vec2 i=floor(v+dot(v,C.yy));vec2 x0=v-i+dot(i,C.xx);
        vec2 i1=(x0.x>x0.y)?vec2(1.,0.):vec2(0.,1.);
        vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;
        i=mod289(i);vec3 p=permute(permute(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));
        vec3 m=max(.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);
        m=m*m;m=m*m;
        vec3 x=2.*fract(p*C.www)-1.;vec3 h=abs(x)-.5;vec3 ox=floor(x+.5);vec3 a0=x-ox;
        m*=1.79284291400159-.85373472095314*(a0*a0+h*h);
        vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;
        return 130.*dot(m,g);
      }
      void main(){
        vec2 uv = vUv * 2.0 - 1.0;
        float t = uTime * (0.25 + uMid*0.4);
        // domain warp
        vec2 q = vec2(snoise(uv*1.3 + t), snoise(uv*1.3 - t));
        vec2 r = vec2(snoise(uv + q*1.5 + t*0.7), snoise(uv + q*1.5 - t*0.6));
        float n = snoise(uv*1.2 + r * (1.0 + uBass*1.5));
        float n2 = snoise(uv*2.5 + r*2.0 - t);
        float k = smoothstep(-0.4, 0.6, n);
        float k2 = smoothstep(-0.2, 0.8, n2);
        vec3 col = mix(uC0, uC1, k);
        col = mix(col, uC2, k2 * 0.7);
        col = mix(col, uC3, pow(length(r)*0.5, 2.0));
        col *= 0.6 + uIntensity*0.7 + uBass*0.4;
        // dark vignette to keep it backgroundy
        float v = smoothstep(1.2, 0.4, length(uv));
        col *= mix(0.4, 1.0, v);
        gl_FragColor = vec4(col, uIntensity);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  scene.add(mesh);
  let intensity = 0;
  let audioPhase = 0;
  return {
    id: "fluid",
    layer: "bg",
    setIntensity(v){ intensity = v; mat.uniforms.uIntensity.value = v; mesh.visible = v > 0.01; },
    update(_t, dt, f){
      const gate = Math.min(1, f.level * 4);
      audioPhase += dt * (f.mid * 1.2 + f.bass * 1.4 + f.flux * 0.6) * gate;
      const u = mat.uniforms;
      u.uTime.value = audioPhase;
      u.uBass.value = f.bass;
      u.uMid.value = f.mid;
      u.uTreble.value = f.treble;
      u.uC0.value.copy(palette.get(0));
      u.uC1.value.copy(palette.get(1));
      u.uC2.value.copy(palette.get(2));
      u.uC3.value.copy(palette.get(3));
    },
    dispose(){ scene.remove(mesh); geo.dispose(); mat.dispose(); void intensity; },
  };
};
