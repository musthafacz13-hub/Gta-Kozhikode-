import {
  getBiomeAtWorld,
  getCoastlineXAtZ,
  getHighlandElevationAt,
  type KozhikodeBiomeType,
} from './GeoProjection.ts';
import { KOZHIKODE_GAZETTEER_PLACES, type GazetteerPlace } from './KozhikodeGazetteer.ts';
import { isPointOnDistrictRoad } from './RoadNetworkGraph.ts';

export type DistrictCategory = 'core_city' | 'suburban' | 'coastal' | 'rural_expansion' | 'highland';

export interface KozhikodeRegionSpec {
  id: string;
  name: string;
  malayalamName: string;
  category: DistrictCategory;
  centerX: number;
  centerZ: number;
  radius: number;
  lat: number;
  lon: number;
  talukId: GazetteerPlace['talukId'];
  biome:
    | 'heritage_civic'
    | 'commercial_bazaar'
    | 'coastal_beach'
    | 'harbour'
    | 'residential'
    | 'highway_suburb'
    | 'river_valley'
    | 'highland_ghat';
  streamingTier: 'active_phase2' | 'horizon_landmark' | 'district_open_world';
}

export interface RoadCorridorSpec {
  id: string;
  name: string;
  axis: 'ns' | 'ew';
  coord: number; // X for NS roads, Z for EW roads
  start: number;
  end: number;
  width: number;
  roadClass: 'highway' | 'arterial' | 'coastal' | 'street';
}

export const CHUNK_SIZE_METERS = 120;

/**
 * Full Kozhikode District traversable world bounds (~7.3 km x 5.5 km at 1:10 conformal scale).
 * Covers Azhiyur / Nadapuram North (-5400m Z) to Beypore / Feroke / Kadalundi South (+1400m Z),
 * and Arabian Sea Coast (-3200m X) to Western Ghats / Thusharagiri East (+3400m X).
 */
export const KOZHIKODE_WORLD_BOUNDS = {
  minX: -3200,
  maxX: 3400,
  minZ: -5400,
  maxZ: 1400,
} as const;

export const PROTAGONIST_HOME_COORDS = {
  houseX: -14,
  houseZ: -146,
  gateX: -14,
  gateZ: -133,
  porchX: -14,
  porchZ: -138.0,
} as const;

function mapPlaceToRegion(place: GazetteerPlace): KozhikodeRegionSpec {
  const coreIds = new Set([
    'mananchira',
    'sm_street',
    'palayam',
    'mavoor_road',
    'railway_station',
    'kozhikode_beach',
    'south_beach',
    'protagonist_home',
    'nadakkavu',
    'medical_college',
  ]);
  const horizonIds = new Set(['thondayad', 'beypore_harbour']);

  let category: DistrictCategory = 'rural_expansion';
  if (coreIds.has(place.id)) {
    category = place.biome === 'coastal' ? 'coastal' : 'core_city';
  } else if (place.biome === 'coastal') {
    category = 'coastal';
  } else if (place.biome === 'highland') {
    category = 'highland';
  } else if (place.biome === 'urban' || place.biome === 'midland') {
    category = place.talukId === 'kozhikode' ? 'suburban' : 'rural_expansion';
  }

  let biome: KozhikodeRegionSpec['biome'] = 'highway_suburb';
  if (place.id === 'mananchira') biome = 'heritage_civic';
  else if (['sm_street', 'palayam', 'mavoor_road', 'railway_station', 'nadakkavu'].includes(place.id)) {
    biome = 'commercial_bazaar';
  } else if (place.id === 'protagonist_home' || place.id === 'west_hill_town') {
    biome = 'residential';
  } else if (place.category === 'harbour') biome = 'harbour';
  else if (place.biome === 'coastal') biome = 'coastal_beach';
  else if (place.category === 'river_bridge') biome = 'river_valley';
  else if (place.biome === 'highland') biome = 'highland_ghat';

  let radius = 140;
  if (place.id === 'mananchira') radius = 52;
  else if (['sm_street', 'kozhikode_beach', 'south_beach', 'protagonist_home'].includes(place.id)) radius = 58;
  else if (['palayam', 'mavoor_road', 'railway_station'].includes(place.id)) radius = 64;
  else if (['nadakkavu', 'medical_college'].includes(place.id)) radius = 85;
  else if (place.zoomTier === 1) radius = 220;

  return {
    id: place.id,
    name: place.name,
    malayalamName: place.malayalamName,
    category,
    centerX: place.worldX,
    centerZ: place.worldZ,
    radius,
    lat: place.lat,
    lon: place.lon,
    talukId: place.talukId,
    biome,
    streamingTier: coreIds.has(place.id)
      ? 'active_phase2'
      : horizonIds.has(place.id)
        ? 'horizon_landmark'
        : 'district_open_world',
  };
}

