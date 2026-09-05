import { describe, expect, it } from 'vitest'
import { relativeTime, systemLabel } from './format'

const NOW = Date.UTC(2026, 8, 3, 12, 0, 0)
const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('relative time', () => {
  it('reads the last minute as just now', () => {
    expect(relativeTime(NOW, NOW)).toBe('just now')
    expect(relativeTime(NOW - 30 * SECOND, NOW)).toBe('just now')
    // a clock that went backwards must not produce "in 5 seconds"
    expect(relativeTime(NOW + 5 * SECOND, NOW)).toBe('just now')
  })

  it('counts minutes and hours', () => {
    expect(relativeTime(NOW - 75 * SECOND, NOW)).toBe('1 minute ago')
    expect(relativeTime(NOW - 2 * MINUTE, NOW)).toBe('2 minutes ago')
    expect(relativeTime(NOW - 59 * MINUTE, NOW)).toBe('59 minutes ago')
    expect(relativeTime(NOW - HOUR, NOW)).toBe('1 hour ago')
    expect(relativeTime(NOW - 5 * HOUR, NOW)).toBe('5 hours ago')
    expect(relativeTime(NOW - 23 * HOUR, NOW)).toBe('23 hours ago')
  })

  it('says yesterday, then days, weeks and months', () => {
    expect(relativeTime(NOW - 25 * HOUR, NOW)).toBe('yesterday')
    expect(relativeTime(NOW - 47 * HOUR, NOW)).toBe('yesterday')
    expect(relativeTime(NOW - 3 * DAY, NOW)).toBe('3 days ago')
    expect(relativeTime(NOW - 6 * DAY, NOW)).toBe('6 days ago')
    expect(relativeTime(NOW - 8 * DAY, NOW)).toBe('last week')
    expect(relativeTime(NOW - 21 * DAY, NOW)).toBe('3 weeks ago')
    expect(relativeTime(NOW - 70 * DAY, NOW)).toBe('2 months ago')
    expect(relativeTime(NOW - 400 * DAY, NOW)).toBe('over a year ago')
  })
})

describe('systemLabel and 000, 100, 200 tile numbering system', () => {
  it('formats duel map systems with their 000 and 100 coordinates', () => {
    expect(systemLabel('mecatol')).toBe('[000] Mecatol Rex')
    expect(systemLabel('quann')).toBe('[103] Quann')
    expect(systemLabel('bereg')).toBe('[104] Bereg')
    expect(systemLabel('starpoint')).toBe('[101] Starpoint')
    expect(systemLabel('home-s')).toBe('[102] Arc Prime')
    expect(systemLabel('sakulag')).toBe('[106] Sakulag')
  })

  it('formats generated galaxy systems with state coordinates', () => {
    const mockState = {
      systems: {
        'tile-25': { id: 'tile-25', name: 'Quann', q: 1, r: 0 },
        'tile-39': { id: 'tile-39', name: 'Alpha Wormhole', q: 2, r: -1 },
        'tile-40': { id: 'tile-40', name: 'Beta Wormhole', q: 0, r: 2 },
      },
    } as unknown as Parameters<typeof systemLabel>[1]

    expect(systemLabel('tile-25', mockState)).toBe('[103] Quann')
    expect(systemLabel('tile-39', mockState)).toBe('[206] Alpha Wormhole')
    expect(systemLabel('tile-40', mockState)).toBe('[203] Beta Wormhole')
  })

  it('falls back gracefully to tile catalogue name when state is absent', () => {
    expect(systemLabel('tile-25')).toBe('Quann')
    expect(systemLabel('tile-39')).toBe('Alpha Wormhole')
  })
})

