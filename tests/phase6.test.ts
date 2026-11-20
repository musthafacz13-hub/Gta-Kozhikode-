import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';
import { resolveGraphicsPresetProfile } from '../src/engine/assets/AssetRegistry.ts';
import { CameraManager } from '../src/engine/camera/CameraManager.ts';
import { GameLoop } from '../src/engine/core/GameLoop.ts';
import { InputManager } from '../src/engine/input/InputManager.ts';
import { resolveContextualInteraction } from '../src/engine/interaction/InteractionResolver.ts';
import {
  createDefaultSettings,
  IndexedDBStorage,
  sanitizeSettings,
} from '../src/engine/persistence/IndexedDBStorage.ts';
import { PlayerController } from '../src/engine/player/PlayerController.ts';
import { AtmosphereSystem } from '../src/engine/rendering/AtmosphereSystem.ts';
import type { EngineHudSnapshot, NearbyBuildingSummary } from '../src/engine/types.ts';
import { PROTAGONIST_HOME_COORDS } from '../src/engine/world/KozhikodeGeography.ts';
import { HudOverlay } from '../src/ui/HudOverlay.tsx';
import { PauseDiagnosticsModal } from '../src/ui/PauseDiagnosticsModal.tsx';

function createBaseSnapshot(overrides: Partial<EngineHudSnapshot> = {}): EngineHudSnapshot {
  return {
    mode: 'playing',
    cameraMode: 'free_inspect',
    cameraPreset: 'standard',
    cameraX: PROTAGONIST_HOME_COORDS.porchX,
    cameraZ: PROTAGONIST_HOME_COORDS.porchZ,
    cameraYaw: Math.PI,
    playerX: PROTAGONIST_HOME_COORDS.porchX,
    playerZ: PROTAGONIST_HOME_COORDS.porchZ,
    playerLat: 11.281,
    playerLon: 75.775,
    playerHeading: 0,
    isMoving: false,
    isSprinting: false,
    isGrounded: true,
    pointerLocked: false,
    weatherLabel: 'Golden Haze',
    movementGait: 'idle',
    animationState: 'idle',
    districtName: 'West Hill · Tharavadu',
    talukName: 'Kozhikode Taluk',
    biome: 'urban',
    clockFormatted: '17:36',
    activeChunks: 9,
    totalRegions: 19,
    gazetteerCount: 54,
    nearHome: false,
    homeDistanceMeters: 140,
    nearbyBuilding: null,
    nearbyInteraction: null,
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
      activeMusicLabel: 'Malabar Dusk Overdrive',
      activeAmbienceLabel: 'West Hill Neighbourhood',
      cachedBuffers: 10,
      positionalSources: 0,
    },
    showDebugGrid: false,
    activeSlotId: 'slot_auto_phase1',
    storageMode: 'indexeddb',
    capabilities: null,
    settings: createDefaultSettings(),
    metrics: {
      fps: 60,
      cpuFrameMsP50: 4.5,
      cpuFrameMsP95: 7.2,
      lastStepMs: 4.1,
      drawCalls: 120,
      triangles: 45000,
      geometries: 80,
      textures: 16,
      jsHeapMb: 72,
      activeFixedSteps: 1,
    },
    slots: [],
    lastError: null,
    ...overrides,
  };
}

class MockTouchSurface {
  listeners = new Map<string, Set<(e: any) => void>>();
  width = 1000;
  height = 500;

  addEventListener(type: string, fn: (e: any) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }

  removeEventListener(type: string, fn: (e: any) => void): void {
    this.listeners.get(type)?.delete(fn);
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: this.width, height: this.height, right: this.width, bottom: this.height };
  }

  emit(type: string, event: any): void {
    for (const fn of this.listeners.get(type) ?? []) {
      fn(event);
    }
  }
}

