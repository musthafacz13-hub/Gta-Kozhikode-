import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';
import {
  CHARACTER_STORY_MANIFEST,
  resolveGraphicsPresetProfile,
  VEHICLE_VISUAL_MANIFEST,
  WEAPON_PROGRESSION_MANIFEST,
} from '../src/engine/assets/AssetRegistry.ts';
import { AssetManager } from '../src/engine/assets/AssetManager.ts';
import { AudioManager, resolveFootstepSurface } from '../src/engine/audio/AudioManager.ts';
import { PerformanceMonitor } from '../src/engine/core/PerformanceMonitor.ts';
import { InputManager } from '../src/engine/input/InputManager.ts';
import {
  createDefaultSettings,
  IndexedDBStorage,
  sanitizeSettings,
} from '../src/engine/persistence/IndexedDBStorage.ts';
import { PlayerController } from '../src/engine/player/PlayerController.ts';
import { AtmosphereSystem } from '../src/engine/rendering/AtmosphereSystem.ts';
import { MaterialLibrary } from '../src/engine/rendering/MaterialLibrary.ts';
import type { EngineHudSnapshot } from '../src/engine/types.ts';
import {
  CHUNK_SIZE_METERS,
  getDistrictAt,
  getGroundHeightAt,
  KOZHIKODE_REGIONS,
  PROTAGONIST_HOME_COORDS,
  worldToChunkCoords,
} from '../src/engine/world/KozhikodeGeography.ts';
import {
  createAutoRickshawLOD,
  createCityBusLOD,
  createFishingBoatLOD,
} from '../src/engine/world/VehicleVisualFactory.ts';
import { WorldStreamer } from '../src/engine/world/WorldStreamer.ts';
import { BottomAudioPanel } from '../src/ui/BottomAudioPanel.tsx';
import { HudOverlay } from '../src/ui/HudOverlay.tsx';
import { TitleScreen } from '../src/ui/TitleScreen.tsx';

function withMockCanvasDocument<T>(fn: () => T): T {
  const prevDoc = globalThis.document;
  Object.assign(globalThis, {
    document: {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => null,
      }),
    },
  });
  try {
    return fn();
  } finally {
    Object.assign(globalThis, { document: prevDoc });
  }
}

test('KozhikodeGeography resolves district regions, chunk grid, and terrain elevation accurately', () => {
  assert.ok(KOZHIKODE_REGIONS.length >= 17);

  assert.equal(getDistrictAt(0, 0).id, 'mananchira');
  assert.equal(getDistrictAt(24, 88).id, 'sm_street');
  assert.equal(getDistrictAt(-78, -8).id, 'kozhikode_beach');
  assert.equal(getDistrictAt(-36, -136).id, 'protagonist_home');
  assert.equal(getDistrictAt(112, 68).id, 'palayam');
  assert.equal(getDistrictAt(128, -38).id, 'mavoor_road');

  assert.equal(CHUNK_SIZE_METERS, 120);
  assert.equal(worldToChunkCoords(0, 0).key, '0,0');
  assert.equal(worldToChunkCoords(-78, -8).key, '-1,0');
  assert.equal(worldToChunkCoords(24, 88).key, '0,1');
  assert.equal(worldToChunkCoords(-36, -136).key, '0,-1');

  // Elevation checks: beach sand -> 0.0, road bed -> 0.02, park/sidewalk -> 0.18
  assert.equal(getGroundHeightAt(-82, 0), 0.0);
  assert.equal(getGroundHeightAt(34, 0), 0.02);
  assert.equal(getGroundHeightAt(22.5, 2.5), 0.18);
});

