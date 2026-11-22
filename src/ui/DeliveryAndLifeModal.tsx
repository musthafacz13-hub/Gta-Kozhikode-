import { useMemo, useState } from 'react';
import {
  Award,
  Bike,
  CheckCircle2,
  Clock,
  Compass,
  Navigation,
  Package,
  RefreshCw,
  ShoppingBag,
  Star,
  Store,
  UtensilsCrossed,
  Wallet,
  X,
} from 'lucide-react';
import {
  LIFESTYLE_UPGRADES_CATALOG,
  PURCHASABLE_VEHICLES_CATALOG,
} from '../engine/delivery/LifestyleProgression.ts';
import {
  ALL_DELIVERY_AREAS,
  ALL_RESTAURANT_CATEGORIES,
  isRestaurantOpenAtHour,
  KOZHIKODE_RESTAURANTS,
  RESTAURANT_CATEGORY_LABELS,
} from '../engine/delivery/RestaurantCatalog.ts';
import type {
  EngineHudSnapshot,
  KozhikodeDeliveryAreaId,
  LifestyleUpgradeId,
  RestaurantCategory,
} from '../engine/types.ts';
import type { VehicleModelId } from '../engine/world/VehicleVisualFactory.ts';

export type DeliveryModalTab = 'orders' | 'restaurants' | 'garage' | 'journal';

interface DeliveryAndLifeModalProps {
  snapshot: EngineHudSnapshot;
  initialTab?: DeliveryModalTab;
  onClose: () => void;
  onRefreshOrders: () => void;
  onAcceptOrder: (orderId: string) => { ok: boolean; reason: string };
  onPickupOrder: () => { ok: boolean; reason: string };
  onDeliverOrder: () => { ok: boolean; reason: string };
  onCancelOrder: () => void;
  onNavigateRestaurant: (restaurantId: string) => void;
  onPurchaseUpgrade: (upgradeId: LifestyleUpgradeId) => { ok: boolean; reason: string };
  onPurchaseVehicle: (modelId: VehicleModelId) => { ok: boolean; reason: string };
  onSummonVehicle: (modelId: VehicleModelId) => { ok: boolean; reason: string };
  onToggleDeliveryBag: (equipped?: boolean) => void;
  onUiClick: () => void;
}

const AREA_LABELS: Record<KozhikodeDeliveryAreaId, string> = {
  sm_street: 'S.M. Street',
  mananchira: 'Mananchira',
  mavoor_road: 'Mavoor Rd',
  palayam: 'Palayam',
  railway_station: 'Station / Kallai',
  west_hill: 'West Hill',
  nadakkavu: 'Nadakkavu',
  kozhikode_beach: 'Beach',
  medical_college: 'Med College',
  beypore: 'Beypore',
};

