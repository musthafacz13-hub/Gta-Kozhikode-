import { AssetManager } from './assets/AssetManager.ts';
import { AudioManager } from './audio/AudioManager.ts';
import { CameraManager, type ThirdPersonCameraPreset } from './camera/CameraManager.ts';
import { EventBus } from './core/EventBus.ts';
import { GameLoop } from './core/GameLoop.ts';
import { Logger } from './core/Logger.ts';
import { PerformanceMonitor } from './core/PerformanceMonitor.ts';
import { InputManager } from './input/InputManager.ts';
import {
  resolveContextualInteraction,
  type ContextualInteractionTarget,
} from './interaction/InteractionResolver.ts';
import { createDefaultSettings, IndexedDBStorage } from './persistence/IndexedDBStorage.ts';
import type { ArjunAppearanceConfig } from './player/ArjunCharacterModel.ts';
import { PlayerController } from './player/PlayerController.ts';
import { RenderEngine } from './rendering/RenderEngine.ts';
import { SceneManager } from './scene/SceneManager.ts';
import type {
  ActiveDestinationState,
  CameraRigMode,
  EngineHudSnapshot,
  GameModeState,
  GameSettings,
  LogEntry,
  NearbyBuildingSummary,
  SaveSlotMeta,
} from './types.ts';
import {
  getBiomeAtWorld,
  worldDistanceToRealKm,
  worldToGeo,
} from './world/GeoProjection.ts';
import {
  KOZHIKODE_GAZETTEER_PLACES,
  KOZHIKODE_TALUKS,
} from './world/KozhikodeGazetteer.ts';
import {
  getDistrictAt,
  KOZHIKODE_REGIONS,
  PROTAGONIST_HOME_COORDS,
} from './world/KozhikodeGeography.ts';
import { findRoadRoute } from './world/RoadNetworkGraph.ts';

export class GameEngine {
  readonly logger = new Logger(250, 'info');
  readonly events = new EventBus(this.logger);
  readonly storage = new IndexedDBStorage(this.logger);
  readonly assets = new AssetManager(this.logger);
  readonly audio = new AudioManager(this.logger);
  readonly input = new InputManager();
  readonly perf = new PerformanceMonitor(120);
  readonly player = new PlayerController();

  private renderEngine: RenderEngine | null = null;
  private sceneManager: SceneManager | null = null;
  private cameraManager: CameraManager | null = null;
  private gameLoop: GameLoop | null = null;

  private mode: GameModeState = 'booting';
  private settings: GameSettings = createDefaultSettings();
  private slots: SaveSlotMeta[] = [];
  private activeSlotId = 'slot_auto_phase1';
  private playtimeSeconds = 0;
  private lastError: string | null = null;
  private activeDestination: ActiveDestinationState | null = null;
  private interactionNotice: { id: number; text: string } | null = null;
  private interactionNoticeSeq = 0;
  private mapToggleHandler: (() => void) | null = null;
  private externalModalOpen = false;

  private lastHudEmitMs = 0;
  private readonly hudListeners = new Set<(snapshot: EngineHudSnapshot) => void>();
  private disposed = false;
  private cleanupDomListeners: (() => void) | null = null;

