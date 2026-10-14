import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { runnerKey } from '@/lib/results'

export interface FavouriteRace {
  id: string
  name: string
  date: string
}

export interface FavouriteRunner {
  name: string
  yob: number | null
}

export interface FavouritesState {
  races: FavouriteRace[]
  towns: string[]
  runners: FavouriteRunner[]
}

const STORAGE_KEY = 'bsi:favourites:v1'
/** Plenty for a person's own shortlist, and keeps the stored value small. */
const MAX = 50

const empty: FavouritesState = { races: [], towns: [], runners: [] }

function load(): FavouritesState {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<FavouritesState> | null
    if (!raw) return empty
    return {
      races: Array.isArray(raw.races) ? raw.races.filter((r) => r?.id).slice(0, MAX) : [],
      towns: Array.isArray(raw.towns) ? raw.towns.filter(Boolean).slice(0, MAX) : [],
      runners: Array.isArray(raw.runners) ? raw.runners.filter((r) => r?.name).slice(0, MAX) : [],
    }
  } catch {
    return empty
  }
}

function save(state: FavouritesState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // storage blocked or full: favourites just won't survive the session
  }
}

/** Same person, however the name was typed ("Dr. Kiss Péter" / "Kiss Péter"). */
export const sameRunner = (a: FavouriteRunner, b: FavouriteRunner) =>
  runnerKey(a.name) === runnerKey(b.name) && (a.yob ?? null) === (b.yob ?? null)

export const sameTown = (a: string, b: string) =>
  a.localeCompare(b, 'hu', { sensitivity: 'base' }) === 0

const favouritesSlice = createSlice({
  name: 'favourites',
  initialState: load(),
  reducers: {
    toggleRace(s, a: PayloadAction<FavouriteRace>) {
      const i = s.races.findIndex((r) => r.id === a.payload.id)
      if (i >= 0) s.races.splice(i, 1)
      else s.races = [a.payload, ...s.races].slice(0, MAX)
      save(s)
    },
    toggleTown(s, a: PayloadAction<string>) {
      const town = a.payload.trim()
      if (!town) return
      const i = s.towns.findIndex((t) => sameTown(t, town))
      if (i >= 0) s.towns.splice(i, 1)
      else s.towns = [town, ...s.towns].slice(0, MAX)
      save(s)
    },
    toggleRunner(s, a: PayloadAction<FavouriteRunner>) {
      const i = s.runners.findIndex((r) => sameRunner(r, a.payload))
      if (i >= 0) s.runners.splice(i, 1)
      else s.runners = [a.payload, ...s.runners].slice(0, MAX)
      save(s)
    },
  },
})

export const { toggleRace, toggleTown, toggleRunner } = favouritesSlice.actions
export const favouritesReducer = favouritesSlice.reducer
