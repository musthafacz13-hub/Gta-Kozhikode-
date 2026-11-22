import * as THREE from 'three';
import type { MaterialLibrary } from '../rendering/MaterialLibrary.ts';
import type { RestaurantCategory } from '../types.ts';
import { createFoodModel, type KozhikodeFoodModelKind } from './KeralaFoodModels.ts';
import {
  createKeralaNpcRig,
  poseNpcSeated,
  type ArticulatedKeralaNpcRig,
} from './KeralaNpcRig.ts';

export type RestaurantNpcState =
  | 'stirring_pot'
  | 'chopping_prep'
  | 'pouring_drink'
  | 'plating_food'
  | 'cashier_idle'
  | 'eating_meal'
  | 'drinking_cup'
  | 'chatting'
  | 'queuing_pickup';

export interface RestaurantAnimatedNpc {
  role: 'chef' | 'server' | 'cashier' | 'diner' | 'pickup_customer';
  state: RestaurantNpcState;
  rig: ArticulatedKeralaNpcRig;
  phaseOffset: number;
  baseY: number;
  basePosX: number;
  basePosZ: number;
}

export interface SteamPuffSlot {
  mesh: THREE.Mesh;
  baseX: number;
  baseY: number;
  baseZ: number;
  phase: number;
  driftRadius: number;
}

export interface AnimatedRestaurantInstance {
  buildingId: string;
  category: RestaurantCategory;
  worldX: number;
  worldZ: number;
  interiorGlowLocal: THREE.Vector3;
  ceilingFans: THREE.Object3D[];
  rotisseries: THREE.Object3D[];
  steamPuffs: SteamPuffSlot[];
  warmGlassPanels: THREE.Mesh[];
  npcs: RestaurantAnimatedNpc[];
  update: (dt: number, simTimeSec: number, playerX: number, playerZ: number, nightGlowFactor: number) => void;
}

const BUILDING_RESTAURANT_CATEGORY_MAP: Record<string, RestaurantCategory> = {
  bldg_mananchira_malabar_biriyani: 'biryani_shop',
  bldg_mananchira_tea_house: 'malabar_restaurant',
  bldg_mananchira_sweet_bakers: 'bakery',
  bldg_sm_halwa_mart: 'bakery',
  bldg_sm_spices: 'fast_food',
  bldg_mavoor_grand_hotel: 'malabar_restaurant',
  bldg_palayam_market_hall: 'biryani_shop',
  bldg_westhill_chaya_kada: 'malabar_restaurant',
  bldg_nadakkavu_bakery: 'bakery',
  bldg_beach_sulaimani_chai: 'tea_shop',
  bldg_beach_seafood_shack: 'fast_food',
  bldg_medcollege_canteen: 'malabar_restaurant',
};

export function resolveRestaurantCategoryForBuilding(
  buildingId: string,
  archetype: string,
  businessTag?: string,
): RestaurantCategory | null {
  if (BUILDING_RESTAURANT_CATEGORY_MAP[buildingId]) {
    return BUILDING_RESTAURANT_CATEGORY_MAP[buildingId];
  }
  if (buildingId.endsWith('_bakery') || archetype === 'bakery') return 'bakery';
  if (buildingId.includes('beypore_harbour_hub')) return 'biryani_shop';
  if (businessTag === 'restaurant_biriyani') return 'biryani_shop';
  if (businessTag === 'restaurant_tea') return 'malabar_restaurant';
  if (businessTag === 'neighborhood_tea_shop') return 'tea_shop';
  if (archetype === 'restaurant') return 'malabar_restaurant';
  return null;
}

function markShared<T extends THREE.BufferGeometry>(g: T): T {
  g.userData.shared = true;
  return g;
}

interface SharedInteriorAssets {
  box: THREE.BufferGeometry;
  cyl: THREE.BufferGeometry;
  sphere: THREE.BufferGeometry;
  tileFloorMat: THREE.MeshStandardMaterial;
  creamWallMat: THREE.MeshStandardMaterial;
  warmAccentWallMat: THREE.MeshStandardMaterial;
  counterMarbleMat: THREE.MeshStandardMaterial;
  stainlessMat: THREE.MeshStandardMaterial;
  glassDisplayMat: THREE.MeshPhysicalMaterial;
  woodTableMat: THREE.MeshStandardMaterial;
  chairFrameMat: THREE.MeshStandardMaterial;
  cushionedSeatMat: THREE.MeshStandardMaterial;
  copperStoveMat: THREE.MeshStandardMaterial;
  rotisserieMeatMat: THREE.MeshStandardMaterial;
  steamMat: THREE.MeshStandardMaterial;
  menuBoardMat: THREE.MeshStandardMaterial;
  warmInteriorGlowMat: THREE.MeshStandardMaterial;
  lanternEmissiveMat: THREE.MeshStandardMaterial;
}

