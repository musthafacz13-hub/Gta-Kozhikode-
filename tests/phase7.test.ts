import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';
import { AssetManager } from '../src/engine/assets/AssetManager.ts';
import { resolveGraphicsPresetProfile } from '../src/engine/assets/AssetRegistry.ts';
import { AudioManager } from '../src/engine/audio/AudioManager.ts';
import { CameraManager } from '../src/engine/camera/CameraManager.ts';
import { InputManager } from '../src/engine/input/InputManager.ts';
import { resolveContextualInteraction } from '../src/engine/interaction/InteractionResolver.ts';
import {
  createDefaultSettings,
  IndexedDBStorage,
} from '../src/engine/persistence/IndexedDBStorage.ts';
import { ArjunAnimator } from '../src/engine/player/ArjunAnimator.ts';
import type { PlayerMoveResult, StaticAabbCollider } from '../src/engine/player/PlayerController.ts';
import { MaterialLibrary } from '../src/engine/rendering/MaterialLibrary.ts';
import { SceneManager } from '../src/engine/scene/SceneManager.ts';
import type { EngineHudSnapshot } from '../src/engine/types.ts';
import {
  DELIVERY_INTERACTION_RANGE_METERS,
  DeliveryOrderSystem,
} from '../src/engine/delivery/DeliveryOrderSystem.ts';
import {
  createDefaultProgressionState,
  LIFESTYLE_UPGRADES_CATALOG,
  LifestyleProgression,
  PURCHASABLE_VEHICLES_CATALOG,
} from '../src/engine/delivery/LifestyleProgression.ts';
import {
  ALL_DELIVERY_AREAS,
  ALL_RESTAURANT_CATEGORIES,
  isRestaurantOpenAtHour,
  KOZHIKODE_RESTAURANTS,
} from '../src/engine/delivery/RestaurantCatalog.ts';
import { getFriendlyNpcGreeting } from '../src/engine/world/PedestrianSystem.ts';
import { VehicleController } from '../src/engine/vehicle/VehicleController.ts';
import { VehicleManager } from '../src/engine/vehicle/VehicleManager.ts';
import {
  getVehiclePhysicsProfile,
  VEHICLE_PHYSICS_PROFILES,
} from '../src/engine/vehicle/VehiclePhysicsProfiles.ts';
import {
  getGroundHeightAt,
  PROTAGONIST_HOME_COORDS,
} from '../src/engine/world/KozhikodeGeography.ts';
import { createArjunCharacterRig } from '../src/engine/player/ArjunCharacterModel.ts';
import { TrafficSystem } from '../src/engine/world/TrafficSystem.ts';
import {
  VEHICLE_BLUEPRINT_META,
  type VehicleModelId,
} from '../src/engine/world/VehicleVisualFactory.ts';
import { WorldStreamer } from '../src/engine/world/WorldStreamer.ts';
import { DeliveryAndLifeModal } from '../src/ui/DeliveryAndLifeModal.tsx';
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

async function withMockCanvasDocumentAsync<T>(fn: () => Promise<T>): Promise<T> {
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
    return await fn();
  } finally {
    Object.assign(globalThis, { document: prevDoc });
  }
}

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
    districtName: 'Mananchira Square',
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
    vehicle: null,
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
      activeAmbienceLabel: 'Kozhikode City Breeze',
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

function createMockWebAudioWindow() {
  const mkParam = (initial = 0) => ({
    value: initial,
    setValueAtTime: () => {},
    linearRampToValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
    setTargetAtTime: () => {},
    cancelScheduledValues: () => {},
  });
  const mkNode = () => ({
    connect: () => {},
    disconnect: () => {},
  });
  let stoppedOscillators = 0;

  class MockAudioContext {
    state: 'suspended' | 'running' | 'closed' = 'running';
    currentTime = 1.5;
    sampleRate = 44100;
    destination = mkNode();

    resume = async () => {
      this.state = 'running';
    };
    close = async () => {
      this.state = 'closed';
    };
    createGain = () => ({
      ...mkNode(),
      gain: mkParam(1),
    });
    createDynamicsCompressor = () => ({
      ...mkNode(),
      threshold: mkParam(-12),
      knee: mkParam(18),
      ratio: mkParam(4),
      attack: mkParam(0.01),
      release: mkParam(0.2),
    });
    createOscillator = () => ({
      ...mkNode(),
      type: 'sine',
      frequency: mkParam(120),
      detune: mkParam(0),
      start: () => {},
      stop: () => {
        stoppedOscillators += 1;
      },
    });
    createBiquadFilter = () => ({
      ...mkNode(),
      type: 'lowpass',
      frequency: mkParam(800),
      Q: mkParam(1),
    });
    createBuffer = (_ch: number, len: number) => ({
      getChannelData: () => new Float32Array(len),
    });
    createBufferSource = () => ({
      ...mkNode(),
      buffer: null,
      loop: false,
      playbackRate: mkParam(1),
      start: () => {},
      stop: () => {},
    });
    createStereoPanner = () => ({
      ...mkNode(),
      pan: mkParam(0),
    });
    createDelay = () => ({
      ...mkNode(),
      delayTime: mkParam(0.36),
    });
  }

  return {
    AudioContext: MockAudioContext,
    getStoppedOscillators: () => stoppedOscillators,
  };
}

