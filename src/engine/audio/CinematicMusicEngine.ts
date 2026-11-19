import type { MusicContextId } from './AudioTypes.ts';

interface ContextScoreConfig {
  label: string;
  stepMs: number;
  chords: number[][];
  bassline: number[];
  melody: (number | null)[];
  padGain: number;
  leadGain: number;
  bassGain: number;
  pulsePercussion: boolean;
  padFilterHz: number;
}

// Original cinematic chord & Malabar pentatonic-inflected progressions (Hz)
const SCORE_CONFIGS: Record<MusicContextId, ContextScoreConfig> = {
  menu: {
    label: 'Malabar Dusk Overdrive',
    stepMs: 650,
    // Dm9 -> Bbmaj7 -> Fmaj7 -> Asus4
    chords: [
      [146.83, 220.0, 261.63, 329.63],
      [116.54, 174.61, 220.0, 293.66],
      [174.61, 220.0, 261.63, 329.63],
      [110.0, 164.81, 220.0, 293.66],
    ],
    bassline: [73.42, 73.42, 58.27, 58.27, 87.31, 87.31, 55.0, 55.0],
    melody: [587.33, null, 523.25, 440.0, null, 349.23, 392.0, null, 440.0, null, 523.25, null, 392.0, 329.63, null, null],
    padGain: 0.11,
    leadGain: 0.06,
    bassGain: 0.09,
    pulsePercussion: false,
    padFilterHz: 780,
  },
  opening: {
    label: 'West Hill Dawn',
    stepMs: 700,
    // Cmaj9 -> Am7 -> Fmaj7 -> G6
    chords: [
      [130.81, 196.0, 246.94, 293.66],
      [110.0, 164.81, 196.0, 261.63],
      [174.61, 220.0, 261.63, 329.63],
      [196.0, 246.94, 293.66, 329.63],
    ],
    bassline: [65.41, 65.41, 55.0, 55.0, 87.31, 87.31, 98.0, 98.0],
    melody: [523.25, null, 587.33, 659.25, null, 587.33, 523.25, null, 440.0, null, 392.0, null, 329.63, 392.0, null, null],
    padGain: 0.1,
    leadGain: 0.055,
    bassGain: 0.075,
    pulsePercussion: false,
    padFilterHz: 850,
  },
  exploration: {
    label: 'Kozhikode Streets',
    stepMs: 560,
    // Em7 -> Cmaj7 -> G -> Dsus2
    chords: [
      [164.81, 196.0, 246.94, 293.66],
      [130.81, 196.0, 246.94, 329.63],
      [196.0, 246.94, 293.66, 392.0],
      [146.83, 220.0, 293.66, 329.63],
    ],
    bassline: [82.41, 82.41, 65.41, 65.41, 98.0, 98.0, 73.42, 73.42],
    melody: [659.25, null, 587.33, null, 493.88, 523.25, null, 392.0, 440.0, null, 493.88, null, 587.33, null, 440.0, null],
    padGain: 0.085,
    leadGain: 0.05,
    bassGain: 0.08,
    pulsePercussion: true,
    padFilterHz: 720,
  },
  coastal: {
    label: 'Arabian Sea Horizon',
    stepMs: 720,
    // Fmaj7 -> G6 -> Em7 -> Am7
    chords: [
      [174.61, 220.0, 261.63, 329.63],
      [196.0, 246.94, 293.66, 329.63],
      [164.81, 196.0, 246.94, 293.66],
      [110.0, 164.81, 196.0, 261.63],
    ],
    bassline: [87.31, 87.31, 98.0, 98.0, 82.41, 82.41, 55.0, 55.0],
    melody: [523.25, null, 659.25, null, 587.33, null, 493.88, null, 440.0, null, 523.25, null, 392.0, null, null, null],
    padGain: 0.095,
    leadGain: 0.05,
    bassGain: 0.065,
    pulsePercussion: false,
    padFilterHz: 680,
  },
  night_noir: {
    label: 'Calicut Harbour Midnight',
    stepMs: 620,
    // Cm9 -> Abmaj7 -> Fm7 -> G7sus4
    chords: [
      [130.81, 155.56, 196.0, 293.66],
      [103.83, 155.56, 196.0, 246.94],
      [174.61, 207.65, 261.63, 311.13],
      [196.0, 261.63, 293.66, 349.23],
    ],
    bassline: [65.41, 65.41, 51.91, 51.91, 87.31, 87.31, 98.0, 98.0],
    melody: [587.33, null, 466.16, null, 392.0, 466.16, null, 523.25, null, 392.0, 349.23, null, 392.0, null, null, null],
    padGain: 0.1,
    leadGain: 0.055,
    bassGain: 0.095,
    pulsePercussion: true,
    padFilterHz: 620,
  },
  mission: {
    label: 'Kallai Syndicate Pulse',
    stepMs: 420,
    chords: [
      [146.83, 174.61, 220.0, 293.66],
      [130.81, 164.81, 196.0, 261.63],
      [116.54, 146.83, 174.61, 233.08],
      [110.0, 146.83, 164.81, 220.0],
    ],
    bassline: [73.42, 73.42, 65.41, 65.41, 58.27, 58.27, 55.0, 55.0],
    melody: [587.33, 440.0, null, 523.25, 587.33, null, 659.25, null, 587.33, 523.25, 440.0, null, 349.23, 392.0, 440.0, null],
    padGain: 0.09,
    leadGain: 0.065,
    bassGain: 0.11,
    pulsePercussion: true,
    padFilterHz: 900,
  },
  action: {
    label: 'Bypass Pursuit',
    stepMs: 320,
    chords: [
      [146.83, 220.0, 261.63, 329.63],
      [146.83, 220.0, 261.63, 349.23],
      [116.54, 174.61, 233.08, 293.66],
      [130.81, 196.0, 261.63, 329.63],
    ],
    bassline: [73.42, 73.42, 73.42, 73.42, 58.27, 58.27, 65.41, 65.41],
    melody: [587.33, null, 659.25, 587.33, 523.25, null, 440.0, 523.25, 587.33, 698.46, 659.25, null, 523.25, 587.33, null, null],
    padGain: 0.085,
    leadGain: 0.07,
    bassGain: 0.12,
    pulsePercussion: true,
    padFilterHz: 1100,
  },
  suspense: {
    label: 'Harbour Shadows',
    stepMs: 680,
    chords: [
      [110.0, 130.81, 164.81, 207.65],
      [103.83, 130.81, 155.56, 196.0],
      [98.0, 130.81, 146.83, 196.0],
      [110.0, 138.59, 164.81, 220.0],
    ],
    bassline: [55.0, 55.0, 51.91, 51.91, 49.0, 49.0, 55.0, 55.0],
    melody: [440.0, null, null, 415.3, null, null, 392.0, null, null, 329.63, null, 349.23, null, null, null, null],
    padGain: 0.095,
    leadGain: 0.04,
    bassGain: 0.1,
    pulsePercussion: false,
    padFilterHz: 520,
  },
  emotional: {
    label: 'Monsoon Memory',
    stepMs: 740,
    chords: [
      [174.61, 220.0, 261.63, 329.63],
      [146.83, 220.0, 261.63, 329.63],
      [116.54, 174.61, 220.0, 293.66],
      [130.81, 196.0, 246.94, 293.66],
    ],
    bassline: [87.31, 87.31, 73.42, 73.42, 58.27, 58.27, 65.41, 65.41],
    melody: [523.25, 587.33, 659.25, null, 587.33, 523.25, 440.0, null, 349.23, 440.0, 523.25, null, 392.0, null, null, null],
    padGain: 0.11,
    leadGain: 0.06,
    bassGain: 0.075,
    pulsePercussion: false,
    padFilterHz: 740,
  },
  ambient: {
    label: 'Silent City Drift',
    stepMs: 850,
    chords: [
      [146.83, 220.0, 293.66],
      [130.81, 196.0, 261.63],
      [116.54, 174.61, 233.08],
      [110.0, 164.81, 220.0],
    ],
    bassline: [73.42, 73.42, 65.41, 65.41, 58.27, 58.27, 55.0, 55.0],
    melody: [null, null, 440.0, null, null, null, 392.0, null, null, null, 349.23, null, null, null, 329.63, null],
    padGain: 0.07,
    leadGain: 0.03,
    bassGain: 0.05,
    pulsePercussion: false,
    padFilterHz: 520,
  },
};

