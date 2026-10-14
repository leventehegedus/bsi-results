import { useEffect } from 'react'
import { ListOrdered, MapPin, Monitor, Moon, Sun, UserRound, type LucideIcon } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RaceBrowser } from '@/features/races/RaceBrowser'
import { RunnerProfile } from '@/features/runner/RunnerProfile'
import { useRunnerFromHash } from '@/features/runner/useRunnerFromHash'
import { TownScan } from '@/features/townScan/TownScan'
import { setLang, setTab, setTheme, type AppTab } from '@/features/ui/uiSlice'
import { LANGS, saveLang, useLang, useT } from '@/i18n'
import { cn } from '@/lib/utils'
import { applyTheme, saveTheme, THEME_MODES, watchSystemTheme, type ThemeMode } from '@/theme'
import { useAppDispatch, useAppSelector } from '@/store/hooks'

export default function App() {
  const dispatch = useAppDispatch()
  const tab = useAppSelector((s) => s.ui.tab)
  const theme = useAppSelector((s) => s.ui.theme)
  const lang = useLang()
  const t = useT()
  useRunnerFromHash()

  useEffect(() => {
    document.documentElement.lang = lang
    document.title = t.app.title
    saveLang(lang)
  }, [lang, t])

  useEffect(() => {
    applyTheme(theme)
    saveTheme(theme)
    if (theme === 'system') return watchSystemTheme(() => applyTheme('system'))
  }, [theme])

  return (
    <div className="min-h-svh">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl items-start justify-between gap-4 px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight">{t.app.title}</h1>
            <p className="text-muted-foreground text-sm">{t.app.intro}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
            <Segmented label={t.app.theme}>
              {THEME_MODES.map((m) => {
                const Icon = THEME_ICONS[m]
                return (
                  <SegmentButton
                    key={m}
                    active={theme === m}
                    onClick={() => dispatch(setTheme(m))}
                    title={t.app.themes[m]}
                  >
                    <Icon className="size-3.5" />
                  </SegmentButton>
                )
              })}
            </Segmented>
            <Segmented label={t.app.language}>
              {LANGS.map((l) => (
                <SegmentButton key={l} active={lang === l} onClick={() => dispatch(setLang(l))} lang={l}>
                  <span className="uppercase">{l}</span>
                </SegmentButton>
              ))}
            </Segmented>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Tabs value={tab} onValueChange={(v) => dispatch(setTab(v as AppTab))} className="gap-6">
          <TabsList>
            <TabsTrigger value="races">
              <ListOrdered /> {t.app.tabs.races}
            </TabsTrigger>
            <TabsTrigger value="town">
              <MapPin /> {t.app.tabs.town}
            </TabsTrigger>
            <TabsTrigger value="runner">
              <UserRound /> {t.app.tabs.runner}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="races">
            <RaceBrowser />
          </TabsContent>
          <TabsContent value="town">
            <TownScan />
          </TabsContent>
          <TabsContent value="runner">
            <RunnerProfile />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

const THEME_ICONS: Record<ThemeMode, LucideIcon> = { light: Sun, dark: Moon, system: Monitor }

/** A small group of mutually exclusive buttons (theme, language). */
function Segmented({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="bg-muted flex rounded-md p-0.5 text-xs font-medium">
      {children}
    </div>
  )
}

function SegmentButton(props: {
  active: boolean
  onClick: () => void
  /** tooltip and accessible name for icon-only buttons */
  title?: string
  lang?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      lang={props.lang}
      title={props.title}
      aria-label={props.title}
      aria-pressed={props.active}
      onClick={props.onClick}
      className={cn(
        'flex h-6 min-w-7 items-center justify-center rounded px-2 transition-colors',
        props.active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {props.children}
    </button>
  )
}
