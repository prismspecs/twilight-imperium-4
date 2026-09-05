import { FACTIONS } from '../data/factions'
import { findTech } from '../data/techs'
import type { Move, PlanetTrait, Seat, StrategyCardId, TechColor } from '../engine/types'
import type { GameStateView } from './fog'

/** Tuneable weights per concern; a difficulty dial can scale these later. */
export interface ScoreWeights {
  objective: number     // pushing towards revealed objectives and mandates
  military: number      // fleet strength and system control
  economy: number       // resources, trade goods, production
  tempo: number         // initiative and turn efficiency
  denial: number        // denying the opponent their objectives and territory
  priority: number      // immediate scoring or card value in the current phase
}

export const DEFAULT_WEIGHTS: Readonly<ScoreWeights> = {
  objective: 100,
  military: 12,
  economy: 8,
  tempo: 6,
  denial: 10,
  priority: 40,
}

/**
 * Named weight presets, one per AI "personality". These are the dials a co-evolution loop points at: each
 * seat of a match can carry a different personality, and a trainer recombines the numbers that win. All are
 * `Readonly` so a shrink-fit clone (and a future evolution pass) can produce offspring safely.
 */
export const PERSONALITIES: Readonly<Record<string, Readonly<ScoreWeights>>> = {
  // balanced: values a VP above all, everything else in proportion
  balanced: DEFAULT_WEIGHTS,
  // impatient: spends tokens and rushes the board, cares about initiative and tempo
  aggressive: { objective: 100, military: 18, economy: 4, tempo: 16, denial: 14, priority: 40 },
  // patient: hoards tokens, builds the economy, waits for the endgame
  economist: { objective: 100, military: 6, economy: 20, tempo: 2, denial: 6, priority: 40 },
  // spoiler: denies the opponent first, scores second
  disruptive: { objective: 100, military: 10, economy: 6, tempo: 4, denial: 26, priority: 40 },
}

/** The win condition is 7 VP; a VP is the single most valuable thing on the table. */
function vpValue(w: ScoreWeights): number {
  return w.objective + w.priority
}

/**
 * How good a move is for `seat` in `view`. Scoring reads only what the fog-of-war view exposes; the engine
 * still runs on the raw state. A higher number is better. Called with the concrete (filled) move and the
 * seat's personality weights, so a trainer can swap personalities per seat per game.
 */
export function scoreMove(view: GameStateView, move: Move, seat: Seat, w: Readonly<ScoreWeights> = DEFAULT_WEIGHTS): number {
  switch (move.type) {
    case 'pickStrategyCard': return scorePickCard(view, move.card, seat, w)
    case 'startTactical': return scoreStartTactical(view, move.systemId, seat, w)
    case 'moveShips': return w.military + w.tempo * 2
    case 'endMovement': return w.military
    case 'combatRound': return scoreCombatRound(view, move.munitions, seat, w)
    case 'assignHits': return w.priority // the default assignment the enumerator offers is already sensible
    case 'retreat': return scoreRetreat(view, seat, w)
    case 'bombard': return scoreBombard(view, seat, w)
    case 'land': return scoreLand(view, seat, w)
    case 'groundCombatRound': return w.military
    case 'removeCustodians': return vpValue(w) * 2
    case 'endInvasion': return w.military
    case 'produce': return scoreProduce(view, move, seat, w)
    case 'endTactical': return w.military
    case 'endTurn': return w.priority
    case 'strategic': return scoreStrategic(view, move, seat, w)
    case 'secondary': return scoreSecondary(view, move, seat, w)
    case 'research': return scoreResearch(view, seat, w)
    case 'shipyard': return scoreShipyard(view, seat, w)
    case 'tradePost': return scoreTradePost(view, seat, w)
    case 'postAbility': return w.economy
    // R9: an action card played as an action is a free effect; the enumerator only offers plays that do
    // something, so taking one is generally worth a turn, but never more than a real tactical action
    case 'playActionCard': return w.economy
    case 'pass': return scorePass(view, seat, w)
    case 'status': return w.priority // keep the engine's default distribution
    default: return 0
  }
}

