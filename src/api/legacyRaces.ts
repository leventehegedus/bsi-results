import legacy from './legacyRaces.json'

export interface LegacyRace {
  id: string
  name: string
  date: string
  /** distance in metres as reported by the API (0 = unknown) */
  tav: number
}

/**
 * 542 races from 1984–2019 that exist in the API but are not returned by
 * /raceList. Found by probing /race/{code} with every code suffix used in
 * 2018–2022 (e.g. "_spar_e", "_nike_e", "_balaton_f_e"), with and without the
 * "_e" ending older codes lack ("2008_nike"), for each earlier year, plus the
 * Budapest Marathon sponsor names (ibusz, mars, kaiser, plus). Empty lists
 * ("ures") and start lists are left out. No 2009 Budapest Marathon was found.
 */
export const LEGACY_RACES: LegacyRace[] = legacy as LegacyRace[]
