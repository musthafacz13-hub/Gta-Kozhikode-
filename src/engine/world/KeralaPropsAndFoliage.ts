import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { KozhikodeTexturePack } from './TextureAtlas.ts';

const _dummy = new THREE.Object3D();
const _tint = new THREE.Color();

/**
 * Builds an authentic curved coconut palm crown (arched feathered fronds + coconuts)
 * and curved ringed trunk geometry — zero primitive cones.
 */
export function buildPalmGeometries(): {
  trunkGeo: THREE.BufferGeometry;
  crownGeo: THREE.BufferGeometry;
  coconutGeo: THREE.BufferGeometry;
} {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.35, 3.0, 0.1),
    new THREE.Vector3(0.95, 6.2, 0.22),
    new THREE.Vector3(1.25, 9.2, 0.25),
  ]);
  const trunkGeo = new THREE.TubeGeometry(curve, 14, 0.22, 8, false);
  // Taper trunk upward
  const pos = trunkGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = THREE.MathUtils.clamp(y / 9.2, 0, 1);
    const pt = curve.getPoint(t);
    const taper = THREE.MathUtils.lerp(1.35, 0.62, t);
    pos.setX(i, pt.x + (pos.getX(i) - pt.x) * taper);
    pos.setZ(i, pt.z + (pos.getZ(i) - pt.z) * taper);
  }
  trunkGeo.computeVertexNormals();

  // Build 11 arched coconut fronds radiating from crown tip (1.25, 9.2, 0.25)
  const frondGeos: THREE.BufferGeometry[] = [];
  const frondCount = 11;
  for (let f = 0; f < frondCount; f++) {
    const angle = (f / frondCount) * Math.PI * 2 + (f % 2) * 0.15;
    const tierLift = f % 3 === 0 ? 0.95 : f % 3 === 1 ? 0.25 : -0.45;
    const length = 3.2 + (f % 2) * 0.45;

    // Create arched multi-segment ribbon with tapered leaflet width
    const segs = 7;
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];

    for (let s = 0; s <= segs; s++) {
      const u = s / segs;
      const dist = u * length;
      const droopY = tierLift * u - Math.pow(u, 1.85) * 1.95;
      const width = Math.sin(u * Math.PI) * 0.72 + (1 - u) * 0.08;
      const vDrop = width * 0.22; // V-fold leaf droop

      const cx = Math.cos(angle) * dist;
      const cz = Math.sin(angle) * dist;
      const rx = -Math.sin(angle) * width;
      const rz = Math.cos(angle) * width;

      // Left edge, midrib, right edge (3 vertices per cross-section)
      positions.push(
        1.25 + cx - rx, 9.2 + droopY - vDrop, 0.25 + cz - rz,
        1.25 + cx, 9.2 + droopY, 0.25 + cz,
        1.25 + cx + rx, 9.2 + droopY - vDrop, 0.25 + cz + rz,
      );
      normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);

      if (s < segs) {
        const base = s * 3;
        indices.push(
          base, base + 1, base + 3,
          base + 1, base + 4, base + 3,
          base + 1, base + 2, base + 4,
          base + 2, base + 5, base + 4,
        );
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    frondGeos.push(g);
  }

  const crownGeo = mergeGeometries(frondGeos, false);
  frondGeos.forEach((g) => g.dispose());

  // Cluster of 3 coconuts at crown base
  const nuts: THREE.BufferGeometry[] = [];
  for (let n = 0; n < 3; n++) {
    const a = (n / 3) * Math.PI * 2;
    const nut = new THREE.SphereGeometry(0.18, 8, 6);
    nut.translate(1.25 + Math.cos(a) * 0.25, 8.88, 0.25 + Math.sin(a) * 0.25);
    nuts.push(nut);
  }
  const coconutGeo = mergeGeometries(nuts, false);
  nuts.forEach((g) => g.dispose());

  return { trunkGeo, crownGeo, coconutGeo };
}

/**
 * Builds curved shade-tree geometry (organic branching + multi-lobe canopy, no cones).
 */
