import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { GameEngine } from './engine/GameEngine.ts';
import { createDefaultSettings } from './engine/persistence/IndexedDBStorage.ts';
import type { EngineHudSnapshot, GameSettings } from './engine/types.ts';
import { HudOverlay } from './ui/HudOverlay.tsx';
import { PauseDiagnosticsModal } from './ui/PauseDiagnosticsModal.tsx';
import { TitleScreen } from './ui/TitleScreen.tsx';

class EngineErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-slate-950 p-6 text-slate-100">
          <div className="max-w-md rounded-xl border border-rose-500/40 bg-slate-900 p-6">
            <h1 className="font-display text-2xl font-bold text-rose-400">
              SIMULATION RECOVERY
            </h1>
            <p className="mt-2 text-sm text-slate-300">{this.state.message}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const INITIAL_SNAPSHOT: EngineHudSnapshot = {
  mode: 'booting',
  cameraMode: 'title_orbit',
  cameraX: 22.5,
  cameraZ: 2.5,
  cameraYaw: -Math.PI * 0.35,
  playerX: 22.5,
  playerZ: 2.5,
  playerHeading: -Math.PI * 0.35,
  isMoving: false,
  isSprinting: false,
  showDebugGrid: false,
  activeSlotId: 'slot_auto_phase1',
  storageMode: 'indexeddb',
  capabilities: null,
  settings: createDefaultSettings(),
  metrics: {
    fps: 0,
    cpuFrameMsP50: 0,
    cpuFrameMsP95: 0,
    lastStepMs: 0,
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
    jsHeapMb: null,
    activeFixedSteps: 0,
  },
  slots: [],
  lastError: null,
};

function GameShell() {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [snapshot, setSnapshot] = useState<EngineHudSnapshot>(INITIAL_SNAPSHOT);
  const [modalInitialTab, setModalInitialTab] = useState<'pause' | 'settings'>('pause');
  const [showModal, setShowModal] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) {
      return;
    }

    const engine = new GameEngine();
    engineRef.current = engine;
    const unsubscribe = engine.subscribeHud((next) => {
      setSnapshot(next);
      if (next.mode === 'paused') {
        setModalInitialTab('pause');
        setShowModal(true);
      } else if (next.mode === 'playing') {
        setShowModal(false);
      }
    });

    void engine.initialize(host);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      engine.resize(entry.contentRect.width, entry.contentRect.height);
    });
    resizeObserver.observe(host);

    return () => {
      resizeObserver.disconnect();
      unsubscribe();
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.code === 'Enter' || e.code === 'Space') && snapshot.mode === 'title' && !showModal) {
        e.preventDefault();
        engineRef.current?.startPlay();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [snapshot.mode, showModal]);

  const handleManualSave = async () => {
    const saved = await engineRef.current?.saveCheckpoint('slot_manual_1', 'Mananchira Promenade');
    if (saved) {
      setSaveToast('Game Saved');
      window.setTimeout(() => setSaveToast(null), 2000);
    }
  };

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-slate-950">
      {/* Isolated WebGL canvas host */}
      <div ref={canvasHostRef} className="absolute inset-0 h-full w-full touch-none select-none" />

      {(snapshot.mode === 'booting' || (snapshot.mode === 'title' && !showModal)) && (
        <TitleScreen
          isBooting={snapshot.mode === 'booting'}
          hasSavedSlot={snapshot.slots.length > 0}
          onContinue={() => engineRef.current?.startPlay(false)}
          onNewGame={() => {
            engineRef.current?.startPlay(true);
          }}
          onOpenSettings={() => {
            setModalInitialTab('settings');
            setShowModal(true);
          }}
        />
      )}

      {(snapshot.mode === 'playing' || snapshot.mode === 'paused') && (
        <HudOverlay
          snapshot={snapshot}
          onPause={() => engineRef.current?.togglePause()}
          onVirtualMove={(x, y) => engineRef.current?.input.setVirtualAxes(x, y)}
          onSprintHold={(held) => engineRef.current?.input.triggerAction('sprint', held)}
        />
      )}

      {showModal && (
        <PauseDiagnosticsModal
          snapshot={snapshot}
          logs={engineRef.current?.getLogs() ?? []}
          initialTab={modalInitialTab}
          onClose={() => {
            if (snapshot.mode === 'paused') {
              engineRef.current?.togglePause();
            } else {
              setShowModal(false);
            }
          }}
          onResumePlay={() => {
            setShowModal(false);
            if (snapshot.mode === 'paused') {
              engineRef.current?.togglePause();
            } else {
              engineRef.current?.startPlay();
            }
          }}
          onReturnTitle={() => {
            setShowModal(false);
            engineRef.current?.returnToTitle();
          }}
          onUpdateSettings={(patch: Partial<GameSettings>) => {
            void engineRef.current?.updateSettings(patch);
          }}
          onResetSettings={() => {
            void engineRef.current?.resetSettings();
          }}
          onSaveManual={() => {
            void handleManualSave();
          }}
          onDeleteSlot={(slotId: string) => {
            void engineRef.current?.deleteSaveSlot(slotId);
          }}
          onToggleDebugGrid={(visible: boolean) => {
            engineRef.current?.setDebugGridVisible(visible);
          }}
          onTriggerContextLoss={() => {
            engineRef.current?.triggerContextLossTest();
          }}
        />
      )}

      {snapshot.mode === 'context_lost' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/90 p-6">
          <div className="max-w-sm rounded-xl border border-amber-500/40 bg-slate-900 p-5 text-center">
            <div className="font-display text-xl font-bold text-amber-400">
              RESTORING GRAPHICS CONTEXT
            </div>
            <p className="mt-2 text-xs text-slate-300">
              Rebuilding WebGL shaders and Kozhikode scene state automatically.
            </p>
          </div>
        </div>
      )}

      {snapshot.mode === 'error' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/95 p-6">
          <div className="max-w-md rounded-xl border border-rose-500/40 bg-slate-900 p-6">
            <h2 className="font-display text-2xl font-bold text-rose-400">
              WEBGL INITIALIZATION ERROR
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              {snapshot.lastError ?? 'Unable to initialize WebGL2 rendering context.'}
            </p>
          </div>
        </div>
      )}

      {saveToast && (
        <div className="pointer-events-none fixed bottom-20 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-teal-500/40 bg-slate-950/90 px-4 py-2 text-xs font-medium text-teal-300">
          {saveToast}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <EngineErrorBoundary>
      <GameShell />
    </EngineErrorBoundary>
  );
}
