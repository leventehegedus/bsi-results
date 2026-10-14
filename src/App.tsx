import { useEffect } from 'react'
import { ListOrdered, MapPin, UserRound } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RaceBrowser } from '@/features/races/RaceBrowser'
import { RunnerProfile } from '@/features/runner/RunnerProfile'
import { useRunnerFromHash } from '@/features/runner/useRunnerFromHash'
import { TownScan } from '@/features/townScan/TownScan'
import { setLang, setTab, type AppTab } from '@/features/ui/uiSlice'
import { LANGS, saveLang, useLang, useT } from '@/i18n'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'

export default function App() {
  const dispatch = useAppDispatch()
  const tab = useAppSelector((s) => s.ui.tab)
  const lang = useLang()
  const t = useT()
  useRunnerFromHash()

  useEffect(() => {
    document.documentElement.lang = lang
    document.title = t.app.title
    saveLang(lang)
  }, [lang, t])

  return (
    <div className="min-h-svh">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl items-start justify-between gap-4 px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight">{t.app.title}</h1>
            <p className="text-muted-foreground text-sm">{t.app.intro}</p>
          </div>
          <div role="group" aria-label={t.app.language} className="bg-muted flex shrink-0 rounded-md p-0.5 text-xs font-medium">
            {LANGS.map((l) => (
              <button
                key={l}
                type="button"
                lang={l}
                aria-pressed={lang === l}
                onClick={() => dispatch(setLang(l))}
                className={cn(
                  'rounded px-2 py-1 uppercase transition-colors',
                  lang === l ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {l}
              </button>
            ))}
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
