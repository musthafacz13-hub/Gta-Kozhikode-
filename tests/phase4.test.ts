import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';
import { AssetManager } from '../src/engine/assets/AssetManager.ts';
import { resolveGraphicsPresetProfile } from '../src/engine/assets/AssetRegistry.ts';
import { InputManager } from '../src/engine/input/InputManager.ts';
import { createDefaultSettings } from '../src/engine/persistence/IndexedDBStorage.ts';
import { PlayerController } from '../src/engine/player/PlayerController.ts';
import { MaterialLibrary } from '../src/engine/rendering/MaterialLibrary.ts';
import type { EngineHudSnapshot } from '../src/engine/types.ts';
import {
  ALL_BUILDING_ARCHETYPES,
  buildMananchiraHeritageHall,
  buildMedicalCollegeHospital,
  buildProceduralBuildingLOD,
  buildRailwayStationComplex,
  classifyBuildingCategory,
  getSharedBuildingGeometries,
} from '../src/engine/world/BuildingSystem.ts';
import {
  addBusStopShelter,
  addConstructionSiteProps,
  addDrainageCurbRun,
  addParkingBay,
  addRoadDirectionSign,
  addStreetPropInstancedBatch,
  addTrafficIsland,
  getSharedStreetPropGeometries,
} from '../src/engine/world/KeralaPropsAndFoliage.ts';
import { KOZHIKODE_GAZETTEER_PLACES } from '../src/engine/world/KozhikodeGazetteer.ts';
import {
  getGroundHeightAt,
  PROTAGONIST_HOME_COORDS,
} from '../src/engine/world/KozhikodeGeography.ts';
import { createMotorcycleLOD } from '../src/engine/world/VehicleVisualFactory.ts';
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

test('BuildingSystem constructs multi-part LODs and RegisteredBuildingRecord for all 23 archetypes', () => {
  withMockCanvasDocument(() => {
    const assets = new AssetManager();
    const mats = new MaterialLibrary(assets);
    const sharedGeos = getSharedBuildingGeometries();
    assert.equal(sharedGeos.unitBox.userData.shared, true);
    assert.equal(ALL_BUILDING_ARCHETYPES.length, 23);

    const categoriesSeen = new Set<string>();

    for (let i = 0; i < ALL_BUILDING_ARCHETYPES.length; i++) {
      const archetype = ALL_BUILDING_ARCHETYPES[i];
      const cat = classifyBuildingCategory(archetype);
      categoriesSeen.add(cat);

      const { lod, record } = buildProceduralBuildingLOD(
        {
          id: `test_bldg_${archetype}`,
          districtId: 'mananchira',
          archetype,
          x: i * 24,
          z: 0,
          rotY: (i % 4) * (Math.PI / 2),
          width: 14,
          depth: 10,
          floors: cat === 'commercial' ? 3 : 2,
          malayalam: 'കോഴിക്കോട്',
          english: `Test ${archetype}`,
          hasBalcony: true,
          hasAcUnits: true,
          hasSlopedRoof: i % 2 === 0,
          withCompoundWall: cat === 'residential',
        },
        mats,
        130,
      );

      assert.ok(lod instanceof THREE.LOD, `${archetype} must produce THREE.LOD`);
      assert.ok(lod.levels.length >= 2, `${archetype} must include LOD0 and LOD1 levels`);
      assert.ok(lod.levels[0].object.children.length >= 3, `${archetype} LOD0 must be multi-part`);
      assert.ok(lod.levels[1].object.children.length >= 1, `${archetype} LOD1 must render silhouette`);

      const bounds = new THREE.Box3().setFromObject(lod.levels[0].object);
      assert.equal(bounds.isEmpty(), false, `${archetype} LOD0 bounds must be non-empty`);
      assert.ok(bounds.max.y > bounds.min.y, `${archetype} height must be positive`);

      assert.equal(record.archetype, archetype);
      assert.equal(record.category, cat);
      assert.ok(record.lat > 10 && record.lat < 13);
      assert.ok(record.lon > 74 && record.lon < 77);
      assert.ok(record.collider.maxX > record.collider.minX);
      assert.ok(record.collider.maxZ > record.collider.minZ);
    }

    assert.deepEqual(categoriesSeen.size, 3);
    assets.disposeAll();
  });
});

