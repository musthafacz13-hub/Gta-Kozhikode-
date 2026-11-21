import type {
  CompletedDeliveryRecord,
  CustomerLocationSpec,
  DeliveryHudSnapshot,
  DeliveryOrder,
  PlayerProgressionState,
  RestaurantSpec,
} from '../types.ts';
import { worldDistanceToRealKm } from '../world/GeoProjection.ts';
import { findRoadRoute } from '../world/RoadNetworkGraph.ts';
import {
  CUSTOMER_DELIVERY_LOCATIONS,
  findRestaurantNearPoint,
  getRestaurantById,
  isRestaurantOpenAtHour,
  KOZHIKODE_RESTAURANTS,
} from './RestaurantCatalog.ts';

export const DELIVERY_INTERACTION_RANGE_METERS = 9.5;

const FRIENDLY_REVIEWS_HIGH = [
  'Nanni! Everything arrived piping hot and neatly packed.',
  'Super fast delivery across Kozhikode! Dropping a generous tip.',
  'Perfect temperature and friendly smile. Best rider in town!',
  'Kozhikode tastes even better when delivered this carefully!',
];

const FRIENDLY_REVIEWS_STANDARD = [
  'Thank you for bringing the food safely! Have a lovely ride.',
  'Good service and warm manners — much appreciated!',
  'Thanks for making the trip over here, stay safe on the road!',
];

export interface AcceptOrderResult {
  ok: boolean;
  reason: string;
  order?: DeliveryOrder;
}

export interface PickupOrderResult {
  ok: boolean;
  reason: string;
  order?: DeliveryOrder;
}

export interface DeliverOrderResult {
  ok: boolean;
  reason: string;
  record?: CompletedDeliveryRecord;
}

export class DeliveryOrderSystem {
  private availableOrders: DeliveryOrder[] = [];
  private activeOrder: DeliveryOrder | null = null;
  private lastFeedback: CompletedDeliveryRecord | null = null;
  private orderCounter = 1;
  private refreshCooldownSec = 0;

  getAvailableOrders(): DeliveryOrder[] {
    return [...this.availableOrders];
  }

  getActiveOrder(): DeliveryOrder | null {
    return this.activeOrder ? { ...this.activeOrder, packageState: { ...this.activeOrder.packageState } } : null;
  }

  getLastFeedback(): CompletedDeliveryRecord | null {
    return this.lastFeedback ? { ...this.lastFeedback } : null;
  }

  restoreActiveOrder(order: DeliveryOrder | null | undefined, lastFeedback?: CompletedDeliveryRecord | null): void {
    this.activeOrder = order ? { ...order, packageState: { ...order.packageState } } : null;
    this.lastFeedback = lastFeedback ? { ...lastFeedback } : null;
  }

  refreshAvailableOrders(
    playerX: number,
    playerZ: number,
    currentHour: number,
    progression: PlayerProgressionState,
    tipMultiplier = 1.0,
  ): DeliveryOrder[] {
    const openRestaurants = KOZHIKODE_RESTAURANTS.filter((r) => isRestaurantOpenAtHour(r, currentHour));
    const pool = openRestaurants.length > 0 ? openRestaurants : KOZHIKODE_RESTAURANTS;

    // Sort open restaurants gently by closeness + variety across districts
    const rankedRestaurants = [...pool].sort((a, b) => {
      const da = Math.hypot(a.pickupX - playerX, a.pickupZ - playerZ);
      const db = Math.hypot(b.pickupX - playerX, b.pickupZ - playerZ);
      return da - db;
    });

    const nextBoard: DeliveryOrder[] = [];
    const usedCustomers = new Set<string>();
    const maxOrders = 6;

    for (let i = 0; i < rankedRestaurants.length && nextBoard.length < maxOrders; i++) {
      // Interleave nearby and citywide hotspots for variety
      const pickIdx = i % 2 === 0 ? Math.floor(i / 2) : Math.min(rankedRestaurants.length - 1, i + 2);
      const rest = rankedRestaurants[pickIdx];
      const cust = this.pickValidCustomerForRestaurant(rest, usedCustomers, this.orderCounter + i);
      if (!cust) continue;
      usedCustomers.add(cust.id);
      const order = this.buildOrderForPair(rest, cust, progression.bagEquipped, tipMultiplier);
      nextBoard.push(order);
    }

    this.availableOrders = nextBoard;
    this.refreshCooldownSec = 35;
    return this.getAvailableOrders();
  }

