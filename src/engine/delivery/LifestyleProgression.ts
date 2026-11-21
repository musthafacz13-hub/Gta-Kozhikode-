import type {
  CompletedDeliveryRecord,
  LifestyleUpgradeId,
  PlayerProgressionState,
  ReputationTier,
} from '../types.ts';
import type { VehicleModelId } from '../world/VehicleVisualFactory.ts';

export interface LifestyleUpgradeSpec {
  id: LifestyleUpgradeId;
  name: string;
  malayalamName: string;
  description: string;
  costInr: number;
  category: 'delivery_gear' | 'vehicle_tuning' | 'lifestyle';
  tipMultiplierBonus: number;
  conditionProtectionBonus: number;
}

export interface PurchasableVehicleSpec {
  modelId: VehicleModelId;
  name: string;
  subtitle: string;
  priceInr: number;
  requiredDeliveries: number;
  colorHex: number;
}

export const LIFESTYLE_UPGRADES_CATALOG: LifestyleUpgradeSpec[] = [
  {
    id: 'thermal_bag_pro',
    name: 'Insulated Malabar Pro Bag',
    malayalamName: 'തെർമൽ ഡെലിവറി ബാഗ് പ്രോ',
    description: 'Retains biryani heat longer & cushions bumps (+15% tips, -40% bump wear).',
    costInr: 450,
    category: 'delivery_gear',
    tipMultiplierBonus: 0.15,
    conditionProtectionBonus: 0.4,
  },
  {
    id: 'scooter_tune',
    name: 'West Hill Suspension & Cushioned Carrier',
    malayalamName: 'സ്കൂട്ടർ സസ്പെൻഷൻ ട്യൂൺ',
    description: 'Smooths cobblestone & speed-breaker jars (+10% tips, -30% bump wear).',
    costInr: 750,
    category: 'vehicle_tuning',
    tipMultiplierBonus: 0.1,
    conditionProtectionBonus: 0.3,
  },
  {
    id: 'malabar_uniform',
    name: 'Kozhikode Courier Linen Jacket',
    malayalamName: 'കൊറിയർ ജാക്കറ്റ്',
    description: 'Smart local courier look respected by shopkeepers (+15% customer tips).',
    costInr: 600,
    category: 'lifestyle',
    tipMultiplierBonus: 0.15,
    conditionProtectionBonus: 0,
  },
  {
    id: 'coastal_tourer_upgrade',
    name: 'Waterproof Monsoon Cover & Phone Mount',
    malayalamName: 'മഴക്കാല പ്രൊട്ടക്ഷൻ കിറ്റ്',
    description: 'All-weather rain seal & crisp route visibility (+12% bonus pay).',
    costInr: 950,
    category: 'delivery_gear',
    tipMultiplierBonus: 0.12,
    conditionProtectionBonus: 0.15,
  },
  {
    id: 'tharavadu_comfort',
    name: 'Tharavadu Courtyard Coffee & Rest Upgrade',
    malayalamName: 'തറവാട് വീട് നവീകരണം',
    description: 'Upgrades Arjun’s West Hill home comfort & unlocks +20 reputation prestige.',
    costInr: 1800,
    category: 'lifestyle',
    tipMultiplierBonus: 0.1,
    conditionProtectionBonus: 0,
  },
];

export const PURCHASABLE_VEHICLES_CATALOG: PurchasableVehicleSpec[] = [
  {
    modelId: 'honda_activa',
    name: 'Honda Activa 6G',
    subtitle: 'Starter City Scooter · Reliable & nimble in SM Street traffic',
    priceInr: 0,
    requiredDeliveries: 0,
    colorHex: 0xe2e8f0,
  },
  {
    modelId: 'suzuki_access_125',
    name: 'Suzuki Access 125',
    subtitle: 'Malabar Delivery Favourite · Quick pickup & plush seat',
    priceInr: 650,
    requiredDeliveries: 0,
    colorHex: 0x0f766e,
  },
  {
    modelId: 'hero_commuter',
    name: 'Hero Splendor Commuter',
    subtitle: 'High-mileage highway & bypass rider',
    priceInr: 1100,
    requiredDeliveries: 1,
    colorHex: 0x111827,
  },
  {
    modelId: 'yamaha_fz',
    name: 'Yamaha FZ Street',
    subtitle: 'Sporty Kozhikode city commuter for Mavoor & Bypass',
    priceInr: 1950,
    requiredDeliveries: 3,
    colorHex: 0x1d4ed8,
  },
  {
    modelId: 'royal_enfield',
    name: 'Royal Enfield Classic 350',
    subtitle: 'Iconic Malabar cruiser for Beypore & Beach evening rides',
    priceInr: 3200,
    requiredDeliveries: 5,
    colorHex: 0x18181b,
  },
  {
    modelId: 'auto_rickshaw',
    name: 'Kerala Passenger Auto',
    subtitle: 'Classic yellow-black Kozhikode auto with roomy tray',
    priceInr: 2600,
    requiredDeliveries: 4,
    colorHex: 0xf59e0b,
  },
  {
    modelId: 'maruti_alto',
    name: 'Maruti Suzuki Alto',
    subtitle: 'Compact enclosed city hatchback for rainy monsoon deliveries',
    priceInr: 4200,
    requiredDeliveries: 6,
    colorHex: 0x0284c7,
  },
  {
    modelId: 'maruti_swift',
    name: 'Maruti Suzuki Swift',
    subtitle: 'Peppy city hatchback loved across Kozhikode',
    priceInr: 5800,
    requiredDeliveries: 8,
    colorHex: 0xdc2626,
  },
  {
    modelId: 'tata_nexon',
    name: 'Tata Nexon SUV',
    subtitle: 'All-road compact SUV built for highway & Medical College trips',
    priceInr: 8500,
    requiredDeliveries: 12,
    colorHex: 0x0f766e,
  },
];

