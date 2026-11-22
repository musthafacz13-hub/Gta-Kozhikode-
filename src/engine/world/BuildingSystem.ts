import * as THREE from 'three';
import type { StaticAabbCollider } from '../player/PlayerController.ts';
import type { MaterialLibrary } from '../rendering/MaterialLibrary.ts';
import { worldToGeo } from './GeoProjection.ts';
import { createFoodModel } from './KeralaFoodModels.ts';
import { createKeralaNpcRig } from './KeralaNpcRig.ts';
import {
  buildRestaurantGroundInterior,
  resolveRestaurantCategoryForBuilding,
  type AnimatedRestaurantInstance,
} from './RestaurantInteriorFactory.ts';

export type ResidentialBuildingArchetype =
  | 'kerala_traditional'
  | 'modern_kerala_home'
  | 'small_apartment'
  | 'residential_villa'
  | 'older_house'
  | 'mixed_residential';

export type CommercialBuildingArchetype =
  | 'local_shop'
  | 'restaurant'
  | 'bakery'
  | 'supermarket'
  | 'mobile_shop'
  | 'clothing_store'
  | 'pharmacy'
  | 'hotel'
  | 'office'
  | 'shopping_complex';

export type InfrastructureBuildingArchetype =
  | 'bus_station'
  | 'railway_building'
  | 'public_building'
  | 'school'
  | 'hospital'
  | 'government_building'
  | 'parking_structure';

export type BuildingArchetype =
  | ResidentialBuildingArchetype
  | CommercialBuildingArchetype
  | InfrastructureBuildingArchetype;

export type BuildingCategory = 'residential' | 'commercial' | 'infrastructure';

export type BuildingOwnershipStatus =
  | 'protagonist_home'
  | 'public'
  | 'private_commercial'
  | 'private_residential'
  | 'purchasable_future';

export interface RegisteredBuildingRecord {
  id: string;
  name: string;
  malayalamName: string;
  districtId: string;
  category: BuildingCategory;
  archetype: BuildingArchetype;
  lat: number;
  lon: number;
  worldX: number;
  worldZ: number;
  rotY: number;
  collider: StaticAabbCollider;
  interactionPoint: { x: number; y: number; z: number };
  entryPoint: { x: number; y: number; z: number };
  ownershipStatus: BuildingOwnershipStatus;
  interiorEligible: boolean;
  futureHooks: {
    businessTag?: string;
    propertyPurchaseTag?: string;
    missionTag?: string;
  };
}

export interface ProceduralBuildingSpec {
  id: string;
  districtId: string;
  archetype: BuildingArchetype;
  x: number;
  y?: number;
  z: number;
  rotY: number;
  width: number;
  depth: number;
  floors: number;
  malayalam: string;
  english: string;
  facadeStyle?: 'warm' | 'cream' | 'teal' | 'apartment' | 'hospital' | 'office';
  stuccoTone?: 'cream' | 'warm' | 'mint' | 'ochre' | 'slate';
  awningColor?: number;
  signBg?: string;
  signFg?: string;
  hasSlopedRoof?: boolean;
  hasBalcony?: boolean;
  hasAcUnits?: boolean;
  hasWaterTank?: boolean;
  withCompoundWall?: boolean;
  ownershipStatus?: BuildingOwnershipStatus;
  interiorEligible?: boolean;
  businessTag?: string;
  propertyPurchaseTag?: string;
  missionTag?: string;
}

export interface SharedBuildingGeometries {
  unitBox: THREE.BoxGeometry;
  unitCylinder: THREE.CylinderGeometry;
  unitHipCone: THREE.ConeGeometry;
  unitPlane: THREE.PlaneGeometry;
}

let cachedSharedGeos: SharedBuildingGeometries | null = null;

export function getSharedBuildingGeometries(): SharedBuildingGeometries {
  if (!cachedSharedGeos) {
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const unitCylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
    const unitHipCone = new THREE.ConeGeometry(0.72, 1, 4);
    unitHipCone.rotateY(Math.PI / 4);
    const unitPlane = new THREE.PlaneGeometry(1, 1);

    for (const g of [unitBox, unitCylinder, unitHipCone, unitPlane]) {
      g.userData.shared = true;
    }
    cachedSharedGeos = { unitBox, unitCylinder, unitHipCone, unitPlane };
  }
  return cachedSharedGeos;
}

export const ALL_BUILDING_ARCHETYPES: readonly BuildingArchetype[] = [
  'kerala_traditional',
  'modern_kerala_home',
  'small_apartment',
  'residential_villa',
  'older_house',
  'mixed_residential',
  'local_shop',
  'restaurant',
  'bakery',
  'supermarket',
  'mobile_shop',
  'clothing_store',
  'pharmacy',
  'hotel',
  'office',
  'shopping_complex',
  'bus_station',
  'railway_building',
  'public_building',
  'school',
  'hospital',
  'government_building',
  'parking_structure',
] as const;