function leaderVp(view: GameStateView, seat: Seat): number {
  let maxVp = 0
  for (let i = 0; i < view.players.length; i++) {
    if (i !== seat && view.players[i].vp > maxVp) {
      maxVp = view.players[i].vp
    }
  }
  return maxVp
}

function readyInfluenceInView(view: GameStateView, seat: Seat): number {
  let sum = 0
  for (const sys of Object.values(view.systems)) {
    for (const p of sys.planets) {
      if (p.owner === seat && !p.exhausted) sum += p.influence
    }
  }
  return sum
}

function hasProductiveTacticalAction(view: GameStateView, seat: Seat): boolean {
  if (view.players[seat].tokens.tactic <= 0) return false

  for (const [sysId, sys] of Object.entries(view.systems)) {
    if (sys.activatedBy.includes(seat)) continue

    const canArrive = view.projection.has(sysId)
    const shipsHere = sys.space.some(u => u.owner === seat && u.type !== 'fighter' && u.type !== 'infantry')
    const canReach = canArrive || shipsHere

    if (canReach && sys.planets.some(p => p.owner === null || p.owner !== seat)) {
      return true
    }

    if (canReach && sysId === 'mecatol') {
      return true
    }

    if (dockValue(view, sysId, seat) > 0) {
      return true
    }
  }

  return false
}

function scorePass(view: GameStateView, seat: Seat, w: ScoreWeights): number {
  const me = view.players[seat]

  // Never pass if we haven't used our strategy cards yet!
  const hasUnusedStrategyCard = me.strategyCards.some(sc => !sc.used)
  if (hasUnusedStrategyCard) {
    return -w.priority * 2
  }

  // Never pass prematurely if we have tactic tokens and productive expansion/combat/production options!
  if (hasProductiveTacticalAction(view, seat)) {
    return -w.priority * 2
  }

  // Passing is appropriate when no productive actions remain or tokens are exhausted
  return me.vp >= leaderVp(view, seat) ? w.priority * 0.5 : 0
}

function scorePickCard(view: GameStateView, card: StrategyCardId, seat: Seat, w: ScoreWeights): number {
  const me = view.players[seat]
  const opponents = view.players.filter(p => p.seat !== seat)
  const maxOpponentTechs = opponents.length ? Math.max(...opponents.map(p => p.techs.length)) : 0
  const minOpponentTokens = opponents.length ? Math.min(...opponents.map(p => p.tokens.tactic + p.tokens.fleet)) : 0

  let s = w.priority

  // Faction affinities
  const faction = me.faction
  if (faction === 'jolnar' && card === 'technology') s += 30
  if (faction === 'hacan' && card === 'trade') s += 30
  if (faction === 'letnev' && (card === 'warfare' || card === 'trade')) s += 25
  if (faction === 'sol' && (card === 'leadership' || card === 'warfare')) s += 25
  if (faction === 'xxcha' && (card === 'diplomacy' || card === 'politics')) s += 25
  if (faction === 'l1z1x' && (card === 'warfare' || card === 'technology')) s += 25

  // Imperial pays a VP now when we control Mecatol or can score an open objective.
  if (card === 'imperial') {
    if (controlsMecatol(view, seat)) {
      s += vpValue(w)
    }
    const scoreable = countsCanScore(view, seat)
    s += scoreable * w.objective
    if (view.round === 1 && !controlsMecatol(view, seat) && scoreable === 0) {
      s -= w.priority
    }
  }

  // Leadership replenishes the command sheet the fleet and economy both draw on.
  if (card === 'leadership') {
    const myTokens = me.tokens.tactic + me.tokens.fleet
    s += (myTokens <= minOpponentTokens) ? w.tempo * 2 : w.tempo
  }

  // Technology advances toward unit upgrades and economy tech.
  if (card === 'technology') {
    s += (me.techs.length < maxOpponentTechs) ? w.economy * 2 : w.economy * 1.5
  }

  // Trade: primary grants 3 Trade Goods (universal currency) + replenishes commodities
  if (card === 'trade') {
    s += w.economy * 2
    if (me.commodities < FACTIONS[me.faction].commodityValue) {
      s += w.economy
    }
  }

  if (card === 'warfare') s += w.tempo * 1.5
  if (card === 'diplomacy') s += w.military * 0.8
  if (card === 'politics') s += w.tempo + w.economy * 0.5
  if (card === 'construction') s += w.military * 0.5 + w.economy * 0.8

  return s
}

