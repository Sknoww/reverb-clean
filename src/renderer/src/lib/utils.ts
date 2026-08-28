import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export function useNavigationLock(cooldownMs = 300) {
  const [isNavigating, setIsNavigating] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    setIsNavigating(false)
  }, [location.pathname])

  const safeNavigate = (to) => {
    if (isNavigating || to === location.pathname) {
      console.log('Navigation prevented - already navigating or same route')
      return
    }

    setIsNavigating(true)
    navigate(to)

    setTimeout(() => {
      setIsNavigating(false)
      console.log('Navigation lock released after timeout')
    }, cooldownMs)
  }

  return { isNavigating, safeNavigate }
}
