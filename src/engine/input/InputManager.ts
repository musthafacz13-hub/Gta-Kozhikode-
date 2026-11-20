export type InputAction =
  | 'sprint'
  | 'walk'
  | 'jump'
  | 'interact'
  | 'pause'
  | 'toggle_camera'
  | 'map'
  | 'horn';

export interface InputVehicleFrameState {
  throttle: number;
  brakeReverse: number;
  steer: number;
  handbrake: boolean;
  hornJustPressed: boolean;
}

export interface InputFrameState {
  moveX: number;
  moveY: number;
  lookDeltaX: number;
  lookDeltaY: number;
  zoomDelta: number;
  held: Record<InputAction, boolean>;
  justPressed: Record<InputAction, boolean>;
  vehicle: InputVehicleFrameState;
}

const DEFAULT_KEY_TO_ACTION: Record<string, InputAction> = {
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  AltLeft: 'walk',
  KeyC: 'walk',
  Space: 'jump',
  KeyE: 'interact',
  Escape: 'pause',
  KeyV: 'toggle_camera',
  KeyM: 'map',
  KeyH: 'horn',
};

export class InputManager {
  private readonly heldKeys = new Set<string>();
  private keyToAction: Record<string, InputAction> = { ...DEFAULT_KEY_TO_ACTION };

  private readonly heldActions: Record<InputAction, boolean> = {
    sprint: false,
    walk: false,
    jump: false,
    interact: false,
    pause: false,
    toggle_camera: false,
    map: false,
    horn: false,
  };
  private readonly pendingJustPressed: Record<InputAction, boolean> = {
    sprint: false,
    walk: false,
    jump: false,
    interact: false,
    pause: false,
    toggle_camera: false,
    map: false,
    horn: false,
  };

  private lookDeltaX = 0;
  private lookDeltaY = 0;
  private zoomDelta = 0;
  private virtualMoveX = 0;
  private virtualMoveY = 0;

  private virtualVehicleSteer = 0;
  private virtualVehicleThrottle = 0;
  private virtualVehicleBrakeReverse = 0;
  private virtualVehicleHandbrake = false;

  private cameraTouchSensitivity = 1.0;
  private mouseSensitivity = 1.0;
  private joystickSensitivity = 1.0;
  private joystickDeadzone = 0.08;
  private touchRegionMode: 'right' | 'left' | 'any' = 'right';
  private desktopPointerLockEnabled = false;
  private pointerLocked = false;

  private lookPointerId: number | null = null;
  private lastLookX = 0;
  private lastLookY = 0;