/**
 * Score starting a tactical action at `systemId`. A tactical spends a scarce command token and the whole
 * turn, so it is only worth starting where real gain is actually on the table: conquering an enemy system,
 * colonising a neutral one, racing Mecatol, or producing units at your own dock. Starting one at a system
 * you already fully control with no enemy, no neutral to take and nothing to build is a pure token burn, and
 * that is scored below the alternatives (a strategy card, an end of turn) so the AI stops wasting actions.
 */
function scoreStartTactical(view: GameStateView, systemId: string, seat: Seat, w: ScoreWeights): number {
  const sys = view.systems[systemId]
  if (!sys) return -w.priority
  const isMecatol = systemId === 'mecatol'
  const hostilePlanets = sys.planets.filter(p => p.owner !== null && p.owner !== seat).length
  const neutralPlanets = sys.planets.filter(p => p.owner === null).length
  const hostileShips = sys.space.filter(u => u.owner !== null && u.owner !== seat && u.owner !== 'guardian' && u.type !== 'fighter' && u.type !== 'infantry')
  // R3.2: a command token already on the system this round cannot be spent there again
  if (sys.activatedBy.includes(seat)) return -w.priority

  // The force this seat can bring to bear here: ships already parked in the system, or ships able to move in
  // before the tactical resolves. Colonising, conquering and fighting all need units on site, so without
  // either of these (and with no dock here to build at) there is nothing a tactical can actually achieve.
  const shipsHere = sys.space.filter(u => u.owner === seat && u.type !== 'fighter' && u.type !== 'infantry').length
  const shipsArrive = view.projection.has(systemId)
  const build = dockValue(view, systemId, seat)
  const takeSystem = shipsHere > 0 || shipsArrive

  // no foothold to advance, no planet to take, nowhere to build: the token and turn are pure waste
  if (!takeSystem && build === 0) return -w.priority

  let s = 0
  // Mecatol is the top prize, but only when something is actually gained: First Strike's unowned race, or a
  // foe present to push off it. Re-arming a Mecatol you already hold and no one is contesting earns nothing.
  if (isMecatol && takeSystem) {
    if (view.custodiansToken) {
      const readyInf = readyInfluenceInView(view, seat)
      const canAffordCustodians = readyInf + view.players[seat].tradeGoods >= 6
      if (canAffordCustodians) {
        s += vpValue(w) * 1.5
      } else {
        s += w.objective * 0.5
      }
    } else {
      if (neutralPlanets > 0 || hostilePlanets > 0 || hostileShips.length > 0) {
        s += w.objective * 2
      }
    }
  }

  // taking planets from opponents pushes control-4, foothold and Mecatol's neighbours
  if (hostilePlanets > 0 && takeSystem) s += w.objective * (1 + hostilePlanets)

  const isEnemyHome = sys.home !== null && sys.home !== undefined && sys.home !== seat
  if (isEnemyHome && takeSystem) {
    if (hostileShips.length === 0) {
      s += w.objective * 2
    } else {
      s += w.objective * 0.5
    }
  }

  // colonising a neutral system grows the economy, traits, and the controlled-planet count
  if (neutralPlanets > 0 && takeSystem) {
    s += w.economy * (2 + neutralPlanets * 2) + w.priority
    if (view.round <= 2) {
      // Vital early expansion in rounds 1 & 2
      s += w.priority
    }
  }

  // building at your own dock spends otherwise-idle resources; only worth a token if we can actually field it
  if (build > 0) s += build * w.economy
  // a contested fleet is a risk: only worth it at favourable odds; a lonely escort is a token wasted
  if (hostileShips.length > 0) s -= w.military * Math.min(3, hostileShips.length)

  // command tokens are finite; count the spend, so a nothing-action loses to a strategy card or an end of turn
  s -= w.tempo * (1 + tokensSpentRatio(view, seat))
  return s
}

