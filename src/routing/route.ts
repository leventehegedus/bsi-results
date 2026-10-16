import type { ResultFilters } from '@/api/types'
import { DISTANCE_CATEGORIES, type DistanceCategory } from '@/lib/distance'
import type { RunnerQuery } from '@/features/runner/runnerSlice'
import type { AppTab } from '@/features/ui/uiSlice'
import type { ResultView } from '@/features/results/resultsSlice'

/**
 * Everything a link needs to restore: which tab, and what that tab is showing.
 * Hashes (not paths) so the Vercel static hosting needs no rewrite rules.
 *
 *   #/races
 *   #/race/2026_spar_42?town=Zsomb%C3%B3&page=3&view=weather
 *   #/town/Mak%C3%B3,Zsomb%C3%B3?dist=marathon,half
 *   #/runner/Heged%C3%BCs%20Levente?yob=1992&exact=1
 */
export interface Route {
  tab: AppTab
  race: { id: string; filters: ResultFilters; page: number; view: ResultView } | null
  town: { towns: string; categories: DistanceCategory[] } | null
  runner: RunnerQuery | null
}

export const EMPTY_ROUTE: Route = { tab: 'races', race: null, town: null, runner: null }

const VIEWS: ResultView[] = ['results', 'breakdown', 'splits', 'weather']
/** Filters that travel in the URL; the rest are rarely worth sharing. */
const FILTER_KEYS = [
  'name',
  'sex',
  'club',
  'town',
  'bib',
  'category',
  'country',
  'minNetTime',
  'maxNetTime',
  'minYob',
  'maxYob',
  'minPlace',
  'maxPlace',
] as const satisfies readonly (keyof ResultFilters)[]

export function formatRoute(r: Route): string {
  if (r.tab === 'races') {
    if (!r.race) return '#/races'
    const p = new URLSearchParams()
    for (const k of FILTER_KEYS) {
      const v = r.race.filters[k]
      if (v != null && v !== '') p.set(k, v)
    }
    if (r.race.page > 1) p.set('page', String(r.race.page))
    if (r.race.view !== 'results') p.set('view', r.race.view)
    return `#/race/${encodeURIComponent(r.race.id)}${query(p)}`
  }
  if (r.tab === 'town') {
    if (!r.town?.towns.trim()) return '#/town'
    const p = new URLSearchParams()
    // only when it isn't "everything", which is the default
    if (r.town.categories.length !== DISTANCE_CATEGORIES.length) p.set('dist', r.town.categories.join(','))
    const towns = r.town.towns.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
    return `#/town/${towns.map(encodeURIComponent).join(',')}${query(p)}`
  }
  if (r.tab === 'jubilee') return '#/jubilee'
  if (!r.runner?.name) return '#/runner'
  const p = new URLSearchParams()
  if (r.runner.yob) p.set('yob', String(r.runner.yob))
  if (r.runner.town) p.set('town', r.runner.town)
  if (r.runner.exact) p.set('exact', '1')
  return `#/runner/${encodeURIComponent(r.runner.name)}${query(p)}`
}

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, '')
  if (!raw) return EMPTY_ROUTE
  // links shared before the routes existed: #runner=Name&yob=1992
  if (!raw.startsWith('/')) return legacyRunner(raw)

  const [path, search] = splitOnce(raw, '?')
  const p = new URLSearchParams(search)
  const [, section, rest] = path.split('/')

  if (section === 'race' && rest) {
    const filters: ResultFilters = {}
    for (const k of FILTER_KEYS) {
      const v = p.get(k)?.trim()
      if (v) filters[k] = v
    }
    const page = Number(p.get('page'))
    const view = p.get('view') as ResultView | null
    return {
      ...EMPTY_ROUTE,
      race: {
        id: decodeURIComponent(rest),
        filters,
        page: Number.isInteger(page) && page > 0 ? page : 1,
        view: view && VIEWS.includes(view) ? view : 'results',
      },
    }
  }
  if (section === 'town') {
    const towns = (rest ?? '')
      .split(',')
      .map((s) => decodeURIComponent(s).trim())
      .filter(Boolean)
    const dist = (p.get('dist') ?? '')
      .split(',')
      .filter((c): c is DistanceCategory => DISTANCE_CATEGORIES.includes(c as DistanceCategory))
    return {
      ...EMPTY_ROUTE,
      tab: 'town',
      town: { towns: towns.join(', '), categories: dist.length ? dist : [...DISTANCE_CATEGORIES] },
    }
  }
  if (section === 'jubilee') return { ...EMPTY_ROUTE, tab: 'jubilee' }
  if (section === 'runner') {
    const name = rest ? decodeURIComponent(rest).trim() : ''
    if (!name) return { ...EMPTY_ROUTE, tab: 'runner' }
    return { ...EMPTY_ROUTE, tab: 'runner', runner: runnerQuery(name, p) }
  }
  return EMPTY_ROUTE
}

/**
 * Two routes are the same "page" when they differ only in filters, paging or the
 * sub-view — those replace the history entry instead of adding one, so the back
 * button steps between races and runners rather than through every keystroke.
 */
export function routeIdentity(r: Route): string {
  if (r.tab === 'races') return `race:${r.race?.id ?? ''}`
  if (r.tab === 'town') return `town:${r.town?.towns ?? ''}`
  if (r.tab === 'jubilee') return 'jubilee'
  return `runner:${r.runner?.name ?? ''}|${r.runner?.yob ?? ''}`
}

function runnerQuery(name: string, p: URLSearchParams): RunnerQuery {
  const yob = Number(p.get('yob'))
  return {
    name,
    yob: Number.isInteger(yob) && yob > 1900 ? yob : null,
    exact: p.get('exact') === '1',
    town: p.get('town')?.trim() || null,
  }
}

function legacyRunner(raw: string): Route {
  const p = new URLSearchParams(raw)
  const name = p.get('runner')?.trim()
  if (!name) return EMPTY_ROUTE
  return { ...EMPTY_ROUTE, tab: 'runner', runner: runnerQuery(name, p) }
}

function query(p: URLSearchParams) {
  // commas separate list values and read better unescaped (?dist=marathon,half)
  const s = p.toString().replace(/%2C/g, ',')
  return s ? `?${s}` : ''
}

function splitOnce(s: string, sep: string): [string, string] {
  const i = s.indexOf(sep)
  return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]
}
