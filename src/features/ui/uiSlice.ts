import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { initialLang, type Lang } from '@/i18n'
import { initialTheme, type ThemeMode } from '@/theme'

export type AppTab = 'races' | 'town' | 'runner'

const uiSlice = createSlice({
  name: 'ui',
  initialState: { tab: 'races' as AppTab, lang: initialLang() as Lang, theme: initialTheme() as ThemeMode },
  reducers: {
    setTab(state, action: PayloadAction<AppTab>) {
      state.tab = action.payload
    },
    setLang(state, action: PayloadAction<Lang>) {
      state.lang = action.payload
    },
    setTheme(state, action: PayloadAction<ThemeMode>) {
      state.theme = action.payload
    },
  },
})

export const { setTab, setLang, setTheme } = uiSlice.actions
export const uiReducer = uiSlice.reducer
