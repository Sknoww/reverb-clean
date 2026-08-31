import { useSessionState } from '@/lib/hooks/use-session-state'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'
import { ReactNode, useEffect, useRef, useState } from 'react'

export function SettingsSection({
  title,
  description,
  children,
  defaultOpen = true,
  revealKey
}: {
  title: string
  description?: string
  children: ReactNode
  defaultOpen?: boolean

  revealKey?: string
}) {
  const [open, setOpen] = useSessionState(`settings.section.${title}`, defaultOpen)
  const [revealed, setRevealed] = useState(false)
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!revealKey) return

    setOpen(true)
    setRevealed(true)

    // Wait for the expanded section to lay out before scrolling to it.
    const frame = requestAnimationFrame(() => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ref.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
    })

    const timer = setTimeout(() => setRevealed(false), 1500)

    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
    // The custom hook hides the stable state setter from the lint rule.
  }, [revealKey, setOpen])

  return (
    <section ref={ref} className="flex scroll-mt-1 flex-col gap-2.5">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="group flex items-center gap-2 self-start"
      >
        <span className="text-[11px] uppercase tracking-[0.08em] text-glyph-dim transition-colors group-hover:text-foreground">
          {title}
        </span>
        <ChevronDown
          className={cn(
            'h-3 w-3 text-glyph-dimmer transition-transform group-hover:text-foreground',
            !open && '-rotate-90'
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div
          className={cn(
            'flex flex-col gap-4 rounded-xl border bg-surface-panel p-4 transition-colors duration-500',

            revealed ? 'border-stale/50' : 'border-hairline'
          )}
        >
          {description && (
            <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
          )}
          {children}
        </div>
      )}
    </section>
  )
}

export function SettingsRow({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] text-foreground">{label}</span>
        {hint && <span className="text-xs leading-snug text-glyph-dim">{hint}</span>}
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

export function SettingsDivider() {
  return <div className="h-px w-full bg-hairline" />
}

export const SETTINGS_BUTTON =
  'h-9 flex-shrink-0 rounded-[9px] border border-border-control bg-transparent px-3.5 text-[13px] text-zinc-300 transition-colors hover:bg-row-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-40'

const VALUE_CONTROL =
  'h-9 rounded-[9px] border border-border-control bg-surface-control px-3 font-mono text-[13px] text-foreground outline-none transition-colors focus:border-muted-foreground/40'

export function SettingsNumber({
  label,
  hint,
  unit,
  value,
  min,
  max,
  onCommit
}: {
  label: string
  hint?: string

  unit?: string
  value: number
  min: number
  max: number
  onCommit: (value: number) => void
}) {
  const [text, setText] = useState(String(value))

  useEffect(() => {
    setText(String(value))
  }, [value])

  const commit = () => {
    const parsed = Number.parseInt(text, 10)
    if (Number.isNaN(parsed)) {
      setText(String(value))
      return
    }
    const clamped = Math.min(max, Math.max(min, parsed))
    setText(String(clamped))
    if (clamped !== value) onCommit(clamped)
  }

  return (
    <SettingsRow label={label} hint={hint}>
      <input
        type="text"
        inputMode="numeric"
        value={text}
        aria-label={label}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            setText(String(value))
            event.currentTarget.blur()
          }
        }}
        className={cn(VALUE_CONTROL, 'w-[92px] text-right')}
      />

      {unit && <span className="w-[38px] flex-shrink-0 text-xs text-glyph-dim">{unit}</span>}
    </SettingsRow>
  )
}

export function SettingsSelect<T extends string>({
  label,
  hint,
  value,
  options,
  onChange
}: {
  label: string
  hint?: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <SettingsRow label={label} hint={hint}>
      <select
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value as T)}
        className={cn(VALUE_CONTROL, 'w-[130px] cursor-pointer pr-2')}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-surface-editor">
            {option.label}
          </option>
        ))}
      </select>
    </SettingsRow>
  )
}
