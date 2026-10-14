import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { ResultFilters } from '@/api/types'

/** The sub-view of the results panel; part of the shareable URL. */
export type ResultView = 'results' | 'breakdown' | 'weather'

/**
 * What the results panel shows: race, filters and page. The data itself (race
 * metadata, columns, result pages) comes from the futanetApi cache.
 */
interface ResultsState {
  raceId: string | null
  filters: ResultFilters
  page: number
  view: ResultView
}

const initialState: ResultsState = {
  raceId: null,
  filters: {},
  page: 1,
  view: 'results',
}

const resultsSlice = createSlice({
  name: 'results',
  initialState,
  reducers: {
    selectRace(_state, action: PayloadAction<string>) {
      return { ...initialState, raceId: action.payload }
    },
    setFilters(state, action: PayloadAction<ResultFilters>) {
      state.filters = action.payload
      state.page = 1
    },
    setPage(state, action: PayloadAction<number>) {
      state.page = action.payload
    },
    setView(state, action: PayloadAction<ResultView>) {
      state.view = action.payload
    },
    /** Restore the whole panel from a link, without the reset `selectRace` does. */
    openRaceRoute(_state, action: PayloadAction<Omit<ResultsState, 'raceId'> & { raceId: string }>) {
      return action.payload
    },
  },
})

export const { selectRace, setFilters, setPage, setView, openRaceRoute } = resultsSlice.actions
export const resultsReducer = resultsSlice.reducer
