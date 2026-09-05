import { describe, expect, it } from 'vitest'
import { findActionCard } from '../data/actionCards'
import { HAND_LIMIT, PLAYABLE_ACTION_CARDS, actionCardMoves, drawActionCards, playActionCard } from './actionCards'
import { applyMove, legalMoves, validateMove } from './index'
import { createGame, shuffledActionCards } from './setup'
import { DUEL_CONFIG, deepFreeze, toActionPhase, withPlanetOwner, withPlayer, withUnits } from './testUtils'
import type { GameState, Seat } from './types'

/** Puts exactly `cards` in a seat's hand. */
function withHand(state: GameState, seat: Seat, cards: string[]): GameState {
  const players = [...state.players] as GameState['players']
  players[seat] = { ...players[seat], actionCards: cards }
  return deepFreeze({ ...state, players })
}

describe('R9 the action card deck', () => {
  it('deals only the cards the engine can actually play', () => {
    const deck = shuffledActionCards(7)
    expect(deck.length).toBe(PLAYABLE_ACTION_CARDS.length)
    expect([...deck].sort()).toEqual([...PLAYABLE_ACTION_CARDS].sort())
    // every card in the deck is a real printed card played as a whole action
    for (const id of deck) expect(findActionCard(id)?.window).toBe('Action')
  })

  it('shuffles from the game seed, so the same seed deals the same deck and another one does not', () => {
    expect(shuffledActionCards(7)).toEqual(shuffledActionCards(7))
    expect(shuffledActionCards(7)).not.toEqual(shuffledActionCards(8))
  })

  it('starts a game with a full deck, an empty discard pile and empty hands', () => {
    const state = createGame(DUEL_CONFIG, 3)
    expect(state.actionCardDeck.length).toBe(PLAYABLE_ACTION_CARDS.length)
    expect(state.actionCardDiscard).toEqual([])
    for (const p of state.players) expect(p.actionCards).toEqual([])
  })

  it('draws off the top of the deck into the hand', () => {
    const state = createGame(DUEL_CONFIG, 3)
    const top = state.actionCardDeck.slice(0, 2)
    const drawn = drawActionCards(state, 1, 2, 5)
    expect(drawn.players[1].actionCards).toEqual(top)
    expect(drawn.actionCardDeck.length).toBe(state.actionCardDeck.length - 2)
    expect(drawn.log.some(e => e.t === 'info' && e.text.includes('seat 1 draws 2'))).toBe(true)
  })

  it('shuffles the discard pile back in when the deck runs out', () => {
    const state = createGame(DUEL_CONFIG, 3)
    const empty: GameState = { ...state, actionCardDeck: [], actionCardDiscard: ['war_effort', 'uprising'] }
    const drawn = drawActionCards(empty, 0, 2, 5)
    expect([...drawn.players[0].actionCards].sort()).toEqual(['uprising', 'war_effort'])
    expect(drawn.actionCardDiscard).toEqual([])
    expect(drawn.log.some(e => e.t === 'info' && e.text.includes('discard pile is shuffled'))).toBe(true)
  })

  it('draws nothing at all when deck and discard pile are both empty, and says so', () => {
    const state = createGame(DUEL_CONFIG, 3)
    const empty: GameState = { ...state, actionCardDeck: [], actionCardDiscard: [] }
    const drawn = drawActionCards(empty, 0, 2, 5)
    expect(drawn.players[0].actionCards).toEqual([])
    expect(drawn.log.some(e => e.t === 'info' && e.text.includes('deck is empty'))).toBe(true)
  })

  it('holds the hand at the limit of seven and discards the surplus', () => {
    const state = createGame(DUEL_CONFIG, 3)
    const full = withHand(state, 0, state.actionCardDeck.slice(0, HAND_LIMIT))
    const drawn = drawActionCards(full, 0, 2, 5)
    expect(drawn.players[0].actionCards.length).toBe(HAND_LIMIT)
    expect(drawn.players[0].actionCards).toEqual(full.players[0].actionCards)
    expect(drawn.actionCardDiscard.length).toBe(2)
    expect(drawn.log.some(e => e.t === 'info' && e.text.includes('over the hand limit'))).toBe(true)
  })
})

