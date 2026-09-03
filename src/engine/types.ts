import type { PostId } from '../data/posts'

// `internal` marks an error that came out of a thrown exception rather than a rules rejection: an engine bug,
// never a legal-move question. Callers may treat it as fatal.
export type Result<T> = { ok: true; value: T } | { ok: false; error: string; internal?: boolean }

export type Seat = 0 | 1
export type Owner = Seat | 'guardian'
export type FactionId = 'l1z1x' | 'letnev'
export type Color = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'black' | 'orange' | 'pink'
export type UnitType = 'infantry' | 'fighter' | 'destroyer' | 'cruiser' | 'carrier' | 'dreadnought' | 'warsun' | 'flagship' | 'pds' | 'spacedock'
export type TechColor = 'blue' | 'red' | 'green' | 'yellow'
export type StrategyCardId = 'leadership' | 'diplomacy' | 'trade' | 'warfare' | 'technology' | 'imperial'
export type Phase = 'strategy' | 'action' | 'status' | 'ended'
export type PlayerType = 'human' | 'ai'

export interface Unit { id: number; type: UnitType; owner: Owner; damaged: boolean }
export interface Planet {
  id: string; name: string; resources: number; influence: number
  owner: Seat | null; exhausted: boolean
  ground: Unit[]        // infantry
  structures: Unit[]    // spacedock, pds
}
export interface System {
  id: string; name: string
  planets: Planet[]
  wormhole: 'alpha' | 'beta' | null
  // ships, plus fighters and infantry being transported; NON_FIGHTER_SHIPS and isShip exclude infantry, so capacity and fleet-pool helpers work on this mixed array
  space: Unit[]                    // ships
  activatedBy: Seat[]              // command tokens on the system this round
}
export interface Player {
  seat: Seat; faction: FactionId; color: Color; name: string
  vp: number
  tokens: { tactic: number; fleet: number; strategy: number }
  tradeGoods: number; commodities: number
  techs: string[]                  // tech ids from data/techs.ts
  strategyCards: { id: StrategyCardId; used: boolean }[]
  passed: boolean
  scoredObjectives: string[]; scoredMandates: string[]
  resourcesSpentThisRound: number        // R7: the "spend 6 resources" objective counts a whole round
  spaceCombatWins: number                // R7: space combats won against the opponent, guardians excluded
  trades: number                         // R7: trade post uses plus trades with the opponent, over the game
  tradedThisRound: { west: boolean; east: boolean }
  inheritanceExhausted: boolean; shipyardUsed: boolean
  pendingInfantry: number          // R4.3 step 4: Infantry II waiting to return at the start of your next turn
  reinforcements: Record<UnitType, number>
}
export interface TacticalContext {
  systemId: string
  step: 'movement' | 'spaceCombat' | 'invasion' | 'production' | 'done'
  combat?: CombatState
  invasion?: InvasionState
}
/** How a batch of hits may be assigned: `noFighters` is Graviton Laser System, `preferNonFighters` is [0.0.1]. */
export type HitMode = 'any' | 'noFighters' | 'preferNonFighters'
export interface HitGroup { count: number; mode: HitMode }
/** R4.1 step 4: hits waiting for their owner to assign them; `context` names the step that scored them. */
export interface PendingHits { owner: Seat; groups: HitGroup[]; context: string }
export interface CombatState {
  round: number; attacker: Seat; defender: Owner
  retreating: Seat | null; retreatTo: string | null
  lastRolls: DieRoll[]
  pending: PendingHits[]           // hits waiting to be assigned, head first; empty when the combat may continue
}
export interface InvasionState { planetId: string | null; landed: number[]; bombarded: string[]; round: number }
export interface DieRoll { owner: Owner; unit: UnitType; value: number; hit: boolean }
export interface GameState {
  /** Bumped whenever the shape changes so much that a saved game cannot be read any more. */
  version: 3
  round: number; phase: Phase
  speaker: Seat; active: Seat
  strategyPool: { id: StrategyCardId; bonus: number }[]   // unpicked cards with trade goods
  draft: Seat[]                                          // remaining pick order in the strategy phase
  publicObjectives: string[]                             // revealed ids, in the order they were revealed
  objectiveOrder: string[]                               // R7: the shuffled pool, one revealed per round
  mecatolCombatWinner: Seat | null                       // R7 First Strike: the race is over once this is set
  players: [Player, Player]
  systems: Record<string, System>
  tactical: TacticalContext | null
  // R3.2: the active player has spent their action and may still take the free moves of R8 before ending
  // the turn; only handing the turn over clears it, so a fresh turn always starts false
  turnDone: boolean
  pendingSecondary: StrategyCardId | null                // opponent may respond
  statusSubmitted: Seat[]                                // seats whose status move is in; the phase closes at two
  // R8: the two posts in play this round, rolled at setup and again in every status phase from the four that
  // were not in play, and whether their special ability is spent — once per round for the whole table
  posts: { west: PostId; east: PostId }
  postAbilityUsed: { west: boolean; east: boolean }
  nextUnitId: number
  guardianRolls: number
  winner: Seat | null
  log: LogEntry[]
}
export type LogEntry = { t: 'move'; seat: Seat | null; move: Move; seed: number } | { t: 'roll'; owner: Owner; rolls: DieRoll[]; context: string } | { t: 'info'; text: string }

