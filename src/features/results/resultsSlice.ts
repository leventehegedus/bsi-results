import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { getCategories, getFields, getRace, getResultPage } from '@/api/futanet'
import type { FieldDef, RaceMeta, ResultFilters, ResultRow } from '@/api/types'
import { createAppAsyncThunk, errorMessage } from '@/store/createAppAsyncThunk'

type Status = 'idle' | 'loading' | 'succeeded' | 'failed'

interface ResultsState {
  raceId: string | null
  meta: RaceMeta | null
  fields: FieldDef[]
  categories: string[]
  metaStatus: Status
  filters: ResultFilters
  page: number
  rows: ResultRow[]
  total: number
  lastPage: number
  status: Status
  error: string | null
}

const initialState: ResultsState = {
  raceId: null,
  meta: null,
  fields: [],
  categories: [],
  metaStatus: 'idle',
  filters: {},
  page: 1,
  rows: [],
  total: 0,
  lastPage: 1,
  status: 'idle',
  error: null,
}

/** Loads race metadata, visible columns and categories for the selected race. */
export const loadRace = createAppAsyncThunk(
  'results/loadRace',
  async (raceId: string, { signal, rejectWithValue }) => {
    try {
      const [meta, fields, categories] = await Promise.all([
        getRace(raceId, { signal }),
        getFields(raceId, { signal }).catch(() => [] as FieldDef[]),
        getCategories(raceId, { signal }).catch(() => [] as string[]),
      ])
      return { meta, fields, categories }
    } catch (e) {
      return rejectWithValue(errorMessage(e))
    }
  },
)

/** Fetches one page of results for the selected race with the current filters. */
export const fetchResults = createAppAsyncThunk(
  'results/fetch',
  async (page: number, { getState, signal, rejectWithValue }) => {
    const { raceId, filters } = getState().results
    if (!raceId) return rejectWithValue('No race selected')
    try {
      return await getResultPage(raceId, page, filters, { signal })
    } catch (e) {
      return rejectWithValue(errorMessage(e))
    }
  },
)

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
  },
  extraReducers: (b) => {
    b.addCase(loadRace.pending, (s) => {
      s.metaStatus = 'loading'
    })
      .addCase(loadRace.fulfilled, (s, a) => {
        if (a.meta.arg !== s.raceId) return
        s.metaStatus = 'succeeded'
        s.meta = a.payload.meta
        s.fields = a.payload.fields
        s.categories = a.payload.categories
      })
      .addCase(loadRace.rejected, (s, a) => {
        if (a.meta.aborted) return
        s.metaStatus = 'failed'
      })
      .addCase(fetchResults.pending, (s, a) => {
        s.status = 'loading'
        s.error = null
        s.page = a.meta.arg
      })
      .addCase(fetchResults.fulfilled, (s, a) => {
        s.status = 'succeeded'
        s.rows = a.payload.data
        s.total = a.payload.meta.total
        s.lastPage = a.payload.meta.last_page
      })
      .addCase(fetchResults.rejected, (s, a) => {
        if (a.meta.aborted) return
        s.status = 'failed'
        s.error = a.payload ?? a.error.message ?? 'Failed to load results'
      })
  },
})

export const { selectRace, setFilters } = resultsSlice.actions
export const resultsReducer = resultsSlice.reducer
