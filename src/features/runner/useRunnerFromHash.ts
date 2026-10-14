import { useEffect } from 'react'
import { useAppDispatch } from '@/store/hooks'
import { setTab } from '@/features/ui/uiSlice'
import { readHash } from './runnerActions'
import { prefillQuery } from './runnerSlice'

/**
 * Opens the Runner tab for a shared #runner=…&yob=… link on first load. The scan
 * (thousands of requests) only starts when the user asks for it.
 */
export function useRunnerFromHash() {
  const dispatch = useAppDispatch()
  useEffect(() => {
    const q = readHash()
    if (q) {
      dispatch(setTab('runner'))
      dispatch(prefillQuery(q))
    }
  }, [dispatch])
}
