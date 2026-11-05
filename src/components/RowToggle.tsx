import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Opens the details of a table row or card; icon only unless `withLabel`. */
export function RowToggle(props: { open: boolean; onToggle: () => void; label: string; withLabel?: boolean }) {
  const { open, onToggle, label, withLabel } = props
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={withLabel ? undefined : label}
      title={label}
      onClick={onToggle}
      className="text-muted-foreground hover:bg-accent focus-visible:outline-ring flex shrink-0 cursor-pointer items-center gap-1 rounded p-1 text-xs focus-visible:outline-2"
    >
      <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
      {withLabel && label}
    </button>
  )
}
