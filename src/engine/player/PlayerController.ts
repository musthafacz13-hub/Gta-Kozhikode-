import * as THREE from 'three';
import type { InputFrameState } from '../input/InputManager.ts';
import { getCoastlineXAtZ } from '../world/GeoProjection.ts';
import { KOZHIKODE_WORLD_BOUNDS } from '../world/KozhikodeGeography.ts';

export interface StaticAabbCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  maxY?: number;
  kind?: 'building' | 'wall' | 'vehicle' | 'prop';
}

export interface DynamicVehicleObstacle {
  x: number;
  z: number;
  heading: number;
  width: number;
  length: number;
  speed?: number;
}

export interface DynamicPedestrianObstacle {
  x: number;
  z: number;
}

export interface PlayerDynamicObstacles {
  vehicles?: ReadonlyArray<DynamicVehicleObstacle>;
  pedestrians?: ReadonlyArray<DynamicPedestrianObstacle>;
}

export type PlayerMovementGait = 'idle' | 'walk' | 'run' | 'sprint';
export type PlayerAccelerationState = 'idle' | 'starting' | 'steady' | 'stopping';

export interface PlayerMoveResult {
  x: number;
  y: number;
  visualY: number;
  z: number;
  vx: number;
  vz: number;
  verticalVelocity: number;
  isGrounded: boolean;
  heading: number;
  turnRate: number;
  groundSlope: number;
  isMoving: boolean;
  isSprinting: boolean;
  speed: number;
  movementGait: PlayerMovementGait;
  accelerationState: PlayerAccelerationState;
}

function clampToDistrictLand(x: number, z: number): { x: number; z: number } {
  const clampedZ = THREE.MathUtils.clamp(
    z,
    KOZHIKODE_WORLD_BOUNDS.minZ + 6,
    KOZHIKODE_WORLD_BOUNDS.maxZ - 6,
  );
  // Keep player east of Arabian Sea shoreline (-68 along downtown promenade)
  const coastLimitX = Math.max(KOZHIKODE_WORLD_BOUNDS.minX + 10, getCoastlineXAtZ(clampedZ));
  const clampedX = THREE.MathUtils.clamp(x, coastLimitX, KOZHIKODE_WORLD_BOUNDS.maxX - 10);
  return { x: clampedX, z: clampedZ };
}

function normalizeAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class PlayerController {
  readonly position = new THREE.Vector3(22.5, 0.18, 2.5);
  visualY = 0.18;
  heading = -Math.PI * 0.35;
  isMoving = false;
  isSprinting = false;
  currentSpeed = 0;

  readonly strollSpeed = 2.6;
  readonly walkSpeed = 4.8;
  readonly sprintSpeed = 8.6;
  readonly colliderRadius = 0.42;

  private vx = 0;
  private vz = 0;
  private verticalVelocity = 0;
  private isGrounded = true;
  private turnRate = 0;
  private groundSlope = 0;
  private movementGait: PlayerMovementGait = 'idle';
  private accelerationState: PlayerAccelerationState = 'idle';
  private smoothingMode: 'auto' | 'always' | 'instant' = 'auto';

  private colliders: StaticAabbCollider[] = [];
  private groundHeightFn: (x: number, z: number) => number = () => 0.18;

  setSmoothLocomotionMode(mode: 'auto' | 'always' | 'instant'): void {
    this.smoothingMode = mode;
  }

  setEnvironment(
    colliders: StaticAabbCollider[],
    groundHeightFn: (x: number, z: number) => number,
  ): void {
    this.colliders = colliders;
    this.groundHeightFn = groundHeightFn;
    const gY = this.groundHeightFn(this.position.x, this.position.z);
    if (this.isGrounded) {
      this.position.y = gY;
      this.visualY = gY;
    }
  }

  resetSpawn(x = 22.5, z = 2.5, heading = -Math.PI * 0.35): void {
    const safe = clampToDistrictLand(x, z);
    const gY = this.groundHeightFn(safe.x, safe.z);
    this.position.set(safe.x, gY, safe.z);
    this.visualY = gY;
    this.heading = heading;
    this.isMoving = false;
    this.isSprinting = false;
    this.currentSpeed = 0;
    this.vx = 0;
    this.vz = 0;
    this.verticalVelocity = 0;
    this.isGrounded = true;
    this.turnRate = 0;
    this.groundSlope = 0;
    this.movementGait = 'idle';
    this.accelerationState = 'idle';
  }

  /**
   * Advances camera-relative third-person ground locomotion, physics, gravity, curbs/slopes,
   * and collisions against buildings, parked/moving vehicles, and pedestrians.
   */
  update(
    dt: number,
    input: InputFrameState,
    cameraYaw: number,
    dynamicObstacles?: PlayerDynamicObstacles,
  ): PlayerMoveResult {
    const safeDt = Math.max(1e-4, dt);
    const useSmoothing =
      this.smoothingMode === 'always' || (this.smoothingMode === 'auto' && safeDt < 0.08);

    const rawX = input.moveX;
    const rawY = input.moveY;
    const mag = Math.hypot(rawX, rawY);
    const hasMoveInput = mag >= 0.05;

    let targetVx = 0;
    let targetVz = 0;
    let targetHeading = this.heading;

    if (hasMoveInput) {
      const clampedMag = Math.min(1, mag);
      const normX = rawX / mag;
      const normY = rawY / mag;

      const forwardX = -Math.sin(cameraYaw);
      const forwardZ = -Math.cos(cameraYaw);
      const rightX = Math.cos(cameraYaw);
      const rightZ = -Math.sin(cameraYaw);

      const dirX = forwardX * normY + rightX * normX;
      const dirZ = forwardZ * normY + rightZ * normX;
      const dirLen = Math.hypot(dirX, dirZ) || 1;
      const unitX = dirX / dirLen;
      const unitZ = dirZ / dirLen;

      const walkHeld = Boolean(input.held.walk);
      const sprintHeld = Boolean(input.held.sprint) && !walkHeld;
      this.isSprinting = sprintHeld;

      let targetSpeed: number;
      if (walkHeld) {
        targetSpeed = this.strollSpeed * Math.max(0.7, clampedMag);
      } else if (sprintHeld) {
        targetSpeed = this.sprintSpeed * clampedMag;
      } else if (clampedMag <= 0.55) {
        // Gentle joystick push -> natural Kerala walk speed (1.6 - 3.0 m/s)
        targetSpeed = 1.6 + (clampedMag / 0.55) * 1.4;
      } else {
        // Full stick / WASD -> smooth transition into brisk 4.8 m/s run
        targetSpeed = 3.0 + ((clampedMag - 0.55) / 0.45) * (this.walkSpeed - 3.0);
      }

      // Slope resistance on steep uphill climbs
      if (this.groundSlope > 0.25) {
        const slopePenalty = THREE.MathUtils.clamp(1 - (this.groundSlope - 0.25) * 0.45, 0.58, 1);
        targetSpeed *= slopePenalty;
      }

      targetVx = unitX * targetSpeed;
      targetVz = unitZ * targetSpeed;
      targetHeading = Math.atan2(unitX, unitZ);
    } else {
      this.isSprinting = false;
    }

    const prevSpeed = Math.hypot(this.vx, this.vz);
    const fullSmooth = this.smoothingMode === 'always';
    const autoAccelSmooth = this.smoothingMode === 'auto' && safeDt < 0.08 && hasMoveInput;

    if (fullSmooth || autoAccelSmooth) {
      const accelLambda = hasMoveInput ? (this.isSprinting ? 14 : 18) : 22;
      const alpha = 1 - Math.exp(-accelLambda * safeDt);
      this.vx += (targetVx - this.vx) * alpha;
      this.vz += (targetVz - this.vz) * alpha;
      if (!hasMoveInput && Math.hypot(this.vx, this.vz) < 0.08) {
        this.vx = 0;
        this.vz = 0;
      }
    } else {
      this.vx = targetVx;
      this.vz = targetVz;
    }

    this.currentSpeed = Math.hypot(this.vx, this.vz);
    this.isMoving = hasMoveInput || this.currentSpeed > 0.1;

    if (this.currentSpeed < 0.14 && !hasMoveInput) {
      this.movementGait = 'idle';
      this.accelerationState = 'idle';
    } else {
      if (this.isSprinting && this.currentSpeed > 5.4) {
        this.movementGait = 'sprint';
      } else if (this.currentSpeed >= 3.45) {
        this.movementGait = 'run';
      } else {
        this.movementGait = 'walk';
      }

      if (!hasMoveInput && this.currentSpeed > 0.14) {
        this.accelerationState = 'stopping';
      } else if (this.currentSpeed - prevSpeed > 0.08 && this.currentSpeed < Math.hypot(targetVx, targetVz) * 0.9) {
        this.accelerationState = 'starting';
      } else {
        this.accelerationState = 'steady';
      }
    }

    // Integrate horizontal displacement
    const stepX = this.vx * safeDt;
    const stepZ = this.vz * safeDt;
    const clamped = clampToDistrictLand(this.position.x + stepX, this.position.z + stepZ);
    let nextX = clamped.x;
    let nextZ = clamped.z;

    const resolved = this.resolveCollisions(nextX, nextZ, dynamicObstacles);
    nextX = resolved.x;
    nextZ = resolved.z;

    // Sample terrain height & local slope along movement heading
    const prevGroundY = this.groundHeightFn(this.position.x, this.position.z);
    const nextGroundY = this.groundHeightFn(nextX, nextZ);
    const stepDist = Math.hypot(nextX - this.position.x, nextZ - this.position.z);
    if (stepDist > 0.004) {
      this.groundSlope = THREE.MathUtils.clamp((nextGroundY - prevGroundY) / stepDist, -1, 1);
    } else {
      const fwdX = Math.sin(this.heading);
      const fwdZ = Math.cos(this.heading);
      const aheadY = this.groundHeightFn(nextX + fwdX * 0.4, nextZ + fwdZ * 0.4);
      this.groundSlope = THREE.MathUtils.clamp((aheadY - nextGroundY) / 0.4, -1, 1);
    }

    this.position.x = nextX;
    this.position.z = nextZ;

    // Gravity, Jump & Smooth Curb Stepping
    if (useSmoothing && input.justPressed.jump && this.isGrounded) {
      this.verticalVelocity = 5.0;
      this.isGrounded = false;
    }

    if (useSmoothing && (!this.isGrounded || this.position.y > nextGroundY + 0.04)) {
      this.verticalVelocity -= 18.0 * safeDt;
      this.position.y += this.verticalVelocity * safeDt;
      if (this.position.y <= nextGroundY) {
        this.position.y = nextGroundY;
        this.verticalVelocity = 0;
        this.isGrounded = true;
      } else {
        this.isGrounded = false;
      }
      this.visualY = THREE.MathUtils.damp(this.visualY, this.position.y, 28, safeDt);
    } else {
      this.position.y = nextGroundY;
      this.verticalVelocity = 0;
      this.isGrounded = true;
      // Smooth minor curb elevation changes (0.02m <-> 0.18m) visually so feet never pop
      this.visualY = useSmoothing
        ? THREE.MathUtils.damp(this.visualY, nextGroundY, 20, safeDt)
        : nextGroundY;
    }

    // Smooth rotational turn with turnRate telemetry for character leaning
    if (hasMoveInput) {
      const deltaAngle = normalizeAngle(targetHeading - this.heading);
      const turnAlpha = 1 - Math.exp(-12 * safeDt);
      const stepAngle = deltaAngle * turnAlpha;
      this.heading = normalizeAngle(this.heading + stepAngle);
      this.turnRate = stepAngle / safeDt;
    } else {
      this.turnRate = THREE.MathUtils.damp(this.turnRate, 0, 14, safeDt);
    }

    return this.getState();
  }

  getState(): PlayerMoveResult {
    return {
      x: this.position.x,
      y: this.position.y,
      visualY: this.visualY,
      z: this.position.z,
      vx: this.vx,
      vz: this.vz,
      verticalVelocity: this.verticalVelocity,
      isGrounded: this.isGrounded,
      heading: this.heading,
      turnRate: this.turnRate,
      groundSlope: this.groundSlope,
      isMoving: this.isMoving,
      isSprinting: this.isSprinting,
      speed: this.currentSpeed,
      movementGait: this.movementGait,
      accelerationState: this.accelerationState,
    };
  }

  private resolveCollisions(
    x: number,
    z: number,
    dynamicObstacles?: PlayerDynamicObstacles,
  ): { x: number; z: number } {
    let rx = x;
    let rz = z;
    const r = this.colliderRadius;

    for (let iter = 0; iter < 3; iter++) {
      // 1. Static buildings, walls, Tea Peedika booths & parked vehicles
      for (let i = 0; i < this.colliders.length; i++) {
        const box = this.colliders[i];
        const closestX = Math.max(box.minX, Math.min(rx, box.maxX));
        const closestZ = Math.max(box.minZ, Math.min(rz, box.maxZ));
        const dx = rx - closestX;
        const dz = rz - closestZ;
        const distSq = dx * dx + dz * dz;

        if (distSq < r * r) {
          if (distSq > 1e-8) {
            const dist = Math.sqrt(distSq);
            const push = r - dist;
            rx += (dx / dist) * push;
            rz += (dz / dist) * push;
          } else {
            const leftPen = rx - box.minX;
            const rightPen = box.maxX - rx;
            const topPen = rz - box.minZ;
            const botPen = box.maxZ - rz;
            const minPen = Math.min(leftPen, rightPen, topPen, botPen);
            if (minPen === leftPen) rx = box.minX - r;
            else if (minPen === rightPen) rx = box.maxX + r;
            else if (minPen === topPen) rz = box.minZ - r;
            else rz = box.maxZ + r;
          }
        }
      }

      // 2. Moving road traffic oriented bounding box separation
      const vehicles = dynamicObstacles?.vehicles;
      if (vehicles) {
        for (let i = 0; i < vehicles.length; i++) {
          const v = vehicles[i];
          const dx = rx - v.x;
          const dz = rz - v.z;
          if (dx * dx + dz * dz > 49) continue; // >7m away quick reject

          const sinH = Math.sin(v.heading);
          const cosH = Math.cos(v.heading);
          // Transform player point into vehicle local space (forward = +Z, right = +X)
          const localZ = dx * sinH + dz * cosH;
          const localX = dx * cosH - dz * sinH;
          const hw = v.width * 0.5 + 0.05;
          const hl = v.length * 0.5 + 0.05;

          const clampedLX = Math.max(-hw, Math.min(localX, hw));
          const clampedLZ = Math.max(-hl, Math.min(localZ, hl));
          const px = localX - clampedLX;
          const pz = localZ - clampedLZ;
          const dSq = px * px + pz * pz;

          if (dSq < r * r) {
            let pushLX = 0;
            let pushLZ = 0;
            if (dSq > 1e-8) {
              const dist = Math.sqrt(dSq);
              const push = r - dist;
              pushLX = (px / dist) * push;
              pushLZ = (pz / dist) * push;
            } else {
              const penX = hw - Math.abs(localX);
              const penZ = hl - Math.abs(localZ);
              if (penX < penZ) {
                pushLX = (localX >= 0 ? 1 : -1) * (penX + r);
              } else {
                pushLZ = (localZ >= 0 ? 1 : -1) * (penZ + r);
              }
            }
            rx += pushLX * cosH + pushLZ * sinH;
            rz += -pushLX * sinH + pushLZ * cosH;
          }
        }
      }

      // 3. Gentle pedestrian body separation (prevents walking cleanly through NPCs)
      const pedestrians = dynamicObstacles?.pedestrians;
      if (pedestrians) {
        const minPedDist = r + 0.3;
        const minPedDistSq = minPedDist * minPedDist;
        for (let i = 0; i < pedestrians.length; i++) {
          const ped = pedestrians[i];
          const dx = rx - ped.x;
          const dz = rz - ped.z;
          const dSq = dx * dx + dz * dz;
          if (dSq < minPedDistSq) {
            if (dSq > 1e-6) {
              const dist = Math.sqrt(dSq);
              const push = (minPedDist - dist) * 0.65;
              rx += (dx / dist) * push;
              rz += (dz / dist) * push;
            } else {
              rx += minPedDist * 0.5;
            }
          }
        }
      }
    }

    return clampToDistrictLand(rx, rz);
  }
}

