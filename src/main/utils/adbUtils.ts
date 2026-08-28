import { app } from 'electron'
import path from 'path'

/** The platform-tools binary shipped inside the app bundle. */
export const getBundledAdbPath = (): string => {
  if (process.platform === 'win32') {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'extraResources', 'adbWin\\adb.exe')
      : path.join(process.cwd(), 'extraResources', 'adbWin\\adb.exe')
  } else if (process.platform === 'darwin') {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'extraResources', 'adbMac/adb')
      : path.join(process.cwd(), 'extraResources', 'adbMac/adb')
  }
  return 'adb'
}

/** The adb to run. */
export const getAdbPath = (override?: string): string => {
  const trimmed = override?.trim()
  return trimmed ? trimmed : getBundledAdbPath()
}
