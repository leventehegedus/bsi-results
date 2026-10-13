import type { AppDispatch } from '@/store'
import { openRunner, scanRunner, type RunnerQuery } from './runnerSlice'

/** Only one profile lookup runs at a time; starting a new one cancels the previous. */
let active: { abort: () => void } | null = null

export function cancelRunner() {
  active?.abort()
  active = null
}

export function openRunnerFromResult(dispatch: AppDispatch, arg: Parameters<typeof openRunner>[0]) {
  cancelRunner()
  active = dispatch(openRunner(arg))
  writeHash(null)
}

export function searchRunner(dispatch: AppDispatch, query: RunnerQuery) {
  cancelRunner()
  active = dispatch(scanRunner(query))
}

/** Shareable link: #runner=<name>&yob=<year> */
export function writeHash(query: RunnerQuery | null) {
  const next = query
    ? '#' + new URLSearchParams({ runner: query.name, ...(query.yob ? { yob: String(query.yob) } : {}) }).toString()
    : ''
  if (location.hash !== next) history.replaceState(null, '', next || location.pathname + location.search)
}

export function readHash(): RunnerQuery | null {
  const p = new URLSearchParams(location.hash.slice(1))
  const name = p.get('runner')?.trim()
  if (!name) return null
  const yob = Number(p.get('yob'))
  return { name, yob: Number.isInteger(yob) && yob > 1900 ? yob : null }
}
