import {
  createDefaultProgressionState,
  sanitizeProgressionState,
} from '../delivery/LifestyleProgression.ts';
import type { ThirdPersonCameraPreset } from '../camera/CameraManager.ts';
import type { Logger } from '../core/Logger.ts';
import type {
  ControlLayoutMode,
  DeliveryOrder,
  GameSettings,
  GraphicsTier,
  LanguageMode,
  PlayerProgressionState,
  SaveSlotMeta,
  TimeOfDayPreset,
} from '../types.ts';

export const PERSISTENCE_SCHEMA_VERSION = 1;
const DB_NAME = 'gta_kozhikode_db';
const SETTINGS_STORE = 'settings';
const SAVE_SLOTS_STORE = 'save_slots';
const SETTINGS_KEY = 'active_settings';
const PROGRESSION_KEY = 'player_progression_v1';

function clampNum(val: unknown, fallback: number, min: number, max: number): number {
  return typeof val === 'number' && Number.isFinite(val)
    ? Math.max(min, Math.min(max, val))
    : fallback;
}

export function createDefaultSettings(): GameSettings {
  return {
    schemaVersion: PERSISTENCE_SCHEMA_VERSION,
    graphicsTier: 'medium',
    pixelRatioCap: 1.5,
    adaptiveResolution: true,
    timeOfDayPreset: 'golden',
    masterMuted: false,
    masterVolume: 0.8,
    musicVolume: 0.72,
    sfxVolume: 0.85,
    ambientVolume: 0.78,
    language: 'mixed',
    touchSensitivity: 1.0,
    cameraSensitivity: 1.0,
    cameraDistanceScale: 1.0,
    cameraPreset: 'standard',
    joystickSensitivity: 1.0,
    joystickDeadzone: 0.08,
    joystickSize: 1.0,
    actionButtonSize: 1.0,
    controlLayout: 'standard',
    controlOffsets: {
      joystickX: 0,
      joystickY: 0,
      actionsX: 0,
      actionsY: 0,
    },
    motionSensitivity: 1.0,
    desktopPointerLock: true,
    hudOpacity: 0.85,
    hudScale: 1.0,
    updatedAt: Date.now(),
  };
}

export function sanitizeSettings(raw: Partial<GameSettings> | null | undefined): GameSettings {
  const defaults = createDefaultSettings();
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }
  const validTiers: GraphicsTier[] = ['low', 'medium', 'high', 'ultra'];
  const validLangs: LanguageMode[] = ['en', 'ml', 'mixed'];
  const validTimes: TimeOfDayPreset[] = ['dawn', 'noon', 'golden', 'night', 'cycle'];
  const validPresets: ThirdPersonCameraPreset[] = ['close', 'standard', 'wide'];
  const validLayouts: ControlLayoutMode[] = ['standard', 'compact', 'left_handed'];

  const touchSens = clampNum(raw.touchSensitivity, defaults.touchSensitivity, 0.25, 3.0);
  const camSens = clampNum(raw.cameraSensitivity, touchSens, 0.25, 3.0);
  const rawOffsets = raw.controlOffsets;

  return {
    schemaVersion: PERSISTENCE_SCHEMA_VERSION,
    graphicsTier: validTiers.includes(raw.graphicsTier as GraphicsTier)
      ? (raw.graphicsTier as GraphicsTier)
      : defaults.graphicsTier,
    pixelRatioCap: clampNum(raw.pixelRatioCap, defaults.pixelRatioCap, 0.75, 2.0),
    adaptiveResolution:
      typeof raw.adaptiveResolution === 'boolean'
        ? raw.adaptiveResolution
        : defaults.adaptiveResolution,
    timeOfDayPreset: validTimes.includes(raw.timeOfDayPreset as TimeOfDayPreset)
      ? (raw.timeOfDayPreset as TimeOfDayPreset)
      : defaults.timeOfDayPreset,
    masterMuted: typeof raw.masterMuted === 'boolean' ? raw.masterMuted : defaults.masterMuted,
    masterVolume: clampNum(raw.masterVolume, defaults.masterVolume, 0, 1),
    musicVolume: clampNum(raw.musicVolume, defaults.musicVolume, 0, 1),
    sfxVolume: clampNum(raw.sfxVolume, defaults.sfxVolume, 0, 1),
    ambientVolume: clampNum(raw.ambientVolume, defaults.ambientVolume, 0, 1),
    language: validLangs.includes(raw.language as LanguageMode)
      ? (raw.language as LanguageMode)
      : defaults.language,
    touchSensitivity: touchSens,
    cameraSensitivity: camSens,
    cameraDistanceScale: clampNum(raw.cameraDistanceScale, defaults.cameraDistanceScale, 0.7, 1.4),
    cameraPreset: validPresets.includes(raw.cameraPreset as ThirdPersonCameraPreset)
      ? (raw.cameraPreset as ThirdPersonCameraPreset)
      : defaults.cameraPreset,
    joystickSensitivity: clampNum(raw.joystickSensitivity, defaults.joystickSensitivity, 0.5, 1.6),
    joystickDeadzone: clampNum(raw.joystickDeadzone, defaults.joystickDeadzone, 0.02, 0.25),
    joystickSize: clampNum(raw.joystickSize, defaults.joystickSize, 0.75, 1.35),
    actionButtonSize: clampNum(raw.actionButtonSize, defaults.actionButtonSize, 0.8, 1.35),
    controlLayout: validLayouts.includes(raw.controlLayout as ControlLayoutMode)
      ? (raw.controlLayout as ControlLayoutMode)
      : defaults.controlLayout,
    controlOffsets: {
      joystickX: clampNum(rawOffsets?.joystickX, 0, -48, 48),
      joystickY: clampNum(rawOffsets?.joystickY, 0, -48, 48),
      actionsX: clampNum(rawOffsets?.actionsX, 0, -48, 48),
      actionsY: clampNum(rawOffsets?.actionsY, 0, -48, 48),
    },
    motionSensitivity: clampNum(raw.motionSensitivity, defaults.motionSensitivity, 0.3, 1.0),
    desktopPointerLock:
      typeof raw.desktopPointerLock === 'boolean'
        ? raw.desktopPointerLock
        : defaults.desktopPointerLock,
    hudOpacity: clampNum(raw.hudOpacity, defaults.hudOpacity, 0.35, 1.0),
    hudScale: clampNum(raw.hudScale, defaults.hudScale, 0.75, 1.35),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  };
}