test('Bespoke hero landmarks and Kerala street infrastructure construct cleanly', () => {
  withMockCanvasDocument(() => {
    const assets = new AssetManager();
    const mats = new MaterialLibrary(assets);

    const hall = buildMananchiraHeritageHall(
      0,
      -45,
      0,
      mats,
      'bldg_test_town_hall',
      'KOZHIKODE PUBLIC LIBRARY',
      'കോഴിക്കോട് പബ്ലിക് ലൈബ്രറി',
    );
    const station = buildRailwayStationComplex(10, 162, Math.PI, mats);
    const hospital = buildMedicalCollegeHospital(650, 14, -220, 0, mats);

    for (const hero of [hall, station, hospital]) {
      assert.ok(hero.lod.levels.length >= 2);
      assert.ok(hero.lod.levels[0].object.children.length >= 8);
      assert.equal(hero.record.interiorEligible, true);
    }
    assert.equal(station.record.archetype, 'railway_building');
    assert.equal(hospital.record.archetype, 'hospital');
    assert.equal(hall.record.archetype, 'public_building');

    const streetGroup = new THREE.Group();
    const sharedStreet = getSharedStreetPropGeometries();
    assert.equal(sharedStreet.benchGeo.userData.shared, true);

    addStreetPropInstancedBatch(streetGroup, mats, {
      utilityPoles: [[0, 0, 0, 0], [20, 0, 0, Math.PI]],
      bollards: [[4, 0, 2], [6, 0, 2]],
      trashBins: [[8, 0, 2]],
      benches: [[10, 0, 2, 0]],
      shrubs: [[12, 0, 2, 1.1]],
      rocks: [[14, 0, 2, 1.4]],
    });
    addRoadDirectionSign(streetGroup, mats, {
      key: 'test_sign',
      x: 5,
      y: 0,
      z: 5,
      rotY: 0,
      routeBadge: 'NH-66',
      destinationsEn: ['KOZHIKODE', 'VATAKARA'],
      destinationsMl: 'കോഴിക്കോട്',
    });
    addBusStopShelter(streetGroup, mats, {
      key: 'test_bus_stop',
      x: 10,
      y: 0,
      z: 5,
      rotY: 0,
      nameMl: 'മാനാഞ്ചിറ',
      nameEn: 'MANANCHIRA STOP',
    });
    addTrafficIsland(streetGroup, mats, 15, 5, 2.5);
    addParkingBay(streetGroup, mats, 20, 0, 5, 0, 4);
    addConstructionSiteProps(streetGroup, mats, 25, 0, 5);
    addDrainageCurbRun(streetGroup, mats, 30, 0, 5, 30, true);

    let instancedCount = 0;
    streetGroup.traverse((obj) => {
      if ((obj as THREE.InstancedMesh).isInstancedMesh) {
        instancedCount++;
      }
    });
    assert.ok(instancedCount >= 6, 'InstancedMesh batches must be created for street props/foliage');
    assets.disposeAll();
  });
});

