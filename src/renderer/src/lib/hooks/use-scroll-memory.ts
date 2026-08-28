import { useCallback, useRef } from 'react'

/** Where each keyed scroller was left. */
const offsets = new Map<string, number>()

/** Remembers a scroll container's position for the lifetime of the session and restores it whenever the container mounts again. */
export function useScrollMemory(key: string) {
  const detach = useRef<(() => void) | null>(null)

  return useCallback(
    (node: HTMLElement | null) => {
      detach.current?.()
      detach.current = null
      if (!node) return

      // Callback refs run in the commit phase, after children are in the DOM and before paint — so this is a layout-effect-grade restore with no...
      node.scrollTop = offsets.get(key) ?? 0

      const onScroll = () => offsets.set(key, node.scrollTop)
      node.addEventListener('scroll', onScroll, { passive: true })
      detach.current = () => node.removeEventListener('scroll', onScroll)
    },
    [key]
  )
}
