import { describe, expect, it } from 'vitest'
import {
  CALIBRATION_DATA,
  getCalibratedStrategyCardAffinity,
  getCalibratedTechBonus,
  getFactionUnitAffinity,
  getTargetFleetTokens,
} from './calibrationData'

describe('calibrationData', () => {
  it('loads empirical dataset with over 10,000 games and 17 factions', () => {
    expect(CALIBRATION_DATA.totalGames).toBeGreaterThan(10000)
    expect(CALIBRATION_DATA.totalPlayers).toBeGreaterThan(30000)
    expect(Object.keys(CALIBRATION_DATA.factions).length).toBe(17)
  })

  it('provides high tech bonuses for signature faction techs', () => {
    const l1z1xDn = getCalibratedTechBonus('l1z1x', 'super_dreadnought_ii')
    const letnevNes = getCalibratedTechBonus('letnev', 'non_euclidean_shielding')
    expect(l1z1xDn).toBeGreaterThan(15)
    expect(letnevNes).toBeGreaterThan(15)

    // And penalizes unresearchable or counter-productive techs
    const l1z1xGenericDn = getCalibratedTechBonus('l1z1x', 'dreadnought_ii')
    expect(l1z1xGenericDn).toBeLessThan(0)
  })

  it('adjusts strategy card affinity based on game round context', () => {
    const r1Tech = getCalibratedStrategyCardAffinity('letnev', 'technology', 1)
    const r2Tech = getCalibratedStrategyCardAffinity('letnev', 'technology', 2)
    expect(r1Tech).toBeGreaterThan(r2Tech)

    const r1Imperial = getCalibratedStrategyCardAffinity('letnev', 'imperial', 1)
    const r2Imperial = getCalibratedStrategyCardAffinity('letnev', 'imperial', 2)
    expect(r1Imperial).toBeLessThan(r2Imperial)
  })

  it('accurately accounts for Letnev armada in target fleet tokens', () => {
    expect(getTargetFleetTokens('letnev')).toBe(3)
    expect(getTargetFleetTokens('l1z1x')).toBeGreaterThanOrEqual(4)
  })

  it('provides faction unit production affinities', () => {
    expect(getFactionUnitAffinity('letnev', 'dreadnought')).toBeGreaterThan(1.0)
    expect(getFactionUnitAffinity('sol', 'carrier')).toBeGreaterThan(1.0)
  })
})
