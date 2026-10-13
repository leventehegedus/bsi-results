import { ListOrdered, MapPin } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RaceBrowser } from '@/features/races/RaceBrowser'
import { TownScan } from '@/features/townScan/TownScan'

export default function App() {
  return (
    <div className="min-h-svh">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-5 sm:px-6">
          <h1 className="text-xl font-semibold tracking-tight">BSI Results Explorer</h1>
          <p className="text-muted-foreground text-sm">
            Browse race results from results.futanet.hu and find every finisher from a given town.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Tabs defaultValue="races" className="gap-6">
          <TabsList>
            <TabsTrigger value="races">
              <ListOrdered /> Race browser
            </TabsTrigger>
            <TabsTrigger value="town">
              <MapPin /> Town search
            </TabsTrigger>
          </TabsList>
          <TabsContent value="races">
            <RaceBrowser />
          </TabsContent>
          <TabsContent value="town">
            <TownScan />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
