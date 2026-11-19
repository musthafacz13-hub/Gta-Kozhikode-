import { geoToWorld, type KozhikodeBiomeType } from './GeoProjection.ts';

export type TalukId = 'kozhikode' | 'vatakara' | 'koyilandy' | 'thamarassery';

export type GazetteerCategory =
  | 'city_center'
  | 'town'
  | 'village'
  | 'beach'
  | 'harbour'
  | 'river_bridge'
  | 'hill_ghat'
  | 'waterfall_dam'
  | 'transit'
  | 'landmark'
  | 'home';

export type DataAccuracyLevel = 'verified_geo' | 'approximate_geo' | 'fictional_game';
export type GeoSourceTag = 'osm_odbl' | 'kerala_gov' | 'geonames_wiki' | 'game_authored';

export interface KozhikodeTalukSpec {
  id: TalukId;
  name: string;
  malayalamName: string;
  hqName: string;
  lat: number;
  lon: number;
  worldX: number;
  worldZ: number;
  summary: string;
}

export interface UrbanLocalBodySpec {
  id: string;
  name: string;
  type: 'municipal_corporation' | 'municipality';
  talukId: TalukId;
  lat: number;
  lon: number;
  worldX: number;
  worldZ: number;
}

export interface GramPanchayatEntry {
  id: string;
  name: string;
  talukId: TalukId;
  blockName: string;
  approxLat: number;
  approxLon: number;
}

export interface KozhikodeRiverSpec {
  id: string;
  name: string;
  malayalamName: string;
  crossingName: string;
  bridgeLat: number;
  bridgeLon: number;
  pathGeo: [number, number][]; // [lat, lon] upstream -> estuary
  widthWorld: number;
  highwayCode: string;
}

export interface GazetteerPlace {
  id: string;
  name: string;
  malayalamName: string;
  lat: number;
  lon: number;
  worldX: number;
  worldZ: number;
  talukId: TalukId;
  adminUnit: string;
  category: GazetteerCategory;
  biome: KozhikodeBiomeType;
  zoomTier: 1 | 2 | 3 | 4; // 1 = District major, 2 = Regional town/landmark, 3 = Local, 4 = Street/POI
  dataAccuracy: DataAccuracyLevel;
  sourceTag: GeoSourceTag;
  description: string;
}

function makeWorld(lat: number, lon: number, override?: { x: number; z: number }): { x: number; z: number } {
  if (override) return override;
  const pt = geoToWorld(lat, lon);
  return { x: Math.round(pt.x * 10) / 10, z: Math.round(pt.z * 10) / 10 };
}

export const KOZHIKODE_TALUKS: KozhikodeTalukSpec[] = [
  {
    id: 'kozhikode',
    name: 'Kozhikode Taluk',
    malayalamName: 'കോഴിക്കോട് താലൂക്ക്',
    hqName: 'Kozhikode City',
    lat: 11.2588,
    lon: 75.7804,
    ...(() => {
      const p = geoToWorld(11.2588, 75.7804);
      return { worldX: p.x, worldZ: p.z };
    })(),
    summary: 'Coastal commercial capital, Mananchira heritage core, Beypore Port, and suburban belt.',
  },
  {
    id: 'koyilandy',
    name: 'Koyilandy Taluk',
    malayalamName: 'കൊയിലാണ്ടി താലൂക്ക്',
    hqName: 'Koyilandy',
    lat: 11.439,
    lon: 75.695,
    ...(() => {
      const p = geoToWorld(11.439, 75.695);
      return { worldX: p.x, worldZ: p.z };
    })(),
    summary: 'Historic Kappad coast, Payyoli shoreline, Atholi, Ulliyeri, Balussery, and Perambra.',
  },
  {
    id: 'vatakara',
    name: 'Vatakara Taluk',
    malayalamName: 'വടകര താലൂക്ക്',
    hqName: 'Vatakara',
    lat: 11.6,
    lon: 75.58,
    ...(() => {
      const p = geoToWorld(11.6, 75.58);
      return { worldX: p.x, worldZ: p.z };
    })(),
    summary: 'Northern Malabar port town, Azhiyur border, Kuttiady valley, and Nadapuram.',
  },
  {
    id: 'thamarassery',
    name: 'Thamarassery Taluk',
    malayalamName: 'താമരശ്ശേരി താലൂക്ക്',
    hqName: 'Thamarassery',
    lat: 11.4139,
    lon: 75.9228,
    ...(() => {
      const p = geoToWorld(11.4139, 75.9228);
      return { worldX: p.x, worldZ: p.z };
    })(),
    summary: 'Midland spice towns, Koduvally, Mukkam, Thamarassery Churam ghat, and Thusharagiri.',
  },
];

export const KOZHIKODE_URBAN_LOCAL_BODIES: UrbanLocalBodySpec[] = [
  {
    id: 'ulb_kozhikode_corp',
    name: 'Kozhikode Municipal Corporation',
    type: 'municipal_corporation',
    talukId: 'kozhikode',
    lat: 11.2588,
    lon: 75.7804,
    worldX: 0,
    worldZ: 0,
  },
  {
    id: 'ulb_vadakara',
    name: 'Vadakara Municipality',
    type: 'municipality',
    talukId: 'vatakara',
    lat: 11.6033,
    lon: 75.583,
    ...(() => {
      const p = geoToWorld(11.6033, 75.583);
      return { worldX: p.x, worldZ: p.z };
    })(),
  },
  {
    id: 'ulb_koyilandy',
    name: 'Koyilandy Municipality',
    type: 'municipality',
    talukId: 'koyilandy',
    lat: 11.4347,
    lon: 75.6934,
    ...(() => {
      const p = geoToWorld(11.4347, 75.6934);
      return { worldX: p.x, worldZ: p.z };
    })(),
  },
  {
    id: 'ulb_payyoli',
    name: 'Payyoli Municipality',
    type: 'municipality',
    talukId: 'koyilandy',
    lat: 11.5037,
    lon: 75.622,
    ...(() => {
      const p = geoToWorld(11.5037, 75.622);
      return { worldX: p.x, worldZ: p.z };
    })(),
  },
  {
    id: 'ulb_ramanattukara',
    name: 'Ramanattukara Municipality',
    type: 'municipality',
    talukId: 'kozhikode',
    lat: 11.1824,
    lon: 75.845,
    ...(() => {
      const p = geoToWorld(11.1824, 75.845);
      return { worldX: p.x, worldZ: p.z };
    })(),
  },
  {
    id: 'ulb_feroke',
    name: 'Feroke Municipality',
    type: 'municipality',
    talukId: 'kozhikode',
    lat: 11.1764,
    lon: 75.8295,
    ...(() => {
      const p = geoToWorld(11.1764, 75.8295);
      return { worldX: p.x, worldZ: p.z };
    })(),
  },
  {
    id: 'ulb_koduvally',
    name: 'Koduvally Municipality',
    type: 'municipality',
    talukId: 'thamarassery',
    lat: 11.3432,
    lon: 75.9288,
    ...(() => {
      const p = geoToWorld(11.3432, 75.9288);
      return { worldX: p.x, worldZ: p.z };
    })(),
  },
  {
    id: 'ulb_mukkam',
    name: 'Mukkam Municipality',
    type: 'municipality',
    talukId: 'thamarassery',
    lat: 11.3168,
    lon: 75.9866,
    ...(() => {
      const p = geoToWorld(11.3168, 75.9866);
      return { worldX: p.x, worldZ: p.z };
    })(),
  },
];

