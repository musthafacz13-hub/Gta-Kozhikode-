import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { createDefaultProgressionState } from './engine/delivery/LifestyleProgression.ts';
import { GameEngine } from './engine/GameEngine.ts';
import { createDefaultSettings } from './engine/persistence/IndexedDBStorage.ts';
import type { EngineHudSnapshot, GameSettings } from './engine/types.ts';
import { KOZHIKODE_GAZETTEER_PLACES } from './engine/world/KozhikodeGazetteer.ts';
import { KOZHIKODE_REGIONS } from './engine/world/KozhikodeGeography.ts';
import { DeliveryAndLifeModal } from './ui/DeliveryAndLifeModal.tsx';
import { HudOverlay } from './ui/HudOverlay.tsx';
import { LandscapeOrientationGuard } from './ui/LandscapeOrientationGuard.tsx';
import { PauseDiagnosticsModal } from './ui/PauseDiagnosticsModal.tsx';
import { TitleScreen } from './ui/TitleScreen.tsx';
import { WorldMapModal } from './ui/WorldMapModal.tsx';

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
  playerLat: 11.2544,
  playerLon: 75.78,
  playerHeading: -Math.PI * 0.35,
  isMoving: false,
  isSprinting: false,
  districtName: 'Mananchira Square',
  talukName: 'Kozhikode Taluk',
  biome: 'urban',
  clockFormatted: '17:36',
  activeChunks: 1,
  totalRegions: KOZHIKODE_REGIONS.length,
  gazetteerCount: KOZHIKODE_GAZETTEER_PLACES.length,
  nearHome: false,
  homeDistanceMeters: 141,
  nearbyBuilding: null,
  activeDestination: null,
  vehicle: null,
  delivery: {
    activeOrder: null,
    availableOrders: [],
    currentHour: 17.6,
    nearbyRestaurant: null,
    nearbyPickupReady: false,
    pickupDistanceMeters: null,
    dropoffDistanceMeters: null,
    canCollectNearby: false,
    canDeliverNearby: false,
    lastFeedback: null,
  },
  progression: createDefaultProgressionState(),
  audio: {
    unlocked: false,
    suspended: false,
    muted: false,
    masterVolume: 0.8,
    musicVolume: 0.72,
    sfxVolume: 0.85,
    ambientVolume: 0.78,
    activeMusicContext: 'menu',
    activeMusicLabel: 'Malabar Dusk Overdrive',
    activeAmbienceLabel: 'Kozhikode City Breeze',
    cachedBuffers: 0,
    positionalSources: 0,
  },
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
  const [modalInitialTab, setModalInitialTab] = useState<'pause' | 'settings' | 'controls'>('pause');
  const requestedModalTabRef = useRef<'pause' | 'settings' | 'controls' | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showWorldMap, setShowWorldMap] = useState(false);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) {
      return;
    }

    const engine = new GameEngine();
    engineRef.current = engine;
    engine.setMapToggleHandler(() => {
      setShowDeliveryModal(false);
      setShowWorldMap((prev) => !prev);
    });
    const unsubscribe = engine.subscribeHud((next) => {
      setSnapshot(next);
      if (next.mode === 'paused') {
        const nextTab = requestedModalTabRef.current ?? 'pause';
        requestedModalTabRef.current = null;
        setModalInitialTab(nextTab);
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
      engine.setMapToggleHandler(null);
      resizeObserver.disconnect();
      unsubscribe();
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setExternalModalOpen(showWorldMap || showDeliveryModal);
  }, [showWorldMap, showDeliveryModal]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.code === 'Enter' || e.code === 'Space') && snapshot.mode === 'title' && !showModal) {
        e.preventDefault();
        engineRef.current?.startPlay();
        return;
      }
      if (e.code === 'KeyM' && (snapshot.mode === 'playing' || snapshot.mode === 'paused')) {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        setShowDeliveryModal(false);
        setShowWorldMap((prev) => !prev);
        return;
      }
      if (e.code === 'KeyJ' && (snapshot.mode === 'playing' || snapshot.mode === 'paused')) {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        setShowWorldMap(false);
        setShowDeliveryModal((prev) => !prev);
        return;
      }
      if (e.code === 'Escape') {
        if (showDeliveryModal) {
          e.preventDefault();
          setShowDeliveryModal(false);
        } else if (showWorldMap) {
          e.preventDefault();
          setShowWorldMap(false);
        } else if (snapshot.mode === 'paused') {
          e.preventDefault();
          engineRef.current?.togglePause();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [snapshot.mode, showModal, showWorldMap, showDeliveryModal]);

  const handleManualSave = async () => {
    const saved = await engineRef.current?.saveCheckpoint('slot_manual_1');
    if (saved) {
      setSaveToast('Game Saved');
      window.setTimeout(() => setSaveToast(null), 2000);
    }
  };

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-slate-950">
      <LandscapeOrientationGuard />
      {/* Isolated WebGL canvas host */}
      <div ref={canvasHostRef} className="absolute inset-0 h-full w-full touch-none select-none" />

      {(snapshot.mode === 'booting' || (snapshot.mode === 'title' && !showModal)) && (
        <TitleScreen
          isBooting={snapshot.mode === 'booting'}
          hasSavedSlot={snapshot.slots.length > 0}
          settings={snapshot.settings}
          audio={snapshot.audio}
          onContinue={() => engineRef.current?.startPlay(false)}
          onNewGame={() => {
            engineRef.current?.startPlay(true);
          }}
          onOpenSettings={() => {
            setModalInitialTab('settings');
            setShowModal(true);
          }}
          onUpdateSettings={(patch: Partial<GameSettings>) => {
            void engineRef.current?.updateSettings(patch);
          }}
          onToggleMute={() => {
            engineRef.current?.toggleMute();
          }}
          onUiClick={() => {
            engineRef.current?.audio.playUiSound('ui_click');
          }}
        />
      )}

      {(snapshot.mode === 'playing' || snapshot.mode === 'paused') && !showWorldMap && !showDeliveryModal && (
        <HudOverlay
          snapshot={snapshot}
          onPause={() => {
            requestedModalTabRef.current = 'pause';
            engineRef.current?.togglePause();
          }}
          onOpenSettings={() => {
            requestedModalTabRef.current = 'controls';
            if (snapshot.mode === 'playing') {
              engineRef.current?.togglePause();
            } else {
              setModalInitialTab('controls');
              setShowModal(true);
            }
          }}
          onToggleCamera={() => engineRef.current?.toggleCameraMode()}
          onToggleMute={() => engineRef.current?.toggleMute()}
          onUpdateSettings={(patch: Partial<GameSettings>) => {
            void engineRef.current?.updateSettings(patch);
          }}
          onHomeInteract={() => engineRef.current?.playHomeDoorPreview()}
          onBuildingInteract={() => engineRef.current?.interactWithNearbyBuilding()}
          onEnterVehicle={() => engineRef.current?.tryEnterVehicle() ?? false}
          onExitVehicle={() => engineRef.current?.tryExitVehicle() ?? false}
          onVehicleControls={(patch) => engineRef.current?.input.setVehicleVirtualControls(patch)}
          onVehicleHorn={() => engineRef.current?.triggerVehicleHorn()}
          onOpenWorldMap={() => setShowWorldMap(true)}
          onOpenDeliveryBoard={() => setShowDeliveryModal(true)}
          onPickupOrder={() => engineRef.current?.pickupNearbyOrder()}
          onDeliverOrder={() => engineRef.current?.deliverNearbyOrder()}
          onClearDestination={() => engineRef.current?.clearDestinationWaypoint()}
          onUiClick={() => engineRef.current?.audio.playUiSound('ui_click')}
          onVirtualMove={(x, y) => engineRef.current?.input.setVirtualAxes(x, y)}
          onSprintHold={(held) => engineRef.current?.input.triggerAction('sprint', held)}
          onJumpTap={() => {
            engineRef.current?.input.triggerAction('jump', true);
            engineRef.current?.input.triggerAction('jump', false);
          }}
        />
      )}

      {showDeliveryModal && (
        <DeliveryAndLifeModal
          snapshot={snapshot}
          onClose={() => setShowDeliveryModal(false)}
          onRefreshOrders={() => engineRef.current?.refreshDeliveryOrders()}
          onAcceptOrder={(id) =>
            engineRef.current?.acceptDeliveryOrder(id) ?? { ok: false, reason: 'Unavailable' }
          }
          onPickupOrder={() =>
            engineRef.current?.pickupNearbyOrder() ?? { ok: false, reason: 'Unavailable' }
          }
          onDeliverOrder={() =>
            engineRef.current?.deliverNearbyOrder() ?? { ok: false, reason: 'Unavailable' }
          }
          onCancelOrder={() => engineRef.current?.cancelActiveOrder()}
          onNavigateRestaurant={(id) => engineRef.current?.navigateToRestaurant(id)}
          onPurchaseUpgrade={(id) =>
            engineRef.current?.purchaseLifestyleUpgrade(id) ?? { ok: false, reason: 'Unavailable' }
          }
          onPurchaseVehicle={(id) =>
            engineRef.current?.purchaseOwnedVehicle(id) ?? { ok: false, reason: 'Unavailable' }
          }
          onSummonVehicle={(id) =>
            engineRef.current?.summonOwnedVehicle(id) ?? { ok: false, reason: 'Unavailable' }
          }
          onToggleDeliveryBag={(eq) => engineRef.current?.toggleDeliveryBag(eq)}
          onUiClick={() => engineRef.current?.audio.playUiSound('ui_click')}
        />
      )}

      {showWorldMap && (
        <WorldMapModal
          snapshot={snapshot}
          onClose={() => setShowWorldMap(false)}
          onTravelToWorld={(x, z, heading) => {
            setShowWorldMap(false);
            engineRef.current?.travelToWorldPoint(x, z, heading);
          }}
          onSetDestination={(dest) => engineRef.current?.setDestinationWaypoint(dest)}
          onClearDestination={() => engineRef.current?.clearDestinationWaypoint()}
          onOpenDeliveryBoard={() => setShowDeliveryModal(true)}
          onUiClick={() => engineRef.current?.audio.playUiSound('ui_click')}
        />
      )}

      {showModal && !showWorldMap && !showDeliveryModal && (
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
          onOpenMap={() => {
            setShowWorldMap(true);
          }}
          onReturnTitle={() => {
            setShowModal(false);
            engineRef.current?.returnToTitle();
          }}
          onTravelHome={() => {
            setShowModal(false);
            engineRef.current?.travelToWestHillHome();
          }}
          onTravelMananchira={() => {
            setShowModal(false);
            engineRef.current?.travelToMananchira();
          }}
          onToggleMute={() => engineRef.current?.toggleMute()}
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
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  useEffect(() => {
    const handleQuotaExceeded = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
  }, []);

  return (
    <>
      {quotaExceeded && (
        <div
          role="alert"
          className="sticky top-0 z-50 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm"
        >
          <p className="font-semibold">Shared Demo Key Quota Exceeded</p>
          <p className="mt-1">
            The free shared Google Maps Demo API key has reached its daily quota limit. To restore full
            map features immediately, please connect your own Google Cloud project with billing enabled or
            try again tomorrow.
          </p>
        </div>
      )}
      <EngineErrorBoundary>
        <GameShell />
      </EngineErrorBoundary>
    </>
  );
}
