import { cleanTime, timeToSeconds } from './results'

/**
 * Pace in seconds per km from a net finish time ("00:21:03.00") and the race
 * distance in metres; null when either is missing.
 */
export function pacePerKm(netTime: string | null | undefined, metres: number | null | undefined): number | null {
  if (!metres || metres <= 0) return null
  const seconds = timeToSeconds(cleanTime(netTime))
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return seconds / (metres / 1000)
}

/** 275.4 → "4:35" (minutes:seconds per km); "" for no pace. */
export function formatPace(secondsPerKm: number | null): string {
  if (secondsPerKm === null) return ''
  const s = Math.round(secondsPerKm)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
