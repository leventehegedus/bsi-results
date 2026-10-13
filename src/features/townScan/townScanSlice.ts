import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { getAllResults, getRace, getRaceList } from '@/api/futanet'
import type { RaceListItem } from '@/api/types'
import { LEGACY_BUDAPEST_MARATHON_CODES } from '@/api/legacyRaces'
import { runPool } from '@/lib/pool'
import {
  MARATHON_METRES,
  bestPerRunner,
  mergeSubLists,
  sortByDateDesc,
  toScanRow,
  type ScanRow,
} from '@/lib/results'
import { createAppAsyncThunk, errorMessage } from '@/store/createAppAsyncThunk'
import type { RootState } from '@/store'

/**
 * - marathon:  every race of exactly 42 195 m (sub-lists like amateur cups included,
 *              relays/half/split-stage formats excluded)
 * - budapest:  only the main SPAR/Budapest Marathon list of each year
 * - all:       every race in the list (≈2 200 races — slow)
 */
export type ScanScope = 'marathon' | 'budapest' | 'all'

export interface ScanOptions {
  towns: string[]
  scope: ScanScope
  includeLegacy: boolean
}

type Status = 'idle' | 'running' | 'done' | 'cancelled' | 'failed'

interface TownScanState {
  townsInput: string
  scope: ScanScope
  includeLegacy: boolean
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
  townsInput: 'Makó',
  scope: 'marathon',
  includeLegacy: true,
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

const NON_MARATHON_RE =
  /f[eé]lmaraton|negyed|hatod|harmad|nyolcad|stafét|váltó|valto|páros|paros|párban|parban|részlet|részben|minimaraton|mini maraton|relay|ekiden|túra|kerékpár|bringa|úszás|evez/i
const MARATHON_NAME_RE = /maraton|marathon/i
const BUDAPEST_MAIN_RE = /^\d{4}_spar_(42|e)$/

const CONCURRENCY = 6

export const parseTowns = (input: string) =>
  [...new Set(input.split(/[,;\n]/).map((t) => t.trim()).filter(Boolean))]

/** Resolve which race codes to scan for the chosen scope. */
async function resolveRaces(
  scope: ScanScope,
  includeLegacy: boolean,
  signal: AbortSignal,
  onProgress: (done: number, total: number) => void,
): Promise<RaceListItem[]> {
  const list = await getRaceList({ signal })
  let races: RaceListItem[]

  if (scope === 'all') {
    races = list
  } else if (scope === 'budapest') {
    races = list.filter((r) => BUDAPEST_MAIN_RE.test(r.id))
  } else {
    // Name heuristics first, then confirm the distance from race metadata.
    const candidates = list.filter((r) => MARATHON_NAME_RE.test(r.name) && !NON_MARATHON_RE.test(r.name))
    let done = 0
    const metas = await runPool(
      candidates,
      CONCURRENCY,
      async (r) => {
        const m = await getRace(r.id, { signal }).catch(() => null)
        onProgress(++done, candidates.length)
        return m
      },
      signal,
    )
    races = candidates.filter((_, i) => {
      const m = metas[i]
      return m && (m.tav === MARATHON_METRES || (m.tav === 0 && MARATHON_NAME_RE.test(m.nev)))
    })
  }

  if (includeLegacy && scope !== 'all') {
    const have = new Set(races.map((r) => r.id))
    const missing = LEGACY_BUDAPEST_MARATHON_CODES.filter((c) => !have.has(c))
    const metas = await runPool(missing, CONCURRENCY, (c) => getRace(c, { signal }).catch(() => null), signal)
    metas.forEach((m, i) => {
      if (m) {
        races.push({
          id: missing[i],
          name: m.nev.replace(/^[\d. ]+-\s*/, '').trim(),
          date: m.datum.slice(0, 10),
        })
      }
    })
  }
  return races
}

export const runTownScan = createAppAsyncThunk(
  'townScan/run',
  async (opts: ScanOptions, { dispatch, signal, rejectWithValue }) => {
    try {
      const races = await resolveRaces(opts.scope, opts.includeLegacy, signal, (done, total) =>
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
    setScope(s, a: PayloadAction<ScanScope>) {
      s.scope = a.payload
    },
    setIncludeLegacy(s, a: PayloadAction<boolean>) {
      s.includeLegacy = a.payload
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
  setScope,
  setIncludeLegacy,
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
