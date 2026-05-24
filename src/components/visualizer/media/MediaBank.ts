import * as THREE from "three";
import type { ArchetypeId } from "../composer/archetypes";
import { BUILTIN_PACK, type MediaAsset } from "./builtinPack";

const DB_NAME = "vizmedia";
const STORE = "uploads";

type UserMedia = {
  id: string;
  blob: Blob;
  kind: "image" | "video";
  name: string;
  addedAt: number;
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

type Entry = {
  id: string;
  texture: THREE.Texture;
  kind: "image" | "video";
  archetypes: ArchetypeId[];
  mood: string;
  source: "builtin" | "user" | "ai" | "camera";
  videoEl?: HTMLVideoElement;
  imageEl?: HTMLImageElement;
  mirrored?: boolean;
};

const CAMERA_ID = "live-camera";

class MediaBankImpl {
  private entries = new Map<string, Entry>();
  private fallback: THREE.Texture | null = null;
  private loaded = false;
  private loader = new THREE.TextureLoader();
  private listeners = new Set<() => void>();

  onChange(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  private emit() { for (const l of this.listeners) l(); }

  /** Returns a 1x1 magenta placeholder so shaders don't crash. */
  getFallback(): THREE.Texture {
    if (!this.fallback) {
      const c = document.createElement("canvas");
      c.width = c.height = 4;
      const g = c.getContext("2d")!;
      g.fillStyle = "#ff00aa"; g.fillRect(0, 0, 4, 4);
      this.fallback = new THREE.CanvasTexture(c);
      this.fallback.wrapS = this.fallback.wrapT = THREE.RepeatWrapping;
    }
    return this.fallback;
  }

  async init() {
    if (this.loaded) return;
    this.loaded = true;
    // Load builtin pack lazily (each)
    for (const a of BUILTIN_PACK) this.loadBuiltin(a);
    // Restore user uploads
    try {
      const db = await openDB();
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        for (const it of (req.result as UserMedia[])) this.addEntryFromBlob(it.id, it.blob, it.kind, "user");
      };
    } catch { /* IndexedDB unavailable — skip */ }
  }

  private loadBuiltin(a: MediaAsset) {
    this.loader.load(a.url, (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.entries.set(a.id, {
        id: a.id, texture: tex, kind: "image",
        archetypes: a.archetypes, mood: a.mood, source: "builtin",
      });
      this.emit();
    }, undefined, () => { /* missing asset — ignore */ });
  }

  private addEntryFromBlob(id: string, blob: Blob, kind: "image" | "video", source: "user" | "ai", archetypes: ArchetypeId[] = []) {
    const url = URL.createObjectURL(blob);
    if (kind === "video") {
      const v = document.createElement("video");
      v.src = url; v.loop = true; v.muted = true; v.playsInline = true;
      v.crossOrigin = "anonymous";
      v.play().catch(() => {});
      const tex = new THREE.VideoTexture(v);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.entries.set(id, { id, texture: tex, kind: "video", archetypes, mood: "custom", source, videoEl: v });
    } else {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;
      img.onload = () => {
        const tex = new THREE.Texture(img);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        this.entries.set(id, { id, texture: tex, kind: "image", archetypes, mood: "custom", source, imageEl: img });
        this.emit();
      };
    }
    this.emit();
  }

  async addUserFile(file: File): Promise<string | null> {
    if (file.size > 10 * 1024 * 1024) return null;
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) return null;
    const id = `user-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const kind: "image" | "video" = isVideo ? "video" : "image";
    this.addEntryFromBlob(id, file, kind, "user");
    try {
      const db = await openDB();
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ id, blob: file, kind, name: file.name, addedAt: Date.now() });
    } catch { /* ignore */ }
    return id;
  }

  async removeUserFile(id: string) {
    const e = this.entries.get(id);
    if (e) {
      e.texture.dispose();
      if (e.videoEl) { e.videoEl.pause(); e.videoEl.src = ""; }
      this.entries.delete(id);
      this.emit();
    }
    try {
      const db = await openDB();
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
    } catch { /* ignore */ }
  }

  async addAIGenerated(dataUrl: string, archetype: ArchetypeId): Promise<string> {
    const blob = await (await fetch(dataUrl)).blob();
    const id = `ai-${archetype}-${Date.now()}`;
    this.addEntryFromBlob(id, blob, "image", "ai", [archetype]);
    return id;
  }

  /** Attach the live camera as a high-priority pickable source. */
  attachCamera(texture: THREE.Texture, videoEl: HTMLVideoElement, mirrored = false) {
    const existing = this.entries.get(CAMERA_ID);
    if (existing) existing.texture.dispose();
    this.entries.set(CAMERA_ID, {
      id: CAMERA_ID, texture, kind: "video",
      archetypes: ["techno","house","ambient","dnb","hiphop","rock","classical","pop"],
      mood: "live", source: "camera", videoEl, mirrored,
    });
    this.emit();
  }
  detachCamera() {
    const e = this.entries.get(CAMERA_ID);
    if (e) { e.texture.dispose(); this.entries.delete(CAMERA_ID); this.emit(); }
  }
  getCamera(): THREE.Texture | null {
    return this.entries.get(CAMERA_ID)?.texture ?? null;
  }
  isCameraMirrored(): boolean {
    return !!this.entries.get(CAMERA_ID)?.mirrored;
  }
  hasCamera(): boolean { return this.entries.has(CAMERA_ID); }

  /** Pick a texture, preferring camera (60%) then archetype-tagged, then any. */
  pick(archetype?: ArchetypeId, excludeId?: string): THREE.Texture {
    const all = [...this.entries.values()].filter((e) => e.id !== excludeId);
    if (all.length === 0) return this.getFallback();
    const cam = all.find((e) => e.source === "camera");
    if (cam && Math.random() < 0.6) return cam.texture;
    const preferred = archetype ? all.filter((e) => e.archetypes.includes(archetype)) : [];
    const pool = preferred.length ? preferred : all;
    return pool[Math.floor(Math.random() * pool.length)].texture;
  }

  pickMultiple(count: number, archetype?: ArchetypeId): THREE.Texture[] {
    const all = [...this.entries.values()];
    if (all.length === 0) return new Array(count).fill(this.getFallback());
    const cam = all.find((e) => e.source === "camera");
    const preferred = archetype ? all.filter((e) => e.archetypes.includes(archetype)) : [];
    const pool = preferred.length >= count ? preferred : all;
    const out: THREE.Texture[] = [];
    for (let i = 0; i < count; i++) {
      // Sprinkle camera into ~40% of tiles when present
      if (cam && Math.random() < 0.4) out.push(cam.texture);
      else out.push(pool[Math.floor(Math.random() * pool.length)].texture);
    }
    return out;
  }

  list() {
    return [...this.entries.values()].map((e) => ({
      id: e.id, kind: e.kind, source: e.source, mood: e.mood,
    }));
  }
}

export const MediaBank = new MediaBankImpl();
