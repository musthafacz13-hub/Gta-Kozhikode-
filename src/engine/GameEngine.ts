import { AssetManager } from './assets/AssetManager.ts';
import { AudioManager } from './audio/AudioManager.ts';
import { CameraManager, type ThirdPersonCameraPreset } from './camera/CameraManager.ts';
import { EventBus } from './core/EventBus.ts';
import { GameLoop } from './core/GameLoop.ts';
import { Logger } from './core/Logger.ts';
import { PerformanceMonitor } from './core/PerformanceMonitor.ts';
import {
  DELIVERY_INTERACTION_RANGE_METERS,
  DeliveryOrderSystem,
} from './delivery/DeliveryOrderSystem.ts';
import {
  createDefaultProgressionState,
  LifestyleProgression,
  PURCHASABLE_VEHICLES_CATALOG,
} from './delivery/LifestyleProgression.ts';
import {
  findRestaurantNearPoint,
  getRestaurantById,
} from './delivery/RestaurantCatalog.ts';
import { InputManager } from './input/InputManager.ts';
import {
  resolveContextualInteraction,
  type ContextualInteractionTarget,
  type NearbyDeliveryDropoffCandidate,
  type NearbyDeliveryPickupCandidate,
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
  LifestyleUpgradeId,
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
import { getFriendlyNpcGreeting } from './world/PedestrianSystem.ts';
import { findRoadRoute } from './world/RoadNetworkGraph.ts';
import type { VehicleModelId } from './world/VehicleVisualFactory.ts';

export class GameEngine {
  readonly logger = new Logger(250, 'info');
  readonly events = new EventBus(this.logger);
  readonly storage = new IndexedDBStorage(this.logger);
  readonly assets = new AssetManager(this.logger);
  readonly audio = new AudioManager(this.logger);
  readonly input = new InputManager();
  readonly perf = new PerformanceMonitor(120);
  readonly player = new PlayerController();
  readonly delivery = new DeliveryOrderSystem();
  readonly progression = new LifestyleProgression();

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
  private vehiclesRestoredOnStart = false;
  private discoverCheckAccumSec = 0;
  private lastMarkerSyncKey = '';
  private lastBagSyncKey = '';

  private lastHudEmitMs = 0;
  private readonly hudListeners = new Set<(snapshot: EngineHudSnapshot) => void>();
  private disposed = false;
  private cleanupDomListeners: (() => void) | null = null;

  async initialize(canvasHost: HTMLElement): Promise<void> {
    try {
      this.logger.info('GameEngine', 'Booting Kozhikode Life open-world simulation engine');
      await this.storage.initialize();
      this.settings = await this.storage.getSettings();
      this.slots = await this.storage.listSlots();
      const savedProgression = await this.storage.getSavedProgression();
      if (savedProgression) {
        this.progression.restore(savedProgression.progression);
        this.delivery.restoreActiveOrder(
          savedProgression.activeOrder ?? null,
          savedProgression.progression.deliveryHistory[0] ?? null,
        );
      }
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
      this.delivery.refreshAvailableOrders(
        PROTAGONIST_HOME_COORDS.porchX,
        PROTAGONIST_HOME_COORDS.porchZ,
        this.sceneManager.getCurrentClockHour(),
        this.progression.getState(),
        this.progression.getTipBonusMultiplier(),
      );
      const restoredOrder = this.delivery.getActiveOrder();
      if (restoredOrder) {
        this.applyDeliveryDestination(restoredOrder);
      }
      this.syncDeliveryVisuals();
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
    const vehicleHud = this.sceneManager?.vehicleManager.getActiveHudState() ?? null;
    const isDriving = Boolean(vehicleHud?.isDriving);
    const activeVehicle = this.sceneManager?.vehicleManager.getActiveVehicleEntity() ?? null;

    const liveX = isDriving && activeVehicle ? activeVehicle.controller.x : pState.x;
    const liveZ = isDriving && activeVehicle ? activeVehicle.controller.z : pState.z;
    const liveHeading = isDriving && activeVehicle ? activeVehicle.controller.heading : pState.heading;

    const district = getDistrictAt(liveX, liveZ);
    const geo = worldToGeo(liveX, liveZ);
    const biome = getBiomeAtWorld(liveX, liveZ);

    // Resolve closest Taluk name from district metadata or nearest taluk headquarters
    const matchingPlace = KOZHIKODE_GAZETTEER_PLACES.find((p) => p.id === district.id);
    const talukId = matchingPlace?.talukId ?? 'kozhikode';
    const talukName = KOZHIKODE_TALUKS.find((t) => t.id === talukId)?.name ?? 'Kozhikode Taluk';

    const homeDist = Math.round(
      Math.hypot(
        liveX - PROTAGONIST_HOME_COORDS.gateX,
        liveZ - PROTAGONIST_HOME_COORDS.gateZ,
      ),
    );

    let activeDestinationSnapshot: ActiveDestinationState | null = null;
    if (this.activeDestination) {
      const liveDist = Math.round(
        Math.hypot(this.activeDestination.worldX - liveX, this.activeDestination.worldZ - liveZ),
      );
      activeDestinationSnapshot = {
        ...this.activeDestination,
        distanceMeters: liveDist,
        realDistanceKm: Number(worldDistanceToRealKm(liveDist).toFixed(2)),
      };
    }

    const nearest = !isDriving
      ? this.sceneManager?.findNearestInteractableBuilding(liveX, liveZ, 8.5)
      : null;
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
    const currentHour = this.sceneManager?.getCurrentClockHour() ?? 17.6;
    const deliverySnap = this.delivery.buildHudSnapshot(liveX, liveZ, currentHour);
    const activeOrder = deliverySnap.activeOrder;

    const nearbyDeliveryPickup: NearbyDeliveryPickupCandidate | null =
      !isDriving &&
      activeOrder &&
      (activeOrder.status === 'accepted' ||
        activeOrder.status === 'preparing' ||
        activeOrder.status === 'ready_for_pickup') &&
      (deliverySnap.pickupDistanceMeters ?? 999) <= DELIVERY_INTERACTION_RANGE_METERS
        ? {
            orderId: activeOrder.orderId,
            restaurantName: activeOrder.restaurantName,
            malayalamName: activeOrder.restaurantMalayalamName,
            distanceMeters: deliverySnap.pickupDistanceMeters ?? 0,
            isReady: activeOrder.status === 'ready_for_pickup',
            prepRemainingSec: activeOrder.prepRemainingSec,
          }
        : null;

    const nearbyDeliveryDropoff: NearbyDeliveryDropoffCandidate | null =
      !isDriving &&
      activeOrder &&
      (activeOrder.status === 'picked_up' || activeOrder.status === 'in_transit') &&
      (deliverySnap.dropoffDistanceMeters ?? 999) <= DELIVERY_INTERACTION_RANGE_METERS
        ? {
            orderId: activeOrder.orderId,
            placeLabel: activeOrder.customerPlaceLabel,
            customerName: activeOrder.customerName,
            distanceMeters: deliverySnap.dropoffDistanceMeters ?? 0,
          }
        : null;

    const nearbyNpc = !isDriving
      ? (this.sceneManager?.getNearbyPedestrianForTalk(liveX, liveZ, 2.6) ?? null)
      : null;
    const nearbyVehicle = !isDriving
      ? (this.sceneManager?.findNearestEnterableVehicle(liveX, liveZ, 2.4) ?? null)
      : null;
    const nearbyInteraction: ContextualInteractionTarget | null = resolveContextualInteraction({
      nearbyBuilding,
      nearHome,
      homeDistanceMeters: homeDist,
      nearbyNpc,
      nearbyVehicle,
      nearbyDeliveryPickup,
      nearbyDeliveryDropoff,
      isDriving,
    });

    return {
      mode: this.mode,
      cameraMode: this.cameraManager?.getMode() ?? 'title_orbit',
      cameraPreset: this.cameraManager?.getThirdPersonPreset() ?? 'standard',
      cameraX: focus.x,
      cameraZ: focus.z,
      cameraYaw: focus.yaw,
      playerX: liveX,
      playerZ: liveZ,
      playerLat: Number(geo.lat.toFixed(5)),
      playerLon: Number(geo.lon.toFixed(5)),
      playerHeading: liveHeading,
      isMoving: isDriving ? (vehicleHud?.speedMps ?? 0) > 0.2 : pState.isMoving,
      isSprinting: isDriving ? false : pState.isSprinting,
      isGrounded: isDriving ? true : pState.isGrounded,
      movementGait: pState.movementGait,
      animationState: animSnap?.activeState === 'driving' ? 'idle' : (animSnap?.activeState ?? 'idle'),
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
      vehicle: vehicleHud,
      delivery: deliverySnap,
      progression: this.progression.getState(),
      activeDestination: activeDestinationSnapshot,
      ambientStats: this.sceneManager?.getAmbientStats(liveX, liveZ),
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
    this.audio.stopDrivingAudio();

    if (resetSpawn && this.sceneManager) {
      this.sceneManager.vehicleManager.clearAll(
        this.sceneManager.worldStreamer,
        this.sceneManager.trafficSystem,
      );
      this.vehiclesRestoredOnStart = true;
      void this.storage.saveActiveWorldVehicles(null);
      this.progression.restore(createDefaultProgressionState());
      this.delivery.restoreActiveOrder(null, null);
      if (this.activeDestination?.source === 'delivery') {
        this.activeDestination = null;
        this.sceneManager.setDestinationBeacon(null);
      }
      this.player.resetSpawn(PROTAGONIST_HOME_COORDS.porchX, PROTAGONIST_HOME_COORDS.porchZ, 0);
      void this.persistProgression();
    }

    const pState = this.player.getState();
    let restoredActiveDriving = false;

    if (this.sceneManager) {
      this.sceneManager.update(0, pState.x, pState.z, this.cameraManager?.camera);
      const colliders = this.sceneManager.getColliders();
      const groundFn = (x: number, z: number) => this.sceneManager!.getGroundHeight(x, z);
      this.player.setEnvironment(colliders, groundFn);
      this.cameraManager?.setEnvironment(colliders, groundFn);

      if (!resetSpawn && !this.vehiclesRestoredOnStart) {
        this.vehiclesRestoredOnStart = true;
        void this.restorePersistedVehiclesAsync();
      } else {
        restoredActiveDriving = this.sceneManager.vehicleManager.isDriving();
        if (resetSpawn || this.sceneManager.vehicleManager.getWorldVehicles().length === 0) {
          this.ensureStarterScooterNearby();
        }
      }

      if (resetSpawn) {
        this.delivery.refreshAvailableOrders(
          pState.x,
          pState.z,
          this.sceneManager.getCurrentClockHour(),
          this.progression.getState(),
          this.progression.getTipBonusMultiplier(),
        );
      }

      this.syncDeliveryVisuals();

      if (!restoredActiveDriving) {
        this.sceneManager.syncPlayerVisual(this.player.getState(), 0, this.cameraManager?.camera);
      }
    }

    if (restoredActiveDriving) {
      const active = this.sceneManager?.vehicleManager.getActiveVehicleEntity();
      this.cameraManager?.setMode('vehicle_chase');
      if (active) {
        this.player.position.set(active.controller.x, active.controller.y, active.controller.z);
        this.cameraManager?.snapToTarget(this.player.position, active.controller.heading + Math.PI);
      }
    } else {
      this.cameraManager?.setMode('free_inspect');
      this.cameraManager?.snapToTarget(this.player.position, Math.PI);
    }

    this.gameLoop?.setPaused(false);
    this.setMode('playing');
    this.logger.info('GameEngine', 'Entered open-world Kozhikode slice at West Hill residence');
  }

  private ensureStarterScooterNearby(): void {
    if (!this.sceneManager) return;
    if (this.sceneManager.vehicleManager.getWorldVehicles().length > 0) return;
    const ownedModel = this.progression.getState().ownedVehicleModels[0] ?? 'honda_activa';
    const spec =
      PURCHASABLE_VEHICLES_CATALOG.find((v) => v.modelId === ownedModel) ??
      PURCHASABLE_VEHICLES_CATALOG[0];
    this.sceneManager.vehicleManager.spawnOwnedVehicleNearPlayer(
      spec.modelId,
      spec.colorHex,
      {
        x: PROTAGONIST_HOME_COORDS.gateX + 3.2,
        z: PROTAGONIST_HOME_COORDS.gateZ + 4.2,
        heading: Math.PI * 0.5,
      },
      this.sceneManager.materials,
      this.sceneManager.getColliders(),
      this.sceneManager.getTrafficVehicleColliders(),
      (x, z) => this.sceneManager!.getGroundHeight(x, z),
    );
  }

  private async restorePersistedVehiclesAsync(): Promise<void> {
    if (!this.sceneManager || this.disposed) return;
    const saved = await this.storage.getSavedWorldVehicles();
    if (this.disposed) return;
    if (!saved || saved.vehicles.length === 0) {
      this.ensureStarterScooterNearby();
      this.syncDeliveryVisuals();
      this.emitHudImmediate();
      return;
    }
    const groundFn = (x: number, z: number) => this.sceneManager!.getGroundHeight(x, z);
    const { restoredActiveEntity } = this.sceneManager.vehicleManager.restorePersistedState(
      saved,
      this.sceneManager.materials,
      this.sceneManager.worldStreamer,
      this.sceneManager.trafficSystem,
      groundFn,
    );
    if (restoredActiveEntity && this.mode === 'playing') {
      this.cameraManager?.setMode('vehicle_chase');
      this.player.position.set(
        restoredActiveEntity.controller.x,
        restoredActiveEntity.controller.y,
        restoredActiveEntity.controller.z,
      );
      this.cameraManager?.snapToTarget(
        this.player.position,
        restoredActiveEntity.controller.heading + Math.PI,
      );
    }
    this.syncDeliveryVisuals();
    this.emitHudImmediate();
  }

  private async persistWorldVehicles(): Promise<void> {
    if (!this.sceneManager) return;
    const state = this.sceneManager.vehicleManager.exportPersistedState();
    await this.storage.saveActiveWorldVehicles(state);
  }

  private async persistProgression(): Promise<void> {
    await this.storage.saveProgression(
      this.progression.getState(),
      this.delivery.getActiveOrder(),
    );
  }

  setMapToggleHandler(handler: (() => void) | null): void {
    this.mapToggleHandler = handler;
  }

  setExternalModalOpen(open: boolean): void {
    this.externalModalOpen = open;
    if (open) {
      this.audio.stopDrivingAudio();
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
      this.audio.stopDrivingAudio();
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
    this.audio.stopDrivingAudio();
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
    const activeCamMode = this.cameraManager.getMode();
    if (
      this.mode === 'playing' &&
      (activeCamMode === 'free_inspect' || activeCamMode === 'vehicle_chase')
    ) {
      const nextPreset = this.cameraManager.cycleThirdPersonPreset();
      this.settings = { ...this.settings, cameraPreset: nextPreset };
      void this.storage.saveSettings(this.settings);
      this.audio.playUiSound('ui_click');
      const labels: Record<ThirdPersonCameraPreset, string> = {
        close: activeCamMode === 'vehicle_chase' ? 'Chase Cam: Close' : 'Camera: Close Follow',
        standard: activeCamMode === 'vehicle_chase' ? 'Chase Cam: Standard' : 'Camera: Standard Third-Person',
        wide: activeCamMode === 'vehicle_chase' ? 'Chase Cam: Wide' : 'Camera: Wide Street View',
      };
      this.pushInteractionNotice(labels[nextPreset]);
      this.emitHudImmediate();
      return;
    }
    this.setCameraMode(activeCamMode === 'title_orbit' ? 'free_inspect' : 'title_orbit');
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

  tryEnterVehicle(): boolean {
    if (!this.sceneManager || this.mode !== 'playing') return false;
    const pState = this.player.getState();
    const res = this.sceneManager.vehicleManager.requestEnterVehicle(
      { x: pState.x, y: pState.y, z: pState.z, heading: pState.heading },
      this.sceneManager.worldStreamer,
      this.sceneManager.trafficSystem,
    );

    if (!res.accepted || !res.entity) {
      if (res.reason) {
        this.pushInteractionNotice(res.reason);
      }
      this.audio.playUiSound('ui_back');
      this.emitHudImmediate();
      return false;
    }

    const prof = res.entity.controller.profile;
    this.input.clearAll();
    const colliders = this.sceneManager.getColliders();
    const groundFn = (x: number, z: number) => this.sceneManager!.getGroundHeight(x, z);
    this.player.setEnvironment(colliders, groundFn);
    this.cameraManager?.setEnvironment(colliders, groundFn);
    this.cameraManager?.setMode('vehicle_chase');
    void this.audio.unlockFromGesture().then(() => {
      if (prof.isEnclosed) {
        this.audio.playCharacterEvent('door_open');
      } else {
        this.audio.playUiSound('ui_click');
      }
    });
    this.pushInteractionNotice(`Entered ${prof.displayName}`);
    this.syncDeliveryVisuals();
    this.events.emit('vehicle:entered', {
      vehicleId: res.entity.id,
      modelId: res.entity.modelId,
      displayName: prof.displayName,
    });
    void this.persistWorldVehicles();
    this.emitHudImmediate();
    return true;
  }

  tryExitVehicle(): boolean {
    if (!this.sceneManager) return false;
    const colliders = this.sceneManager.getColliders();
    const trafficColliders = this.sceneManager.getTrafficVehicleColliders();
    const groundFn = (x: number, z: number) => this.sceneManager!.getGroundHeight(x, z);
    const res = this.sceneManager.vehicleManager.requestExitVehicle(
      colliders,
      trafficColliders,
      groundFn,
    );

    if (!res.exited) {
      if (res.reason) {
        this.pushInteractionNotice(res.reason);
      }
      this.audio.playUiSound('ui_back');
      this.emitHudImmediate();
      return false;
    }

    this.audio.stopDrivingAudio();
    this.input.clearVehicleVirtualControls();
    this.player.setEnvironment(colliders, groundFn);
    this.player.resetSpawn(res.exitX!, res.exitZ!, res.exitHeading ?? 0);
    this.syncDeliveryVisuals();
    this.sceneManager.syncPlayerVisual(this.player.getState(), 0, this.cameraManager?.camera);
    this.cameraManager?.setMode('free_inspect');
    this.cameraManager?.snapToTarget(this.player.position, (res.exitHeading ?? 0) + Math.PI);
    void this.audio.unlockFromGesture().then(() => {
      this.audio.playCharacterEvent('door_close');
    });
    this.events.emit('vehicle:exited', {
      vehicleId: res.vehicleId ?? '',
      modelId: res.modelId ?? '',
    });
    void this.persistWorldVehicles();
    this.emitHudImmediate();
    return true;
  }

  triggerVehicleHorn(): void {
    const active = this.sceneManager?.vehicleManager.getActiveVehicleEntity();
    if (!active) return;
    void this.audio.unlockFromGesture().then(() => {
      this.audio.playDrivingHorn(active.controller.profile.audioKind);
    });
  }

  interactWithNearbyBuilding(): string {
    if (this.sceneManager?.vehicleManager.isDriving()) {
      this.tryExitVehicle();
      return '';
    }
    const pState = this.player.getState();
    const hour = this.sceneManager?.getCurrentClockHour() ?? 17.6;
    const delSnap = this.delivery.buildHudSnapshot(pState.x, pState.z, hour);
    if (delSnap.canDeliverNearby) {
      const res = this.deliverNearbyOrder();
      return res.reason;
    }
    if (delSnap.activeOrder && (delSnap.pickupDistanceMeters ?? 999) <= DELIVERY_INTERACTION_RANGE_METERS) {
      if (delSnap.activeOrder.status === 'ready_for_pickup') {
        const res = this.pickupNearbyOrder();
        return res.reason;
      }
      if (
        delSnap.activeOrder.status === 'preparing' ||
        delSnap.activeOrder.status === 'accepted'
      ) {
        return `Kitchen packing order (${Math.ceil(delSnap.activeOrder.prepRemainingSec)}s left)`;
      }
    }

    const nearbyVehicle = this.sceneManager?.findNearestEnterableVehicle(pState.x, pState.z, 2.4) ?? null;
    const nearest = this.sceneManager?.findNearestInteractableBuilding(pState.x, pState.z, 8.5);
    if (
      nearbyVehicle &&
      nearbyVehicle.canEnter &&
      (!nearest || nearbyVehicle.distanceMeters <= nearest.distanceMeters + 0.6)
    ) {
      this.tryEnterVehicle();
      return '';
    }
    if (!nearest) {
      if (nearbyVehicle && !nearbyVehicle.canEnter && nearbyVehicle.reason) {
        return nearbyVehicle.reason;
      }
      const nearbyNpc = this.sceneManager?.getNearbyPedestrianForTalk(pState.x, pState.z, 2.6);
      if (nearbyNpc) {
        const district = getDistrictAt(pState.x, pState.z);
        const nearTeaShop =
          (this.sceneManager?.getNearestTeaShopDistance(pState.x, pState.z) ?? 999) <= 22;
        void this.audio.unlockFromGesture().then(() => {
          this.audio.playGameEvent('npc_greet');
        });
        this.sceneManager?.triggerArjunAction('talk', 1.45);
        const line = getFriendlyNpcGreeting(
          nearbyNpc.id,
          nearbyNpc.variant,
          district.name,
          nearTeaShop,
        );
        return `${nearbyNpc.label} · "${line}"`;
      }
      const homeDist = Math.hypot(
        pState.x - PROTAGONIST_HOME_COORDS.gateX,
        pState.z - PROTAGONIST_HOME_COORDS.gateZ,
      );
      if (homeDist <= 16) {
        this.playHomeDoorPreview();
        return "West Hill Tharavadu · Arjun's Family Home (Rest & Upgrades on Delivery Board)";
      }
      return '';
    }
    const b = nearest.building;
    const isTeaShop = b.futureHooks.businessTag === 'chai_peedika_kerala';
    const nearRest = findRestaurantNearPoint(pState.x, pState.z, 12);
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
      return `${b.name} (${b.malayalamName}) · Arjun's Family Home`;
    }
    if (isTeaShop) {
      this.sceneManager?.triggerArjunAction('drink_tea', 1.6);
      return `${b.name} (${b.malayalamName}) · Hot Meter Chai & Pazham Pori · Check Orders for pickups`;
    }
    if (nearRest) {
      this.sceneManager?.triggerArjunAction('talk', 1.25);
      return `${nearRest.restaurant.name} (${nearRest.restaurant.malayalamName}) · ${nearRest.restaurant.ambientTag}`;
    }
    if (b.interiorEligible) {
      return `${b.name} (${b.malayalamName}) · Neighbourhood Hub`;
    }
    return `${b.name} (${b.malayalamName}) · Kozhikode Streetfront`;
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
    source: 'gazetteer' | 'google_places' | 'delivery';
  }): void {
    this.applyDestinationWaypoint(dest, true);
  }

  private applyDestinationWaypoint(
    dest: {
      id: string;
      name: string;
      malayalamName?: string;
      worldX: number;
      worldZ: number;
      lat: number;
      lon: number;
      source: 'gazetteer' | 'google_places' | 'delivery';
    },
    playClickSound: boolean,
  ): void {
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
    if (playClickSound) {
      this.audio.playUiSound('ui_click');
    }
    this.emitHudImmediate();
  }

  private applyDeliveryDestination(order: import('./types.ts').DeliveryOrder): void {
    const goingToDropoff = order.status === 'picked_up' || order.status === 'in_transit';
    const x = goingToDropoff ? order.dropoffX : order.pickupX;
    const z = goingToDropoff ? order.dropoffZ : order.pickupZ;
    const geo = worldToGeo(x, z);
    this.applyDestinationWaypoint(
      {
        id: goingToDropoff ? order.customerId : order.restaurantId,
        name: goingToDropoff
          ? `Deliver: ${order.customerPlaceLabel}`
          : `Pickup: ${order.restaurantName}`,
        malayalamName: goingToDropoff ? order.customerName : order.restaurantMalayalamName,
        worldX: x,
        worldZ: z,
        lat: geo.lat,
        lon: geo.lon,
        source: 'delivery',
      },
      false,
    );
  }

  private syncDeliveryVisuals(): void {
    if (!this.sceneManager) return;
    const order = this.delivery.getActiveOrder();
    const prog = this.progression.getState();
    const carryingFood = Boolean(
      order && (order.status === 'picked_up' || order.status === 'in_transit'),
    );
    const wantBag = prog.bagEquipped || carryingFood;

    const activeVeh = this.sceneManager.vehicleManager.getActiveVehicleEntity();
    const drivingWithRack = Boolean(activeVeh && activeVeh.deliveryBoxGroup);
    const bagOnArjun = wantBag && !drivingWithRack;
    const bagOnVehicle = wantBag && drivingWithRack;
    const bagKey = `${bagOnArjun ? 1 : 0}_${bagOnVehicle ? 1 : 0}_${activeVeh?.id ?? ''}`;
    if (bagKey !== this.lastBagSyncKey) {
      this.lastBagSyncKey = bagKey;
      this.sceneManager.setArjunDeliveryBagVisible(bagOnArjun);
      this.sceneManager.vehicleManager.setActiveDeliveryBagEquipped(bagOnVehicle);
    }

    let pickupMarker: { x: number; z: number } | null = null;
    let dropoffMarker: { x: number; z: number } | null = null;
    if (order) {
      if (
        order.status === 'accepted' ||
        order.status === 'preparing' ||
        order.status === 'ready_for_pickup'
      ) {
        pickupMarker = { x: order.pickupX, z: order.pickupZ };
      } else if (order.status === 'picked_up' || order.status === 'in_transit') {
        dropoffMarker = { x: order.dropoffX, z: order.dropoffZ };
      }
    }
    const markerKey = `${pickupMarker ? `${pickupMarker.x},${pickupMarker.z}` : 'none'}|${dropoffMarker ? `${dropoffMarker.x},${dropoffMarker.z}` : 'none'}`;
    if (markerKey !== this.lastMarkerSyncKey) {
      this.lastMarkerSyncKey = markerKey;
      this.sceneManager.setDeliveryMarkers(pickupMarker, dropoffMarker);
    }
  }

  refreshDeliveryOrders(): void {
    const pState = this.player.getState();
    const hour = this.sceneManager?.getCurrentClockHour() ?? 17.6;
    this.delivery.refreshAvailableOrders(
      pState.x,
      pState.z,
      hour,
      this.progression.getState(),
      this.progression.getTipBonusMultiplier(),
    );
    this.audio.playUiSound('ui_click');
    this.emitHudImmediate();
  }

  acceptDeliveryOrder(orderId: string): { ok: boolean; reason: string } {
    const res = this.delivery.acceptOrder(orderId);
    if (!res.ok || !res.order) {
      this.pushInteractionNotice(res.reason);
      this.audio.playUiSound('ui_back');
      this.emitHudImmediate();
      return { ok: false, reason: res.reason };
    }
    this.applyDeliveryDestination(res.order);
    this.syncDeliveryVisuals();
    void this.audio.unlockFromGesture().then(() => {
      this.audio.playGameEvent('order_accept');
    });
    this.pushInteractionNotice(res.reason);
    void this.persistProgression();
    this.emitHudImmediate();
    return { ok: true, reason: res.reason };
  }

  pickupNearbyOrder(): { ok: boolean; reason: string } {
    const pState = this.player.getState();
    const res = this.delivery.pickupOrder(pState.x, pState.z);
    if (!res.ok || !res.order) {
      this.pushInteractionNotice(res.reason);
      this.audio.playUiSound('ui_back');
      this.emitHudImmediate();
      return { ok: false, reason: res.reason };
    }
    this.progression.discoverRestaurant(res.order.restaurantId);
    this.applyDeliveryDestination(res.order);
    this.syncDeliveryVisuals();
    this.sceneManager?.triggerArjunAction('pickup_package', 1.35);
    void this.audio.unlockFromGesture().then(() => {
      this.audio.playGameEvent('food_pickup');
    });
    this.pushInteractionNotice(res.reason);
    void this.persistProgression();
    this.emitHudImmediate();
    return { ok: true, reason: res.reason };
  }

  deliverNearbyOrder(): { ok: boolean; reason: string } {
    const pState = this.player.getState();
    const res = this.delivery.deliverOrder(
      pState.x,
      pState.z,
      this.progression.getTipBonusMultiplier(),
    );
    if (!res.ok || !res.record) {
      this.pushInteractionNotice(res.reason);
      this.audio.playUiSound('ui_back');
      this.emitHudImmediate();
      return { ok: false, reason: res.reason };
    }
    this.progression.recordCompletedDelivery(res.record);
    if (this.activeDestination?.source === 'delivery') {
      this.activeDestination = null;
      this.sceneManager?.setDestinationBeacon(null);
    }
    this.syncDeliveryVisuals();
    this.sceneManager?.triggerArjunAction('deliver_package', 1.45);
    void this.audio.unlockFromGesture().then(() => {
      this.audio.playGameEvent('delivery_complete');
      this.audio.playGameEvent('reward_chime');
    });
    this.pushInteractionNotice(`${res.reason} · "${res.record.customerReview}"`);
    void this.persistProgression();
    this.emitHudImmediate();
    return { ok: true, reason: res.reason };
  }

  cancelActiveOrder(): void {
    const cancelled = this.delivery.cancelActiveOrder();
    if (!cancelled) return;
    if (this.activeDestination?.source === 'delivery') {
      this.activeDestination = null;
      this.sceneManager?.setDestinationBeacon(null);
    }
    this.syncDeliveryVisuals();
    this.audio.playUiSound('ui_back');
    this.pushInteractionNotice(`Cancelled order from ${cancelled.restaurantName}`);
    void this.persistProgression();
    this.emitHudImmediate();
  }

  navigateToRestaurant(restaurantId: string): void {
    const rest = getRestaurantById(restaurantId);
    if (!rest) return;
    const geo = worldToGeo(rest.pickupX, rest.pickupZ);
    this.setDestinationWaypoint({
      id: rest.id,
      name: rest.name,
      malayalamName: rest.malayalamName,
      worldX: rest.pickupX,
      worldZ: rest.pickupZ,
      lat: geo.lat,
      lon: geo.lon,
      source: 'gazetteer',
    });
    this.pushInteractionNotice(`Route set to ${rest.name} (${rest.areaLabel})`);
  }

  purchaseLifestyleUpgrade(upgradeId: LifestyleUpgradeId): { ok: boolean; reason: string } {
    const res = this.progression.purchaseUpgrade(upgradeId);
    if (!res.ok) {
      this.pushInteractionNotice(res.reason);
      this.audio.playUiSound('ui_back');
      this.emitHudImmediate();
      return res;
    }
    void this.audio.unlockFromGesture().then(() => {
      this.audio.playGameEvent('reward_chime');
    });
    this.pushInteractionNotice(res.reason);
    void this.persistProgression();
    this.emitHudImmediate();
    return res;
  }

  purchaseOwnedVehicle(modelId: VehicleModelId): { ok: boolean; reason: string } {
    const res = this.progression.purchaseVehicle(modelId);
    if (!res.ok) {
      this.pushInteractionNotice(res.reason);
      this.audio.playUiSound('ui_back');
      this.emitHudImmediate();
      return { ok: false, reason: res.reason };
    }
    void this.audio.unlockFromGesture().then(() => {
      this.audio.playGameEvent('reward_chime');
    });
    this.pushInteractionNotice(res.reason);
    void this.persistProgression();
    this.emitHudImmediate();
    return { ok: true, reason: res.reason };
  }

  summonOwnedVehicle(modelId: VehicleModelId): { ok: boolean; reason: string } {
    if (!this.sceneManager) {
      return { ok: false, reason: 'World scene not ready yet' };
    }
    const owned = this.progression.getState().ownedVehicleModels;
    if (!owned.includes(modelId)) {
      const reason = 'Purchase this vehicle in the Garage first';
      this.pushInteractionNotice(reason);
      this.audio.playUiSound('ui_back');
      return { ok: false, reason };
    }
    const spec =
      PURCHASABLE_VEHICLES_CATALOG.find((v) => v.modelId === modelId) ??
      PURCHASABLE_VEHICLES_CATALOG[0];
    const pState = this.player.getState();
    const res = this.sceneManager.vehicleManager.spawnOwnedVehicleNearPlayer(
      modelId,
      spec.colorHex,
      { x: pState.x, z: pState.z, heading: pState.heading },
      this.sceneManager.materials,
      this.sceneManager.getColliders(),
      this.sceneManager.getTrafficVehicleColliders(),
      (x, z) => this.sceneManager!.getGroundHeight(x, z),
    );
    if (!res.ok) {
      this.pushInteractionNotice(res.reason);
      this.audio.playUiSound('ui_back');
      this.emitHudImmediate();
      return { ok: false, reason: res.reason };
    }
    this.audio.playUiSound('ui_click');
    this.pushInteractionNotice(res.reason);
    void this.persistWorldVehicles();
    this.emitHudImmediate();
    return { ok: true, reason: res.reason };
  }

  toggleDeliveryBag(equipped?: boolean): void {
    const next = equipped ?? !this.progression.getState().bagEquipped;
    this.progression.setBagEquipped(next);
    this.syncDeliveryVisuals();
    this.audio.playUiSound('ui_click');
    void this.persistProgression();
    this.emitHudImmediate();
  }

  clearDestinationWaypoint(): void {
    this.activeDestination = null;
    this.sceneManager?.setDestinationBeacon(null);
    this.audio.playUiSound('ui_back');
    this.emitHudImmediate();
  }

  private teleportTo(x: number, z: number, heading: number): void {
    if (this.sceneManager?.vehicleManager.isDriving()) {
      const active = this.sceneManager.vehicleManager.getActiveVehicleEntity();
      if (active) {
        active.controller.parkImmediately((gx, gz) => this.sceneManager!.getGroundHeight(gx, gz));
      }
      this.audio.stopDrivingAudio();
      // Exit cleanly so fast-travel drops Arjun on foot cleanly at the chosen landmark
      const colliders = this.sceneManager.getColliders();
      const traffic = this.sceneManager.getTrafficVehicleColliders();
      this.sceneManager.vehicleManager.requestExitVehicle(
        colliders,
        traffic,
        (gx, gz) => this.sceneManager!.getGroundHeight(gx, gz),
      );
      this.cameraManager?.setMode('free_inspect');
    }

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
    const activeVeh = this.sceneManager?.vehicleManager.getActiveVehicleEntity();
    const saveX = activeVeh ? activeVeh.controller.x : pState.x;
    const saveZ = activeVeh ? activeVeh.controller.z : pState.z;
    const district = getDistrictAt(saveX, saveZ);
    const vehicleState = this.sceneManager?.vehicleManager.exportPersistedState();
    await this.storage.saveActiveWorldVehicles(vehicleState ?? null);
    await this.persistProgression();

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
      vehicleState,
      progressionState: this.progression.getState(),
      activeOrder: this.delivery.getActiveOrder(),
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

    let vehicleCamCtx: import('./camera/CameraManager.ts').VehicleCameraContext | null = null;
    let isDrivingNow = this.sceneManager?.vehicleManager.isDriving() ?? false;

    if (this.mode === 'playing') {
      this.playtimeSeconds += fixedDt;
      if (frameInput.justPressed.toggle_camera) {
        this.toggleCameraMode();
      }
      if (frameInput.justPressed.interact) {
        if (isDrivingNow) {
          this.tryExitVehicle();
          isDrivingNow = this.sceneManager?.vehicleManager.isDriving() ?? false;
        } else {
          const msg = this.interactWithNearbyBuilding();
          isDrivingNow = this.sceneManager?.vehicleManager.isDriving() ?? false;
          if (msg) {
            this.pushInteractionNotice(msg);
            this.emitHudImmediate();
          }
        }
      }

      if (isDrivingNow && this.sceneManager) {
        if (frameInput.vehicle.hornJustPressed) {
          this.triggerVehicleHorn();
        }
        const colliders = this.sceneManager.getColliders();
        const groundFn = (x: number, z: number) => this.sceneManager!.getGroundHeight(x, z);
        const trafficVehicles = this.sceneManager.getTrafficVehicleColliders();
        const pedestrians = this.sceneManager.pedestrianSystem.getPedestrians();
        const activeBefore = this.sceneManager.vehicleManager.getActiveVehicleEntity();
        const audioKind = activeBefore?.controller.profile.audioKind ?? 'car';

        const stepRes = this.sceneManager.vehicleManager.update(
          fixedDt,
          frameInput.vehicle,
          {
            colliders,
            groundHeightFn: groundFn,
            trafficVehicles,
            pedestrians,
            onPedestrianImpact: (pedId, pushX, pushZ) => {
              this.sceneManager?.pedestrianSystem.pushPedestrian(pedId, pushX, pushZ);
            },
            onCollision: (ev) => {
              this.audio.playDrivingCollision(audioKind, ev.impactSpeedMps);
              const carrying = this.delivery.getActiveOrder();
              if (
                carrying &&
                (carrying.status === 'picked_up' || carrying.status === 'in_transit')
              ) {
                const prevCond = Math.round(carrying.packageState.foodCondition);
                const nextCond = this.delivery.applyTransitBump(
                  ev.impactSpeedMps,
                  this.progression.getBumpMitigationFactor(),
                );
                if (nextCond < prevCond) {
                  this.pushInteractionNotice(
                    `Easy on the bumps! Food condition ${nextCond}%`,
                  );
                }
              }
              this.events.emit('vehicle:collision', {
                impactSpeedMps: ev.impactSpeedMps,
                damageState: ev.damageState,
                kind: ev.kind,
              });
            },
          },
          this.cameraManager?.camera,
          false,
        );

        const ds = stepRes.driveState;
        if (ds) {
          this.player.position.set(ds.x, ds.y, ds.z);
          this.player.visualY = ds.y;
          this.player.heading = ds.heading;
          this.sceneManager.syncPlayerVehicleVisual(
            stepRes,
            this.player.getState(),
            fixedDt,
            this.cameraManager?.camera,
          );
          this.audio.updateDrivingAudio(fixedDt, {
            audioKind: ds.profile.audioKind,
            rpmNormalized: ds.rpmNormalized,
            speedMps: ds.speedMps,
            isBraking: ds.isBraking,
            isDrifting: ds.isDrifting,
          });
          vehicleCamCtx = {
            x: ds.x,
            y: ds.y,
            z: ds.z,
            heading: ds.heading,
            speedMps: ds.speedMps,
            length: ds.profile.length,
            height: ds.profile.height,
            isReversing: ds.isReversing,
          };
        }
      } else {
        this.audio.updateDrivingAudio(fixedDt, null);
        const camYaw = this.cameraManager?.getYaw() ?? 0;
        const obstacles = this.sceneManager?.getDynamicObstacles();
        const moveState = this.player.update(fixedDt, frameInput, camYaw, obstacles);
        this.sceneManager?.syncPlayerVisual(moveState, fixedDt, this.cameraManager?.camera);
      }

      // Advance active delivery kitchen countdown, transit status & city discovery
      const livePos = this.player.getState();
      const clockHour = this.sceneManager?.getCurrentClockHour() ?? 17.6;
      const delStep = this.delivery.update(
        fixedDt,
        livePos.x,
        livePos.z,
        clockHour,
        this.progression.getState(),
        this.progression.getTipBonusMultiplier(),
      );
      if (delStep.orderBecameReady) {
        const activeOrd = this.delivery.getActiveOrder();
        this.pushInteractionNotice(
          `${activeOrd?.restaurantName ?? 'Order'} packed & ready for pickup!`,
        );
        this.audio.playGameEvent('notification');
        void this.persistProgression();
      }
      this.discoverCheckAccumSec += fixedDt;
      if (this.discoverCheckAccumSec >= 0.4) {
        this.discoverCheckAccumSec = 0;
        const curDistrict = getDistrictAt(livePos.x, livePos.z);
        const newDist = this.progression.discoverDistrict(curDistrict.id);
        const nearRest = findRestaurantNearPoint(livePos.x, livePos.z, 16);
        const newRest = nearRest
          ? this.progression.discoverRestaurant(nearRest.restaurant.id)
          : false;
        if (newRest && nearRest) {
          this.pushInteractionNotice(
            `Discovered ${nearRest.restaurant.name} (${nearRest.restaurant.areaLabel})`,
          );
        }
        if (newDist || newRest) {
          void this.persistProgression();
        }
      }
      this.syncDeliveryVisuals();
    } else {
      this.audio.updateDrivingAudio(fixedDt, null);
    }

    const pState = this.player.getState();
    const streamFocusX = this.mode === 'title' ? 8 : pState.x;
    const streamFocusZ = this.mode === 'title' ? 0 : pState.z;
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
      isMoving: isDrivingNow ? false : pState.isMoving,
      isSprinting: isDrivingNow ? false : pState.isSprinting,
      speed: isDrivingNow ? 0 : pState.speed,
      teaShopDistanceMeters,
    });

    this.cameraManager?.update(fixedDt, frameInput, this.player.position, vehicleCamCtx);
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
