import { useEffect, useState } from 'react'
import { skipToken } from '@reduxjs/toolkit/query'
import { ArrowUp, Loader2, MapPin, RotateCcw } from 'lucide-react'
import type { Place } from '@/api/weather'
import type { RaceMeta } from '@/api/types'
import { useDayWeatherQuery, usePlacesQuery } from '@/api/weatherApi'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useLang, useT } from '@/i18n'
import {
  compass,
  conditionsAt,
  defaultPlace,
  defaultStartTime,
  isVirtualRace,
  loadOverride,
  raceWindowHours,
  saveOverride,
  timeToHour,
  type WeatherOverride,
} from '@/lib/weather'
import { HourlyChart, type HourlySeries } from './HourlyChart'

/**
 * Historical weather for a race: conditions at the start, temperature and wind
 * over the day. Start time and place aren't in the results API, so they are
 * estimated and can be corrected (kept per race in this browser).
 */
export function RaceWeather({ raceId, meta }: { raceId: string; meta: RaceMeta }) {
  const t = useT()
  const lang = useLang()
  const [override, setOverride] = useState<WeatherOverride>(() => loadOverride(raceId))

  const date = meta.datum.slice(0, 10)
  const place = override.place ?? defaultPlace(raceId)
  const time = override.time ?? defaultStartTime(meta.nev, date)
  const start = timeToHour(time)
  const windowH = raceWindowHours(meta.nev, meta.tav)
  const virtual = isVirtualRace(meta.nev)

  const update = (next: WeatherOverride) => {
    setOverride(next)
    saveOverride(raceId, next)
  }

  const weather = useDayWeatherQuery(virtual ? skipToken : { lat: place.lat, lon: place.lon, date })

  const num = (v: number, digits = 1) =>
    v.toLocaleString(lang === 'hu' ? 'hu-HU' : 'en-GB', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
  const deg = (v: number) => `${num(v)} °C`
  const kmh = (v: number) => `${num(v, 0)} km/h`

  if (virtual) {
    return <p className="text-muted-foreground py-10 text-sm">{t.weather.virtual}</p>
  }

  const hours = weather.data?.hours ?? []
  const now = conditionsAt(hours, start, windowH)
  // show a few hours either side of the race, at least 8 hours in all
  let from = Math.max(0, Math.floor(start) - 2)
  let to = Math.min(23, Math.ceil(start + windowH) + 2)
  if (to - from < 8) {
    from = Math.max(0, to - 8)
    to = Math.min(23, from + 8)
  }

  const tempSeries: HourlySeries[] = [
    { key: 'temp', label: t.weather.temp, color: 'var(--chart-series)', value: (h) => h.temp },
  ]
  const windSeries: HourlySeries[] = [
    { key: 'wind', label: t.weather.wind, color: 'var(--chart-series)', value: (h) => h.wind },
    { key: 'gusts', label: t.weather.gusts, color: 'var(--chart-context)', value: (h) => h.gusts },
  ]
  const dirLabel = (d: number) => t.weather.windFrom(compass(d, lang))

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-[12rem_1fr]">
        <div className="grid content-start gap-1.5">
          <Label htmlFor="w-start">{t.weather.startTime}</Label>
          <Input
            id="w-start"
            type="time"
            step={900}
            value={time}
            onChange={(e) => e.target.value && update({ ...override, time: e.target.value })}
          />
          <p className="text-muted-foreground text-xs">
            {override.time ? t.weather.startSaved : t.weather.startEstimated}
          </p>
        </div>
        <PlacePicker
          place={place}
          custom={!!override.place}
          onPick={(p) => update({ ...override, place: p })}
        />
      </div>
      {(override.time || override.place) && (
        <div className="-mt-3">
          <Button variant="ghost" size="sm" onClick={() => update({})}>
            <RotateCcw /> {t.weather.reset}
          </Button>
        </div>
      )}

      {weather.isFetching && !weather.data && (
        <p className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
          <Loader2 className="size-4 animate-spin" /> {t.weather.loading}
        </p>
      )}
      {weather.error && !weather.isFetching && (
        <Alert variant="destructive">
          <AlertTitle>{t.weather.failed}</AlertTitle>
          {'message' in weather.error && <AlertDescription>{weather.error.message}</AlertDescription>}
        </Alert>
      )}

      {now && weather.data && (
        <>
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">{t.weather.atStart(time)}</h3>
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile
                label={t.weather.temp}
                value={deg(now.temp)}
                sub={[
                  now.feels != null ? t.weather.feels(deg(now.feels)) : null,
                  t.weather.duringRace(
                    now.windowMin === now.windowMax ? deg(now.windowMin) : `${num(now.windowMin)}–${deg(now.windowMax)}`,
                  ),
                ]}
              />
              <Tile
                label={t.weather.wind}
                value={kmh(now.wind)}
                icon={
                  <ArrowUp
                    aria-hidden
                    className="text-muted-foreground size-5"
                    style={{ transform: `rotate(${now.dir + 180}deg)` }}
                  />
                }
                sub={[dirLabel(now.dir)]}
              />
              <Tile label={t.weather.gusts} value={now.gusts != null ? kmh(now.gusts) : '–'} />
              <Tile
                label={t.weather.rain}
                value={now.windowRain != null ? `${num(now.windowRain)} mm` : '–'}
                sub={now.humidity != null ? [`${t.weather.humidity}: ${num(now.humidity, 0)}%`] : []}
              />
            </dl>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t.weather.tempTitle}</h3>
            <p className="text-muted-foreground text-xs">{t.weather.tempDescription}</p>
            <HourlyChart
              hours={hours}
              series={tempSeries}
              from={from}
              to={to}
              start={start}
              windowHours={windowH}
              labels={{
                ariaLabel: t.weather.tempAria,
                start: `${t.weather.start} ${time}`,
                window: t.weather.window,
                format: deg,
              }}
            />
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t.weather.windTitle}</h3>
            <p className="text-muted-foreground text-xs">{t.weather.windDescription}</p>
            <HourlyChart
              hours={hours}
              series={windSeries}
              from={from}
              to={to}
              start={start}
              windowHours={windowH}
              zero
              arrows
              labels={{
                ariaLabel: t.weather.windAria,
                start: `${t.weather.start} ${time}`,
                window: t.weather.window,
                format: kmh,
                extra: (h) => dirLabel(h.dir),
              }}
            />
          </section>

          <details className="text-sm">
            <summary className="text-muted-foreground cursor-pointer text-xs">{t.weather.showTable}</summary>
            <div className="mt-2 rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.weather.time}</TableHead>
                    <TableHead className="text-right">{t.weather.temp}</TableHead>
                    <TableHead className="text-right">{t.weather.wind}</TableHead>
                    <TableHead className="text-right">{t.weather.gusts}</TableHead>
                    <TableHead>{t.weather.direction}</TableHead>
                    <TableHead className="text-right">mm</TableHead>
                    <TableHead className="text-right">{t.weather.humidity}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hours
                    .filter((h) => h.hour >= from && h.hour <= to)
                    .map((h) => (
                      <TableRow key={h.time} data-state={h.hour === Math.floor(start) ? 'selected' : undefined}>
                        <TableCell className="tabular-nums">{h.time}</TableCell>
                        <TableCell className="text-right tabular-nums">{deg(h.temp)}</TableCell>
                        <TableCell className="text-right tabular-nums">{kmh(h.wind)}</TableCell>
                        <TableCell className="text-right tabular-nums">{h.gusts != null ? kmh(h.gusts) : '–'}</TableCell>
                        <TableCell>{compass(h.dir, lang)}</TableCell>
                        <TableCell className="text-right tabular-nums">{h.precip != null ? num(h.precip) : '–'}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {h.humidity != null ? `${num(h.humidity, 0)}%` : '–'}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </details>

          <p className="text-muted-foreground text-xs">
            {t.weather.source(
              weather.data.source === 'archive' ? t.weather.archive : t.weather.forecast,
              `${place.name} (${weather.data.lat.toFixed(2)}, ${weather.data.lon.toFixed(2)})`,
            )}{' '}
            <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="underline underline-offset-4">
              open-meteo.com
            </a>
          </p>
        </>
      )}
    </div>
  )
}

