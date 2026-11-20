import * as THREE from 'three';
import type { StaticAabbCollider } from '../player/PlayerController.ts';
import type {
  VehicleDamageState,
  VehicleGearState,
  VehicleGroundSurface,
} from '../types.ts';
import { getCoastlineXAtZ } from '../world/GeoProjection.ts';
import {
  KOZHIKODE_ROAD_CORRIDORS,
  KOZHIKODE_WORLD_BOUNDS,
} from '../world/KozhikodeGeography.ts';
import { isPointOnDistrictRoad } from '../world/RoadNetworkGraph.ts';
import type { VehicleModelId } from '../world/VehicleVisualFactory.ts';
import {
  getVehiclePhysicsProfile,
  type VehiclePhysicsProfile,
} from './VehiclePhysicsProfiles.ts';

export interface VehicleControlInput {
  throttle: number; // 0..1
  brakeReverse: number; // 0..1
  steer: number; // -1 (left) .. +1 (right)
  handbrake: boolean;
}

export interface VehicleCollisionEvent {
  impactSpeedMps: number;
  damageDelta: number;
  damageState: VehicleDamageState;
  worldX: number;
  worldZ: number;
  kind: 'static' | 'vehicle' | 'pedestrian' | 'boundary';
}

export interface DynamicVehicleColliderRef {
  id: string;
  x: number;
  z: number;
  heading: number;
  width: number;
  length: number;
  speed?: number;
  massKg?: number;
}

export interface PedestrianColliderRef {
  id: string;
  x: number;
  z: number;
}

export interface VehicleStepEnvironment {
  colliders: StaticAabbCollider[];
  groundHeightFn: (x: number, z: number) => number;
  otherVehicles?: ReadonlyArray<DynamicVehicleColliderRef>;
  pedestrians?: ReadonlyArray<PedestrianColliderRef>;
  onPedestrianImpact?: (pedId: string, pushX: number, pushZ: number, speedMps: number) => void;
  onCollision?: (event: VehicleCollisionEvent) => void;
}

export interface VehicleDriveState {
  modelId: VehicleModelId;
  profile: VehiclePhysicsProfile;
  x: number;
  y: number;
  z: number;
  heading: number;
  forwardSpeedMps: number;
  lateralSpeedMps: number;
  speedMps: number;
  speedKmh: number;
  steerAngleRad: number;
  steerNorm: number;
  throttleNorm: number;
  brakeNorm: number;
  handbrakeActive: boolean;
  gear: VehicleGearState;
  rpmNormalized: number;
  wheelSpinAngle: number;
  chassisPitchRad: number;
  chassisRollRad: number;
  leanAngleRad: number;
  groundSlopePitchRad: number;
  surface: VehicleGroundSurface;
  damageHealth: number;
  damageState: VehicleDamageState;
  isReversing: boolean;
  isBraking: boolean;
  isDrifting: boolean;
}

function normalizeAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function resolveVehicleDamageState(health: number): VehicleDamageState {
  if (health >= 85) return 'undamaged';
  if (health >= 55) return 'minor';
  if (health >= 25) return 'moderate';
  return 'severe';
}

export function resolveVehicleSurface(
  x: number,
  z: number,
  groundHeightFn: (x: number, z: number) => number,
): VehicleGroundSurface {
  // Check local urban Kozhikode road corridors first (fast O(N) check)
  for (let i = 0; i < KOZHIKODE_ROAD_CORRIDORS.length; i++) {
    const road = KOZHIKODE_ROAD_CORRIDORS[i];
    const halfW = road.width * 0.5 + 0.55;
    if (road.axis === 'ns') {
      if (Math.abs(x - road.coord) <= halfW && z >= road.start - 1 && z <= road.end + 1) {
        return 'asphalt';
      }
    } else {
      if (Math.abs(z - road.coord) <= halfW && x >= road.start - 1 && x <= road.end + 1) {
        return 'asphalt';
      }
    }
  }

  // Check wider Kozhikode District road graph (NH-66 / NH-766 / SH-34 / rural highways)
  if (isPointOnDistrictRoad(x, z).onRoad) {
    return 'asphalt';
  }

  const coastX = getCoastlineXAtZ(z);
  if (x <= coastX + 12.5) {
    return 'sand';
  }

  if (Math.abs(x) <= 27 && Math.abs(z) <= 29) {
    return 'grass';
  }

  const gY = groundHeightFn(x, z);
  if (gY > 0.08 && Math.abs(x) < 260 && Math.abs(z) < 260) {
    return 'sidewalk';
  }

  return 'offroad';
}

