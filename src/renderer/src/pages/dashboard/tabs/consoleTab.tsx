import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { keymap, EditorView } from '@codemirror/view'
import { Prec } from '@codemirror/state'
import { insertNewlineAndIndent } from '@codemirror/commands'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import ShikiHighlighter, { createJavaScriptRegexEngine } from 'react-shiki'
import { memo, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  LuCheck,
  LuChevronDown,
  LuChevronUp,
  LuCopy,
  LuExternalLink,
  LuLoaderCircle,
  LuPlay,
  LuTrash2
} from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { useScrollMemory } from '@/lib/hooks/use-scroll-memory'
import { cn } from '@/lib/utils'
import { ConsoleResult, useConsoleContext } from '../contexts/consoleContext'
import { TARGET_MESSAGES, TargetNotice } from '../components/targetNotice'

// VS-dark token palette, taken from design frame 4a.
const vsDarkHighlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword, tags.self], color: '#c586c0' },
  {
    tag: [tags.variableName, tags.propertyName, tags.definition(tags.variableName)],
    color: '#9cdcfe'
  },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.labelName],
    color: '#dcdcaa'
  },
  { tag: [tags.typeName, tags.className, tags.namespace], color: '#4ec9b0' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: '#ce9178' },
  { tag: [tags.number, tags.unit], color: '#b5cea8' },
  { tag: [tags.bool, tags.null, tags.atom], color: '#569cd6' },
  { tag: [tags.operator, tags.punctuation, tags.separator, tags.bracket], color: '#d4d4d8' },
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment],
    color: '#6a9955',
    fontStyle: 'italic'
  },
  { tag: tags.invalid, color: '#fca5a5' }
])

// Frame metrics from 4a: 44px gutter with a hairline rule, 14px/1.55 mono body, 132px minimum.
const editorTheme = EditorView.theme(
  {
    '&': { backgroundColor: 'transparent', color: '#d4d4d8' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      fontFamily: 'inherit',
      fontSize: '14px',
      lineHeight: '1.55',
      minHeight: '132px'
    },
    '.cm-content': { padding: '14px 0', caretColor: 'hsl(var(--foreground))' },
    '.cm-line': { padding: '0 16px' },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      borderRight: '1px solid hsl(var(--hairline))',
      color: 'hsl(var(--glyph-dimmer))',
      minWidth: '44px'
    },
    '.cm-lineNumbers .cm-gutterElement': {
      minWidth: '44px',
      padding: '0 12px',
      textAlign: 'center'
    },
    '.cm-activeLine': { backgroundColor: 'transparent' },
    '.cm-cursor': { borderLeftColor: 'hsl(var(--foreground))' },
    '.cm-selectionBackground, ::selection': { backgroundColor: 'hsl(235 17.8% 36.3% / 0.4)' },
    '.cm-placeholder': { color: 'hsl(var(--glyph-dimmer))' }
  },
  { dark: true }
)

interface ConsoleTabProps {
  currentDeviceId: string
  /** A script provider URI is configured (area 19). */
  canRun: boolean
}

function parseResult(raw: unknown): { isJson: boolean; formatted: string } {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return { isJson: true, formatted: JSON.stringify(parsed, null, 2) }
    } catch {
      return { isJson: false, formatted: raw }
    }
  }
  if (typeof raw === 'object' && raw !== null) {
    return { isJson: true, formatted: JSON.stringify(raw, null, 2) }
  }
  return { isJson: false, formatted: String(raw) }
}

const MAX_RESULTS = 200
const COLLAPSED_BODY_HEIGHT = 168
const jsEngine = createJavaScriptRegexEngine()

