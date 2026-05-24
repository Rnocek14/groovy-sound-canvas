import type { PresetFactory } from "./types";

export const createGlitchVHS: PresetFactory = ({ canvas, getFrame }) => {
  const ctx = canvas.getContext("2d")!;
  let W = 1, H = 1, DPR = 1;
  let glitch = 0;
  let bsod = 0;
  let bsodCooldown = 0;
  let rewindCooldown = 4;
  let hue = 0;

  return {
    resize(w, h, dpr) {
      W = w; H = h; DPR = dpr;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
    render(t, dt) {
      const f = getFrame();
      if (f.beat) glitch = Math.min(1, glitch + 0.7);
      glitch *= Math.pow(0.02, dt);
      bsodCooldown -= dt;
      rewindCooldown -= dt;
      if (f.beat && f.bass > 0.5 && bsodCooldown <= 0 && Math.random() < 0.3) {
        bsod = 0.4;
        bsodCooldown = 4 + Math.random() * 6;
      }
      bsod = Math.max(0, bsod - dt);

      // Continuous hue drift
      hue = (hue + dt * (8 + f.mid * 40)) % 360;

      // === FEEDBACK TRAIL: redraw last frame zoomed + rotated slightly under new ===
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 0.88;
      ctx.translate(W / 2, H / 2);
      const trailScale = 1.015 + Math.sin(t * 0.5) * 0.005 + f.bass * 0.01;
      const trailRot = Math.sin(t * 0.3) * 0.01 + (f.beat ? 0.04 : 0);
      ctx.rotate(trailRot);
      ctx.scale(trailScale, trailScale);
      ctx.filter = `hue-rotate(${(2 + f.mid * 8).toFixed(1)}deg) blur(0.5px)`;
      ctx.drawImage(canvas, -W / 2, -H / 2, W, H);
      ctx.filter = "none";
      ctx.globalAlpha = 1;
      ctx.restore();

      // Dim slightly so trails fade
      ctx.fillStyle = "rgba(5,2,7,0.18)";
      ctx.fillRect(0, 0, W, H);

      // Bars — curved/melting via bezier
      const fft = f.fft;
      const bars = 56;
      const step = Math.floor(fft.length / bars);
      const barW = W / bars;
      const cy = H / 2;
      const warpAmp = 14 + f.bass * 30;
      for (let i = 0; i < bars; i++) {
        let amp = 0;
        for (let j = 0; j < step; j++) amp += fft[i * step + j];
        amp = amp / step / 255;
        const h = amp * H * 0.42 + 4;
        const x = i * barW + barW / 2;
        const sway = Math.sin(t * 1.6 + i * 0.35) * warpAmp;
        const sway2 = Math.cos(t * 1.1 + i * 0.27) * warpAmp * 0.7;
        const hueA = (hue + i * 5) % 360;
        // Up curve
        ctx.strokeStyle = `hsl(${hueA}, 100%, ${55 + amp * 25}%)`;
        ctx.lineWidth = Math.max(2, barW * 0.55);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x, cy);
        ctx.bezierCurveTo(x + sway, cy - h * 0.4, x + sway2, cy - h * 0.7, x + sway * 0.3, cy - h);
        ctx.stroke();
        // Down curve (mirror) with shifted hue
        ctx.strokeStyle = `hsl(${(hueA + 60) % 360}, 100%, ${50 + amp * 20}%)`;
        ctx.beginPath();
        ctx.moveTo(x, cy);
        ctx.bezierCurveTo(x - sway, cy + h * 0.4, x - sway2, cy + h * 0.7, x - sway * 0.3, cy + h);
        ctx.stroke();
      }

      // Waveform with continuous wobble
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

      // Continuous low-grade RGB drift (always present)
      const drift = 1.5 + Math.sin(t * 0.8) * 1.0 + glitch * 12;
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.35;
      ctx.drawImage(canvas, drift, 0);
      ctx.drawImage(canvas, -drift, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      // Slice tears on big glitch
      if (glitch > 0.15) {
        const slices = 3;
        for (let s = 0; s < slices; s++) {
          const y = Math.random() * H;
          const sh = 8 + Math.random() * 30;
          const off = (Math.random() - 0.5) * glitch * 70;
          try {
            const img = ctx.getImageData(0, y * DPR, canvas.width, sh * DPR);
            ctx.putImageData(img, off * DPR, y * DPR);
          } catch {
            // ignore CORS taint if any
          }
        }
      }

      // TV static overlay (always low-grade)
      const staticAlpha = 0.04 + f.treble * 0.08;
      ctx.globalAlpha = staticAlpha;
      const sx = 60;
      const sy = 60;
      for (let i = 0; i < 80; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? "#fff" : "#000";
        ctx.fillRect(Math.random() * W, Math.random() * H, sx / 30, sy / 30);
      }
      ctx.globalAlpha = 1;

      // Scanlines
      ctx.fillStyle = "rgba(0,0,0,0.16)";
      for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);

      // Random tape-rewind smear, time-based not beat-based
      if (rewindCooldown <= 0) {
        rewindCooldown = 6 + Math.random() * 8;
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        for (let k = 1; k <= 6; k++) {
          ctx.globalAlpha = 0.12;
          ctx.drawImage(canvas, k * 14, 0);
        }
        ctx.restore();
      }

      // Vignette
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.6)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // BSOD flash
      if (bsod > 0) {
        ctx.fillStyle = `rgba(20, 50, 200, ${Math.min(1, bsod * 2.5)})`;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${Math.floor(W / 14)}px ui-monospace, monospace`;
        ctx.textAlign = "center";
        ctx.fillText("NO SIGNAL", W / 2, H / 2);
      }
    },
    dispose() {},
  };
};
