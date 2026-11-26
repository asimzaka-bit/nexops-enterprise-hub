import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Compass,
  Droplets,
  LocateFixed,
  MapPin,
  Minus,
  Navigation,
  Plus,
  RefreshCw,
  Search,
  Sun,
  Thermometer,
  Wind,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TemperatureUnit, TimeFormatOption } from '../types/nexops';
import { formatTemperatureValue } from '../utils/storage';

export interface ActiveGeoLocation {
  lat: number;
  lng: number;
  label: string;
  country?: string;
  source: 'gps' | 'search' | 'preset' | 'map-click' | 'fallback';
}

interface WeatherSnapshot {
  temperatureC: number;
  apparentC: number;
  humidityPct: number;
  windKmh: number;
  highC: number;
  lowC: number;
  weatherCode: number;
  isDay: boolean;
  fetchedAt: string;
}

interface GeocodingResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

const DEFAULT_FALLBACK_LOCATION: ActiveGeoLocation = {
  lat: 31.5497,
  lng: 74.3436,
  label: 'Lahore, Pakistan',
  country: 'Pakistan',
  source: 'fallback',
};

const OFFICE_HUB_PRESETS: ActiveGeoLocation[] = [
  {
    lat: 31.5497,
    lng: 74.3436,
    label: 'Lahore HQ',
    country: 'Pakistan',
    source: 'preset',
  },
  {
    lat: 33.6844,
    lng: 73.0479,
    label: 'Islamabad Ops',
    country: 'Pakistan',
    source: 'preset',
  },
  {
    lat: 24.8607,
    lng: 67.0011,
    label: 'Karachi Hub',
    country: 'Pakistan',
    source: 'preset',
  },
  {
    lat: 25.2048,
    lng: 55.2708,
    label: 'Dubai Regional',
    country: 'UAE',
    source: 'preset',
  },
];

function describeWeatherCode(code: number, isDay: boolean) {
  if (code === 0) {
    return {
      label: isDay ? 'Clear Sky' : 'Clear Night',
      icon: Sun,
      accent: 'text-amber-500 dark:text-amber-400',
    };
  }
  if (code === 1 || code === 2) {
    return {
      label: 'Partly Cloudy',
      icon: CloudSun,
      accent: 'text-amber-500 dark:text-amber-400',
    };
  }
  if (code === 3) {
    return {
      label: 'Overcast',
      icon: Cloud,
      accent: 'text-slate-500 dark:text-slate-400',
    };
  }
  if (code === 45 || code === 48) {
    return {
      label: 'Foggy / Haze',
      icon: CloudFog,
      accent: 'text-slate-500 dark:text-slate-400',
    };
  }
  if (code >= 51 && code <= 57) {
    return {
      label: 'Light Drizzle',
      icon: CloudDrizzle,
      accent: 'text-sky-500 dark:text-sky-400',
    };
  }
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    return {
      label: 'Rain Showers',
      icon: CloudRain,
      accent: 'text-sky-600 dark:text-sky-400',
    };
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return {
      label: 'Snowfall',
      icon: CloudSnow,
      accent: 'text-cyan-500 dark:text-cyan-300',
    };
  }
  if (code >= 95) {
    return {
      label: 'Thunderstorm',
      icon: CloudLightning,
      accent: 'text-indigo-600 dark:text-indigo-400',
    };
  }
  return {
    label: 'Variable Conditions',
    icon: CloudSun,
    accent: 'text-indigo-500 dark:text-indigo-400',
  };
}

