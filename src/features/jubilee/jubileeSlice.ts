import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { fetchRaceCatalogue } from '@/api/futanetApi'
import { loadJubileeData, marathonEditions, readEditions, type JubileeRunner } from '@/api/jubilee'
import { createAppAsyncThunk, errorMessage } from '@/store/createAppAsyncThunk'
import type { RootState } from '@/store'

/** Everyone with more finishes than this is in the club. */
export const MIN_FINISHES = 6

export interface ClubMember extends JubileeRunner {
  finishes: number
  best: string
  first: number
  last: number
  /** years added from the API rather than the club's own lists */
  live: number[]
}

interface JubileeState {
  status: 'idle' | 'loading' | 'ready' | 'failed'
  /** the spreadsheets, plus whatever the API added on top */
  runners: JubileeRunner[]
  years: number[]
  source: string
  /** editions read from the API, and the ones still to read */
  addedYears: number[]
  pendingYears: number[]
  topUp: 'idle' | 'running' | 'done' | 'failed'
  query: string
  minFinishes: number
  error: string | null
}

const initialState: JubileeState = {
  status: 'idle',
  runners: [],
  years: [],
  source: '',
  addedYears: [],
  pendingYears: [],
  topUp: 'idle',
  query: '',
  minFinishes: MIN_FINISHES,
  error: null,
}

/** Load the club's lists once, then add any marathon they don't yet cover. */
export const loadClub = createAppAsyncThunk(
  'jubilee/load',
  async (_: void, { dispatch, getState, signal, rejectWithValue }) => {
    try {
      if ((getState() as RootState).jubilee.status === 'ready') return null
      const data = await loadJubileeData(signal)
      dispatch(loaded(data))

      // Sheets cover different years (the 10+ list runs a year ahead of the 5–9 one),
      // so every edition after the *earliest* of them has to be read, and each runner
      // only takes the years their own sheet didn't account for.
      const covered = Math.min(...data.runners.map((r) => r.u))
      const races = await fetchRaceCatalogue(dispatch)
      const missing = marathonEditions(races).filter((e) => e.year > covered)
      if (!missing.length) return null
      dispatch(topUpStarted(missing.map((e) => e.year)))

      const results = await readEditions(missing, data.runners, {
        signal,
        onDone: (year) => dispatch(yearRead(year)),
      })
      return results.map((r) => ({
        year: r.year,
        times: [...r.times].map(([i, time]) => [i, time] as [number, string]),
      }))
    } catch (e) {
      return rejectWithValue(errorMessage(e))
    }
  },
)

const jubileeSlice = createSlice({
  name: 'jubilee',
  initialState,
  reducers: {
    loaded(s, a: PayloadAction<{ runners: JubileeRunner[]; years: number[]; source: string }>) {
      s.runners = a.payload.runners
      s.years = a.payload.years
      s.source = a.payload.source
      s.status = 'ready'
    },
    topUpStarted(s, a: PayloadAction<number[]>) {
      s.pendingYears = a.payload
      s.topUp = 'running'
    },
    yearRead(s, a: PayloadAction<number>) {
      s.pendingYears = s.pendingYears.filter((y) => y !== a.payload)
    },
    setQuery(s, a: PayloadAction<string>) {
      s.query = a.payload
    },
    setMinFinishes(s, a: PayloadAction<number>) {
      s.minFinishes = Math.max(MIN_FINISHES, a.payload)
    },
  },
  extraReducers: (b) => {
    b.addCase(loadClub.pending, (s) => {
      if (s.status !== 'ready') s.status = 'loading'
      s.error = null
    })
      .addCase(loadClub.fulfilled, (s, a) => {
        s.topUp = 'done'
        s.pendingYears = []
        for (const { year, times } of a.payload ?? []) {
          for (const [i, time] of times) {
            const runner = s.runners[i]
            if (runner && year > runner.u && !runner.r[String(year)]) runner.r[String(year)] = time
          }
          if (!s.years.includes(year)) s.years.push(year)
          if (!s.addedYears.includes(year)) s.addedYears.push(year)
        }
        s.years.sort((x, y) => x - y)
      })
      .addCase(loadClub.rejected, (s, a) => {
        // the sheets alone are still worth showing
        if (s.status === 'ready') s.topUp = 'failed'
        else s.status = 'failed'
        s.error = a.payload ?? a.error.message ?? null
      })
  },
})

export const { loaded, topUpStarted, yearRead, setQuery, setMinFinishes } = jubileeSlice.actions
export const jubileeReducer = jubileeSlice.reducer

const selectJubilee = (s: RootState) => s.jubilee

/** Members above the threshold, most finishes first, with their summary figures. */
export const selectMembers = createSelector([selectJubilee], (j): ClubMember[] => {
  const members: ClubMember[] = []
  for (const r of j.runners) {
    const years = Object.keys(r.r)
      .map(Number)
      .sort((a, b) => a - b)
    if (years.length < j.minFinishes) continue
    const times = Object.values(r.r).sort()
    members.push({
      ...r,
      finishes: years.length,
      best: times[0] ?? '',
      first: years[0],
      last: years[years.length - 1],
      live: years.filter((y) => y > r.u),
    })
  }
  return members.sort(
    (a, b) => b.finishes - a.finishes || a.best.localeCompare(b.best) || a.n.localeCompare(b.n, 'hu'),
  )
})

/** The search box matches name, town and club. */
export const selectVisibleMembers = createSelector(
  [selectMembers, (s: RootState) => s.jubilee.query],
  (members, query) => {
    const q = fold(query)
    if (!q) return members
    return members.filter((m) => fold(m.n).includes(q) || fold(m.t).includes(q) || fold(m.c).includes(q))
  },
)

/** Only the years anyone visible actually ran, so the table has no empty columns. */
export const selectVisibleYears = createSelector([selectJubilee, selectVisibleMembers], (j, members) => {
  const used = new Set<number>()
  for (const m of members) for (const y of Object.keys(m.r)) used.add(Number(y))
  return j.years.filter((y) => used.has(y))
})

function fold(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}
