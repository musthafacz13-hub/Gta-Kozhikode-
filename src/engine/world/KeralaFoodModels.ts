import * as THREE from 'three';

export type KozhikodeFoodModelKind =
  | 'biryani_handi'
  | 'biryani_plate'
  | 'kerala_meals'
  | 'porotta_roast'
  | 'appam_stew'
  | 'pazham_pori_plate'
  | 'snacks_assortment'
  | 'chai_glass'
  | 'sulaimani_glass'
  | 'juice_glass'
  | 'bakery_tray'
  | 'seafood_platter'
  | 'food_parcel_box'
  | 'pothichoru_bundle';

export const ALL_KOZHIKODE_FOOD_MODELS: readonly KozhikodeFoodModelKind[] = [
  'biryani_handi',
  'biryani_plate',
  'kerala_meals',
  'porotta_roast',
  'appam_stew',
  'pazham_pori_plate',
  'snacks_assortment',
  'chai_glass',
  'sulaimani_glass',
  'juice_glass',
  'bakery_tray',
  'seafood_platter',
  'food_parcel_box',
  'pothichoru_bundle',
] as const;

interface SharedFoodGeos {
  plateDisc: THREE.BufferGeometry;
  bowlLathe: THREE.BufferGeometry;
  handiPot: THREE.BufferGeometry;
  handiRim: THREE.BufferGeometry;
  leafBase: THREE.BufferGeometry;
  riceMound: THREE.BufferGeometry;
  porottaDisc: THREE.BufferGeometry;
  appamBowl: THREE.BufferGeometry;
  chaiGlassOuter: THREE.BufferGeometry;
  chaiLiquid: THREE.BufferGeometry;
  chaiFroth: THREE.BufferGeometry;
  lemonSlice: THREE.BufferGeometry;
  juiceGlassOuter: THREE.BufferGeometry;
  juiceLiquid: THREE.BufferGeometry;
  strawGeo: THREE.BufferGeometry;
  pazhamPoriCurve: THREE.BufferGeometry;
  vadaTorus: THREE.BufferGeometry;
  samosaPyramid: THREE.BufferGeometry;
  puffDome: THREE.BufferGeometry;
  halwaBlock: THREE.BufferGeometry;
  cakeLayer: THREE.BufferGeometry;
  musselShell: THREE.BufferGeometry;
  shawarmaWrap: THREE.BufferGeometry;
  boxBase: THREE.BufferGeometry;
  boxStrap: THREE.BufferGeometry;
  pothichoruLeaf: THREE.BufferGeometry;
  roastChunk: THREE.BufferGeometry;
  papadamDisc: THREE.BufferGeometry;
  eggHalf: THREE.BufferGeometry;
}

interface SharedFoodMats {
  stainlessSteel: THREE.MeshStandardMaterial;
  hammeredCopper: THREE.MeshStandardMaterial;
  bananaLeaf: THREE.MeshStandardMaterial;
  saffronRice: THREE.MeshStandardMaterial;
  whiteRice: THREE.MeshStandardMaterial;
  curryRed: THREE.MeshStandardMaterial;
  curryCoconut: THREE.MeshStandardMaterial;
  sambarAmber: THREE.MeshStandardMaterial;
  porottaGolden: THREE.MeshStandardMaterial;
  appamWhite: THREE.MeshStandardMaterial;
  glassClear: THREE.MeshPhysicalMaterial;
  chaiAmber: THREE.MeshStandardMaterial;
  chaiFrothMat: THREE.MeshStandardMaterial;
  sulaimaniTea: THREE.MeshStandardMaterial;
  lemonYellow: THREE.MeshStandardMaterial;
  juiceMango: THREE.MeshStandardMaterial;
  juiceWatermelon: THREE.MeshStandardMaterial;
  pazhamFry: THREE.MeshStandardMaterial;
  vadaCrust: THREE.MeshStandardMaterial;
  samosaPastry: THREE.MeshStandardMaterial;
  blackHalwa: THREE.MeshPhysicalMaterial;
  cakeFrosting: THREE.MeshStandardMaterial;
  musselShellMat: THREE.MeshStandardMaterial;
  musselMasalaMat: THREE.MeshStandardMaterial;
  foilWrap: THREE.MeshStandardMaterial;
  kraftParcel: THREE.MeshStandardMaterial;
  twineMat: THREE.MeshStandardMaterial;
  eggWhite: THREE.MeshStandardMaterial;
  papadamGold: THREE.MeshStandardMaterial;
  strawStripe: THREE.MeshStandardMaterial;
}