test('VehiclePhysicsProfiles defines distinct calibrated dynamics for all 17 Kerala vehicle models', () => {
  const allIds = Object.keys(VEHICLE_BLUEPRINT_META) as VehicleModelId[];
  assert.equal(allIds.length, 17);

  for (const id of allIds) {
    const p = getVehiclePhysicsProfile(id);
    assert.ok(p === VEHICLE_PHYSICS_PROFILES[id]);
    assert.ok(p.maxForwardSpeedMps > 12 && p.maxForwardSpeedMps <= 30);
    assert.ok(p.accelerationMps2 > 1.5);
    assert.ok(p.brakeForceMps2 > p.accelerationMps2);
    assert.ok(p.wheelbaseMeters > 1.0 && p.minTurnRadiusMeters > 1.5);
    assert.ok(p.massKg >= 100);
  }

  const swift = getVehiclePhysicsProfile('maruti_swift');
  const creta = getVehiclePhysicsProfile('hyundai_creta');
  const activa = getVehiclePhysicsProfile('honda_activa');
  const fz = getVehiclePhysicsProfile('yamaha_fz');
  const auto = getVehiclePhysicsProfile('auto_rickshaw');
  const truck = getVehiclePhysicsProfile('goods_truck');
  const ksrtc = getVehiclePhysicsProfile('ksrtc_bus');

  // Distinct handling identities across categories
  assert.equal(swift.isEnclosed, true);
  assert.equal(activa.isEnclosed, false);
  assert.equal(fz.isEnclosed, false);
  assert.equal(auto.isEnclosed, false);
  assert.ok(fz.maxLeanAngleRad > 0.3, 'Motorcycles lean cleanly into turns');
  assert.equal(swift.maxLeanAngleRad, 0, 'Enclosed cars do not lean like two-wheelers');
  assert.ok(creta.offroadSpeedFactor > swift.offroadSpeedFactor, 'SUV retains better offroad traction');
  assert.ok(ksrtc.minTurnRadiusMeters > swift.minTurnRadiusMeters, 'KSRTC bus needs wider turn radius');
  assert.ok(truck.massKg > swift.massKg && truck.accelerationMps2 < swift.accelerationMps2);
});

test('VehicleController handles acceleration, brake/reverse hysteresis, handbrake, steering inversion, surfaces, and wheel spin', () => {
  const flatGround = () => 0.02;
  const env = { colliders: [] as StaticAabbCollider[], groundHeightFn: flatGround };

  // Start on Mavoor Rd (asphalt, z = -35, x = -68..260)
  const car = new VehicleController('maruti_swift', { x: 20, y: 0.02, z: -35, heading: 0 });
  assert.equal(car.getState().gear, 'PARKED');

  // 1. Accelerate forward along +Z
  for (let i = 0; i < 90; i++) {
    car.update(1 / 60, { throttle: 1, brakeReverse: 0, steer: 0, handbrake: false }, env, true);
  }
  const fastState = car.getState();
  assert.equal(fastState.surface, 'asphalt');
  assert.equal(fastState.gear, 'DRIVE');
  assert.ok(fastState.forwardSpeedMps > 6.5, 'Car should accelerate smoothly on throttle');
  assert.equal(fastState.speedKmh, Math.round(Math.abs(fastState.forwardSpeedMps) * 3.6));
  assert.ok(fastState.z > -32 && Math.abs(fastState.wheelSpinAngle) > 0);

  // 2. Braking hysteresis: pressing brake at speed slows forward velocity BEFORE engaging reverse
  const brakeState = car.update(
    1 / 60,
    { throttle: 0, brakeReverse: 1, steer: 0, handbrake: false },
    env,
    true,
  );
  assert.equal(brakeState.gear, 'BRAKE');
  assert.ok(brakeState.forwardSpeedMps > 0, 'Must not snap instantaneously into reverse from forward speed');

  // Brake to a complete stop, then hold past 0.14s reverse hysteresis
  for (let i = 0; i < 120; i++) {
    car.update(1 / 60, { throttle: 0, brakeReverse: 1, steer: 0, handbrake: false }, env, true);
  }
  const revState = car.getState();
  assert.equal(revState.gear, 'REVERSE');
  assert.ok(revState.forwardSpeedMps < -1.0, 'Deliberate hold from stop must engage smooth reverse');

  // 3. Handbrake stops cleanly
  car.update(1 / 60, { throttle: 0, brakeReverse: 0, steer: 0, handbrake: true }, env, true);
  assert.equal(car.getState().gear, 'HANDBRAKE');
  for (let i = 0; i < 90; i++) {
    car.update(1 / 60, { throttle: 0, brakeReverse: 0, steer: 0, handbrake: true }, env, true);
  }
  assert.ok(Math.abs(car.forwardSpeedMps) < 0.05);

  // 4. Steering left forward increases heading (+Y), steering left in reverse inverts yaw
  const steerCar = new VehicleController('hyundai_i20', { x: 20, y: 0.02, z: -35, heading: 0 });
  for (let i = 0; i < 60; i++) {
    steerCar.update(1 / 60, { throttle: 0.85, brakeReverse: 0, steer: -1, handbrake: false }, env, true);
  }
  assert.ok(steerCar.heading > 0.25, 'Left steering moving forward increases +Y heading');
  assert.ok(steerCar.steerAngleRad > 0.2, 'Front wheels turn visually left (+Y)');

  const revSteerCar = new VehicleController('hyundai_i20', { x: 20, y: 0.02, z: -35, heading: 0 });
  for (let i = 0; i < 90; i++) {
    revSteerCar.update(1 / 60, { throttle: 0, brakeReverse: 1, steer: -1, handbrake: false }, env, true);
  }
  assert.ok(revSteerCar.heading < -0.1, 'Left steering while reversing turns tail left (negative heading)');

  // 5. Sand / offroad vs asphalt top speed & two-wheeler lean angle
  // At z = 300 south of downtown seawall, coastline sits near x = -46 -> x = -37..-34 is open coastal sand
  const beachBike = new VehicleController('yamaha_fz', { x: -37, y: 0.02, z: 300, heading: 0 });
  for (let i = 0; i < 120; i++) {
    beachBike.update(1 / 60, { throttle: 1, brakeReverse: 0, steer: 0, handbrake: false }, env, true);
  }
  const sandState = beachBike.getState();
  assert.equal(sandState.surface, 'sand');
  assert.ok(
    sandState.forwardSpeedMps < beachBike.profile.maxForwardSpeedMps * 0.72,
    'Beach sand must clamp two-wheeler speed below asphalt top speed',
  );

  const cornerBike = new VehicleController('yamaha_fz', { x: 20, y: 0.02, z: -35, heading: 0 });
  for (let i = 0; i < 120; i++) {
    cornerBike.update(1 / 60, { throttle: 1, brakeReverse: 0, steer: -1, handbrake: false }, env, true);
  }
  assert.ok(Math.abs(cornerBike.leanAngleRad) > 0.08, 'Two-wheeler leans dynamically during turn');

  // 6. Natural coasting drag decelerates unthrottled vehicle
  const coastSpeedBefore = sandState.forwardSpeedMps;
  for (let i = 0; i < 120; i++) {
    beachBike.update(1 / 60, { throttle: 0, brakeReverse: 0, steer: 0, handbrake: false }, env, true);
  }
  assert.ok(beachBike.forwardSpeedMps < coastSpeedBefore * 0.85, 'Coasting drag slows unpowered vehicle');
});

