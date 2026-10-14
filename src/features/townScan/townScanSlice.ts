import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { getAllResults } from '@/api/futanet'
import { getRaceFacts } from '@/api/raceIndex'
import { fetchRaceCatalogue, fetchRaceMeta } from '@/api/futanetApi'
import type { RaceListItem } from '@/api/types'
import { categorize, DISTANCE_CATEGORIES, type DistanceCategory } from '@/lib/distance'
import { runPool } from '@/lib/pool'
import {
  bestPerRunner,
  mergeSubLists,
  sortByDateDesc,
  toScanRow,
  type ScanRow,
} from '@/lib/results'
import { createAppAsyncThunk, errorMessage } from '@/store/createAppAsyncThunk'
import type { AppDispatch, RootState } from '@/store'

export interface ScanOptions {
  towns: string[]
  categories: DistanceCategory[]
}

type Status = 'idle' | 'running' | 'done' | 'cancelled' | 'failed'

interface TownScanState {
  townsInput: string
  categories: DistanceCategory[]
  excludeVirtual: boolean
  mergeSubLists: boolean
  bestOnly: boolean
  status: Status
  phase: 'resolving' | 'scanning' | null
  done: number
  total: number
  rows: ScanRow[]
  racesScanned: number
  error: string | null
}

const initialState: TownScanState = {
  townsInput: 'Budapest',
  // every distance by default; untick the ones you don't need
  categories: [...DISTANCE_CATEGORIES],
  excludeVirtual: true,
  mergeSubLists: true,
  bestOnly: false,
  status: 'idle',
  phase: null,
  done: 0,
  total: 0,
  rows: [],
  racesScanned: 0,
  error: null,
}

const CONCURRENCY = 6

export const parseTowns = (input: string) =>
  [...new Set(input.split(/[,;\n]/).map((t) => t.trim()).filter(Boolean))]

/** Races (listed + older unlisted ones) whose distance falls in the chosen categories. */
async function resolveRaces(
  dispatch: AppDispatch,
  categories: DistanceCategory[],
  signal: AbortSignal,
  onProgress: (done: number, total: number) => void,
): Promise<RaceListItem[]> {
  const races = await fetchRaceCatalogue(dispatch)
  const facts = await getRaceFacts(races, { fetchMeta: (id) => fetchRaceMeta(dispatch, id), signal, onProgress })
  const wanted = new Set(categories)
  return races.filter((r) => {
    const f = facts.get(r.id)
    return f && !f.empty && wanted.has(categorize(r.name, f.tav))
  })
}

export const runTownScan = createAppAsyncThunk(
  'townScan/run',
  async (opts: ScanOptions, { dispatch, signal, rejectWithValue }) => {
    try {
      const races = await resolveRaces(dispatch, opts.categories, signal, (done, total) =>
        dispatch(progress({ phase: 'resolving', done, total })),
      )
      const jobs = races.flatMap((race) => opts.towns.map((town) => ({ race, town })))
      let done = 0
      dispatch(progress({ phase: 'scanning', done, total: jobs.length }))

      const chunks = await runPool(
        jobs,
        CONCURRENCY,
        async ({ race, town }) => {
          const rows = await getAllResults(race.id, { town }, { signal })
          const mapped = rows.map((r) => toScanRow(r, race, town))
          dispatch(progress({ phase: 'scanning', done: ++done, total: jobs.length }))
          if (mapped.length) dispatch(rowsFound(mapped))
          return mapped.length
        },
        signal,
      )
      return { racesScanned: races.length, found: chunks.reduce((a, b) => a + b, 0) }
    } catch (e) {
      return rejectWithValue(errorMessage(e))
    }
  },
)

const townScanSlice = createSlice({
  name: 'townScan',
  initialState,
  reducers: {
    setTownsInput(s, a: PayloadAction<string>) {
      s.townsInput = a.payload
    },
    toggleCategory(s, a: PayloadAction<DistanceCategory>) {
      s.categories = s.categories.includes(a.payload)
        ? s.categories.filter((c) => c !== a.payload)
        : [...s.categories, a.payload]
    },
    setExcludeVirtual(s, a: PayloadAction<boolean>) {
      s.excludeVirtual = a.payload
    },
    setMergeSubLists(s, a: PayloadAction<boolean>) {
      s.mergeSubLists = a.payload
    },
    setBestOnly(s, a: PayloadAction<boolean>) {
      s.bestOnly = a.payload
    },
    progress(s, a: PayloadAction<{ phase: 'resolving' | 'scanning'; done: number; total: number }>) {
      s.phase = a.payload.phase
      s.done = a.payload.done
      s.total = a.payload.total
    },
    rowsFound(s, a: PayloadAction<ScanRow[]>) {
      s.rows.push(...a.payload)
    },
  },
  extraReducers: (b) => {
    b.addCase(runTownScan.pending, (s) => {
      s.status = 'running'
      s.phase = 'resolving'
      s.done = 0
      s.total = 0
      s.rows = []
      s.racesScanned = 0
      s.error = null
    })
      .addCase(runTownScan.fulfilled, (s, a) => {
        s.status = 'done'
        s.phase = null
        s.racesScanned = a.payload.racesScanned
      })
      .addCase(runTownScan.rejected, (s, a) => {
        s.phase = null
        if (a.meta.aborted) {
          s.status = 'cancelled'
        } else {
          s.status = 'failed'
          s.error = a.payload ?? a.error.message ?? 'Scan failed'
        }
      })
  },
})

export const {
  setTownsInput,
  toggleCategory,
  setExcludeVirtual,
  setMergeSubLists,
  setBestOnly,
} = townScanSlice.actions
const { progress, rowsFound } = townScanSlice.actions
export const townScanReducer = townScanSlice.reducer

const selectScan = (s: RootState) => s.townScan

/** Finishes after applying the virtual / sub-list options, newest first. */
export const selectFinishes = createSelector([selectScan], (scan) => {
  let rows = scan.rows
  if (scan.excludeVirtual) rows = rows.filter((r) => !r.virtual)
  if (scan.mergeSubLists) rows = mergeSubLists(rows)
  return sortByDateDesc(rows)
})

export const selectBestPerRunner = createSelector([selectFinishes], (rows) => bestPerRunner(rows))
