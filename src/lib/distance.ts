/** Distance buckets used by the Town search filters. */
export type DistanceCategory = 'marathon' | 'half' | '10k' | '5k' | 'other'

/** In display order; their names are in the i18n texts (`distance`). */
export const DISTANCE_CATEGORIES: DistanceCategory[] = ['marathon', 'half', '10k', '5k', 'other']

/**
 * Not one runner's run at that distance: team/relay/pair/stage formats, and
 * walks/hikes ("Helló Ősz! Gyalogtúra 5 km").
 */
const TEAM_OR_STAGES =
  /stafét|staféta|váltó|valto|páros|paros|párban|parban|trió|trio|részlet|részben|szakasz|fut a cég|csapat|relay|túra|gyalog/i

/**
 * Bucket a race by its distance in metres, falling back to the name when the
 * API reports 0 (common for pre-2013 races).
 */
export function categorize(name: string, tav: number | null | undefined): DistanceCategory {
  if (TEAM_OR_STAGES.test(name)) return 'other'
  const m = tav ?? 0
  if (m > 0) {
    if (m >= 42000 && m <= 42400) return 'marathon'
    if (m >= 21000 && m <= 21200) return 'half'
    if (m >= 9900 && m <= 10100) return '10k'
    if (m >= 4900 && m <= 5100) return '5k'
    return 'other'
  }
  const n = name.toLowerCase()
  if (/f[eé]lmaraton|half marathon|\b21([.,]1)?\s?km\b/.test(n)) return 'half'
  if (/negyed|harmad|hatod|nyolcad|mini|midi|szuper|ultra/.test(n)) return 'other'
  if (/maraton|marathon|\b42([.,]2)?\s?km\b/.test(n)) return 'marathon'
  if (/\b10\s?km\b|\b10k\b/.test(n)) return '10k'
  if (/\b5\s?km\b|\b5k\b/.test(n)) return '5k'
  return 'other'
}
