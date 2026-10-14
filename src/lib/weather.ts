import type { Place, WeatherHour } from '@/api/weather'
import { categorize, type DistanceCategory } from './distance'
import { seriesKey } from './events'

/**
 * Where a series is usually held. Everything else defaults to Budapest; the
 * user can pick another place per race (saved in localStorage).
 */
const BUDAPEST: Place = { name: 'Budapest', lat: 47.4979, lon: 19.0402 }
const BALATONFURED: Place = { name: 'Balatonfüred', lat: 46.959, lon: 17.889 }
const SERIES_PLACE: Record<string, Place> = {
  balaton: BALATONFURED,
  bm: BALATONFURED,
  szb: BALATONFURED,
  marfured: BALATONFURED,
  balusz: { name: 'Révfülöp', lat: 46.8256, lon: 17.621 },
  kekes: { name: 'Kékestető', lat: 47.8722, lon: 20.0094 },
  tdt: { name: 'Poroszló', lat: 47.65, lon: 20.664 },
}

export function defaultPlace(raceId: string): Place {
  const series = seriesKey(raceId).split('|')[1] ?? ''
  return SERIES_PLACE[series.replace(/^v-/, '')] ?? BUDAPEST
}

/**
 * The API has no start times. Weekend road races mostly start in the morning,
 * weekday and "esti" (evening) runs in the evening; the user can correct it.
 */
export function defaultStartTime(raceName: string, date: string): string {
  if (/\besti\b|evening|night/i.test(raceName)) return '20:00'
  const day = new Date(`${date}T12:00:00`).getDay() // 0 Sun … 6 Sat
  return day === 0 || day === 6 ? '09:00' : '18:00'
}

/** Rough time on course for most of the field, used to shade the race window. */
const WINDOW_HOURS: Record<DistanceCategory, number> = {
  marathon: 6,
  half: 3,
  '10k': 1.5,
  '5k': 1,
  other: 2,
}

export function raceWindowHours(raceName: string, tav: number | null | undefined): number {
  return WINDOW_HOURS[categorize(raceName, tav)]
}

export const isVirtualRace = (name: string) => /virtu/i.test(name)

/** "09:30" → 9.5 */
export function timeToHour(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h || 0) + (m || 0) / 60
}

/** Linear interpolation of a value between the two hours around `hour`. */
function interpolate(hours: WeatherHour[], hour: number, pick: (h: WeatherHour) => number | null): number | null {
  const after = hours.findIndex((h) => h.hour >= hour)
  if (after === -1) return pick(hours[hours.length - 1]) ?? null
  if (after === 0 || hours[after].hour === hour) return pick(hours[after]) ?? null
  const a = hours[after - 1]
  const b = hours[after]
  const va = pick(a)
  const vb = pick(b)
  if (va == null || vb == null) return va ?? vb
  return va + ((vb - va) * (hour - a.hour)) / (b.hour - a.hour)
}

export interface StartConditions {
  temp: number
  feels: number | null
  wind: number
  gusts: number | null
  /** from the nearest hour (directions don't average linearly) */
  dir: number
  humidity: number | null
  /** min / max temperature and total rain while the race is on */
  windowMin: number
  windowMax: number
  windowRain: number | null
}

export function conditionsAt(hours: WeatherHour[], start: number, windowH: number): StartConditions | null {
  if (!hours.length) return null
  const nearest = hours.reduce((best, h) => (Math.abs(h.hour - start) < Math.abs(best.hour - start) ? h : best))
  // temperature range while the race is on: the interpolated values at the start
  // and the end of the window plus every full hour in between
  const end = start + windowH
  const temps = [
    interpolate(hours, start, (h) => h.temp)!,
    ...hours.filter((h) => h.hour > start && h.hour < end).map((h) => h.temp),
    interpolate(hours, end, (h) => h.temp)!,
  ]
  // precipitation is the amount in the hour *ending* at the timestamp
  const rainHours = hours.filter((h) => h.hour > start && h.hour <= Math.ceil(start + windowH))
  const rain = rainHours.some((h) => h.precip != null)
    ? rainHours.reduce((s, h) => s + (h.precip ?? 0), 0)
    : null
  return {
    temp: interpolate(hours, start, (h) => h.temp)!,
    feels: interpolate(hours, start, (h) => h.feels),
    wind: interpolate(hours, start, (h) => h.wind)!,
    gusts: interpolate(hours, start, (h) => h.gusts),
    dir: nearest.dir,
    humidity: interpolate(hours, start, (h) => h.humidity),
    windowMin: Math.min(...temps),
    windowMax: Math.max(...temps),
    windowRain: rain,
  }
}

const COMPASS_EN = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
const COMPASS_HU = ['É', 'ÉÉK', 'ÉK', 'KÉK', 'K', 'KDK', 'DK', 'DDK', 'D', 'DDNy', 'DNy', 'NyDNy', 'Ny', 'NyÉNy', 'ÉNy', 'ÉÉNy']

/** 16-point compass label for a direction in degrees. */
export function compass(deg: number, lang: 'hu' | 'en'): string {
  const i = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16
  return (lang === 'hu' ? COMPASS_HU : COMPASS_EN)[i]
}

/** Per-race corrections of the start time and place, kept in this browser. */
export interface WeatherOverride {
  time?: string
  place?: Place
}

const STORAGE_KEY = 'bsi:raceWeather:v1'

function loadAll(): Record<string, WeatherOverride> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, WeatherOverride>
  } catch {
    return {}
  }
}

export function loadOverride(raceId: string): WeatherOverride {
  return loadAll()[raceId] ?? {}
}

export function saveOverride(raceId: string, override: WeatherOverride) {
  try {
    const all = loadAll()
    if (!override.time && !override.place) delete all[raceId]
    else all[raceId] = override
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // not persisted; the choice still applies until the page is reloaded
  }
}