export interface MigrationResult {
  fromVersion: number;
  toVersion: number;
  appliedSteps: string[];
}

export function applySchemaMigrations(
  db: IDBDatabase,
  fromVersion: number,
  toVersion: number,
): MigrationResult {
  const appliedSteps: string[] = [];
  if (fromVersion < 1 && toVersion >= 1) {
    if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
      db.createObjectStore(SETTINGS_STORE);
      appliedSteps.push('v1:create_settings_store');
    }
    if (!db.objectStoreNames.contains(SAVE_SLOTS_STORE)) {
      const store = db.createObjectStore(SAVE_SLOTS_STORE, { keyPath: 'slotId' });
      store.createIndex('savedAt', 'savedAt', { unique: false });
      appliedSteps.push('v1:create_save_slots_store');
    }
  }
  return { fromVersion, toVersion, appliedSteps };
}

export class IndexedDBStorage {
  private readonly logger?: Logger;
  private db: IDBDatabase | null = null;
  private storageMode: 'indexeddb' | 'memory_fallback' = 'memory_fallback';

  private memorySettings: GameSettings = createDefaultSettings();
  private memoryVehiclesState: import('../types.ts').SavedVehiclesState | null = null;
  private memoryProgression: {
    progression: PlayerProgressionState;
    activeOrder: DeliveryOrder | null;
  } | null = null;
  private readonly memorySlots = new Map<string, SaveSlotMeta>();

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  getStorageMode(): 'indexeddb' | 'memory_fallback' {
    return this.storageMode;
  }

  async initialize(): Promise<'indexeddb' | 'memory_fallback'> {
    if (typeof indexedDB === 'undefined') {
      this.storageMode = 'memory_fallback';
      this.logger?.warn('Persistence', 'IndexedDB unavailable; running in memory_fallback mode');
      return this.storageMode;
    }

    try {
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, PERSISTENCE_SCHEMA_VERSION);
        request.onupgradeneeded = (event) => {
          const targetDb = request.result;
          const oldVersion = event.oldVersion || 0;
          const result = applySchemaMigrations(targetDb, oldVersion, PERSISTENCE_SCHEMA_VERSION);
          this.logger?.info(
            'Persistence',
            `Schema migrated v${result.fromVersion} -> v${result.toVersion}`,
            result.appliedSteps.join(', '),
          );
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
      });

