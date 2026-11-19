import * as THREE from 'three';
import type { StaticAabbCollider } from '../player/PlayerController.ts';
import type { KozhikodeTexturePack } from './TextureAtlas.ts';

interface CommercialBlockSpec {
  x: number;
  z: number;
  rotY: number;
  width: number;
  depth: number;
  floors: number;
  facade: 'warm' | 'cream' | 'teal';
  awningColor: number;
  malayalam: string;
  english: string;
  signBg: string;
  signFg: string;
  hasSlopedRoof?: boolean;
}

function createCommercialBuilding(
  spec: CommercialBlockSpec,
  textures: KozhikodeTexturePack,
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(spec.x, 0.18, spec.z);
  group.rotation.y = spec.rotY;

  const groundH = 4.2;
  const upperH = Math.max(1, spec.floors - 1) * 3.5;
  const totalH = groundH + upperH;

  const facadeTex =
    spec.facade === 'warm'
      ? textures.shopFacadeWarm
      : spec.facade === 'teal'
        ? textures.shopFacadeTeal
        : textures.shopFacadeCream;

  const upperMat = new THREE.MeshStandardMaterial({
    map: facadeTex,
    roughness: 0.78,
    metalness: 0.04,
  });
  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0xd6d3d1,
    roughness: 0.82,
  });
  const shutterMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.52,
    metalness: 0.55,
  });
  const shopGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xfef3c7,
    emissive: 0xb45309,
    emissiveIntensity: 0.42,
    roughness: 0.12,
    clearcoat: 0.9,
  });

  // Upper facade volume
  const upper = new THREE.Mesh(
    new THREE.BoxGeometry(spec.width, upperH, spec.depth),
    upperMat,
  );
  upper.position.y = groundH + upperH / 2;
  upper.castShadow = true;
  upper.receiveShadow = true;
  group.add(upper);

  // Recessed ground-floor shopfront core + arcade pillars
  const core = new THREE.Mesh(
    new THREE.BoxGeometry(spec.width - 0.6, groundH, spec.depth - 1.6),
    shutterMat,
  );
  core.position.set(0, groundH / 2, -0.5);
  core.castShadow = true;
  core.receiveShadow = true;
  group.add(core);

  // Illuminated shopfront display bays
  const bayCount = Math.max(2, Math.floor(spec.width / 4.2));
  const baySpacing = (spec.width - 2.2) / bayCount;
  for (let b = 0; b < bayCount; b++) {
    const bx = -spec.width / 2 + 1.1 + baySpacing * (b + 0.5);
    const windowBay = new THREE.Mesh(
      new THREE.BoxGeometry(baySpacing * 0.72, 2.5, 0.16),
      b % 2 === 0 ? shopGlassMat : shutterMat,
    );
    windowBay.position.set(bx, 1.55, spec.depth / 2 - 1.25);
    group.add(windowBay);
  }

  // Front arcade columns
  const colCount = Math.max(3, Math.floor(spec.width / 4.0) + 1);
  for (let c = 0; c < colCount; c++) {
    const cx = -spec.width / 2 + 0.5 + (c / (colCount - 1)) * (spec.width - 1.0);
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.45, groundH, 0.45), pillarMat);
    col.position.set(cx, groundH / 2, spec.depth / 2 - 0.25);
    col.castShadow = true;
    group.add(col);
  }

  // Angled Shop Awning
  const awningMat = new THREE.MeshStandardMaterial({
    color: spec.awningColor,
    roughness: 0.72,
    side: THREE.DoubleSide,
  });
  const awning = new THREE.Mesh(new THREE.BoxGeometry(spec.width + 0.2, 0.1, 1.9), awningMat);
  awning.position.set(0, 3.25, spec.depth / 2 + 0.55);
  awning.rotation.x = 0.28;
  awning.castShadow = true;
  group.add(awning);

  // Malayalam + English Shop Signboard
  const signTex = textures.createSignTexture(
    `sign_${spec.english.replace(/\s+/g, '_').toLowerCase()}`,
    spec.malayalam,
    spec.english,
    spec.signBg,
    spec.signFg,
  );
  const signMat = new THREE.MeshStandardMaterial({
    map: signTex,
    emissive: 0xffffff,
    emissiveMap: signTex,
    emissiveIntensity: 0.35,
    roughness: 0.35,
  });
  const signBoard = new THREE.Mesh(
    new THREE.BoxGeometry(Math.min(spec.width * 0.72, 8.2), 1.35, 0.18),
    signMat,
  );
  signBoard.position.set(0, groundH + 0.35, spec.depth / 2 + 0.12);
  group.add(signBoard);

  // Rooftop Parapet + Optional Mangalore Tile Roof + Black Ribbed Water Tank
  const parapetMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.85 });
  const parapet = new THREE.Mesh(new THREE.BoxGeometry(spec.width + 0.25, 0.55, spec.depth + 0.25), parapetMat);
  parapet.position.y = totalH + 0.25;
  group.add(parapet);

  if (spec.hasSlopedRoof) {
    const roofMat = new THREE.MeshStandardMaterial({
      map: textures.terracottaRoofMap,
      roughness: 0.78,
    });
    const roofGeo = new THREE.ConeGeometry(Math.max(spec.width, spec.depth) * 0.74, 2.8, 4);
    roofGeo.rotateY(Math.PI / 4);
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.scale.set(spec.width / Math.max(spec.width, spec.depth), 1, spec.depth / Math.max(spec.width, spec.depth));
    roof.position.y = totalH + 1.65;
    roof.castShadow = true;
    group.add(roof);
  } else {
    // Sintex-style rooftop water tank
    const tankMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.55 });
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 1.3, 12), tankMat);
    tank.position.set(spec.width * 0.25, totalH + 1.0, -spec.depth * 0.2);
    tank.castShadow = true;
    group.add(tank);
  }

  return group;
}