let cachedAssets: SharedInteriorAssets | null = null;

function getSharedInteriorAssets(): SharedInteriorAssets {
  if (!cachedAssets) {
    cachedAssets = {
      box: markShared(new THREE.BoxGeometry(1, 1, 1)),
      cyl: markShared(new THREE.CylinderGeometry(0.5, 0.5, 1, 12)),
      sphere: markShared(new THREE.SphereGeometry(0.5, 8, 6)),
      tileFloorMat: new THREE.MeshStandardMaterial({ color: 0xe6dcd0, roughness: 0.42, metalness: 0.05 }),
      creamWallMat: new THREE.MeshStandardMaterial({ color: 0xf7efe3, roughness: 0.84 }),
      warmAccentWallMat: new THREE.MeshStandardMaterial({ color: 0x8f341b, roughness: 0.78 }),
      counterMarbleMat: new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.24, metalness: 0.06 }),
      stainlessMat: new THREE.MeshStandardMaterial({ color: 0xdbe3ec, roughness: 0.25, metalness: 0.85 }),
      glassDisplayMat: new THREE.MeshPhysicalMaterial({
        color: 0xe0f2fe,
        roughness: 0.08,
        transparent: true,
        opacity: 0.34,
        clearcoat: 1,
      }),
      woodTableMat: new THREE.MeshStandardMaterial({ color: 0x6b3a1c, roughness: 0.62 }),
      chairFrameMat: new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.45, metalness: 0.55 }),
      cushionedSeatMat: new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.72 }),
      copperStoveMat: new THREE.MeshStandardMaterial({ color: 0x9a4b1e, roughness: 0.48, metalness: 0.58 }),
      rotisserieMeatMat: new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.68 }),
      steamMat: new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
      }),
      menuBoardMat: new THREE.MeshStandardMaterial({
        color: 0x111827,
        emissive: 0x451a03,
        emissiveIntensity: 0.35,
        roughness: 0.5,
      }),
      warmInteriorGlowMat: new THREE.MeshStandardMaterial({
        color: 0xfef3c7,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.75,
        roughness: 0.3,
      }),
      lanternEmissiveMat: new THREE.MeshStandardMaterial({
        color: 0xfde68a,
        emissive: 0xf59e0b,
        emissiveIntensity: 1.35,
        roughness: 0.25,
      }),
    };
  }
  return cachedAssets;
}

