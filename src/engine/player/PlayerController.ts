import * as THREE from 'three';
import type { InputFrameState } from '../input/InputManager.ts';
import { getCoastlineXAtZ } from '../world/GeoProjection.ts';
import { KOZHIKODE_WORLD_BOUNDS } from '../world/KozhikodeGeography.ts';

export interface StaticAabbCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface PlayerMoveResult {
  x: number;
  y: number;
  z: number;
  heading: number;
  isMoving: boolean;
  isSprinting: boolean;
  speed: number;
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
  heading = -Math.PI * 0.35;
  isMoving = false;
  isSprinting = false;
  currentSpeed = 0;

  readonly walkSpeed = 4.8;
  readonly sprintSpeed = 8.6;
  readonly colliderRadius = 0.42;

  private colliders: StaticAabbCollider[] = [];
  private groundHeightFn: (x: number, z: number) => number = () => 0.18;

  setEnvironment(
    colliders: StaticAabbCollider[],
    groundHeightFn: (x: number, z: number) => number,
  ): void {
    this.colliders = colliders;
    this.groundHeightFn = groundHeightFn;
    this.position.y = this.groundHeightFn(this.position.x, this.position.z);
  }

  resetSpawn(x = 22.5, z = 2.5, heading = -Math.PI * 0.35): void {
    const safe = clampToDistrictLand(x, z);
    this.position.set(safe.x, this.groundHeightFn(safe.x, safe.z), safe.z);
    this.heading = heading;
    this.isMoving = false;
    this.isSprinting = false;
    this.currentSpeed = 0;
  }

  /**
   * Advances foundational Phase 1 camera-relative ground movement.
   * Camera yaw convention: camera sits at +sin(yaw), +cos(yaw) looking toward origin,
   * so camera forward on XZ plane is (-sin(yaw), -cos(yaw)) and camera right is (cos(yaw), -sin(yaw)).
   */
  update(dt: number, input: InputFrameState, cameraYaw: number): PlayerMoveResult {
    const rawX = input.moveX;
    const rawY = input.moveY;
    const mag = Math.hypot(rawX, rawY);

    if (mag < 0.05) {
      this.isMoving = false;
      this.isSprinting = false;
      this.currentSpeed = 0;
      this.position.y = this.groundHeightFn(this.position.x, this.position.z);
      return this.getState();
    }

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

    this.isMoving = true;
    this.isSprinting = Boolean(input.held.sprint);
    const maxSpeed = this.isSprinting ? this.sprintSpeed : this.walkSpeed;
    this.currentSpeed = maxSpeed * clampedMag;

    const stepDist = this.currentSpeed * dt;
    const clamped = clampToDistrictLand(
      this.position.x + unitX * stepDist,
      this.position.z + unitZ * stepDist,
    );
    let nextX = clamped.x;
    let nextZ = clamped.z;

    const resolved = this.resolveCollisions(nextX, nextZ);
    nextX = resolved.x;
    nextZ = resolved.z;

    this.position.x = nextX;
    this.position.z = nextZ;
    this.position.y = this.groundHeightFn(nextX, nextZ);

    const targetHeading = Math.atan2(unitX, unitZ);
    const deltaAngle = normalizeAngle(targetHeading - this.heading);
    const turnAlpha = 1 - Math.exp(-12 * dt);
    this.heading = normalizeAngle(this.heading + deltaAngle * turnAlpha);

    return this.getState();
  }

  getState(): PlayerMoveResult {
    return {
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
      heading: this.heading,
      isMoving: this.isMoving,
      isSprinting: this.isSprinting,
      speed: this.currentSpeed,
    };
  }

  private resolveCollisions(x: number, z: number): { x: number; z: number } {
    let rx = x;
    let rz = z;
    const r = this.colliderRadius;

    for (let iter = 0; iter < 2; iter++) {
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
            // Center inside box: push out along nearest edge
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
    }

    return clampToDistrictLand(rx, rz);
  }
}