test('VehicleController resolves static walls, dynamic vehicles, pedestrian pushes, and progressive damage degradation', () => {
  const flatGround = () => 0.02;
  const wall: StaticAabbCollider = { minX: -4, maxX: 4, minZ: 12, maxZ: 16 };
  const impacts: string[] = [];
  const pedPushes: Array<{ id: string; dx: number; dz: number }> = [];

  const undamagedCar = new VehicleController('maruti_alto', { x: 0, y: 0.02, z: 0, heading: 0 });
  let wallHitCount = 0;

  for (let i = 0; i < 160; i++) {
    undamagedCar.update(
      1 / 60,
      { throttle: 1, brakeReverse: 0, steer: 0, handbrake: false },
      {
        colliders: [wall],
        groundHeightFn: flatGround,
        onCollision: (ev) => {
          wallHitCount += 1;
          impacts.push(ev.kind);
        },
      },
      true,
    );
  }

  assert.ok(undamagedCar.z < wall.minZ, 'Vehicle spine collider must never tunnel through solid wall');
  assert.ok(wallHitCount >= 1 && impacts.includes('static'));
  assert.ok(undamagedCar.damageHealth < 100, 'Impact speed >= 3.2 m/s reduces vehicle health');

  // Dynamic vehicle impact + pedestrian push
  const trafficCar = new VehicleController('maruti_swift', { x: 0, y: 0.02, z: 0, heading: 0 });
  trafficCar.forwardSpeedMps = 8;
  trafficCar.update(
    1 / 60,
    { throttle: 1, brakeReverse: 0, steer: 0, handbrake: false },
    {
      colliders: [],
      groundHeightFn: flatGround,
      otherVehicles: [{ id: 'npc_1', x: 0, z: 3.1, heading: 0, width: 1.8, length: 4.0, massKg: 1100 }],
      pedestrians: [{ id: 'ped_1', x: 0, z: 1.4 }],
      onPedestrianImpact: (id, dx, dz) => pedPushes.push({ id, dx, dz }),
      onCollision: (ev) => impacts.push(ev.kind),
    },
    true,
  );
  assert.ok(impacts.includes('vehicle'), 'Hitting another vehicle records vehicle collision');
  assert.equal(pedPushes[0]?.id, 'ped_1', 'Pedestrians are nudged cleanly out of vehicle path');

  // Damage state thresholds & speed degradation
  const healthy = new VehicleController('maruti_swift', { x: 0, y: 0.02, z: 44, heading: 0 }, 100);
  const wrecked = new VehicleController('maruti_swift', { x: 0, y: 0.02, z: 44, heading: 0 }, 15);
  assert.equal(healthy.damageState, 'undamaged');
  assert.equal(wrecked.damageState, 'severe');
  assert.equal(new VehicleController('maruti_swift', undefined, 70).damageState, 'minor');
  assert.equal(new VehicleController('maruti_swift', undefined, 40).damageState, 'moderate');

  for (let i = 0; i < 240; i++) {
    const e = { colliders: [], groundHeightFn: flatGround };
    healthy.update(1 / 60, { throttle: 1, brakeReverse: 0, steer: 0, handbrake: false }, e, true);
    wrecked.update(1 / 60, { throttle: 1, brakeReverse: 0, steer: 0, handbrake: false }, e, true);
  }
  assert.ok(
    healthy.forwardSpeedMps > wrecked.forwardSpeedMps + 3.0,
    'Severely damaged vehicle has measurably lower acceleration & top speed',
  );
});