export type Move =
  | { type: 'pickStrategyCard'; card: StrategyCardId }
  | { type: 'startTactical'; systemId: string }
  | { type: 'moveShips'; moves: { unitId: number; from: string; carrying: number[] }[] }   // all into tactical.systemId
  | { type: 'endMovement' }
  | { type: 'combatRound'; munitions?: { attacker?: boolean; defender?: boolean } }   // resolves one round (or the pre-combat steps on round 0); Munitions Reserves is per side
  | { type: 'assignHits'; destroy: number[]; sustain: number[] }   // unit ids of the assigning seat, in the activated system
  | { type: 'retreat'; to: string }
  | { type: 'bombard'; planetId: string }
  | { type: 'land'; planetId: string; infantryIds: number[] }
  | { type: 'groundCombatRound' }
  | { type: 'endInvasion' }
  | { type: 'produce'; units: Partial<Record<UnitType, number>>; planets: string[]; tradeGoods: number }
  | { type: 'endTactical' }
  | { type: 'endTurn' }                                  // R3.2: the action is spent, hand the turn over
  | { type: 'strategic'; card: StrategyCardId; params?: StrategicParams }
  | { type: 'secondary'; card: StrategyCardId; accept: boolean; params?: StrategicParams }
  | { type: 'research'; techId: string; via: 'inheritance' }   // component action; the Technology card carries its technologies in StrategicParams
  | { type: 'shipyard'; planetId: string; planets: string[]; tradeGoods: number }
  | { type: 'tradePost'; post: 'west' | 'east'; commodities: number }
  | { type: 'postAbility'; post: 'west' | 'east'; params: PostAbilityParams }   // R8: the post's own ability, a free move like the sale
  | { type: 'pass' }
  | { type: 'status'; params: StatusParams }             // one move per player: token distribution, then the engine finishes the phase when both are in
export interface StrategicParams {
  systemId?: string                 // Diplomacy: the chosen system; Warfare: where your command token comes off the board
  planets?: string[]                // planets exhausted to pay (Leadership influence, Technology and Warfare resources) or readied (Diplomacy)
  techId?: string; secondTechId?: string
  tradeGoods?: number
  units?: Partial<Record<UnitType, number>>
  tokens?: { tactic: number; fleet: number; strategy: number }   // the resulting command sheet after Leadership or Warfare
  objectiveId?: string              // Imperial primary: the public objective to score
  shareWithOpponent?: boolean       // Trade primary: the opponent replenishes without paying
}
export interface StatusParams { tokens: { tactic: number; fleet: number; strategy: number } }

/**
 * R8: the parameters of a `postAbility` move. Which of them matter is decided by the ability of the post
 * actually in play on that side, never by which fields the caller filled in.
 */
export interface PostAbilityParams {
  techId?: string; takeTechId?: string                 // techExchange: the one returned, the one taken
  planet?: string; pays?: 'resources' | 'influence'    // clearingHouse: the one planet exhausted and which value it pays
  pool?: 'tactic' | 'fleet' | 'strategy'               // charter, layover
  give?: number[]                                      // refit: the unit ids returned
  take?: Partial<Record<UnitType, number>>             // refit: the units taken, the shape `produce` uses
  // timeTrade needs no parameters: the victory point is the engine's, the clock is the interface's
}

export interface UnitStats {
  cost: number; producedPerCost: number
  combat: number | null; combatDice: number
  move: number; capacity: number; sustain: boolean
  bombardment: { value: number; dice: number } | null
  afb: { value: number; dice: number } | null
  spaceCannon: { value: number; dice: number } | null
  planetaryShield: boolean
  production: number | null
}
export interface GameConfig {
  players: [
    { faction: FactionId; color: Color; name: string; playerType?: PlayerType },
    { faction: FactionId; color: Color; name: string; playerType?: PlayerType }
  ]
  speaker: Seat
}
export function isAi(config: GameConfig, seat: Seat): boolean {
  return config.players[seat].playerType === 'ai'
}
