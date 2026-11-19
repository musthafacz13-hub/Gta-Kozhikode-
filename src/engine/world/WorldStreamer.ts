import * as THREE from 'three';
import type { GraphicsPresetProfile } from '../assets/AssetRegistry.ts';
import type { StaticAabbCollider } from '../player/PlayerController.ts';
import type { MaterialLibrary } from '../rendering/MaterialLibrary.ts';
import { buildPalmGeometries, buildShadeTreeGeometries } from './KeralaPropsAndFoliage.ts';
import {
  getBiomeAtWorld,
  getCoastlineXAtZ,
  getHighlandElevationAt,
} from './GeoProjection.ts';
import { KOZHIKODE_SPATIAL_BUCKETS } from './GeoJsonPipeline.ts';
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
  createScooterLOD,
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
}

interface CommercialBuildingSpec {
  x: number;
  z: number;
  rotY: number;
  width: number;
  depth: number;
  floors: number;
  facade: 'warm' | 'cream' | 'teal';
  awningColor: number;
  malayalam: string;
  english: string;
  signBg: string;
  signFg: string;
  hasSlopedRoof?: boolean;
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

  private activeColliders: StaticAabbCollider[] = [];
  private collidersDirty = true;
  private preset: GraphicsPresetProfile;
  private originOffset = { x: 0, z: 0 };
  private beaconMesh: THREE.Mesh | null = null;
  private destinationBeaconGroup: THREE.Group | null = null;
  private readonly floatingBoats: { mesh: THREE.Object3D; baseY: number; phase: number }[] = [];

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
      const merged: StaticAabbCollider[] = [
        // Continuous Arabian Sea Seawall barrier along downtown coast x = -69
        { minX: -70.5, maxX: -68.0, minZ: -240, maxZ: 260 },
      ];
      for (const chunk of this.loadedChunks.values()) {
        for (let i = 0; i < chunk.colliders.length; i++) {
          merged.push(chunk.colliders[i]);
        }
      }
      this.activeColliders = merged;
      this.collidersDirty = false;
    }
    return this.activeColliders;
  }

  update(dt: number, focusX: number, focusZ: number, camera?: THREE.Camera): boolean {
    const center = worldToChunkCoords(focusX, focusZ);
    const radius = this.preset.streamRadiusChunks;
    const unloadRadius = radius + 1;
    let changed = false;

    // 1. Stream in nearby chunks across the full Kozhikode District bounds
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

    // 2. Unload distant chunks beyond unloadRadius
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

    // 3. Animate lighthouse beacon, destination marker pulse & offshore boats
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

    // 4. Update Three.js LOD levels when camera is supplied
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
  }

  private buildRegionalTerrainAndRoads(): void {
    // Extended Kozhikode coastal plain (land + sand + Arabian Sea)
    const landGeo = new THREE.PlaneGeometry(580, 680);
    landGeo.rotateX(-Math.PI / 2);
    const landMat = new THREE.MeshStandardMaterial({
      color: 0x3a342c,
      roughness: 0.94,
      metalness: 0.02,
    });
    const land = new THREE.Mesh(landGeo, landMat);
    land.position.set(170, -0.02, 20);
    land.receiveShadow = true;
    this.baseGroup.add(land);

    // Coastal Beach Sand Strip (-108..-68)
    const sandGeo = new THREE.PlaneGeometry(42, 680);
    sandGeo.rotateX(-Math.PI / 2);
    const sand = new THREE.Mesh(sandGeo, this.mats.sandMat);
    sand.position.set(-88, 0.0, 20);
    sand.receiveShadow = true;
    this.baseGroup.add(sand);

    // Arabian Sea Plane with wave swell shader extension
    const seaGeo = new THREE.PlaneGeometry(260, 720, 24, 42);
    seaGeo.rotateX(-Math.PI / 2);
    const sea = new THREE.Mesh(seaGeo, this.mats.seaWaterMat);
    sea.position.set(-228, -0.18, 20);
    this.baseGroup.add(sea);

    // Continuous Seawall Promenade Barrier (-69)
    const seawall = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 500), this.mats.lateriteMat);
    seawall.position.set(-69, 0.55, 10);
    seawall.castShadow = true;
    seawall.receiveShadow = true;
    this.baseGroup.add(seawall);

    // Continuous Connected Kozhikode Road Network
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

    // Intersection patches (Y = 0.035 to eliminate Z-fighting)
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

    // Key Zebra Crosswalks around Mananchira & Palayam
    const crosswalks: [number, number, boolean][] = [
      [-34, -27, false], [34, -27, false], [-34, 27, false], [34, 27, false],
      [-25, 35, true], [25, 35, true], [34, 110, false], [120, -25, false],
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
    // Distant Malabar Laterite & Western Ghats Forested Hills (Thondayad -> Thamarassery Churam -> Kakkayam)
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x264427, roughness: 0.95 });
    const ghatMat = new THREE.MeshStandardMaterial({ color: 0x1a3320, roughness: 0.96 });
    const hillSpecs: [number, number, number, number, boolean][] = [
      [330, -140, 85, 34, false],
      [380, -30, 95, 42, false],
      [350, 120, 80, 30, false],
      [270, -280, 90, 36, false],
      [2550, -2680, 420, 180, true], // Thamarassery Churam Wayanad escarpment
      [2950, -2380, 380, 165, true], // Thusharagiri / Vellarimala ridge
      [1650, -3350, 360, 145, true], // Kakkayam highland plateau
    ];
    for (const [hx, hz, rad, h, isGhat] of hillSpecs) {
      const hill = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 8), isGhat ? ghatMat : hillMat);
      hill.position.set(hx, h * 0.45, hz);
      hill.scale.set(1.3, 1, 1.8);
      this.horizonGroup.add(hill);
    }

    // Distant Beypore Harbour Port Cranes & Breakwater Silhouette (South-West Horizon)
    const craneMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.65, metalness: 0.4 });
    const harbourPier = new THREE.Mesh(
      new THREE.BoxGeometry(75, 2.2, 16),
      this.mats.lateriteMat,
    );
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

    // Distant Feroke / Kallai River Crossing Arches (South-East Horizon)
    const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.7, metalness: 0.35 });
    for (const bz of [285, 305]) {
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(12, 0.85, 6, 12, Math.PI),
        bridgeMat,
      );
      arch.position.set(120, 1.2, bz);
      arch.rotation.y = Math.PI / 2;
      this.horizonGroup.add(arch);
    }
  }

  private buildChunk(cx: number, cz: number): LoadedChunk {
    const group = new THREE.Group();
    const colliders: StaticAabbCollider[] = [];
    const key = `${cx},${cz}`;

    if (cx === 0 && cz === 0) {
      this.populateMananchiraCoreChunk(group, colliders);
    } else if (cx === 0 && cz === 1) {
      this.populateSmStreetAndStationChunk(group, colliders);
    } else if (cx === 1 && cz === 0) {
      this.populateMavoorRoadChunk(group, colliders);
    } else if (cx === 1 && cz === 1) {
      this.populatePalayamChunk(group, colliders);
    } else if (cx === -1 && cz === 0) {
      this.populateKozhikodeBeachChunk(group, colliders);
    } else if (cx === -1 && cz === 1) {
      this.populateSouthBeachChunk(group, colliders);
    } else if (cx === 0 && cz === -1) {
      this.populateProtagonistHomeChunk(group, colliders);
    } else {
      this.populateOuterDistrictChunk(cx, cz, group, colliders);
    }

    return { key, cx, cz, group, colliders };
  }

  private addSidewalkPad(group: THREE.Group, x: number, z: number, w: number, d: number): void {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, d), this.mats.sidewalkMat);
    pad.position.set(x, 0.09, z);
    pad.receiveShadow = true;
    group.add(pad);
  }

  private addCommercialBuilding(
    group: THREE.Group,
    colliders: StaticAabbCollider[],
    spec: CommercialBuildingSpec,
  ): void {
    const building = new THREE.Group();
    building.position.set(spec.x, 0.18, spec.z);
    building.rotation.y = spec.rotY;

    const groundH = 4.2;
    const upperH = Math.max(1, spec.floors - 1) * 3.5;
    const totalH = groundH + upperH;

    const facadeTex =
      spec.facade === 'warm'
        ? this.mats.textures.shopFacadeWarm
        : spec.facade === 'teal'
          ? this.mats.textures.shopFacadeTeal
          : this.mats.textures.shopFacadeCream;

    const upperMat = new THREE.MeshStandardMaterial({ map: facadeTex, roughness: 0.78, metalness: 0.04 });
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.82 });
    const shutterMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.52, metalness: 0.55 });

    const upper = new THREE.Mesh(new THREE.BoxGeometry(spec.width, upperH, spec.depth), upperMat);
    upper.position.y = groundH + upperH / 2;
    upper.castShadow = true;
    upper.receiveShadow = true;
    building.add(upper);

    const core = new THREE.Mesh(new THREE.BoxGeometry(spec.width - 0.6, groundH, spec.depth - 1.6), shutterMat);
    core.position.set(0, groundH / 2, -0.5);
    core.castShadow = true;
    core.receiveShadow = true;
    building.add(core);

    const bayCount = Math.max(2, Math.floor(spec.width / 4.2));
    const baySpacing = (spec.width - 2.2) / bayCount;
    for (let b = 0; b < bayCount; b++) {
      const bx = -spec.width / 2 + 1.1 + baySpacing * (b + 0.5);
      const bay = new THREE.Mesh(
        new THREE.BoxGeometry(baySpacing * 0.72, 2.5, 0.16),
        b % 2 === 0 ? this.mats.shopGlassNightMat : shutterMat,
      );
      bay.position.set(bx, 1.55, spec.depth / 2 - 1.25);
      building.add(bay);
    }

    const colCount = Math.max(3, Math.floor(spec.width / 4.0) + 1);
    for (let c = 0; c < colCount; c++) {
      const cx = -spec.width / 2 + 0.5 + (c / (colCount - 1)) * (spec.width - 1.0);
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.45, groundH, 0.45), pillarMat);
      col.position.set(cx, groundH / 2, spec.depth / 2 - 0.25);
      col.castShadow = true;
      building.add(col);
    }

    const awningMat = new THREE.MeshStandardMaterial({ color: spec.awningColor, roughness: 0.72, side: THREE.DoubleSide });
    const awning = new THREE.Mesh(new THREE.BoxGeometry(spec.width + 0.2, 0.1, 1.9), awningMat);
    awning.position.set(0, 3.25, spec.depth / 2 + 0.55);
    awning.rotation.x = 0.28;
    awning.castShadow = true;
    building.add(awning);

    const signTex = this.mats.textures.createSignTexture(
      `sign_${spec.english.replace(/\s+/g, '_').toLowerCase()}`,
      spec.malayalam,
      spec.english,
      spec.signBg,
      spec.signFg,
    );
    const signBoard = new THREE.Mesh(
      new THREE.BoxGeometry(Math.min(spec.width * 0.72, 8.2), 1.35, 0.18),
      new THREE.MeshStandardMaterial({
        map: signTex,
        emissive: 0xffffff,
        emissiveMap: signTex,
        emissiveIntensity: 0.35,
        roughness: 0.35,
      }),
    );
    signBoard.position.set(0, groundH + 0.35, spec.depth / 2 + 0.12);
    building.add(signBoard);

    const parapetMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.85 });
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(spec.width + 0.25, 0.55, spec.depth + 0.25), parapetMat);
    parapet.position.y = totalH + 0.25;
    building.add(parapet);

    if (spec.hasSlopedRoof) {
      const roofGeo = new THREE.ConeGeometry(Math.max(spec.width, spec.depth) * 0.74, 2.8, 4);
      roofGeo.rotateY(Math.PI / 4);
      const roof = new THREE.Mesh(roofGeo, this.mats.terracottaRoofMat);
      roof.scale.set(spec.width / Math.max(spec.width, spec.depth), 1, spec.depth / Math.max(spec.width, spec.depth));
      roof.position.y = totalH + 1.65;
      roof.castShadow = true;
      building.add(roof);
    }

    group.add(building);

    // Axis-aligned footprint collider accounting for 90° rotations
    const rotated = Math.abs(Math.sin(spec.rotY)) > 0.7;
    const hw = (rotated ? spec.depth : spec.width) * 0.5;
    const hd = (rotated ? spec.width : spec.depth) * 0.5;
    colliders.push({
      minX: spec.x - hw,
      maxX: spec.x + hw,
      minZ: spec.z - hd,
      maxZ: spec.z + hd,
    });
  }

  private addKeralaResidence(
    group: THREE.Group,
    colliders: StaticAabbCollider[],
    x: number,
    z: number,
    rotY: number,
    wallHex: number,
    withNameplate?: string,
  ): void {
    const house = new THREE.Group();
    house.position.set(x, 0.18, z);
    house.rotation.y = rotY;

    const wallMat = new THREE.MeshStandardMaterial({ color: wallHex, roughness: 0.82 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3317, roughness: 0.68 });

    const wallFrontL = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.45, 0.35), this.mats.lateriteMat);
    wallFrontL.position.set(-4.75, 0.725, 7.5);
    wallFrontL.castShadow = true;
    const wallFrontR = wallFrontL.clone();
    wallFrontR.position.x = 4.75;
    const wallBack = new THREE.Mesh(new THREE.BoxGeometry(15.2, 1.45, 0.35), this.mats.lateriteMat);
    wallBack.position.set(0, 0.725, -7.5);
    const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.45, 15.0), this.mats.lateriteMat);
    wallLeft.position.set(-7.5, 0.725, 0);
    const wallRight = wallLeft.clone();
    wallRight.position.x = 7.5;
    house.add(wallFrontL, wallFrontR, wallBack, wallLeft, wallRight);

    const lower = new THREE.Mesh(new THREE.BoxGeometry(9.6, 3.3, 8.2), wallMat);
    lower.position.set(0, 1.65, -0.5);
    lower.castShadow = true;
    lower.receiveShadow = true;
    house.add(lower);

    const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.25, 2.6), this.mats.terracottaRoofMat);
    porchRoof.position.set(0, 3.1, 4.7);
    porchRoof.rotation.x = 0.2;
    porchRoof.castShadow = true;
    house.add(porchRoof);

    for (const px of [-2.4, 2.4]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 3.0, 10), wallMat);
      pillar.position.set(px, 1.5, 5.6);
      pillar.castShadow = true;
      house.add(pillar);
    }

    const door = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.3, 0.16), woodMat);
    door.position.set(0, 1.15, 3.62);
    house.add(door);

    for (const wx of [-3.1, 3.1]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.3, 0.16), this.mats.shopGlassNightMat);
      win.position.set(wx, 1.85, 3.62);
      house.add(win);
    }

    const mainRoof = new THREE.Mesh(new THREE.ConeGeometry(7.8, 2.7, 4), this.mats.terracottaRoofMat);
    mainRoof.position.set(0, 4.6, -0.5);
    mainRoof.rotation.y = Math.PI / 4;
    mainRoof.scale.set(1.15, 1, 0.98);
    mainRoof.castShadow = true;
    house.add(mainRoof);

    if (withNameplate) {
      const plateTex = this.mats.textures.createSignTexture(
        `house_${withNameplate.replace(/\s+/g, '_').toLowerCase()}`,
        'തറവാട് · ARJUN HOUSE',
        withNameplate,
        '#451a03',
        '#fef3c7',
      );
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.65, 0.14),
        new THREE.MeshStandardMaterial({ map: plateTex }),
      );
      plate.position.set(3.2, 1.35, 7.65);
      house.add(plate);
    }

    group.add(house);
    colliders.push({ minX: x - 5.2, maxX: x + 5.2, minZ: z - 5.0, maxZ: z + 4.4 });
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
      const nuts = new THREE.InstancedMesh(
        this.sharedGeos.palmNuts,
        new THREE.MeshStandardMaterial({ color: 0x654321, roughness: 0.75 }),
        palmCount,
      );
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
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.75 });
      const poles = new THREE.InstancedMesh(this.sharedGeos.lampPole, poleMat, lamps.length);
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

  private populateMananchiraCoreChunk(group: THREE.Group, colliders: StaticAabbCollider[]): void {
    // Central Mananchira Park Platform & Tank
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

    // 4 Corner Heritage Pavilions
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

    // Sidewalks & Buildings
    this.addSidewalkPad(group, 50, 0, 18, 58);
    this.addSidewalkPad(group, -48, 0, 15, 58);
    this.addSidewalkPad(group, 0, -50, 56, 18);

    this.addCommercialBuilding(group, colliders, {
      x: 50, z: -20, rotY: -Math.PI / 2, width: 15, depth: 11, floors: 3,
      facade: 'warm', awningColor: 0xb45309, malayalam: 'മിഠായി തെരുവ് ബേക്കറി',
      english: 'Sweet Street Bakers', signBg: '#7c2d12', signFg: '#fde68a',
    });
    this.addCommercialBuilding(group, colliders, {
      x: 50, z: -1, rotY: -Math.PI / 2, width: 16, depth: 11, floors: 2,
      facade: 'cream', awningColor: 0x0f766e, malayalam: 'മലബാർ ചായ & സ്നാക്സ്',
      english: 'Malabar Tea House', signBg: '#064e3b', signFg: '#f8fafc', hasSlopedRoof: true,
    });
    this.addCommercialBuilding(group, colliders, {
      x: 50, z: 18, rotY: -Math.PI / 2, width: 15, depth: 11, floors: 3,
      facade: 'teal', awningColor: 0x991b1b, malayalam: 'കോഴിക്കോട് ടെക്സ്റ്റൈൽസ്',
      english: 'Calicut Silks', signBg: '#450a0a', signFg: '#fbbf24',
    });
    this.addCommercialBuilding(group, colliders, {
      x: -16, z: -50, rotY: 0, width: 16, depth: 11, floors: 3,
      facade: 'cream', awningColor: 0x1d4ed8, malayalam: 'സാഗർ ബുക്സ് & സ്റ്റേഷനറി',
      english: 'Sagar Books', signBg: '#1e3a8a', signFg: '#f8fafc',
    });
    this.addCommercialBuilding(group, colliders, {
      x: 6, z: -50, rotY: 0, width: 17, depth: 11, floors: 2,
      facade: 'warm', awningColor: 0x15803d, malayalam: 'റഹ്മത്ത് ഹോട്ടൽ',
      english: 'Malabar Biriyani', signBg: '#14532d', signFg: '#fde047', hasSlopedRoof: true,
    });

    // SM Street Entrance Archway at (1.5, 41.5)
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
    const archTex = this.mats.textures.createSignTexture(
      'sm_street_arch',
      'എസ്.എം. സ്ട്രീറ്റ് · മിഠായി തെരുവ്',
      'S.M. STREET HERITAGE BAZAAR',
      '#7c2d12',
      '#fde68a',
    );
    const archSign = new THREE.Mesh(
      new THREE.BoxGeometry(9.6, 1.05, 1.35),
      new THREE.MeshStandardMaterial({ map: archTex, roughness: 0.4 }),
    );
    archSign.position.set(0, 5.5, 0);
    arch.add(pL, pR, beam, archSign);
    group.add(arch);

    // West Residential Pocket
    this.addKeralaResidence(group, colliders, -48, -18, Math.PI / 2, 0xf3e8d6);
    this.addKeralaResidence(group, colliders, -48, 16, Math.PI / 2, 0xe7ece6);

    // Mananchira Bus Stop Shelter
    const busStop = new THREE.Group();
    busStop.position.set(27.2, 0.18, -12);
    busStop.rotation.y = -Math.PI / 2;
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.8 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.5, 0.12), this.mats.shopGlassNightMat);
    back.position.set(0, 1.35, -0.75);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.14, 2.2), steelMat);
    roof.position.set(0, 2.7, 0.1);
    const busSignTex = this.mats.textures.createSignTexture(
      'bus_stop_mananchira',
      'മാനാഞ്ചിറ ബസ് സ്റ്റോപ്പ്',
      'MANANCHIRA CITY BUS STOP',
      '#0f172a',
      '#fbbf24',
    );
    const busSign = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.52, 0.16), new THREE.MeshStandardMaterial({ map: busSignTex }));
    busSign.position.set(0, 2.98, 0.85);
    busStop.add(back, roof, busSign);
    group.add(busStop);

    // Vehicles & Foliage
    const bus = createCityBusLOD(this.mats);
    bus.position.set(36.2, 0.02, -4);
    bus.rotation.y = Math.PI;
    const auto1 = createAutoRickshawLOD(this.mats);
    auto1.position.set(29.5, 0.02, -23);
    auto1.rotation.y = Math.PI * 0.95;
    const auto2 = createAutoRickshawLOD(this.mats);
    auto2.position.set(-29.2, 0.02, 14);
    const car1 = createCarLOD(this.mats, 0xf8fafc, false);
    car1.position.set(-8, 0.02, -31.2);
    car1.rotation.y = Math.PI / 2;
    group.add(bus, auto1, auto2, car1);

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

  private populateSmStreetAndStationChunk(group: THREE.Group, colliders: StaticAabbCollider[]): void {
    // S.M. Street Bazaar Pads & Arcades (z = 44..110)
    this.addSidewalkPad(group, -16, 80, 28, 66);
    this.addSidewalkPad(group, 18, 80, 22, 66);
    this.addSidewalkPad(group, 10, 158, 70, 58);

    this.addCommercialBuilding(group, colliders, {
      x: -16, z: 54, rotY: 0, width: 16, depth: 11, floors: 2,
      facade: 'warm', awningColor: 0xb91c1c, malayalam: 'ഹൽവ ബസാർ',
      english: 'Kozhikode Halwa Mart', signBg: '#7f1d1d', signFg: '#fef08a', hasSlopedRoof: true,
    });
    this.addCommercialBuilding(group, colliders, {
      x: 18, z: 54, rotY: 0, width: 15, depth: 11, floors: 3,
      facade: 'teal', awningColor: 0x0369a1, malayalam: 'പാരഗൺ ഇലക്ട്രോണിക്സ്',
      english: 'City Mobile & Gear', signBg: '#0c4a6e', signFg: '#f8fafc',
    });
    this.addCommercialBuilding(group, colliders, {
      x: -16, z: 92, rotY: Math.PI / 2, width: 18, depth: 11, floors: 3,
      facade: 'cream', awningColor: 0x0f766e, malayalam: 'കല്ലായി ജ്വല്ലറി',
      english: 'Malabar Gold Mart', signBg: '#064e3b', signFg: '#fde047',
    });
    this.addCommercialBuilding(group, colliders, {
      x: 18, z: 92, rotY: -Math.PI / 2, width: 18, depth: 11, floors: 2,
      facade: 'warm', awningColor: 0xd97706, malayalam: 'മിഠായി തെരുവ് സ്പൈസസ്',
      english: 'Calicut Spices Co', signBg: '#78350f', signFg: '#fef3c7', hasSlopedRoof: true,
    });

    // Kozhikode Railway Station Facade at (10, 162)
    this.addCommercialBuilding(group, colliders, {
      x: 10, z: 162, rotY: Math.PI, width: 32, depth: 14, floors: 2,
      facade: 'cream', awningColor: 0x991b1b, malayalam: 'കോഴിക്കോട് റെയിൽവേ സ്റ്റേഷൻ',
      english: 'KOZHIKODE RAILWAY STATION', signBg: '#7f1d1d', signFg: '#fef08a', hasSlopedRoof: true,
    });

    const van = createDeliveryTruckLOD(this.mats);
    van.position.set(30, 0.02, 74);
    const auto = createAutoRickshawLOD(this.mats);
    auto.position.set(28, 0.02, 142);
    auto.rotation.y = Math.PI * 0.4;
    const suv = createCarLOD(this.mats, 0x334155, true);
    suv.position.set(-28, 0.02, 134);
    group.add(van, auto, suv);

    this.addInstancedFoliageAndLamps(
      group,
      [[-27, 0.18, 66, 0.95], [27, 0.18, 66, 1.02], [-27, 0.18, 136, 1.05], [27, 0.18, 136, 0.95]],
      [[2, 0.18, 138, 1.05]],
      [[27, 0.18, 64, -Math.PI / 2], [27, 0.18, 100, -Math.PI / 2], [-27, 0.18, 136, Math.PI / 2]],
    );
  }

  private populateMavoorRoadChunk(group: THREE.Group, colliders: StaticAabbCollider[]): void {
    this.addSidewalkPad(group, 78, 0, 66, 56);
    this.addSidewalkPad(group, 78, -56, 66, 26);

    this.addCommercialBuilding(group, colliders, {
      x: 64, z: -12, rotY: Math.PI / 2, width: 18, depth: 12, floors: 4,
      facade: 'teal', awningColor: 0x0284c7, malayalam: 'മാവൂർ റോഡ് മാൾ',
      english: 'Mavoor City Plaza', signBg: '#0c4a6e', signFg: '#f8fafc',
    });
    this.addCommercialBuilding(group, colliders, {
      x: 92, z: -12, rotY: -Math.PI / 2, width: 18, depth: 12, floors: 3,
      facade: 'cream', awningColor: 0x0f766e, malayalam: 'കലിക്കറ്റ് ഹോട്ടൽ',
      english: 'Malabar Grand Hotel', signBg: '#064e3b', signFg: '#fde68a',
    });
    this.addCommercialBuilding(group, colliders, {
      x: 78, z: -56, rotY: 0, width: 22, depth: 12, floors: 3,
      facade: 'warm', awningColor: 0xb45309, malayalam: 'മാവൂർ ടവർ',
      english: 'Mavoor Trade Centre', signBg: '#7c2d12', signFg: '#fef3c7',
    });

    const suv = createCarLOD(this.mats, 0x0f172a, true);
    suv.position.set(114, 0.02, -14);
    const car = createCarLOD(this.mats, 0xdc2626, false);
    car.position.set(74, 0.02, -31);
    car.rotation.y = Math.PI / 2;
    group.add(suv, car);

    this.addInstancedFoliageAndLamps(
      group,
      [[54, 0.18, -28, 1.0], [104, 0.18, -28, 1.05], [104, 0.18, 24, 0.96], [54, 0.18, 24, 1.02]],
      [[78, 0.18, 16, 1.05]],
      [[112, 0.18, -16, Math.PI / 2], [112, 0.18, 16, Math.PI / 2], [78, 0.18, -28, 0]],
    );
  }

  private populatePalayamChunk(group: THREE.Group, colliders: StaticAabbCollider[]): void {
    this.addSidewalkPad(group, 78, 78, 66, 62);
    this.addCommercialBuilding(group, colliders, {
      x: 68, z: 66, rotY: 0, width: 18, depth: 12, floors: 2,
      facade: 'warm', awningColor: 0x15803d, malayalam: 'പാളയം പച്ചക്കറി മാർക്കറ്റ്',
      english: 'Palayam Market Hall', signBg: '#14532d', signFg: '#fde047', hasSlopedRoof: true,
    });
    this.addCommercialBuilding(group, colliders, {
      x: 96, z: 88, rotY: -Math.PI / 2, width: 18, depth: 12, floors: 3,
      facade: 'cream', awningColor: 0xb91c1c, malayalam: 'പാളയം ബസ് ടെർമിനൽ',
      english: 'Palayam Bus Stand', signBg: '#7f1d1d', signFg: '#f8fafc',
    });

    const bus1 = createCityBusLOD(this.mats);
    bus1.position.set(114, 0.02, 76);
    const bus2 = createCityBusLOD(this.mats);
    bus2.position.set(114, 0.02, 92);
    const truck = createDeliveryTruckLOD(this.mats);
    truck.position.set(70, 0.02, 114);
    truck.rotation.y = Math.PI / 2;
    group.add(bus1, bus2, truck);

    this.addInstancedFoliageAndLamps(
      group,
      [[52, 0.18, 52, 1.0], [108, 0.18, 52, 1.06], [108, 0.18, 106, 0.94]],
      [],
      [[112, 0.18, 60, Math.PI / 2], [112, 0.18, 102, Math.PI / 2]],
    );
  }

  private populateKozhikodeBeachChunk(group: THREE.Group, colliders: StaticAabbCollider[]): void {
    // Kozhikode Lighthouse + Rotating Beacon
    const lh = new THREE.Group();
    lh.position.set(-66.5, 0.18, -32);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, 3.0, 12), this.mats.lateriteMat);
    base.position.y = 1.5;
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(1.25, 1.95, 17.5, 14),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.65 }),
    );
    tower.position.y = 11.75;
    tower.castShadow = true;
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(1.52, 1.66, 3.2, 14),
      new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.6 }),
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

    // Beachfront Promenade Food & Tea Carts
    const cartMat = new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.55 });
    for (const cz of [-10, 14]) {
      const cart = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.9, 3.4), cartMat);
      cart.position.set(-66.8, 1.1, cz);
      cart.castShadow = true;
      group.add(cart);
    }

    // Offshore Fishing Boats on Arabian Sea
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
    group.add(auto, scoot);

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

  private populateSouthBeachChunk(group: THREE.Group, _colliders: StaticAabbCollider[]): void {
    // Kozhikode Old Sea Pier extending West into Arabian Sea
    const pierWoodMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.85 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(42, 0.35, 5.2), pierWoodMat);
    deck.position.set(-88, 1.35, 118);
    deck.castShadow = true;
    deck.receiveShadow = true;
    group.add(deck);

    for (let px = -72; px >= -106; px -= 6.5) {
      for (const pz of [115.8, 120.2]) {
        const piling = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 3.2, 8), pierWoodMat);
        piling.position.set(px, 0.4, pz);
        group.add(piling);
      }
    }

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
    x: number,
    z: number,
  ): void {
    const compound = new THREE.Group();
    compound.position.set(x, 0.18, z);

    const wallCreamMat = new THREE.MeshStandardMaterial({ color: 0xf7eedc, roughness: 0.78 });
    const teakWoodMat = new THREE.MeshStandardMaterial({ color: 0x5c3317, roughness: 0.62 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.3, metalness: 0.8 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.75 });
    const foliageGreenMat = new THREE.MeshStandardMaterial({ color: 0x2f7a32, roughness: 0.72, side: THREE.DoubleSide });

    // Compound plinth & front driveway paving
    const yardPad = new THREE.Mesh(new THREE.BoxGeometry(20.6, 0.12, 22.0), this.mats.sidewalkMat);
    yardPad.position.set(0, -0.04, 1.5);
    yardPad.receiveShadow = true;
    compound.add(yardPad);

    // Front courtyard lawn flanking driveway
    for (const lx of [-5.8, 5.8]) {
      const lawn = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.06, 6.2), this.mats.grassMat);
      lawn.position.set(lx, 0.04, 8.2);
      lawn.receiveShadow = true;
      compound.add(lawn);
    }

    // Perimeter Laterite & Plastered Compound Wall (open 5.4m front gate at z = +12.2)
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
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.72, 2.35, 0.72), wallCreamMat);
      pillar.position.set(gx, 1.18, 12.2);
      pillar.castShadow = true;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.65, 0.45, 4), this.mats.terracottaRoofMat);
      cap.position.set(gx, 2.55, 12.2);
      cap.rotation.y = Math.PI / 4;
      const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 0.28), this.mats.streetLampBulbMat);
      lantern.position.set(gx, 2.88, 12.2);
      compound.add(pillar, cap, lantern);

      // Open gate leaf angled inward
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(2.35, 1.45, 0.1), ironMat);
      leaf.position.set(gx > 0 ? gx - 0.15 : gx + 0.15, 0.88, 10.95);
      leaf.rotation.y = gx > 0 ? Math.PI * 0.45 : -Math.PI * 0.45;
      compound.add(leaf);
    }

    // Prominent Home Gate Nameplate
    const plaqueTex = this.mats.textures.createSignTexture(
      'arjun_tharavadu_gate',
      'തറവാട് · ARJUN HOME',
      "ARJUN'S RESIDENCE · WEST HILL",
      '#3b1808',
      '#fde68a',
    );
    const plaque = new THREE.Mesh(
      new THREE.BoxGeometry(2.9, 0.78, 0.14),
      new THREE.MeshStandardMaterial({
        map: plaqueTex,
        emissive: 0x3b1808,
        emissiveMap: plaqueTex,
        emissiveIntensity: 0.35,
        roughness: 0.35,
      }),
    );
    plaque.position.set(4.9, 1.48, 12.48);
    compound.add(plaque);

    // Traditional Thulasi Thara courtyard pedestal on right front lawn
    const tharaBase = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.72, 1.1), wallCreamMat);
    tharaBase.position.set(5.2, 0.38, 7.6);
    tharaBase.castShadow = true;
    const tharaTop = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.3, 0.75), this.mats.lateriteMat);
    tharaTop.position.set(5.2, 0.88, 7.6);
    const tulsiBush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), foliageGreenMat);
    tulsiBush.position.set(5.2, 1.25, 7.6);
    compound.add(tharaBase, tharaTop, tulsiBush);

    // Kerala Banana (Vazha) Plantain cluster on left lawn
    for (const [bx, bz, rot] of [[-6.5, 6.2, 0.4], [-7.4, 7.8, 1.6], [-5.4, 8.6, 2.5]]) {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 2.1, 7), foliageGreenMat);
      stem.position.set(bx, 1.05, bz);
      compound.add(stem);
      for (let l = 0; l < 4; l++) {
        const frond = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 1.35), foliageGreenMat);
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

    // Main House Body + Recessed Foyer Vestibule
    const mainBody = new THREE.Mesh(new THREE.BoxGeometry(10.8, 3.7, 8.2), wallCreamMat);
    mainBody.position.set(0, 2.25, -2.5);
    mainBody.castShadow = true;
    mainBody.receiveShadow = true;
    compound.add(mainBody);

    // Carved Teak Double Door & Porch Brass Lanterns
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(2.15, 2.65, 0.22), teakWoodMat);
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

    // Warm Glowing Multi-Pane Windows
    for (const wx of [-3.6, 3.6]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.45, 0.18), this.mats.shopGlassNightMat);
      win.position.set(wx, 2.1, 1.62);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.14, 0.34), teakWoodMat);
      sill.position.set(wx, 1.32, 1.68);
      compound.add(win, sill);
    }

    // Sit-Out Verandah Pillars, Charupadi Bench & Sloped Overhang
    for (const px of [-4.8, -1.9, 1.9, 4.8]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 3.25, 10), wallCreamMat);
      col.position.set(px, 2.02, 3.25);
      col.castShadow = true;
      compound.add(col);
    }
    const charupadiL = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.55, 0.65), teakWoodMat);
    charupadiL.position.set(-3.35, 0.72, 3.1);
    const charupadiR = charupadiL.clone();
    charupadiR.position.x = 3.35;
    const verandahRoof = new THREE.Mesh(new THREE.BoxGeometry(11.8, 0.28, 3.0), this.mats.terracottaRoofMat);
    verandahRoof.position.set(0, 3.72, 2.45);
    verandahRoof.rotation.x = 0.22;
    verandahRoof.castShadow = true;
    compound.add(charupadiL, charupadiR, verandahRoof);

    // Two-Tier Kerala Mangalore Hipped Roof with White Gable Vent
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
    const dormer = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 1.8), wallCreamMat);
    dormer.position.set(0, 5.55, 0.25);
    const dormerRoof = new THREE.Mesh(new THREE.ConeGeometry(1.75, 0.95, 4), this.mats.terracottaRoofMat);
    dormerRoof.position.set(0, 6.45, 0.25);
    dormerRoof.rotation.y = Math.PI / 4;
    compound.add(lowerRoof, upperRoof, dormer, dormerRoof);

    group.add(compound);

    // Colliders: house body + side/back/front walls while keeping 5.4m gate open so player walks inside yard!
    colliders.push(
      { minX: x - 5.9, maxX: x + 5.9, minZ: z - 6.8, maxZ: z + 2.0 }, // Main residence + verandah plinth
      { minX: x - 10.3, maxX: x - 2.6, minZ: z + 11.7, maxZ: z + 12.6 }, // Front left compound wall
      { minX: x + 2.6, maxX: x + 10.3, minZ: z + 11.7, maxZ: z + 12.6 }, // Front right compound wall
      { minX: x - 10.4, maxX: x - 9.6, minZ: z - 9.4, maxZ: z + 12.5 }, // West compound wall
      { minX: x + 9.6, maxX: x + 10.4, minZ: z - 9.4, maxZ: z + 12.5 }, // East compound wall
      { minX: x - 10.4, maxX: x + 10.4, minZ: z - 9.6, maxZ: z - 8.8 }, // North back compound wall
    );
  }

  private populateProtagonistHomeChunk(group: THREE.Group, colliders: StaticAabbCollider[]): void {
    // West Hill Neighborhood & Protagonist's Family Homestead (Story Opening Zone)
    this.addSidewalkPad(group, -12, -142, 48, 36);
    this.addSidewalkPad(group, 14, -92, 40, 28);

    // Bespoke Two-Tier Arjun's Residence Compound at (-14, -146)
    this.addProtagonistHomeCompound(group, colliders, -14, -146);
    // Neighboring Kerala Houses
    this.addKeralaResidence(group, colliders, 12, -146, 0, 0xe7ece6);
    this.addKeralaResidence(group, colliders, -48, -90, Math.PI / 2, 0xf4e4d7);

    // Corner Neighborhood Chaya Kada (Tea Stall)
    this.addCommercialBuilding(group, colliders, {
      x: 10, z: -92, rotY: Math.PI, width: 13, depth: 9, floors: 2,
      facade: 'warm', awningColor: 0x0f766e, malayalam: 'വെസ്റ്റ് ഹിൽ ചായക്കട',
      english: 'West Hill Chaya Kada', signBg: '#064e3b', signFg: '#fde68a', hasSlopedRoof: true,
    });

    // Protagonist's starter scooter parked inside front driveway right of verandah
    const homeScooter = createScooterLOD(this.mats, 0x0f766e);
    homeScooter.position.set(-10.8, 0.18, -138.2);
    homeScooter.rotation.y = Math.PI * 0.22;
    const neighborAuto = createAutoRickshawLOD(this.mats);
    neighborAuto.position.set(-28, 0.02, -118);
    neighborAuto.rotation.y = Math.PI / 2;
    group.add(homeScooter, neighborAuto);

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

  private populateOuterDistrictChunk(
    cx: number,
    cz: number,
    group: THREE.Group,
    colliders: StaticAabbCollider[],
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
        // Pure Arabian Sea offshore chunk
        const seaPatch = new THREE.Mesh(
          new THREE.PlaneGeometry(CHUNK_SIZE_METERS, CHUNK_SIZE_METERS),
          this.mats.seaWaterMat,
        );
        seaPatch.rotation.x = -Math.PI / 2;
        seaPatch.position.set(centerX, -0.18, centerZ);
        group.add(seaPatch);
      } else if (chunkMinX < coastX + 26) {
        // Coastal shoreline transition chunk: sea + beach sand + coastal road margin
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
        const groundColor =
          biome === 'highland'
            ? 0x203a24
            : biome === 'midland'
              ? 0x35472a
              : biome === 'coastal'
                ? 0x454b35
                : 0x3a342c;
        const terrainMat = new THREE.MeshStandardMaterial({
          color: groundColor,
          roughness: 0.94,
          metalness: 0.02,
        });
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

    // 2. Render River Segments (Korapuzha, Kallai, Chaliyar, Kuttiady)
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

      // Clip or render highway ribbon anchored within reasonable segment span
      const fullLen = Math.hypot(seg.bx - seg.ax, seg.bz - seg.az);
      if (fullLen < 1) continue;
      const midX = (seg.ax + seg.bx) * 0.5;
      const midZ = (seg.az + seg.bz) * 0.5;
      const yaw = Math.atan2(seg.bx - seg.ax, seg.bz - seg.az);
      const roadY = getGroundHeightAt(midX, midZ);

      // Avoid double-drawing long edges across dozens of chunks by rendering when chunk is nearest edge segment
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

        // Highway divider stripe
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

    // 4. Populate Verified District Settlements & Regional Landmarks inside this chunk
    const places = KOZHIKODE_SPATIAL_BUCKETS.placeBuckets.get(key) ?? [];
    for (const place of places) {
      const py = getGroundHeightAt(place.worldX, place.worldZ);
      this.addSidewalkPad(group, place.worldX + 18, place.worldZ - 14, 28, 22);
      this.addCommercialBuilding(group, colliders, {
        x: place.worldX + 18,
        z: place.worldZ - 14,
        rotY: 0,
        width: 16,
        depth: 11,
        floors: place.zoomTier === 1 ? 3 : 2,
        facade: place.biome === 'coastal' ? 'teal' : place.biome === 'highland' ? 'warm' : 'cream',
        awningColor: place.biome === 'highland' ? 0x15803d : 0xb45309,
        malayalam: place.malayalamName,
        english: place.name.toUpperCase(),
        signBg: '#0f172a',
        signFg: '#fde68a',
        hasSlopedRoof: true,
      });

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
        const waterfall = new THREE.Mesh(
          new THREE.PlaneGeometry(14, 18),
          new THREE.MeshStandardMaterial({ color: 0xbae6fd, emissive: 0x0284c7, emissiveIntensity: 0.35 }),
        );
        waterfall.position.set(place.worldX - 22, py + 8, place.worldZ + 20.5);
        group.add(damWall, waterfall);
      } else {
        const bus = createCityBusLOD(this.mats);
        bus.position.set(place.worldX - 10, py + 0.02, place.worldZ + 12);
        group.add(bus);
      }
    }

    // 5. Biome-specific Kerala Foliage (Palms along coast/midlands, Forest Canopy in Highlands)
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
    } else if (treeX > coastX + 4) {
      if (places.length === 0) {
        this.addSidewalkPad(group, treeX, treeZ, 24, 20);
        this.addKeralaResidence(group, colliders, treeX, treeZ, 0, 0xede6dc);
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