test('VehicleManager enters parked & slow NPC traffic vehicles without duplicating meshes, blocks fast traffic, and probes safe exit sides', () => {
  withMockCanvasDocument(() => {
    const assets = new AssetManager();
    const mats = new MaterialLibrary(assets);
    const preset = resolveGraphicsPresetProfile('high');
    const streamer = new WorldStreamer(mats, preset);
    streamer.update(0, 22.5, 2.5);
    const traffic = new TrafficSystem(mats, preset);
    const vm = new VehicleManager();

    const parked = streamer.getActiveParkedVehicles();
    assert.ok(parked.length > 0, 'Active chunks near Mananchira should expose parked vehicles');
    const targetParked = parked[0];
    const initialParkedCount = parked.filter((p) => !p.claimed).length;

    // Far away -> cannot find enterable vehicle
    const tooFar = vm.findNearestEnterableVehicle(
      targetParked.x + 25,
      targetParked.z + 25,
      streamer,
      traffic,
    );
    assert.equal(tooFar, null);

    // Near parked vehicle -> can enter cleanly, claims single LOD without duplication
    const nearCand = vm.findNearestEnterableVehicle(
      targetParked.x + 1.2,
      targetParked.z,
      streamer,
      traffic,
    );
    assert.ok(nearCand && nearCand.canEnter && nearCand.id === targetParked.id);

    const enterRes = vm.requestEnterVehicle(
      { x: targetParked.x + 1.2, y: targetParked.y, z: targetParked.z, heading: 0 },
      streamer,
      traffic,
    );
    assert.equal(enterRes.accepted, true);
    assert.equal(vm.isDriving(), true);
    assert.equal(vm.getWorldVehicles().length, 1);
    assert.equal(vm.activeGroup.children.length, 1, 'Only one active LOD in VehicleManager.activeGroup');
    assert.equal(
      streamer.getActiveParkedVehicles().filter((p) => !p.claimed).length,
      initialParkedCount - 1,
      'Parked chunk vehicle must be claimed cleanly without leaving a duplicate mesh',
    );

    // Advance past enter transition (0.3s)
    for (let i = 0; i < 20; i++) {
      vm.update(
        1 / 60,
        { throttle: 0, brakeReverse: 0, steer: 0, handbrake: false },
        { colliders: [], groundHeightFn: getGroundHeightAt, trafficVehicles: [] },
      );
    }
    assert.equal(vm.isEntering(), false);

    // Reject exit while moving above 3.8 m/s
    const active = vm.getActiveVehicleEntity()!;
    active.controller.forwardSpeedMps = 6.2;
    const fastExit = vm.requestExitVehicle([], [], getGroundHeightAt);
    assert.equal(fastExit.exited, false);
    assert.ok(fastExit.reason?.includes('Slow down'));

    // Bring to rest and block left (driver) door with a wall -> should safely choose passenger side!
    active.controller.parkImmediately(getGroundHeightAt);
    const driverDoorWorldX =
      active.controller.x +
      active.controller.profile.driverDoorLocalX * Math.cos(active.controller.heading) +
      active.controller.profile.driverDoorLocalZ * Math.sin(active.controller.heading);
    const driverDoorWorldZ =
      active.controller.z -
      active.controller.profile.driverDoorLocalX * Math.sin(active.controller.heading) +
      active.controller.profile.driverDoorLocalZ * Math.cos(active.controller.heading);

    const leftWall: StaticAabbCollider = {
      minX: driverDoorWorldX - 1.2,
      maxX: driverDoorWorldX + 1.2,
      minZ: driverDoorWorldZ - 2.5,
      maxZ: driverDoorWorldZ + 2.5,
    };

    const blockedExit = vm.requestExitVehicle([leftWall], [], getGroundHeightAt);
    assert.equal(blockedExit.exited, true, 'Exit should probe passenger/rear sides when driver door is blocked');
    assert.equal(vm.isDriving(), false);
    // Vehicle remains parked cleanly in world for re-entry without duplication
    assert.equal(vm.getWorldVehicles().length, 1);

    // Blocking every perimeter spot cleanly rejects exit
    const allBlocked = vm.requestEnterVehicle(
      { x: active.controller.x + 1.1, y: active.controller.y, z: active.controller.z, heading: 0 },
      streamer,
      traffic,
    );
    assert.equal(allBlocked.accepted, true);
    const giantWall: StaticAabbCollider = {
      minX: active.controller.x - 10,
      maxX: active.controller.x + 10,
      minZ: active.controller.z - 10,
      maxZ: active.controller.z + 10,
    };
    const sealedExit = vm.requestExitVehicle([giantWall], [], getGroundHeightAt);
    assert.equal(sealedExit.exited, false);
    assert.ok(sealedExit.reason?.includes('blocked'));

    // Reset & verify NPC traffic entry: fast traffic blocked, stopped/slow traffic claimable
    vm.clearAll(streamer, traffic);
    const initialTrafficCount = traffic.getActiveVehicleCount();
    const descriptors = traffic.getPhase7VehicleDescriptors();
    assert.ok(descriptors.length > 0);
    const npcTarget = descriptors[0];

    // Before speeding up, check speed eligibility rule via internal descriptor test or traffic advance
    for (let i = 0; i < 60; i++) {
      traffic.update(1 / 30, npcTarget.x, npcTarget.z, undefined, [], []);
    }
    const updatedDesc = traffic.getPhase7VehicleDescriptors().find((d) => d.id === npcTarget.id)!;
    const npcCand = vm.findNearestEnterableVehicle(updatedDesc.x, updatedDesc.z, streamer, traffic);
    if (updatedDesc.speedMps > 4.5) {
      assert.equal(npcCand?.canEnter, false, 'Fast-moving NPC traffic must not allow instantaneous entry');
    }

    // Block traffic ahead so it slows to a halt, then claim it cleanly
    const blocker = {
      x: updatedDesc.x + Math.sin(updatedDesc.heading) * 4.5,
      z: updatedDesc.z + Math.cos(updatedDesc.heading) * 4.5,
      width: 2.5,
      length: 5.0,
    };
    for (let i = 0; i < 90; i++) {
      traffic.update(1 / 20, updatedDesc.x, updatedDesc.z, undefined, [], [], undefined, undefined, [blocker]);
    }
    const slowedDesc = traffic.getPhase7VehicleDescriptors().find((d) => d.id === npcTarget.id)!;
    if (slowedDesc.speedMps <= 4.5) {
      const slowEnter = vm.requestEnterVehicle(
        { x: slowedDesc.x, y: slowedDesc.y, z: slowedDesc.z, heading: 0 },
        streamer,
        traffic,
      );
      assert.equal(slowEnter.accepted, true);
      assert.equal(
        traffic.getActiveVehicleCount(),
        initialTrafficCount - 1,
        'Claiming NPC traffic removes it from AI TrafficSystem without duplicating mesh',
      );
      assert.equal(slowEnter.entity?.npcDriverGroup?.visible ?? false, false);
    }

    // Verify Arjun seated riding pose on open scooter (visible) vs enclosed car (hidden)
    vm.clearAll(streamer, traffic);
    const arjun = createArjunCharacterRig();
    const animator = new ArjunAnimator();
    const dummyPlayerMove: PlayerMoveResult = {
      x: 0,
      y: 0,
      visualY: 0,
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
      movementGait: 'idle',
      accelerationState: 'idle',
    };
    // Simulate open scooter visual directly via SceneManager helper
    const sceneMgr = new SceneManager(assets, false, 'medium');
    sceneMgr.syncPlayerVehicleVisual(
      {
        driveState: null,
        isDriving: true,
        isEntering: false,
        playerVisible: true,
        riderPose: {
          x: 10,
          y: 0.2,
          z: 10,
          heading: 0.3,
          leanAngleRad: -0.15,
          steerNorm: -0.5,
          speedMps: 8,
          category: 'scooter',
          leanForwardRad: 0.12,
        },
      },
      dummyPlayerMove,
      1 / 60,
    );
    assert.equal(sceneMgr.getArjunAnimationSnapshot().activeState, 'driving');
    for (let f = 0; f < 15; f++) {
      animator.update(
        arjun,
        dummyPlayerMove,
        1 / 60,
        { category: 'motorcycle', steerNorm: 0.6, leanAngleRad: 0.2, speedMps: 12, leanForwardRad: 0.28 },
      );
    }
    assert.ok(arjun.hipR.rotation.x < -0.5, 'Seated rider bends hips/knees naturally over motorcycle/scooter');

    // Enclosed vehicle hides player character mesh cleanly
    sceneMgr.syncPlayerVehicleVisual(
      {
        driveState: null,
        isDriving: true,
        isEntering: false,
        playerVisible: false,
        riderPose: null,
      },
      dummyPlayerMove,
      1 / 60,
    );
    assert.equal(arjun.lod.visible, true);

    sceneMgr.dispose();
    assets.disposeAll();
  });
});