/**
 * 4 Major Rivers & Crossing Bridges in Kozhikode District.
 */
export const KOZHIKODE_RIVERS: KozhikodeRiverSpec[] = [
  {
    id: 'river_korapuzha',
    name: 'Korapuzha River',
    malayalamName: 'കോരപ്പുഴ',
    crossingName: 'Korapuzha (Elathur) Bridge',
    bridgeLat: 11.355,
    bridgeLon: 75.7411,
    pathGeo: [
      [11.45, 75.89],
      [11.4, 75.83],
      [11.355, 75.7411],
      [11.345, 75.722],
    ],
    widthWorld: 18,
    highwayCode: 'NH-66',
  },
  {
    id: 'river_kallai',
    name: 'Kallai River',
    malayalamName: 'കല്ലായി പുഴ',
    crossingName: 'Kallai Timber Bridge',
    bridgeLat: 11.2303,
    bridgeLon: 75.788,
    pathGeo: [
      [11.255, 75.92],
      [11.242, 75.85],
      [11.2303, 75.788],
      [11.235, 75.771],
    ],
    widthWorld: 16,
    highwayCode: 'NH-66 / Kallai Rd',
  },
  {
    id: 'river_chaliyar',
    name: 'Chaliyar River',
    malayalamName: 'ചാലിയാർ',
    crossingName: 'Feroke Chaliyar Bridge',
    bridgeLat: 11.178,
    bridgeLon: 75.831,
    pathGeo: [
      [11.24, 76.02],
      [11.21, 75.93],
      [11.178, 75.831],
      [11.1667, 75.8],
    ],
    widthWorld: 24,
    highwayCode: 'NH-66',
  },
  {
    id: 'river_kuttiady',
    name: 'Kuttiady River',
    malayalamName: 'കുറ്റ്യാടി പുഴ',
    crossingName: 'Moorad / Kuttiady Crossing',
    bridgeLat: 11.552,
    bridgeLon: 75.605,
    pathGeo: [
      [11.6542, 75.7539],
      [11.6, 75.68],
      [11.552, 75.605],
      [11.545, 75.59],
    ],
    widthWorld: 20,
    highwayCode: 'NH-66 / SH-38',
  },
];

interface RawPlace {
  id: string;
  name: string;
  malayalamName: string;
  lat: number;
  lon: number;
  overrideWorld?: { x: number; z: number };
  talukId: TalukId;
  adminUnit: string;
  category: GazetteerCategory;
  biome: KozhikodeBiomeType;
  zoomTier: 1 | 2 | 3 | 4;
  dataAccuracy: DataAccuracyLevel;
  sourceTag: GeoSourceTag;
  description: string;
}