describe('R9 playing an action card', () => {
  it('is a whole action: it spends the turn and puts the card in the discard pile', () => {
    const base = withHand(toActionPhase(), 0, ['industrial_initiative'])
    const played = applyMove(base, { type: 'playActionCard', cardId: 'industrial_initiative', params: {} }, 1)
    if (!played.ok) throw new Error(played.error)
    expect(played.value.turnDone).toBe(true)
    expect(played.value.players[0].actionCards).toEqual([])
    expect(played.value.actionCardDiscard).toEqual(['industrial_initiative'])
    expect(played.value.log.some(e => e.t === 'info' && e.text.includes('plays Industrial Initiative'))).toBe(true)
    // the action is spent, so a second card is refused
    expect(playActionCard(played.value, 'industrial_initiative', {}).ok).toBe(false)
  })

  it('refuses a card the seat does not hold and a card the engine cannot resolve yet', () => {
    const base = withHand(toActionPhase(), 0, ['direct_hit_1'])
    expect(playActionCard(base, 'uprising', {}).ok).toBe(false)
    const held = playActionCard(base, 'direct_hit_1', {})
    expect(held.ok).toBe(false)
    if (!held.ok) expect(held.error).toContain('not implemented')
  })

  it('is offered by legalMoves beside the tactical and strategic actions, and only for cards in hand', () => {
    const base = withHand(toActionPhase(), 0, ['industrial_initiative'])
    const moves = legalMoves(base)
    expect(moves.some(m => m.type === 'playActionCard' && m.cardId === 'industrial_initiative')).toBe(true)
    expect(validateMove(base, { type: 'playActionCard', cardId: 'industrial_initiative' }).ok).toBe(true)
    expect(validateMove(base, { type: 'playActionCard', cardId: 'uprising' }).ok).toBe(false)
  })

  it('offers every enumerated play already playable, for every card in the deck', () => {
    // one seat holding the whole deck: every move the enumerator offers has to be accepted by the handler
    const rich = withPlayer(withHand(toActionPhase(), 0, [...PLAYABLE_ACTION_CARDS]), 0, { tradeGoods: 8 })
    const withPds = withUnits(withPlanetOwner(rich, 'bereg', 'bereg', 1), 'bereg', 1, ['pds'], 'bereg')
    const withDock = withUnits(withPds, 'quann', 1, ['spacedock'], 'quann')
    const board = deepFreeze({
      ...withDock,
      systems: { ...withDock.systems, sakulag: { ...withDock.systems.sakulag, activatedBy: [0 as Seat] } },
    })
    const moves = actionCardMoves(board, 0)
    expect(moves.length).toBeGreaterThan(0)
    for (const move of moves) {
      if (move.type !== 'playActionCard') continue
      const r = playActionCard(board, move.cardId, move.params)
      expect(r.ok, `${move.cardId} was offered but refused: ${r.ok ? '' : r.error}`).toBe(true)
    }
    // every implemented card got at least one offer on this board
    const offered = new Set(moves.flatMap(m => m.type === 'playActionCard' ? [m.cardId] : []))
    for (const id of PLAYABLE_ACTION_CARDS) {
      expect(offered.has(id), `${id} was never offered`).toBe(true)
    }
  })
})