function getDamagePerformanceMultiplier(damageState: VehicleDamageState): {
  speedScale: number;
  accelScale: number;
  steerScale: number;
} {
  switch (damageState) {
    case 'undamaged':
      return { speedScale: 1.0, accelScale: 1.0, steerScale: 1.0 };
    case 'minor':
      return { speedScale: 0.96, accelScale: 0.94, steerScale: 0.97 };
    case 'moderate':
      return { speedScale: 0.85, accelScale: 0.82, steerScale: 0.9 };
    case 'severe':
      return { speedScale: 0.68, accelScale: 0.65, steerScale: 0.8 };
  }
}

/**
 * Dedicated physics-inspired 3D/2.5D vehicle dynamics controller supporting cars, SUVs,
 * scooters, motorcycles, auto-rickshaws, delivery vans, trucks, and Kerala buses.
 */
export class VehicleController {
  profile: VehiclePhysicsProfile;
  x = 0;
  y = 0.02;
  z = 0;
  heading = 0;

  forwardSpeedMps = 0;
  lateralSpeedMps = 0;
  steerAngleRad = 0;
  wheelSpinAngle = 0;
  chassisPitchRad = 0;
  chassisRollRad = 0;
  leanAngleRad = 0;
  groundSlopePitchRad = 0;
  surface: VehicleGroundSurface = 'asphalt';

  damageHealth = 100;
  damageState: VehicleDamageState = 'undamaged';
  gear: VehicleGearState = 'PARKED';

  private reverseEngageDelaySec = 0;
  private reverseEngaged = false;
  private collisionCooldownSec = 0;
  private lastThrottle = 0;
  private lastBrake = 0;
  private lastHandbrake = false;
  private lastDrifting = false;

  constructor(
    modelId: VehicleModelId,
    initialPos?: { x: number; y: number; z: number; heading: number },
    initialDamageHealth = 100,
  ) {
    this.profile = getVehiclePhysicsProfile(modelId);
    if (initialPos) {
      this.x = initialPos.x;
      this.y = initialPos.y;
      this.z = initialPos.z;
      this.heading = normalizeAngle(initialPos.heading);
    }
    this.setDamageHealth(initialDamageHealth);
  }

  setDamageHealth(health: number): void {
    this.damageHealth = THREE.MathUtils.clamp(health, 0, 100);
    this.damageState = resolveVehicleDamageState(this.damageHealth);
  }

  applyRestoredTransform(x: number, y: number, z: number, heading: number, health?: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
    this.heading = normalizeAngle(heading);
    this.forwardSpeedMps = 0;
    this.lateralSpeedMps = 0;
    this.steerAngleRad = 0;
    this.chassisPitchRad = 0;
    this.chassisRollRad = 0;
    this.leanAngleRad = 0;
    this.gear = 'PARKED';
    this.reverseEngaged = false;
    this.reverseEngageDelaySec = 0;
    if (health !== undefined) {
      this.setDamageHealth(health);
    }
  }

  parkImmediately(groundHeightFn?: (x: number, z: number) => number): void {
    this.forwardSpeedMps = 0;
    this.lateralSpeedMps = 0;
    this.steerAngleRad = 0;
    this.chassisPitchRad = 0;
    this.chassisRollRad = 0;
    this.leanAngleRad = 0;
    this.gear = 'PARKED';
    this.reverseEngaged = false;
    this.reverseEngageDelaySec = 0;
    this.lastThrottle = 0;
    this.lastBrake = 0;
    this.lastHandbrake = false;
    this.lastDrifting = false;
    if (groundHeightFn) {
      this.y = groundHeightFn(this.x, this.z);
    }
  }

