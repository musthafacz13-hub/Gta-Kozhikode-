import * as THREE from 'three';
import type { GraphicsPresetProfile } from '../assets/AssetRegistry.ts';
import type { StaticAabbCollider } from '../player/PlayerController.ts';
import { getGroundHeightAt } from './KozhikodeGeography.ts';
import {
  createKeralaNpcRig,
  type ArticulatedKeralaNpcRig,
  type KeralaPedestrianVariant,
} from './KeralaNpcRig.ts';

export type PedestrianBehaviorState =
  | 'walk'
  | 'shop_pause'
  | 'bus_wait'
  | 'yield_vehicle'
  | 'player_react';

const FRIENDLY_KOZHIKODE_GREETINGS: Record<string, string[]> = {
  elderly: [
    'Sugamano mone? Drive carefully through the junction.',
    'Nice breeze from the sea today, isn’t it?',
    'Kozhikode people always look out for one another.',
  ],
  student: [
    'Hey! Are you heading towards Mananchira or the Beach?',
    'Fresh shawarma and sulaimani smell amazing around here!',
    'Good luck with the evening deliveries around town!',
  ],
  shop_customer: [
    'Just picked up some hot Kozhikode halwa for the family!',
    'SM Street gets so lively at golden hour.',
    'Nanni! Riders keep this city fed and smiling.',
  ],
  worker: [
    'Busy evening at the market! Watch the speed near crossings.',
    'Grab a glass of meter chai if you get a quick break.',
    'Safe ride ahead through Kozhikode!',
  ],
  default: [
    'Sugamano? Hope your day in Kozhikode is going great!',
    'Nothing beats a warm sulaimani by the coast after work.',
    'Always good to see a friendly face in the neighbourhood!',
  ],
};

export function getFriendlyNpcGreeting(
  pedId: string,
  variant: KeralaPedestrianVariant | string,
  districtName: string,
  nearTeaShop: boolean,
): string {
  if (nearTeaShop) {
    return `Chai time near ${districtName}! Hot meter chai and pazham pori are sizzling.`;
  }
  const pool = FRIENDLY_KOZHIKODE_GREETINGS[variant] ?? FRIENDLY_KOZHIKODE_GREETINGS.default;
  let hash = 0;
  for (let i = 0; i < pedId.length; i++) {
    hash = (hash * 31 + pedId.charCodeAt(i)) | 0;
  }
  return pool[Math.abs(hash) % pool.length];
}

interface SidewalkRoute {
  id: string;
  districtId: string;
  waypoints: Array<{ x: number; z: number; pauseSec?: number; isCrosswalk?: boolean; isBusStop?: boolean; faceYaw?: number }>;
  loop: boolean;
}

export interface ActivePedestrian {
  id: string;
  variant: KeralaPedestrianVariant;
  rig: ArticulatedKeralaNpcRig;
  routeIndex: number;
  waypointIndex: number;
  direction: 1 | -1;
  lateralOffset: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  baseWalkSpeed: number;
  state: PedestrianBehaviorState;
  pauseTimerSec: number;
  gaitPhase: number;
  groupIndex: number;
  seed: number;
}

