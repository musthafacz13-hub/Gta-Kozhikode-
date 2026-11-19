import * as THREE from 'three';
import type { KozhikodeTexturePack } from './TextureAtlas.ts';

function buildWheel(radius: number, width: number): THREE.Group {
  const wheel = new THREE.Group();
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.88, metalness: 0.05 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.3, metalness: 0.85 });

  const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 16), tireMat);
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.56, radius * 0.56, width + 0.02, 12), rimMat);
  rim.rotation.z = Math.PI / 2;
  wheel.add(tire, rim);
  return wheel;
}

/**
 * Multi-part Kerala Yellow & Black Auto-Rickshaw (KL-11) — environmental prop / provisional scale reference.
 */
export function createKeralaAutoRickshaw(textures: KozhikodeTexturePack): THREE.Group {
  const auto = new THREE.Group();

  const yellowPaint = new THREE.MeshPhysicalMaterial({
    color: 0xf59e0b,
    roughness: 0.28,
    metalness: 0.15,
    clearcoat: 0.85,
  });
  const blackBody = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.45, metalness: 0.3 });
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xe0f2fe,
    roughness: 0.08,
    transparent: true,
    opacity: 0.55,
    clearcoat: 1.0,
  });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2, metalness: 0.9 });

  // Rear passenger tub (yellow lower, black upper)
  const rearTub = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.72, 1.45), yellowPaint);
  rearTub.position.set(0, 0.58, -0.35);
  rearTub.castShadow = true;
  auto.add(rearTub);

  // Tapered front cowling
  const cowl = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.76, 0.85), blackBody);
  cowl.position.set(0, 0.62, 0.76);
  cowl.castShadow = true;
  auto.add(cowl);

  const frontNose = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.68, 0.35), yellowPaint);
  frontNose.position.set(0, 0.58, 1.24);
  frontNose.castShadow = true;
  auto.add(frontNose);

  // Raked windshield + frame
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.62, 0.06), glassMat);
  windshield.position.set(0, 1.22, 0.92);
  windshield.rotation.x = -0.32;
  auto.add(windshield);

  // Soft black canvas canopy roof & side pillars
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.16, 2.05), canopyMat);
  roof.position.set(0, 1.62, -0.05);
  roof.castShadow = true;
  auto.add(roof);

  for (const sx of [-0.62, 0.62]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.78, 6), chromeMat);
    pillar.position.set(sx, 1.22, -0.95);
    auto.add(pillar);
  }

  // Twin headlamps + KL-11 plate
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfef9c3,
    emissive: 0xfde047,
    emissiveIntensity: 0.9,
  });
  for (const hx of [-0.36, 0.36]) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 10), lampMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(hx, 0.68, 1.42);
    auto.add(lamp);
  }

  const plateTex = textures.createSignTexture('kl11_plate', 'KL 11', 'CALICUT TAXI', '#facc15', '#0f172a');
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.14, 0.04),
    new THREE.MeshStandardMaterial({ map: plateTex }),
  );
  plate.position.set(0, 0.38, 1.43);
  auto.add(plate);

  // 3 Wheels (1 front + 2 rear)
  const frontWheel = buildWheel(0.24, 0.14);
  frontWheel.position.set(0, 0.24, 1.15);
  const rearL = buildWheel(0.24, 0.16);
  rearL.position.set(-0.62, 0.24, -0.68);
  const rearR = buildWheel(0.24, 0.16);
  rearR.position.set(0.62, 0.24, -0.68);
  auto.add(frontWheel, rearL, rearR);

  return auto;
}

/**
 * Multi-part Kerala Red-and-Cream City Bus (environmental prop).
 */
export function createKeralaCityBus(textures: KozhikodeTexturePack): THREE.Group {
  const bus = new THREE.Group();

  const redPaint = new THREE.MeshPhysicalMaterial({
    color: 0xb91c1c,
    roughness: 0.3,
    metalness: 0.2,
    clearcoat: 0.8,
  });
  const creamPaint = new THREE.MeshPhysicalMaterial({
    color: 0xfef3c7,
    roughness: 0.35,
    clearcoat: 0.6,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    roughness: 0.1,
    metalness: 0.2,
    clearcoat: 1.0,
  });

  // Lower crimson body + upper cream window band + roof cap
  const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(2.45, 1.25, 8.6), redPaint);
  lowerHull.position.set(0, 1.02, 0);
  lowerHull.castShadow = true;
  lowerHull.receiveShadow = true;
  bus.add(lowerHull);

  const windowBand = new THREE.Mesh(new THREE.BoxGeometry(2.38, 1.15, 8.45), glassMat);
  windowBand.position.set(0, 2.2, 0);
  windowBand.castShadow = true;
  bus.add(windowBand);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.28, 8.55), creamPaint);
  roof.position.set(0, 2.9, 0);
  roof.castShadow = true;
  bus.add(roof);

  // Destination LED board
  const destTex = textures.createSignTexture(
    'bus_dest_kzd',
    'മാനാഞ്ചിറ · ബീച്ച്',
    'MANANCHIRA - BEACH',
    '#09090b',
    '#fbbf24',
  );
  const destBoard = new THREE.Mesh(
    new THREE.BoxGeometry(1.75, 0.34, 0.08),
    new THREE.MeshStandardMaterial({ map: destTex, emissive: 0xffffff, emissiveMap: destTex, emissiveIntensity: 0.5 }),
  );
  destBoard.position.set(0, 2.66, 4.26);
  bus.add(destBoard);

  // 4 Dual-sized bus wheels
  const wheelCoords: [number, number][] = [
    [-1.18, 2.75], [1.18, 2.75], [-1.18, -2.55], [1.18, -2.55],
  ];
  for (const [wx, wz] of wheelCoords) {
    const w = buildWheel(0.46, 0.28);
    w.position.set(wx, 0.46, wz);
    bus.add(w);
  }

  return bus;
}

