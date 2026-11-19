import { Play, RotateCcw, Settings } from 'lucide-react';

interface TitleScreenProps {
  isBooting: boolean;
  hasSavedSlot: boolean;
  onContinue: () => void;
  onNewGame: () => void;
  onOpenSettings: () => void;
}

export function TitleScreen({
  isBooting,
  hasSavedSlot,
  onContinue,
  onNewGame,
  onOpenSettings,
}: TitleScreenProps) {
  if (isBooting) {
    return (
      <div className="fixed inset-0 z-30 flex flex-col items-center justify-center bg-slate-950 p-6 text-slate-100">
        <svg viewBox="0 0 340 68" className="h-14 w-auto" role="img" aria-label="GTA Kozhikode">
          <text
            x="170"
            y="48"
            textAnchor="middle"
            fill="#f8fafc"
            fontFamily="Barlow Condensed, sans-serif"
            fontSize="48"
            fontWeight="700"
            letterSpacing="2"
          >
            GTA KOZHIKODE
          </text>
        </svg>
        <div className="mt-5 h-1.5 w-56 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full w-2/3 rounded-full bg-amber-500" />
        </div>
        <p className="mt-3 text-xs tracking-wider text-slate-400">Loading Mananchira &amp; Beach Core...</p>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-5 sm:p-10">
      {/* Upper-Left Clean Title Lockup & Main Menu */}
      <div className="pointer-events-auto max-w-xs sm:max-w-sm">
        <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-6">
          <svg
            viewBox="0 0 320 62"
            className="h-12 w-auto sm:h-14"
            role="img"
            aria-label="GTA Kozhikode"
          >
            <text
              x="0"
              y="46"
              fill="#f8fafc"
              fontFamily="Barlow Condensed, sans-serif"
              fontSize="48"
              fontWeight="700"
              letterSpacing="1.5"
            >
              GTA <tspan fill="#f59e0b">KOZHIKODE</tspan>
            </text>
          </svg>

          <div className="mt-5 flex flex-col gap-2.5">
            {hasSavedSlot && (
              <button
                type="button"
                onClick={onContinue}
                className="flex min-h-[46px] w-full items-center justify-center gap-2.5 rounded-xl bg-amber-500 px-5 text-sm font-bold tracking-wide text-slate-950 transition-colors hover:bg-amber-400 active:scale-[0.98]"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>Continue</span>
              </button>
            )}

            <button
              type="button"
              onClick={onNewGame}
              className={`flex min-h-[46px] w-full items-center justify-center gap-2.5 rounded-xl px-5 text-sm font-bold tracking-wide transition-colors active:scale-[0.98] ${
                hasSavedSlot
                  ? 'border border-white/15 bg-slate-900/90 text-white hover:bg-slate-800'
                  : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
              }`}
            >
              {hasSavedSlot ? <RotateCcw className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
              <span>{hasSavedSlot ? 'New Game' : 'Play'}</span>
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              className="flex min-h-[44px] w-full items-center justify-center gap-2.5 rounded-xl border border-white/15 bg-slate-900/80 px-5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800"
            >
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Quiet Control Hint & OpenStreetMap ODbL Attribution */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-200/90">
        <div className="rounded-lg bg-slate-950/65 px-3.5 py-2">
          Drag to Look · Virtual Joystick or WASD to Explore
        </div>
        <div className="rounded-lg bg-slate-950/65 px-3 py-2 text-[11px] text-slate-400">
          Kozhikode Geo-Architecture · OpenStreetMap ODbL
        </div>
      </div>
    </div>
  );
}
