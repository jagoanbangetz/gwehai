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
      title: 'Masukkan URL Target',
      description: 'Ketik URL website yang mau kamu test di sini. Bisa URL lengkap kayak https://example.com atau domain aja.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="send-button"]',
    popover: {
      title: 'Klik Start Scan',
      description: 'Tombol ini buat mulai pentest. Atau langsung tekan Enter aja setelah ketik URL.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="model-picker"]',
    popover: {
      title: 'Pilih Model AI',
      description: 'Auto recommended — biarkan Auto atau ganti ke model lain sesuai kebutuhan. Free plan pakai Auto.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="chat-mode"]',
    popover: {
      title: 'Mode Chat',
      description: 'Agent mode: full pentest dengan tools. Ask mode: tanya jawab cepat tanpa tools.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="progress-area"]',
    popover: {
      title: 'Area Progress',
      description: 'Di sini kamu bisa liat AI lagi ngapain — scanning, testing vulnerabilities, semua step-nya real-time.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="report-button"]',
    popover: {
      title: 'Tab Report',
      description: 'Hasil scan lengkap ada di sini. Findings, severity, detail vulnerability — semua terdokumentasi.',
      side: 'right',
      align: 'start',
    },
  },
  {
    popover: {
      title: 'Kamu Siap! 🎉',
      description: 'Itu aja! Sekarang kamu udah tau cara pakai GwehAI. Masukkan URL, klik scan, dan liat AI bekerja. Selamat mencoba!',
    },
  },
]

const advancedSteps: DriveStep[] = [
  {
    element: '[data-tour="chat-mode"]',
    popover: {
      title: 'Agent vs Ask Mode',
      description: 'Agent mode: full pentest pipeline dengan multi-agent. Ask mode: quick Q&A tanpa tools.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="model-picker"]',
    popover: {
      title: 'Multi-Model Selection',
      description: 'Pilih model yang berbeda untuk task berbeda. GPT-5 buat reasoning, Claude buat code analysis, Gemini buat speed.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="pentest-runner"]',
    popover: {
      title: 'Pentest Runner',
      description: 'Advanced pentest runner buat custom payloads, multi-agent setup, dan OOB detection.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="hacktivity-button"]',
    popover: {
      title: 'Hacktivity',
      description: 'Lihat semua scan history kamu. Filter by conversation, review findings dari scan sebelumnya.',
      side: 'right',
      align: 'start',
    },
  },
  {
    popover: {
      title: 'Advanced Features Ready! 🚀',
      description: 'Kamu udah tau fitur advanced GwehAI. Cobain multi-agent, custom model, dan explore Hacktivity!',
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

  // Auto-trigger for first-time users
  useEffect(() => {
    if (isLoading) return

    const tourDone = isTourCompleted('quick-start')
    const tourSkipped = (() => {
      try { return localStorage.getItem(`${TOUR_SKIPPED_KEY}_quick-start`) === 'true' } catch { return false }
    })()

    // Trigger conditions: not completed, not skipped, and (scanCount === 0 OR no localStorage flag)
    const shouldTrigger = !tourDone && !tourSkipped && (scanCount === 0 || scanCount === undefined)

    if (shouldTrigger) {
      // Small delay to let the page render
      const timer = setTimeout(() => startTour('quick-start'), 800)
      return () => clearTimeout(timer)
    }
  }, [scanCount, isLoading, startTour])

  // Cleanup on unmount
  useEffect(() => {
    return () => { driverObj.current?.destroy() }
  }, [])

  return { startTour, resetTour, resetAllTours, isTourCompleted }
}
