import * as THREE from 'three';
import type { Logger } from '../core/Logger.ts';
import type { GameModeState, GameSettings } from '../types.ts';
import { getGroundHeightAt } from '../world/KozhikodeGeography.ts';
import type {
  AudioEnvironmentUpdate,
  AudioStateSnapshot,
  CharacterSfxEvent,
  FootstepSurface,
  GameSfxEvent,
  MusicContextId,
  VehicleAudioKind,
  VehicleSfxEvent,
  WeaponAudioArchetype,
} from './AudioTypes.ts';
import { CinematicMusicEngine } from './CinematicMusicEngine.ts';
import { MalabarSoundscapes } from './MalabarSoundscapes.ts';

type AudioContextCtor = typeof AudioContext;

function getAudioContextConstructor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return win.AudioContext ?? win.webkitAudioContext ?? null;
}

export class AudioManager {
  private readonly logger?: Logger;
  private ctx: AudioContext | null = null;
  private listener: THREE.AudioListener | null = null;
  private listenerParent: THREE.Camera | null = null;

  private masterGain: GainNode | null = null;
  private musicDuckGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;

  private readonly bufferCache = new Map<string, AudioBuffer>();
  private readonly positionalSources = new Set<THREE.PositionalAudio>();

  private musicEngine: CinematicMusicEngine | null = null;
  private soundscapes: MalabarSoundscapes | null = null;

  private unlocked = false;
  private suspended = false;
  private muted = false;
  private masterVolume = 0.8;
  private musicVolume = 0.72;
  private sfxVolume = 0.85;
  private ambientVolume = 0.78;
  private activeMusicContext: MusicContextId = 'menu';
  private strideAccumulator = 0;
  private duckTimeoutId: number | null = null;

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  /**
   * Attaches a single THREE.AudioListener cleanly onto the active camera (prevents duplicate listeners).
   */
  attachListener(camera: THREE.Camera): void {
    if (typeof window === 'undefined') return;
    if (!this.listener && typeof THREE.AudioListener === 'function') {
      try {
        this.listener = new THREE.AudioListener();
      } catch {
        this.listener = null;
      }
    }
    if (this.listener && this.listenerParent !== camera) {
      this.listenerParent?.remove(this.listener);
      camera.add(this.listener);
      this.listenerParent = camera;
    }
  }

  /**
   * Unlocks Web Audio cleanly after a legitimate user interaction on desktop or mobile browsers.
   */
  async unlockFromGesture(): Promise<boolean> {
    this.ensureGraphInitialized();
    if (!this.ctx) {
      return false;
    }

    if (this.ctx.state === 'suspended' && !this.suspended) {
      try {
        await this.ctx.resume();
      } catch {
        return false;
      }
    }

    if (this.ctx.state === 'running') {
      if (!this.unlocked) {
        this.unlocked = true;
        this.soundscapes?.startAmbienceLoops();
        this.musicEngine?.start();
        this.syncBusGains(0.35);
        this.logger?.info('Audio', 'AudioEngine unlocked cleanly after user gesture');
      }
      return true;
    }

    return false;
  }

  applySettings(settings: Pick<
    GameSettings,
    'masterMuted' | 'masterVolume' | 'musicVolume' | 'sfxVolume' | 'ambientVolume'
  >): void {
    this.muted = settings.masterMuted;
    this.masterVolume = clamp01(settings.masterVolume);
    this.musicVolume = clamp01(settings.musicVolume);
    this.sfxVolume = clamp01(settings.sfxVolume);
    this.ambientVolume = clamp01(settings.ambientVolume);
    this.syncBusGains(0.08);
  }

  setMusicContext(context: MusicContextId): void {
    this.activeMusicContext = context;
    if (this.musicEngine?.setContext(context)) {
      this.logger?.info('Audio', `Music context switched -> ${context}`);
    }
  }

