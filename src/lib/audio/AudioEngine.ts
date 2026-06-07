export type SongPhase = "intro" | "build" | "drop" | "groove" | "breakdown";

export type AudioFrame = {
  fft: Uint8Array<ArrayBuffer>;
  time: Uint8Array<ArrayBuffer>;
  // Smoothed envelopes (0..1) — what most modules want for sustained drive.
  bass: number;
  mid: number;
  treble: number;
  level: number;
  // Raw per-frame values (less smoothed) and short-window envelope, for
  // computing transients downstream if needed.
  bassRaw: number;
  midRaw: number;
  trebleRaw: number;
  // Transients (0..1+) — raw spike above the slow envelope. Use these for
  // flash/snap/spawn-on-hit effects. They die out within a few frames.
  bassTransient: number;
  midTransient: number;
  trebleTransient: number;
  // Beat / tempo grid.
  beat: boolean;
  sinceBeat: number;       // seconds since last detected beat
  beatPhase: number;       // 0..1 predicted position within current beat
  barPhase: number;        // 0..1 predicted position within bar (4 beats)
  bpm: number;             // estimated tempo
  bpmConfidence: number;   // 0..1 — how trustworthy the bpm/phase grid is
  // Big-energy events.
  drop: boolean;
  energy: number;          // long-window level EMA
  flux: number;            // spectral flux 0..1
  phase: SongPhase;        // local song structure estimate
  shortEnergy: number;
  // Spectral shape.
  centroid: number;        // 0..1
  percuss: number;         // 0..1
  bassToTreble: number;
  // Loudness normalization (AGC) gain currently applied to everything.
  agcGain: number;
};

export class AudioEngine {
  ctx: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  stream: MediaStream | null = null;
  source: MediaStreamAudioSourceNode | null = null;
  fft!: Uint8Array<ArrayBuffer>;
  time!: Uint8Array<ArrayBuffer>;

  private lastFrame: AudioFrame = this.makeEmptyFrame();

  // EMAs
  private bassEMA = 0;
  private midEMA = 0;
  private trebleEMA = 0;
  private levelEMA = 0;
  // Slow envelopes (~200ms) — used to compute transient = raw - env
  private bassEnvSlow = 0;
  private midEnvSlow = 0;
  private trebleEnvSlow = 0;

  // Onset history per band (for adaptive thresholds & tempo tracking)
  private bassOnsetHist: number[] = [];
  private fluxHist: number[] = [];
  private historySize = 43; // ~0.7s @ 60fps

  // Tempo tracking via autocorrelation on an onset envelope ring buffer.
  // We sample the onset strength at ~100 Hz into a 4s window.
  private onsetBuf: number[] = new Array(400).fill(0);
  private onsetIdx = 0;
  private lastOnsetSample = 0;
  private onsetSampleRate = 100; // Hz
  private detectedBpm = 0;
  private bpmConfidence = 0;
  private beatPhase = 0;
  private barBeatCount = 0;

  // Beat / drop
  private lastBeatAt = -10;
  private minBeatGap = 0.22;
  private levelHistory: number[] = [];
  private levelHistorySize = 120;
  private lastDropAt = -10;
  private minDropGap = 0.7;
  private energyLongEMA = 0;

  // Spectral flux + percuss
  private prevFFT: Float32Array | null = null;
  private percussEMA = 0;
  private shortLevelEMA = 0;

  // AGC: track slow RMS, normalize input so quiet and loud tracks behave alike.
  private agcRms = 0.15;
  private agcGain = 1;

  private startedAt = 0;
  sensitivity = 1.9;

  private makeEmptyFrame(): AudioFrame {
    return {
      fft: new Uint8Array(0), time: new Uint8Array(0),
      bass: 0, mid: 0, treble: 0, level: 0,
      bassRaw: 0, midRaw: 0, trebleRaw: 0,
      bassTransient: 0, midTransient: 0, trebleTransient: 0,
      beat: false, sinceBeat: 999, beatPhase: 0, barPhase: 0,
      bpm: 0, bpmConfidence: 0,
      drop: false, energy: 0, flux: 0,
      phase: "intro", shortEnergy: 0,
      centroid: 0, percuss: 0, bassToTreble: 1,
      agcGain: 1,
    };
  }

