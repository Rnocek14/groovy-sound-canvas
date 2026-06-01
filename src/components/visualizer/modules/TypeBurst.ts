import * as THREE from "three";
import type { ModuleFactory, VModule } from "./types";

// Kinetic typography burst — flashes words on beats/drops. Uses canvas textures.
const FALLBACK = ["PULSE", "DROP", "WAVE", "BASS", "FEEL", "LOUD", "RISE", "FLOW", "HIGH", "GO"];

function makeTexture(word: string, color: string) {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 256;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = color;
  g.font = "900 200px Inter, system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(word.toUpperCase().slice(0, 10), c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const createTypeBurst: ModuleFactory = ({ scene, palette, events }): VModule => {
  const group = new THREE.Group();
  scene.add(group);
  type Item = { mesh: THREE.Mesh; life: number; mat: THREE.MeshBasicMaterial; tex: THREE.Texture };
  const items: Item[] = [];
  let queue: string[] = [...FALLBACK];
  let intensity = 0;

  const spawn = (word?: string) => {
    if (intensity < 0.05) return;
    if (items.length > 6) {
      const old = items.shift()!;
      group.remove(old.mesh);
      old.mat.dispose(); old.tex.dispose();
      (old.mesh.geometry as THREE.BufferGeometry).dispose();
    }
    const w = (word && word.trim()) || queue[Math.floor(Math.random() * queue.length)];
    const pal = palette.get(Math.floor(Math.random() * 4));
    const tex = makeTexture(w, `#${pal.getHexString()}`);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, opacity: 0 });
    const geo = new THREE.PlaneGeometry(20, 5);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6, -8 - Math.random() * 4);
    mesh.rotation.z = (Math.random() - 0.5) * 0.2;
    mesh.renderOrder = 100;
    group.add(mesh);
    items.push({ mesh, life: 0, mat, tex });
  };

  const offTypeBurst = events.on("type-burst", (d) => {
    if (typeof d === "string") spawn(d);
    else spawn();
  });
  const offDrop = events.on("drop", () => spawn());
  const offBeat = events.on("beat", () => { if (Math.random() < 0.15) spawn(); });

  return {
    id: "typeburst",
    layer: "fg",
    setIntensity(v){ intensity = v; group.visible = v > 0.01; },
    update(_t, dt){
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        it.life += dt;
        const a = Math.max(0, 1 - it.life / 1.4) * intensity;
        it.mat.opacity = a;
        it.mesh.position.z += dt * 8;
        it.mesh.scale.setScalar(1 + it.life * 1.5);
        if (it.life > 1.6) {
          group.remove(it.mesh);
          (it.mesh.geometry as THREE.BufferGeometry).dispose();
          it.mat.dispose(); it.tex.dispose();
          items.splice(i, 1);
        }
      }
    },
    setWords(words: string[]) { if (words.length) queue = words; },
    addWord(word: string) {
      const w = (word || "").trim();
      if (!w) return;
      if (!queue.includes(w)) {
        queue.push(w);
        if (queue.length > 24) queue = queue.slice(-24);
      }
    },
    dispose(){
      offTypeBurst?.(); offDrop?.(); offBeat?.();
      for (const it of items) {
        group.remove(it.mesh);
        (it.mesh.geometry as THREE.BufferGeometry).dispose();
        it.mat.dispose(); it.tex.dispose();
      }
      scene.remove(group);
    },
  } as VModule & { setWords?: (w: string[]) => void; addWord?: (w: string) => void };
};
