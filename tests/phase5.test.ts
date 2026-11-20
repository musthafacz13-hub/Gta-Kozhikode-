import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';
import { AssetManager } from '../src/engine/assets/AssetManager.ts';
import { resolveGraphicsPresetProfile } from '../src/engine/assets/AssetRegistry.ts';
import { CameraManager } from '../src/engine/camera/CameraManager.ts';
import { InputManager } from '../src/engine/input/InputManager.ts';
import { createDefaultSettings } from '../src/engine/persistence/IndexedDBStorage.ts';
import { ArjunAnimator } from '../src/engine/player/ArjunAnimator.ts';
import {
  createArjunCharacterRig,
  DEFAULT_ARJUN_APPEARANCE,
} from '../src/engine/player/ArjunCharacterModel.ts';
import { PlayerController } from '../src/engine/player/PlayerController.ts';
import { MaterialLibrary } from '../src/engine/rendering/MaterialLibrary.ts';
import { SceneManager } from '../src/engine/scene/SceneManager.ts';
import type { EngineHudSnapshot } from '../src/engine/types.ts';
import { PROTAGONIST_HOME_COORDS } from '../src/engine/world/KozhikodeGeography.ts';
import { WorldStreamer } from '../src/engine/world/WorldStreamer.ts';
import { HudOverlay } from '../src/ui/HudOverlay.tsx';

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

test('ArjunCharacterModel builds grounded articulated LOD rig and supports modular Kerala appearance customization', () => {
  withMockCanvasDocument(() => {
    const rig = createArjunCharacterRig();

    assert.ok(rig.lod instanceof THREE.LOD, 'Arjun rig must be a THREE.LOD');
    assert.ok(rig.lod.levels.length >= 2, 'Arjun rig must define LOD0 and LOD1');
    assert.ok(rig.pelvisGroup && rig.spineGroup && rig.chestGroup && rig.neckGroup && rig.headGroup);
    assert.ok(rig.hipL && rig.hipR && rig.kneeL && rig.kneeR && rig.ankleL && rig.ankleR);
    assert.ok(rig.shoulderL && rig.shoulderR && rig.elbowL && rig.elbowR && rig.wristL && rig.wristR);
    assert.ok(rig.contactShadow);

    // Check grounded proportions (~1.75m human height, foot soles resting near y = 0)
    rig.lod0.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rig.lod0);
    const size = new THREE.Vector3();
    box.getSize(size);
    const bodyBox = new THREE.Box3().setFromObject(rig.pelvisGroup);
    const bodySize = new THREE.Vector3();
    bodyBox.getSize(bodySize);
    assert.ok(box.min.y >= -0.04 && box.min.y <= 0.04, `Expected grounded foot soles near y=0, got min.y=${box.min.y}`);
    assert.ok(size.y >= 1.62 && size.y <= 1.88, `Expected realistic human height ~1.76m, got ${size.y}`);
    assert.ok(bodySize.x >= 0.42 && bodySize.x <= 0.72, `Expected realistic shoulder width, got ${bodySize.x}`);

    // Verify default Kerala appearance
    const initial = rig.getAppearance();
    assert.equal(initial.hairstyle, DEFAULT_ARJUN_APPEARANCE.hairstyle);
    assert.equal(initial.topStyle, 'casual_shirt');
    assert.equal(initial.bottomStyle, 'slim_jeans');
    assert.equal(initial.shoeStyle, 'sneakers');
    assert.equal(initial.watch, 'classic_steel');

    // Apply live modular customization across hair, beard, outfit, shoes, glasses, watch & accessories
    rig.applyAppearance({
      hairstyle: 'side_part',
      beardStyle: 'trimmed_beard',
      topStyle: 'polo_tee',
      topColor: 0xb91c1c,
      bottomStyle: 'chinos',
      bottomColor: 0xd6d3d1,
      shoeStyle: 'sandals',
      watch: 'sport_band',
      glasses: 'wayfarer',
      accessory: 'backpack',
    });

    const updated = rig.getAppearance();
    assert.equal(updated.hairstyle, 'side_part');
    assert.equal(updated.beardStyle, 'trimmed_beard');
    assert.equal(updated.topStyle, 'polo_tee');
    assert.equal(updated.bottomStyle, 'chinos');
    assert.equal(updated.shoeStyle, 'sandals');
    assert.equal(updated.watch, 'sport_band');
    assert.equal(updated.glasses, 'wayfarer');
    assert.equal(updated.accessory, 'backpack');

    // Toggle back to alternate variants without errors
    rig.applyAppearance({
      hairstyle: 'short_crop',
      beardStyle: 'clean',
      topStyle: 'henley_tee',
      bottomStyle: 'casual_trousers',
      glasses: 'aviator',
      accessory: 'silver_chain',
      watch: 'none',
    });
    assert.equal(rig.getAppearance().accessory, 'silver_chain');

    rig.dispose();
  });
});

