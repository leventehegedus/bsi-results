import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { getRaceCatalogue } from '@/api/runner'
import type { RaceListItem } from '@/api/types'
import { createAppAsyncThunk, errorMessage } from '@/store/createAppAsyncThunk'
import type { RootState } from '@/store'
import { groupRaces, type RaceEvent } from '@/lib/events'

type Status = 'idle' | 'loading' | 'succeeded' | 'failed'

interface RacesState {
  items: RaceListItem[]
  status: Status
  error: string | null
  query: string
  year: string // 'all' or 'YYYY'
}

const initialState: RacesState = {
  items: [],
  status: 'idle',
  error: null,
  query: '',
  year: 'all',
}

export const fetchRaces = createAppAsyncThunk(
  'races/fetch',
  async (_: void, { signal, rejectWithValue }) => {
    try {
      return await getRaceCatalogue({ signal })
    } catch (e) {
      return rejectWithValue(errorMessage(e))
    }
  },
  { condition: (_, { getState }) => getState().races.status !== 'loading' },
)

const racesSlice = createSlice({
  name: 'races',
  initialState,
  reducers: {
    setQuery(state, action: PayloadAction<string>) {
      state.query = action.payload
    },
    setYear(state, action: PayloadAction<string>) {
      state.year = action.payload
    },
  },
  extraReducers: (b) => {
    b.addCase(fetchRaces.pending, (s) => {
      s.status = 'loading'
      s.error = null
    })
      .addCase(fetchRaces.fulfilled, (s, a) => {
        s.status = 'succeeded'
        s.items = a.payload
      })
      .addCase(fetchRaces.rejected, (s, a) => {
        s.status = 'failed'
        s.error = a.payload ?? a.error.message ?? 'Failed to load races'
      })
  },
})

export const { setQuery, setYear } = racesSlice.actions
export const racesReducer = racesSlice.reducer

const selectItems = (s: RootState) => s.races.items
const selectQuery = (s: RootState) => s.races.query
const selectYear = (s: RootState) => s.races.year

export const selectRaceYears = createSelector([selectItems], (items) =>
  [...new Set(items.map((r) => r.date.slice(0, 4)))].sort((a, b) => b.localeCompare(a)),
)

export const selectFilteredRaces = createSelector(
  [selectItems, selectQuery, selectYear],
  (items, query, year) => {
    const q = fold(query)
    return items.filter(
      (r) =>
        (year === 'all' || r.date.startsWith(year)) &&
        (!q || fold(r.name).includes(q) || r.id.toLowerCase().includes(q)),
    )
  },
)

const selectAllEvents = createSelector([selectItems], (items) => groupRaces(items))

export interface VisibleEvent extends RaceEvent {
  /** true when only some of the event's lists match the search */
  partial: boolean
}

/**
 * Events after the year + search filters. A label match keeps the whole event;
 * otherwise only the matching lists are shown inside it.
 */
export const selectVisibleEvents = createSelector(
  [selectAllEvents, selectQuery, selectYear],
  (events, query, year): VisibleEvent[] => {
    const q = fold(query)
    const out: VisibleEvent[] = []
    for (const ev of events) {
      const races = ev.races.filter((r) => year === 'all' || r.date.startsWith(year))
      if (!races.length) continue
      if (!q || fold(ev.label).includes(q)) {
        out.push({ ...ev, races, partial: false })
        continue
      }
      const hits = races.filter((r) => fold(r.name).includes(q) || r.id.toLowerCase().includes(q))
      if (hits.length) out.push({ ...ev, races: hits, partial: true })
    }
    return out
  },
)

function fold(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}