async function resolveLocationNameFromCoords(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(
        lat,
      )}&longitude=${encodeURIComponent(lng)}&localityLanguage=en`,
    );
    if (!res.ok) throw new Error('Reverse geocode unavailable');
    const data = (await res.json()) as {
      city?: string;
      locality?: string;
      principalSubdivision?: string;
      countryName?: string;
    };
    const city = data.city || data.locality || data.principalSubdivision;
    const country = data.countryName;
    if (city && country) return `${city}, ${country}`;
    if (city) return city;
    if (country) return country;
  } catch {
    // Fallback to coordinate label
  }
  return `Detected (${lat.toFixed(2)}, ${lng.toFixed(2)})`;
}

async function searchPlacesByQuery(query: string): Promise<GeocodingResult[]> {
  const clean = query.trim();
  if (!clean) return [];
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      clean,
    )}&count=5&language=en&format=json`,
  );
  if (!res.ok) throw new Error('City lookup failed');
  const json = (await res.json()) as { results?: GeocodingResult[] };
  return Array.isArray(json.results) ? json.results : [];
}

function createPinDivIcon(label: string) {
  const escaped = label.replace(/[<>&"]/g, '');
  return L.divIcon({
    className: 'nexops-map-pin-wrapper',
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);pointer-events:auto;">
        <div style="background:#0F172A;color:#F8FAFC;font-family:'Calibri','Carlito','Segoe UI',sans-serif;font-size:11px;font-weight:700;padding:3px 8px;border-radius:6px;border:1px solid rgba(148,163,184,0.35);white-space:nowrap;box-shadow:0 4px 12px rgba(15,23,42,0.28);margin-bottom:4px;">
          ${escaped}
        </div>
        <div style="width:18px;height:18px;border-radius:9999px;background:#4F46E5;border:3px solid #FFFFFF;box-shadow:0 3px 10px rgba(79,70,229,0.45);"></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -34],
  });
}

interface LiveWeatherCardProps {
  location: ActiveGeoLocation;
  onSelectLocation: (loc: ActiveGeoLocation) => void;
  onDetectGps: () => void;
  detectingGps: boolean;
  temperatureUnit?: TemperatureUnit;
  timeFormat?: TimeFormatOption;
  timezone?: string;
}