export function buildShadeTreeGeometries(): {
  trunkGeo: THREE.BufferGeometry;
  foliageGeo: THREE.BufferGeometry;
} {
  const trunkParts: THREE.BufferGeometry[] = [];
  const base = new THREE.CylinderGeometry(0.28, 0.42, 3.2, 8);
  base.translate(0, 1.6, 0);
  trunkParts.push(base);

  const branchAngles = [0, 2.1, 4.2];
  for (const ang of branchAngles) {
    const br = new THREE.CylinderGeometry(0.12, 0.2, 2.2, 6);
    br.translate(0, 1.1, 0);
    br.rotateZ(0.45);
    br.rotateY(ang);
    br.translate(0, 2.6, 0);
    trunkParts.push(br);
  }
  const trunkGeo = mergeGeometries(trunkParts, false);
  trunkParts.forEach((g) => g.dispose());

  const lobes: THREE.BufferGeometry[] = [];
  const lobeSpecs = [
    [0, 5.1, 0, 2.3],
    [1.3, 4.4, 0.7, 1.6],
    [-1.2, 4.5, 0.9, 1.7],
    [-0.4, 4.3, -1.3, 1.65],
    [0.9, 4.7, -1.0, 1.5],
  ];
  for (const [lx, ly, lz, r] of lobeSpecs) {
    const lobe = new THREE.IcosahedronGeometry(r, 1);
    lobe.scale(1.15, 0.72, 1.15);
    lobe.translate(lx, ly, lz);
    lobes.push(lobe);
  }
  const foliageGeo = mergeGeometries(lobes, false);
  lobes.forEach((g) => g.dispose());

  return { trunkGeo, foliageGeo };
}