  update(
    dt: number,
    input: VehicleControlInput,
    env: VehicleStepEnvironment,
    hasDriver = true,
  ): VehicleDriveState {
    const safeDt = THREE.MathUtils.clamp(dt, 1e-4, 0.05);
    this.collisionCooldownSec = Math.max(0, this.collisionCooldownSec - safeDt);

    const throttle = hasDriver ? THREE.MathUtils.clamp(input.throttle, 0, 1) : 0;
    const brakeReverse = hasDriver ? THREE.MathUtils.clamp(input.brakeReverse, 0, 1) : 0;
    const rawSteer = hasDriver ? THREE.MathUtils.clamp(input.steer, -1, 1) : 0;
    const handbrake = hasDriver ? Boolean(input.handbrake) : true;

    this.lastThrottle = throttle;
    this.lastBrake = brakeReverse;
    this.lastHandbrake = handbrake;

    this.surface = resolveVehicleSurface(this.x, this.z, env.groundHeightFn);
    const isOffroad = this.surface === 'offroad' || this.surface === 'sand' || this.surface === 'grass';
    const dmgPerf = getDamagePerformanceMultiplier(this.damageState);

    const surfaceSpeedScale =
      this.surface === 'sand'
        ? this.profile.offroadSpeedFactor * 0.88
        : isOffroad
          ? this.profile.offroadSpeedFactor
          : this.surface === 'sidewalk'
            ? 0.92
            : 1.0;

    const surfaceDragScale =
      this.surface === 'sand'
        ? this.profile.offroadDragFactor * 1.25
        : isOffroad
          ? this.profile.offroadDragFactor
          : 1.0;

    const effectiveMaxFwd = this.profile.maxForwardSpeedMps * surfaceSpeedScale * dmgPerf.speedScale;
    const effectiveMaxRev = this.profile.maxReverseSpeedMps * (isOffroad ? 0.85 : 1.0) * dmgPerf.speedScale;

    // 1. Gear / Reverse Hysteresis (prevents instant flip between high forward speed and reverse)
    const speedBefore = this.forwardSpeedMps;
    let isBraking = false;

    if (handbrake) {
      const sign = Math.sign(this.forwardSpeedMps);
      const decel = this.profile.handbrakeForceMps2 * (isOffroad ? 0.85 : 1.0);
      if (Math.abs(this.forwardSpeedMps) <= decel * safeDt) {
        this.forwardSpeedMps = 0;
      } else {
        this.forwardSpeedMps -= sign * decel * safeDt;
      }
      isBraking = Math.abs(speedBefore) > 0.2;
      this.reverseEngaged = false;
      this.reverseEngageDelaySec = 0;
    } else if (brakeReverse > 0.05 && throttle <= 0.05) {
      if (this.forwardSpeedMps > 0.45) {
        // Braking cleanly from forward motion first
        isBraking = true;
        this.reverseEngaged = false;
        this.reverseEngageDelaySec = 0;
        const decel = this.profile.brakeForceMps2 * brakeReverse;
        this.forwardSpeedMps = Math.max(0, this.forwardSpeedMps - decel * safeDt);
      } else {
        // Near standstill: engage reverse smoothly after short deliberate hold
        if (!this.reverseEngaged) {
          this.reverseEngageDelaySec += safeDt;
          if (this.forwardSpeedMps > 0) {
            this.forwardSpeedMps = Math.max(0, this.forwardSpeedMps - this.profile.brakeForceMps2 * safeDt);
          }
          if (this.reverseEngageDelaySec >= 0.14 || this.forwardSpeedMps <= -0.05) {
            this.reverseEngaged = true;
          }
        }
        if (this.reverseEngaged) {
          const targetRev = -effectiveMaxRev * brakeReverse;
          if (this.forwardSpeedMps > targetRev) {
            this.forwardSpeedMps = Math.max(
              targetRev,
              this.forwardSpeedMps - this.profile.reverseAccelMps2 * brakeReverse * safeDt,
            );
          }
        }
      }
    } else if (throttle > 0.05) {
      if (this.forwardSpeedMps < -0.45) {
        // Braking from reverse before accelerating forward
        isBraking = true;
        this.forwardSpeedMps = Math.min(0, this.forwardSpeedMps + this.profile.brakeForceMps2 * throttle * safeDt);
      } else {
        this.reverseEngaged = false;
        this.reverseEngageDelaySec = 0;
        // Torque curve drops slightly near top speed for realistic top-end feel
        const speedRatio = THREE.MathUtils.clamp(Math.max(0, this.forwardSpeedMps) / Math.max(1, effectiveMaxFwd), 0, 1);
        const torqueScale = 1.0 - speedRatio * 0.42;
        const accel = this.profile.accelerationMps2 * dmgPerf.accelScale * torqueScale * throttle;
        this.forwardSpeedMps = Math.min(effectiveMaxFwd, this.forwardSpeedMps + accel * safeDt);
      }
    } else {
      // Natural coasting drag + rolling resistance
      this.reverseEngaged = false;
      this.reverseEngageDelaySec = 0;
      const sign = Math.sign(this.forwardSpeedMps);
      const speedAbs = Math.abs(this.forwardSpeedMps);
      if (speedAbs > 0) {
        const drag =
          (this.profile.rollingResistance + this.profile.coastingDrag * speedAbs * speedAbs) *
          surfaceDragScale;
        const nextAbs = Math.max(0, speedAbs - drag * safeDt);
        this.forwardSpeedMps = nextAbs < 0.04 ? 0 : sign * nextAbs;
      }
    }

    // Clamp excess speed when entering sand/offroad
    if (this.forwardSpeedMps > effectiveMaxFwd) {
      this.forwardSpeedMps = THREE.MathUtils.damp(this.forwardSpeedMps, effectiveMaxFwd, 3.2, safeDt);
    }

    // 2. Steering & Speed-Dependent Turn Radius Geometry
    const absSpeed = Math.abs(this.forwardSpeedMps);
    const speedRatio = THREE.MathUtils.clamp(absSpeed / Math.max(1, this.profile.maxForwardSpeedMps), 0, 1);
    const highSpeedSteerFactor = 1 - speedRatio * this.profile.highSpeedSteerDamping;
    // Left input (-1) -> +angle around +Y turns left (+X from +Z forward)
    const geometricMaxSteer = Math.min(
      this.profile.maxSteerAngleRad,
      Math.atan(this.profile.wheelbaseMeters / Math.max(1.2, this.profile.minTurnRadiusMeters)),
    );
    const targetSteerAngle =
      -rawSteer * geometricMaxSteer * highSpeedSteerFactor * dmgPerf.steerScale;

    const steerRate =
      Math.abs(rawSteer) > 0.04
        ? this.profile.steeringResponseRate
        : this.profile.steeringReturnRate;
    this.steerAngleRad = THREE.MathUtils.damp(this.steerAngleRad, targetSteerAngle, steerRate, safeDt);

    // Bicycle model angular velocity: positive forwardSpeed + positive steerAngle -> turns left (+heading)
    // Negative forwardSpeed (reversing) + positive steerAngle -> naturally inverts heading change!
    let angularVelocity = 0;
    if (absSpeed > 0.06) {
      const curvature = Math.tan(this.steerAngleRad) / Math.max(0.8, this.profile.wheelbaseMeters);
      angularVelocity = this.forwardSpeedMps * curvature;
      // Handbrake sharpens yaw response slightly at moderate speed
      if (handbrake && absSpeed > 3.5) {
        angularVelocity *= 1.28;
      }
      this.heading = normalizeAngle(this.heading + angularVelocity * safeDt);
    }

    // 3. Lateral Slip / Drift & Tire Grip
    const latGrip =
      (handbrake ? this.profile.tireGrip * this.profile.handbrakeSlipFactor : this.profile.tireGrip) *
      (isOffroad ? 0.72 : 1.0);
    // Centrifugal lateral push during cornering
    const centrifugalPush = angularVelocity * this.forwardSpeedMps * 0.16;
    this.lateralSpeedMps += centrifugalPush * safeDt;
    this.lateralSpeedMps = THREE.MathUtils.damp(this.lateralSpeedMps, 0, latGrip, safeDt);
    if (Math.abs(this.lateralSpeedMps) < 0.02) {
      this.lateralSpeedMps = 0;
    }
    this.lastDrifting = Math.abs(this.lateralSpeedMps) > 1.4 || (handbrake && absSpeed > 4.2);

    // 4. World-space integration
    const fwdX = Math.sin(this.heading);
    const fwdZ = Math.cos(this.heading);
    const leftX = Math.cos(this.heading);
    const leftZ = -Math.sin(this.heading);

    const vx = fwdX * this.forwardSpeedMps + leftX * this.lateralSpeedMps;
    const vz = fwdZ * this.forwardSpeedMps + leftZ * this.lateralSpeedMps;

    let nextX = this.x + vx * safeDt;
    let nextZ = this.z + vz * safeDt;

    // 5. Boundary & Collision Resolution
    const collisionResult = this.resolveCollisions(nextX, nextZ, env);
    nextX = collisionResult.x;
    nextZ = collisionResult.z;

    this.x = nextX;
    this.z = nextZ;

    // 6. Ground Height & Slope Pitch Adaptation
    const frontAxleOffset = this.profile.wheelbaseMeters * 0.48;
    const rearAxleOffset = -this.profile.wheelbaseMeters * 0.48;
    const frontGroundY = env.groundHeightFn(
      this.x + fwdX * frontAxleOffset,
      this.z + fwdZ * frontAxleOffset,
    );
    const rearGroundY = env.groundHeightFn(
      this.x + fwdX * rearAxleOffset,
      this.z + fwdZ * rearAxleOffset,
    );
    const centerGroundY = env.groundHeightFn(this.x, this.z);
    const targetGroundY = (centerGroundY * 2 + frontGroundY + rearGroundY) * 0.25;
    this.y = THREE.MathUtils.damp(this.y, targetGroundY, 24, safeDt);

    const rawSlopePitch = Math.atan2(
      rearGroundY - frontGroundY,
      Math.max(0.8, frontAxleOffset - rearAxleOffset),
    );
    this.groundSlopePitchRad = THREE.MathUtils.damp(
      this.groundSlopePitchRad,
      THREE.MathUtils.clamp(rawSlopePitch, -0.35, 0.35),
      14,
      safeDt,
    );

    // 7. Wheel Spin, Suspension Squat/Dive, Body Roll & Two-Wheeler Lean
    const longitudinalAccel = (this.forwardSpeedMps - speedBefore) / safeDt;
    const targetPitch = THREE.MathUtils.clamp(
      -longitudinalAccel * this.profile.suspensionPitchFactor * 0.25,
      -0.09,
      0.09,
    );
    this.chassisPitchRad = THREE.MathUtils.damp(this.chassisPitchRad, targetPitch, 10, safeDt);

    const lateralG = angularVelocity * this.forwardSpeedMps;
    if (this.profile.maxLeanAngleRad > 0.06) {
      // Two-wheeler leans INTO the turn: turning left (angularVelocity > 0) -> negative Z roll tilts top toward +X
      const desiredLean = THREE.MathUtils.clamp(
        -lateralG * 0.042,
        -this.profile.maxLeanAngleRad,
        this.profile.maxLeanAngleRad,
      );
      this.leanAngleRad = THREE.MathUtils.damp(this.leanAngleRad, desiredLean, 9.5, safeDt);
      this.chassisRollRad = this.leanAngleRad;
    } else {
      // 4-wheeler / auto body roll OUTWARD slightly under lateral G
      const desiredRoll = THREE.MathUtils.clamp(
        lateralG * this.profile.suspensionRollFactor * 0.14,
        -0.08,
        0.08,
      );
      this.chassisRollRad = THREE.MathUtils.damp(this.chassisRollRad, desiredRoll, 9.5, safeDt);
      this.leanAngleRad = 0;
    }

    this.wheelSpinAngle =
      (this.wheelSpinAngle +
        (this.forwardSpeedMps * safeDt) / Math.max(0.15, this.profile.wheelRadius)) %
      (Math.PI * 2);

    // 8. Gear & RPM computation
    if (!hasDriver || (absSpeed < 0.12 && throttle < 0.05 && brakeReverse < 0.05)) {
      this.gear = 'PARKED';
    } else if (handbrake) {
      this.gear = 'HANDBRAKE';
    } else if (this.forwardSpeedMps < -0.1) {
      this.gear = 'REVERSE';
    } else if (isBraking) {
      this.gear = 'BRAKE';
    } else {
      this.gear = 'DRIVE';
    }

    return this.getState();
  }