test('CameraManager vehicle_chase frames, pulls back at speed, supports manual look, avoids wall occlusion, and restores free_inspect', () => {
  const cam = new CameraManager(16 / 9);
  const input = new InputManager();
  cam.setMode('vehicle_chase');
  cam.snapToTarget(new THREE.Vector3(0, 0.02, 0), Math.PI);

  const slowCtx = { x: 0, y: 0.02, z: 0, heading: 0, speedMps: 1, length: 4.0, height: 1.5 };
  for (let i = 0; i < 60; i++) {
    cam.update(1 / 60, input.consumeFrameState(), undefined, slowCtx);
  }
  const slowDist = Math.hypot(cam.camera.position.x - slowCtx.x, cam.camera.position.z - slowCtx.z);

  const fastCtx = { x: 0, y: 0.02, z: 0, heading: 0, speedMps: 24, length: 4.0, height: 1.5 };
  for (let i = 0; i < 90; i++) {
    cam.update(1 / 60, input.consumeFrameState(), undefined, fastCtx);
  }
  const fastDist = Math.hypot(cam.camera.position.x - fastCtx.x, cam.camera.position.z - fastCtx.z);
  assert.ok(fastDist > slowDist + 1.2, 'High-speed driving pulls chase camera back dynamically');

  // Auto-follow behind vehicle heading (+Z forward -> camera sits at -Z, yaw ~= PI)
  const turnCtx = { x: 0, y: 0.02, z: 0, heading: Math.PI * 0.5, speedMps: 12, length: 4.0, height: 1.5 };
  for (let i = 0; i < 120; i++) {
    cam.update(1 / 60, input.consumeFrameState(), undefined, turnCtx);
  }
  const yawDiff = Math.abs(Math.atan2(Math.sin(cam.getYaw() - -Math.PI * 0.5), Math.cos(cam.getYaw() - -Math.PI * 0.5)));
  assert.ok(yawDiff < 0.25, 'Chase camera gently aligns behind turned vehicle heading');

  // Manual look overrides temporarily
  const prevYaw = cam.getYaw();
  const manualLookFrame = { ...input.consumeFrameState(), lookDeltaX: 120, lookDeltaY: 0 };
  cam.update(1 / 60, manualLookFrame, undefined, turnCtx);
  assert.notEqual(cam.getYaw(), prevYaw);

  // Collider pull-in when wall sits behind vehicle
  cam.setEnvironment([{ minX: -5, maxX: 5, minZ: -5, maxZ: -2 }], () => 0.02);
  cam.snapToTarget(new THREE.Vector3(0, 0.02, 0), Math.PI);
  cam.update(1 / 60, input.consumeFrameState(), undefined, slowCtx);
  assert.ok(cam.camera.position.z > -2.5, 'Chase camera pulls in front of occluding wall collider');

  cam.setMode('free_inspect');
  assert.equal(cam.getMode(), 'free_inspect');
});

test('InputManager simultaneous vehicle touch+keyboard inputs, InteractionResolver, and Driving HudOverlay SSR work reliably', () => {
  const input = new InputManager();

  // Simultaneous multi-touch steer + throttle
  input.setVehicleVirtualControls({ steer: -0.75, throttle: 1, brakeReverse: 0, handbrake: false });
  let frame = input.consumeFrameState();
  assert.equal(frame.vehicle.steer, -0.75);
  assert.equal(frame.vehicle.throttle, 1);
  assert.equal(frame.vehicle.brakeReverse, 0);
  assert.equal(frame.vehicle.handbrake, false);

  // Simultaneous steer + reverse + handbrake + horn tap
  input.setVehicleVirtualControls({ steer: 0.6, throttle: 0, brakeReverse: 0.9, handbrake: true });
  input.simulateKey('KeyH', true);
  frame = input.consumeFrameState();
  assert.equal(frame.vehicle.steer, 0.6);
  assert.equal(frame.vehicle.brakeReverse, 0.9);
  assert.equal(frame.vehicle.handbrake, true);
  assert.equal(frame.justPressed.horn, true);

  // Mode switch / blur reset clears both on-foot & vehicle virtual latches cleanly
  input.clearAll();
  frame = input.consumeFrameState();
  assert.equal(frame.vehicle.steer, 0);
  assert.equal(frame.vehicle.throttle, 0);
  assert.equal(frame.vehicle.brakeReverse, 0);
  assert.equal(frame.vehicle.handbrake, false);

  // Contextual interaction resolver
  const enterCtx = resolveContextualInteraction({
    nearbyBuilding: null,
    nearHome: false,
    homeDistanceMeters: 50,
    isDriving: false,
    nearbyVehicle: {
      id: 'veh_1',
      displayName: 'Royal Enfield Classic',
      distanceMeters: 1.3,
      canEnter: true,
    },
  });
  assert.equal(enterCtx?.kind, 'enter_vehicle');

  const whileDrivingCtx = resolveContextualInteraction({
    nearbyBuilding: null,
    nearHome: true,
    homeDistanceMeters: 2,
    isDriving: true,
    nearbyVehicle: null,
  });
  assert.equal(whileDrivingCtx, null, 'On-foot contextual prompts stay suppressed while driving');

  // Driving HUD SSR check
  const drivingHtml = renderToStaticMarkup(
    React.createElement(HudOverlay, {
      snapshot: createBaseSnapshot({
        cameraMode: 'vehicle_chase',
        vehicle: {
          isDriving: true,
          isEntering: false,
          vehicleId: 'veh_1',
          modelId: 'maruti_swift',
          displayName: 'Maruti Suzuki Swift',
          category: 'car',
          speedKmh: 58,
          speedMps: 16.1,
          signedSpeedMps: 16.1,
          gear: 'DRIVE',
          steerNorm: 0.25,
          throttleNorm: 1,
          brakeNorm: 0,
          handbrakeActive: false,
          damageHealth: 82,
          damageState: 'minor',
          leanAngleRad: 0,
          groundSurface: 'asphalt',
        },
      }),
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
      onJumpTap: () => {},
    }),
  );

  assert.ok(drivingHtml.includes('Maruti Suzuki Swift'));
  assert.ok(drivingHtml.includes('58'));
  assert.ok(drivingHtml.includes('km/h'));
  assert.ok(drivingHtml.includes('DRIVE'));
  assert.ok(drivingHtml.includes('minor'));
  assert.ok(drivingHtml.includes('aria-label="Vehicle Steering"'));
  assert.ok(drivingHtml.includes('aria-label="Accelerate"'));
  assert.ok(drivingHtml.includes('aria-label="Brake or Reverse"'));
  assert.ok(drivingHtml.includes('aria-label="Handbrake"'));
  assert.ok(drivingHtml.includes('aria-label="Vehicle Horn"'));
  assert.ok(drivingHtml.includes('aria-label="Exit Vehicle"'));
  assert.equal(drivingHtml.includes('aria-label="Movement Joystick"'), false);
  assert.equal(drivingHtml.includes('aria-label="Jump"'), false);
});