export function classifyBuildingCategory(archetype: BuildingArchetype): BuildingCategory {
  switch (archetype) {
    case 'kerala_traditional':
    case 'modern_kerala_home':
    case 'small_apartment':
    case 'residential_villa':
    case 'older_house':
    case 'mixed_residential':
      return 'residential';
    case 'bus_station':
    case 'railway_building':
    case 'public_building':
    case 'school':
    case 'hospital':
    case 'government_building':
    case 'parking_structure':
      return 'infrastructure';
    default:
      return 'commercial';
  }
}

function defaultInteriorEligibility(archetype: BuildingArchetype): boolean {
  return (
    archetype === 'kerala_traditional' ||
    archetype === 'restaurant' ||
    archetype === 'bakery' ||
    archetype === 'supermarket' ||
    archetype === 'clothing_store' ||
    archetype === 'pharmacy' ||
    archetype === 'hotel' ||
    archetype === 'shopping_complex' ||
    archetype === 'railway_building' ||
    archetype === 'hospital' ||
    archetype === 'public_building'
  );
}

function resolveFacadeMaterial(
  spec: ProceduralBuildingSpec,
  mats: MaterialLibrary,
): THREE.MeshStandardMaterial {
  if (spec.facadeStyle === 'hospital' || spec.archetype === 'hospital') return mats.facadeHospitalMat;
  if (spec.facadeStyle === 'office' || spec.archetype === 'office' || spec.archetype === 'shopping_complex') {
    return mats.facadeOfficeMat;
  }
  if (spec.facadeStyle === 'apartment' || spec.archetype === 'small_apartment' || spec.archetype === 'mixed_residential') {
    return mats.facadeApartmentMat;
  }
  if (spec.facadeStyle === 'teal') return mats.facadeTealMat;
  if (spec.facadeStyle === 'warm') return mats.facadeWarmMat;
  if (spec.facadeStyle === 'cream') return mats.facadeCreamMat;

  if (spec.archetype === 'pharmacy' || spec.archetype === 'mobile_shop') return mats.facadeTealMat;
  if (spec.archetype === 'hotel' || spec.archetype === 'government_building' || spec.archetype === 'school') {
    return mats.facadeCreamMat;
  }
  return mats.facadeWarmMat;
}

function resolveStuccoMaterial(
  tone: ProceduralBuildingSpec['stuccoTone'],
  mats: MaterialLibrary,
): THREE.MeshStandardMaterial {
  switch (tone) {
    case 'warm':
      return mats.stuccoWarmMat;
    case 'mint':
      return mats.stuccoMintMat;
    case 'ochre':
      return mats.stuccoOchreMat;
    case 'slate':
      return mats.stuccoSlateMat;
    default:
      return mats.stuccoCreamMat;
  }
}

