import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react'
import { toBreakdownRow, type BreakdownRow } from '@/lib/breakdown'
import { runPool } from '@/lib/pool'
import { withRetry } from '@/lib/retry'
import { errorMessage } from '@/store/createAppAsyncThunk'
import type { AppDispatch } from '@/store'
import {
  apiFilters,
  getCategories,
  getFields,
  getRace,
  getRaceCountries,
  getResultPage,
  type Country,
} from './futanet'
import { loadRaceCatalogue } from './runner'
import type { FieldDef, Paginated, RaceListItem, RaceMeta, ResultFilters, ResultRow } from './types'

export interface ApiError {
  message: string
}

export interface RaceDetails {
  fields: FieldDef[]
  categories: string[]
  countries: Country[]
}

export interface ResultPageArgs {
  raceId: string
  page: number
  filters: ResultFilters
}

export interface RaceBreakdownData {
  all: BreakdownRow[]
  men: BreakdownRow[]
  women: BreakdownRow[]
}

/** Run a request (retrying server hiccups unless `retry` is false) and shape the outcome for RTK Query. */
async function run<T>(
  fn: () => Promise<T>,
  signal: AbortSignal,
  retry = true,
): Promise<{ data: T } | { error: ApiError }> {
  try {
    return { data: await (retry ? withRetry(fn, { signal }) : fn()) }
  } catch (e) {
    return { error: { message: errorMessage(e) } }
  }
}

/** Every result row of a race for `filters`, a few pages at a time (each page retried on its own). */
async function fetchAllPages(raceId: string, filters: ResultFilters, signal: AbortSignal): Promise<ResultRow[]> {
  const page = (n: number) => withRetry(() => getResultPage(raceId, n, filters, { signal }), { signal })
  const first = await page(1)
  const rest = Array.from({ length: Math.max(0, first.meta.last_page - 1) }, (_, i) => i + 2)
  const pages = await runPool(rest, 6, page, signal)
  return [first, ...pages].flatMap((p) => p.data)
}

const keep = (rows: (BreakdownRow | null)[]) => rows.filter((r): r is BreakdownRow => r !== null)

/**
 * Cached access to results.futanet.hu. The endpoints wrap the axios calls in
 * ./futanet, so requests still go through the same proxy, retries and parsing;
 * RTK Query adds de-duplication of identical in-flight requests and a cache
 * keyed by the arguments.
 */
export const futanetApi = createApi({
  reducerPath: 'futanetApi',
  baseQuery: fakeBaseQuery<ApiError>(),
  // race metadata and lists rarely change: keep unused entries for an hour
  keepUnusedDataFor: 60 * 60,
  endpoints: (build) => ({
    /** Every known race: /raceList plus the older unlisted ones. */
    raceCatalogue: build.query<RaceListItem[], void>({
      queryFn: (_arg, { signal }) => run(() => loadRaceCatalogue({ signal }), signal),
      keepUnusedDataFor: 24 * 60 * 60,
    }),
    /** Race metadata; null for codes the API doesn't know. */
    race: build.query<RaceMeta | null, string>({
      queryFn: (raceId, { signal }) => run(() => getRace(raceId, { signal }), signal),
    }),
    /** Visible columns, categories and finishers' countries of a race (each optional). */
    raceDetails: build.query<RaceDetails, string>({
      queryFn: (raceId, { signal }) =>
        run(async () => {
          const [fields, categories, countries] = await Promise.all([
            getFields(raceId, { signal }).catch(() => [] as FieldDef[]),
            getCategories(raceId, { signal }).catch(() => [] as string[]),
            getRaceCountries(raceId, { signal }).catch(() => [] as Country[]),
          ])
          return { fields, categories, countries }
        }, signal),
    }),
    /**
     * Every finisher's time for the breakdown: men and women are fetched with the
     * API's gender filter (together they're usually the whole list); the unfiltered
     * list is only fetched as well when some finishers have no gender.
     */
    raceBreakdown: build.query<RaceBreakdownData, string>({
      queryFn: (raceId, { signal }) =>
        run(
          async () => {
            const [menRows, womenRows, firstAll] = await Promise.all([
              fetchAllPages(raceId, { sex: 'F' }, signal),
              fetchAllPages(raceId, { sex: 'N' }, signal),
              withRetry(() => getResultPage(raceId, 1, {}, { signal }), { signal }),
            ])
            const men = keep(menRows.map((r) => toBreakdownRow(r, 'F')))
            const women = keep(womenRows.map((r) => toBreakdownRow(r, 'N')))
            const complete = firstAll.meta.total <= menRows.length + womenRows.length
            const all = complete
              ? [...men, ...women]
              : keep((await fetchAllPages(raceId, {}, signal)).map((r) => toBreakdownRow(r, null)))
            return { all, men, women }
          },
          signal,
          false, // pages retry individually
        ),
    }),
    /** One page (40 rows) of results with filters. */
    resultPage: build.query<Paginated<ResultRow>, ResultPageArgs>({
      queryFn: ({ raceId, page, filters }, { signal }) =>
        run(() => getResultPage(raceId, page, filters, { signal }), signal),
      // filters that mean the same request ("25" and "0:25:00", empty fields) share a cache entry
      serializeQueryArgs: ({ queryArgs: { raceId, page, filters } }) => ({ raceId, page, filters: apiFilters(filters) }),
      // results of recent races can still be corrected
      keepUnusedDataFor: 5 * 60,
    }),
  }),
})

export const { useRaceCatalogueQuery, useRaceQuery, useRaceDetailsQuery, useResultPageQuery, useRaceBreakdownQuery } =
  futanetApi

/** Thunks and scans read through the same cache (no subscription is kept). */
export function fetchRaceMeta(dispatch: AppDispatch, raceId: string): Promise<RaceMeta | null> {
  return dispatch(futanetApi.endpoints.race.initiate(raceId, { subscribe: false }))
    .unwrap()
    .catch(() => null)
}

export function fetchRaceCatalogue(dispatch: AppDispatch): Promise<RaceListItem[]> {
  return dispatch(futanetApi.endpoints.raceCatalogue.initiate(undefined, { subscribe: false }))
    .unwrap()
    .catch((e: ApiError) => {
      throw new Error(e.message)
    })
}
