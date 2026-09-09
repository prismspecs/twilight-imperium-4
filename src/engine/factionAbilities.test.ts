import { describe, expect, it } from 'vitest'
import { applyMove } from './index'
import { combatBonus, homeSystemOf } from './board'
import { carriedIds, deepFreeze, toActionPhase, toStatusPhase, withPlanetOwner, withPlayer, withTactical, withUnits } from './testUtils'
import { status, tokensGained } from './statusPhase'
import { secondary } from './strategicActions'
import type { FactionId, GameState, Owner, Seat, UnitType } from './types'

/**
 * Combat scenarios run in seat 0's home system (`homeSystemOf`, not a hard-coded id: the generated
 * galaxy names its tiles by seed, only the home ids are structural), cleared and refilled by hand.
 */

/** Opens a round-1 space combat in seat 0's home system: seat 0 (set to `faction`) attacks seat 1 (Letnev). */
function spaceCombat(faction: FactionId, attackerShips: UnitType[], defenderShips: UnitType[]): GameState {
  const base = withPlayer(toActionPhase(1), 0, { faction })
  const sysId = homeSystemOf(base, 0)
  const cleared: GameState = { ...base, systems: { ...base.systems, [sysId]: { ...base.systems[sysId], space: [] } } }
  const s = withUnits(withUnits(cleared, sysId, 0, attackerShips), sysId, 1, defenderShips)
  return deepFreeze({
    ...s,
    tactical: { systemId: sysId, step: 'spaceCombat', combat: { round: 1, attacker: 0, defender: 1, retreating: null, retreatTo: null, lastRolls: [], pending: [] } },
  })
}

/** Rolls one combat round and returns the DieRolls of `owner` for a given unit type. */
function attackerRolls(state: GameState, unit: UnitType, owner: Owner = 0) {
  const r = applyMove(state, { type: 'combatRound' }, 7)
  if (!r.ok) throw new Error(r.error)
  const rolls = (r.value.tactical?.combat?.lastRolls ?? []).filter(d => d.owner === owner && d.unit === unit)
  return rolls
}

/** A legal status-phase token distribution for the seat: every gained token lands in the tactic pool. */
function distributeAllToTactic(state: GameState, seat: Seat) {
  const t = state.players[seat].tokens
  return { ...t, tactic: t.tactic + tokensGained(state, seat) }
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
    const sysId = homeSystemOf(base, 0)
    const cleared: GameState = { ...base, systems: { ...base.systems, [sysId]: { ...base.systems[sysId], space: [] } } }
    const s = withUnits(withUnits(cleared, sysId, 0, ['cruiser']), sysId, 1, ['cruiser'])
    const state: GameState = {
      ...s,
      tactical: { systemId: sysId, step: 'spaceCombat', combat: { round: 1, attacker: 0, defender: 1, retreating: null, retreatTo: null, lastRolls: [], pending: [] } },
    }
    const rolls = attackerRolls(deepFreeze(state), 'cruiser', 1)   // the Jol-Nar defender's cruiser
    expect(rolls.length).toBeGreaterThan(0)
    for (const roll of rolls) expect(roll.hit).toBe(roll.value >= 8)
  })
})

/** Puts the seat in a status-phase state standing on a home planet it controls. */
function withStatusPhase(seed: number, seat: Seat, faction: FactionId): GameState {
  const base = withPlayer(toActionPhase(seed), seat, { faction })
  const sysId = homeSystemOf(base, seat)
  return withPlanetOwner(base, sysId, base.systems[sysId].planets[0].id, seat)
}

describe('faction non-combat abilities', () => {
  it('Arborec Mitosis places 1 infantry at the start of the status phase', () => {
    const state = toStatusPhase(withStatusPhase(2, 0, 'arborec'))
    const sysId = homeSystemOf(state, 0)
    const planetId = state.systems[sysId].planets[0].id
    const before = state.players[0].reinforcements.infantry
    const result = status(state, { tokens: distributeAllToTactic(state, 0), mitosisPlanet: planetId }, 1)
    if (!result.ok) throw new Error(result.error)
    const updated = result.value
    expect(updated.players[0].reinforcements.infantry).toBe(before - 1)
    const planet = updated.systems[sysId].planets.find(p => p.id === planetId)
    if (!planet) throw new Error(`missing planet ${planetId}`)
    expect(planet.ground.filter(u => u.owner === 0).length).toBeGreaterThan(0)
    // regression: Mitosis once spread the players array into a plain object and corrupted the state
    expect(Array.isArray(updated.players)).toBe(true)
  })

  it('Saar Scavenge gains 1 trade good after taking control of a planet', () => {
    const base = withPlayer(toActionPhase(3), 0, { faction: 'saar', tradeGoods: 5 })
    const sysId = homeSystemOf(base, 1)   // seat 0 invades seat 1's home planet
    const planetId = base.systems[sysId].planets[0].id
    // an undefended planet: control flips on the landing itself, no ground combat round needed
    const cleared: GameState = {
      ...base,
      systems: {
        ...base.systems,
        [sysId]: {
          ...base.systems[sysId],
          space: [],
          planets: base.systems[sysId].planets.map(p => ({ ...p, ground: [], structures: [] })),
        },
      },
    }
    let s = withUnits(cleared, sysId, 0, ['carrier', 'infantry'])
    s = withPlanetOwner(s, sysId, planetId, 1)
    s = withTactical(s, { systemId: sysId, step: 'invasion', invasion: { planetId: null, landed: [], bombarded: [], round: 0 } })
    const landed = applyMove(deepFreeze(s), { type: 'land', planetId, infantryIds: carriedIds(s, sysId, 0) }, 7)
    if (!landed.ok) throw new Error(landed.error)
    const planet = landed.value.systems[sysId].planets.find(p => p.id === planetId)
    if (!planet) throw new Error(`missing planet ${planetId}`)
    expect(planet.owner).toBe(0)
    expect(landed.value.players[0].tradeGoods).toBe(6)  // +1 from Scavenge
    // regression: Scavenge once spread the players array into a plain object and corrupted the state
    expect(Array.isArray(landed.value.players)).toBe(true)
  })

  it('Sol Versatile gains 1 additional command token during the status phase', () => {
    const state = toStatusPhase(withPlayer(toActionPhase(2), 0, { faction: 'sol' }))
    expect(tokensGained(state, 0)).toBe(3)   // 2 base + 1 Versatile
    const before = state.players[0].tokens
    const result = status(state, { tokens: distributeAllToTactic(state, 0) }, 1)
    if (!result.ok) throw new Error(result.error)
    const after = result.value.players[0].tokens
    expect(after.tactic + after.fleet + after.strategy).toBe(before.tactic + before.fleet + before.strategy + 3)
  })

  it('Hacan Masters of Trade answers the Trade secondary without spending a token', () => {
    const base = toActionPhase(2, 0)
    const state = withPlayer(base, 1, { faction: 'hacan', tokens: { ...base.players[1].tokens, strategy: 2 } })
    const withWindow: GameState = {
      ...state,
      active: 1,
      pendingSecondary: { card: 'trade', owner: 0, queue: [1] },
    }
    const result = secondary(deepFreeze(withWindow), 'trade', true, undefined, 3)
    if (!result.ok) throw new Error(result.error)
    expect(result.value.players[1].tokens.strategy).toBe(2)  // no token spent
  })
})
