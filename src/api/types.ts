/** Entry of GET /raceList/ */
export interface RaceListItem {
  id: string
  name: string
  date: string
}

export interface RaceListResponse {
  current?: RaceListItem[]
  past?: RaceListItem[]
  future?: RaceListItem[]
}

/** GET /race/{code} — field names are the API's Hungarian originals. */
export interface RaceMeta {
  kod: string
  csoport: string
  /** "eredmeny" = has results, "ures" = empty */
  statusz: string
  /** number of finishers */
  meret: number
  nev: string
  nev_eng: string | null
  datum: string
  /** distance in metres (0 for some legacy races) */
  tav: number
  sorozat: string | null
  /**
   * Name of the certificate template ("oklevel_2026_spar_42k"), or null for races
   * that have none — only then does GET /pdf/{code}/{bib} return a certificate.
   */
  oklevel?: string | null
}

/** One row of POST /resultList/{code}. Split-time columns (reszido_N) vary per race. */
export interface ResultRow {
  hely: number | null
  nev: string
  kategoria?: string | null
  kat_hely?: string | null
  netto?: string | null
  brutto?: string | null
  orszag?: string | null
  varos?: string | null
  egyesulet?: string | null
  rajtszam?: string | null
  [splitOrOther: string]: string | number | null | undefined
}

export interface Paginated<T> {
  data: T[]
  meta: {
    current_page: number
    last_page: number
    per_page: number
    total: number
    from: number | null
    to: number | null
    team?: boolean
  }
}

/** GET /fields/{code} */
export interface FieldDef {
  mezo: string
  sorrend: number
  hide: number
  header_hu: string
  header_en: string
}

/** Filters accepted by POST /resultList/{code} (sent as multipart form data). */
export interface ResultFilters {
  name?: string
  sex?: string
  club?: string
  town?: string
  bib?: string
  category?: string
  country?: string
  minNetTime?: string
  maxNetTime?: string
  minYob?: string
  maxYob?: string
  minPlace?: string
  maxPlace?: string
}
