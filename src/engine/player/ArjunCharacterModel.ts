import * as THREE from 'three';

export type ArjunHairstyleId = 'textured_quiff' | 'short_crop' | 'side_part';
export type ArjunBeardStyleId = 'clean' | 'light_stubble' | 'trimmed_beard';
export type ArjunTopStyleId = 'casual_shirt' | 'henley_tee' | 'polo_tee';
export type ArjunBottomStyleId = 'slim_jeans' | 'chinos' | 'casual_trousers';
export type ArjunShoeStyleId = 'sneakers' | 'sandals';
export type ArjunWatchStyleId = 'none' | 'classic_steel' | 'sport_band';
export type ArjunGlassesStyleId = 'none' | 'wayfarer' | 'aviator';
export type ArjunAccessoryStyleId = 'none' | 'silver_chain' | 'backpack';

export interface ArjunAppearanceConfig {
  hairstyle: ArjunHairstyleId;
  hairColor: number;
  beardStyle: ArjunBeardStyleId;
  skinTone: number;
  topStyle: ArjunTopStyleId;
  topColor: number;
  bottomStyle: ArjunBottomStyleId;
  bottomColor: number;
  shoeStyle: ArjunShoeStyleId;
  shoeColor: number;
  watch: ArjunWatchStyleId;
  glasses: ArjunGlassesStyleId;
  accessory: ArjunAccessoryStyleId;
}

export const DEFAULT_ARJUN_APPEARANCE: ArjunAppearanceConfig = {
  hairstyle: 'textured_quiff',
  hairColor: 0x151821,
  beardStyle: 'light_stubble',
  skinTone: 0x99613a,
  topStyle: 'casual_shirt',
  topColor: 0x0f766e, // Deep Malabar teal-indigo casual linen shirt
  bottomStyle: 'slim_jeans',
  bottomColor: 0x1e293b, // Dark charcoal-indigo denim
  shoeStyle: 'sneakers',
  shoeColor: 0x1f2937,
  watch: 'classic_steel',
  glasses: 'none',
  accessory: 'none',
};

export interface ArjunCharacterRig {
  lod: THREE.LOD;
  lod0: THREE.Group;
  lod1: THREE.Group;
  pelvisGroup: THREE.Group;
  spineGroup: THREE.Group;
  chestGroup: THREE.Group;
  neckGroup: THREE.Group;
  headGroup: THREE.Group;
  hipL: THREE.Group;
  hipR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  ankleL: THREE.Group;
  ankleR: THREE.Group;
  shoulderL: THREE.Group;
  shoulderR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  wristL: THREE.Group;
  wristR: THREE.Group;
  contactShadow: THREE.Mesh;
  deliveryBagGroup: THREE.Group;
  getAppearance: () => ArjunAppearanceConfig;
  applyAppearance: (patch: Partial<ArjunAppearanceConfig>) => void;
  setDeliveryBagVisible: (visible: boolean) => void;
  dispose: () => void;
}

function makeCapsulePart(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  radialSegments = 12,
): THREE.CylinderGeometry {
  return new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments);
}

function makeContactShadowTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(2, 6, 23, 0.48)');
  grad.addColorStop(0.55, 'rgba(2, 6, 23, 0.22)');
  grad.addColorStop(1, 'rgba(2, 6, 23, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Constructs Arjun, the playable young Kerala protagonist (~1.76m grounded height),
 * with anatomically balanced composite limbs, facial structure, rolled-sleeve casual Kerala
 * attire, contact grounding, LOD0/LOD1 switching, and live modular customization slots.
 */
export function createArjunCharacterRig(
  initialAppearance: Partial<ArjunAppearanceConfig> = {},
): ArjunCharacterRig {
  const appearance: ArjunAppearanceConfig = {
    ...DEFAULT_ARJUN_APPEARANCE,
    ...initialAppearance,
  };

  const ownedGeos: THREE.BufferGeometry[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    ownedGeos.push(g);
    return g;
  };

  const skinMat = new THREE.MeshPhysicalMaterial({
    color: appearance.skinTone,
    roughness: 0.62,
    metalness: 0.02,
    sheen: 0.25,
    sheenRoughness: 0.75,
  });
  const topMat = new THREE.MeshStandardMaterial({
    color: appearance.topColor,
    roughness: 0.84,
    metalness: 0.02,
  });
  const topInnerMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.88,
  });
  const bottomMat = new THREE.MeshStandardMaterial({
    color: appearance.bottomColor,
    roughness: 0.88,
    metalness: 0.03,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: appearance.hairColor,
    roughness: 0.88,
    metalness: 0.04,
  });
  const beardMat = new THREE.MeshStandardMaterial({
    color: appearance.hairColor,
    roughness: 0.94,
    transparent: true,
    opacity: appearance.beardStyle === 'trimmed_beard' ? 0.92 : 0.42,
  });
  const leatherMat = new THREE.MeshStandardMaterial({
    color: 0x3b2314,
    roughness: 0.54,
    metalness: 0.08,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0xd1d5db,
    roughness: 0.26,
    metalness: 0.85,
  });
  const shoeMat = new THREE.MeshStandardMaterial({
    color: appearance.shoeColor,
    roughness: 0.72,
    metalness: 0.05,
  });
  const soleMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.92,
  });
  const eyeWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.3,
  });
  const irisMat = new THREE.MeshStandardMaterial({
    color: 0x1c1411,
    roughness: 0.2,
  });
  const lipMat = new THREE.MeshStandardMaterial({
    color: 0x733f30,
    roughness: 0.65,
  });
  const glassFrameMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.3,
    metalness: 0.55,
  });
  const glassLensMat = new THREE.MeshPhysicalMaterial({
    color: 0x1e293b,
    roughness: 0.1,
    metalness: 0.2,
    transparent: true,
    opacity: 0.62,
    clearcoat: 1.0,
  });
  const strapDarkMat = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    roughness: 0.75,
  });
  const deliveryBagMat = new THREE.MeshStandardMaterial({
    color: 0xea580c,
    roughness: 0.56,
    metalness: 0.06,
  });
  const deliveryTrimMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    roughness: 0.38,
    metalness: 0.15,
  });

  const ownedMats: THREE.Material[] = [
    skinMat,
    topMat,
    topInnerMat,
    bottomMat,
    hairMat,
    beardMat,
    leatherMat,
    metalMat,
    shoeMat,
    soleMat,
    eyeWhiteMat,
    irisMat,
    lipMat,
    glassFrameMat,
    glassLensMat,
    strapDarkMat,
    deliveryBagMat,
    deliveryTrimMat,
  ];

  const lod = new THREE.LOD();
  const lod0 = new THREE.Group();
  const lod1 = new THREE.Group();

  // Contact Shadow Plane flush at y = 0.015
  const shadowTex = makeContactShadowTexture();
  const contactShadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex ?? undefined,
    color: shadowTex ? 0xffffff : 0x020617,
    transparent: true,
    opacity: shadowTex ? 0.85 : 0.26,
    depthWrite: false,
  });
  ownedMats.push(contactShadowMat);
  const contactShadow = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(0.42, 16)),
    contactShadowMat,
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.015;
  lod0.add(contactShadow);

  // Pelvis root at realistic hip pivot height y = 0.92m
  const pelvisGroup = new THREE.Group();
  pelvisGroup.position.set(0, 0.92, 0);
  lod0.add(pelvisGroup);

  const pelvisMesh = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.32, 0.14, 0.2)),
    bottomMat,
  );
  pelvisMesh.position.set(0, -0.02, 0);
  pelvisMesh.castShadow = true;
  pelvisGroup.add(pelvisMesh);

  // Leather belt & brushed steel buckle
  const beltMesh = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.332, 0.045, 0.212)),
    leatherMat,
  );
  beltMesh.position.set(0, 0.045, 0);
  const buckle = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.055, 0.048, 0.02)),
    metalMat,
  );
  buckle.position.set(0, 0.045, 0.106);
  pelvisGroup.add(beltMesh, buckle);

  // Spine & Chest
  const spineGroup = new THREE.Group();
  spineGroup.position.set(0, 0.06, 0);
  pelvisGroup.add(spineGroup);

  const abdomen = new THREE.Mesh(
    trackGeo(makeCapsulePart(0.155, 0.145, 0.22, 12)),
    topMat,
  );
  abdomen.scale.set(1.06, 1, 0.68);
  abdomen.position.set(0, 0.1, 0);
  abdomen.castShadow = true;
  spineGroup.add(abdomen);

  // Shirt hem trim cleanly over belt line
  const shirtHem = new THREE.Mesh(
    trackGeo(makeCapsulePart(0.162, 0.166, 0.07, 12)),
    topMat,
  );
  shirtHem.scale.set(1.06, 1, 0.7);
  shirtHem.position.set(0, 0.0, 0);
  spineGroup.add(shirtHem);

  const chestGroup = new THREE.Group();
  chestGroup.position.set(0, 0.2, 0);
  spineGroup.add(chestGroup);

  const ribcage = new THREE.Mesh(
    trackGeo(makeCapsulePart(0.185, 0.158, 0.27, 14)),
    topMat,
  );
  ribcage.scale.set(1.1, 1, 0.7);
  ribcage.position.set(0, 0.135, 0);
  ribcage.castShadow = true;
  chestGroup.add(ribcage);

  // Shoulder yoke sculpting for broad natural athletic shoulders
  const shoulderYoke = new THREE.Mesh(
    trackGeo(new THREE.CapsuleGeometry(0.095, 0.26, 6, 10)),
    topMat,
  );
  shoulderYoke.rotation.z = Math.PI / 2;
  shoulderYoke.position.set(0, 0.245, 0);
  shoulderYoke.castShadow = true;
  chestGroup.add(shoulderYoke);

  // Collar, open V-neck tee glimpse, placket & chest pocket
  const collarRing = new THREE.Group();
  const collarL = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.075, 0.05, 0.14)), topMat);
  collarL.position.set(-0.055, 0.29, 0.015);
  collarL.rotation.set(0.18, 0.25, -0.35);
  const collarR = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.075, 0.05, 0.14)), topMat);
  collarR.position.set(0.055, 0.29, 0.015);
  collarR.rotation.set(0.18, -0.25, 0.35);
  const collarBack = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.13, 0.045, 0.04)), topMat);
  collarBack.position.set(0, 0.3, -0.055);
  collarRing.add(collarL, collarR, collarBack);
  chestGroup.add(collarRing);

  const innerCrewTee = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.072, 0.072, 0.05, 10)),
    topInnerMat,
  );
  innerCrewTee.position.set(0, 0.27, 0.025);
  chestGroup.add(innerCrewTee);

  const placket = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.036, 0.28, 0.018)), topMat);
  placket.position.set(0, 0.1, 0.118);
  const pocket = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.07, 0.08, 0.014)), topMat);
  pocket.position.set(-0.085, 0.13, 0.118);
  chestGroup.add(placket, pocket);

  for (let b = 0; b < 3; b++) {
    const btn = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.008, 0.008, 0.01, 8)), topInnerMat);
    btn.rotation.x = Math.PI / 2;
    btn.position.set(0, 0.2 - b * 0.085, 0.128);
    chestGroup.add(btn);
  }

  // Modular Back/Chest Accessories (silver chain / backpack)
  const silverChainGroup = new THREE.Group();
  const chainTorus = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(0.068, 0.006, 6, 16, Math.PI * 1.35)),
    metalMat,
  );
  chainTorus.rotation.x = Math.PI / 2 + 0.35;
  chainTorus.rotation.z = -Math.PI * 0.18;
  chainTorus.position.set(0, 0.27, 0.04);
  silverChainGroup.add(chainTorus);
  silverChainGroup.visible = appearance.accessory === 'silver_chain';
  chestGroup.add(silverChainGroup);

  const backpackGroup = new THREE.Group();
  const packBody = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.28, 0.36, 0.14)), strapDarkMat);
  packBody.position.set(0, 0.11, -0.17);
  packBody.castShadow = true;
  const packPocket = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.22, 0.16, 0.05)), leatherMat);
  packPocket.position.set(0, 0.04, -0.24);
  backpackGroup.add(packBody, packPocket);
  backpackGroup.visible = appearance.accessory === 'backpack';
  chestGroup.add(backpackGroup);

  // Composite 3D Kozhikode Insulated Thermal Delivery Backpack
  const deliveryBagGroup = new THREE.Group();
  const thermalShell = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.34, 0.42, 0.22)), deliveryBagMat);
  thermalShell.position.set(0, 0.14, -0.22);
  thermalShell.castShadow = true;
  const thermalLid = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.355, 0.055, 0.235)), strapDarkMat);
  thermalLid.position.set(0, 0.355, -0.22);
  thermalLid.castShadow = true;
  const reflectiveStripe = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.30, 0.045, 0.018)), deliveryTrimMat);
  reflectiveStripe.position.set(0, 0.15, -0.335);
  const logoBadge = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.16, 0.08, 0.016)), strapDarkMat);
  logoBadge.position.set(0, 0.255, -0.335);
  const drinkSleeve = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.036, 0.034, 0.18, 10)), strapDarkMat);
  drinkSleeve.position.set(0.185, 0.08, -0.21);
  const shoulderStrapGeo = trackGeo(new THREE.BoxGeometry(0.044, 0.026, 0.21));
  const shoulderStrapL = new THREE.Mesh(shoulderStrapGeo, strapDarkMat);
  shoulderStrapL.position.set(-0.11, 0.275, -0.02);
  const shoulderStrapR = new THREE.Mesh(shoulderStrapGeo, strapDarkMat);
  shoulderStrapR.position.set(0.11, 0.275, -0.02);
  deliveryBagGroup.add(
    thermalShell,
    thermalLid,
    reflectiveStripe,
    logoBadge,
    drinkSleeve,
    shoulderStrapL,
    shoulderStrapR,
  );
  deliveryBagGroup.visible = false;
  chestGroup.add(deliveryBagGroup);

  // Neck & Sculpted Head
  const neckGroup = new THREE.Group();
  neckGroup.position.set(0, 0.29, 0);
  chestGroup.add(neckGroup);

  const neckMesh = new THREE.Mesh(
    trackGeo(makeCapsulePart(0.056, 0.064, 0.11, 10)),
    skinMat,
  );
  neckMesh.position.y = 0.045;
  neckGroup.add(neckMesh);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.09, 0.005);
  neckGroup.add(headGroup);

  // Cranium + sculpted jaw/chin + cheeks
  const cranium = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.112, 16, 14)), skinMat);
  cranium.scale.set(0.92, 1.06, 1.02);
  cranium.position.set(0, 0.115, -0.008);
  cranium.castShadow = true;
  headGroup.add(cranium);

  const jaw = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.135, 0.095, 0.13)), skinMat);
  jaw.position.set(0, 0.055, 0.015);
  headGroup.add(jaw);

  const chin = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.048, 10, 8)), skinMat);
  chin.scale.set(1.15, 0.85, 0.95);
  chin.position.set(0, 0.024, 0.046);
  headGroup.add(chin);

  // Nose bridge & tip
  const nose = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.026, 0.048, 0.042)), skinMat);
  nose.position.set(0, 0.092, 0.105);
  nose.rotation.x = -0.22;
  headGroup.add(nose);

  // Ears
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.026, 8, 8)), skinMat);
    ear.scale.set(0.45, 1.15, 0.72);
    ear.position.set(sx * 0.105, 0.1, -0.008);
    headGroup.add(ear);
  }

  // Eyes, irises & expressive brows
  for (const sx of [-1, 1]) {
    const sclera = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.017, 8, 8)), eyeWhiteMat);
    sclera.scale.set(1.15, 0.75, 0.65);
    sclera.position.set(sx * 0.038, 0.118, 0.092);
    const iris = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.01, 8, 8)), irisMat);
    iris.position.set(sx * 0.038, 0.118, 0.101);
    const brow = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.038, 0.01, 0.014)), hairMat);
    brow.position.set(sx * 0.038, 0.14, 0.097);
    brow.rotation.z = sx * -0.08;
    headGroup.add(sclera, iris, brow);
  }

  // Lips
  const lips = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.042, 0.012, 0.014)), lipMat);
  lips.position.set(0, 0.05, 0.09);
  headGroup.add(lips);

  // Beard / Stubble Group
  const beardGroup = new THREE.Group();
  const mustache = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.056, 0.012, 0.018)), beardMat);
  mustache.position.set(0, 0.064, 0.091);
  const jawBeard = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.142, 0.062, 0.125)), beardMat);
  jawBeard.position.set(0, 0.038, 0.02);
  beardGroup.add(mustache, jawBeard);
  beardGroup.visible = appearance.beardStyle !== 'clean';
  headGroup.add(beardGroup);

  // Sculpted Hairstyles (textured quiff / short crop / side part)
  const hairBase = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.116, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.56)),
    hairMat,
  );
  hairBase.scale.set(0.95, 1.05, 1.05);
  hairBase.position.set(0, 0.132, -0.016);
  hairBase.rotation.x = -0.18;
  hairBase.castShadow = true;
  headGroup.add(hairBase);

  const hairBack = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.185, 0.1, 0.08)), hairMat);
  hairBack.position.set(0, 0.115, -0.085);
  headGroup.add(hairBack);

  const hairQuiff = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.145, 0.052, 0.1)), hairMat);
  hairQuiff.position.set(0.01, 0.205, 0.045);
  hairQuiff.rotation.set(-0.24, 0, -0.08);
  headGroup.add(hairQuiff);

  const hairSidePart = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.165, 0.038, 0.11)), hairMat);
  hairSidePart.position.set(-0.012, 0.195, 0.03);
  hairSidePart.rotation.set(-0.15, 0, 0.14);
  headGroup.add(hairSidePart);

  const syncHair = () => {
    hairQuiff.visible = appearance.hairstyle === 'textured_quiff';
    hairSidePart.visible = appearance.hairstyle === 'side_part';
  };
  syncHair();

  // Modular Glasses
  const glassesGroup = new THREE.Group();
  const lensGeo = trackGeo(new THREE.BoxGeometry(0.044, 0.028, 0.01));
  const lensL = new THREE.Mesh(lensGeo, glassLensMat);
  lensL.position.set(-0.038, 0.118, 0.112);
  const lensR = new THREE.Mesh(lensGeo, glassLensMat);
  lensR.position.set(0.038, 0.118, 0.112);
  const bridge = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.026, 0.008, 0.01)), glassFrameMat);
  bridge.position.set(0, 0.125, 0.113);
  const templeGeo = trackGeo(new THREE.BoxGeometry(0.008, 0.008, 0.125));
  const templeL = new THREE.Mesh(templeGeo, glassFrameMat);
  templeL.position.set(-0.064, 0.122, 0.05);
  const templeR = new THREE.Mesh(templeGeo, glassFrameMat);
  templeR.position.set(0.064, 0.122, 0.05);
  glassesGroup.add(lensL, lensR, bridge, templeL, templeR);
  glassesGroup.visible = appearance.glasses !== 'none';
  headGroup.add(glassesGroup);

  // Articulated Arms (Shoulder -> Elbow -> Wrist/Hand + Fingers + Rolled Cuffs + Watch)
  const makeArm = (isLeft: boolean) => {
    const sign = isLeft ? -1 : 1;
    const shoulder = new THREE.Group();
    shoulder.position.set(sign * 0.22, 0.24, 0);

    const sleeve = new THREE.Mesh(trackGeo(makeCapsulePart(0.062, 0.054, 0.2, 10)), topMat);
    sleeve.position.y = -0.095;
    sleeve.castShadow = true;
    shoulder.add(sleeve);

    // Rolled cotton sleeve cuff just above elbow
    const cuff = new THREE.Mesh(trackGeo(makeCapsulePart(0.058, 0.058, 0.045, 10)), topMat);
    cuff.position.y = -0.195;
    shoulder.add(cuff);

    const upperSkin = new THREE.Mesh(trackGeo(makeCapsulePart(0.048, 0.044, 0.09, 10)), skinMat);
    upperSkin.position.y = -0.23;
    shoulder.add(upperSkin);

    const elbow = new THREE.Group();
    elbow.position.set(0, -0.28, 0);
    shoulder.add(elbow);

    const forearm = new THREE.Mesh(trackGeo(makeCapsulePart(0.043, 0.032, 0.24, 10)), skinMat);
    forearm.position.y = -0.12;
    forearm.castShadow = true;
    elbow.add(forearm);

    const wrist = new THREE.Group();
    wrist.position.set(0, -0.245, 0);
    elbow.add(wrist);

    const palm = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.034, 0.082, 0.062)), skinMat);
    palm.position.set(0, -0.042, 0.006);
    const fingers = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.028, 0.06, 0.054)), skinMat);
    fingers.position.set(0, -0.098, 0.008);
    const thumb = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.02, 0.042, 0.022)), skinMat);
    thumb.position.set(-sign * 0.012, -0.048, 0.042);
    thumb.rotation.x = 0.28;
    wrist.add(palm, fingers, thumb);

    return { shoulder, elbow, wrist, cuff };
  };

  const leftArm = makeArm(true);
  const rightArm = makeArm(false);
  chestGroup.add(leftArm.shoulder, rightArm.shoulder);

  // Left-wrist Watch Slot
  const watchGroup = new THREE.Group();
  const watchBand = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.037, 0.037, 0.026, 12)),
    strapDarkMat,
  );
  watchBand.position.y = 0.025;
  const watchDial = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 12)),
    metalMat,
  );
  watchDial.rotation.z = Math.PI / 2;
  watchDial.position.set(-0.034, 0.025, 0);
  watchGroup.add(watchBand, watchDial);
  watchGroup.visible = appearance.watch !== 'none';
  leftArm.wrist.add(watchGroup);

  // Articulated Legs (Hip -> Knee -> Ankle/Foot)
  // Pelvis sits at y = 0.92. Hip joint at -0.04 relative -> y = 0.88.
  // Thigh = 0.42 (-0.42 -> knee y = 0.46), Shin = 0.39 (-0.39 -> ankle y = 0.07), Foot sole sits at -0.07 -> world y = 0.00!
  const makeLeg = (sideX: number) => {
    const hip = new THREE.Group();
    hip.position.set(sideX, -0.04, 0);

    const thigh = new THREE.Mesh(trackGeo(makeCapsulePart(0.094, 0.074, 0.43, 12)), bottomMat);
    thigh.position.y = -0.21;
    thigh.castShadow = true;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.set(0, -0.42, 0);
    hip.add(knee);

    const shin = new THREE.Mesh(trackGeo(makeCapsulePart(0.072, 0.054, 0.39, 12)), bottomMat);
    shin.position.y = -0.195;
    shin.castShadow = true;
    knee.add(shin);

    // Rolled denim cuff & ankle skin peek
    const trouserCuff = new THREE.Mesh(trackGeo(makeCapsulePart(0.058, 0.058, 0.036, 10)), bottomMat);
    trouserCuff.position.y = -0.375;
    const ankleSkin = new THREE.Mesh(trackGeo(makeCapsulePart(0.042, 0.04, 0.06, 10)), skinMat);
    ankleSkin.position.y = -0.395;
    knee.add(trouserCuff, ankleSkin);

    const ankle = new THREE.Group();
    ankle.position.set(0, -0.39, 0);
    knee.add(ankle);

    // Sculpted sneaker/sandal (sole rests cleanly at -0.07 -> world y = 0.00)
    const sole = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.105, 0.028, 0.245)), soleMat);
    sole.position.set(0, -0.056, 0.048);
    sole.castShadow = true;
    const shoeUpper = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.098, 0.055, 0.22)), shoeMat);
    shoeUpper.position.set(0, -0.018, 0.042);
    shoeUpper.castShadow = true;
    const toeCap = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.049, 10, 8)), shoeMat);
    toeCap.scale.set(0.98, 0.56, 1.15);
    toeCap.position.set(0, -0.024, 0.135);
    ankle.add(sole, shoeUpper, toeCap);

    return { hip, knee, ankle, shoeUpper, sole };
  };

  const leftLeg = makeLeg(-0.1);
  const rightLeg = makeLeg(0.1);
  pelvisGroup.add(leftLeg.hip, rightLeg.hip);

  // LOD1 Performance Silhouette (> 36m distance)
  const lod1Legs = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 0.88, 0.2)), bottomMat);
  lod1Legs.position.set(0, 0.44, 0);
  const lod1Torso = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.4, 0.58, 0.22)), topMat);
  lod1Torso.position.set(0, 1.17, 0);
  const lod1Head = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.115, 8, 8)), skinMat);
  lod1Head.position.set(0, 1.61, 0);
  const lod1Hair = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.12, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55)), hairMat);
  lod1Hair.position.set(0, 1.63, -0.01);
  lod1.add(lod1Legs, lod1Torso, lod1Head, lod1Hair);

  lod.addLevel(lod0, 0);
  lod.addLevel(lod1, 36);

  const applyAppearance = (patch: Partial<ArjunAppearanceConfig>): void => {
    Object.assign(appearance, patch);
    skinMat.color.setHex(appearance.skinTone);
    topMat.color.setHex(appearance.topColor);
    bottomMat.color.setHex(appearance.bottomColor);
    hairMat.color.setHex(appearance.hairColor);
    beardMat.color.setHex(appearance.hairColor);
    beardMat.opacity = appearance.beardStyle === 'trimmed_beard' ? 0.92 : 0.42;
    beardGroup.visible = appearance.beardStyle !== 'clean';
    shoeMat.color.setHex(appearance.shoeColor);

    const isShortSleeve = appearance.topStyle === 'casual_shirt';
    leftArm.cuff.visible = isShortSleeve;
    rightArm.cuff.visible = isShortSleeve;
    collarRing.visible = appearance.topStyle !== 'henley_tee';
    pocket.visible = appearance.topStyle === 'casual_shirt';

    watchGroup.visible = appearance.watch !== 'none';
    if (appearance.watch === 'sport_band') {
      watchDial.material = strapDarkMat;
    } else {
      watchDial.material = metalMat;
    }
    glassesGroup.visible = appearance.glasses !== 'none';
    silverChainGroup.visible = appearance.accessory === 'silver_chain';
    backpackGroup.visible = !deliveryBagGroup.visible && appearance.accessory === 'backpack';
    leftLeg.sole.visible = appearance.shoeStyle === 'sneakers';
    rightLeg.sole.visible = appearance.shoeStyle === 'sneakers';
    syncHair();
  };

  const setDeliveryBagVisible = (visible: boolean): void => {
    deliveryBagGroup.visible = visible;
    backpackGroup.visible = !visible && appearance.accessory === 'backpack';
  };

  return {
    lod,
    lod0,
    lod1,
    pelvisGroup,
    spineGroup,
    chestGroup,
    neckGroup,
    headGroup,
    hipL: leftLeg.hip,
    hipR: rightLeg.hip,
    kneeL: leftLeg.knee,
    kneeR: rightLeg.knee,
    ankleL: leftLeg.ankle,
    ankleR: rightLeg.ankle,
    shoulderL: leftArm.shoulder,
    shoulderR: rightArm.shoulder,
    elbowL: leftArm.elbow,
    elbowR: rightArm.elbow,
    wristL: leftArm.wrist,
    wristR: rightArm.wrist,
    contactShadow,
    deliveryBagGroup,
    getAppearance: () => ({ ...appearance }),
    applyAppearance,
    setDeliveryBagVisible,
    dispose: () => {
      for (const g of ownedGeos) g.dispose();
      for (const m of ownedMats) m.dispose();
      shadowTex?.dispose();
    },
  };
}
