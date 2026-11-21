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

export type RestaurantCategory =
  | 'biryani_shop'
  | 'malabar_restaurant'
  | 'tea_shop'
  | 'bakery'
  | 'fast_food';

export type KozhikodeDeliveryAreaId =
  | 'sm_street'
  | 'mananchira'
  | 'mavoor_road'
  | 'palayam'
  | 'railway_station'
  | 'west_hill'
  | 'nadakkavu'
  | 'kozhikode_beach'
  | 'medical_college'
  | 'beypore';

export interface RestaurantMenuItem {
  id: string;
  name: string;
  malayalamName: string;
  priceInr: number;
  prepSec: number;
}

export interface RestaurantSpec {
  id: string;
  buildingId: string;
  areaId: KozhikodeDeliveryAreaId;
  areaLabel: string;
  name: string;
  malayalamName: string;
  category: RestaurantCategory;
  worldX: number;
  worldZ: number;
  pickupX: number;
  pickupZ: number;
  openHour: number;
  closeHour: number;
  prepTimeSec: number;
  rating: number;
  ambientTag: string;
  menuItems: RestaurantMenuItem[];
}

export interface CustomerLocationSpec {
  id: string;
  buildingId: string;
  areaId: KozhikodeDeliveryAreaId;
  areaLabel: string;
  customerName: string;
  placeLabel: string;
  malayalamLabel: string;
  propertyType: 'home' | 'villa' | 'apartment' | 'shop' | 'campus' | 'beach';
  worldX: number;
  worldZ: number;
  dropoffX: number;
  dropoffZ: number;
  greetingLine: string;
}

export type DeliveryOrderStatus =
  | 'available'
  | 'accepted'
  | 'preparing'
  | 'ready_for_pickup'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'cancelled';

export interface DeliveryPackageState {
  hasPackage: boolean;
  bagEquipped: boolean;
  foodCondition: number; // 0..100
  temperaturePct: number; // 0..100
  fragile: boolean;
}

export interface DeliveryOrder {
  orderId: string;
  restaurantId: string;
  restaurantName: string;
  restaurantMalayalamName: string;
  restaurantCategory: RestaurantCategory;
  restaurantAreaLabel: string;
  pickupX: number;
  pickupZ: number;
  customerId: string;
  customerName: string;
  customerPlaceLabel: string;
  customerAreaLabel: string;
  customerGreeting: string;
  dropoffX: number;
  dropoffZ: number;
  itemsSummary: string;
  itemsCount: number;
  prepTimeSec: number;
  prepRemainingSec: number;
  routeDistanceMeters: number;
  routeRealKm: number;
  estimatedMinutes: number;
  basePayInr: number;
  distanceBonusInr: number;
  tipInr: number;
  totalEstimateInr: number;
  status: DeliveryOrderStatus;
  acceptedAt: number | null;
  pickedUpAt: number | null;
  deliveredAt: number | null;
  packageState: DeliveryPackageState;
}

export interface CompletedDeliveryRecord {
  orderId: string;
  restaurantId: string;
  restaurantName: string;
  customerName: string;
  customerPlaceLabel: string;
  earnedInr: number;
  tipEarnedInr: number;
  foodCondition: number;
  customerMood: 'happy' | 'thankful' | 'friendly';
  customerReview: string;
  completedAt: number;
}

export type LifestyleUpgradeId =
  | 'thermal_bag_pro'
  | 'scooter_tune'
  | 'malabar_uniform'
  | 'coastal_tourer_upgrade'
  | 'tharavadu_comfort';

export type ReputationTier =
  | 'Newcomer'
  | 'Neighbourhood Rider'
  | 'City Regular'
  | 'Malabar Trusted Courier'
  | 'Kozhikode Legend';

export interface PlayerProgressionState {
  schemaVersion: number;
  walletBalanceInr: number;
  totalEarnedInr: number;
  completedDeliveries: number;
  reputationScore: number;
  reputationTier: ReputationTier;
  bagEquipped: boolean;
  discoveredRestaurants: string[];
  discoveredDistricts: string[];
  ownedVehicleModels: VehicleModelId[];
  unlockedUpgrades: LifestyleUpgradeId[];
  deliveryHistory: CompletedDeliveryRecord[];
  updatedAt: number;
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
  progressionState?: PlayerProgressionState;
  activeOrder?: DeliveryOrder | null;
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
  source: 'gazetteer' | 'google_places' | 'delivery';
}

export interface DeliveryHudSnapshot {
  activeOrder: DeliveryOrder | null;
  availableOrders: DeliveryOrder[];
  currentHour: number;
  nearbyRestaurant: RestaurantSpec | null;
  nearbyPickupReady: boolean;
  pickupDistanceMeters: number | null;
  dropoffDistanceMeters: number | null;
  canCollectNearby: boolean;
  canDeliverNearby: boolean;
  lastFeedback: CompletedDeliveryRecord | null;
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
  delivery?: DeliveryHudSnapshot;
  progression?: PlayerProgressionState;
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