/**
 * Multi-part Parked Compact Indian Hatchback Car (environmental prop).
 */
export function createParkedCar(colorHex: number): THREE.Group {
  const car = new THREE.Group();
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: colorHex,
    roughness: 0.25,
    metalness: 0.35,
    clearcoat: 0.9,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x1e293b,
    roughness: 0.08,
    clearcoat: 1.0,
  });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.65, 3.85), bodyMat);
  chassis.position.set(0, 0.62, 0);
  chassis.castShadow = true;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.62, 2.05), glassMat);
  cabin.position.set(0, 1.22, -0.2);
  cabin.castShadow = true;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 1.85), bodyMat);
  roof.position.set(0, 1.54, -0.2);
  car.add(chassis, cabin, roof);

  for (const [wx, wz] of [[-0.84, 1.2], [0.84, 1.2], [-0.84, -1.2], [0.84, -1.2]]) {
    const w = buildWheel(0.32, 0.2);
    w.position.set(wx, 0.32, wz);
    car.add(w);
  }
  return car;
}

export interface ProvisionalPlayerRig {
  group: THREE.Group;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
}

function createHumanRig(
  shirtHex: number,
  pantsHex: number,
): ProvisionalPlayerRig {
  const person = new THREE.Group();
  const skinMat = new THREE.MeshStandardMaterial({ color: 0x8d5524, roughness: 0.72 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirtHex, roughness: 0.8 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pantsHex, roughness: 0.85 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 });

  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.82, 8), pantsMat);
  legL.position.set(-0.11, 0.44, 0);
  legL.castShadow = true;
  const legR = legL.clone();
  legR.position.x = 0.11;

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.58, 0.24), shirtMat);
  torso.position.set(0, 1.14, 0);
  torso.castShadow = true;

  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.56, 7), shirtMat);
  armL.position.set(-0.27, 1.12, 0);
  armL.rotation.z = 0.08;
  const armR = armL.clone();
  armR.position.x = 0.27;
  armR.rotation.z = -0.08;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), skinMat);
  head.position.set(0, 1.58, 0);
  head.castShadow = true;

  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.145, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.58), hairMat);
  hair.position.set(0, 1.6, -0.01);

  person.add(legL, legR, torso, armL, armR, head, hair);
  return { group: person, legL, legR, armL, armR };
}

export function createProvisionalHumanFigure(
  shirtHex: number,
  pantsHex: number,
): THREE.Group {
  return createHumanRig(shirtHex, pantsHex).group;
}

export function populateKozhikodeStreetLife(
  root: THREE.Group,
  textures: KozhikodeTexturePack,
): { playerRig: ProvisionalPlayerRig } {
  // Parked Auto-Rickshaws (SM Street edge, Bus Stand, Beach Rd)
  const autoSpots: [number, number, number][] = [
    [29.5, -24, Math.PI * 0.95],
    [29.5, -20.5, Math.PI],
    [-29.2, 14, 0.1],
    [-58, -8, 0],
  ];
  for (const [ax, az, rot] of autoSpots) {
    const auto = createKeralaAutoRickshaw(textures);
    auto.position.set(ax, 0.02, az);
    auto.rotation.y = rot;
    root.add(auto);
  }

  // Kerala City Bus approaching Mananchira Bus Stop
  const bus = createKeralaCityBus(textures);
  bus.position.set(36.2, 0.02, -4);
  bus.rotation.y = Math.PI;
  root.add(bus);

  // Parked Cars along North & South commercial roads
  const car1 = createParkedCar(0xf8fafc);
  car1.position.set(-8, 0.02, -31.2);
  car1.rotation.y = Math.PI / 2;
  const car2 = createParkedCar(0x334155);
  car2.position.set(14, 0.02, 31.2);
  car2.rotation.y = -Math.PI / 2;
  root.add(car1, car2);

  // Provisional Player Scale Reference & Roadside Citizens (Mananchira Promenade & Bus Stop)
  const playerRig = createHumanRig(0x0f766e, 0x1e293b);
  playerRig.group.position.set(22.5, 0.18, 2.5);
  playerRig.group.rotation.y = -Math.PI * 0.35;
  root.add(playerRig.group);

  const citizens: [number, number, number, number, number, number][] = [
    [29.8, 0.18, -11.5, -Math.PI / 2, 0xf59e0b, 0x334155], // Waiting at Mananchira bus stop
    [30.1, 0.18, -12.6, -Math.PI / 2, 0xe11d48, 0xf8fafc],
    [-22.5, 0.18, -4.0, Math.PI * 0.5, 0x2563eb, 0x1f2937], // Mananchira promenade
    [43.2, 0.18, -19.5, -Math.PI * 0.5, 0xd97706, 0x111827], // Outside Sweet Street Bakers
  ];
  for (const [cx, cy, cz, rot, shirt, pants] of citizens) {
    const fig = createProvisionalHumanFigure(shirt, pants);
    fig.position.set(cx, cy, cz);
    fig.rotation.y = rot;
    root.add(fig);
  }

  return { playerRig };
}