const PEDESTRIAN_ROUTES: SidewalkRoute[] = [
  // 1. Mananchira Inner Promenade Loop (around the laterite tank)
  {
    id: 'mananchira_promenade',
    districtId: 'mananchira',
    loop: true,
    waypoints: [
      { x: 23.2, z: -21.5 },
      { x: 23.2, z: 0, pauseSec: 2.2 },
      { x: 23.2, z: 21.5 },
      { x: 0, z: 22.0 },
      { x: -23.2, z: 21.5 },
      { x: -23.2, z: -21.5 },
      { x: 0, z: -22.0 },
    ],
  },
  // 2. Mananchira East Commercial Arcade (Sweet Street Bakers / Tea House / Calicut Silks)
  {
    id: 'mananchira_east_shops',
    districtId: 'mananchira',
    loop: true,
    waypoints: [
      { x: 42.6, z: -24.5 },
      { x: 42.6, z: -18.5, pauseSec: 3.4, faceYaw: Math.PI / 2 }, // Bakery shop window
      { x: 42.6, z: -2.0, pauseSec: 2.8, faceYaw: Math.PI / 2 },  // Malabar Tea House
      { x: 42.6, z: 16.5, pauseSec: 3.8, faceYaw: Math.PI / 2 },  // Calicut Silks
      { x: 42.6, z: 25.0 },
      { x: 44.2, z: -10.0 },
    ],
  },
  // 3. Mananchira City Bus Stop Wait & Crosswalk Loop
  {
    id: 'mananchira_bus_and_crosswalk',
    districtId: 'mananchira',
    loop: true,
    waypoints: [
      { x: 26.2, z: -12.0, pauseSec: 6.5, isBusStop: true, faceYaw: Math.PI / 2 },
      { x: 26.2, z: -26.5 },
      { x: 41.5, z: -26.5, isCrosswalk: true }, // Zebra crosswalk across x = 34
      { x: 42.2, z: -42.0, isCrosswalk: true }, // Cross Mavoor Rd z = -35 toward Corner Chai Peedika
      { x: 46.5, z: -45.5, pauseSec: 3.5 },
      { x: 26.2, z: -42.5, isCrosswalk: true },
      { x: 25.8, z: -25.0, isCrosswalk: true },
    ],
  },
  // 4. SM Street Heritage Bazaar Pedestrian Corridor
  {
    id: 'sm_street_bazaar',
    districtId: 'sm_street',
    loop: true,
    waypoints: [
      { x: -3.2, z: 48.0 },
      { x: -6.5, z: 54.0, pauseSec: 3.2, faceYaw: -Math.PI / 2 },
      { x: -4.2, z: 72.0 },
      { x: 4.5, z: 75.0, pauseSec: 3.5, faceYaw: Math.PI / 2 },
      { x: 3.2, z: 96.0, pauseSec: 3.0, faceYaw: Math.PI / 2 },
      { x: -2.5, z: 105.0 },
      { x: 1.5, z: 62.0 },
    ],
  },
  // 5. Mavoor Road Commercial Corridor
  {
    id: 'mavoor_road_walk',
    districtId: 'mavoor_road',
    loop: true,
    waypoints: [
      { x: 47.0, z: -24.0 },
      { x: 54.0, z: -12.0, pauseSec: 3.5, faceYaw: Math.PI / 2 },
      { x: 78.0, z: -25.0 },
      { x: 102.0, z: -12.0, pauseSec: 3.2, faceYaw: -Math.PI / 2 },
      { x: 104.0, z: 18.0 },
      { x: 56.0, z: 18.0, pauseSec: 3.0, faceYaw: -Math.PI / 2 },
    ],
  },
  // 6. Palayam Market & Bus Stand Waiting Route
  {
    id: 'palayam_market_bus',
    districtId: 'palayam',
    loop: true,
    waypoints: [
      { x: 107.0, z: 66.0, pauseSec: 6.0, isBusStop: true, faceYaw: Math.PI / 2 },
      { x: 88.0, z: 74.0, pauseSec: 3.0 },
      { x: 66.0, z: 76.0, pauseSec: 3.2 },
      { x: 47.5, z: 88.0 },
      { x: 82.0, z: 100.0 },
    ],
  },
  // 7. Kozhikode Beach Promenade
  {
    id: 'kozhikode_beach_promenade',
    districtId: 'kozhikode_beach',
    loop: true,
    waypoints: [
      { x: -65.5, z: -24.0 },
      { x: -65.5, z: -4.0, pauseSec: 2.5, faceYaw: -Math.PI / 2 },
      { x: -65.5, z: 22.0 },
      { x: -64.0, z: 32.0, pauseSec: 3.0 },
      { x: -64.0, z: -14.0 },
    ],
  },
  // 8. West Hill Neighborhood Lane (Outside Arjun's Home & West Hill Chai Peedika)
  {
    id: 'west_hill_neighborhood',
    districtId: 'protagonist_home',
    loop: true,
    waypoints: [
      { x: -24.0, z: -129.0 },
      { x: -6.0, z: -129.0, pauseSec: 2.0 },
      { x: 6.0, z: -128.5 },
      { x: 6.0, z: -109.5, isCrosswalk: true }, // Cross West Hill Rd z = -120
      { x: -7.5, z: -107.0, pauseSec: 3.2 },
      { x: -22.5, z: -109.0 },
      { x: -23.5, z: -128.0, isCrosswalk: true },
    ],
  },
  // 9. Nadakkavu Cross Bus Stop & School Road
  {
    id: 'nadakkavu_cross_walk',
    districtId: 'nadakkavu',
    loop: true,
    waypoints: [
      { x: 25.5, z: -206.0, pauseSec: 5.8, isBusStop: true, faceYaw: Math.PI / 2 },
      { x: 12.0, z: -198.5, pauseSec: 3.0 },
      { x: -16.0, z: -198.5, pauseSec: 3.2 },
      { x: 4.0, z: -222.0 },
    ],
  },
  // 10. Railway Station Forecourt
  {
    id: 'railway_station_forecourt',
    districtId: 'railway_station',
    loop: true,
    waypoints: [
      { x: 26.5, z: 132.0, pauseSec: 5.5, isBusStop: true, faceYaw: Math.PI / 2 },
      { x: 10.0, z: 146.0, pauseSec: 3.0 },
      { x: -12.0, z: 142.0 },
      { x: 12.0, z: 134.0 },
    ],
  },
];

