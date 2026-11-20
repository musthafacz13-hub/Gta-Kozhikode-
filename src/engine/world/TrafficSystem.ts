import * as THREE from 'three';
import type { VehicleAudioKind } from '../audio/AudioTypes.ts';
import type { GraphicsPresetProfile } from '../assets/AssetRegistry.ts';
import type { StaticAabbCollider } from '../player/PlayerController.ts';
import type { MaterialLibrary } from '../rendering/MaterialLibrary.ts';
import {
  KOZHIKODE_ROAD_CORRIDORS,
  getDistrictAt,
  getGroundHeightAt,
  type RoadCorridorSpec,
} from './KozhikodeGeography.ts';
import {
  VEHICLE_BLUEPRINT_META,
  createVehicleModelLOD,
  type VehicleFleetCategory,
  type VehicleModelId,
} from './VehicleVisualFactory.ts';

export interface TrafficHornEvent {
  vehicleId: string;
  modelId: VehicleModelId;
  audioKind: VehicleAudioKind;
  x: number;
  z: number;
}

export interface TrafficVehiclePhase7Descriptor {
  id: string;
  modelId: VehicleModelId;
  category: VehicleFleetCategory;
  x: number;
  y: number;
  z: number;
  heading: number;
  speedMps: number;
  audioKind: VehicleAudioKind;
  drivableHookEligible: boolean;
}

interface RoadSegment {
  id: string;
  corridorId: string;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  tx: number;
  tz: number;
  length: number;
  roadWidth: number;
  speedFactor: number;
  nextSegments: number[];
}

interface ActiveTrafficVehicle {
  id: string;
  modelId: VehicleModelId;
  colorHex: number;
  lod: THREE.LOD;
  wheels: THREE.Object3D[];
  length: number;
  width: number;
  wheelRadius: number;
  cruiseSpeedMps: number;
  accelMps2: number;
  brakeMps2: number;
  audioKind: VehicleAudioKind;
  segmentIndex: number;
  nextSegmentIndex: number;
  distOnSeg: number;
  laneOffset: number;
  turning: boolean;
  turnT: number;
  turnDuration: number;
  p0x: number;
  p0z: number;
  p1x: number;
  p1z: number;
  p2x: number;
  p2z: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
  hornCooldownSec: number;
  queuedTimeSec: number;
  wheelSpinAngle: number;
  seed: number;
  claimed: boolean;
}

export interface ClaimedTrafficVehicle {
  id: string;
  modelId: VehicleModelId;
  colorHex: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  speedMps: number;
  lod: THREE.LOD;
}

const ZONE_MODELS: Record<string, VehicleModelId[]> = {
  mavoor_road: [
    'ksrtc_bus',
    'kerala_private_bus',
    'maruti_swift',
    'hyundai_creta',
    'maruti_baleno',
    'tata_nexon',
    'auto_rickshaw',
    'suzuki_access_125',
    'hyundai_i20',
    'delivery_van',
  ],
  palayam: [
    'ksrtc_bus',
    'kerala_private_bus',
    'auto_rickshaw',
    'auto_rickshaw',
    'hero_commuter',
    'suzuki_access_125',
    'goods_truck',
    'maruti_wagonr',
    'delivery_van',
  ],
  sm_street: [
    'auto_rickshaw',
    'auto_rickshaw',
    'suzuki_access_125',
    'honda_activa',
    'maruti_swift',
    'maruti_alto',
    'maruti_wagonr',
    'royal_enfield',
    'delivery_van',
  ],
  protagonist_home: [
    'suzuki_access_125',
    'honda_activa',
    'hero_commuter',
    'royal_enfield',
    'maruti_alto',
    'maruti_swift',
    'maruti_wagonr',
    'auto_rickshaw',
  ],
  kozhikode_beach: [
    'kerala_private_bus',
    'maruti_swift',
    'hyundai_i20',
    'tata_nexon',
    'yamaha_fz',
    'royal_enfield',
    'suzuki_access_125',
    'auto_rickshaw',
  ],
  default: [
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
  ],
};

