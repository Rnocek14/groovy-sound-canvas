import * as THREE from "three";
import { MediaBank } from "./MediaBank";

export type CameraFacing = "user" | "environment";

class CameraSourceImpl {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private texture: THREE.VideoTexture | null = null;
  private facing: CameraFacing = "environment";
  private listeners = new Set<() => void>();
  status: "idle" | "starting" | "live" | "denied" | "error" = "idle";
  errorMsg = "";

  onChange(cb: () => void) {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }
  private emit() { for (const l of this.listeners) l(); }

  get active() { return this.status === "live"; }
  get currentFacing() { return this.facing; }
  get isMirrored() { return this.facing === "user"; }
  getTexture(): THREE.VideoTexture | null { return this.texture; }
  getVideo(): HTMLVideoElement | null { return this.video; }

  async start(facing: CameraFacing = this.facing) {
    if (this.status === "starting") return;
    this.status = "starting";
    this.emit();
    try {
      // Stop existing stream first (in case of flip)
      this.disposeStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      this.stream = stream;
      this.facing = facing;
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.autoplay = true;
      v.srcObject = stream;
      await v.play().catch(() => {});
      this.video = v;
      const tex = new THREE.VideoTexture(v);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      this.texture = tex;
      MediaBank.attachCamera(tex, v, this.isMirrored);
      this.status = "live";
      this.errorMsg = "";
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") this.status = "denied";
      else this.status = "error";
      this.errorMsg = err?.message || "Camera unavailable";
      this.disposeStream();
    }
    this.emit();
  }

  async flip() {
    if (!this.active) return;
    const next: CameraFacing = this.facing === "user" ? "environment" : "user";
    await this.start(next);
  }

  stop() {
    this.disposeStream();
    this.status = "idle";
    MediaBank.detachCamera();
    this.emit();
  }

  private disposeStream() {
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
    }
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
      this.video = null;
    }
    if (this.texture) {
      this.texture.dispose();
      this.texture = null;
    }
  }
}

export const CameraSource = new CameraSourceImpl();

// Auto-pause on tab hidden to save battery
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && CameraSource.active) {
      // Keep the stream but pause decoding by pausing video
      CameraSource.getVideo()?.pause();
    } else if (!document.hidden && CameraSource.active) {
      CameraSource.getVideo()?.play().catch(() => {});
    }
  });
}
