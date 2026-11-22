import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';
import { AssetManager } from '../src/engine/assets/AssetManager.ts';
import { resolveGraphicsPresetProfile } from '../src/engine/assets/AssetRegistry.ts';
import {
  createDefaultProgressionState,
} from '../src/engine/delivery/LifestyleProgression.ts';
import { KOZHIKODE_RESTAURANTS } from '../src/engine/delivery/RestaurantCatalog.ts';
import { createDefaultSettings } from '../src/engine/persistence/IndexedDBStorage.ts';
import { ArjunAnimator, type ArjunContextualAction } from '../src/engine/player/ArjunAnimator.ts';
import { createArjunCharacterRig } from '../src/engine/player/ArjunCharacterModel.ts';
import type { PlayerMoveResult } from '../src/engine/player/PlayerController.ts';
import { AtmosphereSystem } from '../src/engine/rendering/AtmosphereSystem.ts';
import { MaterialLibrary } from '../src/engine/rendering/MaterialLibrary.ts';
import { SceneManager } from '../src/engine/scene/SceneManager.ts';
import type { EngineHudSnapshot, RestaurantCategory } from '../src/engine/types.ts';
import {
  buildProceduralBuildingLOD,
  buildRailwayStationComplex,
} from '../src/engine/world/BuildingSystem.ts';
import { buildKeralaChaiPeedika } from '../src/engine/world/KeralaChaiPeedika.ts';
import {
  ALL_KOZHIKODE_FOOD_MODELS,
  createFoodModel,
} from '../src/engine/world/KeralaFoodModels.ts';
import { PROTAGONIST_HOME_COORDS } from '../src/engine/world/KozhikodeGeography.ts';
import { resolveRestaurantCategoryForBuilding } from '../src/engine/world/RestaurantInteriorFactory.ts';
import { WorldStreamer } from '../src/engine/world/WorldStreamer.ts';
import { DeliveryAndLifeModal } from '../src/ui/DeliveryAndLifeModal.tsx';
import { HudOverlay } from '../src/ui/HudOverlay.tsx';
import { PauseDiagnosticsModal } from '../src/ui/PauseDiagnosticsModal.tsx';
import { TitleScreen } from '../src/ui/TitleScreen.tsx';
import { WorldMapModal } from '../src/ui/WorldMapModal.tsx';

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

test('Phase 8.1: Structured CSS architecture modules, keyframes, and reduced-motion rules exist', () => {
  const indexCss = readFileSync(resolve('src/index.css'), 'utf-8');
  const modules = [
    'design-tokens.css',
    'animations.css',
    'gameplay.css',
    'controls.css',
    'restaurant.css',
    'responsive.css',
  ];

  for (const mod of modules) {
    assert.ok(indexCss.includes(`./styles/${mod}`), `src/index.css should import ${mod}`);
    const content = readFileSync(resolve('src/styles', mod), 'utf-8');
    assert.ok(content.trim().length > 100, `${mod} should contain substantial CSS rules`);
  }

  const animationsCss = readFileSync(resolve('src/styles/animations.css'), 'utf-8');
  assert.ok(animationsCss.includes('@keyframes klModalPopIn'));
  assert.ok(animationsCss.includes('@keyframes klProgressSheen'));
  assert.ok(animationsCss.includes('@media (prefers-reduced-motion: reduce)'));

  const tokensCss = readFileSync(resolve('src/styles/design-tokens.css'), 'utf-8');
  assert.ok(tokensCss.includes('--kl-accent-brass'));
  assert.ok(tokensCss.includes('.kl-tabular'));
});

test('Phase 8.2: All 14 Kozhikode 3D food models instantiate with multi-part shared geometries', () => {
  assert.equal(ALL_KOZHIKODE_FOOD_MODELS.length, 14);
  for (const kind of ALL_KOZHIKODE_FOOD_MODELS) {
    const model = createFoodModel(kind);
    assert.ok(model instanceof THREE.Group, `${kind} should return a THREE.Group`);
    assert.equal(model.userData.foodKind, kind);
    let meshCount = 0;
    model.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        meshCount += 1;
        assert.equal(
          obj.geometry.userData.shared,
          true,
          `${kind} geometry should be pooled with userData.shared = true`,
        );
      }
    });
    assert.ok(meshCount >= 2, `${kind} should have multi-part geometry (found ${meshCount} meshes)`);
  }
});

