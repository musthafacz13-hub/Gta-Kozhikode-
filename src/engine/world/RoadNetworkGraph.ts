import {
  geoToWorld,
  worldDistanceToRealKm,
  worldToGeo,
  type GeoCoord,
} from './GeoProjection.ts';
import { KOZHIKODE_GAZETTEER_PLACES } from './KozhikodeGazetteer.ts';

export type HighwayClass =
  | 'NH'
  | 'SH'
  | 'coastal'
  | 'ghat'
  | 'arterial'
  | 'street'
  | 'rural';

export interface RoadGraphNode {
  id: string;
  name: string;
  x: number;
  z: number;
  lat: number;
  lon: number;
}

export interface RoadGraphEdge {
  id: string;
  from: string;
  to: string;
  roadName: string;
  highwayCode: string;
  highwayClass: HighwayClass;
  widthWorld: number;
  speedKmh: number;
  isBridge?: boolean;
  isHairpinGhat?: boolean;
}

export interface RoadNetworkData {
  nodes: Map<string, RoadGraphNode>;
  edges: RoadGraphEdge[];
  adjacency: Map<string, { edge: RoadGraphEdge; neighborId: string; cost: number; distWorld: number }[]>;
}

export interface RoadRouteWaypoint {
  nodeId: string;
  name: string;
  x: number;
  z: number;
  lat: number;
  lon: number;
}

export interface RoadRouteResult {
  waypoints: RoadRouteWaypoint[];
  totalWorldMeters: number;
  realDistanceKm: number;
  estimatedDriveMinutes: number;
  highwaySummary: string[];
}

function makePlaceNode(id: string): RoadGraphNode {
  const place = KOZHIKODE_GAZETTEER_PLACES.find((p) => p.id === id);
  if (!place) {
    throw new Error(`Missing Gazetteer place for road node: ${id}`);
  }
  return {
    id,
    name: place.name,
    x: place.worldX,
    z: place.worldZ,
    lat: place.lat,
    lon: place.lon,
  };
}

function makeGeoNode(id: string, name: string, lat: number, lon: number, override?: { x: number; z: number }): RoadGraphNode {
  const w = override ?? geoToWorld(lat, lon);
  return {
    id,
    name,
    x: Math.round(w.x * 10) / 10,
    z: Math.round(w.z * 10) / 10,
    lat,
    lon,
  };
}

