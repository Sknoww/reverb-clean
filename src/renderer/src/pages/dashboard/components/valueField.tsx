import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'

// The app's one free-text settings control, promoted out of `settingsTarget.tsx` in 19c when Sync's deployment key needed the same thing...

/** Commit on blur or Enter, never per keystroke — the same rule 18b's number and select controls follow, and for the same reason: every... */
export function ValueField({
  label,
  hint,
  placeholder,
  value,
  onCommit
}: {
  label: string
  hint: string
  /** An example of the *form* the value takes — never a real installation's. */
  placeholder: string
  value: string
  onCommit: (value: string) => void
}) {
  const [text, setText] = useState(value)

  // Follow config when it changes underneath — a snapshot restore or a bundle
  // import replaces these without the control being touched.
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
