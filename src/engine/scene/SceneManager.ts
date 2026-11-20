import * as THREE from 'three';
import { resolveGraphicsPresetProfile, type GraphicsPresetProfile } from '../assets/AssetRegistry.ts';
import type { AssetManager } from '../assets/AssetManager.ts';
import type { TeaShopSfxEvent } from '../audio/AudioTypes.ts';
import {
  ArjunAnimator,
  type ArjunAnimatorSnapshot,
} from '../player/ArjunAnimator.ts';
import {
  createArjunCharacterRig,
  type ArjunAppearanceConfig,
  type ArjunCharacterRig,
} from '../player/ArjunCharacterModel.ts';
import type {
  PlayerDynamicObstacles,
  PlayerMoveResult,
  StaticAabbCollider,
} from '../player/PlayerController.ts';
import { AtmosphereSystem } from '../rendering/AtmosphereSystem.ts';
import { MaterialLibrary } from '../rendering/MaterialLibrary.ts';
import type { GraphicsTier, TimeOfDayPreset } from '../types.ts';
import type { RegisteredBuildingRecord } from '../world/BuildingSystem.ts';
import { getGroundHeightAt } from '../world/KozhikodeGeography.ts';
import { PedestrianSystem } from '../world/PedestrianSystem.ts';
import { TrafficSystem, type TrafficHornEvent } from '../world/TrafficSystem.ts';
import { WorldStreamer } from '../world/WorldStreamer.ts';

export interface SceneUpdateCallbacks {
  onVehicleHorn?: (event: TrafficHornEvent) => void;
  onTeaShopSfx?: (event: TeaShopSfxEvent, distMeters: number) => void;
}

export class SceneManager {
  readonly scene: THREE.Scene;
  readonly materials: MaterialLibrary;
  readonly atmosphere: AtmosphereSystem;
  readonly worldStreamer: WorldStreamer;
  readonly trafficSystem: TrafficSystem;
  readonly pedestrianSystem: PedestrianSystem;

  private readonly arjunRig: ArjunCharacterRig;
  private readonly arjunAnimator: ArjunAnimator;
  private debugGrid: THREE.GridHelper | null = null;
  private activePreset: GraphicsPresetProfile;

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

    this.trafficSystem = new TrafficSystem(this.materials, this.activePreset);
    this.scene.add(this.trafficSystem.root);

    this.pedestrianSystem = new PedestrianSystem(this.activePreset);
    this.scene.add(this.pedestrianSystem.root);

    this.arjunRig = createArjunCharacterRig();
    this.arjunRig.lod.position.set(22.5, 0.18, 2.5);
    this.arjunRig.lod.rotation.y = 0;
    this.scene.add(this.arjunRig.lod);
    this.arjunAnimator = new ArjunAnimator();

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

  getActiveBuildings(): RegisteredBuildingRecord[] {
    return this.worldStreamer.getActiveBuildings();
  }

  getNearestTeaShopDistance(x: number, z: number): number {
    return this.worldStreamer.getNearestTeaShopDistance(x, z);
  }

  getAmbientStats(
    x: number,
    z: number,
  ): { activeVehicles: number; activePedestrians: number; nearTeaShop: boolean } {
    return {
      activeVehicles: this.trafficSystem.getActiveVehicleCount(),
      activePedestrians: this.pedestrianSystem.getActivePedestrianCount(),
      nearTeaShop: this.worldStreamer.getNearestTeaShopDistance(x, z) <= 28,
    };
  }