test('InputManager handles 360-degree joystick axes, diagonal normalization, and dead-zone thresholds', () => {
  const input = new InputManager();

  // Below default dead-zone (0.08) -> zeroed cleanly
  input.setVirtualAxes(0.04, -0.05);
  let frame = input.consumeFrameState();
  assert.equal(frame.moveX, 0);
  assert.equal(frame.moveY, 0);

  // Diagonal over-unit vector -> normalized so magnitude <= 1
  input.setVirtualAxes(1.0, 1.0);
  frame = input.consumeFrameState();
  assert.ok(Math.hypot(frame.moveX, frame.moveY) <= 1.0001);
  assert.ok(Math.abs(frame.moveX - Math.SQRT1_2) < 0.01);
  assert.ok(Math.abs(frame.moveY - Math.SQRT1_2) < 0.01);

  // Custom dead-zone & sensitivity bounds clamping
  input.setJoystickConfig(0.2, 1.4);
  assert.deepEqual(input.getJoystickConfig(), { deadzone: 0.2, sensitivity: 1.4 });
  input.setVirtualAxes(0.15, 0);
  frame = input.consumeFrameState();
  assert.equal(frame.moveX, 0, 'Input inside raised dead-zone 0.20 must remain idle');

  // Keyboard W+D diagonal normalization
  input.simulateKey('KeyW', true);
  input.simulateKey('KeyD', true);
  frame = input.consumeFrameState();
  assert.ok(Math.hypot(frame.moveX, frame.moveY) <= 1.0001);
  assert.ok(frame.moveX > 0.65 && frame.moveY > 0.65);
});