export function populateKozhikodePropsAndFoliage(
  root: THREE.Group,
  textures: KozhikodeTexturePack,
): void {
  // 1. Coconut Palms along Beach Road, Mananchira Perimeter & Residential Yards
  const palmPositions: [number, number, number, number][] = [
    [-34, 0, -26, 1.05], [-34, 0, -10, 0.92], [-34, 0, 8, 1.1], [-34, 0, 26, 0.96],
    [-46, 0, -32, 1.0], [-46, 0, -14, 1.12], [-46, 0, 12, 0.95], [-46, 0, 30, 1.04],
    [29, 0, -28, 0.98], [29, 0, 28, 1.05], [-18, 0, -30, 0.9], [16, 0, -30, 1.08],
    [-18, 0, 30, 1.02], [16, 0, 30, 0.94], [-62, 0, -18, 1.15], [-62, 0, 18, 1.06],
  ];

  const { trunkGeo, crownGeo, coconutGeo } = buildPalmGeometries();
  const palmTrunkMat = new THREE.MeshStandardMaterial({
    color: 0x7c5840,
    roughness: 0.92,
    metalness: 0.02,
  });
  const palmFrondMat = new THREE.MeshStandardMaterial({
    color: 0x2e6f32,
    roughness: 0.65,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  const coconutMat = new THREE.MeshStandardMaterial({
    color: 0x654321,
    roughness: 0.75,
  });

  const palmTrunks = new THREE.InstancedMesh(trunkGeo, palmTrunkMat, palmPositions.length);
  const palmCrowns = new THREE.InstancedMesh(crownGeo, palmFrondMat, palmPositions.length);
  const palmNuts = new THREE.InstancedMesh(coconutGeo, coconutMat, palmPositions.length);
  palmTrunks.castShadow = true;
  palmCrowns.castShadow = true;

  palmPositions.forEach(([x, y, z, s], i) => {
    _dummy.position.set(x, y, z);
    _dummy.rotation.set(0, (i * 1.37) % (Math.PI * 2), 0);
    _dummy.scale.setScalar(s);
    _dummy.updateMatrix();
    palmTrunks.setMatrixAt(i, _dummy.matrix);
    palmCrowns.setMatrixAt(i, _dummy.matrix);
    palmNuts.setMatrixAt(i, _dummy.matrix);

    _tint.setHSL(0.3 + (i % 3) * 0.02, 0.52, 0.34 + (i % 4) * 0.03);
    palmCrowns.setColorAt(i, _tint);
  });
  palmTrunks.instanceMatrix.needsUpdate = true;
  palmCrowns.instanceMatrix.needsUpdate = true;
  palmNuts.instanceMatrix.needsUpdate = true;
  if (palmCrowns.instanceColor) palmCrowns.instanceColor.needsUpdate = true;
  palmTrunks.computeBoundingSphere();
  palmCrowns.computeBoundingSphere();
  palmNuts.computeBoundingSphere();
  root.add(palmTrunks, palmCrowns, palmNuts);

  // 2. Mananchira Park Shade Trees (Banyan / Rain Tree silhouettes)
  const shadePositions: [number, number, number, number][] = [
    [-25, 0.18, -19, 1.0], [25, 0.18, -19, 1.05], [-25, 0.18, 19, 0.95], [25, 0.18, 19, 1.1],
    [0, 0.18, -24, 0.92], [0, 0.18, 24, 0.96],
  ];
  const shade = buildShadeTreeGeometries();
  const shadeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4636, roughness: 0.94 });
  const shadeLeafMat = new THREE.MeshStandardMaterial({ color: 0x245c2a, roughness: 0.8 });
  const shadeTrunks = new THREE.InstancedMesh(shade.trunkGeo, shadeTrunkMat, shadePositions.length);
  const shadeCrowns = new THREE.InstancedMesh(shade.foliageGeo, shadeLeafMat, shadePositions.length);
  shadeTrunks.castShadow = true;
  shadeCrowns.castShadow = true;

  shadePositions.forEach(([x, y, z, s], i) => {
    _dummy.position.set(x, y, z);
    _dummy.rotation.set(0, i * 1.1, 0);
    _dummy.scale.setScalar(s);
    _dummy.updateMatrix();
    shadeTrunks.setMatrixAt(i, _dummy.matrix);
    shadeCrowns.setMatrixAt(i, _dummy.matrix);
    _tint.setHSL(0.32, 0.48, 0.26 + (i % 3) * 0.03);
    shadeCrowns.setColorAt(i, _tint);
  });
  shadeTrunks.instanceMatrix.needsUpdate = true;
  shadeCrowns.instanceMatrix.needsUpdate = true;
  if (shadeCrowns.instanceColor) shadeCrowns.instanceColor.needsUpdate = true;
  shadeTrunks.computeBoundingSphere();
  shadeCrowns.computeBoundingSphere();
  root.add(shadeTrunks, shadeCrowns);

  // 3. Curved Swan-Neck Streetlights along Boulevard & Mananchira Perimeter
  const lampPositions: [number, number, number, number][] = [
    [-28, 0.18, -28, Math.PI / 2], [-28, 0.18, 0, Math.PI / 2], [-28, 0.18, 28, Math.PI / 2],
    [28, 0.18, -28, -Math.PI / 2], [28, 0.18, 0, -Math.PI / 2], [28, 0.18, 28, -Math.PI / 2],
    [-10, 0.18, 30, Math.PI], [12, 0.18, 30, Math.PI],
    [-10, 0.18, -30, 0], [12, 0.18, -30, 0],
    [-56, 0.18, -24, Math.PI / 2], [-56, 0.18, 24, Math.PI / 2],
  ];

  const poleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 4.6, 0),
    new THREE.Vector3(0.4, 5.4, 0),
    new THREE.Vector3(1.3, 5.3, 0),
  ]);
  const poleGeo = new THREE.TubeGeometry(poleCurve, 12, 0.075, 6, false);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.75 });
  const bulbGeo = new THREE.BoxGeometry(0.45, 0.1, 0.24);
  bulbGeo.translate(1.3, 5.25, 0);
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    emissive: 0xffb84d,
    emissiveIntensity: 1.8,
  });

  const poleInst = new THREE.InstancedMesh(poleGeo, poleMat, lampPositions.length);
  const bulbInst = new THREE.InstancedMesh(bulbGeo, bulbMat, lampPositions.length);
  poleInst.castShadow = true;

  lampPositions.forEach(([x, y, z, rotY], i) => {
    _dummy.position.set(x, y, z);
    _dummy.rotation.set(0, rotY, 0);
    _dummy.scale.set(1, 1, 1);
    _dummy.updateMatrix();
    poleInst.setMatrixAt(i, _dummy.matrix);
    bulbInst.setMatrixAt(i, _dummy.matrix);
  });
  poleInst.instanceMatrix.needsUpdate = true;
  bulbInst.instanceMatrix.needsUpdate = true;
  poleInst.computeBoundingSphere();
  bulbInst.computeBoundingSphere();
  root.add(poleInst, bulbInst);

  // 4. Kozhikode City Bus Stop Shelter on Mananchira East Boulevard
  const busStop = new THREE.Group();
  busStop.position.set(30.2, 0.18, -12);
  busStop.rotation.y = -Math.PI / 2;

  const shelterSteelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.8 });
  const shelterGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xbae6fd,
    roughness: 0.1,
    metalness: 0.1,
    transparent: true,
    opacity: 0.45,
    clearcoat: 1.0,
  });

  // Back wall frame + glass + cantilever roof + bench
  const backFrame = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.5, 0.12), shelterGlassMat);
  backFrame.position.set(0, 1.35, -0.75);
  busStop.add(backFrame);

  for (const px of [-2.4, 0, 2.4]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.7, 8), shelterSteelMat);
    post.position.set(px, 1.35, -0.75);
    post.castShadow = true;
    busStop.add(post);
  }

  const roof = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.14, 2.2), shelterSteelMat);
  roof.position.set(0, 2.7, 0.1);
  roof.rotation.x = 0.08;
  roof.castShadow = true;
  busStop.add(roof);

  const bench = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.1, 0.55), shelterSteelMat);
  bench.position.set(0, 0.48, -0.35);
  bench.castShadow = true;
  busStop.add(bench);

  const busSignTex = textures.createSignTexture(
    'bus_stop_mananchira',
    'മാനാഞ്ചിറ ബസ് സ്റ്റോപ്പ്',
    'MANANCHIRA CITY BUS STOP',
    '#0f172a',
    '#fbbf24',
  );
  const busSign = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 0.52, 0.16),
    new THREE.MeshStandardMaterial({ map: busSignTex, roughness: 0.4 }),
  );
  busSign.position.set(0, 2.98, 0.85);
  busStop.add(busSign);
  root.add(busStop);

  // 5. Park Benches around Mananchira Promenade
  const benchWoodMat = new THREE.MeshStandardMaterial({ color: 0x7c3f1d, roughness: 0.72 });
  const benchCoords: [number, number, number][] = [
    [-22.8, 0.18, -8], [-22.8, 0.18, 8], [22.8, 0.18, -8], [22.8, 0.18, 8],
    [-8, 0.18, -19.8], [8, 0.18, -19.8], [-8, 0.18, 19.8], [8, 0.18, 19.8],
  ];
  benchCoords.forEach(([bx, by, bz], idx) => {
    const bGroup = new THREE.Group();
    bGroup.position.set(bx, by, bz);
    bGroup.rotation.y = idx < 4 ? (bx < 0 ? Math.PI / 2 : -Math.PI / 2) : (bz < 0 ? 0 : Math.PI);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.55), benchWoodMat);
    seat.position.y = 0.45;
    seat.castShadow = true;
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.45, 0.08), benchWoodMat);
    back.position.set(0, 0.75, -0.24);
    back.rotation.x = -0.15;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.5), shelterSteelMat);
    legL.position.set(-0.85, 0.225, 0);
    const legR = legL.clone();
    legR.position.x = 0.85;
    bGroup.add(seat, back, legL, legR);
    root.add(bGroup);
  });
}