  findNearestInteractableBuilding(
    x: number,
    z: number,
    maxDistanceMeters = 8.5,
  ): { building: RegisteredBuildingRecord; distanceMeters: number } | null {
    return this.worldStreamer.findNearestInteractableBuilding(x, z, maxDistanceMeters);
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

  getWeatherLabel(): string {
    return this.atmosphere.getWeatherLabel();
  }

  getNearbyPedestrianForTalk(
    x: number,
    z: number,
    maxDistanceMeters = 2.6,
  ): { id: string; label: string; distanceMeters: number } | null {
    const peds = this.pedestrianSystem.getPedestrians();
    let bestDist = maxDistanceMeters;
    let bestId: string | null = null;
    let bestVariant = '';
    for (let i = 0; i < peds.length; i++) {
      const ped = peds[i];
      const d = Math.hypot(x - ped.x, z - ped.z);
      if (d <= bestDist) {
        bestDist = d;
        bestId = ped.id;
        bestVariant = ped.variant;
      }
    }
    if (!bestId) return null;
    const labels: Record<string, string> = {
      man: 'Kozhikode Local',
      elderly: 'Mooppan / Elder',
      student: 'College Student',
      woman: 'Local Pedestrian',
      worker: 'Harbour Worker',
      shopkeeper: 'Shopkeeper',
      vendor: 'Street Vendor',
    };
    return {
      id: bestId,
      label: labels[bestVariant] ?? 'Local Resident',
      distanceMeters: Number(bestDist.toFixed(1)),
    };
  }

  setTimeOfDayPreset(preset: TimeOfDayPreset): void {
    this.atmosphere.setTimeOfDayPreset(preset);
    this.atmosphere.update(
      0,
      this.scene,
      this.arjunRig.lod.position.x,
      this.arjunRig.lod.position.z,
      this.activePreset,
    );
  }

  getDynamicObstacles(): PlayerDynamicObstacles {
    return {
      vehicles: this.trafficSystem.getTrafficSnapshots(),
      pedestrians: this.pedestrianSystem.getPedestrians(),
    };
  }

  applyArjunAppearance(patch: Partial<ArjunAppearanceConfig>): ArjunAppearanceConfig {
    this.arjunRig.applyAppearance(patch);
    return this.arjunRig.getAppearance();
  }

  getArjunAppearance(): ArjunAppearanceConfig {
    return this.arjunRig.getAppearance();
  }

  getArjunAnimationSnapshot(): ArjunAnimatorSnapshot {
    return this.arjunAnimator.getSnapshot();
  }

  syncPlayerVisual(state: PlayerMoveResult, dt: number, camera?: THREE.Camera): void {
    this.arjunRig.lod.position.set(state.x, state.visualY, state.z);
    this.arjunRig.lod.rotation.y = state.heading;
    this.arjunAnimator.update(this.arjunRig, state, dt);
    if (camera) {
      this.arjunRig.lod.update(camera);
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
    this.trafficSystem.setGraphicsPreset(this.activePreset);
    this.pedestrianSystem.setGraphicsPreset(this.activePreset);
  }

  /**
   * Advances atmosphere, coastal sea swells, night emissive lighting, spatial chunk streaming,
   * animated tea shops, road traffic, and sidewalk pedestrians.
   * Returns true if streamed colliders changed so PlayerController can refresh its active list.
   */
  update(
    dt: number,
    focusX = 22.5,
    focusZ = 2.5,
    camera?: THREE.Camera,
    playerPos?: { x: number; z: number },
    callbacks?: SceneUpdateCallbacks,
  ): boolean {
    this.atmosphere.update(dt, this.scene, focusX, focusZ, this.activePreset);
    const atm = this.atmosphere.getState();
    this.materials.update(dt, atm.nightGlowFactor, this.activePreset.waterDetailHigh);
    const changed = this.worldStreamer.update(
      dt,
      focusX,
      focusZ,
      camera,
      callbacks?.onTeaShopSfx,
    );

    const colliders = this.getColliders();
    this.pedestrianSystem.update(
      dt,
      focusX,
      focusZ,
      camera,
      colliders,
      this.trafficSystem.getTrafficSnapshots(),
      playerPos,
    );
    this.trafficSystem.update(
      dt,
      focusX,
      focusZ,
      camera,
      colliders,
      this.pedestrianSystem.getPedestrians(),
      playerPos,
      callbacks?.onVehicleHorn,
    );

    return changed;
  }

  dispose(): void {
    this.arjunRig.dispose();
    this.atmosphere.dispose();
    this.worldStreamer.dispose();
    this.trafficSystem.dispose();
    this.pedestrianSystem.dispose();
    this.scene.clear();
  }
}