/**
 * How much a tactical that lands at this system could realistically build, or 0 if it cannot. A dock battle
 * or an undefended home build is worth something; a system with no dock of ours, nothing to field, or no
 * resources to pay is worth nothing — a token there would buy nothing.
 */
function dockValue(view: GameStateView, systemId: string, seat: Seat): number {
  const sys = view.systems[systemId]
  if (!sys) return 0
  const dockHere = sys.planets.some(p => p.owner === seat && p.structures.some(u => u.type === 'spacedock' && u.owner === seat))
  if (!dockHere) return 0
  const me = view.players[seat]
  // without a destroyer to field into fleet room or two infantry to hold a line, there is nothing to build
  const canField = me.reinforcements.destroyer > 0 || me.reinforcements.infantry >= 2
  if (!canField) return 0
  // the cheapest build costs 2 (a destroyer or two infantry); with no ready resources or trade goods to pay,
  // the dock cannot field anything this action
  const ready = Object.values(view.systems).reduce((sum, s) => sum + s.planets
    .filter(p => p.owner === seat && !p.exhausted).reduce((a, p) => a + p.resources, 0), 0)
  if (ready + me.tradeGoods < 2) return 0
  return 1
}

/** How scarce the seat's command tokens are: near 1 = few left, near 0 = plenty. Drives the burn penalty. */
function tokensSpentRatio(view: GameStateView, seat: Seat): number {
  const t = view.players[seat].tokens
  const total = t.tactic + t.fleet + t.strategy
  return total > 0 ? Math.min(1, (3 - total) / 3) : 1
}

function homeOf(view: GameStateView, seat: Seat): string | null {
  for (const sys of Object.values(view.systems)) {
    if (sys.home === seat) return sys.id
  }
  return seat === 0 ? 'home-n' : 'home-s'
}

function maxTraitPlanets(view: GameStateView, seat: Seat): number {
  const counts: Record<PlanetTrait, number> = { industrial: 0, hazardous: 0, cultural: 0 }
  for (const sys of Object.values(view.systems)) {
    for (const p of sys.planets) {
      if (p.owner === seat && p.trait) counts[p.trait] += 1
    }
  }
  return Math.max(counts.industrial, counts.hazardous, counts.cultural)
}

function techSpecialtyCount(view: GameStateView, seat: Seat): number {
  let count = 0
  for (const sys of Object.values(view.systems)) {
    for (const p of sys.planets) {
      if (p.owner === seat && p.techSkip !== null) count += 1
    }
  }
  return count
}

function unitUpgradeTechs(view: GameStateView, seat: Seat): number {
  let count = 0
  for (const techId of view.players[seat].techs) {
    const t = findTech(techId)
    if (t && (t.kind === 'upgrade' || t.unit !== undefined)) count += 1
  }
  return count
}

function techColorsWith2(view: GameStateView, seat: Seat): number {
  const counts: Record<TechColor, number> = { blue: 0, red: 0, green: 0, yellow: 0 }
  for (const techId of view.players[seat].techs) {
    const t = findTech(techId)
    if (t?.colour) counts[t.colour] += 1
  }
  return Object.values(counts).filter(c => c >= 2).length
}

function shipsNearMecatol(view: GameStateView, seat: Seat): number {
  const mecatol = view.systems['mecatol']
  if (!mecatol) return 0
  let count = 0
  for (const adjId of mecatol.neighbours) {
    const sys = view.systems[adjId]
    if (sys && sys.space.some(u => u.owner === seat)) count += 1
  }
  return count
}

function countsCanScore(view: GameStateView, seat: Seat): number {
  const me = view.players[seat]
  let n = 0
  for (const id of view.publicObjectives) {
    if (me.scoredObjectives.includes(id)) continue
    if (objectiveFulfilled(view, seat, id)) n += 1
  }
  return n
}