function createKeralaResidence(
  x: number,
  z: number,
  rotY: number,
  wallHex: number,
  textures: KozhikodeTexturePack,
): THREE.Group {
  const house = new THREE.Group();
  house.position.set(x, 0.18, z);
  house.rotation.y = rotY;

  const wallMat = new THREE.MeshStandardMaterial({ color: wallHex, roughness: 0.82 });
  const lateriteMat = new THREE.MeshStandardMaterial({
    map: textures.lateriteMap,
    bumpMap: textures.lateriteBump,
    bumpScale: 0.06,
    roughness: 0.88,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    map: textures.terracottaRoofMap,
    roughness: 0.74,
  });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3317, roughness: 0.68 });

  // Compound wall perimeter around residence yard
  const wallFrontL = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.45, 0.35), lateriteMat);
  wallFrontL.position.set(-4.75, 0.725, 7.5);
  wallFrontL.castShadow = true;
  const wallFrontR = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.45, 0.35), lateriteMat);
  wallFrontR.position.set(4.75, 0.725, 7.5);
  wallFrontR.castShadow = true;
  const wallBack = new THREE.Mesh(new THREE.BoxGeometry(15.2, 1.45, 0.35), lateriteMat);
  wallBack.position.set(0, 0.725, -7.5);
  const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.45, 15.0), lateriteMat);
  wallLeft.position.set(-7.5, 0.725, 0);
  const wallRight = wallLeft.clone();
  wallRight.position.x = 7.5;
  house.add(wallFrontL, wallFrontR, wallBack, wallLeft, wallRight);

  // Two-story Kerala veranda home
  const lower = new THREE.Mesh(new THREE.BoxGeometry(9.6, 3.3, 8.2), wallMat);
  lower.position.set(0, 1.65, -0.5);
  lower.castShadow = true;
  lower.receiveShadow = true;
  house.add(lower);

  // Front sit-out porch + pillars
  const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.25, 2.6), roofMat);
  porchRoof.position.set(0, 3.1, 4.7);
  porchRoof.rotation.x = 0.2;
  porchRoof.castShadow = true;
  house.add(porchRoof);

  for (const px of [-2.4, 2.4]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 3.0, 10), wallMat);
    pillar.position.set(px, 1.5, 5.6);
    pillar.castShadow = true;
    house.add(pillar);
  }

  // Front timber doorway & windows
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.3, 0.16), woodMat);
  door.position.set(0, 1.15, 3.62);
  house.add(door);

  for (const wx of [-3.1, 3.1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.3, 0.16), woodMat);
    win.position.set(wx, 1.85, 3.62);
    house.add(win);
  }

  // Sloped Mangalore tiled roof
  const mainRoof = new THREE.Mesh(new THREE.ConeGeometry(7.8, 2.7, 4), roofMat);
  mainRoof.position.set(0, 4.6, -0.5);
  mainRoof.rotation.y = Math.PI / 4;
  mainRoof.scale.set(1.15, 1, 0.98);
  mainRoof.castShadow = true;
  house.add(mainRoof);

  return house;
}

