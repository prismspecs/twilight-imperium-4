# Engine design

The rules engine is a pure TypeScript module in `src/engine/`: no React, no DOM, no I/O. The UI (hot-seat) and the online transport both drive it through the same two functions.

## Contract

```ts
export type Result<T> = { ok: true; value: T } | { ok: false; error: string; internal?: boolean }
export function applyMove(state: GameState, move: Move, seed: number): Result<GameState>
export function legalMoves(state: GameState): Move[]
export function createGame(config: GameConfig, seed: number): GameState
```

- `applyMove` never mutates its input; it returns a new state (structural sharing is fine, use plain object spreads).
- A rejected move comes back as `{ ok: false, error }`. `internal: true` marks the rare case where the engine threw instead of rejecting: an engine bug, never a rules question, so callers may treat it as fatal.
- All randomness inside a move comes from `seed` (a 32-bit integer) through `mulberry32`; the same state, move and seed always give the same result. Dice are `1 + floor(rng() * 10)`.
- `legalMoves` enumerates concrete moves for the active player in all four phases; the UI builds its interaction from this list (highlighted systems, enabled buttons). Two kinds stay templates whose parameters the UI fills in: `moveShips` (`moves: []`) and `produce` (`units: {}`, `planets: []`, `tradeGoods: 0`); `land`, `strategic`, `secondary`, `shipyard` and `status` carry directly playable defaults that the UI may replace. `validateMove(state, move)` compares only the fields that identify a move (system, planet, card, technology, post, accept), never the parameter payload, so a richer but legal parameter set is accepted.
- Hits scored against a fleet whose owner has a real decision to make wait in `tactical.combat.pending` (R4.1 step 4). While that queue is filled, `legalMoves` offers exactly one `assignHits` (a complete pick, ready to play), and every other move is rejected with `hits must be assigned first`, `applyMove` included. The seat that has to answer is `actingSeat(state)`, which is not always `state.active`; `pendingFor`, `assignmentTargets` and `assignmentComplete` are the read-only queries the UI builds the picker from.
- A strategic action is two moves: the `strategic` move resolves the primary, marks the card used and sets `pendingSecondary`; the opponent then answers with exactly one `secondary` move (`accept: true` pays the strategy token and resolves the ability, `accept: false` declines). Only then does the turn pass. While `pendingSecondary` is set, no other move is legal, and the answering seat responds even when it has already passed, because the response is not a turn.
- The game log is part of the state (`state.log`), append-only, one entry per move plus one per dice roll, so replays and the online transport need only the move list and seeds.

## State shape (TypeScript, `src/engine/types.ts`)

```ts
export type Seat = 0 | 1
export type Owner = Seat | 'guardian'
export type FactionId = 'l1z1x' | 'letnev'
export type Color = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'black' | 'orange' | 'pink'
export type UnitType = 'infantry' | 'fighter' | 'destroyer' | 'cruiser' | 'carrier' | 'dreadnought' | 'warsun' | 'flagship' | 'pds' | 'spacedock'
export type TechColor = 'blue' | 'red' | 'green' | 'yellow'
export type StrategyCardId = 'leadership' | 'diplomacy' | 'trade' | 'warfare' | 'technology' | 'imperial'
export type Phase = 'strategy' | 'action' | 'status' | 'ended'

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
  scoredObjectives: string[]; mandateScored: boolean; mandateEarnedThisRound: boolean
  spentInOneProductionThisRound: number
  tradedThisRound: { west: boolean; east: boolean }
  inheritanceExhausted: boolean; shipyardUsed: boolean
  pendingInfantry: number          // Infantry II waiting to return at the start of your next turn
  reinforcements: Record<UnitType, number>
}
export interface TacticalContext {
  systemId: string
  step: 'movement' | 'spaceCombat' | 'invasion' | 'production' | 'done'
  combat?: CombatState
  invasion?: InvasionState
}
export interface HitGroup { count: number; mode: 'any' | 'noFighters' | 'preferNonFighters' }
export interface PendingHits { owner: Seat; groups: HitGroup[]; context: string }   // hits waiting for their owner
export interface CombatState {
  round: number; attacker: Seat; defender: Owner; retreating: Seat | null; retreatTo: string | null
  lastRolls: DieRoll[]; pending: PendingHits[]        // head first; empty when the combat may continue
}
export interface InvasionState { planetId: string | null; landed: number[]; bombarded: string[]; round: number }
export interface DieRoll { owner: Owner; unit: UnitType; value: number; hit: boolean }
export interface GameState {
  version: 1
  round: number; phase: Phase
  speaker: Seat; active: Seat
  strategyPool: { id: StrategyCardId; bonus: number }[]   // unpicked cards with trade goods
  draft: Seat[]                                          // remaining pick order in the strategy phase
  publicObjectives: string[]                             // revealed ids
  players: [Player, Player]
  systems: Record<string, System>
  tactical: TacticalContext | null
  turnDone: boolean                                      // R3.2: the action is spent, free moves and endTurn are left
  pendingSecondary: StrategyCardId | null                // opponent may respond
  statusSubmitted: Seat[]                                // seats whose status move is in; the phase closes at two
  nextUnitId: number
  guardianRolls: number
  winner: Seat | null
  log: LogEntry[]
}
export type LogEntry = { t: 'move'; seat: Seat | null; move: Move; seed: number } | { t: 'roll'; owner: Owner; rolls: DieRoll[]; context: string } | { t: 'info'; text: string }
```