let cachedGeos: SharedFoodGeos | null = null;
let cachedMats: SharedFoodMats | null = null;

function markSharedGeo<T extends THREE.BufferGeometry>(geo: T): T {
  geo.userData.shared = true;
  return geo;
}

function getSharedFoodAssets(): { geos: SharedFoodGeos; mats: SharedFoodMats } {
  if (!cachedGeos) {
    const handiProfile = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.18, 0.02),
      new THREE.Vector2(0.28, 0.14),
      new THREE.Vector2(0.26, 0.28),
      new THREE.Vector2(0.2, 0.34),
      new THREE.Vector2(0.23, 0.36),
    ];
    const bowlProfile = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.036, 0.004),
      new THREE.Vector2(0.052, 0.042),
      new THREE.Vector2(0.058, 0.045),
    ];
    const appamProfile = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.06, 0.012),
      new THREE.Vector2(0.115, 0.048),
    ];
    const bananaCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.075, 0.012, -0.018),
      new THREE.Vector3(0, 0.026, 0.014),
      new THREE.Vector3(0.078, 0.014, -0.01),
    ]);

    cachedGeos = {
      plateDisc: markSharedGeo(new THREE.CylinderGeometry(0.165, 0.145, 0.018, 16)),
      bowlLathe: markSharedGeo(new THREE.LatheGeometry(bowlProfile, 12)),
      handiPot: markSharedGeo(new THREE.LatheGeometry(handiProfile, 16)),
      handiRim: markSharedGeo(new THREE.TorusGeometry(0.215, 0.018, 8, 18)),
      leafBase: markSharedGeo(new THREE.BoxGeometry(0.36, 0.012, 0.24)),
      riceMound: markSharedGeo(new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.56)),
      porottaDisc: markSharedGeo(new THREE.CylinderGeometry(0.095, 0.098, 0.018, 14)),
      appamBowl: markSharedGeo(new THREE.LatheGeometry(appamProfile, 14)),
      chaiGlassOuter: markSharedGeo(new THREE.CylinderGeometry(0.046, 0.035, 0.115, 12, 1, true)),
      chaiLiquid: markSharedGeo(new THREE.CylinderGeometry(0.041, 0.032, 0.082, 12)),
      chaiFroth: markSharedGeo(new THREE.CylinderGeometry(0.042, 0.041, 0.014, 12)),
      lemonSlice: markSharedGeo(new THREE.CylinderGeometry(0.026, 0.026, 0.008, 10)),
      juiceGlassOuter: markSharedGeo(new THREE.CylinderGeometry(0.048, 0.036, 0.165, 12, 1, true)),
      juiceLiquid: markSharedGeo(new THREE.CylinderGeometry(0.043, 0.033, 0.132, 12)),
      strawGeo: markSharedGeo(new THREE.CylinderGeometry(0.0045, 0.0045, 0.22, 6)),
      pazhamPoriCurve: markSharedGeo(new THREE.TubeGeometry(bananaCurve, 8, 0.022, 7, false)),
      vadaTorus: markSharedGeo(new THREE.TorusGeometry(0.032, 0.015, 8, 12)),
      samosaPyramid: markSharedGeo(new THREE.ConeGeometry(0.044, 0.068, 3)),
      puffDome: markSharedGeo(new THREE.BoxGeometry(0.088, 0.046, 0.068)),
      halwaBlock: markSharedGeo(new THREE.BoxGeometry(0.095, 0.042, 0.072)),
      cakeLayer: markSharedGeo(new THREE.CylinderGeometry(0.11, 0.11, 0.068, 16)),
      musselShell: markSharedGeo(new THREE.SphereGeometry(0.032, 10, 8)),
      shawarmaWrap: markSharedGeo(new THREE.CylinderGeometry(0.032, 0.028, 0.18, 10)),
      boxBase: markSharedGeo(new THREE.BoxGeometry(0.24, 0.11, 0.19)),
      boxStrap: markSharedGeo(new THREE.BoxGeometry(0.25, 0.018, 0.032)),
      pothichoruLeaf: markSharedGeo(new THREE.DodecahedronGeometry(0.115, 1)),
      roastChunk: markSharedGeo(new THREE.DodecahedronGeometry(0.028, 0)),
      papadamDisc: markSharedGeo(new THREE.CylinderGeometry(0.075, 0.075, 0.005, 14)),
      eggHalf: markSharedGeo(new THREE.SphereGeometry(0.024, 8, 6)),
    };
  }

  if (!cachedMats) {
    cachedMats = {
      stainlessSteel: new THREE.MeshStandardMaterial({ color: 0xdbe3ec, roughness: 0.24, metalness: 0.88 }),
      hammeredCopper: new THREE.MeshStandardMaterial({ color: 0xb85d28, roughness: 0.34, metalness: 0.78 }),
      bananaLeaf: new THREE.MeshStandardMaterial({ color: 0x2f7d32, roughness: 0.56, metalness: 0.02 }),
      saffronRice: new THREE.MeshStandardMaterial({ color: 0xf4c45c, roughness: 0.78 }),
      whiteRice: new THREE.MeshStandardMaterial({ color: 0xf6efe6, roughness: 0.84 }),
      curryRed: new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.42 }),
      curryCoconut: new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.48 }),
      sambarAmber: new THREE.MeshStandardMaterial({ color: 0xc2410c, roughness: 0.44 }),
      porottaGolden: new THREE.MeshStandardMaterial({ color: 0xe6b878, roughness: 0.68 }),
      appamWhite: new THREE.MeshStandardMaterial({ color: 0xf8f4ec, roughness: 0.74, side: THREE.DoubleSide }),
      glassClear: new THREE.MeshPhysicalMaterial({
        color: 0xe0f2fe,
        roughness: 0.08,
        metalness: 0.06,
        transparent: true,
        opacity: 0.46,
        clearcoat: 1,
      }),
      chaiAmber: new THREE.MeshStandardMaterial({ color: 0xc2783e, roughness: 0.36 }),
      chaiFrothMat: new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.88 }),
      sulaimaniTea: new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.24 }),
      lemonYellow: new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.6 }),
      juiceMango: new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.26 }),
      juiceWatermelon: new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.26 }),
      pazhamFry: new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.62 }),
      vadaCrust: new THREE.MeshStandardMaterial({ color: 0x9a4b15, roughness: 0.78 }),
      samosaPastry: new THREE.MeshStandardMaterial({ color: 0xca8a34, roughness: 0.66 }),
      blackHalwa: new THREE.MeshPhysicalMaterial({ color: 0x1c130f, roughness: 0.22, clearcoat: 0.85 }),
      cakeFrosting: new THREE.MeshStandardMaterial({ color: 0xfda4af, roughness: 0.54 }),
      musselShellMat: new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.48 }),
      musselMasalaMat: new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.64 }),
      foilWrap: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.32, metalness: 0.72 }),
      kraftParcel: new THREE.MeshStandardMaterial({ color: 0xc89b6e, roughness: 0.82 }),
      twineMat: new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.88 }),
      eggWhite: new THREE.MeshStandardMaterial({ color: 0xfefce8, roughness: 0.5 }),
      papadamGold: new THREE.MeshStandardMaterial({ color: 0xfde08d, roughness: 0.72 }),
      strawStripe: new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 }),
    };
  }

  return { geos: cachedGeos, mats: cachedMats };
}