const VARIANTS: KeralaPedestrianVariant[] = [
  'man',
  'woman',
  'young_adult',
  'elderly',
  'student',
  'worker',
  'shop_customer',
];

function getPedestrianBudget(tier: GraphicsPresetProfile['tier']): number {
  switch (tier) {
    case 'low':
      return 20;
    case 'medium':
      return 32;
    case 'high':
      return 44;
    case 'ultra':
      return 52;
  }
}

export class PedestrianSystem {
  readonly root = new THREE.Group();
  private readonly pedestrians: ActivePedestrian[] = [];
  private targetCount = 32;
  private accumulatorStep = 0;

  constructor(preset: GraphicsPresetProfile) {
    this.targetCount = getPedestrianBudget(preset.tier);
    this.spawnPedestrians();
  }

  setGraphicsPreset(preset: GraphicsPresetProfile): void {
    this.targetCount = getPedestrianBudget(preset.tier);
    for (let i = 0; i < this.pedestrians.length; i++) {
      this.pedestrians[i].rig.lod.visible = i < this.targetCount;
    }
  }

  getActivePedestrianCount(): number {
    let count = 0;
    for (let i = 0; i < this.pedestrians.length; i++) {
      if (this.pedestrians[i].rig.lod.visible) count++;
    }
    return count;
  }

  getPedestrians(): ReadonlyArray<ActivePedestrian> {
    return this.pedestrians;
  }

  pushPedestrian(id: string, dx: number, dz: number): void {
    for (let i = 0; i < this.pedestrians.length; i++) {
      const p = this.pedestrians[i];
      if (p.id !== id) continue;
      p.x += dx;
      p.z += dz;
      p.y = getGroundHeightAt(p.x, p.z);
      p.state = 'yield_vehicle';
      p.pauseTimerSec = Math.max(p.pauseTimerSec, 0.75);
      p.rig.lod.position.set(p.x, p.y, p.z);
      break;
    }
  }

  private spawnPedestrians(): void {
    const maxPool = 52;
    for (let i = 0; i < maxPool; i++) {
      const routeIdx = i % PEDESTRIAN_ROUTES.length;
      const route = PEDESTRIAN_ROUTES[routeIdx];
      const wpIdx = (i * 2) % route.waypoints.length;
      const wp = route.waypoints[wpIdx];

      // Guarantee every one of the 7 demographic variants is richly represented
      const variant = VARIANTS[i % VARIANTS.length];
      const rig = createKeralaNpcRig(variant, i * 13 + 5, 55);

      // Pair some NPCs into walking groups (side-by-side companion lateral offset)
      const isGrouped = i % 4 === 1;
      const lateralOffset = isGrouped ? 0.72 : ((i % 3) - 1) * 0.42;
      const baseSpeed = variant === 'elderly' ? 1.05 : variant === 'young_adult' || variant === 'student' ? 1.52 : 1.32;

      const x = wp.x + lateralOffset;
      const z = wp.z;
      const y = getGroundHeightAt(x, z);

      rig.lod.position.set(x, y, z);
      rig.lod.visible = i < this.targetCount;
      this.root.add(rig.lod);

      this.pedestrians.push({
        id: `ped_${i}_${variant}`,
        variant,
        rig,
        routeIndex: routeIdx,
        waypointIndex: (wpIdx + 1) % route.waypoints.length,
        direction: i % 5 === 0 ? -1 : 1,
        lateralOffset,
        x,
        y,
        z,
        heading: 0,
        baseWalkSpeed: baseSpeed,
        state: wp.isBusStop ? 'bus_wait' : 'walk',
        pauseTimerSec: wp.isBusStop ? 2.5 + (i % 4) : 0,
        gaitPhase: (i * 1.1) % (Math.PI * 2),
        groupIndex: isGrouped ? i - 1 : -1,
        seed: i,
      });
    }
  }

