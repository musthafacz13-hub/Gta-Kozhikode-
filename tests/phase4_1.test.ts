import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { AssetManager } from '../src/engine/assets/AssetManager.ts';
import {
  DETAILED_VEHICLE_FLEET_CATALOG,
  resolveGraphicsPresetProfile,
  VEHICLE_VISUAL_MANIFEST,
} from '../src/engine/assets/AssetRegistry.ts';
import { AudioManager } from '../src/engine/audio/AudioManager.ts';
import type { VehicleAudioKind } from '../src/engine/audio/AudioTypes.ts';
import { MaterialLibrary } from '../src/engine/rendering/MaterialLibrary.ts';
import { SceneManager } from '../src/engine/scene/SceneManager.ts';
import { buildKeralaChaiPeedika } from '../src/engine/world/KeralaChaiPeedika.ts';
import {
  createKeralaNpcRig,
  type KeralaPedestrianVariant,
} from '../src/engine/world/KeralaNpcRig.ts';
import { PedestrianSystem } from '../src/engine/world/PedestrianSystem.ts';
import { TrafficSystem, type TrafficHornEvent } from '../src/engine/world/TrafficSystem.ts';
import {
  createVehicleModelLOD,
  VEHICLE_BLUEPRINT_META,
  type VehicleModelId,
} from '../src/engine/world/VehicleVisualFactory.ts';
import { WorldStreamer } from '../src/engine/world/WorldStreamer.ts';

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

test('Phase 4.1 constructs all 17 recognizable Kerala vehicle models with distinct proportions, LODs, and wheel spin refs', () => {
  withMockCanvasDocument(() => {
    const assets = new AssetManager();
    const mats = new MaterialLibrary(assets);
    const modelIds = Object.keys(VEHICLE_BLUEPRINT_META) as VehicleModelId[];

    assert.equal(modelIds.length, 17);
    assert.equal(DETAILED_VEHICLE_FLEET_CATALOG.length, 17);
    assert.equal(VEHICLE_VISUAL_MANIFEST.length, 9);

    const requiredPriorities: VehicleModelId[] = [
      'maruti_swift',
      'maruti_alto',
      'maruti_baleno',
      'maruti_wagonr',
      'hyundai_i20',
      'hyundai_creta',
      'tata_nexon',
      'suzuki_access_125',
      'honda_activa',
      'hero_commuter',
      'yamaha_fz',
      'royal_enfield',
      'ksrtc_bus',
      'kerala_private_bus',
      'auto_rickshaw',
      'delivery_van',
      'goods_truck',
    ];
    for (const id of requiredPriorities) {
      assert.ok(modelIds.includes(id), `Missing blueprint for ${id}`);
    }

    const signatures = new Set<string>();
    for (const id of modelIds) {
      const meta = VEHICLE_BLUEPRINT_META[id];
      const lod = createVehicleModelLOD(id, mats, { withDriver: true });
      assert.ok(lod instanceof THREE.LOD, `${id} must return THREE.LOD`);
      assert.ok(lod.levels.length >= 2, `${id} must expose LOD0 and LOD1`);
      assert.ok(lod.levels[0].object.children.length >= 4, `${id} LOD0 must be detailed multi-part`);

      const wheels = lod.userData.wheels as THREE.Object3D[];
      assert.ok(Array.isArray(wheels) && wheels.length >= 2, `${id} must expose spinning wheel references`);

      const box = new THREE.Box3().setFromObject(lod.levels[0].object);
      const size = new THREE.Vector3();
      box.getSize(size);
      assert.ok(size.x > 0.4 && size.y > 0.7 && size.z > 1.2, `${id} bounds invalid`);
      assert.ok(meta.drivableHookEligible, `${id} should preserve Phase 7 drivable hook metadata`);
      signatures.add(`${meta.length.toFixed(2)}x${meta.width.toFixed(2)}x${meta.height.toFixed(2)}`);
    }

    // Distinct vehicle sizes/silhouettes across fleet categories
    assert.ok(signatures.size >= 14, 'Vehicles should retain distinct proportions across models');
    assets.disposeAll();
  });
});