test('ArjunAnimator transitions smoothly across idle, start, walk, run, sprint, turn, stop, and airborne states', () => {
  withMockCanvasDocument(() => {
    const rig = createArjunCharacterRig();
    const animator = new ArjunAnimator();

    const makeState = (overrides: Partial<ReturnType<PlayerController['getState']>> = {}) => ({
      x: 0,
      y: 0.18,
      visualY: 0.18,
      z: 0,
      vx: 0,
      vz: 0,
      verticalVelocity: 0,
      isGrounded: true,
      heading: 0,
      turnRate: 0,
      groundSlope: 0,
      isMoving: false,
      isSprinting: false,
      speed: 0,
      movementGait: 'idle' as const,
      accelerationState: 'idle' as const,
      ...overrides,
    });

    // 1. Idle state -> breathing micro-motion, neutral legs
    for (let i = 0; i < 15; i++) {
      animator.update(rig, makeState(), 1 / 60);
    }
    assert.equal(animator.getSnapshot().activeState, 'idle');

    // 2. Start impulse -> detected when accelerating from standstill
    animator.update(rig, makeState({ isMoving: true, speed: 1.4, movementGait: 'walk', accelerationState: 'starting' }), 1 / 60);
    assert.equal(animator.getSnapshot().activeState, 'start');

    // 3. Steady Walk -> alternating leg/arm swing
    const hipLSamples: number[] = [];
    for (let i = 0; i < 30; i++) {
      animator.update(rig, makeState({ isMoving: true, speed: 2.6, movementGait: 'walk' }), 1 / 60);
      hipLSamples.push(rig.hipL.rotation.x);
    }
    assert.equal(animator.getSnapshot().activeState, 'walk');
    assert.ok(
      Math.max(...hipLSamples) - Math.min(...hipLSamples) > 0.25,
      'Walking should animate hip swing smoothly',
    );

    // 4. Steady Run
    for (let i = 0; i < 35; i++) {
      animator.update(rig, makeState({ isMoving: true, speed: 4.8, movementGait: 'run' }), 1 / 60);
    }
    assert.equal(animator.getSnapshot().activeState, 'run');

    // 5. Sharp Turn while running
    for (let i = 0; i < 10; i++) {
      animator.update(
        rig,
        makeState({ isMoving: true, speed: 3.1, turnRate: 4.8, movementGait: 'walk' }),
        1 / 60,
      );
    }
    assert.equal(animator.getSnapshot().activeState, 'turn');

    // 6. Full Sprint
    for (let i = 0; i < 40; i++) {
      animator.update(
        rig,
        makeState({ isMoving: true, isSprinting: true, speed: 8.6, movementGait: 'sprint' }),
        1 / 60,
      );
    }
    assert.equal(animator.getSnapshot().activeState, 'sprint');
    assert.ok(rig.spineGroup.rotation.x > 0.06, 'Sprint should induce forward torso lean');

    // 7. Stop settle -> returns cleanly to idle without stuck running limbs
    animator.update(rig, makeState({ isMoving: false, speed: 0.4, accelerationState: 'stopping' }), 1 / 60);
    for (let i = 0; i < 45; i++) {
      animator.update(rig, makeState({ isMoving: false, speed: 0 }), 1 / 60);
    }
    assert.equal(animator.getSnapshot().activeState, 'idle');
    assert.ok(Math.abs(rig.hipL.rotation.x) < 0.08, 'Stopped idle pose should settle hips back to neutral');
    assert.ok(Math.abs(rig.hipR.rotation.x) < 0.08, 'Stopped idle pose should settle right hip back to neutral');

    // 8. Airborne jump pose
    animator.update(rig, makeState({ isGrounded: false, y: 1.1, visualY: 0.18, isMoving: true, speed: 4.2 }), 1 / 60);
    assert.equal(animator.getSnapshot().activeState, 'airborne');
    assert.ok(rig.contactShadow.scale.x < 0.9, 'Contact shadow should shrink subtly when airborne');

    rig.dispose();
  });
});

