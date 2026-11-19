import { AssetManager } from './assets/AssetManager.ts';
import { CameraManager } from './camera/CameraManager.ts';
import { EventBus } from './core/EventBus.ts';
import { GameLoop } from './core/GameLoop.ts';
import { Logger } from './core/Logger.ts';
import { PerformanceMonitor } from './core/PerformanceMonitor.ts';
import { InputManager } from './input/InputManager.ts';
import { createDefaultSettings, IndexedDBStorage } from './persistence/IndexedDBStorage.ts';
import { PlayerController } from './player/PlayerController.ts';
import { RenderEngine } from './rendering/RenderEngine.ts';
import { SceneManager } from './scene/SceneManager.ts';
import type {
  CameraRigMode,
  EngineHudSnapshot,
  GameModeState,
  GameSettings,
  LogEntry,
  SaveSlotMeta,
} from './types.ts';

export class GameEngine {
  readonly logger = new Logger(250, 'info');
  readonly events = new EventBus(this.logger);
  readonly storage = new IndexedDBStorage(this.logger);
  readonly assets = new AssetManager(this.logger);
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

  private lastHudEmitMs = 0;
  private readonly hudListeners = new Set<(snapshot: EngineHudSnapshot) => void>();
  private disposed = false;

  async initialize(canvasHost: HTMLElement): Promise<void> {
    try {
      this.logger.info('GameEngine', 'Booting GTA Kozhikode Phase 1 foundation');
      await this.storage.initialize();
      this.settings = await this.storage.getSettings();
      this.slots = await this.storage.listSlots();
      this.input.setSensitivity(this.settings.touchSensitivity);

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
      );
      this.sceneManager.applyGraphicsTier(
        this.settings.graphicsTier,
        this.renderEngine.capabilities.isSoftwareGl,
      );
      this.player.setEnvironment(
        this.sceneManager.getColliders(),
        (x, z) => this.sceneManager!.getGroundHeight(x, z),
      );
      this.player.resetSpawn();
      this.sceneManager.syncPlayerVisual(this.player.getState(), 0);

      this.renderEngine.buildStudioEnvironment(this.sceneManager.scene);

      const width = Math.max(1, canvasHost.clientWidth);
      const height = Math.max(1, canvasHost.clientHeight);
      this.cameraManager = new CameraManager(width / height);
      this.cameraManager.setMode('title_orbit');

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
            this.perf.recordFrame(cpuMs, frameSteps);
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
    return {
      mode: this.mode,
      cameraMode: this.cameraManager?.getMode() ?? 'title_orbit',
      cameraX: focus.x,
      cameraZ: focus.z,
      cameraYaw: focus.yaw,
      playerX: pState.x,
      playerZ: pState.z,
      playerHeading: pState.heading,
      isMoving: pState.isMoving,
      isSprinting: pState.isSprinting,
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
    if (resetSpawn) {
      this.player.resetSpawn();
      this.sceneManager?.syncPlayerVisual(this.player.getState(), 0);
    }
    this.cameraManager?.setMode('free_inspect');
    this.gameLoop?.setPaused(false);
    this.setMode('playing');
    this.logger.info('GameEngine', 'Entered playable Mananchira scene');
  }

  togglePause(): void {
    if (this.mode === 'playing') {
      this.gameLoop?.setPaused(true);
      this.input.clearAll();
      this.setMode('paused');
    } else if (this.mode === 'paused') {
      this.gameLoop?.setPaused(false);
      this.setMode('playing');
    }
  }

  returnToTitle(): void {
    this.gameLoop?.setPaused(false);
    this.cameraManager?.setMode('title_orbit');
    this.input.clearAll();
    this.setMode('title');
  }

  setCameraMode(mode: CameraRigMode): void {
    this.cameraManager?.setMode(mode);
    this.emitHudImmediate();
  }

  toggleCameraMode(): void {
    const current = this.cameraManager?.getMode() ?? 'free_inspect';
    this.setCameraMode(current === 'title_orbit' ? 'free_inspect' : 'title_orbit');
  }

  resize(width: number, height: number): void {
    if (!this.renderEngine || !this.cameraManager) {
      return;
    }
    this.renderEngine.resize(width, height);
    this.cameraManager.setAspect(width, height);
  }

  async updateSettings(patch: Partial<GameSettings>): Promise<void> {
    const next = await this.storage.saveSettings({
      ...this.settings,
      ...patch,
    });
    this.settings = next;
    this.input.setSensitivity(next.touchSensitivity);
    if (this.renderEngine) {
      this.renderEngine.applyQualitySettings(next.graphicsTier, next.pixelRatioCap);
      this.sceneManager?.applyGraphicsTier(
        next.graphicsTier,
        this.renderEngine.capabilities.isSoftwareGl,
      );
    }
    this.events.emit('settings:updated', { graphicsTier: next.graphicsTier });
    this.logger.info('Settings', `Applied tier=${next.graphicsTier}, dprCap=${next.pixelRatioCap}`);
    this.emitHudImmediate();
  }

  async resetSettings(): Promise<void> {
    const defaults = await this.storage.resetSettings();
    await this.updateSettings(defaults);
  }

  async saveCheckpoint(slotId = 'slot_manual_1', label = 'Mananchira Promenade'): Promise<SaveSlotMeta> {
    const slotType = slotId.startsWith('slot_auto') ? 'autosave' : 'manual';
    const saved = await this.storage.upsertSlot({
      slotId,
      slotType,
      label,
      schemaVersion: 1,
      districtName: 'Mananchira Core',
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
    this.gameLoop?.stop();
    this.input.detach();
    this.sceneManager?.dispose();
    this.assets.disposeAll();
    this.renderEngine?.dispose();
    this.storage.close();
    this.events.clear();
    this.hudListeners.clear();
    this.logger.info('GameEngine', 'Disposed engine cleanly');
  }

  private setMode(next: GameModeState): void {
    if (this.mode === next) {
      return;
    }
    const prev = this.mode;
    this.mode = next;
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

    if (this.mode === 'playing') {
      this.playtimeSeconds += fixedDt;
      const camYaw = this.cameraManager?.getYaw() ?? 0;
      const moveState = this.player.update(fixedDt, frameInput, camYaw);
      this.sceneManager?.syncPlayerVisual(moveState, fixedDt);
    }

    this.sceneManager?.update(fixedDt);
    this.cameraManager?.update(fixedDt, frameInput, this.player.position);
  }

  private handleRender(_frameDt: number): void {
    if (!this.renderEngine || !this.sceneManager || !this.cameraManager) {
      return;
    }
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