  update(
    dt: number,
    focusX: number,
    focusZ: number,
    camera: THREE.Camera | undefined,
    colliders: StaticAabbCollider[],
    vehicles: ReadonlyArray<{ x: number; z: number; heading: number; speed: number; length: number; width: number }>,
    playerPos?: { x: number; z: number },
  ): void {
    const safeDt = Math.min(dt, 0.05);
    this.accumulatorStep = (this.accumulatorStep + 1) % 2;

    for (let i = 0; i < this.pedestrians.length; i++) {
      const p = this.pedestrians[i];
      if (i >= this.targetCount) {
        p.rig.lod.visible = false;
        continue;
      }

      const distToFocus = Math.hypot(p.x - focusX, p.z - focusZ);
      if (distToFocus > 165) {
        p.rig.lod.visible = false;
        continue;
      }
      p.rig.lod.visible = true;

      // Throttle distant NPC animation updates cleanly on alternating frames
      const isDistant = distToFocus > 62;
      if (isDistant && (i % 2) !== this.accumulatorStep) {
        if (camera) p.rig.lod.update(camera);
        continue;
      }
      const effDt = isDistant ? safeDt * 2 : safeDt;

      const route = PEDESTRIAN_ROUTES[p.routeIndex];
      const wp = route.waypoints[p.waypointIndex];
      const targetX = wp.x + p.lateralOffset;
      const targetZ = wp.z;

      // 1. Player proximity interaction (notice & yield gently when player gets close)
      let playerClose = false;
      let avoidX = 0;
      let avoidZ = 0;
      if (playerPos) {
        const pdx = p.x - playerPos.x;
        const pdz = p.z - playerPos.z;
        const pDist = Math.hypot(pdx, pdz);
        if (pDist < 2.2 && pDist > 0.01) {
          playerClose = true;
          p.state = 'player_react';
          const push = (2.2 - pDist) * 1.4;
          avoidX += (pdx / pDist) * push;
          avoidZ += (pdz / pDist) * push;
          const lookToPlayer = Math.atan2(playerPos.x - p.x, playerPos.z - p.z);
          p.rig.headGroup.rotation.y = Math.max(-0.65, Math.min(0.65, lookToPlayer - p.heading));
        } else {
          p.rig.headGroup.rotation.y *= Math.max(0, 1 - 6 * effDt);
        }
      }

      // 2. Yield to moving traffic on crosswalks
      let vehicleDanger = false;
      if (wp.isCrosswalk || p.state === 'yield_vehicle') {
        for (let vIdx = 0; vIdx < vehicles.length; vIdx++) {
          const v = vehicles[vIdx];
          if (v.speed < 0.8) continue;
          const vdx = p.x - v.x;
          const vdz = p.z - v.z;
          const distV = Math.hypot(vdx, vdz);
          if (distV < 9.5) {
            const vFwdX = Math.sin(v.heading);
            const vFwdZ = Math.cos(v.heading);
            const ahead = vdx * vFwdX + vdz * vFwdZ;
            const lat = Math.abs(vdx * vFwdZ - vdz * vFwdX);
            if (ahead > -1.5 && ahead < 8.5 && lat < v.width * 0.5 + 1.6) {
              vehicleDanger = true;
              p.state = 'yield_vehicle';
              break;
            }
          }
        }
      }

      // 3. Inter-pedestrian soft separation (except walking companions keep casual spacing)
      for (let j = 0; j < this.pedestrians.length; j++) {
        if (i === j || j >= this.targetCount || !this.pedestrians[j].rig.lod.visible) continue;
        const o = this.pedestrians[j];
        const dx = p.x - o.x;
        const dz = p.z - o.z;
        const dSq = dx * dx + dz * dz;
        if (dSq > 0.001 && dSq < 0.85) {
          const d = Math.sqrt(dSq);
          const s = (0.92 - d) * 1.2;
          avoidX += (dx / d) * s;
          avoidZ += (dz / d) * s;
        }
      }

      let isActuallyWalking = false;

      if (vehicleDanger) {
        p.state = 'yield_vehicle';
      } else if (p.pauseTimerSec > 0 && !playerClose) {
        p.pauseTimerSec -= effDt;
        if (p.pauseTimerSec <= 0) {
          p.state = 'walk';
        }
      } else {
        if (!playerClose) p.state = 'walk';
        const dx = targetX - p.x;
        const dz = targetZ - p.z;
        const dist = Math.hypot(dx, dz);

        if (dist < 0.65) {
          if (wp.pauseSec && wp.pauseSec > 0) {
            p.pauseTimerSec = wp.pauseSec;
            p.state = wp.isBusStop ? 'bus_wait' : 'shop_pause';
            if (wp.faceYaw !== undefined) {
              p.heading = wp.faceYaw;
            }
          }
          // Advance to next waypoint
          const nextIdx = p.waypointIndex + p.direction;
          if (nextIdx >= route.waypoints.length) {
            p.waypointIndex = 0;
          } else if (nextIdx < 0) {
            p.waypointIndex = route.waypoints.length - 1;
          } else {
            p.waypointIndex = nextIdx;
          }
        } else {
          isActuallyWalking = true;
          let stepSpeed = p.baseWalkSpeed;
          // Stay synced near walking partner if part of pair
          if (p.groupIndex >= 0 && p.groupIndex < this.pedestrians.length) {
            const partner = this.pedestrians[p.groupIndex];
            const gap = Math.hypot(partner.x - p.x, partner.z - p.z);
            if (gap > 2.4 && gap < 10) stepSpeed *= 1.16;
          }
          const dirX = dx / dist;
          const dirZ = dz / dist;
          let nextX = p.x + (dirX * stepSpeed + avoidX * 0.65) * effDt;
          let nextZ = p.z + (dirZ * stepSpeed + avoidZ * 0.65) * effDt;

          // Resolve static building collider pushout
          for (let c = 0; c < colliders.length; c++) {
            const col = colliders[c];
            const pad = 0.48;
            if (
              nextX > col.minX - pad &&
              nextX < col.maxX + pad &&
              nextZ > col.minZ - pad &&
              nextZ < col.maxZ + pad
            ) {
              const dL = Math.abs(nextX - (col.minX - pad));
              const dR = Math.abs(col.maxX + pad - nextX);
              const dT = Math.abs(nextZ - (col.minZ - pad));
              const dB = Math.abs(col.maxZ + pad - nextZ);
              const minD = Math.min(dL, dR, dT, dB);
              if (minD === dL) nextX = col.minX - pad;
              else if (minD === dR) nextX = col.maxX + pad;
              else if (minD === dT) nextZ = col.minZ - pad;
              else nextZ = col.maxZ + pad;
            }
          }

          p.x = nextX;
          p.z = nextZ;
          p.heading = Math.atan2(dirX, dirZ);
        }
      }

      p.y = getGroundHeightAt(p.x, p.z);
      p.rig.lod.position.set(p.x, p.y, p.z);
      p.rig.lod.rotation.y = p.heading;

      // 4. Articulated Gait & Idle Animations
      if (isActuallyWalking) {
        p.gaitPhase += effDt * (p.baseWalkSpeed * 4.8);
        const swing = Math.sin(p.gaitPhase) * 0.44;
        p.rig.hipL.rotation.x = swing;
        p.rig.hipR.rotation.x = -swing;
        p.rig.kneeL.rotation.x = Math.max(0, -swing) * 0.55;
        p.rig.kneeR.rotation.x = Math.max(0, swing) * 0.55;
        p.rig.shoulderL.rotation.x = -swing * 0.68;
        p.rig.shoulderR.rotation.x = swing * 0.68;
        p.rig.elbowL.rotation.x = -0.22;
        p.rig.elbowR.rotation.x = -0.22;
        p.rig.torsoGroup.position.y = 0.86 + Math.abs(Math.sin(p.gaitPhase)) * 0.025;
      } else {
        const damp = Math.min(1, effDt * 9);
        p.rig.hipL.rotation.x *= 1 - damp;
        p.rig.hipR.rotation.x *= 1 - damp;
        p.rig.kneeL.rotation.x *= 1 - damp;
        p.rig.kneeR.rotation.x *= 1 - damp;
        p.rig.shoulderL.rotation.x *= 1 - damp;
        p.rig.shoulderR.rotation.x *= 1 - damp;
        p.rig.torsoGroup.position.y = 0.86;
        if (p.state === 'bus_wait' || p.state === 'shop_pause') {
          p.rig.headGroup.rotation.y = Math.sin(performance.now() * 0.001 + p.seed) * 0.25;
        }
      }

      if (camera) {
        p.rig.lod.update(camera);
      }
    }
  }

  dispose(): void {
    this.root.clear();
  }
}