export function computeReputationTier(score: number): ReputationTier {
  if (score >= 500) return 'Kozhikode Legend';
  if (score >= 280) return 'Malabar Trusted Courier';
  if (score >= 140) return 'City Regular';
  if (score >= 45) return 'Neighbourhood Rider';
  return 'Newcomer';
}

export function createDefaultProgressionState(): PlayerProgressionState {
  return {
    schemaVersion: 1,
    walletBalanceInr: 250,
    totalEarnedInr: 0,
    completedDeliveries: 0,
    reputationScore: 10,
    reputationTier: 'Newcomer',
    bagEquipped: true,
    discoveredRestaurants: ['rest_westhill_chai'],
    discoveredDistricts: ['protagonist_home'],
    ownedVehicleModels: ['honda_activa'],
    unlockedUpgrades: [],
    deliveryHistory: [],
    updatedAt: Date.now(),
  };
}

export function sanitizeProgressionState(
  raw: Partial<PlayerProgressionState> | null | undefined,
): PlayerProgressionState {
  const def = createDefaultProgressionState();
  if (!raw || typeof raw !== 'object') return def;

  const rep =
    typeof raw.reputationScore === 'number' && Number.isFinite(raw.reputationScore)
      ? Math.max(0, Math.round(raw.reputationScore))
      : def.reputationScore;

  const owned = Array.isArray(raw.ownedVehicleModels)
    ? (raw.ownedVehicleModels.filter((m) =>
        PURCHASABLE_VEHICLES_CATALOG.some((spec) => spec.modelId === m),
      ) as VehicleModelId[])
    : [...def.ownedVehicleModels];
  if (!owned.includes('honda_activa')) {
    owned.unshift('honda_activa');
  }

  const upgrades = Array.isArray(raw.unlockedUpgrades)
    ? (raw.unlockedUpgrades.filter((id) =>
        LIFESTYLE_UPGRADES_CATALOG.some((spec) => spec.id === id),
      ) as LifestyleUpgradeId[])
    : [];

  return {
    schemaVersion: 1,
    walletBalanceInr:
      typeof raw.walletBalanceInr === 'number' && Number.isFinite(raw.walletBalanceInr)
        ? Math.max(0, Math.round(raw.walletBalanceInr))
        : def.walletBalanceInr,
    totalEarnedInr:
      typeof raw.totalEarnedInr === 'number' && Number.isFinite(raw.totalEarnedInr)
        ? Math.max(0, Math.round(raw.totalEarnedInr))
        : def.totalEarnedInr,
    completedDeliveries:
      typeof raw.completedDeliveries === 'number' && Number.isFinite(raw.completedDeliveries)
        ? Math.max(0, Math.round(raw.completedDeliveries))
        : def.completedDeliveries,
    reputationScore: rep,
    reputationTier: computeReputationTier(rep),
    bagEquipped: typeof raw.bagEquipped === 'boolean' ? raw.bagEquipped : true,
    discoveredRestaurants: Array.isArray(raw.discoveredRestaurants)
      ? [...new Set(raw.discoveredRestaurants.filter((x) => typeof x === 'string'))]
      : [...def.discoveredRestaurants],
    discoveredDistricts: Array.isArray(raw.discoveredDistricts)
      ? [...new Set(raw.discoveredDistricts.filter((x) => typeof x === 'string'))]
      : [...def.discoveredDistricts],
    ownedVehicleModels: [...new Set(owned)],
    unlockedUpgrades: [...new Set(upgrades)],
    deliveryHistory: Array.isArray(raw.deliveryHistory)
      ? raw.deliveryHistory.slice(0, 25)
      : [],
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  };
}

export class LifestyleProgression {
  private state: PlayerProgressionState;

  constructor(initial?: Partial<PlayerProgressionState> | null) {
    this.state = sanitizeProgressionState(initial);
  }

  getState(): PlayerProgressionState {
    return {
      ...this.state,
      discoveredRestaurants: [...this.state.discoveredRestaurants],
      discoveredDistricts: [...this.state.discoveredDistricts],
      ownedVehicleModels: [...this.state.ownedVehicleModels],
      unlockedUpgrades: [...this.state.unlockedUpgrades],
      deliveryHistory: [...this.state.deliveryHistory],
    };
  }

