import { describe, expect, it } from 'vitest'
import { applyMove } from './index'
import { bombardablePlanets, groundCombatPending, landablePlanets } from './invasion'
import { carriedIds, deepFreeze, groundIds, hitsIn, shipId, toActionPhase, withPlanetOwner, withTactical, withTechs, withUnits } from './testUtils'
import type { GameState, Move, Seat, UnitType } from './types'

/** Clears the system, gives the seat ships plus carried infantry and opens the invasion step. */
function invasion(systemId: string, ships: UnitType[], carried: number, seat: Seat = 0): GameState {
  const base = toActionPhase(1, seat)
  const cleared: GameState = { ...base, systems: { ...base.systems, [systemId]: { ...base.systems[systemId], space: [] } } }
  const troops: UnitType[] = Array.from({ length: carried }, () => 'infantry')
  const s = withUnits(cleared, systemId, seat, [...ships, ...troops])
  return withTactical(s, { systemId, step: 'invasion', invasion: { planetId: null, landed: [], bombarded: [], round: 0 } })
}

const apply = (state: GameState, move: Move, seed = 5) => {
  const r = applyMove(deepFreeze(state), move, seed)
  if (!r.ok) throw new Error(r.error)
  return r.value
}

const planet = (state: GameState, systemId: string, planetId: string) => {
  const p = state.systems[systemId].planets.find(x => x.id === planetId)
  if (!p) throw new Error(`no planet ${planetId}`)
  return p
}

const groundOf = (state: GameState, systemId: string, planetId: string, owner: Seat | 'guardian') =>
  planet(state, systemId, planetId).ground.filter(u => u.owner === owner)