  handleLifecycle(mode: GameModeState, documentHidden: boolean): void {
    const shouldSuspend = documentHidden || mode === 'paused' || mode === 'context_lost' || mode === 'error';
    this.suspended = shouldSuspend;

    if (!this.ctx) return;

    if (shouldSuspend) {
      this.syncBusGains(0.18);
      if (documentHidden && this.ctx.state === 'running') {
        void this.ctx.suspend().catch(() => undefined);
      }
    } else {
      if (this.unlocked && this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => undefined);
      }
      this.syncBusGains(0.3);
    }
  }

  duckMusic(scale = 0.42, holdMs = 1800): void {
    if (!this.ctx || !this.musicDuckGain) return;
    const now = this.ctx.currentTime;
    this.musicDuckGain.gain.setTargetAtTime(clamp01(scale), now, 0.08);

    if (this.duckTimeoutId !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.duckTimeoutId);
    }
    if (typeof window !== 'undefined') {
      this.duckTimeoutId = window.setTimeout(() => {
        if (this.ctx && this.musicDuckGain) {
          this.musicDuckGain.gain.setTargetAtTime(1.0, this.ctx.currentTime, 0.25);
        }
        this.duckTimeoutId = null;
      }, holdMs);
    }
  }

  async loadAudioBuffer(key: string, url: string): Promise<AudioBuffer | null> {
    if (this.bufferCache.has(key)) {
      return this.bufferCache.get(key)!;
    }
    this.ensureGraphInitialized();
    if (!this.ctx) return null;

    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const arr = await response.arrayBuffer();
      const decoded = await this.ctx.decodeAudioData(arr);
      this.bufferCache.set(key, decoded);
      return decoded;
    } catch (err) {
      this.logger?.warn('Audio', `Failed loading audio buffer ${key}`, String(err));
      return null;
    }
  }

  registerPositionalSource(
    target: THREE.Object3D,
    buffer: AudioBuffer | null,
    options?: { refDistance?: number; maxDistance?: number; volume?: number; loop?: boolean },
  ): THREE.PositionalAudio | null {
    if (!this.listener) return null;
    const source = new THREE.PositionalAudio(this.listener);
    source.setRefDistance(options?.refDistance ?? 12);
    source.setMaxDistance(options?.maxDistance ?? 85);
    source.setVolume(options?.volume ?? 0.65);
    source.setLoop(options?.loop ?? true);
    if (buffer) {
      source.setBuffer(buffer);
    }
    target.add(source);
    this.positionalSources.add(source);
    return source;
  }

  releasePositionalSource(source: THREE.PositionalAudio): void {
    try {
      if (source.isPlaying) {
        source.stop();
      }
      source.disconnect();
      source.parent?.remove(source);
    } catch {
      // Ignore already disposed
    }
    this.positionalSources.delete(source);
  }

  update(dt: number, env: AudioEnvironmentUpdate): void {
    if (!this.ctx || !this.unlocked || this.suspended) {
      return;
    }

    // Contextual music transitions based on mode, location & time of day
    let desiredMusic: MusicContextId = 'exploration';
    if (!env.isPlaying) {
      desiredMusic = 'menu';
    } else if (env.isHomeZone) {
      desiredMusic = 'opening';
    } else if (env.nightGlowFactor > 0.55) {
      desiredMusic = 'night_noir';
    } else if (env.isCoastal) {
      desiredMusic = 'coastal';
    }
    this.setMusicContext(desiredMusic);

    // Update coastal waves, wind, traffic, birds & night crickets
    this.soundscapes?.updateEnvironment(dt, env);

    // Cadence-locked surface footsteps when moving on foot
    if (env.isPlaying && env.isMoving && env.speed > 0.35) {
      const strideLength = env.isSprinting ? 1.85 : 1.38;
      this.strideAccumulator += env.speed * dt;
      if (this.strideAccumulator >= strideLength) {
        this.strideAccumulator %= strideLength;
        const surface = resolveFootstepSurface(env.playerX, env.playerZ);
        this.soundscapes?.playFootstep(surface, env.isSprinting);
      }
    } else {
      this.strideAccumulator = 0.6; // Immediate first step responsiveness
    }
  }

  playUiSound(event: Extract<GameSfxEvent, 'ui_click' | 'ui_back' | 'notification'> = 'ui_click'): void {
    void this.unlockFromGesture();
    this.soundscapes?.playGameSfx(event);
  }

  playGameEvent(event: GameSfxEvent): void {
    if (event === 'mission_start' || event === 'mission_complete' || event === 'notification') {
      this.duckMusic(0.38, 1600);
    }
    this.soundscapes?.playGameSfx(event);
  }

  playCharacterEvent(event: CharacterSfxEvent): void {
    this.soundscapes?.playCharacterSfx(event);
  }

  playVehicleEvent(kind: VehicleAudioKind, event: VehicleSfxEvent, pan = 0): void {
    this.soundscapes?.playVehicleEvent(kind, event, pan);
  }

  playWeaponCue(archetype: WeaponAudioArchetype): void {
    this.soundscapes?.playWeaponCue(archetype);
  }

  getSnapshot(): AudioStateSnapshot {
    return {
      unlocked: this.unlocked,
      suspended: this.suspended,
      muted: this.muted,
      masterVolume: this.masterVolume,
      musicVolume: this.musicVolume,
      sfxVolume: this.sfxVolume,
      ambientVolume: this.ambientVolume,
      activeMusicContext: this.activeMusicContext,
      activeMusicLabel: this.musicEngine?.getContextLabel() ?? 'Malabar Dusk Overdrive',
      activeAmbienceLabel: this.soundscapes?.getActiveAmbienceLabel() ?? 'Kozhikode City Breeze',
      cachedBuffers: this.bufferCache.size,
      positionalSources: this.positionalSources.size,
    };
  }

  dispose(): void {
    if (this.duckTimeoutId !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.duckTimeoutId);
      this.duckTimeoutId = null;
    }

    for (const src of this.positionalSources) {
      try {
        if (src.isPlaying) src.stop();
        src.disconnect();
        src.parent?.remove(src);
      } catch {
        // Ignore cleanup errors
      }
    }
    this.positionalSources.clear();

    this.musicEngine?.dispose();
    this.musicEngine = null;
    this.soundscapes?.dispose();
    this.soundscapes = null;

    if (this.listener && this.listenerParent) {
      this.listenerParent.remove(this.listener);
    }
    this.listener = null;
    this.listenerParent = null;

    this.masterGain?.disconnect();
    this.musicDuckGain?.disconnect();
    this.musicGain?.disconnect();
    this.sfxGain?.disconnect();
    this.ambientGain?.disconnect();
    this.limiter?.disconnect();

    if (this.ctx) {
      void this.ctx.close().catch(() => undefined);
      this.ctx = null;
    }

    this.bufferCache.clear();
    this.unlocked = false;
  }

  private ensureGraphInitialized(): void {
    if (this.ctx) return;
    const Ctor = getAudioContextConstructor();
    if (!Ctor) return;

    try {
      const ctx = this.listener?.context ?? new Ctor();
      this.ctx = ctx;

      // Safety dynamics limiter preventing harsh distortion or excessive loudness
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.knee.value = 12;
      limiter.ratio.value = 6;
      limiter.attack.value = 0.005;
      limiter.release.value = 0.16;
      limiter.connect(ctx.destination);
      this.limiter = limiter;

      this.masterGain = ctx.createGain();
      this.masterGain.gain.value = 0.0001;
      this.masterGain.connect(limiter);

      this.musicDuckGain = ctx.createGain();
      this.musicDuckGain.gain.value = 1.0;
      this.musicDuckGain.connect(this.masterGain);

      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = this.musicVolume;
      this.musicGain.connect(this.musicDuckGain);

      this.sfxGain = ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.masterGain);

      this.ambientGain = ctx.createGain();
      this.ambientGain.gain.value = this.ambientVolume;
      this.ambientGain.connect(this.masterGain);

      this.soundscapes = new MalabarSoundscapes(ctx, this.sfxGain, this.ambientGain, this.bufferCache);
      this.musicEngine = new CinematicMusicEngine(ctx, this.musicGain);
      this.musicEngine.setContext(this.activeMusicContext);

      this.syncBusGains(0.05);
    } catch (err) {
      this.logger?.warn('Audio', 'Web Audio initialization deferred/unavailable', String(err));
      this.ctx = null;
    }
  }

  private syncBusGains(rampSec: number): void {
    if (!this.ctx || !this.masterGain || !this.musicGain || !this.sfxGain || !this.ambientGain) {
      return;
    }
    const now = this.ctx.currentTime;
    const effectiveMaster = this.muted || this.suspended || !this.unlocked ? 0 : this.masterVolume;

    this.masterGain.gain.setTargetAtTime(effectiveMaster, now, rampSec);
    this.musicGain.gain.setTargetAtTime(this.musicVolume, now, rampSec);
    this.sfxGain.gain.setTargetAtTime(this.sfxVolume, now, rampSec);
    this.ambientGain.gain.setTargetAtTime(this.ambientVolume, now, rampSec);
  }
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

export function resolveFootstepSurface(x: number, z: number): FootstepSurface {
  if (x < -67.5) return 'sand';
  if (x >= -25 && x <= 25 && Math.abs(z) >= 18 && Math.abs(z) <= 27) return 'grass';
  return getGroundHeightAt(x, z) <= 0.03 ? 'asphalt' : 'sidewalk';
}
