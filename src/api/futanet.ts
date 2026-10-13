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

/** Full race list (current + past), deduplicated by id, newest first. */
export async function getRaceList({ signal }: Opts = {}): Promise<RaceListItem[]> {
  const { data } = await api.get<RaceListResponse>('/raceList', { signal })
  const all = [...(data.current ?? []), ...(data.past ?? []), ...(data.future ?? [])]
  const seen = new Set<string>()
  return all
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((a, b) => b.date.localeCompare(a.date))
}

/** Race metadata. Returns null for unknown codes (the API answers those with HTML). */
export async function getRace(code: string, { signal }: Opts = {}): Promise<RaceMeta | null> {
  const res = await api.get(`/race/${encodeURIComponent(code)}`, {
    signal,
    validateStatus: () => true,
  })
  return isJson(res.headers['content-type']) && res.data && typeof res.data === 'object' && 'kod' in res.data
    ? (res.data as RaceMeta)
    : null
}

export async function getFields(code: string, { signal }: Opts = {}): Promise<FieldDef[]> {
  const { data } = await api.get<{ data: FieldDef[] }>(`/fields/${encodeURIComponent(code)}`, { signal })
  return [...(data.data ?? [])].filter((f) => !f.hide).sort((a, b) => a.sorrend - b.sorrend)
}

export async function getCategories(code: string, { signal }: Opts = {}): Promise<string[]> {
  const { data } = await api.get<string[]>(`/raceCategory/${encodeURIComponent(code)}`, { signal })
  return Array.isArray(data) ? data : []
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
  for (const [k, v] of Object.entries(filters)) {
    if (v != null && String(v).trim() !== '') form.append(k, String(v).trim())
  }
  const res = await api.post(`/resultList/${encodeURIComponent(code)}`, form, {
    params: { page },
    signal,
    validateStatus: (s) => s < 500,
  })
  if (!isJson(res.headers['content-type'])) return EMPTY_PAGE
  return res.data as Paginated<ResultRow>
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
