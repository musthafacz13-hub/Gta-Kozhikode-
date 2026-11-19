import type { PerformanceMetrics } from '../types.ts';

interface MemoryCapablePerformance extends Performance {
  memory?: {
    usedJSHeapSize: number;
  };
}

export class PerformanceMonitor {
  private readonly sampleCapacity: number;
  private readonly frameSamplesMs: Float64Array;
  private sampleCount = 0;
  private writeIndex = 0;
  private lastStepMs = 0;
  private activeFixedSteps = 0;

  private drawCalls = 0;
  private triangles = 0;
  private geometries = 0;
  private textures = 0;

  private readonly scratchSort: number[] = [];

  constructor(sampleCapacity = 120) {
    this.sampleCapacity = Math.max(10, sampleCapacity);
    this.frameSamplesMs = new Float64Array(this.sampleCapacity);
  }

  recordFrame(cpuMs: number, fixedSteps: number): void {
    const safeMs = Number.isFinite(cpuMs) && cpuMs >= 0 ? cpuMs : 0;
    this.frameSamplesMs[this.writeIndex] = safeMs;
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
    let totalMs = 0;
    for (let i = 0; i < this.sampleCount; i++) {
      const val = this.frameSamplesMs[i];
      this.scratchSort[i] = val;
      totalMs += val;
    }
    this.scratchSort.sort((a, b) => a - b);

    const p50Idx = Math.floor(0.5 * (this.sampleCount - 1));
    const p95Idx = Math.min(this.sampleCount - 1, Math.floor(0.95 * (this.sampleCount - 1)));
    const avgMs = totalMs / this.sampleCount;

    return {
      fps: avgMs > 0.001 ? Math.round(Math.min(240, 1000 / avgMs)) : 0,
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