  acceptOrder(orderId: string, nowMs = Date.now()): AcceptOrderResult {
    if (this.activeOrder) {
      return {
        ok: false,
        reason: `Finish or cancel "${this.activeOrder.restaurantName}" before taking another order`,
      };
    }

    const idx = this.availableOrders.findIndex((o) => o.orderId === orderId);
    if (idx === -1) {
      return { ok: false, reason: 'Order is no longer available on the board' };
    }

    const chosen = {
      ...this.availableOrders[idx],
      packageState: { ...this.availableOrders[idx].packageState },
    };
    this.availableOrders.splice(idx, 1);

    // State transition: available -> accepted -> preparing
    chosen.status = 'preparing';
    chosen.acceptedAt = nowMs;
    chosen.prepRemainingSec = chosen.prepTimeSec;
    this.activeOrder = chosen;

    return {
      ok: true,
      reason: `Accepted order from ${chosen.restaurantName} -> ${chosen.customerPlaceLabel}`,
      order: this.getActiveOrder()!,
    };
  }

  /**
   * Advances kitchen preparation countdown and transit state each simulation step.
   * Returns a brief event string when kitchen prep completes.
   */
  update(
    dtSec: number,
    playerX: number,
    playerZ: number,
    currentHour: number,
    progression: PlayerProgressionState,
    tipMultiplier = 1.0,
  ): { orderBecameReady: boolean } {
    let orderBecameReady = false;

    if (this.availableOrders.length === 0) {
      this.refreshAvailableOrders(playerX, playerZ, currentHour, progression, tipMultiplier);
    } else if (this.refreshCooldownSec > 0) {
      this.refreshCooldownSec -= dtSec;
    } else if (!this.activeOrder) {
      this.refreshAvailableOrders(playerX, playerZ, currentHour, progression, tipMultiplier);
    }

    if (!this.activeOrder) {
      return { orderBecameReady: false };
    }

    if (this.activeOrder.status === 'accepted' || this.activeOrder.status === 'preparing') {
      this.activeOrder.prepRemainingSec = Math.max(0, this.activeOrder.prepRemainingSec - dtSec);
      if (this.activeOrder.prepRemainingSec <= 0) {
        this.activeOrder.status = 'ready_for_pickup';
        orderBecameReady = true;
      }
    } else if (this.activeOrder.status === 'picked_up') {
      const distFromPickup = Math.hypot(
        playerX - this.activeOrder.pickupX,
        playerZ - this.activeOrder.pickupZ,
      );
      if (distFromPickup > 12) {
        this.activeOrder.status = 'in_transit';
      }
    }

    if (
      this.activeOrder.status === 'picked_up' ||
      this.activeOrder.status === 'in_transit'
    ) {
      // Very gentle warmth drift over long rides; insulated bag upgrade slows cooling
      const coolRate = progression.unlockedUpgrades.includes('thermal_bag_pro') ? 0.14 : 0.28;
      this.activeOrder.packageState.temperaturePct = Math.max(
        62,
        Number((this.activeOrder.packageState.temperaturePct - coolRate * dtSec).toFixed(2)),
      );
    }

    return { orderBecameReady };
  }

  pickupOrder(
    playerX: number,
    playerZ: number,
    nowMs = Date.now(),
  ): PickupOrderResult {
    if (!this.activeOrder) {
      return { ok: false, reason: 'No active delivery order to pick up' };
    }
    const order = this.activeOrder;
    const dist = Math.hypot(playerX - order.pickupX, playerZ - order.pickupZ);
    if (dist > DELIVERY_INTERACTION_RANGE_METERS) {
      return {
        ok: false,
        reason: `Move closer to ${order.restaurantName} (${Math.round(dist)}m away)`,
      };
    }

    if (order.status === 'preparing' || order.status === 'accepted') {
      return {
        ok: false,
        reason: `Kitchen still packing order (${Math.ceil(order.prepRemainingSec)}s left)`,
      };
    }

    if (order.status !== 'ready_for_pickup') {
      return { ok: false, reason: 'Order already collected' };
    }

    order.status = 'picked_up';
    order.pickedUpAt = nowMs;
    order.packageState = {
      hasPackage: true,
      bagEquipped: true,
      foodCondition: 100,
      temperaturePct: 100,
      fragile: order.restaurantCategory === 'biryani_shop' || order.restaurantCategory === 'tea_shop',
    };

    return {
      ok: true,
      reason: `Collected order from ${order.restaurantName}. Deliver to ${order.customerPlaceLabel}`,
      order: this.getActiveOrder()!,
    };
  }