  getLastFrame() { return this.lastFrame; }

  async start(streamIn?: MediaStream) {
    if (this.ctx) return;
    const stream = streamIn ?? (await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    }));
    this.stream = stream;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    await ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    // Own all smoothing in JS — no double-smoothing.
    analyser.smoothingTimeConstant = 0;
    source.connect(analyser);
    this.ctx = ctx;
    this.source = source;
    this.analyser = analyser;
    this.fft = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    this.time = new Uint8Array(new ArrayBuffer(analyser.fftSize));
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
    this.ctx = null; this.analyser = null; this.source = null; this.stream = null;
  }

  read(now: number): AudioFrame {
    const a = this.analyser;
    if (!a) { this.lastFrame = this.makeEmptyFrame(); return this.lastFrame; }
    if (!this.startedAt) this.startedAt = now;
    a.getByteFrequencyData(this.fft);
    a.getByteTimeDomainData(this.time);

    const avg = (lo: number, hi: number) => {
      let s = 0;
      for (let i = lo; i < hi; i++) s += this.fft[i];
      return s / Math.max(1, hi - lo) / 255;
    };
    // Log-leaning band cuts (bin width ~23Hz @ 48kHz, fftSize=2048).
    // Bass 23–230Hz, mid 230–2.3kHz, treble 2.3–11kHz (covers hats/cymbals).
    const bassRaw0   = avg(1, 10);
    const midRaw0    = avg(10, 100);
    const trebleRaw0 = avg(100, 480);

    // RMS of time domain
    let sumSq = 0;
    for (let i = 0; i < this.time.length; i++) {
      const v = (this.time[i] - 128) / 128;
      sumSq += v * v;
    }
    const levelRaw0 = Math.sqrt(sumSq / this.time.length);

    // ---- AGC: normalize raw loudness ----
    // Track slow RMS; target a "reference" level of ~0.18.
    this.agcRms = this.agcRms * 0.995 + levelRaw0 * 0.005;
    const target = 0.18;
    // Only normalize if there's meaningful signal; keep silence silent.
    if (this.agcRms > 0.012) {
      const desired = target / this.agcRms;
      // Clamp gain so a quiet podcast doesn't get amplified into a rave,
      // and a clipped master doesn't get squashed to mud.
      const clampedDesired = Math.min(3.5, Math.max(0.5, desired));
      this.agcGain = this.agcGain * 0.95 + clampedDesired * 0.05;
    } else {
      this.agcGain = this.agcGain * 0.95 + 1 * 0.05;
    }

    const s = this.sensitivity * this.agcGain;
    const bassRaw   = Math.min(1.4, bassRaw0 * s);
    const midRaw    = Math.min(1.4, midRaw0 * s);
    const trebleRaw = Math.min(1.4, trebleRaw0 * s);
    const levelRaw  = Math.min(1.4, levelRaw0 * s * 2);

    // Fast EMAs (current "now" energy for sustained drive)
    this.bassEMA   = this.bassEMA   * 0.35 + Math.min(1, bassRaw)   * 0.65;
    this.midEMA    = this.midEMA    * 0.45 + Math.min(1, midRaw)    * 0.55;
    this.trebleEMA = this.trebleEMA * 0.40 + Math.min(1, trebleRaw) * 0.60;
    this.levelEMA  = this.levelEMA  * 0.40 + Math.min(1, levelRaw)  * 0.60;

    // Slow envelopes (~12-frame / 200ms time constant) for transient extraction
    this.bassEnvSlow   = this.bassEnvSlow   * 0.92 + bassRaw   * 0.08;
    this.midEnvSlow    = this.midEnvSlow    * 0.92 + midRaw    * 0.08;
    this.trebleEnvSlow = this.trebleEnvSlow * 0.92 + trebleRaw * 0.08;

    // Transients: positive deviation above slow envelope (kick attack, snare crack).
    const bassTransient   = Math.max(0, bassRaw   - this.bassEnvSlow);
    const midTransient    = Math.max(0, midRaw    - this.midEnvSlow);
    const trebleTransient = Math.max(0, trebleRaw - this.trebleEnvSlow);

    // ---- Beat detection: adaptive threshold on bass onset (transient) ----
    const hist = this.bassOnsetHist;
    hist.push(bassTransient);
    if (hist.length > this.historySize) hist.shift();
    let mean = 0;
    for (let i = 0; i < hist.length; i++) mean += hist[i];
    mean = hist.length ? mean / hist.length : 0;
    let variance = 0;
    for (let i = 0; i < hist.length; i++) {
      const d = hist[i] - mean;
      variance += d * d;
    }
    variance = hist.length ? variance / hist.length : 0;
    const threshold = mean + Math.max(0.04, Math.sqrt(variance) * 1.5);

    let beat = false;
    const sinceBeat = now - this.lastBeatAt;
    if (
      bassTransient > threshold &&
      bassRaw > 0.18 &&
      this.levelEMA > 0.04 &&
      sinceBeat > this.minBeatGap
    ) {
      beat = true;
      this.lastBeatAt = now;
    }

    // ---- Spectral flux (full-band) ----
    if (!this.prevFFT || this.prevFFT.length !== this.fft.length) {
      this.prevFFT = new Float32Array(this.fft.length);
    }
    let fluxSum = 0;
    for (let i = 0; i < this.fft.length; i++) {
      const v = this.fft[i] / 255;
      const d = v - this.prevFFT[i];
      if (d > 0) fluxSum += d;
      this.prevFFT[i] = v;
    }
    const flux = Math.min(1, fluxSum / Math.max(1, this.fft.length * 0.05));

    // ---- Tempo tracking: autocorrelation on onset envelope at 100Hz ----
    // Build a combined onset signal (bass transient is dominant for kicks).
    const onset = Math.min(1, bassTransient * 2.2 + midTransient * 0.6 + flux * 0.4);
    while (this.lastOnsetSample + 1 / this.onsetSampleRate <= now) {
      this.onsetBuf[this.onsetIdx] = onset;
      this.onsetIdx = (this.onsetIdx + 1) % this.onsetBuf.length;
      this.lastOnsetSample += 1 / this.onsetSampleRate;
    }
    // Recompute BPM every ~250ms.
    if ((this.onsetIdx & 24) === 0 && now - this.startedAt > 1.2) {
      const N = this.onsetBuf.length;
      // unwrap into linear ordered buffer
      const buf = new Float32Array(N);
      for (let i = 0; i < N; i++) buf[i] = this.onsetBuf[(this.onsetIdx + i) % N];
      // mean-center
      let m = 0;
      for (let i = 0; i < N; i++) m += buf[i];
      m /= N;
      for (let i = 0; i < N; i++) buf[i] -= m;
      // Search lag range corresponding to 70..180 BPM.
      // lag (samples) = 60 / bpm * onsetSampleRate
      const minLag = Math.floor(60 / 180 * this.onsetSampleRate); // ~33
      const maxLag = Math.floor(60 / 70 * this.onsetSampleRate);  // ~85
      let bestLag = 0; let bestVal = 0;
      for (let lag = minLag; lag <= maxLag; lag++) {
        let sum = 0;
        const lim = N - lag;
        for (let i = 0; i < lim; i++) sum += buf[i] * buf[i + lag];
        // tiny preference for slower tempos (avoid double-time lock)
        const weight = 1 + (lag - minLag) / (maxLag - minLag) * 0.05;
        const v = sum * weight;
        if (v > bestVal) { bestVal = v; bestLag = lag; }
      }
      if (bestLag > 0) {
        const candidate = 60 / (bestLag / this.onsetSampleRate);
        // Energy of signal as denominator for confidence
        let energy = 0;
        for (let i = 0; i < N; i++) energy += buf[i] * buf[i];
        const norm = energy > 0 ? bestVal / energy : 0;
        // Smooth into detectedBpm
        if (this.detectedBpm === 0) this.detectedBpm = candidate;
        else this.detectedBpm = this.detectedBpm * 0.7 + candidate * 0.3;
        this.bpmConfidence = Math.min(1, Math.max(this.bpmConfidence * 0.85, norm * 4));
      }
    }

    // Advance predicted beat phase from detected BPM. Start ticking immediately;
    // confidence just modulates trust in the grid.
    const bpmForPhase = this.detectedBpm > 60 ? this.detectedBpm : 120;
    const dtFrame = Math.min(0.1, sinceBeat > 0 && this.lastBeatAt > 0 ? Math.min(0.05, performance.now() / 1000 - (this._lastPhaseTick || now)) : 0.016);
    this._lastPhaseTick = now;
    this.beatPhase += dtFrame * (bpmForPhase / 60);
    if (beat) {
      // Snap phase to 0 on detected beat (ease 70% of the error).
      const wrapped = this.beatPhase - Math.floor(this.beatPhase);
      const err = wrapped > 0.5 ? wrapped - 1 : wrapped;
      this.beatPhase -= err * 0.7;
      this.barBeatCount = (this.barBeatCount + 1) % 4;
    }
    while (this.beatPhase >= 1) {
      this.beatPhase -= 1;
      this.barBeatCount = (this.barBeatCount + 1) % 4;
    }
    const barPhase = (this.barBeatCount + this.beatPhase) / 4;

    // ---- Drop detection ----
    this.energyLongEMA = this.energyLongEMA * 0.985 + this.levelEMA * 0.015;
    this.shortLevelEMA = this.shortLevelEMA * 0.92 + this.levelEMA * 0.08;
    this.levelHistory.push(this.levelEMA);
    if (this.levelHistory.length > this.levelHistorySize) this.levelHistory.shift();
    let lMean = 0;
    for (let i = 0; i < this.levelHistory.length; i++) lMean += this.levelHistory[i];
    lMean = this.levelHistory.length ? lMean / this.levelHistory.length : 0;
    let lVar = 0;
    for (let i = 0; i < this.levelHistory.length; i++) {
      const d = this.levelHistory[i] - lMean;
      lVar += d * d;
    }
    lVar = this.levelHistory.length ? lVar / this.levelHistory.length : 0;
    const dropThresh = lMean + Math.max(0.08, Math.sqrt(lVar) * 2.5);
    let drop = false;
    if (
      now - this.lastDropAt > this.minDropGap &&
      this.levelEMA > dropThresh &&
      this.levelEMA > 0.22 &&
      this.bassEMA > 0.30
    ) {
      drop = true;
      this.lastDropAt = now;
    }

    // Spectral centroid
    let csum = 0, cw = 0;
    for (let i = 1; i < this.fft.length; i++) {
      const v = this.fft[i] / 255;
      csum += v * i;
      cw += v;
    }
    const centroid = cw > 0 ? Math.min(1, (csum / cw) / this.fft.length * 2.2) : 0;

    const transient = Math.max(0, this.levelEMA - this.shortLevelEMA);
    this.percussEMA = this.percussEMA * 0.92 + Math.min(1, transient * 5) * 0.08;

    const btr = (this.bassEMA + 0.02) / (this.trebleEMA + 0.02);

    // ---- Phase ----
    const elapsed = now - this.startedAt;
    let phase: SongPhase = "groove";
    if (elapsed < 4 || this.energyLongEMA < 0.05) phase = "intro";
    else if (now - this.lastDropAt < 4) phase = "drop";
    else if (this.shortLevelEMA < this.energyLongEMA * 0.55) phase = "breakdown";
    else if (this.shortLevelEMA > this.energyLongEMA * 1.18 && this.shortLevelEMA > lMean * 1.1) phase = "build";

    this.lastFrame = {
      fft: this.fft, time: this.time,
      bass: this.bassEMA, mid: this.midEMA, treble: this.trebleEMA, level: this.levelEMA,
      bassRaw, midRaw, trebleRaw,
      bassTransient, midTransient, trebleTransient,
      beat, sinceBeat,
      beatPhase: this.beatPhase, barPhase,
      bpm: Math.round(this.detectedBpm),
      bpmConfidence: this.bpmConfidence,
      drop, energy: this.energyLongEMA, flux,
      phase, shortEnergy: this.shortLevelEMA,
      centroid, percuss: this.percussEMA,
      bassToTreble: Math.max(0.1, Math.min(10, btr)),
      agcGain: this.agcGain,
    };
    return this.lastFrame;
  }

  private _lastPhaseTick = 0;
}

export const audioEngine = new AudioEngine();
