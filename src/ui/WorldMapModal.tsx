import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AdvancedMarker,
  APIProvider,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Compass,
  Globe,
  Home,
  Layers,
  LocateFixed,
  MapPin,
  Minus,
  Navigation,
  Plus,
  Route as RouteIcon,
  Search,
  Sparkles,
  Trees,
  Waves,
  X,
} from 'lucide-react';
import type { EngineHudSnapshot } from '../engine/types.ts';
import {
  geoToWorld,
  KOZHIKODE_COASTLINE_WORLD,
  worldDistanceToRealKm,
  worldToGeo,
} from '../engine/world/GeoProjection.ts';
import {
  KOZHIKODE_GAZETTEER_PLACES,
  KOZHIKODE_GRAM_PANCHAYATS,
  KOZHIKODE_RIVERS,
  KOZHIKODE_TALUKS,
  KOZHIKODE_URBAN_LOCAL_BODIES,
  searchGazetteer,
  type GazetteerCategory,
  type GazetteerPlace,
  type GramPanchayatEntry,
} from '../engine/world/KozhikodeGazetteer.ts';
import { PROTAGONIST_HOME_COORDS } from '../engine/world/KozhikodeGeography.ts';
import {
  findRoadRoute,
  KOZHIKODE_ROAD_NETWORK,
} from '../engine/world/RoadNetworkGraph.ts';

interface WorldMapModalProps {
  snapshot: EngineHudSnapshot;
  onClose: () => void;
  onTravelToWorld: (x: number, z: number, heading?: number) => void;
  onSetDestination: (dest: {
    id: string;
    name: string;
    malayalamName?: string;
    worldX: number;
    worldZ: number;
    lat: number;
    lon: number;
    source: 'gazetteer' | 'google_places';
  }) => void;
  onClearDestination: () => void;
  onUiClick: () => void;
}

type MapTabMode = 'district_vector' | 'google_maps';
type ZoomTierLabel = 'District' | 'Regional' | 'City' | 'Street';

interface SelectedMapTarget {
  id: string;
  name: string;
  malayalamName?: string;
  subtitle: string;
  description: string;
  lat: number;
  lon: number;
  worldX: number;
  worldZ: number;
  accuracyLabel: string;
  source: 'gazetteer' | 'google_places';
}

interface GooglePlaceChoice {
  id: string;
  displayName: string;
  formattedAddress: string;
  lat: number;
  lng: number;
}

function resolveGoogleMapsApiKey(): string {
  const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const fromVite = viteEnv?.VITE_GOOGLE_MAPS_API_KEY;
  const fromProcess =
    typeof process !== 'undefined' && process.env ? process.env.GOOGLE_MAPS_API_KEY : undefined;
  return (fromVite || fromProcess || '').trim();
}

function reportIfQuotaError(err: unknown): void {
  const msg = String(err ?? '');
  if (/RESOURCE_EXHAUSTED|OVER_QUERY_LIMIT|QuotaExceeded|429/i.test(msg)) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('gmp-quota-exceeded'));
    }
  }
}

function getZoomTierFromScale(scale: number): ZoomTierLabel {
  if (scale < 0.14) return 'District';
  if (scale < 0.38) return 'Regional';
  if (scale < 1.1) return 'City';
  return 'Street';
}

function getMaxZoomTierVisible(scale: number): 1 | 2 | 3 | 4 {
  if (scale < 0.14) return 1;
  if (scale < 0.38) return 2;
  if (scale < 1.1) return 3;
  return 4;
}

function placeToTarget(place: GazetteerPlace): SelectedMapTarget {
  const taluk = KOZHIKODE_TALUKS.find((t) => t.id === place.talukId)?.name ?? place.talukId;
  return {
    id: place.id,
    name: place.name,
    malayalamName: place.malayalamName,
    subtitle: `${place.adminUnit} · ${taluk}`,
    description: place.description,
    lat: place.lat,
    lon: place.lon,
    worldX: place.worldX,
    worldZ: place.worldZ,
    accuracyLabel:
      place.dataAccuracy === 'verified_geo' ? 'Verified GIS Coords' : 'Approximate Block Center',
    source: 'gazetteer',
  };
}

function gramPanchayatToTarget(gp: GramPanchayatEntry): SelectedMapTarget {
  const world = geoToWorld(gp.approxLat, gp.approxLon);
  const taluk = KOZHIKODE_TALUKS.find((t) => t.id === gp.talukId)?.name ?? gp.talukId;
  return {
    id: gp.id,
    name: `${gp.name} Gram Panchayat`,
    subtitle: `${gp.blockName} Block · ${taluk}`,
    description: `Rural local body in ${gp.blockName} Block Panchayat, Kozhikode District.`,
    lat: gp.approxLat,
    lon: gp.approxLon,
    worldX: world.x,
    worldZ: world.z,
    accuracyLabel: 'Approx. Panchayat Center',
    source: 'gazetteer',
  };
}

interface GmpPolyline {
  setMap: (map: unknown | null) => void;
  setOptions: (opts: { strokeColor?: string; strokeOpacity?: number; strokeWeight?: number }) => void;
}

interface GmpBounds {
  east: number;
  north: number;
  south: number;
  west: number;
}

interface GmpAutocompleteSuggestion {
  placePrediction?: {
    placeId?: string;
    text: { text: string };
    toPlace: () => {
      id?: string;
      displayName?: string;
      formattedAddress?: string;
      location?: { lat: () => number; lng: () => number };
      viewport?: GmpBounds;
      fetchFields: (opts: { fields: string[] }) => Promise<void>;
    };
  };
}