function buildTrafficSegmentGraph(): RoadSegment[] {
  const nsRoads = KOZHIKODE_ROAD_CORRIDORS.filter((r) => r.axis === 'ns');
  const ewRoads = KOZHIKODE_ROAD_CORRIDORS.filter((r) => r.axis === 'ew');

  const segments: RoadSegment[] = [];

  const speedFactorForCorridor = (c: RoadCorridorSpec): number => {
    if (c.id === 'mananchira_south') return 0.78;
    if (c.id === 'west_hill_lane') return 0.76;
    if (c.id === 'beach_road') return 0.88;
    if (c.roadClass === 'highway') return 1.08;
    return 0.95;
  };

  // Split each road at its cross-corridor intersections so vehicles can turn naturally at every junction
  for (const road of KOZHIKODE_ROAD_CORRIDORS) {
    const crossList = road.axis === 'ns' ? ewRoads : nsRoads;
    const cuts = new Set<number>([road.start + 6, road.end - 6]);
    for (const cross of crossList) {
      if (
        cross.coord > road.start + 6 &&
        cross.coord < road.end - 6 &&
        road.coord >= cross.start &&
        road.coord <= cross.end
      ) {
        cuts.add(cross.coord);
      }
    }
    const sorted = Array.from(cuts).sort((a, b) => a - b);

    for (let i = 0; i < sorted.length - 1; i++) {
      const c0 = sorted[i];
      const c1 = sorted[i + 1];
      if (c1 - c0 < 14) continue;

      const sf = speedFactorForCorridor(road);
      if (road.axis === 'ns') {
        // Southbound (+Z) and Northbound (-Z) directed segments
        segments.push({
          id: `${road.id}_s_${i}`,
          corridorId: road.id,
          ax: road.coord,
          az: c0,
          bx: road.coord,
          bz: c1,
          tx: 0,
          tz: 1,
          length: c1 - c0,
          roadWidth: road.width,
          speedFactor: sf,
          nextSegments: [],
        });
        segments.push({
          id: `${road.id}_n_${i}`,
          corridorId: road.id,
          ax: road.coord,
          az: c1,
          bx: road.coord,
          bz: c0,
          tx: 0,
          tz: -1,
          length: c1 - c0,
          roadWidth: road.width,
          speedFactor: sf,
          nextSegments: [],
        });
      } else {
        // Eastbound (+X) and Westbound (-X) directed segments
        segments.push({
          id: `${road.id}_e_${i}`,
          corridorId: road.id,
          ax: c0,
          az: road.coord,
          bx: c1,
          bz: road.coord,
          tx: 1,
          tz: 0,
          length: c1 - c0,
          roadWidth: road.width,
          speedFactor: sf,
          nextSegments: [],
        });
        segments.push({
          id: `${road.id}_w_${i}`,
          corridorId: road.id,
          ax: c1,
          az: road.coord,
          bx: c0,
          bz: road.coord,
          tx: -1,
          tz: 0,
          length: c1 - c0,
          roadWidth: road.width,
          speedFactor: sf,
          nextSegments: [],
        });
      }
    }
  }

  // Link outgoing segments at shared nodes (prevent instant 180 U-turns unless dead end)
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const nonUturn: number[] = [];
    const fallbackUturn: number[] = [];
    for (let j = 0; j < segments.length; j++) {
      if (i === j) continue;
      const cand = segments[j];
      const dist = Math.hypot(seg.bx - cand.ax, seg.bz - cand.az);
      if (dist < 1.5) {
        const dot = seg.tx * cand.tx + seg.tz * cand.tz;
        if (dot > -0.8) {
          nonUturn.push(j);
        } else {
          fallbackUturn.push(j);
        }
      }
    }
    seg.nextSegments = nonUturn.length > 0 ? nonUturn : fallbackUturn;
  }

  return segments;
}

function getTierVehicleBudget(tier: GraphicsPresetProfile['tier']): number {
  switch (tier) {
    case 'low':
      return 16;
    case 'medium':
      return 26;
    case 'high':
      return 34;
    case 'ultra':
      return 42;
  }
}

