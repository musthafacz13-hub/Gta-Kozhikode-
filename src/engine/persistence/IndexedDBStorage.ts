import type { Logger } from '../core/Logger.ts';
import type {
  GameSettings,
  GraphicsTier,
  LanguageMode,
  SaveSlotMeta,
  TimeOfDayPreset,
} from '../types.ts';

export const PERSISTENCE_SCHEMA_VERSION = 1;
const DB_NAME = 'gta_kozhikode_db';
const SETTINGS_STORE = 'settings';
const SAVE_SLOTS_STORE = 'save_slots';
const SETTINGS_KEY = 'active_settings';

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

  return {
    schemaVersion: PERSISTENCE_SCHEMA_VERSION,
    graphicsTier: validTiers.includes(raw.graphicsTier as GraphicsTier)
      ? (raw.graphicsTier as GraphicsTier)
      : defaults.graphicsTier,
    pixelRatioCap:
      typeof raw.pixelRatioCap === 'number' && Number.isFinite(raw.pixelRatioCap)
        ? Math.max(0.75, Math.min(2.0, raw.pixelRatioCap))
        : defaults.pixelRatioCap,
    adaptiveResolution:
      typeof raw.adaptiveResolution === 'boolean'
        ? raw.adaptiveResolution
        : defaults.adaptiveResolution,
    timeOfDayPreset: validTimes.includes(raw.timeOfDayPreset as TimeOfDayPreset)
      ? (raw.timeOfDayPreset as TimeOfDayPreset)
      : defaults.timeOfDayPreset,
    masterMuted: typeof raw.masterMuted === 'boolean' ? raw.masterMuted : defaults.masterMuted,
    masterVolume:
      typeof raw.masterVolume === 'number' && Number.isFinite(raw.masterVolume)
        ? Math.max(0, Math.min(1, raw.masterVolume))
        : defaults.masterVolume,
    musicVolume:
      typeof raw.musicVolume === 'number' && Number.isFinite(raw.musicVolume)
        ? Math.max(0, Math.min(1, raw.musicVolume))
        : defaults.musicVolume,
    sfxVolume:
      typeof raw.sfxVolume === 'number' && Number.isFinite(raw.sfxVolume)
        ? Math.max(0, Math.min(1, raw.sfxVolume))
        : defaults.sfxVolume,
    ambientVolume:
      typeof raw.ambientVolume === 'number' && Number.isFinite(raw.ambientVolume)
        ? Math.max(0, Math.min(1, raw.ambientVolume))
        : defaults.ambientVolume,
    language: validLangs.includes(raw.language as LanguageMode)
      ? (raw.language as LanguageMode)
      : defaults.language,
    touchSensitivity:
      typeof raw.touchSensitivity === 'number' && Number.isFinite(raw.touchSensitivity)
        ? Math.max(0.25, Math.min(3.0, raw.touchSensitivity))
        : defaults.touchSensitivity,
    hudOpacity:
      typeof raw.hudOpacity === 'number' && Number.isFinite(raw.hudOpacity)
        ? Math.max(0.35, Math.min(1.0, raw.hudOpacity))
        : defaults.hudOpacity,
    hudScale:
      typeof raw.hudScale === 'number' && Number.isFinite(raw.hudScale)
        ? Math.max(0.75, Math.min(1.35, raw.hudScale))
        : defaults.hudScale,
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