test('AssetRegistry scales graphics presets and defines vehicle, weapon, and character manifests', () => {
  const low = resolveGraphicsPresetProfile('low');
  const med = resolveGraphicsPresetProfile('medium');
  const high = resolveGraphicsPresetProfile('high');
  const ultra = resolveGraphicsPresetProfile('ultra');

  assert.equal(low.shadowsEnabled, false);
  assert.equal(low.shadowMapSize, 512);
  assert.equal(low.streamRadiusChunks, 1);
  assert.ok(low.foliageDensityScale < med.foliageDensityScale);

  assert.equal(med.shadowsEnabled, true);
  assert.equal(med.shadowMapSize, 1024);
  assert.equal(high.shadowMapSize, 2048);
  assert.equal(ultra.streamRadiusChunks, 3);
  assert.ok(ultra.lodNearDistance > high.lodNearDistance);

  assert.equal(VEHICLE_VISUAL_MANIFEST.length, 9);
  assert.ok(VEHICLE_VISUAL_MANIFEST.every((v) => v.lod0TriBudget > v.lod1TriBudget));

  assert.equal(WEAPON_PROGRESSION_MANIFEST.length, 10);
  assert.equal(WEAPON_PROGRESSION_MANIFEST[0].id, 'wpn_basic_pistol');
  assert.equal(WEAPON_PROGRESSION_MANIFEST[9].id, 'wpn_awm_style');
  assert.ok(WEAPON_PROGRESSION_MANIFEST.every((w) => w.targetPhase === 'phase9_combat'));

  const protagonist = CHARACTER_STORY_MANIFEST.find((c) => c.id === 'protagonist_arjun');
  assert.ok(protagonist);
  assert.equal(protagonist.startingLocationRegionId, 'protagonist_home');
});

test('PerformanceMonitor computes true wall-clock FPS and adaptive pixel ratio with hysteresis', () => {
  const perf = new PerformanceMonitor(40);

  // Fast CPU (2ms) at 60Hz wall interval -> FPS ~60, never inflated to 240
  for (let i = 0; i < 30; i++) {
    perf.recordFrame(2.0, 1, 1 / 60);
  }
  const fastSnap = perf.getSnapshot();
  assert.equal(fastSnap.fps, 60);
  assert.equal(fastSnap.cpuFrameMsP95, 2);

  // Should step DPR up when below maxRatio and past cooldown
  const steppedUp = perf.computeAdaptivePixelRatio(1.0, 0.75, 1.5, 5000, false);
  assert.equal(steppedUp, 1.1);

  // Cooldown prevents immediate consecutive switch
  const blockedByCooldown = perf.computeAdaptivePixelRatio(1.1, 0.75, 1.5, 5500, false);
  assert.equal(blockedByCooldown, 1.1);

  // Sustained slow frames trigger downscale after cooldown
  perf.reset();
  for (let i = 0; i < 30; i++) {
    perf.recordFrame(28.5, 1, 0.036);
  }
  const steppedDown = perf.computeAdaptivePixelRatio(1.5, 0.75, 2.0, 10000, false);
  assert.equal(steppedDown, 1.35);

  // Software WebGL stays fixed without oscillation
  const swFixed = perf.computeAdaptivePixelRatio(1.0, 0.75, 2.0, 20000, true);
  assert.equal(swFixed, 1.0);
});

test('sanitizeSettings validates Phase 2 adaptiveResolution and timeOfDayPreset options', () => {
  const defaults = sanitizeSettings(null);
  assert.equal(defaults.adaptiveResolution, true);
  assert.equal(defaults.timeOfDayPreset, 'golden');

  const custom = sanitizeSettings({
    adaptiveResolution: false,
    timeOfDayPreset: 'night',
    graphicsTier: 'ultra',
  });
  assert.equal(custom.adaptiveResolution, false);
  assert.equal(custom.timeOfDayPreset, 'night');
  assert.equal(custom.graphicsTier, 'ultra');

  const invalid = sanitizeSettings({
    adaptiveResolution: 'yes',
    timeOfDayPreset: 'midnight_invalid',
  } as unknown as Parameters<typeof sanitizeSettings>[0]);
  assert.equal(invalid.adaptiveResolution, true);
  assert.equal(invalid.timeOfDayPreset, 'golden');
});

