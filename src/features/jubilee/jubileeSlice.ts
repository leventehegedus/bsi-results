import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import {
  loadJubileeBand,
  loadJubileeIndex,
  PENDING_BAND,
  type BandInfo,
  type JubileeRunner,
} from '@/api/jubilee'
import { createAppAsyncThunk, errorMessage } from '@/store/createAppAsyncThunk'
import type { RootState } from '@/store'

/** Everyone with at least this many finishes is in the club. */
export const MIN_FINISHES = 6
/** A search below this length would match half the club, and it downloads every band. */
export const MIN_QUERY_LENGTH = 3
/** Rows per page: the 6-10 band alone is over 1 600 people. */
export const PAGE_SIZE = 50

export interface ClubMember extends JubileeRunner {
  finishes: number
  best: string
  first: number
  last: number
}

interface JubileeState {
  status: 'idle' | 'loading' | 'ready' | 'failed'
  bands: BandInfo[]
  band: string
  /** runners of the bands downloaded so far, keyed by band */
  loaded: Record<string, JubileeRunner[]>
  /** bands being downloaded right now, so two views don't fetch the same file twice */
  loadingBands: string[]
  years: number[]
  source: string
  query: string
  /** page within the band (or within the search results), from 1 */
  page: number
  error: string | null
}

const initialState: JubileeState = {
  status: 'idle',
  bands: [],
  band: '',
  loaded: {},
  loadingBands: [],
  years: [],
  source: '',
  query: '',
  page: 1,
  error: null,
}

/** The band shown first: the smallest entry band, as the club's own lists are ordered. */
const defaultBand = (bands: BandInfo[]) =>
  bands.filter((b) => b.id !== PENDING_BAND).sort((a, b) => a.from - b.from)[0]?.id ?? ''

/** Load the list of bands, then the one being shown. */
export const loadClub = createAppAsyncThunk(
  'jubilee/load',
  async (_: void, { dispatch, getState, signal, rejectWithValue }) => {
    try {
      const state = () => (getState() as RootState).jubilee
      if (state().status !== 'ready') {
        const index = await loadJubileeIndex(signal)
        dispatch(indexLoaded(index))
      }
      await dispatch(loadBand(state().band || defaultBand(state().bands)))
      return null
    } catch (e) {
      return rejectWithValue(errorMessage(e))
    }
  },
)

/** Download one band's runners, unless they're already here. */
export const loadBand = createAppAsyncThunk(
  'jubilee/loadBand',
  async (band: string, { dispatch, getState, signal }) => {
    const { loaded, loadingBands } = (getState() as RootState).jubilee
    if (!band || loaded[band] || loadingBands.includes(band)) return null
    dispatch(bandLoading(band))
    const runners = await loadJubileeBand(band, signal)
    return { band, runners }
  },
)

/** Every runner downloaded so far, in band order. */
function allRunners(s: JubileeState): JubileeRunner[] {
  return s.bands.flatMap((b) => s.loaded[b.id] ?? [])
}

const jubileeSlice = createSlice({
  name: 'jubilee',
  initialState,
  reducers: {
    indexLoaded(s, a: PayloadAction<{ bands: BandInfo[]; years: number[]; source: string }>) {
      s.bands = a.payload.bands
      s.years = a.payload.years
      s.source = a.payload.source
      s.band = s.band || defaultBand(a.payload.bands)
      s.status = 'ready'
    },
    bandLoading(s, a: PayloadAction<string>) {
      if (!s.loadingBands.includes(a.payload)) s.loadingBands.push(a.payload)
    },
    setBand(s, a: PayloadAction<string>) {
      if (s.band !== a.payload) s.page = 1
      s.band = a.payload
    },
    setPage(s, a: PayloadAction<number>) {
      s.page = Math.max(1, a.payload)
    },
    setQuery(s, a: PayloadAction<string>) {
      const q = a.payload.trim()
      s.query = q.length >= MIN_QUERY_LENGTH ? q : ''
      s.page = 1
    },
  },
  extraReducers: (b) => {
    b.addCase(loadClub.pending, (s) => {
      if (s.status !== 'ready') s.status = 'loading'
      s.error = null
    })
      .addCase(loadClub.rejected, (s, a) => {
        s.status = 'failed'
        s.error = a.payload ?? a.error.message ?? null
      })
      .addCase(loadBand.fulfilled, (s, a) => {
        if (!a.payload) return
        s.loadingBands = s.loadingBands.filter((b) => b !== a.payload!.band)
        s.loaded[a.payload.band] = a.payload.runners
      })
      .addCase(loadBand.rejected, (s, a) => {
        s.loadingBands = s.loadingBands.filter((b) => b !== a.meta.arg)
        s.error = a.error.message ?? null
      })
  },
})