function GoogleRouteOverlay({
  origin,
  destination,
  travelMode,
  onRouteComputed,
}: {
  origin: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number } | null;
  travelMode: 'DRIVING' | 'TWO_WHEELER' | 'WALKING';
  onRouteComputed: (info: { distanceKm: number; durationMin: number } | null, error?: string) => void;
}) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<GmpPolyline[]>([]);

  useEffect(() => {
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    if (!routesLib || !map || !origin || !destination) {
      onRouteComputed(null);
      return;
    }

    let cancelled = false;
    const request = {
      origin,
      destination,
      travelMode,
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
    };

    const RouteClass = routesLib.Route as unknown as {
      computeRoutes: (req: typeof request) => Promise<{
        routes?: Array<{
          distanceMeters?: number;
          durationMillis?: number;
          viewport?: GmpBounds;
          createPolylines: () => GmpPolyline[];
        }>;
      }>;
    };

    RouteClass.computeRoutes(request)
      .then((res) => {
        if (cancelled) return;
        const primaryRoute = res.routes?.[0];
        if (!primaryRoute) {
          onRouteComputed(null, 'No road route returned between selected coordinates.');
          return;
        }
        const lines = primaryRoute.createPolylines();
        lines.forEach((p) => {
          p.setOptions({
            strokeColor: '#34d399',
            strokeOpacity: 0.92,
            strokeWeight: 5,
          });
          p.setMap(map);
        });
        polylinesRef.current = lines;
        if (primaryRoute.viewport) {
          map.fitBounds(primaryRoute.viewport as unknown as Parameters<typeof map.fitBounds>[0]);
        }
        const distMeters = primaryRoute.distanceMeters ?? 0;
        const durMs = primaryRoute.durationMillis ?? 0;
        onRouteComputed({
          distanceKm: Number((distMeters / 1000).toFixed(2)),
          durationMin: Math.max(1, Math.round(durMs / 60000)),
        });
      })
      .catch((err) => {
        if (cancelled) return;
        reportIfQuotaError(err);
        onRouteComputed(null, err instanceof Error ? err.message : 'Unable to compute route.');
      });

    return () => {
      cancelled = true;
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [routesLib, map, origin, destination, travelMode, onRouteComputed]);

  return null;
}

function GooglePlaceMarker({
  place,
  onSyncToGame,
}: {
  place: GooglePlaceChoice;
  onSyncToGame: (place: GooglePlaceChoice) => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [open, setOpen] = useState(true);

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: place.lat, lng: place.lng }}
        title={place.displayName}
        onClick={() => setOpen(true)}
      >
        <Pin background="#f59e0b" borderColor="#78350f" glyphColor="#0f172a" />
      </AdvancedMarker>
      {open && marker && (
        <InfoWindow anchor={marker} maxWidth={250} onCloseClick={() => setOpen(false)}>
          <div className="p-1 text-slate-900">
            <div className="text-xs font-bold">{place.displayName}</div>
            <div className="mt-0.5 text-[11px] text-slate-600">{place.formattedAddress}</div>
            <button
              type="button"
              onClick={() => onSyncToGame(place)}
              className="mt-2 w-full rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
            >
              Set Waypoint in 3D World
            </button>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

function GooglePlacesExplorerPanel({
  snapshot,
  onSyncGooglePlace,
  onTravelGooglePlace,
}: {
  snapshot: EngineHudSnapshot;
  onSyncGooglePlace: (place: GooglePlaceChoice) => void;
  onTravelGooglePlace: (place: GooglePlaceChoice) => void;
}) {
  const map = useMap();
  const placesLib = useMapsLibrary('places');
  const sessionTokenRef = useRef<unknown | null>(null);

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<GmpAutocompleteSuggestion[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<GooglePlaceChoice | null>(null);
  const [routeOriginMode, setRouteOriginMode] = useState<'player' | 'mananchira'>('player');
  const [travelMode, setTravelMode] = useState<'DRIVING' | 'TWO_WHEELER' | 'WALKING'>('DRIVING');
  const [showRoute, setShowRoute] = useState(false);
  const [routeInfo, setRouteInfo] = useState<{ distanceKm: number; durationMin: number } | null>(
    null,
  );
  const [placesStatus, setPlacesStatus] = useState<string | null>(null);

  const resetSession = useCallback(() => {
    sessionTokenRef.current = null;
    setSuggestions([]);
  }, []);

  useEffect(() => {
    if (!placesLib) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }

    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      const PlacesSuggestionApi = placesLib.AutocompleteSuggestion as unknown as {
        fetchAutocompleteSuggestions: (req: Record<string, unknown>) => Promise<{
          suggestions?: GmpAutocompleteSuggestion[];
        }>;
      };
      PlacesSuggestionApi.fetchAutocompleteSuggestions({
        input: trimmed,
        sessionToken: sessionTokenRef.current ?? undefined,
        locationBias: { lat: 11.2544, lng: 75.78 },
        region: 'IN',
        language: 'en',
      })
        .then((res) => {
          if (!cancelled) {
            setSuggestions(res.suggestions ?? []);
            setPlacesStatus(null);
          }
        })
        .catch((err: unknown) => {
          reportIfQuotaError(err);
          if (!cancelled) {
            setPlacesStatus('Unable to load Google Places suggestions right now.');
          }
        });
    }, 240);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [placesLib, query]);

  const handleSelectSuggestion = async (suggestion: GmpAutocompleteSuggestion) => {
    if (!placesLib || !suggestion.placePrediction) return;
    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({
        fields: ['id', 'displayName', 'formattedAddress', 'location', 'viewport'],
      });
      resetSession();
      if (!place.location) return;
      const choice: GooglePlaceChoice = {
        id: place.id || `gp_${Date.now()}`,
        displayName: place.displayName || 'Kozhikode Place',
        formattedAddress: place.formattedAddress || 'Kozhikode District, Kerala',
        lat: place.location.lat(),
        lng: place.location.lng(),
      };
      setSelectedPlace(choice);
      setQuery(choice.displayName);
      setPlacesStatus(null);
      if (map) {
        if (place.viewport) {
          map.fitBounds(place.viewport as unknown as Parameters<typeof map.fitBounds>[0]);
        } else {
          map.panTo({ lat: choice.lat, lng: choice.lng });
          map.setZoom(14);
        }
      }
    } catch (err) {
      reportIfQuotaError(err);
      setPlacesStatus('Failed to fetch place details.');
    }
  };

  const handleQuickTextSearch = async (textQuery: string) => {
    if (!placesLib) return;
    setPlacesStatus(`Searching "${textQuery}"...`);
    try {
      const { places } = await placesLib.Place.searchByText({
        textQuery,
        fields: ['id', 'displayName', 'formattedAddress', 'location', 'viewport'],
        locationBias: { lat: 11.2544, lng: 75.78 },
        region: 'IN',
        language: 'en',
        maxResultCount: 5,
      });
      const first = places?.[0];
      if (!first || !first.location) {
        setPlacesStatus(`No Google Maps match for "${textQuery}".`);
        return;
      }
      const choice: GooglePlaceChoice = {
        id: first.id || `txt_${Date.now()}`,
        displayName: first.displayName || textQuery,
        formattedAddress: first.formattedAddress || 'Kozhikode, Kerala',
        lat: first.location.lat(),
        lng: first.location.lng(),
      };
      setSelectedPlace(choice);
      setQuery(choice.displayName);
      setPlacesStatus(null);
      if (map) {
        if (first.viewport) {
          map.fitBounds(first.viewport);
        } else {
          map.panTo({ lat: choice.lat, lng: choice.lng });
          map.setZoom(14);
        }
      }
    } catch (err) {
      reportIfQuotaError(err);
      setPlacesStatus('Google Places text search unavailable.');
    }
  };

  const handleRouteComputed = useCallback(
    (info: { distanceKm: number; durationMin: number } | null, error?: string) => {
      setRouteInfo(info);
      if (error) setPlacesStatus(error);
    },
    [],
  );

  const originLatLng =
    routeOriginMode === 'player'
      ? { lat: snapshot.playerLat, lng: snapshot.playerLon }
      : { lat: 11.2544, lng: 75.78 };

  const homeGeo = worldToGeo(PROTAGONIST_HOME_COORDS.houseX, PROTAGONIST_HOME_COORDS.houseZ);

  return (
    <>
      <AdvancedMarker
        position={{ lat: snapshot.playerLat, lng: snapshot.playerLon }}
        title={`Arjun (${snapshot.districtName})`}
      >
        <Pin background="#38bdf8" borderColor="#0c4a6e" glyphColor="#0f172a" />
      </AdvancedMarker>

      <AdvancedMarker position={{ lat: homeGeo.lat, lng: homeGeo.lon }} title="Arjun's Home (West Hill)">
        <Pin background="#10b981" borderColor="#064e3b" glyphColor="#ffffff" />
      </AdvancedMarker>

      {selectedPlace && (
        <GooglePlaceMarker place={selectedPlace} onSyncToGame={onSyncGooglePlace} />
      )}

      {showRoute && selectedPlace && (
        <GoogleRouteOverlay
          origin={originLatLng}
          destination={{ lat: selectedPlace.lat, lng: selectedPlace.lng }}
          travelMode={travelMode}
          onRouteComputed={handleRouteComputed}
        />
      )}

      {/* Floating Search & Kozhikode Quick Places Bar */}
      <div className="pointer-events-auto absolute left-2.5 right-2.5 top-2.5 z-10 flex flex-col gap-1.5 sm:max-w-md">
        <div className="relative flex items-center gap-1.5 rounded-xl border border-slate-700/90 bg-slate-950/92 px-3 py-2 shadow-xl backdrop-blur">
          <Search className="h-4 w-4 shrink-0 text-amber-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && query.trim().length > 1) {
                void handleQuickTextSearch(`${query.trim()} Kozhikode Kerala`);
              }
            }}
            placeholder="Search real Kozhikode places, beaches, towns..."
            className="w-full bg-transparent text-xs text-white placeholder-slate-400 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                resetSession();
              }}
              aria-label="Clear Google Maps search"
              className="rounded p-0.5 text-slate-400 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {suggestions.length > 0 && (
          <ul className="max-h-48 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950/95 p-1 shadow-2xl">
            {suggestions.map((s, idx) => (
              <li key={s.placePrediction?.placeId ?? idx}>
                <button
                  type="button"
                  onClick={() => void handleSelectSuggestion(s)}
                  className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-100 hover:bg-slate-800"
                >
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <span className="line-clamp-2">{s.placePrediction?.text.text}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-1">
          {[
            'Kappad Beach Kozhikode',
            'Beypore Port Kozhikode',
            'Vatakara Town Kerala',
            'Thamarassery Churam',
            'Kakkayam Dam Kozhikode',
          ].map((presetQuery) => (
            <button
              key={presetQuery}
              type="button"
              onClick={() => void handleQuickTextSearch(presetQuery)}
              className="rounded-lg border border-slate-700/80 bg-slate-950/85 px-2 py-1 text-[10px] font-medium text-slate-200 hover:border-amber-400/60 hover:text-amber-300"
            >
              {presetQuery.replace(' Kozhikode', '').replace(' Kerala', '')}
            </button>
          ))}
        </div>

        {placesStatus && (
          <div className="rounded-lg border border-amber-500/40 bg-slate-950/90 px-2.5 py-1 text-[11px] text-amber-200">
            {placesStatus}
          </div>
        )}
      </div>

      {/* Selected Google Place Action Card */}
      {selectedPlace && (
        <div className="pointer-events-auto absolute bottom-2.5 left-2.5 right-2.5 z-10 rounded-xl border border-slate-700 bg-slate-950/95 p-3 shadow-2xl sm:left-auto sm:w-96">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs font-bold text-white">{selectedPlace.displayName}</div>
              <div className="text-[11px] text-slate-400">{selectedPlace.formattedAddress}</div>
              <div className="mt-1 font-mono-tabular text-[10px] text-sky-300">
                {selectedPlace.lat.toFixed(5)}° N, {selectedPlace.lng.toFixed(5)}° E
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedPlace(null);
                setShowRoute(false);
                setRouteInfo(null);
              }}
              aria-label="Dismiss selected Google place"
              className="rounded p-1 text-slate-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
            <select
              aria-label="Route origin"
              value={routeOriginMode}
              onChange={(e) => setRouteOriginMode(e.target.value as 'player' | 'mananchira')}
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200"
            >
              <option value="player">From Player GPS</option>
              <option value="mananchira">From Mananchira</option>
            </select>
            <select
              aria-label="Travel mode"
              value={travelMode}
              onChange={(e) =>
                setTravelMode(e.target.value as 'DRIVING' | 'TWO_WHEELER' | 'WALKING')
              }
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200"
            >
              <option value="DRIVING">Car</option>
              <option value="TWO_WHEELER">Two-Wheeler</option>
              <option value="WALKING">Walk</option>
            </select>
            <button
              type="button"
              onClick={() => setShowRoute((prev) => !prev)}
              className={`rounded px-2.5 py-1 font-semibold ${
                showRoute
                  ? 'bg-emerald-500 text-slate-950'
                  : 'border border-emerald-400/50 bg-emerald-500/15 text-emerald-200'
              }`}
            >
              {showRoute ? 'Hide Live Route' : 'Compute Real Route'}
            </button>
          </div>

          {routeInfo && (
            <div className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-2.5 py-1 text-[11px] text-emerald-200">
              Real Road Route: <strong>{routeInfo.distanceKm} km</strong> · approx{' '}
              <strong>{routeInfo.durationMin} min</strong>
            </div>
          )}

          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onSyncGooglePlace(selectedPlace)}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400"
            >
              <Navigation className="h-3.5 w-3.5" />
              Sync to 3D HUD
            </button>
            <button
              type="button"
              onClick={() => onTravelGooglePlace(selectedPlace)}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-sky-400/50 bg-sky-500/20 px-3 py-2 text-xs font-semibold text-sky-100 hover:bg-sky-500/30"
            >
              <Compass className="h-3.5 w-3.5" />
              Fast Travel Here
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function WorldMapModal({
  snapshot,
  onClose,
  onTravelToWorld,
  onSetDestination,
  onClearDestination,
  onUiClick,
}: WorldMapModalProps) {
  const [activeTab, setActiveTab] = useState<MapTabMode>('district_vector');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<GazetteerCategory | 'all'>('all');
  const [showHighways, setShowHighways] = useState(true);
  const [showRivers, setShowRivers] = useState(true);
  const [showPanchayatCount, setShowPanchayatCount] = useState(false);

  // Interactive District Canvas Camera State (scale = pixels per 3D world unit)
  const [viewCenter, setViewCenter] = useState<{ x: number; z: number }>({
    x: snapshot.playerX,
    z: snapshot.playerZ,
  });
  const [scale, setScale] = useState<number>(0.18);
  const [selectedTarget, setSelectedTarget] = useState<SelectedMapTarget>(() => {
    const initialPlace =
      KOZHIKODE_GAZETTEER_PLACES.find((p) => p.id === 'kappad') ?? KOZHIKODE_GAZETTEER_PLACES[0];
    return placeToTarget(initialPlace);
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerPointsRef = useRef<Record<number, { x: number; y: number }>>({});
  const dragStartRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const lastPinchDistRef = useRef<number | null>(null);

  const googleMapsApiKey = resolveGoogleMapsApiKey();
  const zoomTierLabel = getZoomTierFromScale(scale);

  const searchResults = useMemo(
    () => searchGazetteer(searchQuery, categoryFilter),
    [searchQuery, categoryFilter],
  );

  const computedRoute = useMemo(() => {
    return findRoadRoute(
      snapshot.playerX,
      snapshot.playerZ,
      selectedTarget.worldX,
      selectedTarget.worldZ,
    );
  }, [snapshot.playerX, snapshot.playerZ, selectedTarget.worldX, selectedTarget.worldZ]);

  const clampScale = (next: number) => Math.max(0.055, Math.min(2.6, next));

  const recenterOnPlayer = () => {
    onUiClick();
    setViewCenter({ x: snapshot.playerX, z: snapshot.playerZ });
    setScale(0.28);
  };

  const selectZoomPreset = (preset: ZoomTierLabel) => {
    onUiClick();
    if (preset === 'District') {
      setViewCenter({ x: -100, z: -1700 });
      setScale(0.085);
    } else if (preset === 'Regional') {
      setScale(0.24);
    } else if (preset === 'City') {
      setScale(0.62);
    } else {
      setScale(1.45);
    }
  };

  // Draw District Vector Map
  useEffect(() => {
    if (activeTab !== 'district_vector') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    const toScreenX = (wx: number) => cx + (wx - viewCenter.x) * scale;
    const toScreenY = (wz: number) => cy + (wz - viewCenter.z) * scale;

    ctx.clearRect(0, 0, w, h);

    // 1. Base Midland / Interior Terrain
    const landGrad = ctx.createLinearGradient(0, 0, w, 0);
    landGrad.addColorStop(0, '#16241b');
    landGrad.addColorStop(0.65, '#192b1e');
    landGrad.addColorStop(1, '#1f3622');
    ctx.fillStyle = landGrad;
    ctx.fillRect(0, 0, w, h);

    // Highland Western Ghats eastern belt shading (x > 1100 in district coordinates)
    const ghatStartX = toScreenX(1150);
    if (ghatStartX < w) {
      ctx.fillStyle = 'rgba(20, 83, 45, 0.36)';
      ctx.fillRect(Math.max(0, ghatStartX), 0, w - Math.max(0, ghatStartX), h);
    }

    // 2. Arabian Sea & Coastal Shoreline Strip from GeoProjection
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let i = 0; i < KOZHIKODE_COASTLINE_WORLD.length; i++) {
      const pt = KOZHIKODE_COASTLINE_WORLD[i];
      ctx.lineTo(toScreenX(pt.x), toScreenY(pt.z));
    }
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = '#0c4a6e';
    ctx.fill();

    // Coastal sand ribbon
    ctx.beginPath();
    for (let i = 0; i < KOZHIKODE_COASTLINE_WORLD.length; i++) {
      const pt = KOZHIKODE_COASTLINE_WORLD[i];
      if (i === 0) ctx.moveTo(toScreenX(pt.x), toScreenY(pt.z));
      else ctx.lineTo(toScreenX(pt.x), toScreenY(pt.z));
    }
    ctx.strokeStyle = '#c2a676';
    ctx.lineWidth = Math.max(2, 16 * scale);
    ctx.stroke();

    // Subtle 5km coordinate grid
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
    ctx.lineWidth = 1;
    const step = 500;
    for (let gx = -3000; gx <= 3500; gx += step) {
      const sx = toScreenX(gx);
      if (sx >= 0 && sx <= w) {
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, h);
        ctx.stroke();
      }
    }
    for (let gz = -5500; gz <= 1500; gz += step) {
      const sy = toScreenY(gz);
      if (sy >= 0 && sy <= h) {
        ctx.beginPath();
        ctx.moveTo(0, sy);
        ctx.lineTo(w, sy);
        ctx.stroke();
      }
    }

    // 3. Major Kozhikode Rivers (Korapuzha, Kallai, Chaliyar, Kuttiady)
    if (showRivers) {
      for (const river of KOZHIKODE_RIVERS) {
        ctx.beginPath();
        river.pathGeo.forEach(([lat, lon], idx) => {
          const wp = geoToWorld(lat, lon);
          if (idx === 0) ctx.moveTo(toScreenX(wp.x), toScreenY(wp.z));
          else ctx.lineTo(toScreenX(wp.x), toScreenY(wp.z));
        });
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = Math.max(2.2, river.widthWorld * scale * 0.25);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();

        const midPt = river.pathGeo[Math.floor(river.pathGeo.length / 2)];
        const mWorld = geoToWorld(midPt[0], midPt[1]);
        const msx = toScreenX(mWorld.x);
        const msy = toScreenY(mWorld.z);
        if (msx > 20 && msx < w - 20 && msy > 20 && msy < h - 20) {
          ctx.fillStyle = '#7dd3fc';
          ctx.font = '600 10px sans-serif';
          ctx.fillText(river.name, msx + 4, msy - 4);
        }
      }
    }

    // 4. Connected District Road Network (NH-66, NH-766, SH-34, SH-38, Ghat, City Streets)
    if (showHighways) {
      for (const edge of KOZHIKODE_ROAD_NETWORK.edges) {
        const a = KOZHIKODE_ROAD_NETWORK.nodes.get(edge.from);
        const b = KOZHIKODE_ROAD_NETWORK.nodes.get(edge.to);
        if (!a || !b) continue;
        const ax = toScreenX(a.x);
        const ay = toScreenY(a.z);
        const bx = toScreenX(b.x);
        const by = toScreenY(b.z);
        if (
          Math.max(ax, bx) < -20 ||
          Math.min(ax, bx) > w + 20 ||
          Math.max(ay, by) < -20 ||
          Math.min(ay, by) > h + 20
        ) {
          continue;
        }

        if (edge.highwayClass === 'street' && scale < 0.25) continue;

        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        if (edge.highwayClass === 'NH') {
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = Math.max(2.2, 7 * scale);
        } else if (edge.highwayClass === 'ghat') {
          ctx.strokeStyle = '#fb923c';
          ctx.lineWidth = Math.max(2, 6 * scale);
        } else if (edge.highwayClass === 'SH') {
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = Math.max(1.6, 5 * scale);
        } else if (edge.highwayClass === 'coastal') {
          ctx.strokeStyle = '#2dd4bf';
          ctx.lineWidth = Math.max(1.5, 4.5 * scale);
        } else {
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = Math.max(1, 3.5 * scale);
        }
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }

    // 5. Preview Route & Active HUD Route
    const drawRoutePath = (points: Array<{ x: number; z: number }>, color: string, dashed: boolean) => {
      if (points.length < 2) return;
      ctx.save();
      ctx.beginPath();
      points.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(toScreenX(pt.x), toScreenY(pt.z));
        else ctx.lineTo(toScreenX(pt.x), toScreenY(pt.z));
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 3.2;
      if (dashed) ctx.setLineDash([7, 5]);
      ctx.stroke();
      ctx.restore();
    };

    if (snapshot.activeDestination?.routeWaypoints) {
      drawRoutePath(snapshot.activeDestination.routeWaypoints, '#34d399', false);
    }
    if (computedRoute?.waypoints) {
      drawRoutePath(computedRoute.waypoints, '#fde047', true);
    }

    // 6. Progressive Zoom-Filtered Kozhikode Settlements & Landmarks
    const maxTier = getMaxZoomTierVisible(scale);
    for (const place of KOZHIKODE_GAZETTEER_PLACES) {
      const isSelected = selectedTarget.id === place.id;
      const isDest = snapshot.activeDestination?.id === place.id;
      if (place.zoomTier > maxTier && !isSelected && !isDest) continue;

      const sx = toScreenX(place.worldX);
      const sy = toScreenY(place.worldZ);
      if (sx < -30 || sx > w + 30 || sy < -30 || sy > h + 30) continue;

      let dotColor = '#e2e8f0';
      if (place.category === 'beach' || place.category === 'harbour') dotColor = '#2dd4bf';
      else if (place.category === 'hill_ghat' || place.category === 'waterfall_dam')
        dotColor = '#4ade80';
      else if (place.category === 'town' || place.category === 'city_center' || place.category === 'landmark')
        dotColor = '#fbbf24';
      else if (place.category === 'river_bridge') dotColor = '#38bdf8';

      ctx.beginPath();
      ctx.arc(sx, sy, isSelected ? 6.5 : place.zoomTier === 1 ? 4.8 : 3.4, 0, Math.PI * 2);
      ctx.fillStyle = isDest ? '#34d399' : dotColor;
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#ffffff' : '#0f172a';
      ctx.lineWidth = isSelected ? 2.2 : 1.2;
      ctx.stroke();

      if (isSelected || place.zoomTier <= Math.max(1, maxTier - 1) || scale >= 0.35) {
        ctx.fillStyle = isSelected ? '#fef08a' : '#f8fafc';
        ctx.font = isSelected ? 'bold 11px sans-serif' : '600 10px sans-serif';
        ctx.fillText(place.name, sx + 8, sy + 3);
      }
    }

    // 7. Protagonist Home Marker (West Hill)
    const homeSx = toScreenX(PROTAGONIST_HOME_COORDS.houseX);
    const homeSy = toScreenY(PROTAGONIST_HOME_COORDS.houseZ);
    ctx.beginPath();
    ctx.arc(homeSx, homeSy, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#10b981';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 8. Active HUD Destination Beacon
    if (snapshot.activeDestination) {
      const dx = toScreenX(snapshot.activeDestination.worldX);
      const dy = toScreenY(snapshot.activeDestination.worldZ);
      ctx.beginPath();
      ctx.arc(dx, dy, 8, 0, Math.PI * 2);
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 2.4;
      ctx.stroke();
    }

    // 9. Player Arrow
    const px = toScreenX(snapshot.playerX);
    const py = toScreenY(snapshot.playerZ);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.PI - snapshot.playerHeading);
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6.5, 7);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(-6.5, 7);
    ctx.closePath();
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
  }, [
    activeTab,
    viewCenter,
    scale,
    showHighways,
    showRivers,
    snapshot.playerX,
    snapshot.playerZ,
    snapshot.playerHeading,
    snapshot.activeDestination,
    selectedTarget,
    computedRoute,
  ]);

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointerPointsRef.current[e.pointerId] = { x: e.clientX, y: e.clientY };
    const ids = Object.keys(pointerPointsRef.current);
    if (ids.length === 1) {
      dragStartRef.current = { x: e.clientX, y: e.clientY, moved: false };
      lastPinchDistRef.current = null;
    } else if (ids.length === 2) {
      const p1 = pointerPointsRef.current[Number(ids[0])];
      const p2 = pointerPointsRef.current[Number(ids[1])];
      lastPinchDistRef.current = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      dragStartRef.current = null;
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const prev = pointerPointsRef.current[e.pointerId];
    if (!prev) return;
    pointerPointsRef.current[e.pointerId] = { x: e.clientX, y: e.clientY };
    const ids = Object.keys(pointerPointsRef.current);

    if (ids.length >= 2) {
      const p1 = pointerPointsRef.current[Number(ids[0])];
      const p2 = pointerPointsRef.current[Number(ids[1])];
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (lastPinchDistRef.current && lastPinchDistRef.current > 0) {
        const factor = dist / lastPinchDistRef.current;
        setScale((s) => clampScale(s * factor));
      }
      lastPinchDistRef.current = dist;
      return;
    }

    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    if (dragStartRef.current && Math.hypot(e.clientX - dragStartRef.current.x, e.clientY - dragStartRef.current.y) > 5) {
      dragStartRef.current.moved = true;
    }
    setViewCenter((c) => ({
      x: c.x - dx / scale,
      z: c.z - dy / scale,
    }));
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const wasTap = dragStartRef.current && !dragStartRef.current.moved;
    delete pointerPointsRef.current[e.pointerId];
    lastPinchDistRef.current = null;

    if (wasTap && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const sx = ((e.clientX - rect.left) / Math.max(1, rect.width)) * canvasRef.current.width;
      const sy = ((e.clientY - rect.top) / Math.max(1, rect.height)) * canvasRef.current.height;
      const worldX = viewCenter.x + (sx - canvasRef.current.width / 2) / scale;
      const worldZ = viewCenter.z + (sy - canvasRef.current.height / 2) / scale;

      let closest: GazetteerPlace | null = null;
      let bestScreenDist = 26;
      for (const place of KOZHIKODE_GAZETTEER_PLACES) {
        const px = canvasRef.current.width / 2 + (place.worldX - viewCenter.x) * scale;
        const py = canvasRef.current.height / 2 + (place.worldZ - viewCenter.z) * scale;
        const sd = Math.hypot(px - sx, py - sy);
        if (sd < bestScreenDist) {
          bestScreenDist = sd;
          closest = place;
        }
      }
      if (closest) {
        onUiClick();
        setSelectedTarget(placeToTarget(closest));
      } else {
        const geo = worldToGeo(worldX, worldZ);
        onUiClick();
        setSelectedTarget({
          id: `pin_${Math.round(worldX)}_${Math.round(worldZ)}`,
          name: 'Custom District Pin',
          subtitle: 'Kozhikode District Open World',
          description: 'Custom dropped navigation pin projected in WGS84 conformal space.',
          lat: Number(geo.lat.toFixed(5)),
          lon: Number(geo.lon.toFixed(5)),
          worldX,
          worldZ,
          accuracyLabel: 'Custom Map Pin',
          source: 'gazetteer',
        });
      }
    }
    dragStartRef.current = null;
  };

  const handleSyncGooglePlace = (choice: GooglePlaceChoice) => {
    const world = geoToWorld(choice.lat, choice.lng);
    onSetDestination({
      id: choice.id,
      name: choice.displayName,
      worldX: world.x,
      worldZ: world.z,
      lat: choice.lat,
      lon: choice.lng,
      source: 'google_places',
    });
    setSelectedTarget({
      id: choice.id,
      name: choice.displayName,
      subtitle: choice.formattedAddress,
      description: 'Synchronized from Google Maps Places API into the 3D Kozhikode open world.',
      lat: choice.lat,
      lon: choice.lng,
      worldX: world.x,
      worldZ: world.z,
      accuracyLabel: 'Google Maps Coordinates',
      source: 'google_places',
    });
  };

  const handleTravelGooglePlace = (choice: GooglePlaceChoice) => {
    const world = geoToWorld(choice.lat, choice.lng);
    onTravelToWorld(world.x, world.z, 0);
    onClose();
  };

  const selectedDistMeters = Math.round(
    Math.hypot(selectedTarget.worldX - snapshot.playerX, selectedTarget.worldZ - snapshot.playerZ),
  );
  const selectedRealKm = computedRoute
    ? computedRoute.realDistanceKm
    : Number(worldDistanceToRealKm(selectedDistMeters).toFixed(2));

  return (
    <div
      role="dialog"
      aria-label="Kozhikode Interactive World Map"
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/90 p-2 sm:p-4"
    >
      <div className="flex h-full max-h-[94dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/20 bg-slate-900 shadow-2xl">
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-slate-950/90 px-3 py-2.5 sm:px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold tracking-wide text-white sm:text-lg">
                KOZHIKODE DISTRICT WORLD MAP
              </h2>
              <p className="font-mono-tabular text-[11px] text-slate-400">
                {snapshot.districtName} · {snapshot.talukName} · {snapshot.playerLat.toFixed(4)}°N,{' '}
                {snapshot.playerLon.toFixed(4)}°E
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                onUiClick();
                setActiveTab('district_vector');
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                activeTab === 'district_vector'
                  ? 'bg-amber-500 text-slate-950'
                  : 'border border-white/15 bg-slate-900 text-slate-200 hover:bg-slate-800'
              }`}
            >
              District Map (Offline)
            </button>
            <button
              type="button"
              onClick={() => {
                onUiClick();
                setActiveTab('google_maps');
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                activeTab === 'google_maps'
                  ? 'bg-sky-400 text-slate-950'
                  : 'border border-white/15 bg-slate-900 text-slate-200 hover:bg-slate-800'
              }`}
            >
              Google Maps · Live
            </button>
            <button
              type="button"
              onClick={() => {
                onUiClick();
                onClose();
              }}
              aria-label="Close World Map"
              className="ml-1 flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-slate-800 text-slate-200 hover:bg-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Main Content Body */}
        {activeTab === 'district_vector' ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_340px]">
            {/* Interactive Canvas Viewport */}
            <div className="relative flex min-h-[300px] flex-1 flex-col overflow-hidden bg-slate-950">
              <canvas
                ref={canvasRef}
                width={960}
                height={620}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onPointerCancel={handleCanvasPointerUp}
                onWheel={(e) => {
                  e.preventDefault();
                  const factor = e.deltaY < 0 ? 1.14 : 0.88;
                  setScale((s) => clampScale(s * factor));
                }}
                aria-label="Interactive Kozhikode District Vector Canvas"
                className="h-full w-full touch-none select-none cursor-grab active:cursor-grabbing"
              />

              {/* Top-Left Zoom Tier & Admin Badges */}
              <div className="pointer-events-none absolute left-2.5 top-2.5 flex flex-wrap items-center gap-1.5">
                <span className="rounded-lg border border-amber-400/40 bg-slate-950/90 px-2.5 py-1 text-[11px] font-bold text-amber-300">
                  Zoom: {zoomTierLabel}
                </span>
                <span className="rounded-lg border border-white/15 bg-slate-950/85 px-2.5 py-1 text-[10px] text-slate-300">
                  4 Taluks · {KOZHIKODE_URBAN_LOCAL_BODIES.length} ULBs ·{' '}
                  {KOZHIKODE_GRAM_PANCHAYATS.length} Gram Panchayats
                </span>
              </div>

              {/* Right Map Toolbar (Zoom + Layer Toggles + Recenter) */}
              <div className="absolute right-2.5 top-2.5 flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => setScale((s) => clampScale(s * 1.35))}
                  aria-label="Zoom In"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-slate-950/90 text-white hover:bg-slate-800"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setScale((s) => clampScale(s * 0.74))}
                  aria-label="Zoom Out"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-slate-950/90 text-white hover:bg-slate-800"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={recenterOnPlayer}
                  aria-label="Recenter on Player"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-400/50 bg-slate-950/90 text-amber-300 hover:bg-slate-800"
                >
                  <LocateFixed className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowHighways((v) => !v)}
                  aria-label="Toggle Highway Overlay"
                  className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
                    showHighways
                      ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                      : 'border-white/20 bg-slate-950/90 text-slate-400'
                  }`}
                >
                  <RouteIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowRivers((v) => !v)}
                  aria-label="Toggle Rivers Overlay"
                  className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
                    showRivers
                      ? 'border-sky-400 bg-sky-500/20 text-sky-300'
                      : 'border-white/20 bg-slate-950/90 text-slate-400'
                  }`}
                >
                  <Waves className="h-4 w-4" />
                </button>
              </div>

              {/* Bottom-Left Progressive Zoom Tier Selector + Legend */}
              <div className="absolute bottom-2.5 left-2.5 right-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 rounded-xl border border-white/15 bg-slate-950/90 p-1">
                  {(['District', 'Regional', 'City', 'Street'] as ZoomTierLabel[]).map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => selectZoomPreset(tier)}
                      className={`rounded-lg px-2 py-1 text-[10px] font-bold ${
                        zoomTierLabel === tier
                          ? 'bg-amber-500 text-slate-950'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {tier}
                    </button>
                  ))}
                </div>

                <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-slate-950/85 px-2.5 py-1 text-[10px] text-slate-300 sm:flex">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-3 rounded bg-amber-500" /> NH-66/766
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-3 rounded bg-sky-400" /> SH-34/38
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" /> Home / Waypoint
                  </span>
                </div>
              </div>
            </div>

            {/* Right Inspector + District Search Panel */}
            <div className="flex min-h-0 flex-col border-t border-white/10 bg-slate-950/95 lg:border-l lg:border-t-0">
              {/* Search & Category Filter */}
              <div className="border-b border-white/10 p-3">
                <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-slate-900 px-3 py-2">
                  <Search className="h-4 w-4 text-amber-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search 54 places & 70 Panchayats..."
                    className="w-full bg-transparent text-xs text-white placeholder-slate-400 focus:outline-none"
                  />
                </div>

                <div className="mt-2 flex flex-wrap gap-1">
                  {(
                    [
                      ['all', 'All'],
                      ['town', 'Towns'],
                      ['beach', 'Beaches'],
                      ['hill_ghat', 'Ghats'],
                      ['waterfall_dam', 'Dams/Falls'],
                      ['transit', 'Transit'],
                    ] as Array<[GazetteerCategory | 'all', string]>
                  ).map(([cat, label]) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategoryFilter(cat)}
                      className={`rounded-md px-2 py-1 text-[10px] font-semibold ${
                        categoryFilter === cat
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowPanchayatCount((v) => !v)}
                    className="ml-auto flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800"
                  >
                    <Layers className="h-3 w-3" /> 70 GPs
                  </button>
                </div>
              </div>

              {/* Scrollable Results List */}
              <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
                {showPanchayatCount && !searchQuery && (
                  <div className="mb-2 rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-2.5 text-[11px] text-emerald-100">
                    <div className="font-bold">Kozhikode Admin Registry (70 Gram Panchayats)</div>
                    <p className="mt-0.5 text-[10px] text-emerald-200/80">
                      Type any Panchayat name above (e.g., Kadalundi, Koorachundu, Nadapuram,
                      Azhiyur, Koodaranji) to route or fast-travel.
                    </p>
                  </div>
                )}

                <div className="space-y-1">
                  {searchResults.places.map((place) => (
                    <button
                      key={place.id}
                      type="button"
                      onClick={() => {
                        onUiClick();
                        setSelectedTarget(placeToTarget(place));
                        setViewCenter({ x: place.worldX, z: place.worldZ });
                      }}
                      className={`flex w-full items-center justify-between rounded-xl border px-2.5 py-2 text-left transition-colors ${
                        selectedTarget.id === place.id
                          ? 'border-amber-400 bg-amber-500/15'
                          : 'border-white/5 bg-slate-900/70 hover:bg-slate-800'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="truncate text-xs font-semibold text-white">
                          {place.name}
                        </div>
                        <div className="truncate text-[10px] text-slate-400">
                          {place.malayalamName} · {place.adminUnit}
                        </div>
                      </div>
                      <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[9px] uppercase text-slate-300">
                        {place.biome}
                      </span>
                    </button>
                  ))}

                  {searchResults.panchayats.map((gp) => (
                    <button
                      key={gp.id}
                      type="button"
                      onClick={() => {
                        onUiClick();
                        const target = gramPanchayatToTarget(gp);
                        setSelectedTarget(target);
                        setViewCenter({ x: target.worldX, z: target.worldZ });
                      }}
                      className="flex w-full items-center justify-between rounded-xl border border-emerald-500/20 bg-slate-900/60 px-2.5 py-2 text-left hover:bg-slate-800"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="truncate text-xs font-semibold text-emerald-200">
                          {gp.name} Gram Panchayat
                        </div>
                        <div className="truncate text-[10px] text-slate-400">
                          {gp.blockName} Block · {gp.talukId} Taluk
                        </div>
                      </div>
                      <span className="shrink-0 rounded bg-emerald-950 px-1.5 py-0.5 text-[9px] text-emerald-300">
                        GP
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Selected Destination Action Card */}
              <div className="border-t border-white/10 bg-slate-900/90 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-white">{selectedTarget.name}</div>
                    {selectedTarget.malayalamName && (
                      <div className="text-[11px] font-medium text-amber-300">
                        {selectedTarget.malayalamName}
                      </div>
                    )}
                    <div className="text-[10px] text-slate-400">{selectedTarget.subtitle}</div>
                  </div>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-300">
                    {selectedTarget.accuracyLabel}
                  </span>
                </div>

                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">
                  {selectedTarget.description}
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-2 font-mono-tabular text-[10px] text-sky-300">
                  <span>
                    {selectedTarget.lat.toFixed(4)}°N, {selectedTarget.lon.toFixed(4)}°E
                  </span>
                  <span>·</span>
                  <span className="text-emerald-300">
                    Road Est: {selectedRealKm} km
                    {computedRoute ? ` (${computedRoute.estimatedDriveMinutes} min)` : ''}
                  </span>
                </div>

                {computedRoute && computedRoute.highwaySummary.length > 0 && (
                  <div className="mt-1 text-[10px] text-amber-200/90">
                    Via: {computedRoute.highwaySummary.join(' → ')}
                  </div>
                )}

                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onSetDestination({
                        id: selectedTarget.id,
                        name: selectedTarget.name,
                        malayalamName: selectedTarget.malayalamName,
                        worldX: selectedTarget.worldX,
                        worldZ: selectedTarget.worldZ,
                        lat: selectedTarget.lat,
                        lon: selectedTarget.lon,
                        source: selectedTarget.source,
                      })
                    }
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400"
                  >
                    <Navigation className="h-3.5 w-3.5" />
                    Set Waypoint
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onTravelToWorld(selectedTarget.worldX, selectedTarget.worldZ, 0);
                      onClose();
                    }}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-sky-400/50 bg-sky-500/20 px-3 py-2 text-xs font-semibold text-sky-100 hover:bg-sky-500/30"
                  >
                    <Trees className="h-3.5 w-3.5" />
                    Fast Travel
                  </button>
                </div>

                <div className="mt-2 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onTravelToWorld(
                        PROTAGONIST_HOME_COORDS.gateX,
                        PROTAGONIST_HOME_COORDS.gateZ + 4,
                        Math.PI,
                      );
                      onClose();
                    }}
                    className="flex items-center gap-1 text-[11px] font-semibold text-emerald-300 hover:text-emerald-200"
                  >
                    <Home className="h-3.5 w-3.5" /> Fast Travel Home (West Hill)
                  </button>
                  {snapshot.activeDestination && (
                    <button
                      type="button"
                      onClick={onClearDestination}
                      className="text-[11px] font-semibold text-rose-300 hover:text-rose-200"
                    >
                      Clear Waypoint
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Google Maps · Kozhikode Live Tab */
          <div className="relative flex min-h-[380px] flex-1 flex-col bg-slate-950">
            {googleMapsApiKey ? (
              <div className="relative h-full min-h-[380px] w-full flex-1">
                <APIProvider
                  apiKey={googleMapsApiKey}
                  language="en"
                  region="IN"
                  libraries={['places', 'routes', 'marker']}
                >
                  <GoogleMap
                    mapId="DEMO_MAP_ID"
                    internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                    defaultCenter={{ lat: snapshot.playerLat, lng: snapshot.playerLon }}
                    defaultZoom={12}
                    gestureHandling="greedy"
                    streetViewControl={false}
                    fullscreenControl={false}
                    style={{ width: '100%', height: '100%' }}
                  >
                    <GooglePlacesExplorerPanel
                      snapshot={snapshot}
                      onSyncGooglePlace={handleSyncGooglePlace}
                      onTravelGooglePlace={handleTravelGooglePlace}
                    />
                  </GoogleMap>
                </APIProvider>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
                <Sparkles className="h-10 w-10 text-amber-400" />
                <h3 className="mt-3 font-display text-lg font-bold text-white">
                  GOOGLE MAPS LIVE EXPLORER UNAVAILABLE OFFLINE
                </h3>
                <p className="mt-1 max-w-md text-xs text-slate-300">
                  No Google Maps API key is active in this offline environment. Use the{' '}
                  <strong>District Map (Offline)</strong> tab to search all 46 Kozhikode locations,
                  70 Gram Panchayats, and A* district road routes offline.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('district_vector')}
                  className="mt-4 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950"
                >
                  Return to Offline District Map
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