## Moves (`src/engine/moves.ts`)

```ts
export type Move =
  | { type: 'pickStrategyCard'; card: StrategyCardId }
  | { type: 'startTactical'; systemId: string }
  | { type: 'moveShips'; moves: { unitId: number; from: string; carrying: number[] }[] }   // all into tactical.systemId
  | { type: 'endMovement' }
  | { type: 'combatRound'; munitions?: { attacker?: boolean; defender?: boolean } }   // resolves one round (or the pre-combat steps on round 0); Munitions Reserves is per side
  | { type: 'assignHits'; destroy: number[]; sustain: number[] }   // R4.1 step 4: unit ids of the seat whose hits are queued, in the activated system
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
```

## Module layout

| File | Responsibility |
| --- | --- |
| `src/engine/types.ts` | state and move types above |
| `src/engine/rng.ts` | `mulberry32(seed)`, `rollDice(rng, n)` |
| `src/data/units.ts` | unit stat table with level I/II and faction variants, derived from `data/reference` |
| `src/data/techs.ts` | technology ids, colours, prerequisites, effects flags |
| `src/data/factions.ts` | starting units, techs, abilities flags |
| `src/data/map.ts` | galaxy/home systems, planets, adjacency, wormholes, trade post links *(duel-only legacy module; not base TI4)* |
| `src/data/posts.ts` | the six trade posts *(duel-only legacy; not base TI4)* |
| `src/data/objectives.ts` | public objective ids, order and texts, the Mandate |
| `src/engine/objectives.ts` | objective predicates, scoring and victory point bookkeeping |
| `src/engine/setup.ts` | `createGame`, guardian fleet table, *(legacy: the trade post roll, duel-only)* |
| `src/engine/economy.ts` | cost, payment, production value, fleet pool and capacity checks |
| `src/engine/strategyPhase.ts` | draft and initiative |
| `src/engine/actionPhase.ts` | activation, passing, turn alternation |
| `src/engine/board.ts` | shared unit helpers: stats owner, dice, unit removal, reinforcements, capacity and fleet checks |
| `src/engine/movement.ts` | adjacency with wormholes, move validation, reachability |
| `src/engine/combat.ts` | space combat, anti-fighter barrage, space cannon, hit assignment, retreat |
| `src/engine/invasion.ts` | bombardment, landing, ground combat, control change |
| `src/engine/production.ts` | produce move |
| `src/engine/strategicActions.ts` | six cards primary and secondary |
| `src/engine/componentActions.ts` | Inheritance Systems research, emergency shipyard *(legacy: the commodity sale at a trade post, duel-only)* |
| `src/engine/postAbilities.ts` | *(duel-only legacy module; not base TI4)* |
| `src/engine/statusPhase.ts` | one status move per player: scoring, token distribution, readying, guardian respawn, victory and round advance *(legacy: trade post turnover, duel-only)* |
| `src/engine/legalMoves.ts` | enumerator and `validateMove` |
| `src/engine/index.ts` | `applyMove` dispatcher, re-exports, and the read-only query helpers the UI builds its controls from |

Tests live next to each module as `*.test.ts` (Vitest). Every rule in `docs/spec/game-rules.md` has at least one test that quotes its section number in the test name.
