import * as THREE from 'three';
import type { TeaShopSfxEvent } from '../audio/AudioTypes.ts';
import type { GraphicsPresetProfile } from '../assets/AssetRegistry.ts';
import type { StaticAabbCollider } from '../player/PlayerController.ts';
import type { MaterialLibrary } from '../rendering/MaterialLibrary.ts';
import {
  buildMananchiraHeritageHall,
  buildMedicalCollegeHospital,
  buildProceduralBuildingLOD,
  buildRailwayStationComplex,
  type ProceduralBuildingSpec,
  type RegisteredBuildingRecord,
} from './BuildingSystem.ts';
import {
  getBiomeAtWorld,
  getCoastlineXAtZ,
  getHighlandElevationAt,
  worldToGeo,
} from './GeoProjection.ts';
import { KOZHIKODE_SPATIAL_BUCKETS } from './GeoJsonPipeline.ts';
import {
  buildKeralaChaiPeedika,
  type ChaiPeedikaInstance,
} from './KeralaChaiPeedika.ts';
import {
  addBusStopShelter,
  addConstructionSiteProps,
  addDrainageCurbRun,
  addParkingBay,
  addRoadDirectionSign,
  addStreetPropInstancedBatch,
  addTrafficIsland,
  buildPalmGeometries,
  buildShadeTreeGeometries,
} from './KeralaPropsAndFoliage.ts';
import {
  CHUNK_SIZE_METERS,
  KOZHIKODE_ROAD_CORRIDORS,
  KOZHIKODE_WORLD_BOUNDS,
  getGroundHeightAt,
  worldToChunkCoords,
} from './KozhikodeGeography.ts';
import {
  createAutoRickshawLOD,
  createCarLOD,
  createCityBusLOD,
  createDeliveryTruckLOD,
  createFishingBoatLOD,
  createMotorcycleLOD,
  createScooterLOD,
  createVehicleModelLOD,
} from './VehicleVisualFactory.ts';

const MIN_CHUNK_X = Math.floor((KOZHIKODE_WORLD_BOUNDS.minX + CHUNK_SIZE_METERS * 0.5) / CHUNK_SIZE_METERS);
const MAX_CHUNK_X = Math.floor((KOZHIKODE_WORLD_BOUNDS.maxX + CHUNK_SIZE_METERS * 0.5) / CHUNK_SIZE_METERS);
const MIN_CHUNK_Z = Math.floor((KOZHIKODE_WORLD_BOUNDS.minZ + CHUNK_SIZE_METERS * 0.5) / CHUNK_SIZE_METERS);
const MAX_CHUNK_Z = Math.floor((KOZHIKODE_WORLD_BOUNDS.maxZ + CHUNK_SIZE_METERS * 0.5) / CHUNK_SIZE_METERS);

interface LoadedChunk {
  key: string;
  cx: number;
  cz: number;
  group: THREE.Group;
  colliders: StaticAabbCollider[];
  buildings: RegisteredBuildingRecord[];
  teaShops: ChaiPeedikaInstance[];
}

const _dummy = new THREE.Object3D();
const _tint = new THREE.Color();

function disposeChunkGeometries(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry && mesh.geometry.userData?.shared !== true) {
      mesh.geometry.dispose();
    }
  });
}

export class WorldStreamer {
  readonly root = new THREE.Group();
  readonly baseGroup = new THREE.Group();
  readonly horizonGroup = new THREE.Group();
  readonly chunksGroup = new THREE.Group();

  private readonly mats: MaterialLibrary;
  private readonly loadedChunks = new Map<string, LoadedChunk>();
  private readonly sharedGeos: {
    palmTrunk: THREE.BufferGeometry;
    palmCrown: THREE.BufferGeometry;
    palmNuts: THREE.BufferGeometry;
    shadeTrunk: THREE.BufferGeometry;
    shadeLeaf: THREE.BufferGeometry;
    lampPole: THREE.BufferGeometry;
    lampBulb: THREE.BufferGeometry;
  };
  private readonly sharedTerrainMats: {
    landPlainMat: THREE.MeshStandardMaterial;
    highlandGroundMat: THREE.MeshStandardMaterial;
    midlandGroundMat: THREE.MeshStandardMaterial;
    coastalGroundMat: THREE.MeshStandardMaterial;
    waterfallMat: THREE.MeshStandardMaterial;
    coconutMat: THREE.MeshStandardMaterial;
  };

  private activeColliders: StaticAabbCollider[] = [];
  private activeBuildings: RegisteredBuildingRecord[] = [];
  private activeTeaShops: ChaiPeedikaInstance[] = [];
  private collidersDirty = true;
  private preset: GraphicsPresetProfile;
  private originOffset = { x: 0, z: 0 };
  private beaconMesh: THREE.Mesh | null = null;
  private destinationBeaconGroup: THREE.Group | null = null;
  private readonly floatingBoats: { mesh: THREE.Object3D; baseY: number; phase: number }[] = [];
  private simTimeSec = 0;