  applyTransitBump(impactSpeedMps: number, mitigationFactor = 1.0): number {
    if (
      !this.activeOrder ||
      (this.activeOrder.status !== 'picked_up' && this.activeOrder.status !== 'in_transit')
    ) {
      return 100;
    }
    if (impactSpeedMps < 4.5) {
      return this.activeOrder.packageState.foodCondition;
    }
    const rawLoss = Math.min(14, (impactSpeedMps - 3.5) * 1.45) * mitigationFactor;
    this.activeOrder.packageState.foodCondition = Math.max(
      55,
      Math.round(this.activeOrder.packageState.foodCondition - rawLoss),
    );
    return this.activeOrder.packageState.foodCondition;
  }

  deliverOrder(
    playerX: number,
    playerZ: number,
    tipBonusMultiplier = 1.0,
    nowMs = Date.now(),
  ): DeliverOrderResult {
    if (!this.activeOrder) {
      return { ok: false, reason: 'No active delivery order' };
    }
    const order = this.activeOrder;
    if (order.status !== 'picked_up' && order.status !== 'in_transit') {
      return { ok: false, reason: 'Pick up the food from the restaurant first' };
    }

    const dist = Math.hypot(playerX - order.dropoffX, playerZ - order.dropoffZ);
    if (dist > DELIVERY_INTERACTION_RANGE_METERS) {
      return {
        ok: false,
        reason: `Deliver at ${order.customerPlaceLabel} (${Math.round(dist)}m away)`,
      };
    }

    order.status = 'delivered';
    order.deliveredAt = nowMs;

    const cond = Math.round(order.packageState.foodCondition);
    const condFactor = cond >= 92 ? 1.15 : cond >= 78 ? 1.0 : 0.7;
    const tipEarnedInr = Math.max(10, Math.round(order.tipInr * condFactor * tipBonusMultiplier));
    const earnedInr = order.basePayInr + order.distanceBonusInr + tipEarnedInr;

    const mood: CompletedDeliveryRecord['customerMood'] =
      cond >= 90 ? 'happy' : cond >= 75 ? 'thankful' : 'friendly';
    const reviewPool = cond >= 88 ? FRIENDLY_REVIEWS_HIGH : FRIENDLY_REVIEWS_STANDARD;
    const review = reviewPool[(this.orderCounter + Math.round(earnedInr)) % reviewPool.length];

    const record: CompletedDeliveryRecord = {
      orderId: order.orderId,
      restaurantId: order.restaurantId,
      restaurantName: order.restaurantName,
      customerName: order.customerName,
      customerPlaceLabel: order.customerPlaceLabel,
      earnedInr,
      tipEarnedInr,
      foodCondition: cond,
      customerMood: mood,
      customerReview: `${order.customerGreeting} (${review})`,
      completedAt: nowMs,
    };

    this.lastFeedback = record;
    this.activeOrder = null;

    return {
      ok: true,
      reason: `Delivered to ${record.customerName}! Earned ₹${earnedInr} (incl. ₹${tipEarnedInr} tip)`,
      record,
    };
  }

  cancelActiveOrder(): DeliveryOrder | null {
    if (!this.activeOrder) return null;
    const cancelled = {
      ...this.activeOrder,
      status: 'cancelled' as const,
      packageState: { ...this.activeOrder.packageState, hasPackage: false },
    };
    this.activeOrder = null;
    return cancelled;
  }

  buildHudSnapshot(playerX: number, playerZ: number, currentHour: number): DeliveryHudSnapshot {
    const nearRest = findRestaurantNearPoint(playerX, playerZ, DELIVERY_INTERACTION_RANGE_METERS);
    const active = this.getActiveOrder();

    let pickupDistanceMeters: number | null = null;
    let dropoffDistanceMeters: number | null = null;
    let nearbyPickupReady = false;
    let canCollectNearby = false;
    let canDeliverNearby = false;

    if (active) {
      pickupDistanceMeters = Math.round(Math.hypot(playerX - active.pickupX, playerZ - active.pickupZ));
      dropoffDistanceMeters = Math.round(Math.hypot(playerX - active.dropoffX, playerZ - active.dropoffZ));
      nearbyPickupReady = active.status === 'ready_for_pickup';
      canCollectNearby =
        active.status === 'ready_for_pickup' &&
        pickupDistanceMeters <= DELIVERY_INTERACTION_RANGE_METERS;
      canDeliverNearby =
        (active.status === 'picked_up' || active.status === 'in_transit') &&
        dropoffDistanceMeters <= DELIVERY_INTERACTION_RANGE_METERS;
    }

    return {
      activeOrder: active,
      availableOrders: this.getAvailableOrders(),
      currentHour,
      nearbyRestaurant: nearRest?.restaurant ?? null,
      nearbyPickupReady,
      pickupDistanceMeters,
      dropoffDistanceMeters,
      canCollectNearby,
      canDeliverNearby,
      lastFeedback: this.getLastFeedback(),
    };
  }

