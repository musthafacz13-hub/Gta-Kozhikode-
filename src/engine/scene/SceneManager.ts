import * as THREE from 'three';
import { resolveGraphicsPresetProfile, type GraphicsPresetProfile } from '../assets/AssetRegistry.ts';
import type { AssetManager } from '../assets/AssetManager.ts';
import type { PlayerMoveResult, StaticAabbCollider } from '../player/PlayerController.ts';
import { AtmosphereSystem } from '../rendering/AtmosphereSystem.ts';
import { MaterialLibrary } from '../rendering/MaterialLibrary.ts';
import type { GraphicsTier, TimeOfDayPreset } from '../types.ts';
import { getGroundHeightAt } from '../world/KozhikodeGeography.ts';
import {
  createPlayerRig,
  createProvisionalHumanFigure,
  type ProvisionalPlayerRig,
} from '../world/ProvisionalVehiclesAndFigures.ts';
import { WorldStreamer } from '../world/WorldStreamer.ts';

export class SceneManager {
  readonly scene: THREE.Scene;
  readonly materials: MaterialLibrary;
  readonly atmosphere: AtmosphereSystem;
  readonly worldStreamer: WorldStreamer;

  private readonly playerRig: ProvisionalPlayerRig;
  private readonly citizenGroup = new THREE.Group();
  private debugGrid: THREE.GridHelper | null = null;
  private activePreset: GraphicsPresetProfile;
  private walkCyclePhase = 0;

  constructor(
    assetManager: AssetManager,
    isSoftwareGl: boolean,
    initialTier: GraphicsTier = 'medium',
    initialTimePreset: TimeOfDayPreset = 'golden',
  ) {
    this.scene = new THREE.Scene();
    this.activePreset = resolveGraphicsPresetProfile(initialTier);
    this.materials = new MaterialLibrary(assetManager);
    this.atmosphere = new AtmosphereSystem(this.scene, isSoftwareGl, this.activePreset);
    this.atmosphere.setTimeOfDayPreset(initialTimePreset);

    this.worldStreamer = new WorldStreamer(this.materials, this.activePreset);
    this.scene.add(this.worldStreamer.root);

    // Stream initial chunks around Mananchira square
    this.worldStreamer.update(0, 22.5, 2.5);

    this.playerRig = createPlayerRig(0x0f766e, 0x1e293b);
    this.playerRig.group.position.set(22.5, 0.18, 2.5);
    this.playerRig.group.rotation.y = -Math.PI * 0.35;
    this.scene.add(this.playerRig.group);

    const citizens: [number, number, number, number, number, number][] = [
      [26.8, 0.18, -11.5, -Math.PI / 2, 0xf59e0b, 0x334155],
      [27.2, 0.18, -12.6, -Math.PI / 2, 0xe11d48, 0xf8fafc],
      [-22.5, 0.18, -4.0, Math.PI * 0.5, 0x2563eb, 0x1f2937],
      [43.2, 0.18, -19.5, -Math.PI * 0.5, 0xd97706, 0x111827],
    ];
    for (const [cx, cy, cz, rot, shirt, pants] of citizens) {
      const fig = createProvisionalHumanFigure(shirt, pants);
      fig.position.set(cx, cy, cz);
      fig.rotation.y = rot;
      this.citizenGroup.add(fig);
    }
    this.scene.add(this.citizenGroup);

    this.debugGrid = new THREE.GridHelper(320, 64, 0xf59e0b, 0x475569);
    this.debugGrid.position.y = 0.06;
    this.debugGrid.visible = false;
    this.scene.add(this.debugGrid);
  }

  getColliders(): StaticAabbCollider[] {
    return this.worldStreamer.getActiveColliders();
  }

  getGroundHeight(x: number, z: number): number {
    return getGroundHeightAt(x, z);
  }

  getActiveChunkCount(): number {
    return this.worldStreamer.getActiveChunkCount();
  }

  getRecommendedExposure(): number {
    return this.atmosphere.getState().exposure;
  }

  getNightGlowFactor(): number {
    return this.atmosphere.getState().nightGlowFactor;
  }

  getClockFormatted(): string {
    return this.atmosphere.getClockFormatted();
  }

  setTimeOfDayPreset(preset: TimeOfDayPreset): void {
    this.atmosphere.setTimeOfDayPreset(preset);
    this.atmosphere.update(0, this.scene, this.playerRig.group.position.x, this.playerRig.group.position.z, this.activePreset);
  }

  syncPlayerVisual(state: PlayerMoveResult, dt: number): void {
    this.playerRig.group.position.set(state.x, state.y, state.z);
    this.playerRig.group.rotation.y = state.heading;

    if (state.isMoving) {
      const rate = state.isSprinting ? 14 : 9;
      this.walkCyclePhase += dt * rate;
      const swing = Math.sin(this.walkCyclePhase) * (state.isSprinting ? 0.55 : 0.36);
      this.playerRig.legL.rotation.x = swing;
      this.playerRig.legR.rotation.x = -swing;
      this.playerRig.armL.rotation.x = -swing * 0.75;
      this.playerRig.armR.rotation.x = swing * 0.75;
    } else {
      this.walkCyclePhase = 0;
      const damp = 1 - Math.exp(-14 * dt);
      this.playerRig.legL.rotation.x *= 1 - damp;
      this.playerRig.legR.rotation.x *= 1 - damp;
      this.playerRig.armL.rotation.x *= 1 - damp;
      this.playerRig.armR.rotation.x *= 1 - damp;
    }
  }

  setDebugGridVisible(visible: boolean): void {
    if (this.debugGrid) {
      this.debugGrid.visible = visible;
    }
  }

  isDebugGridVisible(): boolean {
    return this.debugGrid?.visible ?? false;
  }

  setDestinationBeacon(target: { x: number; z: number } | null): void {
    this.worldStreamer.setDestinationBeacon(target);
  }

  applyGraphicsTier(tier: GraphicsTier, isSoftwareGl: boolean): void {
    this.activePreset = resolveGraphicsPresetProfile(tier);
    this.atmosphere.applyGraphicsPreset(this.activePreset, isSoftwareGl);
    this.worldStreamer.setGraphicsPreset(this.activePreset);
  }

  /**
   * Advances atmosphere, coastal sea swells, night emissive lighting, and spatial chunk streaming.
   * Returns true if streamed colliders changed so PlayerController can refresh its active list.
   */
  update(dt: number, focusX = 22.5, focusZ = 2.5, camera?: THREE.Camera): boolean {
    this.atmosphere.update(dt, this.scene, focusX, focusZ, this.activePreset);
    const atm = this.atmosphere.getState();
    this.materials.update(dt, atm.nightGlowFactor, this.activePreset.waterDetailHigh);
    return this.worldStreamer.update(dt, focusX, focusZ, camera);
  }

  dispose(): void {
    this.atmosphere.dispose();
    this.worldStreamer.dispose();
    this.scene.clear();
  }
}
