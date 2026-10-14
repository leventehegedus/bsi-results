import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { getAllResults } from '@/api/futanet'
import { annotateBirthYears, findBirthYear, getRaceCached, getRaceCatalogue, rowKey } from '@/api/runner'
import type { RaceListItem, ResultFilters } from '@/api/types'
import { runPool } from '@/lib/pool'
import { withRetry } from '@/lib/retry'
import { mergeSubLists, runnerKey, toScanRow } from '@/lib/results'
import { personalBests, personKey, type RunnerResult } from '@/lib/runner'
import { createAppAsyncThunk, errorMessage } from '@/store/createAppAsyncThunk'
import type { RootState } from '@/store'
import { setTab } from '@/features/ui/uiSlice'

export interface RunnerQuery {
  name: string
  /** null = unknown; birth years are then worked out per result */
  yob: number | null
  /**
   * true: exactly this name (a profile opened from a result row);
   * false: any name containing the text (min. 3 characters), like the API's own filter.
   */
  exact: boolean
  /** only results from this town (whole name; the API ignores case and accents) */
  town?: string | null
}

export const MIN_QUERY_LENGTH = 3

type Status = 'idle' | 'resolving' | 'scanning' | 'done' | 'cancelled' | 'failed'

export type YobFilter = number | 'unknown' | null

interface RunnerState {
  query: RunnerQuery | null
  /** where the query came from, shown in the UI ("from 41. SPAR Budapest Maraton") */
  source: string | null
  status: Status
  done: number
  total: number
  rows: RunnerResult[]
  similarNames: number
  /** races whose results couldn't be fetched (server errors even after retries) */
  failedRaces: RaceListItem[]
  mergeSubLists: boolean
  includeVirtual: boolean
  /** filters set by clicking a birth year / town in the results */
  filterYob: YobFilter
  filterTown: string | null
  error: string | null
  /** requestId of the scan currently shown; late results from older scans are ignored */
  activeRequest: string | null
  /** requestId of the profile being opened from a result row */
  openRequest: string | null
}

const initialState: RunnerState = {
  query: null,
  source: null,
  status: 'idle',
  done: 0,
  total: 0,
  rows: [],
  similarNames: 0,
  failedRaces: [],
  mergeSubLists: true,
  includeVirtual: false,
  filterYob: null,
  filterTown: null,
  error: null,
  activeRequest: null,
  openRequest: null,
}

const CONCURRENCY = 8
/** Above this many hits in one list, skip the per-row birth-year lookup. */
const MAX_ROWS_TO_ANNOTATE = 40

/**
 * Open a profile from a result row: switch to the Runner tab, work out the
 * birth year from that row, then scan every race for that exact name.
 */
export const openRunner = createAppAsyncThunk(
  'runner/open',
  async (
    arg: { name: string; raceId: string; raceName?: string; place?: number | null; bib?: string | null },
    { dispatch, signal },
  ) => {
    dispatch(setTab('runner'))
    const yob = await findBirthYear(arg.raceId, arg.name, { place: arg.place, bib: arg.bib }, { signal }).catch(
      () => null,
    )
    if (signal.aborted) return
    const scan = dispatch(scanRunner({ name: arg.name, yob, exact: true }))
    signal.addEventListener('abort', () => scan.abort())
    await scan
  },
)

/**
 * Scan every known race for the query, or only `races` (retrying the ones that
 * failed; results are then added to what's already shown).
 */
export const scanRunner = createAppAsyncThunk(
  'runner/scan',
  async ({ races: only, ...query }: RunnerQuery & { races?: RaceListItem[] }, { dispatch, signal, rejectWithValue, requestId }) => {
    try {
      const races = only ?? (await getRaceCatalogue({ signal }))
      dispatch(progress({ requestId, done: 0, total: races.length }))

      const filters: ResultFilters = { name: query.name }
      if (query.town) filters.town = query.town
      if (query.yob) {
        filters.minYob = String(query.yob)
        filters.maxYob = String(query.yob)
      }
      const key = runnerKey(query.name)
      let done = 0
      let similar = 0
      const failed: RaceListItem[] = []
      const tick = () => {
        done++
        if (done % 20 === 0 || done === races.length) dispatch(progress({ requestId, done, total: races.length }))
      }

      await runPool(
        races,
        CONCURRENCY,
        async (race) => {
          let rows
          try {
            rows = await withRetry(() => getAllResults(race.id, filters, { signal }), { signal })
          } catch (e) {
            if (signal.aborted) throw e
            // one broken list shouldn't sink the whole search: note it and go on
            failed.push(race)
            tick()
            return
          }
          let kept = rows
          if (query.exact) {
            // The API's name filter is a substring match ("Kiss Zoltán" also finds
            // "Kiss Zoltán Péter"); an exact profile keeps exact names only.
            kept = rows.filter((r) => runnerKey(r.nev ?? '') === key)
            similar += rows.length - kept.length
          }
          if (kept.length) {
            let years = new Map<string, number>()
            if (!query.yob && kept.length <= MAX_ROWS_TO_ANNOTATE) {
              years = await annotateBirthYears(race.id, filters, { signal }).catch(() => years)
            }
            const meta = await getRaceCached(race.id, { signal })
            dispatch(
              found({
                requestId,
                rows: kept.map((r) => ({
                  ...toScanRow(r, race, ''),
                  distance: meta?.tav || null,
                  yob: query.yob ?? years.get(rowKey(r)) ?? null,
                })),
              }),
            )
          }
          tick()
        },
        signal,
      )
      return { similar, failed }
    } catch (e) {
      return rejectWithValue(errorMessage(e))
    }
  },
)

