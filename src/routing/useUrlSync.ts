import { useEffect, useRef } from 'react'
import { createSelector } from '@reduxjs/toolkit'
import { useStore } from 'react-redux'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { clearRace, openRaceRoute } from '@/features/results/resultsSlice'
import { setCategories, setTownsInput } from '@/features/townScan/townScanSlice'
import { cancelRunner } from '@/features/runner/runnerActions'
import { clearRunner, prefillQuery, type RunnerQuery } from '@/features/runner/runnerSlice'
import { setBand } from '@/features/jubilee/jubileeSlice'
import { setTab } from '@/features/ui/uiSlice'
import type { RootState } from '@/store'
import { EMPTY_ROUTE, formatRoute, parseRoute, routeIdentity, type Route } from './route'

/**
 * The route the current state describes. Memoized: a new object only when one of
 * its parts changes, so components using it don't re-render on unrelated updates.
 */
const currentRoute = createSelector(
  [
    (s: RootState) => s.ui.tab,
    (s: RootState) => s.results.raceId,
    (s: RootState) => s.results.filters,
    (s: RootState) => s.results.page,
    (s: RootState) => s.results.view,
    (s: RootState) => s.townScan.townsInput,
    (s: RootState) => s.townScan.categories,
    (s: RootState) => s.runner.query,
    (s: RootState) => s.jubilee.band,
  ],
  (tab, raceId, filters, page, view, towns, categories, runner, band): Route => ({
    tab,
    band: band || null,
    race: raceId ? { id: raceId, filters, page, view } : null,
    town: { towns, categories },
    runner,
  }),
)

/** Same person and search, whichever way the query was built (link, form or result row). */
function sameRunner(a: RunnerQuery | null, b: RunnerQuery | null) {
  if (!a || !b) return a === b
  return a.name === b.name && (a.yob ?? null) === (b.yob ?? null) && !!a.exact === !!b.exact && (a.town ?? null) === (b.town ?? null)
}

/**
 * Keeps the address bar and the store in step, so every view can be linked to.
 * The store is the source of truth: the URL is rewritten whenever the state
 * changes, and parsed back only on the first load and on back/forward.
 */
export function useUrlSync() {
  const dispatch = useAppDispatch()
  const store = useStore<RootState>()
  const route = useAppSelector(currentRoute)
  const hash = formatRoute(route)
  // what we last wrote or read, so our own writes don't look like navigation
  const known = useRef<string | null>(null)
  const identity = useRef(routeIdentity(EMPTY_ROUTE))

  // first load and back/forward
  useEffect(() => {
    const apply = () => {
      if (location.hash === known.current) return
      known.current = location.hash
      const r = parseRoute(location.hash)
      identity.current = routeIdentity(r)
      dispatch(setTab(r.tab))
      if (r.race) dispatch(openRaceRoute({ raceId: r.race.id, filters: r.race.filters, page: r.race.page, view: r.race.view }))
      // back to the race list without a race: don't leave the previous one on screen
      else if (r.tab === 'races') dispatch(clearRace())
      if (r.band) dispatch(setBand(r.band))
      if (r.town) {
        dispatch(setTownsInput(r.town.towns))
        dispatch(setCategories(r.town.categories))
      }
      // The scan itself is thousands of requests, so a link only fills the form in.
      // A different runner (or none) than the one on screen: stop any search and
      // clear the old profile first; the same runner keeps what's already loaded.
      const shown = store.getState().runner.query
      if (r.runner || r.tab === 'runner') {
        if (!sameRunner(r.runner, shown)) {
          cancelRunner()
          dispatch(clearRunner())
        }
        if (r.runner) dispatch(prefillQuery(r.runner))
      }
    }
    apply()
    window.addEventListener('popstate', apply)
    window.addEventListener('hashchange', apply)
    return () => {
      window.removeEventListener('popstate', apply)
      window.removeEventListener('hashchange', apply)
    }
  }, [dispatch, store])

  useEffect(() => {
    if (hash === known.current || hash === location.hash) {
      known.current = location.hash
      return
    }
    const id = routeIdentity(route)
    const url = hash || location.pathname + location.search
    // a different race / runner / town list is a new entry; filters and paging replace it
    if (id !== identity.current) history.pushState(null, '', url)
    else history.replaceState(null, '', url)
    identity.current = id
    known.current = location.hash
  }, [hash, route])
}
