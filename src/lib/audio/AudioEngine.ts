export type SongPhase = "intro" | "build" | "drop" | "groove" | "breakdown";

export type AudioFrame = {
  fft: Uint8Array<ArrayBuffer>;
  time: Uint8Array<ArrayBuffer>;
  bass: number; // 0..1
  mid: number;
  treble: number;
  level: number;
  beat: boolean;
  sinceBeat: number; // seconds
  drop: boolean;       // big energy spike, advances scenes
  energy: number;      // long-window level EMA
  flux: number;        // spectral flux 0..1
  phase: SongPhase;    // local song structure estimate
  shortEnergy: number; // ~3s window
  bpm: number;         // rough beat tempo estimate
  centroid: number;    // 0..1 spectral centroid (brightness)
  percuss: number;     // 0..1 percussiveness (transient density)
  bassToTreble: number;// >1 = bass heavy, <1 = treble heavy
};

export class AudioEngine {
  ctx: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  stream: MediaStream | null = null;
  source: MediaStreamAudioSourceNode | null = null;
  fft!: Uint8Array<ArrayBuffer>;
  time!: Uint8Array<ArrayBuffer>;

  // EMAs
  private bassEMA = 0;
  private midEMA = 0;
  private trebleEMA = 0;
  private levelEMA = 0;

  // Beat detection
  private energyHistory: number[] = [];
  private historySize = 43; // ~0.7s at 60fps
  private lastBeatAt = 0;
  private minBeatGap = 0.18; // seconds

  // Drop detection
  private levelHistory: number[] = [];
  private levelHistorySize = 120; // ~2s
  private lastDropAt = -10;
  private minDropGap = 0.7;
  private energyLongEMA = 0;

  // Spectral flux
  private prevFFT: Float32Array | null = null;
  private percussEMA = 0;

  // Phase tracking
  private shortLevelEMA = 0;
  private beatTimes: number[] = [];
  private phase: SongPhase = "intro";
  private startedAt = 0;

  sensitivity = 1;

  async start(streamIn?: MediaStream) {
    if (this.ctx) return;
    const stream =
      streamIn ??
      (await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      }));
    this.stream = stream;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    await ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.45;
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
    this.ctx = null;
    this.analyser = null;
    this.source = null;
    this.stream = null;
  }

  read(now: number): AudioFrame {
    const a = this.analyser;
    if (!a) {
      return {
        fft: new Uint8Array(0),
        time: new Uint8Array(0),
        bass: 0, mid: 0, treble: 0, level: 0,
        beat: false, sinceBeat: 999, drop: false,
        energy: 0, flux: 0,
        phase: "intro", shortEnergy: 0, bpm: 0,
        centroid: 0, percuss: 0, bassToTreble: 1,
      };
    }
    if (!this.startedAt) this.startedAt = now;
    a.getByteFrequencyData(this.fft);
    a.getByteTimeDomainData(this.time);

    const avg = (lo: number, hi: number) => {
      let s = 0;
      for (let i = lo; i < hi; i++) s += this.fft[i];
      return s / (hi - lo) / 255;
    };
    const bassRaw = avg(1, 8);
    const midRaw = avg(9, 60);
    const trebleRaw = avg(61, 256);

    // RMS of time domain
    let sumSq = 0;
    for (let i = 0; i < this.time.length; i++) {
      const v = (this.time[i] - 128) / 128;
      sumSq += v * v;
    }
    const levelRaw = Math.sqrt(sumSq / this.time.length);

    const s = this.sensitivity;
    const bass = Math.min(1, bassRaw * s);
    const mid = Math.min(1, midRaw * s);
    const treble = Math.min(1, trebleRaw * s);
    const level = Math.min(1, levelRaw * s * 2);

    // Smoothed
    this.bassEMA = this.bassEMA * 0.35 + bass * 0.65;
    this.midEMA = this.midEMA * 0.45 + mid * 0.55;
    this.trebleEMA = this.trebleEMA * 0.4 + treble * 0.6;
    this.levelEMA = this.levelEMA * 0.4 + level * 0.6;

    // Beat: bass energy spike vs history
    const hist = this.energyHistory;
    let mean = 0;
    for (let i = 0; i < hist.length; i++) mean += hist[i];
    mean = hist.length ? mean / hist.length : 0;
    let variance = 0;
    for (let i = 0; i < hist.length; i++) {
      const d = hist[i] - mean;
      variance += d * d;
    }
    variance = hist.length ? variance / hist.length : 0;
    const threshold = mean + Math.max(0.04, Math.sqrt(variance) * 1.4);

    hist.push(bass);
    if (hist.length > this.historySize) hist.shift();

    let beat = false;
    const sinceBeat = now - this.lastBeatAt;
    if (bass > threshold && bass > 0.18 && sinceBeat > this.minBeatGap) {
      beat = true;
      this.lastBeatAt = now;
      this.beatTimes.push(now);
      if (this.beatTimes.length > 24) this.beatTimes.shift();
    }

    // Long energy EMA + drop detection
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
      bass > 0.35
    ) {
      drop = true;
      this.lastDropAt = now;
    }

    // Spectral flux
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

    // Spectral centroid (brightness): weighted mean bin / nyquist
    let csum = 0, cw = 0;
    for (let i = 1; i < this.fft.length; i++) {
      const v = this.fft[i] / 255;
      csum += v * i;
      cw += v;
    }
    const centroid = cw > 0 ? Math.min(1, (csum / cw) / this.fft.length * 2.2) : 0;

    // Percussiveness = recent transient density (smoothed)
    const transient = Math.max(0, this.levelEMA - this.shortLevelEMA);
    this.percussEMA = this.percussEMA * 0.92 + Math.min(1, transient * 5) * 0.08;

    // Bass-to-treble ratio (clamped)
    const btr = (this.bassEMA + 0.02) / (this.trebleEMA + 0.02);

    // BPM from beat intervals (median of last N gaps)
    let bpm = 0;
    if (this.beatTimes.length >= 4) {
      const gaps: number[] = [];
      for (let i = 1; i < this.beatTimes.length; i++) gaps.push(this.beatTimes[i] - this.beatTimes[i - 1]);
      gaps.sort((a, b) => a - b);
      const med = gaps[Math.floor(gaps.length / 2)];
      if (med > 0.2 && med < 1.5) bpm = Math.round(60 / med);
    }

    // Phase
    const elapsed = now - this.startedAt;
    let phase: SongPhase = "groove";
    if (elapsed < 4 || this.energyLongEMA < 0.05) phase = "intro";
    else if (now - this.lastDropAt < 4) phase = "drop";
    else if (this.shortLevelEMA < this.energyLongEMA * 0.55) phase = "breakdown";
    else if (this.shortLevelEMA > this.energyLongEMA * 1.18 && this.shortLevelEMA > lMean * 1.1) phase = "build";
    this.phase = phase;

    return {
      fft: this.fft,
      time: this.time,
      bass: this.bassEMA,
      mid: this.midEMA,
      treble: this.trebleEMA,
      level: this.levelEMA,
      beat, sinceBeat, drop,
      energy: this.energyLongEMA,
      flux,
      phase: this.phase,
      shortEnergy: this.shortLevelEMA,
      bpm,
      centroid,
      percuss: this.percussEMA,
      bassToTreble: Math.max(0.1, Math.min(10, btr)),
    };
  }
}

export const audioEngine = new AudioEngine();
