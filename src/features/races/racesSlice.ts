import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { futanetApi } from '@/api/futanetApi'
import type { RaceListItem } from '@/api/types'
import type { RootState } from '@/store'
import { groupRaces, type RaceEvent } from '@/lib/events'

/** The race list itself lives in the futanetApi cache (raceCatalogue); this is just the search. */
interface RacesState {
  query: string
}

const initialState: RacesState = {
  query: '',
}

const racesSlice = createSlice({
  name: 'races',
  initialState,
  reducers: {
    setQuery(state, action: PayloadAction<string>) {
      state.query = action.payload
    },
  },
})

export const { setQuery } = racesSlice.actions
export const racesReducer = racesSlice.reducer

const EMPTY: RaceListItem[] = []
const selectCatalogue = futanetApi.endpoints.raceCatalogue.select()
const selectItems = (s: RootState) => selectCatalogue(s).data ?? EMPTY
const selectQuery = (s: RootState) => s.races.query
const selectAllEvents = createSelector([selectItems], (items) => groupRaces(items))

export interface VisibleEvent extends RaceEvent {
  /** true when only some of the event's lists match the search */
  partial: boolean
}

/**
 * Events after the search filter. A label match keeps the whole event;
 * otherwise only the matching lists are shown inside it.
 */
export const selectVisibleEvents = createSelector(
  [selectAllEvents, selectQuery],
  (events, query): VisibleEvent[] => {
    const q = fold(query)
    const out: VisibleEvent[] = []
    for (const ev of events) {
      if (!q || fold(ev.label).includes(q)) {
        out.push({ ...ev, partial: false })
        continue
      }
      const hits = ev.races.filter((r) => fold(r.name).includes(q) || r.id.toLowerCase().includes(q))
      if (hits.length) out.push({ ...ev, races: hits, partial: true })
    }
    return out
  },
)

/** First year with BSI results (the 1984 Budapest Marathon). */
export const FIRST_YEAR = 1984

export interface YearGroup {
  year: string
  events: VisibleEvent[]
  raceCount: number
}

/** Visible events by year, newest first; every year since 1984 even without races. */
export const selectEventsByYear = createSelector([selectVisibleEvents], (events): YearGroup[] => {
  const byYear = new Map<string, VisibleEvent[]>()
  for (const ev of events) {
    const y = ev.from.slice(0, 4)
    byYear.set(y, [...(byYear.get(y) ?? []), ev])
  }
  const last = Math.max(new Date().getFullYear(), ...[...byYear.keys()].map(Number))
  const out: YearGroup[] = []
  for (let y = last; y >= FIRST_YEAR; y--) {
    const list = byYear.get(String(y)) ?? []
    out.push({ year: String(y), events: list, raceCount: list.reduce((n, e) => n + e.races.length, 0) })
  }
  return out
})

function fold(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}