export function LiveWeatherCard({
  location,
  onSelectLocation,
  onDetectGps,
  detectingGps,
  temperatureUnit = 'C',
  timeFormat = '12h',
  timezone,
}: LiveWeatherCardProps) {
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cityQuery, setCityQuery] = useState('');
  const [searchingCity, setSearchingCity] = useState(false);
  const [cityResults, setCityResults] = useState<GeocodingResult[]>([]);

  const fetchWeather = useCallback(async (lat: number, lng: number) => {
    setLoading(true);
    setError(null);
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(
        lat,
      )}&longitude=${encodeURIComponent(
        lng,
      )}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Weather API responded with ${res.status}`);
      }
      const data = (await res.json()) as {
        current?: {
          temperature_2m?: number;
          relative_humidity_2m?: number;
          apparent_temperature?: number;
          is_day?: number;
          weather_code?: number;
          wind_speed_10m?: number;
        };
        daily?: {
          temperature_2m_max?: number[];
          temperature_2m_min?: number[];
        };
      };

      if (!data.current) {
        throw new Error('Weather data unavailable for these coordinates.');
      }

      setWeather({
        temperatureC: Math.round(data.current.temperature_2m ?? 0),
        apparentC: Math.round(data.current.apparent_temperature ?? data.current.temperature_2m ?? 0),
        humidityPct: Math.round(data.current.relative_humidity_2m ?? 0),
        windKmh: Math.round(data.current.wind_speed_10m ?? 0),
        highC: Math.round(data.daily?.temperature_2m_max?.[0] ?? data.current.temperature_2m ?? 0),
        lowC: Math.round(data.daily?.temperature_2m_min?.[0] ?? data.current.temperature_2m ?? 0),
        weatherCode: data.current.weather_code ?? 0,
        isDay: data.current.is_day !== 0,
        fetchedAt: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          hour12: timeFormat === '12h',
          ...(timezone ? { timeZone: timezone } : {}),
        }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load live weather.');
    } finally {
      setLoading(false);
    }
  }, [timeFormat, timezone]);

  useEffect(() => {
    void fetchWeather(location.lat, location.lng);
  }, [location.lat, location.lng, fetchWeather]);

  const handleCitySearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!cityQuery.trim()) return;
    setSearchingCity(true);
    try {
      const results = await searchPlacesByQuery(cityQuery);
      setCityResults(results);
      if (results.length === 1) {
        const match = results[0];
        onSelectLocation({
          lat: match.latitude,
          lng: match.longitude,
          label: [match.name, match.country].filter(Boolean).join(', '),
          country: match.country,
          source: 'search',
        });
        setCityResults([]);
        setCityQuery('');
      }
    } catch {
      setError('City search unavailable right now.');
    } finally {
      setSearchingCity(false);
    }
  };

  const condition = weather
    ? describeWeatherCode(weather.weatherCode, weather.isDay)
    : describeWeatherCode(0, true);
  const ConditionIcon = condition.icon;

  return (
    <div className="flex h-full min-w-0 flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3.5 dark:border-slate-800">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 text-sky-600 dark:border-sky-900/60 dark:bg-sky-950/50 dark:text-sky-400">
              <ConditionIcon className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-display text-base font-bold text-slate-900 dark:text-slate-100">
                Live Weather
              </h2>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {location.label}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onDetectGps}
              disabled={detectingGps}
              title="Detect current device GPS location"
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <LocateFixed className={`h-3.5 w-3.5 ${detectingGps ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">GPS</span>
            </button>
            <button
              type="button"
              onClick={() => void fetchWeather(location.lat, location.lng)}
              disabled={loading}
              aria-label="Refresh weather"
              title="Refresh weather forecast"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* City quick-search */}
        <form onSubmit={handleCitySearch} className="relative mt-3.5">
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-2.5 left-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={cityQuery}
                onChange={(e) => setCityQuery(e.target.value)}
                placeholder="Search city (e.g., Lahore, Dubai, London)..."
                className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pr-2.5 pl-8 text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
            <button
              type="submit"
              disabled={searchingCity}
              className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {searchingCity ? '...' : 'Go'}
            </button>
          </div>

          {cityResults.length > 0 && (
            <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
              {cityResults.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  onClick={() => {
                    onSelectLocation({
                      lat: place.latitude,
                      lng: place.longitude,
                      label: [place.name, place.country].filter(Boolean).join(', '),
                      country: place.country,
                      source: 'search',
                    });
                    setCityResults([]);
                    setCityQuery('');
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-indigo-50 dark:text-slate-200 dark:hover:bg-indigo-950/60"
                >
                  <span className="font-semibold">
                    {place.name}
                    {place.admin1 ? `, ${place.admin1}` : ''}
                  </span>
                  <span className="text-[11px] text-slate-400">{place.country}</span>
                </button>
              ))}
            </div>
          )}
        </form>

        {/* Main Weather Display */}
        {error ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-5 text-center dark:border-rose-900/60 dark:bg-rose-950/40">
            <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">{error}</p>
            <button
              type="button"
              onClick={() => void fetchWeather(location.lat, location.lng)}
              className="mt-2 rounded-lg bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-700"
            >
              Retry Forecast
            </button>
          </div>
        ) : loading && !weather ? (
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          </div>
        ) : weather ? (
          <>
            <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60">
              <div className="flex items-center gap-3.5">
                <ConditionIcon className={`h-11 w-11 shrink-0 ${condition.accent}`} />
                <div>
                  <p className="font-display text-3xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
                    {formatTemperatureValue(weather.temperatureC, temperatureUnit)}°{temperatureUnit}
                  </p>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {condition.label}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <p className="font-mono text-xs font-semibold text-slate-700 tabular-nums dark:text-slate-300">
                  H: {formatTemperatureValue(weather.highC, temperatureUnit)}° · L:{' '}
                  {formatTemperatureValue(weather.lowC, temperatureUnit)}°
                </p>
                <p className="mt-1 text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                  Feels like {formatTemperatureValue(weather.apparentC, temperatureUnit)}°
                  {temperatureUnit}
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-1.5 sm:gap-2.5">
              <div className="min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-2 sm:px-3 dark:border-slate-800 dark:bg-slate-950/40">
                <p className="flex items-center gap-1 truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  <Droplets className="h-3 w-3 shrink-0 text-sky-500" />
                  <span className="truncate">Humidity</span>
                </p>
                <p className="mt-0.5 truncate font-mono text-xs font-bold text-slate-900 tabular-nums sm:text-sm dark:text-slate-100">
                  {weather.humidityPct}%
                </p>
              </div>
              <div className="min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-2 sm:px-3 dark:border-slate-800 dark:bg-slate-950/40">
                <p className="flex items-center gap-1 truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  <Wind className="h-3 w-3 shrink-0 text-indigo-500" />
                  <span className="truncate">Wind</span>
                </p>
                <p className="mt-0.5 truncate font-mono text-xs font-bold text-slate-900 tabular-nums sm:text-sm dark:text-slate-100">
                  {weather.windKmh} km/h
                </p>
              </div>
              <div className="min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-2 sm:px-3 dark:border-slate-800 dark:bg-slate-950/40">
                <p className="flex items-center gap-1 truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  <Thermometer className="h-3 w-3 shrink-0 text-amber-500" />
                  <span className="truncate">Range</span>
                </p>
                <p className="mt-0.5 truncate font-mono text-xs font-bold text-slate-900 tabular-nums sm:text-sm dark:text-slate-100">
                  {formatTemperatureValue(weather.lowC, temperatureUnit)}–
                  {formatTemperatureValue(weather.highC, temperatureUnit)}°{temperatureUnit}
                </p>
              </div>
            </div>
          </>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <span className="font-mono tabular-nums">
          {location.lat.toFixed(4)}°, {location.lng.toFixed(4)}°
        </span>
        <span>
          {weather ? `Updated ${weather.fetchedAt} · Open-Meteo` : 'Open-Meteo Live Forecast'}
        </span>
      </div>
    </div>
  );
}