// Quiet labelled card action (open / copy / expand) — 4a draws these as glyph + label rather than the bare icon buttons the tables use,...
function CardAction({
  icon,
  label,
  title,
  onClick
}: {
  icon: ReactNode
  label: string
  title?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      aria-label={title ?? label}
      className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-glyph-dim transition-colors hover:bg-row-hover hover:text-foreground"
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function ResultCard({
  result,
  isCopied,
  onCopy
}: {
  result: ConsoleResult
  isCopied: boolean
  onCopy: (id: string, text: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [canExpand, setCanExpand] = useState(false)
  const bodyRef = useRef<HTMLDivElement | null>(null)

  // `expand` only earns its slot when the body is actually clipped (4a shows it on the tall JSON card, not the one-line ones).
  useEffect(() => {
    if (expanded) return
    const el = bodyRef.current
    if (!el) return

    const measure = () => setCanExpand(el.scrollHeight > el.clientHeight + 1)
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    return () => observer.disconnect()
  }, [expanded, result.result])

  return (
    <div
      className={cn(
        'min-w-0 overflow-hidden rounded-xl border border-hairline bg-surface-panel px-4 py-3.5',
        result.isError && 'border-l-4 border-l-destructive'
      )}
      role={result.isError ? 'alert' : undefined}
    >
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-[11px] text-text-dim">{result.timestamp}</span>
          {result.isError && (
            <span className="rounded bg-destructive px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.04em] text-destructive-foreground">
              ERROR
            </span>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-0.5">
          {result.isJson && result.result && (
            <CardAction
              icon={<LuExternalLink className="h-3.5 w-3.5" />}
              label="open"
              title="Open in editor"
              onClick={() => window.dialogAPI.openTempInEditor(result.result!, '.json')}
            />
          )}
          <CardAction
            icon={
              isCopied ? (
                <LuCheck className="h-3.5 w-3.5 text-success" />
              ) : (
                <LuCopy className="h-3.5 w-3.5" />
              )
            }
            label="copy"
            title="Copy result"
            onClick={() =>
              onCopy(result.id, (result.isError ? result.errorMessage : result.result) ?? '')
            }
          />
          {!result.isError && canExpand && (
            <CardAction
              icon={
                expanded ? (
                  <LuChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <LuChevronDown className="h-3.5 w-3.5" />
                )
              }
              label={expanded ? 'collapse' : 'expand'}
              onClick={() => setExpanded((prev) => !prev)}
            />
          )}
        </div>
      </div>

      <p className="mb-2.5 truncate font-mono text-xs text-text-dim" title={result.expression}>
        &gt; {result.expression}
      </p>

      {result.isError ? (
        <p className="font-mono text-[13px] text-red-300">{result.errorMessage}</p>
      ) : (
        <div
          ref={bodyRef}
          className={cn(
            'w-full min-w-0',
            expanded ? 'max-h-[420px] overflow-y-auto' : 'overflow-hidden'
          )}
          style={expanded ? undefined : { maxHeight: COLLAPSED_BODY_HEIGHT }}
        >
          {result.isJson && result.result ? (
            // Shiki's generated <pre> ships the theme's own background and padding, which would draw a second box inside this one.
            <div className="code-ligatures overflow-x-auto rounded-lg border border-hairline bg-surface-chrome px-3.5 py-3 font-mono text-[13px] leading-relaxed [&_code]:!bg-transparent [&_pre]:!m-0 [&_pre]:!bg-transparent [&_pre]:!p-0">
              <ShikiHighlighter
                language="json"
                theme="dark-plus"
                showLanguage={false}
                engine={jsEngine}
              >
                {result.result}
              </ShikiHighlighter>
            </div>
          ) : (
            <pre className="whitespace-pre-wrap break-words font-mono text-[13px] text-foreground">
              {result.result ?? ''}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

const ResultCardMemo = memo(ResultCard)

export function ConsoleTab({ currentDeviceId, canRun }: ConsoleTabProps) {
  // Result/history/execution state lives in ConsoleContext so it survives
  // navigation (real routes unmount this screen — redesign C1b / D1).
  const {
    results,
    setResults,
    history,
    setHistory,
    historyIndex,
    setHistoryIndex,
    isExecuting,
    setIsExecuting,
    clearResults
  } = useConsoleContext()
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // The results themselves already survive navigation via the context above;
  // this is the matching half — where in them you were reading.
  const resultsRef = useScrollMemory('console')

  const editorViewRef = useRef<EditorView | null>(null)
  const currentInputRef = useRef<string>('')
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function setEditorValue(newValue: string) {
    if (editorViewRef.current) {
      editorViewRef.current.dispatch({
        changes: { from: 0, to: editorViewRef.current.state.doc.length, insert: newValue }
      })
    }
  }

  const handleExecute = useCallback(async () => {
    const script = currentInputRef.current.trim()
    if (!script || isExecuting || !currentDeviceId || !canRun) return

    setIsExecuting(true)
    setHistory((prev) => [script, ...prev])
    setHistoryIndex(-1)

    const timestamp = new Date().toLocaleTimeString()

    try {
      const response = await window.jsAPI.executeScript(script)

      let result: ConsoleResult

      if (response.success) {
        const { isJson, formatted } = parseResult(response.result ?? response.rawOutput)
        result = {
          id: crypto.randomUUID(),
          timestamp,
          expression: script,
          result: formatted,
          isJson,
          isError: false
        }
      } else {
        result = {
          id: crypto.randomUUID(),
          timestamp,
          expression: script,
          result: null,
          isJson: false,
          isError: true,
          errorMessage: response.message ?? response.error ?? 'Unknown error'
        }
      }

      setResults((prev) => [result, ...prev].slice(0, MAX_RESULTS))
    } catch (err: unknown) {
      const errorResult: ConsoleResult = {
        id: crypto.randomUUID(),
        timestamp,
        expression: script,
        result: null,
        isJson: false,
        isError: true,
        errorMessage: (err as Error)?.message ?? 'Unexpected error'
      }
      setResults((prev) => [errorResult, ...prev].slice(0, MAX_RESULTS))
    } finally {
      setIsExecuting(false)
    }
  }, [isExecuting, currentDeviceId, canRun])

  const navigateHistory = useCallback(
    (direction: 'up' | 'down') => {
      if (history.length === 0) return

      let newIndex: number
      if (direction === 'up') {
        newIndex = Math.min(historyIndex + 1, history.length - 1)
      } else {
        newIndex = Math.max(historyIndex - 1, -1)
      }

      setHistoryIndex(newIndex)

      if (newIndex === -1) {
        setEditorValue('')
      } else {
        setEditorValue(history[newIndex])
      }
    },
    [history, historyIndex]
  )

  const handleExecuteRef = useRef(handleExecute)
  useEffect(() => {
    handleExecuteRef.current = handleExecute
  }, [handleExecute])

  const navigateHistoryRef = useRef(navigateHistory)
  useEffect(() => {
    navigateHistoryRef.current = navigateHistory
  }, [navigateHistory])

  const keymapExtension = useMemo(
    () =>
      Prec.highest(
        keymap.of([
          {
            key: 'Enter',
            run: () => {
              handleExecuteRef.current()
              return true
            }
          },
          { key: 'Shift-Enter', run: insertNewlineAndIndent },
          {
            key: 'ArrowUp',
            run: (view) => {
              const line = view.state.doc.lineAt(view.state.selection.main.head)
              if (line.number === 1) {
                navigateHistoryRef.current('up')
                return true
              }
              return false
            }
          },
          {
            key: 'ArrowDown',
            run: (view) => {
              const line = view.state.doc.lineAt(view.state.selection.main.head)
              if (line.number === view.state.doc.lines) {
                navigateHistoryRef.current('down')
                return true
              }
              return false
            }
          }
        ])
      ),
    []
  )

  const editorExtensions = useMemo(
    () => [javascript(), editorTheme, syntaxHighlighting(vsDarkHighlight), keymapExtension],
    [keymapExtension]
  )

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    }
  }, [])

  const handleCopy = useCallback(async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
      setCopiedId(id)
      copyTimeoutRef.current = setTimeout(() => setCopiedId(null), 1500)
    } catch {
      setCopiedId(null)
    }
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Above the editor (19a) — the script you were writing is still worth
          keeping, so this narrows what's off rather than replacing the screen. */}
      {!canRun && (
        <div className="pb-3">
          <TargetNotice message={TARGET_MESSAGES.scripts} />
        </div>
      )}

      {/* Framed editor — gutter + VS-dark body, Run and the keymap hint overlaid top-right (4a). */}
      <div className="relative flex-shrink-0 overflow-hidden rounded-xl border border-border-bar bg-surface-editor">
        <CodeMirror
          placeholder="Enter a JavaScript expression..."
          extensions={editorExtensions}
          theme="none"
          basicSetup={{
            lineNumbers: true,
            foldGutter: false,
            highlightActiveLine: false,
            highlightActiveLineGutter: false,
            syntaxHighlighting: false
          }}
          className="font-mono code-ligatures"
          onChange={(val) => {
            currentInputRef.current = val
          }}
          onCreateEditor={(view) => {
            editorViewRef.current = view
          }}
          aria-label="JavaScript input"
        />
        <div className="pointer-events-none absolute right-2.5 top-2.5 flex items-center gap-2.5">
          <span className="font-mono text-[11px] text-glyph-dim">⇧↵ newline · ↑ history</span>
          <Button
            className="pointer-events-auto h-[34px] gap-1.5 rounded-[9px] px-3.5 text-[13px]"
            onClick={() => handleExecute()}
            disabled={isExecuting || !currentDeviceId || !canRun}
            title={
              !canRun
                ? 'No script provider configured — see Settings → Target'
                : !currentDeviceId
                  ? 'Select a device first'
                  : 'Run script'
            }
            aria-label="Run script"
            aria-busy={isExecuting}
          >
            {isExecuting ? (
              <LuLoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <LuPlay className="h-4 w-4" />
            )}
            Run
          </Button>
        </div>
      </div>

      {/* Results */}
      <div className="flex min-h-0 flex-1 flex-col" aria-live="polite">
        {results.length > 0 && (
          <div className="flex flex-shrink-0 items-center justify-between px-0.5 pb-2.5 pt-4">
            <span className="text-xs text-text-dim">
              {results.length} {results.length === 1 ? 'result' : 'results'} · newest first
            </span>
            <button
              type="button"
              onClick={clearResults}
              aria-label="Clear results"
              className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-glyph-dim transition-colors hover:bg-row-hover hover:text-foreground"
            >
              <LuTrash2 className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>
        )}

        {results.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              Run a JavaScript expression to see results here.
            </p>
          </div>
        ) : (
          <div ref={resultsRef} className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-3 pb-5">
              {results.map((result) => (
                <ResultCardMemo
                  key={result.id}
                  result={result}
                  isCopied={copiedId === result.id}
                  onCopy={handleCopy}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