test('Phase 8.3: Procedural restaurants build open interiors across all 5 categories and animate NPCs, steam, and fans', () => {
  withMockCanvasDocument(() => {
    const mats = new MaterialLibrary(new AssetManager());
    const categories: RestaurantCategory[] = [
      'biryani_shop',
      'malabar_restaurant',
      'tea_shop',
      'bakery',
      'fast_food',
    ];
    const buildingIds: Record<RestaurantCategory, string> = {
      biryani_shop: 'bldg_mananchira_malabar_biriyani',
      malabar_restaurant: 'bldg_mavoor_grand_hotel',
      tea_shop: 'bldg_beach_sulaimani_chai',
      bakery: 'bldg_sm_halwa_mart',
      fast_food: 'bldg_sm_spices',
    };

    for (const cat of categories) {
      const id = buildingIds[cat];
      assert.equal(resolveRestaurantCategoryForBuilding(id, 'restaurant'), cat);

      const built = buildProceduralBuildingLOD(
        {
          id,
          districtId: 'mananchira',
          archetype: cat === 'bakery' ? 'bakery' : 'restaurant',
          x: 20,
          z: 20,
          rotY: 0,
          width: 11,
          depth: 9,
          floors: 2,
          malayalam: 'കോഴിക്കോട് ഹോട്ടൽ',
          english: `Test ${cat}`,
        },
        mats,
      );

      assert.ok(built.animatedRestaurant, `${cat} should attach an animatedRestaurant interior`);
      const inst = built.animatedRestaurant!;
      assert.equal(inst.category, cat);
      assert.ok(inst.npcs.length >= 2, `${cat} should populate interior NPCs`);
      assert.ok(inst.steamPuffs.length >= 2, `${cat} should include rising kitchen steam puffs`);
      assert.ok(inst.ceilingFans.length >= 1, `${cat} should include animated ceiling fans`);

      const fanSpin = inst.ceilingFans[0].userData.spinTarget as THREE.Object3D;
      assert.ok(fanSpin, `${cat} fan should expose spinTarget`);
      const initialFanRot = fanSpin.rotation.y;
      const initialSteamY = inst.steamPuffs[0].mesh.position.y;
      inst.update(0.05, 1.8, 22, 22, 0.8);
      assert.notEqual(fanSpin.rotation.y, initialFanRot, `${cat} fan should rotate`);
      assert.notEqual(inst.steamPuffs[0].mesh.position.y, initialSteamY, `${cat} steam should animate`);
    }

    // Verify CLT Express Snack & Parcel Counter builds inside Railway Station Complex
    const clt = buildRailwayStationComplex(100, 120, 0, mats);
    assert.equal(clt.record.id, 'bldg_kozhikode_railway_station');
    let foodMeshFound = false;
    clt.lod.traverse((obj) => {
      if (obj.userData?.foodKind) foodMeshFound = true;
    });
    assert.ok(foodMeshFound, 'CLT Railway Station should feature Express Snack Counter food props');
  });
});

test('Phase 8.4: Upgraded KeralaChaiPeedika includes 5 steam puffs, ceiling fan rotor, and NPC state animations', () => {
  withMockCanvasDocument(() => {
    const mats = new MaterialLibrary(new AssetManager());
    const shop = buildKeralaChaiPeedika(
      {
        id: 'chai_test',
        districtId: 'mananchira',
        name: 'Calicut Meter Chai',
        malayalamName: 'കാലിക്കറ്റ് മീറ്റർ ചായ',
        x: 12,
        z: 18,
        rotY: 0,
      },
      mats,
    );

    assert.ok(shop.steamPuffs.length >= 5, 'Chai Peedika should have 5+ volumetric steam puffs');
    assert.ok(shop.ceilingFanRotor instanceof THREE.Group, 'Chai Peedika should include ceiling fan rotor');
    assert.ok(shop.npcs.length >= 7, 'Chai Peedika should populate active animated customer & vendor NPCs');
    assert.ok(shop.npcs.some((n) => n.state === 'pouring' || n.state === 'serving'));
    assert.ok(shop.npcs.some((n) => n.state === 'drinking' || n.state === 'eating'));

    const fanStart = shop.ceilingFanRotor.rotation.y;
    const steamStart = shop.steamPuffs[0].position.y;
    shop.update(0.05, 1.25, 14, 20);
    assert.notEqual(shop.ceilingFanRotor.rotation.y, fanStart, 'Chai Peedika fan should spin');
    assert.notEqual(shop.steamPuffs[0].position.y, steamStart, 'Chai Peedika steam should rise');
  });
});