describe('R4.3 invasion', () => {
  it('R4.3 step 1: bombardment destroys ground forces and each planet is bombarded once', () => {
    const s = withUnits(invasion('bereg', ['dreadnought'], 0), 'bereg', 1, ['infantry', 'infantry', 'infantry'], 'bereg')
    const after = apply(s, { type: 'bombard', planetId: 'bereg' })
    expect(groundOf(after, 'bereg', 'bereg', 1)).toHaveLength(3 - hitsIn(after, 'bombardment of bereg'))
    expect(after.tactical?.invasion?.bombarded).toEqual(['bereg'])
    expect(applyMove(after, { type: 'bombard', planetId: 'bereg' }, 5).ok).toBe(false)
    expect(applyMove(s, { type: 'bombard', planetId: 'lirta-iv' }, 5).ok).toBe(false)   // no ground forces there
  })
  it('R4.3 step 1: a planetary shield blocks the bombardment, L4 Disruptors does not help, Arc Secundus does', () => {
    const base = withUnits(invasion('bereg', ['dreadnought'], 0), 'bereg', 1, ['infantry'], 'bereg')
    const shielded = withUnits(base, 'bereg', 1, ['pds'], 'bereg')
    expect(applyMove(shielded, { type: 'bombard', planetId: 'bereg' }, 5).ok).toBe(false)
    const letnev = withUnits(withUnits(invasion('bereg', ['dreadnought'], 0, 1), 'bereg', 0, ['infantry'], 'bereg'), 'bereg', 0, ['pds'], 'bereg')
    expect(applyMove(withTechs(letnev, 1, ['l4_disruptors']), { type: 'bombard', planetId: 'bereg' }, 5).ok).toBe(false)
    const arcSecundus = withUnits(withUnits(invasion('bereg', ['flagship'], 0, 1), 'bereg', 0, ['infantry'], 'bereg'), 'bereg', 0, ['pds'], 'bereg')
    expect(applyMove(arcSecundus, { type: 'bombard', planetId: 'bereg' }, 5).ok).toBe(true)
  })
  it('R4.3 step 1: Plasma Scoring adds one bombardment die', () => {
    const s = withUnits(invasion('bereg', ['dreadnought'], 0), 'bereg', 1, ['infantry', 'infantry'], 'bereg')
    const after = apply(s, { type: 'bombard', planetId: 'bereg' })
    const rolls = after.log.flatMap(e => e.t === 'roll' && e.context === 'bombardment of bereg' ? e.rolls : [])
    expect(rolls).toHaveLength(2)   // the dreadnought's die plus the Plasma Scoring die
  })
  it('R4.3 steps 2 and 3: landing infantry are shot at by the PDS on the planet unless L4 Disruptors', () => {
    const base = withUnits(invasion('bereg', ['carrier'], 3), 'bereg', 1, ['pds'], 'bereg')
    const after = apply(base, { type: 'land', planetId: 'bereg', infantryIds: carriedIds(base, 'bereg', 0) })
    expect(groundOf(after, 'bereg', 'bereg', 0)).toHaveLength(3 - hitsIn(after, 'space cannon defense on bereg'))
    expect(after.systems.bereg.space.filter(u => u.type === 'infantry')).toHaveLength(0)
    const letnev = withTechs(withUnits(invasion('bereg', ['carrier'], 3, 1), 'bereg', 0, ['pds'], 'bereg'), 1, ['l4_disruptors'])
    const safe = apply(letnev, { type: 'land', planetId: 'bereg', infantryIds: carriedIds(letnev, 'bereg', 1) })
    expect(groundOf(safe, 'bereg', 'bereg', 1)).toHaveLength(3)
    expect(safe.log.some(e => e.t === 'roll' && e.context === 'space cannon defense on bereg')).toBe(false)
  })
  it('R4.3 step 4: ground combat rolls both sides until one of them is gone', () => {
    const base = withUnits(invasion('bereg', ['carrier'], 2), 'bereg', 1, ['infantry', 'infantry'], 'bereg')
    let s = apply(base, { type: 'land', planetId: 'bereg', infantryIds: carriedIds(base, 'bereg', 0) })
    expect(s.tactical?.invasion?.planetId).toBe('bereg')
    for (let i = 0; i < 30; i++) {
      const ground = planet(s, 'bereg', 'bereg').ground
      if (!ground.some(u => u.owner === 0) || !ground.some(u => u.owner === 1)) break
      s = apply(s, { type: 'groundCombatRound' }, 20 + i)
    }
    const ground = planet(s, 'bereg', 'bereg').ground
    expect(ground.some(u => u.owner === 0) && ground.some(u => u.owner === 1)).toBe(false)
    expect(s.log.some(e => e.t === 'roll' && e.context === 'ground combat on bereg')).toBe(true)
    expect(planet(s, 'bereg', 'bereg').owner).toBe(ground.some(u => u.owner === 0) ? 0 : null)
  })
  it('R4.3 step 5: control changes, the planet is exhausted and the structures are destroyed', () => {
    const base = withUnits(invasion('bereg', ['carrier'], 2, 1), 'bereg', 0, ['spacedock'], 'bereg')
    const s = withPlanetOwner(base, 'bereg', 'bereg', 0)
    const after = apply(s, { type: 'land', planetId: 'bereg', infantryIds: carriedIds(s, 'bereg', 1) })
    const p = planet(after, 'bereg', 'bereg')
    expect(p.owner).toBe(1)
    expect(p.exhausted).toBe(true)
    expect(p.structures).toEqual([])
    expect(after.players[0].reinforcements.spacedock).toBe(s.players[0].reinforcements.spacedock + 1)
  })
  it('R4.3 step 5: L1Z1X Assimilate replaces the structures with its own', () => {
    const base = withUnits(invasion('bereg', ['carrier'], 2), 'bereg', 1, ['spacedock'], 'bereg')
    const s = withPlanetOwner(base, 'bereg', 'bereg', 1)
    const after = apply(s, { type: 'land', planetId: 'bereg', infantryIds: carriedIds(s, 'bereg', 0) })
    const p = planet(after, 'bereg', 'bereg')
    expect(p.owner).toBe(0)
    expect(p.structures.map(u => u.type)).toEqual(['spacedock'])
    expect(p.structures.every(u => u.owner === 0)).toBe(true)
    expect(after.players[0].reinforcements.spacedock).toBe(s.players[0].reinforcements.spacedock - 1)
    expect(after.players[1].reinforcements.spacedock).toBe(s.players[1].reinforcements.spacedock + 1)
  })
  it('Mecatol Rex: landing is blocked while Custodians token remains; removeCustodians unlocks it', () => {
    const base = invasion('mecatol', ['carrier'], 3)
    expect(landablePlanets(base)).toEqual([])
    expect(applyMove(base, { type: 'land', planetId: 'mecatol-rex', infantryIds: carriedIds(base, 'mecatol', 0) }, 5).ok).toBe(false)
    const withTg: GameState = { ...base, players: [{ ...base.players[0], tradeGoods: 6 }, base.players[1]] }
    const removed = apply(withTg, { type: 'removeCustodians', tradeGoods: 6 })
    expect(removed.custodiansToken).toBe(false)
    expect(removed.players[0].vp).toBe(base.players[0].vp + 1)
    expect(removed.players[0].tradeGoods).toBe(0)
    expect(landablePlanets(removed).map(p => p.planetId)).toEqual(['mecatol-rex'])
    const landed = apply(removed, { type: 'land', planetId: 'mecatol-rex', infantryIds: carriedIds(removed, 'mecatol', 0) })
    expect(planet(landed, 'mecatol', 'mecatol-rex').owner).toBe(0)
  })
  it('ground combat on Mecatol Rex resolves normally when defending forces are present', () => {
    const base = invasion('mecatol', ['carrier'], 3)
    const open: GameState = { ...base, custodiansToken: false }
    const defended = withUnits(open, 'mecatol', 1, ['infantry', 'infantry'], 'mecatol-rex')
    let s = apply(defended, { type: 'land', planetId: 'mecatol-rex', infantryIds: carriedIds(defended, 'mecatol', 0) })
    expect(groundOf(s, 'mecatol', 'mecatol-rex', 1)).toHaveLength(2)
    for (let i = 0; i < 30; i++) {
      const ground = planet(s, 'mecatol', 'mecatol-rex').ground
      if (!ground.some(u => u.owner === 0) || !ground.some(u => u.owner === 1)) break
      s = apply(s, { type: 'groundCombatRound' }, 40 + i)
    }
    const mine = groundOf(s, 'mecatol', 'mecatol-rex', 0)
    expect(planet(s, 'mecatol', 'mecatol-rex').owner).toBe(mine.length ? 0 : 1)
  })
  it('HARROW: L1Z1X bombards again after each ground combat round', () => {
    const base = withUnits(invasion('bereg', ['carrier', 'dreadnought'], 2), 'bereg', 1, ['infantry', 'infantry', 'infantry', 'infantry'], 'bereg')
    const landed = apply(base, { type: 'land', planetId: 'bereg', infantryIds: carriedIds(base, 'bereg', 0) })
    const after = apply(landed, { type: 'groundCombatRound' }, 11)
    expect(after.log.some(e => e.t === 'roll' && e.context === 'Harrow bombardment of bereg')).toBe(true)
    const letnev = withUnits(invasion('bereg', ['carrier', 'dreadnought'], 2, 1), 'bereg', 0, ['infantry', 'infantry', 'infantry', 'infantry'], 'bereg')
    const other = apply(apply(letnev, { type: 'land', planetId: 'bereg', infantryIds: carriedIds(letnev, 'bereg', 1) }), { type: 'groundCombatRound' }, 11)
    expect(other.log.some(e => e.t === 'roll' && e.context === 'Harrow bombardment of bereg')).toBe(false)
  })
  it('endInvasion goes to the production step with an own space dock, otherwise straight to done', () => {
    const plain = invasion('bereg', ['carrier'], 0)
    expect(apply(plain, { type: 'endInvasion' }).tactical?.step).toBe('done')
    const withDock = withUnits(plain, 'bereg', 0, ['spacedock'], 'bereg')
    expect(apply(withDock, { type: 'endInvasion' }).tactical?.step).toBe('production')
  })
  it('endInvasion is rejected while a ground combat is unresolved', () => {
    const base = withUnits(invasion('bereg', ['carrier'], 2), 'bereg', 1, ['infantry', 'infantry', 'infantry', 'infantry', 'infantry'], 'bereg')
    const landed = apply(base, { type: 'land', planetId: 'bereg', infantryIds: carriedIds(base, 'bereg', 0) })
    expect(applyMove(landed, { type: 'endInvasion' }, 0).ok).toBe(false)
  })
  it('R4.3: bombardment ends once landing has begun this invasion', () => {
    const base = withUnits(invasion('bereg', ['carrier', 'dreadnought'], 3), 'bereg', 1, ['infantry', 'infantry', 'infantry'], 'bereg')
    const after = apply(base, { type: 'land', planetId: 'bereg', infantryIds: carriedIds(base, 'bereg', 0) })
    expect(applyMove(after, { type: 'bombard', planetId: 'bereg' }, 5).ok).toBe(false)
    expect(bombardablePlanets(after)).toEqual([])
  })
  it('R4.3 step 1: bombardment resolves control immediately when it clears the last defenders and the attacker already holds ground', () => {
    const withDefender = withUnits(invasion('bereg', ['dreadnought'], 0), 'bereg', 1, ['infantry'], 'bereg')
    const s = withUnits(withDefender, 'bereg', 0, ['infantry'], 'bereg')
    let after = apply(s, { type: 'bombard', planetId: 'bereg' }, 1)
    for (let seed = 2; hitsIn(after, 'bombardment of bereg') < 1 && seed < 50; seed++) after = apply(s, { type: 'bombard', planetId: 'bereg' }, seed)
    expect(hitsIn(after, 'bombardment of bereg')).toBeGreaterThanOrEqual(1)
    expect(groundOf(after, 'bereg', 'bereg', 1)).toHaveLength(0)
    expect(planet(after, 'bereg', 'bereg').owner).toBe(0)
    expect(planet(after, 'bereg', 'bereg').exhausted).toBe(true)
  })
  it('R4.3 step 1: bombardment only ever kills the defender\'s ground forces, never the attacker\'s own', () => {
    const s = withUnits(withUnits(invasion('bereg', ['dreadnought'], 0), 'bereg', 1, ['infantry', 'infantry'], 'bereg'), 'bereg', 0, ['infantry'], 'bereg')
    const after = apply(s, { type: 'bombard', planetId: 'bereg' })
    expect(groundOf(after, 'bereg', 'bereg', 0)).toHaveLength(1)
    expect(groundOf(after, 'bereg', 'bereg', 1)).toHaveLength(2 - hitsIn(after, 'bombardment of bereg'))
  })
  it('R4.3 step 3: a landing party wiped out by space cannon defense leaves the invasion without a selected planet', () => {
    const base = withUnits(invasion('bereg', ['carrier'], 1), 'bereg', 1, ['pds'], 'bereg')
    const after = apply(base, { type: 'land', planetId: 'bereg', infantryIds: carriedIds(base, 'bereg', 0) })
    const wiped = hitsIn(after, 'space cannon defense on bereg') >= 1
    expect(groundOf(after, 'bereg', 'bereg', 0)).toHaveLength(wiped ? 0 : 1)
    expect(after.tactical?.invasion?.planetId).toBe(wiped ? null : 'bereg')
  })
  it('R4.3 step 1: the second bombardment of an invasion rolls its own dice, not a replay of the first', () => {
    const one = withUnits(invasion('bereg', ['dreadnought'], 0), 'bereg', 1, ['infantry', 'infantry'], 'bereg')
    const both = withUnits(one, 'bereg', 1, ['infantry', 'infantry'], 'lirta-iv')
    const after = apply(apply(both, { type: 'bombard', planetId: 'bereg' }, 5), { type: 'bombard', planetId: 'lirta-iv' }, 5)
    const rolls = (context: string) => after.log.flatMap(e => e.t === 'roll' && e.context === context ? e.rolls.map(r => r.value) : [])
    expect(rolls('bombardment of bereg')).not.toEqual(rolls('bombardment of lirta-iv'))
  })
  it('R4.3 step 4: no landing at all while a ground combat is running, and the enumerator offers none', () => {
    const base = withUnits(invasion('bereg', ['carrier'], 4), 'bereg', 1, ['infantry', 'infantry', 'infantry'], 'bereg')
    const landed = apply(base, { type: 'land', planetId: 'bereg', infantryIds: carriedIds(base, 'bereg', 0).slice(0, 2) })
    expect(groundCombatPending(landed)).toBe(true)
    expect(landablePlanets(landed)).toEqual([])
    const left = carriedIds(landed, 'bereg', 0)
    expect(applyMove(landed, { type: 'land', planetId: 'bereg', infantryIds: left }, 5).ok).toBe(false)
    expect(applyMove(landed, { type: 'land', planetId: 'lirta-iv', infantryIds: left }, 5).ok).toBe(false)
  })
  it('R4.3 step 3: a planet is landed on only once per invasion', () => {
    const base = invasion('bereg', ['carrier'], 4)   // empty planets, so nothing starts a ground combat
    const landed = apply(base, { type: 'land', planetId: 'bereg', infantryIds: carriedIds(base, 'bereg', 0).slice(0, 2) })
    expect(landed.tactical?.invasion?.planetId).toBe('bereg')
    const left = carriedIds(landed, 'bereg', 0)
    expect(applyMove(landed, { type: 'land', planetId: 'bereg', infantryIds: left }, 5).ok).toBe(false)
    expect(landablePlanets(landed).map(l => l.planetId)).toEqual(['lirta-iv'])
    expect(applyMove(landed, { type: 'land', planetId: 'lirta-iv', infantryIds: left }, 5).ok).toBe(true)
  })
  it('the enumerators mirror the validators exactly: every enumerated move is legal', () => {
    const seed = 7
    const scenarios: GameState[] = [
      invasion('bereg', ['dreadnought'], 0),                                                                                       // before any landing
      withUnits(invasion('bereg', ['dreadnought'], 0), 'bereg', 1, ['infantry'], 'bereg'),                                          // enemy ground present
      withUnits(withUnits(invasion('bereg', ['dreadnought'], 0), 'bereg', 1, ['infantry'], 'bereg'), 'bereg', 1, ['pds'], 'bereg'),  // shielded planet
      invasion('bereg', ['carrier'], 3),                                                                                            // no bombardment ship
    ]
    for (const s of scenarios) {
      for (const planetId of bombardablePlanets(s)) {
        expect(applyMove(s, { type: 'bombard', planetId }, seed).ok).toBe(true)
      }
      for (const { planetId, infantryIds } of landablePlanets(s)) {
        expect(applyMove(s, { type: 'land', planetId, infantryIds }, seed).ok).toBe(true)
      }
      expect(applyMove(s, { type: 'groundCombatRound' }, seed).ok).toBe(groundCombatPending(s))
    }
    const base = withUnits(invasion('bereg', ['carrier', 'dreadnought'], 2), 'bereg', 1, ['infantry', 'infantry'], 'bereg')
    const landed = apply(base, { type: 'land', planetId: 'bereg', infantryIds: carriedIds(base, 'bereg', 0) })
    expect(bombardablePlanets(landed)).toEqual([])   // R4.3: landing has begun
    for (const { planetId, infantryIds } of landablePlanets(landed)) {
      expect(applyMove(landed, { type: 'land', planetId, infantryIds }, seed).ok).toBe(true)
    }
    expect(applyMove(landed, { type: 'groundCombatRound' }, seed).ok).toBe(groundCombatPending(landed))
  })
})