export function buildBiryaniHandi(): THREE.Group {
  const { geos, mats } = getSharedFoodAssets();
  const g = new THREE.Group();
  const pot = new THREE.Mesh(geos.handiPot, mats.hammeredCopper);
  pot.castShadow = true;
  const rim = new THREE.Mesh(geos.handiRim, mats.stainlessSteel);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.355;
  const rice = new THREE.Mesh(geos.riceMound, mats.saffronRice);
  rice.scale.set(1.9, 1.05, 1.9);
  rice.position.y = 0.29;
  const chicken = new THREE.Mesh(geos.roastChunk, mats.curryRed);
  chicken.position.set(0.05, 0.38, 0.03);
  const egg = new THREE.Mesh(geos.eggHalf, mats.eggWhite);
  egg.scale.set(1.1, 0.75, 1.3);
  egg.position.set(-0.06, 0.37, -0.02);
  g.add(pot, rim, rice, chicken, egg);
  return g;
}

export function buildBiryaniPlate(): THREE.Group {
  const { geos, mats } = getSharedFoodAssets();
  const g = new THREE.Group();
  const leaf = new THREE.Mesh(geos.leafBase, mats.bananaLeaf);
  leaf.position.y = 0.008;
  const rice = new THREE.Mesh(geos.riceMound, mats.saffronRice);
  rice.scale.set(1.15, 0.78, 0.96);
  rice.position.y = 0.015;
  const roastA = new THREE.Mesh(geos.roastChunk, mats.curryRed);
  roastA.position.set(0.05, 0.065, 0.02);
  const egg = new THREE.Mesh(geos.eggHalf, mats.eggWhite);
  egg.position.set(-0.06, 0.05, 0.03);
  const raitaBowl = new THREE.Mesh(geos.bowlLathe, mats.stainlessSteel);
  raitaBowl.scale.setScalar(0.75);
  raitaBowl.position.set(0.11, 0.012, -0.055);
  const raitaFill = new THREE.Mesh(geos.chaiLiquid, mats.curryCoconut);
  raitaFill.scale.set(0.68, 0.28, 0.68);
  raitaFill.position.set(0.11, 0.028, -0.055);
  g.add(leaf, rice, roastA, egg, raitaBowl, raitaFill);
  return g;
}

