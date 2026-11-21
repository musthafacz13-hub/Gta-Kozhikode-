import type {
  AudioEnvironmentUpdate,
  CharacterSfxEvent,
  FootstepSurface,
  GameSfxEvent,
  TeaShopSfxEvent,
  VehicleAudioKind,
  VehicleEngineProfile,
  VehicleSfxEvent,
  WeaponAudioArchetype,
} from './AudioTypes.ts';

export const VEHICLE_AUDIO_PROFILES: Record<VehicleAudioKind, VehicleEngineProfile> = {
  motorcycle: { kind: 'motorcycle', baseHz: 68, maxHz: 210, harmonicMix: 0.45, pulseRateHz: 18, maxGain: 0.18 },
  scooter: { kind: 'scooter', baseHz: 88, maxHz: 225, harmonicMix: 0.3, pulseRateHz: 24, maxGain: 0.14 },
  auto_rickshaw: { kind: 'auto_rickshaw', baseHz: 62, maxHz: 175, harmonicMix: 0.55, pulseRateHz: 28, maxGain: 0.18 },
  car: { kind: 'car', baseHz: 54, maxHz: 165, harmonicMix: 0.25, pulseRateHz: 14, maxGain: 0.16 },
  bus: { kind: 'bus', baseHz: 42, maxHz: 118, harmonicMix: 0.48, pulseRateHz: 10, maxGain: 0.2 },
  ksrtc_bus: { kind: 'ksrtc_bus', baseHz: 40, maxHz: 112, harmonicMix: 0.5, pulseRateHz: 10, maxGain: 0.21 },
  private_bus: { kind: 'private_bus', baseHz: 45, maxHz: 126, harmonicMix: 0.46, pulseRateHz: 11, maxGain: 0.2 },
  truck: { kind: 'truck', baseHz: 38, maxHz: 108, harmonicMix: 0.52, pulseRateHz: 9, maxGain: 0.22 },
  boat: { kind: 'boat', baseHz: 46, maxHz: 122, harmonicMix: 0.42, pulseRateHz: 12, maxGain: 0.17 },
};

export interface VehicleEngineLoopHandle {
  setThrottle: (rpmNorm: number) => void;
  stop: () => void;
}

export class MalabarSoundscapes {
  private readonly ctx: AudioContext;
  private readonly sfxBus: AudioNode;
  private readonly ambientBus: AudioNode;
  private readonly bufferCache: Map<string, AudioBuffer>;

  private seaSource: AudioBufferSourceNode | null = null;
  private seaGain: GainNode | null = null;
  private seaFilter: BiquadFilterNode | null = null;
  private seaLfo: OscillatorNode | null = null;

  private windSource: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;

  private trafficSource: AudioBufferSourceNode | null = null;
  private trafficGain: GainNode | null = null;

  private crowdSource: AudioBufferSourceNode | null = null;
  private crowdGain: GainNode | null = null;

  private teaFrySource: AudioBufferSourceNode | null = null;
  private teaFryGain: GainNode | null = null;

  private ambienceStarted = false;
  private birdCooldownSec = 2.5;
  private nightCricketCooldownSec = 0.8;
  private distantVehicleCooldownSec = 6.0;
  private teaShopCooldownSec = 1.8;
  private activeAmbienceLabel = 'Mananchira City Breeze';

  constructor(
    ctx: AudioContext,
    sfxBus: AudioNode,
    ambientBus: AudioNode,
    bufferCache: Map<string, AudioBuffer>,
  ) {
    this.ctx = ctx;
    this.sfxBus = sfxBus;
    this.ambientBus = ambientBus;
    this.bufferCache = bufferCache;
    this.ensureProceduralBuffers();
  }

  getActiveAmbienceLabel(): string {
    return this.activeAmbienceLabel;
  }

