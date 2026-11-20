import * as THREE from 'three';
import type { InputFrameState } from '../input/InputManager.ts';
import type { StaticAabbCollider } from '../player/PlayerController.ts';
import type { CameraRigMode } from '../types.ts';

export type ThirdPersonCameraPreset = 'close' | 'standard' | 'wide';

interface CameraPresetConfig {
  distance: number;
  pitch: number;
  focusHeight: number;
}

const CAMERA_PRESET_CONFIGS: Record<ThirdPersonCameraPreset, CameraPresetConfig> = {
  close: { distance: 4.1, pitch: 0.22, focusHeight: 1.54 },
  standard: { distance: 6.4, pitch: 0.27, focusHeight: 1.46 },
  wide: { distance: 9.8, pitch: 0.34, focusHeight: 1.4 },
};

const _targetOffset = new THREE.Vector3();
const _desiredPos = new THREE.Vector3();

function intersectRayAabb3D(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number,
): number | null {
  let tmin = 0;
  let tmax = 1;

  const axes: [number, number, number, number][] = [
    [ox, dx, minX, maxX],
    [oy, dy, minY, maxY],
    [oz, dz, minZ, maxZ],
  ];

  for (let i = 0; i < 3; i++) {
    const [o, d, bmin, bmax] = axes[i];
    if (Math.abs(d) < 1e-8) {
      if (o < bmin || o > bmax) return null;
    } else {
      let t1 = (bmin - o) / d;
      let t2 = (bmax - o) / d;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }

  return tmin >= 0 && tmin <= 1 ? tmin : null;
}

export class CameraManager {
  readonly camera: THREE.PerspectiveCamera;
  private mode: CameraRigMode = 'title_orbit';
  private thirdPersonPreset: ThirdPersonCameraPreset = 'standard';

  private orbitYaw = -Math.PI * 0.35;
  private orbitPitch = 0.24;
  private orbitDistance = 42;
  private collisionDistance = 42;

  private targetYaw = -Math.PI * 0.35;
  private targetPitch = 0.24;
  private targetDistance = 42;

  private readonly focusPoint = new THREE.Vector3(8, 2.6, 0);
  private readonly targetFocus = new THREE.Vector3(8, 2.6, 0);

  private colliders: StaticAabbCollider[] = [];
  private groundHeightFn: (x: number, z: number) => number = () => 0.0;
  private distanceScale = 1.0;
  private motionSensitivity = 1.0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(56, Math.max(0.1, aspect), 0.25, 480);
    this.syncCameraImmediate(1);
  }

  setEnvironment(
    colliders: StaticAabbCollider[],
    groundHeightFn: (x: number, z: number) => number,
  ): void {
    this.colliders = colliders;
    this.groundHeightFn = groundHeightFn;
  }

  setDistanceScale(scale: number): void {
    this.distanceScale = THREE.MathUtils.clamp(scale, 0.7, 1.4);
    if (this.mode === 'free_inspect') {
      const cfg = CAMERA_PRESET_CONFIGS[this.thirdPersonPreset];
      this.targetDistance = cfg.distance * this.distanceScale;
    }
  }

  setMotionSensitivity(scale: number): void {
    this.motionSensitivity = THREE.MathUtils.clamp(scale, 0.3, 1.0);
  }

  setMode(mode: CameraRigMode): void {
    this.mode = mode;
    if (mode === 'title_orbit') {
      this.targetPitch = 0.2;
      this.targetDistance = 44;
      this.collisionDistance = 44;
      this.targetFocus.set(8, 2.8, 0);
    } else {
      const cfg = CAMERA_PRESET_CONFIGS[this.thirdPersonPreset];
      this.targetPitch = cfg.pitch;
      this.targetDistance = cfg.distance * this.distanceScale;
    }
  }

  setThirdPersonPreset(preset: ThirdPersonCameraPreset): void {
    this.thirdPersonPreset = preset;
    if (this.mode === 'free_inspect') {
      const cfg = CAMERA_PRESET_CONFIGS[preset];
      this.targetPitch = cfg.pitch;
      this.targetDistance = cfg.distance * this.distanceScale;
    }
  }

  cycleThirdPersonPreset(): ThirdPersonCameraPreset {
    const order: ThirdPersonCameraPreset[] = ['standard', 'wide', 'close'];
    const idx = order.indexOf(this.thirdPersonPreset);
    const next = order[(idx + 1) % order.length];
    this.setThirdPersonPreset(next);
    return next;
  }

  getThirdPersonPreset(): ThirdPersonCameraPreset {
    return this.thirdPersonPreset;
  }

  getMode(): CameraRigMode {
    return this.mode;
  }

  getYaw(): number {
    return this.orbitYaw;
  }

  getFocusState(): { x: number; z: number; yaw: number } {
    return {
      x: this.focusPoint.x,
      z: this.focusPoint.z,
      yaw: this.orbitYaw,
    };
  }

  setAspect(width: number, height: number): void {
    this.camera.aspect = Math.max(0.1, width / Math.max(1, height));
    this.camera.updateProjectionMatrix();
  }

  getStatePreset(): string {
    return `${this.mode}:${this.thirdPersonPreset}:${this.targetFocus.x.toFixed(1)}:${this.targetFocus.z.toFixed(1)}:${this.targetYaw.toFixed(2)}`;
  }

  snapToTarget(pos: THREE.Vector3, yaw?: number): void {
    const focusH = CAMERA_PRESET_CONFIGS[this.thirdPersonPreset].focusHeight;
    this.focusPoint.set(pos.x, pos.y + focusH, pos.z);
    this.targetFocus.copy(this.focusPoint);
    if (yaw !== undefined) {
      this.orbitYaw = yaw;
      this.targetYaw = yaw;
    }
    this.orbitDistance = this.targetDistance;
    this.collisionDistance = this.targetDistance;
    this.orbitPitch = this.targetPitch;
    this.syncCameraImmediate(1);
  }

  /**
   * Updates camera independently of movement joystick/WASD.
   * Handles smooth target following, touch/mouse look, zoom, and wall/ground collision avoidance.
   */
  update(dt: number, input: InputFrameState, playerPos?: THREE.Vector3): void {
    const safeDt = Math.max(1e-4, dt);
    if (this.mode === 'title_orbit') {
      this.targetYaw += safeDt * 0.085;
      this.targetFocus.set(8, 2.8, 0);
    } else {
      const lookScale = 0.65 + 0.35 * this.motionSensitivity;
      this.targetYaw -= input.lookDeltaX * 0.0058 * lookScale;
      this.targetPitch = THREE.MathUtils.clamp(
        this.targetPitch + input.lookDeltaY * 0.0046 * lookScale,
        -0.08,
        1.06,
      );
      this.targetDistance = THREE.MathUtils.clamp(
        this.targetDistance + input.zoomDelta * 1.4,
        2.9,
        18,
      );

      if (playerPos) {
        const focusH = CAMERA_PRESET_CONFIGS[this.thirdPersonPreset].focusHeight;
        this.targetFocus.set(playerPos.x, playerPos.y + focusH, playerPos.z);
      }
    }

    const dampLambda = 6.5 + 4.5 * this.motionSensitivity;
    this.orbitYaw = THREE.MathUtils.damp(this.orbitYaw, this.targetYaw, dampLambda, safeDt);
    this.orbitPitch = THREE.MathUtils.damp(this.orbitPitch, this.targetPitch, dampLambda, safeDt);
    this.orbitDistance = THREE.MathUtils.damp(this.orbitDistance, this.targetDistance, dampLambda, safeDt);
    this.focusPoint.x = THREE.MathUtils.damp(this.focusPoint.x, this.targetFocus.x, 14, safeDt);
    this.focusPoint.y = THREE.MathUtils.damp(this.focusPoint.y, this.targetFocus.y, 14, safeDt);
    this.focusPoint.z = THREE.MathUtils.damp(this.focusPoint.z, this.targetFocus.z, 14, safeDt);

    this.syncCameraImmediate(safeDt);
  }

  private computeSafeDistance(desiredDist: number): number {
    if (this.mode !== 'free_inspect' || this.colliders.length === 0) {
      return desiredDist;
    }

    const horiz = Math.cos(this.orbitPitch) * desiredDist;
    const vert = Math.sin(this.orbitPitch) * desiredDist;
    const dx = Math.sin(this.orbitYaw) * horiz;
    const dy = vert;
    const dz = Math.cos(this.orbitYaw) * horiz;

    const fx = this.focusPoint.x;
    const fy = this.focusPoint.y;
    const fz = this.focusPoint.z;

    let minHitT = 1.0;
    const pad = 0.35;

    for (let i = 0; i < this.colliders.length; i++) {
      const box = this.colliders[i];
      // Quick broad-phase rejection outside camera arm reach
      if (
        fx + desiredDist + 1 < box.minX ||
        fx - desiredDist - 1 > box.maxX ||
        fz + desiredDist + 1 < box.minZ ||
        fz - desiredDist - 1 > box.maxZ
      ) {
        continue;
      }
      const boxTopY = box.maxY ?? (box.kind === 'wall' ? 1.55 : box.kind === 'vehicle' ? 1.85 : 7.5);
      const t = intersectRayAabb3D(
        fx,
        fy,
        fz,
        dx,
        dy,
        dz,
        box.minX - pad,
        box.maxX + pad,
        -0.5,
        boxTopY + 0.18,
        box.minZ - pad,
        box.maxZ + pad,
      );
      if (t !== null && t < minHitT) {
        minHitT = t;
      }
    }

    if (minHitT < 1.0) {
      return Math.max(1.25, desiredDist * minHitT - 0.15);
    }
    return desiredDist;
  }

  private syncCameraImmediate(dt: number): void {
    const safeTargetDist = this.computeSafeDistance(this.orbitDistance);
    if (safeTargetDist < this.collisionDistance) {
      // Pull camera in rapidly so it never passes inside a wall or building
      this.collisionDistance =
        dt >= 1 ? safeTargetDist : THREE.MathUtils.damp(this.collisionDistance, safeTargetDist, 24, dt);
    } else {
      // Recover outward smoothly once obstacle clears
      this.collisionDistance =
        dt >= 1 ? safeTargetDist : THREE.MathUtils.damp(this.collisionDistance, safeTargetDist, 7.5, dt);
    }

    const activeDist = this.mode === 'free_inspect' ? this.collisionDistance : this.orbitDistance;
    const horiz = Math.cos(this.orbitPitch) * activeDist;
    const vert = Math.sin(this.orbitPitch) * activeDist;

    _targetOffset.set(
      Math.sin(this.orbitYaw) * horiz,
      vert,
      Math.cos(this.orbitYaw) * horiz,
    );
    _desiredPos.copy(this.focusPoint).add(_targetOffset);

    // Prevent camera from clipping below terrain, slopes, or sidewalks
    const camGroundY = this.groundHeightFn(_desiredPos.x, _desiredPos.z);
    const midGroundY = this.groundHeightFn(
      (this.focusPoint.x + _desiredPos.x) * 0.5,
      (this.focusPoint.z + _desiredPos.z) * 0.5,
    );
    const minCamY = Math.max(0.62, Math.max(camGroundY, midGroundY) + 0.58);
    if (_desiredPos.y < minCamY) {
      _desiredPos.y = minCamY;
    }

    this.camera.position.copy(_desiredPos);
    this.camera.lookAt(this.focusPoint);
  }
}
