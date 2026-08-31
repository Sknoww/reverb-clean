import { useCallback, useRef, useState } from 'react'

export function useFlash(duration = 600) {
  const [active, setActive] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flash = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    setActive(true)
    timer.current = setTimeout(() => setActive(false), duration)
  }, [duration])

  return [active, flash] as const
}
