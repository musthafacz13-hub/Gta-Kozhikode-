import * as THREE from 'three';
import type { InputFrameState } from '../input/InputManager.ts';
import type { CameraRigMode } from '../types.ts';

const _targetOffset = new THREE.Vector3();
const _desiredPos = new THREE.Vector3();

export class CameraManager {
  readonly camera: THREE.PerspectiveCamera;
  private mode: CameraRigMode = 'title_orbit';

  private orbitYaw = -Math.PI * 0.35;
  private orbitPitch = 0.24;
  private orbitDistance = 42;

  private targetYaw = -Math.PI * 0.35;
  private targetPitch = 0.24;
  private targetDistance = 42;

  private readonly focusPoint = new THREE.Vector3(8, 2.6, 0);
  private readonly targetFocus = new THREE.Vector3(8, 2.6, 0);

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(56, Math.max(0.1, aspect), 0.25, 480);
    this.syncCameraImmediate();
  }

  setMode(mode: CameraRigMode): void {
    this.mode = mode;
    if (mode === 'title_orbit') {
      this.targetPitch = 0.2;
      this.targetDistance = 44;
      this.targetFocus.set(8, 2.8, 0);
    } else {
      // Third-person chase camera behind provisional protagonist
      this.targetPitch = 0.28;
      this.targetDistance = 7.5;
    }
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
    return `${this.mode}:${this.targetFocus.x.toFixed(1)}:${this.targetFocus.z.toFixed(1)}:${this.targetYaw.toFixed(2)}`;
  }

  /**
   * Updates camera independently of movement joystick/WASD.
   * Only lookDeltaX/Y and zoomDelta alter camera angles/distance;
   * in play mode, focus tracks playerPos smoothly.
   */
  update(dt: number, input: InputFrameState, playerPos?: THREE.Vector3): void {
    if (this.mode === 'title_orbit') {
      this.targetYaw += dt * 0.085;
      this.targetFocus.set(8, 2.8, 0);
    } else {
      this.targetYaw -= input.lookDeltaX * 0.0058;
      this.targetPitch = THREE.MathUtils.clamp(
        this.targetPitch + input.lookDeltaY * 0.0046,
        0.08,
        1.05,
      );
      this.targetDistance = THREE.MathUtils.clamp(
        this.targetDistance + input.zoomDelta * 1.4,
        3.5,
        24,
      );

      if (playerPos) {
        this.targetFocus.set(playerPos.x, playerPos.y + 1.45, playerPos.z);
      }
    }

    this.orbitYaw = THREE.MathUtils.damp(this.orbitYaw, this.targetYaw, 10, dt);
    this.orbitPitch = THREE.MathUtils.damp(this.orbitPitch, this.targetPitch, 10, dt);
    this.orbitDistance = THREE.MathUtils.damp(this.orbitDistance, this.targetDistance, 10, dt);
    this.focusPoint.x = THREE.MathUtils.damp(this.focusPoint.x, this.targetFocus.x, 12, dt);
    this.focusPoint.y = THREE.MathUtils.damp(this.focusPoint.y, this.targetFocus.y, 12, dt);
    this.focusPoint.z = THREE.MathUtils.damp(this.focusPoint.z, this.targetFocus.z, 12, dt);

    this.syncCameraImmediate();
  }

  private syncCameraImmediate(): void {
    const horiz = Math.cos(this.orbitPitch) * this.orbitDistance;
    const vert = Math.sin(this.orbitPitch) * this.orbitDistance;
    _targetOffset.set(
      Math.sin(this.orbitYaw) * horiz,
      vert,
      Math.cos(this.orbitYaw) * horiz,
    );
    _desiredPos.copy(this.focusPoint).add(_targetOffset);
    if (_desiredPos.y < 0.75) {
      _desiredPos.y = 0.75;
    }
    this.camera.position.copy(_desiredPos);
    this.camera.lookAt(this.focusPoint);
  }
}