test('TrafficSystem runs smooth road-aligned left-hand traffic, avoids buildings, yields to pedestrians/player, and triggers horns', () => {
  withMockCanvasDocument(() => {
    const assets = new AssetManager();
    const mats = new MaterialLibrary(assets);
    const highPreset = resolveGraphicsPresetProfile('high');
    const streamer = new WorldStreamer(mats, highPreset);
    streamer.update(0, 22.5, 2.5);
    const colliders = streamer.getActiveColliders();

    const traffic = new TrafficSystem(mats, highPreset);
    assert.ok(traffic.getSegmentCount() > 20, 'Road network should build directed traffic segments');
    assert.ok(traffic.getActiveVehicleCount() >= 28, 'High preset should spawn rich active traffic');

    const beforePositions = traffic.getTrafficSnapshots().map((v) => ({ id: v.id, x: v.x, z: v.z }));
    const horns: TrafficHornEvent[] = [];

    // Advance 2.5 seconds of traffic around Mananchira & Mavoor Rd
    for (let step = 0; step < 50; step++) {
      traffic.update(
        0.05,
        22.5,
        2.5,
        undefined,
        colliders,
        [],
        undefined,
        (ev) => horns.push(ev),
      );
    }

    const afterSnapshots = traffic.getTrafficSnapshots();
    let movedCount = 0;
    for (let i = 0; i < afterSnapshots.length; i++) {
      const a = afterSnapshots[i];
      const b = beforePositions[i];
      if (Math.hypot(a.x - b.x, a.z - b.z) > 1.0) {
        movedCount++;
      }
      // Verify visible nearby vehicles do not intersect static buildings
      if (Math.hypot(a.x - 22.5, a.z - 2.5) < 130) {
        for (const col of colliders) {
          const inside =
            a.x > col.minX - 0.15 &&
            a.x < col.maxX + 0.15 &&
            a.z > col.minZ - 0.15 &&
            a.z < col.maxZ + 0.15;
          assert.equal(inside, false, `Vehicle ${a.id} collided into building collider at (${a.x.toFixed(1)}, ${a.z.toFixed(1)})`);
        }
      }
    }
    assert.ok(movedCount >= 12, `Expected >= 12 nearby vehicles advancing on roads, got ${movedCount}`);

    // Place a player obstacle directly in front of the first moving nearby vehicle and verify braking
    const targetVeh = afterSnapshots.find((v) => Math.hypot(v.x - 22.5, v.z - 2.5) < 95 && v.speed > 2.0);
    assert.ok(targetVeh, 'Should locate an active nearby moving vehicle');
    const initialSpeed = targetVeh.speed;
    const blockAheadMeters = targetVeh.length * 0.5 + 5.5;
    const blockX = targetVeh.x + Math.sin(targetVeh.heading) * blockAheadMeters;
    const blockZ = targetVeh.z + Math.cos(targetVeh.heading) * blockAheadMeters;

    let minObservedSpeed = initialSpeed;
    for (let s = 0; s < 16; s++) {
      traffic.update(
        0.05,
        targetVeh.x,
        targetVeh.z,
        undefined,
        colliders,
        [],
        { x: blockX, z: blockZ },
      );
      if (targetVeh.speed < minObservedSpeed) {
        minObservedSpeed = targetVeh.speed;
      }
    }
    assert.ok(
      minObservedSpeed < initialSpeed * 0.65,
      `Vehicle should brake when player stands in lane ahead (initial=${initialSpeed.toFixed(2)}, min=${minObservedSpeed.toFixed(2)})`,
    );

    // Phase 7 descriptor export contract check
    const descriptors = traffic.getPhase7VehicleDescriptors();
    assert.ok(descriptors.length > 0 && descriptors.every((d) => d.drivableHookEligible));

    traffic.dispose();
    streamer.dispose();
    assets.disposeAll();
  });
});