interface InteractiveMapCardProps {
  location: ActiveGeoLocation;
  onSelectLocation: (loc: ActiveGeoLocation) => void;
  onDetectGps: () => void;
  detectingGps: boolean;
}

export function InteractiveMapCard({
  location,
  onSelectLocation,
  onDetectGps,
  detectingGps,
}: InteractiveMapCardProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [mapQuery, setMapQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [zoomLevel, setZoomLevel] = useState<number>(12);

  // Initialize Leaflet map once
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapInstanceRef.current) return;

    const map = L.map(container, {
      center: [location.lat, location.lng],
      zoom: 12,
      zoomControl: false,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker([location.lat, location.lng], {
      icon: createPinDivIcon(location.label),
    }).addTo(map);

    marker.bindPopup(
      `<div style="font-family:'Calibri','Carlito','Segoe UI',sans-serif;font-size:12px;">
        <strong>${location.label.replace(/[<>&"]/g, '')}</strong><br/>
        <span style="font-family:'Calibri','Carlito','Segoe UI',sans-serif;font-size:11px;">${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}</span>
      </div>`,
    );

    map.on('zoomend', () => {
      setZoomLevel(map.getZoom());
    });

    map.on('click', (e: L.LeafletMouseEvent) => {
      const clickedLat = e.latlng.lat;
      const clickedLng = e.latlng.lng;
      void resolveLocationNameFromCoords(clickedLat, clickedLng).then((resolvedName) => {
        onSelectLocation({
          lat: clickedLat,
          lng: clickedLng,
          label: resolvedName,
          source: 'map-click',
        });
      });
    });

    mapInstanceRef.current = map;
    markerRef.current = marker;

    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(container);

    const timer = window.setTimeout(() => {
      map.invalidateSize();
    }, 120);

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
    // Initialize map once; location updates handled in dedicated effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync map view & marker pin when active location changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;

    const nextLatLng: L.LatLngExpression = [location.lat, location.lng];
    marker.setLatLng(nextLatLng);
    marker.setIcon(createPinDivIcon(location.label));
    marker.setPopupContent(
      `<div style="font-family:'Calibri','Carlito','Segoe UI',sans-serif;font-size:12px;">
        <strong>${location.label.replace(/[<>&"]/g, '')}</strong><br/>
        <span style="font-family:'Calibri','Carlito','Segoe UI',sans-serif;font-size:11px;">${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}</span>
      </div>`,
    );
    map.flyTo(nextLatLng, Math.max(map.getZoom(), 11), { duration: 0.65 });
  }, [location.lat, location.lng, location.label]);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!mapQuery.trim()) return;
    setSearching(true);
    try {
      const results = await searchPlacesByQuery(mapQuery);
      setSearchResults(results);
      if (results.length === 1) {
        const match = results[0];
        onSelectLocation({
          lat: match.latitude,
          lng: match.longitude,
          label: [match.name, match.country].filter(Boolean).join(', '),
          country: match.country,
          source: 'search',
        });
        setSearchResults([]);
        setMapQuery('');
      }
    } finally {
      setSearching(false);
    }
  };

  const handleZoomIn = () => {
    mapInstanceRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapInstanceRef.current?.zoomOut();
  };

  const handleRecenter = () => {
    mapInstanceRef.current?.setView([location.lat, location.lng], 13, { animate: true });
    markerRef.current?.openPopup();
  };

  return (
    <div className="flex h-full min-w-0 flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3.5 dark:border-slate-800">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-900/60 dark:bg-indigo-950/50 dark:text-indigo-400">
              <Compass className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-display text-base font-bold text-slate-900 dark:text-slate-100">
                Interactive Operations Map
              </h2>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                Click anywhere on the map or search an office / city to move the live pin
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onDetectGps}
              disabled={detectingGps}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 disabled:opacity-60 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-900/60"
            >
              <Navigation className={`h-3.5 w-3.5 ${detectingGps ? 'animate-spin' : ''}`} />
              <span>My Location</span>
            </button>
          </div>
        </div>

        {/* Search & Office Presets */}
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
          <form onSubmit={handleSearch} className="relative w-full min-w-0 flex-1 sm:min-w-[200px]">
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-2.5 left-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={mapQuery}
                  onChange={(e) => setMapQuery(e.target.value)}
                  placeholder="Search location or hub..."
                  className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pr-2.5 pl-8 text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <button
                type="submit"
                disabled={searching}
                className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Locate
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="absolute z-[500] mt-1 w-full rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                {searchResults.map((place) => (
                  <button
                    key={place.id}
                    type="button"
                    onClick={() => {
                      onSelectLocation({
                        lat: place.latitude,
                        lng: place.longitude,
                        label: [place.name, place.country].filter(Boolean).join(', '),
                        country: place.country,
                        source: 'search',
                      });
                      setSearchResults([]);
                      setMapQuery('');
                    }}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-indigo-50 dark:text-slate-200 dark:hover:bg-indigo-950/60"
                  >
                    <span className="font-semibold">
                      {place.name}
                      {place.admin1 ? `, ${place.admin1}` : ''}
                    </span>
                    <span className="text-[11px] text-slate-400">{place.country}</span>
                  </button>
                ))}
              </div>
            )}
          </form>

          <div className="flex flex-wrap items-center gap-1">
            {OFFICE_HUB_PRESETS.map((hub) => {
              const isActive =
                Math.abs(location.lat - hub.lat) < 0.01 &&
                Math.abs(location.lng - hub.lng) < 0.01;
              return (
                <button
                  key={hub.label}
                  type="button"
                  onClick={() => onSelectLocation(hub)}
                  className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
                    isActive
                      ? 'border-slate-900 bg-slate-900 text-white dark:border-indigo-500 dark:bg-indigo-600'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {hub.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Interactive Leaflet Map Canvas */}
        <div className="relative mt-3.5 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          <div ref={mapContainerRef} className="h-[235px] w-full bg-slate-100 dark:bg-slate-950 sm:h-[260px]" />

          {/* Floating Map Zoom & Center Controls */}
          <div className="absolute top-3 right-3 z-[400] flex flex-col gap-1">
            <button
              type="button"
              onClick={handleZoomIn}
              aria-label="Zoom in map"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white/95 text-slate-700 shadow-sm backdrop-blur-xs transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleZoomOut}
              aria-label="Zoom out map"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white/95 text-slate-700 shadow-sm backdrop-blur-xs transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleRecenter}
              aria-label="Center on pin"
              title="Center map on active marker"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white/95 text-indigo-600 shadow-sm backdrop-blur-xs transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/95 dark:text-indigo-400 dark:hover:bg-slate-800"
            >
              <MapPin className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
          <MapPin className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
          <span>{location.label}</span>
        </span>
        <span className="font-mono tabular-nums">
          Zoom {zoomLevel}x · {location.lat.toFixed(4)}°, {location.lng.toFixed(4)}°
        </span>
      </div>
    </div>
  );
}

