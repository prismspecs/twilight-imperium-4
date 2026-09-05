import { describe, expect, it } from 'vitest'
import { applyMove, legalMoves } from './index'
import { constructionPlanets } from './strategicActions'
import { deepFreeze, toActionPhase, withCards, withPlanetOwner, withPlayer, withUnits } from './testUtils'
import type { GameState, Result, StrategicParams, StrategyCardId } from './types'

const play = (state: GameState, card: StrategyCardId, params?: StrategicParams) =>
  applyMove(deepFreeze(state), { type: 'strategic', card, params }, 0)
const answer = (state: GameState, card: StrategyCardId, accept: boolean, params?: StrategicParams) =>
  applyMove(deepFreeze(state), { type: 'secondary', card, accept, params }, 0)
const value = (r: Result<GameState>): GameState => {
  if (!r.ok) throw new Error(r.error)
  return r.value
}

/** Seat 0 holds the card and is active, seat 1 answers. */
function holder(card: StrategyCardId): GameState {
  return withCards(withCards(toActionPhase(), 1, []), 0, [card])
}

describe('R6 Politics', () => {
  it('gives the speaker token to the chosen player, who may be the card holder', () => {
    const s = holder('politics')                     // seat 0 is the speaker in the duel setup
    expect(s.speaker).toBe(0)
    const played = value(play(s, 'politics', { speakerTo: 1 }))
    expect(played.speaker).toBe(1)
    expect(played.log.some(e => e.t === 'info' && e.text === 'seat 1 takes the speaker token')).toBe(true)
  })

  it('refuses the current speaker, an unknown seat, and a missing choice', () => {
    const s = holder('politics')
    expect(play(s, 'politics', { speakerTo: 0 }).ok).toBe(false)     // seat 0 is already the speaker
    expect(play(s, 'politics', { speakerTo: 7 }).ok).toBe(false)
    expect(play(s, 'politics').ok).toBe(false)
  })

  it('draws 2 action cards for the card holder', () => {
    const s = holder('politics')
    const top = s.actionCardDeck.slice(0, 2)
    const played = value(play(s, 'politics', { speakerTo: 1 }))
    expect(played.players[0].actionCards).toEqual(top)
    expect(played.actionCardDeck.length).toBe(s.actionCardDeck.length - 2)
  })

  it('looks at the top 2 agenda cards and puts them back in the order named', () => {
    const s = holder('politics')
    const [first, second, third] = s.agendaDeck
    // swapped, both back on top
    const swapped = value(play(s, 'politics', { speakerTo: 1, agendaTop: [second, first], agendaBottom: [] }))
    expect(swapped.agendaDeck.slice(0, 3)).toEqual([second, first, third])
    expect(swapped.agendaDeck.length).toBe(s.agendaDeck.length)
    // one to the bottom
    const buried = value(play(s, 'politics', { speakerTo: 1, agendaTop: [second], agendaBottom: [first] }))
    expect(buried.agendaDeck[0]).toBe(second)
    expect(buried.agendaDeck[1]).toBe(third)
    expect(buried.agendaDeck[buried.agendaDeck.length - 1]).toBe(first)
    // naming nothing leaves the deck as it was, which is one of the legal arrangements
    expect(value(play(s, 'politics', { speakerTo: 1 })).agendaDeck).toEqual(s.agendaDeck)
  })

  it('refuses an arrangement that loses, duplicates or invents an agenda card', () => {
    const s = holder('politics')
    const [first, second] = s.agendaDeck
    expect(play(s, 'politics', { speakerTo: 1, agendaTop: [first] }).ok).toBe(false)
    expect(play(s, 'politics', { speakerTo: 1, agendaTop: [first, first] }).ok).toBe(false)
    expect(play(s, 'politics', { speakerTo: 1, agendaTop: [first, second], agendaBottom: [second] }).ok).toBe(false)
    expect(play(s, 'politics', { speakerTo: 1, agendaTop: ['no_such_agenda', second] }).ok).toBe(false)
  })

  it('secondary: one strategy token draws 2 action cards', () => {
    const played = value(play(holder('politics'), 'politics', { speakerTo: 1 }))
    const before = played.players[1].tokens.strategy
    const used = value(answer(played, 'politics', true))
    expect(used.players[1].actionCards.length).toBe(2)
    expect(used.players[1].tokens.strategy).toBe(before - 1)
  })

  it('enumerates one primary per player other than the speaker, and the secondary answer', () => {
    const s = holder('politics')
    const moves = legalMoves(s).filter(m => m.type === 'strategic' && m.card === 'politics')
    expect(moves).toHaveLength(1)                                   // two players, one of them the speaker
    for (const move of moves) expect(applyMove(s, move, 0).ok).toBe(true)
    const played = value(play(s, 'politics', { speakerTo: 1 }))
    expect(legalMoves(played).some(m => m.type === 'secondary' && m.accept)).toBe(true)
  })
})

