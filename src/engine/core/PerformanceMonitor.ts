import type { PerformanceMetrics } from '../types.ts';

interface MemoryCapablePerformance extends Performance {
  memory?: {
    usedJSHeapSize: number;
  };
}

export class PerformanceMonitor {
  private readonly sampleCapacity: number;
  private readonly frameSamplesMs: Float64Array;
  private readonly wallDeltaSamplesMs: Float64Array;
  private sampleCount = 0;
  private writeIndex = 0;
  private lastStepMs = 0;
  private activeFixedSteps = 0;
  private lastAdaptiveSwitchMs = 0;

  private drawCalls = 0;
  private triangles = 0;
  private geometries = 0;
  private textures = 0;

  private readonly scratchSort: number[] = [];

  constructor(sampleCapacity = 120) {
    this.sampleCapacity = Math.max(10, sampleCapacity);
    this.frameSamplesMs = new Float64Array(this.sampleCapacity);
    this.wallDeltaSamplesMs = new Float64Array(this.sampleCapacity);
  }

  recordFrame(cpuMs: number, fixedSteps: number, frameDtSeconds?: number): void {
    const safeMs = Number.isFinite(cpuMs) && cpuMs >= 0 ? cpuMs : 0;
    const wallMs =
      typeof frameDtSeconds === 'number' && Number.isFinite(frameDtSeconds) && frameDtSeconds > 0
        ? frameDtSeconds * 1000
        : safeMs;

    this.frameSamplesMs[this.writeIndex] = safeMs;
    this.wallDeltaSamplesMs[this.writeIndex] = wallMs;
    this.writeIndex = (this.writeIndex + 1) % this.sampleCapacity;
    if (this.sampleCount < this.sampleCapacity) {
      this.sampleCount++;
    }
    this.lastStepMs = safeMs;
    this.activeFixedSteps = fixedSteps;
  }

  recordRendererStats(stats: {
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
  }): void {
    this.drawCalls = stats.drawCalls;
    this.triangles = stats.triangles;
    this.geometries = stats.geometries;
    this.textures = stats.textures;
  }

  computeAdaptivePixelRatio(
    currentRatio: number,
    minRatio: number,
    maxRatio: number,
    nowMs: number,
    isSoftwareGl: boolean,
  ): number {
    if (isSoftwareGl || this.sampleCount < 24 || nowMs - this.lastAdaptiveSwitchMs < 2500) {
      return currentRatio;
    }

    const snap = this.getSnapshot();
    if (snap.cpuFrameMsP95 > 24 || (snap.fps > 0 && snap.fps < 34)) {
      const next = Math.max(minRatio, Number((currentRatio - 0.15).toFixed(2)));
      if (next !== currentRatio) {
        this.lastAdaptiveSwitchMs = nowMs;
      }
      return next;
    }

    if (snap.cpuFrameMsP95 < 12 && snap.fps >= 52 && currentRatio < maxRatio) {
      const next = Math.min(maxRatio, Number((currentRatio + 0.1).toFixed(2)));
      if (next !== currentRatio) {
        this.lastAdaptiveSwitchMs = nowMs;
      }
      return next;
    }

    return currentRatio;
  }

  getSnapshot(): PerformanceMetrics {
    if (this.sampleCount === 0) {
      return {
        fps: 0,
        cpuFrameMsP50: 0,
        cpuFrameMsP95: 0,
        lastStepMs: 0,
        drawCalls: this.drawCalls,
        triangles: this.triangles,
        geometries: this.geometries,
        textures: this.textures,
        jsHeapMb: this.readJsHeapMb(),
        activeFixedSteps: this.activeFixedSteps,
      };
    }

    this.scratchSort.length = this.sampleCount;
    let totalWallMs = 0;
    for (let i = 0; i < this.sampleCount; i++) {
      this.scratchSort[i] = this.frameSamplesMs[i];
      totalWallMs += this.wallDeltaSamplesMs[i];
    }
    this.scratchSort.sort((a, b) => a - b);

    const p50Idx = Math.floor(0.5 * (this.sampleCount - 1));
    const p95Idx = Math.min(this.sampleCount - 1, Math.floor(0.95 * (this.sampleCount - 1)));
    const avgWallMs = totalWallMs / this.sampleCount;

    return {
      fps: avgWallMs > 0.001 ? Math.round(Math.min(240, 1000 / avgWallMs)) : 0,
      cpuFrameMsP50: Number(this.scratchSort[p50Idx].toFixed(2)),
      cpuFrameMsP95: Number(this.scratchSort[p95Idx].toFixed(2)),
      lastStepMs: Number(this.lastStepMs.toFixed(2)),
      drawCalls: this.drawCalls,
      triangles: this.triangles,
      geometries: this.geometries,
      textures: this.textures,
      jsHeapMb: this.readJsHeapMb(),
      activeFixedSteps: this.activeFixedSteps,
    };
  }

  reset(): void {
    this.sampleCount = 0;
    this.writeIndex = 0;
    this.lastStepMs = 0;
    this.activeFixedSteps = 0;
    this.lastAdaptiveSwitchMs = 0;
  }

  private readJsHeapMb(): number | null {
    if (typeof performance === 'undefined') {
      return null;
    }
    const perf = performance as MemoryCapablePerformance;
    if (!perf.memory || typeof perf.memory.usedJSHeapSize !== 'number') {
      return null;
    }
    return Number((perf.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1));
  }
}
