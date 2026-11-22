import { useState } from 'react';
import { Play, RotateCcw, Settings, Volume2, VolumeX } from 'lucide-react';
import type { AudioStateSnapshot } from '../engine/audio/AudioTypes.ts';
import type { GameSettings } from '../engine/types.ts';
import { BottomAudioPanel } from './BottomAudioPanel.tsx';
import { PWAInstallPrompt } from './PWAInstallPrompt.tsx';

interface TitleScreenProps {
  isBooting: boolean;
  hasSavedSlot: boolean;
  settings: GameSettings;
  audio: AudioStateSnapshot;
  onContinue: () => void;
  onNewGame: () => void;
  onOpenSettings: () => void;
  onUpdateSettings: (patch: Partial<GameSettings>) => void;
  onToggleMute: () => void;
  onUiClick: () => void;
}

export function TitleScreen({
  isBooting,
  hasSavedSlot,
  settings,
  audio,
  onContinue,
  onNewGame,
  onOpenSettings,
  onUpdateSettings,
  onToggleMute,
  onUiClick,
}: TitleScreenProps) {
  const [showAudioPanel, setShowAudioPanel] = useState(false);

  if (isBooting) {
    return (
      <div className="kl-title-backdrop fixed inset-0 z-30 flex flex-col items-center justify-center p-6 text-slate-100">
        <svg viewBox="0 0 360 68" className="h-14 w-auto" role="img" aria-label="Kozhikode Life">
          <text
            x="180"
            y="48"
            textAnchor="middle"
            fill="#f8fafc"
            fontFamily="Barlow Condensed, sans-serif"
            fontSize="46"
            fontWeight="700"
            letterSpacing="2"
          >
            KOZHIKODE LIFE
          </text>
        </svg>
        <div className="mt-5 h-2 w-56 overflow-hidden rounded-full bg-slate-800">
          <div className="kl-progress-sheen h-full w-2/3 rounded-full bg-amber-500" />
        </div>
        <p className="mt-3 text-xs tracking-wider text-slate-300">Loading Mananchira &amp; Kozhikode Coast...</p>
      </div>
    );
  }

  const effectiveMasterPct = settings.masterMuted ? 0 : Math.round(settings.masterVolume * 100);

  return (
    <div
      className="kl-title-backdrop kl-safe-pad pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-4 sm:p-10"
      style={{
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
        paddingRight: 'max(1rem, env(safe-area-inset-right))',
      }}
    >
      {/* Upper-Left Clean Title Lockup & Main Menu */}
      <div className="pointer-events-auto max-w-xs sm:max-w-sm">
        <div className="kl-title-card kl-anim-title p-5 sm:p-6">
          <svg
            viewBox="0 0 340 62"
            className="h-11 w-auto sm:h-14"
            role="img"
            aria-label="Kozhikode Life"
          >
            <text
              x="0"
              y="46"
              fill="#f8fafc"
              fontFamily="Barlow Condensed, sans-serif"
              fontSize="46"
              fontWeight="700"
              letterSpacing="1.5"
            >
              KOZHIKODE <tspan fill="#f59e0b">LIFE</tspan>
            </text>
          </svg>
          <p className="mt-1 text-[11px] font-medium tracking-wide text-slate-400">
            Open-World Kerala City &amp; Delivery Simulation
          </p>

          <div className="mt-4 flex flex-col gap-2.5">
            {hasSavedSlot && (
              <button
                type="button"
                onClick={onContinue}
                className="kl-btn-tactile flex min-h-[46px] w-full items-center justify-center gap-2.5 rounded-xl bg-amber-500 px-5 text-sm font-bold tracking-wide text-slate-950 hover:bg-amber-400"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>Continue</span>
              </button>
            )}

            <button
              type="button"
              onClick={onNewGame}
              className={`kl-btn-tactile flex min-h-[46px] w-full items-center justify-center gap-2.5 rounded-xl px-5 text-sm font-bold tracking-wide ${
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
              onClick={() => {
                onUiClick();
                onOpenSettings();
              }}
              className="kl-btn-tactile flex min-h-[44px] w-full items-center justify-center gap-2.5 rounded-xl border border-white/15 bg-slate-900/85 px-5 text-sm font-medium text-slate-100 hover:bg-slate-800"
            >
              <Settings className="h-4 w-4" />
              <span>Settings &amp; Audio</span>
            </button>

            <div className="mt-1 flex justify-center">
              <PWAInstallPrompt onUiClick={onUiClick} />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Controls Hint, Attribution & Bottom Sound Control */}
      <div className="flex flex-col items-end gap-2">
        {showAudioPanel && (
          <BottomAudioPanel
            settings={settings}
            audio={audio}
            onUpdateSettings={onUpdateSettings}
            onToggleMute={onToggleMute}
            onClose={() => {
              onUiClick();
              setShowAudioPanel(false);
            }}
          />
        )}

        <div className="flex w-full flex-wrap items-center justify-between gap-2 text-xs text-slate-200/90">
          <div className="kl-hud-card px-3 py-2">
            Drag to Look · Joystick or WASD to Move
          </div>

          <div className="pointer-events-auto flex items-center gap-2">
            <div className="kl-hud-card hidden px-3 py-2 text-[11px] text-slate-400 sm:block">
              Kozhikode Geo-Architecture · OpenStreetMap ODbL
            </div>

            <button
              type="button"
              data-hud-control="true"
              onClick={() => {
                onUiClick();
                setShowAudioPanel((prev) => !prev);
              }}
              aria-label="Title Screen Audio Settings"
              aria-expanded={showAudioPanel}
              className={`kl-btn-tactile flex min-h-[44px] items-center gap-2 rounded-full border px-3.5 shadow-lg ${
                settings.masterMuted
                  ? 'border-rose-400/50 bg-slate-950/90 text-rose-300'
                  : showAudioPanel
                    ? 'border-amber-400 bg-amber-500 text-slate-950'
                    : 'border-white/25 bg-slate-950/88 text-white hover:bg-slate-800'
              }`}
            >
              {settings.masterMuted ? (
                <VolumeX className="h-4 w-4 shrink-0" strokeWidth={2.2} />
              ) : (
                <Volume2 className="h-4 w-4 shrink-0" strokeWidth={2.2} />
              )}
              <span className="kl-tabular font-mono-tabular text-xs font-bold">
                {settings.masterMuted ? 'MUTE' : `${effectiveMasterPct}%`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
