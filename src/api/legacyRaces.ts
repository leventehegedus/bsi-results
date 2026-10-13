/**
 * Budapest Marathon editions that exist in the API but are NOT returned by
 * /raceList/. Codes were discovered by probing /race/{code}; 1994–95 the race
 * was not held and no code was found for 2009.
 */
export const LEGACY_BUDAPEST_MARATHON_CODES: string[] = [
  ...range(1984, 1992).map((y) => `${y}_ibusz`),
  '1993_mars',
  ...range(1996, 2003).map((y) => `${y}_kaiser`),
  ...range(2004, 2008).map((y) => `${y}_plus`),
  ...range(2010, 2017).map((y) => `${y}_spar_e`),
]

function range(from: number, to: number) {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i)
}