export function buildKozhikodeUrbanEnvironment(
  root: THREE.Group,
  textures: KozhikodeTexturePack,
): { waterMesh: THREE.Mesh; colliders: StaticAabbCollider[] } {
  // 1. Extended Natural Terrain Ground (Coastal Sand West -> Urban Laterite/Earth East)
  const groundGeo = new THREE.PlaneGeometry(360, 360);
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x3b352e,
    roughness: 0.95,
    metalness: 0.02,
  });
  const baseGround = new THREE.Mesh(groundGeo, groundMat);
  baseGround.position.y = -0.02;
  baseGround.receiveShadow = true;
  root.add(baseGround);

  // Arabian Sea & Kozhikode Beach Sand Strip on the West (x < -64)
  const beachSandGeo = new THREE.PlaneGeometry(36, 360);
  beachSandGeo.rotateX(-Math.PI / 2);
  const beachSandMat = new THREE.MeshStandardMaterial({
    color: 0xd6b588,
    roughness: 0.92,
  });
  const beachSand = new THREE.Mesh(beachSandGeo, beachSandMat);
  beachSand.position.set(-80, 0.0, 0);
  beachSand.receiveShadow = true;
  root.add(beachSand);

  const seaGeo = new THREE.PlaneGeometry(160, 360);
  seaGeo.rotateX(-Math.PI / 2);
  const seaMat = new THREE.MeshPhysicalMaterial({
    color: 0x0e6b74,
    normalMap: textures.waterNormalMap,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 0.16,
    metalness: 0.15,
    clearcoat: 0.85,
  });
  const seaMesh = new THREE.Mesh(seaGeo, seaMat);
  seaMesh.position.set(-178, -0.15, 0);
  root.add(seaMesh);

  // 2. Interconnected Kozhikode Road Network (Asphalt Streets + Intersections + Crosswalks)
  const roadMat = new THREE.MeshStandardMaterial({
    map: textures.asphaltMap,
    bumpMap: textures.asphaltBump,
    bumpScale: 0.04,
    roughness: 0.72,
    metalness: 0.04,
  });
  const plainAsphaltMat = new THREE.MeshStandardMaterial({
    color: 0x262b35,
    bumpMap: textures.asphaltBump,
    bumpScale: 0.04,
    roughness: 0.74,
  });

  const addRoadSegment = (x: number, z: number, width: number, length: number, rotY = 0) => {
    const geo = new THREE.PlaneGeometry(width, length);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, roadMat);
    mesh.position.set(x, 0.02, z);
    mesh.rotation.y = rotY;
    mesh.receiveShadow = true;
    root.add(mesh);
  };

  // North-South Arterials: Mananchira West Rd, Mananchira East (Palayam-Mavoor), Beach Rd
  addRoadSegment(-34, 0, 12, 220, 0);
  addRoadSegment(34, 0, 13, 220, 0);
  addRoadSegment(-62, 0, 11, 220, 0);

  // East-West Arterials: Mananchira North (Vaikom Basheer Rd), Mananchira South, SM Street Link
  addRoadSegment(0, -35, 11, 200, Math.PI / 2);
  addRoadSegment(0, 35, 11, 200, Math.PI / 2);

  // Intersection patches (Y = 0.03 to eliminate Z-fighting)
  const intersectionCoords: [number, number][] = [
    [-34, -35], [34, -35], [-34, 35], [34, 35], [-62, -35], [-62, 35],
  ];
  for (const [ix, iz] of intersectionCoords) {
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(13.2, 12.2), plainAsphaltMat);
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(ix, 0.035, iz);
    patch.receiveShadow = true;
    root.add(patch);
  }

  // Pedestrian Zebra Crosswalks
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.7 });
  const crosswalkCenters: [number, number, boolean][] = [
    [-34, -27, false], [34, -27, false], [-34, 27, false], [34, 27, false],
    [-25, 35, true], [25, 35, true],
  ];
  for (const [cx, cz, horizontal] of crosswalkCenters) {
    for (let s = -4; s <= 4; s += 2) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 3.2), stripeMat);
      stripe.rotation.x = -Math.PI / 2;
      if (horizontal) {
        stripe.rotation.z = Math.PI / 2;
        stripe.position.set(cx, 0.05, cz + s * 0.9);
      } else {
        stripe.position.set(cx + s * 1.1, 0.05, cz);
      }
      root.add(stripe);
    }
  }

  // 3. Mananchira Square Park Platform, Lawns, Laterite Balustrade & Central Civic Tank
  const sidewalkMat = new THREE.MeshStandardMaterial({
    map: textures.sidewalkMap,
    roughness: 0.85,
  });
  const grassMat = new THREE.MeshStandardMaterial({
    map: textures.grassMap,
    roughness: 0.92,
  });
  const lateriteMat = new THREE.MeshStandardMaterial({
    map: textures.lateriteMap,
    bumpMap: textures.lateriteBump,
    bumpScale: 0.06,
    roughness: 0.86,
  });

  // Central Park Block (-27.5..27.5 x -29..29) raised +0.18m curb
  const parkBase = new THREE.Mesh(new THREE.BoxGeometry(55, 0.18, 58), sidewalkMat);
  parkBase.position.set(0, 0.09, 0);
  parkBase.receiveShadow = true;
  root.add(parkBase);

  // Outer grassy lawn strips inside Mananchira park
  const lawnTop = new THREE.Mesh(new THREE.PlaneGeometry(46, 6.5), grassMat);
  lawnTop.rotation.x = -Math.PI / 2;
  lawnTop.position.set(0, 0.2, -23);
  lawnTop.receiveShadow = true;
  const lawnBot = lawnTop.clone();
  lawnBot.position.z = 23;
  root.add(lawnTop, lawnBot);

  // Sunken Mananchira Civic Water Tank (36m x 26m) with stepped laterite walls
  const tankWallTop = new THREE.Mesh(new THREE.BoxGeometry(38, 0.85, 2.0), lateriteMat);
  tankWallTop.position.set(0, 0.6, -14);
  tankWallTop.castShadow = true;
  tankWallTop.receiveShadow = true;
  const tankWallBot = tankWallTop.clone();
  tankWallBot.position.z = 14;
  const tankWallLeft = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.85, 30), lateriteMat);
  tankWallLeft.position.set(-18, 0.6, 0);
  tankWallLeft.castShadow = true;
  const tankWallRight = tankWallLeft.clone();
  tankWallRight.position.x = 18;
  root.add(tankWallTop, tankWallBot, tankWallLeft, tankWallRight);

  // Ornamental laterite corner & perimeter piers + heritage tiled corner pavilions
  const roofTileMat = new THREE.MeshStandardMaterial({
    map: textures.terracottaRoofMap,
    roughness: 0.74,
  });
  const pavilionCorners: [number, number][] = [
    [-18, -14], [18, -14], [-18, 14], [18, 14],
  ];
  for (const [px, pz] of pavilionCorners) {
    const pav = new THREE.Group();
    pav.position.set(px, 0.18, pz);
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9, 3.4), lateriteMat);
    base.position.y = 0.45;
    base.castShadow = true;
    pav.add(base);
    for (const cx of [-1.2, 1.2]) {
      for (const cz of [-1.2, 1.2]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 2.3, 8), lateriteMat);
        col.position.set(cx, 2.05, cz);
        col.castShadow = true;
        pav.add(col);
      }
    }
    const pavRoof = new THREE.Mesh(new THREE.ConeGeometry(2.9, 1.35, 4), roofTileMat);
    pavRoof.position.y = 3.85;
    pavRoof.rotation.y = Math.PI / 4;
    pavRoof.castShadow = true;
    pav.add(pavRoof);
    root.add(pav);
  }

  // Animated shimmering water inside Mananchira Tank
  const tankWaterGeo = new THREE.PlaneGeometry(34, 26);
  tankWaterGeo.rotateX(-Math.PI / 2);
  const tankWaterMat = new THREE.MeshPhysicalMaterial({
    color: 0x0d746b,
    normalMap: textures.waterNormalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.12,
    metalness: 0.15,
    clearcoat: 0.95,
    clearcoatRoughness: 0.08,
  });
  const waterMesh = new THREE.Mesh(tankWaterGeo, tankWaterMat);
  waterMesh.position.set(0, 0.42, 0);
  waterMesh.receiveShadow = true;
  root.add(waterMesh);

  // Sidewalk pads flanking outer streets
  const eastSidewalk = new THREE.Mesh(new THREE.BoxGeometry(22, 0.18, 95), sidewalkMat);
  eastSidewalk.position.set(52, 0.09, 0);
  eastSidewalk.receiveShadow = true;
  const westSidewalk = new THREE.Mesh(new THREE.BoxGeometry(15, 0.18, 95), sidewalkMat);
  westSidewalk.position.set(-48, 0.09, 0);
  westSidewalk.receiveShadow = true;
  const northSidewalk = new THREE.Mesh(new THREE.BoxGeometry(92, 0.18, 22), sidewalkMat);
  northSidewalk.position.set(0, 0.09, -52);
  northSidewalk.receiveShadow = true;
  const southSidewalk = new THREE.Mesh(new THREE.BoxGeometry(92, 0.18, 22), sidewalkMat);
  southSidewalk.position.set(0, 0.09, 52);
  southSidewalk.receiveShadow = true;
  root.add(eastSidewalk, westSidewalk, northSidewalk, southSidewalk);

  // 4. SM Street & Palayam Commercial Shopfront Rows (East, North, South corridors)
  const buildings: CommercialBlockSpec[] = [
    // East Row (Facing Mananchira / Bus Stop)
    {
      x: 50, z: -20, rotY: -Math.PI / 2, width: 15, depth: 11, floors: 3,
      facade: 'warm', awningColor: 0xb45309,
      malayalam: 'മിഠായി തെരുവ് ബേക്കറി', english: 'Sweet Street Bakers',
      signBg: '#7c2d12', signFg: '#fde68a',
    },
    {
      x: 50, z: -1, rotY: -Math.PI / 2, width: 16, depth: 11, floors: 2,
      facade: 'cream', awningColor: 0x0f766e,
      malayalam: 'മലബാർ ചായ & സ്നാക്സ്', english: 'Malabar Tea House',
      signBg: '#064e3b', signFg: '#f8fafc', hasSlopedRoof: true,
    },
    {
      x: 50, z: 18, rotY: -Math.PI / 2, width: 15, depth: 11, floors: 3,
      facade: 'teal', awningColor: 0x991b1b,
      malayalam: 'കോഴിക്കോട് ടെക്സ്റ്റൈൽസ്', english: 'Calicut Silks',
      signBg: '#450a0a', signFg: '#fbbf24',
    },
    // North Row (Mavoor / Vaikom Basheer Road)
    {
      x: -16, z: -50, rotY: 0, width: 16, depth: 11, floors: 3,
      facade: 'cream', awningColor: 0x1d4ed8,
      malayalam: 'സാഗർ ബുക്സ് & സ്റ്റേഷനറി', english: 'Sagar Books',
      signBg: '#1e3a8a', signFg: '#f8fafc',
    },
    {
      x: 6, z: -50, rotY: 0, width: 17, depth: 11, floors: 2,
      facade: 'warm', awningColor: 0x15803d,
      malayalam: 'റഹ്മത്ത് ഹോട്ടൽ', english: 'Malabar Biriyani',
      signBg: '#14532d', signFg: '#fde047', hasSlopedRoof: true,
    },
    // South Row (Valiyangadi / SM Street Entrance Archway Zone)
    {
      x: -16, z: 50, rotY: Math.PI, width: 15, depth: 11, floors: 2,
      facade: 'warm', awningColor: 0xb91c1c,
      malayalam: 'ഹൽവ ബസാർ', english: 'Kozhikode Halwa Mart',
      signBg: '#7f1d1d', signFg: '#fef08a', hasSlopedRoof: true,
    },
    {
      x: 18, z: 50, rotY: Math.PI, width: 16, depth: 11, floors: 3,
      facade: 'teal', awningColor: 0x0369a1,
      malayalam: 'പാരഗൺ ഇലക്ട്രോണിക്സ്', english: 'City Mobile & Gear',
      signBg: '#0c4a6e', signFg: '#f8fafc',
    },
  ];

  for (const spec of buildings) {
    root.add(createCommercialBuilding(spec, textures));
  }

  // SM Street Entrance Heritage Arch at (1, 41.5)
  const arch = new THREE.Group();
  arch.position.set(1.5, 0.18, 41.5);
  const archPillarL = new THREE.Mesh(new THREE.BoxGeometry(1.1, 5.2, 1.1), lateriteMat);
  archPillarL.position.set(-5.2, 2.6, 0);
  archPillarL.castShadow = true;
  const archPillarR = archPillarL.clone();
  archPillarR.position.x = 5.2;
  const archBeam = new THREE.Mesh(new THREE.BoxGeometry(12.2, 1.35, 1.25), lateriteMat);
  archBeam.position.set(0, 5.5, 0);
  archBeam.castShadow = true;
  const archSignTex = textures.createSignTexture(
    'sm_street_arch',
    'എസ്.എം. സ്ട്രീറ്റ് · മിഠായി തെരുവ്',
    'S.M. STREET HERITAGE BAZAAR',
    '#7c2d12',
    '#fde68a',
  );
  const archSign = new THREE.Mesh(
    new THREE.BoxGeometry(9.6, 1.05, 1.35),
    new THREE.MeshStandardMaterial({ map: archSignTex, roughness: 0.4 }),
  );
  archSign.position.set(0, 5.5, 0);
  arch.add(archPillarL, archPillarR, archBeam, archSign);
  root.add(arch);

  // 5. Kerala Residential Pocket (West-North & South-West compounds toward Beach Rd)
  root.add(createKeralaResidence(-49, -18, Math.PI / 2, 0xf3e8d6, textures));
  root.add(createKeralaResidence(-49, 16, Math.PI / 2, 0xe7ece6, textures));
  root.add(createKeralaResidence(-50, -52, 0, 0xf4e4d7, textures));
  root.add(createKeralaResidence(32, -52, 0, 0xe5e7eb, textures));

  // Kozhikode Beach Promenade Seawall & Lighthouse Silhouette on West Coast (-69)
  const seawall = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 220), lateriteMat);
  seawall.position.set(-69, 0.55, 0);
  seawall.castShadow = true;
  seawall.receiveShadow = true;
  root.add(seawall);

  const lighthouse = new THREE.Group();
  lighthouse.position.set(-67.5, 0.18, -42);
  const lhBase = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, 3.0, 12), lateriteMat);
  lhBase.position.y = 1.5;
  const lhTower = new THREE.Mesh(
    new THREE.CylinderGeometry(1.25, 1.95, 16.5, 14),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.65 }),
  );
  lhTower.position.y = 11.25;
  lhTower.castShadow = true;
  const lhBand = new THREE.Mesh(
    new THREE.CylinderGeometry(1.52, 1.66, 3.2, 14),
    new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.6 }),
  );
  lhBand.position.y = 11.5;
  const lhLantern = new THREE.Mesh(
    new THREE.CylinderGeometry(1.05, 1.05, 1.8, 12),
    new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.5,
    }),
  );
  lhLantern.position.y = 20.4;
  lighthouse.add(lhBase, lhTower, lhBand, lhLantern);
  root.add(lighthouse);

  return {
    waterMesh,
    colliders: [
      // Mananchira Civic Water Tank perimeter (-19..19 x -15..15)
      { minX: -19.2, maxX: 19.2, minZ: -15.2, maxZ: 15.2 },
      // East Commercial Shopfront Row
      { minX: 43.8, maxX: 56.2, minZ: -28.0, maxZ: 26.0 },
      // North Commercial Row
      { minX: -24.5, maxX: 15.0, minZ: -56.0, maxZ: -44.0 },
      // South Commercial Row
      { minX: -24.0, maxX: -8.0, minZ: 44.0, maxZ: 56.0 },
      { minX: 9.5, maxX: 26.5, minZ: 44.0, maxZ: 56.0 },
      // West Residential House Cores
      { minX: -54.0, maxX: -44.0, minZ: -23.5, maxZ: -12.5 },
      { minX: -54.0, maxX: -44.0, minZ: 10.5, maxZ: 21.5 },
      // Beach Seawall Barrier
      { minX: -70.0, maxX: -68.0, minZ: -110.0, maxZ: 110.0 },
    ],
  };
}

export function getKozhikodeGroundHeight(x: number, z: number): number {
  // Mananchira central park platform
  if (x >= -27.5 && x <= 27.5 && z >= -29 && z <= 29) {
    return 0.18;
  }
  // Raised commercial & residential sidewalks
  if (x >= 41 && x <= 63 && z >= -47.5 && z <= 47.5) return 0.18;
  if (x >= -55.5 && x <= -40.5 && z >= -47.5 && z <= 47.5) return 0.18;
  if (x >= -46 && x <= 46 && z >= -63 && z <= -41) return 0.18;
  if (x >= -46 && x <= 46 && z >= 41 && z <= 63) return 0.18;
  // Beach sand strip west of Beach Rd
  if (x < -67.5) {
    return 0.0;
  }
  // Asphalt road corridors
  return 0.02;
}