export function buildKeralaMealsPlate(): THREE.Group {
  const { geos, mats } = getSharedFoodAssets();
  const g = new THREE.Group();
  const leaf = new THREE.Mesh(geos.leafBase, mats.bananaLeaf);
  leaf.scale.set(1.12, 1, 1.08);
  leaf.position.y = 0.008;
  const rice = new THREE.Mesh(geos.riceMound, mats.whiteRice);
  rice.scale.set(1.05, 0.72, 0.9);
  rice.position.set(-0.04, 0.014, 0.02);
  const papadam = new THREE.Mesh(geos.papadamDisc, mats.papadamGold);
  papadam.position.set(-0.11, 0.022, -0.05);
  const fish = new THREE.Mesh(geos.roastChunk, mats.curryRed);
  fish.scale.set(1.5, 0.5, 0.95);
  fish.position.set(0.08, 0.026, 0.05);

  const curries = [mats.sambarAmber, mats.curryCoconut, mats.curryRed];
  for (let i = 0; i < 3; i++) {
    const cx = -0.03 + i * 0.075;
    const bowl = new THREE.Mesh(geos.bowlLathe, mats.stainlessSteel);
    bowl.scale.setScalar(0.65);
    bowl.position.set(cx, 0.014, -0.065);
    const fill = new THREE.Mesh(geos.chaiLiquid, curries[i]);
    fill.scale.set(0.6, 0.25, 0.6);
    fill.position.set(cx, 0.028, -0.065);
    g.add(bowl, fill);
  }
  g.add(leaf, rice, papadam, fish);
  return g;
}

export function buildPorottaRoastPlate(): THREE.Group {
  const { geos, mats } = getSharedFoodAssets();
  const g = new THREE.Group();
  const plate = new THREE.Mesh(geos.plateDisc, mats.stainlessSteel);
  plate.position.y = 0.01;
  g.add(plate);

  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(geos.porottaDisc, mats.porottaGolden);
    p.position.set(-0.045, 0.024 + i * 0.015, 0.015 * (i % 2));
    p.rotation.y = i * 0.5;
    g.add(p);
  }
  const curryBowl = new THREE.Mesh(geos.bowlLathe, mats.stainlessSteel);
  curryBowl.position.set(0.08, 0.018, -0.02);
  const curryFill = new THREE.Mesh(geos.chaiLiquid, mats.curryRed);
  curryFill.scale.set(0.95, 0.38, 0.95);
  curryFill.position.set(0.08, 0.042, -0.02);
  g.add(curryBowl, curryFill);
  return g;
}