export class CinematicMusicEngine {
  private readonly ctx: AudioContext;
  private readonly musicBus: AudioNode;
  private readonly delayNode: DelayNode;
  private readonly delayFeedback: GainNode;
  private contextId: MusicContextId = 'menu';
  private timerId: number | null = null;
  private stepIndex = 0;
  private barVariation = 0;
  private running = false;

  constructor(ctx: AudioContext, musicBus: AudioNode) {
    this.ctx = ctx;
    this.musicBus = musicBus;

    // Warm stereo-like feedback echo tail shared across music voices
    this.delayNode = ctx.createDelay(1.0);
    this.delayNode.delayTime.value = 0.36;
    this.delayFeedback = ctx.createGain();
    this.delayFeedback.gain.value = 0.24;
    const delayFilter = ctx.createBiquadFilter();
    delayFilter.type = 'lowpass';
    delayFilter.frequency.value = 1400;

    this.delayNode.connect(delayFilter);
    delayFilter.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    delayFilter.connect(this.musicBus);
  }

  getContextId(): MusicContextId {
    return this.contextId;
  }

  getContextLabel(): string {
    return SCORE_CONFIGS[this.contextId].label;
  }

  setContext(next: MusicContextId): boolean {
    if (this.contextId === next) {
      return false;
    }
    this.contextId = next;
    this.stepIndex = 0;
    if (this.running) {
      this.reschedule();
    }
    return true;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.triggerStep();
    this.reschedule();
  }

