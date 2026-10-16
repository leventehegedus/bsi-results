import { useEffect, useRef, useState } from 'react'
import { Download, Loader2, Medal, Search } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { downloadCsv, toCsv } from '@/lib/csv'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { ShareLink } from '@/routing/ShareLink'
import { searchRunner } from '@/features/runner/runnerActions'
import { setTab } from '@/features/ui/uiSlice'
import {
  loadClub,
  MIN_FINISHES,
  selectMembers,
  selectVisibleMembers,
  selectVisibleYears,
  setMinFinishes,
  setQuery,
  type ClubMember,
} from './jubileeSlice'

const THRESHOLDS = [MIN_FINISHES, 10, 15, 20, 25, 30]
/** TableCell's own horizontal padding (p-2 on each side). */
const CELL_PADDING = 16

/** Everyone who has finished the Budapest Marathon more than five times. */
export function JubileeClub() {
  const dispatch = useAppDispatch()
  const t = useT()
  const j = useAppSelector((s) => s.jubilee)
  const all = useAppSelector(selectMembers)
  const members = useAppSelector(selectVisibleMembers)
  const years = useAppSelector(selectVisibleYears)
  // the name column is pinned where the index column ends, which depends on how many
  // members are listed ("1" vs "2219"), so it's measured rather than assumed
  const indexCell = useRef<HTMLTableCellElement>(null)
  const [indexWidth, setIndexWidth] = useState(48)

  useEffect(() => {
    const el = indexCell.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setIndexWidth(e.contentRect.width + CELL_PADDING))
    ro.observe(el)
    return () => ro.disconnect()
  }, [j.status])

  useEffect(() => {
    dispatch(loadClub())
  }, [dispatch])

  const exportCsv = () => {
    const csv = toCsv(
      [t.col.name, t.col.birthYear, t.col.club, t.col.town, t.jubilee.finishes, t.jubilee.best, ...years.map(String)],
      members.map((m) => [m.n, m.y ?? '', m.c, m.t, m.finishes, m.best, ...years.map((y) => m.r[String(y)] ?? '')]),
    )
    downloadCsv(`jubileumi-futok-${j.minFinishes}plusz.csv`, csv)
  }

  /** Open this member's profile: the name and birth year are already known here. */
  const openRunner = (m: ClubMember) => {
    dispatch(setTab('runner'))
    searchRunner(dispatch, { name: m.n, yob: m.y, exact: true })
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Medal className="text-brand size-5" /> {t.jubilee.title}
          </CardTitle>
          <CardDescription>{t.jubilee.description(MIN_FINISHES)}</CardDescription>
          <CardAction>
            <ShareLink />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                className="pl-8"
                aria-label={t.jubilee.search}
                placeholder={t.jubilee.search}
                value={j.query}
                onChange={(e) => dispatch(setQuery(e.target.value))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="min-finishes" className="text-muted-foreground shrink-0 text-xs font-normal">
                {t.jubilee.atLeast}
              </Label>
              <Select
                value={String(j.minFinishes)}
                onValueChange={(v) => dispatch(setMinFinishes(Number(v)))}
              >
                <SelectTrigger id="min-finishes" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {THRESHOLDS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {t.jubilee.finishCount(n)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="brand">{t.jubilee.members(all.length)}</Badge>
            {j.query && <Badge>{t.jubilee.matching(members.length)}</Badge>}
            {j.addedYears.length > 0 && (
              <Badge variant="secondary">{t.jubilee.addedYears(j.addedYears.join(', '))}</Badge>
            )}
            {j.topUp === 'running' && (
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <Loader2 className="size-3.5 animate-spin" />
                {t.jubilee.reading(j.pendingYears.join(', '))}
              </span>
            )}
            <Button variant="outline" size="sm" className="ml-auto" onClick={exportCsv} disabled={!members.length}>
              <Download /> {t.common.downloadCsv}
            </Button>
          </div>

          {j.status === 'failed' && (
            <Alert variant="destructive">
              <AlertTitle>{t.jubilee.failed}</AlertTitle>
              <AlertDescription>{j.error}</AlertDescription>
            </Alert>
          )}
          {j.topUp === 'failed' && j.status === 'ready' && (
            <Alert>
              <AlertTitle>{t.jubilee.topUpFailed}</AlertTitle>
              <AlertDescription>{t.jubilee.topUpFailedHint}</AlertDescription>
            </Alert>
          )}
          <p className="text-muted-foreground text-xs">{t.jubilee.sourceNote(j.source || 'BSI')}</p>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardContent>
          {j.status === 'loading' && (
            <div className="flex flex-col gap-2 py-2">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          )}

          {j.status === 'ready' && (
            <>
              {/* the wide year grid is unusable on a phone: cards there instead */}
              <div className="hidden rounded-md border sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead ref={indexCell} className="bg-table-head sticky left-0 z-20">
                        #
                      </TableHead>
                      <TableHead
                        className="bg-table-head sticky z-20 shadow-[1px_0_0_var(--border)]"
                        style={{ left: indexWidth }}
                      >
                        {t.col.name}
                      </TableHead>
                      <TableHead className="text-right">{t.jubilee.finishes}</TableHead>
                      <TableHead>{t.col.born}</TableHead>
                      <TableHead>{t.col.town}</TableHead>
                      <TableHead>{t.jubilee.best}</TableHead>
                      {years.map((y) => (
                        <TableHead key={y} className="text-center tabular-nums">
                          {y}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((m, i) => (
                      <TableRow key={`${m.n}-${m.y ?? ''}-${i}`} className="group/row">
                        <TableCell className="text-muted-foreground bg-card group-hover/row:bg-table-row-hover sticky left-0 z-20 tabular-nums">
                          {i + 1}
                        </TableCell>
                        <TableCell
                          className="bg-card group-hover/row:bg-table-row-hover sticky z-20 shadow-[1px_0_0_var(--border)]"
                          style={{ left: indexWidth }}
                        >
                          <button
                            type="button"
                            title={t.common.openRunner}
                            onClick={() => openRunner(m)}
                            className="text-primary decoration-brand cursor-pointer text-left font-medium decoration-2 underline-offset-4 hover:underline"
                          >
                            {m.n}
                          </button>
                          {m.c && <span className="text-muted-foreground block text-xs">{m.c}</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="brand">{m.finishes}</Badge>
                        </TableCell>
                        <TableCell className="tabular-nums">{m.y ?? ''}</TableCell>
                        <TableCell>{m.t}</TableCell>
                        <TableCell className="tabular-nums">{m.best}</TableCell>
                        {years.map((y) => {
                          const time = m.r[String(y)]
                          return (
                            <TableCell
                              key={y}
                              className={cn(
                                'text-center text-xs tabular-nums',
                                !time && 'text-muted-foreground/40',
                                time && m.live.includes(y) && 'text-brand font-medium',
                              )}
                              title={time && m.live.includes(y) ? t.jubilee.fromApi : undefined}
                            >
                              {time ? time.slice(0, 5) : '·'}
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <ul className="flex flex-col gap-2 sm:hidden">
                {members.slice(0, 200).map((m, i) => (
                  <li key={`${m.n}-${m.y ?? ''}-${i}`} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => openRunner(m)}
                          className="text-primary decoration-brand text-left font-medium decoration-2 underline-offset-4"
                        >
                          {m.n}
                        </button>
                        <div className="text-muted-foreground mt-0.5 text-xs">
                          {[m.y ?? '', m.t, m.c].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <Badge variant="brand">{t.jubilee.finishCount(m.finishes)}</Badge>
                        <div className="text-muted-foreground mt-1 text-xs tabular-nums">
                          {t.jubilee.bestShort(m.best)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {Object.entries(m.r)
                        .sort(([a], [b]) => Number(b) - Number(a))
                        .map(([year, time]) => (
                          <span
                            key={year}
                            className={cn(
                              'bg-muted/60 rounded px-1.5 py-0.5 text-xs tabular-nums',
                              m.live.includes(Number(year)) && 'text-brand',
                            )}
                          >
                            {year} <span className="text-muted-foreground">{time.slice(0, 5)}</span>
                          </span>
                        ))}
                    </div>
                  </li>
                ))}
                {members.length > 200 && (
                  <li className="text-muted-foreground px-1 py-2 text-xs">{t.jubilee.firstOnly(200)}</li>
                )}
              </ul>

              {!members.length && (
                <p className="text-muted-foreground py-10 text-center text-sm">{t.jubilee.none}</p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
