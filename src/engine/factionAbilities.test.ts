import { describe, expect, it } from 'vitest'
import { applyMove } from './index'
import { combatBonus } from './board'
import { deepFreeze, toActionPhase, withPlayer, withUnits } from './testUtils'
import type { FactionId, GameState, Owner, UnitType } from './types'

/** Opens a round-1 space combat on bereg: seat 0 (set to `faction`) attacks seat 1 (Letnev). */
function spaceCombat(faction: FactionId, attackerShips: UnitType[], defenderShips: UnitType[]): GameState {
  const base = withPlayer(toActionPhase(1), 0, { faction })
  const cleared: GameState = { ...base, systems: { ...base.systems, bereg: { ...base.systems.bereg, space: [] } } }
  const s = withUnits(withUnits(cleared, 'bereg', 0, attackerShips), 'bereg', 1, defenderShips)
  return deepFreeze({
    ...s,
    tactical: { systemId: 'bereg', step: 'spaceCombat', combat: { round: 1, attacker: 0, defender: 1, retreating: null, retreatTo: null, lastRolls: [], pending: [] } },
  })
}

/** Rolls one combat round and returns the attacker's DieRolls for a given unit type. */
function attackerRolls(state: GameState, unit: UnitType, owner: Owner = 0) {
  const r = applyMove(state, { type: 'combatRound' }, 7)
  if (!r.ok) throw new Error(r.error)
  const rolls = (r.value.tactical?.combat?.lastRolls ?? []).filter(d => d.owner === owner && d.unit === unit)
  return rolls
}

describe('faction combat-roll modifiers', () => {
  it('combatBonus is +1 for Sardakk, -1 for Jol-Nar, 0 for a faction without a combat ability', () => {
    const base = toActionPhase(1)
    expect(combatBonus(withPlayer(base, 0, { faction: 'sardakk' }), 0)).toBe(1)
    expect(combatBonus(withPlayer(base, 0, { faction: 'jolnar' }), 0)).toBe(-1)
    expect(combatBonus(withPlayer(base, 0, { faction: 'letnev' }), 0)).toBe(0)
    expect(combatBonus(base, 'guardian')).toBe(0)
  })

  it("Sardakk N'orr's Unrelenting applies +1: a cruiser (combat 7) hits on 6+", () => {
    const rolls = attackerRolls(spaceCombat('sardakk', ['cruiser'], ['destroyer']), 'cruiser')
    expect(rolls.length).toBeGreaterThan(0)
    for (const roll of rolls) expect(roll.hit).toBe(roll.value >= 6)   // 7 - 1
  })

  it("Jol-Nar's Fragile applies -1: a cruiser (combat 7) hits on 8+", () => {
    const rolls = attackerRolls(spaceCombat('jolnar', ['cruiser'], ['destroyer']), 'cruiser')
    expect(rolls.length).toBeGreaterThan(0)
    for (const roll of rolls) expect(roll.hit).toBe(roll.value >= 8)   // 7 + 1
  })

  it('a faction without a combat ability keeps the printed value: a cruiser hits on 7+', () => {
    const rolls = attackerRolls(spaceCombat('letnev', ['cruiser'], ['destroyer']), 'cruiser')
    expect(rolls.length).toBeGreaterThan(0)
    for (const roll of rolls) expect(roll.hit).toBe(roll.value >= 7)
  })

  it('the modifier applies to the defender too, not just the attacker', () => {
    // seat 1 (the defender) is Jol-Nar here; seat 0 is a plain attacker
    const base = withPlayer(toActionPhase(1), 1, { faction: 'jolnar' })
    const cleared: GameState = { ...base, systems: { ...base.systems, bereg: { ...base.systems.bereg, space: [] } } }
    const s = withUnits(withUnits(cleared, 'bereg', 0, ['cruiser']), 'bereg', 1, ['cruiser'])
    const state: GameState = {
      ...s,
      tactical: { systemId: 'bereg', step: 'spaceCombat', combat: { round: 1, attacker: 0, defender: 1, retreating: null, retreatTo: null, lastRolls: [], pending: [] } },
    }
    const rolls = attackerRolls(deepFreeze(state), 'cruiser', 1)   // the Jol-Nar defender's cruiser
    expect(rolls.length).toBeGreaterThan(0)
    for (const roll of rolls) expect(roll.hit).toBe(roll.value >= 8)
  })
})
