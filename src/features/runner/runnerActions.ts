import type { AppDispatch } from '@/store'
import { setTab } from '@/features/ui/uiSlice'
import type { RaceListItem } from '@/api/types'
import { openRunner, scanRunner, type RunnerQuery } from './runnerSlice'

/** Only one profile lookup runs at a time; starting a new one cancels the previous. */
let active: { abort: () => void } | null = null

export function cancelRunner() {
  active?.abort()
  active = null
}

/**
 * Open the exact person behind a result row. When the birth year is already
 * known (rows inside a profile) the lookup is skipped.
 */
export function openRunnerFromResult(
  dispatch: AppDispatch,
  arg: Parameters<typeof openRunner>[0] & { yob?: number | null },
) {
  cancelRunner()
  writeHash(null)
  if (arg.yob) {
    dispatch(setTab('runner'))
    active = dispatch(scanRunner({ name: arg.name, yob: arg.yob, exact: true }))
  } else {
    active = dispatch(openRunner(arg))
  }
}

/** Scan all races for `query`, or only `races` (retrying failed ones). */
export function searchRunner(dispatch: AppDispatch, query: RunnerQuery, races?: RaceListItem[]) {
  cancelRunner()
  active = dispatch(scanRunner({ ...query, races }))
}

/** Shareable link: #runner=<name>&yob=<year>&exact=1 */
export function writeHash(query: RunnerQuery | null) {
  const next = query
    ? '#' +
      new URLSearchParams({
        runner: query.name,
        ...(query.yob ? { yob: String(query.yob) } : {}),
        ...(query.exact ? { exact: '1' } : {}),
      }).toString()
    : ''
  if (location.hash !== next) history.replaceState(null, '', next || location.pathname + location.search)
}

export function readHash(): RunnerQuery | null {
  const p = new URLSearchParams(location.hash.slice(1))
  const name = p.get('runner')?.trim()
  if (!name) return null
  const yob = Number(p.get('yob'))
  return { name, yob: Number.isInteger(yob) && yob > 1900 ? yob : null, exact: p.get('exact') === '1' }
}
