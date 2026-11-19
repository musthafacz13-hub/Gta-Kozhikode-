import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CameraManager } from '../src/engine/camera/CameraManager.ts';
import { EventBus } from '../src/engine/core/EventBus.ts';
import { GameLoop } from '../src/engine/core/GameLoop.ts';
import { Logger } from '../src/engine/core/Logger.ts';
import { PerformanceMonitor } from '../src/engine/core/PerformanceMonitor.ts';
import { InputManager } from '../src/engine/input/InputManager.ts';
import {
  IndexedDBStorage,
  PERSISTENCE_SCHEMA_VERSION,
  sanitizeSettings,
} from '../src/engine/persistence/IndexedDBStorage.ts';
import { PlayerController } from '../src/engine/player/PlayerController.ts';

test('Logger retains ring buffer capacity and filters severity', () => {
  const logger = new Logger(3, 'warn');
  logger.info('Boot', 'Ignored info');
  logger.warn('Input', 'Warn 1');
  logger.error('Render', 'Err 2');
  logger.warn('Save', 'Warn 3');
  logger.error('Save', 'Err 4');

  const all = logger.getEntries();
  assert.equal(all.length, 3);
  assert.equal(all[0].message, 'Err 2');
  assert.equal(logger.getEntries('error').length, 2);
});

test('EventBus dispatches typed events and isolates failing listeners', () => {
  const logger = new Logger(20, 'debug');
  const bus = new EventBus(logger);
  let delivered = 0;

  bus.on('engine:mode_changed', () => {
    throw new Error('Listener crash');
  });
  const unsub = bus.on('engine:mode_changed', (payload) => {
    if (payload.to === 'playing') delivered++;
  });

  bus.emit('engine:mode_changed', { from: 'title', to: 'playing' });
  assert.equal(delivered, 1);
  assert.equal(logger.getEntries('error').length, 1);

  unsub();
  bus.emit('engine:mode_changed', { from: 'playing', to: 'paused' });
  assert.equal(delivered, 1);
});

test('GameLoop clamps raw delta to 0.05s and enforces fixed-timestep accumulator', () => {
  let fixedCount = 0;
  let renderCount = 0;
  const loop = new GameLoop(
    {
      onFixedStep: (dt) => {
        assert.ok(Math.abs(dt - 1 / 60) < 1e-6);
        fixedCount++;
      },
      onRender: () => {
        renderCount++;
      },
    },
    { fixedDt: 1 / 60, maxRawDt: 0.05, maxStepsPerFrame: 4 },
  );

  loop.start(1000);
  loop.stop();

  const res = loop.advanceFrame(1500);
  assert.equal(res.clampedDt, 0.05);
  assert.equal(res.stepsExecuted, 3);
  assert.equal(fixedCount, 3);
  assert.equal(renderCount, 1);

  loop.setPaused(true);
  const pausedRes = loop.advanceFrame(1533);
  assert.equal(pausedRes.stepsExecuted, 0);
  assert.equal(fixedCount, 3);
  assert.equal(renderCount, 2);
});

test('InputManager separates held vs justPressed and resets cleanly on clearAll', () => {
  const input = new InputManager();
  input.simulateKey('KeyW', true);
  input.simulateKey('Space', true);

  const frame1 = input.consumeFrameState();
  assert.equal(frame1.moveY, 1);
  assert.equal(frame1.held.jump, true);
  assert.equal(frame1.justPressed.jump, true);

  const frame2 = input.consumeFrameState();
  assert.equal(frame2.held.jump, true);
  assert.equal(frame2.justPressed.jump, false);

  input.clearAll();
  const frame3 = input.consumeFrameState();
  assert.equal(frame3.moveY, 0);
  assert.equal(frame3.held.jump, false);
});

test('PerformanceMonitor computes p50/p95 CPU timings and renderer stats', () => {
  const perf = new PerformanceMonitor(10);
  for (let i = 1; i <= 10; i++) {
    perf.recordFrame(i * 2, 1);
  }
  perf.recordRendererStats({ drawCalls: 14, triangles: 4200, geometries: 9, textures: 3 });

  const snap = perf.getSnapshot();
  assert.equal(snap.cpuFrameMsP50, 10);
  assert.equal(snap.cpuFrameMsP95, 18);
  assert.equal(snap.drawCalls, 14);
  assert.equal(snap.triangles, 4200);
});

