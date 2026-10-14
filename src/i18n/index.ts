import { useAppSelector } from '@/store/hooks'
import { en, type Messages } from './en'
import { hu } from './hu'

export type Lang = 'hu' | 'en'
export type { Messages }

export const MESSAGES: Record<Lang, Messages> = { en, hu }
export const LANGS: Lang[] = ['hu', 'en']

const STORAGE_KEY = 'bsi:lang'

/** The saved choice, else Hungarian for Hungarian browsers, else English. */
export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'hu' || saved === 'en') return saved
  } catch {
    // storage blocked: fall back to the browser language
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('hu') ? 'hu' : 'en'
}

export function saveLang(lang: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // not persisted; the choice still applies to this visit
  }
}

export function useLang(): Lang {
  return useAppSelector((s) => s.ui.lang)
}

/** Texts for the current language. */
export function useT(): Messages {
  return MESSAGES[useLang()]
}
