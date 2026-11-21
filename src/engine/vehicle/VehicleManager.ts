import * as THREE from 'three';
import type { DynamicVehicleObstacle, StaticAabbCollider } from '../player/PlayerController.ts';
import type { MaterialLibrary } from '../rendering/MaterialLibrary.ts';
import type {
  ActiveVehicleHudState,
  SavedVehicleRecord,
  SavedVehiclesState,
} from '../types.ts';
import { getCoastlineXAtZ } from '../world/GeoProjection.ts';
import { KOZHIKODE_WORLD_BOUNDS } from '../world/KozhikodeGeography.ts';
import type { TrafficSystem } from '../world/TrafficSystem.ts';
import {
  VEHICLE_BLUEPRINT_META,
  createVehicleModelLOD,
  type VehicleFleetCategory,
  type VehicleModelId,
} from '../world/VehicleVisualFactory.ts';
import type { WorldStreamer } from '../world/WorldStreamer.ts';
import {
  VehicleController,
  type DynamicVehicleColliderRef,
  type PedestrianColliderRef,
  type VehicleCollisionEvent,
  type VehicleControlInput,
  type VehicleDriveState,
  type VehicleStepEnvironment,
} from './VehicleController.ts';

export interface EnterableVehicleCandidate {
  id: string;
  sourceKind: 'world' | 'parked_chunk' | 'traffic';
  modelId: VehicleModelId;
  displayName: string;
  category: VehicleFleetCategory;
  x: number;
  y: number;
  z: number;
  heading: number;
  speedMps: number;
  distanceMeters: number;
  canEnter: boolean;
  reason?: string;
}

export interface WorldVehicleEntity {
  id: string;
  sourceKind: 'parked_chunk' | 'traffic' | 'persisted';
  sourceId: string;
  modelId: VehicleModelId;
  colorHex: number;
  controller: VehicleController;
  lod: THREE.Object3D;
  wheels: THREE.Object3D[];
  frontWheels: THREE.Object3D[];
  bodyGroup: THREE.Object3D | null;
  npcDriverGroup: THREE.Object3D | null;
  deliveryBoxGroup: THREE.Object3D | null;
}

export interface EnterVehicleResult {
  accepted: boolean;
  reason?: string;
  entity?: WorldVehicleEntity;
}

export interface ExitVehicleResult {
  exited: boolean;
  reason?: string;
  exitX?: number;
  exitY?: number;
  exitZ?: number;
  exitHeading?: number;
  vehicleId?: string;
  modelId?: VehicleModelId;
}

export interface VehicleManagerStepResult {
  driveState: VehicleDriveState | null;
  isDriving: boolean;
  isEntering: boolean;
  playerVisible: boolean;
  riderPose: {
    x: number;
    y: number;
    z: number;
    heading: number;
    leanAngleRad: number;
    steerNorm: number;
    speedMps: number;
    category: VehicleFleetCategory;
    leanForwardRad: number;
  } | null;
}

function distToOrientedBoxEdge(
  px: number,
  pz: number,
  bx: number,
  bz: number,
  heading: number,
  halfW: number,
  halfL: number,
): number {
  const dx = px - bx;
  const dz = pz - bz;
  const sinH = Math.sin(heading);
  const cosH = Math.cos(heading);
  const localZ = dx * sinH + dz * cosH;
  const localX = dx * cosH - dz * sinH;
  const ex = Math.max(0, Math.abs(localX) - halfW);
  const ez = Math.max(0, Math.abs(localZ) - halfL);
  return Math.hypot(ex, ez);
}

function extractVisualParts(lod: THREE.Object3D): {
  wheels: THREE.Object3D[];
  frontWheels: THREE.Object3D[];
  bodyGroup: THREE.Object3D | null;
  npcDriverGroup: THREE.Object3D | null;
  deliveryBoxGroup: THREE.Object3D | null;
} {
  const wheels = Array.isArray(lod.userData?.wheels)
    ? (lod.userData.wheels as THREE.Object3D[])
    : [];
  const frontWheels = Array.isArray(lod.userData?.frontWheels)
    ? (lod.userData.frontWheels as THREE.Object3D[])
    : wheels.slice(0, Math.min(2, wheels.length));
  const bodyGroup = (lod.userData?.bodyGroup as THREE.Object3D | undefined) ?? null;
  const npcDriverGroup = (lod.userData?.npcDriverGroup as THREE.Object3D | undefined) ?? null;
  const deliveryBoxGroup = (lod.userData?.deliveryBoxGroup as THREE.Object3D | undefined) ?? null;
  return { wheels, frontWheels, bodyGroup, npcDriverGroup, deliveryBoxGroup };
}