test('IndexedDBStorage falls back cleanly in headless mode and persists settings & slots', async () => {
  const storage = new IndexedDBStorage();
  const mode = await storage.initialize();
  assert.equal(mode, 'memory_fallback');

  const updated = await storage.saveSettings({
    ...sanitizeSettings(null),
    graphicsTier: 'high',
    pixelRatioCap: 1.75,
  });
  assert.equal(updated.schemaVersion, PERSISTENCE_SCHEMA_VERSION);
  assert.equal(updated.graphicsTier, 'high');

  const loaded = await storage.getSettings();
  assert.equal(loaded.graphicsTier, 'high');

  await storage.upsertSlot({
    slotId: 'slot_test_1',
    slotType: 'manual',
    label: 'Test Checkpoint',
    schemaVersion: PERSISTENCE_SCHEMA_VERSION,
    districtName: 'Mananchira Core',
    playtimeSeconds: 42,
    savedAt: 1000,
    cameraPreset: 'free_inspect',
  });

  const slots = await storage.listSlots();
  assert.equal(slots.length, 1);
  assert.equal(slots[0].slotId, 'slot_test_1');

  await storage.deleteSlot('slot_test_1');
  assert.equal((await storage.listSlots()).length, 0);
});

// ============================================================================
// Phase 1 Joystick Input, Camera Isolation & Foundational PlayerController Tests
// ============================================================================

test('Joystick cardinal directions move player forward (-Z), backward (+Z), left (-X), right (+X) at cameraYaw=0', () => {
  const dt = 0.1;
  const input = new InputManager();
  const player = new PlayerController();
  player.resetSpawn(22.5, 2.5);

  // 1. Joystick upward -> Forward (-Z)
  input.setVirtualAxes(0, 1);
  let res = player.update(dt, input.consumeFrameState(), 0);
  assert.ok(res.z < 2.5, 'Upward joystick must move forward (-Z)');
  assert.ok(Math.abs(res.x - 22.5) < 1e-6);
  assert.ok(Math.abs(res.z - (2.5 - player.walkSpeed * dt)) < 1e-5);

  // 2. Joystick downward -> Backward (+Z)
  player.resetSpawn(22.5, 2.5);
  input.setVirtualAxes(0, -1);
  res = player.update(dt, input.consumeFrameState(), 0);
  assert.ok(res.z > 2.5, 'Downward joystick must move backward (+Z)');
  assert.ok(Math.abs(res.z - (2.5 + player.walkSpeed * dt)) < 1e-5);

  // 3. Joystick left -> Left (-X)
  player.resetSpawn(22.5, 2.5);
  input.setVirtualAxes(-1, 0);
  res = player.update(dt, input.consumeFrameState(), 0);
  assert.ok(res.x < 22.5, 'Left joystick must move left (-X)');
  assert.ok(Math.abs(res.x - (22.5 - player.walkSpeed * dt)) < 1e-5);

  // 4. Joystick right -> Right (+X)
  player.resetSpawn(22.5, 2.5);
  input.setVirtualAxes(1, 0);
  res = player.update(dt, input.consumeFrameState(), 0);
  assert.ok(res.x > 22.5, 'Right joystick must move right (+X)');
  assert.ok(Math.abs(res.x - (22.5 + player.walkSpeed * dt)) < 1e-5);
});

test('Diagonal joystick movement normalizes speed to prevent sqrt(2) boost', () => {
  const dt = 0.1;
  const input = new InputManager();
  const player = new PlayerController();
  player.resetSpawn(22.5, 2.5);

  input.setVirtualAxes(1, 1);
  const frame = input.consumeFrameState();
  assert.ok(Math.abs(Math.hypot(frame.moveX, frame.moveY) - 1) < 1e-6);

  const res = player.update(dt, frame, 0);
  const movedDist = Math.hypot(res.x - 22.5, res.z - 2.5);
  assert.ok(
    Math.abs(movedDist - player.walkSpeed * dt) < 1e-5,
    `Expected normalized distance ${player.walkSpeed * dt}, got ${movedDist}`,
  );
  assert.ok(res.x > 22.5 && res.z < 2.5);
});

test('Player movement is relative to rotated camera yaw', () => {
  const dt = 0.1;
  const input = new InputManager();
  const player = new PlayerController();
  const eastCameraYaw = -Math.PI / 2; // camera sits West looking East (+X)

  // Upward joystick should move +X (East)
  player.resetSpawn(22.5, 2.5);
  input.setVirtualAxes(0, 1);
  let res = player.update(dt, input.consumeFrameState(), eastCameraYaw);
  assert.ok(Math.abs(res.x - (22.5 + player.walkSpeed * dt)) < 1e-5);
  assert.ok(Math.abs(res.z - 2.5) < 1e-5);

  // Left joystick when facing East should move North (-Z)
  player.resetSpawn(22.5, 2.5);
  input.setVirtualAxes(-1, 0);
  res = player.update(dt, input.consumeFrameState(), eastCameraYaw);
  assert.ok(Math.abs(res.z - (2.5 - player.walkSpeed * dt)) < 1e-5);
  assert.ok(Math.abs(res.x - 22.5) < 1e-5);
});

