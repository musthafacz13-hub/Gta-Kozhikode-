import { useState } from 'react';
import {
  Home,
  MapPin,
  Music,
  Play,
  RotateCcw,
  Save,
  Settings,
  ShieldAlert,
  Terminal,
  Trash2,
  Volume2,
  VolumeX,
  Wind,
  X,
  Zap,
} from 'lucide-react';
import type {
  EngineHudSnapshot,
  GameSettings,
  GraphicsTier,
  LanguageMode,
  LogEntry,
  TimeOfDayPreset,
} from '../engine/types.ts';

interface PauseDiagnosticsModalProps {
  snapshot: EngineHudSnapshot;
  logs: LogEntry[];
  initialTab?: 'pause' | 'settings';
  onClose: () => void;
  onResumePlay: () => void;
  onReturnTitle: () => void;
  onTravelHome: () => void;
  onTravelMananchira: () => void;
  onToggleMute: () => void;
  onUpdateSettings: (patch: Partial<GameSettings>) => void;
  onResetSettings: () => void;
  onSaveManual: () => void;
  onDeleteSlot: (slotId: string) => void;
  onToggleDebugGrid: (visible: boolean) => void;
  onTriggerContextLoss: () => void;
}

type MenuView = 'pause' | 'saves' | 'settings' | 'diagnostics';

