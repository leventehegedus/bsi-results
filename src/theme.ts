/** Light / dark colour scheme. "system" follows the OS setting. */
export type ThemeMode = 'light' | 'dark' | 'system'

export const THEME_MODES: ThemeMode[] = ['light', 'dark', 'system']

/** Also read by the inline script in index.html, which applies the theme before first paint. */
const STORAGE_KEY = 'bsi:theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

export function initialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  } catch {
    // storage blocked: follow the system
  }
  return 'system'
}

export function saveTheme(mode: ThemeMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // not persisted; the choice still applies to this visit
  }
}

function systemPrefersDark() {
  return typeof window !== 'undefined' && window.matchMedia?.(DARK_QUERY).matches
}

/** Put the `dark` class on <html> for the resolved scheme. */
export function applyTheme(mode: ThemeMode) {
  const dark = mode === 'dark' || (mode === 'system' && systemPrefersDark())
  document.documentElement.classList.toggle('dark', dark)
}

/** Re-apply when the OS scheme changes while following the system. Returns an unsubscribe. */
export function watchSystemTheme(onChange: () => void): () => void {
  const mq = window.matchMedia?.(DARK_QUERY)
  if (!mq) return () => {}
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