test('AtmosphereSystem transitions sky, sun exposure, shadows, and night glow across time presets', () => {
  const scene = new THREE.Scene();
  const med = resolveGraphicsPresetProfile('medium');
  const atm = new AtmosphereSystem(scene, false, med);

  atm.setTimeOfDayPreset('noon');
  atm.update(0, scene, 0, 0, med);
  const noon = atm.getState();
  assert.equal(noon.clockFormatted, '12:30');

  atm.setTimeOfDayPreset('night');
  atm.update(0, scene, 0, 0, med);
  const night = atm.getState();
  assert.equal(night.clockFormatted, '21:30');
  assert.ok(night.nightGlowFactor > noon.nightGlowFactor);
  assert.ok(night.nightGlowFactor > 0.7);

  atm.setTimeOfDayPreset('cycle');
  const before = atm.getTimeOfDayHours();
  atm.update(30, scene, 10, 10, med);
  const after = atm.getTimeOfDayHours();
  assert.ok(after !== before, 'Cycle mode must advance solar clock');

  const low = resolveGraphicsPresetProfile('low');
  atm.applyGraphicsPreset(low, false);
  assert.equal(atm.sunLight.castShadow, false);

  atm.dispose();
});

test('WorldStreamer streams/unloads chunks on demand, maintains colliders, and builds multi-LOD vehicles', () => {
  withMockCanvasDocument(() => {
    const assets = new AssetManager();
    const mats = new MaterialLibrary(assets);
    const lowPreset = resolveGraphicsPresetProfile('low'); // radius = 1, unloadRadius = 2
    const streamer = new WorldStreamer(mats, lowPreset);

    // 1. Initial load around Mananchira (0,0) -> loads 3x3 grid bounded to playable map
    const changed1 = streamer.update(0, 22.5, 2.5);
    assert.equal(changed1, true);
    assert.ok(streamer.getActiveChunkCount() >= 6);

    const colliders = streamer.getActiveColliders();
    assert.ok(colliders.length > 10, 'Streamed chunks must populate static AABB colliders');

    // 2. Verify LOD vehicles contain >= 2 detail levels
    const autoLod = createAutoRickshawLOD(mats);
    const busLod = createCityBusLOD(mats);
    const boatLod = createFishingBoatLOD();
    assert.ok(autoLod.levels.length >= 2);
    assert.ok(busLod.levels.length >= 2);
    assert.ok(boatLod.levels.length >= 2);

    // 3. Moving far South-East to (cx=2, cz=2) unloads distant negative chunks cleanly
    const changed2 = streamer.update(0.1, 240, 240);
    assert.equal(changed2, true);
    assert.ok(streamer.getActiveChunkCount() > 0);

    // 4. Floating origin offset shifts root group cleanly
    streamer.setOriginOffset(120, -60);
    assert.equal(streamer.root.position.x, -120);
    assert.equal(streamer.root.position.z, 60);
    assert.deepEqual(streamer.getOriginOffset(), { x: 120, z: -60 });

    streamer.dispose();
    assets.disposeAll();
  });
});

test('Protagonist Home at West Hill features open front gate into yard and solid compound walls', () => {
  withMockCanvasDocument(() => {
    const assets = new AssetManager();
    const mats = new MaterialLibrary(assets);
    const streamer = new WorldStreamer(mats, resolveGraphicsPresetProfile('medium'));

    streamer.update(0, PROTAGONIST_HOME_COORDS.gateX, PROTAGONIST_HOME_COORDS.gateZ);
    const player = new PlayerController();
    player.setEnvironment(streamer.getActiveColliders(), getGroundHeightAt);

    // Spawn just outside the front gate (-131) and walk straight North (-Z) into the front yard
    player.resetSpawn(PROTAGONIST_HOME_COORDS.gateX, PROTAGONIST_HOME_COORDS.gateZ + 2, 0);
    const input = new InputManager();
    input.setVirtualAxes(0, 1);
    for (let i = 0; i < 90; i++) {
      player.update(1 / 60, input.consumeFrameState(), 0);
    }

    // Gate sits at z = -133.8; walking 1.5s @ 4.8 m/s enters yard at z ~ -138.2
    assert.ok(
      player.position.z < -137.5,
      `Player should walk smoothly through Arjun's front gate into courtyard, got z=${player.position.z}`,
    );

    streamer.dispose();
    assets.disposeAll();
  });
});

