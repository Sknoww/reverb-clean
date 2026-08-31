import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'

export function ValueField({
  label,
  hint,
  placeholder,
  value,
  onCommit
}: {
  label: string
  hint: string

  placeholder: string
  value: string
  onCommit: (value: string) => void
}) {
  const [text, setText] = useState(value)

  useEffect(() => {
    setText(value)
  }, [value])

  const commit = () => {
    const next = text.trim()
    if (next !== text) setText(next)
    if (next !== value) onCommit(next)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">
        {label} <span className="ml-1 text-glyph-dim">{hint}</span>
      </span>
      <input
        type="text"
        spellCheck={false}
        autoComplete="off"
        value={text}
        aria-label={label}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            setText(value)
            event.currentTarget.blur()
          }
        }}
        className={cn(
          'h-10 w-full rounded-[9px] border border-border-control bg-surface-control px-3 font-mono text-xs text-foreground outline-none transition-colors',
          'placeholder:font-mono placeholder:text-glyph-dimmer focus:border-muted-foreground/40'
        )}
      />
    </div>
  )
}