const RAW_NODES: RoadGraphNode[] = [
  // Downtown Mananchira / SM Street / Beach / Palayam / Mavoor / West Hill Grid
  makeGeoNode('j_mananchira_nw', 'Mananchira North-West', 11.2547, 75.7769, { x: -34, z: -35 }),
  makeGeoNode('j_mananchira_ne', 'Mananchira North-East', 11.2547, 75.7831, { x: 34, z: -35 }),
  makeGeoNode('j_mananchira_sw', 'Mananchira South-West', 11.2541, 75.7769, { x: -34, z: 35 }),
  makeGeoNode('j_mananchira_se', 'S.M. Street Entry', 11.2541, 75.7831, { x: 34, z: 35 }),
  makeGeoNode('j_beach_north', 'Kozhikode Beach North', 11.2564, 75.7743, { x: -62, z: -35 }),
  makeGeoNode('j_beach_south', 'Kozhikode Beach South', 11.252, 75.7743, { x: -62, z: 35 }),
  makeGeoNode('j_south_beach_jct', 'South Beach Pier Jct', 11.2435, 75.7743, { x: -62, z: 120 }),
  makeGeoNode('j_kallai_beach', 'Kallai Beach End', 11.2367, 75.7743, { x: -62, z: 195 }),
  makeGeoNode('j_westhill_lane', "West Hill Arjun's Gate", 11.2652, 75.7787, { x: -14, z: -120 }),
  makeGeoNode('j_westhill_beach', 'West Hill Beach Rd', 11.2652, 75.7743, { x: -62, z: -120 }),
  makeGeoNode('j_nadakkavu_east', 'Nadakkavu Cross', 11.2652, 75.7831, { x: 34, z: -120 }),
  makeGeoNode('j_palayam_jct', 'Palayam Junction', 11.2486, 75.7839, { x: 120, z: 120 }),
  makeGeoNode('j_mavoor_link', 'Mavoor Rd Link', 11.2575, 75.791, { x: 120, z: -35 }),
  makeGeoNode('j_railway_st', 'Kozhikode Railway Stn Rd', 11.2465, 75.7805, { x: 34, z: 195 }),
  makeGeoNode('j_kallai_city', 'Kallai City Link', 11.2367, 75.791, { x: 120, z: 195 }),
  makeGeoNode('j_puthiyangadi', 'Puthiyangadi Junction', 11.305, 75.758),

  // Place-anchored District Towns, Bridges, Beaches & Highlands
  makePlaceNode('nadakkavu'),
  makePlaceNode('west_hill_town'),
  makePlaceNode('kallai_bridge'),
  makePlaceNode('thondayad'),
  makePlaceNode('medical_college'),
  makePlaceNode('vellimadukunnu'),
  makePlaceNode('elathur'),
  makePlaceNode('beypore_harbour'),
  makePlaceNode('feroke'),
  makePlaceNode('ramanattukara'),
  makePlaceNode('pantheerankavu'),
  makePlaceNode('olavanna'),
  makePlaceNode('perumanna'),
  makePlaceNode('mavoor'),
  makePlaceNode('kunnamangalam'),
  makePlaceNode('kakkodi'),
  makePlaceNode('chelannur'),
  makePlaceNode('narikkuni'),
  makePlaceNode('kappad'),
  makePlaceNode('chemancheri'),
  makePlaceNode('koyilandy'),
  makePlaceNode('moodadi'),
  makePlaceNode('thikkodi'),
  makePlaceNode('payyoli'),
  makePlaceNode('atholi'),
  makePlaceNode('ulliyeri'),
  makePlaceNode('naduvannur'),
  makePlaceNode('balussery'),
  makePlaceNode('perambra'),
  makePlaceNode('vatakara'),
  makePlaceNode('moorad_bridge'),
  makePlaceNode('azhiyur'),
  makePlaceNode('thuneri'),
  makePlaceNode('purameri'),
  makePlaceNode('nadapuram'),
  makePlaceNode('kuttiady'),
  makePlaceNode('koduvally'),
  makePlaceNode('thamarassery'),
  makePlaceNode('omassery'),
  makePlaceNode('mukkam'),
  makePlaceNode('thiruvambadi'),
  makePlaceNode('kodenchery'),
  makePlaceNode('puthuppadi'),
  makePlaceNode('thamarassery_churam'),
  makePlaceNode('thusharagiri'),
  makePlaceNode('kakkayam_dam'),
];

interface EdgeDef {
  from: string;
  to: string;
  roadName: string;
  highwayCode: string;
  highwayClass: HighwayClass;
  widthWorld: number;
  speedKmh: number;
  isBridge?: boolean;
  isHairpinGhat?: boolean;
}