test('AudioManager manages independent buses, gesture unlock, contextual music, lifecycle, and leak-free disposal', async () => {
  const prevWin = globalThis.window;
  let closed = false;
  let suspendedCount = 0;
  let resumedCount = 0;
  const createdGains: Array<{ gain: { value: number; target: number } }> = [];

  const makeParam = (initial = 0) => ({
    value: initial,
    target: initial,
    setValueAtTime(v: number) {
      this.value = v;
      this.target = v;
    },
    linearRampToValueAtTime(v: number) {
      this.target = v;
    },
    exponentialRampToValueAtTime(v: number) {
      this.target = v;
    },
    setTargetAtTime(v: number) {
      this.value = v;
      this.target = v;
    },
  });

  const makeNode = () => ({
    connect() {},
    disconnect() {},
    start() {},
    stop() {},
    gain: makeParam(1),
    frequency: makeParam(440),
    detune: makeParam(0),
    Q: makeParam(1),
    pan: makeParam(0),
    threshold: makeParam(-10),
    knee: makeParam(12),
    ratio: makeParam(6),
    attack: makeParam(0.005),
    release: makeParam(0.16),
    delayTime: makeParam(0.36),
    type: 'sine',
    loop: false,
    buffer: null as unknown,
  });

  class MockAudioContext {
    state: 'suspended' | 'running' | 'closed' = 'suspended';
    sampleRate = 44100;
    currentTime = 1.0;
    destination = makeNode();
    async resume() {
      resumedCount++;
      this.state = 'running';
    }
    async suspend() {
      suspendedCount++;
      this.state = 'suspended';
    }
    async close() {
      closed = true;
      this.state = 'closed';
    }
    createGain() {
      const g = makeNode();
      createdGains.push(g);
      return g;
    }
    createDynamicsCompressor() {
      return makeNode();
    }
    createDelay() {
      return makeNode();
    }
    createBiquadFilter() {
      return makeNode();
    }
    createOscillator() {
      return makeNode();
    }
    createStereoPanner() {
      return makeNode();
    }
    createBuffer(channels: number, length: number, sampleRate: number) {
      return {
        numberOfChannels: channels,
        length,
        sampleRate,
        getChannelData: () => new Float32Array(length),
      };
    }
    createBufferSource() {
      return makeNode();
    }
  }

  Object.assign(globalThis, {
    window: {
      AudioContext: MockAudioContext,
      setInterval: () => 101,
      clearInterval: () => {},
      setTimeout: () => 202,
      clearTimeout: () => {},
    },
  });

  try {
    const audio = new AudioManager();
    const cam = new THREE.PerspectiveCamera();

    // Prevent duplicate AudioListener attachment
    audio.attachListener(cam);
    audio.attachListener(cam);
    const listenersOnCamera = cam.children.filter((c) => c instanceof THREE.AudioListener);
    assert.ok(listenersOnCamera.length <= 1);

    const unlocked = await audio.unlockFromGesture();
    assert.equal(unlocked, true);
    assert.ok(resumedCount >= 1);

    // Verify procedural audio buffers cached without duplicates
    const snap1 = audio.getSnapshot();
    assert.equal(snap1.unlocked, true);
    assert.ok(snap1.cachedBuffers >= 3);

    // Apply independent channel settings + mute
    audio.applySettings({
      masterMuted: false,
      masterVolume: 0.9,
      musicVolume: 0.4,
      sfxVolume: 0.75,
      ambientVolume: 0.6,
    });
    const snapVol = audio.getSnapshot();
    assert.equal(snapVol.masterVolume, 0.9);
    assert.equal(snapVol.musicVolume, 0.4);
    assert.equal(snapVol.sfxVolume, 0.75);
    assert.equal(snapVol.ambientVolume, 0.6);

    // Contextual music switches across Kozhikode regions & night
    audio.update(0.1, {
      playerX: PROTAGONIST_HOME_COORDS.gateX,
      playerZ: PROTAGONIST_HOME_COORDS.gateZ,
      nightGlowFactor: 0.2,
      districtId: 'protagonist_home',
      isCoastal: false,
      isMarket: false,
      isHomeZone: true,
      isPlaying: true,
      isMoving: true,
      isSprinting: false,
      speed: 4.8,
    });
    assert.equal(audio.getSnapshot().activeMusicContext, 'opening');

    audio.update(0.1, {
      playerX: -72,
      playerZ: 0,
      nightGlowFactor: 0.15,
      districtId: 'kozhikode_beach',
      isCoastal: true,
      isMarket: false,
      isHomeZone: false,
      isPlaying: true,
      isMoving: false,
      isSprinting: false,
      speed: 0,
    });
    assert.equal(audio.getSnapshot().activeMusicContext, 'coastal');

    audio.update(0.1, {
      playerX: 22.5,
      playerZ: 2.5,
      nightGlowFactor: 0.85,
      districtId: 'mananchira',
      isCoastal: false,
      isMarket: false,
      isHomeZone: false,
      isPlaying: true,
      isMoving: false,
      isSprinting: false,
      speed: 0,
    });
    assert.equal(audio.getSnapshot().activeMusicContext, 'night_noir');

    // Pause / resume & backgrounding lifecycle
    audio.handleLifecycle('paused', false);
    assert.equal(audio.getSnapshot().suspended, true);
    audio.handleLifecycle('playing', true);
    assert.ok(suspendedCount >= 1);
    audio.handleLifecycle('playing', false);
    assert.equal(audio.getSnapshot().suspended, false);

    // Mute clamps master output cleanly
    audio.applySettings({
      masterMuted: true,
      masterVolume: 0.9,
      musicVolume: 0.4,
      sfxVolume: 0.75,
      ambientVolume: 0.6,
    });
    assert.equal(audio.getSnapshot().muted, true);

    // Footstep surface classification
    assert.equal(resolveFootstepSurface(-80, 0), 'sand');
    assert.equal(resolveFootstepSurface(0, 22), 'grass');
    assert.equal(resolveFootstepSurface(34, 0), 'asphalt');
    assert.equal(resolveFootstepSurface(22.5, 2.5), 'sidewalk');

    // Clean disposal
    audio.dispose();
    assert.equal(closed, true);
    assert.equal(audio.getSnapshot().unlocked, false);
    assert.equal(audio.getSnapshot().cachedBuffers, 0);
  } finally {
    Object.assign(globalThis, { window: prevWin });
  }
});