function isSpotClearForPlayer(
  wx: number,
  wz: number,
  colliders: StaticAabbCollider[],
  trafficVehicles: ReadonlyArray<DynamicVehicleColliderRef>,
  worldVehicles: ReadonlyArray<WorldVehicleEntity>,
  excludeVehicleId?: string,
): boolean {
  if (
    wx < KOZHIKODE_WORLD_BOUNDS.minX + 10 ||
    wx > KOZHIKODE_WORLD_BOUNDS.maxX - 10 ||
    wz < KOZHIKODE_WORLD_BOUNDS.minZ + 6 ||
    wz > KOZHIKODE_WORLD_BOUNDS.maxZ - 6
  ) {
    return false;
  }
  const coastX = getCoastlineXAtZ(wz);
  if (wx < coastX + 1.0) {
    return false;
  }

  const playerRadius = 0.45;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (
      wx > c.minX - playerRadius &&
      wx < c.maxX + playerRadius &&
      wz > c.minZ - playerRadius &&
      wz < c.maxZ + playerRadius
    ) {
      return false;
    }
  }

  for (let i = 0; i < trafficVehicles.length; i++) {
    const tv = trafficVehicles[i];
    const edge = distToOrientedBoxEdge(
      wx,
      wz,
      tv.x,
      tv.z,
      tv.heading,
      tv.width * 0.5 + playerRadius,
      tv.length * 0.5 + playerRadius,
    );
    if (edge <= 0.05) return false;
  }

  for (let i = 0; i < worldVehicles.length; i++) {
    const wv = worldVehicles[i];
    if (wv.id === excludeVehicleId) continue;
    const c = wv.controller;
    const edge = distToOrientedBoxEdge(
      wx,
      wz,
      c.x,
      c.z,
      c.heading,
      c.profile.width * 0.5 + playerRadius,
      c.profile.length * 0.5 + playerRadius,
    );
    if (edge <= 0.05) return false;
  }

  return true;
}

/**
 * Manages player-claimable & drivable world vehicles across Kozhikode without duplicating
 * TrafficSystem NPC fleets or WorldStreamer static parked props.
 */
export class VehicleManager {
  readonly activeGroup = new THREE.Group();
  private readonly vehicles: WorldVehicleEntity[] = [];
  private drivingVehicleId: string | null = null;
  private transitionMode: 'idle' | 'entering' | 'driving' = 'idle';
  private enterTimerSec = 0;
  private readonly enterDurationSec = 0.28;
  private enterStartPos = { x: 0, y: 0, z: 0, heading: 0 };

  // Scratch arrays to avoid per-frame allocations in update loops
  private readonly dynamicObstaclesScratch: DynamicVehicleObstacle[] = [];
  private readonly trafficBlocksScratch: Array<{ x: number; z: number; width: number; length: number }> = [];
  private readonly controllerOtherVehiclesScratch: DynamicVehicleColliderRef[] = [];

  getWorldVehicles(): ReadonlyArray<WorldVehicleEntity> {
    return this.vehicles;
  }

  getActiveVehicleEntity(): WorldVehicleEntity | null {
    if (!this.drivingVehicleId) return null;
    for (let i = 0; i < this.vehicles.length; i++) {
      if (this.vehicles[i].id === this.drivingVehicleId) {
        return this.vehicles[i];
      }
    }
    return null;
  }

  isDriving(): boolean {
    return this.drivingVehicleId !== null && this.transitionMode !== 'idle';
  }

  isEntering(): boolean {
    return this.drivingVehicleId !== null && this.transitionMode === 'entering';
  }