const RAW_PLACES: RawPlace[] = [
  // Core Urban Kozhikode (Seamless Phase 1/2 World Alignment + Real WGS84 Coords)
  {
    id: 'mananchira',
    name: 'Mananchira Square',
    malayalamName: 'മാനാഞ്ചിറ',
    lat: 11.2544,
    lon: 75.78,
    overrideWorld: { x: 0, z: 0 },
    talukId: 'kozhikode',
    adminUnit: 'Kozhikode Municipal Corporation',
    category: 'city_center',
    biome: 'urban',
    zoomTier: 1,
    dataAccuracy: 'verified_geo',
    sourceTag: 'osm_odbl',
    description: 'Historic civic square and laterite pond at the heart of Kozhikode city.',
  },
  {
    id: 'sm_street',
    name: 'S.M. Street (Mittayi Theruvu)',
    malayalamName: 'മിഠായി തെരുവ്',
    lat: 11.2506,
    lon: 75.7817,
    overrideWorld: { x: 24, z: 88 },
    talukId: 'kozhikode',
    adminUnit: 'Kozhikode Municipal Corporation',
    category: 'landmark',
    biome: 'urban',
    zoomTier: 3,
    dataAccuracy: 'verified_geo',
    sourceTag: 'osm_odbl',
    description: 'Iconic pedestrian heritage bazaar famous for Kozhikode halwa and textiles.',
  },
  {
    id: 'palayam',
    name: 'Palayam & Market Junction',
    malayalamName: 'പാളയം',
    lat: 11.2486,
    lon: 75.7839,
    overrideWorld: { x: 112, z: 68 },
    talukId: 'kozhikode',
    adminUnit: 'Kozhikode Municipal Corporation',
    category: 'transit',
    biome: 'urban',
    zoomTier: 3,
    dataAccuracy: 'verified_geo',
    sourceTag: 'osm_odbl',
    description: 'Bustling vegetable market hall and city bus stand junction.',
  },
  {
    id: 'mavoor_road',
    name: 'Mavoor Road Commercial Hub',
    malayalamName: 'മാവൂർ റോഡ്',
    lat: 11.2603,
    lon: 75.7875,
    overrideWorld: { x: 128, z: -38 },
    talukId: 'kozhikode',
    adminUnit: 'Kozhikode Municipal Corporation',
    category: 'landmark',
    biome: 'urban',
    zoomTier: 3,
    dataAccuracy: 'verified_geo',
    sourceTag: 'osm_odbl',
    description: 'Major east-west commercial corridor connecting city center to Bypass.',
  },
  {
    id: 'railway_station',
    name: 'Kozhikode Railway Station (CLT)',
    malayalamName: 'റെയിൽവേ സ്റ്റേഷൻ',
    lat: 11.2465,
    lon: 75.7805,
    overrideWorld: { x: 52, z: 168 },
    talukId: 'kozhikode',
    adminUnit: 'Kozhikode Municipal Corporation',
    category: 'transit',
    biome: 'urban',
    zoomTier: 2,
    dataAccuracy: 'verified_geo',
    sourceTag: 'osm_odbl',
    description: 'Primary Southern Railway hub south of Mananchira.',
  },
  {
    id: 'kozhikode_beach',
    name: 'Kozhikode Beach & Lighthouse',
    malayalamName: 'കോഴിക്കോട് ബീച്ച്',
    lat: 11.2561,
    lon: 75.7694,
    overrideWorld: { x: -78, z: -8 },
    talukId: 'kozhikode',
    adminUnit: 'Kozhikode Municipal Corporation',
    category: 'beach',
    biome: 'coastal',
    zoomTier: 1,
    dataAccuracy: 'verified_geo',
    sourceTag: 'osm_odbl',
    description: 'Arabian Sea promenade, red-and-white lighthouse, and evening street food.',
  },
  {
    id: 'south_beach',
    name: 'South Beach & Old Sea Pier',
    malayalamName: 'സൗത്ത് ബീച്ച്',
    lat: 11.2435,
    lon: 75.7725,
    overrideWorld: { x: -78, z: 120 },
    talukId: 'kozhikode',
    adminUnit: 'Kozhikode Municipal Corporation',
    category: 'beach',
    biome: 'coastal',
    zoomTier: 3,
    dataAccuracy: 'verified_geo',
    sourceTag: 'osm_odbl',
    description: 'Historic wooden sea pier pillars and coastal fishing boats.',
  },
  {
    id: 'protagonist_home',
    name: "West Hill · Arjun's Residence",
    malayalamName: 'വെസ്റ്റ് ഹിൽ · വീട്',
    lat: 11.278,
    lon: 75.771,
    overrideWorld: { x: -36, z: -136 },
    talukId: 'kozhikode',
    adminUnit: 'Kozhikode Municipal Corporation',
    category: 'home',
    biome: 'urban',
    zoomTier: 2,
    dataAccuracy: 'fictional_game',
    sourceTag: 'game_authored',
    description: "Arjun's Kerala Tharavadu family homestead in the West Hill neighborhood.",
  },
  {
    id: 'nadakkavu',
    name: 'Nadakkavu',
    malayalamName: 'നടക്കാവ്',
    lat: 11.2713,
    lon: 75.7795,
    talukId: 'kozhikode',
    adminUnit: 'Kozhikode Municipal Corporation',
    category: 'town',
    biome: 'urban',
    zoomTier: 4,
    dataAccuracy: 'verified_geo',
    sourceTag: 'osm_odbl',
    description: 'Northern city junction on Kannur Road leading from Mananchira to West Hill.',
  },
  {
    id: 'west_hill_town',
    name: 'West Hill Junction',
    malayalamName: 'വെസ്റ്റ് ഹിൽ',
    lat: 11.2916,
    lon: 75.7609,
    talukId: 'kozhikode',
    adminUnit: 'Kozhikode Municipal Corporation',
    category: 'town',
    biome: 'urban',
    zoomTier: 2,
    dataAccuracy: 'verified_geo',
    sourceTag: 'osm_odbl',
    description: 'Coastal residential and educational suburb north of Nadakkavu.',
  },
  {
    id: 'kallai_bridge',
    name: 'Kallai & Timber Yard Bridge',
    malayalamName: 'കല്ലായി',
    lat: 11.2303,
    lon: 75.788,
    talukId: 'kozhikode',
    adminUnit: 'Kozhikode Municipal Corporation',
    category: 'river_bridge',
    biome: 'river',
    zoomTier: 2,
    dataAccuracy: 'verified_geo',
    sourceTag: 'geonames_wiki',
    description: 'Historic timber-trade river crossing south of the railway station.',
  },
  {
    id: 'thondayad',
    name: 'Thondayad Bypass',
    malayalamName: 'തൊണ്ടയാട്',
    lat: 11.2646,
    lon: 75.8117,
    talukId: 'kozhikode',
    adminUnit: 'Kozhikode Municipal Corporation',
    category: 'transit',
    biome: 'urban',
    zoomTier: 2,
    dataAccuracy: 'verified_geo',
    sourceTag: 'osm_odbl',
    description: 'Major NH-66 Bypass flyover connecting Mavoor Road to Cyberpark and Medical College.',
  },
  {
    id: 'medical_college',
    name: 'Govt. Medical College',
    malayalamName: 'മെഡിക്കൽ കോളേജ്',
    lat: 11.271,
    lon: 75.8375,
    talukId: 'kozhikode',
    adminUnit: 'Kozhikode Municipal Corporation',
    category: 'landmark',
    biome: 'urban',
    zoomTier: 2,
    dataAccuracy: 'verified_geo',
    sourceTag: 'osm_odbl',
    description: 'Regional medical campus and busy east-bound transit node on NH-766 corridor.',
  },
  {
    id: 'vellimadukunnu',
    name: 'Vellimadukunnu',
    malayalamName: 'വെള്ളിമാടുകുന്ന്',
    lat: 11.2906,
    lon: 75.83,
    talukId: 'kozhikode',
    adminUnit: 'Kozhikode Municipal Corporation',
    category: 'village',
    biome: 'midland',
    zoomTier: 3,
    dataAccuracy: 'verified_geo',
    sourceTag: 'osm_odbl',
    description: 'Hilltop residential locality along the Wayanad Road corridor.',
  },
  {
    id: 'elathur',
    name: 'Elathur & Korapuzha Bridge',
    malayalamName: 'എലത്തൂർ · കോരപ്പുഴ',
    lat: 11.355,
    lon: 75.7411,
    talukId: 'kozhikode',
    adminUnit: 'Kozhikode Municipal Corporation',
    category: 'river_bridge',
    biome: 'river',
    zoomTier: 2,
    dataAccuracy: 'verified_geo',
    sourceTag: 'geonames_wiki',
    description: 'Gateway bridge over Korapuzha River linking Kozhikode north into Koyilandy.',
  },
  {
    id: 'beypore_harbour',
    name: 'Beypore Harbour & Port',
    malayalamName: 'ബേപ്പൂർ തുറമുഖം',
    lat: 11.1715,
    lon: 75.8061,
    talukId: 'kozhikode',
    adminUnit: 'Kozhikode Municipal Corporation',
    category: 'harbour',
    biome: 'coastal',
    zoomTier: 1,
    dataAccuracy: 'verified_geo',
    sourceTag: 'geonames_wiki',
    description: 'Ancient Malabar maritime port famous for wooden Uru shipbuilders & Pulimuttu pier.',
  },
  {
    id: 'feroke',
    name: 'Feroke & Chaliyar Bridge',
    malayalamName: 'ഫറോക്ക്',
    lat: 11.176,
    lon: 75.8302,
    talukId: 'kozhikode',
    adminUnit: 'Feroke Municipality',
    category: 'river_bridge',
    biome: 'river',
    zoomTier: 1,
    dataAccuracy: 'verified_geo',
    sourceTag: 'kerala_gov',
    description: 'Southern tile-making municipality and Chaliyar River bridge gateway.',
  },
  {
    id: 'ramanattukara',
    name: 'Ramanattukara Highway Hub',
    malayalamName: 'രാമനാട്ടുകര',
    lat: 11.1887,
    lon: 75.8577,
    talukId: 'kozhikode',
    adminUnit: 'Ramanattukara Municipality',
    category: 'transit',
    biome: 'midland',
    zoomTier: 1,
    dataAccuracy: 'verified_geo',
    sourceTag: 'kerala_gov',
    description: 'Major NH-66 southern highway interchange connecting Kozhikode Bypass to Airport & Palakkad routes.',
  },
  {
    id: 'pantheerankavu',
    name: 'Pantheerankavu',
    malayalamName: 'പന്തീരാങ്കാവ്',
    lat: 11.2268,
    lon: 75.852,
    talukId: 'kozhikode',
    adminUnit: 'Olavanna Gram Panchayat',
    category: 'village',
    biome: 'midland',
    zoomTier: 3,
    dataAccuracy: 'verified_geo',
    sourceTag: 'osm_odbl',
    description: 'Fast-growing NH-66 bypass junction south-east of Kozhikode city.',
  },
  {
    id: 'olavanna',
    name: 'Olavanna',
    malayalamName: 'ഒളവണ്ണ',
    lat: 11.245,
    lon: 75.855,
    talukId: 'kozhikode',
    adminUnit: 'Olavanna Gram Panchayat',
    category: 'village',
    biome: 'midland',
    zoomTier: 3,
    dataAccuracy: 'approximate_geo',
    sourceTag: 'kerala_gov',
    description: 'Suburban panchayat bordering the Chaliyar and Kallai watersheds.',
  },
  {
    id: 'perumanna',
    name: 'Perumanna',
    malayalamName: 'പെരുമണ്ണ',
    lat: 11.2389,
    lon: 75.8792,
    talukId: 'kozhikode',
    adminUnit: 'Perumanna Gram Panchayat',
    category: 'village',
    biome: 'midland',
    zoomTier: 4,
    dataAccuracy: 'verified_geo',
    sourceTag: 'geonames_wiki',
    description: 'Eastern suburban panchayat in Kozhikode Taluk.',
  },
  {
    id: 'mavoor',
    name: 'Mavoor',
    malayalamName: 'മാവൂർ',
    lat: 11.2597,
    lon: 75.9486,
    talukId: 'kozhikode',
    adminUnit: 'Mavoor Gram Panchayat',
    category: 'village',
    biome: 'midland',
    zoomTier: 2,
    dataAccuracy: 'verified_geo',
    sourceTag: 'geonames_wiki',
    description: 'Riverbank town along the Chaliyar valley east of Kozhikode.',
  },
  {
    id: 'kunnamangalam',
    name: 'Kunnamangalam',
    malayalamName: 'കുന്ദമംഗലം',
    lat: 11.3064,
    lon: 75.8789,
    talukId: 'kozhikode',
    adminUnit: 'Kunnamangalam Gram Panchayat',
    category: 'town',
    biome: 'midland',
    zoomTier: 1,
    dataAccuracy: 'verified_geo',
    sourceTag: 'geonames_wiki',
    description: 'Major NH-766 town home to IIM Kozhikode and NIT Calicut belt.',
  },
  {
    id: 'kakkodi',
    name: 'Kakkodi',
    malayalamName: 'കക്കോടി',
    lat: 11.3322,
    lon: 75.7883,
    talukId: 'kozhikode',
    adminUnit: 'Kakkodi Gram Panchayat',
    category: 'village',
    biome: 'midland',
    zoomTier: 3,
    dataAccuracy: 'verified_geo',
    sourceTag: 'geonames_wiki',
    description: 'Green suburban panchayat north of Kozhikode Corporation.',
  },
  {
    id: 'chelannur',
    name: 'Chelannur',
    malayalamName: 'ചേളന്നൂർ',
    lat: 11.3417,
    lon: 75.8083,
    talukId: 'kozhikode',
    adminUnit: 'Chelannur Gram Panchayat',
    category: 'village',
    biome: 'midland',
    zoomTier: 3,
    dataAccuracy: 'verified_geo',
    sourceTag: 'geonames_wiki',
    description: 'Inland midland panchayat along the SH-38 Balussery approach.',
  },
  {
    id: 'narikkuni',
    name: 'Narikkuni',
    malayalamName: 'നരിക്കുനി',
    lat: 11.3658,
    lon: 75.8636,
    talukId: 'kozhikode',
    adminUnit: 'Narikkuni Gram Panchayat',
    category: 'village',
    biome: 'midland',
    zoomTier: 3,
    dataAccuracy: 'verified_geo',
    sourceTag: 'geonames_wiki',
    description: 'Crossroads village linking Kunnamangalam, Chelannur, and Balussery.',
  },

  // Koyilandy Taluk & Northern Coast
  {
    id: 'kappad',
    name: 'Kappad Historic Beach',
    malayalamName: 'കാപ്പാട് ബീച്ച്',
    lat: 11.3831,
    lon: 75.7169,
    talukId: 'koyilandy',
    adminUnit: 'Chemancheri Gram Panchayat',
    category: 'beach',
    biome: 'coastal',
    zoomTier: 1,
    dataAccuracy: 'verified_geo',
    sourceTag: 'geonames_wiki',
    description: 'Historic Malabar stone monument beach where Vasco da Gama landed in 1498.',
  },
  {
    id: 'chemancheri',
    name: 'Chemancheri',
    malayalamName: 'ചേമഞ്ചേരി',
    lat: 11.4048,
    lon: 75.7236,
    talukId: 'koyilandy',
    adminUnit: 'Chemancheri Gram Panchayat',
    category: 'village',
    biome: 'coastal',
    zoomTier: 4,
    dataAccuracy: 'verified_geo',
    sourceTag: 'osm_odbl',
    description: 'Coastal panchayat between Elathur and Koyilandy.',
  },
  {
    id: 'koyilandy',
    name: 'Koyilandy Town',
    malayalamName: 'കൊയിലാണ്ടി',
    lat: 11.439,
    lon: 75.695,
    talukId: 'koyilandy',
    adminUnit: 'Koyilandy Municipality',
    category: 'town',
    biome: 'coastal',
    zoomTier: 1,
    dataAccuracy: 'verified_geo',
    sourceTag: 'kerala_gov',
    description: 'Taluk headquarters & coastal commercial town on NH-66 and SH-34 junction.',
  },
  {
    id: 'moodadi',
    name: 'Moodadi',
    malayalamName: 'മൂടാടി',
    lat: 11.4629,
    lon: 75.6601,
    talukId: 'koyilandy',
    adminUnit: 'Moodadi Gram Panchayat',
    category: 'village',
    biome: 'coastal',
    zoomTier: 4,
    dataAccuracy: 'verified_geo',
    sourceTag: 'geonames_wiki',
    description: 'Coastal fishing and agricultural village north of Koyilandy.',
  },
  {
    id: 'thikkodi',
    name: 'Thikkodi Drive-In Beach',
    malayalamName: 'തിക്കോടി ബീച്ച്',
    lat: 11.4952,
    lon: 75.6239,
    talukId: 'koyilandy',
    adminUnit: 'Thikkodi Gram Panchayat',
    category: 'beach',
    biome: 'coastal',
    zoomTier: 2,
    dataAccuracy: 'verified_geo',
    sourceTag: 'geonames_wiki',
    description: 'Famous firm-sand drive-in beach on the northern Malabar coastline.',
  },
  {
    id: 'payyoli',
    name: 'Payyoli',
    malayalamName: 'പയ്യോളി',
    lat: 11.515,
    lon: 75.622,
    talukId: 'koyilandy',
    adminUnit: 'Payyoli Municipality',
    category: 'town',
    biome: 'coastal',
    zoomTier: 1,
    dataAccuracy: 'verified_geo',
    sourceTag: 'kerala_gov',
    description: 'Coastal municipality south of Moorad river crossing and Kuttiady estuary.',
  },
  {
    id: 'atholi',
    name: 'Atholi',
    malayalamName: 'അത്തോളി',
    lat: 11.4253,
    lon: 75.7738,
    talukId: 'koyilandy',
    adminUnit: 'Atholi Gram Panchayat',
    category: 'village',
    biome: 'midland',
    zoomTier: 3,
    dataAccuracy: 'verified_geo',
    sourceTag: 'geonames_wiki',
    description: 'Riverside town along SH-38 east of Koyilandy.',
  },
  {
    id: 'ulliyeri',
    name: 'Ulliyeri',
    malayalamName: 'ഉള്ള്യേരി',
    lat: 11.4333,
    lon: 75.7833,
    talukId: 'koyilandy',
    adminUnit: 'Ulliyeri Gram Panchayat',
    category: 'town',
    biome: 'midland',
    zoomTier: 2,
    dataAccuracy: 'verified_geo',
    sourceTag: 'geonames_wiki',
    description: 'Key SH-34 & SH-38 cross-district midland junction.',
  },
  {
    id: 'naduvannur',
    name: 'Naduvannur',
    malayalamName: 'നടുവണ്ണൂർ',
    lat: 11.4833,
    lon: 75.7667,
    talukId: 'koyilandy',
    adminUnit: 'Naduvannur Gram Panchayat',
    category: 'village',
    biome: 'midland',
    zoomTier: 3,
    dataAccuracy: 'verified_geo',
    sourceTag: 'geonames_wiki',
    description: 'Agricultural market village between Ulliyeri and Perambra.',
  },
  {
    id: 'balussery',
    name: 'Balussery',
    malayalamName: 'ബാലുശ്ശേരി',
    lat: 11.45,
    lon: 75.83,
    talukId: 'koyilandy',
    adminUnit: 'Balussery Gram Panchayat',
    category: 'town',
    biome: 'midland',
    zoomTier: 1,
    dataAccuracy: 'verified_geo',
    sourceTag: 'geonames_wiki',
    description: 'Midland commercial town along SH-34 gateway to Thamarassery and Kakkayam.',
  },
  {
    id: 'perambra',
    name: 'Perambra',
    malayalamName: 'പേരാമ്പ്ര',
    lat: 11.5575,
    lon: 75.7605,
    talukId: 'koyilandy',
    adminUnit: 'Perambra Gram Panchayat',
    category: 'town',
    biome: 'midland',
    zoomTier: 1,
    dataAccuracy: 'verified_geo',
    sourceTag: 'geonames_wiki',
    description: 'Major northern midland trade center linking Koyilandy, Vatakara, and Kakkayam Dam.',
  },

  // Vatakara Taluk
  {
    id: 'vatakara',
    name: 'Vatakara Town',
    malayalamName: 'വടകര',
    lat: 11.6,
    lon: 75.58,
    talukId: 'vatakara',
    adminUnit: 'Vadakara Municipality',
    category: 'town',
    biome: 'coastal',
    zoomTier: 1,
    dataAccuracy: 'verified_geo',
    sourceTag: 'kerala_gov',
    description: 'Northern district coastal hub known for Kalaripayattu heritage and Sand Banks Beach.',
  },
  {
    id: 'moorad_bridge',
    name: 'Moorad Kuttiady Bridge',
    malayalamName: 'മൂരാട് പാലം',
    lat: 11.552,
    lon: 75.605,
    talukId: 'vatakara',
    adminUnit: 'Payyoli / Vatakara',
    category: 'river_bridge',
    biome: 'river',
    zoomTier: 2,
    dataAccuracy: 'verified_geo',
    sourceTag: 'osm_odbl',
    description: 'NH-66 bridge spanning the Kuttiady River south of Vatakara.',
  },
  {
    id: 'azhiyur',
    name: 'Azhiyur Border',
    malayalamName: 'അഴിയൂർ',
    lat: 11.6833,
    lon: 75.5333,
    talukId: 'vatakara',
    adminUnit: 'Azhiyur Gram Panchayat',
    category: 'village',
    biome: 'coastal',
    zoomTier: 2,
    dataAccuracy: 'verified_geo',
    sourceTag: 'geonames_wiki',
    description: 'Northernmost coastal border panchayat of Kozhikode District next to Mahe.',
  },
  {
    id: 'thuneri',
    name: 'Thuneri',
    malayalamName: 'തൂണേരി',
    lat: 11.6333,
    lon: 75.6167,
    talukId: 'vatakara',
    adminUnit: 'Thuneri Gram Panchayat',
    category: 'village',
    biome: 'midland',
    zoomTier: 3,
    dataAccuracy: 'verified_geo',
    sourceTag: 'geonames_wiki',
    description: 'Inland town north-east of Vatakara on the Nadapuram road.',
  },
  {
    id: 'purameri',
    name: 'Purameri',
    malayalamName: 'പുറമേരി',
    lat: 11.6534,
    lon: 75.6613,
    talukId: 'vatakara',
    adminUnit: 'Purameri Gram Panchayat',
    category: 'village',
    biome: 'midland',
    zoomTier: 3,
    dataAccuracy: 'verified_geo',
    sourceTag: 'geonames_wiki',
    description: 'Heritage village along the Thuneri-Nadapuram valley.',
  },
  {
    id: 'nadapuram',
    name: 'Nadapuram',
    malayalamName: 'നാദാപുരം',
    lat: 11.7,
    lon: 75.6667,
    talukId: 'vatakara',
    adminUnit: 'Nadapuram Gram Panchayat',
    category: 'town',
    biome: 'midland',
    zoomTier: 1,
    dataAccuracy: 'verified_geo',
    sourceTag: 'geonames_wiki',
    description: 'Northern inland town on SH-38 trading corridor.',
  },
  {
    id: 'kuttiady',
    name: 'Kuttiady',
    malayalamName: 'കുറ്റ്യാടി',
    lat: 11.6542,
    lon: 75.7539,
    talukId: 'vatakara',
    adminUnit: 'Kuttiady Gram Panchayat',
    category: 'town',
    biome: 'midland',
    zoomTier: 1,
    dataAccuracy: 'verified_geo',
    sourceTag: 'geonames_wiki',
    description: 'Foothill gateway town to Kuttiady Ghat, coconut palms, and spice estates.',
  },

  // Thamarassery Taluk & Western Ghats Highlands
  {
    id: 'koduvally',
    name: 'Koduvally Gold & Trade Town',
    malayalamName: 'കൊടുവള്ളി',
    lat: 11.3432,
    lon: 75.9288,
    talukId: 'thamarassery',
    adminUnit: 'Koduvally Municipality',
    category: 'town',
    biome: 'midland',
    zoomTier: 1,
    dataAccuracy: 'verified_geo',
    sourceTag: 'kerala_gov',
    description: 'Bustling NH-766 midland municipal town between Kunnamangalam and Thamarassery.',
  },
  {
    id: 'thamarassery',
    name: 'Thamarassery',
    malayalamName: 'താമരശ്ശേരി',
    lat: 11.4139,
    lon: 75.9228,
    talukId: 'thamarassery',
    adminUnit: 'Thamarassery Gram Panchayat',
    category: 'town',
    biome: 'midland',
    zoomTier: 1,
    dataAccuracy: 'verified_geo',
    sourceTag: 'geonames_wiki',
    description: 'Taluk headquarters & crossroads connecting NH-766 Wayanad Ghat with SH-34.',
  },
  {
    id: 'omassery',
    name: 'Omassery',
    malayalamName: 'ഓമശ്ശേരി',
    lat: 11.3,
    lon: 75.975,
    talukId: 'thamarassery',
    adminUnit: 'Omassery Gram Panchayat',
    category: 'village',
    biome: 'midland',
    zoomTier: 3,
    dataAccuracy: 'verified_geo',
    sourceTag: 'geonames_wiki',
    description: 'Midland junction on SH-34 linking Thamarassery to Mukkam.',
  },
  {
    id: 'mukkam',
    name: 'Mukkam',
    malayalamName: 'മുക്കം',
    lat: 11.3168,
    lon: 75.9866,
    talukId: 'thamarassery',
    adminUnit: 'Mukkam Municipality',
    category: 'town',
    biome: 'midland',
    zoomTier: 1,
    dataAccuracy: 'verified_geo',
    sourceTag: 'kerala_gov',
    description: 'Eastern municipal town on the Iruvazhinji / Chaliyar banks.',
  },
  {
    id: 'thiruvambadi',
    name: 'Thiruvambadi',
    malayalamName: 'തിരുവമ്പാടി',
    lat: 11.3608,
    lon: 76.0089,
    talukId: 'thamarassery',
    adminUnit: 'Thiruvambadi Gram Panchayat',
    category: 'town',
    biome: 'highland',
    zoomTier: 2,
    dataAccuracy: 'verified_geo',
    sourceTag: 'geonames_wiki',
    description: 'Foothill estate town approaching Thusharagiri and Kodenchery.',
  },
  {
    id: 'kodenchery',
    name: 'Kodenchery',
    malayalamName: 'കോടഞ്ചേരി',
    lat: 11.4719,
    lon: 75.969,
    talukId: 'thamarassery',
    adminUnit: 'Kodenchery Gram Panchayat',
    category: 'village',
    biome: 'highland',
    zoomTier: 2,
    dataAccuracy: 'verified_geo',
    sourceTag: 'geonames_wiki',
    description: 'Highland spice village on the road to Thusharagiri Waterfalls.',
  },
  {
    id: 'puthuppadi',
    name: 'Puthuppadi & Adivaram',
    malayalamName: 'പുതുപ്പാടി · അടിവാരം',
    lat: 11.4953,
    lon: 75.9837,
    talukId: 'thamarassery',
    adminUnit: 'Puthuppadi Gram Panchayat',
    category: 'village',
    biome: 'highland',
    zoomTier: 2,
    dataAccuracy: 'verified_geo',
    sourceTag: 'geonames_wiki',
    description: 'Foothill staging town at the base of the 9-hairpin Thamarassery Churam climb.',
  },
  {
    id: 'thamarassery_churam',
    name: 'Thamarassery Churam (Ghat Pass)',
    malayalamName: 'താമരശ്ശേരി ചുരം',
    lat: 11.4983,
    lon: 76.0222,
    talukId: 'thamarassery',
    adminUnit: 'Puthuppadi / Western Ghats',
    category: 'hill_ghat',
    biome: 'highland',
    zoomTier: 1,
    dataAccuracy: 'verified_geo',
    sourceTag: 'geonames_wiki',
    description: 'Dramatic NH-766 mountain pass with sweeping hairpin bends climbing the Western Ghats.',
  },
  {
    id: 'thusharagiri',
    name: 'Thusharagiri Waterfalls',
    malayalamName: 'തുഷാരഗിരി വെള്ളച്ചാട്ടം',
    lat: 11.4725,
    lon: 76.0536,
    talukId: 'thamarassery',
    adminUnit: 'Kodenchery Gram Panchayat',
    category: 'waterfall_dam',
    biome: 'highland',
    zoomTier: 1,
    dataAccuracy: 'verified_geo',
    sourceTag: 'geonames_wiki',
    description: 'Misty Western Ghats cascading waterfalls nestled in evergreen forest.',
  },
  {
    id: 'kakkayam_dam',
    name: 'Kakkayam Dam & Valley',
    malayalamName: 'കക്കയം ഡാം',
    lat: 11.5511,
    lon: 75.925,
    talukId: 'thamarassery',
    adminUnit: 'Koorachundu Gram Panchayat',
    category: 'waterfall_dam',
    biome: 'highland',
    zoomTier: 1,
    dataAccuracy: 'verified_geo',
    sourceTag: 'geonames_wiki',
    description: 'Mountain reservoir & hydroelectric valley surrounded by Malabar reserve hills.',
  },
];