export function buildAppamStewPlate(): THREE.Group {
  const { geos, mats } = getSharedFoodAssets();
  const g = new THREE.Group();
  const plate = new THREE.Mesh(geos.plateDisc, mats.stainlessSteel);
  plate.position.y = 0.01;
  const appam = new THREE.Mesh(geos.appamBowl, mats.appamWhite);
  appam.position.set(-0.035, 0.018, 0);
  const bowl = new THREE.Mesh(geos.bowlLathe, mats.stainlessSteel);
  bowl.scale.setScalar(0.8);
  bowl.position.set(0.085, 0.018, -0.02);
  const stew = new THREE.Mesh(geos.chaiLiquid, mats.curryCoconut);
  stew.scale.set(0.75, 0.34, 0.75);
  stew.position.set(0.085, 0.038, -0.02);
  g.add(plate, appam, bowl, stew);
  return g;
}

export function buildChaiGlass(isSulaimani = false): THREE.Group {
  const { geos, mats } = getSharedFoodAssets();
  const g = new THREE.Group();
  const glass = new THREE.Mesh(geos.chaiGlassOuter, mats.glassClear);
  glass.position.y = 0.06;
  const liquid = new THREE.Mesh(
    geos.chaiLiquid,
    isSulaimani ? mats.sulaimaniTea : mats.chaiAmber,
  );
  liquid.position.y = 0.044;
  g.add(glass, liquid);
  if (isSulaimani) {
    const lemon = new THREE.Mesh(geos.lemonSlice, mats.lemonYellow);
    lemon.position.set(0.028, 0.112, 0);
    lemon.rotation.z = 0.45;
    g.add(lemon);
  } else {
    const froth = new THREE.Mesh(geos.chaiFroth, mats.chaiFrothMat);
    froth.position.y = 0.089;
    g.add(froth);
  }
  return g;
}

export function buildJuiceGlass(variant: 'mango' | 'watermelon' = 'mango'): THREE.Group {
  const { geos, mats } = getSharedFoodAssets();
  const g = new THREE.Group();
  const glass = new THREE.Mesh(geos.juiceGlassOuter, mats.glassClear);
  glass.position.y = 0.085;
  const liquid = new THREE.Mesh(
    geos.juiceLiquid,
    variant === 'watermelon' ? mats.juiceWatermelon : mats.juiceMango,
  );
  liquid.position.y = 0.068;
  const straw = new THREE.Mesh(geos.strawGeo, mats.strawStripe);
  straw.position.set(0.018, 0.125, 0);
  straw.rotation.z = -0.28;
  g.add(glass, liquid, straw);
  return g;
}

export function buildTeaSnacksPlate(pazhamOnly = false): THREE.Group {
  const { geos, mats } = getSharedFoodAssets();
  const g = new THREE.Group();
  const plate = new THREE.Mesh(geos.plateDisc, mats.stainlessSteel);
  plate.scale.set(1.15, 1, 1.15);
  plate.position.y = 0.01;
  g.add(plate);

  for (let i = 0; i < (pazhamOnly ? 4 : 2); i++) {
    const pp = new THREE.Mesh(geos.pazhamPoriCurve, mats.pazhamFry);
    pp.position.set(-0.06 + i * 0.036, 0.024 + (i % 2) * 0.012, -0.02 + (i % 2) * 0.035);
    pp.rotation.y = i * 0.35;
    g.add(pp);
  }

  if (!pazhamOnly) {
    for (let i = 0; i < 2; i++) {
      const vada = new THREE.Mesh(geos.vadaTorus, mats.vadaCrust);
      vada.rotation.x = Math.PI / 2;
      vada.position.set(0.055, 0.025 + i * 0.018, 0.045);
      g.add(vada);
    }
    const samosa = new THREE.Mesh(geos.samosaPyramid, mats.samosaPastry);
    samosa.position.set(0.06, 0.048, -0.055);
    samosa.rotation.y = 0.4;
    g.add(samosa);
  }
  return g;
}

export function buildBakeryTray(): THREE.Group {
  const { geos, mats } = getSharedFoodAssets();
  const g = new THREE.Group();
  const tray = new THREE.Mesh(geos.leafBase, mats.stainlessSteel);
  tray.scale.set(1.4, 1.2, 1.35);
  tray.position.y = 0.008;
  g.add(tray);

  const halwa = new THREE.Mesh(geos.halwaBlock, mats.blackHalwa);
  halwa.position.set(-0.12, 0.032, -0.05);
  const puffA = new THREE.Mesh(geos.puffDome, mats.samosaPastry);
  puffA.position.set(0.04, 0.035, -0.05);
  const puffB = new THREE.Mesh(geos.puffDome, mats.samosaPastry);
  puffB.position.set(0.14, 0.035, -0.05);
  const cake = new THREE.Mesh(geos.cakeLayer, mats.cakeFrosting);
  cake.scale.set(0.82, 0.9, 0.82);
  cake.position.set(0.03, 0.042, 0.075);

  g.add(halwa, puffA, puffB, cake);
  return g;
}

