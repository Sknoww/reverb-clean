import type { ScreenPermissionStatus } from '../../../types'

export const screenPermissionCopy = (status: ScreenPermissionStatus) => {
  if (status.platform === 'unsupported') {
    return { label: 'Unavailable', hint: 'Screen capture permission is managed only on macOS.' }
  }
  if (status.status === 'allowed') {
    return {
      label: 'Allowed',
      hint: status.relaunchRecommended
        ? 'Access is enabled. Relaunch Reverb to finish recovery.'
        : 'Reverb can capture screens for barcode scanning.'
    }
  }
  if (status.status === 'needs-repair') {
    return {
      label: 'Needs repair after update',
      hint: 'macOS still has the previous ad-hoc build. Reset Reverb only, then register this build.'
    }
  }
  if (status.status === 'restricted') {
    return {
      label: 'Restricted',
      hint: 'A system policy prevents Screen Recording access; Reverb cannot change it.'
    }
  }
  if (status.status === 'denied') {
    return {
      label: 'Denied',
      hint:
        status.recovery === 'awaiting-approval'
          ? 'Enable Reverb in Screen & System Audio Recording, then return here.'
          : 'Open macOS Settings to allow Reverb, then relaunch the app.'
    }
  }
  return {
    label: 'Not requested',
    hint:
      status.recovery === 'awaiting-registration'
        ? 'Run a screen scan once to register this build with macOS.'
        : 'macOS will ask when you first scan a screen.'
  }
}

export const screenPermissionActions = (status: ScreenPermissionStatus) => ({
  repair: status.status === 'needs-repair',
  openSettings: status.platform === 'darwin' && status.status !== 'restricted',
  relaunch: status.relaunchRecommended
})
