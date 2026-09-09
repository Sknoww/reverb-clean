import { useCallback, useRef } from 'react'

const offsets = new Map<string, number>()

export function useScrollMemory(key: string) {
  const detach = useRef<(() => void) | null>(null)

  return useCallback(
    (node: HTMLElement | null) => {
      detach.current?.()
      detach.current = null
      if (!node) return

      node.scrollTop = offsets.get(key) ?? 0

      const onScroll = () => offsets.set(key, node.scrollTop)
      node.addEventListener('scroll', onScroll, { passive: true })
      detach.current = () => node.removeEventListener('scroll', onScroll)
    },
    [key]
  )
}

export function clearScrollMemory(...keys: string[]) {
  for (const key of keys) offsets.delete(key)
}