export class TrafficSystem {
  readonly root = new THREE.Group();
  private readonly mats: MaterialLibrary;
  private readonly segments: RoadSegment[];
  private readonly vehicles: ActiveTrafficVehicle[] = [];
  private activeTrafficCache: ActiveTrafficVehicle[] = [];
  private globalHornCooldownSec = 1.2;
  private targetCount = 26;
  private initialized = false;

  constructor(mats: MaterialLibrary, preset: GraphicsPresetProfile) {
    this.mats = mats;
    this.segments = buildTrafficSegmentGraph();
    this.targetCount = getTierVehicleBudget(preset.tier);
    this.spawnInitialFleet();
  }

  private rebuildActiveTrafficCache(): void {
    this.activeTrafficCache = this.vehicles.filter((v) => !v.claimed);
  }

  setGraphicsPreset(preset: GraphicsPresetProfile): void {
    const nextTarget = getTierVehicleBudget(preset.tier);
    this.targetCount = nextTarget;
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      v.lod.visible = !v.claimed && i < nextTarget;
    }
  }

  getActiveVehicleCount(): number {
    let count = 0;
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      if (!v.claimed && v.lod.visible) count++;
    }
    return count;
  }

  getSegmentCount(): number {
    return this.segments.length;
  }

  /**
   * Exposes live unclaimed vehicle positions/headings for pedestrian & player yielding without allocations.
   */
  getTrafficSnapshots(): ReadonlyArray<{
    id: string;
    x: number;
    z: number;
    heading: number;
    speed: number;
    length: number;
    width: number;
  }> {
    return this.activeTrafficCache;
  }

  /**
   * Phase 7 drivable vehicle and VehicleController entry/ownership contract.
   */
  getPhase7VehicleDescriptors(): TrafficVehiclePhase7Descriptor[] {
    const out: TrafficVehiclePhase7Descriptor[] = [];
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      if (v.claimed || !v.lod.visible) continue;
      const meta = VEHICLE_BLUEPRINT_META[v.modelId];
      out.push({
        id: v.id,
        modelId: v.modelId,
        category: meta.category,
        x: v.x,
        y: v.y,
        z: v.z,
        heading: v.heading,
        speedMps: v.speed,
        audioKind: v.audioKind,
        drivableHookEligible: meta.drivableHookEligible,
      });
    }
    return out;
  }

  /**
   * Claims an NPC traffic vehicle for player control, cleanly removing it from NPC lane simulation
   * and handing off its THREE.LOD without creating a duplicate vehicle model.
   */
  claimTrafficVehicle(id: string): ClaimedTrafficVehicle | null {
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      if (v.id !== id || v.claimed) continue;
      v.claimed = true;
      v.lod.visible = true;
      this.root.remove(v.lod);
      const npcDriver = v.lod.userData?.npcDriverGroup as THREE.Group | null | undefined;
      if (npcDriver) {
        npcDriver.visible = false;
      }
      this.rebuildActiveTrafficCache();
      return {
        id: v.id,
        modelId: v.modelId,
        colorHex: v.colorHex,
        x: v.x,
        y: v.y,
        z: v.z,
        heading: v.heading,
        speedMps: v.speed,
        lod: v.lod,
      };
    }
    return null;
  }

  resetClaimedTrafficVehicles(): void {
    let anyChanged = false;
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      if (!v.claimed) continue;
      v.claimed = false;
      v.speed = 0;
      const npcDriver = v.lod.userData?.npcDriverGroup as THREE.Group | null | undefined;
      if (npcDriver) {
        npcDriver.visible = true;
      }
      v.lod.position.set(v.x, v.y, v.z);
      v.lod.rotation.y = v.heading;
      v.lod.visible = i < this.targetCount;
      this.root.add(v.lod);
      anyChanged = true;
    }
    if (anyChanged) {
      this.rebuildActiveTrafficCache();
    }
  }

  private spawnInitialFleet(): void {
    if (this.initialized || this.segments.length === 0) return;
    this.initialized = true;

    // Guarantee every one of the 17 vehicle models appears across the Kozhikode road network
    const requiredModels: VehicleModelId[] = [
      'maruti_swift',
      'suzuki_access_125',
      'ksrtc_bus',
      'kerala_private_bus',
      'auto_rickshaw',
      'maruti_alto',
      'maruti_baleno',
      'maruti_wagonr',
      'hyundai_i20',
      'hyundai_creta',
      'tata_nexon',
      'honda_activa',
      'hero_commuter',
      'yamaha_fz',
      'royal_enfield',
      'delivery_van',
      'goods_truck',
    ];

    const maxPool = 42;
    for (let i = 0; i < maxPool; i++) {
      const segIdx = (i * 5 + 3) % this.segments.length;
      const seg = this.segments[segIdx];
      const midX = (seg.ax + seg.bx) * 0.5;
      const midZ = (seg.az + seg.bz) * 0.5;
      const district = getDistrictAt(midX, midZ);

      let modelId: VehicleModelId;
      if (i < requiredModels.length) {
        modelId = requiredModels[i];
      } else {
        const pool = ZONE_MODELS[district.id] ?? ZONE_MODELS.default;
        modelId = pool[(i * 7 + 2) % pool.length];
      }

      const meta = VEHICLE_BLUEPRINT_META[modelId];
      const colorHex = meta.defaultColors[i % meta.defaultColors.length];
      const lod = createVehicleModelLOD(modelId, this.mats, {
        colorHex,
        withDriver: true,
      });

      const distOnSeg = Math.min(seg.length - 8, 8 + ((i * 19) % Math.max(12, Math.floor(seg.length - 16))));
      const baseLane = seg.roadWidth <= 10.5 ? 2.25 : 2.55;
      const twoWheelerEdge =
        meta.category === 'scooter' || meta.category === 'motorcycle' ? ((i % 2 === 0 ? 0.45 : -0.35)) : 0;
      const laneOffset = baseLane + twoWheelerEdge;

      // Left-hand traffic normal in Kozhikode: (tz, -tx) * laneOffset
      const lx = seg.tz * laneOffset;
      const lz = -seg.tx * laneOffset;
      const wx = seg.ax + seg.tx * distOnSeg + lx;
      const wz = seg.az + seg.tz * distOnSeg + lz;
      const wy = getGroundHeightAt(wx, wz);
      const heading = Math.atan2(seg.tx, seg.tz);

      lod.position.set(wx, wy, wz);
      lod.rotation.y = heading;
      lod.visible = i < this.targetCount;
      this.root.add(lod);

      const nextSeg = seg.nextSegments.length > 0 ? seg.nextSegments[i % seg.nextSegments.length] : segIdx;
      const wheels = Array.isArray(lod.userData.wheels) ? (lod.userData.wheels as THREE.Object3D[]) : [];

      this.vehicles.push({
        id: `traffic_${i}_${modelId}`,
        modelId,
        colorHex,
        lod,
        wheels,
        length: meta.length,
        width: meta.width,
        wheelRadius: meta.wheelRadius,
        cruiseSpeedMps: meta.cruiseSpeedMps * seg.speedFactor,
        accelMps2: meta.accelMps2,
        brakeMps2: meta.brakeMps2,
        audioKind: meta.audioKind,
        segmentIndex: segIdx,
        nextSegmentIndex: nextSeg,
        distOnSeg,
        laneOffset,
        turning: false,
        turnT: 0,
        turnDuration: 1,
        p0x: wx,
        p0z: wz,
        p1x: wx,
        p1z: wz,
        p2x: wx,
        p2z: wz,
        x: wx,
        y: wy,
        z: wz,
        heading,
        speed: meta.cruiseSpeedMps * seg.speedFactor * 0.65,
        hornCooldownSec: 3 + (i % 11),
        queuedTimeSec: 0,
        wheelSpinAngle: 0,
        seed: i,
        claimed: false,
      });
    }
    this.rebuildActiveTrafficCache();
  }

  update(
    dt: number,
    focusX: number,
    focusZ: number,
    camera: THREE.Camera | undefined,
    colliders: StaticAabbCollider[],
    pedestrians: ReadonlyArray<{ x: number; z: number }>,
    playerPos?: { x: number; z: number },
    onHorn?: (ev: TrafficHornEvent) => void,
    extraVehicles?: ReadonlyArray<{ x: number; z: number; width: number; length: number }>,
  ): void {
    const safeDt = Math.min(dt, 0.05);
    this.globalHornCooldownSec = Math.max(0, this.globalHornCooldownSec - safeDt);

    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      if (v.claimed) {
        continue;
      }
      if (i >= this.targetCount) {
        v.lod.visible = false;
        continue;
      }

      const distToFocus = Math.hypot(v.x - focusX, v.z - focusZ);
      // Lightweight distance throttling for distant vehicles
      if (distToFocus > 260) {
        v.lod.visible = false;
        continue;
      }
      v.lod.visible = true;
      v.hornCooldownSec = Math.max(0, v.hornCooldownSec - safeDt);

      const seg = this.segments[v.segmentIndex];
      const fwdX = Math.sin(v.heading);
      const fwdZ = Math.cos(v.heading);

      // 1. Determine desired target speed (junction slow, vehicle headway, pedestrian & player yield)
      let desiredSpeed = v.cruiseSpeedMps;
      let obstacleAhead = false;
      let leadQueueTrigger = false;

      if (!v.turning && seg.length - v.distOnSeg < 12) {
        const nextSeg = this.segments[v.nextSegmentIndex];
        const dot = seg.tx * nextSeg.tx + seg.tz * nextSeg.tz;
        if (dot < 0.5) {
          desiredSpeed = Math.min(desiredSpeed, 4.6); // Slow into junction turn
        }
      }

      // Lead vehicle spacing check along same direction
      for (let j = 0; j < this.vehicles.length; j++) {
        if (i === j || j >= this.targetCount) continue;
        const other = this.vehicles[j];
        if (other.claimed || !other.lod.visible) continue;
        const dx = other.x - v.x;
        const dz = other.z - v.z;
        const dSq = dx * dx + dz * dz;
        if (dSq > 360) continue; // > 19m away
        const forwardDist = dx * fwdX + dz * fwdZ;
        if (forwardDist <= 0.2) continue;
        const sideDist = Math.abs(dx * fwdZ - dz * fwdX);
        const combinedHalfW = (v.width + other.width) * 0.5 + 0.45;
        if (sideDist < combinedHalfW) {
          const minGap = (v.length + other.length) * 0.5 + 2.8;
          if (forwardDist < minGap) {
            desiredSpeed = 0;
            obstacleAhead = true;
            leadQueueTrigger = true;
            break;
          } else if (forwardDist < minGap + 8.5) {
            const ratio = (forwardDist - minGap) / 8.5;
            desiredSpeed = Math.min(desiredSpeed, Math.max(1.2, other.speed * (0.6 + 0.4 * ratio)));
            obstacleAhead = true;
          }
        }
      }

      // Yield to player-controlled / player-parked world vehicles on the road
      if (extraVehicles && extraVehicles.length > 0 && distToFocus < 160) {
        for (let k = 0; k < extraVehicles.length; k++) {
          const pv = extraVehicles[k];
          const dx = pv.x - v.x;
          const dz = pv.z - v.z;
          if (dx * dx + dz * dz > 440) continue;
          const forwardDist = dx * fwdX + dz * fwdZ;
          if (forwardDist <= 0.2) continue;
          const sideDist = Math.abs(dx * fwdZ - dz * fwdX);
          const combinedHalfW = (v.width + pv.width) * 0.5 + 0.55;
          if (sideDist < combinedHalfW) {
            const minGap = (v.length + pv.length) * 0.5 + 3.0;
            if (forwardDist < minGap) {
              desiredSpeed = 0;
              obstacleAhead = true;
              leadQueueTrigger = true;
              break;
            } else if (forwardDist < minGap + 7.5) {
              desiredSpeed = Math.min(desiredSpeed, 2.0);
              obstacleAhead = true;
            }
          }
        }
      }

      // Pedestrian & player safety braking
      if (distToFocus < 120) {
        for (let p = 0; p < pedestrians.length; p++) {
          const ped = pedestrians[p];
          const dx = ped.x - v.x;
          const dz = ped.z - v.z;
          const forwardDist = dx * fwdX + dz * fwdZ;
          if (forwardDist > 0.3 && forwardDist < v.length * 0.5 + 5.5) {
            const sideDist = Math.abs(dx * fwdZ - dz * fwdX);
            if (sideDist < v.width * 0.5 + 0.75) {
              desiredSpeed = Math.min(desiredSpeed, 1.0);
              obstacleAhead = true;
              break;
            }
          }
        }
        if (playerPos) {
          const dx = playerPos.x - v.x;
          const dz = playerPos.z - v.z;
          const forwardDist = dx * fwdX + dz * fwdZ;
          if (forwardDist > 0.3 && forwardDist < v.length * 0.5 + 6.5) {
            const sideDist = Math.abs(dx * fwdZ - dz * fwdX);
            if (sideDist < v.width * 0.5 + 0.9) {
              desiredSpeed = 0;
              obstacleAhead = true;
            }
          }
        }
      }

      // Static building collider lookahead safety
      if (colliders.length > 0 && distToFocus < 140) {
        const probeX = v.x + fwdX * (v.length * 0.5 + 2.5);
        const probeZ = v.z + fwdZ * (v.length * 0.5 + 2.5);
        for (let c = 0; c < colliders.length; c++) {
          const col = colliders[c];
          if (
            probeX > col.minX - 0.5 &&
            probeX < col.maxX + 0.5 &&
            probeZ > col.minZ - 0.5 &&
            probeZ < col.maxZ + 0.5
          ) {
            desiredSpeed = Math.min(desiredSpeed, 1.5);
            obstacleAhead = true;
            break;
          }
        }
      }

      // Integrate speed smoothly
      if (v.speed < desiredSpeed) {
        v.speed = Math.min(desiredSpeed, v.speed + v.accelMps2 * safeDt);
      } else if (v.speed > desiredSpeed) {
        v.speed = Math.max(desiredSpeed, v.speed - v.brakeMps2 * safeDt);
      }

      if (obstacleAhead && v.speed < 2.8) {
        v.queuedTimeSec += safeDt;
      } else {
        v.queuedTimeSec = Math.max(0, v.queuedTimeSec - safeDt * 2);
      }

      // Non-spammy natural Kerala horn trigger
      if (onHorn && distToFocus < 92 && v.hornCooldownSec <= 0 && this.globalHornCooldownSec <= 0) {
        const isBus = v.modelId === 'ksrtc_bus' || v.modelId === 'kerala_private_bus';
        const isAuto = v.modelId === 'auto_rickshaw';
        const approachingBusyJct = !v.turning && seg.length - v.distOnSeg < 10 && (isBus || isAuto);
        const queuedWarning = leadQueueTrigger && v.queuedTimeSec > 1.1;

        if (queuedWarning || approachingBusyJct) {
          onHorn({
            vehicleId: v.id,
            modelId: v.modelId,
            audioKind: v.audioKind,
            x: v.x,
            z: v.z,
          });
          v.hornCooldownSec = isBus ? 9 + (v.seed % 6) : 11 + (v.seed % 8);
          this.globalHornCooldownSec = 1.65;
          v.queuedTimeSec = 0;
        }
      }

      // 2. Advance along lane or Bezier junction turn
      const stepDist = v.speed * safeDt;
      if (!v.turning) {
        v.distOnSeg += stepDist;
        const turnMargin = Math.min(6.5, seg.length * 0.25);

        if (v.distOnSeg >= seg.length - turnMargin) {
          const nextSeg = this.segments[v.nextSegmentIndex];
          const dot = seg.tx * nextSeg.tx + seg.tz * nextSeg.tz;

          if (dot > 0.85) {
            // Straight continuation across junction
            v.segmentIndex = v.nextSegmentIndex;
            v.distOnSeg = Math.max(0, v.distOnSeg - seg.length + turnMargin);
            const updatedSeg = this.segments[v.segmentIndex];
            const pool = updatedSeg.nextSegments;
            v.nextSegmentIndex =
              pool.length > 0 ? pool[Math.abs(v.seed + Math.floor(v.x + v.z)) % pool.length] : v.segmentIndex;
            const lx = updatedSeg.tz * v.laneOffset;
            const lz = -updatedSeg.tx * v.laneOffset;
            v.x = updatedSeg.ax + updatedSeg.tx * v.distOnSeg + lx;
            v.z = updatedSeg.az + updatedSeg.tz * v.distOnSeg + lz;
            v.heading = Math.atan2(updatedSeg.tx, updatedSeg.tz);
          } else {
            // Enter smooth quadratic Bezier corner turn onto nextSeg's left lane
            const nextMargin = Math.min(6.5, nextSeg.length * 0.25);
            v.turning = true;
            v.turnT = 0;
            v.p0x = v.x;
            v.p0z = v.z;
            const curLx = seg.tz * v.laneOffset;
            const curLz = -seg.tx * v.laneOffset;
            const nxtLx = nextSeg.tz * v.laneOffset;
            const nxtLz = -nextSeg.tx * v.laneOffset;
            v.p1x = seg.bx + (curLx + nxtLx) * 0.5;
            v.p1z = seg.bz + (curLz + nxtLz) * 0.5;
            v.p2x = nextSeg.ax + nextSeg.tx * nextMargin + nxtLx;
            v.p2z = nextSeg.az + nextSeg.tz * nextMargin + nxtLz;
            const approxArcLen = Math.max(4, Math.hypot(v.p2x - v.p0x, v.p2z - v.p0z) * 1.15);
            v.turnDuration = approxArcLen; // stored in meters so turnT advances by stepDist / arcLen
          }
        } else {
          const lx = seg.tz * v.laneOffset;
          const lz = -seg.tx * v.laneOffset;
          v.x = seg.ax + seg.tx * v.distOnSeg + lx;
          v.z = seg.az + seg.tz * v.distOnSeg + lz;
          v.heading = Math.atan2(seg.tx, seg.tz);
        }
      } else {
        v.turnT += stepDist / Math.max(2, v.turnDuration);
        if (v.turnT >= 1) {
          const nextSeg = this.segments[v.nextSegmentIndex];
          v.turning = false;
          v.segmentIndex = v.nextSegmentIndex;
          v.distOnSeg = Math.min(6.5, nextSeg.length * 0.25);
          const pool = nextSeg.nextSegments;
          v.nextSegmentIndex =
            pool.length > 0 ? pool[(v.seed + Math.abs(Math.round(v.x * 3 + v.z))) % pool.length] : v.segmentIndex;
          const lx = nextSeg.tz * v.laneOffset;
          const lz = -nextSeg.tx * v.laneOffset;
          v.x = nextSeg.ax + nextSeg.tx * v.distOnSeg + lx;
          v.z = nextSeg.az + nextSeg.tz * v.distOnSeg + lz;
          v.heading = Math.atan2(nextSeg.tx, nextSeg.tz);
        } else {
          const u = v.turnT;
          const inv = 1 - u;
          const prevX = v.x;
          const prevZ = v.z;
          v.x = inv * inv * v.p0x + 2 * inv * u * v.p1x + u * u * v.p2x;
          v.z = inv * inv * v.p0z + 2 * inv * u * v.p1z + u * u * v.p2z;
          const dx = v.x - prevX;
          const dz = v.z - prevZ;
          if (dx * dx + dz * dz > 0.0001) {
            v.heading = Math.atan2(dx, dz);
          }
        }
      }

      v.y = getGroundHeightAt(v.x, v.z);
      v.lod.position.set(v.x, v.y, v.z);
      v.lod.rotation.y = v.heading;

      // Wheel rotation animation for close vehicles
      if (distToFocus < 90 && v.wheels.length > 0) {
        v.wheelSpinAngle = (v.wheelSpinAngle + stepDist / Math.max(0.15, v.wheelRadius)) % (Math.PI * 2);
        for (let w = 0; w < v.wheels.length; w++) {
          v.wheels[w].rotation.x = v.wheelSpinAngle;
        }
      }

      if (camera) {
        v.lod.update(camera);
      }
    }
  }

  dispose(): void {
    this.root.clear();
  }
}