const runnerSlice = createSlice({
  name: 'runner',
  initialState,
  reducers: {
    progress(s, a: PayloadAction<{ requestId: string; done: number; total: number }>) {
      if (a.payload.requestId !== s.activeRequest) return
      s.done = a.payload.done
      s.total = a.payload.total
    },
    found(s, a: PayloadAction<{ requestId: string; rows: RunnerResult[] }>) {
      if (a.payload.requestId !== s.activeRequest) return
      s.rows.push(...a.payload.rows)
    },
    setMergeSubLists(s, a: PayloadAction<boolean>) {
      s.mergeSubLists = a.payload
    },
    setIncludeVirtual(s, a: PayloadAction<boolean>) {
      s.includeVirtual = a.payload
    },
    setFilterYob(s, a: PayloadAction<YobFilter>) {
      s.filterYob = a.payload
    },
    setFilterTown(s, a: PayloadAction<string | null>) {
      s.filterTown = a.payload
    },
    /** A shared link: show who it is for, but don't start a full scan until asked. */
    prefillQuery(s, a: PayloadAction<RunnerQuery>) {
      if (s.status !== 'idle') return
      s.query = a.payload
    },
  },
  extraReducers: (b) => {
    b.addCase(scanRunner.pending, (s, a) => {
      const { races, ...query } = a.meta.arg
      s.activeRequest = a.meta.requestId
      s.query = query
      s.status = 'scanning'
      s.done = 0
      s.total = 0
      s.failedRaces = []
      s.error = null
      if (races) return // retrying failed races: keep what was found so far
      s.rows = []
      s.similarNames = 0
      s.filterYob = null
      s.filterTown = null
    })
      .addCase(scanRunner.fulfilled, (s, a) => {
        if (a.meta.requestId !== s.activeRequest) return
        s.status = 'done'
        s.similarNames += a.payload.similar
        s.failedRaces = a.payload.failed
      })
      .addCase(scanRunner.rejected, (s, a) => {
        if (a.meta.requestId !== s.activeRequest) return
        if (a.meta.aborted) s.status = 'cancelled'
        else {
          s.status = 'failed'
          s.error = a.payload ?? a.error.message ?? 'Scan failed'
        }
      })
      .addCase(openRunner.pending, (s, a) => {
        s.openRequest = a.meta.requestId
        s.activeRequest = null
        s.query = { name: a.meta.arg.name, yob: null, exact: true }
        s.source = a.meta.arg.raceName ?? a.meta.arg.raceId
        s.status = 'resolving'
        s.rows = []
        s.done = 0
        s.total = 0
        s.similarNames = 0
        s.failedRaces = []
        s.filterYob = null
        s.filterTown = null
        s.error = null
      })
      .addMatcher(
        (a) => openRunner.fulfilled.match(a) || openRunner.rejected.match(a),
        (s, a: { meta: { requestId: string } }) => {
          // Stopped while still looking up the birth year: no scan was started.
          if (a.meta.requestId === s.openRequest && s.status === 'resolving') s.status = 'cancelled'
        },
      )
  },
})

export const { setMergeSubLists, setIncludeVirtual, setFilterYob, setFilterTown, prefillQuery } = runnerSlice.actions
const { progress, found } = runnerSlice.actions
export const runnerReducer = runnerSlice.reducer

const selectRunner = (s: RootState) => s.runner

/** All results after the merge/virtual options, newest first (before yob/town filters). */
export const selectAllRunnerResults = createSelector([selectRunner], (r) => {
  let rows = r.rows
  if (!r.includeVirtual) rows = rows.filter((x) => !x.virtual)
  if (r.mergeSubLists) rows = mergeSubLists(rows) as RunnerResult[]
  return [...rows].sort((a, b) => b.date.localeCompare(a.date) || a.raceName.localeCompare(b.raceName, 'hu'))
})

/** Results after the birth-year / town filters picked in the table. */
export const selectRunnerResults = createSelector(
  [selectAllRunnerResults, (s: RootState) => s.runner.filterYob, (s: RootState) => s.runner.filterTown],
  (rows, yob, town) =>
    rows.filter(
      (x) =>
        (yob === null || (yob === 'unknown' ? x.yob === null : x.yob === yob)) &&
        (town === null || x.town === town),
    ),
)

/** Distinct people (name + birth year) in the filtered results. */
export const selectPeople = createSelector([selectRunnerResults], (rows) => new Set(rows.map(personKey)).size)

/** PBs only make sense for a single person. */
export const selectPersonalBests = createSelector([selectRunnerResults, selectPeople], (rows, people) =>
  people === 1 ? personalBests(rows) : [],
)
