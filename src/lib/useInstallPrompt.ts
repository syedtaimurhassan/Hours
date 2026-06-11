import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Stash the event at module level — it often fires before React mounts.
let stashed: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    stashed = e as BeforeInstallPromptEvent
    listeners.forEach((l) => l())
  })
  window.addEventListener('appinstalled', () => {
    stashed = null
    listeners.forEach((l) => l())
  })
}

export function isStandalone(): boolean {
  return (
    (navigator as { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  )
}

export function isIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ reports as Mac
    (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1)
  )
}

/** On iOS only Safari can Add to Home Screen; other browsers must hand off. */
export function isIOSSafari(): boolean {
  const ua = navigator.userAgent
  return isIOS() && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/.test(ua)
}

export function useInstallPrompt(): {
  /** Android: a stashed beforeinstallprompt exists → show the Settings row. */
  canPromptInstall: boolean
  promptInstall: () => void
  showIOSInstallCard: boolean
  iosNeedsSafari: boolean
} {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])

  return {
    canPromptInstall: stashed !== null && !isStandalone(),
    promptInstall: () => {
      // prompt() must run inside the user's tap.
      void stashed?.prompt()
    },
    showIOSInstallCard: isIOS() && !isStandalone(),
    iosNeedsSafari: isIOS() && !isIOSSafari(),
  }
}
