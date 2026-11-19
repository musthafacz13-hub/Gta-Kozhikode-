export type InputAction = 'sprint' | 'jump' | 'interact' | 'pause' | 'toggle_camera';

export interface InputFrameState {
  moveX: number;
  moveY: number;
  lookDeltaX: number;
  lookDeltaY: number;
  zoomDelta: number;
  held: Record<InputAction, boolean>;
  justPressed: Record<InputAction, boolean>;
}

const KEY_TO_ACTION: Record<string, InputAction> = {
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  Space: 'jump',
  KeyE: 'interact',
  Escape: 'pause',
  KeyV: 'toggle_camera',
};

export class InputManager {
  private readonly heldKeys = new Set<string>();
  private readonly heldActions: Record<InputAction, boolean> = {
    sprint: false,
    jump: false,
    interact: false,
    pause: false,
    toggle_camera: false,
  };
  private readonly pendingJustPressed: Record<InputAction, boolean> = {
    sprint: false,
    jump: false,
    interact: false,
    pause: false,
    toggle_camera: false,
  };

  private lookDeltaX = 0;
  private lookDeltaY = 0;
  private zoomDelta = 0;
  private virtualMoveX = 0;
  private virtualMoveY = 0;
  private sensitivity = 1.0;

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
    const action = KEY_TO_ACTION[e.code];
    if (action) {
      if (!this.heldActions[action]) {
        this.pendingJustPressed[action] = true;
      }
      this.heldActions[action] = true;
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.heldKeys.delete(e.code);
    const action = KEY_TO_ACTION[e.code];
    if (action) {
      let stillHeld = false;
      for (const [code, mapped] of Object.entries(KEY_TO_ACTION)) {
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
    if (this.boundTarget && e.target instanceof Node) {
      const targetEl = e.target as HTMLElement;
      if (targetEl.closest?.('[data-hud-control="true"]')) {
        return;
      }
    }
    this.lookPointerId = e.pointerId;
    this.lastLookX = e.clientX;
    this.lastLookY = e.clientY;
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (this.lookPointerId !== e.pointerId) {
      return;
    }
    const dx = e.clientX - this.lastLookX;
    const dy = e.clientY - this.lastLookY;
    this.lastLookX = e.clientX;
    this.lastLookY = e.clientY;
    this.lookDeltaX += dx * this.sensitivity;
    this.lookDeltaY += dy * this.sensitivity;
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

  private readonly onVisibilityChange = (): void => {
    if (typeof document !== 'undefined' && document.hidden) {
      this.clearAll();
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
      window.addEventListener('pointermove', this.onPointerMove);
      window.addEventListener('pointerup', this.onPointerUpOrCancel);
      window.addEventListener('pointercancel', this.onPointerUpOrCancel);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
    target.addEventListener('pointerdown', this.onPointerDown);
    target.addEventListener('wheel', this.onWheel, { passive: false });
  }

  detach(): void {
    if (!this.attached) {
      return;
    }
    this.attached = false;
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
      window.removeEventListener('blur', this.onWindowBlur);
      window.removeEventListener('pointermove', this.onPointerMove);
      window.removeEventListener('pointerup', this.onPointerUpOrCancel);
      window.removeEventListener('pointercancel', this.onPointerUpOrCancel);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    if (this.boundTarget) {
      this.boundTarget.removeEventListener('pointerdown', this.onPointerDown);
      this.boundTarget.removeEventListener('wheel', this.onWheel);
      this.boundTarget = null;
    }
    this.clearAll();
  }

  setSensitivity(value: number): void {
    this.sensitivity = Math.max(0.25, Math.min(3.0, value));
  }

  setVirtualAxes(x: number, y: number): void {
    const safeX = Number.isFinite(x) ? x : 0;
    const safeY = Number.isFinite(y) ? y : 0;
    const len = Math.hypot(safeX, safeY);
    if (len > 1) {
      this.virtualMoveX = safeX / len;
      this.virtualMoveY = safeY / len;
    } else {
      this.virtualMoveX = safeX;
      this.virtualMoveY = safeY;
    }
  }

  getActiveLookPointerId(): number | null {
    return this.lookPointerId;
  }

  /**
   * Programmatic look/camera-drag helper for unit testing simultaneous multi-touch & camera isolation.
   */
  addLookDelta(dx: number, dy: number): void {
    this.lookDeltaX += dx * this.sensitivity;
    this.lookDeltaY += dy * this.sensitivity;
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

    const state: InputFrameState = {
      moveX,
      moveY,
      lookDeltaX: this.lookDeltaX,
      lookDeltaY: this.lookDeltaY,
      zoomDelta: this.zoomDelta,
      held: { ...this.heldActions },
      justPressed: { ...this.pendingJustPressed },
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
