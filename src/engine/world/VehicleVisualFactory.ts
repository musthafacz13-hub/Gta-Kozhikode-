import * as THREE from 'three';
import type { VehicleAudioKind } from '../audio/AudioTypes.ts';
import type { MaterialLibrary } from '../rendering/MaterialLibrary.ts';

export type VehicleModelId =
  | 'maruti_swift'
  | 'maruti_alto'
  | 'maruti_baleno'
  | 'maruti_wagonr'
  | 'hyundai_i20'
  | 'hyundai_creta'
  | 'tata_nexon'
  | 'suzuki_access_125'
  | 'honda_activa'
  | 'hero_commuter'
  | 'yamaha_fz'
  | 'royal_enfield'
  | 'ksrtc_bus'
  | 'kerala_private_bus'
  | 'auto_rickshaw'
  | 'delivery_van'
  | 'goods_truck';

export type VehicleFleetCategory =
  | 'car'
  | 'suv'
  | 'scooter'
  | 'motorcycle'
  | 'auto_rickshaw'
  | 'bus'
  | 'delivery'
  | 'truck';

export interface VehicleBlueprintMeta {
  modelId: VehicleModelId;
  displayName: string;
  category: VehicleFleetCategory;
  length: number;
  width: number;
  height: number;
  wheelRadius: number;
  cruiseSpeedMps: number;
  maxSpeedMps: number;
  accelMps2: number;
  brakeMps2: number;
  audioKind: VehicleAudioKind;
  defaultColors: number[];
  drivableHookEligible: boolean;
}