test('Phase 8.5: ArjunAnimator contextual actions blend limbs and toggle wrist food/parcel props', () => {
  const rig = createArjunCharacterRig();
  const animator = new ArjunAnimator();
  const baseMove: PlayerMoveResult = {
    x: 0,
    y: 0.18,
    z: 0,
    visualY: 0.18,
    vx: 0,
    vz: 0,
    verticalVelocity: 0,
    heading: 0,
    speed: 0,
    isMoving: false,
    isSprinting: false,
    isGrounded: true,
    groundSlope: 0,
    turnRate: 0,
    movementGait: 'idle',
    accelerationState: 'idle',
  };

  const actions: Array<{ action: ArjunContextualAction; expectedProp: 'none' | 'parcel' | 'chai' }> = [
    { action: 'pickup_package', expectedProp: 'parcel' },
    { action: 'deliver_package', expectedProp: 'parcel' },
    { action: 'drink_tea', expectedProp: 'chai' },
    { action: 'talk', expectedProp: 'none' },
    { action: 'sit', expectedProp: 'none' },
  ];

  for (const { action, expectedProp } of actions) {
    animator.triggerContextualAction(action, 1.4);
    for (let i = 0; i < 12; i++) {
      animator.update(rig, baseMove, 0.04, null);
    }
    const snap = animator.getSnapshot();
    assert.equal(snap.activeContextualAction, action);
    assert.equal(rig.getHeldActionProp(), expectedProp, `${action} should equip prop ${expectedProp}`);
  }

  // After action expires cleanly, held prop should return to none
  for (let i = 0; i < 40; i++) {
    animator.update(rig, baseMove, 0.04, null);
  }
  assert.equal(rig.getHeldActionProp(), 'none');
  rig.dispose();
});

test('Phase 8.6: AtmosphereSystem drifting cloud uniform, palm wind sway, and dynamic WorldStreamer restaurant tracking', () => {
  withMockCanvasDocument(() => {
    const profile = resolveGraphicsPresetProfile('high');
    const scene = new THREE.Scene();
    const atmosphere = new AtmosphereSystem(scene, false, profile);
    const skyMat = atmosphere.skyDome.material as THREE.ShaderMaterial;
    const t0 = skyMat.uniforms.uCloudTime.value;
    atmosphere.update(0.5, scene, 22, 2, profile);
    const t1 = skyMat.uniforms.uCloudTime.value;
    assert.ok(t1 > t0, 'AtmosphereSystem update() should advance sky cloud drift uCloudTime');

    const assets = new AssetManager();
    const sm = new SceneManager(assets, false, 'high', 'night');
    sm.update(0.1, 22.5, 2.5);
    assert.ok(
      sm.getActiveRestaurants().length >= 2,
      'Mananchira / S.M. Street chunks should stream open animated restaurants',
    );
    sm.triggerArjunAction('drink_tea', 1.5);
    assert.equal(sm.getArjunAnimationSnapshot().activeContextualAction, 'drink_tea');
    sm.dispose();

    const mats = new MaterialLibrary(assets);
    const streamer = new WorldStreamer(mats, profile);
    streamer.update(0.1, 22.5, 2.5, undefined, undefined, 0.9);
    assert.ok(streamer.getActiveRestaurants().length >= 2);
    // Stream far away so Mananchira chunks unload cleanly
    streamer.update(0.1, 350, 350, undefined, undefined, 0.9);
    streamer.dispose();
  });
});

