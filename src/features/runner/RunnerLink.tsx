import { useT } from '@/i18n'
import { cn } from '@/lib/utils'
import { useAppDispatch } from '@/store/hooks'
import { openRunnerFromResult } from './runnerActions'

/** A runner's name that opens their profile (birth year is looked up from this result row). */
export function RunnerLink(props: {
  name: string
  raceId: string
  raceName?: string
  place?: number | null
  bib?: string | null
  /** known birth year: skips the lookup */
  yob?: number | null
  className?: string
}) {
  const dispatch = useAppDispatch()
  const t = useT()
  if (!props.name) return null
  return (
    <button
      type="button"
      title={t.common.openRunner}
      onClick={() =>
        openRunnerFromResult(dispatch, {
          name: props.name,
          raceId: props.raceId,
          raceName: props.raceName,
          place: props.place,
          bib: props.bib,
          yob: props.yob,
        })
      }
      className={cn(
        'text-primary decoration-brand cursor-pointer text-left font-medium decoration-2 underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none',
        props.className,
      )}
    >
      {props.name}
    </button>
  )
}