test('PlayerController handles smooth acceleration/stop, walk/run/sprint tiers, jump gravity, curbs, and dynamic traffic/pedestrian collisions', () => {
  const input = new InputManager();
  const player = new PlayerController();
  player.setSmoothLocomotionMode('always');

  // Curb environment: z > 0 is road (0.02m), z <= 0 is sidewalk (0.18m)
  player.setEnvironment([], (_x, z) => (z <= 0 ? 0.18 : 0.02));
  player.resetSpawn(20, -2, 0);

  // 1. Walk speed via walk toggle (`Alt/C`) or soft stick
  input.setVirtualAxes(0, 1);
  input.triggerAction('walk', true);
  let res = player.getState();
  for (let i = 0; i < 30; i++) {
    res = player.update(1 / 60, input.consumeFrameState(), 0);
  }
  assert.equal(res.movementGait, 'walk');
  assert.ok(res.speed > 2.0 && res.speed < 3.1, `Expected stroll/walk speed ~2.6 m/s, got ${res.speed}`);

  // 2. Run speed (release walk modifier)
  input.triggerAction('walk', false);
  for (let i = 0; i < 35; i++) {
    res = player.update(1 / 60, input.consumeFrameState(), 0);
  }
  assert.equal(res.movementGait, 'run');
  assert.ok(res.speed > 4.4 && res.speed <= 5.0, `Expected run speed ~4.8 m/s, got ${res.speed}`);

  // 3. Sprint speed
  input.triggerAction('sprint', true);
  for (let i = 0; i < 40; i++) {
    res = player.update(1 / 60, input.consumeFrameState(), 0);
  }
  assert.equal(res.movementGait, 'sprint');
  assert.ok(res.speed > 7.8, `Expected sprint speed near 8.6 m/s, got ${res.speed}`);

  // 4. Jump & gravity recovery
  input.triggerAction('jump', true);
  res = player.update(1 / 60, input.consumeFrameState(), 0);
  input.triggerAction('jump', false);
  assert.equal(res.isGrounded, false);
  assert.ok(res.verticalVelocity > 4.0);
  for (let i = 0; i < 50; i++) {
    res = player.update(1 / 60, input.consumeFrameState(), 0);
  }
  assert.equal(res.isGrounded, true, 'Player should land back onto ground after jump');

  // 5. Smooth stop deceleration
  input.setVirtualAxes(0, 0);
  input.triggerAction('sprint', false);
  const stopFirst = player.update(1 / 60, input.consumeFrameState(), 0);
  assert.ok(stopFirst.speed > 1.0, 'Release should smoothly decelerate rather than teleport-snap');
  for (let i = 0; i < 45; i++) {
    res = player.update(1 / 60, input.consumeFrameState(), 0);
  }
  assert.equal(res.speed, 0);
  assert.equal(res.movementGait, 'idle');

  // 6. Curb step transition smooth visualY damping (0.18m sidewalk -> 0.02m road)
  player.resetSpawn(20, -0.1, 0);
  input.setVirtualAxes(0, -1); // Move south (+Z) off sidewalk onto road
  for (let i = 0; i < 4; i++) {
    res = player.update(1 / 60, input.consumeFrameState(), 0);
  }
  assert.ok(res.z > 0, 'Player stepped onto road');
  assert.ok(res.visualY > 0.021 && res.visualY <= 0.18, `Expected smoothed curb visualY, got ${res.visualY}`);

  // 7. Dynamic collisions with moving vehicles & pedestrians
  player.resetSpawn(10, 10, 0);
  input.setVirtualAxes(0, 0);
  const blocked = player.update(1 / 60, input.consumeFrameState(), 0, {
    vehicles: [{ x: 10.2, z: 10.0, heading: 0, width: 1.8, length: 4.2, speed: 6 }],
  });
  assert.ok(
    Math.abs(blocked.x - 10.2) >= 0.9,
    `Player must be pushed clear outside dynamic vehicle hull, got x=${blocked.x}`,
  );

  player.resetSpawn(20, 20, 0);
  const pedSep = player.update(1 / 60, input.consumeFrameState(), 0, {
    pedestrians: [{ x: 20.1, z: 20.0 }],
  });
  assert.ok(
    Math.hypot(pedSep.x - 20.1, pedSep.z - 20.0) >= 0.65,
    'Player must separate softly from colliding pedestrians',
  );
});