  /**
   * Helper for forcing immediate kitchen readiness if desired in controlled checks/tests.
   */
  markActiveOrderReadyForPickup(): boolean {
    if (!this.activeOrder) return false;
    if (this.activeOrder.status === 'accepted' || this.activeOrder.status === 'preparing') {
      this.activeOrder.prepRemainingSec = 0;
      this.activeOrder.status = 'ready_for_pickup';
      return true;
    }
    return false;
  }

  getActiveOrderRestaurant(): RestaurantSpec | null {
    return this.activeOrder ? getRestaurantById(this.activeOrder.restaurantId) : null;
  }

  private pickValidCustomerForRestaurant(
    rest: RestaurantSpec,
    excludeIds: Set<string>,
    seed: number,
  ): CustomerLocationSpec | null {
    const candidates = CUSTOMER_DELIVERY_LOCATIONS.filter((c) => {
      if (excludeIds.has(c.id)) return false;
      const dist = Math.hypot(c.dropoffX - rest.pickupX, c.dropoffZ - rest.pickupZ);
      return dist >= 55;
    });
    const list = candidates.length > 0 ? candidates : CUSTOMER_DELIVERY_LOCATIONS;
    return list[seed % list.length] ?? null;
  }

  private buildOrderForPair(
    rest: RestaurantSpec,
    cust: CustomerLocationSpec,
    bagEquipped: boolean,
    tipMultiplier: number,
  ): DeliveryOrder {
    const idx = this.orderCounter++;
    const menuPick = rest.menuItems[idx % rest.menuItems.length];
    const itemsCount = (idx % 2) + 1;
    const route = findRoadRoute(rest.pickupX, rest.pickupZ, cust.dropoffX, cust.dropoffZ);
    const directMeters = Math.hypot(cust.dropoffX - rest.pickupX, cust.dropoffZ - rest.pickupZ);
    const routeDistanceMeters = route ? Math.round(route.totalWorldMeters) : Math.round(directMeters);
    const routeRealKm = route
      ? route.realDistanceKm
      : Number(worldDistanceToRealKm(routeDistanceMeters).toFixed(2));
    const estimatedMinutes = route ? route.estimatedDriveMinutes : Math.max(1, Math.round(routeRealKm * 2));

    const basePayInr = 45 + itemsCount * 10;
    const distanceBonusInr = Math.max(15, Math.min(180, Math.round(routeDistanceMeters * 0.24)));
    const tipInr = Math.round((20 + (rest.rating >= 4.8 ? 12 : 6)) * tipMultiplier);
    const totalEstimateInr = basePayInr + distanceBonusInr + tipInr;

    return {
      orderId: `ord_kzd_${idx}`,
      restaurantId: rest.id,
      restaurantName: rest.name,
      restaurantMalayalamName: rest.malayalamName,
      restaurantCategory: rest.category,
      restaurantAreaLabel: rest.areaLabel,
      pickupX: rest.pickupX,
      pickupZ: rest.pickupZ,
      customerId: cust.id,
      customerName: cust.customerName,
      customerPlaceLabel: cust.placeLabel,
      customerAreaLabel: cust.areaLabel,
      customerGreeting: cust.greetingLine,
      dropoffX: cust.dropoffX,
      dropoffZ: cust.dropoffZ,
      itemsSummary: `${itemsCount}x ${menuPick.name}`,
      itemsCount,
      prepTimeSec: rest.prepTimeSec,
      prepRemainingSec: rest.prepTimeSec,
      routeDistanceMeters,
      routeRealKm,
      estimatedMinutes,
      basePayInr,
      distanceBonusInr,
      tipInr,
      totalEstimateInr,
      status: 'available',
      acceptedAt: null,
      pickedUpAt: null,
      deliveredAt: null,
      packageState: {
        hasPackage: false,
        bagEquipped,
        foodCondition: 100,
        temperaturePct: 100,
        fragile: rest.category === 'biryani_shop' || rest.category === 'tea_shop',
      },
    };
  }
}