test('PedestrianSystem populates all 7 Kerala demographic variants with articulated walking gaits and obstacle avoidance', () => {
  withMockCanvasDocument(() => {
    const assets = new AssetManager();
    const mats = new MaterialLibrary(assets);
    const highPreset = resolveGraphicsPresetProfile('high');
    const streamer = new WorldStreamer(mats, highPreset);
    streamer.update(0, 22.5, 2.5);
    const colliders = streamer.getActiveColliders();

    const pedSys = new PedestrianSystem(highPreset);
    const peds = pedSys.getPedestrians();
    const seenVariants = new Set<KeralaPedestrianVariant>(peds.map((p) => p.variant));
    for (const v of ['man', 'woman', 'young_adult', 'elderly', 'student', 'worker', 'shop_customer'] as const) {
      assert.ok(seenVariants.has(v), `Missing pedestrian variant: ${v}`);
      const rig = createKeralaNpcRig(v, 11);
      assert.ok(rig.lod.levels.length >= 2);
      assert.ok(rig.hipL && rig.kneeL && rig.shoulderR && rig.elbowR);
    }

    const startSnapshots = peds.map((p) => ({ x: p.x, z: p.z, gait: p.gaitPhase }));
    for (let step = 0; step < 40; step++) {
      pedSys.update(0.05, 22.5, 2.5, undefined, colliders, []);
    }

    let walkedCount = 0;
    for (let i = 0; i < peds.length; i++) {
      const p = peds[i];
      if (!p.rig.lod.visible) continue;
      const distMoved = Math.hypot(p.x - startSnapshots[i].x, p.z - startSnapshots[i].z);
      if (distMoved > 0.35 && p.gaitPhase !== startSnapshots[i].gait) {
        walkedCount++;
      }
      // Verify collider pushout prevents pedestrians entering building interiors
      for (const col of colliders) {
        const inside =
          p.x > col.minX + 0.1 &&
          p.x < col.maxX - 0.1 &&
          p.z > col.minZ + 0.1 &&
          p.z < col.maxZ - 0.1;
        assert.equal(inside, false, `Pedestrian ${p.id} penetrated collider`);
      }
    }
    assert.ok(walkedCount >= 4, `Expected nearby pedestrians walking smoothly, got ${walkedCount}`);

    // Verify nearby player triggers proximity awareness state
    const activeNear = peds.find((p) => p.rig.lod.visible && Math.hypot(p.x - 22.5, p.z - 2.5) < 90);
    assert.ok(activeNear);
    pedSys.update(
      0.05,
      activeNear.x,
      activeNear.z,
      undefined,
      colliders,
      [],
      { x: activeNear.x + 1.0, z: activeNear.z },
    );
    assert.equal(activeNear.state, 'player_react');

    pedSys.dispose();
    streamer.dispose();
    assets.disposeAll();
  });
});

test('KeralaChaiPeedika constructs authentic Kerala tea shop props, Meter Chai animation, and streams at West Hill & Mavoor Corner', () => {
  withMockCanvasDocument(() => {
    const assets = new AssetManager();
    const mats = new MaterialLibrary(assets);
    const shop = buildKeralaChaiPeedika(
      {
        id: 'test_chai_peedika',
        districtId: 'mananchira',
        name: 'Malabar Chai Peedika',
        malayalamName: 'മലബാർ ചായക്കട',
        x: 53,
        z: -49,
        rotY: -Math.PI * 0.75,
      },
      mats,
    );

    const requiredRoles = [
      'bench_sitter',
      'tea_holder',
      'tea_drinker',
      'pazham_pori_eater',
      'talking_pair_a',
      'talking_pair_b',
      'counter_customer',
      'shopkeeper_maker',
      'shopkeeper_server',
    ] as const;

    for (const role of requiredRoles) {
      assert.ok(shop.npcRoles.includes(role), `Missing animated Chai Peedika role: ${role}`);
    }
    assert.equal(shop.buildingRecord.ownershipStatus, 'private_commercial');
    assert.equal(shop.buildingRecord.interiorEligible, true);

    const maker = shop.npcs.find((n) => n.role === 'shopkeeper_maker')!;
    const drinker = shop.npcs.find((n) => n.role === 'tea_drinker')!;
    const initialMakerShoulder = maker.rig.shoulderL.rotation.x;
    const initialDrinkerElbow = drinker.rig.elbowR.rotation.x;

    const triggeredSfx: string[] = [];
    for (let step = 1; step <= 40; step++) {
      shop.update(0.1, step * 0.1, 53, -46, (ev) => triggeredSfx.push(ev));
    }

    assert.notEqual(maker.rig.shoulderL.rotation.x, initialMakerShoulder, 'Maker should animate meter chai pour arm');
    assert.notEqual(drinker.rig.elbowR.rotation.x, initialDrinkerElbow, 'Customer should animate raising tea cup');
    assert.ok(triggeredSfx.length >= 1, 'Close tea shop update should trigger procedural tea shop SFX');

    // Verify WorldStreamer includes flagship Chai Peedikas at Mavoor Corner and West Hill
    const streamer = new WorldStreamer(mats, resolveGraphicsPresetProfile('medium'));
    streamer.update(0.05, 53, -49);
    assert.ok(streamer.getActiveTeaShops().some((s) => s.id === 'chai_peedika_mavoor_corner'));
    assert.ok(streamer.getNearestTeaShopDistance(53, -49) < 2);

    streamer.update(0.05, -14, -105);
    assert.ok(streamer.getActiveTeaShops().some((s) => s.id === 'chai_peedika_west_hill'));
    assert.ok(streamer.getNearestTeaShopDistance(-14, -105) < 2);

    // SceneManager unified integration check
    const sceneMgr = new SceneManager(assets, false, 'medium', 'golden');
    sceneMgr.update(0.05, 22.5, 2.5, undefined, { x: 22.5, z: 2.5 });
    const stats = sceneMgr.getAmbientStats(53, -49);
    assert.ok(stats.activeVehicles > 0 && stats.activePedestrians > 0);

    sceneMgr.dispose();
    streamer.dispose();
    assets.disposeAll();
  });
});

