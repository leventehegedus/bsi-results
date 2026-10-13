import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type AppTab = 'races' | 'town' | 'runner'

const uiSlice = createSlice({
  name: 'ui',
  initialState: { tab: 'races' as AppTab },
  reducers: {
    setTab(state, action: PayloadAction<AppTab>) {
      state.tab = action.payload
    },
  },
})

export const { setTab } = uiSlice.actions
export const uiReducer = uiSlice.reducer
