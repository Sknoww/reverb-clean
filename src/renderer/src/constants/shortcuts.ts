const isMac = /Mac/i.test(navigator.userAgent)

export const COMMAND_BAR_KEY = isMac ? '⌘K' : 'Ctrl K'