export function DeliveryAndLifeModal({
  snapshot,
  initialTab = 'orders',
  onClose,
  onRefreshOrders,
  onAcceptOrder,
  onPickupOrder,
  onDeliverOrder,
  onCancelOrder,
  onNavigateRestaurant,
  onPurchaseUpgrade,
  onPurchaseVehicle,
  onSummonVehicle,
  onToggleDeliveryBag,
  onUiClick,
}: DeliveryAndLifeModalProps) {
  const [tab, setTab] = useState<DeliveryModalTab>(initialTab);
  const [areaFilter, setAreaFilter] = useState<KozhikodeDeliveryAreaId | 'all'>('all');
  const [catFilter, setCatFilter] = useState<RestaurantCategory | 'all'>('all');
  const [openOnly, setOpenOnly] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  const delivery = snapshot.delivery;
  const progression = snapshot.progression;
  const currentHour = delivery?.currentHour ?? 17.6;
  const activeOrder = delivery?.activeOrder ?? null;
  const availableOrders = delivery?.availableOrders ?? [];
  const walletInr = progression?.walletBalanceInr ?? 250;
  const completedCount = progression?.completedDeliveries ?? 0;

  const filteredRestaurants = useMemo(() => {
    return KOZHIKODE_RESTAURANTS.filter((r) => {
      if (areaFilter !== 'all' && r.areaId !== areaFilter) return false;
      if (catFilter !== 'all' && r.category !== catFilter) return false;
      if (openOnly && !isRestaurantOpenAtHour(r, currentHour)) return false;
      return true;
    });
  }, [areaFilter, catFilter, openOnly, currentHour]);

  const filteredOrders = useMemo(() => {
    if (!openOnly) return availableOrders;
    return availableOrders.filter((ord) => {
      const rest = KOZHIKODE_RESTAURANTS.find((r) => r.id === ord.restaurantId);
      return rest ? isRestaurantOpenAtHour(rest, currentHour) : true;
    });
  }, [availableOrders, openOnly, currentHour]);

  const showResult = (res: { ok: boolean; reason: string }) => {
    setFeedbackBanner(res.reason);
  };

  return (
    <div
      role="dialog"
      aria-label="Kozhikode Food Delivery and Lifestyle Hub"
      className="kl-modal-backdrop fixed inset-0 z-40 flex items-center justify-center p-2 sm:p-4"
    >
      <div className="kl-modal-shell kl-anim-modal flex h-full max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden text-slate-100">
        {/* Header Bar */}
        <div className="kl-hub-header flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
              <UtensilsCrossed className="h-5 w-5" />
            </div>
            <div>
              <h2 className="kl-display font-display text-lg font-bold tracking-wide text-white sm:text-xl">
                KOZHIKODE DELIVERY &amp; LIFE
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="kl-tabular font-mono-tabular font-semibold text-emerald-300">
                  Wallet ₹{walletInr}
                </span>
                <span>·</span>
                <span>{progression?.reputationTier ?? 'Newcomer'}</span>
                <span>·</span>
                <span className="kl-tabular font-mono-tabular">{completedCount} deliveries</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              onUiClick();
              onClose();
            }}
            aria-label="Close Delivery and Life Hub"
            className="kl-btn-tactile flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-white/15 bg-slate-800 text-slate-200 hover:bg-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="kl-tab-strip grid grid-cols-4 gap-1.5 px-3 py-2">
          {(
            [
              ['orders', 'Orders', Package],
              ['restaurants', 'Eateries', Store],
              ['garage', 'Garage & Gear', Bike],
              ['journal', 'Journal', Award],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                onUiClick();
                setTab(id);
              }}
              className={`kl-tab-btn kl-btn-tactile flex min-h-[44px] items-center justify-center gap-1.5 px-2 text-xs font-bold ${
                tab === id ? 'kl-tab-btn--active' : ''
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>

        {feedbackBanner && (
          <div className="kl-anim-reward border-b border-amber-400/35 bg-amber-500/18 px-4 py-2 text-xs font-semibold text-amber-100">
            {feedbackBanner}
          </div>
        )}

        {/* Scrollable Content */}
        <div className="kl-scroll min-h-0 flex-1 overflow-y-auto p-4">
          {tab === 'orders' && (
            <div className="space-y-4">
              {/* Active Order Live Card */}
              {activeOrder ? (
                <div className="kl-surface-panel kl-anim-card rounded-xl border-amber-400/45 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                        Active Order · {activeOrder.status.replace(/_/g, ' ')}
                      </div>
                      <div className="mt-0.5 text-base font-bold text-white">
                        {activeOrder.restaurantName} → {activeOrder.customerPlaceLabel}
                      </div>
                      <div className="text-xs text-slate-300">
                        {activeOrder.itemsSummary} · Customer: {activeOrder.customerName}
                      </div>
                    </div>
                    <div className="text-right font-mono-tabular">
                      <div className="text-lg font-extrabold text-emerald-300">
                        ₹{activeOrder.totalEstimateInr}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {activeOrder.routeRealKm} km · ~{activeOrder.estimatedMinutes} min
                      </div>
                    </div>
                  </div>

                  {/* 3-Step Order Progress Stepper */}
                  <div className="kl-order-stepper mt-3" aria-label="Order Stepper">
                    <div
                      className={`kl-order-step ${
                        activeOrder.status === 'ready_for_pickup' ||
                        activeOrder.status === 'picked_up' ||
                        activeOrder.status === 'in_transit'
                          ? 'kl-order-step--done'
                          : 'kl-order-step--active'
                      }`}
                    >
                      1. Kitchen Prep
                    </div>
                    <div
                      className={`kl-order-step ${
                        activeOrder.status === 'picked_up' || activeOrder.status === 'in_transit'
                          ? 'kl-order-step--done'
                          : activeOrder.status === 'ready_for_pickup'
                            ? 'kl-order-step--active'
                            : ''
                      }`}
                    >
                      2. Collect Parcel
                    </div>
                    <div
                      className={`kl-order-step ${
                        activeOrder.status === 'picked_up' || activeOrder.status === 'in_transit'
                          ? 'kl-order-step--active'
                          : ''
                      }`}
                    >
                      3. Deliver Hot Meal
                    </div>
                  </div>

                  <div className="kl-hud-progress-track mt-2.5">
                    <div
                      className={`kl-hud-progress-fill kl-progress-sheen ${
                        activeOrder.status === 'picked_up' || activeOrder.status === 'in_transit'
                          ? 'bg-emerald-400'
                          : 'bg-amber-400'
                      }`}
                      style={{
                        width: `${
                          activeOrder.status === 'picked_up' || activeOrder.status === 'in_transit'
                            ? Math.max(12, Math.round(activeOrder.packageState.temperaturePct))
                            : activeOrder.status === 'ready_for_pickup'
                              ? 100
                              : Math.max(18, Math.round(100 - activeOrder.prepRemainingSec * 6))
                        }%`,
                      }}
                    />
                  </div>

                  <div className="kl-tabular mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-slate-900/90 px-3 py-2 font-mono-tabular text-xs text-slate-200">
                    {(activeOrder.status === 'accepted' || activeOrder.status === 'preparing') && (
                      <span>
                        Kitchen packing:{' '}
                        <strong className="text-amber-300">
                          {Math.ceil(activeOrder.prepRemainingSec)}s
                        </strong>
                      </span>
                    )}
                    {activeOrder.status === 'ready_for_pickup' && (
                      <span className="font-semibold text-emerald-300">
                        Ready for pickup ({delivery?.pickupDistanceMeters ?? 0}m away)
                      </span>
                    )}
                    {(activeOrder.status === 'picked_up' || activeOrder.status === 'in_transit') && (
                      <>
                        <span>
                          Dropoff:{' '}
                          <strong className="text-emerald-300">
                            {delivery?.dropoffDistanceMeters ?? 0}m
                          </strong>
                        </span>
                        <span>·</span>
                        <span>
                          Food Condition:{' '}
                          <strong className="text-amber-300">
                            {Math.round(activeOrder.packageState.foodCondition)}%
                          </strong>
                        </span>
                        <span>·</span>
                        <span>
                          Warmth:{' '}
                          <strong className="text-sky-300">
                            {Math.round(activeOrder.packageState.temperaturePct)}%
                          </strong>
                        </span>
                      </>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {delivery?.canCollectNearby && (
                      <button
                        type="button"
                        onClick={() => showResult(onPickupOrder())}
                        className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-amber-500 px-4 text-xs font-bold text-slate-950 hover:bg-amber-400"
                      >
                        <ShoppingBag className="h-4 w-4" />
                        <span>Collect Order</span>
                      </button>
                    )}
                    {delivery?.canDeliverNearby && (
                      <button
                        type="button"
                        onClick={() => showResult(onDeliverOrder())}
                        className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-emerald-500 px-4 text-xs font-bold text-slate-950 hover:bg-emerald-400"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Deliver Order</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        onNavigateRestaurant(activeOrder.restaurantId);
                        onClose();
                      }}
                      className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/15 bg-slate-800 px-3.5 text-xs font-semibold text-slate-100 hover:bg-slate-700"
                    >
                      <Navigation className="h-4 w-4 text-amber-400" />
                      <span>Focus Route</span>
                    </button>
                    <button
                      type="button"
                      onClick={onCancelOrder}
                      className="ml-auto flex min-h-[44px] items-center rounded-xl border border-rose-500/40 bg-rose-500/15 px-3.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/25"
                    >
                      Cancel Order
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs text-slate-300">
                  No active delivery right now. Pick an order below to navigate, collect hot Malabar food, and earn legitimate rupees.
                </div>
              )}

              {/* Order Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenOnly((v) => !v)}
                    className={`min-h-[44px] rounded-xl border px-3 text-xs font-semibold ${
                      openOnly
                        ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                        : 'border-white/15 bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {openOnly ? 'Showing Open Now' : 'Filter: Open Now'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={onRefreshOrders}
                  className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-amber-400/40 bg-slate-800 px-3.5 text-xs font-semibold text-amber-300 hover:bg-slate-700"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Refresh Board</span>
                </button>
              </div>

              {/* Available Orders Grid */}
              <div className="grid gap-3 sm:grid-cols-2">
                {filteredOrders.map((order) => (
                  <div
                    key={order.orderId}
                    className="kl-surface-card kl-anim-card flex flex-col justify-between rounded-xl p-3.5"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-bold text-white">
                            {order.restaurantName}
                          </div>
                          <div className="text-[11px] text-amber-300">
                            {order.restaurantMalayalamName} · {order.restaurantAreaLabel}
                          </div>
                        </div>
                        <span className="font-mono-tabular text-sm font-extrabold text-emerald-300">
                          ₹{order.totalEstimateInr}
                        </span>
                      </div>

                      <div className="mt-2 text-xs text-slate-200">{order.itemsSummary}</div>
                      <div className="mt-1 text-[11px] text-slate-400">
                        Deliver to <strong className="text-slate-200">{order.customerPlaceLabel}</strong> ({order.customerName})
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 font-mono-tabular text-[11px] text-slate-400">
                        <span>{order.routeRealKm} km</span>
                        <span>·</span>
                        <span>~{order.estimatedMinutes} min</span>
                        <span>·</span>
                        <span>
                          Base ₹{order.basePayInr} + Dist ₹{order.distanceBonusInr} + Tip ₹{order.tipInr}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        disabled={Boolean(activeOrder)}
                        onClick={() => showResult(onAcceptOrder(order.orderId))}
                        className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3 text-xs font-bold text-slate-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                      >
                        <Package className="h-4 w-4" />
                        <span>{activeOrder ? 'Finish Current Order' : 'Accept Order'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'restaurants' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setAreaFilter('all')}
                  className={`min-h-[40px] rounded-lg px-2.5 text-xs font-semibold ${
                    areaFilter === 'all'
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  All Areas ({KOZHIKODE_RESTAURANTS.length})
                </button>
                {ALL_DELIVERY_AREAS.map((area) => (
                  <button
                    key={area}
                    type="button"
                    onClick={() => setAreaFilter(area)}
                    className={`min-h-[40px] rounded-lg px-2.5 text-xs font-semibold ${
                      areaFilter === area
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {AREA_LABELS[area]}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCatFilter('all')}
                  className={`min-h-[40px] rounded-lg px-2.5 text-xs font-semibold ${
                    catFilter === 'all'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  All Categories
                </button>
                {ALL_RESTAURANT_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCatFilter(cat)}
                    className={`min-h-[40px] rounded-lg px-2.5 text-xs font-semibold ${
                      catFilter === cat
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {RESTAURANT_CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {filteredRestaurants.map((rest) => {
                  const isOpen = isRestaurantOpenAtHour(rest, currentHour);
                  const discovered = progression?.discoveredRestaurants.includes(rest.id);
                  return (
                    <div
                      key={rest.id}
                      className={`kl-restaurant-card kl-category-accent--${rest.category} kl-anim-card flex flex-col justify-between`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-bold text-white">{rest.name}</div>
                            <div className="text-[11px] text-amber-300">
                              {rest.malayalamName} · {rest.areaLabel}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 font-mono-tabular text-xs font-semibold text-amber-300">
                            <Star className="h-3.5 w-3.5 fill-current" />
                            <span>{rest.rating.toFixed(1)}</span>
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2 font-mono-tabular text-[11px] text-slate-400">
                          <span className={isOpen ? 'text-emerald-300' : 'text-rose-300'}>
                            {isOpen ? 'Open' : 'Closed'} ({rest.openHour}:00–{rest.closeHour}:00)
                          </span>
                          <span>·</span>
                          <span>{RESTAURANT_CATEGORY_LABELS[rest.category]}</span>
                          {discovered && (
                            <>
                              <span>·</span>
                              <span className="text-sky-300">Visited</span>
                            </>
                          )}
                        </div>

                        <div className="mt-2 space-y-1 border-t border-white/10 pt-2 text-[11px] text-slate-300">
                          {rest.menuItems.slice(0, 2).map((item) => (
                            <div key={item.id} className="flex items-center justify-between">
                              <span className="truncate pr-2">{item.name}</span>
                              <span className="font-mono-tabular text-emerald-300">₹{item.priceInr}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          onNavigateRestaurant(rest.id);
                          onClose();
                        }}
                        className="mt-3 flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-amber-400/50 bg-amber-500/15 px-3 text-xs font-bold text-amber-200 hover:bg-amber-500/25"
                      >
                        <Compass className="h-4 w-4" />
                        <span>Navigate Here</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'garage' && (
            <div className="space-y-5">
              {/* Thermal Delivery Bag Toggle + Wallet */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/85 p-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    Courier Gear &amp; Balance
                  </div>
                  <div className="mt-1 flex items-center gap-2 font-mono-tabular text-base font-bold text-white">
                    <Wallet className="h-4 w-4 text-emerald-400" />
                    <span>Available Balance: ₹{walletInr}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onToggleDeliveryBag()}
                  className={`flex min-h-[44px] items-center gap-2 rounded-xl border px-4 text-xs font-bold ${
                    progression?.bagEquipped
                      ? 'border-amber-400 bg-amber-500 text-slate-950'
                      : 'border-white/20 bg-slate-800 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  <ShoppingBag className="h-4 w-4" />
                  <span>
                    Thermal Delivery Bag: {progression?.bagEquipped ? 'Equipped' : 'Hidden'}
                  </span>
                </button>
              </div>

              {/* Showroom & Owned Garage */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Kozhikode Garage &amp; Showroom
                </h3>
                <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
                  {PURCHASABLE_VEHICLES_CATALOG.map((veh) => {
                    const owned = progression?.ownedVehicleModels.includes(veh.modelId) ?? false;
                    const meetsDeliveries = completedCount >= veh.requiredDeliveries;
                    const meetsFunds = walletInr >= veh.priceInr;
                    return (
                      <div
                        key={veh.modelId}
                        className="kl-surface-card flex flex-col justify-between rounded-xl p-3.5"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-sm font-bold text-white">{veh.name}</div>
                            <span className="font-mono-tabular text-xs font-bold text-emerald-300">
                              {owned ? 'Owned' : `₹${veh.priceInr}`}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-400">{veh.subtitle}</p>
                          {!owned && veh.requiredDeliveries > 0 && (
                            <div className="mt-1.5 font-mono-tabular text-[11px] text-amber-300">
                              Requires {veh.requiredDeliveries} deliveries ({completedCount}/{veh.requiredDeliveries})
                            </div>
                          )}
                        </div>

                        <div className="mt-3">
                          {owned ? (
                            <button
                              type="button"
                              onClick={() => showResult(onSummonVehicle(veh.modelId))}
                              className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 text-xs font-bold text-slate-950 hover:bg-emerald-400"
                            >
                              <Bike className="h-4 w-4" />
                              <span>Summon Nearby</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={!meetsDeliveries || !meetsFunds}
                              onClick={() => showResult(onPurchaseVehicle(veh.modelId))}
                              className="flex min-h-[44px] w-full items-center justify-center rounded-xl bg-amber-500 px-3 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                            >
                              {!meetsDeliveries
                                ? `Complete ${veh.requiredDeliveries} Deliveries`
                                : !meetsFunds
                                  ? `Need ₹${veh.priceInr}`
                                  : `Buy for ₹${veh.priceInr}`}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Lifestyle Upgrades */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Lifestyle &amp; Equipment Upgrades
                </h3>
                <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
                  {LIFESTYLE_UPGRADES_CATALOG.map((upg) => {
                    const unlocked = progression?.unlockedUpgrades.includes(upg.id) ?? false;
                    const canAfford = walletInr >= upg.costInr;
                    return (
                      <div
                        key={upg.id}
                        className="flex flex-col justify-between rounded-xl border border-white/10 bg-slate-950/80 p-3.5"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-sm font-bold text-white">{upg.name}</div>
                              <div className="text-[11px] text-amber-300">{upg.malayalamName}</div>
                            </div>
                            <span className="font-mono-tabular text-xs font-bold text-emerald-300">
                              {unlocked ? 'Unlocked' : `₹${upg.costInr}`}
                            </span>
                          </div>
                          <p className="mt-1.5 text-[11px] text-slate-400">{upg.description}</p>
                        </div>

                        <div className="mt-3">
                          {unlocked ? (
                            <div className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-emerald-400/40 bg-emerald-500/15 text-xs font-bold text-emerald-200">
                              <CheckCircle2 className="h-4 w-4" />
                              <span>Active</span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={!canAfford}
                              onClick={() => showResult(onPurchaseUpgrade(upg.id))}
                              className="flex min-h-[44px] w-full items-center justify-center rounded-xl bg-amber-500 px-3 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                            >
                              {canAfford ? `Unlock for ₹${upg.costInr}` : `Need ₹${upg.costInr}`}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {tab === 'journal' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-white/10 bg-slate-950/80 p-3">
                  <div className="text-[11px] text-slate-400">Total Earned</div>
                  <div className="mt-1 font-mono-tabular text-lg font-extrabold text-emerald-300">
                    ₹{progression?.totalEarnedInr ?? 0}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-950/80 p-3">
                  <div className="text-[11px] text-slate-400">Deliveries</div>
                  <div className="mt-1 font-mono-tabular text-lg font-extrabold text-white">
                    {completedCount}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-950/80 p-3">
                  <div className="text-[11px] text-slate-400">Reputation</div>
                  <div className="mt-1 font-mono-tabular text-sm font-bold text-amber-300">
                    {progression?.reputationScore ?? 10} · {progression?.reputationTier ?? 'Newcomer'}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-950/80 p-3">
                  <div className="text-[11px] text-slate-400">City Discovery</div>
                  <div className="mt-1 font-mono-tabular text-sm font-bold text-sky-300">
                    {progression?.discoveredRestaurants.length ?? 1}/{KOZHIKODE_RESTAURANTS.length} eateries
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Recent Customer Feedback
                </h3>
                {(!progression?.deliveryHistory || progression.deliveryHistory.length === 0) ? (
                  <div className="mt-2 rounded-xl border border-white/10 bg-slate-950/60 p-4 text-xs text-slate-400">
                    Complete your first Kozhikode food delivery to see customer notes and tips here.
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {progression.deliveryHistory.map((item) => (
                      <div
                        key={item.orderId}
                        className="kl-surface-card kl-anim-card rounded-xl p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-bold text-white">
                            {item.restaurantName} → {item.customerName} ({item.customerPlaceLabel})
                          </div>
                          <div className="kl-tabular font-mono-tabular text-xs font-bold text-emerald-300">
                            +₹{item.earnedInr} (Tip ₹{item.tipEarnedInr})
                          </div>
                        </div>
                        <p className="kl-review-quote kl-anim-reward mt-1.5 text-xs text-slate-200">
                          "{item.customerReview}"
                        </p>
                        <div className="kl-tabular mt-1.5 flex items-center gap-2 font-mono-tabular text-[11px] text-slate-400">
                          <Clock className="h-3 w-3" />
                          <span>Food condition {item.foodCondition}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