  async initialize(canvasHost: HTMLElement): Promise<void> {
    try {
      this.logger.info('GameEngine', 'Booting GTA Kozhikode Phase 2 graphics & open-world engine');
      await this.storage.initialize();
      this.settings = await this.storage.getSettings();
      this.slots = await this.storage.listSlots();
      this.applyInputAndCameraSettings(this.settings);

      this.renderEngine = new RenderEngine(canvasHost, {
        logger: this.logger,
        pixelRatioCap: this.settings.pixelRatioCap,
        graphicsTier: this.settings.graphicsTier,
        onContextLost: () => {
          this.setMode('context_lost');
          this.gameLoop?.setPaused(true);
          this.events.emit('engine:context_lost', { timestamp: Date.now() });
        },
        onContextRestored: () => {
          if (this.sceneManager && this.renderEngine && this.cameraManager) {
            this.renderEngine.buildStudioEnvironment(this.sceneManager.scene);
            this.renderEngine.precompile(this.sceneManager.scene, this.cameraManager.camera);
          }
          this.setMode('playing');
          this.gameLoop?.setPaused(false);
          this.events.emit('engine:context_restored', { timestamp: Date.now() });
        },
      });

      this.assets.setMaxAnisotropy(this.renderEngine.capabilities.maxAnisotropy);

      this.sceneManager = new SceneManager(
        this.assets,
        this.renderEngine.capabilities.isSoftwareGl,
        this.settings.graphicsTier,
        this.settings.timeOfDayPreset,
      );
      this.sceneManager.applyGraphicsTier(
        this.settings.graphicsTier,
        this.renderEngine.capabilities.isSoftwareGl,
      );
      this.sceneManager.update(0, PROTAGONIST_HOME_COORDS.porchX, PROTAGONIST_HOME_COORDS.porchZ);
      this.player.setSmoothLocomotionMode('always');
      this.player.setEnvironment(
        this.sceneManager.getColliders(),
        (x, z) => this.sceneManager!.getGroundHeight(x, z),
      );
      this.player.resetSpawn(PROTAGONIST_HOME_COORDS.porchX, PROTAGONIST_HOME_COORDS.porchZ, 0);

      this.renderEngine.buildStudioEnvironment(this.sceneManager.scene);

      const width = Math.max(1, canvasHost.clientWidth);
      const height = Math.max(1, canvasHost.clientHeight);
      this.cameraManager = new CameraManager(width / height);
      this.cameraManager.setThirdPersonPreset(this.settings.cameraPreset);
      this.cameraManager.setDistanceScale(this.settings.cameraDistanceScale);
      this.cameraManager.setMotionSensitivity(this.settings.motionSensitivity);
      this.cameraManager.setEnvironment(
        this.sceneManager.getColliders(),
        (x, z) => this.sceneManager!.getGroundHeight(x, z),
      );
      this.sceneManager.syncPlayerVisual(this.player.getState(), 0, this.cameraManager.camera);
      this.cameraManager.setMode('title_orbit');

      this.audio.attachListener(this.cameraManager.camera);
      this.audio.applySettings(this.settings);
      this.bindAudioLifecycleListeners();

      this.renderEngine.precompile(this.sceneManager.scene, this.cameraManager.camera);
      this.input.attach(canvasHost);

      let frameSteps = 0;
      this.gameLoop = new GameLoop(
        {
          onFixedStep: (fixedDt) => {
            this.handleFixedStep(fixedDt);
            frameSteps++;
          },
          onRender: (_alpha, frameDt) => {
            const startMs = performance.now();
            this.handleRender(frameDt);
            const cpuMs = performance.now() - startMs;
            this.perf.recordFrame(cpuMs, frameSteps, frameDt);
            frameSteps = 0;
            this.emitHudThrottled();
          },
          scheduleSoftwareFrame: this.renderEngine.scheduleAfterDraw,
          cancelSoftwareFrame: this.renderEngine.cancelScheduledDraw,
        },
        {
          fixedDt: 1 / 60,
          maxRawDt: 0.05,
          isSoftwareGl: this.renderEngine.capabilities.isSoftwareGl,
        },
      );

      this.setMode('title');
      this.gameLoop.start();
      this.emitHudImmediate();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.lastError = msg;
      this.logger.error('GameEngine', 'Initialization failed', msg);
      this.setMode('error');
      this.emitHudImmediate();
    }
  }