function Tile(props: { label: string; value: string; sub?: (string | null)[]; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border px-4 py-3">
      <dt className="text-muted-foreground text-xs">{props.label}</dt>
      <dd className="flex items-center gap-2 text-2xl font-semibold tabular-nums">
        {props.value}
        {props.icon}
      </dd>
      {props.sub?.filter(Boolean).map((s) => (
        <dd key={s} className="text-muted-foreground text-xs">
          {s}
        </dd>
      ))}
    </div>
  )
}

/** Current place + a search to pick another (Open-Meteo geocoding). */
function PlacePicker(props: { place: Place; custom: boolean; onPick: (p: Place) => void }) {
  const t = useT()
  const lang = useLang()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [term, setTerm] = useState('')

  // search after a short pause in typing
  useEffect(() => {
    const id = setTimeout(() => setTerm(text.trim()), 350)
    return () => clearTimeout(id)
  }, [text])
  const places = usePlacesQuery(open && term.length >= 2 ? { name: term, lang } : skipToken)

  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor="w-place">{t.weather.location}</Label>
      {!open ? (
        <div className="flex items-center gap-2">
          <span className="flex h-9 items-center gap-1.5 text-sm font-medium">
            <MapPin className="text-muted-foreground size-4" /> {props.place.name}
          </span>
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            {t.weather.change}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Input
              id="w-place"
              autoFocus
              value={text}
              placeholder={t.weather.searchPlace}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
            />
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t.weather.cancel}
            </Button>
          </div>
          {term.length >= 2 && (
            <ul className="rounded-md border p-1 text-sm">
              {places.isFetching && <li className="text-muted-foreground px-2 py-1.5">{t.weather.searching}</li>}
              {!places.isFetching && !places.data?.length && (
                <li className="text-muted-foreground px-2 py-1.5">{t.weather.noPlaces}</li>
              )}
              {!places.isFetching &&
                places.data?.map((p) => (
                  <li key={`${p.lat},${p.lon}`}>
                    <button
                      type="button"
                      className="hover:bg-accent w-full rounded-sm px-2 py-1.5 text-left"
                      onClick={() => {
                        props.onPick({ name: p.name, lat: p.lat, lon: p.lon })
                        setOpen(false)
                        setText('')
                      }}
                    >
                      <span className="font-medium">{p.name}</span>
                      {p.detail && <span className="text-muted-foreground"> · {p.detail}</span>}
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
      <p className="text-muted-foreground text-xs">{props.custom ? t.weather.locationSaved : t.weather.locationDefault}</p>
    </div>
  )
}
