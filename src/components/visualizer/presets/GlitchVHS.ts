import type { PresetFactory } from "./types";
import { SceneDirector } from "./SceneDirector";

export const createGlitchVHS: PresetFactory = ({ canvas, getFrame }) => {
  const ctx = canvas.getContext("2d")!;
  let W = 1, H = 1, DPR = 1;
  let glitch = 0;
  let rewindCooldown = 4;
  let hue = 0;
  let killFlash = 0;

  // Tape tunnel ring spawns
  type Ring = { age: number; max: number; hue: number };
  const tunnelRings: Ring[] = [];

  const director = new SceneDirector({
    scenes: ["broadcast", "tape-tunnel", "scan-corrupt", "kill-signal"],
    minDuration: 14, maxDuration: 22, transitionTime: 1.0, seed: 23,
  });

  type Cfg = { bars: number; tunnel: number; corrupt: number; kill: number };
  const CFG: Record<string, Cfg> = {
    "broadcast":    { bars: 1.0, tunnel: 0.0, corrupt: 0.0, kill: 0 },
    "tape-tunnel":  { bars: 0.4, tunnel: 1.0, corrupt: 0.1, kill: 0 },
    "scan-corrupt": { bars: 0.7, tunnel: 0.2, corrupt: 1.0, kill: 0 },
    "kill-signal":  { bars: 0.5, tunnel: 0.5, corrupt: 0.6, kill: 1 },
  };
  const cur: Cfg = { bars: 1, tunnel: 0, corrupt: 0, kill: 0 };
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

  return {
    resize(w, h, dpr) {
      W = w; H = h; DPR = dpr;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
    render(t, dt) {
      const f = getFrame();
      const s = director.update(t, f);
      const tgt = CFG[s.id] ?? CFG.broadcast;
      const k = 1 - Math.pow(0.001, dt * 1.6);
      cur.bars = lerp(cur.bars, tgt.bars, k);
      cur.tunnel = lerp(cur.tunnel, tgt.tunnel, k);
      cur.corrupt = lerp(cur.corrupt, tgt.corrupt, k);
      cur.kill = lerp(cur.kill, tgt.kill, k);

      if (f.beat) glitch = Math.min(1, glitch + 0.7);
      glitch *= Math.pow(0.02, dt);
      rewindCooldown -= dt;
      if (f.drop) killFlash = Math.max(killFlash, 0.6);
      killFlash *= Math.pow(0.005, dt);

      hue = (hue + dt * (8 + f.mid * 40)) % 360;

      // Feedback trail
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 0.88;
      ctx.translate(W / 2, H / 2);
      const trailScale = 1.015 + Math.sin(t * 0.5) * 0.005 + f.bass * 0.01 + cur.tunnel * 0.04;
      const trailRot = Math.sin(t * 0.3) * 0.01 + (f.beat ? 0.04 : 0) + cur.kill * 0.04;
      ctx.rotate(trailRot);
      ctx.scale(trailScale, trailScale);
      ctx.filter = `hue-rotate(${(2 + f.mid * 8 + cur.kill * 30).toFixed(1)}deg) blur(0.5px)`;
      ctx.drawImage(canvas, -W / 2, -H / 2, W, H);
      ctx.filter = "none";
      ctx.globalAlpha = 1;
      ctx.restore();

      ctx.fillStyle = "rgba(5,2,7,0.18)";
      ctx.fillRect(0, 0, W, H);

      // === TAPE TUNNEL ===
      if (cur.tunnel > 0.05) {
        // spawn rings based on bass
        const spawnRate = 6 + f.bass * 30;
        if (Math.random() < spawnRate * dt) {
          tunnelRings.push({ age: 0, max: 2.2, hue: (hue + Math.random() * 60) % 360 });
        }
        const cx = W / 2, cy = H / 2;
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        for (let i = tunnelRings.length - 1; i >= 0; i--) {
          const r = tunnelRings[i];
          r.age += dt * (1 + f.bass * 1.5);
          if (r.age >= r.max) { tunnelRings.splice(i, 1); continue; }
          const k01 = r.age / r.max;
          const size = k01 * Math.max(W, H) * 0.9;
          const a = (1 - k01) * cur.tunnel * 0.7;
          ctx.strokeStyle = `hsla(${r.hue}, 100%, 60%, ${a})`;
          ctx.lineWidth = 2 + (1 - k01) * 6;
          ctx.strokeRect(cx - size / 2, cy - size / 2, size, size);
        }
        ctx.restore();
      }

      // === BARS (broadcast / scan) ===
      if (cur.bars > 0.05) {
        const fft = f.fft;
        const bars = 56;
        const step = Math.max(1, Math.floor(fft.length / bars));
        const barW = W / bars;
        const cy = H / 2;
        const warpAmp = (14 + f.bass * 30) * (1 + cur.corrupt * 1.5);
        ctx.globalAlpha = cur.bars;
        for (let i = 0; i < bars; i++) {
          let amp = 0;
          for (let j = 0; j < step; j++) amp += fft[i * step + j] ?? 0;
          amp = amp / step / 255;
          const h = amp * H * 0.42 + 4;
          const x = i * barW + barW / 2;
          const sway = Math.sin(t * 1.6 + i * 0.35) * warpAmp;
          const sway2 = Math.cos(t * 1.1 + i * 0.27) * warpAmp * 0.7;
          const hueA = (hue + i * 5) % 360;
          ctx.strokeStyle = `hsl(${hueA}, 100%, ${55 + amp * 25}%)`;
          ctx.lineWidth = Math.max(2, barW * 0.55);
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(x, cy);
          ctx.bezierCurveTo(x + sway, cy - h * 0.4, x + sway2, cy - h * 0.7, x + sway * 0.3, cy - h);
          ctx.stroke();
          ctx.strokeStyle = `hsl(${(hueA + 60) % 360}, 100%, ${50 + amp * 20}%)`;
          ctx.beginPath();
          ctx.moveTo(x, cy);
          ctx.bezierCurveTo(x - sway, cy + h * 0.4, x - sway2, cy + h * 0.7, x - sway * 0.3, cy + h);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // Waveform
      ctx.lineWidth = 2;
      ctx.strokeStyle = `hsl(${(hue + 180) % 360}, 100%, ${60 + f.treble * 25}%)`;
      ctx.beginPath();
      const tim = f.time;
      const N = tim.length;
      for (let i = 0; i < N; i += 4) {
        const x = (i / N) * W;
        const wob = Math.sin(t * 2 + i * 0.05) * 6;
        const y = H / 2 + ((tim[i] - 128) / 128) * H * 0.18 + wob;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Continuous RGB drift
      const drift = 1.5 + Math.sin(t * 0.8) * 1.0 + glitch * 12 + cur.kill * 14;
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.35;
      ctx.drawImage(canvas, drift, 0);
      ctx.drawImage(canvas, -drift, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      // === SCAN-CORRUPT slabs ===
      if (cur.corrupt > 0.1 || glitch > 0.15) {
        const slices = Math.floor(3 + cur.corrupt * 8);
        for (let s = 0; s < slices; s++) {
          const y = Math.random() * H;
          const sh = 8 + Math.random() * 30;
          const off = (Math.random() - 0.5) * (glitch * 70 + cur.corrupt * 120);
          try {
            const img = ctx.getImageData(0, y * DPR, canvas.width, sh * DPR);
            ctx.putImageData(img, off * DPR, y * DPR);
          } catch {
            // ignore
          }
        }
      }

      // Static
      const staticAlpha = 0.04 + f.treble * 0.08 + cur.kill * 0.1;
      ctx.globalAlpha = staticAlpha;
      for (let i = 0; i < 80; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? "#fff" : "#000";
        ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
      }
      ctx.globalAlpha = 1;

      // Scanlines
      ctx.fillStyle = "rgba(0,0,0,0.16)";
      for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);

      // Tape rewind smear (random + on drop)
      if (rewindCooldown <= 0 || f.drop) {
        rewindCooldown = 6 + Math.random() * 8;
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        for (let k2 = 1; k2 <= 6; k2++) {
          ctx.globalAlpha = 0.12;
          ctx.drawImage(canvas, k2 * 14, 0);
        }
        ctx.restore();
      }

      // Vignette
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.6)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // KILL flash: invert + tracking-error roll
      if (killFlash > 0.05 || cur.kill > 0.4) {
        const intensity = Math.max(killFlash, cur.kill * 0.4);
        ctx.save();
        ctx.globalCompositeOperation = "difference";
        ctx.fillStyle = `rgba(255,255,255,${intensity * 0.5})`;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        // tracking-error horizontal band
        const bandY = (Math.sin(t * 3) * 0.5 + 0.5) * H;
        ctx.fillStyle = `rgba(255,255,255,${intensity * 0.2})`;
        ctx.fillRect(0, bandY, W, 6);
      }
    },
    dispose() {},
  };
};
