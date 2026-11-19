export type GameModeState = 'booting' | 'title' | 'playing' | 'paused' | 'context_lost' | 'error';

export type GraphicsTier = 'low' | 'medium' | 'high' | 'ultra';

export type LanguageMode = 'en' | 'ml' | 'mixed';

export interface GameSettings {
  schemaVersion: number;
  graphicsTier: GraphicsTier;
  pixelRatioCap: number;
  masterMuted: boolean;
  masterVolume: number;
  language: LanguageMode;
  touchSensitivity: number;
  hudOpacity: number;
  hudScale: number;
  updatedAt: number;
}

export type SaveSlotType = 'manual' | 'autosave' | 'recovery';

export interface SaveSlotMeta {
  slotId: string;
  slotType: SaveSlotType;
  label: string;
  schemaVersion: number;
  districtName: string;
  playtimeSeconds: number;
  savedAt: number;
  cameraPreset: string;
}

export interface RenderCapabilitiesReport {
  backend: 'webgl2' | 'webgl1' | 'unavailable';
  rendererName: string;
  vendorName: string;
  isSoftwareGl: boolean;
  maxTextureSize: number;
  maxAnisotropy: number;
  hasTimerQuery: boolean;
  devicePixelRatio: number;
  appliedPixelRatio: number;
}

export interface PerformanceMetrics {
  fps: number;
  cpuFrameMsP50: number;
  cpuFrameMsP95: number;
  lastStepMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  jsHeapMb: number | null;
  activeFixedSteps: number;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: number;
  timestamp: number;
  level: LogLevel;
  scope: string;
  message: string;
  detail?: string;
}

export type CameraRigMode = 'title_orbit' | 'free_inspect';

export interface EngineHudSnapshot {
  mode: GameModeState;
  cameraMode: CameraRigMode;
  cameraX: number;
  cameraZ: number;
  cameraYaw: number;
  playerX: number;
  playerZ: number;
  playerHeading: number;
  isMoving: boolean;
  isSprinting: boolean;
  showDebugGrid: boolean;
  activeSlotId: string;
  storageMode: 'indexeddb' | 'memory_fallback';
  capabilities: RenderCapabilitiesReport | null;
  settings: GameSettings;
  metrics: PerformanceMetrics;
  slots: SaveSlotMeta[];
  lastError: string | null;
}
