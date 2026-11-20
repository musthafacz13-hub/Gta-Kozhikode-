import type { NearbyBuildingSummary } from '../types.ts';

export type InteractionActionKind =
  | 'enter_house'
  | 'open_door'
  | 'talk'
  | 'enter_vehicle'
  | 'exit_vehicle'
  | 'use_shop'
  | 'drink_tea'
  | 'sit'
  | 'interact';

export interface ContextualInteractionTarget {
  id: string;
  kind: InteractionActionKind;
  actionLabel: string;
  targetName: string;
  malayalamName?: string;
  distanceMeters: number;
}

export interface NearbyNpcCandidate {
  id: string;
  label: string;
  distanceMeters: number;
}

export interface NearbyVehicleCandidate {
  id: string;
  displayName: string;
  distanceMeters: number;
  canEnter: boolean;
  reason?: string;
}

export interface ResolveInteractionInput {
  nearbyBuilding: NearbyBuildingSummary | null;
  nearHome: boolean;
  homeDistanceMeters: number;
  nearbyNpc?: NearbyNpcCandidate | null;
  nearbyVehicle?: NearbyVehicleCandidate | null;
  isDriving?: boolean;
}

/**
 * Resolves the single highest-priority real contextual interaction available
 * near Arjun. Returns null when no valid target is within range so the HUD
 * never renders an unavailable interaction button.
 */
export function resolveContextualInteraction(
  input: ResolveInteractionInput,
): ContextualInteractionTarget | null {
  const {
    nearbyBuilding,
    nearHome,
    homeDistanceMeters,
    nearbyNpc,
    nearbyVehicle,
    isDriving,
  } = input;

  if (isDriving) {
    return null;
  }

  if (
    nearbyVehicle &&
    nearbyVehicle.canEnter &&
    (!nearbyBuilding || nearbyVehicle.distanceMeters <= nearbyBuilding.distanceMeters + 0.6)
  ) {
    return {
      id: nearbyVehicle.id,
      kind: 'enter_vehicle',
      actionLabel: 'Enter Vehicle',
      targetName: nearbyVehicle.displayName,
      distanceMeters: nearbyVehicle.distanceMeters,
    };
  }

  if (nearbyBuilding) {
    const isHome = nearbyBuilding.ownershipStatus === 'protagonist_home';
    const isTeaShop = nearbyBuilding.futureHooks.businessTag === 'chai_peedika_kerala';

    if (isTeaShop) {
      return {
        id: nearbyBuilding.id,
        kind: 'drink_tea',
        actionLabel: 'Drink Tea',
        targetName: nearbyBuilding.name,
        malayalamName: nearbyBuilding.malayalamName,
        distanceMeters: nearbyBuilding.distanceMeters,
      };
    }

    if (isHome) {
      return {
        id: nearbyBuilding.id,
        kind: 'enter_house',
        actionLabel: 'Enter House',
        targetName: nearbyBuilding.name,
        malayalamName: nearbyBuilding.malayalamName,
        distanceMeters: nearbyBuilding.distanceMeters,
      };
    }

    if (nearbyBuilding.category === 'commercial') {
      return {
        id: nearbyBuilding.id,
        kind: nearbyBuilding.interiorEligible ? 'use_shop' : 'open_door',
        actionLabel: nearbyBuilding.interiorEligible ? 'Use Shop' : 'Open Door',
        targetName: nearbyBuilding.name,
        malayalamName: nearbyBuilding.malayalamName,
        distanceMeters: nearbyBuilding.distanceMeters,
      };
    }

    if (nearbyBuilding.interiorEligible) {
      return {
        id: nearbyBuilding.id,
        kind: 'open_door',
        actionLabel: 'Open Door',
        targetName: nearbyBuilding.name,
        malayalamName: nearbyBuilding.malayalamName,
        distanceMeters: nearbyBuilding.distanceMeters,
      };
    }

    return {
      id: nearbyBuilding.id,
      kind: 'interact',
      actionLabel: 'Interact',
      targetName: nearbyBuilding.name,
      malayalamName: nearbyBuilding.malayalamName,
      distanceMeters: nearbyBuilding.distanceMeters,
    };
  }

  if (nearbyNpc && nearbyNpc.distanceMeters <= 2.6) {
    return {
      id: nearbyNpc.id,
      kind: 'talk',
      actionLabel: 'Talk',
      targetName: nearbyNpc.label,
      distanceMeters: Number(nearbyNpc.distanceMeters.toFixed(1)),
    };
  }

  if (nearHome && homeDistanceMeters <= 7.5) {
    return {
      id: 'bldg_arjun_residence',
      kind: 'enter_house',
      actionLabel: 'Enter House',
      targetName: 'West Hill Tharavadu',
      malayalamName: 'അർജുന്റെ വീട്',
      distanceMeters: homeDistanceMeters,
    };
  }

  return null;
}