export interface SharedStreetPropGeometries {
  utilityPoleGeo: THREE.BufferGeometry;
  bollardGeo: THREE.BufferGeometry;
  trashBinGeo: THREE.BufferGeometry;
  shrubGeo: THREE.BufferGeometry;
  rockGeo: THREE.BufferGeometry;
  benchGeo: THREE.BufferGeometry;
  unitBoxGeo: THREE.BufferGeometry;
}

let cachedStreetPropGeos: SharedStreetPropGeometries | null = null;

export function getSharedStreetPropGeometries(): SharedStreetPropGeometries {
  if (!cachedStreetPropGeos) {
    // Concrete Kerala utility pole with crossarm & insulators
    const pole = new THREE.BoxGeometry(0.24, 7.6, 0.24);
    pole.translate(0, 3.8, 0);
    const arm = new THREE.BoxGeometry(1.75, 0.14, 0.14);
    arm.translate(0, 7.0, 0);
    const armLow = new THREE.BoxGeometry(1.3, 0.12, 0.12);
    armLow.translate(0, 5.9, 0);
    const utilityPoleGeo = mergeGeometries([pole, arm, armLow], false);
    pole.dispose();
    arm.dispose();
    armLow.dispose();

    const bollardGeo = new THREE.CylinderGeometry(0.11, 0.14, 0.85, 8);
    bollardGeo.translate(0, 0.425, 0);

    const trashBinGeo = new THREE.CylinderGeometry(0.26, 0.22, 0.82, 10);
    trashBinGeo.translate(0, 0.41, 0);

    // Multi-lobe tropical shrub cluster (zero cone primitives)
    const s1 = new THREE.IcosahedronGeometry(0.68, 1);
    s1.scale(1.25, 0.72, 1.15);
    s1.translate(0, 0.44, 0);
    const s2 = new THREE.IcosahedronGeometry(0.48, 1);
    s2.scale(1.1, 0.8, 1.1);
    s2.translate(0.45, 0.34, 0.25);
    const shrubGeo = mergeGeometries([s1, s2], false);
    s1.dispose();
    s2.dispose();

    const rockGeo = new THREE.DodecahedronGeometry(0.85, 0);
    rockGeo.scale(1.35, 0.65, 1.1);
    rockGeo.translate(0, 0.35, 0);

    // Compact urban park/bus bench geometry
    const bSeat = new THREE.BoxGeometry(1.9, 0.08, 0.52);
    bSeat.translate(0, 0.45, 0);
    const bBack = new THREE.BoxGeometry(1.9, 0.42, 0.08);
    bBack.translate(0, 0.72, -0.22);
    const bLegL = new THREE.BoxGeometry(0.1, 0.45, 0.46);
    bLegL.translate(-0.8, 0.225, 0);
    const bLegR = new THREE.BoxGeometry(0.1, 0.45, 0.46);
    bLegR.translate(0.8, 0.225, 0);
    const benchGeo = mergeGeometries([bSeat, bBack, bLegL, bLegR], false);
    bSeat.dispose();
    bBack.dispose();
    bLegL.dispose();
    bLegR.dispose();

    const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);

    for (const g of [utilityPoleGeo, bollardGeo, trashBinGeo, shrubGeo, rockGeo, benchGeo, unitBoxGeo]) {
      g.userData.shared = true;
    }
    cachedStreetPropGeos = {
      utilityPoleGeo,
      bollardGeo,
      trashBinGeo,
      shrubGeo,
      rockGeo,
      benchGeo,
      unitBoxGeo,
    };
  }
  return cachedStreetPropGeos;
}

