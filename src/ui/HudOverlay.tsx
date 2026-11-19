import { useEffect, useRef, useState } from 'react';
import { Menu, Zap } from 'lucide-react';
import type { EngineHudSnapshot } from '../engine/types.ts';

interface HudOverlayProps {
  snapshot: EngineHudSnapshot;
  onPause: () => void;
  onVirtualMove: (x: number, y: number) => void;
  onSprintHold: (held: boolean) => void;
}

export function HudOverlay({
  snapshot,
  onPause,
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
    const scale = 0.72; // pixels per world meter

    ctx.clearRect(0, 0, w, h);

    // Minimap dark urban ground
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(cx, cy);
    // Rotate radar relative to camera yaw so up = forward look direction
    ctx.rotate(snapshot.cameraYaw);
    ctx.translate(-snapshot.playerX * scale, -snapshot.playerZ * scale);

    // Arabian sea coastline west
    ctx.fillStyle = '#0e5a63';
    ctx.fillRect(-200 * scale, -140 * scale, 132 * scale, 280 * scale);

    // Roads network
    ctx.fillStyle = '#334155';
    ctx.fillRect(-40 * scale, -110 * scale, 12 * scale, 220 * scale); // West rd
    ctx.fillRect(28 * scale, -110 * scale, 13 * scale, 220 * scale); // East rd
    ctx.fillRect(-67 * scale, -110 * scale, 11 * scale, 220 * scale); // Beach rd
    ctx.fillRect(-100 * scale, -40 * scale, 200 * scale, 11 * scale); // North rd
    ctx.fillRect(-100 * scale, 30 * scale, 200 * scale, 11 * scale); // South rd

    // Mananchira park & water tank
    ctx.fillStyle = '#1e3a2f';
    ctx.fillRect(-27 * scale, -29 * scale, 54 * scale, 58 * scale);
    ctx.fillStyle = '#0d9488';
    ctx.fillRect(-17 * scale, -13 * scale, 34 * scale, 26 * scale);

    ctx.restore();

    // Player directional arrow rotated to player heading relative to radar orientation
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(snapshot.cameraYaw + Math.PI - snapshot.playerHeading);
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }, [snapshot.playerX, snapshot.playerZ, snapshot.playerHeading, snapshot.cameraYaw]);

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

  const northLeftPct = 50 + Math.sin(snapshot.cameraYaw) * 42;
  const northTopPct = 50 - Math.cos(snapshot.cameraYaw) * 42;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-4 sm:p-6"
      style={{
        opacity: snapshot.settings.hudOpacity,
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
        paddingRight: 'max(1rem, env(safe-area-inset-right))',
      }}
    >
      {/* Top Perimeter: Circular Minimap (Left) & Minimal Time/Location/Pause (Right) */}
      <div className="flex items-start justify-between gap-4">
        <div className="relative h-20 w-20 overflow-hidden rounded-full border-2 border-white/25 bg-slate-950/85 shadow-lg sm:h-24 sm:w-24">
          <canvas ref={minimapRef} width={96} height={96} className="h-full w-full" />
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-[9px] font-bold tracking-widest text-amber-400"
            style={{ left: `${northLeftPct}%`, top: `${northTopPct}%` }}
          >
            N
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-3">
          <div className="hidden rounded-xl border border-white/10 bg-slate-950/75 px-3.5 py-2 text-right sm:block">
            <div className="font-mono-tabular text-sm font-semibold text-white">
              17:45 · Mananchira
            </div>
            <div className="font-mono-tabular text-xs font-bold text-emerald-400">₹ 0</div>
          </div>

          <button
            type="button"
            data-hud-control="true"
            onClick={onPause}
            aria-label="Pause Menu"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-slate-950/80 text-white transition-colors hover:bg-slate-800 active:scale-95"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Bottom Thumb Zones: Authentic Mobile Virtual Joystick & Compact Action Button */}
      <div className="flex items-end justify-between gap-4">
        {/* Virtual Analog Joystick (Player Movement Only) */}
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
          className="pointer-events-auto relative flex h-28 w-28 touch-none select-none items-center justify-center rounded-full border border-white/20 bg-slate-950/45"
        >
          <div className="pointer-events-none absolute inset-3 rounded-full border border-white/10" />
          <div
            className="pointer-events-none h-11 w-11 rounded-full border border-white/40 bg-white/25 shadow-md"
            style={{
              transform: `translate3d(${knobOffset.x}px, ${knobOffset.y}px, 0)`,
            }}
          />
        </div>

        {/* Compact Sprint / Fast Move Action Button */}
        <div className="pointer-events-auto flex items-center gap-3 pb-1 pr-1">
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
            className={`flex h-12 w-12 touch-none select-none items-center justify-center rounded-full border transition-transform active:scale-90 ${
              snapshot.isSprinting
                ? 'border-amber-300 bg-amber-500 text-slate-950'
                : 'border-amber-400/50 bg-slate-950/75 text-amber-400'
            }`}
          >
            <Zap className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