  getState(): VehicleDriveState {
    const absSpeed = Math.abs(this.forwardSpeedMps);
    const totalSpeedMps = Math.hypot(this.forwardSpeedMps, this.lateralSpeedMps);
    const speedNorm = THREE.MathUtils.clamp(
      absSpeed / Math.max(1, this.profile.maxForwardSpeedMps),
      0,
      1,
    );
    // Simulated multi-gear sawtooth RPM feel so driving sounds responsive across gears 1..4
    const sawGear = (speedNorm * 3.2) % 1;
    const baseRpm = 0.18 + speedNorm * 0.45 + sawGear * 0.22 + this.lastThrottle * 0.2;
    const rpmNormalized = THREE.MathUtils.clamp(baseRpm, 0.15, 1.0);

    return {
      modelId: this.profile.modelId,
      profile: this.profile,
      x: this.x,
      y: this.y,
      z: this.z,
      heading: this.heading,
      forwardSpeedMps: this.forwardSpeedMps,
      lateralSpeedMps: this.lateralSpeedMps,
      speedMps: totalSpeedMps,
      speedKmh: Math.round(absSpeed * 3.6),
      steerAngleRad: this.steerAngleRad,
      steerNorm: THREE.MathUtils.clamp(-this.steerAngleRad / Math.max(0.1, this.profile.maxSteerAngleRad), -1, 1),
      throttleNorm: this.lastThrottle,
      brakeNorm: this.lastBrake,
      handbrakeActive: this.lastHandbrake,
      gear: this.gear,
      rpmNormalized,
      wheelSpinAngle: this.wheelSpinAngle,
      chassisPitchRad: this.chassisPitchRad,
      chassisRollRad: this.chassisRollRad,
      leanAngleRad: this.leanAngleRad,
      groundSlopePitchRad: this.groundSlopePitchRad,
      surface: this.surface,
      damageHealth: Number(this.damageHealth.toFixed(1)),
      damageState: this.damageState,
      isReversing: this.forwardSpeedMps < -0.1,
      isBraking: this.gear === 'BRAKE' || this.gear === 'HANDBRAKE',
      isDrifting: this.lastDrifting,
    };
  }

