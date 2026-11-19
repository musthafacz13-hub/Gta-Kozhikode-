export type KozhikodeBiomeType = 'coastal' | 'urban' | 'midland' | 'highland' | 'river';

export interface GeoCoord {
  lat: number;
  lon: number;
}

export interface WorldPoint {
  x: number;
  z: number;
}

/**
 * Geographic anchor at Mananchira Square, Kozhikode (11.2544 N, 75.7800 E) -> World (0, 0).
 * Uses conformal tangent-plane projection at adaptive 1:10 district scale so the entire
 * ~73 km x 55 km Kozhikode district streams seamlessly in real-time WebGL2 (~7.3 km x 5.5 km).
 */
export const KOZHIKODE_ORIGIN_GEO: GeoCoord = {
  lat: 11.2544,
  lon: 75.78,
};

export const KOZHIKODE_GEO_BOUNDS = {
  minLat: 11.12,
  maxLat: 11.78,
  minLon: 75.52,
  maxLon: 76.12,
} as const;

export const DISTRICT_SCALE_FACTOR = 0.1; // 1 game meter = 10 real geographic meters at macro district scale
const METERS_PER_DEG_LAT = 110_610;
const METERS_PER_DEG_LON = 111_320 * Math.cos((KOZHIKODE_ORIGIN_GEO.lat * Math.PI) / 180); // ~109,180 m/deg

export const WORLD_METERS_PER_DEG_LAT = METERS_PER_DEG_LAT * DISTRICT_SCALE_FACTOR; // 11,061 world m/deg
export const WORLD_METERS_PER_DEG_LON = METERS_PER_DEG_LON * DISTRICT_SCALE_FACTOR; // ~10,918 world m/deg

export function geoToWorld(lat: number, lon: number): WorldPoint {
  return {
    x: (lon - KOZHIKODE_ORIGIN_GEO.lon) * WORLD_METERS_PER_DEG_LON,
    z: -(lat - KOZHIKODE_ORIGIN_GEO.lat) * WORLD_METERS_PER_DEG_LAT,
  };
}

export function worldToGeo(x: number, z: number): GeoCoord {
  return {
    lat: Number((KOZHIKODE_ORIGIN_GEO.lat - z / WORLD_METERS_PER_DEG_LAT).toFixed(6)),
    lon: Number((KOZHIKODE_ORIGIN_GEO.lon + x / WORLD_METERS_PER_DEG_LON).toFixed(6)),
  };
}

export function worldDistanceToRealKm(worldMeters: number): number {
  return (worldMeters / DISTRICT_SCALE_FACTOR) / 1000;
}

export function haversineDistanceKm(a: GeoCoord, b: GeoCoord): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Verified NNW-to-SSE Arabian Sea shoreline points for Kozhikode District.
 * Downtown segment (z in [-220, 240]) aligns directly with Phase 1/2 Seawall at x = -68.
 */
export const KOZHIKODE_COASTLINE_WORLD: WorldPoint[] = [
  geoToWorld(11.71, 75.525),   // North of Azhiyur / Mahe estuary
  geoToWorld(11.6833, 75.5333), // Azhiyur coast
  geoToWorld(11.6000, 75.5760), // Vatakara / Sand Banks
  geoToWorld(11.4952, 75.6160), // Payyoli / Thikkodi coast
  geoToWorld(11.4390, 75.6820), // Koyilandy coast
  geoToWorld(11.3831, 75.7140), // Kappad Beach
  geoToWorld(11.3333, 75.7300), // Elathur / Korapuzha mouth
  { x: -68, z: -220 },          // West Hill / Vellayil shoreline anchor
  { x: -68, z: 0 },             // Kozhikode Beach Promenade
  { x: -68, z: 240 },           // South Beach / Kallai mouth
  { x: 115, z: 740 },           // Beypore Pulimuttu / Chaliyar mouth
  geoToWorld(11.1400, 75.8250), // Kadalundi estuary south border
].sort((a, b) => a.z - b.z);

export function getCoastlineXAtZ(z: number): number {
  const pts = KOZHIKODE_COASTLINE_WORLD;
  if (z <= pts[0].z) return pts[0].x;
  const last = pts[pts.length - 1];
  if (z >= last.z) return last.x;

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (z >= a.z && z <= b.z) {
      const span = b.z - a.z;
      if (span < 1e-6) return a.x;
      const t = (z - a.z) / span;
      return a.x + (b.x - a.x) * t;
    }
  }
  return -68;
}

export function getBiomeAtWorld(x: number, z: number): KozhikodeBiomeType {
  const coastX = getCoastlineXAtZ(z);
  const distFromCoast = x - coastX;

  // Check Western Ghats highland foothills (East of Koduvally / Puthuppadi / Kakkayam)
  if (x > 1650 || (x > 1300 && z < -2100)) {
    return 'highland';
  }
  // Core urban Kozhikode Corporation corridor (east of beach promenade x > -20)
  if (x >= -20 && x <= 750 && z >= -480 && z <= 480) {
    return 'urban';
  }
  if (distFromCoast < 160) {
    return 'coastal';
  }
  return 'midland';
}

/**
 * Computes continuous terrain height across Kozhikode District biomes.
 * Preserves Phase 1/2 downtown flat urban blocks & seawall while introducing rising laterite hills
 * and Western Ghats slopes (Thamarassery Churam / Kakkayam) in the east.
 */
export function getHighlandElevationAt(x: number, z: number): number {
  const biome = getBiomeAtWorld(x, z);
  if (biome === 'coastal' || biome === 'urban') {
    return 0;
  }
  if (biome === 'midland') {
    // Gentle laterite terrain undulation away from major road beds
    return Math.max(0, Math.sin(x * 0.004) * Math.cos(z * 0.004) * 2.2 + 1.1);
  }
  // Highland Western Ghats elevation rise toward Thamarassery Churam (x ~ 2644, z ~ -2698) & Thusharagiri
  const eastProgress = Math.max(0, (x - 1600) / 1400);
  const ridge = Math.sin(x * 0.0032) * Math.cos(z * 0.0032) * 8;
  return Math.min(72, eastProgress * 46 + Math.max(0, ridge));
}
