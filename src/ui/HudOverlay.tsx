import { useEffect, useRef, useState } from 'react';
import {
  Armchair,
  ArrowDown,
  ArrowUp,
  Bike,
  Camera,
  Car,
  CloudSun,
  Coffee,
  DoorOpen,
  Gauge,
  Hand,
  Home,
  LogOut,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  Navigation,
  Package,
  Pause,
  RotateCw,
  Settings,
  ShoppingBag,
  Store,
  UtensilsCrossed,
  Volume2,
  VolumeX,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import {
  resolveContextualInteraction,
  type ContextualInteractionTarget,
  type InteractionActionKind,
} from '../engine/interaction/InteractionResolver.ts';
import type { EngineHudSnapshot, GameSettings } from '../engine/types.ts';
import {
  KOZHIKODE_REGIONS,
  KOZHIKODE_ROAD_CORRIDORS,
  PROTAGONIST_HOME_COORDS,
} from '../engine/world/KozhikodeGeography.ts';
import { BottomAudioPanel } from './BottomAudioPanel.tsx';

export interface VirtualVehicleControlsPatch {
  steer?: number;
  throttle?: number;
  brakeReverse?: number;
  handbrake?: boolean;
}

interface HudOverlayProps {
  snapshot: EngineHudSnapshot;
  onPause: () => void;
  onOpenSettings?: () => void;
  onToggleCamera: () => void;
  onToggleMute: () => void;
  onUpdateSettings: (patch: Partial<GameSettings>) => void;
  onHomeInteract: () => void;
  onBuildingInteract?: () => string | void;
  onEnterVehicle?: () => boolean;
  onExitVehicle?: () => boolean;
  onVehicleControls?: (patch: VirtualVehicleControlsPatch) => void;
  onVehicleHorn?: () => void;
  onOpenWorldMap: () => void;
  onOpenDeliveryBoard?: () => void;
  onPickupOrder?: () => string | { ok: boolean; reason: string } | void;
  onDeliverOrder?: () => string | { ok: boolean; reason: string } | void;
  onClearDestination: () => void;
  onUiClick: () => void;
  onVirtualMove: (x: number, y: number) => void;
  onSprintHold: (held: boolean) => void;
  onJumpTap?: () => void;
}

function renderInteractionIcon(kind: InteractionActionKind, vehicleCategory?: string) {
  switch (kind) {
    case 'collect_order':
      return <ShoppingBag className="h-5 w-5" strokeWidth={2.2} />;
    case 'deliver_order':
      return <Package className="h-5 w-5" strokeWidth={2.2} />;
    case 'enter_vehicle':
      return vehicleCategory === 'scooter' || vehicleCategory === 'motorcycle' ? (
        <Bike className="h-5 w-5" strokeWidth={2.2} />
      ) : (
        <Car className="h-5 w-5" strokeWidth={2.2} />
      );
    case 'exit_vehicle':
      return <LogOut className="h-5 w-5" strokeWidth={2.2} />;
    case 'enter_house':
      return <Home className="h-5 w-5" strokeWidth={2.2} />;
    case 'drink_tea':
      return <Coffee className="h-5 w-5" strokeWidth={2.2} />;
    case 'use_shop':
      return <Store className="h-5 w-5" strokeWidth={2.2} />;
    case 'talk':
      return <MessageCircle className="h-5 w-5" strokeWidth={2.2} />;
    case 'sit':
      return <Armchair className="h-5 w-5" strokeWidth={2.2} />;
    case 'open_door':
      return <DoorOpen className="h-5 w-5" strokeWidth={2.2} />;
    default:
      return <Hand className="h-5 w-5" strokeWidth={2.2} />;
  }
}

export function HudOverlay({
  snapshot,
  onPause,
  onOpenSettings,
  onToggleCamera,
  onToggleMute,
  onUpdateSettings,
  onHomeInteract,
  onBuildingInteract,
  onEnterVehicle,
  onExitVehicle,
  onVehicleControls,
  onVehicleHorn,
  onOpenWorldMap,
  onOpenDeliveryBoard,
  onPickupOrder,
  onDeliverOrder,
  onClearDestination,
  onUiClick,
  onVirtualMove,
  onSprintHold,
  onJumpTap,
}: HudOverlayProps) {
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const joystickBaseRef = useRef<HTMLDivElement | null>(null);
  const steerBaseRef = useRef<HTMLDivElement | null>(null);
  const joystickPointerIdRef = useRef<number | null>(null);
  const sprintPointerIdRef = useRef<number | null>(null);
  const jumpPointerIdRef = useRef<number | null>(null);

  const steerPointerIdRef = useRef<number | null>(null);
  const gasPointerIdRef = useRef<number | null>(null);
  const brakePointerIdRef = useRef<number | null>(null);
  const handbrakePointerIdRef = useRef<number | null>(null);

  const onVirtualMoveRef = useRef(onVirtualMove);
  const onSprintHoldRef = useRef(onSprintHold);
  const onVehicleControlsRef = useRef(onVehicleControls);
  onVirtualMoveRef.current = onVirtualMove;
  onSprintHoldRef.current = onSprintHold;
  onVehicleControlsRef.current = onVehicleControls;

  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [joystickActive, setJoystickActive] = useState(false);
  const [jumpPressed, setJumpPressed] = useState(false);

  const [steerKnobX, setSteerKnobX] = useState(0);
  const [steerActive, setSteerActive] = useState(false);
  const [gasPressed, setGasPressed] = useState(false);
  const [brakePressed, setBrakePressed] = useState(false);
  const [handbrakePressed, setHandbrakePressed] = useState(false);

  const [showAudioDrawer, setShowAudioDrawer] = useState(false);
  const [hudNotice, setHudNotice] = useState<string | null>(null);
  const [showPortraitNotice, setShowPortraitNotice] = useState(false);

  const isDriving = Boolean(snapshot.vehicle?.isDriving);

  const showTimedNotice = (msg: string) => {
    setHudNotice(msg);
  };

  useEffect(() => {
    if (snapshot.interactionNotice?.text) {
      setHudNotice(snapshot.interactionNotice.text);
    }
  }, [snapshot.interactionNotice?.id, snapshot.interactionNotice?.text]);

  useEffect(() => {
    if (!hudNotice) return;
    const id = window.setTimeout(() => setHudNotice(null), 2600);
    return () => window.clearTimeout(id);
  }, [hudNotice]);

  useEffect(() => {
    const checkPortrait = () => {
      if (typeof window === 'undefined') return;
      const isNarrowMobile = window.innerWidth < 768 && window.innerHeight > window.innerWidth;
      const hasTouch =
        typeof navigator !== 'undefined' &&
        (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
      setShowPortraitNotice(Boolean(isNarrowMobile && hasTouch));
    };

    checkPortrait();
    window.addEventListener('resize', checkPortrait);
    window.addEventListener('orientationchange', checkPortrait);
    return () => {
      window.removeEventListener('resize', checkPortrait);
      window.removeEventListener('orientationchange', checkPortrait);
    };
  }, []);

  useEffect(() => {
    const resetAllHudTouch = () => {
      if (joystickPointerIdRef.current !== null) {
        joystickPointerIdRef.current = null;
        setJoystickActive(false);
        setKnobOffset({ x: 0, y: 0 });
        onVirtualMoveRef.current(0, 0);
      }
      if (sprintPointerIdRef.current !== null) {
        sprintPointerIdRef.current = null;
        onSprintHoldRef.current(false);
      }
      if (jumpPointerIdRef.current !== null) {
        jumpPointerIdRef.current = null;
        setJumpPressed(false);
      }
      if (
        steerPointerIdRef.current !== null ||
        gasPointerIdRef.current !== null ||
        brakePointerIdRef.current !== null ||
        handbrakePointerIdRef.current !== null
      ) {
        steerPointerIdRef.current = null;
        gasPointerIdRef.current = null;
        brakePointerIdRef.current = null;
        handbrakePointerIdRef.current = null;
        setSteerKnobX(0);
        setSteerActive(false);
        setGasPressed(false);
        setBrakePressed(false);
        setHandbrakePressed(false);
        onVehicleControlsRef.current?.({
          steer: 0,
          throttle: 0,
          brakeReverse: 0,
          handbrake: false,
        });
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        resetAllHudTouch();
      }
    };

    window.addEventListener('blur', resetAllHudTouch);
    window.addEventListener('orientationchange', resetAllHudTouch);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('blur', resetAllHudTouch);
      window.removeEventListener('orientationchange', resetAllHudTouch);
      document.removeEventListener('visibilitychange', handleVisibility);
      resetAllHudTouch();
    };
  }, []);

  useEffect(() => {
    // Switching cleanly between on-foot and driving modes drops prior pointer latches immediately
    joystickPointerIdRef.current = null;
    sprintPointerIdRef.current = null;
    jumpPointerIdRef.current = null;
    steerPointerIdRef.current = null;
    gasPointerIdRef.current = null;
    brakePointerIdRef.current = null;
    handbrakePointerIdRef.current = null;
    setJoystickActive(false);
    setKnobOffset({ x: 0, y: 0 });
    setJumpPressed(false);
    setSteerActive(false);
    setSteerKnobX(0);
    setGasPressed(false);
    setBrakePressed(false);
    setHandbrakePressed(false);
    onVirtualMoveRef.current(0, 0);
    onSprintHoldRef.current(false);
    onVehicleControlsRef.current?.({
      steer: 0,
      throttle: 0,
      brakeReverse: 0,
      handbrake: false,
    });
  }, [isDriving]);

  useEffect(() => {
    const canvas = minimapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const scale = 0.44;

    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = '#0b1322';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(snapshot.cameraYaw);
    ctx.translate(-snapshot.playerX * scale, -snapshot.playerZ * scale);

    // Arabian Sea coastline west
    ctx.fillStyle = '#0e5a63';
    ctx.fillRect(-350 * scale, -450 * scale, 282 * scale, 900 * scale);

    // Coastal Beach Sand strip
    ctx.fillStyle = '#6e5a44';
    ctx.fillRect(-98 * scale, -450 * scale, 30 * scale, 900 * scale);

    // Connected Kozhikode road corridors
    ctx.fillStyle = '#475569';
    for (const road of KOZHIKODE_ROAD_CORRIDORS) {
      if (road.axis === 'ns') {
        ctx.fillRect(
          (road.coord - road.width * 0.5) * scale,
          road.start * scale,
          road.width * scale,
          (road.end - road.start) * scale,
        );
      } else {
        ctx.fillRect(
          road.start * scale,
          (road.coord - road.width * 0.5) * scale,
          (road.end - road.start) * scale,
          road.width * scale,
        );
      }
    }

    // Mananchira park & water tank
    ctx.fillStyle = '#1e4d37';
    ctx.fillRect(-27 * scale, -29 * scale, 54 * scale, 58 * scale);
    ctx.fillStyle = '#0d9488';
    ctx.fillRect(-17 * scale, -13 * scale, 34 * scale, 26 * scale);

    // Active Kozhikode district landmarks
    for (const reg of KOZHIKODE_REGIONS) {
      if (reg.streamingTier !== 'active_phase2' || reg.id === 'protagonist_home') continue;
      ctx.fillStyle = 'rgba(248, 250, 252, 0.5)';
      ctx.beginPath();
      ctx.arc(reg.centerX * scale, reg.centerZ * scale, 2.0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Active A* Destination Road Route & Target Beacon
    if (
      snapshot.activeDestination?.routeWaypoints &&
      snapshot.activeDestination.routeWaypoints.length > 1
    ) {
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 2;
      ctx.beginPath();
      snapshot.activeDestination.routeWaypoints.forEach((wp, idx) => {
        if (idx === 0) ctx.moveTo(wp.x * scale, wp.z * scale);
        else ctx.lineTo(wp.x * scale, wp.z * scale);
      });
      ctx.stroke();

      ctx.fillStyle = '#34d399';
      ctx.beginPath();
      ctx.arc(
        snapshot.activeDestination.worldX * scale,
        snapshot.activeDestination.worldZ * scale,
        3.2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    ctx.restore();

    // Player directional arrow
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(snapshot.cameraYaw + Math.PI - snapshot.playerHeading);
    ctx.fillStyle = '#fbbf24';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -7.5);
    ctx.lineTo(5.2, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5.2, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }, [
    snapshot.playerX,
    snapshot.playerZ,
    snapshot.playerHeading,
    snapshot.cameraYaw,
    snapshot.activeDestination,
  ]);

  const deadzone = snapshot.settings.joystickDeadzone ?? 0.08;
  const joystickSens = snapshot.settings.joystickSensitivity ?? 1.0;

  const updateJoystick = (clientX: number, clientY: number) => {
    const base = joystickBaseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const maxRadius = Math.max(1, rect.width * 0.36);

    const rawDx = clientX - centerX;
    const rawDy = clientY - centerY;
    const dist = Math.hypot(rawDx, rawDy);
    const clampedDist = Math.min(dist, maxRadius);
    const angle = Math.atan2(rawDy, rawDx);

    const knobX = Math.cos(angle) * clampedDist;
    const knobY = Math.sin(angle) * clampedDist;
    setKnobOffset({ x: knobX, y: knobY });

    const rawMag = clampedDist / maxRadius;
    if (rawMag < deadzone) {
      onVirtualMove(0, 0);
      return;
    }
    const rescaled = Math.min(1, ((rawMag - deadzone) / Math.max(0.01, 1 - deadzone)) * joystickSens);
    onVirtualMove(Math.cos(angle) * rescaled, -Math.sin(angle) * rescaled);
  };

  const resetJoystick = () => {
    joystickPointerIdRef.current = null;
    setJoystickActive(false);
    setKnobOffset({ x: 0, y: 0 });
    onVirtualMove(0, 0);
  };

  const releaseSprint = () => {
    sprintPointerIdRef.current = null;
    onSprintHold(false);
  };

  const releaseJump = () => {
    jumpPointerIdRef.current = null;
    setJumpPressed(false);
  };

  const updateSteerJoystick = (clientX: number) => {
    const base = steerBaseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const maxRadius = Math.max(1, rect.width * 0.36);
    const rawDx = clientX - centerX;
    const clampedDx = Math.max(-maxRadius, Math.min(maxRadius, rawDx));
    setSteerKnobX(clampedDx);
    const norm = clampedDx / maxRadius;
    if (Math.abs(norm) < deadzone) {
      onVehicleControls?.({ steer: 0 });
      return;
    }
    const rescaled =
      Math.sign(norm) *
      Math.min(1, ((Math.abs(norm) - deadzone) / Math.max(0.01, 1 - deadzone)) * joystickSens);
    onVehicleControls?.({ steer: rescaled });
  };

  const resetSteerJoystick = () => {
    steerPointerIdRef.current = null;
    setSteerActive(false);
    setSteerKnobX(0);
    onVehicleControls?.({ steer: 0 });
  };

  const releaseGas = () => {
    gasPointerIdRef.current = null;
    setGasPressed(false);
    onVehicleControls?.({ throttle: 0 });
  };

  const releaseBrake = () => {
    brakePointerIdRef.current = null;
    setBrakePressed(false);
    onVehicleControls?.({ brakeReverse: 0 });
  };

  const releaseHandbrake = () => {
    handbrakePointerIdRef.current = null;
    setHandbrakePressed(false);
    onVehicleControls?.({ handbrake: false });
  };

  // Compute Home icon marker coordinates on circular minimap
  const relHomeX = (PROTAGONIST_HOME_COORDS.houseX - snapshot.playerX) * 0.44;
  const relHomeZ = (PROTAGONIST_HOME_COORDS.houseZ - snapshot.playerZ) * 0.44;
  const cosYaw = Math.cos(snapshot.cameraYaw);
  const sinYaw = Math.sin(snapshot.cameraYaw);
  const rotHomeX = relHomeX * cosYaw - relHomeZ * sinYaw;
  const rotHomeY = relHomeX * sinYaw + relHomeZ * cosYaw;
  const homePixelDist = Math.hypot(rotHomeX, rotHomeY);
  const maxMarkerRadiusPct = 39;
  const homeRadarScale = 100 / 96;
  const homeRawX = rotHomeX * homeRadarScale;
  const homeRawY = rotHomeY * homeRadarScale;
  const homeClampScale =
    homePixelDist * homeRadarScale > maxMarkerRadiusPct
      ? maxMarkerRadiusPct / (homePixelDist * homeRadarScale)
      : 1;
  const homePinLeftPct = 50 + homeRawX * homeClampScale;
  const homePinTopPct = 50 + homeRawY * homeClampScale;

  const northLeftPct = 50 + Math.sin(snapshot.cameraYaw) * 42;
  const northTopPct = 50 - Math.cos(snapshot.cameraYaw) * 42;

  const effectiveMasterPct = snapshot.settings.masterMuted
    ? 0
    : Math.round(snapshot.settings.masterVolume * 100);

  const hudScale = snapshot.settings.hudScale ?? 1.0;
  const joyScale = (snapshot.settings.joystickSize ?? 1.0) * hudScale;
  const btnScale = (snapshot.settings.actionButtonSize ?? 1.0) * hudScale;
  const layout = snapshot.settings.controlLayout ?? 'standard';
  const offsets = snapshot.settings.controlOffsets ?? {
    joystickX: 0,
    joystickY: 0,
    actionsX: 0,
    actionsY: 0,
  };
  const isLeftHanded = layout === 'left_handed';
  const isCompact = layout === 'compact';

  // Resolve active contextual interaction strictly from live world state (never display unavailable action)
  const fallbackOrder = snapshot.delivery?.activeOrder;
  const resolvedInteraction: ContextualInteractionTarget | null =
    snapshot.nearbyInteraction !== undefined
      ? snapshot.nearbyInteraction
      : resolveContextualInteraction({
          nearbyBuilding: snapshot.nearbyBuilding ?? null,
          nearHome: snapshot.nearHome,
          homeDistanceMeters: snapshot.homeDistanceMeters,
          nearbyDeliveryPickup:
            fallbackOrder &&
            snapshot.delivery?.pickupDistanceMeters !== null &&
            snapshot.delivery?.pickupDistanceMeters !== undefined &&
            snapshot.delivery.pickupDistanceMeters <= 9.5 &&
            (fallbackOrder.status === 'ready_for_pickup' ||
              fallbackOrder.status === 'preparing' ||
              fallbackOrder.status === 'accepted')
              ? {
                  orderId: fallbackOrder.orderId,
                  restaurantName: fallbackOrder.restaurantName,
                  malayalamName: fallbackOrder.restaurantMalayalamName,
                  distanceMeters: snapshot.delivery.pickupDistanceMeters,
                  isReady: fallbackOrder.status === 'ready_for_pickup',
                  prepRemainingSec: fallbackOrder.prepRemainingSec,
                }
              : null,
          nearbyDeliveryDropoff:
            fallbackOrder &&
            snapshot.delivery?.canDeliverNearby &&
            snapshot.delivery?.dropoffDistanceMeters !== null &&
            snapshot.delivery?.dropoffDistanceMeters !== undefined
              ? {
                  orderId: fallbackOrder.orderId,
                  placeLabel: fallbackOrder.customerPlaceLabel,
                  customerName: fallbackOrder.customerName,
                  distanceMeters: snapshot.delivery.dropoffDistanceMeters,
                }
              : null,
          isDriving,
        });

  const isAirborne = snapshot.isGrounded === false;

  const handleContextInteract = () => {
    if (!resolvedInteraction) return;
    if (resolvedInteraction.kind === 'collect_order') {
      const res = onPickupOrder?.();
      if (typeof res === 'string' && res) showTimedNotice(res);
      else if (res && typeof res === 'object' && res.reason) showTimedNotice(res.reason);
      return;
    }
    if (resolvedInteraction.kind === 'deliver_order') {
      const res = onDeliverOrder?.();
      if (typeof res === 'string' && res) showTimedNotice(res);
      else if (res && typeof res === 'object' && res.reason) showTimedNotice(res.reason);
      return;
    }
    if (resolvedInteraction.kind === 'enter_vehicle') {
      onEnterVehicle?.();
      return;
    }
    if (snapshot.nearbyBuilding || resolvedInteraction.kind === 'talk') {
      const customNotice = onBuildingInteract?.();
      if (customNotice) {
        showTimedNotice(customNotice);
        return;
      }
    }
    onHomeInteract();
    showTimedNotice(`${resolvedInteraction.targetName} · ${resolvedInteraction.actionLabel}`);
  };

  const joystickDiameter = Math.round((isCompact ? 90 : 104) * joyScale);
  const knobDiameter = Math.round(joystickDiameter * 0.42);
  const actionBtnPx = Math.round((isCompact ? 42 : 46) * btnScale);
  const primaryBtnPx = Math.round((isCompact ? 48 : 54) * btnScale);
  const steerPadWidth = Math.round((isCompact ? 116 : 134) * joyScale);
  const steerPadHeight = Math.round((isCompact ? 62 : 70) * joyScale);

  const joystickCluster = (
    <div
      className="pointer-events-none relative shrink-0"
      style={{
        transform: `translate3d(${offsets.joystickX}px, ${offsets.joystickY}px, 0)`,
      }}
    >
      <div
        ref={joystickBaseRef}
        data-hud-control="true"
        onPointerDown={(e) => {
          e.stopPropagation();
          if (joystickPointerIdRef.current !== null) return;
          joystickPointerIdRef.current = e.pointerId;
          setJoystickActive(true);
          try {
            e.currentTarget.setPointerCapture?.(e.pointerId);
          } catch {
            // Ignore synthetic pointer capture errors
          }
          updateJoystick(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (joystickPointerIdRef.current !== e.pointerId) return;
          updateJoystick(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (joystickPointerIdRef.current !== e.pointerId) return;
          resetJoystick();
        }}
        onPointerCancel={(e) => {
          if (joystickPointerIdRef.current !== e.pointerId) return;
          resetJoystick();
        }}
        onLostPointerCapture={(e) => {
          if (joystickPointerIdRef.current !== e.pointerId) return;
          resetJoystick();
        }}
        role="slider"
        aria-label="Movement Joystick"
        aria-valuenow={Math.round(Math.hypot(knobOffset.x, knobOffset.y))}
        style={{
          width: `${joystickDiameter}px`,
          height: `${joystickDiameter}px`,
        }}
        className={`kl-joystick-ring pointer-events-auto relative flex touch-none select-none items-center justify-center transition-colors ${
          joystickActive ? 'kl-joystick-ring--active' : ''
        }`}
      >
        <div
          className={`pointer-events-none absolute inset-3 rounded-full border transition-colors ${
            joystickActive ? 'border-amber-300/35' : 'border-white/15'
          }`}
        />
        <div
          style={{
            width: `${knobDiameter}px`,
            height: `${knobDiameter}px`,
            transform: `translate3d(${knobOffset.x}px, ${knobOffset.y}px, 0)`,
          }}
          className="kl-joystick-knob pointer-events-none"
        />
      </div>
    </div>
  );

  const actionThumbCluster = (
    <div
      className={`pointer-events-auto flex shrink-0 flex-col ${
        isLeftHanded ? 'items-start' : 'items-end'
      } gap-2 pb-0.5`}
      style={{
        transform: `translate3d(${offsets.actionsX}px, ${offsets.actionsY}px, 0)`,
      }}
    >
      <div className="flex items-center gap-2">
        {/* Context-Sensitive Interaction Button (Only rendered when an available target is in range) */}
        {resolvedInteraction && (
          <button
            type="button"
            data-hud-control="true"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleContextInteract}
            aria-label={
              resolvedInteraction.kind === 'enter_house' || snapshot.nearbyBuilding
                ? `Interact with Home Entrance · ${resolvedInteraction.actionLabel}`
                : `${resolvedInteraction.actionLabel} · ${resolvedInteraction.targetName}`
            }
            style={{
              minHeight: `${actionBtnPx}px`,
            }}
            className={`kl-hud-context-btn kl-btn-tactile text-xs font-bold ${
              resolvedInteraction.kind === 'drink_tea'
                ? 'kl-hud-context-btn--tea'
                : resolvedInteraction.kind === 'collect_order' ||
                    resolvedInteraction.kind === 'deliver_order'
                  ? 'kl-hud-context-btn--deliver'
                  : resolvedInteraction.kind === 'enter_vehicle'
                    ? 'kl-hud-context-btn--vehicle'
                    : 'kl-hud-context-btn--default'
            }`}
          >
            {renderInteractionIcon(resolvedInteraction.kind)}
            <span>{resolvedInteraction.actionLabel}</span>
          </button>
        )}

        {/* Camera View Preset Button */}
        <button
          type="button"
          data-hud-control="true"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onToggleCamera}
          aria-label="Toggle Camera View"
          style={{
            width: `${actionBtnPx}px`,
            height: `${actionBtnPx}px`,
          }}
          className={`relative flex items-center justify-center rounded-full border shadow-lg transition-transform active:scale-90 ${
            snapshot.cameraMode === 'title_orbit'
              ? 'border-sky-400/60 bg-sky-500/25 text-sky-200'
              : 'border-white/25 bg-slate-950/85 text-white hover:bg-slate-800'
          }`}
        >
          <Camera className="h-4 w-4" strokeWidth={2} />
          {snapshot.cameraMode === 'free_inspect' && snapshot.cameraPreset && (
            <span className="pointer-events-none absolute -bottom-1 rounded bg-slate-900/95 px-1 font-mono-tabular text-[8px] font-bold uppercase tracking-tight text-amber-300">
              {snapshot.cameraPreset === 'standard' ? 'STD' : snapshot.cameraPreset.toUpperCase()}
            </span>
          )}
        </button>
      </div>

      {/* Primary Action Row: Jump & Hold-to-Sprint */}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          data-hud-control="true"
          disabled={isAirborne}
          onPointerDown={(e) => {
            e.stopPropagation();
            if (isAirborne || jumpPointerIdRef.current !== null) return;
            jumpPointerIdRef.current = e.pointerId;
            setJumpPressed(true);
            try {
              e.currentTarget.setPointerCapture?.(e.pointerId);
            } catch {
              // Ignore synthetic pointer capture errors
            }
            onJumpTap?.();
          }}
          onPointerUp={(e) => {
            if (jumpPointerIdRef.current !== e.pointerId) return;
            releaseJump();
          }}
          onPointerCancel={(e) => {
            if (jumpPointerIdRef.current !== e.pointerId) return;
            releaseJump();
          }}
          onLostPointerCapture={(e) => {
            if (jumpPointerIdRef.current !== e.pointerId) return;
            releaseJump();
          }}
          aria-label="Jump"
          aria-pressed={jumpPressed}
          style={{
            width: `${actionBtnPx}px`,
            height: `${actionBtnPx}px`,
          }}
          className={`kl-control-pad kl-control-pad--jump ${
            isAirborne
              ? 'opacity-50'
              : jumpPressed
                ? 'kl-control-pad--pressed border-sky-300 text-sky-200'
                : 'text-slate-100'
          }`}
        >
          <ArrowUp className="h-5 w-5" strokeWidth={2.4} />
        </button>

        <button
          type="button"
          data-hud-control="true"
          onPointerDown={(e) => {
            e.stopPropagation();
            if (sprintPointerIdRef.current !== null) return;
            sprintPointerIdRef.current = e.pointerId;
            try {
              e.currentTarget.setPointerCapture?.(e.pointerId);
            } catch {
              // Ignore synthetic pointer capture errors
            }
            onSprintHold(true);
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            if (sprintPointerIdRef.current !== e.pointerId) return;
            releaseSprint();
          }}
          onPointerCancel={(e) => {
            if (sprintPointerIdRef.current !== e.pointerId) return;
            releaseSprint();
          }}
          onLostPointerCapture={(e) => {
            if (sprintPointerIdRef.current !== e.pointerId) return;
            releaseSprint();
          }}
          aria-label="Sprint"
          aria-pressed={snapshot.isSprinting}
          style={{
            width: `${primaryBtnPx}px`,
            height: `${primaryBtnPx}px`,
          }}
          className={`kl-control-pad kl-control-pad--sprint ${
            snapshot.isSprinting ? 'kl-control-pad--pressed' : 'text-amber-300'
          }`}
        >
          <Zap className="h-5 w-5" strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );

  const activeVehicle = snapshot.vehicle;
  const drivingSteerCluster = (
    <div
      className="pointer-events-none relative shrink-0"
      style={{
        transform: `translate3d(${offsets.joystickX}px, ${offsets.joystickY}px, 0)`,
      }}
    >
      <div
        ref={steerBaseRef}
        data-hud-control="true"
        onPointerDown={(e) => {
          e.stopPropagation();
          if (steerPointerIdRef.current !== null) return;
          steerPointerIdRef.current = e.pointerId;
          setSteerActive(true);
          try {
            e.currentTarget.setPointerCapture?.(e.pointerId);
          } catch {
            // Ignore synthetic pointer capture errors
          }
          updateSteerJoystick(e.clientX);
        }}
        onPointerMove={(e) => {
          if (steerPointerIdRef.current !== e.pointerId) return;
          updateSteerJoystick(e.clientX);
        }}
        onPointerUp={(e) => {
          if (steerPointerIdRef.current !== e.pointerId) return;
          resetSteerJoystick();
        }}
        onPointerCancel={(e) => {
          if (steerPointerIdRef.current !== e.pointerId) return;
          resetSteerJoystick();
        }}
        onLostPointerCapture={(e) => {
          if (steerPointerIdRef.current !== e.pointerId) return;
          resetSteerJoystick();
        }}
        role="slider"
        aria-label="Vehicle Steering"
        aria-valuenow={Math.round((activeVehicle?.steerNorm ?? 0) * 100)}
        style={{
          width: `${steerPadWidth}px`,
          height: `${steerPadHeight}px`,
        }}
        className={`kl-steer-track pointer-events-auto relative flex touch-none select-none items-center justify-between px-3 transition-colors ${
          steerActive ? 'border-amber-400/80' : ''
        }`}
      >
        <span className="pointer-events-none text-[10px] font-bold tracking-wider text-slate-400">L</span>
        <div
          style={{
            width: `${Math.round(steerPadHeight * 0.68)}px`,
            height: `${Math.round(steerPadHeight * 0.68)}px`,
            transform: `translate3d(${steerKnobX}px, 0, 0)`,
          }}
          className="kl-steer-knob pointer-events-none"
        />
        <span className="pointer-events-none text-[10px] font-bold tracking-wider text-slate-400">R</span>
      </div>
    </div>
  );

  const drivingPedalCluster = (
    <div
      className={`pointer-events-auto flex shrink-0 flex-col ${
        isLeftHanded ? 'items-start' : 'items-end'
      } gap-2 pb-0.5`}
      style={{
        transform: `translate3d(${offsets.actionsX}px, ${offsets.actionsY}px, 0)`,
      }}
    >
      {/* Top utility row: Exit Vehicle, Camera Chase Preset, Horn */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-hud-control="true"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            onUiClick();
            onExitVehicle?.();
          }}
          aria-label="Exit Vehicle"
          style={{ minHeight: `${Math.round(actionBtnPx * 0.9)}px` }}
          className="flex items-center gap-1.5 rounded-full border border-amber-300/80 bg-amber-500 px-3 text-xs font-bold text-slate-950 shadow-lg transition-transform active:scale-95"
        >
          <LogOut className="h-4 w-4" strokeWidth={2.3} />
          <span>Exit</span>
        </button>

        <button
          type="button"
          data-hud-control="true"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            onUiClick();
            onVehicleHorn?.();
          }}
          aria-label="Vehicle Horn"
          style={{
            width: `${actionBtnPx}px`,
            height: `${actionBtnPx}px`,
          }}
          className="flex items-center justify-center rounded-full border border-white/25 bg-slate-950/85 text-amber-300 shadow-lg transition-transform active:scale-90"
        >
          <Volume2 className="h-4 w-4" strokeWidth={2.2} />
        </button>

        <button
          type="button"
          data-hud-control="true"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onToggleCamera}
          aria-label="Toggle Vehicle Chase Camera"
          style={{
            width: `${actionBtnPx}px`,
            height: `${actionBtnPx}px`,
          }}
          className="relative flex items-center justify-center rounded-full border border-white/25 bg-slate-950/85 text-white shadow-lg transition-transform active:scale-90"
        >
          <Camera className="h-4 w-4" strokeWidth={2} />
          {snapshot.cameraPreset && (
            <span className="pointer-events-none absolute -bottom-1 rounded bg-slate-900/95 px-1 font-mono-tabular text-[8px] font-bold uppercase tracking-tight text-amber-300">
              {snapshot.cameraPreset === 'standard' ? 'STD' : snapshot.cameraPreset.toUpperCase()}
            </span>
          )}
        </button>
      </div>

      {/* Bottom multi-touch driving pedals: Handbrake, Brake/Reverse, Accelerate */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-hud-control="true"
          onPointerDown={(e) => {
            e.stopPropagation();
            if (handbrakePointerIdRef.current !== null) return;
            handbrakePointerIdRef.current = e.pointerId;
            setHandbrakePressed(true);
            try {
              e.currentTarget.setPointerCapture?.(e.pointerId);
            } catch {
              // Ignore
            }
            onVehicleControls?.({ handbrake: true });
          }}
          onPointerUp={(e) => {
            if (handbrakePointerIdRef.current !== e.pointerId) return;
            releaseHandbrake();
          }}
          onPointerCancel={(e) => {
            if (handbrakePointerIdRef.current !== e.pointerId) return;
            releaseHandbrake();
          }}
          onLostPointerCapture={(e) => {
            if (handbrakePointerIdRef.current !== e.pointerId) return;
            releaseHandbrake();
          }}
          aria-label="Handbrake"
          aria-pressed={handbrakePressed}
          style={{
            width: `${actionBtnPx}px`,
            height: `${actionBtnPx}px`,
          }}
          className={`flex touch-none select-none items-center justify-center rounded-full border font-mono-tabular text-[10px] font-extrabold shadow-lg transition-transform active:scale-90 ${
            handbrakePressed
              ? 'border-amber-300 bg-amber-500 text-slate-950 scale-95'
              : 'border-white/25 bg-slate-950/85 text-amber-300'
          }`}
        >
          HB
        </button>

        <button
          type="button"
          data-hud-control="true"
          onPointerDown={(e) => {
            e.stopPropagation();
            if (brakePointerIdRef.current !== null) return;
            brakePointerIdRef.current = e.pointerId;
            setBrakePressed(true);
            try {
              e.currentTarget.setPointerCapture?.(e.pointerId);
            } catch {
              // Ignore
            }
            onVehicleControls?.({ brakeReverse: 1 });
          }}
          onPointerUp={(e) => {
            if (brakePointerIdRef.current !== e.pointerId) return;
            releaseBrake();
          }}
          onPointerCancel={(e) => {
            if (brakePointerIdRef.current !== e.pointerId) return;
            releaseBrake();
          }}
          onLostPointerCapture={(e) => {
            if (brakePointerIdRef.current !== e.pointerId) return;
            releaseBrake();
          }}
          aria-label="Brake or Reverse"
          aria-pressed={brakePressed}
          style={{
            width: `${actionBtnPx}px`,
            height: `${primaryBtnPx}px`,
          }}
          className={`kl-pedal kl-pedal--brake ${brakePressed ? 'kl-pedal--pressed' : ''}`}
        >
          <ArrowDown className="h-4 w-4" strokeWidth={2.4} />
          <span className="kl-tabular font-mono-tabular text-[9px] font-bold">REV</span>
        </button>

        <button
          type="button"
          data-hud-control="true"
          onPointerDown={(e) => {
            e.stopPropagation();
            if (gasPointerIdRef.current !== null) return;
            gasPointerIdRef.current = e.pointerId;
            setGasPressed(true);
            try {
              e.currentTarget.setPointerCapture?.(e.pointerId);
            } catch {
              // Ignore
            }
            onVehicleControls?.({ throttle: 1 });
          }}
          onPointerUp={(e) => {
            if (gasPointerIdRef.current !== e.pointerId) return;
            releaseGas();
          }}
          onPointerCancel={(e) => {
            if (gasPointerIdRef.current !== e.pointerId) return;
            releaseGas();
          }}
          onLostPointerCapture={(e) => {
            if (gasPointerIdRef.current !== e.pointerId) return;
            releaseGas();
          }}
          aria-label="Accelerate"
          aria-pressed={gasPressed}
          style={{
            width: `${primaryBtnPx}px`,
            height: `${Math.round(primaryBtnPx * 1.15)}px`,
          }}
          className={`kl-pedal kl-pedal--gas ${gasPressed ? 'kl-pedal--pressed' : ''}`}
        >
          <Gauge className="h-5 w-5" strokeWidth={2.2} />
          <span className="kl-tabular font-mono-tabular text-[9px] font-bold">GAS</span>
        </button>
      </div>
    </div>
  );

  return (
    <div
      className="kl-safe-pad pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-2.5 sm:p-4"
      style={{
        opacity: snapshot.settings.hudOpacity,
        paddingTop: 'max(0.625rem, env(safe-area-inset-top))',
        paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(0.625rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.625rem, env(safe-area-inset-right))',
      }}
    >
      {/* Dedicated Camera Touch Surface Cue (non-blocking semantic region; actual touches hit canvasHost cleanly) */}
      <div
        data-camera-touch-region="true"
        aria-hidden="true"
        className={`pointer-events-none fixed inset-y-0 ${
          isLeftHanded ? 'left-0 right-[40%]' : 'left-[38%] right-0'
        }`}
      />

      {/* Portrait Mode Recommendation Banner on Mobile Touch Viewports */}
      {showPortraitNotice && (
        <div
          role="status"
          className="pointer-events-auto fixed left-1/2 top-2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-amber-400/50 bg-slate-950/95 px-3 py-1.5 text-[11px] font-medium text-amber-200 shadow-lg"
        >
          <RotateCw className="h-3.5 w-3.5 shrink-0 text-amber-400" />
          <span className="whitespace-nowrap">Rotate to landscape for optimal mobile controls</span>
        </div>
      )}

      {/* TOP HUD PERIMETER */}
      <div className="kl-anim-hud-top relative z-10 flex items-start justify-between gap-2">
        {/* Top-Left: Circular Minimap + Real Time, Weather, District Location & Home Marker */}
        <div className="flex items-start gap-2.5">
          <button
            type="button"
            data-hud-control="true"
            onClick={() => {
              onUiClick();
              onOpenWorldMap();
            }}
            aria-label="Open Minimap World View"
            title="Tap to open Kozhikode Interactive World Map (M)"
            className="kl-hud-minimap-frame kl-btn-tactile pointer-events-auto relative h-[78px] w-[78px] shrink-0 !rounded-full border-2 border-white/35 hover:border-amber-400/75 sm:h-24 sm:w-24"
          >
            <canvas ref={minimapRef} width={96} height={96} className="h-full w-full" />

            {/* North Compass Marker */}
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded bg-slate-950/80 px-1 text-[9px] font-extrabold leading-none tracking-wider text-amber-400"
              style={{ left: `${northLeftPct}%`, top: `${northTopPct}%` }}
            >
              N
            </div>

            {/* Protagonist Home Map Marker */}
            <div
              aria-label="Arjun's Home Map Marker"
              title="West Hill · Arjun's Residence"
              className="pointer-events-none absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-emerald-400 text-slate-950 shadow-md"
              style={{ left: `${homePinLeftPct}%`, top: `${homePinTopPct}%` }}
            >
              <Home className="h-3 w-3" strokeWidth={2.6} />
            </div>
          </button>

          {/* Clean Top-Left Telemetry: Time, Weather, Location, Home Distance */}
          <div className="flex flex-col items-start gap-1">
            <div className="kl-hud-card kl-hud-card--brass px-2.5 py-1.5">
              <div className="kl-tabular flex items-center gap-2 font-mono-tabular text-xs font-semibold text-white">
                <span>{snapshot.clockFormatted}</span>
                <span className="text-slate-500">·</span>
                <span className="flex items-center gap-1 text-[11px] font-medium text-amber-200">
                  <CloudSun className="h-3.5 w-3.5 text-amber-400" />
                  <span>{snapshot.weatherLabel ?? 'Golden Haze'}</span>
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-slate-300">
                <MapPin className="h-3 w-3 shrink-0 text-amber-400" strokeWidth={2.3} />
                <span className="max-w-[140px] truncate sm:max-w-[220px]">
                  {snapshot.districtName}
                </span>
              </div>
            </div>

            <div className="pointer-events-auto flex items-center gap-1.5">
              <button
                type="button"
                data-hud-control="true"
                onClick={() => {
                  onUiClick();
                  showTimedNotice(
                    snapshot.nearHome
                      ? "At Arjun's Residence · West Hill"
                      : `Arjun's Home (West Hill) · ${snapshot.homeDistanceMeters}m`,
                  );
                }}
                aria-label="Home Location Status"
                className={`kl-btn-tactile flex min-h-[30px] items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[11px] font-semibold shadow-md ${
                  snapshot.nearHome
                    ? 'border-emerald-300/70 bg-emerald-500/25 text-emerald-100'
                    : 'kl-hud-card text-slate-100'
                }`}
              >
                <Home className="h-3 w-3 text-emerald-400" strokeWidth={2.2} />
                <span className="kl-tabular font-mono-tabular">
                  {snapshot.nearHome ? 'Home' : `${snapshot.homeDistanceMeters}m`}
                </span>
              </button>

              <button
                type="button"
                data-hud-control="true"
                onClick={() => {
                  onUiClick();
                  onOpenDeliveryBoard?.();
                }}
                aria-label="Wallet and Reputation"
                className="kl-hud-wallet kl-btn-tactile"
              >
                <div className="flex items-center gap-1">
                  <Wallet className="h-3 w-3 shrink-0 text-emerald-300" />
                  <span className="kl-hud-wallet-amount kl-tabular">
                    ₹{snapshot.progression?.walletBalanceInr ?? 250}
                  </span>
                </div>
                <span className="kl-hud-wallet-meta">
                  {snapshot.progression?.reputationTier ?? 'Newcomer'}
                </span>
              </button>

              {snapshot.activeDestination && (
                <div className="kl-hud-card kl-hud-card--emerald flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                  <Navigation className="h-3 w-3 shrink-0 text-emerald-400" />
                  <span className="max-w-[110px] truncate">{snapshot.activeDestination.name}</span>
                  <span className="kl-tabular font-mono-tabular text-amber-300">
                    {snapshot.activeDestination.realDistanceKm} km
                  </span>
                  <button
                    type="button"
                    data-hud-control="true"
                    onClick={onClearDestination}
                    aria-label="Clear Active Waypoint"
                    className="ml-0.5 rounded p-0.5 text-slate-400 hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>

            {snapshot.delivery?.activeOrder && (
              <div
                aria-label="Active Delivery Tracker"
                className="kl-hud-order-card kl-anim-card pointer-events-auto space-y-1.5 text-[11px] text-amber-100"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <Package className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <span className="max-w-[140px] truncate font-semibold text-white">
                    {snapshot.delivery.activeOrder.status === 'picked_up' ||
                    snapshot.delivery.activeOrder.status === 'in_transit'
                      ? `Deliver → ${snapshot.delivery.activeOrder.customerPlaceLabel}`
                      : `Pickup → ${snapshot.delivery.activeOrder.restaurantName}`}
                  </span>
                  <span className="kl-tabular ml-auto font-mono-tabular text-amber-300">
                    {snapshot.delivery.activeOrder.status === 'preparing' ||
                    snapshot.delivery.activeOrder.status === 'accepted'
                      ? `${Math.ceil(snapshot.delivery.activeOrder.prepRemainingSec)}s`
                      : snapshot.delivery.activeOrder.status === 'ready_for_pickup'
                        ? `${snapshot.delivery.pickupDistanceMeters ?? 0}m`
                        : `${Math.round(snapshot.delivery.activeOrder.packageState.foodCondition)}% · ${snapshot.delivery.dropoffDistanceMeters ?? 0}m`}
                  </span>
                  {snapshot.delivery.canCollectNearby && (
                    <button
                      type="button"
                      data-hud-control="true"
                      onClick={() => {
                        onUiClick();
                        onPickupOrder?.();
                      }}
                      className="kl-btn-tactile rounded-md bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-slate-950"
                    >
                      Collect
                    </button>
                  )}
                  {snapshot.delivery.canDeliverNearby && (
                    <button
                      type="button"
                      data-hud-control="true"
                      onClick={() => {
                        onUiClick();
                        onDeliverOrder?.();
                      }}
                      className="kl-btn-tactile rounded-md bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-slate-950"
                    >
                      Deliver
                    </button>
                  )}
                </div>
                <div className="kl-hud-progress-track">
                  <div
                    className={`kl-hud-progress-fill kl-progress-sheen ${
                      snapshot.delivery.activeOrder.status === 'picked_up' ||
                      snapshot.delivery.activeOrder.status === 'in_transit'
                        ? 'bg-emerald-400'
                        : 'bg-amber-400'
                    }`}
                    style={{
                      width: `${Math.max(
                        12,
                        Math.min(
                          100,
                          snapshot.delivery.activeOrder.status === 'picked_up' ||
                            snapshot.delivery.activeOrder.status === 'in_transit'
                            ? Math.round(snapshot.delivery.activeOrder.packageState.temperaturePct)
                            : snapshot.delivery.activeOrder.status === 'ready_for_pickup'
                              ? 100
                              : Math.round(
                                  Math.max(
                                    15,
                                    100 - snapshot.delivery.activeOrder.prepRemainingSec * 6,
                                  ),
                                ),
                        ),
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Top-Right: Orders & Life, Map, Optional Settings Access & Pause */}
        <div className="pointer-events-auto flex items-start gap-2">
          <button
            type="button"
            data-hud-control="true"
            onClick={() => {
              onUiClick();
              onOpenDeliveryBoard?.();
            }}
            aria-label="Delivery and Life Hub"
            title="Open Kozhikode Delivery Orders, Eateries & Garage (J)"
            className={`flex h-11 items-center gap-1.5 rounded-xl border px-3 shadow-lg transition-colors active:scale-95 ${
              snapshot.delivery?.activeOrder
                ? 'border-amber-400 bg-amber-500 text-slate-950'
                : 'border-white/25 bg-slate-950/88 text-amber-300 hover:bg-slate-800'
            }`}
          >
            <UtensilsCrossed className="h-4 w-4 shrink-0" strokeWidth={2.1} />
            <span className="hidden text-xs font-bold sm:inline">Orders</span>
          </button>

          <button
            type="button"
            data-hud-control="true"
            onClick={() => {
              onUiClick();
              onOpenWorldMap();
            }}
            aria-label="World Map"
            title="Open Kozhikode Interactive Map (M)"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-400/60 bg-slate-950/88 text-amber-300 shadow-lg transition-colors hover:bg-amber-500 hover:text-slate-950 active:scale-95"
          >
            <MapIcon className="h-5 w-5" strokeWidth={2.1} />
          </button>

          {onOpenSettings && (
            <button
              type="button"
              data-hud-control="true"
              onClick={() => {
                onUiClick();
                onOpenSettings();
              }}
              aria-label="Settings and Controls"
              title="Open Controls & Settings"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/20 bg-slate-950/85 text-slate-100 shadow-lg transition-colors hover:bg-slate-800 active:scale-95"
            >
              <Settings className="h-5 w-5" strokeWidth={2} />
            </button>
          )}

          <button
            type="button"
            data-hud-control="true"
            onClick={onPause}
            aria-label="Pause and Settings"
            title="Pause Game (Esc)"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-slate-950/85 text-white shadow-lg transition-colors hover:bg-slate-800 active:scale-95"
          >
            <Pause className="h-5 w-5" strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {/* SUBTLE FLOATING TOAST NOTICE */}
      {hudNotice && (
        <div className="kl-hud-notice-banner kl-anim-notice">
          {hudNotice}
        </div>
      )}

      {/* CENTER CONTEXTUAL INTERACTION TARGET */}
      <div className="pointer-events-none relative z-10 flex flex-col items-center gap-1.5 self-center">
        {!isDriving && resolvedInteraction && (
          <div
            aria-label="Nearby Building Marker"
            className="kl-hud-card kl-anim-card flex items-center gap-2 px-3 py-1.5 text-xs text-slate-100"
          >
            <span className="max-w-[200px] truncate font-semibold text-white">
              {resolvedInteraction.targetName}
            </span>
            {resolvedInteraction.malayalamName && (
              <span className="hidden text-slate-300 sm:inline">
                · {resolvedInteraction.malayalamName}
              </span>
            )}
            <span className="kl-tabular rounded bg-slate-800 px-1.5 py-0.5 font-mono-tabular text-[10px] font-semibold text-amber-300">
              {resolvedInteraction.actionLabel}
              {resolvedInteraction.distanceMeters > 0
                ? ` · ${resolvedInteraction.distanceMeters}m`
                : ''}
            </span>
          </div>
        )}
      </div>

      {/* BOTTOM CONTROLS: AUTOMATICALLY SWITCHES BETWEEN ON-FOOT HUD AND DRIVING HUD */}
      <div className="kl-anim-hud-bottom relative z-10 flex items-end justify-between gap-2">
        {isDriving
          ? isLeftHanded
            ? drivingPedalCluster
            : drivingSteerCluster
          : isLeftHanded
            ? actionThumbCluster
            : joystickCluster}

        {/* Bottom-Center: Live Vehicle Telemetry (when driving) + Sound Mixer Toggle */}
        <div className="pointer-events-none flex flex-col items-center gap-2 pb-0.5">
          {showAudioDrawer && (
            <BottomAudioPanel
              settings={snapshot.settings}
              audio={snapshot.audio}
              onUpdateSettings={onUpdateSettings}
              onToggleMute={onToggleMute}
              onClose={() => {
                onUiClick();
                setShowAudioDrawer(false);
              }}
            />
          )}

          {isDriving && activeVehicle && (
            <div
              aria-label="Vehicle Telemetry"
              className="kl-speedo-cluster kl-anim-card flex items-center gap-2.5"
            >
              <div className="flex flex-col">
                <span className="max-w-[140px] truncate text-[11px] font-semibold text-slate-200">
                  {activeVehicle.displayName}
                </span>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`kl-tabular rounded px-1.5 py-0.5 font-mono-tabular text-[9px] font-bold ${
                      activeVehicle.gear === 'REVERSE'
                        ? 'bg-rose-500/25 text-rose-300'
                        : activeVehicle.gear === 'BRAKE' || activeVehicle.gear === 'HANDBRAKE'
                          ? 'bg-amber-500/25 text-amber-300'
                          : activeVehicle.gear === 'DRIVE'
                            ? 'bg-emerald-500/25 text-emerald-300'
                            : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {activeVehicle.gear}
                  </span>
                  {activeVehicle.damageState !== 'undamaged' && (
                    <span
                      className={`kl-tabular rounded px-1.5 py-0.5 font-mono-tabular text-[9px] font-bold uppercase ${
                        activeVehicle.damageState === 'severe'
                          ? 'bg-rose-500/30 text-rose-300'
                          : activeVehicle.damageState === 'moderate'
                            ? 'bg-amber-500/30 text-amber-300'
                            : 'bg-sky-500/25 text-sky-200'
                      }`}
                    >
                      {activeVehicle.damageState}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-baseline gap-0.5 border-l border-white/15 pl-2.5">
                <span className="kl-tabular font-mono-tabular text-xl font-extrabold leading-none text-amber-300">
                  {activeVehicle.speedKmh}
                </span>
                <span className="font-mono-tabular text-[10px] font-semibold text-slate-400">
                  km/h
                </span>
              </div>
            </div>
          )}

          <button
            type="button"
            data-hud-control="true"
            onClick={() => {
              onUiClick();
              setShowAudioDrawer((prev) => !prev);
            }}
            aria-label="Sound and Audio Settings"
            aria-expanded={showAudioDrawer}
            className={`pointer-events-auto flex min-h-[40px] items-center gap-1.5 rounded-full border px-3 shadow-lg transition-colors active:scale-95 ${
              snapshot.settings.masterMuted
                ? 'border-rose-400/50 bg-slate-950/90 text-rose-300'
                : showAudioDrawer
                  ? 'border-amber-400 bg-amber-500 text-slate-950'
                  : 'border-white/25 bg-slate-950/88 text-white hover:bg-slate-800'
            }`}
          >
            {snapshot.settings.masterMuted ? (
              <VolumeX className="h-4 w-4 shrink-0" strokeWidth={2.2} />
            ) : (
              <Volume2 className="h-4 w-4 shrink-0" strokeWidth={2.2} />
            )}
            <span className="font-mono-tabular text-xs font-bold">
              {snapshot.settings.masterMuted ? 'MUTE' : `${effectiveMasterPct}%`}
            </span>
          </button>
        </div>

        {isDriving
          ? isLeftHanded
            ? drivingSteerCluster
            : drivingPedalCluster
          : isLeftHanded
            ? joystickCluster
            : actionThumbCluster}
      </div>
    </div>
  );
}
