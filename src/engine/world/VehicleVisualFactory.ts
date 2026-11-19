import * as THREE from 'three';
import type { MaterialLibrary } from '../rendering/MaterialLibrary.ts';

function buildWheel(radius: number, width: number): THREE.Group {
  const wheel = new THREE.Group();
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.88, metalness: 0.05 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.28, metalness: 0.88 });

  const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 14), tireMat);
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.56, radius * 0.56, width + 0.02, 10), rimMat);
  rim.rotation.z = Math.PI / 2;
  wheel.add(tire, rim);
  return wheel;
}

function wrapWithLod(
  detailed: THREE.Object3D,
  proxySize: [number, number, number],
  proxyColor: number,
  lodMidDist = 90,
): THREE.LOD {
  const lod = new THREE.LOD();
  lod.addLevel(detailed, 0);

  const proxy = new THREE.Mesh(
    new THREE.BoxGeometry(proxySize[0], proxySize[1], proxySize[2]),
    new THREE.MeshStandardMaterial({ color: proxyColor, roughness: 0.55, metalness: 0.2 }),
  );
  proxy.position.y = proxySize[1] * 0.5;
  lod.addLevel(proxy, lodMidDist);
  return lod;
}

export function createAutoRickshawLOD(mats: MaterialLibrary, lodDist = 85): THREE.LOD {
  const auto = new THREE.Group();
  const yellowPaint = new THREE.MeshPhysicalMaterial({
    color: 0xf59e0b,
    roughness: 0.26,
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

  const rearTub = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.72, 1.45), yellowPaint);
  rearTub.position.set(0, 0.58, -0.35);
  rearTub.castShadow = true;
  const cowl = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.76, 0.85), blackBody);
  cowl.position.set(0, 0.62, 0.76);
  cowl.castShadow = true;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.68, 0.35), yellowPaint);
  nose.position.set(0, 0.58, 1.24);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.62, 0.06), glassMat);
  windshield.position.set(0, 1.22, 0.92);
  windshield.rotation.x = -0.32;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.16, 2.05), canopyMat);
  roof.position.set(0, 1.62, -0.05);
  roof.castShadow = true;

  for (const hx of [-0.36, 0.36]) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.08, 10), mats.vehicleHeadlampMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(hx, 0.68, 1.42);
    auto.add(lamp);
  }

  const plateTex = mats.textures.createSignTexture('kl11_plate', 'KL 11', 'CALICUT TAXI', '#facc15', '#0f172a');
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.04), new THREE.MeshStandardMaterial({ map: plateTex }));
  plate.position.set(0, 0.38, 1.43);

  const fw = buildWheel(0.24, 0.14);
  fw.position.set(0, 0.24, 1.15);
  const rl = buildWheel(0.24, 0.16);
  rl.position.set(-0.62, 0.24, -0.68);
  const rr = buildWheel(0.24, 0.16);
  rr.position.set(0.62, 0.24, -0.68);

  auto.add(rearTub, cowl, nose, windshield, roof, plate, fw, rl, rr);
  return wrapWithLod(auto, [1.34, 1.65, 2.5], 0xd97706, lodDist);
}

export function createCityBusLOD(mats: MaterialLibrary, lodDist = 115): THREE.LOD {
  const bus = new THREE.Group();
  const redPaint = new THREE.MeshPhysicalMaterial({ color: 0xb91c1c, roughness: 0.28, metalness: 0.2, clearcoat: 0.8 });
  const creamPaint = new THREE.MeshPhysicalMaterial({ color: 0xfef3c7, roughness: 0.35, clearcoat: 0.6 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.2, clearcoat: 1.0 });

  const lower = new THREE.Mesh(new THREE.BoxGeometry(2.45, 1.25, 8.6), redPaint);
  lower.position.set(0, 1.02, 0);
  lower.castShadow = true;
  const band = new THREE.Mesh(new THREE.BoxGeometry(2.38, 1.15, 8.45), glassMat);
  band.position.set(0, 2.2, 0);
  band.castShadow = true;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.28, 8.55), creamPaint);
  roof.position.set(0, 2.9, 0);
  roof.castShadow = true;

  for (const hx of [-0.85, 0.85]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.08), mats.vehicleHeadlampMat);
    lamp.position.set(hx, 0.72, 4.32);
    bus.add(lamp);
  }

  const destTex = mats.textures.createSignTexture('bus_dest_kzd', 'മാനാഞ്ചിറ · ബീച്ച്', 'MANANCHIRA - BEACH', '#09090b', '#fbbf24');
  const dest = new THREE.Mesh(
    new THREE.BoxGeometry(1.75, 0.34, 0.08),
    new THREE.MeshStandardMaterial({ map: destTex, emissive: 0xffffff, emissiveMap: destTex, emissiveIntensity: 0.55 }),
  );
  dest.position.set(0, 2.66, 4.26);

  for (const [wx, wz] of [[-1.18, 2.75], [1.18, 2.75], [-1.18, -2.55], [1.18, -2.55]]) {
    const w = buildWheel(0.46, 0.28);
    w.position.set(wx, 0.46, wz);
    bus.add(w);
  }
  bus.add(lower, band, roof, dest);
  return wrapWithLod(bus, [2.45, 3.0, 8.6], 0xb91c1c, lodDist);
}