export interface StreetPropBatchInput {
  utilityPoles?: [number, number, number, number][]; // x, y, z, rotY
  bollards?: [number, number, number][]; // x, y, z
  trashBins?: [number, number, number][];
  shrubs?: [number, number, number, number][]; // x, y, z, scale
  rocks?: [number, number, number, number][];
  benches?: [number, number, number, number][]; // x, y, z, rotY
}

export function addStreetPropInstancedBatch(
  group: THREE.Group,
  mats: {
    utilityPoleMat: THREE.Material;
    constructionOrangeMat: THREE.Material;
    shutterSteelMat: THREE.Material;
    foliageShrubMat: THREE.Material;
    rockLateriteMat: THREE.Material;
    teakWoodMat: THREE.Material;
  },
  input: StreetPropBatchInput,
): void {
  const geos = getSharedStreetPropGeometries();

  const populateRotated = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    items: [number, number, number, number][] | undefined,
    castShadow: boolean,
  ) => {
    if (!items || items.length === 0) return;
    const inst = new THREE.InstancedMesh(geo, mat, items.length);
    inst.castShadow = castShadow;
    inst.receiveShadow = true;
    for (let i = 0; i < items.length; i++) {
      const [x, y, z, rotY] = items[i];
      _dummy.position.set(x, y, z);
      _dummy.rotation.set(0, rotY, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      inst.setMatrixAt(i, _dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    group.add(inst);
  };

  const populateScaled = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    items: [number, number, number, number][] | undefined,
    castShadow: boolean,
  ) => {
    if (!items || items.length === 0) return;
    const inst = new THREE.InstancedMesh(geo, mat, items.length);
    inst.castShadow = castShadow;
    inst.receiveShadow = true;
    for (let i = 0; i < items.length; i++) {
      const [x, y, z, s] = items[i];
      _dummy.position.set(x, y, z);
      _dummy.rotation.set(0, (i * 1.47) % (Math.PI * 2), 0);
      _dummy.scale.setScalar(s);
      _dummy.updateMatrix();
      inst.setMatrixAt(i, _dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    group.add(inst);
  };

  populateRotated(geos.utilityPoleGeo, mats.utilityPoleMat, input.utilityPoles, true);
  populateRotated(geos.benchGeo, mats.teakWoodMat, input.benches, true);
  populateScaled(geos.shrubGeo, mats.foliageShrubMat, input.shrubs, false);
  populateScaled(geos.rockGeo, mats.rockLateriteMat, input.rocks, true);

  if (input.bollards && input.bollards.length > 0) {
    const inst = new THREE.InstancedMesh(geos.bollardGeo, mats.constructionOrangeMat, input.bollards.length);
    for (let i = 0; i < input.bollards.length; i++) {
      const [x, y, z] = input.bollards[i];
      _dummy.position.set(x, y, z);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      inst.setMatrixAt(i, _dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    group.add(inst);
  }

  if (input.trashBins && input.trashBins.length > 0) {
    const inst = new THREE.InstancedMesh(geos.trashBinGeo, mats.shutterSteelMat, input.trashBins.length);
    for (let i = 0; i < input.trashBins.length; i++) {
      const [x, y, z] = input.trashBins[i];
      _dummy.position.set(x, y, z);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      inst.setMatrixAt(i, _dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    group.add(inst);
  }
}

export function addRoadDirectionSign(
  group: THREE.Group,
  mats: {
    darkIronMat: THREE.Material;
    getRoadSignMaterial: (
      key: string,
      routeBadge: string,
      destinationsEn: string[],
      destinationsMl: string,
      bgHex: string,
    ) => THREE.Material;
  },
  spec: {
    key: string;
    x: number;
    y: number;
    z: number;
    rotY: number;
    routeBadge: string;
    destinationsEn: string[];
    destinationsMl: string;
    bgHex?: string;
  },
): void {
  const geos = getSharedStreetPropGeometries();
  const sign = new THREE.Group();
  sign.position.set(spec.x, spec.y, spec.z);
  sign.rotation.y = spec.rotY;

  for (const px of [-1.1, 1.1]) {
    const post = new THREE.Mesh(geos.unitBoxGeo, mats.darkIronMat);
    post.scale.set(0.12, 3.6, 0.12);
    post.position.set(px, 1.8, 0);
    post.castShadow = true;
    sign.add(post);
  }
  const boardMat = mats.getRoadSignMaterial(
    spec.key,
    spec.routeBadge,
    spec.destinationsEn,
    spec.destinationsMl,
    spec.bgHex ?? '#065f46',
  );
  const board = new THREE.Mesh(geos.unitBoxGeo, boardMat);
  board.scale.set(3.2, 1.65, 0.12);
  board.position.set(0, 3.15, 0.04);
  board.castShadow = true;
  sign.add(board);

  group.add(sign);
}

export function addBusStopShelter(
  group: THREE.Group,
  mats: {
    darkIronMat: THREE.Material;
    shopGlassNightMat: THREE.Material;
    teakWoodMat: THREE.Material;
    getSignMaterial: (key: string, ml: string, en: string, bg: string, fg: string) => THREE.Material;
  },
  spec: {
    key: string;
    x: number;
    y: number;
    z: number;
    rotY: number;
    nameMl: string;
    nameEn: string;
  },
): void {
  const geos = getSharedStreetPropGeometries();
  const shelter = new THREE.Group();
  shelter.position.set(spec.x, spec.y, spec.z);
  shelter.rotation.y = spec.rotY;

  const back = new THREE.Mesh(geos.unitBoxGeo, mats.shopGlassNightMat);
  back.scale.set(5.4, 2.4, 0.12);
  back.position.set(0, 1.35, -0.75);

  const roof = new THREE.Mesh(geos.unitBoxGeo, mats.darkIronMat);
  roof.scale.set(5.8, 0.14, 2.3);
  roof.position.set(0, 2.7, 0.1);
  roof.rotation.x = 0.08;
  roof.castShadow = true;

  const bench = new THREE.Mesh(geos.unitBoxGeo, mats.teakWoodMat);
  bench.scale.set(4.0, 0.12, 0.55);
  bench.position.set(0, 0.5, -0.35);

  for (const px of [-2.4, 0, 2.4]) {
    const post = new THREE.Mesh(geos.unitBoxGeo, mats.darkIronMat);
    post.scale.set(0.12, 2.7, 0.12);
    post.position.set(px, 1.35, -0.75);
    shelter.add(post);
  }

  const signMat = mats.getSignMaterial(spec.key, spec.nameMl, spec.nameEn, '#0f172a', '#fbbf24');
  const sign = new THREE.Mesh(geos.unitBoxGeo, signMat);
  sign.scale.set(4.5, 0.54, 0.16);
  sign.position.set(0, 2.98, 0.85);

  shelter.add(back, roof, bench, sign);
  group.add(shelter);
}

export function addTrafficIsland(
  group: THREE.Group,
  mats: {
    lateriteMat: THREE.Material;
    grassMat: THREE.Material;
    constructionOrangeMat: THREE.Material;
    streetLampBulbMat: THREE.Material;
  },
  x: number,
  z: number,
  radius = 3.2,
): void {
  const geos = getSharedStreetPropGeometries();
  const island = new THREE.Group();
  island.position.set(x, 0.03, z);

  const curb = new THREE.Mesh(geos.unitBoxGeo, mats.lateriteMat);
  curb.scale.set(radius * 2, 0.34, radius * 2);
  curb.position.y = 0.17;
  curb.receiveShadow = true;
  curb.castShadow = true;

  const turf = new THREE.Mesh(geos.unitBoxGeo, mats.grassMat);
  turf.scale.set(radius * 1.65, 0.38, radius * 1.65);
  turf.position.y = 0.2;

  const mast = new THREE.Mesh(geos.unitBoxGeo, mats.constructionOrangeMat);
  mast.scale.set(0.22, 2.4, 0.22);
  mast.position.y = 1.4;

  const beacon = new THREE.Mesh(geos.unitBoxGeo, mats.streetLampBulbMat);
  beacon.scale.set(0.36, 0.36, 0.36);
  beacon.position.y = 2.7;

  island.add(curb, turf, mast, beacon);
  group.add(island);
}

export function addParkingBay(
  group: THREE.Group,
  mats: {
    plainAsphaltMat: THREE.Material;
    stripeMat: THREE.Material;
    darkIronMat: THREE.Material;
    getRoadSignMaterial: (
      key: string,
      routeBadge: string,
      destinationsEn: string[],
      destinationsMl: string,
      bgHex: string,
    ) => THREE.Material;
  },
  x: number,
  y: number,
  z: number,
  rotY: number,
  bays = 4,
): void {
  const geos = getSharedStreetPropGeometries();
  const bayWidth = 2.8;
  const totalW = bays * bayWidth + 0.8;
  const depth = 5.2;

  const pad = new THREE.Group();
  pad.position.set(x, y + 0.02, z);
  pad.rotation.y = rotY;

  const tarmac = new THREE.Mesh(geos.unitBoxGeo, mats.plainAsphaltMat);
  tarmac.scale.set(totalW, 0.06, depth);
  tarmac.receiveShadow = true;
  pad.add(tarmac);

  for (let i = 0; i <= bays; i++) {
    const sx = -totalW * 0.5 + 0.4 + i * bayWidth;
    const line = new THREE.Mesh(geos.unitBoxGeo, mats.stripeMat);
    line.scale.set(0.12, 0.08, depth * 0.86);
    line.position.set(sx, 0.015, 0);
    pad.add(line);
  }

  const pSignMat = mats.getRoadSignMaterial(
    'parking_bay_p',
    'P',
    ['PUBLIC PARKING', 'AUTHORIZED BAY'],
    'പാർക്കിംഗ്',
    '#1d4ed8',
  );
  const post = new THREE.Mesh(geos.unitBoxGeo, mats.darkIronMat);
  post.scale.set(0.1, 2.8, 0.1);
  post.position.set(-totalW * 0.5 + 0.25, 1.4, -depth * 0.46);
  const sign = new THREE.Mesh(geos.unitBoxGeo, pSignMat);
  sign.scale.set(1.2, 0.72, 0.1);
  sign.position.set(-totalW * 0.5 + 0.25, 2.55, -depth * 0.46);
  pad.add(post, sign);

  group.add(pad);
}

export function addConstructionSiteProps(
  group: THREE.Group,
  mats: {
    constructionOrangeMat: THREE.Material;
    shutterSteelMat: THREE.Material;
    sandMat: THREE.Material;
  },
  x: number,
  y: number,
  z: number,
): void {
  const geos = getSharedStreetPropGeometries();
  const site = new THREE.Group();
  site.position.set(x, y, z);

  for (const bx of [-3.2, 0, 3.2]) {
    const barrier = new THREE.Mesh(geos.unitBoxGeo, mats.constructionOrangeMat);
    barrier.scale.set(2.4, 0.95, 0.24);
    barrier.position.set(bx, 0.48, 2.2);
    barrier.castShadow = true;
    site.add(barrier);
  }
  const sandMound = new THREE.Mesh(geos.rockGeo, mats.sandMat);
  sandMound.scale.set(2.2, 1.6, 1.9);
  sandMound.position.set(-1.5, 0, -0.5);
  const scaffold = new THREE.Mesh(geos.unitBoxGeo, mats.shutterSteelMat);
  scaffold.scale.set(0.2, 4.2, 0.2);
  scaffold.position.set(2.4, 2.1, -1.0);
  const scaffold2 = scaffold.clone();
  scaffold2.position.x = 4.6;
  const plank = new THREE.Mesh(geos.unitBoxGeo, mats.shutterSteelMat);
  plank.scale.set(2.6, 0.14, 0.7);
  plank.position.set(3.5, 2.6, -1.0);

  site.add(sandMound, scaffold, scaffold2, plank);
  group.add(site);
}

export function addDrainageCurbRun(
  group: THREE.Group,
  mats: {
    parapetMat: THREE.Material;
    darkIronMat: THREE.Material;
  },
  x: number,
  y: number,
  z: number,
  length: number,
  alongZ: boolean,
): void {
  const geos = getSharedStreetPropGeometries();
  const run = new THREE.Group();
  run.position.set(x, y, z);
  if (!alongZ) run.rotation.y = Math.PI / 2;

  const curb = new THREE.Mesh(geos.unitBoxGeo, mats.parapetMat);
  curb.scale.set(0.32, 0.16, length);
  curb.position.y = 0.08;
  curb.receiveShadow = true;
  run.add(curb);

  const grateCount = Math.max(2, Math.floor(length / 18));
  for (let i = 0; i < grateCount; i++) {
    const gz = -length * 0.4 + (i / Math.max(1, grateCount - 1)) * (length * 0.8);
    const grate = new THREE.Mesh(geos.unitBoxGeo, mats.darkIronMat);
    grate.scale.set(0.55, 0.05, 1.1);
    grate.position.set(0.36, 0.03, gz);
    run.add(grate);
  }
  group.add(run);
}