test('All 10 priority Kozhikode urban areas stream buildings, stay walkable at Gazetteer spawns, and resolve nearest building interactions', () => {
  withMockCanvasDocument(() => {
    const assets = new AssetManager();
    const mats = new MaterialLibrary(assets);
    const streamer = new WorldStreamer(mats, resolveGraphicsPresetProfile('medium'));
    const player = new PlayerController();
    const input = new InputManager();

    const priorityChecks: Array<{ id: string; districtMatch: string[] }> = [
      { id: 'mananchira', districtMatch: ['mananchira'] },
      { id: 'sm_street', districtMatch: ['sm_street'] },
      { id: 'palayam', districtMatch: ['palayam'] },
      { id: 'mavoor_road', districtMatch: ['mavoor_road'] },
      { id: 'railway_station', districtMatch: ['railway_station'] },
      { id: 'kozhikode_beach', districtMatch: ['kozhikode_beach'] },
      { id: 'south_beach', districtMatch: ['south_beach'] },
      { id: 'protagonist_home', districtMatch: ['protagonist_home'] },
      { id: 'nadakkavu', districtMatch: ['nadakkavu'] },
      { id: 'medical_college', districtMatch: ['medical_college'] },
    ];

    const seenBuildingIds = new Set<string>();
    let foundInteriorTrue = false;
    let foundInteriorFalse = false;

    for (const check of priorityChecks) {
      const place = KOZHIKODE_GAZETTEER_PLACES.find((p) => p.id === check.id);
      assert.ok(place, `Missing Gazetteer place ${check.id}`);

      streamer.update(0.1, place.worldX, place.worldZ);
      const activeBuildings = streamer.getActiveBuildings();
      assert.ok(activeBuildings.length > 0, `${check.id} must have streamed buildings`);

      const localMatches = activeBuildings.filter((b) => check.districtMatch.includes(b.districtId));
      assert.ok(
        localMatches.length >= 2,
        `${check.id} must stream multiple buildings in its zone (got ${localMatches.length})`,
      );

      for (const b of activeBuildings) {
        seenBuildingIds.add(b.id);
        if (b.interiorEligible) foundInteriorTrue = true;
        else foundInteriorFalse = true;
      }

      // Verify spawning at playable zone anchor (Mananchira promenade is at (22.5, 2.5) beside the water tank)
      const spawnX = check.id === 'mananchira' ? 22.5 : place.worldX;
      const spawnZ = check.id === 'mananchira' ? 2.5 : place.worldZ;
      const colliders = streamer.getActiveColliders();
      const insideCollider = colliders.find(
        (c) =>
          spawnX > c.minX + 0.05 &&
          spawnX < c.maxX - 0.05 &&
          spawnZ > c.minZ + 0.05 &&
          spawnZ < c.maxZ - 0.05,
      );
      assert.equal(
        insideCollider,
        undefined,
        `Spawn point for ${check.id} (${spawnX}, ${spawnZ}) must not sit inside a collider`,
      );

      // Verify player moves cleanly around the area
      player.setEnvironment(colliders, getGroundHeightAt);
      player.resetSpawn(spawnX, spawnZ, 0);
      const startZ = player.position.z;
      input.setVirtualAxes(0, 1);
      for (let step = 0; step < 12; step++) {
        player.update(1 / 60, input.consumeFrameState(), 0);
      }
      input.setVirtualAxes(0, 0);
      assert.ok(
        Math.hypot(player.position.x - spawnX, player.position.z - startZ) > 0.2,
        `Player must walk freely in ${check.id}`,
      );
    }

    assert.ok(seenBuildingIds.size >= 35, `Expected dense multi-zone building catalog, got ${seenBuildingIds.size}`);
    assert.equal(foundInteriorTrue, true, 'Key shops/landmarks/home must be interiorEligible');
    assert.equal(foundInteriorFalse, true, 'Exterior/filler structures must remain interiorEligible=false');

    // Nearest building interaction lookup around Arjun's Tharavadu entrance (starting spawn)
    streamer.update(0.1, PROTAGONIST_HOME_COORDS.porchX, PROTAGONIST_HOME_COORDS.porchZ);
    const nearHome = streamer.findNearestInteractableBuilding(
      PROTAGONIST_HOME_COORDS.porchX,
      PROTAGONIST_HOME_COORDS.porchZ,
      8.5,
    );
    assert.ok(nearHome);
    assert.equal(nearHome.building.id, 'bldg_arjun_residence');
    assert.equal(nearHome.building.ownershipStatus, 'protagonist_home');

    // Protagonist spawns inside West Hill compound and walks South (+Z) out open front gate onto West Hill Rd
    player.setEnvironment(streamer.getActiveColliders(), getGroundHeightAt);
    player.resetSpawn(PROTAGONIST_HOME_COORDS.porchX, PROTAGONIST_HOME_COORDS.porchZ, 0);
    input.setVirtualAxes(0, -1);
    for (let s = 0; s < 140; s++) {
      player.update(1 / 60, input.consumeFrameState(), 0);
    }
    input.setVirtualAxes(0, 0);
    assert.ok(
      player.position.z > PROTAGONIST_HOME_COORDS.gateZ + 2,
      `Protagonist must walk cleanly out West Hill home gate onto street, got z=${player.position.z}`,
    );

    // Motorcycle multi-LOD asset verification
    const motoLod = createMotorcycleLOD(mats);
    assert.ok(motoLod.levels.length >= 2);

    // Nearest building interaction lookup on SM Street (-16, 58)
    streamer.update(0.1, -16, 58);
    const nearHalwa = streamer.findNearestInteractableBuilding(-16, 58, 8.5);
    assert.ok(nearHalwa);
    assert.equal(nearHalwa.building.id, 'bldg_sm_halwa_mart');

    // Unload & reload safety check (shared building/street geometries must remain valid)
    streamer.update(0.1, 650, -220);
    const farCount = streamer.getActiveChunkCount();
    assert.ok(farCount > 0 && farCount <= 49, `Expected hysteresis-bounded active chunks, got ${farCount}`);
    assert.equal(
      streamer.getActiveBuildings().some((b) => b.id === 'bldg_mananchira_town_hall'),
      false,
      'Distant Mananchira chunk must unload when traveling to Medical College',
    );
    streamer.update(0.1, 22.5, 2.5);
    const reloadedBuildings = streamer.getActiveBuildings();
    assert.ok(reloadedBuildings.some((b) => b.id === 'bldg_mananchira_town_hall'));

    streamer.dispose();
    assets.disposeAll();
  });
});