const RAW_EDGES: EdgeDef[] = [
  // Core Urban Grid
  { from: 'j_westhill_beach', to: 'j_beach_north', roadName: 'Beach Road', highwayCode: 'Coastal Rd', highwayClass: 'coastal', widthWorld: 11, speedKmh: 45 },
  { from: 'j_beach_north', to: 'j_beach_south', roadName: 'Kozhikode Beach Promenade Rd', highwayCode: 'Coastal Rd', highwayClass: 'coastal', widthWorld: 11, speedKmh: 40 },
  { from: 'j_beach_south', to: 'j_south_beach_jct', roadName: 'South Beach Road', highwayCode: 'Coastal Rd', highwayClass: 'coastal', widthWorld: 11, speedKmh: 45 },
  { from: 'j_south_beach_jct', to: 'j_kallai_beach', roadName: 'Kallai Coast Rd', highwayCode: 'Coastal Rd', highwayClass: 'coastal', widthWorld: 11, speedKmh: 45 },
  { from: 'j_westhill_beach', to: 'j_westhill_lane', roadName: 'West Hill Homestead Rd', highwayCode: 'City Street', highwayClass: 'street', widthWorld: 10, speedKmh: 35 },
  { from: 'j_westhill_lane', to: 'j_nadakkavu_east', roadName: 'West Hill East Rd', highwayCode: 'City Street', highwayClass: 'street', widthWorld: 10, speedKmh: 40 },
  { from: 'j_beach_north', to: 'j_mananchira_nw', roadName: 'Mavoor / Beach Connector', highwayCode: 'City Arterial', highwayClass: 'arterial', widthWorld: 12, speedKmh: 40 },
  { from: 'j_mananchira_nw', to: 'j_mananchira_ne', roadName: 'Mavoor Road West', highwayCode: 'Mavoor Rd', highwayClass: 'arterial', widthWorld: 12, speedKmh: 45 },
  { from: 'j_mananchira_ne', to: 'j_mavoor_link', roadName: 'Mavoor Road', highwayCode: 'Mavoor Rd', highwayClass: 'arterial', widthWorld: 13, speedKmh: 50 },
  { from: 'j_beach_south', to: 'j_mananchira_sw', roadName: 'Mananchira South Rd', highwayCode: 'City Street', highwayClass: 'street', widthWorld: 11, speedKmh: 40 },
  { from: 'j_mananchira_sw', to: 'j_mananchira_se', roadName: 'S.M. Street North Gate', highwayCode: 'City Street', highwayClass: 'street', widthWorld: 11, speedKmh: 30 },
  { from: 'j_mananchira_nw', to: 'j_mananchira_sw', roadName: 'Mananchira West Rd', highwayCode: 'City Street', highwayClass: 'street', widthWorld: 12, speedKmh: 35 },
  { from: 'j_mananchira_ne', to: 'j_mananchira_se', roadName: 'Palayam-SM Ave', highwayCode: 'City Arterial', highwayClass: 'arterial', widthWorld: 13, speedKmh: 40 },
  { from: 'j_nadakkavu_east', to: 'j_mananchira_ne', roadName: 'Kannur Road Urban', highwayCode: 'City Arterial', highwayClass: 'arterial', widthWorld: 13, speedKmh: 45 },
  { from: 'j_mananchira_se', to: 'j_railway_st', roadName: 'Railway Station Link', highwayCode: 'City Arterial', highwayClass: 'arterial', widthWorld: 13, speedKmh: 40 },
  { from: 'j_mavoor_link', to: 'j_palayam_jct', roadName: 'Palayam-Mavoor Bypass Link', highwayCode: 'City Arterial', highwayClass: 'arterial', widthWorld: 13, speedKmh: 50 },
  { from: 'j_palayam_jct', to: 'j_kallai_city', roadName: 'Palayam-Kallai Rd', highwayCode: 'City Arterial', highwayClass: 'arterial', widthWorld: 13, speedKmh: 50 },
  { from: 'j_south_beach_jct', to: 'j_palayam_jct', roadName: 'Palayam Market Link', highwayCode: 'City Arterial', highwayClass: 'arterial', widthWorld: 12, speedKmh: 40 },
  { from: 'j_kallai_beach', to: 'j_railway_st', roadName: 'Kallai-Station Rd', highwayCode: 'City Arterial', highwayClass: 'arterial', widthWorld: 12, speedKmh: 45 },
  { from: 'j_railway_st', to: 'j_kallai_city', roadName: 'Kallai Road', highwayCode: 'City Arterial', highwayClass: 'arterial', widthWorld: 12, speedKmh: 50 },

  // Coastal Corridor North & South (Beach Rd -> Nadakkavu -> West Hill -> Elathur / Beypore)
  { from: 'j_westhill_beach', to: 'west_hill_town', roadName: 'Kannur Road (West Hill)', highwayCode: 'NH-66 Old', highwayClass: 'arterial', widthWorld: 13, speedKmh: 55 },
  { from: 'j_nadakkavu_east', to: 'nadakkavu', roadName: 'Nadakkavu Cross Kannur Rd', highwayCode: 'City Arterial', highwayClass: 'arterial', widthWorld: 13, speedKmh: 48 },
  { from: 'nadakkavu', to: 'west_hill_town', roadName: 'Nadakkavu-West Hill Kannur Rd', highwayCode: 'City Arterial', highwayClass: 'arterial', widthWorld: 13, speedKmh: 55 },
  { from: 'west_hill_town', to: 'j_puthiyangadi', roadName: 'Kannur Road (Puthiyangadi)', highwayCode: 'NH-66 Old', highwayClass: 'arterial', widthWorld: 13, speedKmh: 60 },
  { from: 'j_puthiyangadi', to: 'elathur', roadName: 'Elathur-Korapuzha Approach', highwayCode: 'NH-66', highwayClass: 'NH', widthWorld: 16, speedKmh: 75, isBridge: true },
  { from: 'j_kallai_beach', to: 'beypore_harbour', roadName: 'Beypore Coastal Highway', highwayCode: 'Coastal Rd', highwayClass: 'coastal', widthWorld: 12, speedKmh: 55 },
  { from: 'j_kallai_city', to: 'kallai_bridge', roadName: 'Kallai Timber Bridge Rd', highwayCode: 'NH-66 City', highwayClass: 'NH', widthWorld: 15, speedKmh: 60, isBridge: true },
  { from: 'kallai_bridge', to: 'feroke', roadName: 'Meenchanda-Feroke NH-66', highwayCode: 'NH-66', highwayClass: 'NH', widthWorld: 16, speedKmh: 75, isBridge: true },
  { from: 'beypore_harbour', to: 'feroke', roadName: 'Beypore-Feroke Port Rd', highwayCode: 'Coastal Rd', highwayClass: 'coastal', widthWorld: 12, speedKmh: 55 },

  // NH-66 Kozhikode Bypass & Southern Hub
  { from: 'feroke', to: 'ramanattukara', roadName: 'Feroke-Ramanattukara Link', highwayCode: 'NH-66', highwayClass: 'NH', widthWorld: 18, speedKmh: 85 },
  { from: 'ramanattukara', to: 'pantheerankavu', roadName: 'Kozhikode Bypass (NH-66)', highwayCode: 'NH-66', highwayClass: 'NH', widthWorld: 18, speedKmh: 90 },
  { from: 'pantheerankavu', to: 'olavanna', roadName: 'Pantheerankavu-Olavanna Bypass', highwayCode: 'NH-66', highwayClass: 'NH', widthWorld: 16, speedKmh: 80 },
  { from: 'j_kallai_city', to: 'pantheerankavu', roadName: 'Mankavu-Pantheerankavu Rd', highwayCode: 'City Arterial', highwayClass: 'arterial', widthWorld: 13, speedKmh: 60 },
  { from: 'olavanna', to: 'thondayad', roadName: 'Kozhikode Bypass East', highwayCode: 'NH-66', highwayClass: 'NH', widthWorld: 18, speedKmh: 90 },
  { from: 'j_mavoor_link', to: 'thondayad', roadName: 'Mavoor-Thondayad Bypass Flyover', highwayCode: 'City Arterial', highwayClass: 'arterial', widthWorld: 15, speedKmh: 65 },
  { from: 'thondayad', to: 'vellimadukunnu', roadName: 'Bypass-Vellimadukunnu Link', highwayCode: 'NH-66 / NH-766', highwayClass: 'NH', widthWorld: 16, speedKmh: 75 },
  { from: 'vellimadukunnu', to: 'elathur', roadName: 'Vengalam-Elathur Bypass', highwayCode: 'NH-66', highwayClass: 'NH', widthWorld: 18, speedKmh: 90 },

  // NH-66 Northern Coastal Spine (Elathur -> Koyilandy -> Payyoli -> Vatakara -> Azhiyur)
  { from: 'elathur', to: 'chemancheri', roadName: 'NH-66 Korapuzha-Chemancheri', highwayCode: 'NH-66', highwayClass: 'NH', widthWorld: 18, speedKmh: 85 },
  { from: 'chemancheri', to: 'kappad', roadName: 'Kappad Beach Access Rd', highwayCode: 'Coastal Rd', highwayClass: 'coastal', widthWorld: 11, speedKmh: 50 },
  { from: 'chemancheri', to: 'koyilandy', roadName: 'NH-66 Koyilandy Approach', highwayCode: 'NH-66', highwayClass: 'NH', widthWorld: 18, speedKmh: 85 },
  { from: 'kappad', to: 'koyilandy', roadName: 'Kappad-Koyilandy Coastal Rd', highwayCode: 'Coastal Rd', highwayClass: 'coastal', widthWorld: 11, speedKmh: 50 },
  { from: 'koyilandy', to: 'moodadi', roadName: 'NH-66 Moodadi Coast', highwayCode: 'NH-66', highwayClass: 'NH', widthWorld: 18, speedKmh: 85 },
  { from: 'moodadi', to: 'thikkodi', roadName: 'NH-66 Thikkodi Coast', highwayCode: 'NH-66', highwayClass: 'NH', widthWorld: 18, speedKmh: 85 },
  { from: 'thikkodi', to: 'payyoli', roadName: 'NH-66 Payyoli Stretch', highwayCode: 'NH-66', highwayClass: 'NH', widthWorld: 18, speedKmh: 85 },
  { from: 'payyoli', to: 'moorad_bridge', roadName: 'Moorad Bridge Approach', highwayCode: 'NH-66', highwayClass: 'NH', widthWorld: 18, speedKmh: 80, isBridge: true },
  { from: 'moorad_bridge', to: 'vatakara', roadName: 'NH-66 Vatakara South', highwayCode: 'NH-66', highwayClass: 'NH', widthWorld: 18, speedKmh: 85 },
  { from: 'vatakara', to: 'azhiyur', roadName: 'NH-66 Azhiyur-Mahe Border', highwayCode: 'NH-66', highwayClass: 'NH', widthWorld: 18, speedKmh: 85 },

  // NH-766 Malabar-Wayanad Highland Spine (Thondayad -> Kunnamangalam -> Koduvally -> Thamarassery -> Churam)
  { from: 'thondayad', to: 'medical_college', roadName: 'Medical College Rd', highwayCode: 'NH-766', highwayClass: 'NH', widthWorld: 15, speedKmh: 65 },
  { from: 'medical_college', to: 'kunnamangalam', roadName: 'NH-766 Kunnamangalam Corridor', highwayCode: 'NH-766', highwayClass: 'NH', widthWorld: 16, speedKmh: 75 },
  { from: 'vellimadukunnu', to: 'kunnamangalam', roadName: 'Vellimadukunnu-Kunnamangalam NH-766', highwayCode: 'NH-766', highwayClass: 'NH', widthWorld: 16, speedKmh: 75 },
  { from: 'kunnamangalam', to: 'koduvally', roadName: 'NH-766 Koduvally Highway', highwayCode: 'NH-766', highwayClass: 'NH', widthWorld: 16, speedKmh: 75 },
  { from: 'koduvally', to: 'thamarassery', roadName: 'NH-766 Thamarassery Highway', highwayCode: 'NH-766', highwayClass: 'NH', widthWorld: 16, speedKmh: 75 },
  { from: 'thamarassery', to: 'puthuppadi', roadName: 'NH-766 Adivaram Foothills', highwayCode: 'NH-766', highwayClass: 'NH', widthWorld: 15, speedKmh: 65 },
  { from: 'puthuppadi', to: 'thamarassery_churam', roadName: 'Thamarassery Churam 9-Hairpin Ghat', highwayCode: 'NH-766 Ghat', highwayClass: 'ghat', widthWorld: 13, speedKmh: 40, isHairpinGhat: true },

  // SH-34 Midland-Highland Traverse (Koyilandy -> Ulliyeri -> Balussery -> Thamarassery -> Omassery -> Mukkam)
  { from: 'koyilandy', to: 'atholi', roadName: 'Koyilandy-Atholi Rd', highwayCode: 'SH-34', highwayClass: 'SH', widthWorld: 13, speedKmh: 60 },
  { from: 'atholi', to: 'ulliyeri', roadName: 'Atholi-Ulliyeri Link', highwayCode: 'SH-34', highwayClass: 'SH', widthWorld: 13, speedKmh: 60 },
  { from: 'ulliyeri', to: 'balussery', roadName: 'Ulliyeri-Balussery Highway', highwayCode: 'SH-34', highwayClass: 'SH', widthWorld: 14, speedKmh: 65 },
  { from: 'balussery', to: 'thamarassery', roadName: 'Balussery-Thamarassery SH-34', highwayCode: 'SH-34', highwayClass: 'SH', widthWorld: 14, speedKmh: 65 },
  { from: 'thamarassery', to: 'omassery', roadName: 'Thamarassery-Omassery SH-34', highwayCode: 'SH-34', highwayClass: 'SH', widthWorld: 14, speedKmh: 65 },
  { from: 'omassery', to: 'mukkam', roadName: 'Omassery-Mukkam Rd', highwayCode: 'SH-34', highwayClass: 'SH', widthWorld: 14, speedKmh: 65 },
  { from: 'mukkam', to: 'thiruvambadi', roadName: 'Mukkam-Thiruvambadi Estate Rd', highwayCode: 'Highland Rd', highwayClass: 'SH', widthWorld: 12, speedKmh: 55 },
  { from: 'thiruvambadi', to: 'kodenchery', roadName: 'Thiruvambadi-Kodenchery Hill Rd', highwayCode: 'Highland Rd', highwayClass: 'rural', widthWorld: 11, speedKmh: 45 },
  { from: 'kodenchery', to: 'thusharagiri', roadName: 'Thusharagiri Waterfall Ghat Spur', highwayCode: 'Ghat Spur', highwayClass: 'ghat', widthWorld: 10, speedKmh: 38, isHairpinGhat: true },
  { from: 'kodenchery', to: 'puthuppadi', roadName: 'Kodenchery-Adivaram Link', highwayCode: 'Hill Link', highwayClass: 'rural', widthWorld: 10, speedKmh: 45 },

  // SH-38 Northern Rural Valley, Kakkayam Dam & Vatakara Inland
  { from: 'j_puthiyangadi', to: 'kakkodi', roadName: 'Puthiyangadi-Kakkodi Rd', highwayCode: 'SH-38', highwayClass: 'SH', widthWorld: 13, speedKmh: 60 },
  { from: 'kakkodi', to: 'chelannur', roadName: 'Kakkodi-Chelannur SH-38', highwayCode: 'SH-38', highwayClass: 'SH', widthWorld: 13, speedKmh: 60 },
  { from: 'chelannur', to: 'atholi', roadName: 'Chelannur-Atholi Rd', highwayCode: 'SH-38', highwayClass: 'SH', widthWorld: 13, speedKmh: 60 },
  { from: 'ulliyeri', to: 'naduvannur', roadName: 'Ulliyeri-Naduvannur SH-38', highwayCode: 'SH-38', highwayClass: 'SH', widthWorld: 13, speedKmh: 60 },
  { from: 'naduvannur', to: 'perambra', roadName: 'Naduvannur-Perambra SH-38', highwayCode: 'SH-38', highwayClass: 'SH', widthWorld: 14, speedKmh: 65 },
  { from: 'perambra', to: 'payyoli', roadName: 'Perambra-Payyoli Link', highwayCode: 'MDR', highwayClass: 'rural', widthWorld: 12, speedKmh: 55 },
  { from: 'perambra', to: 'kakkayam_dam', roadName: 'Kakkayam Forest Dam Road', highwayCode: 'Ghat Spur', highwayClass: 'ghat', widthWorld: 10, speedKmh: 38, isHairpinGhat: true },
  { from: 'perambra', to: 'kuttiady', roadName: 'Perambra-Kuttiady SH-38', highwayCode: 'SH-38', highwayClass: 'SH', widthWorld: 14, speedKmh: 60 },
  { from: 'kuttiady', to: 'nadapuram', roadName: 'Kuttiady-Nadapuram Rd', highwayCode: 'SH-38', highwayClass: 'SH', widthWorld: 13, speedKmh: 60 },
  { from: 'nadapuram', to: 'purameri', roadName: 'Nadapuram-Purameri Rd', highwayCode: 'SH-38', highwayClass: 'SH', widthWorld: 12, speedKmh: 55 },
  { from: 'purameri', to: 'thuneri', roadName: 'Purameri-Thuneri Rd', highwayCode: 'MDR', highwayClass: 'rural', widthWorld: 12, speedKmh: 55 },
  { from: 'thuneri', to: 'vatakara', roadName: 'Vatakara-Thuneri Rd', highwayCode: 'MDR', highwayClass: 'rural', widthWorld: 13, speedKmh: 60 },

  // Cross-Midland Connectors (Narikkuni, Mavoor, Perumanna)
  { from: 'kunnamangalam', to: 'narikkuni', roadName: 'Kunnamangalam-Narikkuni Rd', highwayCode: 'MDR', highwayClass: 'rural', widthWorld: 12, speedKmh: 55 },
  { from: 'narikkuni', to: 'balussery', roadName: 'Narikkuni-Balussery Rd', highwayCode: 'MDR', highwayClass: 'rural', widthWorld: 12, speedKmh: 55 },
  { from: 'medical_college', to: 'perumanna', roadName: 'Medical College-Perumanna Rd', highwayCode: 'MDR', highwayClass: 'rural', widthWorld: 12, speedKmh: 55 },
  { from: 'perumanna', to: 'olavanna', roadName: 'Perumanna-Olavanna Rd', highwayCode: 'MDR', highwayClass: 'rural', widthWorld: 12, speedKmh: 55 },
  { from: 'perumanna', to: 'mavoor', roadName: 'Perumanna-Mavoor Chaliyar Rd', highwayCode: 'MDR', highwayClass: 'rural', widthWorld: 12, speedKmh: 55 },
  { from: 'mavoor', to: 'mukkam', roadName: 'Mavoor-Mukkam River Rd', highwayCode: 'MDR', highwayClass: 'rural', widthWorld: 12, speedKmh: 55 },
  { from: 'ramanattukara', to: 'perumanna', roadName: 'Ramanattukara-Perumanna Rd', highwayCode: 'MDR', highwayClass: 'rural', widthWorld: 12, speedKmh: 55 },
];