export const { indexLoaded, bandLoading, setBand, setPage, setQuery } = jubileeSlice.actions
export const jubileeReducer = jubileeSlice.reducer

const selectJubilee = (s: RootState) => s.jubilee

/** Every member downloaded so far, with their summary figures, most finishes first. */
export const selectLoadedMembers = createSelector([selectJubilee], (j): ClubMember[] => {
  const members: ClubMember[] = []
  for (const r of allRunners(j)) {
    const years = Object.keys(r.r)
      .map(Number)
      .sort((a, b) => a - b)
    if (years.length < MIN_FINISHES) continue
    // a few old finishes are recorded without a time; they count, but can't be a best
    const times = Object.values(r.r).filter(hasTime).sort()
    members.push({
      ...r,
      finishes: years.length,
      best: times[0] ?? '',
      first: years[0],
      last: years[years.length - 1],
    })
  }
  return members.sort(
    (a, b) =>
      b.finishes - a.finishes ||
      // runners with no recorded time go last within their band
      (a.best ? 0 : 1) - (b.best ? 0 : 1) ||
      a.best.localeCompare(b.best) ||
      a.n.localeCompare(b.n, 'hu'),
  )
})

const inBand = (finishes: number, band: BandInfo | undefined) =>
  !!band && finishes >= band.from && (band.to === null || finishes <= band.to)

/**
 * What the page shows: the chosen band, or — while searching — every band that
 * has been downloaded, since a name is rarely in the band you happen to be on.
 */
export const selectVisibleMembers = createSelector([selectJubilee, selectLoadedMembers], (j, members) => {
  const q = fold(j.query)
  if (q) return members.filter((m) => fold(m.n).includes(q) || fold(m.t).includes(q) || fold(m.c).includes(q))
  const band = j.bands.find((b) => b.id === j.band)
  return members.filter((m) => inBand(m.finishes, band))
})

/** How many pages the current band (or search) runs to. */
export const selectPageCount = createSelector([selectVisibleMembers], (members) =>
  Math.max(1, Math.ceil(members.length / PAGE_SIZE)),
)

/** The rows actually on screen. */
export const selectPageMembers = createSelector(
  [selectVisibleMembers, (s: RootState) => s.jubilee.page, selectPageCount],
  (members, page, pages) => {
    const current = Math.min(page, pages)
    return members.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  },
)

/** Only the years anyone on the page actually ran, so the table has no empty columns. */
export const selectVisibleYears = createSelector([selectJubilee, selectPageMembers], (j, members) => {
  const used = new Set<number>()
  for (const m of members) for (const y of Object.keys(m.r)) used.add(Number(y))
  return j.years.filter((y) => used.has(y))
})

/** Bands worth offering as pages: everything above the entry bar. */
export const selectPageBands = createSelector([selectJubilee], (j) =>
  j.bands.filter((b) => b.id !== PENDING_BAND).sort((a, b) => a.from - b.from),
)

/** "00:00:00" marks a finish the club's lists have no time for. */
export const hasTime = (time: string | undefined): time is string => !!time && time !== '00:00:00'

function fold(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}
