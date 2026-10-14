import { api } from './client'
import type {
  FieldDef,
  Paginated,
  RaceListItem,
  RaceListResponse,
  RaceMeta,
  ResultFilters,
  ResultRow,
} from './types'

type Opts = { signal?: AbortSignal }

/** Older names start with their date: "2019. 10. 26. - 12. Intersport Túranap" → "12. Intersport Túranap". */
export function cleanRaceName(name: string) {
  return name.replace(/^\s*\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.\s*(-\s*)?/, '').trim()
}

/** Full race list (current + past), deduplicated by id, newest first. */
export async function getRaceList({ signal }: Opts = {}): Promise<RaceListItem[]> {
  const { data } = await api.get<RaceListResponse>('/raceList', { signal })
  const all = [...(data.current ?? []), ...(data.past ?? []), ...(data.future ?? [])]
  const seen = new Set<string>()
  return all
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .map((r) => ({ ...r, name: cleanRaceName(r.name) }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

/** Race metadata. Returns null for unknown codes (the API answers those with HTML). */
export async function getRace(code: string, { signal }: Opts = {}): Promise<RaceMeta | null> {
  const res = await api.get(`/race/${encodeURIComponent(code)}`, {
    signal,
    validateStatus: () => true,
  })
  if (!isJson(res.headers['content-type']) || !res.data || typeof res.data !== 'object' || !('kod' in res.data)) return null
  const meta = res.data as RaceMeta
  return { ...meta, nev: cleanRaceName(meta.nev ?? '') }
}

export async function getFields(code: string, { signal }: Opts = {}): Promise<FieldDef[]> {
  const { data } = await api.get<{ data: FieldDef[] }>(`/fields/${encodeURIComponent(code)}`, { signal })
  return [...(data.data ?? [])].filter((f) => !f.hide).sort((a, b) => a.sorrend - b.sorrend)
}

export async function getCategories(code: string, { signal }: Opts = {}): Promise<string[]> {
  const { data } = await api.get<string[]>(`/raceCategory/${encodeURIComponent(code)}`, { signal })
  return Array.isArray(data) ? data : []
}

export interface Country {
  /** IOC-style code the result filter expects, e.g. "HUN", "GER" */
  value: string
  /** Hungarian name */
  text: string
}

/** Countries of a race's finishers (Hungary first), for the country filter. */
export async function getRaceCountries(code: string, { signal }: Opts = {}): Promise<Country[]> {
  const { data } = await api.get<{ data?: Country[] }>(`/raceCountries/${encodeURIComponent(code)}`, { signal })
  return Array.isArray(data?.data) ? data.data.map(({ value, text }) => ({ value, text })) : []
}

const EMPTY_PAGE: Paginated<ResultRow> = {
  data: [],
  meta: { current_page: 1, last_page: 1, per_page: 40, total: 0, from: null, to: null },
}

/**
 * One page (40 rows) of results. The endpoint is POST with multipart form data;
 * GET returns the SPA HTML. Empty result lists come back as an HTML snippet,
 * which we normalise to an empty page.
 */
export async function getResultPage(
  code: string,
  page = 1,
  filters: ResultFilters = {},
  { signal }: Opts = {},
): Promise<Paginated<ResultRow>> {
  const form = new FormData()
  for (const [k, v] of Object.entries(apiFilters(filters))) form.append(k, v)
  const res = await api.post(`/resultList/${encodeURIComponent(code)}`, form, {
    params: { page },
    signal,
    validateStatus: (s) => s < 500,
  })
  if (!isJson(res.headers['content-type'])) return EMPTY_PAGE
  return res.data as Paginated<ResultRow>
}

/** "25" → 00:25:00, "25:30" → 00:25:30, "1:05:00" → 01:05:00; null if not a time. */
export function toApiTime(input: string): string | null {
  const parts = input.trim().split(':')
  if (parts.length > 3 || !parts.every((p) => /^\d{1,2}$/.test(p))) return null
  if (parts.length === 1) parts.push('00') // "25" = minutes
  while (parts.length < 3) parts.unshift('00')
  return parts.map((p) => p.padStart(2, '0')).join(':')
}

/**
 * Trimmed, non-empty filters in the format the API expects. Times must be hh:mm:ss
 * (it silently ignores "25:00"); unfinished birth years and places are left out.
 */
export function apiFilters(filters: ResultFilters): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, raw] of Object.entries(filters)) {
    const v = raw == null ? '' : String(raw).trim()
    if (!v) continue
    if (k === 'minNetTime' || k === 'maxNetTime') {
      const t = toApiTime(v)
      if (t) out[k] = t
    } else if (k === 'minYob' || k === 'maxYob') {
      if (/^\d{4}$/.test(v)) out[k] = v
    } else if (k === 'minPlace' || k === 'maxPlace') {
      if (/^\d+$/.test(v)) out[k] = v
    } else out[k] = v
  }
  return out
}

/** All pages for a race + filter combination. */
export async function getAllResults(
  code: string,
  filters: ResultFilters = {},
  opts: Opts = {},
): Promise<ResultRow[]> {
  const first = await getResultPage(code, 1, filters, opts)
  const rows = [...first.data]
  for (let p = 2; p <= first.meta.last_page; p++) {
    const next = await getResultPage(code, p, filters, opts)
    rows.push(...next.data)
  }
  return rows
}

function isJson(contentType: unknown) {
  return typeof contentType === 'string' && contentType.includes('json')
}
