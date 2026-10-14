import { Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Star toggle: filled when the thing is already a favourite. */
export function FavouriteButton(props: {
  active: boolean
  onToggle: () => void
  addLabel: string
  removeLabel: string
  /** show the label next to the star (wide headers) instead of icon only */
  withText?: boolean
  className?: string
}) {
  const label = props.active ? props.removeLabel : props.addLabel
  return (
    <Button
      type="button"
      variant="outline"
      size={props.withText ? 'sm' : 'icon'}
      className={cn(props.withText ? undefined : 'size-8', props.className)}
      aria-pressed={props.active}
      aria-label={label}
      title={label}
      onClick={props.onToggle}
    >
      <Star className={cn('transition-colors', props.active && 'fill-brand text-brand')} />
      {props.withText && <span className="hidden sm:inline">{label}</span>}
    </Button>
  )
}
