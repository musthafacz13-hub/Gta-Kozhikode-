export type AudioBusChannel = 'master' | 'music' | 'sfx' | 'ambient';

export type MusicContextId =
  | 'menu'
  | 'opening'
  | 'exploration'
  | 'coastal'
  | 'night_noir'
  | 'mission'
  | 'action'
  | 'suspense'
  | 'emotional'
  | 'ambient';

export type FootstepSurface = 'asphalt' | 'sidewalk' | 'sand' | 'grass' | 'wood';

export type VehicleAudioKind =
  | 'motorcycle'
  | 'scooter'
  | 'auto_rickshaw'
  | 'car'
  | 'bus'
  | 'ksrtc_bus'
  | 'private_bus'
  | 'truck'
  | 'boat';

export type VehicleSfxEvent = 'horn' | 'brake' | 'tire_screech' | 'accel' | 'passby';

export type TeaShopSfxEvent = 'tea_pour' | 'glass_clink' | 'spoon_stir' | 'snack_fry';

export type CharacterSfxEvent =
  | 'jump'
  | 'land'
  | 'door_open'
  | 'door_close'
  | 'house_enter'
  | 'house_exit'
  | 'interact';

export type GameSfxEvent =
  | 'ui_click'
  | 'ui_back'
  | 'notification'
  | 'mission_start'
  | 'mission_complete'
  | 'cinematic_whoosh';

export type WeaponAudioArchetype = 'pistol' | 'revolver' | 'smg' | 'rifle' | 'shotgun' | 'sniper';

export interface VehicleEngineProfile {
  kind: VehicleAudioKind;
  baseHz: number;
  maxHz: number;
  harmonicMix: number;
  pulseRateHz: number;
  maxGain: number;
}

export interface AudioEnvironmentUpdate {
  playerX: number;
  playerZ: number;
  nightGlowFactor: number;
  districtId: string;
  isCoastal: boolean;
  isMarket: boolean;
  isHomeZone: boolean;
  isPlaying: boolean;
  isMoving: boolean;
  isSprinting: boolean;
  speed: number;
  teaShopDistanceMeters?: number;
}

export interface AudioStateSnapshot {
  unlocked: boolean;
  suspended: boolean;
  muted: boolean;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  ambientVolume: number;
  activeMusicContext: MusicContextId;
  activeMusicLabel: string;
  activeAmbienceLabel: string;
  cachedBuffers: number;
  positionalSources: number;
}
