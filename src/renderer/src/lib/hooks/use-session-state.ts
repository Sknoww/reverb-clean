import { Dispatch, SetStateAction, useEffect, useState } from 'react'

const store = new Map<string, unknown>()

export function useSessionState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => (store.has(key) ? (store.get(key) as T) : initial))

  useEffect(() => {
    store.set(key, value)
  }, [key, value])

  return [value, setValue]
}
