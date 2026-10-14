import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react'
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

/** Run a request (retrying server hiccups) and shape the outcome for RTK Query. */
async function run<T>(fn: () => Promise<T>, signal: AbortSignal): Promise<{ data: T } | { error: ApiError }> {
  try {
    return { data: await withRetry(fn, { signal }) }
  } catch (e) {
    return { error: { message: errorMessage(e) } }
  }
}

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

export const { useRaceCatalogueQuery, useRaceQuery, useRaceDetailsQuery, useResultPageQuery } = futanetApi

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