test('Sprint action increases movement speed and release stops movement immediately', () => {
  const dt = 0.1;
  const input = new InputManager();
  const player = new PlayerController();

  player.resetSpawn(22.5, 2.5);
  input.setVirtualAxes(0, 1);
  input.triggerAction('sprint', true);
  const sprintRes = player.update(dt, input.consumeFrameState(), 0);
  assert.equal(sprintRes.isMoving, true);
  assert.equal(sprintRes.isSprinting, true);
  assert.ok(sprintRes.speed > player.walkSpeed);
  assert.ok(Math.abs(sprintRes.z - (2.5 - player.sprintSpeed * dt)) < 1e-5);

  // Release joystick -> movement stops immediately and position freezes
  input.setVirtualAxes(0, 0);
  input.triggerAction('sprint', false);
  const stoppedRes = player.update(dt, input.consumeFrameState(), 0);
  assert.equal(stoppedRes.isMoving, false);
  assert.equal(stoppedRes.isSprinting, false);
  assert.equal(stoppedRes.speed, 0);
  assert.equal(stoppedRes.x, sprintRes.x);
  assert.equal(stoppedRes.z, sprintRes.z);
});

test('CameraManager and PlayerController stay strictly decoupled: joystick never rotates camera, look drag never moves player', () => {
  const input = new InputManager();
  const player = new PlayerController();
  const camera = new CameraManager(16 / 9);
  camera.setMode('free_inspect');
  player.resetSpawn(22.5, 2.5);

  // Initialize camera focus onto player first
  camera.update(1 / 60, input.consumeFrameState(), player.position);
  const initialYaw = camera.getYaw();

  // 1. Drag joystick continuously with ZERO look delta -> player moves, camera yaw must NOT change
  input.setVirtualAxes(1, 0.5);
  for (let i = 0; i < 20; i++) {
    const f = input.consumeFrameState();
    player.update(1 / 60, f, camera.getYaw());
    camera.update(1 / 60, f, player.position);
  }
  assert.ok(Math.hypot(player.position.x - 22.5, player.position.z - 2.5) > 0.5);
  assert.ok(
    Math.abs(camera.getYaw() - initialYaw) < 1e-6,
    'Joystick movement must never rotate camera yaw',
  );

  // 2. Release joystick and drag camera look -> camera yaw changes, player position stays frozen
  input.setVirtualAxes(0, 0);
  const frozenPos = new THREE.Vector3().copy(player.position);
  input.addLookDelta(120, 25);
  for (let i = 0; i < 20; i++) {
    const f = input.consumeFrameState();
    player.update(1 / 60, f, camera.getYaw());
    camera.update(1 / 60, f, player.position);
  }
  assert.equal(player.position.x, frozenPos.x);
  assert.equal(player.position.z, frozenPos.z);
  assert.ok(
    Math.abs(camera.getYaw() - initialYaw) > 0.2,
    'Camera look drag must rotate camera yaw',
  );
});

test('Simultaneous movement and camera look input work concurrently without interference', () => {
  const input = new InputManager();
  const player = new PlayerController();
  const camera = new CameraManager(9 / 16);
  camera.setMode('free_inspect');
  player.resetSpawn(22.5, 2.5);

  const startYaw = camera.getYaw();
  input.setVirtualAxes(0, 1);
  input.addLookDelta(-90, 0);

  for (let i = 0; i < 15; i++) {
    const f = input.consumeFrameState();
    player.update(1 / 60, f, camera.getYaw());
    camera.update(1 / 60, f, player.position);
  }

  assert.ok(Math.hypot(player.position.x - 22.5, player.position.z - 2.5) > 0.5);
  assert.ok(Math.abs(camera.getYaw() - startYaw) > 0.15);
});

