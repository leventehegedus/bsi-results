import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react'
import { withRetry } from '@/lib/retry'
import { errorMessage } from '@/store/createAppAsyncThunk'
import type { ApiError } from './futanetApi'
import { getDayWeather, searchPlaces, type DayWeather, type Place } from './weather'

export interface DayWeatherArgs {
  lat: number
  lon: number
  date: string
}

/**
 * Cached Open-Meteo access. Past weather doesn't change, so a day at a place is
 * fetched once per session and kept for a day.
 */
export const weatherApi = createApi({
  reducerPath: 'weatherApi',
  baseQuery: fakeBaseQuery<ApiError>(),
  keepUnusedDataFor: 24 * 60 * 60,
  endpoints: (build) => ({
    dayWeather: build.query<DayWeather, DayWeatherArgs>({
      queryFn: async ({ lat, lon, date }, { signal }) => {
        try {
          const place: Place = { name: '', lat, lon }
          return { data: await withRetry(() => getDayWeather(place, date, { signal }), { signal }) }
        } catch (e) {
          return { error: { message: errorMessage(e) } }
        }
      },
      // ~1 km rounding: nearby picks share the same grid cell anyway
      serializeQueryArgs: ({ queryArgs: { lat, lon, date } }) => `${lat.toFixed(2)},${lon.toFixed(2)},${date}`,
    }),
    places: build.query<Place[], { name: string; lang: 'hu' | 'en' }>({
      queryFn: async ({ name, lang }, { signal }) => {
        try {
          return { data: await searchPlaces(name, lang, { signal }) }
        } catch (e) {
          return { error: { message: errorMessage(e) } }
        }
      },
    }),
  }),
})

export const { useDayWeatherQuery, usePlacesQuery } = weatherApi
