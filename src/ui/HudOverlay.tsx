import { useEffect, useRef, useState } from 'react';
import {
  Briefcase,
  Camera,
  Car,
  Crosshair,
  DoorOpen,
  Flag,
  Home,
  Lock,
  Map as MapIcon,
  MapPin,
  Navigation,
  Pause,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import type { EngineHudSnapshot, GameSettings } from '../engine/types.ts';
import {
  KOZHIKODE_REGIONS,
  KOZHIKODE_ROAD_CORRIDORS,
  PROTAGONIST_HOME_COORDS,
} from '../engine/world/KozhikodeGeography.ts';
import { BottomAudioPanel } from './BottomAudioPanel.tsx';

interface HudOverlayProps {
  snapshot: EngineHudSnapshot;
  onPause: () => void;
  onToggleCamera: () => void;
  onToggleMute: () => void;
  onUpdateSettings: (patch: Partial<GameSettings>) => void;
  onHomeInteract: () => void;
  onOpenWorldMap: () => void;
  onClearDestination: () => void;
  onUiClick: () => void;
  onVirtualMove: (x: number, y: number) => void;
  onSprintHold: (held: boolean) => void;
}

export function HudOverlay({
  snapshot,
  onPause,
  onToggleCamera,
  onToggleMute,
  onUpdateSettings,
  onHomeInteract,
  onOpenWorldMap,
  onClearDestination,
  onUiClick,
  onVirtualMove,
  onSprintHold,
}: HudOverlayProps) {
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const joystickBaseRef = useRef<HTMLDivElement | null>(null);
  const joystickPointerIdRef = useRef<number | null>(null);
  const sprintPointerIdRef = useRef<number | null>(null);
  const onVirtualMoveRef = useRef(onVirtualMove);
  const onSprintHoldRef = useRef(onSprintHold);
  onVirtualMoveRef.current = onVirtualMove;
  onSprintHoldRef.current = onSprintHold;

  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showAudioDrawer, setShowAudioDrawer] = useState(false);
  const [hudNotice, setHudNotice] = useState<string | null>(null);

  const showTimedNotice = (msg: string) => {
    setHudNotice(msg);
  };

  useEffect(() => {
    if (!hudNotice) return;
    const id = window.setTimeout(() => setHudNotice(null), 2600);
    return () => window.clearTimeout(id);
  }, [hudNotice]);

  useEffect(() => {
    const resetAllHudTouch = () => {
      if (joystickPointerIdRef.current !== null) {
        joystickPointerIdRef.current = null;
        setKnobOffset({ x: 0, y: 0 });
        onVirtualMoveRef.current(0, 0);
      }
      if (sprintPointerIdRef.current !== null) {
        sprintPointerIdRef.current = null;
        onSprintHoldRef.current(false);
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        resetAllHudTouch();
      }
    };

    window.addEventListener('blur', resetAllHudTouch);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('blur', resetAllHudTouch);
      document.removeEventListener('visibilitychange', handleVisibility);
      resetAllHudTouch();
    };
  }, []);

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
    if (snapshot.activeDestination?.routeWaypoints && snapshot.activeDestination.routeWaypoints.length > 1) {
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

    const normMag = clampedDist / maxRadius;
    onVirtualMove(Math.cos(angle) * normMag, -Math.sin(angle) * normMag);
  };

  const resetJoystick = () => {
    joystickPointerIdRef.current = null;
    setKnobOffset({ x: 0, y: 0 });
    onVirtualMove(0, 0);
  };

  const releaseSprint = () => {
    sprintPointerIdRef.current = null;
    onSprintHold(false);
  };

  // Compute crisp Home House marker position on circular minimap (clamped to rim when out of range)
  const relHomeX = (PROTAGONIST_HOME_COORDS.houseX - snapshot.playerX) * 0.44;
  const relHomeZ = (PROTAGONIST_HOME_COORDS.houseZ - snapshot.playerZ) * 0.44;
  const cosYaw = Math.cos(snapshot.cameraYaw);
  const sinYaw = Math.sin(snapshot.cameraYaw);
  const rotHomeX = relHomeX * cosYaw - relHomeZ * sinYaw;
  const rotHomeY = relHomeX * sinYaw + relHomeZ * cosYaw;
  const homePixelDist = Math.hypot(rotHomeX, rotHomeY);
  const maxMarkerRadiusPct = 39;
  const homeRadarScale = 100 / 96; // convert 96px canvas coords to %
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

  return (
    <div
      className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-3 sm:p-5"
      style={{
        opacity: snapshot.settings.hudOpacity,
        paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
      }}
    >
      {/* TOP HUD PERIMETER */}
      <div className="flex items-start justify-between gap-2">
        {/* Top-Left: Interactive Circular Minimap + Crisp Home Marker + Home/Mission/Waypoint Chips */}
        <div className="flex flex-col items-start gap-1.5">
          <button
            type="button"
            data-hud-control="true"
            onClick={() => {
              onUiClick();
              onOpenWorldMap();
            }}
            aria-label="Open Minimap World View"
            title="Tap to open Kozhikode Interactive World Map"
            className="pointer-events-auto relative h-[88px] w-[88px] overflow-hidden rounded-full border-2 border-white/35 bg-slate-950/90 shadow-xl transition-transform hover:border-amber-400/75 active:scale-95 sm:h-24 sm:w-24"
          >
            <canvas ref={minimapRef} width={96} height={96} className="h-full w-full" />

            {/* North Compass Marker */}
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded bg-slate-950/80 px-1 text-[9px] font-extrabold leading-none tracking-wider text-amber-400"
              style={{ left: `${northLeftPct}%`, top: `${northTopPct}%` }}
            >
              N
            </div>

            {/* High-Contrast Protagonist Home Icon Marker (West Hill) */}
            <div
              aria-label="Arjun's Home Map Marker"
              title="West Hill · Arjun's Residence"
              className="pointer-events-none absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-emerald-400 text-slate-950 shadow-md"
              style={{ left: `${homePinLeftPct}%`, top: `${homePinTopPct}%` }}
            >
              <Home className="h-3 w-3" strokeWidth={2.6} />
            </div>
          </button>

          {/* Home Distance & Mission Status Chip (Visible on Mobile & Desktop) */}
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
              className={`flex min-h-[34px] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold shadow-md transition-colors ${
                snapshot.nearHome
                  ? 'border-emerald-300/70 bg-emerald-500/25 text-emerald-100'
                  : 'border-white/20 bg-slate-950/85 text-slate-100 hover:bg-slate-900'
              }`}
            >
              <Home className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2.2} />
              <span className="font-mono-tabular">
                {snapshot.nearHome ? 'Home' : `${snapshot.homeDistanceMeters}m`}
              </span>
            </button>

            <button
              type="button"
              data-hud-control="true"
              onClick={() => {
                onUiClick();
                showTimedNotice('Free Roam · Story Missions begin in Phase 15');
              }}
              aria-label="Mission Status"
              className="flex min-h-[34px] items-center gap-1 rounded-lg border border-white/20 bg-slate-950/85 px-2 py-1 text-[11px] font-semibold text-amber-300 shadow-md hover:bg-slate-900"
            >
              <Flag className="h-3.5 w-3.5" strokeWidth={2.2} />
              <span className="hidden sm:inline">Explore</span>
            </button>
          </div>

          {snapshot.activeDestination && (
            <div className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-emerald-400/50 bg-slate-950/90 px-2.5 py-1 text-[11px] font-semibold text-emerald-200 shadow-lg">
              <Navigation className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
              <span className="max-w-[140px] truncate">{snapshot.activeDestination.name}</span>
              <span className="font-mono-tabular text-amber-300">
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

        {/* Top-Right: District/Clock/Cash, World Map, Weapon/Inventory, Camera, Pause */}
        <div className="pointer-events-auto flex items-start gap-2">
          {/* District + Clock + Cash (Always visible on mobile & desktop) */}
          <div className="rounded-xl border border-white/15 bg-slate-950/85 px-2.5 py-1.5 text-right shadow-lg sm:px-3.5 sm:py-2">
            <div className="flex items-center justify-end gap-1 font-mono-tabular text-[11px] font-semibold text-white sm:text-sm">
              <MapPin className="h-3 w-3 shrink-0 text-amber-400" strokeWidth={2.3} />
              <span className="max-w-[96px] truncate sm:max-w-none">
                {snapshot.clockFormatted} · {snapshot.districtName}
              </span>
            </div>
            <div className="font-mono-tabular text-[11px] font-bold text-emerald-400 sm:text-xs">
              ₹ 0
            </div>
          </div>

          {/* Interactive World Map Button */}
          <button
            type="button"
            data-hud-control="true"
            onClick={() => {
              onUiClick();
              onOpenWorldMap();
            }}
            aria-label="World Map"
            title="Open Kozhikode District Map & Google Maps Explorer"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-400/60 bg-slate-950/88 text-amber-300 shadow-lg transition-colors hover:bg-amber-500 hover:text-slate-950 active:scale-95"
          >
            <MapIcon className="h-5 w-5" strokeWidth={2.1} />
          </button>

          {/* Weapon & Inventory Slot (Phase 9 Foundation - Clearly Distinguished as Unarmed/Locked) */}
          <button
            type="button"
            data-hud-control="true"
            onClick={() => {
              onUiClick();
              showTimedNotice('Unarmed · Weapons & Inventory unlock in Phase 9');
            }}
            aria-label="Weapon and Inventory Slot"
            className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-white/25 bg-slate-950/85 text-slate-100 shadow-lg transition-colors hover:bg-slate-800 active:scale-95"
          >
            <Crosshair className="h-5 w-5 text-amber-300" strokeWidth={2} />
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-slate-900 bg-slate-700 text-slate-200">
              <Briefcase className="h-2.5 w-2.5" strokeWidth={2.3} />
            </span>
          </button>

          {/* Camera Toggle Button */}
          <button
            type="button"
            data-hud-control="true"
            onClick={onToggleCamera}
            aria-label="Toggle Camera View"
            className={`flex h-11 w-11 items-center justify-center rounded-xl border shadow-lg transition-colors active:scale-95 ${
              snapshot.cameraMode === 'title_orbit'
                ? 'border-sky-400/60 bg-sky-500/25 text-sky-200'
                : 'border-white/25 bg-slate-950/85 text-white hover:bg-slate-800'
            }`}
          >
            <Camera className="h-5 w-5" strokeWidth={2} />
          </button>

          {/* Pause / Settings Button */}
          <button
            type="button"
            data-hud-control="true"
            onClick={onPause}
            aria-label="Pause and Settings"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-slate-950/85 text-white shadow-lg transition-colors hover:bg-slate-800 active:scale-95"
          >
            <Pause className="h-5 w-5" strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {/* Transient Contextual Notice Toast */}
      {hudNotice && (
        <div className="pointer-events-none self-center rounded-xl border border-amber-400/40 bg-slate-950/90 px-3.5 py-2 text-center text-xs font-medium text-amber-100 shadow-xl">
          {hudNotice}
        </div>
      )}

      {/* BOTTOM CONTROLS + DEDICATED BOTTOM SOUND CONTROL */}
      <div className="relative flex items-end justify-between gap-2">
        {/* Bottom-Left: Virtual Analog Joystick (Player Movement Only) */}
        <div
          ref={joystickBaseRef}
          data-hud-control="true"
          onPointerDown={(e) => {
            e.stopPropagation();
            if (joystickPointerIdRef.current !== null) return;
            joystickPointerIdRef.current = e.pointerId;
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
          className="pointer-events-auto relative flex h-24 w-24 shrink-0 touch-none select-none items-center justify-center rounded-full border border-white/25 bg-slate-950/55 shadow-lg sm:h-28 sm:w-28"
        >
          <div className="pointer-events-none absolute inset-3 rounded-full border border-white/15" />
          <div
            className="pointer-events-none h-10 w-10 rounded-full border border-white/45 bg-white/30 shadow-md sm:h-11 sm:w-11"
            style={{
              transform: `translate3d(${knobOffset.x}px, ${knobOffset.y}px, 0)`,
            }}
          />
        </div>

        {/* Bottom-Center: Dedicated Sound Control & Compact Audio Mixer Popover */}
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

          <button
            type="button"
            data-hud-control="true"
            onClick={() => {
              onUiClick();
              setShowAudioDrawer((prev) => !prev);
            }}
            aria-label="Sound and Audio Settings"
            aria-expanded={showAudioDrawer}
            className={`pointer-events-auto flex min-h-[44px] items-center gap-2 rounded-full border px-3.5 shadow-lg transition-colors active:scale-95 ${
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

        {/* Bottom-Right: Compact Action Thumb Cluster (Home Door Interaction, Vehicle Foundation, Sprint) */}
        <div className="pointer-events-auto flex shrink-0 flex-col items-end gap-2 pb-0.5 pr-0.5">
          <div className="flex items-center gap-2">
            {/* Home / Door Interaction Icon */}
            <button
              type="button"
              data-hud-control="true"
              onClick={() => {
                if (snapshot.nearHome) {
                  onHomeInteract();
                  showTimedNotice("Arjun's Residence Door · Full Interior opens in Story Phase");
                } else {
                  onUiClick();
                  showTimedNotice(`Walk to Arjun's Home (${snapshot.homeDistanceMeters}m) to interact`);
                }
              }}
              aria-label="Interact with Home Entrance"
              className={`relative flex h-11 w-11 items-center justify-center rounded-full border shadow-lg transition-colors active:scale-95 ${
                snapshot.nearHome
                  ? 'border-emerald-300 bg-emerald-500 text-slate-950'
                  : 'border-white/20 bg-slate-950/75 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <DoorOpen className="h-5 w-5" strokeWidth={2.2} />
            </button>

            {/* Vehicle Interaction Slot (Phase 7 Visual Foundation) */}
            <button
              type="button"
              data-hud-control="true"
              onClick={() => {
                onUiClick();
                showTimedNotice('Vehicles unlock in Phase 7 (Driving & Physics)');
              }}
              aria-label="Vehicle Entry (Locked until Phase 7)"
              className="relative flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-slate-950/75 text-slate-300 shadow-lg hover:bg-slate-800 active:scale-95"
            >
              <Car className="h-5 w-5" strokeWidth={2} />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-slate-900 bg-slate-700 text-amber-300">
                <Lock className="h-2.5 w-2.5" strokeWidth={2.4} />
              </span>
            </button>
          </div>

          {/* Primary Hold-to-Sprint Button */}
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
            className={`flex h-12 w-12 touch-none select-none items-center justify-center rounded-full border shadow-lg transition-transform active:scale-90 ${
              snapshot.isSprinting
                ? 'border-amber-300 bg-amber-500 text-slate-950'
                : 'border-amber-400/60 bg-slate-950/85 text-amber-400'
            }`}
          >
            <Zap className="h-5 w-5" strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </div>
  );
}
