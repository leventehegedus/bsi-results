import type { RaceListItem } from '@/api/types'

/** A real-world event (e.g. "2026 SPAR Budapest Maraton weekend") and its result lists. */
export interface RaceEvent {
  key: string
  label: string
  /** first and last date of the event's lists */
  from: string
  to: string
  races: RaceListItem[]
}

/**
 * Series codes that belong to the same event although their prefix differs
 * (pairs/relays/side races of the same weekend).
 */
const SERIES_ALIAS: Record<string, string> = {
  pbalaton: 'balaton',
  brutf: 'brut',
  staf: 'spar',
  stafm: 'spar',
  sparm: 'spar',
  mini: 'spar',
  minim: 'spar',
  fbt: 'nike',
  mbpfm: 'bpfm',
}

/** "2026_spar_42_inf" → "2026|spar", "2018pbalaton_f_e" → "2018|balaton", "2026v_vivi21" → "2026|v-vivi" */
export function seriesKey(id: string): string {
  const m = id.match(/^(\d{4})([a-z]?)_?([a-z]+)/i)
  if (!m) return id
  const [, year, marker, letters] = m
  let series = letters.toLowerCase()
  if (marker.toLowerCase() === 'p') series = 'p' + series // 2018pbalaton → pbalaton
  series = SERIES_ALIAS[series] ?? series
  if (marker.toLowerCase() === 'v') series = 'v-' + series // virtual editions stay separate
  return `${year}|${series}`
}

const MAX_GAP_DAYS = 3

function daysBetween(a: string, b: string) {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000
}

/** Display names for the recurring BSI series (code → event name). */
const SERIES_LABEL: Record<string, string> = {
  ibusz: 'IBUSZ Budapest Maraton',
  mars: 'Mars Budapest Maraton',
  kaiser: "Kaiser's Plus Budapest Maraton",
  plus: 'Plus Budapest Maraton',
  spar: 'SPAR Budapest Maraton',
  bpfm: 'Wizz Air Budapest Félmaraton',
  nike: 'Nike Budapest Félmaraton',
  vivi: 'Telekom Vivicittá',
  esti: 'Esti Félmaraton',
  szb: 'Balaton Szupermaraton',
  noi: 'Női Futógála',
  bm: 'Balaton Félmaraton',
  balaton: 'Balaton Maraton & Félmaraton',
  brut: 'Brutálfutás',
  zima: 'Zúzmara Félmaraton',
  balusz: 'Lidl Balaton-átúszás',
  kekes: 'Kékes Csúcsfutás',
  obol: 'Öbölúszás',
  liget: 'Liget Élményfutás',
  tdt: 'Tour de Tisza-tó',
  eon: 'E.ON Business Run',
  marfured: 'MaratonFüred',
  felm: 'Olimpiai Félmaraton',
  fbt: 'Budapest Félmaraton Trió',
}

/** Strip a trailing distance ("… 10 km") or toilet/wheelchair suffix from a race name. */
function stripDistance(name: string) {
  return name
    .replace(/\s*[–-]\s*(HB és WC|WC és HB).*$/i, '')
    .replace(/\s+\d+([.,]\d+)?\s*(km|m)\s*$/i, '')
    .trim()
}

function eventLabel(key: string, races: RaceListItem[]): string {
  // Ids that don't match the "YYYY<series>" pattern come through as the bare id (no "|").
  const [year, rawSeries = ''] = key.split('|')
  const virtual = rawSeries.startsWith('v-')
  const series = rawSeries.replace(/^v-/, '')
  const known = SERIES_LABEL[series]
  if (known) {
    // Helló Futás runs four times a year; keep the season ("Helló Tavasz! Futás").
    const hello = series === 'hel' && races.map((r) => r.name.match(/Helló,?\s*\S+!\s*Futás/i)?.[0]).find(Boolean)
    return `${virtual ? 'Virtuális ' : ''}${hello || known} ${year}`
  }
  if (series === 'hel') {
    const hello = races.map((r) => r.name.match(/Helló,?\s*\S+!\s*Futás/i)?.[0]).find(Boolean)
    if (hello) return `${hello} ${year}`
  }
  // Fallback: the race with the shortest code is usually the main one; skip bare "5 km" style names.
  const ordered = [...races].sort((a, b) => a.id.length - b.id.length || a.name.length - b.name.length)
  const main = ordered.find((r) => !/^\d+([.,]\d+)?\s*(km|m)$/i.test(r.name.trim())) ?? ordered[0]
  return stripDistance(main.name) || main.name
}

/**
 * Group race lists into events: same year + series code, and dates within a few
 * days of each other (Helló Futás has four seasons a year with the same code).
 */
export function groupRaces(races: RaceListItem[]): RaceEvent[] {
  const bySeries = new Map<string, RaceListItem[]>()
  for (const r of races) {
    const k = seriesKey(r.id)
    bySeries.set(k, [...(bySeries.get(k) ?? []), r])
  }

  const events: RaceEvent[] = []
  for (const [key, list] of bySeries) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date))
    let cluster: RaceListItem[] = []
    const flush = () => {
      if (!cluster.length) return
      const ordered = [...cluster].sort((a, b) => a.id.length - b.id.length || a.id.localeCompare(b.id))
      events.push({
        key: `${key}|${cluster[0].date}`,
        label: eventLabel(key, cluster),
        from: cluster[0].date,
        to: cluster[cluster.length - 1].date,
        races: ordered,
      })
      cluster = []
    }
    for (const r of sorted) {
      if (cluster.length && daysBetween(cluster[cluster.length - 1].date, r.date) > MAX_GAP_DAYS) flush()
      cluster.push(r)
    }
    flush()
  }
  return events.sort((a, b) => b.to.localeCompare(a.to) || a.label.localeCompare(b.label, 'hu'))
}
