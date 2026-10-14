import legacy from './legacyRaces.json'

export interface LegacyRace {
  id: string
  name: string
  date: string
  /** distance in metres as reported by the API (0 = unknown) */
  tav: number
}

/**
 * 390 races from 1984–2017 that exist in the API but are not returned by
 * /raceList. Found by probing /race/{code} with every code suffix used in
 * 2018–2020 (e.g. "_spar_e", "_nike_e", "_balaton_f_e") for each earlier year,
 * plus the Budapest Marathon sponsor names (ibusz, mars, kaiser, plus).
 * Lists marked empty ("ures") are left out. No 2009 Budapest Marathon was found.
 */
export const LEGACY_RACES: LegacyRace[] = legacy as LegacyRace[]
