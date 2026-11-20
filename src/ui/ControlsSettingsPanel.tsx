import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import type { ThirdPersonCameraPreset } from '../engine/camera/CameraManager.ts';
import type { ControlLayoutMode, GameSettings } from '../engine/types.ts';

interface ControlsSettingsPanelProps {
  settings: GameSettings;
  onUpdateSettings: (patch: Partial<GameSettings>) => void;
}

export function ControlsSettingsPanel({
  settings,
  onUpdateSettings,
}: ControlsSettingsPanelProps) {
  const offsets = settings.controlOffsets;

  return (
    <div className="space-y-4">
      {/* Camera Behavior Section */}
      <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">
            Camera
          </span>
          <span className="font-mono-tabular text-[11px] text-slate-400">
            Preset: {settings.cameraPreset.toUpperCase()}
          </span>
        </div>

        <div className="mt-2.5 grid grid-cols-3 gap-2">
          {(['close', 'standard', 'wide'] as ThirdPersonCameraPreset[]).map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onUpdateSettings({ cameraPreset: preset })}
              className={`min-h-[38px] rounded-lg border text-xs font-semibold capitalize ${
                settings.cameraPreset === preset
                  ? 'border-amber-400 bg-amber-500 text-slate-950'
                  : 'border-white/10 bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              {preset}
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <ControlRangeSlider
            label="Camera Sensitivity"
            display={`${settings.cameraSensitivity.toFixed(2)}x`}
            min={0.25}
            max={3.0}
            step={0.05}
            value={settings.cameraSensitivity}
            onChange={(v) =>
              onUpdateSettings({ cameraSensitivity: v, touchSensitivity: v })
            }
          />
          <ControlRangeSlider
            label="Camera Distance"
            display={`${Math.round(settings.cameraDistanceScale * 100)}%`}
            min={0.7}
            max={1.4}
            step={0.05}
            value={settings.cameraDistanceScale}
            onChange={(v) => onUpdateSettings({ cameraDistanceScale: v })}
          />
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
          <div>
            <div className="text-xs font-semibold text-slate-200">Desktop Mouse Pointer Lock</div>
            <div className="text-[11px] text-slate-400">
              Lock cursor on canvas click during play; automatically releases on pause
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              onUpdateSettings({ desktopPointerLock: !settings.desktopPointerLock })
            }
            className={`min-h-[36px] min-w-[64px] rounded-lg border px-3 text-xs font-semibold ${
              settings.desktopPointerLock
                ? 'border-amber-400 bg-amber-500 text-slate-950'
                : 'border-white/15 bg-slate-800 text-slate-300'
            }`}
          >
            {settings.desktopPointerLock ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      {/* Mobile Joystick & Control Layout Customization Foundation */}
      <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-300">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Touch Controls &amp; Layout Foundation</span>
          </span>
          <button
            type="button"
            onClick={() =>
              onUpdateSettings({
                controlLayout: 'standard',
                joystickSize: 1.0,
                actionButtonSize: 1.0,
                joystickSensitivity: 1.0,
                joystickDeadzone: 0.08,
                controlOffsets: {
                  joystickX: 0,
                  joystickY: 0,
                  actionsX: 0,
                  actionsY: 0,
                },
              })
            }
            className="flex items-center gap-1 rounded border border-white/15 bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-700"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset Layout</span>
          </button>
        </div>

        <div className="mt-2.5 grid grid-cols-3 gap-2">
          {(
            [
              ['standard', 'Standard'],
              ['compact', 'Compact'],
              ['left_handed', 'Left-Handed'],
            ] as [ControlLayoutMode, string][]
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => onUpdateSettings({ controlLayout: mode })}
              className={`min-h-[38px] rounded-lg border px-2 text-xs font-semibold ${
                settings.controlLayout === mode
                  ? 'border-amber-400 bg-amber-500 text-slate-950'
                  : 'border-white/10 bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <ControlRangeSlider
            label="Joystick Sensitivity"
            display={`${settings.joystickSensitivity.toFixed(2)}x`}
            min={0.5}
            max={1.6}
            step={0.05}
            value={settings.joystickSensitivity}
            onChange={(v) => onUpdateSettings({ joystickSensitivity: v })}
          />
          <ControlRangeSlider
            label="Joystick Dead-Zone"
            display={`${Math.round(settings.joystickDeadzone * 100)}%`}
            min={0.02}
            max={0.25}
            step={0.01}
            value={settings.joystickDeadzone}
            onChange={(v) => onUpdateSettings({ joystickDeadzone: v })}
          />
          <ControlRangeSlider
            label="Joystick Size"
            display={`${Math.round(settings.joystickSize * 100)}%`}
            min={0.75}
            max={1.35}
            step={0.05}
            value={settings.joystickSize}
            onChange={(v) => onUpdateSettings({ joystickSize: v })}
          />
          <ControlRangeSlider
            label="Action Button Size"
            display={`${Math.round(settings.actionButtonSize * 100)}%`}
            min={0.8}
            max={1.35}
            step={0.05}
            value={settings.actionButtonSize}
            onChange={(v) => onUpdateSettings({ actionButtonSize: v })}
          />
          <ControlRangeSlider
            label="Joystick Horizontal Offset"
            display={`${offsets.joystickX}px`}
            min={-48}
            max={48}
            step={4}
            value={offsets.joystickX}
            onChange={(v) =>
              onUpdateSettings({
                controlOffsets: { ...offsets, joystickX: v },
              })
            }
          />
          <ControlRangeSlider
            label="Action Pad Horizontal Offset"
            display={`${offsets.actionsX}px`}
            min={-48}
            max={48}
            step={4}
            value={offsets.actionsX}
            onChange={(v) =>
              onUpdateSettings({
                controlOffsets: { ...offsets, actionsX: v },
              })
            }
          />
        </div>
      </div>

      {/* Accessibility & HUD Visibility */}
      <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-amber-300">
          Accessibility &amp; HUD Display
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <ControlRangeSlider
            label="HUD Scale"
            display={`${Math.round(settings.hudScale * 100)}%`}
            min={0.75}
            max={1.35}
            step={0.05}
            value={settings.hudScale}
            onChange={(v) => onUpdateSettings({ hudScale: v })}
          />
          <ControlRangeSlider
            label="Control Opacity"
            display={`${Math.round(settings.hudOpacity * 100)}%`}
            min={0.35}
            max={1.0}
            step={0.05}
            value={settings.hudOpacity}
            onChange={(v) => onUpdateSettings({ hudOpacity: v })}
          />
          <ControlRangeSlider
            label="Camera Motion Comfort"
            display={`${Math.round(settings.motionSensitivity * 100)}%`}
            min={0.3}
            max={1.0}
            step={0.05}
            value={settings.motionSensitivity}
            onChange={(v) => onUpdateSettings({ motionSensitivity: v })}
          />
        </div>
      </div>

      {/* Desktop Keyboard & Touch Reference */}
      <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4 text-xs text-slate-300">
        <div className="font-semibold uppercase tracking-wider text-amber-300">
          Desktop &amp; Touch Bindings
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
          <div><span className="font-mono-tabular font-bold text-white">W/A/S/D</span> · Move</div>
          <div><span className="font-mono-tabular font-bold text-white">Shift</span> · Sprint</div>
          <div><span className="font-mono-tabular font-bold text-white">Space</span> · Jump</div>
          <div><span className="font-mono-tabular font-bold text-white">E</span> · Interact</div>
          <div><span className="font-mono-tabular font-bold text-white">V</span> · Camera View</div>
          <div><span className="font-mono-tabular font-bold text-white">M</span> · World Map</div>
          <div><span className="font-mono-tabular font-bold text-white">Alt / C</span> · Walk</div>
          <div><span className="font-mono-tabular font-bold text-white">Esc</span> · Pause</div>
          <div><span className="font-mono-tabular font-bold text-white">Mouse / Right</span> · Look</div>
        </div>
      </div>
    </div>
  );
}

function ControlRangeSlider({
  label,
  display,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  display: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <div className="flex justify-between text-xs text-slate-300">
        <span>{label}</span>
        <span className="font-mono-tabular text-slate-200">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-1.5 w-full accent-amber-500"
      />
    </label>
  );
}
