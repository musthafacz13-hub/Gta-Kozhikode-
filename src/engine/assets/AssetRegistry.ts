import type { GraphicsTier } from '../types.ts';

export interface GraphicsPresetProfile {
  tier: GraphicsTier;
  shadowMapSize: 512 | 1024 | 2048;
  shadowsEnabled: boolean;
  shadowRadius: number;
  streamRadiusChunks: number;
  lodNearDistance: number;
  lodMidDistance: number;
  foliageDensityScale: number;
  envMapIntensity: number;
  fogDensityMultiplier: number;
  maxPixelRatioScale: number;
  waterDetailHigh: boolean;
}

export const GRAPHICS_PRESET_PROFILES: Record<GraphicsTier, GraphicsPresetProfile> = {
  low: {
    tier: 'low',
    shadowMapSize: 512,
    shadowsEnabled: false,
    shadowRadius: 1,
    streamRadiusChunks: 1,
    lodNearDistance: 95,
    lodMidDistance: 195,
    foliageDensityScale: 0.55,
    envMapIntensity: 0.72,
    fogDensityMultiplier: 1.25,
    maxPixelRatioScale: 1.0,
    waterDetailHigh: false,
  },
  medium: {
    tier: 'medium',
    shadowMapSize: 1024,
    shadowsEnabled: true,
    shadowRadius: 2.2,
    streamRadiusChunks: 2,
    lodNearDistance: 135,
    lodMidDistance: 270,
    foliageDensityScale: 0.85,
    envMapIntensity: 0.95,
    fogDensityMultiplier: 1.0,
    maxPixelRatioScale: 1.5,
    waterDetailHigh: true,
  },
  high: {
    tier: 'high',
    shadowMapSize: 2048,
    shadowsEnabled: true,
    shadowRadius: 3.0,
    streamRadiusChunks: 2,
    lodNearDistance: 175,
    lodMidDistance: 340,
    foliageDensityScale: 1.0,
    envMapIntensity: 1.1,
    fogDensityMultiplier: 0.88,
    maxPixelRatioScale: 2.0,
    waterDetailHigh: true,
  },
  ultra: {
    tier: 'ultra',
    shadowMapSize: 2048,
    shadowsEnabled: true,
    shadowRadius: 3.6,
    streamRadiusChunks: 3,
    lodNearDistance: 215,
    lodMidDistance: 420,
    foliageDensityScale: 1.0,
    envMapIntensity: 1.2,
    fogDensityMultiplier: 0.78,
    maxPixelRatioScale: 2.0,
    waterDetailHigh: true,
  },
};

export function resolveGraphicsPresetProfile(tier: GraphicsTier): GraphicsPresetProfile {
  return GRAPHICS_PRESET_PROFILES[tier] ?? GRAPHICS_PRESET_PROFILES.medium;
}

export interface VehicleVisualSpec {
  id: string;
  label: string;
  category: 'two_wheeler' | 'three_wheeler' | 'car' | 'suv' | 'bus' | 'truck' | 'delivery' | 'boat';
  lod0TriBudget: number;
  lod1TriBudget: number;
  supportsInstancing: boolean;
  phaseImplemented: 'phase2_static_prop' | 'phase7_drivable' | 'phase8_traffic';
}

export const VEHICLE_VISUAL_MANIFEST: VehicleVisualSpec[] = [
  { id: 'kerala_auto_kl11', label: 'KL-11 Auto-Rickshaw', category: 'three_wheeler', lod0TriBudget: 1600, lod1TriBudget: 240, supportsInstancing: true, phaseImplemented: 'phase2_static_prop' },
  { id: 'kerala_city_bus', label: 'Kozhikode City Bus', category: 'bus', lod0TriBudget: 2200, lod1TriBudget: 320, supportsInstancing: true, phaseImplemented: 'phase2_static_prop' },
  { id: 'commuter_scooter', label: 'Malabar Commuter Scooter', category: 'two_wheeler', lod0TriBudget: 1100, lod1TriBudget: 180, supportsInstancing: true, phaseImplemented: 'phase2_static_prop' },
  { id: 'street_motorcycle', label: '150cc Street Motorcycle', category: 'two_wheeler', lod0TriBudget: 1350, lod1TriBudget: 210, supportsInstancing: true, phaseImplemented: 'phase2_static_prop' },
  { id: 'compact_hatchback', label: 'Indian Compact Hatchback', category: 'car', lod0TriBudget: 1800, lod1TriBudget: 260, supportsInstancing: true, phaseImplemented: 'phase2_static_prop' },
  { id: 'coastal_suv', label: 'Malabar SUV', category: 'suv', lod0TriBudget: 2100, lod1TriBudget: 300, supportsInstancing: true, phaseImplemented: 'phase2_static_prop' },
  { id: 'goods_carrier_truck', label: 'Valiyangadi Goods Truck', category: 'truck', lod0TriBudget: 2400, lod1TriBudget: 340, supportsInstancing: true, phaseImplemented: 'phase2_static_prop' },
  { id: 'parcel_delivery_van', label: 'SM Street Delivery Van', category: 'delivery', lod0TriBudget: 1700, lod1TriBudget: 240, supportsInstancing: true, phaseImplemented: 'phase2_static_prop' },
  { id: 'beypore_fishing_boat', label: 'Beypore Timber Fishing Boat', category: 'boat', lod0TriBudget: 1500, lod1TriBudget: 220, supportsInstancing: true, phaseImplemented: 'phase2_static_prop' },
];