test('CameraManager supports close/standard/wide presets and pulls camera inward to avoid building/wall & terrain clipping', () => {
  const input = new InputManager();
  const camera = new CameraManager(16 / 9);
  camera.setMode('free_inspect');

  // Verify preset cycling
  assert.equal(camera.getThirdPersonPreset(), 'standard');
  assert.equal(camera.cycleThirdPersonPreset(), 'wide');
  assert.equal(camera.cycleThirdPersonPreset(), 'close');
  assert.equal(camera.cycleThirdPersonPreset(), 'standard');

  // Place a solid building wall directly behind player at z = +2.5..+6.0 when camera looks north (-Z, yaw = 0)
  camera.setEnvironment(
    [{ minX: -5, maxX: 5, minZ: 2.2, maxZ: 7.0, maxY: 8.0, kind: 'building' }],
    () => 0.18,
  );
  const playerPos = new THREE.Vector3(0, 0.18, 0);
  camera.snapToTarget(playerPos, 0);
  for (let i = 0; i < 30; i++) {
    camera.update(1 / 60, input.consumeFrameState(), playerPos);
  }
  const distToPlayer = Math.hypot(camera.camera.position.x - playerPos.x, camera.camera.position.z - playerPos.z);
  assert.ok(
    distToPlayer < 2.2,
    `Wall collision must pull camera safely in front of z=2.2 wall, got distance=${distToPlayer.toFixed(2)}m`,
  );

  // Move out from behind wall -> camera recovers back toward standard distance (~6.1m horizontal)
  camera.setEnvironment([], () => 0.18);
  for (let i = 0; i < 60; i++) {
    camera.update(1 / 60, input.consumeFrameState(), playerPos);
  }
  const recoveredDist = Math.hypot(camera.camera.position.x - playerPos.x, camera.camera.position.z - playerPos.z);
  assert.ok(
    recoveredDist > 5.0,
    `Camera should smoothly recover outward once obstruction clears, got ${recoveredDist.toFixed(2)}m`,
  );

  // Terrain clearance check when pitch goes low above elevated ground
  camera.setEnvironment([], () => 4.0);
  const hillPos = new THREE.Vector3(0, 4.0, 0);
  camera.snapToTarget(hillPos, 0);
  camera.update(1 / 60, input.consumeFrameState(), hillPos);
  assert.ok(
    camera.camera.position.y >= 4.4,
    `Camera must remain safely above elevated ground (y>=4.4), got ${camera.camera.position.y}`,
  );
});

test('West Hill protagonist courtyard spawn is unobstructed, parked vehicles register colliders, and Chai Peedika is reachable on foot', () => {
  withMockCanvasDocument(() => {
    const assets = new AssetManager();
    const mats = new MaterialLibrary(assets);
    const streamer = new WorldStreamer(mats, resolveGraphicsPresetProfile('medium'));
    streamer.update(0, PROTAGONIST_HOME_COORDS.porchX, PROTAGONIST_HOME_COORDS.porchZ);

    const colliders = streamer.getActiveColliders();
    assert.ok(
      colliders.some((c) => c.kind === 'vehicle'),
      'Parked vehicles across streamed chunks must register solid vehicle colliders',
    );

    const player = new PlayerController();
    player.setSmoothLocomotionMode('always');
    player.setEnvironment(colliders, () => 0.18);
    player.resetSpawn(PROTAGONIST_HOME_COORDS.porchX, PROTAGONIST_HOME_COORDS.porchZ, 0);

    // Ensure spawn point inside courtyard is not overlapping any wall or vehicle collider
    for (const c of colliders) {
      const inside =
        player.position.x > c.minX - player.colliderRadius &&
        player.position.x < c.maxX + player.colliderRadius &&
        player.position.z > c.minZ - player.colliderRadius &&
        player.position.z < c.maxZ + player.colliderRadius;
      assert.equal(inside, false, `West Hill spawn overlapped collider (${c.minX},${c.minZ})-(${c.maxX},${c.maxZ})`);
    }

    // Walk straight south (+Z) with yaw=PI (facing South out the open gate onto West Hill Rd)
    const input = new InputManager();
    input.setVirtualAxes(0, 1);
    for (let i = 0; i < 120; i++) {
      player.update(1 / 60, input.consumeFrameState(), Math.PI);
    }
    assert.ok(
      player.position.z > PROTAGONIST_HOME_COORDS.gateZ + 1,
      `Arjun should walk cleanly out of West Hill gate (z > ${PROTAGONIST_HOME_COORDS.gateZ}), got z=${player.position.z}`,
    );

    // Check West Hill Chai Peedika interaction record exists nearby
    const teaShop = streamer
      .getActiveBuildings()
      .find((b) => b.futureHooks.businessTag === 'chai_peedika_kerala');
    assert.ok(teaShop, 'West Hill neighborhood should stream an active Chai Peedika record');

    // Walk to within interaction range of the Chai Peedika
    player.resetSpawn(teaShop.interactionPoint.x, teaShop.interactionPoint.z + 1.5, Math.PI);
    const nearest = streamer.findNearestInteractableBuilding(player.position.x, player.position.z, 8.5);
    assert.ok(nearest && nearest.building.futureHooks.businessTag === 'chai_peedika_kerala');

    streamer.dispose();
    assets.disposeAll();
  });
});