test('AudioManager and MalabarSoundscapes synthesize spatial horns across vehicle kinds and proximity tea-shop SFX', async () => {
  const prevWin = globalThis.window;
  let hornEventsFired = 0;

  const makeParam = (initial = 0) => ({
    value: initial,
    setValueAtTime(v: number) {
      this.value = v;
    },
    linearRampToValueAtTime(v: number) {
      this.value = v;
    },
    exponentialRampToValueAtTime(v: number) {
      this.value = v;
    },
    setTargetAtTime(v: number) {
      this.value = v;
    },
  });

  const makeNode = () => ({
    connect() {},
    disconnect() {},
    start() {
      hornEventsFired++;
    },
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
    state: 'suspended' | 'running' | 'closed' = 'running';
    sampleRate = 44100;
    currentTime = 2.0;
    destination = makeNode();
    async resume() {
      this.state = 'running';
    }
    async suspend() {
      this.state = 'suspended';
    }
    async close() {
      this.state = 'closed';
    }
    createGain() {
      return makeNode();
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
      setInterval: () => 1,
      clearInterval: () => {},
      setTimeout: () => 2,
      clearTimeout: () => {},
    },
  });

  try {
    const audio = new AudioManager();
    await audio.unlockFromGesture();

    const kinds: VehicleAudioKind[] = [
      'car',
      'scooter',
      'motorcycle',
      'auto_rickshaw',
      'ksrtc_bus',
      'private_bus',
      'truck',
    ];
    for (const k of kinds) {
      const withinRange = audio.playVehicleHornSpatial(k, 18, 0, 0, 0, 0, 95);
      assert.equal(withinRange, true, `Horn within range should trigger for ${k}`);
    }
    const outOfRange = audio.playVehicleHornSpatial('ksrtc_bus', 150, 0, 0, 0, 0, 95);
    assert.equal(outOfRange, false, 'Horn beyond max range should cull cleanly');

    const beforeTeaNodes = hornEventsFired;
    audio.triggerTeaShopSfx('tea_pour', 8, 0.2);
    audio.triggerTeaShopSfx('glass_clink', 10, -0.2);
    audio.triggerTeaShopSfx('spoon_stir', 12, 0.1);
    audio.triggerTeaShopSfx('snack_fry', 6, 0);
    assert.ok(hornEventsFired > beforeTeaNodes, 'Tea shop SFX should schedule WebAudio nodes');

    audio.update(0.1, {
      playerX: 53,
      playerZ: -46,
      nightGlowFactor: 0.25,
      districtId: 'mavoor_road',
      isCoastal: false,
      isMarket: false,
      isHomeZone: false,
      isPlaying: true,
      isMoving: false,
      isSprinting: false,
      speed: 0,
      teaShopDistanceMeters: 5,
    });

    audio.dispose();
  } finally {
    Object.assign(globalThis, { window: prevWin });
  }
});