describe('R9 the printed abilities', () => {
  it('Industrial Initiative pays 1 trade good per industrial planet', () => {
    // the duel map has no industrial planet, so the card is playable and pays nothing
    const base = withHand(toActionPhase(), 0, ['industrial_initiative'])
    const played = playActionCard(base, 'industrial_initiative', {})
    if (!played.ok) throw new Error(played.error)
    expect(played.value.players[0].tradeGoods).toBe(base.players[0].tradeGoods)
  })

  it('Economic Initiative readies every cultural planet you control, and no other', () => {
    let base = withPlanetOwner(toActionPhase(), 'quann', 'quann', 0)          // cultural
    base = withPlanetOwner(base, 'bereg', 'bereg', 0)                          // hazardous
    base = deepFreeze({
      ...base,
      systems: Object.fromEntries(Object.entries(base.systems).map(([id, sys]) => [id, {
        ...sys, planets: sys.planets.map(p => ['quann', 'bereg'].includes(p.id) ? { ...p, exhausted: true } : p),
      }])),
    })
    const played = playActionCard(withHand(base, 0, ['economic_initiative']), 'economic_initiative', {})
    if (!played.ok) throw new Error(played.error)
    expect(played.value.systems.quann.planets[0].exhausted).toBe(false)
    expect(played.value.systems.bereg.planets[0].exhausted).toBe(true)
  })

  it('Mining Initiative pays the resource value of the named planet', () => {
    const base = withHand(toActionPhase(), 0, ['mining_initiative'])
    const played = playActionCard(base, 'mining_initiative', { planetId: '000' })
    if (!played.ok) throw new Error(played.error)
    expect(played.value.players[0].tradeGoods).toBe(base.players[0].tradeGoods + 5)
    // somebody else's planet is not yours to mine
    expect(playActionCard(base, 'mining_initiative', { planetId: 'arc-prime' }).ok).toBe(false)
  })

  it('Frontline Deployment lands 3 infantry from the reinforcements on one of your planets', () => {
    const base = withHand(toActionPhase(), 0, ['frontline_deployment_1'])
    const before = base.players[0].reinforcements.infantry
    const played = playActionCard(base, 'frontline_deployment_1', { planetId: '000' })
    if (!played.ok) throw new Error(played.error)
    const planet = played.value.systems['home-n'].planets[0]
    expect(planet.ground.filter(u => u.owner === 0).length).toBe(base.systems['home-n'].planets[0].ground.length + 3)
    expect(played.value.players[0].reinforcements.infantry).toBe(before - 3)
  })

  it('Rise of a Messiah puts one infantry on every planet you control', () => {
    const base = withHand(withPlanetOwner(toActionPhase(), 'bereg', 'bereg', 0), 0, ['rise_of_a_messiah'])
    const played = playActionCard(base, 'rise_of_a_messiah', {})
    if (!played.ok) throw new Error(played.error)
    expect(played.value.systems.bereg.planets[0].ground.filter(u => u.owner === 0).length).toBe(1)
    expect(played.value.systems['home-n'].planets[0].ground.length).toBe(base.systems['home-n'].planets[0].ground.length + 1)
  })

  it('Focused Research spends 4 trade goods on a technology, and is refused without them', () => {
    const base = withHand(withPlayer(toActionPhase(), 0, { tradeGoods: 4 }), 0, ['focused_research_1'])
    const played = playActionCard(base, 'focused_research_1', { techId: 'antimass_deflectors' })
    if (!played.ok) throw new Error(played.error)
    expect(played.value.players[0].techs).toContain('antimass_deflectors')
    expect(played.value.players[0].tradeGoods).toBe(0)
    expect(played.value.players[0].tradeGoodsSpentThisRound).toBe(4)
    const broke = withHand(withPlayer(toActionPhase(), 0, { tradeGoods: 3 }), 0, ['focused_research_1'])
    expect(playActionCard(broke, 'focused_research_1', { techId: 'antimass_deflectors' }).ok).toBe(false)
  })

  it('War Effort places a cruiser where you already have a ship, never where you do not', () => {
    const base = withHand(toActionPhase(), 0, ['war_effort'])
    const played = playActionCard(base, 'war_effort', { systemId: 'home-n' })
    if (!played.ok) throw new Error(played.error)
    expect(played.value.systems['home-n'].space.filter(u => u.owner === 0 && u.type === 'cruiser').length)
      .toBe(base.systems['home-n'].space.filter(u => u.owner === 0 && u.type === 'cruiser').length + 1)
    expect(playActionCard(base, 'war_effort', { systemId: 'starpoint' }).ok).toBe(false)
  })

  it('Ghost Ship places a destroyer in an empty wormhole system outside the home systems', () => {
    const base = withHand(toActionPhase(), 0, ['ghost_ship_1'])
    const played = playActionCard(base, 'ghost_ship_1', { systemId: 'sakulag' })
    if (!played.ok) throw new Error(played.error)
    expect(played.value.systems.sakulag.space.some(u => u.owner === 0 && u.type === 'destroyer')).toBe(true)
    // Mecatol Rex has no wormhole, and a home system is out regardless
    expect(playActionCard(base, 'ghost_ship_1', { systemId: 'mecatol' }).ok).toBe(false)
    expect(playActionCard(base, 'ghost_ship_1', { systemId: 'home-n' }).ok).toBe(false)
  })

  it('Unexpected Action takes one of your command tokens back off the board', () => {
    const activated = deepFreeze({
      ...toActionPhase(),
      systems: { ...toActionPhase().systems, quann: { ...toActionPhase().systems.quann, activatedBy: [0] } },
    })
    const base = withHand(activated, 0, ['unexpected_action_1'])
    const played = playActionCard(base, 'unexpected_action_1', { systemId: 'quann' })
    if (!played.ok) throw new Error(played.error)
    expect(played.value.systems.quann.activatedBy).toEqual([])
    expect(playActionCard(base, 'unexpected_action_1', { systemId: 'bereg' }).ok).toBe(false)
  })

  it('Insubordination takes a token out of another player\'s tactic pool, never your own', () => {
    const base = withHand(toActionPhase(), 0, ['insubordination'])
    const played = playActionCard(base, 'insubordination', { seat: 1 })
    if (!played.ok) throw new Error(played.error)
    expect(played.value.players[1].tokens.tactic).toBe(base.players[1].tokens.tactic - 1)
    expect(playActionCard(base, 'insubordination', { seat: 0 }).ok).toBe(false)
  })

  it('Uprising exhausts another player\'s ready non-home planet and pays you its resources', () => {
    const base = withHand(withPlanetOwner(toActionPhase(), 'bereg', 'bereg', 1), 0, ['uprising'])
    const played = playActionCard(base, 'uprising', { planetId: 'bereg' })
    if (!played.ok) throw new Error(played.error)
    expect(played.value.systems.bereg.planets[0].exhausted).toBe(true)
    expect(played.value.players[0].tradeGoods).toBe(base.players[0].tradeGoods + 3)
    // a home planet is out, and so is your own
    expect(playActionCard(base, 'uprising', { planetId: 'arc-prime' }).ok).toBe(false)
    expect(playActionCard(base, 'uprising', { planetId: '000' }).ok).toBe(false)
  })

  it('Unstable Planet exhausts a hazardous planet and kills up to three infantry on it', () => {
    let base = withPlanetOwner(toActionPhase(), 'bereg', 'bereg', 1)
    base = withUnits(base, 'bereg', 1, ['infantry', 'infantry', 'infantry', 'infantry'], 'bereg')
    const played = playActionCard(withHand(base, 0, ['unstable_planet']), 'unstable_planet', { planetId: 'bereg' })
    if (!played.ok) throw new Error(played.error)
    const planet = played.value.systems.bereg.planets[0]
    expect(planet.exhausted).toBe(true)
    expect(planet.ground.length).toBe(1)
    expect(played.value.players[1].reinforcements.infantry).toBe(base.players[1].reinforcements.infantry + 3)
  })

  it('Cripple Defenses destroys every PDS on the named planet', () => {
    const base = withUnits(withPlanetOwner(toActionPhase(), 'bereg', 'bereg', 1), 'bereg', 1, ['pds', 'pds'], 'bereg')
    const played = playActionCard(withHand(base, 0, ['cripple_defenses']), 'cripple_defenses', { planetId: 'bereg' })
    if (!played.ok) throw new Error(played.error)
    expect(played.value.systems.bereg.planets[0].structures).toEqual([])
  })

  it('Reactor Meltdown destroys a space dock outside a home system, never one inside it', () => {
    const base = withUnits(withPlanetOwner(toActionPhase(), 'quann', 'quann', 1), 'quann', 1, ['spacedock'], 'quann')
    const played = playActionCard(withHand(base, 0, ['reactor_meltdown']), 'reactor_meltdown', { planetId: 'quann' })
    if (!played.ok) throw new Error(played.error)
    expect(played.value.systems.quann.planets[0].structures).toEqual([])
    expect(playActionCard(withHand(base, 0, ['reactor_meltdown']), 'reactor_meltdown', { planetId: 'arc-prime' }).ok).toBe(false)
  })
})