export function buildRoadNetwork(
  customNodes: RoadGraphNode[] = RAW_NODES,
  customEdges: EdgeDef[] = RAW_EDGES,
): RoadNetworkData {
  const nodes = new Map<string, RoadGraphNode>();
  const adjacency = new Map<string, { edge: RoadGraphEdge; neighborId: string; cost: number; distWorld: number }[]>();

  for (const n of customNodes) {
    nodes.set(n.id, n);
    adjacency.set(n.id, []);
  }

  const edges: RoadGraphEdge[] = [];
  for (let i = 0; i < customEdges.length; i++) {
    const def = customEdges[i];
    const a = nodes.get(def.from);
    const b = nodes.get(def.to);
    if (!a || !b) {
      throw new Error(`Invalid road edge ${def.from} -> ${def.to}`);
    }
    const edge: RoadGraphEdge = {
      id: `edge_${i}_${def.from}_${def.to}`,
      ...def,
    };
    edges.push(edge);

    const distWorld = Math.hypot(b.x - a.x, b.z - a.z);
    // Travel time heuristic weighting highways slightly faster than narrow rural lanes
    const cost = distWorld / Math.max(10, def.speedKmh);
    adjacency.get(def.from)!.push({ edge, neighborId: def.to, cost, distWorld });
    adjacency.get(def.to)!.push({ edge, neighborId: def.from, cost, distWorld });
  }

  return { nodes, edges, adjacency };
}

