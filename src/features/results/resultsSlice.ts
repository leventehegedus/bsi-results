import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { ResultFilters } from '@/api/types'

/**
 * What the results panel shows: race, filters and page. The data itself (race
 * metadata, columns, result pages) comes from the futanetApi cache.
 */
interface ResultsState {
  raceId: string | null
  filters: ResultFilters
  page: number
}

const initialState: ResultsState = {
  raceId: null,
  filters: {},
  page: 1,
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
  },
})

export const { selectRace, setFilters, setPage } = resultsSlice.actions
export const resultsReducer = resultsSlice.reducer