  constructor(mats: MaterialLibrary, preset: GraphicsPresetProfile) {
    this.mats = mats;
    this.preset = preset;

    const palm = buildPalmGeometries();
    const shade = buildShadeTreeGeometries();
    const poleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 4.6, 0),
      new THREE.Vector3(0.4, 5.4, 0),
      new THREE.Vector3(1.3, 5.3, 0),
    ]);
    const lampPole = new THREE.TubeGeometry(poleCurve, 10, 0.075, 6, false);
    const lampBulb = new THREE.BoxGeometry(0.45, 0.1, 0.24);
    lampBulb.translate(1.3, 5.25, 0);

    for (const g of [
      palm.trunkGeo,
      palm.crownGeo,
      palm.coconutGeo,
      shade.trunkGeo,
      shade.foliageGeo,
      lampPole,
      lampBulb,
    ]) {
      g.userData.shared = true;
    }

    this.sharedGeos = {
      palmTrunk: palm.trunkGeo,
      palmCrown: palm.crownGeo,
      palmNuts: palm.coconutGeo,
      shadeTrunk: shade.trunkGeo,
      shadeLeaf: shade.foliageGeo,
      lampPole,
      lampBulb,
    };

    this.sharedTerrainMats = {
      landPlainMat: new THREE.MeshStandardMaterial({ color: 0x3a342c, roughness: 0.94, metalness: 0.02 }),
      highlandGroundMat: new THREE.MeshStandardMaterial({ color: 0x203a24, roughness: 0.94, metalness: 0.02 }),
      midlandGroundMat: new THREE.MeshStandardMaterial({ color: 0x35472a, roughness: 0.94, metalness: 0.02 }),
      coastalGroundMat: new THREE.MeshStandardMaterial({ color: 0x454b35, roughness: 0.94, metalness: 0.02 }),
      waterfallMat: new THREE.MeshStandardMaterial({ color: 0xbae6fd, emissive: 0x0284c7, emissiveIntensity: 0.35 }),
      coconutMat: new THREE.MeshStandardMaterial({ color: 0x654321, roughness: 0.75 }),
    };

    this.root.add(this.baseGroup, this.horizonGroup, this.chunksGroup);
    this.buildRegionalTerrainAndRoads();
    this.buildHorizonLandmarks();
  }

  setGraphicsPreset(preset: GraphicsPresetProfile): void {
    this.preset = preset;
  }

  /**
   * Floating-origin offset support for multi-kilometer district expansion without float32 jitter.
   */
  setOriginOffset(x: number, z: number): void {
    this.originOffset.x = x;
    this.originOffset.z = z;
    this.root.position.set(-x, 0, -z);
  }

  getOriginOffset(): { x: number; z: number } {
    return { ...this.originOffset };
  }

  getActiveChunkCount(): number {
    return this.loadedChunks.size;
  }

  getActiveBuildings(): RegisteredBuildingRecord[] {
    if (this.collidersDirty) {
      this.rebuildActiveCaches();
    }
    return this.activeBuildings;
  }

  findNearestInteractableBuilding(
    x: number,
    z: number,
    maxDistanceMeters = 7.5,
  ): { building: RegisteredBuildingRecord; distanceMeters: number } | null {
    const list = this.getActiveBuildings();
    let best: RegisteredBuildingRecord | null = null;
    let bestDist = maxDistanceMeters;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const d = Math.hypot(x - b.interactionPoint.x, z - b.interactionPoint.z);
      if (d <= bestDist) {
        bestDist = d;
        best = b;
      }
    }
    return best ? { building: best, distanceMeters: Number(bestDist.toFixed(1)) } : null;
  }

  setDestinationBeacon(target: { x: number; z: number } | null): void {
    if (!target) {
      if (this.destinationBeaconGroup) {
        this.destinationBeaconGroup.visible = false;
      }
      return;
    }

    if (!this.destinationBeaconGroup) {
      const beacon = new THREE.Group();
      const pillarMat = new THREE.MeshBasicMaterial({
        color: 0x34d399,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      });
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 1.15, 70, 12, 1, true), pillarMat);
      pillar.position.y = 35;
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 2.2, 24), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.25;
      beacon.add(pillar, ring);
      this.destinationBeaconGroup = beacon;
      this.root.add(beacon);
    }

    const gy = getGroundHeightAt(target.x, target.z);
    this.destinationBeaconGroup.position.set(target.x, gy, target.z);
    this.destinationBeaconGroup.visible = true;
  }

  getActiveColliders(): StaticAabbCollider[] {
    if (this.collidersDirty) {
      this.rebuildActiveCaches();
    }
    return this.activeColliders;
  }

  private rebuildActiveCaches(): void {
    const mergedColliders: StaticAabbCollider[] = [
      // Continuous Arabian Sea Seawall barrier along downtown coast x = -69
      { minX: -70.5, maxX: -68.0, minZ: -290, maxZ: 280 },
    ];
    const mergedBuildings: RegisteredBuildingRecord[] = [];
    const mergedTeaShops: ChaiPeedikaInstance[] = [];
    for (const chunk of this.loadedChunks.values()) {
      for (let i = 0; i < chunk.colliders.length; i++) {
        mergedColliders.push(chunk.colliders[i]);
      }
      for (let i = 0; i < chunk.buildings.length; i++) {
        mergedBuildings.push(chunk.buildings[i]);
      }
      for (let i = 0; i < chunk.teaShops.length; i++) {
        mergedTeaShops.push(chunk.teaShops[i]);
      }
    }
    this.activeColliders = mergedColliders;
    this.activeBuildings = mergedBuildings;
    this.activeTeaShops = mergedTeaShops;
    this.collidersDirty = false;
  }

  getActiveTeaShops(): ReadonlyArray<ChaiPeedikaInstance> {
    if (this.collidersDirty) {
      this.rebuildActiveCaches();
    }
    return this.activeTeaShops;
  }

  getNearestTeaShopDistance(x: number, z: number): number {
    const shops = this.getActiveTeaShops();
    let best = 999;
    for (let i = 0; i < shops.length; i++) {
      const d = Math.hypot(x - shops[i].x, z - shops[i].z);
      if (d < best) best = d;
    }
    return best;
  }

  update(
    dt: number,
    focusX: number,
    focusZ: number,
    camera?: THREE.Camera,
    onTeaSfx?: (event: TeaShopSfxEvent, distMeters: number) => void,
  ): boolean {
    this.simTimeSec += dt;
    const center = worldToChunkCoords(focusX, focusZ);
    const radius = this.preset.streamRadiusChunks;
    const unloadRadius = radius + 1;
    let changed = false;

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const cx = center.cx + dx;
        const cz = center.cz + dz;
        if (cx < MIN_CHUNK_X || cx > MAX_CHUNK_X || cz < MIN_CHUNK_Z || cz > MAX_CHUNK_Z) {
          continue;
        }
        const key = `${cx},${cz}`;
        if (!this.loadedChunks.has(key)) {
          const built = this.buildChunk(cx, cz);
          this.loadedChunks.set(key, built);
          this.chunksGroup.add(built.group);
          this.collidersDirty = true;
          changed = true;
        }
      }
    }

    for (const [key, chunk] of this.loadedChunks.entries()) {
      const distX = Math.abs(chunk.cx - center.cx);
      const distZ = Math.abs(chunk.cz - center.cz);
      if (distX > unloadRadius || distZ > unloadRadius) {
        this.chunksGroup.remove(chunk.group);
        disposeChunkGeometries(chunk.group);
        this.loadedChunks.delete(key);
        this.collidersDirty = true;
        changed = true;
      }
    }

    if (this.beaconMesh) {
      this.beaconMesh.rotation.y += dt * 1.4;
    }
    if (this.destinationBeaconGroup && this.destinationBeaconGroup.visible) {
      this.destinationBeaconGroup.rotation.y += dt * 1.1;
    }
    const nowSec = performance.now() * 0.001;
    for (let i = 0; i < this.floatingBoats.length; i++) {
      const b = this.floatingBoats[i];
      b.mesh.position.y = b.baseY + Math.sin(nowSec * 1.6 + b.phase) * 0.14;
      b.mesh.rotation.z = Math.sin(nowSec * 1.1 + b.phase) * 0.035;
    }

    const teaShops = this.getActiveTeaShops();
    for (let i = 0; i < teaShops.length; i++) {
      teaShops[i].update(dt, this.simTimeSec, focusX, focusZ, onTeaSfx);
    }

    if (camera) {
      this.chunksGroup.traverse((obj) => {
        if (obj instanceof THREE.LOD) {
          obj.update(camera);
        }
      });
    }

    return changed;
  }

  dispose(): void {
    for (const chunk of this.loadedChunks.values()) {
      disposeChunkGeometries(chunk.group);
    }
    this.loadedChunks.clear();
    disposeChunkGeometries(this.baseGroup);
    disposeChunkGeometries(this.horizonGroup);
    Object.values(this.sharedGeos).forEach((g) => g.dispose());
    Object.values(this.sharedTerrainMats).forEach((m) => m.dispose());
  }

  private buildRegionalTerrainAndRoads(): void {
    // Extended Kozhikode coastal urban plain (land + sand + Arabian Sea)
    const landGeo = new THREE.PlaneGeometry(620, 740);
    landGeo.rotateX(-Math.PI / 2);
    const land = new THREE.Mesh(landGeo, this.sharedTerrainMats.landPlainMat);
    land.position.set(180, -0.02, -10);
    land.receiveShadow = true;
    this.baseGroup.add(land);

    const sandGeo = new THREE.PlaneGeometry(42, 740);
    sandGeo.rotateX(-Math.PI / 2);
    const sand = new THREE.Mesh(sandGeo, this.mats.sandMat);
    sand.position.set(-88, 0.0, -10);
    sand.receiveShadow = true;
    this.baseGroup.add(sand);

    const seaGeo = new THREE.PlaneGeometry(260, 780, 24, 42);
    seaGeo.rotateX(-Math.PI / 2);
    const sea = new THREE.Mesh(seaGeo, this.mats.seaWaterMat);
    sea.position.set(-228, -0.18, -10);
    this.baseGroup.add(sea);

    // Continuous Seawall Promenade Barrier (-69)
    const seawall = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 580), this.mats.lateriteMat);
    seawall.position.set(-69, 0.55, -10);
    seawall.castShadow = true;
    seawall.receiveShadow = true;
    this.baseGroup.add(seawall);

    // Connected Kozhikode City Street Network
    for (const road of KOZHIKODE_ROAD_CORRIDORS) {
      const length = Math.abs(road.end - road.start);
      const center = (road.start + road.end) * 0.5;
      const geo = new THREE.PlaneGeometry(road.width, length);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, this.mats.asphaltMat);
      if (road.axis === 'ns') {
        mesh.position.set(road.coord, 0.02, center);
      } else {
        mesh.rotation.y = Math.PI / 2;
        mesh.position.set(center, 0.02, road.coord);
      }
      mesh.receiveShadow = true;
      this.baseGroup.add(mesh);
    }

    // Smooth Asphalt Intersection Patches (eliminates Z-fighting)
    const nsRoads = KOZHIKODE_ROAD_CORRIDORS.filter((r) => r.axis === 'ns');
    const ewRoads = KOZHIKODE_ROAD_CORRIDORS.filter((r) => r.axis === 'ew');
    for (const ns of nsRoads) {
      for (const ew of ewRoads) {
        if (ns.coord >= ew.start && ns.coord <= ew.end && ew.coord >= ns.start && ew.coord <= ns.end) {
          const patch = new THREE.Mesh(
            new THREE.PlaneGeometry(ns.width + 0.8, ew.width + 0.8),
            this.mats.plainAsphaltMat,
          );
          patch.rotation.x = -Math.PI / 2;
          patch.position.set(ns.coord, 0.035, ew.coord);
          patch.receiveShadow = true;
          this.baseGroup.add(patch);
        }
      }
    }

    // Pedestrian Zebra Crosswalks across key Kozhikode junctions
    const crosswalks: [number, number, boolean][] = [
      [-34, -27, false], [34, -27, false], [-34, 27, false], [34, 27, false],
      [-25, 35, true], [25, 35, true], [34, 110, false], [120, -25, false],
      [34, -178, false], [24, -188, true], [-34, -178, false], [34, -110, false],
    ];
    for (const [cx, cz, horizontal] of crosswalks) {
      for (let s = -4; s <= 4; s += 2) {
        const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 3.2), this.mats.stripeMat);
        stripe.rotation.x = -Math.PI / 2;
        if (horizontal) {
          stripe.rotation.z = Math.PI / 2;
          stripe.position.set(cx, 0.05, cz + s * 0.9);
        } else {
          stripe.position.set(cx + s * 1.1, 0.05, cz);
        }
        this.baseGroup.add(stripe);
      }
    }
  }

  private buildHorizonLandmarks(): void {
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x264427, roughness: 0.95 });
    const ghatMat = new THREE.MeshStandardMaterial({ color: 0x1a3320, roughness: 0.96 });
    const hillSpecs: [number, number, number, number, boolean][] = [
      [330, -140, 85, 34, false],
      [380, -30, 95, 42, false],
      [350, 120, 80, 30, false],
      [270, -280, 90, 36, false],
      [2550, -2680, 420, 180, true],
      [2950, -2380, 380, 165, true],
      [1650, -3350, 360, 145, true],
    ];
    for (const [hx, hz, rad, h, isGhat] of hillSpecs) {
      const hill = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 8), isGhat ? ghatMat : hillMat);
      hill.position.set(hx, h * 0.45, hz);
      hill.scale.set(1.3, 1, 1.8);
      this.horizonGroup.add(hill);
    }

    const craneMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.65, metalness: 0.4 });
    const harbourPier = new THREE.Mesh(new THREE.BoxGeometry(75, 2.2, 16), this.mats.lateriteMat);
    harbourPier.position.set(-105, 1.0, 325);
    this.horizonGroup.add(harbourPier);
    for (const cx of [-90, -118]) {
      const mast = new THREE.Mesh(new THREE.BoxGeometry(2.4, 24, 2.4), craneMat);
      mast.position.set(cx, 12, 325);
      const jib = new THREE.Mesh(new THREE.BoxGeometry(18, 1.4, 1.4), craneMat);
      jib.position.set(cx - 7, 22, 325);
      jib.rotation.z = 0.25;
      this.horizonGroup.add(mast, jib);
    }

    const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.7, metalness: 0.35 });
    for (const bz of [285, 305]) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(12, 0.85, 6, 12, Math.PI), bridgeMat);
      arch.position.set(120, 1.2, bz);
      arch.rotation.y = Math.PI / 2;
      this.horizonGroup.add(arch);
    }
  }

  private buildChunk(cx: number, cz: number): LoadedChunk {
    const group = new THREE.Group();
    const colliders: StaticAabbCollider[] = [];
    const buildings: RegisteredBuildingRecord[] = [];
    const teaShops: ChaiPeedikaInstance[] = [];
    const key = `${cx},${cz}`;

    if (cx === 0 && cz === 0) {
      this.populateMananchiraCoreChunk(group, colliders, buildings);
    } else if (cx === 0 && cz === 1) {
      this.populateSmStreetAndStationChunk(group, colliders, buildings);
    } else if (cx === 0 && cz === 2) {
      this.populateStationSouthForecourtChunk(group, colliders, buildings);
    } else if (cx === 1 && cz === 0) {
      this.populateMavoorRoadChunk(group, colliders, buildings, teaShops);
    } else if (cx === 1 && cz === 1) {
      this.populatePalayamChunk(group, colliders, buildings);
    } else if (cx === -1 && cz === 0) {
      this.populateKozhikodeBeachChunk(group, colliders, buildings);
    } else if (cx === -1 && cz === 1) {
      this.populateSouthBeachChunk(group, colliders, buildings);
    } else if (cx === 0 && cz === -1) {
      this.populateProtagonistHomeChunk(group, colliders, buildings, teaShops);
    } else if (cx === -1 && cz === -1) {
      this.populateWestHillCoastalChunk(group, colliders, buildings);
    } else if (cx === 0 && cz === -2) {
      this.populateNadakkavuChunk(group, colliders, buildings);
    } else {
      this.populateOuterDistrictChunk(cx, cz, group, colliders, buildings);
    }

    return { key, cx, cz, group, colliders, buildings, teaShops };
  }

  private addSidewalkPad(group: THREE.Group, x: number, z: number, w: number, d: number, y = 0.09): void {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, d), this.mats.sidewalkMat);
    pad.position.set(x, y, z);
    pad.receiveShadow = true;
    group.add(pad);
  }

  private placeBuilding(
    group: THREE.Group,
    colliders: StaticAabbCollider[],
    buildings: RegisteredBuildingRecord[],
    spec: ProceduralBuildingSpec,
  ): void {
    const { lod, record } = buildProceduralBuildingLOD(spec, this.mats, this.preset.lodNearDistance);
    group.add(lod);
    colliders.push(record.collider);
    buildings.push(record);
  }

  private addParkedVehicleWithCollider(
    group: THREE.Group,
    colliders: StaticAabbCollider[],
    vehicleObj: THREE.Object3D,
    halfWidth: number,
    halfLength: number,
    maxY = 1.85,
  ): void {
    group.add(vehicleObj);
    const absCos = Math.abs(Math.cos(vehicleObj.rotation.y));
    const absSin = Math.abs(Math.sin(vehicleObj.rotation.y));
    const extX = absCos * halfWidth + absSin * halfLength;
    const extZ = absSin * halfWidth + absCos * halfLength;
    colliders.push({
      minX: vehicleObj.position.x - extX,
      maxX: vehicleObj.position.x + extX,
      minZ: vehicleObj.position.z - extZ,
      maxZ: vehicleObj.position.z + extZ,
      maxY: vehicleObj.position.y + maxY,
      kind: 'vehicle',
    });
  }

  private addInstancedFoliageAndLamps(
    group: THREE.Group,
    palms: [number, number, number, number][],
    shades: [number, number, number, number][],
    lamps: [number, number, number, number][],
  ): void {
    const density = this.preset.foliageDensityScale;
    const palmCount = Math.max(1, Math.round(palms.length * density));
    if (palms.length > 0 && palmCount > 0) {
      const trunks = new THREE.InstancedMesh(this.sharedGeos.palmTrunk, this.mats.palmTrunkMat, palmCount);
      const crowns = new THREE.InstancedMesh(this.sharedGeos.palmCrown, this.mats.palmFrondMat, palmCount);
      const nuts = new THREE.InstancedMesh(this.sharedGeos.palmNuts, this.sharedTerrainMats.coconutMat, palmCount);
      trunks.castShadow = true;
      crowns.castShadow = true;

      for (let i = 0; i < palmCount; i++) {
        const [x, y, z, s] = palms[i];
        _dummy.position.set(x, y, z);
        _dummy.rotation.set(0, (i * 1.37) % (Math.PI * 2), 0);
        _dummy.scale.setScalar(s);
        _dummy.updateMatrix();
        trunks.setMatrixAt(i, _dummy.matrix);
        crowns.setMatrixAt(i, _dummy.matrix);
        nuts.setMatrixAt(i, _dummy.matrix);
        _tint.setHSL(0.3 + (i % 3) * 0.02, 0.52, 0.34 + (i % 4) * 0.03);
        crowns.setColorAt(i, _tint);
      }
      trunks.instanceMatrix.needsUpdate = true;
      crowns.instanceMatrix.needsUpdate = true;
      nuts.instanceMatrix.needsUpdate = true;
      if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
      trunks.computeBoundingSphere();
      crowns.computeBoundingSphere();
      nuts.computeBoundingSphere();
      group.add(trunks, crowns, nuts);
    }

    if (shades.length > 0) {
      const trunks = new THREE.InstancedMesh(this.sharedGeos.shadeTrunk, this.mats.shadeTrunkMat, shades.length);
      const crowns = new THREE.InstancedMesh(this.sharedGeos.shadeLeaf, this.mats.shadeLeafMat, shades.length);
      trunks.castShadow = true;
      crowns.castShadow = true;
      for (let i = 0; i < shades.length; i++) {
        const [x, y, z, s] = shades[i];
        _dummy.position.set(x, y, z);
        _dummy.rotation.set(0, i * 1.1, 0);
        _dummy.scale.setScalar(s);
        _dummy.updateMatrix();
        trunks.setMatrixAt(i, _dummy.matrix);
        crowns.setMatrixAt(i, _dummy.matrix);
        _tint.setHSL(0.32, 0.48, 0.26 + (i % 3) * 0.03);
        crowns.setColorAt(i, _tint);
      }
      trunks.instanceMatrix.needsUpdate = true;
      crowns.instanceMatrix.needsUpdate = true;
      if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
      trunks.computeBoundingSphere();
      crowns.computeBoundingSphere();
      group.add(trunks, crowns);
    }

    if (lamps.length > 0) {
      const poles = new THREE.InstancedMesh(this.sharedGeos.lampPole, this.mats.darkIronMat, lamps.length);
      const bulbs = new THREE.InstancedMesh(this.sharedGeos.lampBulb, this.mats.streetLampBulbMat, lamps.length);
      poles.castShadow = true;
      for (let i = 0; i < lamps.length; i++) {
        const [x, y, z, rotY] = lamps[i];
        _dummy.position.set(x, y, z);
        _dummy.rotation.set(0, rotY, 0);
        _dummy.scale.set(1, 1, 1);
        _dummy.updateMatrix();
        poles.setMatrixAt(i, _dummy.matrix);
        bulbs.setMatrixAt(i, _dummy.matrix);
      }
      poles.instanceMatrix.needsUpdate = true;
      bulbs.instanceMatrix.needsUpdate = true;
      poles.computeBoundingSphere();
      bulbs.computeBoundingSphere();
      group.add(poles, bulbs);
    }
  }

  private populateMananchiraCoreChunk(
    group: THREE.Group,
    colliders: StaticAabbCollider[],
    buildings: RegisteredBuildingRecord[],
  ): void {
    // 1. Mananchira Civic Park & Central Laterite Tank
    this.addSidewalkPad(group, 0, 0, 55, 58);
    const lawnTop = new THREE.Mesh(new THREE.PlaneGeometry(46, 6.5), this.mats.grassMat);
    lawnTop.rotation.x = -Math.PI / 2;
    lawnTop.position.set(0, 0.2, -23);
    lawnTop.receiveShadow = true;
    const lawnBot = lawnTop.clone();
    lawnBot.position.z = 23;
    group.add(lawnTop, lawnBot);

    const tankWallTop = new THREE.Mesh(new THREE.BoxGeometry(38, 0.85, 2.0), this.mats.lateriteMat);
    tankWallTop.position.set(0, 0.6, -14);
    tankWallTop.castShadow = true;
    tankWallTop.receiveShadow = true;
    const tankWallBot = tankWallTop.clone();
    tankWallBot.position.z = 14;
    const tankWallLeft = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.85, 30), this.mats.lateriteMat);
    tankWallLeft.position.set(-18, 0.6, 0);
    tankWallLeft.castShadow = true;
    const tankWallRight = tankWallLeft.clone();
    tankWallRight.position.x = 18;
    group.add(tankWallTop, tankWallBot, tankWallLeft, tankWallRight);
    colliders.push({ minX: -19.2, maxX: 19.2, minZ: -15.2, maxZ: 15.2 });

    for (const [px, pz] of [[-18, -14], [18, -14], [-18, 14], [18, 14]]) {
      const pav = new THREE.Group();
      pav.position.set(px, 0.18, pz);
      const base = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9, 3.4), this.mats.lateriteMat);
      base.position.y = 0.45;
      base.castShadow = true;
      pav.add(base);
      for (const cx of [-1.2, 1.2]) {
        for (const cz of [-1.2, 1.2]) {
          const col = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 2.3, 8), this.mats.lateriteMat);
          col.position.set(cx, 2.05, cz);
          col.castShadow = true;
          pav.add(col);
        }
      }
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.9, 1.35, 4), this.mats.terracottaRoofMat);
      roof.position.y = 3.85;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      pav.add(roof);
      group.add(pav);
    }

    const tankWaterGeo = new THREE.PlaneGeometry(34, 26);
    tankWaterGeo.rotateX(-Math.PI / 2);
    const tankWater = new THREE.Mesh(tankWaterGeo, this.mats.tankWaterMat);
    tankWater.position.set(0, 0.42, 0);
    tankWater.receiveShadow = true;
    group.add(tankWater);

    // 2. Sidewalks & Urban Curbs + Drainage Grates
    this.addSidewalkPad(group, 50, 0, 18, 58);
    this.addSidewalkPad(group, -48, 0, 15, 58);
    this.addSidewalkPad(group, 0, -50, 56, 18);
    addDrainageCurbRun(group, this.mats, 27.6, 0.02, 0, 54, true);
    addDrainageCurbRun(group, this.mats, -27.6, 0.02, 0, 54, true);
    addDrainageCurbRun(group, this.mats, 40.6, 0.02, 0, 54, true);

    // 3. Bespoke Mananchira Heritage Civic Colonnade (Public Library / Town Hall North-West)
    const civicHall = buildMananchiraHeritageHall(
      -4,
      -51,
      0,
      this.mats,
      'bldg_mananchira_town_hall',
      'KOZHIKODE PUBLIC LIBRARY & HALL',
      'കോഴിക്കോട് പബ്ലിക് ലൈബ്രറി',
    );
    group.add(civicHall.lod);
    colliders.push(civicHall.record.collider);
    buildings.push(civicHall.record);

    // East & North Commercial Perimeter Buildings
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_mananchira_sweet_bakers',
      districtId: 'mananchira',
      archetype: 'bakery',
      x: 50,
      z: -20,
      rotY: -Math.PI / 2,
      width: 15,
      depth: 11,
      floors: 3,
      facadeStyle: 'warm',
      awningColor: 0xb45309,
      malayalam: 'മിഠായി തെരുവ് ബേക്കറി',
      english: 'Sweet Street Bakers',
      signBg: '#7c2d12',
      signFg: '#fde68a',
      hasSlopedRoof: true,
      businessTag: 'bakery_shop',
    });
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_mananchira_tea_house',
      districtId: 'mananchira',
      archetype: 'restaurant',
      x: 50,
      z: -1,
      rotY: -Math.PI / 2,
      width: 16,
      depth: 11,
      floors: 2,
      facadeStyle: 'cream',
      awningColor: 0x0f766e,
      malayalam: 'മലബാർ ചായ & സ്നാക്സ്',
      english: 'Malabar Tea House',
      signBg: '#064e3b',
      signFg: '#f8fafc',
      hasSlopedRoof: true,
      businessTag: 'restaurant_tea',
    });
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_mananchira_calicut_silks',
      districtId: 'mananchira',
      archetype: 'clothing_store',
      x: 50,
      z: 18,
      rotY: -Math.PI / 2,
      width: 15,
      depth: 11,
      floors: 3,
      facadeStyle: 'teal',
      awningColor: 0x991b1b,
      malayalam: 'കോഴിക്കോട് ടെക്സ്റ്റൈൽസ്',
      english: 'Calicut Silks',
      signBg: '#450a0a',
      signFg: '#fbbf24',
      hasBalcony: true,
      businessTag: 'clothing_retail',
    });
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_mananchira_sagar_books',
      districtId: 'mananchira',
      archetype: 'local_shop',
      x: -24,
      z: -50,
      rotY: 0,
      width: 12,
      depth: 11,
      floors: 3,
      facadeStyle: 'cream',
      awningColor: 0x1d4ed8,
      malayalam: 'സാഗർ ബുക്സ്',
      english: 'Sagar Books',
      signBg: '#1e3a8a',
      signFg: '#f8fafc',
    });
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_mananchira_malabar_biriyani',
      districtId: 'mananchira',
      archetype: 'restaurant',
      x: 18,
      z: -50,
      rotY: 0,
      width: 14,
      depth: 11,
      floors: 2,
      facadeStyle: 'warm',
      awningColor: 0x15803d,
      malayalam: 'റഹ്മത്ത് ഹോട്ടൽ',
      english: 'Malabar Biriyani',
      signBg: '#14532d',
      signFg: '#fde047',
      hasSlopedRoof: true,
      businessTag: 'restaurant_biriyani',
    });

    // West Heritage Residential / Civic Buffer Houses
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_mananchira_west_villa1',
      districtId: 'mananchira',
      archetype: 'kerala_traditional',
      x: -48,
      z: -18,
      rotY: Math.PI / 2,
      width: 10,
      depth: 8.5,
      floors: 2,
      stuccoTone: 'warm',
      malayalam: 'മാനാഞ്ചിറ ക്വാർട്ടേഴ്സ്',
      english: 'Mananchira Quarters',
      withCompoundWall: true,
      hasSlopedRoof: true,
    });
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_mananchira_west_villa2',
      districtId: 'mananchira',
      archetype: 'older_house',
      x: -48,
      z: 16,
      rotY: Math.PI / 2,
      width: 9.5,
      depth: 8.2,
      floors: 1,
      stuccoTone: 'mint',
      malayalam: 'ബീച്ച് ലിങ്ക് ഹൗസ്',
      english: 'West Boulevard Home',
      withCompoundWall: true,
      hasSlopedRoof: true,
    });

    // SM Street Entrance Heritage Arch at (1.5, 41.5)
    const arch = new THREE.Group();
    arch.position.set(1.5, 0.18, 41.5);
    const pL = new THREE.Mesh(new THREE.BoxGeometry(1.1, 5.2, 1.1), this.mats.lateriteMat);
    pL.position.set(-5.2, 2.6, 0);
    pL.castShadow = true;
    const pR = pL.clone();
    pR.position.x = 5.2;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(12.2, 1.35, 1.25), this.mats.lateriteMat);
    beam.position.set(0, 5.5, 0);
    beam.castShadow = true;
    const archSign = new THREE.Mesh(
      new THREE.BoxGeometry(9.6, 1.05, 1.35),
      this.mats.getSignMaterial('sm_street_arch', 'എസ്.എം. സ്ട്രീറ്റ് · മിഠായി തെരുവ്', 'S.M. STREET HERITAGE BAZAAR', '#7c2d12', '#fde68a'),
    );
    archSign.position.set(0, 5.5, 0);
    arch.add(pL, pR, beam, archSign);
    group.add(arch);

    // Street Furniture: Mananchira Bus Stop, Road Signs, Parking Bay, Traffic Island
    addBusStopShelter(group, this.mats, {
      key: 'bus_stop_mananchira',
      x: 27.2,
      y: 0.18,
      z: -12,
      rotY: -Math.PI / 2,
      nameMl: 'മാനാഞ്ചിറ ബസ് സ്റ്റോപ്പ്',
      nameEn: 'MANANCHIRA CITY BUS STOP',
    });
    addRoadDirectionSign(group, this.mats, {
      key: 'sign_mananchira_east_jct',
      x: 26,
      y: 0.18,
      z: -28,
      rotY: -Math.PI * 0.25,
      routeBadge: 'CITY',
      destinationsEn: ['<- WEST HILL / BEACH', '-> MAVOOR RD / PALAYAM'],
      destinationsMl: 'മാനാഞ്ചിറ ജംഗ്ഷൻ',
      bgHex: '#0369a1',
    });
    addParkingBay(group, this.mats, -16, 0.02, -41, 0, 4);
    addTrafficIsland(group, this.mats, 34, -35, 2.4);

    // Street Props Instanced Batch (Benches, Trash Bins, Shrubs, Utility Poles)
    addStreetPropInstancedBatch(group, this.mats, {
      benches: [
        [-22.5, 0.18, -8, Math.PI / 2],
        [-22.5, 0.18, 8, Math.PI / 2],
        [22.5, 0.18, -8, -Math.PI / 2],
        [22.5, 0.18, 8, -Math.PI / 2],
        [-8, 0.18, -19.5, 0],
        [8, 0.18, 19.5, Math.PI],
      ],
      trashBins: [
        [25.5, 0.18, -15],
        [-25.5, 0.18, 12],
        [42.5, 0.18, -12],
      ],
      utilityPoles: [
        [41.5, 0.18, -26, 0],
        [41.5, 0.18, 10, 0],
        [-41.5, 0.18, -24, Math.PI],
        [-41.5, 0.18, 22, Math.PI],
      ],
      shrubs: [
        [-22, 0.18, -23, 1.1],
        [22, 0.18, -23, 1.0],
        [-22, 0.18, 23, 1.05],
        [22, 0.18, 23, 1.1],
      ],
    });

    // Curb-parked Ambient Static Vehicles (kept clear of active left-hand lanes, with solid colliders)
    const bus = createVehicleModelLOD('kerala_private_bus', this.mats, { colorHex: 0x0369a1 });
    bus.position.set(39.0, 0.02, -4);
    bus.rotation.y = Math.PI;
    const auto1 = createAutoRickshawLOD(this.mats);
    auto1.position.set(28.8, 0.02, -23);
    auto1.rotation.y = Math.PI * 0.95;
    const auto2 = createAutoRickshawLOD(this.mats);
    auto2.position.set(-28.8, 0.02, 14);
    const car1 = createVehicleModelLOD('maruti_swift', this.mats, { colorHex: 0xf8fafc });
    car1.position.set(-16, 0.18, -41);
    car1.rotation.y = Math.PI / 2;
    this.addParkedVehicleWithCollider(group, colliders, bus, 1.24, 4.3, 3.05);
    this.addParkedVehicleWithCollider(group, colliders, auto1, 0.68, 1.3, 1.72);
    this.addParkedVehicleWithCollider(group, colliders, auto2, 0.68, 1.3, 1.72);
    this.addParkedVehicleWithCollider(group, colliders, car1, 0.88, 1.92, 1.55);

    this.addInstancedFoliageAndLamps(
      group,
      [
        [-28, 0.18, -24, 1.0], [-28, 0.18, 24, 1.05], [27, 0.18, -26, 0.96], [27, 0.18, 26, 1.04],
        [-43, 0.18, -28, 1.05], [-43, 0.18, 28, 0.98], [-18, 0.18, -28, 0.92], [18, 0.18, -28, 1.06],
      ],
      [
        [-24, 0.18, -19, 1.0], [24, 0.18, -19, 1.05], [-24, 0.18, 19, 0.95], [24, 0.18, 19, 1.1],
      ],
      [
        [-27.5, 0.18, -26, Math.PI / 2], [-27.5, 0.18, 0, Math.PI / 2], [-27.5, 0.18, 26, Math.PI / 2],
        [27.5, 0.18, -26, -Math.PI / 2], [27.5, 0.18, 0, -Math.PI / 2], [27.5, 0.18, 26, -Math.PI / 2],
      ],
    );
  }

  private populateSmStreetAndStationChunk(
    group: THREE.Group,
    colliders: StaticAabbCollider[],
    buildings: RegisteredBuildingRecord[],
  ): void {
    // S.M. Street Bazaar Pads & Station Plaza (z = 44..175)
    this.addSidewalkPad(group, -16, 80, 28, 66);
    this.addSidewalkPad(group, 18, 80, 22, 66);
    this.addSidewalkPad(group, 10, 158, 70, 58);

    // Dense Bazaar Shopfront Row along Mittayi Theruvu
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_sm_halwa_mart',
      districtId: 'sm_street',
      archetype: 'bakery',
      x: -16,
      z: 52,
      rotY: 0,
      width: 15,
      depth: 10,
      floors: 2,
      facadeStyle: 'warm',
      awningColor: 0xb91c1c,
      malayalam: 'ഹൽവ ബസാർ',
      english: 'Kozhikode Halwa Mart',
      signBg: '#7f1d1d',
      signFg: '#fef08a',
      hasSlopedRoof: true,
      businessTag: 'halwa_bakery',
    });
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_sm_city_mobile',
      districtId: 'sm_street',
      archetype: 'mobile_shop',
      x: 18,
      z: 52,
      rotY: 0,
      width: 15,
      depth: 10,
      floors: 3,
      facadeStyle: 'teal',
      awningColor: 0x0369a1,
      malayalam: 'പാരഗൺ മൊബൈൽസ്',
      english: 'City Mobile & Gear',
      signBg: '#0c4a6e',
      signFg: '#f8fafc',
      hasAcUnits: true,
    });
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_sm_malabar_gold',
      districtId: 'sm_street',
      archetype: 'clothing_store',
      x: -16,
      z: 74,
      rotY: Math.PI / 2,
      width: 15,
      depth: 10,
      floors: 3,
      facadeStyle: 'cream',
      awningColor: 0x0f766e,
      malayalam: 'കല്ലായി ജ്വല്ലറി',
      english: 'Malabar Gold Mart',
      signBg: '#064e3b',
      signFg: '#fde047',
      hasBalcony: true,
    });
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_sm_spices',
      districtId: 'sm_street',
      archetype: 'local_shop',
      x: 18,
      z: 74,
      rotY: -Math.PI / 2,
      width: 15,
      depth: 10,
      floors: 2,
      facadeStyle: 'warm',
      awningColor: 0xd97706,
      malayalam: 'മിഠായി തെരുവ് സ്പൈസസ്',
      english: 'Calicut Spices Co',
      signBg: '#78350f',
      signFg: '#fef3c7',
      hasSlopedRoof: true,
    });
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_sm_textile_arcade',
      districtId: 'sm_street',
      archetype: 'clothing_store',
      x: -16,
      z: 96,
      rotY: Math.PI / 2,
      width: 16,
      depth: 10,
      floors: 3,
      facadeStyle: 'warm',
      awningColor: 0x991b1b,
      malayalam: 'മലബാർ സിൽക്ക് ഹൗസ്',
      english: 'SM Textile Emporium',
      signBg: '#450a0a',
      signFg: '#fde68a',
    });
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_sm_pharmacy',
      districtId: 'sm_street',
      archetype: 'pharmacy',
      x: 18,
      z: 96,
      rotY: -Math.PI / 2,
      width: 15,
      depth: 10,
      floors: 2,
      facadeStyle: 'teal',
      awningColor: 0x15803d,
      malayalam: 'സെൻട്രൽ മെഡിക്കൽസ്',
      english: 'SM Central Pharmacy',
      signBg: '#14532d',
      signFg: '#f8fafc',
    });

    // Overhead Bazaar Lantern Cross-Span at SM Street Pedestrian Corridor
    for (const lz of [64, 86]) {
      const span = new THREE.Mesh(new THREE.BoxGeometry(16, 0.24, 0.35), this.mats.darkIronMat);
      span.position.set(1, 5.4, lz);
      group.add(span);
      for (const lx of [-4, 0, 4]) {
        const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.4), this.mats.streetLampBulbMat);
        bulb.position.set(1 + lx, 5.1, lz);
        group.add(bulb);
      }
    }

    // Hero Landmark: Kozhikode Railway Station (CLT) Complex at (10, 162)
    const station = buildRailwayStationComplex(10, 162, Math.PI, this.mats);
    group.add(station.lod);
    colliders.push(station.record.collider);
    buildings.push(station.record);

    addBusStopShelter(group, this.mats, {
      key: 'bus_stop_railway',
      x: 28,
      y: 0.18,
      z: 132,
      rotY: -Math.PI / 2,
      nameMl: 'റെയിൽവേ സ്റ്റേഷൻ സ്റ്റോപ്പ്',
      nameEn: 'RAILWAY STN AUTO & BUS BAY',
    });
    addParkingBay(group, this.mats, -16, 0.02, 136, 0, 5);
    addRoadDirectionSign(group, this.mats, {
      key: 'sign_sm_station_link',
      x: 27,
      y: 0.18,
      z: 112,
      rotY: -Math.PI * 0.25,
      routeBadge: 'CLT',
      destinationsEn: ['<- S.M. STREET BAZAAR', '-> RAILWAY STATION / PALAYAM'],
      destinationsMl: 'റെയിൽവേ സ്റ്റേഷൻ',
      bgHex: '#065f46',
    });

    addStreetPropInstancedBatch(group, this.mats, {
      utilityPoles: [[28, 0.18, 60, 0], [28, 0.18, 102, 0], [-28, 0.18, 70, Math.PI]],
      trashBins: [[-2, 0.18, 66], [4, 0.18, 92], [12, 0.18, 144]],
      bollards: [[-3, 0.18, 46], [5, 0.18, 46], [-3, 0.18, 108], [5, 0.18, 108]],
      benches: [[4, 0.18, 142, 0], [-4, 0.18, 142, 0]],
    });

    const van = createDeliveryTruckLOD(this.mats);
    van.position.set(30, 0.02, 74);
    const auto = createAutoRickshawLOD(this.mats);
    auto.position.set(26, 0.02, 146);
    auto.rotation.y = Math.PI * 0.4;
    const auto2 = createAutoRickshawLOD(this.mats);
    auto2.position.set(22, 0.02, 146);
    auto2.rotation.y = Math.PI * 0.45;
    const suv = createCarLOD(this.mats, 0x334155, true);
    suv.position.set(-28, 0.02, 134);
    const motoSm = createMotorcycleLOD(this.mats, 0xb91c1c);
    motoSm.position.set(11, 0.18, 60);
    motoSm.rotation.y = -Math.PI * 0.35;
    this.addParkedVehicleWithCollider(group, colliders, van, 1.2, 3.1, 2.8);
    this.addParkedVehicleWithCollider(group, colliders, auto, 0.68, 1.3, 1.72);
    this.addParkedVehicleWithCollider(group, colliders, auto2, 0.68, 1.3, 1.72);
    this.addParkedVehicleWithCollider(group, colliders, suv, 0.92, 2.15, 1.7);
    this.addParkedVehicleWithCollider(group, colliders, motoSm, 0.4, 1.0, 1.15);

    this.addInstancedFoliageAndLamps(
      group,
      [[-27, 0.18, 66, 0.95], [27, 0.18, 66, 1.02], [-27, 0.18, 136, 1.05], [27, 0.18, 136, 0.95]],
      [[2, 0.18, 138, 1.05]],
      [[27, 0.18, 64, -Math.PI / 2], [27, 0.18, 100, -Math.PI / 2], [-27, 0.18, 136, Math.PI / 2]],
    );
  }

  private populateStationSouthForecourtChunk(
    group: THREE.Group,
    colliders: StaticAabbCollider[],
    buildings: RegisteredBuildingRecord[],
  ): void {
    // Completes Kozhikode Railway Station South Forecourt & Kallai Rd Junction (z = 180..270)
    this.addSidewalkPad(group, 0, 224, 52, 42);
    this.addSidewalkPad(group, 52, 224, 24, 42);

    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_station_south_parking',
      districtId: 'railway_station',
      archetype: 'parking_structure',
      x: -14,
      z: 224,
      rotY: 0,
      width: 22,
      depth: 16,
      floors: 3,
      stuccoTone: 'slate',
      malayalam: 'സ്റ്റേഷൻ മൾട്ടി-ലെവൽ പാർക്കിംഗ്',
      english: 'CLT Station Parking Deck',
      signBg: '#1e3a8a',
      signFg: '#f8fafc',
      interiorEligible: false,
    });
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_station_parcel_office',
      districtId: 'railway_station',
      archetype: 'government_building',
      x: 16,
      z: 224,
      rotY: 0,
      width: 16,
      depth: 12,
      floors: 2,
      facadeStyle: 'cream',
      awningColor: 0x7c2d12,
      malayalam: 'സതേൺ റെയിൽവേ പാർസൽ',
      english: 'Railway Parcel Office',
      signBg: '#451a03',
      signFg: '#fde68a',
      hasSlopedRoof: true,
    });
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_kallai_timber_mart',
      districtId: 'kallai_bridge',
      archetype: 'office',
      x: 52,
      z: 224,
      rotY: -Math.PI / 2,
      width: 18,
      depth: 12,
      floors: 3,
      facadeStyle: 'office',
      awningColor: 0x0f766e,
      malayalam: 'കല്ലായി ടിമ്പർ ട്രേഡേഴ്സ്',
      english: 'Kallai Timber Hub',
      signBg: '#0f172a',
      signFg: '#38bdf8',
      hasAcUnits: true,
    });

    addTrafficIsland(group, this.mats, 34, 195, 2.5);
    addRoadDirectionSign(group, this.mats, {
      key: 'sign_kallai_south_station',
      x: 26,
      y: 0.18,
      z: 205,
      rotY: -Math.PI * 0.25,
      routeBadge: 'NH-66',
      destinationsEn: ['<- SOUTH BEACH', '-> KALLAI BRIDGE / FEROKE'],
      destinationsMl: 'കല്ലായി റോഡ്',
      bgHex: '#065f46',
    });

    addStreetPropInstancedBatch(group, this.mats, {
      utilityPoles: [[-26, 0.18, 206, 0], [42, 0.18, 206, Math.PI]],
      trashBins: [[4, 0.18, 210], [44, 0.18, 218]],
      shrubs: [[-24, 0.18, 238, 1.1], [22, 0.18, 238, 1.05]],
    });

    const truck = createDeliveryTruckLOD(this.mats);
    truck.position.set(36, 0.02, 224);
    this.addParkedVehicleWithCollider(group, colliders, truck, 1.2, 3.1, 2.8);

    this.addInstancedFoliageAndLamps(
      group,
      [[-24, 0.18, 244, 1.05], [24, 0.18, 244, 0.98], [46, 0.18, 244, 1.02]],
      [[10, 0.18, 208, 1.05]],
      [[27, 0.18, 212, -Math.PI / 2], [-27, 0.18, 212, Math.PI / 2]],
    );
  }

  private populateMavoorRoadChunk(
    group: THREE.Group,
    colliders: StaticAabbCollider[],
    buildings: RegisteredBuildingRecord[],
    teaShops: ChaiPeedikaInstance[],
  ): void {
    this.addSidewalkPad(group, 78, 0, 66, 56);
    this.addSidewalkPad(group, 78, -56, 66, 26);
    addDrainageCurbRun(group, this.mats, 45, 0.02, 0, 52, true);
    addDrainageCurbRun(group, this.mats, 111, 0.02, 0, 52, true);

    const cornerTeaShop = buildKeralaChaiPeedika(
      {
        id: 'chai_peedika_mavoor_corner',
        districtId: 'mavoor_road',
        name: 'Malabar Chai Peedika (Mavoor Corner)',
        malayalamName: 'മലബാർ ചായക്കട · മാവൂർ റോഡ്',
        x: 53,
        z: -49,
        rotY: -0.18,
      },
      this.mats,
    );
    group.add(cornerTeaShop.group);
    colliders.push(cornerTeaShop.collider);
    buildings.push(cornerTeaShop.buildingRecord);
    teaShops.push(cornerTeaShop);

    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_mavoor_city_plaza',
      districtId: 'mavoor_road',
      archetype: 'shopping_complex',
      x: 64,
      z: -12,
      rotY: Math.PI / 2,
      width: 20,
      depth: 12,
      floors: 4,
      facadeStyle: 'office',
      awningColor: 0x0284c7,
      malayalam: 'മാവൂർ റോഡ് മാൾ',
      english: 'Mavoor City Plaza',
      signBg: '#0c4a6e',
      signFg: '#f8fafc',
      hasBalcony: true,
      hasAcUnits: true,
      businessTag: 'mall_complex',
    });
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_mavoor_grand_hotel',
      districtId: 'mavoor_road',
      archetype: 'hotel',
      x: 92,
      z: -12,
      rotY: -Math.PI / 2,
      width: 19,
      depth: 12,
      floors: 3,
      facadeStyle: 'cream',
      awningColor: 0x0f766e,
      malayalam: 'കലിക്കറ്റ് ഗ്രാൻഡ് ഹോട്ടൽ',
      english: 'Malabar Grand Hotel',
      signBg: '#064e3b',
      signFg: '#fde68a',
      hasBalcony: true,
      hasAcUnits: true,
    });
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_mavoor_trade_centre',
      districtId: 'mavoor_road',
      archetype: 'office',
      x: 78,
      z: -56,
      rotY: 0,
      width: 22,
      depth: 12,
      floors: 3,
      facadeStyle: 'warm',
      awningColor: 0xb45309,
      malayalam: 'മാവൂർ ട്രേഡ് ടവർ',
      english: 'Mavoor Trade Centre',
      signBg: '#7c2d12',
      signFg: '#fef3c7',
      hasAcUnits: true,
    });
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_mavoor_supermarket',
      districtId: 'mavoor_road',
      archetype: 'supermarket',
      x: 64,
      z: 16,
      rotY: Math.PI / 2,
      width: 17,
      depth: 11,
      floors: 2,
      facadeStyle: 'teal',
      awningColor: 0x15803d,
      malayalam: 'ഫോക്കസ് ഹൈപ്പർമാർക്കറ്റ്',
      english: 'Malabar Hypermarket',
      signBg: '#14532d',
      signFg: '#fef08a',
    });
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_mavoor_pharmacy',
      districtId: 'mavoor_road',
      archetype: 'pharmacy',
      x: 92,
      z: 16,
      rotY: -Math.PI / 2,
      width: 16,
      depth: 11,
      floors: 2,
      facadeStyle: 'hospital',
      awningColor: 0x0d9488,
      malayalam: 'അപ്പോളോ മെഡിക്കൽസ്',
      english: 'Mavoor 24h Pharmacy',
      signBg: '#0f766e',
      signFg: '#ffffff',
    });

    addTrafficIsland(group, this.mats, 120, -35, 2.8);
    addParkingBay(group, this.mats, 78, 0.18, 22, 0, 5);
    addRoadDirectionSign(group, this.mats, {
      key: 'sign_mavoor_bypass',
      x: 110,
      y: 0.18,
      z: -26,
      rotY: -Math.PI * 0.3,
      routeBadge: 'NH-766',
      destinationsEn: ['-> THONDAYAD / MEDICAL COLLEGE', '<- MANANCHIRA'],
      destinationsMl: 'മാവൂർ റോഡ്',
      bgHex: '#065f46',
    });
    addConstructionSiteProps(group, this.mats, 102, 0.18, -50);

    addStreetPropInstancedBatch(group, this.mats, {
      utilityPoles: [[48, 0.18, -24, 0], [108, 0.18, -24, Math.PI], [108, 0.18, 22, Math.PI]],
      trashBins: [[55, 0.18, -4], [100, 0.18, 4], [78, 0.18, -46]],
      shrubs: [[78, 0.18, 4, 1.15], [78, 0.18, -20, 1.05]],
    });

    const suv = createVehicleModelLOD('tata_nexon', this.mats, { colorHex: 0x0f766e });
    suv.position.set(114.2, 0.02, -14);
    const car = createVehicleModelLOD('maruti_baleno', this.mats, { colorHex: 0x1e3a8a });
    car.position.set(78, 0.18, 22);
    car.rotation.y = Math.PI / 2;
    this.addParkedVehicleWithCollider(group, colliders, suv, 0.92, 2.0, 1.65);
    this.addParkedVehicleWithCollider(group, colliders, car, 0.88, 2.0, 1.55);

    this.addInstancedFoliageAndLamps(
      group,
      [[54, 0.18, -28, 1.0], [104, 0.18, -28, 1.05], [104, 0.18, 24, 0.96], [54, 0.18, 24, 1.02]],
      [[78, 0.18, 10, 1.05]],
      [[112, 0.18, -16, Math.PI / 2], [112, 0.18, 16, Math.PI / 2], [78, 0.18, -28, 0]],
    );
  }

  private populatePalayamChunk(
    group: THREE.Group,
    colliders: StaticAabbCollider[],
    buildings: RegisteredBuildingRecord[],
  ): void {
    this.addSidewalkPad(group, 78, 78, 66, 62);
    addDrainageCurbRun(group, this.mats, 45, 0.02, 78, 56, true);
    addDrainageCurbRun(group, this.mats, 111, 0.02, 78, 56, true);

    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_palayam_market_hall',
      districtId: 'palayam',
      archetype: 'supermarket',
      x: 68,
      z: 64,
      rotY: 0,
      width: 20,
      depth: 12,
      floors: 2,
      facadeStyle: 'warm',
      awningColor: 0x15803d,
      malayalam: 'പാളയം പച്ചക്കറി മാർക്കറ്റ്',
      english: 'Palayam Market Hall',
      signBg: '#14532d',
      signFg: '#fde047',
      hasSlopedRoof: true,
      businessTag: 'market_wholesale',
    });
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_palayam_bus_terminal',
      districtId: 'palayam',
      archetype: 'bus_station',
      x: 96,
      z: 88,
      rotY: -Math.PI / 2,
      width: 20,
      depth: 12,
      floors: 3,
      facadeStyle: 'cream',
      awningColor: 0xb91c1c,
      malayalam: 'പാളയം ബസ് ടെർമിനൽ',
      english: 'Palayam Bus Stand',
      signBg: '#7f1d1d',
      signFg: '#f8fafc',
    });
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_palayam_spice_depot',
      districtId: 'palayam',
      archetype: 'local_shop',
      x: 64,
      z: 92,
      rotY: Math.PI / 2,
      width: 16,
      depth: 11,
      floors: 2,
      facadeStyle: 'teal',
      awningColor: 0xb45309,
      malayalam: 'പാളയം സ്‌പൈസസ്',
      english: 'Palayam Spice Traders',
      signBg: '#78350f',
      signFg: '#fef3c7',
    });

    addBusStopShelter(group, this.mats, {
      key: 'bus_stop_palayam_bay',
      x: 109,
      y: 0.18,
      z: 66,
      rotY: -Math.PI / 2,
      nameMl: 'പാളയം ബസ് ബേ',
      nameEn: 'PALAYAM STAND PLATFORM 1',
    });
    addParkingBay(group, this.mats, 78, 0.18, 102, 0, 4);
    addTrafficIsland(group, this.mats, 120, 120, 2.8);
    addRoadDirectionSign(group, this.mats, {
      key: 'sign_palayam_jct',
      x: 108,
      y: 0.18,
      z: 108,
      rotY: -Math.PI * 0.75,
      routeBadge: 'CITY',
      destinationsEn: ['<- RAILWAY STN / SM ST', '-> MAVOOR RD / KALLAI'],
      destinationsMl: 'പാളയം ജംഗ്ഷൻ',
      bgHex: '#0369a1',
    });

    addStreetPropInstancedBatch(group, this.mats, {
      utilityPoles: [[48, 0.18, 54, 0], [108, 0.18, 54, Math.PI], [108, 0.18, 104, Math.PI]],
      trashBins: [[78, 0.18, 76], [104, 0.18, 72]],
      bollards: [[109, 0.18, 58], [109, 0.18, 74]],
    });

    const bus1 = createVehicleModelLOD('ksrtc_bus', this.mats);
    bus1.position.set(114.2, 0.02, 76);
    const bus2 = createVehicleModelLOD('kerala_private_bus', this.mats, { colorHex: 0x047857 });
    bus2.position.set(114.2, 0.02, 92);
    const truck = createVehicleModelLOD('delivery_van', this.mats, { colorHex: 0x1d4ed8 });
    truck.position.set(78, 0.18, 102);
    truck.rotation.y = Math.PI / 2;
    this.addParkedVehicleWithCollider(group, colliders, bus1, 1.25, 4.6, 3.1);
    this.addParkedVehicleWithCollider(group, colliders, bus2, 1.24, 4.3, 3.05);
    this.addParkedVehicleWithCollider(group, colliders, truck, 0.86, 2.25, 2.25);

    this.addInstancedFoliageAndLamps(
      group,
      [[52, 0.18, 52, 1.0], [108, 0.18, 52, 1.06], [108, 0.18, 106, 0.94]],
      [[82, 0.18, 76, 1.0]],
      [[112, 0.18, 60, Math.PI / 2], [112, 0.18, 102, Math.PI / 2]],
    );
  }

  private populateKozhikodeBeachChunk(
    group: THREE.Group,
    colliders: StaticAabbCollider[],
    buildings: RegisteredBuildingRecord[],
  ): void {
    // Beachfront Promenade Sidewalk + Kozhikode Lighthouse + Rotating Beacon
    this.addSidewalkPad(group, -65, 0, 8, 96);

    const lh = new THREE.Group();
    lh.position.set(-66.5, 0.18, -32);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, 3.0, 12), this.mats.lateriteMat);
    base.position.y = 1.5;
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(1.25, 1.95, 17.5, 14),
      this.mats.stuccoCreamMat,
    );
    tower.position.y = 11.75;
    tower.castShadow = true;
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(1.52, 1.66, 3.2, 14),
      this.mats.medicalCrossRedMat,
    );
    band.position.y = 11.8;
    const lantern = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.05, 1.8, 12),
      this.mats.streetLampBulbMat,
    );
    lantern.position.y = 21.3;
    this.beaconMesh = lantern;
    lh.add(base, tower, band, lantern);
    group.add(lh);
    colliders.push({ minX: -69, maxX: -64, minZ: -35, maxZ: -29 });

    buildings.push({
      id: 'bldg_kozhikode_lighthouse',
      name: 'Kozhikode Lighthouse',
      malayalamName: 'കോഴിക്കോട് ലൈറ്റ് ഹൗസ്',
      districtId: 'kozhikode_beach',
      category: 'infrastructure',
      archetype: 'public_building',
      lat: worldToGeo(-66.5, -32).lat,
      lon: worldToGeo(-66.5, -32).lon,
      worldX: -66.5,
      worldZ: -32,
      rotY: Math.PI / 2,
      collider: { minX: -69, maxX: -64, minZ: -35, maxZ: -29 },
      interactionPoint: { x: -63.0, y: 0.18, z: -32 },
      entryPoint: { x: -63.8, y: 0.18, z: -32 },
      ownershipStatus: 'public',
      interiorEligible: false,
      futureHooks: { missionTag: 'beach_lighthouse' },
    });

    // Beachfront Promenade Food & Tea Stalls (east & promenade edge)
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_beach_sulaimani_chai',
      districtId: 'kozhikode_beach',
      archetype: 'bakery',
      x: -51,
      z: -12,
      rotY: -Math.PI / 2,
      width: 9,
      depth: 6.5,
      floors: 1,
      facadeStyle: 'warm',
      awningColor: 0x0f766e,
      malayalam: 'ബീച്ച് സുലൈമാനി ചായ',
      english: 'Beach Sulaimani Tea',
      signBg: '#064e3b',
      signFg: '#fde68a',
      hasSlopedRoof: true,
    });
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_beach_seafood_shack',
      districtId: 'kozhikode_beach',
      archetype: 'restaurant',
      x: -51,
      z: 14,
      rotY: -Math.PI / 2,
      width: 10,
      depth: 7,
      floors: 1,
      facadeStyle: 'cream',
      awningColor: 0xb45309,
      malayalam: 'കല്ലുമ്മക്കായ & സീഫുഡ്',
      english: 'Arabian Sea Snacks',
      signBg: '#7c2d12',
      signFg: '#fef3c7',
      hasSlopedRoof: true,
    });

    addParkingBay(group, this.mats, -52, 0.18, -36, Math.PI / 2, 4);
    addRoadDirectionSign(group, this.mats, {
      key: 'sign_beach_road',
      x: -54,
      y: 0.18,
      z: 28,
      rotY: Math.PI * 0.25,
      routeBadge: 'COAST',
      destinationsEn: ['<- MANANCHIRA / S.M. ST', '-> SOUTH BEACH / PIER'],
      destinationsMl: 'കോഴിക്കോട് ബീച്ച്',
      bgHex: '#0369a1',
    });

    addStreetPropInstancedBatch(group, this.mats, {
      benches: [
        [-66.5, 0.18, -16, Math.PI / 2],
        [-66.5, 0.18, 4, Math.PI / 2],
        [-66.5, 0.18, 22, Math.PI / 2],
      ],
      bollards: [
        [-68, 0.18, -22], [-68, 0.18, -10], [-68, 0.18, 2], [-68, 0.18, 14], [-68, 0.18, 26],
      ],
      trashBins: [[-66, 0.18, -4], [-66, 0.18, 16]],
      rocks: [[-76, 0, -48, 1.3], [-79, 0, 12, 1.5], [-74, 0, 42, 1.2]],
      utilityPoles: [[-54, 0.18, -28, Math.PI], [-54, 0.18, 2, Math.PI], [-54, 0.18, 34, Math.PI]],
    });

    for (const [bx, bz, rot] of [[-128, -24, 0.25], [-142, 18, -0.15]]) {
      const boat = createFishingBoatLOD();
      boat.position.set(bx, -0.1, bz);
      boat.rotation.y = rot;
      group.add(boat);
      this.floatingBoats.push({ mesh: boat, baseY: -0.1, phase: bz * 0.1 });
    }

    const auto = createAutoRickshawLOD(this.mats);
    auto.position.set(-57.5, 0.02, -6);
    const scoot = createScooterLOD(this.mats, 0x0284c7);
    scoot.position.set(-57.2, 0.02, 12);
    this.addParkedVehicleWithCollider(group, colliders, auto, 0.68, 1.3, 1.72);
    this.addParkedVehicleWithCollider(group, colliders, scoot, 0.36, 0.92, 1.15);

    this.addInstancedFoliageAndLamps(
      group,
      [
        [-74, 0, -45, 1.1], [-74, 0, -18, 1.04], [-74, 0, 8, 1.12], [-74, 0, 34, 1.0],
        [-56, 0.18, -22, 0.98], [-56, 0.18, 22, 1.05],
      ],
      [],
      [[-56, 0.18, -26, Math.PI / 2], [-56, 0.18, 0, Math.PI / 2], [-56, 0.18, 26, Math.PI / 2]],
    );
  }

  private populateSouthBeachChunk(
    group: THREE.Group,
    colliders: StaticAabbCollider[],
    buildings: RegisteredBuildingRecord[],
  ): void {
    // Kozhikode Old Sea Pier extending West into Arabian Sea
    this.addSidewalkPad(group, -52, 108, 16, 72);

    const deck = new THREE.Mesh(new THREE.BoxGeometry(42, 0.35, 5.2), this.mats.teakWoodMat);
    deck.position.set(-88, 1.35, 118);
    deck.castShadow = true;
    deck.receiveShadow = true;
    group.add(deck);

    for (let px = -72; px >= -106; px -= 6.5) {
      for (const pz of [115.8, 120.2]) {
        const piling = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 3.2, 8), this.mats.teakWoodMat);
        piling.position.set(px, 0.4, pz);
        group.add(piling);
      }
    }

    // Coastal Heritage Houses & Pier View Kiosk East of Beach Road
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_south_beach_pier_cafe',
      districtId: 'south_beach',
      archetype: 'local_shop',
      x: -51,
      z: 96,
      rotY: -Math.PI / 2,
      width: 10,
      depth: 7,
      floors: 1,
      facadeStyle: 'warm',
      awningColor: 0x0369a1,
      malayalam: 'സൗത്ത് ബീച്ച് പിയർ കഫേ',
      english: 'Old Pier Kiosk',
      signBg: '#0c4a6e',
      signFg: '#fde68a',
      hasSlopedRoof: true,
    });
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_south_beach_residence',
      districtId: 'south_beach',
      archetype: 'older_house',
      x: -50,
      z: 132,
      rotY: -Math.PI / 2,
      width: 9.5,
      depth: 8,
      floors: 1,
      stuccoTone: 'ochre',
      malayalam: 'സൗത്ത് ബീച്ച് ഹൗസ്',
      english: 'Coastal Timber House',
      withCompoundWall: true,
      hasSlopedRoof: true,
    });

    addStreetPropInstancedBatch(group, this.mats, {
      benches: [[-66.5, 0.18, 108, Math.PI / 2], [-66.5, 0.18, 128, Math.PI / 2]],
      rocks: [[-76, 0, 84, 1.4], [-80, 0, 146, 1.6]],
      utilityPoles: [[-54, 0.18, 80, Math.PI], [-54, 0.18, 142, Math.PI]],
    });

    const boat = createFishingBoatLOD();
    boat.position.set(-125, -0.1, 134);
    boat.rotation.y = 0.4;
    group.add(boat);
    this.floatingBoats.push({ mesh: boat, baseY: -0.1, phase: 2.1 });

    this.addInstancedFoliageAndLamps(
      group,
      [[-74, 0, 72, 1.05], [-74, 0, 96, 1.1], [-74, 0, 144, 0.98], [-55, 0.18, 92, 1.02]],
      [],
      [[-56, 0.18, 86, Math.PI / 2], [-56, 0.18, 138, Math.PI / 2]],
    );
  }

  private addProtagonistHomeCompound(
    group: THREE.Group,
    colliders: StaticAabbCollider[],
    buildings: RegisteredBuildingRecord[],
    x: number,
    z: number,
  ): void {
    const compound = new THREE.Group();
    compound.position.set(x, 0.18, z);

    const brassMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.3, metalness: 0.8 });

    // Compound plinth & front driveway paving
    const yardPad = new THREE.Mesh(new THREE.BoxGeometry(20.6, 0.12, 22.0), this.mats.sidewalkMat);
    yardPad.position.set(0, -0.04, 1.5);
    yardPad.receiveShadow = true;
    compound.add(yardPad);

    for (const lx of [-5.8, 5.8]) {
      const lawn = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.06, 6.2), this.mats.grassMat);
      lawn.position.set(lx, 0.04, 8.2);
      lawn.receiveShadow = true;
      compound.add(lawn);
    }

    // Perimeter Laterite & Plastered Compound Wall (open 5.4m front gate at z = +12.2 -> world z = -133.8)
    const frontLeftWall = new THREE.Mesh(new THREE.BoxGeometry(7.2, 1.55, 0.42), this.mats.lateriteMat);
    frontLeftWall.position.set(-6.4, 0.78, 12.2);
    frontLeftWall.castShadow = true;
    const frontRightWall = frontLeftWall.clone();
    frontRightWall.position.x = 6.4;

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(20.4, 1.65, 0.42), this.mats.lateriteMat);
    backWall.position.set(0, 0.82, -9.2);
    backWall.castShadow = true;

    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.6, 21.8), this.mats.lateriteMat);
    leftWall.position.set(-10.0, 0.8, 1.5);
    leftWall.castShadow = true;
    const rightWall = leftWall.clone();
    rightWall.position.x = 10.0;
    compound.add(frontLeftWall, frontRightWall, backWall, leftWall, rightWall);

    // Gate Pillars + Lanterns + Open Wrought-Iron & Teak Gate Leaves
    for (const gx of [-2.85, 2.85]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.72, 2.35, 0.72), this.mats.stuccoCreamMat);
      pillar.position.set(gx, 1.18, 12.2);
      pillar.castShadow = true;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.65, 0.45, 4), this.mats.terracottaRoofMat);
      cap.position.set(gx, 2.55, 12.2);
      cap.rotation.y = Math.PI / 4;
      const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 0.28), this.mats.streetLampBulbMat);
      lantern.position.set(gx, 2.88, 12.2);
      compound.add(pillar, cap, lantern);

      const leaf = new THREE.Mesh(new THREE.BoxGeometry(2.35, 1.45, 0.1), this.mats.darkIronMat);
      leaf.position.set(gx > 0 ? gx - 0.15 : gx + 0.15, 0.88, 10.95);
      leaf.rotation.y = gx > 0 ? Math.PI * 0.45 : -Math.PI * 0.45;
      compound.add(leaf);
    }

    // Prominent Home Gate Nameplate
    const plaque = new THREE.Mesh(
      new THREE.BoxGeometry(2.9, 0.78, 0.14),
      this.mats.getSignMaterial('arjun_tharavadu_gate', 'തറവാട് · ARJUN HOME', "ARJUN'S RESIDENCE · WEST HILL", '#3b1808', '#fde68a'),
    );
    plaque.position.set(4.9, 1.48, 12.48);
    compound.add(plaque);

    // Traditional Thulasi Thara courtyard pedestal on right front lawn
    const tharaBase = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.72, 1.1), this.mats.stuccoCreamMat);
    tharaBase.position.set(5.2, 0.38, 7.6);
    tharaBase.castShadow = true;
    const tharaTop = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.3, 0.75), this.mats.lateriteMat);
    tharaTop.position.set(5.2, 0.88, 7.6);
    const tulsiBush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), this.mats.foliageShrubMat);
    tulsiBush.position.set(5.2, 1.25, 7.6);
    compound.add(tharaBase, tharaTop, tulsiBush);

    // Kerala Banana (Vazha) Plantain cluster on left lawn
    for (const [bx, bz, rot] of [[-6.5, 6.2, 0.4], [-7.4, 7.8, 1.6], [-5.4, 8.6, 2.5]]) {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 2.1, 7), this.mats.foliageShrubMat);
      stem.position.set(bx, 1.05, bz);
      compound.add(stem);
      for (let l = 0; l < 4; l++) {
        const frond = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 1.35), this.mats.foliageShrubMat);
        frond.position.set(bx, 2.05, bz);
        frond.rotation.set(0.28, rot + (l * Math.PI) / 2, 0.1);
        frond.translateZ(0.65);
        compound.add(frond);
      }
    }

    // Main House Plinth & Verandah Steps
    const housePlinth = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.42, 10.6), this.mats.lateriteMat);
    housePlinth.position.set(0, 0.21, -1.6);
    housePlinth.receiveShadow = true;
    housePlinth.castShadow = true;
    const step1 = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.16, 0.7), this.mats.lateriteMat);
    step1.position.set(0, 0.08, 4.15);
    const step2 = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.3, 0.5), this.mats.lateriteMat);
    step2.position.set(0, 0.15, 3.85);
    const doorThreshold = new THREE.Mesh(
      new THREE.PlaneGeometry(2.1, 0.9),
      new THREE.MeshStandardMaterial({ color: 0xd97706, emissive: 0x92400e, emissiveIntensity: 0.45 }),
    );
    doorThreshold.rotation.x = -Math.PI / 2;
    doorThreshold.position.set(0, 0.44, 3.15);
    compound.add(housePlinth, step1, step2, doorThreshold);

    // Main House Body + Carved Teak Double Door + Brass Knobs
    const mainBody = new THREE.Mesh(new THREE.BoxGeometry(10.8, 3.7, 8.2), this.mats.stuccoCreamMat);
    mainBody.position.set(0, 2.25, -2.5);
    mainBody.castShadow = true;
    mainBody.receiveShadow = true;
    compound.add(mainBody);

    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(2.15, 2.65, 0.22), this.mats.teakWoodMat);
    doorFrame.position.set(0, 1.72, 1.62);
    const brassKnobL = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), brassMat);
    brassKnobL.position.set(-0.22, 1.45, 1.75);
    const brassKnobR = brassKnobL.clone();
    brassKnobR.position.x = 0.22;
    compound.add(doorFrame, brassKnobL, brassKnobR);

    for (const sx of [-1.45, 1.45]) {
      const sconce = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.36, 0.22), this.mats.streetLampBulbMat);
      sconce.position.set(sx, 2.35, 1.72);
      compound.add(sconce);
    }

    for (const wx of [-3.6, 3.6]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.45, 0.18), this.mats.shopGlassNightMat);
      win.position.set(wx, 2.1, 1.62);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.14, 0.34), this.mats.teakWoodMat);
      sill.position.set(wx, 1.32, 1.68);
      compound.add(win, sill);
    }

    for (const px of [-4.8, -1.9, 1.9, 4.8]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 3.25, 10), this.mats.stuccoCreamMat);
      col.position.set(px, 2.02, 3.25);
      col.castShadow = true;
      compound.add(col);
    }
    const charupadiL = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.55, 0.65), this.mats.teakWoodMat);
    charupadiL.position.set(-3.35, 0.72, 3.1);
    const charupadiR = charupadiL.clone();
    charupadiR.position.x = 3.35;
    const verandahRoof = new THREE.Mesh(new THREE.BoxGeometry(11.8, 0.28, 3.0), this.mats.terracottaRoofMat);
    verandahRoof.position.set(0, 3.72, 2.45);
    verandahRoof.rotation.x = 0.22;
    verandahRoof.castShadow = true;
    compound.add(charupadiL, charupadiR, verandahRoof);

    // Two-Tier Kerala Mangalore Hipped Roof with Dormer
    const lowerRoof = new THREE.Mesh(new THREE.ConeGeometry(8.6, 2.45, 4), this.mats.terracottaRoofMat);
    lowerRoof.position.set(0, 5.25, -2.5);
    lowerRoof.rotation.y = Math.PI / 4;
    lowerRoof.scale.set(1.22, 1, 0.96);
    lowerRoof.castShadow = true;
    const upperRoof = new THREE.Mesh(new THREE.ConeGeometry(4.4, 1.65, 4), this.mats.terracottaRoofMat);
    upperRoof.position.set(0, 6.75, -2.5);
    upperRoof.rotation.y = Math.PI / 4;
    upperRoof.scale.set(1.15, 1, 0.9);
    upperRoof.castShadow = true;
    const dormer = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 1.8), this.mats.stuccoCreamMat);
    dormer.position.set(0, 5.55, 0.25);
    const dormerRoof = new THREE.Mesh(new THREE.ConeGeometry(1.75, 0.95, 4), this.mats.terracottaRoofMat);
    dormerRoof.position.set(0, 6.45, 0.25);
    dormerRoof.rotation.y = Math.PI / 4;
    compound.add(lowerRoof, upperRoof, dormer, dormerRoof);

    group.add(compound);

    const houseCollider: StaticAabbCollider = {
      minX: x - 5.9,
      maxX: x + 5.9,
      minZ: z - 6.8,
      maxZ: z + 2.0,
      maxY: 7.4,
      kind: 'building',
    };

    // Keep 5.4m front driveway gate completely clear of colliders so Arjun walks smoothly inside yard
    colliders.push(
      houseCollider,
      { minX: x - 10.3, maxX: x - 2.6, minZ: z + 11.7, maxZ: z + 12.6, maxY: 1.55, kind: 'wall' },
      { minX: x + 2.6, maxX: x + 10.3, minZ: z + 11.7, maxZ: z + 12.6, maxY: 1.55, kind: 'wall' },
      { minX: x - 10.4, maxX: x - 9.6, minZ: z - 9.4, maxZ: z + 12.5, maxY: 1.55, kind: 'wall' },
      { minX: x + 9.6, maxX: x + 10.4, minZ: z - 9.4, maxZ: z + 12.5, maxY: 1.55, kind: 'wall' },
      { minX: x - 10.4, maxX: x + 10.4, minZ: z - 9.6, maxZ: z - 8.8, maxY: 1.55, kind: 'wall' },
    );

    buildings.push({
      id: 'bldg_arjun_residence',
      name: "Arjun's Residence (Tharavadu)",
      malayalamName: 'അർജുൻ തറവാട് · വെസ്റ്റ് ഹിൽ',
      districtId: 'protagonist_home',
      category: 'residential',
      archetype: 'kerala_traditional',
      lat: worldToGeo(x, z).lat,
      lon: worldToGeo(x, z).lon,
      worldX: x,
      worldZ: z,
      rotY: 0,
      collider: houseCollider,
      interactionPoint: { x, y: 0.18, z: z + 5.2 },
      entryPoint: { x, y: 0.18, z: z + 3.2 },
      ownershipStatus: 'protagonist_home',
      interiorEligible: true,
      futureHooks: { propertyPurchaseTag: 'starter_home', missionTag: 'prologue_home' },
    });
  }

  private populateProtagonistHomeChunk(
    group: THREE.Group,
    colliders: StaticAabbCollider[],
    buildings: RegisteredBuildingRecord[],
    teaShops: ChaiPeedikaInstance[],
  ): void {
    // West Hill Neighborhood & Protagonist's Family Homestead (z = -180..-60)
    this.addSidewalkPad(group, -10, -142, 62, 38);
    this.addSidewalkPad(group, 14, -92, 42, 32);
    this.addSidewalkPad(group, -14, -105, 14, 12);

    // Flagship West Hill Corner Chai Peedika right across West Hill Rd from Arjun's gate
    const westHillTeaShop = buildKeralaChaiPeedika(
      {
        id: 'chai_peedika_west_hill',
        districtId: 'protagonist_home',
        name: 'West Hill Roadside Chai Peedika',
        malayalamName: 'വെസ്റ്റ് ഹിൽ ചായക്കട · CHAI PEEDIKA',
        x: -14,
        z: -105,
        rotY: Math.PI,
      },
      this.mats,
    );
    group.add(westHillTeaShop.group);
    colliders.push(westHillTeaShop.collider);
    buildings.push(westHillTeaShop.buildingRecord);
    teaShops.push(westHillTeaShop);

    // 1. Distinct Protagonist Homestead Compound at (-14, -146)
    this.addProtagonistHomeCompound(group, colliders, buildings, -14, -146);

    // 2. Varied West Hill Residential Neighbors (Villa, Modern Home, Older House, Small Apartment)
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_westhill_modern_neighbor',
      districtId: 'protagonist_home',
      archetype: 'modern_kerala_home',
      x: 13,
      z: -146,
      rotY: 0,
      width: 10.2,
      depth: 8.6,
      floors: 2,
      stuccoTone: 'mint',
      malayalam: 'ശ്രീനിലയം വില്ല',
      english: 'Sreenilayam Villa',
      withCompoundWall: true,
      hasSlopedRoof: false,
      hasBalcony: true,
    });
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_westhill_older_house',
      districtId: 'protagonist_home',
      archetype: 'older_house',
      x: -48,
      z: -90,
      rotY: Math.PI / 2,
      width: 9.6,
      depth: 8.2,
      floors: 1,
      stuccoTone: 'warm',
      malayalam: 'കൈരളി ഹൗസ്',
      english: 'Kairali Homestead',
      withCompoundWall: true,
      hasSlopedRoof: true,
    });
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_westhill_apartment',
      districtId: 'protagonist_home',
      archetype: 'small_apartment',
      x: 49,
      z: -94,
      rotY: -Math.PI / 2,
      width: 15,
      depth: 10.5,
      floors: 3,
      facadeStyle: 'apartment',
      awningColor: 0x0369a1,
      malayalam: 'വെസ്റ്റ് ഹിൽ റെസിഡൻസി',
      english: 'West Hill Residency',
      signBg: '#0c4a6e',
      signFg: '#f8fafc',
      hasBalcony: true,
      interiorEligible: false,
    });

    // Corner Neighborhood Chaya Kada & Local Provision Store
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_westhill_chaya_kada',
      districtId: 'protagonist_home',
      archetype: 'restaurant',
      x: 8,
      z: -92,
      rotY: Math.PI,
      width: 13,
      depth: 9,
      floors: 2,
      facadeStyle: 'warm',
      awningColor: 0x0f766e,
      malayalam: 'വെസ്റ്റ് ഹിൽ ചായക്കട',
      english: 'West Hill Chaya Kada',
      signBg: '#064e3b',
      signFg: '#fde68a',
      hasSlopedRoof: true,
      businessTag: 'neighborhood_tea_shop',
    });
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_westhill_provisions',
      districtId: 'protagonist_home',
      archetype: 'local_shop',
      x: 24,
      z: -92,
      rotY: Math.PI,
      width: 11,
      depth: 9,
      floors: 2,
      facadeStyle: 'cream',
      awningColor: 0xb45309,
      malayalam: 'കൃഷ്ണ സ്റ്റോഴ്സ്',
      english: 'West Hill Provisions',
      signBg: '#7c2d12',
      signFg: '#fef3c7',
    });

    addRoadDirectionSign(group, this.mats, {
      key: 'sign_westhill_lane',
      x: -26,
      y: 0.18,
      z: -128,
      rotY: 0,
      routeBadge: 'WH-1',
      destinationsEn: ['<- BEACH RD / NADAKKAVU', "-> ARJUN'S RESIDENCE"],
      destinationsMl: 'വെസ്റ്റ് ഹിൽ',
      bgHex: '#0369a1',
    });
    addParkingBay(group, this.mats, 12, 0.18, -129, 0, 3);

    addStreetPropInstancedBatch(group, this.mats, {
      utilityPoles: [[-26, 0.18, -112, 0], [8, 0.18, -112, 0], [42, 0.18, -112, Math.PI]],
      trashBins: [[-2, 0.18, -129], [16, 0.18, -104]],
      shrubs: [[-24, 0.18, -155, 1.1], [24, 0.18, -155, 1.05], [-26, 0.18, -82, 0.95]],
    });

    const homeScooter = createVehicleModelLOD('suzuki_access_125', this.mats, { colorHex: 0x0f766e });
    homeScooter.position.set(-10.8, 0.18, -138.2);
    homeScooter.rotation.y = Math.PI * 0.22;
    const homeMoto = createVehicleModelLOD('royal_enfield', this.mats, { colorHex: 0x18181b });
    homeMoto.position.set(-18.2, 0.18, -137.4);
    homeMoto.rotation.y = -Math.PI * 0.15;
    const neighborAuto = createAutoRickshawLOD(this.mats);
    neighborAuto.position.set(-28.8, 0.02, -118);
    neighborAuto.rotation.y = Math.PI / 2;
    this.addParkedVehicleWithCollider(group, colliders, homeScooter, 0.36, 0.92, 1.15);
    this.addParkedVehicleWithCollider(group, colliders, homeMoto, 0.42, 1.05, 1.2);
    this.addParkedVehicleWithCollider(group, colliders, neighborAuto, 0.68, 1.3, 1.72);

    this.addInstancedFoliageAndLamps(
      group,
      [
        [-25, 0.18, -150, 1.06], [-3, 0.18, -150, 0.98], [24, 0.18, -148, 1.08],
        [-48, 0.18, -138, 1.02], [-28, 0.18, -76, 0.95], [26, 0.18, -76, 1.04],
      ],
      [[-24, 0.18, -132, 0.95], [22, 0.18, -134, 1.0]],
      [[-28, 0.18, -114, 0], [4, 0.18, -114, 0], [-28, 0.18, -76, Math.PI / 2]],
    );
  }

  private populateWestHillCoastalChunk(
    group: THREE.Group,
    colliders: StaticAabbCollider[],
    buildings: RegisteredBuildingRecord[],
  ): void {
    // Vellayil / West Hill Coastal Residential Strip (-180..-60, -180..-60)
    this.addSidewalkPad(group, -51, -132, 16, 82);

    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_vellayil_villa_north',
      districtId: 'protagonist_home',
      archetype: 'residential_villa',
      x: -51,
      z: -148,
      rotY: -Math.PI / 2,
      width: 10.5,
      depth: 8.5,
      floors: 2,
      stuccoTone: 'cream',
      malayalam: 'വെള്ളയിൽ സീവ്യൂ വില്ല',
      english: 'Vellayil Sea View',
      withCompoundWall: true,
      hasSlopedRoof: true,
    });
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_vellayil_fish_cafe',
      districtId: 'protagonist_home',
      archetype: 'local_shop',
      x: -51,
      z: -102,
      rotY: -Math.PI / 2,
      width: 11,
      depth: 8,
      floors: 1,
      facadeStyle: 'teal',
      awningColor: 0x0284c7,
      malayalam: 'വെള്ളയിൽ ഹാർബർ സ്റ്റോർ',
      english: 'Vellayil Harbour Mart',
      signBg: '#0c4a6e',
      signFg: '#f8fafc',
      hasSlopedRoof: true,
    });

    addStreetPropInstancedBatch(group, this.mats, {
      benches: [[-66.5, 0.18, -124, Math.PI / 2], [-66.5, 0.18, -96, Math.PI / 2]],
      rocks: [[-76, 0, -142, 1.4], [-78, 0, -88, 1.2]],
      utilityPoles: [[-55, 0.18, -160, Math.PI], [-55, 0.18, -86, Math.PI]],
    });

    const boat = createFishingBoatLOD();
    boat.position.set(-124, -0.1, -118);
    boat.rotation.y = 0.18;
    group.add(boat);
    this.floatingBoats.push({ mesh: boat, baseY: -0.1, phase: 1.4 });

    this.addInstancedFoliageAndLamps(
      group,
      [[-74, 0, -155, 1.08], [-74, 0, -110, 1.02], [-74, 0, -76, 1.06], [-56, 0.18, -126, 0.98]],
      [],
      [[-56, 0.18, -132, Math.PI / 2], [-56, 0.18, -92, Math.PI / 2]],
    );
  }

  private populateNadakkavuChunk(
    group: THREE.Group,
    colliders: StaticAabbCollider[],
    buildings: RegisteredBuildingRecord[],
  ): void {
    // Priority Area #9: Nadakkavu Urban Commercial & Residential Corridor (z = -300..-180)
    this.addSidewalkPad(group, 0, -214, 52, 34);
    this.addSidewalkPad(group, 52, -214, 24, 38);
    this.addSidewalkPad(group, 0, -256, 52, 32);
    addDrainageCurbRun(group, this.mats, 27.6, 0.02, -225, 62, true);
    addDrainageCurbRun(group, this.mats, 40.6, 0.02, -225, 62, true);

    // Mixed-use apartments, Supermarket, Bakery, School, Residential Villa, Office
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_nadakkavu_supermarket',
      districtId: 'nadakkavu',
      archetype: 'supermarket',
      x: 16,
      z: -208,
      rotY: 0,
      width: 18,
      depth: 11,
      floors: 2,
      facadeStyle: 'teal',
      awningColor: 0x0f766e,
      malayalam: 'നടക്കാവ് സൂപ്പർമാർക്കറ്റ്',
      english: 'Nadakkavu Fresh Mart',
      signBg: '#064e3b',
      signFg: '#fde68a',
    });
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_nadakkavu_bakery',
      districtId: 'nadakkavu',
      archetype: 'bakery',
      x: -14,
      z: -208,
      rotY: 0,
      width: 14,
      depth: 10,
      floors: 2,
      facadeStyle: 'warm',
      awningColor: 0xb45309,
      malayalam: 'കണ്ണൂർ റോഡ് ബേക്കേഴ്സ്',
      english: 'Nadakkavu Bake House',
      signBg: '#7c2d12',
      signFg: '#fef3c7',
      hasSlopedRoof: true,
    });
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_nadakkavu_mixed_residency',
      districtId: 'nadakkavu',
      archetype: 'mixed_residential',
      x: 52,
      z: -214,
      rotY: -Math.PI / 2,
      width: 19,
      depth: 12,
      floors: 4,
      facadeStyle: 'apartment',
      awningColor: 0x1d4ed8,
      malayalam: 'നടക്കാവ് സ്ക്വയർ',
      english: 'Nadakkavu Residency',
      signBg: '#1e3a8a',
      signFg: '#f8fafc',
      hasBalcony: true,
      hasAcUnits: true,
    });
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_nadakkavu_school',
      districtId: 'nadakkavu',
      archetype: 'school',
      x: -10,
      z: -252,
      rotY: 0,
      width: 24,
      depth: 12,
      floors: 2,
      facadeStyle: 'cream',
      awningColor: 0x991b1b,
      malayalam: 'നടക്കാവ് ഗവ. ഹയർ സെക്കൻഡറി സ്കൂൾ',
      english: 'Nadakkavu High School',
      signBg: '#450a0a',
      signFg: '#fde68a',
      hasSlopedRoof: true,
      interiorEligible: false,
    });
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_nadakkavu_villa',
      districtId: 'nadakkavu',
      archetype: 'residential_villa',
      x: 18,
      z: -252,
      rotY: 0,
      width: 10.5,
      depth: 8.5,
      floors: 2,
      stuccoTone: 'warm',
      malayalam: 'മലബാർ ഓർക്കിഡ് വില്ല',
      english: 'Kannur Rd Villa',
      withCompoundWall: true,
      hasSlopedRoof: true,
    });

    addBusStopShelter(group, this.mats, {
      key: 'bus_stop_nadakkavu',
      x: 27,
      y: 0.18,
      z: -206,
      rotY: -Math.PI / 2,
      nameMl: 'നടക്കാവ് ക്രോസ് ബസ് സ്റ്റോപ്പ്',
      nameEn: 'NADAKKAVU CROSS BUS STOP',
    });
    addTrafficIsland(group, this.mats, 34, -188, 2.5);
    addParkingBay(group, this.mats, 4, 0.18, -225, 0, 4);
    addRoadDirectionSign(group, this.mats, {
      key: 'sign_nadakkavu_cross',
      x: 26,
      y: 0.18,
      z: -196,
      rotY: -Math.PI * 0.25,
      routeBadge: 'KNR',
      destinationsEn: ['<- WEST HILL / ELATHUR', '-> MANANCHIRA 1.8 KM'],
      destinationsMl: 'നടക്കാവ് ക്രോസ്',
      bgHex: '#065f46',
    });
    addConstructionSiteProps(group, this.mats, -24, 0.18, -226);

    addStreetPropInstancedBatch(group, this.mats, {
      utilityPoles: [[26, 0.18, -238, 0], [42, 0.18, -238, Math.PI], [-26, 0.18, -206, 0]],
      trashBins: [[6, 0.18, -200], [25, 0.18, -214]],
      shrubs: [[-22, 0.18, -238, 1.05], [22, 0.18, -238, 1.0]],
    });

    const car = createVehicleModelLOD('maruti_wagonr', this.mats, { colorHex: 0x0284c7 });
    car.position.set(4, 0.18, -225);
    const bus = createVehicleModelLOD('ksrtc_bus', this.mats);
    bus.position.set(28.8, 0.02, -202);
    bus.rotation.y = Math.PI;
    const motoNad = createVehicleModelLOD('hero_commuter', this.mats, { colorHex: 0x111827 });
    motoNad.position.set(22, 0.18, -200);
    motoNad.rotation.y = Math.PI * 0.4;
    this.addParkedVehicleWithCollider(group, colliders, car, 0.82, 1.84, 1.68);
    this.addParkedVehicleWithCollider(group, colliders, bus, 1.25, 4.6, 3.1);
    this.addParkedVehicleWithCollider(group, colliders, motoNad, 0.38, 1.0, 1.15);

    this.addInstancedFoliageAndLamps(
      group,
      [[-26, 0.18, -198, 1.02], [26, 0.18, -244, 1.08], [46, 0.18, -242, 0.96]],
      [[-22, 0.18, -242, 1.1], [2, 0.18, -238, 1.05]],
      [[27.5, 0.18, -228, -Math.PI / 2], [27.5, 0.18, -198, -Math.PI / 2], [-27.5, 0.18, -218, Math.PI / 2]],
    );
  }

  private populateMedicalCollegeCampus(
    group: THREE.Group,
    colliders: StaticAabbCollider[],
    buildings: RegisteredBuildingRecord[],
    px: number,
    py: number,
    pz: number,
  ): void {
    // Priority Area #10: Govt. Medical College Institutional & Hospital Campus
    this.addSidewalkPad(group, px + 6, pz - 10, 68, 56, py + 0.06);

    const hosp = buildMedicalCollegeHospital(px + 6, py, pz - 20, 0, this.mats);
    group.add(hosp.lod);
    colliders.push(hosp.record.collider);
    buildings.push(hosp.record);

    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_medcollege_pharmacy_row',
      districtId: 'medical_college',
      archetype: 'pharmacy',
      x: px - 18,
      y: py,
      z: pz + 12,
      rotY: Math.PI / 2,
      width: 15,
      depth: 10,
      floors: 2,
      facadeStyle: 'hospital',
      awningColor: 0x0d9488,
      malayalam: 'മെഡിക്കൽ കോളേജ് ഫാർമസി',
      english: 'Medical College Pharmacy',
      signBg: '#064e3b',
      signFg: '#ffffff',
    });
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_medcollege_canteen',
      districtId: 'medical_college',
      archetype: 'restaurant',
      x: px + 26,
      y: py,
      z: pz + 12,
      rotY: -Math.PI / 2,
      width: 14,
      depth: 10,
      floors: 2,
      facadeStyle: 'warm',
      awningColor: 0xb45309,
      malayalam: 'ക്യാമ്പസ് കഫറ്റീരിയ',
      english: 'Campus Tea & Meals',
      signBg: '#7c2d12',
      signFg: '#fde68a',
      hasSlopedRoof: true,
    });
    this.placeBuilding(group, colliders, buildings, {
      id: 'bldg_medcollege_bus_terminal',
      districtId: 'medical_college',
      archetype: 'bus_station',
      x: px + 6,
      y: py,
      z: pz + 24,
      rotY: Math.PI,
      width: 18,
      depth: 10,
      floors: 1,
      facadeStyle: 'cream',
      awningColor: 0x1d4ed8,
      malayalam: 'മെഡിക്കൽ കോളേജ് ബസ് സ്റ്റാൻഡ്',
      english: 'Medical College Terminal',
      signBg: '#1e3a8a',
      signFg: '#f8fafc',
    });

    addParkingBay(group, this.mats, px + 6, py, pz + 6, 0, 5);
    addTrafficIsland(group, this.mats, px - 12, pz + 22, 2.4);
    addRoadDirectionSign(group, this.mats, {
      key: 'sign_medical_college',
      x: px - 22,
      y: py,
      z: pz - 4,
      rotY: Math.PI * 0.25,
      routeBadge: 'NH-766',
      destinationsEn: ['<- THONDAYAD / MAVOOR', '-> KUNNAMANGALAM'],
      destinationsMl: 'മെഡിക്കൽ കോളേജ്',
      bgHex: '#065f46',
    });

    addStreetPropInstancedBatch(group, this.mats, {
      utilityPoles: [[px - 26, py, pz - 8, 0], [px + 34, py, pz - 8, Math.PI]],
      trashBins: [[px + 6, py, pz - 2], [px - 10, py, pz + 14]],
      benches: [[px - 4, py, pz - 3, 0], [px + 16, py, pz - 3, 0]],
      shrubs: [[px - 14, py, pz - 16, 1.2], [px + 26, py, pz - 16, 1.2]],
    });

    const bus = createCityBusLOD(this.mats);
    bus.position.set(px + 20, py + 0.02, pz + 24);
    const suv = createCarLOD(this.mats, 0xf8fafc, true);
    suv.position.set(px + 6, py + 0.02, pz - 6);
    this.addParkedVehicleWithCollider(group, colliders, bus, 1.25, 4.6, 3.1);
    this.addParkedVehicleWithCollider(group, colliders, suv, 0.92, 2.15, 1.7);

    this.addInstancedFoliageAndLamps(
      group,
      [[px - 24, py, pz + 22, 1.05], [px + 34, py, pz + 22, 1.08]],
      [[px - 20, py, pz - 28, 1.25], [px + 32, py, pz - 28, 1.25]],
      [[px - 14, py, pz + 4, 0], [px + 24, py, pz + 4, Math.PI]],
    );
  }

  private populateOuterDistrictChunk(
    cx: number,
    cz: number,
    group: THREE.Group,
    colliders: StaticAabbCollider[],
    buildings: RegisteredBuildingRecord[],
  ): void {
    const key = `${cx},${cz}`;
    const centerX = cx * CHUNK_SIZE_METERS;
    const centerZ = cz * CHUNK_SIZE_METERS;
    const biome = getBiomeAtWorld(centerX, centerZ);
    const coastX = getCoastlineXAtZ(centerZ);
    const baseY = getHighlandElevationAt(centerX, centerZ);

    // 1. Biome-tuned District Chunk Terrain Surface (continuous across all 75km x 55km)
    const inDowntownBase = centerX >= -140 && centerX <= 460 && centerZ >= -340 && centerZ <= 360;
    if (!inDowntownBase) {
      const chunkMinX = centerX - CHUNK_SIZE_METERS * 0.5;
      const chunkMaxX = centerX + CHUNK_SIZE_METERS * 0.5;

      if (chunkMaxX <= coastX - 24) {
        const seaPatch = new THREE.Mesh(
          new THREE.PlaneGeometry(CHUNK_SIZE_METERS, CHUNK_SIZE_METERS),
          this.mats.seaWaterMat,
        );
        seaPatch.rotation.x = -Math.PI / 2;
        seaPatch.position.set(centerX, -0.18, centerZ);
        group.add(seaPatch);
      } else if (chunkMinX < coastX + 26) {
        const seaPatch = new THREE.Mesh(
          new THREE.PlaneGeometry(CHUNK_SIZE_METERS, CHUNK_SIZE_METERS),
          this.mats.seaWaterMat,
        );
        seaPatch.rotation.x = -Math.PI / 2;
        seaPatch.position.set(coastX - 60, -0.16, centerZ);

        const sandStrip = new THREE.Mesh(
          new THREE.PlaneGeometry(48, CHUNK_SIZE_METERS),
          this.mats.sandMat,
        );
        sandStrip.rotation.x = -Math.PI / 2;
        sandStrip.position.set(coastX - 18, 0.0, centerZ);
        sandStrip.receiveShadow = true;

        const landEast = new THREE.Mesh(
          new THREE.PlaneGeometry(CHUNK_SIZE_METERS, CHUNK_SIZE_METERS),
          this.mats.grassMat,
        );
        landEast.rotation.x = -Math.PI / 2;
        landEast.position.set(coastX + 60, -0.02, centerZ);
        landEast.receiveShadow = true;

        group.add(seaPatch, sandStrip, landEast);
      } else {
        const terrainMat =
          biome === 'highland'
            ? this.sharedTerrainMats.highlandGroundMat
            : biome === 'midland'
              ? this.sharedTerrainMats.midlandGroundMat
              : biome === 'coastal'
                ? this.sharedTerrainMats.coastalGroundMat
                : this.sharedTerrainMats.landPlainMat;
        const pad = new THREE.Mesh(
          new THREE.PlaneGeometry(CHUNK_SIZE_METERS + 1, CHUNK_SIZE_METERS + 1),
          terrainMat,
        );
        pad.rotation.x = -Math.PI / 2;
        pad.position.set(centerX, baseY - 0.02, centerZ);
        pad.receiveShadow = true;
        group.add(pad);
      }
    }

    // 2. Render River Segments
    const riverSegs = KOZHIKODE_SPATIAL_BUCKETS.riverBuckets.get(key) ?? [];
    for (const rSeg of riverSegs) {
      const len = Math.hypot(rSeg.bx - rSeg.ax, rSeg.bz - rSeg.az);
      if (len < 1) continue;
      const midX = (rSeg.ax + rSeg.bx) * 0.5;
      const midZ = (rSeg.az + rSeg.bz) * 0.5;
      const angle = Math.atan2(rSeg.bx - rSeg.ax, rSeg.bz - rSeg.az);
      const riverMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(rSeg.widthWorld, len + 12),
        this.mats.tankWaterMat,
      );
      riverMesh.rotation.x = -Math.PI / 2;
      riverMesh.rotation.z = -angle;
      riverMesh.position.set(midX, Math.max(0.01, baseY - 0.01), midZ);
      group.add(riverMesh);
    }

    // 3. Render Connected GeoJSON Highway & District Road Segments
    const roadSegs = KOZHIKODE_SPATIAL_BUCKETS.roadBuckets.get(key) ?? [];
    const seenEdges = new Set<string>();
    for (const seg of roadSegs) {
      if (seenEdges.has(seg.edgeId)) continue;
      seenEdges.add(seg.edgeId);

      const fullLen = Math.hypot(seg.bx - seg.ax, seg.bz - seg.az);
      if (fullLen < 1) continue;
      const midX = (seg.ax + seg.bx) * 0.5;
      const midZ = (seg.az + seg.bz) * 0.5;
      const yaw = Math.atan2(seg.bx - seg.ax, seg.bz - seg.az);
      const roadY = getGroundHeightAt(midX, midZ);

      const segChunks = Math.max(1, Math.ceil(fullLen / CHUNK_SIZE_METERS));
      let drewAnySub = false;
      for (let s = 0; s < segChunks; s++) {
        const t0 = s / segChunks;
        const t1 = (s + 1) / segChunks;
        const sx = seg.ax + (seg.bx - seg.ax) * ((t0 + t1) * 0.5);
        const sz = seg.az + (seg.bz - seg.az) * ((t0 + t1) * 0.5);
        const sc = worldToChunkCoords(sx, sz);
        if (sc.cx !== cx || sc.cz !== cz) continue;

        const subLen = fullLen / segChunks + 4;
        const sy = getGroundHeightAt(sx, sz);
        const roadMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(seg.widthWorld, subLen),
          this.mats.asphaltMat,
        );
        roadMesh.rotation.x = -Math.PI / 2;
        roadMesh.rotation.z = -yaw;
        roadMesh.position.set(sx, sy + 0.03, sz);
        roadMesh.receiveShadow = true;
        group.add(roadMesh);

        const stripe = new THREE.Mesh(
          new THREE.PlaneGeometry(0.28, subLen * 0.85),
          this.mats.stripeMat,
        );
        stripe.rotation.x = -Math.PI / 2;
        stripe.rotation.z = -yaw;
        stripe.position.set(sx, sy + 0.045, sz);
        group.add(stripe);

        if (seg.isBridge) {
          const parapetOffset = seg.widthWorld * 0.5 + 0.35;
          const perpX = Math.cos(yaw) * parapetOffset;
          const perpZ = -Math.sin(yaw) * parapetOffset;
          for (const side of [-1, 1]) {
            const rail = new THREE.Mesh(
              new THREE.BoxGeometry(0.45, 0.95, Math.min(subLen, 44)),
              this.mats.lateriteMat,
            );
            rail.position.set(sx + perpX * side, sy + 0.5, sz + perpZ * side);
            rail.rotation.y = yaw;
            group.add(rail);
          }
        }
        drewAnySub = true;
      }
      if (!drewAnySub && Math.hypot(midX - centerX, midZ - centerZ) < CHUNK_SIZE_METERS) {
        const roadMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(seg.widthWorld, Math.min(fullLen, CHUNK_SIZE_METERS)),
          this.mats.asphaltMat,
        );
        roadMesh.rotation.x = -Math.PI / 2;
        roadMesh.rotation.z = -yaw;
        roadMesh.position.set(midX, roadY + 0.03, midZ);
        group.add(roadMesh);
      }
    }

    // 4. Populate Verified District Towns, Medical College, Beaches, & Landmarks
    const places = KOZHIKODE_SPATIAL_BUCKETS.placeBuckets.get(key) ?? [];
    for (const place of places) {
      const py = getGroundHeightAt(place.worldX, place.worldZ);

      if (place.id === 'medical_college') {
        this.populateMedicalCollegeCampus(group, colliders, buildings, place.worldX, py, place.worldZ);
        continue;
      }

      this.addSidewalkPad(group, place.worldX + 18, place.worldZ - 14, 34, 26, py + 0.06);
      this.placeBuilding(group, colliders, buildings, {
        id: `bldg_${place.id}_hub`,
        districtId: place.id,
        archetype: place.zoomTier === 1 ? 'shopping_complex' : place.category === 'transit' ? 'bus_station' : 'local_shop',
        x: place.worldX + 18,
        y: py,
        z: place.worldZ - 14,
        rotY: 0,
        width: place.zoomTier === 1 ? 18 : 14,
        depth: 11,
        floors: place.zoomTier === 1 ? 3 : 2,
        facadeStyle: place.biome === 'coastal' ? 'teal' : place.biome === 'highland' ? 'warm' : 'cream',
        awningColor: place.biome === 'highland' ? 0x15803d : 0xb45309,
        malayalam: place.malayalamName,
        english: place.name.toUpperCase(),
        signBg: '#0f172a',
        signFg: '#fde68a',
        hasSlopedRoof: true,
      });

      // Regional municipal / town centers get realistic secondary shops, villas, and bus stops
      if (place.zoomTier <= 2 && place.biome !== 'highland') {
        this.addSidewalkPad(group, place.worldX - 18, place.worldZ - 14, 24, 20, py + 0.06);
        this.placeBuilding(group, colliders, buildings, {
          id: `bldg_${place.id}_bakery`,
          districtId: place.id,
          archetype: 'bakery',
          x: place.worldX - 18,
          y: py,
          z: place.worldZ - 14,
          rotY: 0,
          width: 13,
          depth: 9.5,
          floors: 2,
          facadeStyle: 'warm',
          awningColor: 0x0f766e,
          malayalam: `${place.malayalamName} ബേക്കറി`,
          english: `${place.name.split(' ')[0]} Bakers`,
          signBg: '#064e3b',
          signFg: '#fef3c7',
          hasSlopedRoof: true,
        });
        this.placeBuilding(group, colliders, buildings, {
          id: `bldg_${place.id}_villa`,
          districtId: place.id,
          archetype: 'kerala_traditional',
          x: place.worldX + 20,
          y: py,
          z: place.worldZ + 18,
          rotY: Math.PI,
          width: 10,
          depth: 8.5,
          floors: 2,
          stuccoTone: 'cream',
          malayalam: `${place.malayalamName} വില്ല`,
          english: `${place.name.split(' ')[0]} Villa`,
          withCompoundWall: true,
          hasSlopedRoof: true,
        });
        addBusStopShelter(group, this.mats, {
          key: `bus_stop_${place.id}`,
          x: place.worldX - 12,
          y: py,
          z: place.worldZ + 16,
          rotY: Math.PI,
          nameMl: `${place.malayalamName} സ്റ്റോപ്പ്`,
          nameEn: `${place.name.split(' ')[0].toUpperCase()} BUS STOP`,
        });
        addRoadDirectionSign(group, this.mats, {
          key: `road_sign_${place.id}`,
          x: place.worldX + 6,
          y: py,
          z: place.worldZ + 16,
          rotY: 0,
          routeBadge: place.biome === 'coastal' ? 'NH-66' : 'KZD',
          destinationsEn: [`${place.name.toUpperCase()}`, 'KOZHIKODE ->'],
          destinationsMl: place.malayalamName,
          bgHex: '#065f46',
        });
        addStreetPropInstancedBatch(group, this.mats, {
          utilityPoles: [[place.worldX - 6, py, place.worldZ - 20, 0], [place.worldX + 30, py, place.worldZ - 6, Math.PI]],
          trashBins: [[place.worldX + 10, py, place.worldZ - 6]],
        });
      }

      if (place.category === 'beach' || place.category === 'harbour') {
        const boat = createFishingBoatLOD();
        boat.position.set(coastX - 24, -0.1, place.worldZ);
        boat.rotation.y = 0.2;
        group.add(boat);
        this.floatingBoats.push({ mesh: boat, baseY: -0.1, phase: place.worldZ * 0.05 });
      } else if (place.category === 'waterfall_dam') {
        const damWall = new THREE.Mesh(new THREE.BoxGeometry(36, 9, 4), this.mats.lateriteMat);
        damWall.position.set(place.worldX - 22, py + 4.5, place.worldZ + 18);
        damWall.castShadow = true;
        const waterfall = new THREE.Mesh(new THREE.PlaneGeometry(14, 18), this.sharedTerrainMats.waterfallMat);
        waterfall.position.set(place.worldX - 22, py + 8, place.worldZ + 20.5);
        group.add(damWall, waterfall);
      } else {
        const bus = createCityBusLOD(this.mats);
        bus.position.set(place.worldX - 10, py + 0.02, place.worldZ + 12);
        group.add(bus);
      }
    }

    // 5. Biome-specific Kerala Foliage & Rural Homesteads
    const treeX = Math.max(coastX + 12, centerX + 18);
    const treeZ = centerZ - 14;
    const treeY = getGroundHeightAt(treeX, treeZ);
    if (biome === 'highland') {
      this.addInstancedFoliageAndLamps(
        group,
        [[treeX - 14, treeY, treeZ + 12, 0.9]],
        [
          [treeX - 16, treeY, treeZ - 12, 1.35],
          [treeX + 16, treeY, treeZ + 14, 1.45],
          [treeX + 20, treeY, treeZ - 18, 1.25],
        ],
        [[treeX - 10, treeY, treeZ + 18, 0]],
      );
      addStreetPropInstancedBatch(group, this.mats, {
        rocks: [[treeX - 22, treeY, treeZ + 4, 1.6], [treeX + 24, treeY, treeZ - 8, 1.8]],
        shrubs: [[treeX - 8, treeY, treeZ - 10, 1.4], [treeX + 12, treeY, treeZ + 16, 1.3]],
      });
    } else if (treeX > coastX + 4) {
      if (places.length === 0) {
        this.addSidewalkPad(group, treeX, treeZ, 24, 20, treeY + 0.06);
        this.placeBuilding(group, colliders, buildings, {
          id: `bldg_rural_${cx}_${cz}`,
          districtId: 'kozhikode_rural',
          archetype: (Math.abs(cx + cz) % 2 === 0) ? 'kerala_traditional' : 'older_house',
          x: treeX,
          y: treeY,
          z: treeZ,
          rotY: 0,
          width: 9.8,
          depth: 8.2,
          floors: 1,
          stuccoTone: 'warm',
          malayalam: 'കേരള വീട്',
          english: '',
          withCompoundWall: true,
          hasSlopedRoof: true,
          interiorEligible: false,
        });
      }
      this.addInstancedFoliageAndLamps(
        group,
        [
          [treeX - 15, treeY, treeZ + 12, 1.04],
          [treeX + 15, treeY, treeZ - 12, 0.98],
          [treeX + 22, treeY, treeZ + 20, 1.08],
        ],
        [[treeX - 14, treeY, treeZ - 14, 0.95]],
        [[treeX - 16, treeY, treeZ + 16, 0]],
      );
    }
  }
}
