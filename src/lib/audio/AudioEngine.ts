export type AudioFrame = {
  fft: Uint8Array;
  time: Uint8Array;
  bass: number; // 0..1
  mid: number;
  treble: number;
  level: number;
  beat: boolean;
  sinceBeat: number; // seconds
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

  sensitivity = 1;

  async start() {
    if (this.ctx) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });
    this.stream = stream;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    await ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.7;
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
        bass: 0,
        mid: 0,
        treble: 0,
        level: 0,
        beat: false,
        sinceBeat: 999,
      };
    }
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
    this.bassEMA = this.bassEMA * 0.6 + bass * 0.4;
    this.midEMA = this.midEMA * 0.6 + mid * 0.4;
    this.trebleEMA = this.trebleEMA * 0.5 + treble * 0.5;
    this.levelEMA = this.levelEMA * 0.6 + level * 0.4;

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
    }

    return {
      fft: this.fft,
      time: this.time,
      bass: this.bassEMA,
      mid: this.midEMA,
      treble: this.trebleEMA,
      level: this.levelEMA,
      beat,
      sinceBeat,
    };
  }
}

export const audioEngine = new AudioEngine();