export function buildSeafoodPlatter(): THREE.Group {
  const { geos, mats } = getSharedFoodAssets();
  const g = new THREE.Group();
  const tray = new THREE.Mesh(geos.leafBase, mats.stainlessSteel);
  tray.scale.set(1.25, 1, 1.15);
  tray.position.y = 0.008;
  g.add(tray);

  for (let i = 0; i < 4; i++) {
    const mussel = new THREE.Mesh(geos.musselShell, mats.musselShellMat);
    mussel.scale.set(1.4, 0.65, 0.9);
    mussel.position.set(-0.11 + (i % 2) * 0.09, 0.025, -0.04 + Math.floor(i / 2) * 0.07);
    const filling = new THREE.Mesh(geos.roastChunk, mats.musselMasalaMat);
    filling.scale.set(0.95, 0.45, 0.65);
    filling.position.set(mussel.position.x, 0.036, mussel.position.z);
    g.add(mussel, filling);
  }
  const shawarma = new THREE.Mesh(geos.shawarmaWrap, mats.foilWrap);
  shawarma.rotation.z = Math.PI / 2;
  shawarma.position.set(0.09, 0.04, 0.03);
  g.add(shawarma);
  return g;
}

export function buildFoodParcelBox(kind: 'parcel' | 'pothichoru' = 'parcel'): THREE.Group {
  const { geos, mats } = getSharedFoodAssets();
  const g = new THREE.Group();
  if (kind === 'pothichoru') {
    const bundle = new THREE.Mesh(geos.pothichoruLeaf, mats.bananaLeaf);
    bundle.scale.set(1.15, 0.68, 0.95);
    bundle.position.y = 0.06;
    const twineA = new THREE.Mesh(geos.boxStrap, mats.twineMat);
    twineA.scale.set(0.95, 0.8, 0.75);
    twineA.position.y = 0.068;
    const twineB = new THREE.Mesh(geos.boxStrap, mats.twineMat);
    twineB.rotation.y = Math.PI / 2;
    twineB.scale.set(0.8, 0.8, 0.75);
    twineB.position.y = 0.068;
    g.add(bundle, twineA, twineB);
  } else {
    const box = new THREE.Mesh(geos.boxBase, mats.kraftParcel);
    box.position.y = 0.055;
    box.castShadow = true;
    const strap = new THREE.Mesh(geos.boxStrap, mats.curryRed);
    strap.position.y = 0.112;
    g.add(box, strap);
  }
  return g;
}

export function createFoodModel(kind: KozhikodeFoodModelKind): THREE.Group {
  let g: THREE.Group;
  switch (kind) {
    case 'biryani_handi':
      g = buildBiryaniHandi();
      break;
    case 'biryani_plate':
      g = buildBiryaniPlate();
      break;
    case 'kerala_meals':
      g = buildKeralaMealsPlate();
      break;
    case 'porotta_roast':
      g = buildPorottaRoastPlate();
      break;
    case 'appam_stew':
      g = buildAppamStewPlate();
      break;
    case 'pazham_pori_plate':
      g = buildTeaSnacksPlate(true);
      break;
    case 'snacks_assortment':
      g = buildTeaSnacksPlate(false);
      break;
    case 'chai_glass':
      g = buildChaiGlass(false);
      break;
    case 'sulaimani_glass':
      g = buildChaiGlass(true);
      break;
    case 'juice_glass':
      g = buildJuiceGlass('mango');
      break;
    case 'bakery_tray':
      g = buildBakeryTray();
      break;
    case 'seafood_platter':
      g = buildSeafoodPlatter();
      break;
    case 'pothichoru_bundle':
      g = buildFoodParcelBox('pothichoru');
      break;
    case 'food_parcel_box':
    default:
      g = buildFoodParcelBox('parcel');
      break;
  }
  g.userData.foodKind = kind;
  return g;
}