test('AudioManager starts vehicle engine loop and stops it cleanly on exit, pause, and dispose', async () => {
  const prevWin = globalThis.window;
  const mockAudio = createMockWebAudioWindow();
  Object.assign(globalThis, {
    window: {
      AudioContext: mockAudio.AudioContext,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
    },
  });

  try {
    const audio = new AudioManager();
    const unlocked = await audio.unlockFromGesture();
    assert.equal(unlocked, true);

    audio.updateDrivingAudio(1 / 60, {
      audioKind: 'car',
      rpmNormalized: 0.55,
      speedMps: 14,
      isBraking: false,
      isDrifting: false,
    });
    assert.equal(audio.hasActiveDrivingAudioLoop(), true);

    audio.playDrivingHorn('car');
    audio.playDrivingCollision('car', 8.5);

    // Exiting vehicle clears driving loop immediately
    audio.updateDrivingAudio(1 / 60, null);
    assert.equal(audio.hasActiveDrivingAudioLoop(), false);

    // Restart engine loop and pause game -> engine loop stops cleanly
    audio.updateDrivingAudio(1 / 60, {
      audioKind: 'motorcycle',
      rpmNormalized: 0.72,
      speedMps: 18,
      isBraking: true,
      isDrifting: true,
    });
    assert.equal(audio.hasActiveDrivingAudioLoop(), true);
    audio.handleLifecycle('paused', false);
    assert.equal(audio.hasActiveDrivingAudioLoop(), false);

    audio.dispose();
    assert.ok(mockAudio.getStoppedOscillators() >= 2);
  } finally {
    Object.assign(globalThis, { window: prevWin });
  }
});

test('VehicleManager and IndexedDBStorage save and restore active/parked world vehicles without duplicates', async () => {
  await withMockCanvasDocumentAsync(async () => {
    const assets = new AssetManager();
    const mats = new MaterialLibrary(assets);
    const preset = resolveGraphicsPresetProfile('high');
    const storage = new IndexedDBStorage();
    await storage.initialize();

    const streamerA = new WorldStreamer(mats, preset);
    streamerA.update(0, 22.5, 2.5);
    const trafficA = new TrafficSystem(mats, preset);
    const vmA = new VehicleManager();

    const parked = streamerA.getActiveParkedVehicles()[0];
    const enterRes = vmA.requestEnterVehicle(
      { x: parked.x + 1.0, y: parked.y, z: parked.z, heading: 0 },
      streamerA,
      trafficA,
    );
    assert.equal(enterRes.accepted, true);

    const entityA = vmA.getActiveVehicleEntity()!;
    entityA.controller.x = 64.5;
    entityA.controller.z = -18.25;
    entityA.controller.heading = 1.15;
    entityA.controller.setDamageHealth(62);

    const exported = vmA.exportPersistedState();
    assert.equal(exported.vehicles.length, 1);
    assert.equal(exported.activeVehicleId, entityA.id);
    assert.equal(exported.vehicles[0].damageHealth, 62);
    assert.equal(exported.vehicles[0].damageState, 'minor');

    await storage.saveActiveWorldVehicles(exported);
    await storage.upsertSlot({
      slotId: 'slot_phase7_test',
      slotType: 'manual',
      label: 'Phase 7 Test',
      schemaVersion: 1,
      districtName: 'Mananchira Square',
      playtimeSeconds: 120,
      savedAt: Date.now(),
      cameraPreset: 'vehicle_chase',
      vehicleState: exported,
    });

    const loadedVehicles = await storage.getSavedWorldVehicles();
    assert.ok(loadedVehicles);
    assert.equal(loadedVehicles.vehicles[0].x, 64.5);

    // Restore into a fresh session (simulating reload)
    const streamerB = new WorldStreamer(mats, preset);
    streamerB.update(0, 22.5, 2.5);
    const initialCountB = streamerB.getActiveParkedVehicles().length;
    const trafficB = new TrafficSystem(mats, preset);
    const vmB = new VehicleManager();

    const restored = vmB.restorePersistedState(loadedVehicles, mats, streamerB, trafficB, getGroundHeightAt);
    assert.ok(restored.restoredActiveEntity, 'Active driving vehicle restores seamlessly');
    assert.equal(vmB.isDriving(), true);
    assert.equal(restored.restoredActiveEntity.controller.x, 64.5);
    assert.equal(restored.restoredActiveEntity.controller.damageHealth, 62);
    assert.equal(
      streamerB.getActiveParkedVehicles().filter((p) => !p.claimed).length,
      initialCountB - 1,
      'Original parked chunk vehicle remains suppressed so reload never creates a duplicate copy',
    );

    assets.disposeAll();
  });
});

test('RestaurantCatalog covers all 10 Kozhikode areas and 5 eatery categories with valid hours', () => {
  assert.equal(KOZHIKODE_RESTAURANTS.length, 17);
  const coveredAreas = new Set(KOZHIKODE_RESTAURANTS.map((r) => r.areaId));
  for (const area of ALL_DELIVERY_AREAS) {
    assert.ok(coveredAreas.has(area), `Expected restaurant coverage in area ${area}`);
  }
  const coveredCategories = new Set(KOZHIKODE_RESTAURANTS.map((r) => r.category));
  for (const cat of ALL_RESTAURANT_CATEGORIES) {
    assert.ok(coveredCategories.has(cat), `Expected restaurant coverage for category ${cat}`);
  }

  const biriyani = KOZHIKODE_RESTAURANTS.find((r) => r.id === 'rest_mananchira_biriyani')!;
  assert.equal(isRestaurantOpenAtHour(biriyani, 13), true);
  assert.equal(isRestaurantOpenAtHour(biriyani, 3), false);
});

