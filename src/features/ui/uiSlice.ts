import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { initialLang, type Lang } from '@/i18n'

export type AppTab = 'races' | 'town' | 'runner'

const uiSlice = createSlice({
  name: 'ui',
  initialState: { tab: 'races' as AppTab, lang: initialLang() as Lang },
  reducers: {
    setTab(state, action: PayloadAction<AppTab>) {
      state.tab = action.payload
    },
    setLang(state, action: PayloadAction<Lang>) {
      state.lang = action.payload
    },
  },
})

export const { setTab, setLang } = uiSlice.actions
export const uiReducer = uiSlice.reducer
