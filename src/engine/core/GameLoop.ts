export interface GameLoopCallbacks {
  onFixedStep: (fixedDt: number) => void;
  onRender: (alpha: number, frameDt: number) => void;
  scheduleSoftwareFrame?: (callback: () => void) => number;
  cancelSoftwareFrame?: (handle: number) => void;
}

export interface GameLoopOptions {
  fixedDt?: number;
  maxRawDt?: number;
  maxStepsPerFrame?: number;
  isSoftwareGl?: boolean;
}

export class GameLoop {
  readonly fixedDt: number;
  readonly maxRawDt: number;
  readonly maxStepsPerFrame: number;
  private readonly isSoftwareGl: boolean;
  private readonly callbacks: GameLoopCallbacks;

  private running = false;
  private paused = false;
  private accumulator = 0;
  private lastTimestampMs = 0;
  private frameHandle = 0;
  private usingSoftwareSchedule = false;

  constructor(callbacks: GameLoopCallbacks, options: GameLoopOptions = {}) {
    this.callbacks = callbacks;
    this.fixedDt = options.fixedDt ?? 1 / 60;
    this.maxRawDt = options.maxRawDt ?? 0.05;
    this.maxStepsPerFrame = options.maxStepsPerFrame ?? 4;
    this.isSoftwareGl = options.isSoftwareGl ?? false;
  }

  start(nowMs: number = typeof performance !== 'undefined' ? performance.now() : Date.now()): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.lastTimestampMs = nowMs;
    this.accumulator = 0;
    this.scheduleNextTick();
  }

  stop(): void {
    if (!this.running) {
      return;
    }
    this.running = false;
    if (this.frameHandle !== 0) {
      if (this.usingSoftwareSchedule && this.callbacks.cancelSoftwareFrame) {
        this.callbacks.cancelSoftwareFrame(this.frameHandle);
      } else if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(this.frameHandle);
      } else {
        clearTimeout(this.frameHandle);
      }
      this.frameHandle = 0;
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      this.accumulator = 0;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  isPaused(): boolean {
    return this.paused;
  }

  /**
   * Executes one deterministic frame advance. Exposed cleanly for headless unit testing.
   */
  advanceFrame(nowMs: number): { clampedDt: number; stepsExecuted: number; alpha: number } {
    const rawDt = Math.max(0, (nowMs - this.lastTimestampMs) / 1000);
    this.lastTimestampMs = nowMs;
    const clampedDt = Math.min(rawDt, this.maxRawDt);

    let stepsExecuted = 0;
    if (!this.paused) {
      this.accumulator += clampedDt;
      while (this.accumulator >= this.fixedDt && stepsExecuted < this.maxStepsPerFrame) {
        this.callbacks.onFixedStep(this.fixedDt);
        this.accumulator -= this.fixedDt;
        stepsExecuted++;
      }
      if (stepsExecuted >= this.maxStepsPerFrame && this.accumulator > this.fixedDt) {
        // Drop residual spiral-of-death time when device severely stalls.
        this.accumulator = 0;
      }
    }

    const alpha = this.paused ? 0 : this.accumulator / this.fixedDt;
    this.callbacks.onRender(alpha, clampedDt);

    return { clampedDt, stepsExecuted, alpha };
  }

  private readonly tick = (): void => {
    if (!this.running) {
      return;
    }
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.advanceFrame(nowMs);
    if (this.running) {
      this.scheduleNextTick();
    }
  };

  private scheduleNextTick(): void {
    if (this.isSoftwareGl && this.callbacks.scheduleSoftwareFrame) {
      this.usingSoftwareSchedule = true;
      this.frameHandle = this.callbacks.scheduleSoftwareFrame(this.tick);
      return;
    }

    this.usingSoftwareSchedule = false;
    if (typeof requestAnimationFrame !== 'undefined') {
      this.frameHandle = requestAnimationFrame(this.tick);
    } else {
      this.frameHandle = Number(setTimeout(this.tick, 16));
    }
  }
}