  subscribeHud(listener: (snapshot: EngineHudSnapshot) => void): () => void {
    this.hudListeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.hudListeners.delete(listener);
    };
  }

  getSnapshot(): EngineHudSnapshot {
    const focus = this.cameraManager?.getFocusState() ?? { x: 22.5, z: 2.5, yaw: 0 };
    const pState = this.player.getState();
    const district = getDistrictAt(pState.x, pState.z);
    const geo = worldToGeo(pState.x, pState.z);
    const biome = getBiomeAtWorld(pState.x, pState.z);

    // Resolve closest Taluk name from district metadata or nearest taluk headquarters
    const matchingPlace = KOZHIKODE_GAZETTEER_PLACES.find((p) => p.id === district.id);
    const talukId = matchingPlace?.talukId ?? 'kozhikode';
    const talukName = KOZHIKODE_TALUKS.find((t) => t.id === talukId)?.name ?? 'Kozhikode Taluk';

    const homeDist = Math.round(
      Math.hypot(
        pState.x - PROTAGONIST_HOME_COORDS.gateX,
        pState.z - PROTAGONIST_HOME_COORDS.gateZ,
      ),
    );

    let activeDestinationSnapshot: ActiveDestinationState | null = null;
    if (this.activeDestination) {
      const liveDist = Math.round(
        Math.hypot(this.activeDestination.worldX - pState.x, this.activeDestination.worldZ - pState.z),
      );
      activeDestinationSnapshot = {
        ...this.activeDestination,
        distanceMeters: liveDist,
        realDistanceKm: Number(worldDistanceToRealKm(liveDist).toFixed(2)),
      };
    }

    const nearest = this.sceneManager?.findNearestInteractableBuilding(pState.x, pState.z, 8.5);
    const nearbyBuilding: NearbyBuildingSummary | null = nearest
      ? {
          id: nearest.building.id,
          name: nearest.building.name,
          malayalamName: nearest.building.malayalamName,
          archetype: nearest.building.archetype,
          category: nearest.building.category,
          ownershipStatus: nearest.building.ownershipStatus,
          interiorEligible: nearest.building.interiorEligible,
          distanceMeters: nearest.distanceMeters,
          lat: nearest.building.lat,
          lon: nearest.building.lon,
          futureHooks: { ...nearest.building.futureHooks },
        }
      : null;

    const animSnap = this.sceneManager?.getArjunAnimationSnapshot();
    const nearHome = homeDist <= 16;
    const nearbyNpc = this.sceneManager?.getNearbyPedestrianForTalk(pState.x, pState.z, 2.6) ?? null;
    const nearbyInteraction: ContextualInteractionTarget | null = resolveContextualInteraction({
      nearbyBuilding,
      nearHome,
      homeDistanceMeters: homeDist,
      nearbyNpc,
    });

    return {
      mode: this.mode,
      cameraMode: this.cameraManager?.getMode() ?? 'title_orbit',
      cameraPreset: this.cameraManager?.getThirdPersonPreset() ?? 'standard',
      cameraX: focus.x,
      cameraZ: focus.z,
      cameraYaw: focus.yaw,
      playerX: pState.x,
      playerZ: pState.z,
      playerLat: Number(geo.lat.toFixed(5)),
      playerLon: Number(geo.lon.toFixed(5)),
      playerHeading: pState.heading,
      isMoving: pState.isMoving,
      isSprinting: pState.isSprinting,
      isGrounded: pState.isGrounded,
      movementGait: pState.movementGait,
      animationState: animSnap?.activeState ?? 'idle',
      interactionNotice: this.interactionNotice,
      pointerLocked: this.input.isPointerLocked(),
      districtName: district.name,
      talukName,
      biome,
      clockFormatted: this.sceneManager?.getClockFormatted() ?? '17:36',
      weatherLabel: this.sceneManager?.getWeatherLabel() ?? 'Golden Haze',
      activeChunks: this.sceneManager?.getActiveChunkCount() ?? 1,
      totalRegions: KOZHIKODE_REGIONS.length,
      gazetteerCount: KOZHIKODE_GAZETTEER_PLACES.length,
      nearHome,
      homeDistanceMeters: homeDist,
      nearbyBuilding,
      nearbyInteraction,
      activeDestination: activeDestinationSnapshot,
      ambientStats: this.sceneManager?.getAmbientStats(pState.x, pState.z),
      audio: this.audio.getSnapshot(),
      showDebugGrid: this.sceneManager?.isDebugGridVisible() ?? false,
      activeSlotId: this.activeSlotId,
      storageMode: this.storage.getStorageMode(),
      capabilities: this.renderEngine?.capabilities ?? null,
      settings: { ...this.settings },
      metrics: this.perf.getSnapshot(),
      slots: [...this.slots],
      lastError: this.lastError,
    };
  }

  setDebugGridVisible(visible: boolean): void {
    this.sceneManager?.setDebugGridVisible(visible);
    this.emitHudImmediate();
  }

  getLogs(): LogEntry[] {
    return this.logger.getEntries();
  }

  startPlay(resetSpawn = false): void {
    if (this.mode === 'error' || this.mode === 'context_lost') {
      return;
    }
    void this.audio.unlockFromGesture().then(() => {
      this.audio.playGameEvent('cinematic_whoosh');
    });
    if (resetSpawn) {
      this.player.resetSpawn(PROTAGONIST_HOME_COORDS.porchX, PROTAGONIST_HOME_COORDS.porchZ, 0);
    }
    const pState = this.player.getState();
    if (this.sceneManager) {
      this.sceneManager.update(0, pState.x, pState.z, this.cameraManager?.camera);
      const colliders = this.sceneManager.getColliders();
      const groundFn = (x: number, z: number) => this.sceneManager!.getGroundHeight(x, z);
      this.player.setEnvironment(colliders, groundFn);
      this.cameraManager?.setEnvironment(colliders, groundFn);
      this.sceneManager.syncPlayerVisual(this.player.getState(), 0, this.cameraManager?.camera);
    }
    this.cameraManager?.setMode('free_inspect');
    this.cameraManager?.snapToTarget(this.player.position, Math.PI);
    this.gameLoop?.setPaused(false);
    this.setMode('playing');
    this.logger.info('GameEngine', 'Entered open-world Kozhikode slice at West Hill residence');
  }

  setMapToggleHandler(handler: (() => void) | null): void {
    this.mapToggleHandler = handler;
  }

  setExternalModalOpen(open: boolean): void {
    this.externalModalOpen = open;
    if (open) {
      this.input.clearAll();
      this.input.releasePointerLock();
      this.gameLoop?.setPaused(true);
    } else if (this.mode === 'playing') {
      this.gameLoop?.setPaused(false);
    }
    this.emitHudImmediate();
  }

  togglePause(): void {
    if (this.mode === 'playing') {
      this.audio.playUiSound('ui_click');
      this.gameLoop?.setPaused(true);
      this.input.clearAll();
      this.input.releasePointerLock();
      this.setMode('paused');
    } else if (this.mode === 'paused') {
      this.audio.playUiSound('ui_back');
      this.gameLoop?.setPaused(this.externalModalOpen);
      this.setMode('playing');
    }
  }

  returnToTitle(): void {
    this.audio.playUiSound('ui_back');
    this.externalModalOpen = false;
    this.gameLoop?.setPaused(false);
    this.cameraManager?.setMode('title_orbit');
    this.input.clearAll();
    this.input.releasePointerLock();
    this.setMode('title');
  }

  setCameraMode(mode: CameraRigMode): void {
    this.audio.playUiSound('ui_click');
    this.cameraManager?.setMode(mode);
    this.emitHudImmediate();
  }

  toggleCameraMode(): void {
    if (!this.cameraManager) return;
    if (this.mode === 'playing' && this.cameraManager.getMode() === 'free_inspect') {
      const nextPreset = this.cameraManager.cycleThirdPersonPreset();
      this.settings = { ...this.settings, cameraPreset: nextPreset };
      void this.storage.saveSettings(this.settings);
      this.audio.playUiSound('ui_click');
      const labels: Record<ThirdPersonCameraPreset, string> = {
        close: 'Camera: Close Follow',
        standard: 'Camera: Standard Third-Person',
        wide: 'Camera: Wide Street View',
      };
      this.pushInteractionNotice(labels[nextPreset]);
      this.emitHudImmediate();
      return;
    }
    const current = this.cameraManager.getMode();
    this.setCameraMode(current === 'title_orbit' ? 'free_inspect' : 'title_orbit');
  }

  setThirdPersonCameraPreset(preset: ThirdPersonCameraPreset): void {
    this.cameraManager?.setThirdPersonPreset(preset);
    this.settings = { ...this.settings, cameraPreset: preset };
    void this.storage.saveSettings(this.settings);
    this.emitHudImmediate();
  }

  applyPlayerAppearance(patch: Partial<ArjunAppearanceConfig>): ArjunAppearanceConfig | null {
    if (!this.sceneManager) return null;
    return this.sceneManager.applyArjunAppearance(patch);
  }

  toggleMute(): void {
    void this.audio.unlockFromGesture();
    void this.updateSettings({ masterMuted: !this.settings.masterMuted });
  }

  playHomeDoorPreview(): void {
    void this.audio.unlockFromGesture().then(() => {
      this.audio.playCharacterEvent('door_open');
    });
  }

  interactWithNearbyBuilding(): string {
    const pState = this.player.getState();
    const nearest = this.sceneManager?.findNearestInteractableBuilding(pState.x, pState.z, 8.5);
    if (!nearest) {
      const nearbyNpc = this.sceneManager?.getNearbyPedestrianForTalk(pState.x, pState.z, 2.6);
      if (nearbyNpc) {
        void this.audio.unlockFromGesture().then(() => {
          this.audio.playUiSound('ui_click');
        });
        return `${nearbyNpc.label} · "Sugamano? Busy evening in Kozhikode today!"`;
      }
      const homeDist = Math.hypot(
        pState.x - PROTAGONIST_HOME_COORDS.gateX,
        pState.z - PROTAGONIST_HOME_COORDS.gateZ,
      );
      if (homeDist <= 16) {
        this.playHomeDoorPreview();
        return 'West Hill Tharavadu · Safe House (Interior opens in Story Phase)';
      }
      return '';
    }
    const b = nearest.building;
    const isTeaShop = b.futureHooks.businessTag === 'chai_peedika_kerala';
    void this.audio.unlockFromGesture().then(() => {
      if (isTeaShop) {
        this.audio.triggerTeaShopSfx('glass_clink', Math.max(1.5, nearest.distanceMeters));
      } else if (b.interiorEligible || b.ownershipStatus === 'protagonist_home') {
        this.audio.playCharacterEvent('door_open');
      } else {
        this.audio.playUiSound('ui_click');
      }
    });
    if (b.ownershipStatus === 'protagonist_home') {
      return `${b.name} (${b.malayalamName}) · Safe House (Interior opens in Story Phase)`;
    }
    if (isTeaShop) {
      return `${b.name} (${b.malayalamName}) · Hot Meter Chai & Pazham Pori (Economy unlocks in Phase 8)`;
    }
    if (b.interiorEligible) {
      return `${b.name} (${b.malayalamName}) · Interior opens in Phase 11`;
    }
    return `${b.name} (${b.malayalamName}) · Exterior facade`;
  }

  private pushInteractionNotice(text: string): void {
    this.interactionNoticeSeq += 1;
    this.interactionNotice = { id: this.interactionNoticeSeq, text };
  }

  travelToWestHillHome(): void {
    this.teleportTo(PROTAGONIST_HOME_COORDS.gateX, PROTAGONIST_HOME_COORDS.gateZ + 4, Math.PI);
  }

  travelToMananchira(): void {
    this.teleportTo(22.5, 2.5, -Math.PI * 0.35);
  }

  travelToWorldPoint(x: number, z: number, heading = 0): void {
    this.teleportTo(x, z, heading);
    this.logger.info('Navigation', `Fast-traveled to (${Math.round(x)}, ${Math.round(z)})`);
  }

  setDestinationWaypoint(dest: {
    id: string;
    name: string;
    malayalamName?: string;
    worldX: number;
    worldZ: number;
    lat: number;
    lon: number;
    source: 'gazetteer' | 'google_places';
  }): void {
    const pState = this.player.getState();
    const directDist = Math.round(Math.hypot(dest.worldX - pState.x, dest.worldZ - pState.z));
    const route = findRoadRoute(pState.x, pState.z, dest.worldX, dest.worldZ);

    this.activeDestination = {
      id: dest.id,
      name: dest.name,
      malayalamName: dest.malayalamName,
      lat: dest.lat,
      lon: dest.lon,
      worldX: dest.worldX,
      worldZ: dest.worldZ,
      distanceMeters: route ? Math.round(route.totalWorldMeters) : directDist,
      realDistanceKm: route
        ? route.realDistanceKm
        : Number(worldDistanceToRealKm(directDist).toFixed(2)),
      estimatedDriveMinutes: route
        ? route.estimatedDriveMinutes
        : Math.max(1, Math.round(worldDistanceToRealKm(directDist) * 1.8)),
      viaSummary: route ? route.highwaySummary : ['Direct Corridor'],
      routeWaypoints: route
        ? route.waypoints
        : [
            {
              nodeId: 'origin',
              name: 'Start',
              x: pState.x,
              z: pState.z,
              lat: worldToGeo(pState.x, pState.z).lat,
              lon: worldToGeo(pState.x, pState.z).lon,
            },
            {
              nodeId: dest.id,
              name: dest.name,
              x: dest.worldX,
              z: dest.worldZ,
              lat: dest.lat,
              lon: dest.lon,
            },
          ],
      source: dest.source,
    };

    this.sceneManager?.setDestinationBeacon({ x: dest.worldX, z: dest.worldZ });
    this.audio.playUiSound('ui_click');
    this.emitHudImmediate();
  }

  clearDestinationWaypoint(): void {
    this.activeDestination = null;
    this.sceneManager?.setDestinationBeacon(null);
    this.audio.playUiSound('ui_back');
    this.emitHudImmediate();
  }

  private teleportTo(x: number, z: number, heading: number): void {
    let targetX = x;
    let targetZ = z;
    if (this.sceneManager) {
      this.sceneManager.update(0, x, z, this.cameraManager?.camera);
      const colliders = this.sceneManager.getColliders();
      const hitsCollider = (px: number, pz: number): boolean =>
        colliders.some(
          (c) =>
            px > c.minX - 0.6 &&
            px < c.maxX + 0.6 &&
            pz > c.minZ - 0.6 &&
            pz < c.maxZ + 0.6,
        );

      if (hitsCollider(targetX, targetZ)) {
        // Nudge to nearest clear sidewalk/plaza ring around the destination coordinate
        let resolved = false;
        for (const radius of [6, 12, 18, 24, 30]) {
          for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2;
            const cx = x + Math.cos(ang) * radius;
            const cz = z + Math.sin(ang) * radius;
            if (!hitsCollider(cx, cz)) {
              targetX = cx;
              targetZ = cz;
              resolved = true;
              break;
            }
          }
          if (resolved) break;
        }
      }

      const groundFn = (gx: number, gz: number) => this.sceneManager!.getGroundHeight(gx, gz);
      this.player.setEnvironment(colliders, groundFn);
      this.cameraManager?.setEnvironment(colliders, groundFn);
    }
    this.player.resetSpawn(targetX, targetZ, heading);
    this.sceneManager?.syncPlayerVisual(this.player.getState(), 0, this.cameraManager?.camera);
    this.cameraManager?.snapToTarget(this.player.position, heading + Math.PI);
    if (this.mode === 'paused') {
      this.togglePause();
    }
    this.audio.playGameEvent('cinematic_whoosh');
    this.emitHudImmediate();
  }

  resize(width: number, height: number): void {
    if (!this.renderEngine || !this.cameraManager) {
      return;
    }
    this.renderEngine.resize(width, height);
    this.cameraManager.setAspect(width, height);
  }

  async updateSettings(patch: Partial<GameSettings>): Promise<void> {
    const mergedPatch = { ...patch };
    if (patch.touchSensitivity !== undefined && patch.cameraSensitivity === undefined) {
      mergedPatch.cameraSensitivity = patch.touchSensitivity;
    } else if (patch.cameraSensitivity !== undefined && patch.touchSensitivity === undefined) {
      mergedPatch.touchSensitivity = patch.cameraSensitivity;
    }
    const next = await this.storage.saveSettings({
      ...this.settings,
      ...mergedPatch,
    });
    this.settings = next;
    this.applyInputAndCameraSettings(next);
    this.audio.applySettings(next);
    if (this.renderEngine) {
      this.renderEngine.applyQualitySettings(next.graphicsTier, next.pixelRatioCap);
      this.sceneManager?.applyGraphicsTier(
        next.graphicsTier,
        this.renderEngine.capabilities.isSoftwareGl,
      );
    }
    if (patch.timeOfDayPreset !== undefined) {
      this.sceneManager?.setTimeOfDayPreset(next.timeOfDayPreset);
    }
    this.events.emit('settings:updated', { graphicsTier: next.graphicsTier });
    this.logger.info(
      'Settings',
      `Applied tier=${next.graphicsTier}, dprCap=${next.pixelRatioCap}, time=${next.timeOfDayPreset}`,
    );
    this.emitHudImmediate();
  }

  private applyInputAndCameraSettings(next: GameSettings): void {
    this.input.setCameraTouchSensitivity(next.cameraSensitivity);
    this.input.setMouseSensitivity(next.cameraSensitivity);
    this.input.setJoystickConfig(next.joystickDeadzone, next.joystickSensitivity);
    this.input.setTouchRegionMode(next.controlLayout === 'left_handed' ? 'left' : 'right');
    this.input.enableDesktopPointerLock(next.desktopPointerLock);
    this.cameraManager?.setThirdPersonPreset(next.cameraPreset);
    this.cameraManager?.setDistanceScale(next.cameraDistanceScale);
    this.cameraManager?.setMotionSensitivity(next.motionSensitivity);
  }

  async resetSettings(): Promise<void> {
    const defaults = await this.storage.resetSettings();
    await this.updateSettings(defaults);
  }

  async saveCheckpoint(slotId = 'slot_manual_1', label?: string): Promise<SaveSlotMeta> {
    const pState = this.player.getState();
    const district = getDistrictAt(pState.x, pState.z);
    const slotType = slotId.startsWith('slot_auto') ? 'autosave' : 'manual';
    const saved = await this.storage.upsertSlot({
      slotId,
      slotType,
      label: label ?? `${district.name} Checkpoint`,
      schemaVersion: 1,
      districtName: district.name,
      playtimeSeconds: Math.round(this.playtimeSeconds),
      savedAt: Date.now(),
      cameraPreset: this.cameraManager?.getStatePreset() ?? 'free_inspect',
    });
    this.activeSlotId = saved.slotId;
    this.slots = await this.storage.listSlots();
    this.events.emit('save:completed', { slotId: saved.slotId, slotType: saved.slotType });
    this.logger.info('Persistence', `Saved ${saved.slotId}`, `${saved.districtName}`);
    this.emitHudImmediate();
    return saved;
  }

  async deleteSaveSlot(slotId: string): Promise<void> {
    await this.storage.deleteSlot(slotId);
    this.slots = await this.storage.listSlots();
    this.emitHudImmediate();
  }

  triggerContextLossTest(): boolean {
    if (!this.renderEngine) {
      return false;
    }
    const ok = this.renderEngine.simulateContextLoss();
    this.logger.info(
      'Diagnostics',
      ok ? 'Triggered simulated WebGL context loss' : 'WEBGL_lose_context extension unavailable',
    );
    return ok;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.cleanupDomListeners?.();
    this.cleanupDomListeners = null;
    this.gameLoop?.stop();
    this.input.detach();
    this.audio.dispose();
    this.sceneManager?.dispose();
    this.assets.disposeAll();
    this.renderEngine?.dispose();
    this.storage.close();
    this.events.clear();
    this.hudListeners.clear();
    this.logger.info('GameEngine', 'Disposed engine cleanly');
  }

  private bindAudioLifecycleListeners(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const onGesture = () => {
      void this.audio.unlockFromGesture().then((unlocked) => {
        if (unlocked) {
          this.emitHudImmediate();
        }
      });
    };
    const onVisibility = () => {
      this.audio.handleLifecycle(this.mode, document.hidden);
      this.emitHudImmediate();
    };
    window.addEventListener('pointerdown', onGesture, { passive: true });
    window.addEventListener('keydown', onGesture, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    this.cleanupDomListeners = () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }

  private setMode(next: GameModeState): void {
    if (this.mode === next) {
      return;
    }
    const prev = this.mode;
    this.mode = next;
    const hidden = typeof document !== 'undefined' ? document.hidden : false;
    this.audio.handleLifecycle(next, hidden);
    this.events.emit('engine:mode_changed', { from: prev, to: next });
    this.emitHudImmediate();
  }

  private handleFixedStep(fixedDt: number): void {
    const frameInput = this.input.consumeFrameState();
    if (frameInput.justPressed.pause) {
      if (this.mode === 'playing' || this.mode === 'paused') {
        this.togglePause();
        return;
      }
    }

    if (frameInput.justPressed.map && (this.mode === 'playing' || this.mode === 'paused')) {
      this.input.clearAll();
      this.input.releasePointerLock();
      this.mapToggleHandler?.();
      return;
    }

    if (this.mode === 'playing') {
      this.playtimeSeconds += fixedDt;
      if (frameInput.justPressed.toggle_camera) {
        this.toggleCameraMode();
      }
      if (frameInput.justPressed.interact) {
        const msg = this.interactWithNearbyBuilding();
        if (msg) {
          this.pushInteractionNotice(msg);
          this.emitHudImmediate();
        }
      }
      const camYaw = this.cameraManager?.getYaw() ?? 0;
      const obstacles = this.sceneManager?.getDynamicObstacles();
      const moveState = this.player.update(fixedDt, frameInput, camYaw, obstacles);
      this.sceneManager?.syncPlayerVisual(moveState, fixedDt, this.cameraManager?.camera);
    }

    const streamFocusX = this.mode === 'title' ? 8 : this.player.position.x;
    const streamFocusZ = this.mode === 'title' ? 0 : this.player.position.z;
    const pState = this.player.getState();
    const camFocus = this.cameraManager?.getFocusState() ?? { x: streamFocusX, z: streamFocusZ, yaw: 0 };
    const collidersChanged = this.sceneManager?.update(
      fixedDt,
      streamFocusX,
      streamFocusZ,
      this.cameraManager?.camera,
      this.mode === 'playing' ? { x: pState.x, z: pState.z } : undefined,
      {
        onVehicleHorn: (ev) => {
          if (this.mode !== 'playing') return;
          this.audio.playVehicleHornSpatial(
            ev.audioKind,
            ev.x,
            ev.z,
            camFocus.x,
            camFocus.z,
            camFocus.yaw,
            95,
          );
        },
        onTeaShopSfx: (event, distMeters) => {
          if (this.mode !== 'playing') return;
          this.audio.triggerTeaShopSfx(event, distMeters);
        },
      },
    );
    if (collidersChanged && this.sceneManager) {
      const colliders = this.sceneManager.getColliders();
      const groundFn = (x: number, z: number) => this.sceneManager!.getGroundHeight(x, z);
      this.player.setEnvironment(colliders, groundFn);
      this.cameraManager?.setEnvironment(colliders, groundFn);
    }

    const district = getDistrictAt(pState.x, pState.z);
    const homeDist = Math.hypot(
      pState.x - PROTAGONIST_HOME_COORDS.gateX,
      pState.z - PROTAGONIST_HOME_COORDS.gateZ,
    );
    const teaShopDistanceMeters = this.sceneManager?.getNearestTeaShopDistance(pState.x, pState.z) ?? 999;
    this.audio.update(fixedDt, {
      playerX: pState.x,
      playerZ: pState.z,
      nightGlowFactor: this.sceneManager?.getNightGlowFactor() ?? 0.2,
      districtId: district.id,
      isCoastal: district.category === 'coastal' || pState.x < -38,
      isMarket: district.id === 'sm_street' || district.id === 'palayam',
      isHomeZone: district.id === 'protagonist_home' || homeDist < 28,
      isPlaying: this.mode === 'playing',
      isMoving: pState.isMoving,
      isSprinting: pState.isSprinting,
      speed: pState.speed,
      teaShopDistanceMeters,
    });

    this.cameraManager?.update(fixedDt, frameInput, this.player.position);
  }

  private handleRender(_frameDt: number): void {
    if (!this.renderEngine || !this.sceneManager || !this.cameraManager) {
      return;
    }

    if (this.settings.adaptiveResolution) {
      const cap =
        this.settings.graphicsTier === 'low'
          ? Math.min(1.0, this.settings.pixelRatioCap)
          : this.settings.pixelRatioCap;
      const nextRatio = this.perf.computeAdaptivePixelRatio(
        this.renderEngine.capabilities.appliedPixelRatio,
        0.75,
        Math.min(this.renderEngine.capabilities.devicePixelRatio || 1.5, cap),
        performance.now(),
        this.renderEngine.capabilities.isSoftwareGl,
      );
      this.renderEngine.setAdaptivePixelRatio(nextRatio);
    }

    this.renderEngine.setToneMappingExposure(this.sceneManager.getRecommendedExposure());
    this.renderEngine.render(this.sceneManager.scene, this.cameraManager.camera);
    this.perf.recordRendererStats(this.renderEngine.getStats());
  }

  private emitHudThrottled(): void {
    const now = performance.now();
    if (now - this.lastHudEmitMs < 100) {
      return;
    }
    this.lastHudEmitMs = now;
    this.emitHudImmediate();
  }

  private emitHudImmediate(): void {
    if (this.hudListeners.size === 0) {
      return;
    }
    const snap = this.getSnapshot();
    for (const listener of this.hudListeners) {
      listener(snap);
    }
  }
}
