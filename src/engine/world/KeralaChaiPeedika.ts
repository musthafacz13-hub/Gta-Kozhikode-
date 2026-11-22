import * as THREE from 'three';
import type { TeaShopSfxEvent } from '../audio/AudioTypes.ts';
import type { StaticAabbCollider } from '../player/PlayerController.ts';
import type { MaterialLibrary } from '../rendering/MaterialLibrary.ts';
import type { RegisteredBuildingRecord } from './BuildingSystem.ts';
import { worldToGeo } from './GeoProjection.ts';
import { createFoodModel } from './KeralaFoodModels.ts';
import { buildPalmGeometries } from './KeralaPropsAndFoliage.ts';
import {
  createKeralaNpcRig,
  poseNpcSeated,
  type ArticulatedKeralaNpcRig,
} from './KeralaNpcRig.ts';

export type ChaiPeedikaNpcRole =
  | 'bench_sitter'
  | 'tea_holder'
  | 'tea_drinker'
  | 'pazham_pori_eater'
  | 'talking_pair_a'
  | 'talking_pair_b'
  | 'counter_customer'
  | 'shopkeeper_maker'
  | 'shopkeeper_server';

export type ChaiNpcAnimState =
  | 'idle'
  | 'pouring'
  | 'serving'
  | 'drinking'
  | 'eating'
  | 'talking'
  | 'queuing';

export interface ChaiPeedikaPlacement {
  id: string;
  districtId: string;
  name: string;
  malayalamName: string;
  x: number;
  y?: number;
  z: number;
  rotY: number;
}

export interface ChaiPeedikaInstance {
  id: string;
  x: number;
  y: number;
  z: number;
  group: THREE.Group;
  collider: StaticAabbCollider;
  buildingRecord: RegisteredBuildingRecord;
  npcRoles: ChaiPeedikaNpcRole[];
  npcs: Array<{
    role: ChaiPeedikaNpcRole;
    state: ChaiNpcAnimState;
    rig: ArticulatedKeralaNpcRig;
    baseYaw: number;
  }>;
  meterChaiStream: THREE.Mesh;
  servingCupOnCounter: THREE.Group;
  kettleSteamingBall: THREE.Mesh;
  steamPuffs: THREE.Mesh[];
  ceilingFanRotor: THREE.Group;
  sfxTimerSec: number;
  update: (
    dt: number,
    timeSec: number,
    playerX: number,
    playerZ: number,
    onSfx?: (event: TeaShopSfxEvent, distMeters: number) => void,
  ) => number;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitCyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
const unitSphere = new THREE.SphereGeometry(0.5, 10, 8);
unitBox.userData.shared = true;
unitCyl.userData.shared = true;
unitSphere.userData.shared = true;

let sharedPalmGeos: ReturnType<typeof buildPalmGeometries> | null = null;

const shopMats = {
  steelMat: new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.25, metalness: 0.88 }),
  brassMat: new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.28, metalness: 0.82 }),
  chaiStreamMat: new THREE.MeshStandardMaterial({
    color: 0xd99b66,
    emissive: 0x7c3f12,
    emissiveIntensity: 0.28,
    transparent: true,
    opacity: 0.9,
  }),
  glassCaseMat: new THREE.MeshPhysicalMaterial({
    color: 0xe0f2fe,
    roughness: 0.08,
    transparent: true,
    opacity: 0.36,
    clearcoat: 1.0,
  }),
  plasticBlueMat: new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.45 }),
  plasticRedMat: new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.45 }),
  warmWoodMat: new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.78 }),
  shopTealMat: new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.72 }),
  steamMat: new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  }),
};