test('HudOverlay surfaces Phase 4 nearbyBuilding prompt cleanly without cluttering Phase 2/3 controls', () => {
  const settings = createDefaultSettings();
  const mockSnapshot: EngineHudSnapshot = {
    mode: 'playing',
    cameraMode: 'free_inspect',
    cameraX: -16,
    cameraZ: 58,
    cameraYaw: 0,
    playerX: -16,
    playerZ: 58,
    playerLat: 11.2512,
    playerLon: 75.7788,
    playerHeading: 0,
    isMoving: false,
    isSprinting: false,
    districtName: 'S.M. Street (Mittayi Theruvu)',
    talukName: 'Kozhikode Taluk',
    biome: 'urban',
    clockFormatted: '17:36',
    activeChunks: 9,
    totalRegions: 54,
    gazetteerCount: 54,
    nearHome: false,
    homeDistanceMeters: 199,
    nearbyBuilding: {
      id: 'bldg_sm_halwa_mart',
      name: 'Kozhikode Halwa Mart',
      malayalamName: 'ഹൽവ ബസാർ',
      archetype: 'bakery',
      category: 'commercial',
      ownershipStatus: 'private_commercial',
      interiorEligible: true,
      distanceMeters: 2.1,
      lat: 11.2512,
      lon: 75.7788,
      futureHooks: { businessTag: 'halwa_bakery' },
    },
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
      activeAmbienceLabel: 'SM Street Bazaar',
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
      drawCalls: 48,
      triangles: 18000,
      geometries: 30,
      textures: 10,
      jsHeapMb: 52,
      activeFixedSteps: 1,
    },
    slots: [],
    lastError: null,
  };

  const html = renderToStaticMarkup(
    React.createElement(HudOverlay, {
      snapshot: mockSnapshot,
      onPause: () => {},
      onToggleCamera: () => {},
      onToggleMute: () => {},
      onUpdateSettings: () => {},
      onHomeInteract: () => {},
      onBuildingInteract: () => 'Kozhikode Halwa Mart · Interior opens in Phase 11',
      onOpenWorldMap: () => {},
      onClearDestination: () => {},
      onUiClick: () => {},
      onVirtualMove: () => {},
      onSprintHold: () => {},
    }),
  );

  assert.ok(html.includes('Nearby Building Marker'));
  assert.ok(html.includes('Kozhikode Halwa Mart'));
  assert.ok(html.includes('ഹൽവ ബസാർ'));
  assert.ok(html.includes('Use Shop'));
  assert.ok(html.includes('Interact with Home Entrance'));
});