test('InputManager isolates HUD touches from camera look, supports multi-touch, and resets on blur/pointercancel', () => {
  const windowListeners = new Map<string, Set<(ev: unknown) => void>>();
  const docListeners = new Map<string, Set<(ev: unknown) => void>>();
  const targetListeners = new Map<string, Set<(ev: unknown) => void>>();

  const prevWindow = globalThis.window;
  const prevDoc = globalThis.document;
  const prevNode = globalThis.Node;

  class MockNode {}
  class MockEl extends MockNode {
    private readonly isHud: boolean;
    constructor(isHud: boolean) {
      super();
      this.isHud = isHud;
    }
    closest(selector: string) {
      return this.isHud && selector === '[data-hud-control="true"]' ? this : null;
    }
    addEventListener(type: string, fn: (ev: unknown) => void) {
      if (!targetListeners.has(type)) targetListeners.set(type, new Set());
      targetListeners.get(type)!.add(fn);
    }
    removeEventListener(type: string, fn: (ev: unknown) => void) {
      targetListeners.get(type)?.delete(fn);
    }
  }

  const dispatch = (map: Map<string, Set<(ev: unknown) => void>>, type: string, ev: unknown) => {
    for (const fn of map.get(type) ?? []) fn(ev);
  };

  Object.assign(globalThis, {
    Node: MockNode,
    window: {
      addEventListener: (type: string, fn: (ev: unknown) => void) => {
        if (!windowListeners.has(type)) windowListeners.set(type, new Set());
        windowListeners.get(type)!.add(fn);
      },
      removeEventListener: (type: string, fn: (ev: unknown) => void) => {
        windowListeners.get(type)?.delete(fn);
      },
    },
    document: {
      hidden: false,
      addEventListener: (type: string, fn: (ev: unknown) => void) => {
        if (!docListeners.has(type)) docListeners.set(type, new Set());
        docListeners.get(type)!.add(fn);
      },
      removeEventListener: (type: string, fn: (ev: unknown) => void) => {
        docListeners.get(type)?.delete(fn);
      },
    },
  });

  try {
    const input = new InputManager();
    const canvasHost = new MockEl(false);
    const hudControl = new MockEl(true);
    input.attach(canvasHost as unknown as HTMLElement);

    // Touch starting on HUD control must NOT hijack camera lookPointerId
    dispatch(targetListeners, 'pointerdown', {
      pointerId: 1,
      clientX: 40,
      clientY: 500,
      target: hudControl,
    });
    assert.equal(input.getActiveLookPointerId(), null);

    // Multi-touch: second pointer on canvas activates camera look without dropping joystick axes
    input.setVirtualAxes(0.4, 0.8);
    dispatch(targetListeners, 'pointerdown', {
      pointerId: 2,
      clientX: 300,
      clientY: 250,
      target: canvasHost,
    });
    assert.equal(input.getActiveLookPointerId(), 2);

    dispatch(windowListeners, 'pointermove', { pointerId: 2, clientX: 345, clientY: 240 });
    const f1 = input.consumeFrameState();
    assert.equal(f1.lookDeltaX, 45);
    assert.equal(f1.lookDeltaY, -10);
    assert.ok(Math.abs(f1.moveX - 0.4) < 1e-6);
    assert.ok(Math.abs(f1.moveY - 0.8) < 1e-6);

    // Pointer cancel clears look pointer cleanly
    dispatch(windowListeners, 'pointercancel', { pointerId: 2 });
    assert.equal(input.getActiveLookPointerId(), null);

    // Window blur clears virtual joystick, held actions, and look pointer
    input.setVirtualAxes(0.9, 0.2);
    input.triggerAction('sprint', true);
    dispatch(targetListeners, 'pointerdown', {
      pointerId: 3,
      clientX: 200,
      clientY: 200,
      target: canvasHost,
    });
    dispatch(windowListeners, 'blur', {});

    const afterBlur = input.consumeFrameState();
    assert.equal(input.getActiveLookPointerId(), null);
    assert.equal(afterBlur.moveX, 0);
    assert.equal(afterBlur.moveY, 0);
    assert.equal(afterBlur.held.sprint, false);

    input.detach();
  } finally {
    Object.assign(globalThis, { window: prevWindow, document: prevDoc, Node: prevNode });
  }
});

test('PlayerController resolves AABB collisions with sliding without entering solid obstacles', () => {
  const input = new InputManager();
  const player = new PlayerController();
  const mananchiraTank = { minX: -19.2, maxX: 19.2, minZ: -15.2, maxZ: 15.2 };
  player.setEnvironment([mananchiraTank], () => 0.18);

  // Spawn just east of tank boundary and push diagonally West+North (-X, -Z)
  player.resetSpawn(19.9, 0);
  input.setVirtualAxes(-1, 1);

  for (let i = 0; i < 30; i++) {
    player.update(1 / 60, input.consumeFrameState(), 0);
  }

  // Must remain outside min distance (19.2 + colliderRadius) while sliding North (-Z)
  assert.ok(
    player.position.x >= mananchiraTank.maxX + player.colliderRadius - 1e-4,
    `Player penetrated tank east wall: x=${player.position.x}`,
  );
  assert.ok(player.position.z < -0.5, 'Player should slide tangentially along wall');
});

