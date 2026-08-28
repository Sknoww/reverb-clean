import { Dispatch, SetStateAction, useEffect, useState } from 'react'

/** View state that has to outlive the component holding it, by key. */
const store = new Map<string, unknown>()

/** `useState` that survives unmount for the life of the session. */
export function useSessionState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => (store.has(key) ? (store.get(key) as T) : initial))

  // Written from an effect rather than from inside the setter: the store is a side effect, and a state updater has to stay pure to be safe...
  useEffect(() => {
    store.set(key, value)
  }, [key, value])

  return [value, setValue]
}