  startAmbienceLoops(): void {
    if (this.ambienceStarted) return;
    this.ambienceStarted = true;

    const pinkBuf = this.bufferCache.get('proc_pink_noise_3s')!;
    const brownBuf = this.bufferCache.get('proc_brown_noise_3s')!;

    // 1. Arabian Sea Waves (Surf LFO + resonant lowpass sweep)
    this.seaSource = this.ctx.createBufferSource();
    this.seaSource.buffer = pinkBuf;
    this.seaSource.loop = true;

    this.seaFilter = this.ctx.createBiquadFilter();
    this.seaFilter.type = 'lowpass';
    this.seaFilter.frequency.value = 340;
    this.seaFilter.Q.value = 1.4;

    this.seaGain = this.ctx.createGain();
    this.seaGain.gain.value = 0.04;

    this.seaLfo = this.ctx.createOscillator();
    this.seaLfo.type = 'sine';
    this.seaLfo.frequency.value = 0.14; // ~7s wave surge cycle
    const seaLfoFilterDepth = this.ctx.createGain();
    seaLfoFilterDepth.gain.value = 210;
    this.seaLfo.connect(seaLfoFilterDepth);
    seaLfoFilterDepth.connect(this.seaFilter.frequency);

    this.seaSource.connect(this.seaFilter);
    this.seaFilter.connect(this.seaGain);
    this.seaGain.connect(this.ambientBus);
    this.seaSource.start();
    this.seaLfo.start();

    // 2. Coastal Breeze
    this.windSource = this.ctx.createBufferSource();
    this.windSource.buffer = pinkBuf;
    this.windSource.loop = true;
    const windBp = this.ctx.createBiquadFilter();
    windBp.type = 'bandpass';
    windBp.frequency.value = 620;
    windBp.Q.value = 0.9;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.025;
    this.windSource.connect(windBp);
    windBp.connect(this.windGain);
    this.windGain.connect(this.ambientBus);
    this.windSource.start();

    // 3. Kozhikode Road Traffic Murmur
    this.trafficSource = this.ctx.createBufferSource();
    this.trafficSource.buffer = brownBuf;
    this.trafficSource.loop = true;
    const trafficLp = this.ctx.createBiquadFilter();
    trafficLp.type = 'lowpass';
    trafficLp.frequency.value = 230;
    this.trafficGain = this.ctx.createGain();
    this.trafficGain.gain.value = 0.03;
    this.trafficSource.connect(trafficLp);
    trafficLp.connect(this.trafficGain);
    this.trafficGain.connect(this.ambientBus);
    this.trafficSource.start();

    // 4. Urban Crowd / Market Texture (SM Street & Palayam)
    this.crowdSource = this.ctx.createBufferSource();
    this.crowdSource.buffer = pinkBuf;
    this.crowdSource.loop = true;
    const crowdBp = this.ctx.createBiquadFilter();
    crowdBp.type = 'bandpass';
    crowdBp.frequency.value = 980;
    crowdBp.Q.value = 1.6;
    this.crowdGain = this.ctx.createGain();
    this.crowdGain.gain.value = 0.008;
    this.crowdSource.connect(crowdBp);
    crowdBp.connect(this.crowdGain);
    this.crowdGain.connect(this.ambientBus);
    this.crowdSource.start();

    // 5. Roadside Chai Peedika Oil Sizzle & Warm Kettle Loop (distance attenuated)
    this.teaFrySource = this.ctx.createBufferSource();
    this.teaFrySource.buffer = pinkBuf;
    this.teaFrySource.loop = true;
    const fryHp = this.ctx.createBiquadFilter();
    fryHp.type = 'bandpass';
    fryHp.frequency.value = 2650;
    fryHp.Q.value = 1.1;
    this.teaFryGain = this.ctx.createGain();
    this.teaFryGain.gain.value = 0.0001;
    this.teaFrySource.connect(fryHp);
    fryHp.connect(this.teaFryGain);
    this.teaFryGain.connect(this.ambientBus);
    this.teaFrySource.start();
  }