  restore(saved: Partial<PlayerProgressionState> | null | undefined): void {
    this.state = sanitizeProgressionState(saved);
  }

  setBagEquipped(equipped: boolean): void {
    this.state.bagEquipped = equipped;
    this.state.updatedAt = Date.now();
  }

  hasUpgrade(id: LifestyleUpgradeId): boolean {
    return this.state.unlockedUpgrades.includes(id);
  }

  getTipBonusMultiplier(): number {
    let bonus = 1.0;
    for (const id of this.state.unlockedUpgrades) {
      const spec = LIFESTYLE_UPGRADES_CATALOG.find((u) => u.id === id);
      if (spec) bonus += spec.tipMultiplierBonus;
    }
    return Number(bonus.toFixed(2));
  }

  getBumpMitigationFactor(): number {
    let reduction = 0;
    for (const id of this.state.unlockedUpgrades) {
      const spec = LIFESTYLE_UPGRADES_CATALOG.find((u) => u.id === id);
      if (spec) reduction += spec.conditionProtectionBonus;
    }
    return Math.max(0.25, 1 - Math.min(0.75, reduction));
  }

  discoverDistrict(districtId: string): boolean {
    if (!districtId || this.state.discoveredDistricts.includes(districtId)) return false;
    this.state.discoveredDistricts.push(districtId);
    this.state.reputationScore += 5;
    this.state.reputationTier = computeReputationTier(this.state.reputationScore);
    this.state.updatedAt = Date.now();
    return true;
  }

  discoverRestaurant(restaurantId: string): boolean {
    if (!restaurantId || this.state.discoveredRestaurants.includes(restaurantId)) return false;
    this.state.discoveredRestaurants.push(restaurantId);
    this.state.reputationScore += 8;
    this.state.reputationTier = computeReputationTier(this.state.reputationScore);
    this.state.updatedAt = Date.now();
    return true;
  }

  recordCompletedDelivery(record: CompletedDeliveryRecord): void {
    this.state.walletBalanceInr += record.earnedInr;
    this.state.totalEarnedInr += record.earnedInr;
    this.state.completedDeliveries += 1;
    const repGain = record.foodCondition >= 90 ? 25 : 18;
    this.state.reputationScore += repGain;
    this.state.reputationTier = computeReputationTier(this.state.reputationScore);
    this.state.deliveryHistory.unshift(record);
    if (this.state.deliveryHistory.length > 25) {
      this.state.deliveryHistory.length = 25;
    }
    if (!this.state.discoveredRestaurants.includes(record.restaurantId)) {
      this.state.discoveredRestaurants.push(record.restaurantId);
    }
    this.state.updatedAt = Date.now();
  }

  purchaseUpgrade(upgradeId: LifestyleUpgradeId): { ok: boolean; reason: string; costInr?: number } {
    const spec = LIFESTYLE_UPGRADES_CATALOG.find((u) => u.id === upgradeId);
    if (!spec) {
      return { ok: false, reason: 'Unknown lifestyle upgrade' };
    }
    if (this.state.unlockedUpgrades.includes(upgradeId)) {
      return { ok: false, reason: `${spec.name} is already unlocked` };
    }
    if (this.state.walletBalanceInr < spec.costInr) {
      return {
        ok: false,
        reason: `Need ₹${spec.costInr} (currently ₹${this.state.walletBalanceInr})`,
      };
    }
    this.state.walletBalanceInr -= spec.costInr;
    this.state.unlockedUpgrades.push(upgradeId);
    if (upgradeId === 'tharavadu_comfort') {
      this.state.reputationScore += 20;
      this.state.reputationTier = computeReputationTier(this.state.reputationScore);
    }
    this.state.updatedAt = Date.now();
    return { ok: true, reason: `Unlocked ${spec.name}`, costInr: spec.costInr };
  }

  purchaseVehicle(modelId: VehicleModelId): { ok: boolean; reason: string; spec?: PurchasableVehicleSpec } {
    const spec = PURCHASABLE_VEHICLES_CATALOG.find((v) => v.modelId === modelId);
    if (!spec) {
      return { ok: false, reason: 'Vehicle not listed in showroom' };
    }
    if (this.state.ownedVehicleModels.includes(modelId)) {
      return { ok: false, reason: `${spec.name} is already in your garage` };
    }
    if (this.state.completedDeliveries < spec.requiredDeliveries) {
      return {
        ok: false,
        reason: `Complete ${spec.requiredDeliveries} deliveries to unlock ${spec.name}`,
      };
    }
    if (this.state.walletBalanceInr < spec.priceInr) {
      return {
        ok: false,
        reason: `Need ₹${spec.priceInr} (wallet ₹${this.state.walletBalanceInr})`,
      };
    }
    this.state.walletBalanceInr -= spec.priceInr;
    this.state.ownedVehicleModels.push(modelId);
    this.state.reputationScore += 15;
    this.state.reputationTier = computeReputationTier(this.state.reputationScore);
    this.state.updatedAt = Date.now();
    return { ok: true, reason: `Purchased ${spec.name}!`, spec };
  }
}
