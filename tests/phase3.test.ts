import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveGraphicsPresetProfile } from '../src/engine/assets/AssetRegistry.ts';
import { AssetManager } from '../src/engine/assets/AssetManager.ts';
import { InputManager } from '../src/engine/input/InputManager.ts';
import { createDefaultSettings } from '../src/engine/persistence/IndexedDBStorage.ts';
import { PlayerController } from '../src/engine/player/PlayerController.ts';
import { MaterialLibrary } from '../src/engine/rendering/MaterialLibrary.ts';
import type { EngineHudSnapshot } from '../src/engine/types.ts';
import {
  buildDefaultKozhikodeGeoJson,
  ingestGeoJsonToSpatialBuckets,
  KOZHIKODE_SPATIAL_BUCKETS,
} from '../src/engine/world/GeoJsonPipeline.ts';
import {
  geoToWorld,
  getBiomeAtWorld,
  getCoastlineXAtZ,
  getHighlandElevationAt,
  haversineDistanceKm,
  worldDistanceToRealKm,
  worldToGeo,
} from '../src/engine/world/GeoProjection.ts';
import {
  KOZHIKODE_GAZETTEER_PLACES,
  KOZHIKODE_GRAM_PANCHAYATS,
  KOZHIKODE_RIVERS,
  KOZHIKODE_TALUKS,
  KOZHIKODE_URBAN_LOCAL_BODIES,
  searchGazetteer,
} from '../src/engine/world/KozhikodeGazetteer.ts';
import {
  getDistrictAt,
  getGroundHeightAt,
  worldToChunkCoords,
} from '../src/engine/world/KozhikodeGeography.ts';
import {
  findRoadRoute,
  isPointOnDistrictRoad,
  KOZHIKODE_ROAD_NETWORK,
  type RoadNetworkData,
} from '../src/engine/world/RoadNetworkGraph.ts';
import { WorldStreamer } from '../src/engine/world/WorldStreamer.ts';
import { HudOverlay } from '../src/ui/HudOverlay.tsx';
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

test('GeoProjection accurately projects WGS84 coordinates across Kozhikode District and derives biomes/coastline', () => {
  const anchor = geoToWorld(11.2544, 75.78);
  assert.ok(Math.abs(anchor.x) < 0.01 && Math.abs(anchor.z) < 0.01);

  // Test round-trip invertibility across all 4 Taluks
  const probes = [
    { name: 'Vatakara', lat: 11.6, lon: 75.58 },
    { name: 'Koyilandy', lat: 11.439, lon: 75.695 },
    { name: 'Thamarassery Churam', lat: 11.4983, lon: 76.0222 },
    { name: 'Beypore', lat: 11.1715, lon: 75.8061 },
  ];

  for (const probe of probes) {
    const w = geoToWorld(probe.lat, probe.lon);
    const back = worldToGeo(w.x, w.z);
    assert.ok(Math.abs(back.lat - probe.lat) < 0.001, `${probe.name} lat round-trip drift`);
    assert.ok(Math.abs(back.lon - probe.lon) < 0.001, `${probe.name} lon round-trip drift`);
  }

  // Real km scale consistency: distance from Mananchira to Vatakara (~44 km)
  const vatakaraW = geoToWorld(11.6, 75.58);
  const realKmFromWorld = worldDistanceToRealKm(Math.hypot(vatakaraW.x, vatakaraW.z));
  const realKmHaversine = haversineDistanceKm(
    { lat: 11.2544, lon: 75.78 },
    { lat: 11.6, lon: 75.58 },
  );
  assert.ok(Math.abs(realKmFromWorld - realKmHaversine) < 1.2);

  // Coastline moves west as we travel north toward Vatakara
  assert.ok(getCoastlineXAtZ(-3800) < getCoastlineXAtZ(0));

  // Biomes & Western Ghats elevation
  assert.equal(getBiomeAtWorld(-85, 0), 'coastal');
  assert.equal(getBiomeAtWorld(22.5, 2.5), 'urban');
  const churamW = geoToWorld(11.4983, 76.0222);
  assert.equal(getBiomeAtWorld(churamW.x, churamW.z), 'highland');
  assert.ok(getHighlandElevationAt(churamW.x, churamW.z) > 15);
});

test('KozhikodeGazetteer documents all 4 Taluks, 8 ULBs, 70 Gram Panchayats, 4 rivers, and 54 places', () => {
  assert.equal(KOZHIKODE_TALUKS.length, 4);
  assert.equal(KOZHIKODE_URBAN_LOCAL_BODIES.length, 8);
  assert.equal(KOZHIKODE_GRAM_PANCHAYATS.length, 70);
  assert.equal(KOZHIKODE_RIVERS.length, 4);
  assert.equal(KOZHIKODE_GAZETTEER_PLACES.length, 54);

  const riverNames = KOZHIKODE_RIVERS.map((r) => r.id);
  for (const id of ['river_korapuzha', 'river_kallai', 'river_chaliyar', 'river_kuttiady']) {
    assert.ok(riverNames.includes(id), `Missing river ${id}`);
  }

  const homePlace = KOZHIKODE_GAZETTEER_PLACES.find((p) => p.id === 'protagonist_home');
  assert.equal(homePlace?.dataAccuracy, 'fictional_game');

  const kappadSearch = searchGazetteer('കാപ്പാട്');
  assert.ok(kappadSearch.places.some((p) => p.id === 'kappad'));

  const gpSearch = searchGazetteer('Koorachundu');
  assert.ok(gpSearch.panchayats.some((gp) => gp.id === 'gp_koorachundu'));

  // Dynamic getDistrictAt resolves far towns accurately
  const vatakara = KOZHIKODE_GAZETTEER_PLACES.find((p) => p.id === 'vatakara')!;
  assert.equal(getDistrictAt(vatakara.worldX, vatakara.worldZ).id, 'vatakara');
});

