import { useState, useEffect } from 'react'

/**
 * Subscribes to a media query and returns whether it matches.
 * Updates when the match state changes (e.g. on window resize).
 * @param query - CSS media query string (e.g. "(max-width: 1023px)")
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    const mediaQuery = window.matchMedia(query)
    setMatches(mediaQuery.matches)

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [query])

  return matches
}
