import type { BreakdownRow, PlaceCount } from './breakdown'

/** public/hu-map.json, built by scripts/hungary_map.py; coordinates are viewBox units */
export interface HungaryMap {
  width: number
  height: number
  kmPerUnit: number
  /** SVG path of the border */
  outline: string
  /** [name, x, y], biggest first */
  towns: [string, number, number][]
}

export interface HeatCell {
  x: number
  y: number
  count: number
  /** most finishers first */
  towns: PlaceCount[]
}

export interface HungaryHeat {
  /** most finishers first */
  cells: HeatCell[]
  /** finishers from Hungary */
  total: number
  /** of those, finishers whose town was found on the map */
  placed: number
}

/** "-Győr " → "gyor": spellings are typed by hand, often without accents. */
function fold(name: string) {
  return name
    .replace(/^[^\p{L}]+/u, '')
    .trim()
    .toLocaleLowerCase('hu')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

/** Whole-name match, then without "(…)", then the first word: "Szeged (Szentmihály)", "Debrecen Pallag". */
function findTown<T>(city: string, byName: Map<string, T>): T | undefined {
  const name = fold(city)
  if (/^(budapest|bp\b)/.test(name)) return byName.get('budapest') // "Budapest XI.", "Bp."
  const bare = name.replace(/\s*\(.*/, '')
  return byName.get(name) ?? byName.get(bare) ?? byName.get(bare.split(' ')[0])
}

/** Finishers from Hungary counted per town and per square of the grid. */
export function hungaryHeat(rows: BreakdownRow[], map: HungaryMap, cellSize: number): HungaryHeat {
  const byName = new Map<string, HungaryMap['towns'][number]>()
  for (const town of map.towns) {
    const key = fold(town[0])
    if (!byName.has(key)) byName.set(key, town) // biggest first: the largest keeps a shared name
  }

  const home = rows.filter((r) => r.country === 'HUN')
  const perTown = new Map<HungaryMap['towns'][number], number>()
  let placed = 0
  for (const r of home) {
    const town = findTown(r.city, byName)
    if (!town) continue
    placed++
    perTown.set(town, (perTown.get(town) ?? 0) + 1)
  }

  const cells = new Map<string, HeatCell>()
  const byCount = (a: PlaceCount, b: PlaceCount) => b.count - a.count || a.name.localeCompare(b.name, 'hu')
  for (const [[name, x, y], count] of perTown) {
    const cx = Math.floor(x / cellSize)
    const cy = Math.floor(y / cellSize)
    const key = `${cx},${cy}`
    const cell = cells.get(key) ?? { x: cx * cellSize, y: cy * cellSize, count: 0, towns: [] }
    cell.count += count
    cell.towns.push({ name, count })
    cells.set(key, cell)
  }
  for (const cell of cells.values()) cell.towns.sort(byCount)

  return {
    cells: [...cells.values()].sort((a, b) => b.count - a.count),
    total: home.length,
    placed,
  }
}