export const KOZHIKODE_ROAD_NETWORK: RoadNetworkData = buildRoadNetwork();

export function findNearestRoadNode(
  x: number,
  z: number,
  network: RoadNetworkData = KOZHIKODE_ROAD_NETWORK,
): RoadGraphNode | null {
  let best: RoadGraphNode | null = null;
  let bestDistSq = Infinity;
  for (const node of network.nodes.values()) {
    const dSq = (node.x - x) ** 2 + (node.z - z) ** 2;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      best = node;
    }
  }
  return best;
}

/**
 * Multi-hop A* shortest-path road router over connected Kozhikode District road graph.
 * Returns null if origin and destination are disconnected — never produces fake straight-line routes.
 */
export function findRoadRoute(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  network: RoadNetworkData = KOZHIKODE_ROAD_NETWORK,
): RoadRouteResult | null {
  const startNode = findNearestRoadNode(fromX, fromZ, network);
  const goalNode = findNearestRoadNode(toX, toZ, network);
  if (!startNode || !goalNode) return null;

  const openSet = new Set<string>([startNode.id]);
  const cameFrom = new Map<string, { prevId: string; edge: RoadGraphEdge; distWorld: number }>();
  const gScore = new Map<string, number>([[startNode.id, 0]]);
  const fScore = new Map<string, number>([
    [startNode.id, Math.hypot(goalNode.x - startNode.x, goalNode.z - startNode.z) / 90],
  ]);

  while (openSet.size > 0) {
    let currentId: string | null = null;
    let lowestF = Infinity;
    for (const id of openSet) {
      const f = fScore.get(id) ?? Infinity;
      if (f < lowestF) {
        lowestF = f;
        currentId = id;
      }
    }
    if (!currentId) break;
    if (currentId === goalNode.id) {
      const pathNodes: RoadGraphNode[] = [];
      const edgesUsed: RoadGraphEdge[] = [];
      let totalEdgeDist = 0;

      let cursor: string | undefined = currentId;
      while (cursor) {
        const node = network.nodes.get(cursor)!;
        pathNodes.push(node);
        const link = cameFrom.get(cursor);
        if (!link) break;
        edgesUsed.push(link.edge);
        totalEdgeDist += link.distWorld;
        cursor = link.prevId;
      }

      pathNodes.reverse();
      edgesUsed.reverse();

      const startGeo = worldToGeo(fromX, fromZ);
      const endGeo = worldToGeo(toX, toZ);
      const entryDist = Math.hypot(startNode.x - fromX, startNode.z - fromZ);
      const exitDist = Math.hypot(toX - goalNode.x, toZ - goalNode.z);
      const totalWorldMeters = entryDist + totalEdgeDist + exitDist;
      const realDistanceKm = worldDistanceToRealKm(totalWorldMeters);

      // Sum weighted drive time across segments (in minutes)
      let totalMinutes = (worldDistanceToRealKm(entryDist + exitDist) / 35) * 60;
      const highwaySet: string[] = [];
      for (let i = 0; i < edgesUsed.length; i++) {
        const e = edgesUsed[i];
        const a = pathNodes[i];
        const b = pathNodes[i + 1];
        const segKm = worldDistanceToRealKm(Math.hypot(b.x - a.x, b.z - a.z));
        totalMinutes += (segKm / Math.max(15, e.speedKmh)) * 60;
        if (!highwaySet.includes(e.highwayCode)) {
          highwaySet.push(e.highwayCode);
        }
      }

      const waypoints: RoadRouteWaypoint[] = [];
      if (entryDist > 4) {
        waypoints.push({
          nodeId: 'origin',
          name: 'Current Position',
          x: fromX,
          z: fromZ,
          lat: startGeo.lat,
          lon: startGeo.lon,
        });
      }
      for (const n of pathNodes) {
        waypoints.push({
          nodeId: n.id,
          name: n.name,
          x: n.x,
          z: n.z,
          lat: n.lat,
          lon: n.lon,
        });
      }
      if (exitDist > 4) {
        waypoints.push({
          nodeId: 'destination',
          name: 'Destination',
          x: toX,
          z: toZ,
          lat: endGeo.lat,
          lon: endGeo.lon,
        });
      }

      return {
        waypoints,
        totalWorldMeters: Math.round(totalWorldMeters),
        realDistanceKm: Number(realDistanceKm.toFixed(2)),
        estimatedDriveMinutes: Math.max(1, Math.round(totalMinutes)),
        highwaySummary: highwaySet.length > 0 ? highwaySet : ['Local Street'],
      };
    }

    openSet.delete(currentId);
    const neighbors = network.adjacency.get(currentId) ?? [];
    for (const next of neighbors) {
      const tentativeG = (gScore.get(currentId) ?? Infinity) + next.cost;
      if (tentativeG < (gScore.get(next.neighborId) ?? Infinity)) {
        const neighborNode = network.nodes.get(next.neighborId)!;
        cameFrom.set(next.neighborId, {
          prevId: currentId,
          edge: next.edge,
          distWorld: next.distWorld,
        });
        gScore.set(next.neighborId, tentativeG);
        const h = Math.hypot(goalNode.x - neighborNode.x, goalNode.z - neighborNode.z) / 90;
        fScore.set(next.neighborId, tentativeG + h);
        openSet.add(next.neighborId);
      }
    }
  }

  return null;
}

