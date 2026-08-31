import { createContext, Dispatch, ReactNode, SetStateAction, useContext, useState } from 'react'

export interface ConsoleResult {
  id: string
  timestamp: string
  expression: string
  result: string | null
  isJson: boolean
  isError: boolean
  errorMessage?: string
}

interface ConsoleContextType {
  results: ConsoleResult[]
  setResults: Dispatch<SetStateAction<ConsoleResult[]>>
  history: string[]
  setHistory: Dispatch<SetStateAction<string[]>>
  historyIndex: number
  setHistoryIndex: Dispatch<SetStateAction<number>>
  isExecuting: boolean
  setIsExecuting: Dispatch<SetStateAction<boolean>>
  clearResults: () => void
}

const ConsoleContext = createContext<ConsoleContextType | null>(null)

export function useConsoleContext() {
  const context = useContext(ConsoleContext)
  if (!context) {
    throw new Error('useConsoleContext must be used within a ConsoleProvider')
  }
  return context
}

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [results, setResults] = useState<ConsoleResult[]>([])
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [isExecuting, setIsExecuting] = useState(false)

  const clearResults = () => setResults([])

  return (
    <ConsoleContext.Provider
      value={{
        results,
        setResults,
        history,
        setHistory,
        historyIndex,
        setHistoryIndex,
        isExecuting,
        setIsExecuting,
        clearResults
      }}
    >
      {children}
    </ConsoleContext.Provider>
  )
}