  setActiveDeliveryBagEquipped(equipped: boolean): void {
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      if (v.deliveryBoxGroup) {
        v.deliveryBoxGroup.visible = equipped && v.id === this.drivingVehicleId;
      }
    }
  }

  spawnOwnedVehicleNearPlayer(
    modelId: VehicleModelId,
    colorHex: number,
    playerPos: { x: number; z: number; heading: number },
    mats: MaterialLibrary,
    colliders: StaticAabbCollider[],
    trafficVehicles: ReadonlyArray<DynamicVehicleColliderRef>,
    groundHeightFn: (x: number, z: number) => number,
  ): { ok: boolean; reason: string; entity?: WorldVehicleEntity } {
    const meta = VEHICLE_BLUEPRINT_META[modelId];
    if (!meta) {
      return { ok: false, reason: 'Unknown vehicle model' };
    }

    const sinH = Math.sin(playerPos.heading);
    const cosH = Math.cos(playerPos.heading);
    const candidates: Array<[number, number]> = [
      [2.6, 1.5],
      [-2.6, 1.5],
      [0, 3.6],
      [3.6, 0],
      [-3.6, 0],
      [0, -3.6],
      [4.8, 3.8],
      [-4.8, 3.8],
      [5.5, -2.5],
    ];

    let spawnX: number | null = null;
    let spawnZ: number | null = null;
    for (let i = 0; i < candidates.length; i++) {
      const [lx, lz] = candidates[i];
      const wx = playerPos.x + lx * cosH + lz * sinH;
      const wz = playerPos.z - lx * sinH + lz * cosH;
      if (
        isSpotClearForPlayer(wx, wz, colliders, trafficVehicles, this.vehicles) &&
        isSpotClearForPlayer(wx + meta.width * 0.45, wz, colliders, trafficVehicles, this.vehicles) &&
        isSpotClearForPlayer(wx - meta.width * 0.45, wz, colliders, trafficVehicles, this.vehicles)
      ) {
        spawnX = wx;
        spawnZ = wz;
        break;
      }
    }

    if (spawnX === null || spawnZ === null) {
      return { ok: false, reason: 'Move to an open street or courtyard to summon your vehicle' };
    }

    const spawnId = `owned_${modelId}_${Date.now()}`;
    const lod = createVehicleModelLOD(modelId, mats, { colorHex, withDriver: false });
    const spawnY = groundHeightFn(spawnX, spawnZ);
    const entity = this.adoptLodAsEntity(
      spawnId,
      'persisted',
      spawnId,
      modelId,
      colorHex,
      lod,
      { x: spawnX, y: spawnY, z: spawnZ, heading: playerPos.heading },
      100,
    );
    this.syncEntityVisual(entity, undefined);
    return {
      ok: true,
      reason: `${meta.displayName} parked nearby — walk up and press E to ride`,
      entity,
    };
  }

  findNearestEnterableVehicle(
    px: number,
    pz: number,
    worldStreamer: WorldStreamer,
    trafficSystem: TrafficSystem,
    maxEdgeDistance = 2.4,
  ): EnterableVehicleCandidate | null {
    let bestEnterable: EnterableVehicleCandidate | null = null;
    let bestBlocked: EnterableVehicleCandidate | null = null;

    const consider = (cand: EnterableVehicleCandidate) => {
      if (cand.canEnter) {
        if (!bestEnterable || cand.distanceMeters < bestEnterable.distanceMeters) {
          bestEnterable = cand;
        }
      } else if (!bestBlocked || cand.distanceMeters < bestBlocked.distanceMeters) {
        bestBlocked = cand;
      }
    };

    // 1. Existing persistent/world vehicles (previously driven & parked)
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      if (v.id === this.drivingVehicleId) continue;
      const c = v.controller;
      const edgeDist = distToOrientedBoxEdge(
        px,
        pz,
        c.x,
        c.z,
        c.heading,
        c.profile.width * 0.5,
        c.profile.length * 0.5,
      );
      if (edgeDist > maxEdgeDistance) continue;
      const speed = Math.abs(c.forwardSpeedMps);
      const canEnter = speed <= 4.5;
      consider({
        id: v.id,
        sourceKind: 'world',
        modelId: v.modelId,
        displayName: c.profile.displayName,
        category: c.profile.category,
        x: c.x,
        y: c.y,
        z: c.z,
        heading: c.heading,
        speedMps: speed,
        distanceMeters: Number(edgeDist.toFixed(1)),
        canEnter,
        reason: canEnter ? undefined : 'Vehicle moving too fast to enter',
      });
    }

    // 2. Unclaimed parked vehicles in active WorldStreamer chunks
    const parked = worldStreamer.getActiveParkedVehicles();
    for (let i = 0; i < parked.length; i++) {
      const pv = parked[i];
      if (pv.claimed) continue;
      const edgeDist = distToOrientedBoxEdge(
        px,
        pz,
        pv.x,
        pv.z,
        pv.heading,
        pv.width * 0.5,
        pv.length * 0.5,
      );
      if (edgeDist > maxEdgeDistance) continue;
      const meta = VEHICLE_BLUEPRINT_META[pv.modelId];
      const canEnter = meta.drivableHookEligible;
      consider({
        id: pv.id,
        sourceKind: 'parked_chunk',
        modelId: pv.modelId,
        displayName: pv.displayName,
        category: pv.category,
        x: pv.x,
        y: pv.y,
        z: pv.z,
        heading: pv.heading,
        speedMps: 0,
        distanceMeters: Number(edgeDist.toFixed(1)),
        canEnter,
        reason: canEnter ? undefined : 'Vehicle unavailable',
      });
    }

    // 3. Unclaimed live NPC traffic vehicles (enterable when stopped or moving slowly <= 4.5 m/s)
    const traffic = trafficSystem.getPhase7VehicleDescriptors();
    for (let i = 0; i < traffic.length; i++) {
      const tv = traffic[i];
      const meta = VEHICLE_BLUEPRINT_META[tv.modelId];
      const edgeDist = distToOrientedBoxEdge(
        px,
        pz,
        tv.x,
        tv.z,
        tv.heading,
        meta.width * 0.5,
        meta.length * 0.5,
      );
      if (edgeDist > maxEdgeDistance) continue;
      const speed = Math.abs(tv.speedMps);
      const canEnter = tv.drivableHookEligible && speed <= 4.5;
      consider({
        id: tv.id,
        sourceKind: 'traffic',
        modelId: tv.modelId,
        displayName: meta.displayName,
        category: meta.category,
        x: tv.x,
        y: tv.y,
        z: tv.z,
        heading: tv.heading,
        speedMps: speed,
        distanceMeters: Number(edgeDist.toFixed(1)),
        canEnter,
        reason: !tv.drivableHookEligible
          ? 'Vehicle unavailable'
          : speed > 4.5
            ? 'Vehicle moving too fast to enter'
            : undefined,
      });
    }

    return bestEnterable ?? bestBlocked;
  }

  requestEnterVehicle(
    playerPos: { x: number; y: number; z: number; heading: number },
    worldStreamer: WorldStreamer,
    trafficSystem: TrafficSystem,
  ): EnterVehicleResult {
    if (this.isDriving()) {
      return { accepted: false, reason: 'Already driving a vehicle' };
    }

    const cand = this.findNearestEnterableVehicle(
      playerPos.x,
      playerPos.z,
      worldStreamer,
      trafficSystem,
      2.4,
    );
    if (!cand) {
      return { accepted: false, reason: 'No enterable vehicle within range' };
    }
    if (!cand.canEnter) {
      return { accepted: false, reason: cand.reason ?? 'Cannot enter vehicle right now' };
    }

    let entity: WorldVehicleEntity | null = null;
    if (cand.sourceKind === 'world') {
      entity = this.vehicles.find((v) => v.id === cand.id) ?? null;
    } else if (cand.sourceKind === 'parked_chunk') {
      const claimed = worldStreamer.claimParkedVehicle(cand.id);
      if (!claimed) {
        return { accepted: false, reason: 'Parked vehicle no longer available' };
      }
      entity = this.adoptLodAsEntity(
        claimed.id,
        'parked_chunk',
        claimed.id,
        claimed.modelId,
        claimed.colorHex,
        claimed.lod,
        { x: claimed.x, y: claimed.y, z: claimed.z, heading: claimed.heading },
        100,
      );
    } else if (cand.sourceKind === 'traffic') {
      const claimed = trafficSystem.claimTrafficVehicle(cand.id);
      if (!claimed) {
        return { accepted: false, reason: 'Traffic vehicle moved out of reach' };
      }
      entity = this.adoptLodAsEntity(
        claimed.id,
        'traffic',
        claimed.id,
        claimed.modelId,
        claimed.colorHex,
        claimed.lod,
        { x: claimed.x, y: claimed.y, z: claimed.z, heading: claimed.heading },
        100,
      );
      // Inherit gentle momentum from slow-rolling traffic without harsh jump
      entity.controller.forwardSpeedMps = THREE.MathUtils.clamp(claimed.speedMps * 0.45, 0, 2.5);
    }

    if (!entity) {
      return { accepted: false, reason: 'Unable to claim vehicle' };
    }

    if (entity.npcDriverGroup) {
      entity.npcDriverGroup.visible = false;
    }

    this.drivingVehicleId = entity.id;
    this.transitionMode = 'entering';
    this.enterTimerSec = 0;
    this.enterStartPos = { ...playerPos };

    return { accepted: true, entity };
  }

  requestExitVehicle(
    colliders: StaticAabbCollider[],
    trafficVehicles: ReadonlyArray<DynamicVehicleColliderRef>,
    groundHeightFn: (x: number, z: number) => number,
  ): ExitVehicleResult {
    const entity = this.getActiveVehicleEntity();
    if (!entity) {
      return { exited: false, reason: 'Not currently inside a vehicle' };
    }

    const c = entity.controller;
    if (Math.abs(c.forwardSpeedMps) > 3.8) {
      return { exited: false, reason: 'Slow down below 14 km/h to exit safely' };
    }

    const p = c.profile;
    const sinH = Math.sin(c.heading);
    const cosH = Math.cos(c.heading);

    // Ordered candidate exit positions in vehicle-local space:
    // 1. Driver side (RHD right-hand side -X), 2. Passenger side (+X),
    // 3. Offset driver/passenger doors, 4. Rear, 5. Front, 6. Diagonal corners.
    const driverX = p.driverDoorLocalX - 0.16;
    const passengerX = Math.abs(p.driverDoorLocalX) + 0.16;
    const halfL = p.length * 0.5;
    const localCandidates: Array<[number, number]> = [
      [driverX, p.driverDoorLocalZ],
      [passengerX, p.driverDoorLocalZ],
      [driverX, p.driverDoorLocalZ - 0.9],
      [driverX, p.driverDoorLocalZ + 0.9],
      [passengerX, p.driverDoorLocalZ - 0.9],
      [passengerX, p.driverDoorLocalZ + 0.9],
      [0, -(halfL + 0.95)],
      [0, halfL + 0.95],
      [driverX - 0.6, p.driverDoorLocalZ],
      [passengerX + 0.6, p.driverDoorLocalZ],
    ];

    let chosenX: number | null = null;
    let chosenZ: number | null = null;

    for (let i = 0; i < localCandidates.length; i++) {
      const [lx, lz] = localCandidates[i];
      const wx = c.x + lx * cosH + lz * sinH;
      const wz = c.z - lx * sinH + lz * cosH;
      if (isSpotClearForPlayer(wx, wz, colliders, trafficVehicles, this.vehicles, entity.id)) {
        chosenX = wx;
        chosenZ = wz;
        break;
      }
    }

    if (chosenX === null || chosenZ === null) {
      return { exited: false, reason: 'Both doors blocked — pull forward or clear space to exit' };
    }

    c.parkImmediately(groundHeightFn);
    this.syncEntityVisual(entity, undefined);

    const exitY = groundHeightFn(chosenX, chosenZ);
    const exitHeading = Math.atan2(chosenX - c.x, chosenZ - c.z);

    this.drivingVehicleId = null;
    this.transitionMode = 'idle';
    this.enterTimerSec = 0;

    return {
      exited: true,
      exitX: chosenX,
      exitY,
      exitZ: chosenZ,
      exitHeading,
      vehicleId: entity.id,
      modelId: entity.modelId,
    };
  }

  update(
    dt: number,
    input: VehicleControlInput,
    env: Omit<VehicleStepEnvironment, 'otherVehicles'> & {
      trafficVehicles: ReadonlyArray<DynamicVehicleColliderRef>;
    },
    camera?: THREE.Camera,
    paused = false,
  ): VehicleManagerStepResult {
    const active = this.getActiveVehicleEntity();

    if (active && this.transitionMode === 'entering' && !paused) {
      this.enterTimerSec += dt;
      if (this.enterTimerSec >= this.enterDurationSec) {
        this.transitionMode = 'driving';
      }
    }

    let driveState: VehicleDriveState | null = null;

    for (let i = 0; i < this.vehicles.length; i++) {
      const entity = this.vehicles[i];
      const isActive = active?.id === entity.id;

      if (paused) {
        this.syncEntityVisual(entity, camera);
        continue;
      }

      if (isActive || Math.abs(entity.controller.forwardSpeedMps) > 0.04) {
        // Build obstacle list excluding self
        this.controllerOtherVehiclesScratch.length = 0;
        for (let t = 0; t < env.trafficVehicles.length; t++) {
          this.controllerOtherVehiclesScratch.push(env.trafficVehicles[t]);
        }
        for (let w = 0; w < this.vehicles.length; w++) {
          if (w === i) continue;
          const other = this.vehicles[w].controller;
          this.controllerOtherVehiclesScratch.push({
            id: this.vehicles[w].id,
            x: other.x,
            z: other.z,
            heading: other.heading,
            width: other.profile.width,
            length: other.profile.length,
            speed: other.forwardSpeedMps,
            massKg: other.profile.massKg,
          });
        }

        const stepEnv: VehicleStepEnvironment = {
          colliders: env.colliders,
          groundHeightFn: env.groundHeightFn,
          otherVehicles: this.controllerOtherVehiclesScratch,
          pedestrians: env.pedestrians,
          onPedestrianImpact: env.onPedestrianImpact,
          onCollision: isActive ? env.onCollision : undefined,
        };

        const effectiveInput =
          isActive && this.transitionMode === 'driving'
            ? input
            : { throttle: 0, brakeReverse: 0, steer: 0, handbrake: true };

        const st = entity.controller.update(dt, effectiveInput, stepEnv, isActive);
        if (isActive) {
          driveState = st;
        }
      }

      this.syncEntityVisual(entity, camera);
    }

    if (!active) {
      return {
        driveState: null,
        isDriving: false,
        isEntering: false,
        playerVisible: true,
        riderPose: null,
      };
    }

    if (!driveState) {
      driveState = active.controller.getState();
    }

    const c = active.controller;
    const p = c.profile;
    const sinH = Math.sin(c.heading);
    const cosH = Math.cos(c.heading);
    const seatWX = c.x + p.driverSeatOffset.x * cosH + p.driverSeatOffset.z * sinH;
    const seatWZ = c.z - p.driverSeatOffset.x * sinH + p.driverSeatOffset.z * cosH;
    const seatWY = c.y + p.driverSeatOffset.y;

    if (this.transitionMode === 'entering') {
      const t = THREE.MathUtils.clamp(this.enterTimerSec / this.enterDurationSec, 0, 1);
      const smooth = t * t * (3 - 2 * t);
      return {
        driveState,
        isDriving: true,
        isEntering: true,
        playerVisible: true,
        riderPose: {
          x: THREE.MathUtils.lerp(this.enterStartPos.x, seatWX, smooth),
          y: THREE.MathUtils.lerp(this.enterStartPos.y, seatWY - 0.85, smooth),
          z: THREE.MathUtils.lerp(this.enterStartPos.z, seatWZ, smooth),
          heading: c.heading,
          leanAngleRad: 0,
          steerNorm: 0,
          speedMps: driveState.speedMps,
          category: p.category,
          leanForwardRad: p.riderLeanForwardRad,
        },
      };
    }

    // Driving mode: open vehicles (scooters, bikes, auto-rickshaws) keep Arjun visibly seated!
    const playerVisible = !p.isEnclosed;
    return {
      driveState,
      isDriving: true,
      isEntering: false,
      playerVisible,
      riderPose: playerVisible
        ? {
            x: seatWX,
            y: seatWY - 0.88,
            z: seatWZ,
            heading: c.heading,
            leanAngleRad: c.leanAngleRad,
            steerNorm: driveState.steerNorm,
            speedMps: driveState.speedMps,
            category: p.category,
            leanForwardRad: p.riderLeanForwardRad,
          }
        : null,
    };
  }

  getActiveHudState(): ActiveVehicleHudState | null {
    const active = this.getActiveVehicleEntity();
    if (!active || this.transitionMode === 'idle') {
      return null;
    }
    const st = active.controller.getState();
    return {
      isDriving: true,
      isEntering: this.transitionMode === 'entering',
      vehicleId: active.id,
      modelId: st.modelId,
      displayName: st.profile.displayName,
      category: st.profile.category,
      speedKmh: st.speedKmh,
      speedMps: Number(st.speedMps.toFixed(2)),
      signedSpeedMps: Number(st.forwardSpeedMps.toFixed(2)),
      gear: st.gear,
      steerNorm: Number(st.steerNorm.toFixed(2)),
      throttleNorm: Number(st.throttleNorm.toFixed(2)),
      brakeNorm: Number(st.brakeNorm.toFixed(2)),
      handbrakeActive: st.handbrakeActive,
      damageHealth: st.damageHealth,
      damageState: st.damageState,
      leanAngleRad: Number(st.leanAngleRad.toFixed(3)),
      groundSurface: st.surface,
    };
  }

  getDynamicObstaclesForPlayer(): ReadonlyArray<DynamicVehicleObstacle> {
    this.dynamicObstaclesScratch.length = 0;
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      if (v.id === this.drivingVehicleId) continue;
      const c = v.controller;
      this.dynamicObstaclesScratch.push({
        x: c.x,
        z: c.z,
        heading: c.heading,
        width: c.profile.width,
        length: c.profile.length,
        speed: Math.abs(c.forwardSpeedMps),
      });
    }
    return this.dynamicObstaclesScratch;
  }

  getTrafficYieldVehicles(): ReadonlyArray<{ x: number; z: number; width: number; length: number }> {
    this.trafficBlocksScratch.length = 0;
    for (let i = 0; i < this.vehicles.length; i++) {
      const c = this.vehicles[i].controller;
      this.trafficBlocksScratch.push({
        x: c.x,
        z: c.z,
        width: c.profile.width,
        length: c.profile.length,
      });
    }
    return this.trafficBlocksScratch;
  }

  exportPersistedState(): SavedVehiclesState {
    const records: SavedVehicleRecord[] = this.vehicles.map((v) => ({
      id: v.id,
      sourceKind: v.sourceKind,
      sourceId: v.sourceId,
      modelId: v.modelId,
      colorHex: v.colorHex,
      x: Number(v.controller.x.toFixed(3)),
      y: Number(v.controller.y.toFixed(3)),
      z: Number(v.controller.z.toFixed(3)),
      heading: Number(v.controller.heading.toFixed(4)),
      damageHealth: Number(v.controller.damageHealth.toFixed(1)),
      damageState: v.controller.damageState,
    }));

    return {
      schemaVersion: 1,
      activeVehicleId: this.drivingVehicleId,
      vehicles: records,
      updatedAt: Date.now(),
    };
  }

  restorePersistedState(
    saved: SavedVehiclesState | null | undefined,
    mats: MaterialLibrary,
    worldStreamer: WorldStreamer,
    trafficSystem: TrafficSystem,
    groundHeightFn: (x: number, z: number) => number,
  ): { restoredActiveEntity: WorldVehicleEntity | null } {
    this.clearAll(worldStreamer, trafficSystem);
    if (!saved || !Array.isArray(saved.vehicles) || saved.vehicles.length === 0) {
      return { restoredActiveEntity: null };
    }

    const parkedIdsToClaim = saved.vehicles
      .filter((r) => r.sourceKind === 'parked_chunk')
      .map((r) => r.sourceId);
    worldStreamer.setClaimedParkedIds(parkedIdsToClaim);

    for (let i = 0; i < saved.vehicles.length; i++) {
      const rec = saved.vehicles[i];
      if (!VEHICLE_BLUEPRINT_META[rec.modelId]) continue;

      let lod: THREE.Object3D | null = null;
      if (rec.sourceKind === 'parked_chunk') {
        const claimed = worldStreamer.claimParkedVehicle(rec.sourceId);
        if (claimed) lod = claimed.lod;
      } else if (rec.sourceKind === 'traffic') {
        const claimed = trafficSystem.claimTrafficVehicle(rec.sourceId);
        if (claimed) lod = claimed.lod;
      }

      if (!lod) {
        lod = createVehicleModelLOD(rec.modelId, mats, {
          colorHex: rec.colorHex,
          withDriver: false,
        });
      }

      const groundY = groundHeightFn(rec.x, rec.z);
      const entity = this.adoptLodAsEntity(
        rec.id,
        rec.sourceKind,
        rec.sourceId,
        rec.modelId,
        rec.colorHex,
        lod,
        { x: rec.x, y: Number.isFinite(rec.y) ? rec.y : groundY, z: rec.z, heading: rec.heading },
        rec.damageHealth,
      );
      if (entity.npcDriverGroup) {
        entity.npcDriverGroup.visible = false;
      }
      this.syncEntityVisual(entity, undefined);
    }

    if (saved.activeVehicleId) {
      const active = this.vehicles.find((v) => v.id === saved.activeVehicleId) ?? null;
      if (active) {
        this.drivingVehicleId = active.id;
        this.transitionMode = 'driving';
        this.enterTimerSec = this.enterDurationSec;
        return { restoredActiveEntity: active };
      }
    }

    return { restoredActiveEntity: null };
  }

  clearAll(worldStreamer?: WorldStreamer, trafficSystem?: TrafficSystem): void {
    for (let i = 0; i < this.vehicles.length; i++) {
      this.activeGroup.remove(this.vehicles[i].lod);
    }
    this.vehicles.length = 0;
    this.drivingVehicleId = null;
    this.transitionMode = 'idle';
    this.enterTimerSec = 0;
    worldStreamer?.clearClaimedParkedIds();
    trafficSystem?.resetClaimedTrafficVehicles();
  }

  private adoptLodAsEntity(
    id: string,
    sourceKind: 'parked_chunk' | 'traffic' | 'persisted',
    sourceId: string,
    modelId: VehicleModelId,
    colorHex: number,
    lod: THREE.Object3D,
    transform: { x: number; y: number; z: number; heading: number },
    damageHealth: number,
  ): WorldVehicleEntity {
    const controller = new VehicleController(modelId, transform, damageHealth);
    const { wheels, frontWheels, bodyGroup, npcDriverGroup, deliveryBoxGroup } = extractVisualParts(lod);
    lod.position.set(transform.x, transform.y, transform.z);
    lod.rotation.y = transform.heading;
    lod.visible = true;
    this.activeGroup.add(lod);

    const entity: WorldVehicleEntity = {
      id,
      sourceKind,
      sourceId,
      modelId,
      colorHex,
      controller,
      lod,
      wheels,
      frontWheels,
      bodyGroup,
      npcDriverGroup,
      deliveryBoxGroup,
    };
    this.vehicles.push(entity);
    return entity;
  }

  private syncEntityVisual(entity: WorldVehicleEntity, camera: THREE.Camera | undefined): void {
    const c = entity.controller;
    entity.lod.position.set(c.x, c.y, c.z);
    entity.lod.rotation.y = c.heading;

    if (entity.bodyGroup) {
      entity.bodyGroup.rotation.x = c.groundSlopePitchRad + c.chassisPitchRad;
      entity.bodyGroup.rotation.z = c.chassisRollRad;
    }

    for (let i = 0; i < entity.frontWheels.length; i++) {
      entity.frontWheels[i].rotation.y = c.steerAngleRad;
    }
    for (let i = 0; i < entity.wheels.length; i++) {
      entity.wheels[i].rotation.x = c.wheelSpinAngle;
    }

    if (camera && entity.lod instanceof THREE.LOD) {
      entity.lod.update(camera);
    }
  }
}