test('SceneManager integrates ArjunCharacterRig & ArjunAnimator and HudOverlay renders Phase 5 camera preset & notices cleanly', () => {
  withMockCanvasDocument(() => {
    const assets = new AssetManager();
    const sceneMgr = new SceneManager(assets, true, 'medium', 'golden');
    sceneMgr.update(0, PROTAGONIST_HOME_COORDS.porchX, PROTAGONIST_HOME_COORDS.porchZ);

    const obstacles = sceneMgr.getDynamicObstacles();
    assert.ok(Array.isArray(obstacles.vehicles) && obstacles.vehicles.length > 0);
    assert.ok(Array.isArray(obstacles.pedestrians) && obstacles.pedestrians.length > 0);

    const updatedAppearance = sceneMgr.applyArjunAppearance({ topStyle: 'henley_tee', glasses: 'aviator' });
    assert.equal(updatedAppearance.topStyle, 'henley_tee');
    assert.equal(updatedAppearance.glasses, 'aviator');

    sceneMgr.dispose();
    assets.disposeAll();
  });

  const snapshot: EngineHudSnapshot = {
    mode: 'playing',
    cameraMode: 'free_inspect',
    cameraPreset: 'wide',
    cameraX: PROTAGONIST_HOME_COORDS.porchX,
    cameraZ: PROTAGONIST_HOME_COORDS.porchZ,
    cameraYaw: Math.PI,
    playerX: PROTAGONIST_HOME_COORDS.porchX,
    playerZ: PROTAGONIST_HOME_COORDS.porchZ,
    playerLat: 11.281,
    playerLon: 75.775,
    playerHeading: 0,
    isMoving: true,
    isSprinting: true,
    movementGait: 'sprint',
    animationState: 'sprint',
    interactionNotice: { id: 1, text: 'Camera: Wide Street View' },
    districtName: 'West Hill · Tharavadu',
    talukName: 'Kozhikode Taluk',
    biome: 'urban',
    clockFormatted: '17:36',
    activeChunks: 9,
    totalRegions: 19,
    gazetteerCount: 54,
    nearHome: true,
    homeDistanceMeters: 5,
    nearbyBuilding: null,
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
  };

  const html = renderToStaticMarkup(
    React.createElement(HudOverlay, {
      snapshot,
      onPause: () => {},
      onToggleCamera: () => {},
      onToggleMute: () => {},
      onUpdateSettings: () => {},
      onHomeInteract: () => {},
      onBuildingInteract: () => 'Ok',
      onOpenWorldMap: () => {},
      onClearDestination: () => {},
      onUiClick: () => {},
      onVirtualMove: () => {},
      onSprintHold: () => {},
    }),
  );

  assert.ok(html.includes('aria-label="Toggle Camera View"'));
  assert.ok(html.includes('WIDE'));
  assert.ok(html.includes('aria-label="Home Location Status"'));
  assert.ok(html.includes('aria-label="Movement Joystick"'));
});