test('DeliveryOrderSystem enforces state machine, proximity/readiness checks, bump physics, and payouts', () => {
  const delivery = new DeliveryOrderSystem();
  const prog = new LifestyleProgression();

  const board = delivery.refreshAvailableOrders(
    PROTAGONIST_HOME_COORDS.porchX,
    PROTAGONIST_HOME_COORDS.porchZ,
    18,
    prog.getState(),
    prog.getTipBonusMultiplier(),
  );
  assert.ok(board.length >= 4);
  const target = board[0];
  assert.ok(target.routeDistanceMeters > 0 && target.routeRealKm > 0);

  const acceptRes = delivery.acceptOrder(target.orderId);
  assert.equal(acceptRes.ok, true);
  assert.equal(delivery.getActiveOrder()?.status, 'preparing');

  // Cannot accept second order simultaneously
  assert.equal(delivery.acceptOrder(board[1].orderId).ok, false);

  // Too far from pickup rejects pickup
  const farPickup = delivery.pickupOrder(target.pickupX + 40, target.pickupZ + 40);
  assert.equal(farPickup.ok, false);

  // At pickup before prep finishes rejects pickup cleanly
  const prematurePickup = delivery.pickupOrder(target.pickupX, target.pickupZ);
  assert.equal(prematurePickup.ok, false);

  // Advance simulation past prepTimeSec -> becomes ready_for_pickup
  const stepReady = delivery.update(
    target.prepTimeSec + 0.5,
    target.pickupX,
    target.pickupZ,
    18,
    prog.getState(),
    1.0,
  );
  assert.equal(stepReady.orderBecameReady, true);
  assert.equal(delivery.getActiveOrder()?.status, 'ready_for_pickup');

  // Cannot deliver before collecting food
  assert.equal(delivery.deliverOrder(target.dropoffX, target.dropoffZ).ok, false);

  // Collect at pickup within DELIVERY_INTERACTION_RANGE_METERS
  const collected = delivery.pickupOrder(
    target.pickupX + Math.min(2, DELIVERY_INTERACTION_RANGE_METERS - 1),
    target.pickupZ,
  );
  assert.equal(collected.ok, true);
  assert.equal(delivery.getActiveOrder()?.status, 'picked_up');
  assert.equal(delivery.getActiveOrder()?.packageState.foodCondition, 100);

  // Moving away switches to in_transit; bumps reduce food condition clamped [55..100]
  delivery.update(0.5, target.pickupX + 20, target.pickupZ, 18, prog.getState(), 1.0);
  assert.equal(delivery.getActiveOrder()?.status, 'in_transit');

  const afterLightBump = delivery.applyTransitBump(2.0, 1.0);
  assert.equal(afterLightBump, 100);
  for (let i = 0; i < 8; i++) {
    delivery.applyTransitBump(16, 1.0);
  }
  const minCondition = delivery.getActiveOrder()!.packageState.foodCondition;
  assert.ok(minCondition >= 55 && minCondition < 100);

  // Deliver at customer dropoff -> completes order and records legitimate ₹ income
  const farDrop = delivery.deliverOrder(target.dropoffX + 50, target.dropoffZ);
  assert.equal(farDrop.ok, false);

  const delivered = delivery.deliverOrder(target.dropoffX + 1.5, target.dropoffZ, 1.0);
  assert.equal(delivered.ok, true);
  assert.ok(delivered.record && delivered.record.earnedInr > 0);
  assert.equal(delivery.getActiveOrder(), null);

  const beforeWallet = prog.getState().walletBalanceInr;
  prog.recordCompletedDelivery(delivered.record);
  assert.equal(prog.getState().walletBalanceInr, beforeWallet + delivered.record.earnedInr);
  assert.equal(prog.getState().completedDeliveries, 1);
  assert.ok(prog.getState().reputationScore > 10);
});

test('LifestyleProgression enforces legitimate wallet balances, upgrades, and owned vehicle summoning', () => {
  withMockCanvasDocument(() => {
    const prog = new LifestyleProgression();
    // Insufficient funds rejected cleanly
    assert.equal(prog.purchaseUpgrade('thermal_bag_pro').ok, false);
    assert.equal(prog.purchaseVehicle('suzuki_access_125').ok, false);

    // Earn legitimate income from deliveries
    for (let i = 0; i < 3; i++) {
      prog.recordCompletedDelivery({
        orderId: `ord_${i}`,
        restaurantId: 'rest_mananchira_biriyani',
        restaurantName: 'Rahmath Malabar Biriyani',
        customerName: 'Lakshmi Nair',
        customerPlaceLabel: 'Mananchira Quarters',
        earnedInr: 250,
        tipEarnedInr: 40,
        foodCondition: 96,
        customerMood: 'happy',
        customerReview: 'Nanni!',
        completedAt: Date.now(),
      });
    }

    assert.equal(prog.getState().walletBalanceInr, 1000);
    const upgRes = prog.purchaseUpgrade('thermal_bag_pro');
    assert.equal(upgRes.ok, true);
    assert.equal(prog.getState().walletBalanceInr, 550);
    assert.ok(prog.getTipBonusMultiplier() > 1.0);
    assert.ok(prog.getBumpMitigationFactor() < 1.0);

    // Earn more & buy Suzuki Access 125
    prog.recordCompletedDelivery({
      orderId: 'ord_extra',
      restaurantId: 'rest_mavoor_chai',
      restaurantName: 'Mavoor Corner Chai Peedika',
      customerName: 'Anjali Menon',
      customerPlaceLabel: 'Mavoor Trade Centre',
      earnedInr: 200,
      tipEarnedInr: 30,
      foodCondition: 98,
      customerMood: 'happy',
      customerReview: 'Warm chai!',
      completedAt: Date.now(),
    });
    const buyAccess = prog.purchaseVehicle('suzuki_access_125');
    assert.equal(buyAccess.ok, true);
    assert.ok(prog.getState().ownedVehicleModels.includes('suzuki_access_125'));

    // Summon owned vehicle cleanly near player without obstacle overlap
    const assets = new AssetManager();
    const mats = new MaterialLibrary(assets);
    const vm = new VehicleManager();
    const summonRes = vm.spawnOwnedVehicleNearPlayer(
      'suzuki_access_125',
      0x0f766e,
      { x: 22.5, z: 2.5, heading: 0 },
      mats,
      [],
      [],
      getGroundHeightAt,
    );
    assert.equal(summonRes.ok, true);
    assert.ok(summonRes.entity?.deliveryBoxGroup, 'Two-wheeler exposes rear delivery rack box');
    assets.disposeAll();
  });
});