test('Phase 8.7: Upgraded UI SSR markup uses kl-* visual classes, stepper, category accents, and preserves contracts', () => {
  const prog = createDefaultProgressionState();
  prog.walletBalanceInr = 680;
  prog.completedDeliveries = 3;
  prog.deliveryHistory = [
    {
      orderId: 'ord_hist_1',
      restaurantId: 'paragon_kozhikode',
      restaurantName: 'Paragon Restaurant',
      customerName: 'Fathima',
      customerPlaceLabel: 'Beach Promenade',
      earnedInr: 140,
      tipEarnedInr: 30,
      foodCondition: 98,
      customerMood: 'happy',
      customerReview: 'Still steaming hot Kozhikode biryani! Nanni!',
      completedAt: Date.now(),
    },
  ];

  const baseSnap = createBaseSnapshot({
    progression: prog,
    delivery: {
      availableOrders: [],
      activeOrder: {
        orderId: 'ord_active_1',
        restaurantId: 'paragon_kozhikode',
        restaurantName: 'Paragon Restaurant',
        restaurantMalayalamName: 'പാരഗൺ',
        restaurantCategory: 'biryani_shop',
        restaurantAreaLabel: 'Kannur Road',
        pickupX: 10,
        pickupZ: 10,
        customerId: 'cust_1',
        customerName: 'Nikhil',
        customerPlaceLabel: 'Mananchira Gate',
        customerAreaLabel: 'Mananchira',
        customerGreeting: 'Kozhikode biryani ready?',
        dropoffX: 40,
        dropoffZ: 40,
        itemsSummary: 'Kozhikode Chicken Biryani x1',
        itemsCount: 1,
        prepTimeSec: 8,
        routeDistanceMeters: 140,
        routeRealKm: 1.4,
        estimatedMinutes: 4,
        basePayInr: 70,
        distanceBonusInr: 25,
        tipInr: 20,
        totalEstimateInr: 115,
        status: 'picked_up',
        prepRemainingSec: 0,
        acceptedAt: Date.now() - 10000,
        pickedUpAt: Date.now() - 4000,
        deliveredAt: null,
        packageState: {
          hasPackage: true,
          bagEquipped: true,
          foodCondition: 94,
          temperaturePct: 88,
          fragile: false,
        },
      },
      pickupDistanceMeters: 30,
      dropoffDistanceMeters: 18,
      canCollectNearby: false,
      canDeliverNearby: true,
      nearbyRestaurant: null,
      nearbyPickupReady: false,
      lastFeedback: null,
      currentHour: 17.6,
    },
  });

  const hudHtml = renderToStaticMarkup(
    React.createElement(HudOverlay, {
      snapshot: baseSnap,
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
  assert.ok(hudHtml.includes('kl-hud-wallet'));
  assert.ok(hudHtml.includes('kl-hud-order-card'));
  assert.ok(hudHtml.includes('kl-hud-progress-fill'));
  assert.ok(hudHtml.includes('kl-joystick-ring'));
  assert.ok(hudHtml.includes('₹680'));
  assert.ok(!hudHtml.includes('₹ 0'));

  const modalHtml = renderToStaticMarkup(
    React.createElement(DeliveryAndLifeModal, {
      snapshot: baseSnap,
      initialTab: 'orders',
      onClose: () => {},
      onRefreshOrders: () => {},
      onAcceptOrder: () => ({ ok: true, reason: 'Accepted' }),
      onPickupOrder: () => ({ ok: true, reason: 'Collected' }),
      onDeliverOrder: () => ({ ok: true, reason: 'Delivered' }),
      onCancelOrder: () => {},
      onNavigateRestaurant: () => {},
      onPurchaseUpgrade: () => ({ ok: true, reason: 'Unlocked' }),
      onPurchaseVehicle: () => ({ ok: true, reason: 'Bought' }),
      onSummonVehicle: () => ({ ok: true, reason: 'Summoned' }),
      onToggleDeliveryBag: () => {},
      onUiClick: () => {},
    }),
  );
  assert.ok(modalHtml.includes('kl-modal-shell'));
  assert.ok(modalHtml.includes('kl-order-stepper'));
  assert.ok(modalHtml.includes('KOZHIKODE DELIVERY'));

  const eateriesHtml = renderToStaticMarkup(
    React.createElement(DeliveryAndLifeModal, {
      snapshot: baseSnap,
      initialTab: 'restaurants',
      onClose: () => {},
      onRefreshOrders: () => {},
      onAcceptOrder: () => ({ ok: true, reason: 'Accepted' }),
      onPickupOrder: () => ({ ok: true, reason: 'Collected' }),
      onDeliverOrder: () => ({ ok: true, reason: 'Delivered' }),
      onCancelOrder: () => {},
      onNavigateRestaurant: () => {},
      onPurchaseUpgrade: () => ({ ok: true, reason: 'Unlocked' }),
      onPurchaseVehicle: () => ({ ok: true, reason: 'Bought' }),
      onSummonVehicle: () => ({ ok: true, reason: 'Summoned' }),
      onToggleDeliveryBag: () => {},
      onUiClick: () => {},
    }),
  );
  assert.ok(eateriesHtml.includes('kl-restaurant-card'));
  assert.ok(eateriesHtml.includes(`kl-category-accent--${KOZHIKODE_RESTAURANTS[0].category}`));

  const titleHtml = renderToStaticMarkup(
    React.createElement(TitleScreen, {
      isBooting: false,
      hasSavedSlot: true,
      settings: baseSnap.settings,
      audio: baseSnap.audio,
      onContinue: () => {},
      onNewGame: () => {},
      onOpenSettings: () => {},
      onUpdateSettings: () => {},
      onToggleMute: () => {},
      onUiClick: () => {},
    }),
  );
  assert.ok(titleHtml.includes('kl-title-card'));
  assert.ok(titleHtml.includes('KOZHIKODE'));
  assert.ok(!titleHtml.includes('GTA KOZHIKODE'));

  const pauseHtml = renderToStaticMarkup(
    React.createElement(PauseDiagnosticsModal, {
      snapshot: baseSnap,
      logs: [],
      onClose: () => {},
      onResumePlay: () => {},
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
  assert.ok(pauseHtml.includes('kl-modal-shell'));
  assert.ok(pauseHtml.includes('kl-hub-header'));

  const mapHtml = renderToStaticMarkup(
    React.createElement(WorldMapModal, {
      snapshot: baseSnap,
      onClose: () => {},
      onTravelToWorld: () => {},
      onSetDestination: () => {},
      onClearDestination: () => {},
      onUiClick: () => {},
    }),
  );
  assert.ok(mapHtml.includes('kl-modal-shell'));
  assert.ok(mapHtml.includes('KOZHIKODE DISTRICT WORLD MAP'));
});
