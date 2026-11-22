import { Music, Volume2, VolumeX, Wind, X, Zap } from 'lucide-react';
import type { AudioStateSnapshot } from '../engine/audio/AudioTypes.ts';
import type { GameSettings } from '../engine/types.ts';

interface BottomAudioPanelProps {
  settings: GameSettings;
  audio: AudioStateSnapshot;
  onUpdateSettings: (patch: Partial<GameSettings>) => void;
  onToggleMute: () => void;
  onClose: () => void;
}

export function BottomAudioPanel({
  settings,
  audio,
  onUpdateSettings,
  onToggleMute,
  onClose,
}: BottomAudioPanelProps) {
  const effectiveMaster = settings.masterMuted ? 0 : Math.round(settings.masterVolume * 100);

  return (
    <div
      data-hud-control="true"
      onPointerDown={(e) => e.stopPropagation()}
      className="kl-audio-drawer kl-anim-card pointer-events-auto w-[min(21rem,calc(100vw-2rem))] p-4 text-slate-100"
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-hud-control="true"
            onClick={onToggleMute}
            aria-label={settings.masterMuted ? 'Unmute Audio' : 'Mute Audio'}
            className={`kl-btn-tactile flex h-11 w-11 items-center justify-center rounded-xl border ${
              settings.masterMuted
                ? 'border-rose-400/50 bg-rose-500/20 text-rose-300'
                : 'border-amber-400/50 bg-amber-500/20 text-amber-300'
            }`}
          >
            {settings.masterMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-white">
              Sound &amp; Music
            </div>
            <div className="kl-tabular font-mono-tabular text-[11px] text-slate-300">
              {settings.masterMuted ? 'Muted' : `Master ${effectiveMaster}%`}
            </div>
          </div>
        </div>

        <button
          type="button"
          data-hud-control="true"
          onClick={onClose}
          aria-label="Close Sound Panel"
          className="kl-btn-tactile flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-slate-900 text-slate-200 hover:bg-slate-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 space-y-2.5">
        <AudioSliderRow
          icon={<Volume2 className="h-3.5 w-3.5 text-amber-400" />}
          label="Master"
          value={settings.masterVolume}
          disabled={settings.masterMuted}
          onChange={(v) => onUpdateSettings({ masterVolume: v, masterMuted: v <= 0.005 ? true : false })}
        />
        <AudioSliderRow
          icon={<Music className="h-3.5 w-3.5 text-sky-400" />}
          label="Music"
          value={settings.musicVolume}
          disabled={settings.masterMuted}
          onChange={(v) => onUpdateSettings({ musicVolume: v })}
        />
        <AudioSliderRow
          icon={<Zap className="h-3.5 w-3.5 text-emerald-400" />}
          label="Effects"
          value={settings.sfxVolume}
          disabled={settings.masterMuted}
          onChange={(v) => onUpdateSettings({ sfxVolume: v })}
        />
        <AudioSliderRow
          icon={<Wind className="h-3.5 w-3.5 text-teal-300" />}
          label="Ambience"
          value={settings.ambientVolume}
          disabled={settings.masterMuted}
          onChange={(v) => onUpdateSettings({ ambientVolume: v })}
        />
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2 text-[11px] text-slate-400">
        <span className="truncate">{audio.activeMusicLabel}</span>
        <span className="truncate text-teal-300">{audio.activeAmbienceLabel}</span>
      </div>
    </div>
  );
}

interface AudioSliderRowProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}

function AudioSliderRow({ icon, label, value, disabled, onChange }: AudioSliderRowProps) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1.5 font-medium text-slate-200">
          {icon}
          <span>{label}</span>
        </span>
        <span className="font-mono-tabular text-slate-300">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        data-hud-control="true"
        min={0}
        max={1}
        step={0.02}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-2 w-full cursor-pointer accent-amber-400 disabled:opacity-45"
      />
    </label>
  );
}