export function createCarLOD(mats: MaterialLibrary, colorHex: number, isSuv = false, lodDist = 90): THREE.LOD {
  const car = new THREE.Group();
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: colorHex, roughness: 0.24, metalness: 0.38, clearcoat: 0.92 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x1e293b, roughness: 0.08, clearcoat: 1.0 });

  const hScale = isSuv ? 1.22 : 1.0;
  const len = isSuv ? 4.35 : 3.85;
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.65 * hScale, len), bodyMat);
  chassis.position.set(0, 0.62 * hScale, 0);
  chassis.castShadow = true;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.6 * hScale, len * 0.56), glassMat);
  cabin.position.set(0, 1.2 * hScale, -0.2);
  cabin.castShadow = true;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, len * 0.5), bodyMat);
  roof.position.set(0, 1.52 * hScale, -0.2);

  for (const hx of [-0.62, 0.62]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.08), mats.vehicleHeadlampMat);
    lamp.position.set(hx, 0.66 * hScale, len * 0.5 + 0.01);
    car.add(lamp);
  }

  for (const [wx, wz] of [[-0.86, len * 0.31], [0.86, len * 0.31], [-0.86, -len * 0.31], [0.86, -len * 0.31]]) {
    const w = buildWheel(isSuv ? 0.36 : 0.32, 0.21);
    w.position.set(wx, isSuv ? 0.36 : 0.32, wz);
    car.add(w);
  }
  car.add(chassis, cabin, roof);
  return wrapWithLod(car, [1.78, 1.6 * hScale, len], colorHex, lodDist);
}

export function createScooterLOD(mats: MaterialLibrary, colorHex = 0x0f766e, lodDist = 65): THREE.LOD {
  const scoot = new THREE.Group();
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: colorHex, roughness: 0.28, metalness: 0.22, clearcoat: 0.85 });
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.8 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.25, metalness: 0.9 });

  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.85), seatMat);
  deck.position.set(0, 0.32, 0);
  const rearBody = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.42, 0.72), bodyMat);
  rearBody.position.set(0, 0.55, -0.34);
  rearBody.castShadow = true;
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.65), seatMat);
  seat.position.set(0, 0.78, -0.26);
  const apron = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.68, 0.24), bodyMat);
  apron.position.set(0, 0.62, 0.45);
  apron.rotation.x = -0.18;
  apron.castShadow = true;
  const handlebar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.64, 8), chromeMat);
  handlebar.rotation.z = Math.PI / 2;
  handlebar.position.set(0, 1.02, 0.42);
  const headlamp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 10), mats.vehicleHeadlampMat);
  headlamp.rotation.x = Math.PI / 2;
  headlamp.position.set(0, 0.98, 0.53);

  const fw = buildWheel(0.21, 0.1);
  fw.position.set(0, 0.21, 0.56);
  const rw = buildWheel(0.21, 0.11);
  rw.position.set(0, 0.21, -0.52);

  scoot.add(deck, rearBody, seat, apron, handlebar, headlamp, fw, rw);
  return wrapWithLod(scoot, [0.5, 1.05, 1.5], colorHex, lodDist);
}

export function createDeliveryTruckLOD(mats: MaterialLibrary, lodDist = 110): THREE.LOD {
  const truck = new THREE.Group();
  const cabMat = new THREE.MeshPhysicalMaterial({ color: 0xe2e8f0, roughness: 0.32, clearcoat: 0.7 });
  const cargoMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.65, metalness: 0.15 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x0f172a, roughness: 0.1, clearcoat: 1.0 });

  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.75, 1.9), cabMat);
  cab.position.set(0, 1.28, 2.05);
  cab.castShadow = true;
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.65, 0.08), glassMat);
  windshield.position.set(0, 1.68, 3.01);
  const cargo = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.15, 4.1), cargoMat);
  cargo.position.set(0, 1.58, -1.0);
  cargo.castShadow = true;

  for (const hx of [-0.75, 0.75]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.08), mats.vehicleHeadlampMat);
    lamp.position.set(hx, 0.78, 3.02);
    truck.add(lamp);
  }
  for (const [wx, wz] of [[-0.98, 2.1], [0.98, 2.1], [-0.98, -1.8], [0.98, -1.8]]) {
    const w = buildWheel(0.4, 0.24);
    w.position.set(wx, 0.4, wz);
    truck.add(w);
  }
  truck.add(cab, windshield, cargo);
  return wrapWithLod(truck, [2.2, 2.6, 6.0], 0x1d4ed8, lodDist);
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
