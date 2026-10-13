import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { getAllResults } from '@/api/futanet'
import { findBirthYear, getRaceCached, getRaceCatalogue } from '@/api/runner'
import type { ResultFilters } from '@/api/types'
import { runPool } from '@/lib/pool'
import { mergeSubLists, runnerKey, toScanRow } from '@/lib/results'
import { personalBests, type RunnerResult } from '@/lib/runner'
import { createAppAsyncThunk, errorMessage } from '@/store/createAppAsyncThunk'
import type { RootState } from '@/store'
import { setTab } from '@/features/ui/uiSlice'

export interface RunnerQuery {
  name: string
  /** null = unknown; results may then mix people with the same name */
  yob: number | null
}

type Status = 'idle' | 'resolving' | 'scanning' | 'done' | 'cancelled' | 'failed'

interface RunnerState {
  query: RunnerQuery | null
  /** where the query came from, shown in the UI ("from 41. SPAR Budapest Maraton, place 45") */
  source: string | null
  status: Status
  done: number
  total: number
  rows: RunnerResult[]
  similarNames: number
  mergeSubLists: boolean
  includeVirtual: boolean
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
  mergeSubLists: true,
  includeVirtual: false,
  error: null,
  activeRequest: null,
  openRequest: null,
}

const CONCURRENCY = 8

/**
 * Open a profile from a result row: switch to the Runner tab, work out the
 * birth year from that row, then scan every race.
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
    const scan = dispatch(scanRunner({ name: arg.name, yob }))
    signal.addEventListener('abort', () => scan.abort())
    await scan
  },
)

/** Scan every known race for `name` (+ birth year when known). */
export const scanRunner = createAppAsyncThunk(
  'runner/scan',
  async (query: RunnerQuery, { dispatch, signal, rejectWithValue, requestId }) => {
    try {
      const races = await getRaceCatalogue({ signal })
      dispatch(progress({ requestId, done: 0, total: races.length }))

      const filters: ResultFilters = { name: query.name }
      if (query.yob) {
        filters.minYob = String(query.yob)
        filters.maxYob = String(query.yob)
      }
      const key = runnerKey(query.name)
      let done = 0
      let similar = 0

      await runPool(
        races,
        CONCURRENCY,
        async (race) => {
          const rows = await getAllResults(race.id, filters, { signal })
          done++
          if (done % 20 === 0 || done === races.length) dispatch(progress({ requestId, done, total: races.length }))
          if (!rows.length) return
          // The API's name filter is a substring match ("Kiss Zoltán" also finds
          // "Kiss Zoltán Péter"), so keep exact name matches only.
          const exact = rows.filter((r) => runnerKey(r.nev ?? '') === key)
          similar += rows.length - exact.length
          if (!exact.length) return
          const meta = await getRaceCached(race.id, { signal })
          dispatch(
            found({
              requestId,
              rows: exact.map((r) => ({
                ...toScanRow(r, race, ''),
                distance: meta?.tav || null,
              })),
            }),
          )
        },
        signal,
      )
      return { similar }
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
  },
  extraReducers: (b) => {
    b.addCase(scanRunner.pending, (s, a) => {
      s.activeRequest = a.meta.requestId
      s.query = a.meta.arg
      s.status = 'scanning'
      s.rows = []
      s.done = 0
      s.total = 0
      s.similarNames = 0
      s.error = null
    })
      .addCase(scanRunner.fulfilled, (s, a) => {
        if (a.meta.requestId !== s.activeRequest) return
        s.status = 'done'
        s.similarNames = a.payload.similar
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
        s.query = { name: a.meta.arg.name, yob: null }
        s.source = a.meta.arg.raceName ?? a.meta.arg.raceId
        s.status = 'resolving'
        s.rows = []
        s.done = 0
        s.total = 0
        s.similarNames = 0
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

export const { setMergeSubLists, setIncludeVirtual } = runnerSlice.actions
const { progress, found } = runnerSlice.actions
export const runnerReducer = runnerSlice.reducer

const selectRunner = (s: RootState) => s.runner

/** The runner's results after the merge/virtual options, newest first. */
export const selectRunnerResults = createSelector([selectRunner], (r) => {
  let rows = r.rows
  if (!r.includeVirtual) rows = rows.filter((x) => !x.virtual)
  if (r.mergeSubLists) rows = mergeSubLists(rows) as RunnerResult[]
  return [...rows].sort((a, b) => b.date.localeCompare(a.date) || a.raceName.localeCompare(b.raceName, 'hu'))
})

export const selectPersonalBests = createSelector([selectRunnerResults], (rows) => personalBests(rows))
