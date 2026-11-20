import type { AudioStateSnapshot } from './audio/AudioTypes.ts';
import type { ThirdPersonCameraPreset } from './camera/CameraManager.ts';
import type { ContextualInteractionTarget } from './interaction/InteractionResolver.ts';
import type { ArjunAnimationState } from './player/ArjunAnimator.ts';
import type { PlayerMovementGait } from './player/PlayerController.ts';
import type {
  BuildingArchetype,
  BuildingCategory,
  BuildingOwnershipStatus,
} from './world/BuildingSystem.ts';
import type { KozhikodeBiomeType } from './world/GeoProjection.ts';
import type { RoadRouteWaypoint } from './world/RoadNetworkGraph.ts';
import type { VehicleFleetCategory, VehicleModelId } from './world/VehicleVisualFactory.ts';

export type GameModeState = 'booting' | 'title' | 'playing' | 'paused' | 'context_lost' | 'error';

export type GraphicsTier = 'low' | 'medium' | 'high' | 'ultra';

export type LanguageMode = 'en' | 'ml' | 'mixed';

export type TimeOfDayPreset = 'dawn' | 'noon' | 'golden' | 'night' | 'cycle';

export type ControlLayoutMode = 'standard' | 'compact' | 'left_handed';

export interface ControlLayoutOffsets {
  joystickX: number;
  joystickY: number;
  actionsX: number;
  actionsY: number;
}

export interface GameSettings {
  schemaVersion: number;
  graphicsTier: GraphicsTier;
  pixelRatioCap: number;
  adaptiveResolution: boolean;
  timeOfDayPreset: TimeOfDayPreset;
  masterMuted: boolean;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  ambientVolume: number;
  language: LanguageMode;
  touchSensitivity: number;
  cameraSensitivity: number;
  cameraDistanceScale: number;
  cameraPreset: ThirdPersonCameraPreset;
  joystickSensitivity: number;
  joystickDeadzone: number;
  joystickSize: number;
  actionButtonSize: number;
  controlLayout: ControlLayoutMode;
  controlOffsets: ControlLayoutOffsets;
  motionSensitivity: number;
  desktopPointerLock: boolean;
  hudOpacity: number;
  hudScale: number;
  updatedAt: number;
}

export type SaveSlotType = 'manual' | 'autosave' | 'recovery';

export type VehicleDamageState = 'undamaged' | 'minor' | 'moderate' | 'severe';

export type VehicleGearState = 'PARKED' | 'DRIVE' | 'REVERSE' | 'BRAKE' | 'HANDBRAKE';

export type VehicleGroundSurface = 'asphalt' | 'sidewalk' | 'sand' | 'grass' | 'offroad';

export interface SavedVehicleRecord {
  id: string;
  sourceKind: 'parked_chunk' | 'traffic' | 'persisted';
  sourceId: string;
  modelId: VehicleModelId;
  colorHex: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  damageHealth: number;
  damageState: VehicleDamageState;
}

export interface SavedVehiclesState {
  schemaVersion: number;
  activeVehicleId: string | null;
  vehicles: SavedVehicleRecord[];
  updatedAt: number;
}

export interface ActiveVehicleHudState {
  isDriving: boolean;
  isEntering: boolean;
  vehicleId: string;
  modelId: VehicleModelId;
  displayName: string;
  category: VehicleFleetCategory;
  speedKmh: number;
  speedMps: number;
  signedSpeedMps: number;
  gear: VehicleGearState;
  steerNorm: number;
  throttleNorm: number;
  brakeNorm: number;
  handbrakeActive: boolean;
  damageHealth: number;
  damageState: VehicleDamageState;
  leanAngleRad: number;
  groundSurface: VehicleGroundSurface;
}

export interface SaveSlotMeta {
  slotId: string;
  slotType: SaveSlotType;
  label: string;
  schemaVersion: number;
  districtName: string;
  playtimeSeconds: number;
  savedAt: number;
  cameraPreset: string;
  vehicleState?: SavedVehiclesState;
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

export type CameraRigMode = 'title_orbit' | 'free_inspect' | 'vehicle_chase';

export interface NearbyBuildingSummary {
  id: string;
  name: string;
  malayalamName: string;
  archetype: BuildingArchetype;
  category: BuildingCategory;
  ownershipStatus: BuildingOwnershipStatus;
  interiorEligible: boolean;
  distanceMeters: number;
  lat: number;
  lon: number;
  futureHooks: {
    businessTag?: string;
    propertyPurchaseTag?: string;
    missionTag?: string;
  };
}

export interface ActiveDestinationState {
  id: string;
  name: string;
  malayalamName?: string;
  lat: number;
  lon: number;
  worldX: number;
  worldZ: number;
  distanceMeters: number;
  realDistanceKm: number;
  estimatedDriveMinutes: number;
  viaSummary: string[];
  routeWaypoints: RoadRouteWaypoint[];
  source: 'gazetteer' | 'google_places';
}

export interface EngineHudSnapshot {
  mode: GameModeState;
  cameraMode: CameraRigMode;
  cameraPreset?: ThirdPersonCameraPreset;
  cameraX: number;
  cameraZ: number;
  cameraYaw: number;
  playerX: number;
  playerZ: number;
  playerLat: number;
  playerLon: number;
  playerHeading: number;
  isMoving: boolean;
  isSprinting: boolean;
  isGrounded?: boolean;
  movementGait?: PlayerMovementGait;
  animationState?: ArjunAnimationState;
  interactionNotice?: { id: number; text: string } | null;
  pointerLocked?: boolean;
  districtName: string;
  talukName: string;
  biome: KozhikodeBiomeType;
  clockFormatted: string;
  weatherLabel?: string;
  activeChunks: number;
  totalRegions: number;
  gazetteerCount: number;
  nearHome: boolean;
  homeDistanceMeters: number;
  nearbyBuilding?: NearbyBuildingSummary | null;
  nearbyInteraction?: ContextualInteractionTarget | null;
  vehicle?: ActiveVehicleHudState | null;
  activeDestination: ActiveDestinationState | null;
  ambientStats?: {
    activeVehicles: number;
    activePedestrians: number;
    nearTeaShop: boolean;
  };
  audio: AudioStateSnapshot;
  showDebugGrid: boolean;
  activeSlotId: string;
  storageMode: 'indexeddb' | 'memory_fallback';
  capabilities: RenderCapabilitiesReport | null;
  settings: GameSettings;
  metrics: PerformanceMetrics;
  slots: SaveSlotMeta[];
  lastError: string | null;
}
