import { useEffect, useCallback, useRef } from 'react'
import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'

const TOUR_COMPLETED_KEY = 'gwehai_tour_completed'
const TOUR_SKIPPED_KEY = 'gwehai_tour_skipped'

export type TourType = 'quick-start' | 'advanced' | 'admin'

interface UseOnboardingTourOptions {
  /** User's scan count from API (0 = first-time user) */
  scanCount?: number
  /** Whether user is admin */
  isAdmin?: boolean
  /** Whether dashboard data is still loading */
  isLoading?: boolean
}

const quickStartSteps: DriveStep[] = [
  {
    element: '[data-tour="chat-input"]',
    popover: {
      title: 'Enter Target URL',
      description: 'Type the website URL you want to test here. Can be a full URL like https://example.com or just the domain.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="send-button"]',
    popover: {
      title: 'Click Start Scan',
      description: 'This button starts the pentest. Or just press Enter after typing the URL.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="model-picker"]',
    popover: {
      title: 'Select AI Model',
      description: 'Auto recommended — keep Auto or switch to another model as needed. Free plan uses Auto.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="chat-mode"]',
    popover: {
      title: 'Chat Mode',
      description: 'Agent mode: full pentest with tools. Ask mode: quick Q&A without tools.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="progress-area"]',
    popover: {
      title: 'Progress Area',
      description: 'Here you can see what the AI is doing — scanning, testing vulnerabilities, all steps in real-time.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="report-button"]',
    popover: {
      title: 'Report Tab',
      description: 'Full scan results are here. Findings, severity, vulnerability details — everything documented.',
      side: 'right',
      align: 'start',
    },
  },
  {
    popover: {
      title: "You're All Set! 🎉",
      description: "That's it! Now you know how to use GwehAI. Enter a URL, click scan, and watch the AI work. Give it a try!",
    },
  },
]

const advancedSteps: DriveStep[] = [
  {
    element: '[data-tour="chat-mode"]',
    popover: {
      title: 'Agent vs Ask Mode',
      description: 'Agent mode: full pentest pipeline with multi-agent. Ask mode: quick Q&A without tools.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="model-picker"]',
    popover: {
      title: 'Multi-Model Selection',
      description: 'Pick different models for different tasks. GPT-5 for reasoning, Claude for code analysis, Gemini for speed.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="pentest-runner"]',
    popover: {
      title: 'Pentest Runner',
      description: 'Advanced pentest runner for custom payloads, multi-agent setup, and OOB detection.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="hacktivity-button"]',
    popover: {
      title: 'Hacktivity',
      description: 'View all your scan history. Filter by conversation, review findings from previous scans.',
      side: 'right',
      align: 'start',
    },
  },
  {
    popover: {
      title: 'Advanced Features Ready! 🚀',
      description: "You've unlocked GwehAI's advanced features. Try multi-agent, custom models, and explore Hacktivity!",
    },
  },
]

function getStepsForTour(type: TourType): DriveStep[] {
  switch (type) {
    case 'quick-start': return quickStartSteps
    case 'advanced': return advancedSteps
    case 'admin': return [] // Admin tour handled separately
    default: return quickStartSteps
  }
}

export function isTourCompleted(type: TourType = 'quick-start'): boolean {
  try {
    return localStorage.getItem(`${TOUR_COMPLETED_KEY}_${type}`) === 'true'
  } catch { return false }
}

export function markTourCompleted(type: TourType = 'quick-start'): void {
  try {
    localStorage.setItem(`${TOUR_COMPLETED_KEY}_${type}`, 'true')
  } catch {}
}

export function resetTour(type: TourType = 'quick-start'): void {
  try {
    localStorage.removeItem(`${TOUR_COMPLETED_KEY}_${type}`)
    localStorage.removeItem(`${TOUR_SKIPPED_KEY}_${type}`)
  } catch {}
}

export function resetAllTours(): void {
  ;(['quick-start', 'advanced', 'admin'] as TourType[]).forEach(resetTour)
}

export function useOnboardingTour({
  scanCount,
  isAdmin: _isAdmin,
  isLoading = false,
}: UseOnboardingTourOptions = {}) {
  const driverObj = useRef<ReturnType<typeof driver> | null>(null)

  const startTour = useCallback((type: TourType = 'quick-start') => {
    const steps = getStepsForTour(type)
    if (steps.length === 0) return

    // Destroy previous instance if exists
    driverObj.current?.destroy()

    driverObj.current = driver({
      showProgress: true,
      progressText: '{{current}} / {{total}}',
      animate: true,
      overlayColor: 'rgba(0, 0, 0, 0.6)',
      smoothScroll: true,
      stagePadding: 10,
      stageRadius: 8,
      allowClose: true,
      nextBtnText: 'Next',
      prevBtnText: 'Previous',
      doneBtnText: 'Finish',
      showButtons: ['next', 'previous', 'close'],
      popoverClass: 'gwehai-tour-popover',
      onCloseClick: () => {
        try {
          localStorage.setItem(`${TOUR_SKIPPED_KEY}_${type}`, 'true')
        } catch {}
        driverObj.current?.destroy()
      },
      onHighlighted: (_element, _step, _options) => {
        // Ensure popover is visible on mobile
        const popover = document.querySelector('.driver-popover')
        if (popover) {
          popover.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }
      },
      onDestroyStarted: () => {
        markTourCompleted(type)
        driverObj.current?.destroy()
      },
      steps,
    })

    driverObj.current.drive()
  }, [])

  const stopTour = useCallback(() => {
    driverObj.current?.destroy()
    driverObj.current = null
  }, [])

  // Auto-trigger for first-time users
  useEffect(() => {
    if (isLoading) return

    const tourDone = isTourCompleted('quick-start')
    const tourSkipped = (() => {
      try { return localStorage.getItem(`${TOUR_SKIPPED_KEY}_quick-start`) === 'true' } catch { return false }
    })()

    // Trigger for any user who hasn't completed or skipped the tour
    // (first-time users, or users who never saw the tour)
    const shouldTrigger = !tourDone && !tourSkipped

    if (shouldTrigger) {
      // Wait for ALL tour target elements to be in the DOM and visible
      let retryCount = 0
      const maxRetries = 8
      const waitForElements = () => {
        // Check that ALL required elements for the tour exist and are visible
        const requiredSelectors = quickStartSteps
          .filter((s): s is DriveStep & { element: string } => typeof s.element === 'string')
          .map(s => s.element)

        const allReady = requiredSelectors.every(selector => {
          const el = document.querySelector(selector)
          if (!el) return false
          // Check element is actually visible (not display:none or collapsed sidebar)
          const rect = el.getBoundingClientRect()
          return rect.width > 0 && rect.height > 0
        })

        if (!allReady && retryCount < maxRetries) {
          retryCount++
          const retryTimer = setTimeout(() => waitForElements(), 1500)
          return () => clearTimeout(retryTimer)
        }
        const timer = setTimeout(() => startTour('quick-start'), 800)
        return () => clearTimeout(timer)
      }
      return waitForElements()
    }
  }, [scanCount, isLoading, startTour])

  // Fallback: if dashboard data is slow to load, trigger tour after 5s for first-time users
  useEffect(() => {
    if (!isLoading) return // data already loaded, main effect handles it

    const tourDone = isTourCompleted('quick-start')
    const tourSkipped = (() => {
      try { return localStorage.getItem(`${TOUR_SKIPPED_KEY}_quick-start`) === 'true' } catch { return false }
    })()

    if (!tourDone && !tourSkipped) {
      const fallbackTimer = setTimeout(() => {
        // Re-check after timeout — if data still not loaded, trigger anyway
        startTour('quick-start')
      }, 5000)
      return () => clearTimeout(fallbackTimer)
    }
  }, [isLoading, startTour])

  // Cleanup on unmount
  useEffect(() => {
    return () => { driverObj.current?.destroy() }
  }, [])

  return { startTour, stopTour, resetTour, resetAllTours, isTourCompleted }
}