test('IndexedDBStorage persists independent music, sfx, and ambience channel volumes', async () => {
  const storage = new IndexedDBStorage();
  await storage.initialize();
  const saved = await storage.saveSettings({
    ...createDefaultSettings(),
    masterMuted: true,
    masterVolume: 0.65,
    musicVolume: 0.35,
    sfxVolume: 0.9,
    ambientVolume: 0.5,
  });
  assert.equal(saved.masterMuted, true);
  assert.equal(saved.masterVolume, 0.65);
  assert.equal(saved.musicVolume, 0.35);
  assert.equal(saved.sfxVolume, 0.9);
  assert.equal(saved.ambientVolume, 0.5);

  const loaded = await storage.getSettings();
  assert.equal(loaded.musicVolume, 0.35);
  assert.equal(loaded.sfxVolume, 0.9);
  assert.equal(loaded.ambientVolume, 0.5);

  const clamped = sanitizeSettings({
    musicVolume: -2,
    sfxVolume: 5,
    ambientVolume: Number.NaN,
  });
  assert.equal(clamped.musicVolume, 0);
  assert.equal(clamped.sfxVolume, 1);
  assert.equal(clamped.ambientVolume, 0.78);
});

test('Frontend HUD, TitleScreen, and BottomAudioPanel render all required icons with crisp SVGs', () => {
  const settings = createDefaultSettings();
  const mockSnapshot: EngineHudSnapshot = {
    mode: 'playing',
    cameraMode: 'free_inspect',
    cameraX: 22.5,
    cameraZ: 2.5,
    cameraYaw: 0,
    playerX: 22.5,
    playerZ: 2.5,
    playerLat: 11.2544,
    playerLon: 75.78,
    playerHeading: 0,
    isMoving: false,
    isSprinting: false,
    districtName: 'Mananchira Square',
    talukName: 'Kozhikode Taluk',
    biome: 'urban',
    clockFormatted: '17:36',
    activeChunks: 6,
    totalRegions: 17,
    gazetteerCount: 54,
    nearHome: true,
    homeDistanceMeters: 5,
    activeDestination: null,
    audio: {
      unlocked: true,
      suspended: false,
      muted: false,
      masterVolume: 0.8,
      musicVolume: 0.72,
      sfxVolume: 0.85,
      ambientVolume: 0.78,
      activeMusicContext: 'exploration',
      activeMusicLabel: 'Kozhikode Streets',
      activeAmbienceLabel: 'Mananchira City & Birds',
      cachedBuffers: 3,
      positionalSources: 0,
    },
    showDebugGrid: false,
    activeSlotId: 'slot_auto_phase1',
    storageMode: 'indexeddb',
    capabilities: null,
    settings,
    metrics: {
      fps: 60,
      cpuFrameMsP50: 4,
      cpuFrameMsP95: 7,
      lastStepMs: 4,
      drawCalls: 42,
      triangles: 14500,
      geometries: 28,
      textures: 12,
      jsHeapMb: 48,
      activeFixedSteps: 1,
    },
    slots: [],
    lastError: null,
  };

  const hudHtml = renderToStaticMarkup(
    React.createElement(HudOverlay, {
      snapshot: mockSnapshot,
      onPause: () => {},
      onToggleCamera: () => {},
      onToggleMute: () => {},
      onUpdateSettings: () => {},
      onHomeInteract: () => {},
      onOpenWorldMap: () => {},
      onClearDestination: () => {},
      onUiClick: () => {},
      onVirtualMove: () => {},
      onSprintHold: () => {},
    }),
  );

  for (const requiredAria of [
    "Arjun&#x27;s Home Map Marker",
    'Home Location Status',
    'World Map',
    'Toggle Camera View',
    'Pause and Settings',
    'Movement Joystick',
    'Sound and Audio Settings',
    'Interact with Home Entrance',
    'Jump',
    'Sprint',
  ]) {
    assert.ok(hudHtml.includes(requiredAria), `Missing HUD control in markup: ${requiredAria}`);
  }
  assert.ok((hudHtml.match(/<svg/g) ?? []).length >= 9, 'HUD must render crisp SVG icons');

  const audioPanelHtml = renderToStaticMarkup(
    React.createElement(BottomAudioPanel, {
      settings,
      audio: mockSnapshot.audio,
      onUpdateSettings: () => {},
      onToggleMute: () => {},
      onClose: () => {},
    }),
  );
  for (const label of ['Master', 'Music', 'Effects', 'Ambience', 'Kozhikode Streets']) {
    assert.ok(audioPanelHtml.includes(label), `BottomAudioPanel missing ${label}`);
  }

  const titleHtml = renderToStaticMarkup(
    React.createElement(TitleScreen, {
      isBooting: false,
      hasSavedSlot: true,
      settings,
      audio: mockSnapshot.audio,
      onContinue: () => {},
      onNewGame: () => {},
      onOpenSettings: () => {},
      onUpdateSettings: () => {},
      onToggleMute: () => {},
      onUiClick: () => {},
    }),
  );
  assert.ok(titleHtml.includes('Title Screen Audio Settings'));
  assert.ok(titleHtml.includes('Settings &amp; Audio'));
});