test('InputManager isolates right-side camera touch from left-side joystick and handles simultaneous multi-touch + pointer cancel', () => {
  const prevWin = globalThis.window;
  const prevDoc = globalThis.document;
  const winListeners = new Map<string, Set<(e: any) => void>>();
  const docListeners = new Map<string, Set<(e: any) => void>>();

  Object.assign(globalThis, {
    window: {
      addEventListener: (type: string, fn: (e: any) => void) => {
        if (!winListeners.has(type)) winListeners.set(type, new Set());
        winListeners.get(type)!.add(fn);
      },
      removeEventListener: (type: string, fn: (e: any) => void) => {
        winListeners.get(type)?.delete(fn);
      },
    },
    document: {
      hidden: false,
      addEventListener: (type: string, fn: (e: any) => void) => {
        if (!docListeners.has(type)) docListeners.set(type, new Set());
        docListeners.get(type)!.add(fn);
      },
      removeEventListener: (type: string, fn: (e: any) => void) => {
        docListeners.get(type)?.delete(fn);
      },
    },
  });

  try {
    const surface = new MockTouchSurface();
    const input = new InputManager();
    input.attach(surface as unknown as HTMLElement);
    input.setTouchRegionMode('right');

    // Touch near left movement zone (x = 180 on 1000px wide screen -> relX = 0.18 < 0.36)
    // must NOT claim lookPointerId so slight misses next to the joystick never snap camera.
    surface.emit('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 180, clientY: 380, button: 0 });
    assert.equal(input.getActiveLookPointerId(), null);

    // Touch on right camera region (x = 740 -> relX = 0.74 >= 0.36) claims camera look
    surface.emit('pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 740, clientY: 220, button: 0 });
    assert.equal(input.getActiveLookPointerId(), 2);

    // Simultaneous movement joystick axes + camera touch drag
    input.setVirtualAxes(-0.7, 0.7);
    for (const fn of winListeners.get('pointermove') ?? []) {
      fn({ pointerId: 2, pointerType: 'touch', clientX: 800, clientY: 190 });
    }
    const frame = input.consumeFrameState();
    assert.ok(frame.moveX < -0.6 && frame.moveY > 0.6, 'Joystick movement remains isolated');
    assert.equal(frame.lookDeltaX, 60);
    assert.equal(frame.lookDeltaY, -30);

    // Left-handed layout flips camera touch region to left side (relX <= 0.64)
    for (const fn of winListeners.get('pointercancel') ?? []) {
      fn({ pointerId: 2 });
    }
    assert.equal(input.getActiveLookPointerId(), null, 'pointercancel must release active look pointer');

    input.setTouchRegionMode('left');
    surface.emit('pointerdown', { pointerId: 3, pointerType: 'touch', clientX: 850, clientY: 380, button: 0 });
    assert.equal(input.getActiveLookPointerId(), null, 'Right-side joystick buffer ignored in left-handed mode');
    surface.emit('pointerdown', { pointerId: 4, pointerType: 'touch', clientX: 250, clientY: 220, button: 0 });
    assert.equal(input.getActiveLookPointerId(), 4, 'Left-side touch claims camera look in left-handed mode');

    // Orientation change clears stuck held keys, joystick axes, and active look pointers
    input.simulateKey('KeyW', true);
    input.setVirtualAxes(0.8, 0.2);
    for (const fn of winListeners.get('orientationchange') ?? []) {
      fn({});
    }
    assert.equal(input.getActiveLookPointerId(), null);
    const afterRotate = input.consumeFrameState();
    assert.equal(afterRotate.moveX, 0);
    assert.equal(afterRotate.moveY, 0);

    input.detach();
  } finally {
    Object.assign(globalThis, { window: prevWin, document: prevDoc });
  }
});

test('Sprint, grounded-only Jump, desktop keybindings (WASD/Shift/Space/E/V/M/Esc), and Pause GameLoop work reliably', () => {
  const input = new InputManager();
  const player = new PlayerController();
  player.setSmoothLocomotionMode('always');
  player.setEnvironment([], () => 0.18);
  player.resetSpawn(10, 10, 0);

  // Desktop bindings check including 'M' -> 'map'
  const bindings = input.getKeyBindings();
  assert.equal(bindings.ShiftLeft, 'sprint');
  assert.equal(bindings.Space, 'jump');
  assert.equal(bindings.KeyE, 'interact');
  assert.equal(bindings.KeyV, 'toggle_camera');
  assert.equal(bindings.KeyM, 'map');
  assert.equal(bindings.Escape, 'pause');

  // Rebinding & reset
  input.setKeyBinding('KeyF', 'interact');
  assert.equal(input.getKeyBindings().KeyF, 'interact');
  input.resetKeyBindings();
  assert.equal(input.getKeyBindings().KeyF, undefined);

  // Sprint hold & release
  input.simulateKey('KeyW', true);
  input.simulateKey('ShiftLeft', true);
  let state = player.getState();
  for (let i = 0; i < 35; i++) {
    state = player.update(1 / 60, input.consumeFrameState(), 0);
  }
  assert.equal(state.isSprinting, true);
  assert.equal(state.movementGait, 'sprint');

  input.simulateKey('ShiftLeft', false);
  for (let i = 0; i < 35; i++) {
    state = player.update(1 / 60, input.consumeFrameState(), 0);
  }
  assert.equal(state.isSprinting, false);
  assert.equal(state.movementGait, 'run');

  // Jump while grounded -> becomes airborne; repeated airborne jump press must NOT double-jump
  input.simulateKey('Space', true);
  state = player.update(1 / 60, input.consumeFrameState(), 0);
  input.simulateKey('Space', false);
  assert.equal(state.isGrounded, false);
  const peakCheckVelBefore = state.verticalVelocity;

  // Let player fall slightly then spam jump mid-air
  for (let i = 0; i < 8; i++) {
    state = player.update(1 / 60, input.consumeFrameState(), 0);
  }
  const velBeforeAirJump = state.verticalVelocity;
  input.triggerAction('jump', true);
  state = player.update(1 / 60, input.consumeFrameState(), 0);
  input.triggerAction('jump', false);
  assert.ok(
    state.verticalVelocity < velBeforeAirJump && velBeforeAirJump < peakCheckVelBefore,
    'Jump input while airborne must not trigger an extra mid-air impulse',
  );

  // Land cleanly
  for (let i = 0; i < 50; i++) {
    state = player.update(1 / 60, input.consumeFrameState(), 0);
  }
  assert.equal(state.isGrounded, true);

  // Verify GameLoop genuinely halts fixed simulation steps while paused
  let fixedSteps = 0;
  let renders = 0;
  const loop = new GameLoop({
    onFixedStep: () => {
      fixedSteps += 1;
    },
    onRender: () => {
      renders += 1;
    },
  });
  loop.setPaused(true);
  const pausedAdvance = loop.advanceFrame(100);
  assert.equal(pausedAdvance.stepsExecuted, 0);
  assert.equal(pausedAdvance.alpha, 0);
  assert.equal(fixedSteps, 0);
  assert.equal(renders, 1);

  loop.setPaused(false);
  const resumedAdvance = loop.advanceFrame(134);
  assert.ok(resumedAdvance.stepsExecuted >= 1);
  assert.ok(fixedSteps >= 1);
});

test('resolveContextualInteraction returns exact dynamic action labels and null when no target is available', () => {
  // Open empty street -> null (never display unavailable button)
  assert.equal(
    resolveContextualInteraction({
      nearbyBuilding: null,
      nearHome: false,
      homeDistanceMeters: 120,
      nearbyNpc: null,
    }),
    null,
  );

  // Chai Peedika -> Drink Tea
  const teaShop: NearbyBuildingSummary = {
    id: 'bldg_chai_1',
    name: 'West Hill Chai Peedika',
    malayalamName: 'ചായ പീടിക',
    archetype: 'local_shop',
    category: 'commercial',
    ownershipStatus: 'private_commercial',
    interiorEligible: true,
    distanceMeters: 4.2,
    lat: 11.281,
    lon: 75.775,
    futureHooks: { businessTag: 'chai_peedika_kerala' },
  };
  const teaTarget = resolveContextualInteraction({
    nearbyBuilding: teaShop,
    nearHome: false,
    homeDistanceMeters: 55,
  });
  assert.equal(teaTarget?.kind, 'drink_tea');
  assert.equal(teaTarget?.actionLabel, 'Drink Tea');

  // West Hill Home -> Enter House
  const homeBuilding: NearbyBuildingSummary = {
    id: 'bldg_arjun_residence',
    name: 'West Hill Tharavadu',
    malayalamName: 'അർജുന്റെ വീട്',
    archetype: 'kerala_traditional',
    category: 'residential',
    ownershipStatus: 'protagonist_home',
    interiorEligible: true,
    distanceMeters: 3.1,
    lat: 11.281,
    lon: 75.775,
    futureHooks: { propertyPurchaseTag: 'west_hill_home' },
  };
  const homeTarget = resolveContextualInteraction({
    nearbyBuilding: homeBuilding,
    nearHome: true,
    homeDistanceMeters: 3.1,
  });
  assert.equal(homeTarget?.kind, 'enter_house');
  assert.equal(homeTarget?.actionLabel, 'Enter House');

  // SM Street commercial interior -> Use Shop
  const shopBuilding: NearbyBuildingSummary = {
    id: 'bldg_sm_halwa',
    name: 'Kozhikode Halwa Emporium',
    malayalamName: 'കോഴിക്കോട് ഹൽവ കട',
    archetype: 'bakery',
    category: 'commercial',
    ownershipStatus: 'private_commercial',
    interiorEligible: true,
    distanceMeters: 3.8,
    lat: 11.251,
    lon: 75.779,
    futureHooks: {},
  };
  const shopTarget = resolveContextualInteraction({
    nearbyBuilding: shopBuilding,
    nearHome: false,
    homeDistanceMeters: 210,
  });
  assert.equal(shopTarget?.kind, 'use_shop');
  assert.equal(shopTarget?.actionLabel, 'Use Shop');

  // Nearby Pedestrian within 2.6m -> Talk
  const talkTarget = resolveContextualInteraction({
    nearbyBuilding: null,
    nearHome: false,
    homeDistanceMeters: 80,
    nearbyNpc: { id: 'ped_12', label: 'Kozhikode Resident', distanceMeters: 1.9 },
  });
  assert.equal(talkTarget?.kind, 'talk');
  assert.equal(talkTarget?.actionLabel, 'Talk');
});

test('Phase 6 settings persist/sanitize cleanly and CameraManager honors distanceScale & motionSensitivity', async () => {
  const sanitized = sanitizeSettings({
    cameraSensitivity: 2.2,
    cameraDistanceScale: 1.35,
    cameraPreset: 'wide',
    joystickSensitivity: 1.45,
    joystickDeadzone: 0.14,
    joystickSize: 1.25,
    actionButtonSize: 1.15,
    controlLayout: 'left_handed',
    controlOffsets: { joystickX: 24, joystickY: -12, actionsX: -20, actionsY: 8 },
    motionSensitivity: 0.55,
    desktopPointerLock: false,
    hudOpacity: 0.9,
    hudScale: 1.1,
  });

  assert.equal(sanitized.cameraSensitivity, 2.2);
  assert.equal(sanitized.cameraDistanceScale, 1.35);
  assert.equal(sanitized.cameraPreset, 'wide');
  assert.equal(sanitized.joystickSensitivity, 1.45);
  assert.equal(sanitized.joystickDeadzone, 0.14);
  assert.equal(sanitized.joystickSize, 1.25);
  assert.equal(sanitized.actionButtonSize, 1.15);
  assert.equal(sanitized.controlLayout, 'left_handed');
  assert.deepEqual(sanitized.controlOffsets, {
    joystickX: 24,
    joystickY: -12,
    actionsX: -20,
    actionsY: 8,
  });
  assert.equal(sanitized.motionSensitivity, 0.55);
  assert.equal(sanitized.desktopPointerLock, false);

  // Out-of-range values clamp safely
  const clamped = sanitizeSettings({
    cameraSensitivity: 99,
    cameraDistanceScale: 0.1,
    joystickDeadzone: 0.9,
    motionSensitivity: 0.05,
    controlOffsets: { joystickX: 500, joystickY: -500, actionsX: 0, actionsY: 0 },
  });
  assert.equal(clamped.cameraSensitivity, 3.0);
  assert.equal(clamped.cameraDistanceScale, 0.7);
  assert.equal(clamped.joystickDeadzone, 0.25);
  assert.equal(clamped.motionSensitivity, 0.3);
  assert.equal(clamped.controlOffsets.joystickX, 48);
  assert.equal(clamped.controlOffsets.joystickY, -48);

  // IndexedDBStorage memory fallback roundtrip
  const storage = new IndexedDBStorage();
  await storage.initialize();
  await storage.saveSettings(sanitized);
  const loaded = await storage.getSettings();
  assert.equal(loaded.controlLayout, 'left_handed');
  assert.equal(loaded.cameraDistanceScale, 1.35);
  assert.equal(loaded.desktopPointerLock, false);

  // CameraManager distance scale verification
  const cam = new CameraManager(16 / 9);
  cam.setMode('free_inspect');
  cam.setDistanceScale(1.3);
  const pos = new THREE.Vector3(0, 0.18, 0);
  cam.snapToTarget(pos, 0);
  const scaledDist = Math.hypot(cam.camera.position.x - pos.x, cam.camera.position.z - pos.z);
  cam.setDistanceScale(0.75);
  cam.snapToTarget(pos, 0);
  const closerDist = Math.hypot(cam.camera.position.x - pos.x, cam.camera.position.z - pos.z);
  assert.ok(scaledDist > closerDist + 2.0, 'Camera distance scale must dynamically scale orbit distance');
  cam.setMotionSensitivity(0.5);
});

test('HudOverlay, PauseDiagnosticsModal, and AtmosphereSystem render Phase 6 HUD cleanly with zero fake meters', () => {
  // 1. Open street HUD: zero fake ₹ 0, zero fake Explore chip, no unavailable interact button
  const emptyStreetHtml = renderToStaticMarkup(
    React.createElement(HudOverlay, {
      snapshot: createBaseSnapshot({ nearbyInteraction: null, nearbyBuilding: null, nearHome: false }),
      onPause: () => {},
      onOpenSettings: () => {},
      onToggleCamera: () => {},
      onToggleMute: () => {},
      onUpdateSettings: () => {},
      onHomeInteract: () => {},
      onOpenWorldMap: () => {},
      onClearDestination: () => {},
      onUiClick: () => {},
      onVirtualMove: () => {},
      onSprintHold: () => {},
      onJumpTap: () => {},
    }),
  );

  assert.equal(emptyStreetHtml.includes('₹ 0'), false, 'HUD must not contain fake ₹ 0 placeholder');
  assert.equal(emptyStreetHtml.includes('aria-label="Drink Tea"'), false);
  assert.equal(emptyStreetHtml.includes('Interact with Home Entrance'), false, 'No unavailable interaction button on empty street');
  assert.ok(emptyStreetHtml.includes('data-camera-touch-region="true"'));
  assert.ok(emptyStreetHtml.includes('Golden Haze'));
  assert.ok(emptyStreetHtml.includes('aria-label="World Map"'));
  assert.ok(emptyStreetHtml.includes('aria-label="Settings and Controls"'));
  assert.ok(emptyStreetHtml.includes('aria-label="Pause and Settings"'));
  assert.ok(emptyStreetHtml.includes('aria-label="Jump"'));
  assert.ok(emptyStreetHtml.includes('aria-label="Sprint"'));
  assert.ok(emptyStreetHtml.includes('aria-label="Movement Joystick"'));

  // 2. Chai Peedika nearby + Left-Handed layout
  const leftHandedSettings = createDefaultSettings();
  leftHandedSettings.controlLayout = 'left_handed';
  const chaiHtml = renderToStaticMarkup(
    React.createElement(HudOverlay, {
      snapshot: createBaseSnapshot({
        settings: leftHandedSettings,
        nearbyInteraction: {
          id: 'bldg_chai_1',
          kind: 'drink_tea',
          actionLabel: 'Drink Tea',
          targetName: 'West Hill Chai Peedika',
          malayalamName: 'ചായ പീടിക',
          distanceMeters: 3.4,
        },
      }),
      onPause: () => {},
      onOpenSettings: () => {},
      onToggleCamera: () => {},
      onToggleMute: () => {},
      onUpdateSettings: () => {},
      onHomeInteract: () => {},
      onOpenWorldMap: () => {},
      onClearDestination: () => {},
      onUiClick: () => {},
      onVirtualMove: () => {},
      onSprintHold: () => {},
      onJumpTap: () => {},
    }),
  );

  assert.ok(chaiHtml.includes('Drink Tea'), 'Contextual Drink Tea action should render near Chai Peedika');
  assert.ok(chaiHtml.includes('right-[40%]'), 'Left-handed mode flips camera touch region to left side');

  // 3. Pause modal & ControlsSettingsPanel SSR verification
  const pauseHtml = renderToStaticMarkup(
    React.createElement(PauseDiagnosticsModal, {
      snapshot: createBaseSnapshot({ mode: 'paused' }),
      logs: [],
      initialTab: 'pause',
      onClose: () => {},
      onResumePlay: () => {},
      onOpenMap: () => {},
      onReturnTitle: () => {},
      onTravelHome: () => {},
      onTravelMananchira: () => {},
      onToggleMute: () => {},
      onUpdateSettings: () => {},
      onResetSettings: () => {},
      onSaveManual: () => {},
      onDeleteSlot: () => {},
      onToggleDebugGrid: () => {},
      onTriggerContextLoss: () => {},
    }),
  );
  assert.ok(pauseHtml.includes('Resume'));
  assert.ok(pauseHtml.includes('Map'));
  assert.ok(pauseHtml.includes('Settings'));
  assert.ok(pauseHtml.includes('Controls'));
  assert.ok(pauseHtml.includes('Return to Title'));

  const controlsHtml = renderToStaticMarkup(
    React.createElement(PauseDiagnosticsModal, {
      snapshot: createBaseSnapshot({ mode: 'paused' }),
      logs: [],
      initialTab: 'controls',
      onClose: () => {},
      onResumePlay: () => {},
      onOpenMap: () => {},
      onReturnTitle: () => {},
      onTravelHome: () => {},
      onTravelMananchira: () => {},
      onToggleMute: () => {},
      onUpdateSettings: () => {},
      onResetSettings: () => {},
      onSaveManual: () => {},
      onDeleteSlot: () => {},
      onToggleDebugGrid: () => {},
      onTriggerContextLoss: () => {},
    }),
  );
  assert.ok(controlsHtml.includes('Camera Sensitivity'));
  assert.ok(controlsHtml.includes('Joystick Dead-Zone'));
  assert.ok(controlsHtml.includes('Left-Handed'));
  assert.ok(controlsHtml.includes('Desktop Mouse Pointer Lock'));

  // 4. Weather labels across Kozhikode day cycle
  const atmo = new AtmosphereSystem(new THREE.Scene(), false, resolveGraphicsPresetProfile('medium'));
  atmo.setTimeOfDayPreset('dawn');
  assert.equal(atmo.getWeatherLabel(), 'Dawn Mist');
  atmo.setTimeOfDayPreset('noon');
  assert.equal(atmo.getWeatherLabel(), 'Clear Coastal');
  atmo.setTimeOfDayPreset('golden');
  assert.equal(atmo.getWeatherLabel(), 'Golden Haze');
  atmo.setTimeOfDayPreset('night');
  assert.equal(atmo.getWeatherLabel(), 'Clear Night');
});
