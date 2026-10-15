import { useEffect, useState } from 'react'
import { Database } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cachedScanCount, clearScanCache } from '@/api/scanCache'
import { useT } from '@/i18n'

/**
 * How many scan answers are stored locally, with a way to drop them. The count
 * is re-read whenever a scan finishes (`watch`), since that's when it changes.
 */
export function CacheStatus({ watch, disabled }: { watch: unknown; disabled?: boolean }) {
  const t = useT()
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let live = true
    cachedScanCount().then((n) => live && setCount(n))
    return () => {
      live = false
    }
  }, [watch])

  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
      <Database className="size-3.5" />
      <span>{count ? t.favourites.cacheSize(count.toLocaleString('hu-HU')) : t.favourites.cacheEmpty}</span>
      {!!count && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2"
          disabled={disabled}
          onClick={() => clearScanCache().then(() => setCount(0))}
        >
          {t.favourites.clearCache}
        </Button>
      )}
    </div>
  )
}