  updateEnvironment(dt: number, env: AudioEnvironmentUpdate): void {
    if (!this.ambienceStarted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    // Coastal proximity weight: strongest West of Beach Rd (x < -40)
    const coastDist = Math.max(0, env.playerX + 68);
    const coastalWeight = Math.max(0.08, Math.min(1, 1 - coastDist / 135));
    const urbanWeight = env.isCoastal ? 0.32 : env.isHomeZone ? 0.45 : 0.92;
    const nightScale = 1 - env.nightGlowFactor * 0.55;

    const teaDist = env.teaShopDistanceMeters ?? 999;
    const teaWeight = teaDist < 42 ? Math.max(0, Math.min(1, 1 - teaDist / 42)) : 0;

    this.seaGain?.gain.setTargetAtTime(0.02 + coastalWeight * 0.16, now, 0.35);
    this.windGain?.gain.setTargetAtTime(0.018 + coastalWeight * 0.05, now, 0.4);
    this.trafficGain?.gain.setTargetAtTime((0.015 + urbanWeight * 0.065) * nightScale, now, 0.4);
    this.crowdGain?.gain.setTargetAtTime(
      ((env.isMarket ? 0.032 : urbanWeight * 0.014) + teaWeight * 0.024) * nightScale,
      now,
      0.4,
    );
    this.teaFryGain?.gain.setTargetAtTime(0.0001 + teaWeight * teaWeight * 0.036, now, 0.25);

    if (teaWeight > 0.35) {
      this.activeAmbienceLabel = 'Chai Peedika & Kozhikode Streets';
    } else if (env.isCoastal || coastalWeight > 0.65) {
      this.activeAmbienceLabel = env.nightGlowFactor > 0.5 ? 'Arabian Sea Night Surf' : 'Arabian Sea Waves & Breeze';
    } else if (env.isHomeZone) {
      this.activeAmbienceLabel = env.nightGlowFactor > 0.5 ? 'West Hill Night Crickets' : 'West Hill Tropical Yard';
    } else if (env.isMarket) {
      this.activeAmbienceLabel = 'SM Street Bazaar & Traffic';
    } else {
      this.activeAmbienceLabel = env.nightGlowFactor > 0.5 ? 'Kozhikode Night Streets' : 'Mananchira City & Birds';
    }

    if (teaWeight > 0.08) {
      this.teaShopCooldownSec -= dt;
      if (this.teaShopCooldownSec <= 0) {
        this.teaShopCooldownSec = 1.4 + Math.random() * 2.2;
        const r = Math.random();
        const kind: TeaShopSfxEvent =
          r < 0.34 ? 'tea_pour' : r < 0.62 ? 'glass_clink' : r < 0.86 ? 'spoon_stir' : 'snack_fry';
        this.playTeaShopSfx(kind, teaWeight * 0.85, (Math.random() - 0.5) * 0.4);
      }
    }

    // Periodic daytime tropical birds
    if (env.nightGlowFactor < 0.45) {
      this.birdCooldownSec -= dt;
      if (this.birdCooldownSec <= 0) {
        this.birdCooldownSec = 3.2 + Math.random() * 4.5;
        this.triggerBirdChirp(env.isHomeZone ? 0.045 : 0.028);
      }
    }

    // Periodic night cricket shimmer
    if (env.nightGlowFactor > 0.42) {
      this.nightCricketCooldownSec -= dt;
      if (this.nightCricketCooldownSec <= 0) {
        this.nightCricketCooldownSec = 1.6 + Math.random() * 2.4;
        this.triggerCricketPulse(0.022 * env.nightGlowFactor);
      }
    }

    // Periodic distant traffic passby / auto-rickshaw horn
    if (!env.isHomeZone || env.nightGlowFactor < 0.6) {
      this.distantVehicleCooldownSec -= dt;
      if (this.distantVehicleCooldownSec <= 0) {
        this.distantVehicleCooldownSec = (env.isCoastal ? 11 : 7) + Math.random() * 8;
        const pan = (Math.random() * 2 - 1) * 0.85;
        if (Math.random() < 0.42) {
          this.playVehicleEvent(
            Math.random() < 0.65 ? 'auto_rickshaw' : 'bus',
            'horn',
            pan,
            0.22,
          );
        } else {
          this.playVehicleEvent('car', 'passby', pan, 0.25);
        }
      }
    }
  }

  playFootstep(surface: FootstepSurface, isSprinting: boolean): void {
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const buf = this.bufferCache.get('proc_pink_noise_short')!;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const filter = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();
    const gainScale = isSprinting ? 0.14 : 0.085;

    if (surface === 'sand') {
      filter.type = 'bandpass';
      filter.frequency.value = 1150 + Math.random() * 220;
      filter.Q.value = 0.7;
    } else if (surface === 'grass') {
      filter.type = 'bandpass';
      filter.frequency.value = 1550 + Math.random() * 300;
      filter.Q.value = 1.1;
    } else {
      // Asphalt / Interlock Sidewalk crisp sole tap
      filter.type = 'lowpass';
      filter.frequency.value = isSprinting ? 980 : 760;
      filter.Q.value = 1.5;
    }

    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(gainScale, now + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, now + (surface === 'sand' ? 0.12 : 0.075));

    src.connect(filter);
    filter.connect(env);
    env.connect(this.sfxBus);
    src.start(now, Math.random() * 0.15, 0.14);
  }

  playCharacterSfx(event: CharacterSfxEvent): void {
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    if (event === 'door_open' || event === 'house_enter') {
      this.playToneSweep(180, 110, 0.14, 'triangle', 0.14);
      this.playToneSweep(520, 660, 0.12, 'sine', 0.08, now + 0.06);
    } else if (event === 'door_close' || event === 'house_exit') {
      this.playToneSweep(140, 72, 0.12, 'triangle', 0.16);
    } else if (event === 'jump') {
      this.playToneSweep(190, 320, 0.12, 'sine', 0.09);
    } else if (event === 'land') {
      this.playToneSweep(130, 58, 0.11, 'triangle', 0.15);
    } else {
      this.playToneSweep(480, 640, 0.09, 'sine', 0.08);
    }
  }

  playVehicleEvent(
    kind: VehicleAudioKind,
    event: VehicleSfxEvent,
    pan = 0,
    distanceGainScale = 1,
  ): void {
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    panner.connect(event === 'passby' ? this.ambientBus : this.sfxBus);

    if (event === 'horn') {
      if (kind === 'private_bus') {
        // Classic Kerala private bus two-pulse musical air-horn
        const notes: Array<[number, number, number]> = [
          [285, 0, 0.14],
          [358, 0.15, 0.18],
          [448, 0.15, 0.18],
        ];
        for (const [f, offset, dur] of notes) {
          const t = now + offset;
          const osc = this.ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(f, t);
          const lp = this.ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 1480;
          const env = this.ctx.createGain();
          const peak = 0.058 * distanceGainScale;
          env.gain.setValueAtTime(0.0001, t);
          env.gain.linearRampToValueAtTime(peak, t + 0.018);
          env.gain.setValueAtTime(peak, t + dur - 0.04);
          env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
          osc.connect(lp);
          lp.connect(env);
          env.connect(panner);
          osc.start(t);
          osc.stop(t + dur + 0.02);
        }
        return;
      }

      let freqs: number[] = [380, 475];
      let dur = 0.24;
      let peak = 0.055 * distanceGainScale;
      let oscType: OscillatorType = 'sawtooth';

      if (kind === 'ksrtc_bus' || kind === 'bus') {
        freqs = [208, 262];
        dur = 0.34;
        peak = 0.072 * distanceGainScale;
      } else if (kind === 'truck') {
        freqs = [172, 218];
        dur = 0.36;
        peak = 0.075 * distanceGainScale;
      } else if (kind === 'auto_rickshaw') {
        freqs = [435, 540];
        dur = 0.17;
        peak = 0.052 * distanceGainScale;
      } else if (kind === 'scooter') {
        freqs = [545];
        dur = 0.15;
        peak = 0.044 * distanceGainScale;
        oscType = 'triangle';
      } else if (kind === 'motorcycle') {
        freqs = [472];
        dur = 0.18;
        peak = 0.048 * distanceGainScale;
      }

      for (const f of freqs) {
        const osc = this.ctx.createOscillator();
        osc.type = oscType;
        osc.frequency.setValueAtTime(f, now);
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = kind === 'scooter' || kind === 'auto_rickshaw' ? 1550 : 1220;
        const env = this.ctx.createGain();
        env.gain.setValueAtTime(0.0001, now);
        env.gain.linearRampToValueAtTime(peak, now + 0.018);
        env.gain.setValueAtTime(peak, now + Math.max(0.04, dur - 0.06));
        env.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        osc.connect(lp);
        lp.connect(env);
        env.connect(panner);
        osc.start(now);
        osc.stop(now + dur + 0.03);
      }
      return;
    }

    if (event === 'passby' || event === 'accel') {
      const profile = VEHICLE_AUDIO_PROFILES[kind];
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(profile.baseHz * 1.35, now);
      osc.frequency.exponentialRampToValueAtTime(profile.baseHz * 0.82, now + 1.1);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 340;
      const env = this.ctx.createGain();
      const peak = profile.maxGain * 0.45 * distanceGainScale;
      env.gain.setValueAtTime(0.0001, now);
      env.gain.linearRampToValueAtTime(peak, now + 0.42);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 1.15);
      osc.connect(lp);
      lp.connect(env);
      env.connect(panner);
      osc.start(now);
      osc.stop(now + 1.2);
      return;
    }

    if (event === 'collision') {
      const buf = this.bufferCache.get('proc_pink_noise_short')!;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 680;
      const noiseEnv = this.ctx.createGain();
      const scale = Math.max(0.12, Math.min(1.0, distanceGainScale));
      noiseEnv.gain.setValueAtTime(0.0001, now);
      noiseEnv.gain.linearRampToValueAtTime(0.18 * scale, now + 0.006);
      noiseEnv.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
      src.connect(lp);
      lp.connect(noiseEnv);
      noiseEnv.connect(panner);
      src.start(now, 0, 0.28);

      const thud = this.ctx.createOscillator();
      thud.type = 'triangle';
      thud.frequency.setValueAtTime(115, now);
      thud.frequency.exponentialRampToValueAtTime(38, now + 0.16);
      const thudEnv = this.ctx.createGain();
      thudEnv.gain.setValueAtTime(0.0001, now);
      thudEnv.gain.linearRampToValueAtTime(0.22 * scale, now + 0.005);
      thudEnv.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      thud.connect(thudEnv);
      thudEnv.connect(panner);
      thud.start(now);
      thud.stop(now + 0.2);
      return;
    }

    // Brake / tire screech
    const buf = this.bufferCache.get('proc_pink_noise_short')!;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = event === 'tire_screech' ? 2200 : 1200;
    bp.Q.value = event === 'tire_screech' ? 6 : 2;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.08 * distanceGainScale, now + 0.03);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    src.connect(bp);
    bp.connect(env);
    env.connect(panner);
    src.start(now, 0, 0.38);
  }

  /**
   * Continuous vehicle engine + tire roll loop for drivable Phase 7 vehicles.
   */
  createVehicleEngineLoop(kind: VehicleAudioKind): VehicleEngineLoopHandle {
    const profile = VEHICLE_AUDIO_PROFILES[kind];
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = profile.baseHz;

    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'triangle';
    subOsc.frequency.value = profile.baseHz * 0.5;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.0001;

    osc.connect(filter);
    subOsc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxBus);
    osc.start();
    subOsc.start();

    return {
      setThrottle: (rpmNorm: number) => {
        const clamped = Math.max(0, Math.min(1, rpmNorm));
        const now = this.ctx.currentTime;
        const targetHz = profile.baseHz + (profile.maxHz - profile.baseHz) * clamped;
        osc.frequency.setTargetAtTime(targetHz, now, 0.06);
        subOsc.frequency.setTargetAtTime(targetHz * 0.5, now, 0.06);
        filter.frequency.setTargetAtTime(220 + clamped * 680, now, 0.06);
        gain.gain.setTargetAtTime(profile.maxGain * (0.32 + clamped * 0.68), now, 0.08);
      },
      stop: () => {
        try {
          osc.stop();
          subOsc.stop();
          osc.disconnect();
          subOsc.disconnect();
          filter.disconnect();
          gain.disconnect();
        } catch {
          // Already stopped
        }
      },
    };
  }

  playGameSfx(event: GameSfxEvent): void {
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (event === 'ui_click') {
      this.playToneSweep(540, 420, 0.045, 'sine', 0.075);
    } else if (event === 'ui_back') {
      this.playToneSweep(380, 260, 0.055, 'sine', 0.07);
    } else if (event === 'notification') {
      this.playToneSweep(587.33, 587.33, 0.11, 'sine', 0.08, now);
      this.playToneSweep(880.0, 880.0, 0.16, 'sine', 0.07, now + 0.08);
    } else if (event === 'order_accept') {
      this.playToneSweep(523.25, 523.25, 0.12, 'sine', 0.085, now);
      this.playToneSweep(659.25, 659.25, 0.14, 'sine', 0.085, now + 0.09);
      this.playToneSweep(783.99, 783.99, 0.2, 'triangle', 0.09, now + 0.18);
    } else if (event === 'food_pickup') {
      this.playToneSweep(440.0, 587.33, 0.14, 'triangle', 0.085, now);
      this.playToneSweep(880.0, 880.0, 0.18, 'sine', 0.075, now + 0.11);
    } else if (event === 'delivery_complete') {
      this.playToneSweep(523.25, 523.25, 0.15, 'triangle', 0.09, now);
      this.playToneSweep(659.25, 659.25, 0.15, 'triangle', 0.09, now + 0.1);
      this.playToneSweep(783.99, 783.99, 0.18, 'triangle', 0.095, now + 0.2);
      this.playToneSweep(1046.5, 1046.5, 0.36, 'sine', 0.09, now + 0.3);
    } else if (event === 'reward_chime') {
      this.playToneSweep(659.25, 659.25, 0.12, 'sine', 0.08, now);
      this.playToneSweep(987.77, 987.77, 0.24, 'sine', 0.085, now + 0.09);
    } else if (event === 'npc_greet') {
      this.playToneSweep(493.88, 587.33, 0.11, 'sine', 0.065, now);
    } else if (event === 'mission_start') {
      this.playToneSweep(220, 440, 0.35, 'triangle', 0.12, now);
      this.playToneSweep(659.25, 659.25, 0.4, 'sine', 0.09, now + 0.14);
    } else if (event === 'mission_complete') {
      this.playToneSweep(523.25, 523.25, 0.18, 'triangle', 0.09, now);
      this.playToneSweep(659.25, 659.25, 0.18, 'triangle', 0.09, now + 0.12);
      this.playToneSweep(783.99, 783.99, 0.38, 'triangle', 0.1, now + 0.24);
    } else {
      this.playToneSweep(180, 75, 0.28, 'sine', 0.12);
    }
  }

  /**
   * Prepared weapon sound blueprint contract for Phase 9 combat system (not active in Phase 2 gameplay).
   */
  playWeaponCue(archetype: WeaponAudioArchetype): void {
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const buf = this.bufferCache.get('proc_pink_noise_short')!;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = archetype === 'sniper' || archetype === 'shotgun' ? 2400 : 1800;

    const env = this.ctx.createGain();
    const duration = archetype === 'sniper' ? 0.34 : archetype === 'shotgun' ? 0.26 : 0.14;
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.18, now + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(filter);
    filter.connect(env);
    env.connect(this.sfxBus);
    src.start(now, 0, duration + 0.02);
  }

  playTeaShopSfx(event: TeaShopSfxEvent, proximityGain = 1, pan = 0): void {
    if (this.ctx.state !== 'running') return;
    const scale = Math.max(0.05, Math.min(1, proximityGain));
    const now = this.ctx.currentTime;
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    panner.connect(this.ambientBus);

    if (event === 'tea_pour') {
      const buf = this.bufferCache.get('proc_pink_noise_short')!;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1400, now);
      bp.frequency.exponentialRampToValueAtTime(2400, now + 0.35);
      bp.Q.value = 2.2;
      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0.0001, now);
      env.gain.linearRampToValueAtTime(0.048 * scale, now + 0.06);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
      src.connect(bp);
      bp.connect(env);
      env.connect(panner);
      src.start(now, 0, 0.42);
    } else if (event === 'glass_clink') {
      for (const f of [2680, 4120]) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f + Math.random() * 140, now);
        const env = this.ctx.createGain();
        env.gain.setValueAtTime(0.0001, now);
        env.gain.linearRampToValueAtTime(0.026 * scale, now + 0.003);
        env.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
        osc.connect(env);
        env.connect(panner);
        osc.start(now);
        osc.stop(now + 0.16);
      }
    } else if (event === 'spoon_stir') {
      for (let i = 0; i < 3; i++) {
        const t = now + i * 0.095;
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(3250 + i * 160, t);
        const env = this.ctx.createGain();
        env.gain.setValueAtTime(0.0001, t);
        env.gain.linearRampToValueAtTime(0.022 * scale, t + 0.004);
        env.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
        osc.connect(env);
        env.connect(panner);
        osc.start(t);
        osc.stop(t + 0.085);
      }
    } else {
      // Snack frying oil crackle burst
      const buf = this.bufferCache.get('proc_pink_noise_short')!;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2800;
      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0.0001, now);
      env.gain.linearRampToValueAtTime(0.036 * scale, now + 0.03);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
      src.connect(hp);
      hp.connect(env);
      env.connect(panner);
      src.start(now, 0, 0.38);
    }
  }

  dispose(): void {
    for (const node of [
      this.seaSource,
      this.seaLfo,
      this.windSource,
      this.trafficSource,
      this.crowdSource,
      this.teaFrySource,
    ]) {
      try {
        node?.stop();
        node?.disconnect();
      } catch {
        // Ignore already stopped
      }
    }
    this.seaGain?.disconnect();
    this.seaFilter?.disconnect();
    this.windGain?.disconnect();
    this.trafficGain?.disconnect();
    this.crowdGain?.disconnect();
    this.teaFryGain?.disconnect();
    this.ambienceStarted = false;
  }

  private ensureProceduralBuffers(): void {
    const sr = this.ctx.sampleRate;

    if (!this.bufferCache.has('proc_pink_noise_3s')) {
      const len = sr * 3;
      const buf = this.ctx.createBuffer(2, len, sr);
      for (let ch = 0; ch < 2; ch++) {
        const data = buf.getChannelData(ch);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < len; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.09;
          b6 = white * 0.115926;
        }
      }
      this.bufferCache.set('proc_pink_noise_3s', buf);
    }

    if (!this.bufferCache.has('proc_brown_noise_3s')) {
      const len = sr * 3;
      const buf = this.ctx.createBuffer(1, len, sr);
      const data = buf.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        lastOut = (lastOut + 0.02 * white) / 1.02;
        data[i] = lastOut * 2.5;
      }
      this.bufferCache.set('proc_brown_noise_3s', buf);
    }

    if (!this.bufferCache.has('proc_pink_noise_short')) {
      const len = Math.floor(sr * 0.45);
      const buf = this.ctx.createBuffer(1, len, sr);
      const data = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + white * 0.09;
        b1 = 0.985 * b1 + white * 0.14;
        b2 = 0.950 * b2 + white * 0.22;
        data[i] = (b0 + b1 + b2 + white * 0.2) * 0.16;
      }
      this.bufferCache.set('proc_pink_noise_short', buf);
    }
  }

  private triggerBirdChirp(peakGain: number): void {
    const now = this.ctx.currentTime;
    const base = 2150 + Math.random() * 900;
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.4 - 0.7;
    pan.connect(this.ambientBus);

    for (let note = 0; note < 2; note++) {
      const t = now + note * 0.14;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.exponentialRampToValueAtTime(base * 1.28, t + 0.055);
      osc.frequency.exponentialRampToValueAtTime(base * 0.92, t + 0.11);

      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(peakGain, t + 0.018);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.115);

      osc.connect(env);
      env.connect(pan);
      osc.start(t);
      osc.stop(t + 0.13);
    }
  }

  private triggerCricketPulse(peakGain: number): void {
    const now = this.ctx.currentTime;
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.4 - 0.7;
    pan.connect(this.ambientBus);

    for (let pulse = 0; pulse < 3; pulse++) {
      const t = now + pulse * 0.065;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(4150 + pulse * 80, t);
      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(peakGain, t + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.048);
      osc.connect(env);
      env.connect(pan);
      osc.start(t);
      osc.stop(t + 0.06);
    }
  }

  private playToneSweep(
    startHz: number,
    endHz: number,
    durationSec: number,
    type: OscillatorType,
    peakGain: number,
    startTime = this.ctx.currentTime,
  ): void {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(startHz, startTime);
    if (startHz !== endHz) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endHz), startTime + durationSec);
    }
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(peakGain, startTime + Math.min(0.02, durationSec * 0.25));
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

    osc.connect(env);
    env.connect(this.sfxBus);
    osc.start(startTime);
    osc.stop(startTime + durationSec + 0.02);
  }
}
