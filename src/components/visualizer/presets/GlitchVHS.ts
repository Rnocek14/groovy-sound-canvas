import type { PresetFactory } from "./types";

export const createGlitchVHS: PresetFactory = ({ canvas, getFrame }) => {
  const ctx = canvas.getContext("2d")!;
  let W = 1, H = 1, DPR = 1;
  let glitch = 0;
  let bsod = 0;
  let bsodCooldown = 0;

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
      if (f.beat && f.bass > 0.5 && bsodCooldown <= 0 && Math.random() < 0.3) {
        bsod = 0.4;
        bsodCooldown = 4 + Math.random() * 6;
      }
      bsod = Math.max(0, bsod - dt);

      // CRT background w/ scanlines
      ctx.fillStyle = "#050207";
      ctx.fillRect(0, 0, W, H);

      const fft = f.fft;
      const bars = 64;
      const step = Math.floor(fft.length / bars);
      const barW = W / bars;

      // Mirror bars top/bottom for symmetry
      ctx.save();
      for (let i = 0; i < bars; i++) {
        let amp = 0;
        for (let j = 0; j < step; j++) amp += fft[i * step + j];
        amp = (amp / step / 255);
        const h = amp * H * 0.45;
        const x = i * barW;
        const hue = 280 + i * 1.2 + t * 30;
        ctx.fillStyle = `hsl(${hue}, 100%, ${50 + amp * 20}%)`;
        ctx.fillRect(x + 1, H / 2 - h, barW - 2, h);
        ctx.fillStyle = `hsl(${hue + 40}, 100%, ${40 + amp * 20}%)`;
        ctx.fillRect(x + 1, H / 2, barW - 2, h);
      }
      ctx.restore();

      // Waveform
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgba(0, 240, 255, ${0.6 + f.treble * 0.4})`;
      ctx.beginPath();
      const tim = f.time;
      const N = tim.length;
      for (let i = 0; i < N; i += 4) {
        const x = (i / N) * W;
        const y = H / 2 + ((tim[i] - 128) / 128) * H * 0.18;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // RGB split on glitch
      if (glitch > 0.05) {
        const dx = glitch * 12;
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = 0.6;
        ctx.drawImage(canvas, dx, 0);
        ctx.drawImage(canvas, -dx, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";

        // Slice tear
        const slices = 3;
        for (let s = 0; s < slices; s++) {
          const y = Math.random() * H;
          const sh = 8 + Math.random() * 30;
          const off = (Math.random() - 0.5) * glitch * 60;
          const img = ctx.getImageData(0, y * DPR, canvas.width, sh * DPR);
          ctx.putImageData(img, off * DPR, y * DPR);
        }
      }

      // Scanlines overlay
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);

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