interface WeatherAndMapSectionProps {
  defaultCity?: string;
  temperatureUnit?: TemperatureUnit;
  timeFormat?: TimeFormatOption;
  timezone?: string;
}

export function WeatherAndMapSection({
  defaultCity,
  temperatureUnit = 'C',
  timeFormat = '12h',
  timezone,
}: WeatherAndMapSectionProps) {
  const [activeLocation, setActiveLocation] = useState<ActiveGeoLocation>(DEFAULT_FALLBACK_LOCATION);
  const [detectingGps, setDetectingGps] = useState(false);

  const detectCurrentLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setActiveLocation(DEFAULT_FALLBACK_LOCATION);
      return;
    }
    setDetectingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        void resolveLocationNameFromCoords(lat, lng).then((label) => {
          setActiveLocation({
            lat,
            lng,
            label,
            source: 'gps',
          });
          setDetectingGps(false);
        });
      },
      () => {
        setDetectingGps(false);
      },
      { enableHighAccuracy: false, timeout: 6500, maximumAge: 300000 },
    );
  }, []);

  useEffect(() => {
    const cleanCity = defaultCity?.trim();
    if (cleanCity && cleanCity.toLowerCase() !== 'lahore, pakistan') {
      const citySearchName = cleanCity.split(',')[0]?.trim() || cleanCity;
      void searchPlacesByQuery(citySearchName)
        .then((results) => {
          const match = results[0];
          if (match) {
            setActiveLocation({
              lat: match.latitude,
              lng: match.longitude,
              label: [match.name, match.country].filter(Boolean).join(', '),
              country: match.country,
              source: 'search',
            });
          } else {
            detectCurrentLocation();
          }
        })
        .catch(() => detectCurrentLocation());
      return;
    }
    detectCurrentLocation();
  }, [defaultCity, detectCurrentLocation]);

  const weatherProps = useMemo(
    () => ({
      location: activeLocation,
      onSelectLocation: setActiveLocation,
      onDetectGps: detectCurrentLocation,
      detectingGps,
    }),
    [activeLocation, detectCurrentLocation, detectingGps],
  );

  return (
    <section
      aria-label="Live Weather and Interactive Operations Map"
      className="grid min-w-0 grid-cols-1 items-stretch gap-6 lg:grid-cols-12"
    >
      <div className="min-w-0 lg:col-span-5">
        <LiveWeatherCard
          {...weatherProps}
          temperatureUnit={temperatureUnit}
          timeFormat={timeFormat}
          timezone={timezone}
        />
      </div>
      <div className="min-w-0 lg:col-span-7">
        <InteractiveMapCard {...weatherProps} />
      </div>
    </section>
  );
}
