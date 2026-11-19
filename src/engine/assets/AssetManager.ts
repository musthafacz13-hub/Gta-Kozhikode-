import * as THREE from 'three';
import type { Logger } from '../core/Logger.ts';

export class AssetManager {
  readonly loadingManager: THREE.LoadingManager;
  private readonly textures = new Map<string, { texture: THREE.Texture; refs: number }>();
  private readonly materials = new Map<string, THREE.Material>();
  private maxAnisotropy = 4;
  private readonly logger?: Logger;

  constructor(logger?: Logger) {
    this.logger = logger;
    this.loadingManager = new THREE.LoadingManager();
    this.loadingManager.onError = (url) => {
      this.logger?.error('AssetManager', `Failed to load asset: ${url}`);
    };
  }

  setMaxAnisotropy(anisotropy: number): void {
    this.maxAnisotropy = Math.max(1, anisotropy);
    for (const entry of this.textures.values()) {
      entry.texture.anisotropy = this.maxAnisotropy;
      entry.texture.needsUpdate = true;
    }
  }

  /**
   * Generates a procedural CanvasTexture in code so Phase 1 has zero external 404 asset dependencies.
   */
  getOrCreateProceduralTexture(
    key: string,
    width: number,
    height: number,
    colorSpace: THREE.ColorSpace,
    draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
    repeatX = 1,
    repeatY = 1,
  ): THREE.CanvasTexture {
    const existing = this.textures.get(key);
    if (existing) {
      existing.refs++;
      return existing.texture as THREE.CanvasTexture;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      draw(ctx, width, height);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = colorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = this.maxAnisotropy;
    tex.needsUpdate = true;

    this.textures.set(key, { texture: tex, refs: 1 });
    return tex;
  }

  registerMaterial(key: string, material: THREE.Material): THREE.Material {
    if (!this.materials.has(key)) {
      this.materials.set(key, material);
    }
    return this.materials.get(key)!;
  }

  releaseTexture(key: string): void {
    const entry = this.textures.get(key);
    if (!entry) {
      return;
    }
    entry.refs--;
    if (entry.refs <= 0) {
      entry.texture.dispose();
      this.textures.delete(key);
    }
  }

  disposeAll(): void {
    for (const entry of this.textures.values()) {
      entry.texture.dispose();
    }
    this.textures.clear();

    for (const material of this.materials.values()) {
      material.dispose();
    }
    this.materials.clear();
  }
}
