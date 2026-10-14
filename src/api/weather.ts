import axios from 'axios'

/**
 * Open-Meteo, through the same-origin proxy (vite.config.ts / vercel.json):
 * - /api/weather/archive  → archive-api.open-meteo.com/v1  (ERA5 reanalysis, 1940 → ~5 days ago)
 * - /api/weather/forecast → api.open-meteo.com/v1          (covers the last ~3 months, fills the gap)
 * - /api/geocode          → geocoding-api.open-meteo.com/v1
 */
const http = axios.create({ baseURL: '/api', headers: { Accept: 'application/json' }, timeout: 20_000 })

type Opts = { signal?: AbortSignal }

export interface Place {
  name: string
  lat: number
  lon: number
  /** e.g. "Veszprém, Hungary" */
  detail?: string
}

/** One hour of weather, local time (Europe/Budapest). */
export interface WeatherHour {
  /** "09:00" */
  time: string
  /** hours since midnight as a number (9 for 09:00), used for positioning */
  hour: number
  temp: number
  feels: number | null
  /** km/h, 10 m above ground */
  wind: number
  gusts: number | null
  /** degrees the wind blows FROM (0 = north, 90 = east) */
  dir: number
  /** mm in the hour */
  precip: number | null
  humidity: number | null
}

export interface DayWeather {
  date: string
  hours: WeatherHour[]
  /** which Open-Meteo dataset answered */
  source: 'archive' | 'forecast'
  /** grid point actually used */
  lat: number
  lon: number
}

const HOURLY = [
  'temperature_2m',
  'apparent_temperature',
  'wind_speed_10m',
  'wind_gusts_10m',
  'wind_direction_10m',
  'precipitation',
  'relative_humidity_2m',
].join(',')

interface OpenMeteoHourly {
  latitude: number
  longitude: number
  hourly?: {
    time: string[]
    temperature_2m: (number | null)[]
    apparent_temperature?: (number | null)[]
    wind_speed_10m: (number | null)[]
    wind_gusts_10m?: (number | null)[]
    wind_direction_10m: (number | null)[]
    precipitation?: (number | null)[]
    relative_humidity_2m?: (number | null)[]
  }
}

function toHours(data: OpenMeteoHourly): WeatherHour[] {
  const h = data.hourly
  if (!h) return []
  const out: WeatherHour[] = []
  h.time.forEach((iso, i) => {
    const temp = h.temperature_2m[i]
    const wind = h.wind_speed_10m[i]
    const dir = h.wind_direction_10m[i]
    if (temp == null || wind == null || dir == null) return
    const time = iso.slice(11, 16)
    const [hh, mm] = time.split(':').map(Number)
    out.push({
      time,
      hour: hh + mm / 60,
      temp,
      feels: h.apparent_temperature?.[i] ?? null,
      wind,
      gusts: h.wind_gusts_10m?.[i] ?? null,
      dir,
      precip: h.precipitation?.[i] ?? null,
      humidity: h.relative_humidity_2m?.[i] ?? null,
    })
  })
  return out
}

async function fetchDay(dataset: 'archive' | 'forecast', place: Place, date: string, { signal }: Opts) {
  const path = dataset === 'archive' ? '/weather/archive/archive' : '/weather/forecast/forecast'
  const { data } = await http.get<OpenMeteoHourly>(path, {
    signal,
    params: {
      latitude: place.lat.toFixed(4),
      longitude: place.lon.toFixed(4),
      start_date: date,
      end_date: date,
      hourly: HOURLY,
      timezone: 'Europe/Budapest',
      wind_speed_unit: 'kmh',
    },
  })
  return { hours: toHours(data), lat: data.latitude, lon: data.longitude }
}

/**
 * Hourly weather for one day at one place. The ERA5 archive is the source for
 * everything older than about five days; for very recent days it has no values
 * yet, so the forecast API (which keeps ~3 months of past data) answers instead.
 */
export async function getDayWeather(place: Place, date: string, opts: Opts = {}): Promise<DayWeather> {
  const archive = await fetchDay('archive', place, date, opts).catch(() => null)
  if (archive && archive.hours.length >= 20) return { date, source: 'archive', ...archive }
  const forecast = await fetchDay('forecast', place, date, opts)
  if (!forecast.hours.length) throw new Error('No weather data for this day')
  return { date, source: 'forecast', ...forecast }
}

interface GeocodeResponse {
  results?: { name: string; latitude: number; longitude: number; country?: string; admin1?: string }[]
}

/** Place search (towns, villages, landmarks), names in the UI language. */
export async function searchPlaces(name: string, lang: 'hu' | 'en', { signal }: Opts = {}): Promise<Place[]> {
  const { data } = await http.get<GeocodeResponse>('/geocode/search', {
    signal,
    params: { name, count: 6, language: lang, format: 'json' },
  })
  return (data.results ?? []).map((r) => ({
    name: r.name,
    lat: r.latitude,
    lon: r.longitude,
    detail: [r.admin1, r.country].filter(Boolean).join(', '),
  }))
}