function makeScaledBox(
  geos: SharedBuildingGeometries,
  mat: THREE.Material,
  sx: number,
  sy: number,
  sz: number,
  px: number,
  py: number,
  pz: number,
  castShadow = false,
  receiveShadow = true,
): THREE.Mesh {
  const m = new THREE.Mesh(geos.unitBox, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(px, py, pz);
  m.castShadow = castShadow;
  m.receiveShadow = receiveShadow;
  return m;
}

function computeRotatedWorldPoint(
  cx: number,
  cy: number,
  cz: number,
  rotY: number,
  localX: number,
  localY: number,
  localZ: number,
): { x: number; y: number; z: number } {
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  return {
    x: Number((cx + localX * cos + localZ * sin).toFixed(2)),
    y: Number((cy + localY).toFixed(2)),
    z: Number((cz - localX * sin + localZ * cos).toFixed(2)),
  };
}

export function createBuildingCollider(spec: {
  x: number;
  z: number;
  rotY: number;
  width: number;
  depth: number;
}): StaticAabbCollider {
  const cos = Math.abs(Math.cos(spec.rotY));
  const sin = Math.abs(Math.sin(spec.rotY));
  const hw = (spec.width * cos + spec.depth * sin) * 0.5;
  const hd = (spec.width * sin + spec.depth * cos) * 0.5;
  return {
    minX: spec.x - hw,
    maxX: spec.x + hw,
    minZ: spec.z - hd,
    maxZ: spec.z + hd,
  };
}

/**
 * Reusable Procedural Multi-Part LOD Building Constructor across all 23 Kozhikode archetypes.
 * Pools shared geometries + materials so streaming chunks remain fast and memory-safe.
 */
export function buildProceduralBuildingLOD(
  spec: ProceduralBuildingSpec,
  mats: MaterialLibrary,
  lodDistance = 115,
): {
  lod: THREE.LOD;
  record: RegisteredBuildingRecord;
  animatedRestaurant?: AnimatedRestaurantInstance;
} {
  const geos = getSharedBuildingGeometries();
  const baseY = spec.y ?? 0.18;
  const category = classifyBuildingCategory(spec.archetype);

  const lod = new THREE.LOD();
  lod.position.set(spec.x, baseY, spec.z);
  lod.rotation.y = spec.rotY;

  const lod0 = new THREE.Group();
  const lod1 = new THREE.Group();
  let animatedRestaurant: AnimatedRestaurantInstance | undefined;

  const floorH = spec.archetype === 'hospital' || spec.archetype === 'shopping_complex' ? 3.8 : 3.45;
  const groundH = category === 'residential' && spec.archetype !== 'mixed_residential' ? 3.5 : 4.2;
  const floors = Math.max(1, spec.floors);
  const upperH = floors > 1 ? (floors - 1) * floorH : 0;
  const totalH = groundH + upperH;

  const facadeMat = resolveFacadeMaterial(spec, mats);
  const stuccoMat = resolveStuccoMaterial(spec.stuccoTone, mats);
  const awningHex = spec.awningColor ?? (category === 'commercial' ? 0xb45309 : 0x0f766e);
  const awningMat = mats.getAwningMaterial(awningHex);

  const hasSlopedRoof =
    spec.hasSlopedRoof ??
    (spec.archetype === 'kerala_traditional' ||
      spec.archetype === 'older_house' ||
      spec.archetype === 'school' ||
      spec.archetype === 'public_building' ||
      spec.archetype === 'bakery');

  // --- Plinth foundation ---
  lod0.add(makeScaledBox(geos, mats.lateriteMat, spec.width + 0.5, 0.36, spec.depth + 0.5, 0, 0.18, 0, false, true));

  // --- Ground-Floor Architectural Massing ---
  if (spec.archetype === 'parking_structure') {
    // Open multi-deck concrete parking garage with perimeter slab decks & ramp columns
    for (let f = 0; f < floors; f++) {
      const deckY = 0.35 + f * 3.1;
      lod0.add(makeScaledBox(geos, mats.concretePillarMat, spec.width, 0.35, spec.depth, 0, deckY, 0, true, true));
      lod0.add(makeScaledBox(geos, mats.parapetMat, spec.width, 0.9, 0.24, 0, deckY + 0.6, spec.depth / 2 - 0.15, true, true));
      lod0.add(makeScaledBox(geos, mats.parapetMat, spec.width, 0.9, 0.24, 0, deckY + 0.6, -spec.depth / 2 + 0.15, false, true));
    }
    const cols = Math.max(3, Math.floor(spec.width / 5));
    for (let c = 0; c < cols; c++) {
      const cx = -spec.width / 2 + 0.5 + (c / Math.max(1, cols - 1)) * (spec.width - 1);
      lod0.add(makeScaledBox(geos, mats.parapetMat, 0.48, floors * 3.1, 0.48, cx, (floors * 3.1) / 2, spec.depth / 2 - 0.35, true, false));
      lod0.add(makeScaledBox(geos, mats.parapetMat, 0.48, floors * 3.1, 0.48, cx, (floors * 3.1) / 2, -spec.depth / 2 + 0.35, false, false));
    }
  } else if (category === 'residential' && spec.archetype !== 'mixed_residential' && spec.archetype !== 'small_apartment') {
    // Residential Kerala houses & villas with sit-out porch, columns, door, windows, optional compound wall
    const wallMat = spec.archetype === 'older_house' ? mats.stuccoWarmMat : stuccoMat;
    lod0.add(makeScaledBox(geos, wallMat, spec.width, groundH, spec.depth, 0, 0.36 + groundH / 2, -0.35, true, true));

    if (upperH > 0) {
      lod0.add(makeScaledBox(geos, wallMat, spec.width * 0.9, upperH, spec.depth * 0.88, 0, 0.36 + groundH + upperH / 2, -0.45, true, true));
      // Projecting upper-floor balcony
      if (spec.hasBalcony !== false) {
        lod0.add(makeScaledBox(geos, mats.concretePillarMat, spec.width * 0.52, 0.22, 1.5, 0, 0.36 + groundH + 0.08, spec.depth * 0.44 + 0.55, true, true));
        lod0.add(makeScaledBox(geos, mats.darkIronMat, spec.width * 0.52, 0.92, 0.1, 0, 0.36 + groundH + 0.65, spec.depth * 0.44 + 1.25, false, false));
      }
    }

    // Front veranda / porch roof & twin columns
    const porchW = Math.min(spec.width * 0.58, 5.4);
    const porch = makeScaledBox(geos, hasSlopedRoof ? mats.terracottaRoofMat : mats.concretePillarMat, porchW, 0.22, 2.2, 0, 3.05, spec.depth * 0.5 + 0.4, true, true);
    porch.rotation.x = hasSlopedRoof ? 0.2 : 0;
    lod0.add(porch);

    for (const px of [-porchW * 0.42, porchW * 0.42]) {
      const col = new THREE.Mesh(geos.unitCylinder, mats.concretePillarMat);
      col.scale.set(0.32, 2.85, 0.32);
      col.position.set(px, 1.75, spec.depth * 0.5 + 1.1);
      col.castShadow = true;
      lod0.add(col);
    }

    // Teak timber doorway + warm lit windows + chajjas
    lod0.add(makeScaledBox(geos, mats.teakWoodMat, 1.35, 2.3, 0.18, 0, 1.5, spec.depth * 0.5 - 0.32, false, false));
    for (const wx of [-spec.width * 0.3, spec.width * 0.3]) {
      lod0.add(makeScaledBox(geos, mats.shopGlassNightMat, 1.45, 1.25, 0.16, wx, 2.05, spec.depth * 0.5 - 0.32, false, false));
      lod0.add(makeScaledBox(geos, mats.concretePillarMat, 1.75, 0.12, 0.45, wx, 2.75, spec.depth * 0.5 - 0.15, false, false));
    }

    if (spec.withCompoundWall) {
      const cwW = spec.width + 4.4;
      const cwD = spec.depth + 5.6;
      const gateGap = 3.6;
      const wingW = (cwW - gateGap) * 0.5;
      lod0.add(makeScaledBox(geos, mats.lateriteMat, wingW, 1.35, 0.32, -(gateGap * 0.5 + wingW * 0.5), 0.68, cwD * 0.5, true, true));
      lod0.add(makeScaledBox(geos, mats.lateriteMat, wingW, 1.35, 0.32, gateGap * 0.5 + wingW * 0.5, 0.68, cwD * 0.5, true, true));
      lod0.add(makeScaledBox(geos, mats.lateriteMat, 0.32, 1.35, cwD, -cwW * 0.5, 0.68, 0, false, true));
      lod0.add(makeScaledBox(geos, mats.lateriteMat, 0.32, 1.35, cwD, cwW * 0.5, 0.68, 0, false, true));
      lod0.add(makeScaledBox(geos, mats.lateriteMat, cwW, 1.35, 0.32, 0, 0.68, -cwD * 0.5, false, true));
    }
  } else {
    // Commercial / Mixed-Residential / Institutional / Civic buildings
    if (upperH > 0) {
      lod0.add(makeScaledBox(geos, facadeMat, spec.width, upperH, spec.depth, 0, 0.36 + groundH + upperH / 2, 0, true, true));

      // Projecting upper-floor balconies for hotels, mixed apartments, and shopping complexes
      if (spec.hasBalcony || spec.archetype === 'small_apartment' || spec.archetype === 'mixed_residential' || spec.archetype === 'hotel') {
        for (let f = 1; f < floors; f++) {
          const balY = 0.36 + groundH + (f - 1) * floorH + 0.12;
          lod0.add(makeScaledBox(geos, mats.concretePillarMat, spec.width * 0.84, 0.2, 1.15, 0, balY, spec.depth / 2 + 0.5, true, true));
          lod0.add(makeScaledBox(geos, mats.darkIronMat, spec.width * 0.84, 0.88, 0.08, 0, balY + 0.52, spec.depth / 2 + 1.02, false, false));
        }
      }
    }

    const restaurantCat = resolveRestaurantCategoryForBuilding(
      spec.id,
      spec.archetype,
      spec.businessTag,
    );

    if (restaurantCat) {
      // Open-front animated Kozhikode restaurant/bakery/tea interior visible from the street
      const interior = buildRestaurantGroundInterior(
        {
          buildingId: spec.id,
          category: restaurantCat,
          width: spec.width,
          depth: spec.depth,
          groundH,
          worldX: spec.x,
          worldZ: spec.z,
          rotY: spec.rotY,
          englishName: spec.english,
          malayalamName: spec.malayalam,
        },
        mats,
      );
      lod0.add(interior.group);
      animatedRestaurant = interior.instance;
    } else {
      // Recessed ground-floor shopfront core + alternating shutter/illuminated glass bays
      lod0.add(makeScaledBox(geos, mats.shutterSteelMat, spec.width - 0.6, groundH, spec.depth - 1.5, 0, 0.36 + groundH / 2, -0.45, true, true));

      const bayCount = Math.max(2, Math.floor(spec.width / 4.2));
      const baySpacing = (spec.width - 2.0) / bayCount;
      for (let b = 0; b < bayCount; b++) {
        const bx = -spec.width / 2 + 1.0 + baySpacing * (b + 0.5);
        const isLit = spec.archetype === 'shopping_complex' || spec.archetype === 'hotel' || b % 2 === 0;
        lod0.add(
          makeScaledBox(
            geos,
            isLit ? mats.shopGlassNightMat : mats.shutterSteelMat,
            baySpacing * 0.74,
            2.65,
            0.16,
            bx,
            0.36 + 1.45,
            spec.depth / 2 - 1.1,
            false,
            false,
          ),
        );
      }
    }

    // Front arcade pillars
    const colCount = Math.max(3, Math.floor(spec.width / 4.0) + 1);
    for (let c = 0; c < colCount; c++) {
      const cx = -spec.width / 2 + 0.45 + (c / (colCount - 1)) * (spec.width - 0.9);
      lod0.add(makeScaledBox(geos, mats.concretePillarMat, 0.44, groundH, 0.44, cx, 0.36 + groundH / 2, spec.depth / 2 - 0.22, true, true));
    }

    // Angled Shop / Institutional Awning
    const awning = makeScaledBox(geos, awningMat, spec.width + 0.2, 0.1, 1.85, 0, 3.45, spec.depth / 2 + 0.55, true, false);
    awning.rotation.x = 0.28;
    lod0.add(awning);

    // AC Condenser units on side/front facade for modern offices, mobile shops, hotels
    if (spec.hasAcUnits || spec.archetype === 'office' || spec.archetype === 'mobile_shop' || spec.archetype === 'hotel') {
      for (let f = 1; f < Math.min(floors, 4); f++) {
        lod0.add(makeScaledBox(geos, mats.parapetMat, 0.75, 0.55, 0.4, spec.width / 2 - 1.2, 0.36 + groundH + (f - 1) * floorH + 1.0, spec.depth / 2 + 0.2, false, false));
      }
    }
  }

  // --- Bilingual Malayalam + English Signboard (if labeled) ---
  if (spec.english) {
    const signMat = mats.getSignMaterial(
      `sign_${spec.id}`,
      spec.malayalam,
      spec.english,
      spec.signBg ?? '#0f172a',
      spec.signFg ?? '#fde68a',
    );
    const signW = Math.min(spec.width * 0.78, 8.6);
    const signY = category === 'residential' && spec.archetype !== 'mixed_residential' ? 1.4 : groundH + 0.55;
    const signZ =
      category === 'residential' && spec.archetype !== 'mixed_residential'
        ? spec.depth * 0.5 + (spec.withCompoundWall ? 2.95 : 0.2)
        : spec.depth / 2 + 0.16;
    lod0.add(makeScaledBox(geos, signMat, signW, 1.25, 0.16, 0, signY, signZ, false, false));
  }

  // --- Rooftop: Parapet + Mangalore Terracotta Roof or Water Tank ---
  if (spec.archetype !== 'parking_structure') {
    lod0.add(makeScaledBox(geos, mats.parapetMat, spec.width + 0.25, 0.5, spec.depth + 0.25, 0, 0.36 + totalH + 0.25, 0, false, true));

    if (hasSlopedRoof) {
      const maxDim = Math.max(spec.width, spec.depth);
      const roof = new THREE.Mesh(geos.unitHipCone, mats.terracottaRoofMat);
      roof.scale.set(spec.width * 1.06, 2.6, spec.depth * 1.06);
      roof.position.set(0, 0.36 + totalH + 1.35, 0);
      roof.castShadow = true;
      lod0.add(roof);
      void maxDim;
    } else if (spec.hasWaterTank !== false) {
      const tank = new THREE.Mesh(geos.unitCylinder, mats.waterTankMat);
      tank.scale.set(1.25, 1.25, 1.25);
      tank.position.set(spec.width * 0.24, 0.36 + totalH + 0.95, -spec.depth * 0.2);
      tank.castShadow = true;
      lod0.add(tank);
    }
  }

  // --- LOD1: Lightweight Distance Silhouette (2–3 draw calls) ---
  lod1.add(makeScaledBox(geos, stuccoMat, spec.width, totalH, spec.depth, 0, 0.36 + totalH / 2, 0, false, false));
  if (hasSlopedRoof) {
    const roofLod = new THREE.Mesh(geos.unitHipCone, mats.terracottaRoofMat);
    roofLod.scale.set(spec.width * 1.04, 2.4, spec.depth * 1.04);
    roofLod.position.set(0, 0.36 + totalH + 1.2, 0);
    lod1.add(roofLod);
  } else {
    lod1.add(makeScaledBox(geos, awningMat, spec.width + 0.2, 0.55, 1.4, 0, 3.3, spec.depth / 2 + 0.4, false, false));
  }

  lod.addLevel(lod0, 0);
  lod.addLevel(lod1, lodDistance);

  const entryPoint = computeRotatedWorldPoint(spec.x, baseY, spec.z, spec.rotY, 0, 0, spec.depth * 0.5 + 1.4);
  const interactionPoint = computeRotatedWorldPoint(spec.x, baseY, spec.z, spec.rotY, 0, 0, spec.depth * 0.5 + 2.4);

  const record: RegisteredBuildingRecord = {
    id: spec.id,
    name: spec.english,
    malayalamName: spec.malayalam,
    districtId: spec.districtId,
    category,
    archetype: spec.archetype,
    lat: worldToGeo(spec.x, spec.z).lat,
    lon: worldToGeo(spec.x, spec.z).lon,
    worldX: spec.x,
    worldZ: spec.z,
    rotY: spec.rotY,
    collider: createBuildingCollider(spec),
    interactionPoint,
    entryPoint,
    ownershipStatus:
      spec.ownershipStatus ??
      (category === 'infrastructure'
        ? 'public'
        : category === 'commercial'
          ? 'private_commercial'
          : 'private_residential'),
    interiorEligible: spec.interiorEligible ?? defaultInteriorEligibility(spec.archetype),
    futureHooks: {
      businessTag: spec.businessTag,
      propertyPurchaseTag: spec.propertyPurchaseTag,
      missionTag: spec.missionTag,
    },
  };

  return { lod, record, animatedRestaurant };
}

/**
 * Hero Landmark 1: Mananchira Heritage Civic Building (Town Hall / Public Library Colonnade).
 */
export function buildMananchiraHeritageHall(
  x: number,
  z: number,
  rotY: number,
  mats: MaterialLibrary,
  id: string,
  english: string,
  malayalam: string,
): { lod: THREE.LOD; record: RegisteredBuildingRecord } {
  const geos = getSharedBuildingGeometries();
  const width = 26;
  const depth = 12;
  const lod = new THREE.LOD();
  lod.position.set(x, 0.18, z);
  lod.rotation.y = rotY;

  const lod0 = new THREE.Group();
  const lod1 = new THREE.Group();

  // Raised laterite plinth
  lod0.add(makeScaledBox(geos, mats.lateriteMat, width + 1.2, 0.65, depth + 1.4, 0, 0.32, 0, false, true));
  // Main cream heritage body (2 stories)
  lod0.add(makeScaledBox(geos, mats.stuccoCreamMat, width, 6.8, depth - 2.2, 0, 4.05, -0.8, true, true));

  // Front arched colonnade verandah (7 classical columns + porch slab + pediment)
  const colCount = 7;
  for (let i = 0; i < colCount; i++) {
    const cx = -width / 2 + 1.4 + (i / (colCount - 1)) * (width - 2.8);
    const col = new THREE.Mesh(geos.unitCylinder, mats.stuccoCreamMat);
    col.scale.set(0.42, 4.1, 0.42);
    col.position.set(cx, 2.7, depth / 2 - 0.25);
    col.castShadow = true;
    lod0.add(col);
  }
  lod0.add(makeScaledBox(geos, mats.stuccoWarmMat, width + 0.5, 0.45, 2.6, 0, 4.95, depth / 2 - 0.8, true, true));

  // Central gable pediment + heritage plaque
  lod0.add(makeScaledBox(geos, mats.stuccoCreamMat, 8.5, 2.2, 1.4, 0, 8.2, depth / 2 - 0.8, true, true));
  const signMat = mats.getSignMaterial(`sign_${id}`, malayalam, english, '#451a03', '#fde68a');
  lod0.add(makeScaledBox(geos, signMat, 7.6, 1.15, 0.2, 0, 5.45, depth / 2 + 0.42, false, false));

  // Tall windows across colonnade
  for (let wx = -9.5; wx <= 9.5; wx += 3.8) {
    lod0.add(makeScaledBox(geos, mats.shopGlassNightMat, 1.6, 2.3, 0.16, wx, 5.4, depth / 2 - 1.85, false, false));
  }

  // Grand double-pitched Mangalore tiled roof
  const mainRoof = new THREE.Mesh(geos.unitHipCone, mats.terracottaRoofMat);
  mainRoof.scale.set(width + 1.2, 3.3, depth + 0.8);
  mainRoof.position.set(0, 9.1, -0.3);
  mainRoof.castShadow = true;
  lod0.add(mainRoof);

  // LOD1 silhouette
  lod1.add(makeScaledBox(geos, mats.stuccoCreamMat, width, 7.4, depth, 0, 3.8, 0, false, false));
  const roofLod = new THREE.Mesh(geos.unitHipCone, mats.terracottaRoofMat);
  roofLod.scale.set(width + 0.6, 3.0, depth + 0.6);
  roofLod.position.set(0, 9.0, 0);
  lod1.add(roofLod);

  lod.addLevel(lod0, 0);
  lod.addLevel(lod1, 130);

  const entryPoint = computeRotatedWorldPoint(x, 0.18, z, rotY, 0, 0, depth / 2 + 1.2);
  const interactionPoint = computeRotatedWorldPoint(x, 0.18, z, rotY, 0, 0, depth / 2 + 2.4);

  return {
    lod,
    record: {
      id,
      name: english,
      malayalamName: malayalam,
      districtId: 'mananchira',
      category: 'infrastructure',
      archetype: 'public_building',
      lat: worldToGeo(x, z).lat,
      lon: worldToGeo(x, z).lon,
      worldX: x,
      worldZ: z,
      rotY,
      collider: createBuildingCollider({ x, z, rotY, width, depth }),
      interactionPoint,
      entryPoint,
      ownershipStatus: 'public',
      interiorEligible: true,
      futureHooks: { missionTag: 'civic_mananchira' },
    },
  };
}

/**
 * Hero Landmark 2: Kozhikode Railway Station (CLT) Portico, Clock Pediment & Canopy Forecourt.
 */
export function buildRailwayStationComplex(
  x: number,
  z: number,
  rotY: number,
  mats: MaterialLibrary,
): { lod: THREE.LOD; record: RegisteredBuildingRecord } {
  const geos = getSharedBuildingGeometries();
  const width = 36;
  const depth = 14;
  const lod = new THREE.LOD();
  lod.position.set(x, 0.18, z);
  lod.rotation.y = rotY;

  const lod0 = new THREE.Group();
  const lod1 = new THREE.Group();

  lod0.add(makeScaledBox(geos, mats.lateriteMat, width + 1.5, 0.55, depth + 1.5, 0, 0.27, 0, false, true));
  lod0.add(makeScaledBox(geos, mats.facadeCreamMat, width, 7.6, depth - 2.0, 0, 4.35, -0.5, true, true));

  // Central heritage clock pediment & portico arch columns
  lod0.add(makeScaledBox(geos, mats.stuccoCreamMat, 11, 10.6, 5.5, 0, 5.6, 2.2, true, true));
  for (const px of [-4.4, -1.6, 1.6, 4.4]) {
    lod0.add(makeScaledBox(geos, mats.concretePillarMat, 0.65, 5.2, 0.65, px, 2.8, depth / 2 + 0.6, true, true));
  }

  // Sweeping red/steel arrival forecourt canopy
  const canopy = makeScaledBox(geos, mats.getAwningMaterial(0x991b1b), 16, 0.24, 4.2, 0, 4.9, depth / 2 + 1.1, true, false);
  canopy.rotation.x = 0.08;
  lod0.add(canopy);

  // Clock dial face + Glowing CLT Signboard
  const clockDisc = new THREE.Mesh(geos.unitCylinder, mats.shopGlassNightMat);
  clockDisc.scale.set(1.75, 0.22, 1.75);
  clockDisc.rotation.x = Math.PI / 2;
  clockDisc.position.set(0, 9.1, 4.98);
  lod0.add(clockDisc);

  const cltSign = mats.getSignMaterial(
    'clt_station_hero',
    'കോഴിക്കോട് റെയിൽവേ സ്റ്റേഷൻ (CLT)',
    'KOZHIKODE RAILWAY STATION',
    '#7f1d1d',
    '#fef08a',
  );
  lod0.add(makeScaledBox(geos, cltSign, 11.5, 1.45, 0.24, 0, 5.55, depth / 2 + 1.8, false, false));

  // CLT Junction Express Snack & Parcel Counter Kiosk under East Arrival Canopy
  const expressKiosk = new THREE.Group();
  expressKiosk.position.set(10.2, 0.55, depth / 2 - 0.1);
  expressKiosk.add(makeScaledBox(geos, mats.teakWoodMat, 3.6, 1.05, 1.15, 0, 0.52, 0, true, true));
  expressKiosk.add(makeScaledBox(geos, mats.stuccoCreamMat, 3.7, 0.08, 1.25, 0, 1.08, 0, false, true));
  expressKiosk.add(makeScaledBox(geos, mats.getSignMaterial('clt_express_kiosk', 'എക്സ്പ്രസ്സ് കിച്ചൺ', 'CLT EXPRESS KITCHEN', '#7c2d12', '#fde68a'), 3.2, 0.52, 0.1, 0, 2.35, 0.35, false, false));
  const stationParcel = createFoodModel('food_parcel_box');
  stationParcel.position.set(-0.85, 1.12, 0.15);
  const stationSnacks = createFoodModel('snacks_assortment');
  stationSnacks.position.set(0.15, 1.12, 0.12);
  const stationChai = createFoodModel('chai_glass');
  stationChai.position.set(1.0, 1.12, 0.18);
  const stationVendor = createKeralaNpcRig('worker', 307);
  stationVendor.lod.position.set(0, 0, -0.85);
  expressKiosk.add(stationParcel, stationSnacks, stationChai, stationVendor.lod);
  lod0.add(expressKiosk);

  // Terracotta station roof + platform rear awning
  const stRoof = new THREE.Mesh(geos.unitHipCone, mats.terracottaRoofMat);
  stRoof.scale.set(width + 1.0, 3.2, depth);
  stRoof.position.set(0, 9.7, -0.5);
  stRoof.castShadow = true;
  lod0.add(stRoof);
  lod0.add(makeScaledBox(geos, mats.shutterSteelMat, width + 8, 0.22, 4.5, 0, 4.6, -depth / 2 - 1.8, true, false));

  // LOD1
  lod1.add(makeScaledBox(geos, mats.stuccoCreamMat, width, 8.2, depth, 0, 4.2, 0, false, false));
  const lod1Tower = new THREE.Mesh(geos.unitBox, mats.stuccoCreamMat);
  lod1Tower.scale.set(11, 10.6, 5.5);
  lod1Tower.position.set(0, 5.6, 2.2);
  lod1.add(lod1Tower);

  lod.addLevel(lod0, 0);
  lod.addLevel(lod1, 140);

  const entryPoint = computeRotatedWorldPoint(x, 0.18, z, rotY, 0, 0, depth / 2 + 1.5);
  const interactionPoint = computeRotatedWorldPoint(x, 0.18, z, rotY, 0, 0, depth / 2 + 3.0);

  return {
    lod,
    record: {
      id: 'bldg_kozhikode_railway_station',
      name: 'Kozhikode Railway Station (CLT)',
      malayalamName: 'കോഴിക്കോട് റെയിൽവേ സ്റ്റേഷൻ',
      districtId: 'railway_station',
      category: 'infrastructure',
      archetype: 'railway_building',
      lat: worldToGeo(x, z).lat,
      lon: worldToGeo(x, z).lon,
      worldX: x,
      worldZ: z,
      rotY,
      collider: createBuildingCollider({ x, z, rotY, width, depth }),
      interactionPoint,
      entryPoint,
      ownershipStatus: 'public',
      interiorEligible: true,
      futureHooks: { missionTag: 'transit_clt_station' },
    },
  };
}

/**
 * Hero Landmark 3: Govt. Medical College Hospital Main Block & Emergency Ambulance Bay.
 */
export function buildMedicalCollegeHospital(
  x: number,
  y: number,
  z: number,
  rotY: number,
  mats: MaterialLibrary,
): { lod: THREE.LOD; record: RegisteredBuildingRecord } {
  const geos = getSharedBuildingGeometries();
  const width = 34;
  const depth = 15;
  const lod = new THREE.LOD();
  lod.position.set(x, y, z);
  lod.rotation.y = rotY;

  const lod0 = new THREE.Group();
  const lod1 = new THREE.Group();

  lod0.add(makeScaledBox(geos, mats.concretePillarMat, width + 1.5, 0.45, depth + 1.5, 0, 0.22, 0, false, true));
  // 4-story main ward wing + flanked side bays
  lod0.add(makeScaledBox(geos, mats.facadeHospitalMat, width, 13.5, depth - 2.0, 0, 7.1, -0.5, true, true));
  lod0.add(makeScaledBox(geos, mats.stuccoCreamMat, 11, 15.2, depth + 0.5, 0, 7.9, 0.2, true, true));

  // Ambulance Emergency Portico Canopy
  lod0.add(makeScaledBox(geos, mats.getAwningMaterial(0x0f766e), 11.5, 0.35, 5.2, 0, 4.3, depth / 2 + 1.8, true, true));
  for (const px of [-4.8, 4.8]) {
    lod0.add(makeScaledBox(geos, mats.concretePillarMat, 0.55, 4.1, 0.55, px, 2.2, depth / 2 + 3.9, true, false));
  }

  // Glowing Red Medical Cross Emblem
  lod0.add(makeScaledBox(geos, mats.medicalCrossRedMat, 2.4, 0.72, 0.25, 0, 12.6, depth / 2 + 0.45, false, false));
  lod0.add(makeScaledBox(geos, mats.medicalCrossRedMat, 0.72, 2.4, 0.25, 0, 12.6, depth / 2 + 0.45, false, false));

  const hospSign = mats.getSignMaterial(
    'kozhikode_medical_college_hero',
    'ഗവ. മെഡിക്കൽ കോളേജ് കോഴിക്കോട്',
    'GOVT. MEDICAL COLLEGE HOSPITAL',
    '#064e3b',
    '#f8fafc',
  );
  lod0.add(makeScaledBox(geos, hospSign, 10.6, 1.35, 0.2, 0, 5.1, depth / 2 + 3.95, false, false));

  // LOD1
  lod1.add(makeScaledBox(geos, mats.stuccoSlateMat, width, 14.0, depth, 0, 7.2, 0, false, false));

  lod.addLevel(lod0, 0);
  lod.addLevel(lod1, 140);

  const entryPoint = computeRotatedWorldPoint(x, y, z, rotY, 0, 0, depth / 2 + 2.2);
  const interactionPoint = computeRotatedWorldPoint(x, y, z, rotY, 0, 0, depth / 2 + 4.4);

  return {
    lod,
    record: {
      id: 'bldg_medical_college_hospital',
      name: 'Govt. Medical College Hospital',
      malayalamName: 'ഗവ. മെഡിക്കൽ കോളേജ് കോഴിക്കോട്',
      districtId: 'medical_college',
      category: 'infrastructure',
      archetype: 'hospital',
      lat: worldToGeo(x, z).lat,
      lon: worldToGeo(x, z).lon,
      worldX: x,
      worldZ: z,
      rotY,
      collider: createBuildingCollider({ x, z, rotY, width, depth }),
      interactionPoint,
      entryPoint,
      ownershipStatus: 'public',
      interiorEligible: true,
      futureHooks: { missionTag: 'hospital_emergency' },
    },
  };
}
