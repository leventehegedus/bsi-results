import { useEffect } from 'react'
import { useAppDispatch } from '@/store/hooks'
import { setTab } from '@/features/ui/uiSlice'
import { readHash, searchRunner } from './runnerActions'

/** Restores a profile from a shared #runner=…&yob=… link on first load. */
export function useRunnerFromHash() {
  const dispatch = useAppDispatch()
  useEffect(() => {
    const q = readHash()
    if (q) {
      dispatch(setTab('runner'))
      searchRunner(dispatch, q)
    }
  }, [dispatch])
}