  private boundTarget: HTMLElement | null = null;
  private attached = false;

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) {
      return;
    }
    this.heldKeys.add(e.code);
    const action = this.keyToAction[e.code];
    if (action) {
      if (!this.heldActions[action]) {
        this.pendingJustPressed[action] = true;
      }
      this.heldActions[action] = true;
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.heldKeys.delete(e.code);
    const action = this.keyToAction[e.code];
    if (action) {
      let stillHeld = false;
      for (const [code, mapped] of Object.entries(this.keyToAction)) {
        if (mapped === action && this.heldKeys.has(code)) {
          stillHeld = true;
          break;
        }
      }
      this.heldActions[action] = stillHeld;
    }
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (this.lookPointerId !== null) {
      return;
    }
    // Only claim touches that directly hit the camera surface (canvas/host), never HUD controls.
    if (this.boundTarget && typeof Node !== 'undefined' && e.target instanceof Node) {
      const targetEl = e.target as HTMLElement;
      if (targetEl.closest?.('[data-hud-control="true"]')) {
        return;
      }
    }

    // For touch pointers on mobile landscape, isolate camera touches to the camera side
    // so an accidental 5px miss next to the movement joystick never snaps the camera.
    if (
      e.pointerType === 'touch' &&
      this.touchRegionMode !== 'any' &&
      this.boundTarget &&
      typeof this.boundTarget.getBoundingClientRect === 'function'
    ) {
      const rect = this.boundTarget.getBoundingClientRect();
      if (rect.width > 0) {
        const relX = (e.clientX - rect.left) / rect.width;
        if (this.touchRegionMode === 'right' && relX < 0.36) {
          return;
        }
        if (this.touchRegionMode === 'left' && relX > 0.64) {
          return;
        }
      }
    }

    // Optional desktop pointer lock on canvas mouse click
    if (
      this.desktopPointerLockEnabled &&
      e.pointerType === 'mouse' &&
      e.button === 0 &&
      this.boundTarget &&
      typeof document !== 'undefined' &&
      document.pointerLockElement !== this.boundTarget &&
      typeof this.boundTarget.requestPointerLock === 'function'
    ) {
      try {
        const maybePromise = this.boundTarget.requestPointerLock() as unknown;
        if (
          maybePromise &&
          typeof (maybePromise as Promise<void>).catch === 'function'
        ) {
          (maybePromise as Promise<void>).catch(() => {
            // Ignore pointer-lock rejection inside sandboxed iframes cleanly
          });
        }
      } catch {
        // Fallback smoothly to drag look
      }
    }

    this.lookPointerId = e.pointerId;
    this.lastLookX = e.clientX;
    this.lastLookY = e.clientY;
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (
      typeof document !== 'undefined' &&
      this.boundTarget &&
      document.pointerLockElement === this.boundTarget
    ) {
      const mx = Number.isFinite(e.movementX) ? e.movementX : 0;
      const my = Number.isFinite(e.movementY) ? e.movementY : 0;
      this.lookDeltaX += mx * this.mouseSensitivity;
      this.lookDeltaY += my * this.mouseSensitivity;
      return;
    }

    if (this.lookPointerId !== e.pointerId) {
      return;
    }
    const dx = e.clientX - this.lastLookX;
    const dy = e.clientY - this.lastLookY;
    this.lastLookX = e.clientX;
    this.lastLookY = e.clientY;
    const sens = e.pointerType === 'mouse' ? this.mouseSensitivity : this.cameraTouchSensitivity;
    this.lookDeltaX += dx * sens;
    this.lookDeltaY += dy * sens;
  };

  private readonly onPointerUpOrCancel = (e: PointerEvent): void => {
    if (this.lookPointerId !== e.pointerId) {
      return;
    }
    this.lookPointerId = null;
  };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.zoomDelta += Math.sign(e.deltaY) * Math.min(2, Math.abs(e.deltaY) * 0.01);
  };

  private readonly onWindowBlur = (): void => {
    this.clearAll();
  };

  private readonly onOrientationChange = (): void => {
    this.clearAll();
  };

  private readonly onVisibilityChange = (): void => {
    if (typeof document !== 'undefined' && document.hidden) {
      this.clearAll();
      this.releasePointerLock();
    }
  };

  private readonly onPointerLockChange = (): void => {
    if (typeof document === 'undefined') return;
    this.pointerLocked = Boolean(this.boundTarget && document.pointerLockElement === this.boundTarget);
    if (!this.pointerLocked) {
      this.lookPointerId = null;
    }
  };

  attach(target: HTMLElement): void {
    if (this.attached) {
      this.detach();
    }
    this.boundTarget = target;
    this.attached = true;
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.onKeyDown);
      window.addEventListener('keyup', this.onKeyUp);
      window.addEventListener('blur', this.onWindowBlur);
      window.addEventListener('orientationchange', this.onOrientationChange);
      window.addEventListener('pointermove', this.onPointerMove);
      window.addEventListener('pointerup', this.onPointerUpOrCancel);
      window.addEventListener('pointercancel', this.onPointerUpOrCancel);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
      document.addEventListener('pointerlockchange', this.onPointerLockChange);
    }
    target.addEventListener('pointerdown', this.onPointerDown);
    target.addEventListener('wheel', this.onWheel, { passive: false });
  }

  detach(): void {
    if (!this.attached) {
      return;
    }
    this.attached = false;
    this.releasePointerLock();
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
      window.removeEventListener('blur', this.onWindowBlur);
      window.removeEventListener('orientationchange', this.onOrientationChange);
      window.removeEventListener('pointermove', this.onPointerMove);
      window.removeEventListener('pointerup', this.onPointerUpOrCancel);
      window.removeEventListener('pointercancel', this.onPointerUpOrCancel);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    }
    if (this.boundTarget) {
      this.boundTarget.removeEventListener('pointerdown', this.onPointerDown);
      this.boundTarget.removeEventListener('wheel', this.onWheel);
      this.boundTarget = null;
    }
    this.clearAll();
  }

  getKeyBindings(): Record<string, InputAction> {
    return { ...this.keyToAction };
  }

  setKeyBinding(code: string, action: InputAction | null): void {
    if (action === null) {
      delete this.keyToAction[code];
    } else {
      this.keyToAction[code] = action;
    }
  }

  resetKeyBindings(): void {
    this.keyToAction = { ...DEFAULT_KEY_TO_ACTION };
  }

  setSensitivity(value: number): void {
    const clamped = Math.max(0.25, Math.min(3.0, value));
    this.cameraTouchSensitivity = clamped;
    this.mouseSensitivity = clamped;
  }

  setCameraTouchSensitivity(value: number): void {
    this.cameraTouchSensitivity = Math.max(0.25, Math.min(3.0, value));
  }

  setMouseSensitivity(value: number): void {
    this.mouseSensitivity = Math.max(0.25, Math.min(3.0, value));
  }

  setJoystickConfig(deadzone: number, sensitivity: number): void {
    this.joystickDeadzone = Math.max(0.02, Math.min(0.25, deadzone));
    this.joystickSensitivity = Math.max(0.5, Math.min(1.6, sensitivity));
  }

  getJoystickConfig(): { deadzone: number; sensitivity: number } {
    return {
      deadzone: this.joystickDeadzone,
      sensitivity: this.joystickSensitivity,
    };
  }

  setTouchRegionMode(mode: 'right' | 'left' | 'any'): void {
    this.touchRegionMode = mode;
  }

  enableDesktopPointerLock(enabled: boolean): void {
    this.desktopPointerLockEnabled = enabled;
    if (!enabled) {
      this.releasePointerLock();
    }
  }

  isPointerLocked(): boolean {
    return this.pointerLocked;
  }

  releasePointerLock(): void {
    this.pointerLocked = false;
    if (
      typeof document !== 'undefined' &&
      document.pointerLockElement &&
      typeof document.exitPointerLock === 'function'
    ) {
      try {
        document.exitPointerLock();
      } catch {
        // Ignore if document is not pointer-locked
      }
    }
  }

  setVirtualAxes(x: number, y: number): void {
    const safeX = Number.isFinite(x) ? x : 0;
    const safeY = Number.isFinite(y) ? y : 0;
    const len = Math.hypot(safeX, safeY);
    if (len < this.joystickDeadzone) {
      this.virtualMoveX = 0;
      this.virtualMoveY = 0;
      return;
    }
    if (len > 1) {
      this.virtualMoveX = safeX / len;
      this.virtualMoveY = safeY / len;
    } else {
      this.virtualMoveX = safeX;
      this.virtualMoveY = safeY;
    }
  }

  setVehicleVirtualControls(patch: {
    steer?: number;
    throttle?: number;
    brakeReverse?: number;
    handbrake?: boolean;
  }): void {
    if (patch.steer !== undefined) {
      const s = Number.isFinite(patch.steer) ? Math.max(-1, Math.min(1, patch.steer)) : 0;
      this.virtualVehicleSteer = Math.abs(s) < 0.04 ? 0 : s;
    }
    if (patch.throttle !== undefined) {
      this.virtualVehicleThrottle = Number.isFinite(patch.throttle)
        ? Math.max(0, Math.min(1, patch.throttle))
        : 0;
    }
    if (patch.brakeReverse !== undefined) {
      this.virtualVehicleBrakeReverse = Number.isFinite(patch.brakeReverse)
        ? Math.max(0, Math.min(1, patch.brakeReverse))
        : 0;
    }
    if (patch.handbrake !== undefined) {
      this.virtualVehicleHandbrake = Boolean(patch.handbrake);
    }
  }

  clearVehicleVirtualControls(): void {
    this.virtualVehicleSteer = 0;
    this.virtualVehicleThrottle = 0;
    this.virtualVehicleBrakeReverse = 0;
    this.virtualVehicleHandbrake = false;
  }

  getActiveLookPointerId(): number | null {
    return this.lookPointerId;
  }

  /**
   * Programmatic look/camera-drag helper for unit testing simultaneous multi-touch & camera isolation.
   */
  addLookDelta(dx: number, dy: number): void {
    this.lookDeltaX += dx * this.cameraTouchSensitivity;
    this.lookDeltaY += dy * this.cameraTouchSensitivity;
  }

  triggerAction(action: InputAction, held = false): void {
    if (held && !this.heldActions[action]) {
      this.pendingJustPressed[action] = true;
    }
    this.heldActions[action] = held;
  }

  simulateKey(code: string, pressed: boolean): void {
    if (pressed) {
      this.onKeyDown({ code, repeat: false } as KeyboardEvent);
    } else {
      this.onKeyUp({ code } as KeyboardEvent);
    }
  }

  clearAll(): void {
    this.heldKeys.clear();
    this.lookPointerId = null;
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.zoomDelta = 0;
    this.virtualMoveX = 0;
    this.virtualMoveY = 0;
    this.clearVehicleVirtualControls();
    for (const key of Object.keys(this.heldActions) as InputAction[]) {
      this.heldActions[key] = false;
      this.pendingJustPressed[key] = false;
    }
  }

  consumeFrameState(): InputFrameState {
    const keyX =
      (this.heldKeys.has('KeyD') || this.heldKeys.has('ArrowRight') ? 1 : 0) -
      (this.heldKeys.has('KeyA') || this.heldKeys.has('ArrowLeft') ? 1 : 0);
    const keyY =
      (this.heldKeys.has('KeyW') || this.heldKeys.has('ArrowUp') ? 1 : 0) -
      (this.heldKeys.has('KeyS') || this.heldKeys.has('ArrowDown') ? 1 : 0);

    let moveX = keyX !== 0 ? keyX : this.virtualMoveX;
    let moveY = keyY !== 0 ? keyY : this.virtualMoveY;
    const len = Math.hypot(moveX, moveY);
    if (len > 1) {
      moveX /= len;
      moveY /= len;
    }

    const keyThrottle = this.heldKeys.has('KeyW') || this.heldKeys.has('ArrowUp') ? 1 : 0;
    const keyBrakeReverse = this.heldKeys.has('KeyS') || this.heldKeys.has('ArrowDown') ? 1 : 0;
    const vehicleSteer = keyX !== 0 ? keyX : this.virtualVehicleSteer;
    const vehicleThrottle = Math.max(keyThrottle, this.virtualVehicleThrottle);
    const vehicleBrakeReverse = Math.max(keyBrakeReverse, this.virtualVehicleBrakeReverse);
    const vehicleHandbrake = Boolean(this.heldActions.jump || this.virtualVehicleHandbrake);

    const state: InputFrameState = {
      moveX,
      moveY,
      lookDeltaX: this.lookDeltaX,
      lookDeltaY: this.lookDeltaY,
      zoomDelta: this.zoomDelta,
      held: { ...this.heldActions },
      justPressed: { ...this.pendingJustPressed },
      vehicle: {
        throttle: vehicleThrottle,
        brakeReverse: vehicleBrakeReverse,
        steer: vehicleSteer,
        handbrake: vehicleHandbrake,
        hornJustPressed: this.pendingJustPressed.horn,
      },
    };

    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.zoomDelta = 0;
    for (const key of Object.keys(this.pendingJustPressed) as InputAction[]) {
      this.pendingJustPressed[key] = false;
    }

    return state;
  }
}