function objectiveFulfilled(view: GameStateView, seat: Seat, id: string): boolean {
  const me = view.players[seat]
  switch (id) {
    case 'corner_the_market': return maxTraitPlanets(view, seat) >= 4
    case 'develop_weaponry': return unitUpgradeTechs(view, seat) >= 2
    case 'diversify_research': return techColorsWith2(view, seat) >= 2
    case 'erect_a_monument': return me.resourcesSpentThisRound >= 8
    case 'expand_borders': return controlledOutsideHome(view, seat) >= 6
    case 'found_research_outposts': return techSpecialtyCount(view, seat) >= 3
    case 'intimidate_council': return shipsNearMecatol(view, seat) >= 2
    case 'lead_from_the_front': return me.tokensSpentThisRound >= 3
    case 'negotiate_trade_routes': return me.tradeGoodsSpentThisRound >= 5
    case 'sway_the_council': return me.influenceSpentThisRound >= 8

    case 'centralize_galactic_trade': return me.tradeGoodsSpentThisRound >= 10
    case 'conquer_the_weak': {
      const myHome = homeOf(view, seat)
      for (const sys of Object.values(view.systems)) {
        if (sys.home !== null && sys.home !== undefined && sys.home !== seat && sys.planets.some(p => p.owner === seat)) return true
        if (sys.id !== myHome && (sys.id === 'home-n' || sys.id === 'home-s') && sys.planets.some(p => p.owner === seat)) return true
      }
      return false
    }
    case 'form_galactic_brain_trust': return techSpecialtyCount(view, seat) >= 5
    case 'found_a_golden_age': return me.resourcesSpentThisRound >= 16
    case 'galvanize_the_people': return me.tokensSpentThisRound >= 6
    case 'manipulate_galactic_law': return me.influenceSpentThisRound >= 16
    case 'master_the_sciences': return techColorsWith2(view, seat) >= 4
    case 'revolutionize_warfare': return unitUpgradeTechs(view, seat) >= 3
    case 'subdue_the_galaxy': return controlledOutsideHome(view, seat) >= 11
    case 'unify_the_colonies': return maxTraitPlanets(view, seat) >= 6

    case 'win_space_combat': return me.spaceCombatWins >= 1
    case 'control_4_outside_home': return controlledOutsideHome(view, seat) >= 4
    case 'spend_6_resources': return me.resourcesSpentThisRound >= 6
    case 'trade_three_times': return me.trades >= 3
    case 'more_ships': {
      const myShips = shipCount(view, seat)
      const allOtherSeats = view.players.map(p => p.seat).filter(s => s !== seat)
      return allOtherSeats.some(otherSeat => myShips > shipCount(view, otherSeat))
    }
    default: return false
  }
}

function controlledOutsideHome(view: GameStateView, seat: Seat): number {
  const home = homeOf(view, seat)
  let n = 0
  for (const sys of Object.values(view.systems)) {
    if (sys.home === seat || (home && sys.id === home)) continue
    for (const p of sys.planets) if (p.owner === seat) n += 1
  }
  return n
}

function shipCount(view: GameStateView, seat: Seat): number {
  let n = 0
  for (const sys of Object.values(view.systems)) for (const u of sys.space) if (u.owner === seat) n += 1
  return n
}

function controlsMecatol(view: GameStateView, seat: Seat): boolean {
  return view.systems['mecatol']?.planets.some(p => p.owner === seat) ?? false
}

function scoreCombatRound(_view: GameStateView, munitions: { attacker?: boolean; defender?: boolean } | undefined, _seat: Seat, w: ScoreWeights): number {
  // Fighting is the default; using Munitions Reserves is only worth the 2 trade goods when it can swing a hit
  // on a valuable target. Without a way to be sure here, prefer the plain round.
  const wantsMunitions = Boolean(munitions?.attacker || munitions?.defender)
  return w.military + (wantsMunitions ? w.economy * 0.5 : 0)
}

