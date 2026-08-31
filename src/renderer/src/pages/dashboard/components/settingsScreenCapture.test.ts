import type { ScreenPermissionStatus } from '@/types'
import { describe, expect, it } from 'vitest'
import { screenPermissionActions, screenPermissionCopy } from './screenPermissionCopy'

const status = (
  value: ScreenPermissionStatus['status'],
  recovery: ScreenPermissionStatus['recovery'] = 'none',
  relaunchRecommended = false
): ScreenPermissionStatus => ({
  platform: 'darwin',
  status: value,
  recovery,
  relaunchRecommended
})

describe('screenPermissionCopy', () => {
  it.each([
    ['allowed', 'Allowed'],
    ['not-requested', 'Not requested'],
    ['needs-repair', 'Needs repair after update'],
    ['denied', 'Denied'],
    ['restricted', 'Restricted']
  ] as const)('names the %s renderer state', (value, label) => {
    expect(screenPermissionCopy(status(value)).label).toBe(label)
  })

  it('guides registration, approval, and the final relaunch separately', () => {
    expect(screenPermissionCopy(status('not-requested', 'awaiting-registration')).hint).toContain(
      'Run a screen scan'
    )
    expect(screenPermissionCopy(status('denied', 'awaiting-approval')).hint).toContain(
      'Enable Reverb'
    )
    expect(screenPermissionCopy(status('allowed', 'awaiting-approval', true)).hint).toContain(
      'Relaunch Reverb'
    )
  })

  it('offers only the actions valid for each security state', () => {
    expect(screenPermissionActions(status('needs-repair'))).toEqual({
      repair: true,
      openSettings: true,
      relaunch: false
    })
    expect(screenPermissionActions(status('restricted'))).toEqual({
      repair: false,
      openSettings: false,
      relaunch: false
    })
    expect(screenPermissionActions(status('allowed', 'awaiting-approval', true))).toEqual({
      repair: false,
      openSettings: true,
      relaunch: true
    })
  })
})
