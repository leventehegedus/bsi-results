import { ListOrdered, MapPin, UserRound } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RaceBrowser } from '@/features/races/RaceBrowser'
import { RunnerProfile } from '@/features/runner/RunnerProfile'
import { useRunnerFromHash } from '@/features/runner/useRunnerFromHash'
import { TownScan } from '@/features/townScan/TownScan'
import { setTab, type AppTab } from '@/features/ui/uiSlice'
import { useAppDispatch, useAppSelector } from '@/store/hooks'

export default function App() {
  const dispatch = useAppDispatch()
  const tab = useAppSelector((s) => s.ui.tab)
  useRunnerFromHash()

  return (
    <div className="min-h-svh">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-5 sm:px-6">
          <h1 className="text-xl font-semibold tracking-tight">BSI Results Explorer</h1>
          <p className="text-muted-foreground text-sm">
            Browse race results from results.futanet.hu, find every finisher from a given town, and
            follow a runner across all races.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Tabs value={tab} onValueChange={(v) => dispatch(setTab(v as AppTab))} className="gap-6">
          <TabsList>
            <TabsTrigger value="races">
              <ListOrdered /> Race browser
            </TabsTrigger>
            <TabsTrigger value="town">
              <MapPin /> Town search
            </TabsTrigger>
            <TabsTrigger value="runner">
              <UserRound /> Runner
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