export function PauseDiagnosticsModal({
  snapshot,
  logs,
  initialTab = 'pause',
  onClose,
  onResumePlay,
  onReturnTitle,
  onTravelHome,
  onTravelMananchira,
  onToggleMute,
  onUpdateSettings,
  onResetSettings,
  onSaveManual,
  onDeleteSlot,
  onToggleDebugGrid,
  onTriggerContextLoss,
}: PauseDiagnosticsModalProps) {
  const [view, setView] = useState<MenuView>(initialTab);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/85 p-4">
      <div className="flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-900 text-slate-100 shadow-2xl">
        {/* Clean Game Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="font-display text-2xl font-bold tracking-wide text-white">
            {view === 'pause' && 'PAUSED'}
            {view === 'saves' && 'SAVE SLOTS'}
            {view === 'settings' && 'SETTINGS & AUDIO'}
            {view === 'diagnostics' && 'SYSTEM DIAGNOSTICS'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Menu"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-white/10 bg-slate-800 text-slate-200 hover:bg-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {view === 'pause' && (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={onResumePlay}
                className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-amber-500 text-sm font-bold text-slate-950 hover:bg-amber-400"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>Resume Game</span>
              </button>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={onTravelHome}
                  className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-emerald-400/35 bg-emerald-500/15 px-3 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25"
                >
                  <Home className="h-4 w-4 text-emerald-400" />
                  <span>Go to West Hill Home</span>
                </button>
                <button
                  type="button"
                  onClick={onTravelMananchira}
                  className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-white/15 bg-slate-800 px-3 text-xs font-semibold text-slate-100 hover:bg-slate-700"
                >
                  <MapPin className="h-4 w-4 text-amber-400" />
                  <span>Go to Mananchira</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  onSaveManual();
                  setView('saves');
                }}
                className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-800 text-sm font-medium text-white hover:bg-slate-700"
              >
                <Save className="h-4 w-4 text-teal-400" />
                <span>Save / Manage Slots</span>
              </button>

              <button
                type="button"
                onClick={() => setView('settings')}
                className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-800 text-sm font-medium text-white hover:bg-slate-700"
              >
                <Settings className="h-4 w-4 text-amber-400" />
                <span>Graphics, Audio &amp; Controls</span>
              </button>

              <button
                type="button"
                onClick={onReturnTitle}
                className="flex min-h-[46px] items-center justify-center rounded-xl border border-white/10 bg-slate-950 text-sm font-medium text-slate-300 hover:bg-slate-800"
              >
                Quit to Main Menu
              </button>
            </div>
          )}

          {view === 'saves' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Local Offline Storage ({snapshot.storageMode})
                </span>
                <button
                  type="button"
                  onClick={onSaveManual}
                  className="flex min-h-[40px] items-center gap-2 rounded-lg bg-teal-600 px-4 text-xs font-semibold text-white hover:bg-teal-500"
                >
                  <Save className="h-4 w-4" />
                  <span>New Save</span>
                </button>
              </div>

              {snapshot.slots.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4 text-xs text-slate-400">
                  No local save slots found yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {snapshot.slots.map((slot) => (
                    <div
                      key={slot.slotId}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3"
                    >
                      <div>
                        <div className="text-sm font-semibold text-white">{slot.label}</div>
                        <div className="text-xs text-slate-400">
                          {slot.districtName} · {new Date(slot.savedAt).toLocaleTimeString()}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteSlot(slot.slotId)}
                        aria-label={`Delete ${slot.slotId}`}
                        className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-white/10 bg-slate-800 text-rose-400 hover:bg-slate-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === 'settings' && (
            <div className="space-y-5">
              {/* Audio Mixer Section */}
              <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-300">
                    <Volume2 className="h-4 w-4" />
                    <span>Audio &amp; Soundtrack</span>
                  </div>
                  <button
                    type="button"
                    onClick={onToggleMute}
                    className={`flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold ${
                      snapshot.settings.masterMuted
                        ? 'border-rose-400/50 bg-rose-500/20 text-rose-200'
                        : 'border-white/15 bg-slate-800 text-slate-100 hover:bg-slate-700'
                    }`}
                  >
                    {snapshot.settings.masterMuted ? (
                      <VolumeX className="h-3.5 w-3.5" />
                    ) : (
                      <Volume2 className="h-3.5 w-3.5" />
                    )}
                    <span>{snapshot.settings.masterMuted ? 'Unmute' : 'Mute All'}</span>
                  </button>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <SettingsAudioSlider
                    icon={<Volume2 className="h-3.5 w-3.5 text-amber-400" />}
                    label="Master Volume"
                    value={snapshot.settings.masterVolume}
                    disabled={snapshot.settings.masterMuted}
                    onChange={(v) => onUpdateSettings({ masterVolume: v, masterMuted: v <= 0.005 })}
                  />
                  <SettingsAudioSlider
                    icon={<Music className="h-3.5 w-3.5 text-sky-400" />}
                    label="Music Volume"
                    value={snapshot.settings.musicVolume}
                    disabled={snapshot.settings.masterMuted}
                    onChange={(v) => onUpdateSettings({ musicVolume: v })}
                  />
                  <SettingsAudioSlider
                    icon={<Zap className="h-3.5 w-3.5 text-emerald-400" />}
                    label="Sound Effects"
                    value={snapshot.settings.sfxVolume}
                    disabled={snapshot.settings.masterMuted}
                    onChange={(v) => onUpdateSettings({ sfxVolume: v })}
                  />
                  <SettingsAudioSlider
                    icon={<Wind className="h-3.5 w-3.5 text-teal-300" />}
                    label="Ambience Volume"
                    value={snapshot.settings.ambientVolume}
                    disabled={snapshot.settings.masterMuted}
                    onChange={(v) => onUpdateSettings({ ambientVolume: v })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">
                  Graphics Quality
                </label>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {(['low', 'medium', 'high', 'ultra'] as GraphicsTier[]).map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => onUpdateSettings({ graphicsTier: tier })}
                      className={`min-h-[42px] rounded-lg border text-xs font-semibold capitalize ${
                        snapshot.settings.graphicsTier === tier
                          ? 'border-amber-400 bg-amber-500 text-slate-950'
                          : 'border-white/10 bg-slate-800 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>Resolution Scale Cap</span>
                    <span className="font-mono-tabular">
                      {snapshot.settings.pixelRatioCap.toFixed(2)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.75}
                    max={2}
                    step={0.25}
                    value={snapshot.settings.pixelRatioCap}
                    onChange={(e) =>
                      onUpdateSettings({ pixelRatioCap: parseFloat(e.target.value) })
                    }
                    className="mt-2 w-full accent-amber-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>Look Sensitivity</span>
                    <span className="font-mono-tabular">
                      {snapshot.settings.touchSensitivity.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={2.5}
                    step={0.1}
                    value={snapshot.settings.touchSensitivity}
                    onChange={(e) =>
                      onUpdateSettings({ touchSensitivity: parseFloat(e.target.value) })
                    }
                    className="mt-2 w-full accent-amber-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3">
                <div>
                  <div className="text-xs font-semibold text-slate-200">
                    Adaptive Rendering Resolution
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Auto-scales render density during heavy mobile frames
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSettings({
                      adaptiveResolution: !snapshot.settings.adaptiveResolution,
                    })
                  }
                  className={`min-h-[38px] min-w-[68px] rounded-lg border px-3 text-xs font-semibold ${
                    snapshot.settings.adaptiveResolution
                      ? 'border-amber-400 bg-amber-500 text-slate-950'
                      : 'border-white/15 bg-slate-800 text-slate-300'
                  }`}
                >
                  {snapshot.settings.adaptiveResolution ? 'Auto' : 'Fixed'}
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">Time of Day</label>
                <div className="mt-2 grid grid-cols-5 gap-1.5">
                  {(
                    [
                      ['dawn', 'Dawn'],
                      ['noon', 'Noon'],
                      ['golden', 'Golden'],
                      ['night', 'Night'],
                      ['cycle', 'Cycle'],
                    ] as [TimeOfDayPreset, string][]
                  ).map(([tod, label]) => (
                    <button
                      key={tod}
                      type="button"
                      onClick={() => onUpdateSettings({ timeOfDayPreset: tod })}
                      className={`min-h-[40px] rounded-lg border text-xs font-medium ${
                        snapshot.settings.timeOfDayPreset === tod
                          ? 'border-amber-400 bg-amber-500 text-slate-950'
                          : 'border-white/10 bg-slate-800 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">Language</label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(
                    [
                      ['mixed', 'Malayalam + EN'],
                      ['en', 'English'],
                      ['ml', 'മലയാളം'],
                    ] as [LanguageMode, string][]
                  ).map(([lang, label]) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => onUpdateSettings({ language: lang })}
                      className={`min-h-[42px] rounded-lg border px-2 text-xs font-medium ${
                        snapshot.settings.language === lang
                          ? 'border-amber-400 bg-amber-500 text-slate-950'
                          : 'border-white/10 bg-slate-800 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={onResetSettings}
                className="flex min-h-[40px] items-center gap-2 rounded-lg border border-white/10 bg-slate-800 px-4 text-xs font-medium text-slate-200 hover:bg-slate-700"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Reset Defaults</span>
              </button>
            </div>
          )}

          {view === 'diagnostics' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
                  <div className="text-xs text-slate-400">FPS</div>
                  <div className="font-mono-tabular mt-1 text-xl font-bold">
                    {snapshot.metrics.fps}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
                  <div className="text-xs text-slate-400">CPU p50 / p95</div>
                  <div className="font-mono-tabular mt-1 text-lg font-bold">
                    {snapshot.metrics.cpuFrameMsP50} / {snapshot.metrics.cpuFrameMsP95} ms
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
                  <div className="text-xs text-slate-400">Draw Calls / Tris</div>
                  <div className="font-mono-tabular mt-1 text-lg font-bold">
                    {snapshot.metrics.drawCalls} / {snapshot.metrics.triangles}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
                  <div className="text-xs text-slate-400">Geos / Textures</div>
                  <div className="font-mono-tabular mt-1 text-base font-semibold">
                    {snapshot.metrics.geometries} / {snapshot.metrics.textures}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
                  <div className="text-xs text-slate-400">Chunks / Regions</div>
                  <div className="font-mono-tabular mt-1 text-base font-semibold text-teal-400">
                    {snapshot.activeChunks} / {snapshot.totalRegions}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
                  <div className="text-xs text-slate-400">Audio Engine</div>
                  <div className="font-mono-tabular mt-1 text-sm font-semibold text-amber-300">
                    {snapshot.audio.unlocked ? 'ACTIVE' : 'GESTURE WAIT'} · {snapshot.audio.cachedBuffers}buf
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onToggleDebugGrid(!snapshot.showDebugGrid)}
                  className="min-h-[40px] rounded-lg border border-white/15 bg-slate-800 px-3.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
                >
                  {snapshot.showDebugGrid ? 'Hide World Grid' : 'Show World Grid'}
                </button>
                <button
                  type="button"
                  onClick={onTriggerContextLoss}
                  className="flex min-h-[40px] items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20"
                >
                  <ShieldAlert className="h-4 w-4" />
                  <span>Test WebGL Context Recovery</span>
                </button>
              </div>

              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-white/10 bg-slate-950 p-3 font-mono-tabular text-[11px]">
                {logs.slice(-20).reverse().map((entry) => (
                  <div key={entry.id}>
                    <span className="text-slate-500">[{entry.level.toUpperCase()}]</span>{' '}
                    <span className="text-slate-300">{entry.scope}:</span>{' '}
                    <span className="text-slate-100">{entry.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation & Discreet Developer Diagnostics Link */}
        <div className="flex items-center justify-between border-t border-white/10 bg-slate-950/70 px-5 py-3">
          {view !== 'pause' ? (
            <button
              type="button"
              onClick={() => setView('pause')}
              className="min-h-[38px] rounded-lg bg-slate-800 px-3.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
            >
              Back
            </button>
          ) : (
            <span className="text-xs text-slate-500">GTA Kozhikode</span>
          )}

          <button
            type="button"
            onClick={() => setView(view === 'diagnostics' ? 'pause' : 'diagnostics')}
            className="flex min-h-[38px] items-center gap-1.5 rounded-lg px-2.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <Terminal className="h-3.5 w-3.5" />
            <span>{view === 'diagnostics' ? 'Hide Diagnostics' : 'Diagnostics'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsAudioSlider({
  icon,
  label,
  value,
  disabled,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="flex justify-between text-xs text-slate-300">
        <span className="flex items-center gap-1.5">
          {icon}
          <span>{label}</span>
        </span>
        <span className="font-mono-tabular">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.02}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-1.5 w-full accent-amber-500 disabled:opacity-45"
      />
    </label>
  );
}