export const VEHICLE_BLUEPRINT_META: Record<VehicleModelId, VehicleBlueprintMeta> = {
  maruti_swift: {
    modelId: 'maruti_swift',
    displayName: 'Maruti Suzuki Swift',
    category: 'car',
    length: 3.84,
    width: 1.74,
    height: 1.53,
    wheelRadius: 0.31,
    cruiseSpeedMps: 10.5,
    maxSpeedMps: 17.5,
    accelMps2: 4.2,
    brakeMps2: 7.5,
    audioKind: 'car',
    defaultColors: [0xdc2626, 0xf8fafc, 0x2563eb, 0x94a3b8],
    drivableHookEligible: true,
  },
  maruti_alto: {
    modelId: 'maruti_alto',
    displayName: 'Maruti Suzuki Alto',
    category: 'car',
    length: 3.45,
    width: 1.52,
    height: 1.48,
    wheelRadius: 0.28,
    cruiseSpeedMps: 9.2,
    maxSpeedMps: 15.0,
    accelMps2: 3.5,
    brakeMps2: 6.8,
    audioKind: 'car',
    defaultColors: [0xf1f5f9, 0xcbd5e1, 0x0284c7, 0xb91c1c],
    drivableHookEligible: true,
  },
  maruti_baleno: {
    modelId: 'maruti_baleno',
    displayName: 'Maruti Suzuki Baleno',
    category: 'car',
    length: 3.99,
    width: 1.76,
    height: 1.5,
    wheelRadius: 0.32,
    cruiseSpeedMps: 10.8,
    maxSpeedMps: 18.0,
    accelMps2: 4.3,
    brakeMps2: 7.6,
    audioKind: 'car',
    defaultColors: [0x1e3a8a, 0xe2e8f0, 0x475569, 0x991b1b],
    drivableHookEligible: true,
  },
  maruti_wagonr: {
    modelId: 'maruti_wagonr',
    displayName: 'Maruti Suzuki WagonR',
    category: 'car',
    length: 3.65,
    width: 1.62,
    height: 1.68,
    wheelRadius: 0.29,
    cruiseSpeedMps: 9.4,
    maxSpeedMps: 15.5,
    accelMps2: 3.6,
    brakeMps2: 6.9,
    audioKind: 'car',
    defaultColors: [0xf8fafc, 0x94a3b8, 0x78350f, 0x0369a1],
    drivableHookEligible: true,
  },
  hyundai_i20: {
    modelId: 'hyundai_i20',
    displayName: 'Hyundai i20',
    category: 'car',
    length: 3.98,
    width: 1.77,
    height: 1.51,
    wheelRadius: 0.32,
    cruiseSpeedMps: 10.8,
    maxSpeedMps: 18.2,
    accelMps2: 4.4,
    brakeMps2: 7.8,
    audioKind: 'car',
    defaultColors: [0xb91c1c, 0xf8fafc, 0x1e293b, 0x64748b],
    drivableHookEligible: true,
  },
  hyundai_creta: {
    modelId: 'hyundai_creta',
    displayName: 'Hyundai Creta',
    category: 'suv',
    length: 4.3,
    width: 1.8,
    height: 1.66,
    wheelRadius: 0.36,
    cruiseSpeedMps: 11.2,
    maxSpeedMps: 19.0,
    accelMps2: 4.5,
    brakeMps2: 7.6,
    audioKind: 'car',
    defaultColors: [0xf8fafc, 0x0f172a, 0x334155, 0x991b1b],
    drivableHookEligible: true,
  },
  tata_nexon: {
    modelId: 'tata_nexon',
    displayName: 'Tata Nexon',
    category: 'suv',
    length: 4.02,
    width: 1.81,
    height: 1.62,
    wheelRadius: 0.35,
    cruiseSpeedMps: 10.8,
    maxSpeedMps: 18.4,
    accelMps2: 4.3,
    brakeMps2: 7.5,
    audioKind: 'car',
    defaultColors: [0x0f766e, 0xf8fafc, 0x1d4ed8, 0x475569],
    drivableHookEligible: true,
  },
  suzuki_access_125: {
    modelId: 'suzuki_access_125',
    displayName: 'Suzuki Access 125',
    category: 'scooter',
    length: 1.84,
    width: 0.68,
    height: 1.12,
    wheelRadius: 0.21,
    cruiseSpeedMps: 8.8,
    maxSpeedMps: 14.5,
    accelMps2: 4.8,
    brakeMps2: 7.8,
    audioKind: 'scooter',
    defaultColors: [0x0f766e, 0xf8fafc, 0x1e3a8a, 0x94a3b8],
    drivableHookEligible: true,
  },
  honda_activa: {
    modelId: 'honda_activa',
    displayName: 'Honda Activa',
    category: 'scooter',
    length: 1.82,
    width: 0.7,
    height: 1.12,
    wheelRadius: 0.21,
    cruiseSpeedMps: 8.6,
    maxSpeedMps: 14.0,
    accelMps2: 4.6,
    brakeMps2: 7.6,
    audioKind: 'scooter',
    defaultColors: [0xe2e8f0, 0x1e293b, 0x991b1b, 0x0369a1],
    drivableHookEligible: true,
  },
  hero_commuter: {
    modelId: 'hero_commuter',
    displayName: 'Hero Commuter Motorcycle',
    category: 'motorcycle',
    length: 1.98,
    width: 0.72,
    height: 1.08,
    wheelRadius: 0.25,
    cruiseSpeedMps: 9.8,
    maxSpeedMps: 16.5,
    accelMps2: 5.0,
    brakeMps2: 8.0,
    audioKind: 'motorcycle',
    defaultColors: [0x111827, 0xb91c1c, 0x1e40af],
    drivableHookEligible: true,
  },
  yamaha_fz: {
    modelId: 'yamaha_fz',
    displayName: 'Yamaha Sports Motorcycle',
    category: 'motorcycle',
    length: 2.02,
    width: 0.78,
    height: 1.08,
    wheelRadius: 0.26,
    cruiseSpeedMps: 11.2,
    maxSpeedMps: 19.5,
    accelMps2: 5.8,
    brakeMps2: 8.5,
    audioKind: 'motorcycle',
    defaultColors: [0x1d4ed8, 0x0f172a, 0xdc2626],
    drivableHookEligible: true,
  },
  royal_enfield: {
    modelId: 'royal_enfield',
    displayName: 'Royal Enfield Classic',
    category: 'motorcycle',
    length: 2.12,
    width: 0.8,
    height: 1.12,
    wheelRadius: 0.27,
    cruiseSpeedMps: 10.2,
    maxSpeedMps: 18.0,
    accelMps2: 5.2,
    brakeMps2: 7.9,
    audioKind: 'motorcycle',
    defaultColors: [0x18181b, 0x14532d, 0x7f1d1d, 0x78350f],
    drivableHookEligible: true,
  },
  ksrtc_bus: {
    modelId: 'ksrtc_bus',
    displayName: 'KSRTC Kerala Bus',
    category: 'bus',
    length: 9.2,
    width: 2.48,
    height: 3.1,
    wheelRadius: 0.46,
    cruiseSpeedMps: 8.4,
    maxSpeedMps: 13.5,
    accelMps2: 2.2,
    brakeMps2: 5.5,
    audioKind: 'ksrtc_bus',
    defaultColors: [0xb91c1c],
    drivableHookEligible: true,
  },
  kerala_private_bus: {
    modelId: 'kerala_private_bus',
    displayName: 'Kerala Private City Bus',
    category: 'bus',
    length: 8.6,
    width: 2.45,
    height: 3.05,
    wheelRadius: 0.45,
    cruiseSpeedMps: 9.0,
    maxSpeedMps: 14.5,
    accelMps2: 2.4,
    brakeMps2: 5.8,
    audioKind: 'private_bus',
    defaultColors: [0x0369a1, 0x047857, 0x9d174d],
    drivableHookEligible: true,
  },
  auto_rickshaw: {
    modelId: 'auto_rickshaw',
    displayName: 'KL-11 Auto-Rickshaw',
    category: 'auto_rickshaw',
    length: 2.6,
    width: 1.34,
    height: 1.72,
    wheelRadius: 0.24,
    cruiseSpeedMps: 8.2,
    maxSpeedMps: 12.8,
    accelMps2: 3.4,
    brakeMps2: 6.5,
    audioKind: 'auto_rickshaw',
    defaultColors: [0xf59e0b],
    drivableHookEligible: true,
  },
  delivery_van: {
    modelId: 'delivery_van',
    displayName: 'Malabar Delivery Van',
    category: 'delivery',
    length: 4.45,
    width: 1.68,
    height: 2.25,
    wheelRadius: 0.32,
    cruiseSpeedMps: 8.5,
    maxSpeedMps: 14.0,
    accelMps2: 3.0,
    brakeMps2: 6.0,
    audioKind: 'car',
    defaultColors: [0xf8fafc, 0x1d4ed8],
    drivableHookEligible: true,
  },
  goods_truck: {
    modelId: 'goods_truck',
    displayName: 'Kerala Goods Carrier Lorry',
    category: 'truck',
    length: 6.4,
    width: 2.26,
    height: 2.75,
    wheelRadius: 0.42,
    cruiseSpeedMps: 7.6,
    maxSpeedMps: 12.5,
    accelMps2: 2.1,
    brakeMps2: 5.0,
    audioKind: 'truck',
    defaultColors: [0xd97706, 0x1d4ed8, 0x15803d],
    drivableHookEligible: true,
  },
};