  private resolveCollisions(
    x: number,
    z: number,
    env: VehicleStepEnvironment,
  ): { x: number; z: number } {
    let rx = x;
    let rz = z;
    const halfW = this.profile.width * 0.5;
    const halfL = this.profile.length * 0.5;
    const fwdX = Math.sin(this.heading);
    const fwdZ = Math.cos(this.heading);

    // Use spine circles along vehicle length so long buses/trucks/cars resolve corners accurately
    const probeRadius = Math.max(0.32, Math.min(halfW * 0.96, 1.15));
    const probeSpan = Math.max(0, halfL - probeRadius * 0.85);
    const numProbes = this.profile.length > 6.5 ? 5 : this.profile.length > 3.0 ? 3 : 2;
    const broadRadius = halfL + 1.2;

    let maxImpactSpeed = 0;
    let impactKind: VehicleCollisionEvent['kind'] | null = null;
    let impactX = rx;
    let impactZ = rz;

    for (let iter = 0; iter < 2; iter++) {
      // 1. Static World Colliders (buildings, walls, trees, unclaimed parked vehicles)
      const colliders = env.colliders;
      for (let c = 0; c < colliders.length; c++) {
        const box = colliders[c];
        if (
          rx + broadRadius < box.minX ||
          rx - broadRadius > box.maxX ||
          rz + broadRadius < box.minZ ||
          rz - broadRadius > box.maxZ
        ) {
          continue;
        }

        for (let p = 0; p < numProbes; p++) {
          const t = numProbes === 1 ? 0 : (p / (numProbes - 1)) * 2 - 1;
          const offset = t * probeSpan;
          const px = rx + fwdX * offset;
          const pz = rz + fwdZ * offset;

          const closestX = Math.max(box.minX, Math.min(px, box.maxX));
          const closestZ = Math.max(box.minZ, Math.min(pz, box.maxZ));
          const dx = px - closestX;
          const dz = pz - closestZ;
          const distSq = dx * dx + dz * dz;

          if (distSq < probeRadius * probeRadius) {
            let pushX = 0;
            let pushZ = 0;
            let normX = 0;
            let normZ = 0;

            if (distSq > 1e-8) {
              const dist = Math.sqrt(distSq);
              const push = probeRadius - dist;
              normX = dx / dist;
              normZ = dz / dist;
              pushX = normX * push;
              pushZ = normZ * push;
            } else {
              const leftPen = px - box.minX;
              const rightPen = box.maxX - px;
              const topPen = pz - box.minZ;
              const botPen = box.maxZ - pz;
              const minPen = Math.min(leftPen, rightPen, topPen, botPen);
              if (minPen === leftPen) {
                normX = -1;
                pushX = -(leftPen + probeRadius);
              } else if (minPen === rightPen) {
                normX = 1;
                pushX = rightPen + probeRadius;
              } else if (minPen === topPen) {
                normZ = -1;
                pushZ = -(topPen + probeRadius);
              } else {
                normZ = 1;
                pushZ = botPen + probeRadius;
              }
            }

            rx += pushX;
            rz += pushZ;

            // Project longitudinal velocity against collision normal
            const velX = fwdX * this.forwardSpeedMps;
            const velZ = fwdZ * this.forwardSpeedMps;
            const vn = velX * normX + velZ * normZ;
            if (vn < -0.4) {
              const closing = -vn;
              if (closing > maxImpactSpeed) {
                maxImpactSpeed = closing;
                impactKind = 'static';
                impactX = closestX;
                impactZ = closestZ;
              }
              const fwdDotNorm = fwdX * normX + fwdZ * normZ;
              if (Math.abs(fwdDotNorm) > 0.35) {
                // Direct/oblique hit: bounce mildly or slide along wall
                this.forwardSpeedMps *= closing > 4.5 ? -0.22 : 0.45;
              } else {
                // Grazing scrape along side: slight friction slowdown
                this.forwardSpeedMps *= 0.92;
              }
            }
          }
        }
      }

      // 2. Dynamic NPC Traffic & Parked World Vehicles
      const otherVehicles = env.otherVehicles;
      if (otherVehicles) {
        for (let vIdx = 0; vIdx < otherVehicles.length; vIdx++) {
          const other = otherVehicles[vIdx];
          const otherRadius = Math.max(other.width, other.length) * 0.55;
          const dxC = rx - other.x;
          const dzC = rz - other.z;
          const maxSpan = halfL + otherRadius + 1.2;
          if (dxC * dxC + dzC * dzC > maxSpan * maxSpan) continue;

          const oSin = Math.sin(other.heading);
          const oCos = Math.cos(other.heading);
          const oHw = other.width * 0.5;
          const oHl = other.length * 0.5;

          for (let p = 0; p < numProbes; p++) {
            const t = numProbes === 1 ? 0 : (p / (numProbes - 1)) * 2 - 1;
            const offset = t * probeSpan;
            const px = rx + fwdX * offset;
            const pz = rz + fwdZ * offset;

            const relX = px - other.x;
            const relZ = pz - other.z;
            const localZ = relX * oSin + relZ * oCos;
            const localX = relX * oCos - relZ * oSin;

            const clampedLX = Math.max(-oHw, Math.min(localX, oHw));
            const clampedLZ = Math.max(-oHl, Math.min(localZ, oHl));
            const ex = localX - clampedLX;
            const ez = localZ - clampedLZ;
            const dSq = ex * ex + ez * ez;

            if (dSq < probeRadius * probeRadius) {
              let pushLX = 0;
              let pushLZ = 0;
              if (dSq > 1e-8) {
                const dist = Math.sqrt(dSq);
                const push = probeRadius - dist;
                pushLX = (ex / dist) * push;
                pushLZ = (ez / dist) * push;
              } else {
                const penX = oHw - Math.abs(localX);
                const penZ = oHl - Math.abs(localZ);
                if (penX < penZ) {
                  pushLX = (localX >= 0 ? 1 : -1) * (penX + probeRadius);
                } else {
                  pushLZ = (localZ >= 0 ? 1 : -1) * (penZ + probeRadius);
                }
              }

              const pushWX = pushLX * oCos + pushLZ * oSin;
              const pushWZ = -pushLX * oSin + pushLZ * oCos;
              const pushLen = Math.hypot(pushWX, pushWZ) || 1;
              const nX = pushWX / pushLen;
              const nZ = pushWZ / pushLen;

              rx += pushWX;
              rz += pushWZ;

              const velX = fwdX * this.forwardSpeedMps;
              const velZ = fwdZ * this.forwardSpeedMps;
              const vn = velX * nX + velZ * nZ;
              if (vn < -0.4) {
                const closing = -vn;
                if (closing > maxImpactSpeed) {
                  maxImpactSpeed = closing;
                  impactKind = 'vehicle';
                  impactX = (px + other.x) * 0.5;
                  impactZ = (pz + other.z) * 0.5;
                }
                const massRatio = other.massKg
                  ? THREE.MathUtils.clamp(other.massKg / (this.profile.massKg + other.massKg), 0.15, 0.85)
                  : 0.5;
                this.forwardSpeedMps *= closing > 4.0 ? -0.18 * massRatio : 0.45;
              }
            }
          }
        }
      }

      // 3. Pedestrian Reaction / Push Separation (never trap vehicle inside pedestrian)
      const pedestrians = env.pedestrians;
      if (pedestrians) {
        const pedCheckR = probeRadius + 0.34;
        const pedCheckRSq = pedCheckR * pedCheckR;
        for (let i = 0; i < pedestrians.length; i++) {
          const ped = pedestrians[i];
          const dxC = ped.x - rx;
          const dzC = ped.z - rz;
          if (dxC * dxC + dzC * dzC > (halfL + 1.5) ** 2) continue;

          for (let p = 0; p < numProbes; p++) {
            const t = numProbes === 1 ? 0 : (p / (numProbes - 1)) * 2 - 1;
            const offset = t * probeSpan;
            const px = rx + fwdX * offset;
            const pz = rz + fwdZ * offset;
            const dx = ped.x - px;
            const dz = ped.z - pz;
            const dSq = dx * dx + dz * dz;
            if (dSq < pedCheckRSq) {
              const dist = Math.sqrt(Math.max(1e-5, dSq));
              const pushOut = pedCheckR - dist + 0.18;
              const nx = dist > 1e-4 ? dx / dist : fwdZ;
              const nz = dist > 1e-4 ? dz / dist : -fwdX;
              env.onPedestrianImpact?.(
                ped.id,
                nx * pushOut,
                nz * pushOut,
                Math.abs(this.forwardSpeedMps),
              );
              if (Math.abs(this.forwardSpeedMps) > 3.5) {
                this.forwardSpeedMps *= 0.94;
              }
              break;
            }
          }
        }
      }
    }

    // 4. World Bounds & Arabian Sea Shoreline Guard
    const minZ = KOZHIKODE_WORLD_BOUNDS.minZ + halfL + 4;
    const maxZ = KOZHIKODE_WORLD_BOUNDS.maxZ - halfL - 4;
    if (rz < minZ || rz > maxZ) {
      rz = THREE.MathUtils.clamp(rz, minZ, maxZ);
      this.forwardSpeedMps *= 0.25;
    }

    const coastX = Math.max(KOZHIKODE_WORLD_BOUNDS.minX + 10, getCoastlineXAtZ(rz) + halfW + 0.8);
    const maxX = KOZHIKODE_WORLD_BOUNDS.maxX - halfL - 4;
    if (rx < coastX || rx > maxX) {
      const impact = Math.abs(this.forwardSpeedMps);
      if (impact > 3.8 && impact > maxImpactSpeed) {
        maxImpactSpeed = impact * 0.7;
        impactKind = 'boundary';
        impactX = rx;
        impactZ = rz;
      }
      rx = THREE.MathUtils.clamp(rx, coastX, maxX);
      this.forwardSpeedMps *= -0.15;
    }

    // 5. Real Collision Damage Evaluation
    if (impactKind && maxImpactSpeed >= 3.2 && this.collisionCooldownSec <= 0) {
      this.collisionCooldownSec = 0.45;
      const massResilience = THREE.MathUtils.clamp(1100 / Math.max(180, this.profile.massKg), 0.5, 1.45);
      const damageDelta = Math.min(28, (maxImpactSpeed - 2.6) * 2.15 * massResilience);
      this.setDamageHealth(this.damageHealth - damageDelta);
      env.onCollision?.({
        impactSpeedMps: Number(maxImpactSpeed.toFixed(1)),
        damageDelta: Number(damageDelta.toFixed(1)),
        damageState: this.damageState,
        worldX: impactX,
        worldZ: impactZ,
        kind: impactKind,
      });
    }

    return { x: rx, z: rz };
  }
}