export const KOZHIKODE_REGIONS: KozhikodeRegionSpec[] = KOZHIKODE_GAZETTEER_PLACES.map(mapPlaceToRegion);

/**
 * Downtown street corridors preserving Phase 1/2/3 exact road geometry while connecting
 * West Hill, Nadakkavu, Mananchira, SM Street, Palayam, Mavoor Rd, and Railway Station.
 */
export const KOZHIKODE_ROAD_CORRIDORS: RoadCorridorSpec[] = [
  // North-South Arterials
  { id: 'beach_road', name: 'Kozhikode Beach Rd', axis: 'ns', coord: -62, start: -290, end: 270, width: 11, roadClass: 'coastal' },
  { id: 'mananchira_west', name: 'Mananchira West Rd', axis: 'ns', coord: -34, start: -290, end: 260, width: 12, roadClass: 'street' },
  { id: 'palayam_mavoor_ns', name: 'Kannur Rd / Palayam Ave', axis: 'ns', coord: 34, start: -290, end: 270, width: 13, roadClass: 'arterial' },
  { id: 'bypass_east', name: 'Mavoor-Palayam Link Rd', axis: 'ns', coord: 120, start: -240, end: 260, width: 13, roadClass: 'highway' },
  // East-West Arterials
  { id: 'nadakkavu_cross_ew', name: 'Nadakkavu Cross Rd', axis: 'ew', coord: -188, start: -68, end: 180, width: 12, roadClass: 'arterial' },
  { id: 'west_hill_lane', name: 'West Hill Residential Rd', axis: 'ew', coord: -120, start: -68, end: 240, width: 10, roadClass: 'street' },
  { id: 'mavoor_road_ew', name: 'Mavoor Rd / Vaikom Basheer Rd', axis: 'ew', coord: -35, start: -68, end: 260, width: 13, roadClass: 'arterial' },
  { id: 'mananchira_south', name: 'Mananchira South / SM Entry', axis: 'ew', coord: 35, start: -68, end: 240, width: 11, roadClass: 'arterial' },
  { id: 'palayam_station_ew', name: 'Palayam-Station Link', axis: 'ew', coord: 120, start: -68, end: 240, width: 12, roadClass: 'arterial' },
  { id: 'kallai_road', name: 'Kallai-South Beach Rd', axis: 'ew', coord: 195, start: -68, end: 240, width: 12, roadClass: 'highway' },
];

export function worldToChunkCoords(x: number, z: number): { cx: number; cz: number; key: string } {
  const cx = Math.floor((x + CHUNK_SIZE_METERS * 0.5) / CHUNK_SIZE_METERS);
  const cz = Math.floor((z + CHUNK_SIZE_METERS * 0.5) / CHUNK_SIZE_METERS);
  return { cx, cz, key: `${cx},${cz}` };
}

export function getDistrictAt(x: number, z: number): KozhikodeRegionSpec {
  let closest = KOZHIKODE_REGIONS[0];
  let bestScore = Infinity;

  for (let i = 0; i < KOZHIKODE_REGIONS.length; i++) {
    const region = KOZHIKODE_REGIONS[i];
    const dist = Math.hypot(x - region.centerX, z - region.centerZ);
    const normalized = dist / Math.max(1, region.radius);
    if (normalized < bestScore) {
      bestScore = normalized;
      closest = region;
    }
  }
  return closest;
}

export function getWorldBiomeAt(x: number, z: number): KozhikodeBiomeType {
  return getBiomeAtWorld(x, z);
}

export function getGroundHeightAt(x: number, z: number): number {
  const coastX = getCoastlineXAtZ(z);
  // Arabian Sea shoreline & sand strip west of coastal seawall
  if (x < coastX + 0.5) {
    return 0.0;
  }

  // Downtown Phase 1/2/4 urban core preserves exact sidewalk/park/road heights
  if (x >= -150 && x <= 265 && z >= -295 && z <= 275) {
    if (x >= -27.5 && x <= 27.5 && z >= -29 && z <= 29) {
      return 0.18;
    }
    for (let i = 0; i < KOZHIKODE_ROAD_CORRIDORS.length; i++) {
      const road = KOZHIKODE_ROAD_CORRIDORS[i];
      const halfW = road.width * 0.5 + 0.35;
      if (road.axis === 'ns') {
        if (Math.abs(x - road.coord) <= halfW && z >= road.start && z <= road.end) {
          return 0.02;
        }
      } else if (Math.abs(z - road.coord) <= halfW && x >= road.start && x <= road.end) {
        return 0.02;
      }
    }
    return 0.18;
  }

  // Outer District terrain: smooth coastal/midland/highland elevation
  const baseElevation = getHighlandElevationAt(x, z);
  const roadCheck = isPointOnDistrictRoad(x, z);
  if (roadCheck.onRoad) {
    return Math.max(0.02, baseElevation * 0.85);
  }
  return baseElevation + 0.14;
}