export const ALL_VEHICLE_MODEL_IDS = Object.keys(VEHICLE_BLUEPRINT_META) as VehicleModelId[];

const sharedMaterials = {
  tireMat: new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.88, metalness: 0.05 }),
  rimMat: new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.28, metalness: 0.88 }),
  chromeMat: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2, metalness: 0.92 }),
  blackTrimMat: new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.65, metalness: 0.15 }),
  darkChassisMat: new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.72, metalness: 0.25 }),
  glassMat: new THREE.MeshPhysicalMaterial({ color: 0x0f172a, roughness: 0.08, metalness: 0.18, clearcoat: 1.0 }),
  clearGlassMat: new THREE.MeshPhysicalMaterial({
    color: 0xe0f2fe,
    roughness: 0.08,
    transparent: true,
    opacity: 0.56,
    clearcoat: 1.0,
  }),
  tailLampMat: new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0x991b1b, emissiveIntensity: 0.65 }),
  yellowTaxiMat: new THREE.MeshPhysicalMaterial({ color: 0xf59e0b, roughness: 0.26, metalness: 0.15, clearcoat: 0.85 }),
  canopyMat: new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 }),
  ksrtcRedMat: new THREE.MeshPhysicalMaterial({ color: 0xb91c1c, roughness: 0.28, metalness: 0.18, clearcoat: 0.8 }),
  ksrtcYellowMat: new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.35 }),
  creamMat: new THREE.MeshPhysicalMaterial({ color: 0xfef3c7, roughness: 0.35, clearcoat: 0.6 }),
  saddleBrownMat: new THREE.MeshStandardMaterial({ color: 0x5c3317, roughness: 0.72 }),
  riderShirtMat: new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 }),
  riderSkinMat: new THREE.MeshStandardMaterial({ color: 0x8d5524, roughness: 0.72 }),
  helmetMat: new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35, metalness: 0.3 }),
};

const bodyPaintCache = new Map<number, THREE.MeshPhysicalMaterial>();
function getBodyPaintMat(colorHex: number): THREE.MeshPhysicalMaterial {
  let mat = bodyPaintCache.get(colorHex);
  if (!mat) {
    mat = new THREE.MeshPhysicalMaterial({
      color: colorHex,
      roughness: 0.24,
      metalness: 0.34,
      clearcoat: 0.9,
    });
    bodyPaintCache.set(colorHex, mat);
  }
  return mat;
}

const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
const unitCylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
unitBoxGeo.userData.shared = true;
unitCylGeo.userData.shared = true;