function scoreRetreat(_view: GameStateView, _seat: Seat, w: ScoreWeights): number {
  // Retreat only when a fight is hopeless; the combat evaluator in `fill`/`index` nudges the choice by
  // comparing fleet strength. Score it neutral so a losing fight prefers the retreat over the combat round.
  return -w.military
}

function scoreBombard(_view: GameStateView, _seat: Seat, w: ScoreWeights): number {
  return w.military + w.objective + w.priority // bombarding softens defenders before landing ground forces
}

function scoreLand(_view: GameStateView, _seat: Seat, w: ScoreWeights): number {
  return w.military + w.objective
}

function scoreProduce(view: GameStateView, move: Move, seat: Seat, w: ScoreWeights): number {
  // A filled produce with nothing in it cannot legally be played (the engine rejects "nothing to produce"),
  // so scoring it below an end of turn makes the AI end the tactical instead of offering an empty build.
  if (move.type !== 'produce' || Object.keys(move.units).length === 0) return -w.priority
  // Producing is almost always good: it spends idle resources. Value it by how many units we can field.
  const me = view.players[seat]
  const leader = leaderVp(view, seat)
  return w.military + (me.vp < leader ? w.objective * 0.5 : 0) + Object.keys(move.units).length
}

function scoreStrategic(view: GameStateView, move: Move, seat: Seat, w: ScoreWeights): number {
  if (move.type !== 'strategic') return 0
  const card = move.card
  let s = w.priority * 2

  if (card === 'imperial') {
    const hasMecatol = controlsMecatol(view, seat)
    const scoreable = countsCanScore(view, seat)
    if (hasMecatol) s += vpValue(w)
    s += scoreable * w.objective
    if (!hasMecatol && scoreable === 0) {
      s = w.priority * 0.2
    }
  }

  if (card === 'leadership') s += w.tempo
  if (card === 'technology') s += w.economy * 1.5
  if (card === 'trade') s += w.economy * 2

  if (card === 'warfare') {
    const tokensOnBoard = Object.values(view.systems).filter(sys => sys.activatedBy.includes(seat)).length
    if (tokensOnBoard === 0) {
      s = w.tempo * 0.5
    } else {
      s += w.tempo * 2
    }
  }

  if (card === 'diplomacy') {
    const exhaustedPlanets = Object.values(view.systems)
      .flatMap(sys => sys.planets)
      .filter(p => p.owner === seat && p.exhausted).length
    if (exhaustedPlanets === 0) {
      s = w.priority * 0.2
    } else {
      s += w.economy * Math.min(2, exhaustedPlanets)
    }
  }

  if (card === 'politics') s += w.tempo + w.economy * 0.5
  if (card === 'construction') s += w.military * 0.5 + w.economy * 0.5
  return s
}

function scoreSecondary(view: GameStateView, move: Move, seat: Seat, w: ScoreWeights): number {
  if (move.type !== 'secondary') return 0
  if (!move.accept) return -w.priority
  const card = move.card
  let s = w.priority
  if (card === 'imperial') s += w.economy * 2 // 2 trade goods for a strategy token
  if (card === 'technology') s += w.economy * (view.players[seat].techs.length ? 1 : 2)
  if (card === 'leadership') s += w.tempo
  if (card === 'warfare') s += w.military
  if (card === 'diplomacy') s += w.military * 0.5
  if (card === 'trade') s += w.economy
  if (card === 'politics') s += w.economy * 0.5      // two action cards for a strategy token
  if (card === 'construction') s += w.military * 0.5 // a PDS or a dock, plus a token on the board
  return s
}

function scoreResearch(_view: GameStateView, _seat: Seat, w: ScoreWeights): number {
  return w.economy
}

function scoreShipyard(_view: GameStateView, _seat: Seat, w: ScoreWeights): number {
  return w.economy
}

function scoreTradePost(view: GameStateView, seat: Seat, w: ScoreWeights): number {
  // Selling commodities converts idle commodity value into usable trade goods; always a small plus.
  return view.players[seat].commodities > 0 ? w.economy : -w.economy
}