/**
 * Helper to check minimum distance from point (px, pz) to segment AB.
 */
export function distanceToRoadSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const vx = bx - ax;
  const vz = bz - az;
  const lenSq = vx * vx + vz * vz;
  if (lenSq < 1e-6) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / lenSq));
  const projX = ax + t * vx;
  const projZ = az + t * vz;
  return Math.hypot(px - projX, pz - projZ);
}

export function isPointOnDistrictRoad(
  x: number,
  z: number,
  network: RoadNetworkData = KOZHIKODE_ROAD_NETWORK,
): { onRoad: boolean; edge: RoadGraphEdge | null } {
  for (const edge of network.edges) {
    const a = network.nodes.get(edge.from);
    const b = network.nodes.get(edge.to);
    if (!a || !b) continue;
    const minX = Math.min(a.x, b.x) - edge.widthWorld;
    const maxX = Math.max(a.x, b.x) + edge.widthWorld;
    const minZ = Math.min(a.z, b.z) - edge.widthWorld;
    const maxZ = Math.max(a.z, b.z) + edge.widthWorld;
    if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
    const d = distanceToRoadSegment(x, z, a.x, a.z, b.x, b.z);
    if (d <= edge.widthWorld * 0.5 + 0.4) {
      return { onRoad: true, edge };
    }
  }
  return { onRoad: false, edge: null };
}

export function getEdgeGeoPath(edge: RoadGraphEdge, network: RoadNetworkData = KOZHIKODE_ROAD_NETWORK): GeoCoord[] {
  const a = network.nodes.get(edge.from);
  const b = network.nodes.get(edge.to);
  if (!a || !b) return [];
  return [
    { lat: a.lat, lon: a.lon },
    { lat: b.lat, lon: b.lon },
  ];
}