function addPart(
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
  castShadow = true,
): THREE.Mesh {
  const mesh = new THREE.Mesh(unitBoxGeo, mat);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(px, py, pz);
  if (rotX || rotY || rotZ) mesh.rotation.set(rotX, rotY, rotZ);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addCylPart(
  parent: THREE.Object3D,
  mat: THREE.Material,
  radius: number,
  len: number,
  px: number,
  py: number,
  pz: number,
  rotX = 0,
  rotY = 0,
  rotZ = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(unitCylGeo, mat);
  mesh.scale.set(radius * 2, len, radius * 2);
  mesh.position.set(px, py, pz);
  if (rotX || rotY || rotZ) mesh.rotation.set(rotX, rotY, rotZ);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function buildWheel(radius: number, width: number): THREE.Group {
  const wheel = new THREE.Group();
  const tire = new THREE.Mesh(unitCylGeo, sharedMaterials.tireMat);
  tire.scale.set(radius * 2, width, radius * 2);
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  const rim = new THREE.Mesh(unitCylGeo, sharedMaterials.rimMat);
  rim.scale.set(radius * 1.14, width + 0.02, radius * 1.14);
  rim.rotation.z = Math.PI / 2;
  wheel.add(tire, rim);
  return wheel;
}

function addSeatedRider(parent: THREE.Object3D, seatY: number, seatZ: number, leanForward = 0.14): void {
  const rider = new THREE.Group();
  rider.position.set(0, seatY, seatZ);
  addPart(rider, sharedMaterials.blackTrimMat, 0.28, 0.38, 0.18, 0, 0.04, 0.14, -0.85, 0, 0, false);
  const torso = addPart(rider, sharedMaterials.riderShirtMat, 0.38, 0.48, 0.22, 0, 0.3, 0.04, leanForward, 0, 0, true);
  void torso;
  // Arms reaching forward to handlebar
  for (const sx of [-0.21, 0.21]) {
    addPart(rider, sharedMaterials.riderShirtMat, 0.09, 0.4, 0.1, sx, 0.34, 0.24, -1.05, 0, 0, false);
  }
  const head = new THREE.Mesh(unitCylGeo, sharedMaterials.helmetMat);
  head.scale.set(0.26, 0.26, 0.26);
  head.position.set(0, 0.66, 0.08 + leanForward * 0.25);
  rider.add(head);
  parent.add(rider);
}

function wrapWithLod(
  detailed: THREE.Object3D,
  proxySize: [number, number, number],
  proxyColor: number,
  lodMidDist = 90,
  wheels: THREE.Object3D[] = [],
): THREE.LOD {
  const lod = new THREE.LOD();
  lod.addLevel(detailed, 0);

  const proxy = new THREE.Mesh(unitBoxGeo, getBodyPaintMat(proxyColor));
  proxy.scale.set(proxySize[0], proxySize[1], proxySize[2]);
  proxy.position.y = proxySize[1] * 0.5;
  lod.addLevel(proxy, lodMidDist);
  lod.userData.wheels = wheels;
  return lod;
}

function buildHatchbackOrSuv(
  modelId:
    | 'maruti_swift'
    | 'maruti_alto'
    | 'maruti_baleno'
    | 'maruti_wagonr'
    | 'hyundai_i20'
    | 'hyundai_creta'
    | 'tata_nexon',
  mats: MaterialLibrary,
  colorHex: number,
  lodDist: number,
): THREE.LOD {
  const meta = VEHICLE_BLUEPRINT_META[modelId];
  const car = new THREE.Group();
  const bodyMat = getBodyPaintMat(colorHex);
  const wheels: THREE.Object3D[] = [];

  const isSuv = modelId === 'hyundai_creta' || modelId === 'tata_nexon';
  const isWagonR = modelId === 'maruti_wagonr';
  const isAlto = modelId === 'maruti_alto';
  const isSwift = modelId === 'maruti_swift';
  const isNexon = modelId === 'tata_nexon';
  const isCreta = modelId === 'hyundai_creta';

  const groundClr = isSuv ? 0.24 : isWagonR ? 0.2 : 0.17;
  const lowerH = isSuv ? 0.64 : isWagonR ? 0.68 : isAlto ? 0.54 : 0.58;
  const greenhouseH = isWagonR ? 0.72 : isSuv ? 0.58 : isAlto ? 0.52 : 0.52;
  const bodyW = meta.width;
  const len = meta.length;

  // Lower body shell + front hood section (distinct hood overhang & slope)
  const hoodLen = isWagonR ? len * 0.22 : isAlto ? len * 0.25 : isSwift ? len * 0.28 : len * 0.3;
  const mainLen = len - hoodLen * 0.35;
  addPart(car, bodyMat, bodyW, lowerH, mainLen, 0, groundClr + lowerH * 0.5, -hoodLen * 0.18);

  // Sloped distinctive hood per model
  const hoodSlope = isSwift ? 0.14 : isCreta ? 0.05 : isWagonR ? 0.18 : 0.11;
  const hoodHeight = isSuv ? lowerH * 0.88 : isWagonR ? lowerH * 0.8 : lowerH * 0.78;
  addPart(
    car,
    bodyMat,
    bodyW * 0.96,
    hoodHeight,
    hoodLen,
    0,
    groundClr + hoodHeight * 0.48,
    len * 0.5 - hoodLen * 0.52,
    hoodSlope,
  );

  // Front & rear bumpers + SUV cladding
  addPart(car, sharedMaterials.blackTrimMat, bodyW * 0.99, 0.18, 0.16, 0, groundClr + 0.08, len * 0.5 + 0.01);
  addPart(car, sharedMaterials.blackTrimMat, bodyW * 0.99, 0.18, 0.16, 0, groundClr + 0.08, -len * 0.5 - 0.01);
  if (isSuv) {
    // Cladding side skirts & silver skid plate
    for (const sx of [-bodyW * 0.49, bodyW * 0.49]) {
      addPart(car, sharedMaterials.blackTrimMat, 0.06, 0.15, len * 0.86, sx, groundClr + 0.07, 0);
    }
    addPart(car, sharedMaterials.rimMat, bodyW * 0.55, 0.11, 0.12, 0, groundClr + 0.05, len * 0.5 + 0.05);
  }

  // Distinct radiator grille
  const grilleW = modelId === 'maruti_baleno' || modelId === 'hyundai_i20' ? bodyW * 0.64 : bodyW * 0.52;
  addPart(
    car,
    isNexon ? sharedMaterials.chromeMat : sharedMaterials.blackTrimMat,
    grilleW,
    isSuv ? 0.28 : 0.2,
    0.08,
    0,
    groundClr + lowerH * 0.45,
    len * 0.5 + 0.02,
  );

  // Greenhouse / Cabin (Swift has curved floating-pillar rear slope; WagonR has tall boxy cabin; Nexon has coupe rear taper)
  const cabLen = isWagonR ? len * 0.64 : isCreta ? len * 0.58 : isSwift ? len * 0.54 : len * 0.56;
  const cabZ = isWagonR ? -0.18 : isSwift ? -0.26 : -0.22;
  const cabW = isWagonR ? bodyW * 0.9 : bodyW * 0.86;
  addPart(car, sharedMaterials.glassMat, cabW, greenhouseH, cabLen, 0, groundClr + lowerH + greenhouseH * 0.46, cabZ);

  // Sloped windshield + rear hatch glass wedge
  const wsH = greenhouseH * 0.95;
  addPart(
    car,
    sharedMaterials.clearGlassMat,
    cabW * 0.96,
    wsH,
    0.1,
    0,
    groundClr + lowerH + wsH * 0.44,
    cabZ + cabLen * 0.52,
    isWagonR ? -0.34 : -0.58,
  );
  addPart(
    car,
    sharedMaterials.glassMat,
    cabW * 0.94,
    wsH * 0.92,
    0.12,
    0,
    groundClr + lowerH + wsH * 0.42,
    cabZ - cabLen * 0.51,
    isNexon ? 0.62 : isCreta ? 0.24 : isWagonR ? 0.16 : 0.48,
  );

  // Roof cap + model-specific roof features
  const roofMat = isNexon || modelId === 'hyundai_i20' ? sharedMaterials.blackTrimMat : bodyMat;
  addPart(car, roofMat, cabW * 0.96, 0.09, cabLen * 0.9, 0, groundClr + lowerH + greenhouseH, cabZ);
  if (isCreta) {
    // Dual silver SUV roof rails
    for (const rx of [-cabW * 0.4, cabW * 0.4]) {
      addPart(car, sharedMaterials.rimMat, 0.06, 0.07, cabLen * 0.82, rx, groundClr + lowerH + greenhouseH + 0.07, cabZ, 0, 0, 0, false);
    }
  }
  if (isNexon) {
    // Signature Tata Nexon rising ivory/silver beltline stripe
    for (const sx of [-bodyW * 0.46, bodyW * 0.46]) {
      addPart(car, sharedMaterials.chromeMat, 0.04, 0.07, cabLen * 1.05, sx, groundClr + lowerH + 0.02, cabZ, -0.05, 0, 0, false);
    }
  }

  // Headlamps + Taillamps
  for (const hx of [-bodyW * 0.35, bodyW * 0.35]) {
    addPart(car, mats.vehicleHeadlampMat, 0.26, 0.13, 0.08, hx, groundClr + lowerH * 0.62, len * 0.5 + 0.02, 0, 0, 0, false);
    addPart(car, sharedMaterials.tailLampMat, 0.24, 0.12, 0.08, hx, groundClr + lowerH * 0.66, -len * 0.5 - 0.02, 0, 0, 0, false);
    // Side wing mirrors
    addPart(car, bodyMat, 0.14, 0.1, 0.14, hx * 1.48, groundClr + lowerH + 0.08, cabZ + cabLen * 0.36, 0, 0, 0, false);
  }

  // Wheels
  const wbZ = len * 0.32;
  const wxOff = bodyW * 0.48;
  for (const [wx, wz] of [[-wxOff, wbZ], [wxOff, wbZ], [-wxOff, -wbZ], [wxOff, -wbZ]]) {
    const w = buildWheel(meta.wheelRadius, isSuv ? 0.22 : 0.19);
    w.position.set(wx, meta.wheelRadius, wz);
    car.add(w);
    wheels.push(w);
  }

  return wrapWithLod(car, [meta.width, meta.height, meta.length], colorHex, lodDist, wheels);
}

function buildTwoWheeler(
  modelId: 'suzuki_access_125' | 'honda_activa' | 'hero_commuter' | 'yamaha_fz' | 'royal_enfield',
  mats: MaterialLibrary,
  colorHex: number,
  lodDist: number,
  withDriver: boolean,
): THREE.LOD {
  const meta = VEHICLE_BLUEPRINT_META[modelId];
  const bike = new THREE.Group();
  const bodyMat = getBodyPaintMat(colorHex);
  const wheels: THREE.Object3D[] = [];

  if (modelId === 'suzuki_access_125' || modelId === 'honda_activa') {
    const isAccess = modelId === 'suzuki_access_125';
    const seatMat = isAccess ? sharedMaterials.saddleBrownMat : sharedMaterials.blackTrimMat;
    // Step-through deck
    addPart(bike, sharedMaterials.blackTrimMat, 0.4, 0.11, 0.78, 0, 0.28, 0.02);
    // Rear body fairing
    addPart(bike, bodyMat, isAccess ? 0.44 : 0.48, 0.4, 0.72, 0, 0.52, -0.34);
    // Seat
    addPart(bike, seatMat, 0.34, 0.13, 0.68, 0, 0.76, -0.28);
    // Front leg apron (Access 125 has distinct curvy retro upright apron + chrome headlamp bezel; Activa is sharper angled)
    addPart(bike, bodyMat, isAccess ? 0.38 : 0.42, 0.66, 0.22, 0, 0.6, 0.42, isAccess ? -0.14 : -0.24);
    if (isAccess) {
      // Chrome front fender & rear grab rail
      addPart(bike, sharedMaterials.chromeMat, 0.16, 0.1, 0.32, 0, 0.36, 0.56, 0.2);
      addPart(bike, sharedMaterials.chromeMat, 0.32, 0.05, 0.16, 0, 0.8, -0.7, 0, 0, 0, false);
    }
    // Handlebar cowl + mirrors
    addPart(bike, bodyMat, 0.44, 0.16, 0.22, 0, 1.0, 0.4, -0.12);
    addCylPart(bike, sharedMaterials.chromeMat, 0.025, 0.62, 0, 1.0, 0.38, 0, 0, Math.PI / 2);
    // Headlamp + tail lamp
    if (isAccess) {
      addCylPart(bike, sharedMaterials.chromeMat, 0.095, 0.07, 0, 1.0, 0.5, Math.PI / 2);
    }
    addCylPart(bike, mats.vehicleHeadlampMat, isAccess ? 0.078 : 0.09, 0.08, 0, isAccess ? 1.0 : 0.74, isAccess ? 0.53 : 0.52, Math.PI / 2);
    addPart(bike, sharedMaterials.tailLampMat, 0.16, 0.1, 0.06, 0, 0.66, -0.72, 0, 0, 0, false);

    const fw = buildWheel(0.21, 0.1);
    fw.position.set(0, 0.21, 0.56);
    const rw = buildWheel(0.21, 0.11);
    rw.position.set(0, 0.21, -0.52);
    bike.add(fw, rw);
    wheels.push(fw, rw);
    if (withDriver) addSeatedRider(bike, 0.84, -0.22, 0.12);
  } else {
    const isEnfield = modelId === 'royal_enfield';
    const isYamaha = modelId === 'yamaha_fz';
    // Engine block + chassis frame
    addPart(
      bike,
      isEnfield ? sharedMaterials.chromeMat : sharedMaterials.darkChassisMat,
      isEnfield ? 0.38 : 0.34,
      0.38,
      0.54,
      0,
      0.44,
      0.04,
    );
    // Fuel Tank (Enfield teardrop/classic, Yamaha muscular shrouds, Hero slim commuter tank)
    if (isEnfield) {
      addCylPart(bike, bodyMat, 0.19, 0.56, 0, 0.83, 0.22, Math.PI / 2);
      addPart(bike, sharedMaterials.chromeMat, 0.4, 0.05, 0.35, 0, 0.83, 0.22, 0, 0, 0, false);
    } else if (isYamaha) {
      addPart(bike, bodyMat, 0.46, 0.3, 0.56, 0, 0.84, 0.24, -0.1);
      addPart(bike, sharedMaterials.blackTrimMat, 0.48, 0.16, 0.36, 0, 0.68, 0.28, 0.2);
    } else {
      addPart(bike, bodyMat, 0.32, 0.24, 0.56, 0, 0.82, 0.22);
    }

    // Seat (Enfield brown sprung seat / Yamaha split / Hero flat commuter)
    if (isYamaha) {
      addPart(bike, sharedMaterials.blackTrimMat, 0.28, 0.13, 0.38, 0, 0.77, -0.22);
      addPart(bike, sharedMaterials.blackTrimMat, 0.24, 0.13, 0.34, 0, 0.87, -0.54, 0.15);
    } else {
      addPart(
        bike,
        isEnfield ? sharedMaterials.saddleBrownMat : sharedMaterials.blackTrimMat,
        0.3,
        0.13,
        0.7,
        0,
        0.77,
        -0.34,
      );
    }

    // Front forks & handlebar
    for (const fx of [-0.09, 0.09]) {
      addCylPart(bike, sharedMaterials.chromeMat, 0.025, 0.72, fx, 0.6, 0.55, -0.35);
    }
    addCylPart(bike, sharedMaterials.chromeMat, 0.026, isEnfield ? 0.76 : 0.68, 0, 1.02, 0.46, 0, 0, Math.PI / 2);

    // Exhaust(s) — Enfield long chrome pea-shooter, Yamaha stubby fat exhaust
    if (isEnfield) {
      addCylPart(bike, sharedMaterials.chromeMat, 0.048, 1.05, 0.22, 0.3, -0.24, Math.PI / 2);
      addCylPart(bike, sharedMaterials.chromeMat, 0.042, 0.95, -0.22, 0.3, -0.26, Math.PI / 2);
    } else if (isYamaha) {
      addCylPart(bike, sharedMaterials.blackTrimMat, 0.065, 0.55, 0.22, 0.34, -0.34, Math.PI / 2 - 0.16);
    } else {
      addCylPart(bike, sharedMaterials.blackTrimMat, 0.042, 0.82, 0.2, 0.31, -0.3, Math.PI / 2);
    }

    // Headlamp + tail lamp
    addCylPart(bike, sharedMaterials.chromeMat, isEnfield ? 0.11 : 0.095, 0.09, 0, 0.92, 0.62, Math.PI / 2);
    addCylPart(bike, mats.vehicleHeadlampMat, isEnfield ? 0.095 : 0.08, 0.095, 0, 0.92, 0.64, Math.PI / 2);
    addPart(bike, sharedMaterials.tailLampMat, 0.14, 0.08, 0.06, 0, 0.82, -0.76, 0, 0, 0, false);

    const fw = buildWheel(meta.wheelRadius, isYamaha ? 0.11 : 0.09);
    fw.position.set(0, meta.wheelRadius, 0.68);
    const rw = buildWheel(meta.wheelRadius, isYamaha ? 0.15 : 0.11);
    rw.position.set(0, meta.wheelRadius, -0.64);
    bike.add(fw, rw);
    wheels.push(fw, rw);
    if (withDriver) addSeatedRider(bike, 0.83, -0.24, isYamaha ? 0.28 : 0.14);
  }

  return wrapWithLod(bike, [meta.width, meta.height, meta.length], colorHex, lodDist, wheels);
}

function buildBusOrCommercial(
  modelId: 'ksrtc_bus' | 'kerala_private_bus' | 'auto_rickshaw' | 'delivery_van' | 'goods_truck',
  mats: MaterialLibrary,
  colorHex: number,
  lodDist: number,
  withDriver: boolean,
): THREE.LOD {
  const meta = VEHICLE_BLUEPRINT_META[modelId];
  const wheels: THREE.Object3D[] = [];

  if (modelId === 'auto_rickshaw') {
    const auto = new THREE.Group();
    addPart(auto, sharedMaterials.yellowTaxiMat, 1.32, 0.72, 1.45, 0, 0.58, -0.35);
    addPart(auto, sharedMaterials.blackTrimMat, 1.06, 0.76, 0.85, 0, 0.62, 0.76);
    addPart(auto, sharedMaterials.yellowTaxiMat, 0.62, 0.68, 0.35, 0, 0.58, 1.24);
    addPart(auto, sharedMaterials.clearGlassMat, 1.02, 0.62, 0.06, 0, 1.22, 0.92, -0.32);
    addPart(auto, sharedMaterials.canopyMat, 1.34, 0.16, 2.05, 0, 1.62, -0.05);
    for (const sx of [-0.62, 0.62]) {
      addCylPart(auto, sharedMaterials.chromeMat, 0.035, 0.78, sx, 1.22, -0.95);
    }
    for (const hx of [-0.36, 0.36]) {
      addCylPart(auto, mats.vehicleHeadlampMat, 0.085, 0.08, hx, 0.68, 1.42, Math.PI / 2);
      addPart(auto, sharedMaterials.tailLampMat, 0.14, 0.1, 0.05, hx * 1.4, 0.68, -1.09, 0, 0, 0, false);
    }
    const plateTex = mats.textures.createSignTexture('kl11_plate', 'KL 11', 'CALICUT TAXI', '#facc15', '#0f172a');
    const plate = new THREE.Mesh(unitBoxGeo, new THREE.MeshStandardMaterial({ map: plateTex }));
    plate.scale.set(0.42, 0.14, 0.04);
    plate.position.set(0, 0.38, 1.43);
    auto.add(plate);

    if (withDriver) addSeatedRider(auto, 0.62, 0.42, 0.06);

    const fw = buildWheel(0.24, 0.14);
    fw.position.set(0, 0.24, 1.15);
    const rl = buildWheel(0.24, 0.16);
    rl.position.set(-0.62, 0.24, -0.68);
    const rr = buildWheel(0.24, 0.16);
    rr.position.set(0.62, 0.24, -0.68);
    auto.add(fw, rl, rr);
    wheels.push(fw, rl, rr);
    return wrapWithLod(auto, [meta.width, meta.height, meta.length], 0xf59e0b, lodDist, wheels);
  }

  if (modelId === 'ksrtc_bus' || modelId === 'kerala_private_bus') {
    const isKsrtc = modelId === 'ksrtc_bus';
    const bus = new THREE.Group();
    const primaryMat = isKsrtc ? sharedMaterials.ksrtcRedMat : getBodyPaintMat(colorHex);
    const stripeMat = isKsrtc ? sharedMaterials.ksrtcYellowMat : sharedMaterials.creamMat;
    const len = meta.length;

    // Lower body
    addPart(bus, primaryMat, meta.width, 1.24, len, 0, 1.02, 0);
    // Signature belt stripe
    addPart(bus, stripeMat, meta.width + 0.03, 0.24, len - 0.1, 0, 1.48, 0, 0, 0, 0, false);
    if (!isKsrtc) {
      // Kerala private bus bright accent side stripes
      addPart(bus, sharedMaterials.ksrtcYellowMat, meta.width + 0.04, 0.12, len * 0.72, 0, 0.88, -0.35, 0, 0, 0, false);
    }
    // Window band + pillars
    addPart(bus, sharedMaterials.glassMat, meta.width - 0.07, 1.12, len - 0.15, 0, 2.2, 0);
    // Roof cap
    addPart(bus, sharedMaterials.creamMat, meta.width - 0.03, 0.28, len - 0.05, 0, 2.9, 0);

    for (const hx of [-0.85, 0.85]) {
      addPart(bus, mats.vehicleHeadlampMat, 0.28, 0.16, 0.08, hx, 0.72, len * 0.5 + 0.02, 0, 0, 0, false);
      addPart(bus, sharedMaterials.tailLampMat, 0.26, 0.18, 0.08, hx, 0.82, -len * 0.5 - 0.02, 0, 0, 0, false);
    }

    const signKey = isKsrtc ? 'bus_dest_ksrtc' : 'bus_dest_kzd';
    const destTex = isKsrtc
      ? mats.textures.createSignTexture(signKey, 'കെ.എസ്.ആർ.ടി.സി', 'KSRTC SUPER FAST · CLT', '#7f1d1d', '#fde047')
      : mats.textures.createSignTexture(signKey, 'മാനാഞ്ചിറ · ബീച്ച്', 'MANANCHIRA - BEACH', '#09090b', '#fbbf24');
    const dest = new THREE.Mesh(
      unitBoxGeo,
      new THREE.MeshStandardMaterial({ map: destTex, emissive: 0xffffff, emissiveMap: destTex, emissiveIntensity: 0.55 }),
    );
    dest.scale.set(1.78, 0.34, 0.08);
    dest.position.set(0, 2.66, len * 0.5 - 0.04);
    bus.add(dest);

    const wzF = len * 0.31;
    const wzR = -len * 0.3;
    for (const [wx, wz] of [[-1.18, wzF], [1.18, wzF], [-1.18, wzR], [1.18, wzR]]) {
      const w = buildWheel(meta.wheelRadius, 0.28);
      w.position.set(wx, meta.wheelRadius, wz);
      bus.add(w);
      wheels.push(w);
    }
    return wrapWithLod(bus, [meta.width, meta.height, meta.length], isKsrtc ? 0xb91c1c : colorHex, lodDist, wheels);
  }

  if (modelId === 'delivery_van') {
    const van = new THREE.Group();
    const cabMat = getBodyPaintMat(0xf8fafc);
    const boxMat = getBodyPaintMat(colorHex === 0xf8fafc ? 0x1d4ed8 : colorHex);
    addPart(van, cabMat, 1.62, 1.48, 1.55, 0, 1.05, 1.4);
    addPart(van, sharedMaterials.glassMat, 1.48, 0.58, 0.08, 0, 1.42, 2.18);
    addPart(van, boxMat, 1.68, 1.72, 2.75, 0, 1.24, -0.78);
    for (const hx of [-0.56, 0.56]) {
      addPart(van, mats.vehicleHeadlampMat, 0.2, 0.12, 0.08, hx, 0.65, 2.2, 0, 0, 0, false);
    }
    for (const [wx, wz] of [[-0.78, 1.42], [0.78, 1.42], [-0.78, -1.4], [0.78, -1.4]]) {
      const w = buildWheel(meta.wheelRadius, 0.2);
      w.position.set(wx, meta.wheelRadius, wz);
      van.add(w);
      wheels.push(w);
    }
    return wrapWithLod(van, [meta.width, meta.height, meta.length], colorHex, lodDist, wheels);
  }

  // Indian Goods Carrier Lorry (goods_truck)
  const truck = new THREE.Group();
  const cabMat = getBodyPaintMat(colorHex);
  const cargoWoodMat = sharedMaterials.saddleBrownMat;
  addPart(truck, cabMat, 2.12, 1.78, 1.95, 0, 1.32, 2.15);
  addPart(truck, sharedMaterials.ksrtcYellowMat, 2.16, 0.24, 0.2, 0, 0.54, 3.16);
  addPart(truck, sharedMaterials.glassMat, 1.92, 0.64, 0.08, 0, 1.7, 3.14);
  // High timber & tarpaulin goods bed
  addPart(truck, cargoWoodMat, 2.24, 1.45, 4.2, 0, 1.38, -1.05);
  addPart(truck, sharedMaterials.canopyMat, 2.2, 0.72, 4.15, 0, 2.38, -1.05);
  for (const hx of [-0.78, 0.78]) {
    addPart(truck, mats.vehicleHeadlampMat, 0.24, 0.14, 0.08, hx, 0.8, 3.15, 0, 0, 0, false);
    addPart(truck, sharedMaterials.tailLampMat, 0.22, 0.14, 0.08, hx, 0.76, -3.16, 0, 0, 0, false);
  }
  for (const [wx, wz] of [[-1.02, 2.15], [1.02, 2.15], [-1.02, -1.9], [1.02, -1.9]]) {
    const w = buildWheel(meta.wheelRadius, 0.26);
    w.position.set(wx, meta.wheelRadius, wz);
    truck.add(w);
    wheels.push(w);
  }
  return wrapWithLod(truck, [meta.width, meta.height, meta.length], colorHex, lodDist, wheels);
}

export function createVehicleModelLOD(
  modelId: VehicleModelId,
  mats: MaterialLibrary,
  options?: { colorHex?: number; lodDist?: number; withDriver?: boolean },
): THREE.LOD {
  const meta = VEHICLE_BLUEPRINT_META[modelId];
  const colorHex = options?.colorHex ?? meta.defaultColors[0];
  const lodDist = options?.lodDist ?? (meta.category === 'bus' || meta.category === 'truck' ? 115 : meta.category === 'scooter' || meta.category === 'motorcycle' ? 72 : 92);
  const withDriver = options?.withDriver ?? false;

  switch (modelId) {
    case 'maruti_swift':
    case 'maruti_alto':
    case 'maruti_baleno':
    case 'maruti_wagonr':
    case 'hyundai_i20':
    case 'hyundai_creta':
    case 'tata_nexon':
      return buildHatchbackOrSuv(modelId, mats, colorHex, lodDist);
    case 'suzuki_access_125':
    case 'honda_activa':
    case 'hero_commuter':
    case 'yamaha_fz':
    case 'royal_enfield':
      return buildTwoWheeler(modelId, mats, colorHex, lodDist, withDriver);
    case 'ksrtc_bus':
    case 'kerala_private_bus':
    case 'auto_rickshaw':
    case 'delivery_van':
    case 'goods_truck':
      return buildBusOrCommercial(modelId, mats, colorHex, lodDist, withDriver);
  }
}

// Backward-compatible named builders used across Phase 2/4/world tests
export function createAutoRickshawLOD(mats: MaterialLibrary, lodDist = 85): THREE.LOD {
  return createVehicleModelLOD('auto_rickshaw', mats, { lodDist });
}

export function createCityBusLOD(mats: MaterialLibrary, lodDist = 115): THREE.LOD {
  return createVehicleModelLOD('ksrtc_bus', mats, { lodDist });
}

export function createCarLOD(mats: MaterialLibrary, colorHex: number, isSuv = false, lodDist = 90): THREE.LOD {
  return createVehicleModelLOD(isSuv ? 'hyundai_creta' : 'maruti_swift', mats, { colorHex, lodDist });
}

export function createScooterLOD(mats: MaterialLibrary, colorHex = 0x0f766e, lodDist = 65): THREE.LOD {
  return createVehicleModelLOD('suzuki_access_125', mats, { colorHex, lodDist });
}

export function createMotorcycleLOD(mats: MaterialLibrary, colorHex = 0x1d4ed8, lodDist = 70): THREE.LOD {
  return createVehicleModelLOD('yamaha_fz', mats, { colorHex, lodDist });
}

export function createDeliveryTruckLOD(mats: MaterialLibrary, lodDist = 110): THREE.LOD {
  return createVehicleModelLOD('goods_truck', mats, { lodDist });
}

export function createFishingBoatLOD(lodDist = 130): THREE.LOD {
  const boat = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.78 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.5 });
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 });

  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.05, 7.6), hullMat);
  hull.position.set(0, 0.35, 0);
  hull.castShadow = true;
  const bow = new THREE.Mesh(new THREE.ConeGeometry(1.25, 2.2, 4), trimMat);
  bow.rotation.x = Math.PI / 2;
  bow.rotation.z = Math.PI / 4;
  bow.position.set(0, 0.55, 4.7);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.3, 1.8), cabinMat);
  cabin.position.set(0, 1.35, -0.6);
  cabin.castShadow = true;

  boat.add(hull, bow, cabin);
  return wrapWithLod(boat, [2.4, 2.1, 8.8], 0x7c2d12, lodDist);
}
