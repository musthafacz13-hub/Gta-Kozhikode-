import * as THREE from 'three';

export type KeralaPedestrianVariant =
  | 'man'
  | 'woman'
  | 'young_adult'
  | 'elderly'
  | 'student'
  | 'worker'
  | 'shop_customer';

export interface ArticulatedKeralaNpcRig {
  lod: THREE.LOD;
  lod0: THREE.Group;
  bodyRoot: THREE.Group;
  torsoGroup: THREE.Group;
  headGroup: THREE.Group;
  hipL: THREE.Group;
  hipR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  shoulderL: THREE.Group;
  shoulderR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  handL: THREE.Group;
  handR: THREE.Group;
  variant: KeralaPedestrianVariant;
}

const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
const unitCylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
const unitSphereGeo = new THREE.SphereGeometry(0.5, 10, 8);
unitBoxGeo.userData.shared = true;
unitCylGeo.userData.shared = true;
unitSphereGeo.userData.shared = true;

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function getMat(colorHex: number, roughness = 0.8): THREE.MeshStandardMaterial {
  const key = `${colorHex}_${roughness}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: colorHex, roughness });
    matCache.set(key, m);
  }
  return m;
}

const SHIRT_COLORS = [0xf8fafc, 0x0284c7, 0xb45309, 0x0f766e, 0x1d4ed8, 0xd97706, 0x334155];
const SAREE_COLORS = [0xbe123c, 0x0f766e, 0x7e22ce, 0xb45309, 0x0369a1, 0x15803d];
const GOLD_BORDER_MAT = getMat(0xfbbf24, 0.55);
const MUNDU_WHITE_MAT = getMat(0xf8fafc, 0.85);
const LUNGI_CHECK_MAT = getMat(0x1e3a8a, 0.86);
const PANT_DARK_MAT = getMat(0x1e293b, 0.86);
const SKIN_MATS = [getMat(0x8d5524, 0.72), getMat(0x74421d, 0.74), getMat(0x9c6230, 0.72)];
const HAIR_BLACK_MAT = getMat(0x111827, 0.92);
const HAIR_GRAY_MAT = getMat(0xcbd5e1, 0.88);
const SANDAL_MAT = getMat(0x27272a, 0.88);
const BAG_MAT = getMat(0xd97706, 0.82);

export function createKeralaNpcRig(
  variant: KeralaPedestrianVariant,
  seed = 0,
  lodDistance = 56,
): ArticulatedKeralaNpcRig {
  const lod = new THREE.LOD();
  const lod0 = new THREE.Group();
  const lod1 = new THREE.Group();

  const bodyRoot = new THREE.Group();
  lod0.add(bodyRoot);

  const skinMat = SKIN_MATS[Math.abs(seed) % SKIN_MATS.length];
  const isWoman = variant === 'woman' || (variant === 'shop_customer' && seed % 2 === 1);
  const isElderly = variant === 'elderly';
  const isStudent = variant === 'student';
  const isWorker = variant === 'worker';
  const wearsMundu =
    variant === 'man' || variant === 'elderly' || (variant === 'shop_customer' && !isWoman && seed % 2 === 0);

  const primaryHex = isElderly
    ? 0xf8fafc
    : isStudent
      ? 0xbae6fd
      : isWoman
        ? SAREE_COLORS[Math.abs(seed) % SAREE_COLORS.length]
        : SHIRT_COLORS[Math.abs(seed) % SHIRT_COLORS.length];
  const topMat = getMat(primaryHex, 0.82);
  const bottomMat = isWoman
    ? getMat(primaryHex, 0.84)
    : wearsMundu
      ? MUNDU_WHITE_MAT
      : isWorker
        ? LUNGI_CHECK_MAT
        : isStudent
          ? PANT_DARK_MAT
          : PANT_DARK_MAT;
  const hairMat = isElderly ? HAIR_GRAY_MAT : HAIR_BLACK_MAT;

  // Hip pivots at standing pelvis height y = 0.84
  const makeLeg = (sideX: number) => {
    const hip = new THREE.Group();
    hip.position.set(sideX, 0.84, 0);

    const thigh = new THREE.Mesh(unitCylGeo, bottomMat);
    thigh.scale.set(0.15, 0.4, 0.15);
    thigh.position.y = -0.2;
    thigh.castShadow = true;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.set(0, -0.4, 0);
    hip.add(knee);

    const shin = new THREE.Mesh(unitCylGeo, bottomMat);
    shin.scale.set(0.13, 0.38, 0.13);
    shin.position.y = -0.19;
    shin.castShadow = true;
    const foot = new THREE.Mesh(unitBoxGeo, SANDAL_MAT);
    foot.scale.set(0.11, 0.06, 0.22);
    foot.position.set(0, -0.4, 0.04);
    knee.add(shin, foot);

    return { hip, knee };
  };

  const leftLeg = makeLeg(-0.11);
  const rightLeg = makeLeg(0.11);
  bodyRoot.add(leftLeg.hip, rightLeg.hip);

  // Subtle Kerala wrap skirt / mundu / saree lower drape around hips
  if (wearsMundu || isWoman || isWorker) {
    const wrap = new THREE.Mesh(unitCylGeo, bottomMat);
    wrap.scale.set(0.36, 0.42, 0.28);
    wrap.position.set(0, 0.65, 0);
    wrap.castShadow = true;
    bodyRoot.add(wrap);

    if (wearsMundu || isWoman) {
      const border = new THREE.Mesh(unitCylGeo, GOLD_BORDER_MAT);
      border.scale.set(0.368, 0.05, 0.288);
      border.position.set(0, 0.47, 0);
      bodyRoot.add(border);
    }
  }

  // Torso group pivoted at waist (y = 0.86)
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 0.86, 0);
  bodyRoot.add(torsoGroup);

  const torsoW = isWoman ? 0.36 : isStudent ? 0.35 : 0.42;
  const torsoMesh = new THREE.Mesh(unitBoxGeo, topMat);
  torsoMesh.scale.set(torsoW, 0.56, 0.23);
  torsoMesh.position.set(0, 0.28, 0);
  torsoMesh.castShadow = true;
  torsoGroup.add(torsoMesh);

  if (isWoman) {
    // Diagonal Kerala Saree Pallu / Dupatta drape across chest
    const pallu = new THREE.Mesh(unitBoxGeo, getMat(0xfde68a, 0.78));
    pallu.scale.set(0.12, 0.58, 0.25);
    pallu.position.set(0.02, 0.28, 0.01);
    pallu.rotation.z = 0.42;
    torsoGroup.add(pallu);
  } else if (isStudent) {
    // School backpack
    const pack = new THREE.Mesh(unitBoxGeo, getMat(0x0f172a, 0.82));
    pack.scale.set(0.28, 0.36, 0.14);
    pack.position.set(0, 0.3, -0.17);
    pack.castShadow = true;
    torsoGroup.add(pack);
  } else if (isWorker) {
    // Cotton thorthu towel slung over left shoulder
    const thorthu = new THREE.Mesh(unitBoxGeo, MUNDU_WHITE_MAT);
    thorthu.scale.set(0.11, 0.42, 0.27);
    thorthu.position.set(-0.17, 0.39, 0);
    torsoGroup.add(thorthu);
  }

  // Arms with shoulder & elbow pivots
  const makeArm = (sideX: number) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(sideX, 0.5, 0);

    const upperArm = new THREE.Mesh(unitCylGeo, topMat);
    upperArm.scale.set(0.11, 0.26, 0.11);
    upperArm.position.y = -0.13;
    upperArm.castShadow = true;
    shoulder.add(upperArm);

    const elbow = new THREE.Group();
    elbow.position.set(0, -0.26, 0);
    shoulder.add(elbow);

    const forearm = new THREE.Mesh(unitCylGeo, skinMat);
    forearm.scale.set(0.095, 0.25, 0.095);
    forearm.position.y = -0.125;
    elbow.add(forearm);

    const hand = new THREE.Group();
    hand.position.set(0, -0.26, 0);
    const palm = new THREE.Mesh(unitSphereGeo, skinMat);
    palm.scale.set(0.09, 0.09, 0.09);
    hand.add(palm);
    elbow.add(hand);

    return { shoulder, elbow, hand };
  };

  const armOffX = torsoW * 0.5 + 0.065;
  const leftArm = makeArm(-armOffX);
  const rightArm = makeArm(armOffX);
  torsoGroup.add(leftArm.shoulder, rightArm.shoulder);

  if (variant === 'shop_customer') {
    const bag = new THREE.Mesh(unitBoxGeo, BAG_MAT);
    bag.scale.set(0.14, 0.26, 0.22);
    bag.position.set(-0.04, -0.15, 0);
    leftArm.hand.add(bag);
  }

  // Head group pivoted at neck (y = 0.58)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.58, 0);
  torsoGroup.add(headGroup);

  const head = new THREE.Mesh(unitSphereGeo, skinMat);
  head.scale.set(0.27, 0.28, 0.27);
  head.position.y = 0.14;
  head.castShadow = true;
  headGroup.add(head);

  const hairCap = new THREE.Mesh(unitSphereGeo, hairMat);
  hairCap.scale.set(0.285, 0.22, 0.285);
  hairCap.position.set(0, 0.19, -0.015);
  headGroup.add(hairCap);

  if (isWoman) {
    const hairBun = new THREE.Mesh(unitSphereGeo, hairMat);
    hairBun.scale.set(0.14, 0.14, 0.14);
    hairBun.position.set(0, 0.14, -0.16);
    const jasmine = new THREE.Mesh(unitSphereGeo, MUNDU_WHITE_MAT);
    jasmine.scale.set(0.11, 0.07, 0.08);
    jasmine.position.set(0, 0.2, -0.16);
    headGroup.add(hairBun, jasmine);
  }

  // LOD1 lightweight silhouette (2 boxes)
  const lod1Bottom = new THREE.Mesh(unitBoxGeo, bottomMat);
  lod1Bottom.scale.set(0.36, 0.85, 0.24);
  lod1Bottom.position.set(0, 0.425, 0);
  const lod1Top = new THREE.Mesh(unitBoxGeo, topMat);
  lod1Top.scale.set(0.4, 0.82, 0.24);
  lod1Top.position.set(0, 1.26, 0);
  lod1.add(lod1Bottom, lod1Top);

  lod.addLevel(lod0, 0);
  lod.addLevel(lod1, lodDistance);

  return {
    lod,
    lod0,
    bodyRoot,
    torsoGroup,
    headGroup,
    hipL: leftLeg.hip,
    hipR: rightLeg.hip,
    kneeL: leftLeg.knee,
    kneeR: rightLeg.knee,
    shoulderL: leftArm.shoulder,
    shoulderR: rightArm.shoulder,
    elbowL: leftArm.elbow,
    elbowR: rightArm.elbow,
    handL: leftArm.hand,
    handR: rightArm.hand,
    variant,
  };
}

export function poseNpcSeated(rig: ArticulatedKeralaNpcRig, seatHeight = 0.45): void {
  rig.bodyRoot.position.y = seatHeight - 0.84 + 0.06;
  rig.hipL.rotation.x = -1.45;
  rig.hipR.rotation.x = -1.45;
  rig.kneeL.rotation.x = 1.45;
  rig.kneeR.rotation.x = 1.45;
}
