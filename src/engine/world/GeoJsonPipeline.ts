import { geoToWorld } from './GeoProjection.ts';
import {
  KOZHIKODE_GAZETTEER_PLACES,
  KOZHIKODE_RIVERS,
  type GazetteerPlace,
} from './KozhikodeGazetteer.ts';
import {
  KOZHIKODE_ROAD_NETWORK,
  type RoadGraphEdge,
  type RoadGraphNode,
} from './RoadNetworkGraph.ts';

export interface GeoJsonPointFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] }; // [lon, lat]
  properties: {
    id: string;
    name: string;
    featureKind: 'settlement' | 'landmark' | 'bridge';
    category?: string;
    highwayCode?: string;
  };
}

export interface GeoJsonLineFeature {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: [number, number][] }; // [lon, lat][]
  properties: {
    id: string;
    name: string;
    featureKind: 'road' | 'river';
    highwayCode?: string;
    widthWorld?: number;
    isBridge?: boolean;
  };
}

export type DistrictGeoJsonFeature = GeoJsonPointFeature | GeoJsonLineFeature;

export interface DistrictGeoJsonCollection {
  type: 'FeatureCollection';
  features: DistrictGeoJsonFeature[];
}

export interface ChunkRoadSegment {
  edgeId: string;
  roadName: string;
  highwayCode: string;
  highwayClass: RoadGraphEdge['highwayClass'];
  ax: number;
  az: number;
  bx: number;
  bz: number;
  widthWorld: number;
  isBridge: boolean;
  isHairpinGhat: boolean;
}

export interface ChunkRiverSegment {
  riverId: string;
  riverName: string;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  widthWorld: number;
}

export interface DistrictSpatialBuckets {
  chunkSize: number;
  roadBuckets: Map<string, ChunkRoadSegment[]>;
  riverBuckets: Map<string, ChunkRiverSegment[]>;
  placeBuckets: Map<string, GazetteerPlace[]>;
}

/**
 * Generates an OpenStreetMap-compatible GeoJSON FeatureCollection representing Kozhikode District's
 * settlements, major rivers, and connected highway/road network.
 */
export function buildDefaultKozhikodeGeoJson(): DistrictGeoJsonCollection {
  const features: DistrictGeoJsonFeature[] = [];

  for (const place of KOZHIKODE_GAZETTEER_PLACES) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [place.lon, place.lat] },
      properties: {
        id: place.id,
        name: place.name,
        featureKind: place.category === 'river_bridge' ? 'bridge' : 'settlement',
        category: place.category,
      },
    });
  }

  for (const edge of KOZHIKODE_ROAD_NETWORK.edges) {
    const a: RoadGraphNode | undefined = KOZHIKODE_ROAD_NETWORK.nodes.get(edge.from);
    const b: RoadGraphNode | undefined = KOZHIKODE_ROAD_NETWORK.nodes.get(edge.to);
    if (!a || !b) continue;
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [a.lon, a.lat],
          [b.lon, b.lat],
        ],
      },
      properties: {
        id: edge.id,
        name: edge.roadName,
        featureKind: 'road',
        highwayCode: edge.highwayCode,
        widthWorld: edge.widthWorld,
        isBridge: edge.isBridge,
      },
    });
  }

  for (const river of KOZHIKODE_RIVERS) {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: river.pathGeo.map(([lat, lon]) => [lon, lat]),
      },
      properties: {
        id: river.id,
        name: river.name,
        featureKind: 'river',
        widthWorld: river.widthWorld,
      },
    });
  }

  return { type: 'FeatureCollection', features };
}

function addToChunkBucket<T>(map: Map<string, T[]>, cx: number, cz: number, item: T): void {
  const key = `${cx},${cz}`;
  let arr = map.get(key);
  if (!arr) {
    arr = [];
    map.set(key, arr);
  }
  arr.push(item);
}

/**
 * Ingests a WGS84 GeoJSON FeatureCollection and indexes every road, river, and settlement into
 * chunk buckets (`chunkSize` world meters) for fast spatial streaming in WorldStreamer.
 */
export function ingestGeoJsonToSpatialBuckets(
  collection: DistrictGeoJsonCollection,
  chunkSize = 120,
): DistrictSpatialBuckets {
  const roadBuckets = new Map<string, ChunkRoadSegment[]>();
  const riverBuckets = new Map<string, ChunkRiverSegment[]>();
  const placeBuckets = new Map<string, GazetteerPlace[]>();

  const toChunk = (val: number) => Math.floor((val + chunkSize * 0.5) / chunkSize);

  const registerSpan = <T>(
    buckets: Map<string, T[]>,
    ax: number,
    az: number,
    bx: number,
    bz: number,
    padWorld: number,
    item: T,
  ) => {
    const minCx = toChunk(Math.min(ax, bx) - padWorld);
    const maxCx = toChunk(Math.max(ax, bx) + padWorld);
    const minCz = toChunk(Math.min(az, bz) - padWorld);
    const maxCz = toChunk(Math.max(az, bz) + padWorld);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        addToChunkBucket(buckets, cx, cz, item);
      }
    }
  };

  // Index Gazetteer places directly (preserves curated core offsets & metadata)
  for (const place of KOZHIKODE_GAZETTEER_PLACES) {
    addToChunkBucket(placeBuckets, toChunk(place.worldX), toChunk(place.worldZ), place);
  }

  // Index road edges directly from the connected road graph for exact downtown + highway coordinates
  for (const edge of KOZHIKODE_ROAD_NETWORK.edges) {
    const a = KOZHIKODE_ROAD_NETWORK.nodes.get(edge.from);
    const b = KOZHIKODE_ROAD_NETWORK.nodes.get(edge.to);
    if (!a || !b) continue;
    const seg: ChunkRoadSegment = {
      edgeId: edge.id,
      roadName: edge.roadName,
      highwayCode: edge.highwayCode,
      highwayClass: edge.highwayClass,
      ax: a.x,
      az: a.z,
      bx: b.x,
      bz: b.z,
      widthWorld: edge.widthWorld,
      isBridge: Boolean(edge.isBridge),
      isHairpinGhat: Boolean(edge.isHairpinGhat),
    };
    registerSpan(roadBuckets, a.x, a.z, b.x, b.z, edge.widthWorld, seg);
  }

  // Ingest GeoJSON rivers & any custom GeoJSON road/point extensions
  for (const feature of collection.features) {
    if (feature.geometry.type === 'LineString' && feature.properties.featureKind === 'river') {
      const coords = feature.geometry.coordinates;
      const width = feature.properties.widthWorld ?? 18;
      for (let i = 0; i < coords.length - 1; i++) {
        const [lonA, latA] = coords[i];
        const [lonB, latB] = coords[i + 1];
        const wa = geoToWorld(latA, lonA);
        const wb = geoToWorld(latB, lonB);
        const seg: ChunkRiverSegment = {
          riverId: feature.properties.id,
          riverName: feature.properties.name,
          ax: wa.x,
          az: wa.z,
          bx: wb.x,
          bz: wb.z,
          widthWorld: width,
        };
        registerSpan(riverBuckets, wa.x, wa.z, wb.x, wb.z, width, seg);
      }
    }
  }

  return { chunkSize, roadBuckets, riverBuckets, placeBuckets };
}

export const KOZHIKODE_SPATIAL_BUCKETS: DistrictSpatialBuckets = ingestGeoJsonToSpatialBuckets(
  buildDefaultKozhikodeGeoJson(),
  120,
);