test('RoadNetworkGraph computes connected multi-hop A* routes and returns null when disconnected', () => {
  const byId = (id: string) => KOZHIKODE_GAZETTEER_PLACES.find((p) => p.id === id)!;

  // Mananchira -> Vatakara via NH-66
  const toVatakara = findRoadRoute(22.5, 2.5, byId('vatakara').worldX, byId('vatakara').worldZ);
  assert.ok(toVatakara, 'Mananchira to Vatakara route must exist');
  assert.ok(toVatakara.waypoints.length >= 4);
  assert.ok(toVatakara.highwaySummary.includes('NH-66'));
  assert.ok(toVatakara.realDistanceKm > 35 && toVatakara.realDistanceKm < 65);

  // Mananchira -> Thamarassery Churam via NH-766
  const churam = byId('thamarassery_churam');
  const toChuram = findRoadRoute(22.5, 2.5, churam.worldX, churam.worldZ);
  assert.ok(toChuram, 'Mananchira to Thamarassery Churam route must exist');
  assert.ok(toChuram.highwaySummary.includes('NH-766'));

  // Feroke -> Perambra -> Kakkayam Dam
  const feroke = byId('feroke');
  const kakkayam = byId('kakkayam_dam');
  const toKakkayam = findRoadRoute(feroke.worldX, feroke.worldZ, kakkayam.worldX, kakkayam.worldZ);
  assert.ok(toKakkayam, 'Feroke to Kakkayam Dam route must exist');

  // Strict disconnection check: never fabricate a straight-line fallback across islands
  const disconnectedGraph: RoadNetworkData = {
    nodes: new Map([
      ['a', { id: 'a', name: 'Node A', x: 0, z: 0, lat: 11.25, lon: 75.78 }],
      ['b', { id: 'b', name: 'Node B', x: 500, z: 0, lat: 11.25, lon: 75.83 }],
    ]),
    edges: [],
    adjacency: new Map([
      ['a', []],
      ['b', []],
    ]),
  };
  assert.equal(findRoadRoute(0, 0, 500, 0, disconnectedGraph), null);

  // Road surface membership test
  const onRoad = isPointOnDistrictRoad(byId('koyilandy').worldX, byId('koyilandy').worldZ);
  assert.equal(onRoad.onRoad, true);
  assert.equal(isPointOnDistrictRoad(-2500, 0).onRoad, false);
});

test('GeoJsonPipeline constructs valid district FeatureCollection and spatial chunk buckets', () => {
  const geoJson = buildDefaultKozhikodeGeoJson();
  assert.equal(geoJson.type, 'FeatureCollection');
  assert.ok(geoJson.features.length > 90);

  const reindexed = ingestGeoJsonToSpatialBuckets(geoJson);
  assert.ok(reindexed.roadBuckets.size >= 40);
  assert.ok(reindexed.riverBuckets.size >= 10);

  const korapuzha = KOZHIKODE_GAZETTEER_PLACES.find((p) => p.id === 'elathur')!;
  const korapuzhaChunk = worldToChunkCoords(korapuzha.worldX, korapuzha.worldZ);
  const bucketRoads = KOZHIKODE_SPATIAL_BUCKETS.roadBuckets.get(korapuzhaChunk.key) ?? [];
  assert.ok(bucketRoads.length > 0, 'Korapuzha bridge chunk must contain NH-66 road segments');
});

