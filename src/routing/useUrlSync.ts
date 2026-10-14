import { useEffect, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { openRaceRoute } from '@/features/results/resultsSlice'
import { setCategories, setTownsInput } from '@/features/townScan/townScanSlice'
import { prefillQuery } from '@/features/runner/runnerSlice'
import { setTab } from '@/features/ui/uiSlice'
import type { RootState } from '@/store'
import { EMPTY_ROUTE, formatRoute, parseRoute, routeIdentity, type Route } from './route'

/** The route the current state describes. */
function currentRoute(s: RootState): Route {
  return {
    tab: s.ui.tab,
    race: s.results.raceId
      ? { id: s.results.raceId, filters: s.results.filters, page: s.results.page, view: s.results.view }
      : null,
    town: { towns: s.townScan.townsInput, categories: s.townScan.categories },
    runner: s.runner.query,
  }
}

/**
 * Keeps the address bar and the store in step, so every view can be linked to.
 * The store is the source of truth: the URL is rewritten whenever the state
 * changes, and parsed back only on the first load and on back/forward.
 */
export function useUrlSync() {
  const dispatch = useAppDispatch()
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
      if (r.town) {
        dispatch(setTownsInput(r.town.towns))
        dispatch(setCategories(r.town.categories))
      }
      // the scan itself is thousands of requests, so a link only fills the form in
      if (r.runner) dispatch(prefillQuery(r.runner))
    }
    apply()
    window.addEventListener('popstate', apply)
    window.addEventListener('hashchange', apply)
    return () => {
      window.removeEventListener('popstate', apply)
      window.removeEventListener('hashchange', apply)
    }
  }, [dispatch])

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
