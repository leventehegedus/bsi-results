import { configureStore } from '@reduxjs/toolkit'
import { futanetApi } from '@/api/futanetApi'
import { racesReducer } from '@/features/races/racesSlice'
import { resultsReducer } from '@/features/results/resultsSlice'
import { townScanReducer } from '@/features/townScan/townScanSlice'
import { runnerReducer } from '@/features/runner/runnerSlice'
import { uiReducer } from '@/features/ui/uiSlice'

export const store = configureStore({
  reducer: {
    races: racesReducer,
    results: resultsReducer,
    townScan: townScanReducer,
    runner: runnerReducer,
    ui: uiReducer,
    [futanetApi.reducerPath]: futanetApi.reducer,
  },
  middleware: (getDefault) => getDefault().concat(futanetApi.middleware),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