test('WorldStreamer and PlayerController stream/traverse from Mananchira to Vatakara and Thamarassery Churam', () => {
  withMockCanvasDocument(() => {
    const assets = new AssetManager();
    const mats = new MaterialLibrary(assets);
    const streamer = new WorldStreamer(mats, resolveGraphicsPresetProfile('low'));
    const player = new PlayerController();

    // Start at Mananchira
    streamer.update(0, 22.5, 2.5);
    player.setEnvironment(streamer.getActiveColliders(), getGroundHeightAt);
    const initialChunks = streamer.getActiveChunkCount();
    assert.ok(initialChunks >= 6);

    // Travel north to Koyilandy Town (~22km real = ~2200m world)
    const koyilandy = KOZHIKODE_GAZETTEER_PLACES.find((p) => p.id === 'koyilandy')!;
    streamer.update(0.1, koyilandy.worldX, koyilandy.worldZ);
    player.setEnvironment(streamer.getActiveColliders(), getGroundHeightAt);
    player.resetSpawn(koyilandy.worldX, koyilandy.worldZ, 0);

    const input = new InputManager();
    input.setVirtualAxes(0, 1);
    for (let i = 0; i < 30; i++) {
      player.update(1 / 60, input.consumeFrameState(), 0);
    }
    assert.ok(player.position.z < koyilandy.worldZ, 'Player walks smoothly north in Koyilandy');

    // Travel to Western Ghats Thamarassery Churam -> verify elevation climb & destination beacon
    const churam = KOZHIKODE_GAZETTEER_PLACES.find((p) => p.id === 'thamarassery_churam')!;
    streamer.setDestinationBeacon({ x: churam.worldX, z: churam.worldZ });
    streamer.update(0.1, churam.worldX, churam.worldZ);
    player.setEnvironment(streamer.getActiveColliders(), getGroundHeightAt);
    player.resetSpawn(churam.worldX, churam.worldZ, 0);
    assert.ok(player.position.y > 12, 'Churam terrain height must reflect Western Ghats ascent');

    // Verify coastline clamping rejects ocean walk far west
    player.resetSpawn(-2000, 0, 0);
    assert.ok(player.position.x > -2000, 'District sea boundary must clamp ocean spawn back onto beach');

    streamer.dispose();
    assets.disposeAll();
  });
});

test('Interactive WorldMapModal & updated HudOverlay render cleanly and pass Google Maps zero-legacy audit', () => {
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
    activeChunks: 9,
    totalRegions: 54,
    gazetteerCount: 54,
    nearHome: false,
    homeDistanceMeters: 141,
    activeDestination: {
      id: 'kappad',
      name: 'Kappad Historic Beach',
      malayalamName: 'കാപ്പാട് ബീച്ച്',
      lat: 11.3831,
      lon: 75.7169,
      worldX: -687,
      worldZ: -1425,
      distanceMeters: 1620,
      realDistanceKm: 16.2,
      estimatedDriveMinutes: 24,
      viaSummary: ['NH-66'],
      routeWaypoints: [
        { nodeId: 'origin', name: 'Start', x: 22.5, z: 2.5, lat: 11.2544, lon: 75.78 },
        { nodeId: 'kappad', name: 'Kappad', x: -687, z: -1425, lat: 11.3831, lon: 75.7169 },
      ],
      source: 'gazetteer',
    },
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
      activeAmbienceLabel: 'Kozhikode City Breeze',
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
      cpuFrameMsP50: 3,
      cpuFrameMsP95: 6,
      lastStepMs: 3,
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
  assert.ok(hudHtml.includes('World Map'));
  assert.ok(hudHtml.includes('Open Minimap World View'));
  assert.ok(hudHtml.includes('Kappad Historic Beach'));
  assert.ok(hudHtml.includes('16.2'));

  const modalHtml = renderToStaticMarkup(
    React.createElement(WorldMapModal, {
      snapshot: mockSnapshot,
      onClose: () => {},
      onTravelToWorld: () => {},
      onSetDestination: () => {},
      onClearDestination: () => {},
      onUiClick: () => {},
    }),
  );
  assert.ok(modalHtml.includes('KOZHIKODE DISTRICT WORLD MAP'));
  assert.ok(modalHtml.includes('District Map (Offline)'));
  assert.ok(modalHtml.includes('Google Maps · Live'));
  assert.ok(modalHtml.includes('4 Taluks · 8 ULBs · 70 Gram Panchayats'));
  assert.ok(modalHtml.includes('Set Waypoint'));
  assert.ok(modalHtml.includes('Fast Travel'));

  // Zero-Legacy & Compliance Static Scan across src/
  const srcRoot = path.resolve(process.cwd(), 'src');
  const forbiddenLegacyPatterns = [
    'google.maps.Marker',
    'AutocompleteService',
    'PlacesService',
    'DirectionsService',
    'DirectionsRenderer',
    'DistanceMatrixService',
    'new google.maps.Geocoder',
  ];
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    });
  const sourceFiles = walk(srcRoot).filter((f) => /\.(ts|tsx)$/.test(f));
  for (const file of sourceFiles) {
    const content = fs.readFileSync(file, 'utf8');
    for (const pattern of forbiddenLegacyPatterns) {
      assert.equal(
        content.includes(pattern),
        false,
        `Prohibited legacy Google Maps API "${pattern}" found in ${file}`,
      );
    }
  }

  const worldMapSrc = fs.readFileSync(path.join(srcRoot, 'ui', 'WorldMapModal.tsx'), 'utf8');
  assert.ok(
    worldMapSrc.includes('gmp_mcp_codeassist_v1_aistudio'),
    'WorldMapModal must declare gmp_mcp_codeassist_v1_aistudio attribution ID',
  );
  assert.equal(
    worldMapSrc.includes('new Map('),
    false,
    'WorldMapModal must never call new Map() to prevent @vis.gl/react-google-maps Map shadowing',
  );
});