      this.storageMode = 'indexeddb';
      this.logger?.info('Persistence', 'IndexedDB initialized cleanly', DB_NAME);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.db = null;
      this.storageMode = 'memory_fallback';
      this.logger?.warn('Persistence', 'IndexedDB open blocked; using memory fallback', msg);
    }

    return this.storageMode;
  }

  async getSettings(): Promise<GameSettings> {
    if (!this.db || this.storageMode === 'memory_fallback') {
      return { ...this.memorySettings };
    }

    const raw = await this.readRecord<Partial<GameSettings>>(SETTINGS_STORE, SETTINGS_KEY);
    const sanitized = sanitizeSettings(raw);
    if (!raw) {
      await this.saveSettings(sanitized);
    }
    return sanitized;
  }

  async saveSettings(settings: GameSettings): Promise<GameSettings> {
    const clean = sanitizeSettings({ ...settings, updatedAt: Date.now() });
    if (!this.db || this.storageMode === 'memory_fallback') {
      this.memorySettings = clean;
      return clean;
    }

    await this.writeRecord(SETTINGS_STORE, clean, SETTINGS_KEY);
    return clean;
  }

  async resetSettings(): Promise<GameSettings> {
    return this.saveSettings(createDefaultSettings());
  }

  async listSlots(): Promise<SaveSlotMeta[]> {
    if (!this.db || this.storageMode === 'memory_fallback') {
      return [...this.memorySlots.values()].sort((a, b) => b.savedAt - a.savedAt);
    }

    const db = this.db;
    return new Promise<SaveSlotMeta[]>((resolve, reject) => {
      const tx = db.transaction(SAVE_SLOTS_STORE, 'readonly');
      const store = tx.objectStore(SAVE_SLOTS_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = (req.result as SaveSlotMeta[]) ?? [];
        resolve(list.sort((a, b) => b.savedAt - a.savedAt));
      };
      req.onerror = () => reject(req.error ?? new Error('Failed to list save slots'));
    });
  }

  async upsertSlot(slot: SaveSlotMeta): Promise<SaveSlotMeta> {
    const clean: SaveSlotMeta = {
      ...slot,
      schemaVersion: PERSISTENCE_SCHEMA_VERSION,
      savedAt: slot.savedAt || Date.now(),
    };
    if (!this.db || this.storageMode === 'memory_fallback') {
      this.memorySlots.set(clean.slotId, clean);
      return clean;
    }

    await this.writeRecord(SAVE_SLOTS_STORE, clean);
    return clean;
  }

  async deleteSlot(slotId: string): Promise<void> {
    if (!this.db || this.storageMode === 'memory_fallback') {
      this.memorySlots.delete(slotId);
      return;
    }

    const db = this.db;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SAVE_SLOTS_STORE, 'readwrite');
      const store = tx.objectStore(SAVE_SLOTS_STORE);
      const req = store.delete(slotId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error('Failed to delete save slot'));
    });
  }

  async getSavedWorldVehicles(): Promise<import('../types.ts').SavedVehiclesState | null> {
    if (!this.db || this.storageMode === 'memory_fallback') {
      return this.memoryVehiclesState ? { ...this.memoryVehiclesState } : null;
    }
    const raw = await this.readRecord<import('../types.ts').SavedVehiclesState>(
      SETTINGS_STORE,
      'active_vehicles_v1',
    );
    return raw ?? null;
  }

  async saveActiveWorldVehicles(
    state: import('../types.ts').SavedVehiclesState | null,
  ): Promise<void> {
    const clean = state
      ? {
          ...state,
          schemaVersion: PERSISTENCE_SCHEMA_VERSION,
          updatedAt: Date.now(),
        }
      : {
          schemaVersion: PERSISTENCE_SCHEMA_VERSION,
          activeVehicleId: null,
          vehicles: [],
          updatedAt: Date.now(),
        };
    if (!this.db || this.storageMode === 'memory_fallback') {
      this.memoryVehiclesState = clean;
      return;
    }
    await this.writeRecord(SETTINGS_STORE, clean, 'active_vehicles_v1');
  }

  async getSavedProgression(): Promise<{
    progression: PlayerProgressionState;
    activeOrder: DeliveryOrder | null;
  } | null> {
    if (!this.db || this.storageMode === 'memory_fallback') {
      if (!this.memoryProgression) return null;
      return {
        progression: sanitizeProgressionState(this.memoryProgression.progression),
        activeOrder: this.memoryProgression.activeOrder
          ? {
              ...this.memoryProgression.activeOrder,
              packageState: { ...this.memoryProgression.activeOrder.packageState },
            }
          : null,
      };
    }

    const raw = await this.readRecord<{
      progression?: Partial<PlayerProgressionState>;
      activeOrder?: DeliveryOrder | null;
    }>(SETTINGS_STORE, PROGRESSION_KEY);
    if (!raw || !raw.progression) {
      return null;
    }
    return {
      progression: sanitizeProgressionState(raw.progression),
      activeOrder: raw.activeOrder
        ? {
            ...raw.activeOrder,
            packageState: { ...raw.activeOrder.packageState },
          }
        : null,
    };
  }

  async saveProgression(
    progression: PlayerProgressionState,
    activeOrder: DeliveryOrder | null,
  ): Promise<void> {
    const clean = {
      schemaVersion: PERSISTENCE_SCHEMA_VERSION,
      progression: sanitizeProgressionState(progression ?? createDefaultProgressionState()),
      activeOrder: activeOrder
        ? { ...activeOrder, packageState: { ...activeOrder.packageState } }
        : null,
      updatedAt: Date.now(),
    };
    if (!this.db || this.storageMode === 'memory_fallback') {
      this.memoryProgression = {
        progression: clean.progression,
        activeOrder: clean.activeOrder,
      };
      return;
    }
    await this.writeRecord(SETTINGS_STORE, clean, PROGRESSION_KEY);
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  private readRecord<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
    const db = this.db;
    if (!db) {
      return Promise.resolve(undefined);
    }
    return new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error ?? new Error(`Failed reading ${storeName}`));
    });
  }

  private writeRecord<T>(storeName: string, value: T, key?: IDBValidKey): Promise<void> {
    const db = this.db;
    if (!db) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = key !== undefined ? store.put(value, key) : store.put(value);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error(`Failed writing ${storeName}`));
    });
  }
}