function makeBox(
  parent: THREE.Object3D,
  mat: THREE.Material,
  sx: number,
  sy: number,
  sz: number,
  px: number,
  py: number,
  pz: number,
  rotX = 0,
  rotY = 0,
  rotZ = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(unitBox, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(px, py, pz);
  if (rotX || rotY || rotZ) m.rotation.set(rotX, rotY, rotZ);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function createWoodenBench(parent: THREE.Object3D, px: number, pz: number, rotY = 0): void {
  const bench = new THREE.Group();
  bench.position.set(px, 0, pz);
  bench.rotation.y = rotY;
  makeBox(bench, shopMats.warmWoodMat, 1.75, 0.08, 0.44, 0, 0.44, 0);
  for (const lx of [-0.72, 0.72]) {
    makeBox(bench, shopMats.warmWoodMat, 0.08, 0.42, 0.38, lx, 0.21, 0);
  }
  parent.add(bench);
}

function createPlasticChair(parent: THREE.Object3D, px: number, pz: number, rotY: number, mat: THREE.Material): void {
  const chair = new THREE.Group();
  chair.position.set(px, 0, pz);
  chair.rotation.y = rotY;
  makeBox(chair, mat, 0.46, 0.06, 0.44, 0, 0.44, 0);
  makeBox(chair, mat, 0.44, 0.46, 0.06, 0, 0.68, -0.2);
  for (const [lx, lz] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) {
    makeBox(chair, mat, 0.05, 0.44, 0.05, lx, 0.22, lz);
  }
  parent.add(chair);
}

function createSmallTeaTable(parent: THREE.Object3D, px: number, pz: number): void {
  const table = new THREE.Group();
  table.position.set(px, 0, pz);
  makeBox(table, shopMats.steelMat, 0.88, 0.05, 0.68, 0, 0.72, 0);
  for (const [lx, lz] of [[-0.36, -0.26], [0.36, -0.26], [-0.36, 0.26], [0.36, 0.26]]) {
    makeBox(table, shopMats.steelMat, 0.045, 0.72, 0.045, lx, 0.36, lz);
  }
  const cup1 = createFoodModel('chai_glass');
  cup1.position.set(-0.22, 0.745, 0.08);
  const cup2 = createFoodModel('sulaimani_glass');
  cup2.position.set(0.22, 0.745, -0.06);
  const snacksPlate = createFoodModel('pazham_pori_plate');
  snacksPlate.scale.setScalar(0.82);
  snacksPlate.position.set(0.02, 0.745, 0.04);
  table.add(cup1, cup2, snacksPlate);
  parent.add(table);
}

function resolveDefaultState(role: ChaiPeedikaNpcRole): ChaiNpcAnimState {
  switch (role) {
    case 'shopkeeper_maker':
      return 'pouring';
    case 'shopkeeper_server':
      return 'serving';
    case 'tea_drinker':
      return 'drinking';
    case 'pazham_pori_eater':
      return 'eating';
    case 'talking_pair_a':
    case 'talking_pair_b':
      return 'talking';
    case 'counter_customer':
      return 'queuing';
    default:
      return 'idle';
  }
}

export function buildKeralaChaiPeedika(
  placement: ChaiPeedikaPlacement,
  mats: MaterialLibrary,
): ChaiPeedikaInstance {
  const baseY = placement.y ?? 0.18;
  const root = new THREE.Group();
  root.position.set(placement.x, baseY, placement.z);
  root.rotation.y = placement.rotY;

  // Raised cement shop floor pad (8.8m x 6.0m)
  makeBox(root, mats.sidewalkMat, 8.8, 0.14, 6.0, 0, 0.07, 0);

  // Rear shop stall booth (wood + Kerala teal painted timber + counter + eaves)
  makeBox(root, shopMats.shopTealMat, 5.4, 2.75, 0.22, -0.4, 1.45, -2.35);
  makeBox(root, shopMats.warmWoodMat, 0.22, 2.75, 2.6, -3.0, 1.45, -1.1);
  makeBox(root, shopMats.warmWoodMat, 0.22, 2.75, 2.6, 2.2, 1.45, -1.1);

  for (const px of [-3.0, -0.4, 2.2]) {
    const post = new THREE.Mesh(unitCyl, mats.teakWoodMat);
    post.scale.set(0.14, 2.7, 0.14);
    post.position.set(px, 1.45, 1.4);
    post.castShadow = true;
    root.add(post);
  }
  makeBox(root, mats.terracottaRoofMat, 6.2, 0.16, 4.4, -0.4, 2.95, -0.45, 0.16, 0, 0);

  // Warm hanging bulb + spinning ceiling fan under the tea stall eaves
  const bulb = new THREE.Mesh(unitSphere, mats.streetLampBulbMat);
  bulb.scale.set(0.24, 0.28, 0.24);
  bulb.position.set(-0.4, 2.48, -0.55);
  root.add(bulb);

  const ceilingFanRotor = new THREE.Group();
  ceilingFanRotor.position.set(-0.4, 2.58, 0.45);
  const fanStem = new THREE.Mesh(unitCyl, shopMats.steelMat);
  fanStem.scale.set(0.05, 0.34, 0.05);
  fanStem.position.y = 0.17;
  ceilingFanRotor.add(fanStem);
  for (let b = 0; b < 3; b++) {
    const bw = new THREE.Group();
    bw.rotation.y = (b / 3) * Math.PI * 2;
    const blade = new THREE.Mesh(unitBox, shopMats.warmWoodMat);
    blade.scale.set(0.55, 0.02, 0.11);
    blade.position.set(0.32, 0, 0);
    bw.add(blade);
    ceilingFanRotor.add(bw);
  }
  root.add(ceilingFanRotor);

  // Bilingual Malayalam + English Chai Peedika Signboard
  const signMat = mats.getSignMaterial(
    `chai_peedika_${placement.id}`,
    'മലബാർ ചായക്കട · CHAI PEEDIKA',
    'METER CHAI · PAZHAM PORI · SULAIMANI',
    '#7c2d12',
    '#fde68a',
  );
  makeBox(root, signMat, 4.8, 0.72, 0.14, -0.4, 3.22, 1.45);

  // Tea preparation counter (wood body + stainless steel top)
  makeBox(root, shopMats.warmWoodMat, 4.7, 0.96, 0.85, -0.4, 0.56, -0.45);
  makeBox(root, shopMats.steelMat, 4.85, 0.08, 0.95, -0.4, 1.08, -0.45);

  // Brass/Copper Tea Samovar Boiler + Aluminum Kettle + Multi-Puff Steam Pool
  const samovar = new THREE.Mesh(unitCyl, shopMats.brassMat);
  samovar.scale.set(0.36, 0.56, 0.36);
  samovar.position.set(-1.75, 1.4, -0.5);
  samovar.castShadow = true;
  const samovarCap = new THREE.Mesh(unitSphere, shopMats.brassMat);
  samovarCap.scale.set(0.28, 0.18, 0.28);
  samovarCap.position.set(-1.75, 1.7, -0.5);
  const kettle = new THREE.Mesh(unitCyl, shopMats.steelMat);
  kettle.scale.set(0.24, 0.28, 0.24);
  kettle.position.set(-1.12, 1.26, -0.42);
  const kettleSteam = new THREE.Mesh(unitSphere, shopMats.steamMat);
  kettleSteam.scale.set(0.2, 0.2, 0.2);
  kettleSteam.position.set(-1.75, 1.92, -0.5);
  root.add(samovar, samovarCap, kettle, kettleSteam);

  const steamPuffs: THREE.Mesh[] = [kettleSteam];
  for (let i = 0; i < 4; i++) {
    const puff = new THREE.Mesh(unitSphere, shopMats.steamMat);
    puff.scale.setScalar(0.14);
    puff.position.set(-1.75, 1.85 + i * 0.14, -0.5);
    root.add(puff);
    steamPuffs.push(puff);
  }

  // Steel utensils + crisp 3D Chai & Sulaimani glasses + banana-leaf parcel
  const utensilBowl = new THREE.Mesh(unitCyl, shopMats.steelMat);
  utensilBowl.scale.set(0.32, 0.14, 0.32);
  utensilBowl.position.set(-0.52, 1.19, -0.55);
  makeBox(root, shopMats.steelMat, 0.03, 0.02, 0.28, -0.52, 1.26, -0.55, 0.25, 0.4, 0);
  root.add(utensilBowl);

  for (let i = 0; i < 4; i++) {
    const cup = createFoodModel(i === 3 ? 'sulaimani_glass' : 'chai_glass');
    cup.position.set(-0.2 + i * 0.14, 1.12, -0.25);
    root.add(cup);
  }
  const takeawayParcel = createFoodModel('pothichoru_bundle');
  takeawayParcel.position.set(0.38, 1.12, -0.28);
  root.add(takeawayParcel);

  // Transparent Glass Snack Display Case (stocked with multi-part Pazham Pori, Vada, Samosa)
  const caseX = 1.05;
  const caseZ = -0.38;
  makeBox(root, shopMats.steelMat, 1.45, 0.06, 0.64, caseX, 1.14, caseZ);
  makeBox(root, shopMats.steelMat, 1.45, 0.05, 0.64, caseX, 1.72, caseZ);
  makeBox(root, shopMats.glassCaseMat, 1.42, 0.56, 0.6, caseX, 1.43, caseZ);
  makeBox(root, shopMats.steelMat, 1.36, 0.03, 0.54, caseX, 1.42, caseZ);

  const topSnacks = createFoodModel('pazham_pori_plate');
  topSnacks.scale.setScalar(1.3);
  topSnacks.position.set(caseX - 0.28, 1.43, caseZ);
  const botSnacks = createFoodModel('snacks_assortment');
  botSnacks.scale.setScalar(1.4);
  botSnacks.position.set(caseX + 0.22, 1.17, caseZ);
  root.add(topSnacks, botSnacks);

  const servingCupOnCounter = createFoodModel('chai_glass');
  servingCupOnCounter.position.set(0.12, 1.12, -0.05);
  root.add(servingCupOnCounter);

  const meterChaiStream = new THREE.Mesh(unitCyl, shopMats.chaiStreamMat);
  meterChaiStream.scale.set(0.024, 0.42, 0.024);
  meterChaiStream.position.set(-0.92, 1.56, -0.95);
  root.add(meterChaiStream);

  // Outdoor Roadside Seating: Wooden Benches, Plastic Chairs, Small Tables
  createWoodenBench(root, -1.65, 1.65, 0);
  createWoodenBench(root, 1.25, 1.85, -Math.PI * 0.15);
  createSmallTeaTable(root, -1.65, 0.85);
  createSmallTeaTable(root, 2.75, 0.9);
  createPlasticChair(root, 2.05, 0.9, Math.PI / 2, shopMats.plasticBlueMat);
  createPlasticChair(root, 3.42, 0.9, -Math.PI / 2, shopMats.plasticRedMat);

  if (!sharedPalmGeos) {
    sharedPalmGeos = buildPalmGeometries();
    sharedPalmGeos.trunkGeo.userData.shared = true;
    sharedPalmGeos.crownGeo.userData.shared = true;
    sharedPalmGeos.coconutGeo.userData.shared = true;
  }
  const palm = new THREE.Group();
  palm.position.set(3.85, 0, -1.4);
  const pTrunk = new THREE.Mesh(sharedPalmGeos.trunkGeo, mats.palmTrunkMat);
  const pCrown = new THREE.Mesh(sharedPalmGeos.crownGeo, mats.palmFrondMat);
  const pCoconuts = new THREE.Mesh(sharedPalmGeos.coconutGeo, shopMats.warmWoodMat);
  pTrunk.castShadow = true;
  pCrown.castShadow = true;
  palm.add(pTrunk, pCrown, pCoconuts);
  root.add(palm);

  // --- All 8+ Required Animated Chai Peedika NPCs ---
  const npcs: ChaiPeedikaInstance['npcs'] = [];

  const registerNpc = (
    role: ChaiPeedikaNpcRole,
    variant: Parameters<typeof createKeralaNpcRig>[0],
    seed: number,
    px: number,
    pz: number,
    yaw: number,
  ): ArticulatedKeralaNpcRig => {
    const rig = createKeralaNpcRig(variant, seed, 58);
    rig.lod.position.set(px, 0.14, pz);
    rig.lod.rotation.y = yaw;
    root.add(rig.lod);
    npcs.push({ role, state: resolveDefaultState(role), rig, baseYaw: yaw });
    return rig;
  };

  const benchSitter = registerNpc('bench_sitter', 'elderly', 1, -2.1, 1.68, Math.PI);
  poseNpcSeated(benchSitter, 0.44);

  const teaHolder = registerNpc('tea_holder', 'man', 2, -1.25, 1.68, Math.PI);
  poseNpcSeated(teaHolder, 0.44);
  const heldCupA = createFoodModel('chai_glass');
  heldCupA.position.set(0, -0.04, 0.05);
  teaHolder.handR.add(heldCupA);
  teaHolder.shoulderR.rotation.x = -0.65;
  teaHolder.elbowR.rotation.x = -0.7;

  const teaDrinker = registerNpc('tea_drinker', 'young_adult', 3, 2.05, 0.9, Math.PI / 2);
  poseNpcSeated(teaDrinker, 0.44);
  const heldCupB = createFoodModel('sulaimani_glass');
  heldCupB.position.set(0, -0.04, 0.05);
  teaDrinker.handR.add(heldCupB);

  const eater = registerNpc('pazham_pori_eater', 'worker', 4, 1.25, 1.85, Math.PI * 0.85);
  poseNpcSeated(eater, 0.44);
  const heldPazhamPori = createFoodModel('pazham_pori_plate');
  heldPazhamPori.scale.setScalar(0.5);
  heldPazhamPori.position.set(0, -0.02, 0.06);
  eater.handR.add(heldPazhamPori);

  registerNpc('talking_pair_a', 'man', 5, -2.55, -0.15, Math.PI * 0.35);
  registerNpc('talking_pair_b', 'woman', 6, -1.9, 0.25, -Math.PI * 0.68);
  registerNpc('counter_customer', 'shop_customer', 7, 0.85, 0.25, Math.PI);

  const maker = registerNpc('shopkeeper_maker', 'man', 8, -0.92, -1.25, 0);
  const tumblorTop = new THREE.Mesh(unitCyl, shopMats.steelMat);
  tumblorTop.scale.set(0.085, 0.13, 0.085);
  maker.handL.add(tumblorTop);
  const tumblorLow = createFoodModel('chai_glass');
  tumblorLow.position.set(0, -0.04, 0.02);
  maker.handR.add(tumblorLow);

  const server = registerNpc('shopkeeper_server', 'worker', 9, 0.12, -1.2, 0);
  const trayPlate = new THREE.Mesh(unitCyl, shopMats.steelMat);
  trayPlate.scale.set(0.22, 0.02, 0.22);
  trayPlate.position.set(0, 0, 0.08);
  server.handR.add(trayPlate);

  const cos = Math.abs(Math.cos(placement.rotY));
  const sin = Math.abs(Math.sin(placement.rotY));
  const footprintW = 6.4;
  const footprintD = 4.6;
  const hw = (footprintW * cos + footprintD * sin) * 0.5;
  const hd = (footprintW * sin + footprintD * cos) * 0.5;
  const collider: StaticAabbCollider = {
    minX: placement.x - hw,
    maxX: placement.x + hw,
    minZ: placement.z - hd,
    maxZ: placement.z + hd,
  };

  const interLocalZ = 3.1;
  const interactionPoint = {
    x: Number((placement.x + interLocalZ * Math.sin(placement.rotY)).toFixed(2)),
    y: baseY,
    z: Number((placement.z + interLocalZ * Math.cos(placement.rotY)).toFixed(2)),
  };

  const buildingRecord: RegisteredBuildingRecord = {
    id: placement.id,
    name: placement.name,
    malayalamName: placement.malayalamName,
    districtId: placement.districtId,
    category: 'commercial',
    archetype: 'restaurant',
    lat: worldToGeo(placement.x, placement.z).lat,
    lon: worldToGeo(placement.x, placement.z).lon,
    worldX: placement.x,
    worldZ: placement.z,
    rotY: placement.rotY,
    collider,
    interactionPoint,
    entryPoint: interactionPoint,
    ownershipStatus: 'private_commercial',
    interiorEligible: true,
    futureHooks: { businessTag: 'chai_peedika_kerala' },
  };

  const npcRoles = npcs.map((n) => n.role);

  const instance: ChaiPeedikaInstance = {
    id: placement.id,
    x: placement.x,
    y: baseY,
    z: placement.z,
    group: root,
    collider,
    buildingRecord,
    npcRoles,
    npcs,
    meterChaiStream,
    servingCupOnCounter,
    kettleSteamingBall: kettleSteam,
    steamPuffs,
    ceilingFanRotor,
    sfxTimerSec: 1.5,
    update(dt, timeSec, playerX, playerZ, onSfx) {
      const dist = Math.hypot(playerX - placement.x, playerZ - placement.z);
      if (dist > 78) {
        meterChaiStream.visible = false;
        return dist;
      }

      // Spin stall ceiling fan continuously
      ceilingFanRotor.rotation.y = (ceilingFanRotor.rotation.y + dt * 5.8) % (Math.PI * 2);

      // Multi-puff rising steam pool above Samovar
      for (let pIdx = 0; pIdx < steamPuffs.length; pIdx++) {
        const puff = steamPuffs[pIdx];
        const phase = (timeSec * 0.65 + pIdx / steamPuffs.length) % 1;
        puff.position.set(
          -1.75 + Math.sin(timeSec * 2.1 + pIdx) * 0.08 * phase,
          1.76 + phase * 0.64,
          -0.5 + Math.cos(timeSec * 1.7 + pIdx) * 0.07 * phase,
        );
        const s = 0.09 + Math.sin(phase * Math.PI) * 0.14;
        puff.scale.setScalar(s);
        puff.visible = phase < 0.94;
      }

      const blend = Math.min(1, dt * 8);

      for (let i = 0; i < npcs.length; i++) {
        const entry = npcs[i];
        const rig = entry.rig;
        const t = timeSec + i * 0.45;

        // Smooth organic state switches for dynamic shop feel (zero teleport/snap)
        if (entry.role === 'tea_holder') {
          entry.state = Math.sin(timeSec * 0.45) > 0.35 ? 'drinking' : 'idle';
        } else if (entry.role === 'counter_customer') {
          entry.state = Math.sin(timeSec * 0.4 + 1.2) > 0.25 ? 'talking' : 'queuing';
        }

        switch (entry.role) {
          case 'shopkeeper_maker': {
            const cycle = (Math.sin(timeSec * 2.4) + 1) * 0.5;
            rig.shoulderL.rotation.x = THREE.MathUtils.lerp(rig.shoulderL.rotation.x, -1.35 - cycle * 0.72, blend);
            rig.elbowL.rotation.x = THREE.MathUtils.lerp(rig.elbowL.rotation.x, -0.35 - cycle * 0.35, blend);
            rig.shoulderR.rotation.x = THREE.MathUtils.lerp(rig.shoulderR.rotation.x, -0.75 + cycle * 0.25, blend);
            rig.elbowR.rotation.x = THREE.MathUtils.lerp(rig.elbowR.rotation.x, -0.95 + cycle * 0.2, blend);
            rig.torsoGroup.rotation.x = 0.08 + Math.sin(timeSec * 2.4) * 0.05;
            rig.headGroup.rotation.x = 0.15;
            meterChaiStream.visible = cycle > 0.35;
            meterChaiStream.scale.y = 0.22 + cycle * 0.34;
            meterChaiStream.position.y = 1.38 + cycle * 0.18;
            break;
          }
          case 'shopkeeper_server': {
            const servePhase = (Math.sin(timeSec * 1.35) + 1) * 0.5;
            rig.shoulderR.rotation.x = THREE.MathUtils.lerp(rig.shoulderR.rotation.x, -0.45 - servePhase * 0.72, blend);
            rig.elbowR.rotation.x = THREE.MathUtils.lerp(rig.elbowR.rotation.x, -0.85 + servePhase * 0.45, blend);
            rig.torsoGroup.rotation.x = servePhase * 0.12;
            servingCupOnCounter.position.z = -0.25 + servePhase * 0.22;
            break;
          }
          case 'tea_drinker': {
            const sipWave = Math.max(0, Math.sin(timeSec * 1.1));
            rig.shoulderR.rotation.x = THREE.MathUtils.lerp(rig.shoulderR.rotation.x, -0.55 - sipWave * 0.85, blend);
            rig.elbowR.rotation.x = THREE.MathUtils.lerp(rig.elbowR.rotation.x, -0.72 - sipWave * 0.88, blend);
            rig.headGroup.rotation.x = -sipWave * 0.18;
            break;
          }
          case 'pazham_pori_eater': {
            const eatWave = Math.max(0, Math.sin(timeSec * 1.4 + 0.9));
            rig.shoulderR.rotation.x = THREE.MathUtils.lerp(rig.shoulderR.rotation.x, -0.45 - eatWave * 0.95, blend);
            rig.elbowR.rotation.x = THREE.MathUtils.lerp(rig.elbowR.rotation.x, -0.68 - eatWave * 0.95, blend);
            rig.headGroup.rotation.x = eatWave > 0.7 ? Math.sin(timeSec * 12) * 0.08 : 0.04;
            break;
          }
          case 'talking_pair_a':
          case 'talking_pair_b': {
            const phaseOffset = entry.role === 'talking_pair_a' ? 0 : Math.PI;
            const talkWave = Math.sin(timeSec * 3.1 + phaseOffset);
            rig.shoulderR.rotation.x = THREE.MathUtils.lerp(rig.shoulderR.rotation.x, -0.55 + Math.max(0, talkWave) * 0.45, blend);
            rig.elbowR.rotation.x = THREE.MathUtils.lerp(rig.elbowR.rotation.x, -0.85 - Math.abs(talkWave) * 0.35, blend);
            rig.headGroup.rotation.y = Math.sin(timeSec * 1.8 + phaseOffset) * 0.22;
            rig.headGroup.rotation.x = Math.sin(timeSec * 4.2 + phaseOffset) * 0.08;
            break;
          }
          case 'counter_customer': {
            const talkBoost = entry.state === 'talking' ? Math.sin(t * 2.5) * 0.24 : 0;
            rig.headGroup.rotation.y = Math.sin(t * 0.9) * 0.28;
            rig.shoulderR.rotation.x = THREE.MathUtils.lerp(rig.shoulderR.rotation.x, -0.25 + talkBoost, blend);
            rig.shoulderL.rotation.x = -0.15 + Math.sin(t * 0.7) * 0.05;
            break;
          }
          case 'tea_holder': {
            const sipExtra = entry.state === 'drinking' ? Math.max(0, Math.sin(t * 1.4)) * 0.52 : 0;
            rig.headGroup.rotation.y = Math.sin(t * 0.75) * 0.24;
            rig.shoulderR.rotation.x = THREE.MathUtils.lerp(rig.shoulderR.rotation.x, -0.65 - sipExtra + Math.sin(t * 0.9) * 0.06, blend);
            rig.elbowR.rotation.x = THREE.MathUtils.lerp(rig.elbowR.rotation.x, -0.7 - sipExtra, blend);
            break;
          }
          case 'bench_sitter': {
            rig.headGroup.rotation.y = Math.sin(t * 0.65) * 0.25;
            rig.torsoGroup.rotation.x = Math.sin(t * 0.8) * 0.03;
            break;
          }
        }
      }

      if (onSfx && dist <= 40) {
        instance.sfxTimerSec -= dt;
        if (instance.sfxTimerSec <= 0) {
          instance.sfxTimerSec = 2.2 + ((Math.sin(timeSec * 7.3) + 1) * 0.8);
          const pick = Math.floor(timeSec * 2) % 4;
          const ev: TeaShopSfxEvent =
            pick === 0 ? 'tea_pour' : pick === 1 ? 'glass_clink' : pick === 2 ? 'spoon_stir' : 'snack_fry';
          onSfx(ev, dist);
        }
      }

      return dist;
    },
  };

  return instance;
}