export const KOZHIKODE_GAZETTEER_PLACES: GazetteerPlace[] = RAW_PLACES.map((item) => {
  const world = makeWorld(item.lat, item.lon, item.overrideWorld);
  return {
    id: item.id,
    name: item.name,
    malayalamName: item.malayalamName,
    lat: item.lat,
    lon: item.lon,
    worldX: world.x,
    worldZ: world.z,
    talukId: item.talukId,
    adminUnit: item.adminUnit,
    category: item.category,
    biome: item.biome,
    zoomTier: item.zoomTier,
    dataAccuracy: item.dataAccuracy,
    sourceTag: item.sourceTag,
    description: item.description,
  };
});

/**
 * Complete 70 Gram Panchayats administrative registry of Kozhikode District (kerala.gov.in / kozhikode.nic.in).
 * Approximate block-level centers allow full searchability across every rural local body in the district.
 */
export const KOZHIKODE_GRAM_PANCHAYATS: GramPanchayatEntry[] = [
  // Kozhikode Taluk (12 GPs)
  { id: 'gp_kadalundi', name: 'Kadalundi', talukId: 'kozhikode', blockName: 'Kozhikode', approxLat: 11.132, approxLon: 75.834 },
  { id: 'gp_olavanna', name: 'Olavanna', talukId: 'kozhikode', blockName: 'Kozhikode', approxLat: 11.245, approxLon: 75.855 },
  { id: 'gp_kakkodi', name: 'Kakkodi', talukId: 'kozhikode', blockName: 'Chelannur', approxLat: 11.3322, approxLon: 75.7883 },
  { id: 'gp_chelannur', name: 'Chelannur', talukId: 'kozhikode', blockName: 'Chelannur', approxLat: 11.3417, approxLon: 75.8083 },
  { id: 'gp_kakkur', name: 'Kakkur', talukId: 'kozhikode', blockName: 'Chelannur', approxLat: 11.365, approxLon: 75.825 },
  { id: 'gp_thalakkulathur', name: 'Thalakkulathur', talukId: 'kozhikode', blockName: 'Chelannur', approxLat: 11.358, approxLon: 75.762 },
  { id: 'gp_nanminda', name: 'Nanminda', talukId: 'kozhikode', blockName: 'Chelannur', approxLat: 11.398, approxLon: 75.822 },
  { id: 'gp_narikkuni', name: 'Narikkuni', talukId: 'kozhikode', blockName: 'Chelannur', approxLat: 11.3658, approxLon: 75.8636 },
  { id: 'gp_madavoor', name: 'Madavoor', talukId: 'kozhikode', blockName: 'Koduvally', approxLat: 11.351, approxLon: 75.886 },
  { id: 'gp_kunnamangalam', name: 'Kunnamangalam', talukId: 'kozhikode', blockName: 'Kunnamangalam', approxLat: 11.3064, approxLon: 75.8789 },
  { id: 'gp_peruvayal', name: 'Peruvayal', talukId: 'kozhikode', blockName: 'Kunnamangalam', approxLat: 11.268, approxLon: 75.898 },
  { id: 'gp_perumanna', name: 'Perumanna', talukId: 'kozhikode', blockName: 'Kunnamangalam', approxLat: 11.2389, approxLon: 75.8792 },
  { id: 'gp_mavoor', name: 'Mavoor', talukId: 'kozhikode', blockName: 'Kunnamangalam', approxLat: 11.2597, approxLon: 75.9486 },
  { id: 'gp_chathamangalam', name: 'Chathamangalam', talukId: 'kozhikode', blockName: 'Kunnamangalam', approxLat: 11.312, approxLon: 75.932 },
  { id: 'gp_kuruvattoor', name: 'Kuruvattoor', talukId: 'kozhikode', blockName: 'Kunnamangalam', approxLat: 11.318, approxLon: 75.844 },

  // Koyilandy Taluk (24 GPs)
  { id: 'gp_chemancheri', name: 'Chemancheri', talukId: 'koyilandy', blockName: 'Panthalayani', approxLat: 11.4048, approxLon: 75.7236 },
  { id: 'gp_chengottukavu', name: 'Chengottukavu', talukId: 'koyilandy', blockName: 'Panthalayani', approxLat: 11.418, approxLon: 75.708 },
  { id: 'gp_atholi', name: 'Atholi', talukId: 'koyilandy', blockName: 'Panthalayani', approxLat: 11.4253, approxLon: 75.7738 },
  { id: 'gp_ariykkulam', name: 'Arikkulam', talukId: 'koyilandy', blockName: 'Melady', approxLat: 11.472, approxLon: 75.704 },
  { id: 'gp_moodadi', name: 'Moodadi', talukId: 'koyilandy', blockName: 'Panthalayani', approxLat: 11.4629, approxLon: 75.6601 },
  { id: 'gp_thikkodi', name: 'Thikkodi', talukId: 'koyilandy', blockName: 'Melady', approxLat: 11.4952, approxLon: 75.6239 },
  { id: 'gp_keezhariyur', name: 'Keezhariyur', talukId: 'koyilandy', blockName: 'Melady', approxLat: 11.492, approxLon: 75.688 },
  { id: 'gp_thurayur', name: 'Thurayur', talukId: 'koyilandy', blockName: 'Melady', approxLat: 11.522, approxLon: 75.665 },
  { id: 'gp_meppayur', name: 'Meppayur', talukId: 'koyilandy', blockName: 'Melady', approxLat: 11.545, approxLon: 75.688 },
  { id: 'gp_cheruvannur', name: 'Cheruvannur', talukId: 'koyilandy', blockName: 'Perambra', approxLat: 11.556, approxLon: 75.712 },
  { id: 'gp_ulliyeri', name: 'Ulliyeri', talukId: 'koyilandy', blockName: 'Balussery', approxLat: 11.4333, approxLon: 75.7833 },
  { id: 'gp_naduvannur', name: 'Naduvannur', talukId: 'koyilandy', blockName: 'Balussery', approxLat: 11.4833, approxLon: 75.7667 },
  { id: 'gp_kottur', name: 'Kottur', talukId: 'koyilandy', blockName: 'Balussery', approxLat: 11.472, approxLon: 75.815 },
  { id: 'gp_balussery', name: 'Balussery', talukId: 'koyilandy', blockName: 'Balussery', approxLat: 11.45, approxLon: 75.83 },
  { id: 'gp_kayanna', name: 'Kayanna', talukId: 'koyilandy', blockName: 'Perambra', approxLat: 11.522, approxLon: 75.825 },
  { id: 'gp_koorachundu', name: 'Koorachundu', talukId: 'koyilandy', blockName: 'Balussery', approxLat: 11.525, approxLon: 75.875 },
  { id: 'gp_panangad', name: 'Panangad', talukId: 'koyilandy', blockName: 'Balussery', approxLat: 11.445, approxLon: 75.878 },
  { id: 'gp_unnikulam', name: 'Unnikulam', talukId: 'koyilandy', blockName: 'Balussery', approxLat: 11.418, approxLon: 75.862 },
  { id: 'gp_perambra', name: 'Perambra', talukId: 'koyilandy', blockName: 'Perambra', approxLat: 11.5575, approxLon: 75.7605 },
  { id: 'gp_chakkittapara', name: 'Chakkittapara', talukId: 'koyilandy', blockName: 'Perambra', approxLat: 11.592, approxLon: 75.825 },
  { id: 'gp_changaroth', name: 'Changaroth', talukId: 'koyilandy', blockName: 'Perambra', approxLat: 11.585, approxLon: 75.775 },
  { id: 'gp_koothali', name: 'Koothali', talukId: 'koyilandy', blockName: 'Perambra', approxLat: 11.568, approxLon: 75.805 },
  { id: 'gp_nochat', name: 'Nochat', talukId: 'koyilandy', blockName: 'Perambra', approxLat: 11.515, approxLon: 75.752 },

  // Vatakara Taluk (22 GPs)
  { id: 'gp_azhiyur', name: 'Azhiyur', talukId: 'vatakara', blockName: 'Vatakara', approxLat: 11.6833, approxLon: 75.5333 },
  { id: 'gp_chorode', name: 'Chorode', talukId: 'vatakara', blockName: 'Vatakara', approxLat: 11.635, approxLon: 75.572 },
  { id: 'gp_eramala', name: 'Eramala', talukId: 'vatakara', blockName: 'Vatakara', approxLat: 11.662, approxLon: 75.565 },
  { id: 'gp_onchiyam', name: 'Onchiyam', talukId: 'vatakara', blockName: 'Vatakara', approxLat: 11.648, approxLon: 75.552 },
  { id: 'gp_maniyur', name: 'Maniyur', talukId: 'vatakara', blockName: 'Thodannur', approxLat: 11.578, approxLon: 75.635 },
  { id: 'gp_thodannur', name: 'Thodannur', talukId: 'vatakara', blockName: 'Thodannur', approxLat: 11.585, approxLon: 75.612 },
  { id: 'gp_thiruvallur', name: 'Thiruvallur', talukId: 'vatakara', blockName: 'Thodannur', approxLat: 11.592, approxLon: 75.662 },
  { id: 'gp_villiappally', name: 'Villiappally', talukId: 'vatakara', blockName: 'Thodannur', approxLat: 11.608, approxLon: 75.622 },
  { id: 'gp_ayancheri', name: 'Ayancheri', talukId: 'vatakara', blockName: 'Thodannur', approxLat: 11.622, approxLon: 75.668 },
  { id: 'gp_kunnummal', name: 'Kunnummal', talukId: 'vatakara', blockName: 'Kunnummal', approxLat: 11.645, approxLon: 75.702 },
  { id: 'gp_kavilumpara', name: 'Kavilumpara', talukId: 'vatakara', blockName: 'Kunnummal', approxLat: 11.682, approxLon: 75.785 },
  { id: 'gp_kuttiady', name: 'Kuttiady', talukId: 'vatakara', blockName: 'Kunnummal', approxLat: 11.6542, approxLon: 75.7539 },
  { id: 'gp_maruthonkara', name: 'Maruthonkara', talukId: 'vatakara', blockName: 'Kunnummal', approxLat: 11.645, approxLon: 75.815 },
  { id: 'gp_kayakkody', name: 'Kayakkody', talukId: 'vatakara', blockName: 'Kunnummal', approxLat: 11.685, approxLon: 75.735 },
  { id: 'gp_narippatta', name: 'Narippatta', talukId: 'vatakara', blockName: 'Kunnummal', approxLat: 11.715, approxLon: 75.748 },
  { id: 'gp_velom', name: 'Velom', talukId: 'vatakara', blockName: 'Kunnummal', approxLat: 11.622, approxLon: 75.715 },
  { id: 'gp_nadapuram', name: 'Nadapuram', talukId: 'vatakara', blockName: 'Thuneri', approxLat: 11.7, approxLon: 75.6667 },
  { id: 'gp_thuneri', name: 'Thuneri', talukId: 'vatakara', blockName: 'Thuneri', approxLat: 11.6333, approxLon: 75.6167 },
  { id: 'gp_purameri', name: 'Purameri', talukId: 'vatakara', blockName: 'Thuneri', approxLat: 11.6534, approxLon: 75.6613 },
  { id: 'gp_chekkiad', name: 'Chekkiad', talukId: 'vatakara', blockName: 'Thuneri', approxLat: 11.725, approxLon: 75.635 },
  { id: 'gp_edacheri', name: 'Edacheri', talukId: 'vatakara', blockName: 'Thuneri', approxLat: 11.675, approxLon: 75.588 },
  { id: 'gp_valayam', name: 'Valayam', talukId: 'vatakara', blockName: 'Thuneri', approxLat: 11.732, approxLon: 75.685 },
  { id: 'gp_vanimel', name: 'Vanimel', talukId: 'vatakara', blockName: 'Thuneri', approxLat: 11.728, approxLon: 75.715 },

  // Thamarassery Taluk (9 GPs)
  { id: 'gp_thamarassery', name: 'Thamarassery', talukId: 'thamarassery', blockName: 'Koduvally', approxLat: 11.4139, approxLon: 75.9228 },
  { id: 'gp_kizhakkoth', name: 'Kizhakkoth', talukId: 'thamarassery', blockName: 'Koduvally', approxLat: 11.382, approxLon: 75.902 },
  { id: 'gp_omassery', name: 'Omassery', talukId: 'thamarassery', blockName: 'Koduvally', approxLat: 11.3, approxLon: 75.975 },
  { id: 'gp_kattippara', name: 'Kattippara', talukId: 'thamarassery', blockName: 'Koduvally', approxLat: 11.445, approxLon: 75.955 },
  { id: 'gp_puthuppadi', name: 'Puthuppadi', talukId: 'thamarassery', blockName: 'Koduvally', approxLat: 11.4953, approxLon: 75.9837 },
  { id: 'gp_kodenchery', name: 'Kodenchery', talukId: 'thamarassery', blockName: 'Koduvally', approxLat: 11.4719, approxLon: 75.969 },
  { id: 'gp_thiruvambadi', name: 'Thiruvambadi', talukId: 'thamarassery', blockName: 'Koduvally', approxLat: 11.3608, approxLon: 76.0089 },
  { id: 'gp_koodaranji', name: 'Koodaranji', talukId: 'thamarassery', blockName: 'Kunnamangalam', approxLat: 11.345, approxLon: 76.055 },
  { id: 'gp_karassery', name: 'Karassery', talukId: 'thamarassery', blockName: 'Kunnamangalam', approxLat: 11.292, approxLon: 76.012 },
];

export function searchGazetteer(query: string, category?: GazetteerCategory | 'all'): {
  places: GazetteerPlace[];
  panchayats: GramPanchayatEntry[];
} {
  const q = query.trim().toLowerCase();
  const places = KOZHIKODE_GAZETTEER_PLACES.filter((p) => {
    const catOk = !category || category === 'all' || p.category === category;
    if (!catOk) return false;
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.malayalamName.toLowerCase().includes(q) ||
      p.adminUnit.toLowerCase().includes(q) ||
      p.talukId.toLowerCase().includes(q)
    );
  });

  const panchayats = q
    ? KOZHIKODE_GRAM_PANCHAYATS.filter(
        (gp) =>
          gp.name.toLowerCase().includes(q) ||
          gp.blockName.toLowerCase().includes(q) ||
          gp.talukId.toLowerCase().includes(q),
      )
    : [];

  return { places, panchayats };
}
