#!/usr/bin/env node
/**
 * Fold the marathons the club's spreadsheets don't cover into public/jfk/.
 *
 * The sheets are exported once a year, so between exports the newest Budapest
 * Marathon is missing from them. This reads those editions from the results API,
 * works out which club member each finisher is, writes the times into the band
 * files and rebalances the bands, so the app itself needs no API call at all.
 *
 *   node scripts/update-jubilee.mjs [--dry-run] [--dir public/jfk]
 *
 * Matching is deliberately strict: the permanent bib club members keep, then the
 * name narrowed by town or club. A finisher who can't be pinned to exactly one
 * member is left out — a wrong match would invent a finish for the wrong person.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const API = process.env.FUTANET_API ?? 'https://results.futanet.hu/api'
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const DIR = args.includes('--dir') ? args[args.indexOf('--dir') + 1] : 'public/jfk'

/** Entry bar for the club, and the bands above it (see scripts/jfk_from_xlsx.py). */
const MIN_FINISHES = 6
const PENDING = 'pending'

const bandOf = (finishes) => {
  if (finishes < MIN_FINISHES) return PENDING
  if (finishes >= 31) return '31plus'
  const start = Math.floor((finishes - MIN_FINISHES) / 5) * 5 + MIN_FINISHES
  return `${start}-${start + 4}`
}

const bandRange = (id) => {
  if (id === PENDING) return [0, MIN_FINISHES - 1]
  if (id === '31plus') return [31, null]
  const [from, to] = id.split('-').map(Number)
  return [from, to]
}

/** Sort key for the bands, biggest first, with the waiting room last. */
const bandOrder = (id) => (id === PENDING ? -1 : bandRange(id)[0])

const fold = (s) =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(dr|ifj|id|prof)\.?\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

async function api(path, { method = 'GET', body, page } = {}) {
  const url = new URL(API + path)
  if (page) url.searchParams.set('page', String(page))
  const res = await fetch(url, { method, body })
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  const type = res.headers.get('content-type') ?? ''
  if (!type.includes('json')) throw new Error(`${path}: expected JSON, got ${type}`)
  return res.json()
}

/** Budapest Marathon editions, newest first: the plain list of each year only. */
async function marathonEditions() {
  const list = await api('/raceList')
  const races = [...(list.current ?? []), ...(list.past ?? []), ...(list.future ?? [])]
  const byYear = new Map()
  for (const race of races) {
    if (!/budapest.*maraton|maraton.*budapest/i.test(race.name)) continue
    if (/bajnoks|HB és WC|páros|parban|stafét|váltó|trió|fut a |csapat|mini|családi|virtuális/i.test(race.name)) continue
    const year = Number(String(race.date).slice(0, 4))
    if (!Number.isInteger(year)) continue
    const seen = byYear.get(year)
    if (!seen || race.name.length < seen.name.length) byYear.set(year, race)
  }
  return [...byYear.entries()].sort((a, b) => b[0] - a[0]).map(([year, race]) => ({ year, race }))
}

async function allResults(code) {
  const first = await api(`/resultList/${encodeURIComponent(code)}`, { method: 'POST', body: new FormData(), page: 1 })
  const rows = [...first.data]
  for (let page = 2; page <= first.meta.last_page; page++) {
    const next = await api(`/resultList/${encodeURIComponent(code)}`, { method: 'POST', body: new FormData(), page })
    rows.push(...next.data)
  }
  return rows
}

const finishTime = (row) => {
  const raw = String(row.netto || row.brutto || '').trim()
  const m = /^(\d{1,2}:\d{2}:\d{2})/.exec(raw)
  return m ? m[1] : null
}

async function readBands(dir) {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json') && f !== 'index.json')
  const index = JSON.parse(await readFile(join(dir, 'index.json'), 'utf8'))
  const runners = []
  for (const file of files) {
    const data = JSON.parse(await readFile(join(dir, file), 'utf8'))
    runners.push(...data.runners)
  }
  return { index, runners }
}

async function writeBands(dir, index, runners) {
  const bands = new Map()
  for (const runner of runners) {
    const id = bandOf(Object.keys(runner.r).length)
    bands.set(id, [...(bands.get(id) ?? []), runner])
  }
  const years = new Set(index.years)
  for (const runner of runners) for (const year of Object.keys(runner.r)) years.add(Number(year))

  const listed = []
  for (const id of [...bands.keys()].sort((a, b) => bandOrder(b) - bandOrder(a))) {
    const group = bands.get(id).sort((a, b) => {
      const d = Object.keys(b.r).length - Object.keys(a.r).length
      return d || fold(a.n).localeCompare(fold(b.n), 'hu')
    })
    const body = JSON.stringify({ band: id, runners: group })
    if (!DRY_RUN) await writeFile(join(dir, `${id}.json`), body)
    const [from, to] = bandRange(id)
    listed.push({ id, from, to, runners: group.length, bytes: Buffer.byteLength(body) })
    console.log(`  ${id}: ${group.length} runners, ${Math.round(Buffer.byteLength(body) / 1024)} kB`)
  }
  const next = { ...index, years: [...years].sort((a, b) => a - b), bands: listed }
  if (!DRY_RUN) await writeFile(join(dir, 'index.json'), JSON.stringify(next))
}

async function main() {
  const { index, runners } = await readBands(DIR)
  const covered = Math.min(...runners.map((r) => r.u))
  console.log(`${runners.length} runners, sheets complete through ${covered}`)

  const editions = (await marathonEditions()).filter((e) => e.year > covered)
  if (!editions.length) {
    console.log('Nothing to add: the sheets already cover every edition.')
    return
  }

  const byBib = new Map()
  const byName = new Map()
  runners.forEach((runner, i) => {
    if (runner.b) byBib.set(String(runner.b).trim(), i)
    const key = fold(runner.n)
    byName.set(key, [...(byName.get(key) ?? []), i])
  })

  let added = 0
  for (const { year, race } of editions.sort((a, b) => a.year - b.year)) {
    const rows = await allResults(race.id)
    let matched = 0
    let ambiguous = 0
    for (const row of rows) {
      const time = finishTime(row)
      if (!time) continue
      const bib = String(row.rajtszam ?? '').trim()
      let hit = bib ? byBib.get(bib) : undefined
      if (hit === undefined) {
        const candidates = byName.get(fold(row.nev)) ?? []
        if (candidates.length === 1) hit = candidates[0]
        else if (candidates.length > 1) {
          const town = fold(row.varos)
          const club = fold(row.egyesulet)
          const narrowed = candidates.filter(
            (i) => (town && fold(runners[i].t) === town) || (club && fold(runners[i].c) === club),
          )
          if (narrowed.length === 1) hit = narrowed[0]
          else ambiguous++
        }
      }
      if (hit === undefined) continue
      matched++
      const runner = runners[hit]
      // the spreadsheets always win: only years they didn't account for are filled in
      if (year > runner.u && !runner.r[String(year)]) {
        runner.r[String(year)] = time
        added++
      }
    }
    for (const runner of runners) runner.u = Math.max(runner.u, year)
    console.log(`${race.name} (${year}, ${race.id}): ${rows.length} finishers, ${matched} club members, ${ambiguous} ambiguous`)
  }

  console.log(`${added} finishes added`)
  await writeBands(DIR, index, runners)
  if (DRY_RUN) console.log('(dry run: nothing written)')
}

await main()