describe('R6 Construction', () => {
  it('places a space dock and a PDS on planets you control', () => {
    const s = withPlanetOwner(holder('construction'), 'bereg', 'bereg', 0)
    const played = value(play(s, 'construction', {
      structures: [{ planetId: 'bereg', type: 'spacedock' }, { planetId: '000', type: 'pds' }],
    }))
    expect(played.systems.bereg.planets[0].structures.some(u => u.type === 'spacedock' && u.owner === 0)).toBe(true)
    expect(played.systems['home-n'].planets[0].structures.some(u => u.type === 'pds' && u.owner === 0)).toBe(true)
    expect(played.players[0].reinforcements.spacedock).toBe(s.players[0].reinforcements.spacedock - 1)
    expect(played.players[0].reinforcements.pds).toBe(s.players[0].reinforcements.pds - 1)
  })

  it('lets the first structure be a PDS too, but never lets the second be a space dock', () => {
    const s = withPlanetOwner(holder('construction'), 'bereg', 'bereg', 0)
    expect(play(s, 'construction', { structures: [{ planetId: '000', type: 'pds' }, { planetId: 'bereg', type: 'pds' }] }).ok).toBe(true)
    expect(play(s, 'construction', { structures: [{ planetId: '000', type: 'pds' }, { planetId: 'bereg', type: 'spacedock' }] }).ok).toBe(false)
    expect(play(s, 'construction', { structures: [{ planetId: '000', type: 'pds' }, { planetId: 'bereg', type: 'pds' }, { planetId: 'bereg', type: 'pds' }] }).ok).toBe(false)
  })

  it('refuses a planet you do not control and honours the per-planet structure limits', () => {
    const s = holder('construction')
    expect(play(s, 'construction', { structures: [{ planetId: 'arc-prime', type: 'pds' }] }).ok).toBe(false)
    // the printed home space dock is already there, so a second one is refused
    expect(play(s, 'construction', { structures: [{ planetId: '000', type: 'spacedock' }] }).ok).toBe(false)
    // two PDS fit on a planet, a third does not
    const twoPds = withUnits(s, 'home-n', 0, ['pds', 'pds'], '000')
    expect(play(twoPds, 'construction', { structures: [{ planetId: '000', type: 'pds' }] }).ok).toBe(false)
    expect(constructionPlanets(twoPds, 0, 'pds')).not.toContain('000')
  })

  it('stays playable with nothing to place, and places nothing', () => {
    const broke = withPlayer(holder('construction'), 0, {
      reinforcements: { ...holder('construction').players[0].reinforcements, pds: 0, spacedock: 0 },
    })
    const played = value(play(broke, 'construction', {}))
    expect(played.players[0].strategyCards).toEqual([{ id: 'construction', used: true }])
    expect(legalMoves(broke).filter(m => m.type === 'strategic' && m.card === 'construction')).toHaveLength(1)
  })

  it('secondary: the command token lands in the chosen system and may bring one structure', () => {
    const s = withPlanetOwner(holder('construction'), 'bereg', 'bereg', 1)
    const played = value(play(s, 'construction', {}))
    const before = played.players[1].tokens.strategy
    const used = value(answer(played, 'construction', true, {
      systemId: 'bereg', structures: [{ planetId: 'bereg', type: 'pds' }],
    }))
    expect(used.systems.bereg.activatedBy).toContain(1)
    expect(used.systems.bereg.planets[0].structures.some(u => u.type === 'pds' && u.owner === 1)).toBe(true)
    expect(used.players[1].tokens.strategy).toBe(before - 1)
  })

  it('secondary: the structure has to be on a planet you control in that very system', () => {
    const s = withPlanetOwner(holder('construction'), 'bereg', 'bereg', 1)
    const played = value(play(s, 'construction', {}))
    expect(answer(played, 'construction', true, { systemId: 'quann', structures: [{ planetId: 'bereg', type: 'pds' }] }).ok).toBe(false)
    expect(answer(played, 'construction', true, { systemId: 'bereg', structures: [{ planetId: 'bereg', type: 'pds' }, { planetId: 'bereg', type: 'pds' }] }).ok).toBe(false)
    // the token alone, with no structure, is a legal answer
    expect(answer(played, 'construction', true, { systemId: 'quann' }).ok).toBe(true)
  })

  it('enumerates only placements it can make, and every one of them is accepted', () => {
    const s = withPlanetOwner(holder('construction'), 'bereg', 'bereg', 0)
    const primaries = legalMoves(s).filter(m => m.type === 'strategic' && m.card === 'construction')
    expect(primaries.length).toBeGreaterThan(0)
    for (const move of primaries) expect(applyMove(s, move, 0).ok).toBe(true)
    const played = value(play(withPlanetOwner(s, 'quann', 'quann', 1), 'construction', {}))
    const answers = legalMoves(played).filter(m => m.type === 'secondary' && m.accept)
    expect(answers.length).toBeGreaterThan(0)
    for (const move of answers) expect(applyMove(played, move, 0).ok).toBe(true)
  })
})