export interface WeaponVisualBlueprint {
  slotIndex: number;
  id: string;
  displayName: string;
  archetype: 'pistol' | 'revolver' | 'smg' | 'rifle' | 'shotgun' | 'sniper';
  unlockStage: 'early_story' | 'mid_story' | 'late_story';
  targetPhase: 'phase9_combat';
  gltfAssetKey: string;
}

/**
 * Architectural visual manifest for the 10-weapon progression system (Phase 9 implementation).
 */
export const WEAPON_PROGRESSION_MANIFEST: WeaponVisualBlueprint[] = [
  { slotIndex: 1, id: 'wpn_basic_pistol', displayName: 'Basic 9mm Pistol', archetype: 'pistol', unlockStage: 'early_story', targetPhase: 'phase9_combat', gltfAssetKey: 'weapons/basic_pistol.glb' },
  { slotIndex: 2, id: 'wpn_adv_pistol', displayName: 'Tactical Pistol', archetype: 'pistol', unlockStage: 'early_story', targetPhase: 'phase9_combat', gltfAssetKey: 'weapons/advanced_pistol.glb' },
  { slotIndex: 3, id: 'wpn_revolver', displayName: 'Heavy .357 Revolver', archetype: 'revolver', unlockStage: 'early_story', targetPhase: 'phase9_combat', gltfAssetKey: 'weapons/revolver.glb' },
  { slotIndex: 4, id: 'wpn_smg', displayName: 'Compact Submachine Gun', archetype: 'smg', unlockStage: 'mid_story', targetPhase: 'phase9_combat', gltfAssetKey: 'weapons/smg_compact.glb' },
  { slotIndex: 5, id: 'wpn_mp40_style', displayName: 'Vintage Folding SMG (MP40-style)', archetype: 'smg', unlockStage: 'mid_story', targetPhase: 'phase9_combat', gltfAssetKey: 'weapons/smg_mp40.glb' },
  { slotIndex: 6, id: 'wpn_mp5_style', displayName: 'Spec-Ops SMG (MP5-style)', archetype: 'smg', unlockStage: 'mid_story', targetPhase: 'phase9_combat', gltfAssetKey: 'weapons/smg_mp5.glb' },
  { slotIndex: 7, id: 'wpn_assault_rifle', displayName: 'Carbine Assault Rifle', archetype: 'rifle', unlockStage: 'mid_story', targetPhase: 'phase9_combat', gltfAssetKey: 'weapons/assault_rifle.glb' },
  { slotIndex: 8, id: 'wpn_shotgun', displayName: 'Pump-Action Shotgun', archetype: 'shotgun', unlockStage: 'mid_story', targetPhase: 'phase9_combat', gltfAssetKey: 'weapons/shotgun.glb' },
  { slotIndex: 9, id: 'wpn_sniper_rifle', displayName: 'Marksman Sniper Rifle', archetype: 'sniper', unlockStage: 'late_story', targetPhase: 'phase9_combat', gltfAssetKey: 'weapons/sniper_rifle.glb' },
  { slotIndex: 10, id: 'wpn_awm_style', displayName: 'Long-Range Bolt Sniper (AWM-style)', archetype: 'sniper', unlockStage: 'late_story', targetPhase: 'phase9_combat', gltfAssetKey: 'weapons/sniper_awm.glb' },
];

export interface CharacterStoryAssetContract {
  id: string;
  role: 'protagonist' | 'family_npc' | 'neighborhood_npc' | 'vendor_npc';
  skeletonRig: 'humanoid_64_mobile';
  lod0MaxTris: number;
  lod1MaxTris: number;
  startingLocationRegionId: string;
  targetPhase: 'phase5_character' | 'phase10_npcs' | 'phase15_story';
}

export const CHARACTER_STORY_MANIFEST: CharacterStoryAssetContract[] = [
  {
    id: 'protagonist_arjun',
    role: 'protagonist',
    skeletonRig: 'humanoid_64_mobile',
    lod0MaxTris: 9500,
    lod1MaxTris: 2800,
    startingLocationRegionId: 'protagonist_home',
    targetPhase: 'phase5_character',
  },
  {
    id: 'kozhikode_citizen_base',
    role: 'neighborhood_npc',
    skeletonRig: 'humanoid_64_mobile',
    lod0MaxTris: 4800,
    lod1MaxTris: 1400,
    startingLocationRegionId: 'mananchira',
    targetPhase: 'phase10_npcs',
  },
  {
    id: 'sm_street_merchant',
    role: 'vendor_npc',
    skeletonRig: 'humanoid_64_mobile',
    lod0MaxTris: 5200,
    lod1MaxTris: 1600,
    startingLocationRegionId: 'sm_street',
    targetPhase: 'phase15_story',
  },
];