describe('R4.3: the invasion step only opens when there is something to invade', () => {
  const activate = (state: GameState, systemId: string) => {
    const r = applyMove(state, { type: 'startTactical', systemId }, 0)
    if (!r.ok) throw new Error(r.error)
    return r.value
  }
  const step = (state: GameState) => {
    const r = applyMove(state, { type: 'endMovement' }, 0)
    if (!r.ok) throw new Error(r.error)
    return r.value.tactical?.step
  }
  it('skips it when only ships arrive and there is nothing on the ground', () => {
    const moved = activate(toActionPhase(), 'bereg')
    const carrier = shipId(moved, 'home-n', 'carrier')
    const r = applyMove(moved, { type: 'moveShips', moves: [{ unitId: carrier, from: 'home-n', carrying: [] }] }, 0)
    if (!r.ok) throw new Error(r.error)
    expect(step(r.value)).toBe('done')
  })
  it('opens it when infantry came along', () => {
    const moved = activate(toActionPhase(), 'bereg')
    const carrier = shipId(moved, 'home-n', 'carrier')
    const troops = groundIds(moved, 'home-n', '000').slice(0, 2)
    const r = applyMove(moved, { type: 'moveShips', moves: [{ unitId: carrier, from: 'home-n', carrying: troops }] }, 0)
    if (!r.ok) throw new Error(r.error)
    expect(step(r.value)).toBe('invasion')
  })
  it('opens it when an enemy planet in the system can be bombarded', () => {
    const held = withPlanetOwner(withUnits(toActionPhase(), 'bereg', 1, ['infantry'], 'bereg'), 'bereg', 'bereg', 1)
    const moved = activate(held, 'bereg')
    const dread = shipId(moved, 'home-n', 'dreadnought')
    const r = applyMove(moved, { type: 'moveShips', moves: [{ unitId: dread, from: 'home-n', carrying: [] }] }, 0)
    if (!r.ok) throw new Error(r.error)
    expect(step(r.value)).toBe('invasion')
  })
  it('goes to production when the system has a space dock of yours', () => {
    expect(step(activate(toActionPhase(), 'home-n'))).toBe('production')
  })
  it('opens invasion step on Mecatol Rex when Custodians token remains and player arrives with ships', () => {
    const s = activate(toActionPhase(), 'mecatol')
    const dread = shipId(s, 'home-n', 'dreadnought')
    const r = applyMove(s, { type: 'moveShips', moves: [{ unitId: dread, from: 'home-n', carrying: [] }] }, 0)
    if (!r.ok) throw new Error(r.error)
    expect(step(r.value)).toBe('invasion')
  })
})