function addBox(
  parent: THREE.Object3D,
  boxGeo: THREE.BufferGeometry,
  mat: THREE.Material,
  sx: number,
  sy: number,
  sz: number,
  px: number,
  py: number,
  pz: number,
  castShadow = false,
): THREE.Mesh {
  const m = new THREE.Mesh(boxGeo, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(px, py, pz);
  m.castShadow = castShadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function buildCeilingFan(assets: SharedInteriorAssets, x: number, y: number, z: number): THREE.Group {
  const fan = new THREE.Group();
  fan.position.set(x, y, z);
  const rod = new THREE.Mesh(assets.cyl, assets.chairFrameMat);
  rod.scale.set(0.05, 0.38, 0.05);
  rod.position.y = -0.18;
  const hub = new THREE.Mesh(assets.cyl, assets.woodTableMat);
  hub.scale.set(0.24, 0.08, 0.24);
  hub.position.y = -0.36;
  const spinRoot = new THREE.Group();
  spinRoot.position.y = -0.36;
  for (let b = 0; b < 3; b++) {
    const bladeWrap = new THREE.Group();
    bladeWrap.rotation.y = (b / 3) * Math.PI * 2;
    const blade = new THREE.Mesh(assets.box, assets.woodTableMat);
    blade.scale.set(0.62, 0.018, 0.12);
    blade.position.set(0.38, 0, 0);
    bladeWrap.add(blade);
    spinRoot.add(bladeWrap);
  }
  fan.add(rod, hub);
  fan.add(spinRoot);
  fan.userData.spinTarget = spinRoot;
  return fan;
}

function buildDiningSet(
  parent: THREE.Object3D,
  assets: SharedInteriorAssets,
  x: number,
  y: number,
  z: number,
  foodA: KozhikodeFoodModelKind,
  foodB: KozhikodeFoodModelKind,
): void {
  const table = new THREE.Group();
  table.position.set(x, y, z);
  // Table top + central steel pedestal
  addBox(table, assets.box, assets.woodTableMat, 1.35, 0.06, 0.85, 0, 0.74, 0, true);
  addBox(table, assets.box, assets.chairFrameMat, 0.14, 0.72, 0.14, -0.45, 0.36, 0);
  addBox(table, assets.box, assets.chairFrameMat, 0.14, 0.72, 0.14, 0.45, 0.36, 0);

  // Two opposing cushioned wooden benches / chairs
  for (const side of [-0.62, 0.62]) {
    addBox(table, assets.box, assets.cushionedSeatMat, 1.15, 0.06, 0.36, 0, 0.44, side, true);
    addBox(table, assets.box, assets.chairFrameMat, 0.07, 0.44, 0.07, -0.48, 0.22, side);
    addBox(table, assets.box, assets.chairFrameMat, 0.07, 0.44, 0.07, 0.48, 0.22, side);
  }

  const plateA = createFoodModel(foodA);
  plateA.position.set(-0.28, 0.77, 0.12);
  const plateB = createFoodModel(foodB);
  plateB.position.set(0.28, 0.77, -0.1);
  const cup = createFoodModel('chai_glass');
  cup.position.set(0.02, 0.77, 0.22);
  table.add(plateA, plateB, cup);

  parent.add(table);
}

function buildDiningChair(
  parent: THREE.Object3D,
  assets: SharedInteriorAssets,
  x: number,
  y: number,
  z: number,
  rotY: number,
): void {
  const ch = new THREE.Group();
  ch.position.set(x, y, z);
  ch.rotation.y = rotY;
  addBox(ch, assets.box, assets.cushionedSeatMat, 0.46, 0.06, 0.44, 0, 0.44, 0);
  addBox(ch, assets.box, assets.woodTableMat, 0.44, 0.44, 0.06, 0, 0.68, -0.19);
  for (const [lx, lz] of [[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17], [0.18, 0.17]]) {
    addBox(ch, assets.box, assets.chairFrameMat, 0.05, 0.44, 0.05, lx, 0.22, lz);
  }
  parent.add(ch);
}

function updateNpcStatePose(
  npc: RestaurantAnimatedNpc,
  dt: number,
  timeSec: number,
): void {
  const rig = npc.rig;
  const t = timeSec + npc.phaseOffset;
  const blend = Math.min(1, dt * 8);

  let tgtShoulderRX = 0;
  let tgtElbowRX = 0;
  let tgtShoulderLX = 0;
  let tgtElbowLX = 0;
  let tgtTorsoX = 0;
  let tgtHeadY = 0;
  let tgtHeadX = 0;

  switch (npc.state) {
    case 'stirring_pot': {
      const stir = Math.sin(t * 2.8);
      tgtShoulderRX = -0.85 + stir * 0.24;
      tgtElbowRX = -0.78 + Math.cos(t * 2.8) * 0.22;
      tgtShoulderLX = -0.45;
      tgtElbowLX = -0.5;
      tgtTorsoX = 0.12 + Math.sin(t * 2.8) * 0.04;
      tgtHeadX = 0.22;
      break;
    }
    case 'chopping_prep': {
      const chop = Math.abs(Math.sin(t * 6.5));
      tgtShoulderRX = -0.65 - chop * 0.35;
      tgtElbowRX = -0.95 + chop * 0.32;
      tgtShoulderLX = -0.52;
      tgtElbowLX = -0.72;
      tgtTorsoX = 0.14;
      tgtHeadX = 0.26;
      break;
    }
    case 'pouring_drink': {
      const cycle = (Math.sin(t * 2.1) + 1) * 0.5;
      tgtShoulderLX = -1.2 - cycle * 0.55;
      tgtElbowLX = -0.45 - cycle * 0.25;
      tgtShoulderRX = -0.7 + cycle * 0.2;
      tgtElbowRX = -0.85;
      tgtTorsoX = 0.06;
      tgtHeadX = 0.14;
      break;
    }
    case 'plating_food': {
      const wave = (Math.sin(t * 1.45) + 1) * 0.5;
      tgtShoulderRX = -0.52 - wave * 0.56;
      tgtElbowRX = -0.85 + wave * 0.4;
      tgtShoulderLX = -0.35;
      tgtElbowLX = -0.55;
      tgtTorsoX = wave * 0.1;
      tgtHeadY = Math.sin(t * 0.8) * 0.2;
      break;
    }
    case 'eating_meal': {
      const bite = Math.max(0, Math.sin(t * 1.6));
      tgtShoulderRX = -0.52 - bite * 0.78;
      tgtElbowRX = -0.72 - bite * 0.82;
      tgtHeadX = bite > 0.65 ? 0.14 : 0.04;
      tgtHeadY = Math.sin(t * 0.7) * 0.14;
      break;
    }
    case 'drinking_cup': {
      const sip = Math.max(0, Math.sin(t * 1.15));
      tgtShoulderRX = -0.58 - sip * 0.75;
      tgtElbowRX = -0.7 - sip * 0.85;
      tgtHeadX = -sip * 0.16;
      break;
    }
    case 'chatting': {
      const gesture = Math.sin(t * 2.9);
      tgtShoulderRX = -0.52 + Math.max(0, gesture) * 0.42;
      tgtElbowRX = -0.82 - Math.abs(gesture) * 0.28;
      tgtHeadY = Math.sin(t * 1.6) * 0.26;
      tgtHeadX = Math.sin(t * 3.4) * 0.08;
      break;
    }
    case 'queuing_pickup': {
      tgtHeadY = Math.sin(t * 0.9) * 0.28;
      tgtShoulderRX = -0.18 + Math.sin(t * 0.8) * 0.06;
      tgtElbowRX = -0.25;
      break;
    }
    case 'cashier_idle':
    default: {
      tgtHeadY = Math.sin(t * 0.7) * 0.22;
      tgtShoulderRX = -0.25 + Math.sin(t * 1.1) * 0.06;
      tgtElbowRX = -0.45;
      break;
    }
  }

  rig.shoulderR.rotation.x = THREE.MathUtils.lerp(rig.shoulderR.rotation.x, tgtShoulderRX, blend);
  rig.elbowR.rotation.x = THREE.MathUtils.lerp(rig.elbowR.rotation.x, tgtElbowRX, blend);
  rig.shoulderL.rotation.x = THREE.MathUtils.lerp(rig.shoulderL.rotation.x, tgtShoulderLX, blend);
  rig.elbowL.rotation.x = THREE.MathUtils.lerp(rig.elbowL.rotation.x, tgtElbowLX, blend);
  rig.torsoGroup.rotation.x = THREE.MathUtils.lerp(rig.torsoGroup.rotation.x, tgtTorsoX, blend);
  rig.headGroup.rotation.y = THREE.MathUtils.lerp(rig.headGroup.rotation.y, tgtHeadY, blend);
  rig.headGroup.rotation.x = THREE.MathUtils.lerp(rig.headGroup.rotation.x, tgtHeadX, blend);
}

/**
 * Builds an authentic category-specific open-front Kerala eatery ground floor
 * (interior floor, kitchen counter, food models, seating tables, ceiling fans, steam,
 * warm interior lamps, and animated kitchen staff + diners).
 */
export function buildRestaurantGroundInterior(
  params: {
    buildingId: string;
    category: RestaurantCategory;
    worldX: number;
    worldZ: number;
    rotY: number;
    width: number;
    depth: number;
    groundH: number;
    englishName: string;
    malayalamName: string;
  },
  mats: MaterialLibrary,
): { group: THREE.Group; instance: AnimatedRestaurantInstance } {
  const assets = getSharedInteriorAssets();
  const group = new THREE.Group();
  const floorY = 0.36;
  const w = params.width;
  const d = params.depth;
  const h = params.groundH;
  const wallT = 0.28;

  const ceilingFans: THREE.Object3D[] = [];
  const rotisseries: THREE.Object3D[] = [];
  const steamPuffs: SteamPuffSlot[] = [];
  const warmGlassPanels: THREE.Mesh[] = [];
  const npcs: RestaurantAnimatedNpc[] = [];

  // 1. Interior Tiled Floor & Ceiling Slab
  addBox(group, assets.box, assets.tileFloorMat, w - 0.3, 0.08, d - 0.3, 0, floorY + 0.04, 0, false);
  addBox(group, assets.box, assets.creamWallMat, w - 0.3, 0.14, d - 0.3, 0, floorY + h - 0.07, 0, false);

  // 2. Rear & Side Interior Walls
  const accentMat =
    params.category === 'biryani_shop'
      ? assets.warmAccentWallMat
      : params.category === 'bakery'
        ? mats.stuccoWarmMat
        : params.category === 'tea_shop'
          ? mats.stuccoMintMat
          : assets.creamWallMat;

  addBox(group, assets.box, accentMat, w, h, wallT, 0, floorY + h / 2, -d / 2 + wallT / 2, true);
  addBox(group, assets.box, assets.creamWallMat, wallT, h, d, -w / 2 + wallT / 2, floorY + h / 2, 0, true);
  addBox(group, assets.box, assets.creamWallMat, wallT, h, d, w / 2 - wallT / 2, floorY + h / 2, 0, true);

  // 3. Open-Front Glazed Partition Wings + Wide Walk-Up Entry Center
  const frontZ = d / 2 - 0.42;
  const wingW = Math.max(1.4, w * 0.2);
  for (const side of [-1, 1]) {
    const wx = side * (w / 2 - wingW / 2 - 0.15);
    addBox(group, assets.box, assets.creamWallMat, wingW, 0.95, 0.22, wx, floorY + 0.48, frontZ, true);
    const glassWin = addBox(group, assets.box, assets.glassDisplayMat, wingW - 0.2, h - 1.35, 0.1, wx, floorY + 0.95 + (h - 1.35) / 2, frontZ, false);
    warmGlassPanels.push(glassWin);
  }
  // Openable framed double glass doors at left/right edge of center archway (propped invitingly open)
  for (const side of [-1, 1]) {
    const door = new THREE.Mesh(assets.box, assets.glassDisplayMat);
    door.scale.set(0.95, 2.35, 0.08);
    door.position.set(side * 1.9, floorY + 1.2, frontZ + 0.36);
    door.rotation.y = side * Math.PI * 0.38;
    group.add(door);
  }

  // 4. Illuminated Rear Wall Menu Board & Warm Interior Cove Strip
  const menuMat = mats.getSignMaterial(
    `menu_${params.buildingId}`,
    params.malayalamName,
    `${params.englishName.toUpperCase()} · OPEN KITCHEN`,
    params.category === 'bakery' ? '#581c87' : params.category === 'biryani_shop' ? '#7c2d12' : '#064e3b',
    '#fef3c7',
  );
  addBox(group, assets.box, menuMat, Math.min(4.8, w * 0.46), 1.05, 0.12, 0, floorY + 2.55, -d / 2 + 0.38, false);
  const coveStrip = addBox(group, assets.box, assets.warmInteriorGlowMat, w * 0.65, 0.14, 0.18, 0, floorY + h - 0.28, -d / 2 + 0.45, false);
  warmGlassPanels.push(coveStrip);

  // Hanging brass pendant lamps inside the dining/counter hall
  const lampXs = w >= 14 ? [-w * 0.24, 0, w * 0.24] : [-w * 0.18, w * 0.18];
  for (const lx of lampXs) {
    addBox(group, assets.box, assets.chairFrameMat, 0.04, 0.72, 0.04, lx, floorY + h - 0.44, 0.35);
    const bulb = new THREE.Mesh(assets.sphere, assets.lanternEmissiveMat);
    bulb.scale.set(0.28, 0.22, 0.28);
    bulb.position.set(lx, floorY + h - 0.84, 0.35);
    group.add(bulb);
    warmGlassPanels.push(bulb);

    const fan = buildCeilingFan(assets, lx, floorY + h - 0.12, -0.35);
    group.add(fan);
    ceilingFans.push(fan);
  }

  // 5. Category-Specific Kitchen Counter, Cooking Station, Food Models & Seating
  const counterZ = -d * 0.14;
  const counterW = Math.min(w * 0.62, 7.6);
  const counterBase = addBox(group, assets.box, assets.woodTableMat, counterW, 0.96, 0.82, -w * 0.08, floorY + 0.48, counterZ, true);
  void counterBase;
  addBox(group, assets.box, assets.counterMarbleMat, counterW + 0.14, 0.08, 0.94, -w * 0.08, floorY + 0.98, counterZ, false);

  // Rear cooking bench
  addBox(group, assets.box, assets.stainlessMat, counterW, 0.9, 0.76, -w * 0.08, floorY + 0.45, -d / 2 + 0.85, true);

  const registerSteam = (sx: number, sy: number, sz: number, count = 3) => {
    for (let i = 0; i < count; i++) {
      const puff = new THREE.Mesh(assets.sphere, assets.steamMat);
      puff.scale.setScalar(0.14);
      puff.position.set(sx, sy + i * 0.18, sz);
      group.add(puff);
      steamPuffs.push({
        mesh: puff,
        baseX: sx,
        baseY: sy,
        baseZ: sz,
        phase: i / count,
        driftRadius: 0.07,
      });
    }
  };

  const spawnNpc = (
    role: RestaurantAnimatedNpc['role'],
    state: RestaurantNpcState,
    variant: Parameters<typeof createKeralaNpcRig>[0],
    seed: number,
    nx: number,
    nz: number,
    yaw: number,
    seated = false,
    heldProp?: THREE.Object3D,
  ): ArticulatedKeralaNpcRig => {
    const rig = createKeralaNpcRig(variant, seed, 60);
    rig.lod.position.set(nx, floorY + 0.08, nz);
    rig.lod.rotation.y = yaw;
    if (seated) {
      poseNpcSeated(rig, 0.44);
    }
    if (heldProp) {
      rig.handR.add(heldProp);
    }
    group.add(rig.lod);
    npcs.push({
      role,
      state,
      rig,
      phaseOffset: seed * 0.73,
      baseY: floorY + 0.08,
      basePosX: nx,
      basePosZ: nz,
    });
    return rig;
  };

  if (params.category === 'biryani_shop') {
    // Copper Biryani Dum Handis bubbling behind & on serving counter + parcel boxes
    const handiA = createFoodModel('biryani_handi');
    handiA.scale.setScalar(1.35);
    handiA.position.set(-w * 0.22, floorY + 1.02, counterZ);
    const handiB = createFoodModel('biryani_handi');
    handiB.scale.setScalar(1.15);
    handiB.position.set(-w * 0.04, floorY + 1.02, counterZ);
    const parcelReady = createFoodModel('food_parcel_box');
    parcelReady.position.set(w * 0.14, floorY + 1.02, counterZ + 0.1);
    const leafPlate = createFoodModel('biryani_plate');
    leafPlate.position.set(w * 0.05, floorY + 1.02, counterZ + 0.14);
    group.add(handiA, handiB, parcelReady, leafPlate);

    registerSteam(-w * 0.22, floorY + 1.48, counterZ, 4);
    registerSteam(-w * 0.04, floorY + 1.44, counterZ, 3);

    // Dining table inside right half + front waiting stool
    buildDiningSet(group, assets, w * 0.22, floorY + 0.08, d * 0.14, 'biryani_plate', 'biryani_plate');
    buildDiningChair(group, assets, -w * 0.24, floorY + 0.08, d * 0.22, Math.PI);

    spawnNpc('chef', 'stirring_pot', 'man', 11, -w * 0.2, counterZ - 0.85, 0);
    spawnNpc('server', 'plating_food', 'worker', 12, w * 0.06, counterZ - 0.85, 0);
    spawnNpc('diner', 'eating_meal', 'young_adult', 13, w * 0.22 - 0.25, d * 0.14 - 0.62, 0, true);
    spawnNpc('pickup_customer', 'queuing_pickup', 'shop_customer', 14, -w * 0.12, counterZ + 0.95, Math.PI);
  } else if (params.category === 'bakery') {
    // Multi-tier illuminated glass cake/halwa/puff showcase right along front-left counter
    addBox(group, assets.box, assets.glassDisplayMat, 2.8, 0.92, 0.72, -w * 0.14, floorY + 1.48, counterZ, false);
    addBox(group, assets.box, assets.stainlessMat, 2.7, 0.04, 0.64, -w * 0.14, floorY + 1.48, counterZ, false);
    for (let i = 0; i < 3; i++) {
      const trayTop = createFoodModel('bakery_tray');
      trayTop.position.set(-w * 0.14 - 0.75 + i * 0.72, floorY + 1.5, counterZ);
      const trayBot = createFoodModel(i === 0 ? 'snacks_assortment' : 'bakery_tray');
      trayBot.position.set(-w * 0.14 - 0.75 + i * 0.72, floorY + 1.03, counterZ);
      group.add(trayTop, trayBot);
    }
    const parcelBox = createFoodModel('food_parcel_box');
    parcelBox.position.set(w * 0.14, floorY + 1.02, counterZ + 0.1);
    group.add(parcelBox);
    registerSteam(-w * 0.14, floorY + 1.66, counterZ, 3);

    // Chilled Beverage Cooler Refrigerator on back right
    addBox(group, assets.box, assets.stainlessMat, 1.3, 2.1, 0.8, w * 0.34, floorY + 1.08, -d / 2 + 0.82, true);
    const fridgeGlass = addBox(group, assets.box, assets.glassDisplayMat, 1.12, 1.55, 0.08, w * 0.34, floorY + 1.25, -d / 2 + 1.25, false);
    warmGlassPanels.push(fridgeGlass);

    buildDiningSet(group, assets, w * 0.22, floorY + 0.08, d * 0.18, 'bakery_tray', 'juice_glass');

    spawnNpc('server', 'plating_food', 'woman', 21, -w * 0.06, counterZ - 0.85, 0);
    spawnNpc('cashier', 'cashier_idle', 'elderly', 22, w * 0.16, counterZ - 0.85, 0);
    spawnNpc('pickup_customer', 'queuing_pickup', 'shop_customer', 23, -w * 0.05, counterZ + 0.92, Math.PI);
  } else if (params.category === 'fast_food') {
    // Rotating Shawarma Rotisserie Spit + Grill Hood + Fresh Juice Bar + Coastal Mussel Platter
    addBox(group, assets.box, assets.stainlessMat, 2.2, 0.45, 0.88, -w * 0.18, floorY + 2.85, counterZ - 0.65, false);
    const spitShaft = new THREE.Mesh(assets.cyl, assets.stainlessMat);
    spitShaft.scale.set(0.05, 0.95, 0.05);
    spitShaft.position.set(-w * 0.26, floorY + 1.5, counterZ - 0.05);
    const spitMeat = new THREE.Mesh(assets.cyl, assets.rotisserieMeatMat);
    spitMeat.scale.set(0.32, 0.68, 0.32);
    spitMeat.position.set(-w * 0.26, floorY + 1.52, counterZ - 0.05);
    group.add(spitShaft, spitMeat);
    rotisseries.push(spitMeat);

    const platterA = createFoodModel('seafood_platter');
    platterA.position.set(-w * 0.04, floorY + 1.02, counterZ + 0.06);
    const juiceA = createFoodModel('juice_glass');
    juiceA.position.set(w * 0.1, floorY + 1.02, counterZ + 0.08);
    const juiceB = createFoodModel('juice_glass');
    juiceB.position.set(w * 0.18, floorY + 1.02, counterZ + 0.08);
    const parcelBox = createFoodModel('food_parcel_box');
    parcelBox.position.set(w * 0.25, floorY + 1.02, counterZ + 0.08);
    group.add(platterA, juiceA, juiceB, parcelBox);

    registerSteam(-w * 0.26, floorY + 1.9, counterZ - 0.05, 3);
    registerSteam(-w * 0.04, floorY + 1.15, counterZ, 2);

    buildDiningSet(group, assets, w * 0.2, floorY + 0.08, d * 0.18, 'seafood_platter', 'juice_glass');

    spawnNpc('chef', 'chopping_prep', 'young_adult', 31, -w * 0.18, counterZ - 0.85, 0);
    spawnNpc('server', 'pouring_drink', 'worker', 32, w * 0.08, counterZ - 0.85, 0);
    spawnNpc('diner', 'drinking_cup', 'man', 33, w * 0.2 + 0.25, d * 0.18 + 0.62, Math.PI, true, createFoodModel('juice_glass'));
  } else if (params.category === 'tea_shop') {
    // Samovar + Sulaimani & Snacks Glass Case + Outdoor Terrace Bench
    const samovar = new THREE.Mesh(assets.cyl, assets.copperStoveMat);
    samovar.scale.set(0.38, 0.56, 0.38);
    samovar.position.set(-w * 0.22, floorY + 1.28, counterZ);
    const snackTray = createFoodModel('snacks_assortment');
    snackTray.position.set(-w * 0.04, floorY + 1.02, counterZ + 0.08);
    const sulA = createFoodModel('sulaimani_glass');
    sulA.position.set(w * 0.1, floorY + 1.02, counterZ + 0.1);
    const sulB = createFoodModel('chai_glass');
    sulB.position.set(w * 0.18, floorY + 1.02, counterZ + 0.1);
    group.add(samovar, snackTray, sulA, sulB);
    registerSteam(-w * 0.22, floorY + 1.62, counterZ, 4);

    buildDiningSet(group, assets, w * 0.2, floorY + 0.08, d * 0.18, 'pazham_pori_plate', 'sulaimani_glass');

    spawnNpc('chef', 'pouring_drink', 'man', 41, -w * 0.16, counterZ - 0.82, 0);
    spawnNpc('diner', 'drinking_cup', 'elderly', 42, w * 0.2 - 0.25, d * 0.18 - 0.62, 0, true, createFoodModel('sulaimani_glass'));
    spawnNpc('pickup_customer', 'chatting', 'woman', 43, -w * 0.1, counterZ + 0.95, Math.PI);
  } else {
    // Malabar Restaurant: Banana-Leaf Kerala Meals + Porotta & Curry Station + Appam Stew
    const mealsA = createFoodModel('kerala_meals');
    mealsA.position.set(-w * 0.2, floorY + 1.02, counterZ + 0.06);
    const porotta = createFoodModel('porotta_roast');
    porotta.position.set(-w * 0.04, floorY + 1.02, counterZ + 0.06);
    const appam = createFoodModel('appam_stew');
    appam.position.set(w * 0.11, floorY + 1.02, counterZ + 0.06);
    const pothichoru = createFoodModel('pothichoru_bundle');
    pothichoru.position.set(w * 0.23, floorY + 1.02, counterZ + 0.08);
    group.add(mealsA, porotta, appam, pothichoru);

    registerSteam(-w * 0.04, floorY + 1.18, counterZ, 3);

    buildDiningSet(group, assets, w * 0.2, floorY + 0.08, d * 0.18, 'kerala_meals', 'porotta_roast');
    if (w >= 15) {
      buildDiningSet(group, assets, -w * 0.22, floorY + 0.08, d * 0.18, 'appam_stew', 'chai_glass');
    }

    spawnNpc('chef', 'chopping_prep', 'worker', 51, -w * 0.16, counterZ - 0.85, 0);
    spawnNpc('server', 'plating_food', 'woman', 52, w * 0.08, counterZ - 0.85, 0);
    spawnNpc('diner', 'eating_meal', 'man', 53, w * 0.2 - 0.25, d * 0.18 - 0.62, 0, true);
    spawnNpc('pickup_customer', 'queuing_pickup', 'shop_customer', 54, -w * 0.02, counterZ + 0.95, Math.PI);
  }

  // Outdoor sidewalk patio showcase bistro table right under awning outside left bay
  const patioFood: KozhikodeFoodModelKind =
    params.category === 'bakery'
      ? 'bakery_tray'
      : params.category === 'biryani_shop'
        ? 'biryani_plate'
        : params.category === 'fast_food'
          ? 'seafood_platter'
          : params.category === 'tea_shop'
            ? 'pazham_pori_plate'
            : 'porotta_roast';
  const patioStand = new THREE.Group();
  patioStand.position.set(-w * 0.34, 0.18, d / 2 + 0.55);
  addBox(patioStand, assets.box, assets.woodTableMat, 0.88, 0.06, 0.62, 0, 0.72, 0, true);
  addBox(patioStand, assets.box, assets.chairFrameMat, 0.12, 0.72, 0.12, 0, 0.36, 0, false);
  const patioPlate = createFoodModel(patioFood);
  patioPlate.position.set(-0.14, 0.75, 0);
  const patioDrink = createFoodModel(params.category === 'fast_food' ? 'juice_glass' : 'chai_glass');
  patioDrink.position.set(0.24, 0.75, 0.06);
  patioStand.add(patioPlate, patioDrink);
  group.add(patioStand);

  const cos = Math.cos(params.rotY);
  const sin = Math.sin(params.rotY);
  const localGlow = new THREE.Vector3(0, floorY + h - 0.7, 0.2);
  const worldGlow = new THREE.Vector3(
    params.worldX + localGlow.x * cos + localGlow.z * sin,
    0.18 + localGlow.y,
    params.worldZ - localGlow.x * sin + localGlow.z * cos,
  );

  const instance: AnimatedRestaurantInstance = {
    buildingId: params.buildingId,
    category: params.category,
    worldX: params.worldX,
    worldZ: params.worldZ,
    interiorGlowLocal: worldGlow,
    ceilingFans,
    rotisseries,
    steamPuffs,
    warmGlassPanels,
    npcs,
    update(dt, simTimeSec, playerX, playerZ, nightGlowFactor) {
      const dist = Math.hypot(playerX - params.worldX, playerZ - params.worldZ);
      if (dist > 82) return;

      // Spin ceiling fans smoothly
      const fanSpeed = 5.4;
      for (let i = 0; i < ceilingFans.length; i++) {
        const spin = ceilingFans[i].userData.spinTarget as THREE.Object3D | undefined;
        if (spin) {
          spin.rotation.y = (spin.rotation.y + dt * fanSpeed) % (Math.PI * 2);
        }
      }

      // Spin fast-food shawarma rotisserie
      for (let i = 0; i < rotisseries.length; i++) {
        rotisseries[i].rotation.y = (rotisseries[i].rotation.y + dt * 0.95) % (Math.PI * 2);
      }

      // Multi-puff rising kitchen steam
      if (dist <= 52) {
        for (let i = 0; i < steamPuffs.length; i++) {
          const slot = steamPuffs[i];
          const p = (simTimeSec * 0.55 + slot.phase) % 1;
          slot.mesh.position.set(
            slot.baseX + Math.sin(simTimeSec * 2.2 + i) * slot.driftRadius * p,
            slot.baseY + p * 0.56,
            slot.baseZ + Math.cos(simTimeSec * 1.9 + i) * slot.driftRadius * p,
          );
          const s = 0.09 + Math.sin(p * Math.PI) * 0.12;
          slot.mesh.scale.setScalar(s);
          slot.mesh.visible = p < 0.94;
        }
      }

      // Interior staff & customer state animation
      if (dist <= 62) {
        for (let i = 0; i < npcs.length; i++) {
          updateNpcStatePose(npcs[i], dt, simTimeSec);
        }
      }

      // Scale interior lamp brightness seamlessly with Kozhikode dusk/night glow
      assets.warmInteriorGlowMat.emissiveIntensity = 0.48 + nightGlowFactor * 0.95;
      assets.lanternEmissiveMat.emissiveIntensity = 0.72 + nightGlowFactor * 1.65;
    },
  };

  return { group, instance };
}