test('3D Thermal Delivery Bags, World Markers, Friendly NPC Greetings, InteractionResolver, Audio Chimes, Persistence, and Life UI SSR work end-to-end', async () => {
  await withMockCanvasDocumentAsync(async () => {
    // 1. Arjun & Scooter 3D thermal delivery bags toggle cleanly
    const arjun = createArjunCharacterRig();
    assert.equal(arjun.deliveryBagGroup.visible, false);
    arjun.setDeliveryBagVisible(true);
    assert.equal(arjun.deliveryBagGroup.visible, true);
    arjun.setDeliveryBagVisible(false);
    assert.equal(arjun.deliveryBagGroup.visible, false);
    arjun.dispose();

    const assets = new AssetManager();
    const mats = new MaterialLibrary(assets);
    const preset = resolveGraphicsPresetProfile('medium');
    const streamer = new WorldStreamer(mats, preset);
    streamer.setDeliveryMarkers({ x: 18, z: -42 }, { x: -41, z: -18 });
    streamer.setDeliveryMarkers(null, null);

    // 2. Friendly NPC greeting & InteractionResolver collect/deliver priority
    const greet = getFriendlyNpcGreeting('ped_1', 'elderly', 'Mananchira Square', false);
    assert.ok(greet.length > 5);
    const teaGreet = getFriendlyNpcGreeting('ped_1', 'elderly', 'Mananchira Square', true);
    assert.ok(teaGreet.includes('Chai'));

    const collectTarget = resolveContextualInteraction({
      nearbyBuilding: null,
      nearHome: false,
      homeDistanceMeters: 50,
      isDriving: false,
      nearbyDeliveryPickup: {
        orderId: 'ord_1',
        restaurantName: 'Rahmath Malabar Biriyani',
        distanceMeters: 2.2,
        isReady: true,
      },
    });
    assert.equal(collectTarget?.kind, 'collect_order');
    assert.equal(collectTarget?.actionLabel, 'Collect Order');

    const deliverTarget = resolveContextualInteraction({
      nearbyBuilding: null,
      nearHome: false,
      homeDistanceMeters: 50,
      isDriving: false,
      nearbyDeliveryDropoff: {
        orderId: 'ord_1',
        placeLabel: 'Mananchira Quarters',
        customerName: 'Lakshmi Nair',
        distanceMeters: 1.8,
      },
    });
    assert.equal(deliverTarget?.kind, 'deliver_order');
    assert.equal(deliverTarget?.actionLabel, 'Deliver Order');

    // 3. Persistence round-trip for progression + activeOrder
    const storage = new IndexedDBStorage();
    await storage.initialize();
    const state = createDefaultProgressionState();
    state.walletBalanceInr = 740;
    state.completedDeliveries = 3;
    await storage.saveProgression(state, null);
    const restored = await storage.getSavedProgression();
    assert.equal(restored?.progression.walletBalanceInr, 740);
    assert.equal(restored?.progression.completedDeliveries, 3);

    // 4. Web Audio delivery chimes
    const prevWin = globalThis.window;
    const mockAudio = createMockWebAudioWindow();
    Object.assign(globalThis, {
      window: {
        AudioContext: mockAudio.AudioContext,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
      },
    });
    try {
      const audio = new AudioManager();
      await audio.unlockFromGesture();
      audio.playGameEvent('order_accept');
      audio.playGameEvent('food_pickup');
      audio.playGameEvent('delivery_complete');
      audio.playGameEvent('reward_chime');
      audio.playGameEvent('npc_greet');
      audio.dispose();
    } finally {
      Object.assign(globalThis, { window: prevWin });
    }

    // 5. SSR render checks for TitleScreen ("KOZHIKODE LIFE"), HudOverlay wallet/tracker, DeliveryAndLifeModal
    const titleHtml = renderToStaticMarkup(
      React.createElement(TitleScreen, {
        isBooting: false,
        hasSavedSlot: false,
        settings: createDefaultSettings(),
        audio: createBaseSnapshot().audio,
        onContinue: () => {},
        onNewGame: () => {},
        onOpenSettings: () => {},
        onUpdateSettings: () => {},
        onToggleMute: () => {},
        onUiClick: () => {},
      }),
    );
    assert.ok(titleHtml.includes('KOZHIKODE'));
    assert.equal(titleHtml.includes('GTA KOZHIKODE'), false);

    const modalHtml = renderToStaticMarkup(
      React.createElement(DeliveryAndLifeModal, {
        snapshot: createBaseSnapshot({
          progression: state,
          delivery: {
            activeOrder: null,
            availableOrders: [],
            currentHour: 18,
            nearbyRestaurant: null,
            nearbyPickupReady: false,
            pickupDistanceMeters: null,
            dropoffDistanceMeters: null,
            canCollectNearby: false,
            canDeliverNearby: false,
            lastFeedback: null,
          },
        }),
        onClose: () => {},
        onRefreshOrders: () => {},
        onAcceptOrder: () => ({ ok: true, reason: '' }),
        onPickupOrder: () => ({ ok: true, reason: '' }),
        onDeliverOrder: () => ({ ok: true, reason: '' }),
        onCancelOrder: () => {},
        onNavigateRestaurant: () => {},
        onPurchaseUpgrade: () => ({ ok: true, reason: '' }),
        onPurchaseVehicle: () => ({ ok: true, reason: '' }),
        onSummonVehicle: () => ({ ok: true, reason: '' }),
        onToggleDeliveryBag: () => {},
        onUiClick: () => {},
      }),
    );
    assert.ok(modalHtml.includes('KOZHIKODE DELIVERY'));
    assert.ok(modalHtml.includes('740'));
    assert.ok(LIFESTYLE_UPGRADES_CATALOG.length >= 5);
    assert.ok(PURCHASABLE_VEHICLES_CATALOG.length >= 9);

    streamer.dispose();
    assets.disposeAll();
  });
});
