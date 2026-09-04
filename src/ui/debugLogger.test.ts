import { describe, expect, it } from 'vitest'
import { clearDebugLog, diagnoseMovement, getDebugLogEntries, logError, logInfo, logWarn, subscribeDebugLog } from './debugLogger'
import { toActionPhase, withPlayer } from '../engine/testUtils'
import { homeSystemId } from '../data/map'

describe('debugLogger', () => {
  it('records log entries with levels and categories and notifies listeners', () => {
    clearDebugLog()
    let notifications = 0
    const unsub = subscribeDebugLog(() => { notifications++ })

    logInfo('Test', 'info message', { foo: 'bar' })
    logWarn('Test', 'warn message')
    logError('Test', 'error message')

    const entries = getDebugLogEntries()
    expect(entries.length).toBe(3)
    expect(entries[0].level).toBe('INFO')
    expect(entries[0].message).toBe('info message')
    expect(entries[0].data).toEqual({ foo: 'bar' })

    expect(entries[1].level).toBe('WARN')
    expect(entries[2].level).toBe('ERROR')
    expect(notifications).toBe(3)

    unsub()
    logInfo('Test', 'after unsub')
    expect(notifications).toBe(3)
  })

  it('clears log entries', () => {
    logInfo('Test', 'sample')
    expect(getDebugLogEntries().length).toBeGreaterThan(0)
    clearDebugLog()
    expect(getDebugLogEntries().length).toBe(0)
  })

  it('diagnoses movement reachability accurately', () => {
    const s = toActionPhase()
    const home = homeSystemId(0)
    // Target is home system itself
    const selfDiag = diagnoseMovement(s, 0, home)
    expect(selfDiag.some(line => line.includes('ships in destination cannot move into it'))).toBe(true)

    // Player with 0 tactic tokens
    const broke = withPlayer(s, 0, { tokens: { tactic: 0, fleet: 3, strategy: 2 } })
    const brokeDiag = diagnoseMovement(broke, 0, 'bereg')
    expect(brokeDiag.some(line => line.includes('0 tactic command tokens'))).toBe(true)

    // Activated origin system (LRR 49.2)
    const activatedHome = {
      ...s,
      systems: {
        ...s.systems,
        [home]: {
          ...s.systems[home],
          activatedBy: [0 as const],
        },
      },
    }
    const lockedDiag = diagnoseMovement(activatedHome, 0, 'bereg')
    expect(lockedDiag.some(line => line.includes('LRR 49.2: ships cannot move out of an activated system'))).toBe(true)
  })
})
