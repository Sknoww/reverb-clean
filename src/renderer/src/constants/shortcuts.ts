// The command-bar shortcut is bound as `metaKey || ctrlKey` (`commandTab.tsx`), so the two places that advertise it — the command bar's...
const isMac = /Mac/i.test(navigator.userAgent)

export const COMMAND_BAR_KEY = isMac ? '⌘K' : 'Ctrl K'
