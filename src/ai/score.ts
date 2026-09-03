import { FACTIONS } from '../data/factions'
import type { Move, Seat, StrategyCardId } from '../engine/types'
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

const DEFAULT_WEIGHTS: Readonly<ScoreWeights> = {
  objective: 100,
  military: 12,
  economy: 8,
  tempo: 6,
  denial: 10,
  priority: 40,
}

/** The win condition is 7 VP; a VP is the single most valuable thing on the table. */
function vpValue(w: ScoreWeights): number {
  return w.objective + w.priority
}

function other(_view: GameStateView, seat: Seat): Seat {
  return seat === 0 ? 1 : 0
}

/** Weights are fixed for now; the hook can fold a difficulty dial in by passing a custom instance. */
function viewWeights(_view: GameStateView): ScoreWeights {
  return DEFAULT_WEIGHTS
}

/**
 * How good a move is for `seat` in `view`. Scoring reads only what the fog-of-war view exposes; the engine
 * still runs on the raw state. A higher number is better. Called with the concrete (filled) move.
 */
export function scoreMove(view: GameStateView, move: Move, seat: Seat): number {
  const w = viewWeights(view)
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
    case 'endInvasion': return w.military
    case 'produce': return scoreProduce(view, seat, w)
    case 'endTactical': return w.military
    case 'endTurn': return w.priority
    case 'strategic': return scoreStrategic(view, move, seat, w)
    case 'secondary': return scoreSecondary(view, move, seat, w)
    case 'research': return scoreResearch(view, seat, w)
    case 'shipyard': return scoreShipyard(view, seat, w)
    case 'tradePost': return scoreTradePost(view, seat, w)
    case 'postAbility': return w.economy
    case 'pass': return scorePass(view, seat, w)
    case 'status': return w.priority // keep the engine's default distribution
    default: return 0
  }
}

function scorePass(view: GameStateView, seat: Seat, w: ScoreWeights): number {
  // passing is only rarely right: when ahead and the round is winding down, or as the only legal way to end
  // a spent turn. Score it low so the AI prefers real actions.
  const me = view.players[seat]
  return (me.vp >= view.players[other(view, seat)].vp ? w.priority : -w.priority)
}

function scorePickCard(view: GameStateView, card: StrategyCardId, seat: Seat, w: ScoreWeights): number {
  const me = view.players[seat]
  const foe = view.players[other(view, seat)]
  let s = w.priority
  // Imperial pays a VP now when we control Mecatol or can score an open objective.
  if (card === 'imperial') {
    s += vpValue(w) * (controlsMecatol(view, seat) ? 1 : 0)
    s += countsCanScore(view, seat) * w.objective
  }
  // Leadership replenishes the command sheet the fleet and economy both draw on.
  if (card === 'leadership') s += (me.tokens.tactic + me.tokens.fleet) < (foe.tokens.tactic + foe.tokens.fleet) ? w.tempo : w.tempo * 0.5
  // Technology advances toward unit upgrades and economy tech.
  if (card === 'technology') s += me.techs.length < foe.techs.length ? w.economy : w.economy * 0.5
  // Trade sits low when commodities are already full.
  if (card === 'trade') s += (me.commodities < FACTIONS[me.faction].commodityValue) ? w.economy : -w.economy
  if (card === 'warfare') s += w.tempo
  if (card === 'diplomacy') s += w.military * 0.5
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
  const foe = other(view, seat)
  const foePlanets = sys.planets.filter(p => p.owner === foe).length
  const neutralPlanets = sys.planets.filter(p => p.owner === null).length
  const enemyShips = sys.space.filter(u => u.owner === foe && u.type !== 'fighter' && u.type !== 'infantry')
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
  if (isMecatol && (neutralPlanets > 0 || enemyShips.length > 0)) s += w.objective * 2
  // taking planets the foe holds pushes control-4, foothold and Mecatol's neighbours
  if (foePlanets > 0 && takeSystem) s += w.objective * (1 + foePlanets)
  if (systemId === homeOf(view, foe) && takeSystem) s += w.objective * 2 // foothold
  // colonising a neutral system grows the economy and the controlled-planet count
  if (neutralPlanets > 0 && takeSystem) s += w.economy * (1 + neutralPlanets)
  // building at your own dock spends otherwise-idle resources; only worth a token if we can actually field it
  if (build > 0) s += build
  // a contested fleet is a risk: only worth it at favourable odds; a lonely escort is a token wasted
  if (enemyShips.length > 0) s -= w.military * Math.min(2, enemyShips.length)

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

function homeOf(_view: GameStateView, seat: Seat): string {
  return seat === 0 ? 'home-n' : 'home-s'
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
    case 'win_space_combat': return me.spaceCombatWins >= 1
    case 'control_4_outside_home': return controlledOutsideHome(view, seat) >= 4
    case 'spend_6_resources': return me.resourcesSpentThisRound >= 6
    case 'trade_three_times': return me.trades >= 3
    case 'more_ships': return shipCount(view, seat) > shipCount(view, other(view, seat))
    default: return false
  }
}

function controlledOutsideHome(view: GameStateView, seat: Seat): number {
  const home = homeOf(view, seat)
  let n = 0
  for (const sys of Object.values(view.systems)) {
    if (sys.id === home) continue
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
  return w.military // bombarding a defended planet wins ground control
}

function scoreLand(_view: GameStateView, _seat: Seat, w: ScoreWeights): number {
  return w.military + w.objective
}

function scoreProduce(view: GameStateView, seat: Seat, w: ScoreWeights): number {
  // Producing is almost always good: it spends idle resources. Value it by how many units we can field.
  const me = view.players[seat]
  const foe = view.players[other(view, seat)]
  return w.military + (me.vp < foe.vp ? w.objective * 0.5 : 0)
}

function scoreStrategic(view: GameStateView, move: Move, seat: Seat, w: ScoreWeights): number {
  if (move.type !== 'strategic') return 0
  const card = move.card
  let s = w.priority * 2
  if (card === 'imperial') {
    s += vpValue(w) * (controlsMecatol(view, seat) ? 1 : 0)
    s += countsCanScore(view, seat) * w.objective
  }
  if (card === 'leadership') s += w.tempo
  if (card === 'technology') s += w.economy
  if (card === 'trade') s += w.economy * (view.players[seat].commodities < FACTIONS[view.players[seat].faction].commodityValue ? 1 : 0.5)
  if (card === 'warfare') s += w.tempo
  if (card === 'diplomacy') s += w.military
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