  stop(): void {
    this.running = false;
    if (this.timerId !== null && typeof window !== 'undefined') {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  dispose(): void {
    this.stop();
    this.delayNode.disconnect();
    this.delayFeedback.disconnect();
  }

  private reschedule(): void {
    if (this.timerId !== null && typeof window !== 'undefined') {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    if (!this.running || typeof window === 'undefined') return;
    const cfg = SCORE_CONFIGS[this.contextId];
    this.timerId = window.setInterval(() => {
      if (this.ctx.state === 'running') {
        this.triggerStep();
      }
    }, cfg.stepMs);
  }

  private triggerStep(): void {
    if (this.ctx.state !== 'running') return;
    const cfg = SCORE_CONFIGS[this.contextId];
    const now = this.ctx.currentTime + 0.02;
    const stepSec = cfg.stepMs / 1000;
    const stepInPhrase = this.stepIndex % 16;
    const chordIdx = Math.floor((stepInPhrase / 4) % cfg.chords.length);

    // Trigger lush warm pad chord every 4 steps
    if (stepInPhrase % 4 === 0) {
      const chord = cfg.chords[chordIdx];
      this.playPadChord(now, chord, stepSec * 4.2, cfg.padGain, cfg.padFilterHz);
      if (stepInPhrase === 0) {
        this.barVariation = (this.barVariation + 1) % 3;
      }
    }

    // Trigger deep bass pulse every 2 steps
    if (stepInPhrase % 2 === 0) {
      const bassIdx = Math.floor(stepInPhrase / 2) % cfg.bassline.length;
      this.playBassNote(now, cfg.bassline[bassIdx], stepSec * 1.9, cfg.bassGain);
    }

    // Melody note with phrase variation to prevent mechanical repetition
    const rawNote = cfg.melody[stepInPhrase];
    if (rawNote !== null) {
      const freq = this.barVariation === 2 && stepInPhrase % 4 === 2 ? rawNote * 1.12246 : rawNote;
      this.playRhodesVoice(now, freq, stepSec * 1.65, cfg.leadGain);
    }

    // Soft rhythmic pulse on exploration/night/mission/action contexts
    if (cfg.pulsePercussion) {
      if (stepInPhrase % 4 === 0) {
        this.playSoftKick(now, this.contextId === 'action' ? 0.14 : 0.085);
      } else if (stepInPhrase % 2 === 1) {
        this.playSoftShaker(now, 0.025);
      }
    }

    this.stepIndex++;
  }

  private playPadChord(
    startTime: number,
    freqs: number[],
    durationSec: number,
    peakGain: number,
    filterHz: number,
  ): void {
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterHz * 0.7, startTime);
    filter.frequency.linearRampToValueAtTime(filterHz, startTime + durationSec * 0.45);
    filter.frequency.linearRampToValueAtTime(filterHz * 0.65, startTime + durationSec);

    const env = this.ctx.createGain();
    const perVoice = peakGain / Math.max(1, freqs.length);
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(perVoice, startTime + durationSec * 0.32);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

    filter.connect(env);
    env.connect(this.musicBus);

    for (let i = 0; i < freqs.length; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = i % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freqs[i], startTime);
      osc.detune.setValueAtTime(i % 2 === 0 ? -5 : 5, startTime);
      osc.connect(filter);
      osc.start(startTime);
      osc.stop(startTime + durationSec + 0.05);
    }
  }

  private playBassNote(startTime: number, freq: number, durationSec: number, peakGain: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);

    const sub = this.ctx.createOscillator();
    sub.type = 'triangle';
    sub.frequency.setValueAtTime(freq * 2, startTime);

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(220, startTime);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(peakGain, startTime + 0.04);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

    osc.connect(lp);
    sub.connect(lp);
    lp.connect(env);
    env.connect(this.musicBus);

    osc.start(startTime);
    sub.start(startTime);
    osc.stop(startTime + durationSec + 0.04);
    sub.stop(startTime + durationSec + 0.04);
  }

  private playRhodesVoice(startTime: number, freq: number, durationSec: number, peakGain: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);

    const harmonic = this.ctx.createOscillator();
    harmonic.type = 'triangle';
    harmonic.frequency.setValueAtTime(freq * 2, startTime);

    const harmonicGain = this.ctx.createGain();
    harmonicGain.gain.setValueAtTime(0.22, startTime);
    harmonicGain.gain.exponentialRampToValueAtTime(0.02, startTime + 0.18);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(peakGain, startTime + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

    osc.connect(env);
    harmonic.connect(harmonicGain);
    harmonicGain.connect(env);

    env.connect(this.musicBus);
    env.connect(this.delayNode);

    osc.start(startTime);
    harmonic.start(startTime);
    osc.stop(startTime + durationSec + 0.05);
    harmonic.stop(startTime + durationSec + 0.05);
  }

  private playSoftKick(startTime: number, peakGain: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115, startTime);
    osc.frequency.exponentialRampToValueAtTime(46, startTime + 0.14);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(peakGain, startTime + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.22);

    osc.connect(env);
    env.connect(this.musicBus);
    osc.start(startTime);
    osc.stop(startTime + 0.24);
  }

  private playSoftShaker(startTime: number, peakGain: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(3400, startTime);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2600;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(peakGain, startTime + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.055);
    osc.connect(hp);
    hp.connect(env);
    env.connect(this.musicBus);
    osc.start(startTime);
    osc.stop(startTime + 0.07);
  }
}
