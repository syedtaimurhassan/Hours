import { useEffect, useState } from 'react'

/**
 * Device-local UI preferences — the controls for "popups that won't go away".
 * Reactive via a module-level listener set so toggling in Settings updates the
 * banners immediately.
 */
export type Prefs = {
  /** iOS "Add to Home Screen" hint card. */
  showInstallHint: boolean
  /** Forgot-to-end reminder threshold in hours; 0 = off (no banner, no End intercept). */
  forgotThresholdH: 0 | 8 | 12 | 16
  /** "Your device clock looks off" note. */
  showClockWarning: boolean
}

const DEFAULTS: Prefs = {
  showInstallHint: true,
  forgotThresholdH: 12,
  showClockWarning: true,
}

const KEY = 'hours.prefs'
const listeners = new Set<() => void>()
let cache: Prefs | null = null

function load(): Prefs {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(KEY)
    cache = raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULTS
  } catch {
    cache = DEFAULTS
  }
  return cache
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  cache = { ...load(), [key]: value }
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    /* private browsing — in-memory only */
  }
  listeners.forEach((fn) => fn())
}

export function usePrefs(): Prefs {
  const [prefs, setPrefs] = useState<Prefs>(load)
  useEffect(() => {
    const fn = () => setPrefs(load())
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [])
  return prefs
}
