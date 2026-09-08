# Engine Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure TypeScript foundation of the Mecatol Online rules engine: typed data tables (units, technologies, factions, map, objectives), deterministic RNG, adjacency with wormholes and anomalies, technology prerequisites, game setup with the guardian fleet, the strategy-phase draft, economy helpers, and the `applyMove` dispatcher with `legalMoves` for the strategy phase.

**Architecture:** Everything under `src/engine/` and `src/data/` is pure: functions from state to state, no I/O, no React. Data modules export typed constants derived from the verified reference JSON in `data/reference/`. The engine is driven by `applyMove(state, move, seed)` which dispatches on `move.type`; this plan implements the dispatcher and the strategy-phase moves, later plans add tactical, strategic and status moves to the same dispatcher.

**Tech Stack:** TypeScript 5 (strict), Vite 7 scaffold, Vitest 3, no runtime dependencies in the engine.

**Spec:** `docs/spec/game-rules.md` (rules v0.2, sections referenced below as R1..R8) and `docs/spec/engine-design.md` (state and move types, module layout).

## Global Constraints

- Node 24, npm 11; run tests with `npm test` (Vitest, `vitest run`).
- `tsconfig.app.json` is strict; no `any`, no non-null assertions in engine code.
- Engine and data modules must not import React, DOM APIs or Node APIs.
- All code, comments, commit messages and docs in English.
- Never mutate a `GameState` passed into a function; return new objects.
- Dice are ten-sided: `1 + Math.floor(rng() * 10)`; all randomness comes from the seed passed to `applyMove` or `createGame`.
- Test names cite the spec section they cover, e.g. `'R1 adjacency: alpha wormhole links bereg and starpoint'`.
- Commit after every task with a conventional message (`feat:`, `test:`, `chore:`).

---

### Task 1: Test runner, engine types, unit stat table

**Files:**
- Modify: `package.json` (add `"test": "vitest run"` and `"test:watch": "vitest"` scripts)
- Create: `src/engine/types.ts`
- Create: `src/data/units.ts`
- Test: `src/data/units.test.ts`

**Interfaces:**
- Produces: all types from `docs/spec/engine-design.md` section "State shape" and "Moves" (copy them verbatim into `types.ts`), plus
  ```ts
  export interface UnitStats { cost: number; producedPerCost: number; combat: number | null; combatDice: number; move: number; capacity: number; sustain: boolean; bombardment: { value: number; dice: number } | null; afb: { value: number; dice: number } | null; spaceCannon: { value: number; dice: number } | null; planetaryShield: boolean; production: number | null }
  export function unitStats(type: UnitType, owner: { faction: FactionId; techs: string[] } | 'guardian'): UnitStats
  ```
  Level II stats apply when the owner's `techs` contains the matching upgrade id (`infantry_ii`, `fighter_ii`, `destroyer_ii`, `cruiser_ii`, `carrier_ii`, `dreadnought_ii`, `space_dock_ii`, `war_sun`). L1Z1X dreadnoughts use `super_dreadnought_i` stats and upgrade with `super_dreadnought_ii`. Flagship stats depend on the faction. `production` for a space dock is the bonus added to the planet's resources (2 or 4). `'guardian'` always gets level I generic stats.

- [ ] **Step 1: Add the test scripts and write the failing test**

In `package.json` add to `"scripts"`: `"test": "vitest run"`, `"test:watch": "vitest"`.

```ts
// src/data/units.test.ts
import { describe, expect, it } from 'vitest'
import { unitStats } from './units'

const l1z1x = { faction: 'l1z1x' as const, techs: [] as string[] }
const letnev = { faction: 'letnev' as const, techs: [] as string[] }

describe('unit stats (R1 components)', () => {
  it('generic level I stats match the reference table', () => {
    expect(unitStats('fighter', letnev)).toMatchObject({ cost: 1, producedPerCost: 2, combat: 9, move: 0, capacity: 0 })
    expect(unitStats('destroyer', letnev)).toMatchObject({ cost: 1, combat: 9, move: 2, afb: { value: 9, dice: 2 } })
    expect(unitStats('cruiser', letnev)).toMatchObject({ cost: 2, combat: 7, move: 2, capacity: 0 })
    expect(unitStats('carrier', letnev)).toMatchObject({ cost: 3, combat: 9, move: 1, capacity: 4 })
    expect(unitStats('dreadnought', letnev)).toMatchObject({ cost: 4, combat: 5, move: 1, capacity: 1, sustain: true, bombardment: { value: 5, dice: 1 } })
    expect(unitStats('warsun', letnev)).toMatchObject({ cost: 12, combat: 3, combatDice: 3, move: 2, capacity: 6, sustain: true })
    expect(unitStats('infantry', letnev)).toMatchObject({ cost: 1, producedPerCost: 2, combat: 8 })
    expect(unitStats('pds', letnev)).toMatchObject({ spaceCannon: { value: 6, dice: 1 }, planetaryShield: true })
    expect(unitStats('spacedock', letnev)).toMatchObject({ production: 2 })
  })
  it('level II upgrades change the stats', () => {
    const t = { faction: 'letnev' as const, techs: ['fighter_ii', 'destroyer_ii', 'cruiser_ii', 'carrier_ii', 'dreadnought_ii', 'infantry_ii', 'space_dock_ii'] }
    expect(unitStats('fighter', t)).toMatchObject({ combat: 8, move: 2 })
    expect(unitStats('destroyer', t)).toMatchObject({ combat: 8, afb: { value: 6, dice: 3 } })
    expect(unitStats('cruiser', t)).toMatchObject({ combat: 6, move: 3, capacity: 1 })
    expect(unitStats('carrier', t)).toMatchObject({ move: 2, capacity: 6 })
    expect(unitStats('dreadnought', t)).toMatchObject({ move: 2 })
    expect(unitStats('infantry', t)).toMatchObject({ combat: 7 })
    expect(unitStats('spacedock', t)).toMatchObject({ production: 4 })
  })
  it('L1Z1X dreadnoughts are super-dreadnoughts', () => {
    expect(unitStats('dreadnought', l1z1x)).toMatchObject({ cost: 4, combat: 5, move: 1, capacity: 2, bombardment: { value: 5, dice: 1 } })
    expect(unitStats('dreadnought', { ...l1z1x, techs: ['super_dreadnought_ii'] })).toMatchObject({ combat: 4, move: 2, capacity: 2, bombardment: { value: 4, dice: 1 } })
    expect(unitStats('dreadnought', { ...l1z1x, techs: ['dreadnought_ii'] })).toMatchObject({ combat: 5, move: 1 })
  })
  it('flagships are faction specific', () => {
    expect(unitStats('flagship', l1z1x)).toMatchObject({ cost: 8, combat: 5, combatDice: 2, move: 1, capacity: 5, sustain: true, bombardment: null })
    expect(unitStats('flagship', letnev)).toMatchObject({ cost: 8, combat: 5, combatDice: 2, move: 1, capacity: 3, sustain: true, bombardment: { value: 5, dice: 3 } })
  })
  it('guardian units use generic level I stats', () => {
    expect(unitStats('dreadnought', 'guardian')).toMatchObject({ combat: 5, capacity: 1 })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/data/units.test.ts`
Expected: FAIL, `Cannot find module './units'`.

- [ ] **Step 3: Write the types and the unit table**

`src/engine/types.ts`: copy the `State shape` and `Moves` code blocks from `docs/spec/engine-design.md` verbatim (they are complete TypeScript), and append:

```ts
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
  players: [{ faction: FactionId; color: Color; name: string }, { faction: FactionId; color: Color; name: string }]
  speaker: Seat
}
```

`src/data/units.ts`:

```ts
import type { FactionId, UnitStats, UnitType } from '../engine/types'

const base = (p: Partial<UnitStats>): UnitStats => ({
  cost: 0, producedPerCost: 1, combat: null, combatDice: 1, move: 0, capacity: 0, sustain: false,
  bombardment: null, afb: null, spaceCannon: null, planetaryShield: false, production: null, ...p,
})

const LEVEL_I: Record<UnitType, UnitStats> = {
  infantry: base({ cost: 1, producedPerCost: 2, combat: 8 }),
  fighter: base({ cost: 1, producedPerCost: 2, combat: 9 }),
  destroyer: base({ cost: 1, combat: 9, move: 2, afb: { value: 9, dice: 2 } }),
  cruiser: base({ cost: 2, combat: 7, move: 2 }),
  carrier: base({ cost: 3, combat: 9, move: 1, capacity: 4 }),
  dreadnought: base({ cost: 4, combat: 5, move: 1, capacity: 1, sustain: true, bombardment: { value: 5, dice: 1 } }),
  warsun: base({ cost: 12, combat: 3, combatDice: 3, move: 2, capacity: 6, sustain: true, bombardment: { value: 3, dice: 3 } }),
  flagship: base({ cost: 8, combat: 5, combatDice: 2, move: 1, capacity: 3, sustain: true }),
  pds: base({ spaceCannon: { value: 6, dice: 1 }, planetaryShield: true }),
  spacedock: base({ production: 2 }),
}

const LEVEL_II: Partial<Record<UnitType, Partial<UnitStats>>> = {
  infantry: { combat: 7 },
  fighter: { combat: 8, move: 2 },
  destroyer: { combat: 8, afb: { value: 6, dice: 3 } },
  cruiser: { combat: 6, move: 3, capacity: 1 },
  carrier: { move: 2, capacity: 6 },
  dreadnought: { move: 2 },
  spacedock: { production: 4 },
}

export const UPGRADE_TECH: Partial<Record<UnitType, string>> = {
  infantry: 'infantry_ii', fighter: 'fighter_ii', destroyer: 'destroyer_ii', cruiser: 'cruiser_ii',
  carrier: 'carrier_ii', dreadnought: 'dreadnought_ii', spacedock: 'space_dock_ii', warsun: 'war_sun',
}

const FLAGSHIPS: Record<FactionId, UnitStats> = {
  l1z1x: base({ cost: 8, combat: 5, combatDice: 2, move: 1, capacity: 5, sustain: true }),
  letnev: base({ cost: 8, combat: 5, combatDice: 2, move: 1, capacity: 3, sustain: true, bombardment: { value: 5, dice: 3 } }),
}

const SUPER_DREADNOUGHT_I = base({ cost: 4, combat: 5, move: 1, capacity: 2, sustain: true, bombardment: { value: 5, dice: 1 } })
const SUPER_DREADNOUGHT_II = base({ cost: 4, combat: 4, move: 2, capacity: 2, sustain: true, bombardment: { value: 4, dice: 1 } })

export type StatsOwner = { faction: FactionId; techs: string[] } | 'guardian'

export function unitStats(type: UnitType, owner: StatsOwner): UnitStats {
  if (owner === 'guardian') return LEVEL_I[type]
  if (type === 'flagship') return FLAGSHIPS[owner.faction]
  if (type === 'dreadnought' && owner.faction === 'l1z1x') {
    return owner.techs.includes('super_dreadnought_ii') ? SUPER_DREADNOUGHT_II : SUPER_DREADNOUGHT_I
  }
  const upgrade = UPGRADE_TECH[type]
  if (upgrade && owner.techs.includes(upgrade) && LEVEL_II[type]) return { ...LEVEL_I[type], ...LEVEL_II[type] }
  return LEVEL_I[type]
}

export const SHIP_TYPES: UnitType[] = ['fighter', 'destroyer', 'cruiser', 'carrier', 'dreadnought', 'warsun', 'flagship']
export const NON_FIGHTER_SHIPS: UnitType[] = ['destroyer', 'cruiser', 'carrier', 'dreadnought', 'warsun', 'flagship']
export function isShip(type: UnitType): boolean { return SHIP_TYPES.includes(type) }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/data/units.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: no errors.

```bash
git add package.json src/engine/types.ts src/data/units.ts src/data/units.test.ts
git commit -m "feat(engine): types and unit stat table with upgrades and faction variants"
```

---

### Task 2: Deterministic RNG

**Files:**
- Create: `src/engine/rng.ts`
- Test: `src/engine/rng.test.ts`

**Interfaces:**
- Produces: `export type Rng = () => number` (uniform in [0, 1)), `export function mulberry32(seed: number): Rng`, `export function rollDice(rng: Rng, count: number): number[]` (values 1..10), `export function deriveSeed(seed: number, salt: number): number` (mixes a move seed with a step index so several rolls inside one move differ but stay deterministic).

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/rng.test.ts
import { describe, expect, it } from 'vitest'
import { deriveSeed, mulberry32, rollDice } from './rng'

describe('rng (engine-design: determinism)', () => {
  it('same seed gives the same sequence', () => {
    const a = mulberry32(42), b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
  it('different seeds differ', () => {
    expect(mulberry32(1)()).not.toEqual(mulberry32(2)())
  })
  it('dice are ten-sided and never 0 or 11', () => {
    const rolls = rollDice(mulberry32(7), 1000)
    expect(Math.min(...rolls)).toBe(1)
    expect(Math.max(...rolls)).toBe(10)
    expect(rolls.every(r => Number.isInteger(r))).toBe(true)
  })
  it('deriveSeed is deterministic and salt-sensitive', () => {
    expect(deriveSeed(99, 1)).toBe(deriveSeed(99, 1))
    expect(deriveSeed(99, 1)).not.toBe(deriveSeed(99, 2))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/engine/rng.test.ts`
Expected: FAIL, `Cannot find module './rng'`.

- [ ] **Step 3: Implement**

```ts
// src/engine/rng.ts
export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function rollDice(rng: Rng, count: number): number[] {
  const out: number[] = []
  for (let i = 0; i < count; i++) out.push(1 + Math.floor(rng() * 10))
  return out
}

export function deriveSeed(seed: number, salt: number): number {
  let h = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/engine/rng.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/rng.ts src/engine/rng.test.ts
git commit -m "feat(engine): mulberry32 rng, d10 rolls and seed derivation"
```

---

### Task 3: Map data and adjacency

**Files:**
- Create: `src/data/map.ts`
- Create: `src/engine/adjacency.ts`
- Test: `src/engine/adjacency.test.ts`

**Interfaces:**
- Produces in `map.ts`:
  ```ts
  export interface PlanetDef { id: string; name: string; resources: number; influence: number }
  export interface SystemDef { id: string; name: string; tile: string; planets: PlanetDef[]; anomaly: 'asteroid' | 'nebula' | null; wormhole: 'alpha' | 'beta' | null; neighbours: string[]; home: Seat | null }
  export const SYSTEMS: SystemDef[]           // the seven systems of R1
  export const SYSTEM_IDS: string[]
  export const TRADE_POSTS: { west: string[]; east: string[] }   // linked system ids (R8)
  export function systemDef(id: string): SystemDef
  ```
- Produces in `adjacency.ts`:
  ```ts
  export function adjacent(a: string, b: string): boolean        // hex neighbour or wormhole pair
  export function neighbours(id: string): string[]                // including wormhole partner
  export function distance(from: string, to: string): number      // shortest path length in steps, ignoring blockers
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/adjacency.test.ts
import { describe, expect, it } from 'vitest'
import { SYSTEMS, TRADE_POSTS, systemDef } from '../data/map'
import { adjacent, distance, neighbours } from './adjacency'

describe('R1 map Bereg Standoff', () => {
  it('has seven systems with the printed planet values', () => {
    expect(SYSTEMS).toHaveLength(7)
    expect(systemDef('home-n').planets).toEqual([{ id: '000', name: '[0.0.0]', resources: 5, influence: 0 }])
    expect(systemDef('home-s').planets.map(p => [p.name, p.resources, p.influence])).toEqual([['Arc Prime', 4, 0], ['Wren Terra', 2, 1]])
    expect(systemDef('bereg').planets.map(p => [p.name, p.resources, p.influence])).toEqual([['Bereg', 3, 1], ['Lirta IV', 2, 3]])
    expect(systemDef('starpoint').planets.map(p => [p.name, p.resources, p.influence])).toEqual([['Starpoint', 3, 1], ['Centauri', 1, 3]])
    expect(systemDef('sakulag').planets[0]).toMatchObject({ resources: 2, influence: 1 })
    expect(systemDef('quann').planets[0]).toMatchObject({ resources: 2, influence: 1 })
    expect(systemDef('mecatol').planets[0]).toMatchObject({ name: 'Mecatol Rex', resources: 1, influence: 6 })
  })
  it('marks anomalies, wormholes and homes', () => {
    expect(systemDef('sakulag').anomaly).toBe('asteroid')
    expect(systemDef('quann').anomaly).toBe('nebula')
    expect(systemDef('bereg').wormhole).toBe('alpha')
    expect(systemDef('starpoint').wormhole).toBe('alpha')
    expect(systemDef('sakulag').wormhole).toBe('beta')
    expect(systemDef('quann').wormhole).toBe('beta')
    expect(systemDef('home-n').home).toBe(0)
    expect(systemDef('home-s').home).toBe(1)
  })
  it('R1 adjacency: the centre touches all six ring systems', () => {
    for (const id of ['home-n', 'bereg', 'sakulag', 'quann', 'starpoint', 'home-s']) expect(adjacent('mecatol', id)).toBe(true)
  })
  it('R1 adjacency: ring neighbours and non-neighbours', () => {
    expect(adjacent('home-n', 'bereg')).toBe(true)
    expect(adjacent('home-n', 'sakulag')).toBe(true)
    expect(adjacent('home-n', 'home-s')).toBe(false)
    expect(adjacent('bereg', 'quann')).toBe(true)
    expect(adjacent('quann', 'home-s')).toBe(true)
    expect(adjacent('home-s', 'starpoint')).toBe(true)
    expect(adjacent('starpoint', 'sakulag')).toBe(true)
    expect(adjacent('bereg', 'sakulag')).toBe(false)
  })
  it('R1 adjacency: alpha wormhole links bereg and starpoint, beta links sakulag and quann', () => {
    expect(adjacent('bereg', 'starpoint')).toBe(true)
    expect(adjacent('sakulag', 'quann')).toBe(true)
    expect(neighbours('bereg').sort()).toEqual(['home-n', 'mecatol', 'quann', 'starpoint'])
  })
  it('distance uses wormholes', () => {
    expect(distance('home-n', 'home-s')).toBe(2)
    expect(distance('bereg', 'starpoint')).toBe(1)
    expect(distance('home-n', 'home-n')).toBe(0)
  })
  it('R8 trade posts link the flank systems', () => {
    expect(TRADE_POSTS).toEqual({ west: ['sakulag', 'starpoint'], east: ['bereg', 'quann'] })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/engine/adjacency.test.ts`
Expected: FAIL, `Cannot find module '../data/map'`.

- [ ] **Step 3: Implement map and adjacency**

```ts
// src/data/map.ts
import type { Seat } from '../engine/types'

export interface PlanetDef { id: string; name: string; resources: number; influence: number }
export interface SystemDef {
  id: string; name: string; tile: string
  planets: PlanetDef[]
  anomaly: 'asteroid' | 'nebula' | null
  wormhole: 'alpha' | 'beta' | null
  neighbours: string[]
  home: Seat | null
}

// Flower layout: mecatol in the centre; ring order clockwise from the top: home-n, bereg, quann, home-s, starpoint, sakulag.
export const SYSTEMS: SystemDef[] = [
  { id: 'home-n', name: '[0.0.0]', tile: '06_000', planets: [{ id: '000', name: '[0.0.0]', resources: 5, influence: 0 }], anomaly: null, wormhole: null, neighbours: ['mecatol', 'bereg', 'sakulag'], home: 0 },
  { id: 'bereg', name: 'Bereg', tile: '35_Bereg', planets: [{ id: 'bereg', name: 'Bereg', resources: 3, influence: 1 }, { id: 'lirta-iv', name: 'Lirta IV', resources: 2, influence: 3 }], anomaly: null, wormhole: 'alpha', neighbours: ['mecatol', 'home-n', 'quann'], home: null },
  { id: 'quann', name: 'Quann', tile: '42_Nebula', planets: [{ id: 'quann', name: 'Quann', resources: 2, influence: 1 }], anomaly: 'nebula', wormhole: 'beta', neighbours: ['mecatol', 'bereg', 'home-s'], home: null },
  { id: 'home-s', name: 'Arc Prime', tile: '10_ArcPime', planets: [{ id: 'arc-prime', name: 'Arc Prime', resources: 4, influence: 0 }, { id: 'wren-terra', name: 'Wren Terra', resources: 2, influence: 1 }], anomaly: null, wormhole: null, neighbours: ['mecatol', 'quann', 'starpoint'], home: 1 },
  { id: 'starpoint', name: 'Starpoint', tile: '00_blue', planets: [{ id: 'starpoint', name: 'Starpoint', resources: 3, influence: 1 }, { id: 'centauri', name: 'Centauri', resources: 1, influence: 3 }], anomaly: null, wormhole: 'alpha', neighbours: ['mecatol', 'home-s', 'sakulag'], home: null },
  { id: 'sakulag', name: 'Sakulag', tile: '44_Asteroids', planets: [{ id: 'sakulag', name: 'Sakulag', resources: 2, influence: 1 }], anomaly: 'asteroid', wormhole: 'beta', neighbours: ['mecatol', 'starpoint', 'home-n'], home: null },
  { id: 'mecatol', name: 'Mecatol Rex', tile: '18_MR', planets: [{ id: 'mecatol-rex', name: 'Mecatol Rex', resources: 1, influence: 6 }], anomaly: null, wormhole: null, neighbours: ['home-n', 'bereg', 'quann', 'home-s', 'starpoint', 'sakulag'], home: null },
]

export const SYSTEM_IDS: string[] = SYSTEMS.map(s => s.id)
export const TRADE_POSTS = { west: ['sakulag', 'starpoint'], east: ['bereg', 'quann'] } as const

const BY_ID = new Map(SYSTEMS.map(s => [s.id, s]))
export function systemDef(id: string): SystemDef {
  const s = BY_ID.get(id)
  if (!s) throw new Error(`unknown system ${id}`)
  return s
}
```

```ts
// src/engine/adjacency.ts
import { SYSTEMS, systemDef } from '../data/map'

export function neighbours(id: string): string[] {
  const def = systemDef(id)
  const out = new Set(def.neighbours)
  if (def.wormhole) for (const s of SYSTEMS) if (s.id !== id && s.wormhole === def.wormhole) out.add(s.id)
  return [...out]
}

export function adjacent(a: string, b: string): boolean {
  return neighbours(a).includes(b)
}

export function distance(from: string, to: string): number {
  if (from === to) return 0
  const seen = new Set([from])
  let frontier = [from]
  for (let d = 1; frontier.length; d++) {
    const next: string[] = []
    for (const id of frontier) for (const n of neighbours(id)) {
      if (n === to) return d
      if (!seen.has(n)) { seen.add(n); next.push(n) }
    }
    frontier = next
  }
  return Infinity
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/engine/adjacency.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/map.ts src/engine/adjacency.ts src/engine/adjacency.test.ts
git commit -m "feat(engine): Bereg Standoff map data and adjacency with wormholes"
```

---

### Task 4: Technology data and prerequisites

**Files:**
- Create: `src/data/techs.ts`
- Create: `src/engine/research.ts`
- Test: `src/engine/research.test.ts`

**Interfaces:**
- Produces in `techs.ts`:
  ```ts
  export interface TechDef { id: string; name: string; colour: TechColor | null; prereq: Partial<Record<TechColor, number>>; kind: 'general' | 'upgrade' | 'faction'; faction?: FactionId; unit?: UnitType }
  export const TECHS: TechDef[]
  export function techDef(id: string): TechDef
  ```
- Produces in `research.ts`:
  ```ts
  export function colourCounts(techs: string[]): Record<TechColor, number>
  export function canResearch(player: { faction: FactionId; techs: string[] }, techId: string, ignorePrereqs?: boolean): boolean
  export function researchable(player: { faction: FactionId; techs: string[] }): string[]
  ```
  Rules: a tech is researchable if not owned, the colour counts of owned techs meet `prereq`, it is not another faction's tech, and for L1Z1X `dreadnought_ii` is replaced by `super_dreadnought_ii` (so `dreadnought_ii` is never researchable for L1Z1X and `super_dreadnought_ii` never for Letnev). `pds_ii` is excluded from the duel (R5) and must not appear in `TECHS`.

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/research.test.ts
import { describe, expect, it } from 'vitest'
import { TECHS, techDef } from '../data/techs'
import { canResearch, colourCounts, researchable } from './research'

describe('R5 technology', () => {
  it('has 16 general techs, 8 unit upgrades (no PDS II) and 4 faction techs', () => {
    expect(TECHS.filter(t => t.kind === 'general')).toHaveLength(16)
    expect(TECHS.filter(t => t.kind === 'upgrade').map(t => t.id).sort()).toEqual(['carrier_ii', 'cruiser_ii', 'destroyer_ii', 'dreadnought_ii', 'fighter_ii', 'infantry_ii', 'space_dock_ii', 'war_sun'])
    expect(TECHS.filter(t => t.kind === 'faction').map(t => t.id).sort()).toEqual(['inheritance_systems', 'l4_disruptors', 'non_euclidean_shielding', 'super_dreadnought_ii'])
    expect(TECHS.find(t => t.id === 'pds_ii')).toBeUndefined()
  })
  it('prerequisites follow the tiers', () => {
    expect(techDef('gravity_drive').prereq).toEqual({ blue: 1 })
    expect(techDef('light_wave_deflector').prereq).toEqual({ blue: 3 })
    expect(techDef('cruiser_ii').prereq).toEqual({ green: 1, yellow: 1, red: 1 })
    expect(techDef('war_sun').prereq).toEqual({ red: 3, yellow: 1 })
    expect(techDef('super_dreadnought_ii').prereq).toEqual({ blue: 2, yellow: 1 })
    expect(techDef('l4_disruptors').prereq).toEqual({ yellow: 1 })
  })
  it('colour counts ignore unit upgrades and faction techs without colour', () => {
    expect(colourCounts(['neural_motivator', 'plasma_scoring', 'sarween_tools', 'fighter_ii', 'l4_disruptors'])).toEqual({ blue: 0, red: 1, green: 1, yellow: 2 })
  })
  it('L1Z1X at game start can research the four tier-0 techs still missing plus tier-1 of owned colours', () => {
    const p = { faction: 'l1z1x' as const, techs: ['neural_motivator', 'plasma_scoring'] }
    const r = researchable(p).sort()
    expect(r).toEqual(['antimass_deflectors', 'dacxive_animators', 'magen_defense_grid', 'sarween_tools'])
  })
  it('Cruiser II needs one of each of green, yellow, red', () => {
    const p = { faction: 'l1z1x' as const, techs: ['neural_motivator', 'plasma_scoring', 'sarween_tools'] }
    expect(canResearch(p, 'cruiser_ii')).toBe(true)
    expect(canResearch({ ...p, techs: ['neural_motivator', 'plasma_scoring'] }, 'cruiser_ii')).toBe(false)
  })
  it('faction techs are locked to their faction and L1Z1X replaces Dreadnought II', () => {
    const l = { faction: 'l1z1x' as const, techs: ['antimass_deflectors', 'gravity_drive', 'sarween_tools'] }
    expect(canResearch(l, 'super_dreadnought_ii')).toBe(true)
    expect(canResearch(l, 'dreadnought_ii')).toBe(false)
    expect(canResearch(l, 'l4_disruptors')).toBe(false)
    const b = { faction: 'letnev' as const, techs: ['antimass_deflectors', 'gravity_drive', 'sarween_tools'] }
    expect(canResearch(b, 'dreadnought_ii')).toBe(true)
    expect(canResearch(b, 'super_dreadnought_ii')).toBe(false)
    expect(canResearch(b, 'inheritance_systems')).toBe(false)
  })
  it('ignorePrereqs (Inheritance Systems) skips colour requirements but not ownership', () => {
    const l = { faction: 'l1z1x' as const, techs: ['neural_motivator'] }
    expect(canResearch(l, 'war_sun', true)).toBe(true)
    expect(canResearch(l, 'neural_motivator', true)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/engine/research.test.ts`
Expected: FAIL, `Cannot find module '../data/techs'`.

- [ ] **Step 3: Implement**

```ts
// src/data/techs.ts
import type { FactionId, TechColor, UnitType } from '../engine/types'

export interface TechDef {
  id: string; name: string
  colour: TechColor | null
  prereq: Partial<Record<TechColor, number>>
  kind: 'general' | 'upgrade' | 'faction'
  faction?: FactionId
  unit?: UnitType
}

const g = (id: string, name: string, colour: TechColor, tier: number): TechDef => ({ id, name, colour, prereq: tier ? { [colour]: tier } : {}, kind: 'general' })

export const TECHS: TechDef[] = [
  g('antimass_deflectors', 'Antimass Deflectors', 'blue', 0), g('gravity_drive', 'Gravity Drive', 'blue', 1),
  g('fleet_logistics', 'Fleet Logistics', 'blue', 2), g('light_wave_deflector', 'Light/Wave Deflector', 'blue', 3),
  g('plasma_scoring', 'Plasma Scoring', 'red', 0), g('magen_defense_grid', 'Magen Defense Grid', 'red', 1),
  g('duranium_armor', 'Duranium Armor', 'red', 2), g('assault_cannon', 'Assault Cannon', 'red', 3),
  g('neural_motivator', 'Neural Motivator', 'green', 0), g('dacxive_animators', 'Dacxive Animators', 'green', 1),
  g('hyper_metabolism', 'Hyper Metabolism', 'green', 2), g('x89_bacterial_weapon', 'X-89 Bacterial Weapon', 'green', 3),
  g('sarween_tools', 'Sarween Tools', 'yellow', 0), g('graviton_laser_system', 'Graviton Laser System', 'yellow', 1),
  g('transit_diodes', 'Transit Diodes', 'yellow', 2), g('integrated_economy', 'Integrated Economy', 'yellow', 3),
  { id: 'infantry_ii', name: 'Infantry II', colour: null, prereq: { green: 2 }, kind: 'upgrade', unit: 'infantry' },
  { id: 'fighter_ii', name: 'Fighter II', colour: null, prereq: { green: 1, blue: 1 }, kind: 'upgrade', unit: 'fighter' },
  { id: 'destroyer_ii', name: 'Destroyer II', colour: null, prereq: { red: 2 }, kind: 'upgrade', unit: 'destroyer' },
  { id: 'cruiser_ii', name: 'Cruiser II', colour: null, prereq: { green: 1, yellow: 1, red: 1 }, kind: 'upgrade', unit: 'cruiser' },
  { id: 'carrier_ii', name: 'Carrier II', colour: null, prereq: { blue: 2 }, kind: 'upgrade', unit: 'carrier' },
  { id: 'dreadnought_ii', name: 'Dreadnought II', colour: null, prereq: { blue: 2, yellow: 1 }, kind: 'upgrade', unit: 'dreadnought' },
  { id: 'space_dock_ii', name: 'Space Dock II', colour: null, prereq: { yellow: 2 }, kind: 'upgrade', unit: 'spacedock' },
  { id: 'war_sun', name: 'War Sun', colour: null, prereq: { red: 3, yellow: 1 }, kind: 'upgrade', unit: 'warsun' },
  { id: 'inheritance_systems', name: 'Inheritance Systems', colour: 'yellow', prereq: { yellow: 2 }, kind: 'faction', faction: 'l1z1x' },
  { id: 'super_dreadnought_ii', name: 'Super-Dreadnought II', colour: null, prereq: { blue: 2, yellow: 1 }, kind: 'faction', faction: 'l1z1x', unit: 'dreadnought' },
  { id: 'l4_disruptors', name: 'L4 Disruptors', colour: 'yellow', prereq: { yellow: 1 }, kind: 'faction', faction: 'letnev' },
  { id: 'non_euclidean_shielding', name: 'Non-Euclidean Shielding', colour: 'red', prereq: { red: 2 }, kind: 'faction', faction: 'letnev' },
]

const BY_ID = new Map(TECHS.map(t => [t.id, t]))
export function techDef(id: string): TechDef {
  const t = BY_ID.get(id)
  if (!t) throw new Error(`unknown tech ${id}`)
  return t
}
```

```ts
// src/engine/research.ts
import { TECHS, techDef } from '../data/techs'
import type { FactionId, TechColor } from './types'

type TechOwner = { faction: FactionId; techs: string[] }

export function colourCounts(techs: string[]): Record<TechColor, number> {
  const c: Record<TechColor, number> = { blue: 0, red: 0, green: 0, yellow: 0 }
  for (const id of techs) { const t = techDef(id); if (t.colour) c[t.colour]++ }
  return c
}

function availableTo(player: TechOwner, techId: string): boolean {
  const t = techDef(techId)
  if (t.kind === 'faction' && t.faction !== player.faction) return false
  if (techId === 'dreadnought_ii' && player.faction === 'l1z1x') return false
  return true
}

export function canResearch(player: TechOwner, techId: string, ignorePrereqs = false): boolean {
  if (player.techs.includes(techId) || !availableTo(player, techId)) return false
  if (ignorePrereqs) return true
  const have = colourCounts(player.techs)
  const need = techDef(techId).prereq
  return (Object.keys(need) as TechColor[]).every(colour => have[colour] >= (need[colour] ?? 0))
}

export function researchable(player: TechOwner): string[] {
  return TECHS.map(t => t.id).filter(id => canResearch(player, id))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/engine/research.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/techs.ts src/engine/research.ts src/engine/research.test.ts
git commit -m "feat(engine): technology table and research prerequisites"
```

---

### Task 5: Factions, objectives and game setup with the guardian fleet

**Files:**
- Create: `src/data/factions.ts`
- Create: `src/data/objectives.ts`
- Create: `src/engine/setup.ts`
- Test: `src/engine/setup.test.ts`

**Interfaces:**
- Produces in `factions.ts`:
  ```ts
  export interface FactionDef { id: FactionId; name: string; commodities: number; startingTechs: string[]; startingUnits: { type: UnitType; count: number; planetId?: string }[]; abilities: string[] }
  export const FACTIONS: Record<FactionId, FactionDef>
  ```
  Starting units place ground units and structures on the given planet id, ships in the home system space. L1Z1X: dreadnought 1, carrier 1, fighter 3, infantry 5 on `000`, spacedock 1 on `000`, pds 1 on `000`; abilities `['assimilate', 'harrow']`. Letnev: dreadnought 1, carrier 1, destroyer 1, fighter 1, infantry 2 on `arc-prime`, infantry 1 on `wren-terra`, spacedock 1 on `arc-prime`; abilities `['munitions_reserves', 'armada']`.
- Produces in `objectives.ts`:
  ```ts
  export interface ObjectiveDef { id: string; text: string; round: number }
  export const PUBLIC_OBJECTIVES: ObjectiveDef[]   // six, in reveal order (R7)
  export const MANDATE: { id: 'first_strike'; text: string }
  ```
- Produces in `setup.ts`:
  ```ts
  export const GUARDIAN_FLEETS: Partial<Record<UnitType, number>>[]   // the six compositions of R4.2, each worth 8
  export const START_TOKENS: { tactic: number; fleet: number; strategy: number }   // 3/3/2
  export const ALL_STRATEGY_CARDS: StrategyCardId[]   // leadership, diplomacy, trade, warfare, technology, imperial
  export function createGame(config: GameConfig, seed: number): GameState
  export function rollGuardianFleet(state: GameState, seed: number): GameState   // replaces guardian ships in mecatol space and puts 2 guardian infantry on Mecatol Rex; increments guardianRolls
  export function unitsOf(state: GameState, owner: Owner): Unit[]   // all units on the map owned by owner (space, ground, structures)
  ```
  `createGame` builds the systems from `SYSTEMS`, assigns unit ids from 1 upward (`nextUnitId`), sets `round: 1`, `phase: 'strategy'`, `speaker: config.speaker`, `active: config.speaker`, `draft: [speaker, other, other, speaker]`, `strategyPool` with all six cards and bonus 0, `publicObjectives: [PUBLIC_OBJECTIVES[0].id]`, reinforcements per unit type (infantry 12, fighter 10, destroyer 8, cruiser 8, carrier 4, dreadnought 5, warsun 2, flagship 1, pds 6, spacedock 3) minus starting units, and rolls the first guardian fleet with the seed.

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/setup.test.ts
import { describe, expect, it } from 'vitest'
import { unitStats } from '../data/units'
import { ALL_STRATEGY_CARDS, GUARDIAN_FLEETS, createGame, rollGuardianFleet, unitsOf } from './setup'
import type { GameConfig, UnitType } from './types'

const config: GameConfig = {
  players: [{ faction: 'l1z1x', color: 'blue', name: 'Despot' }, { faction: 'letnev', color: 'red', name: 'Kael' }],
  speaker: 0,
}

const count = (units: { type: UnitType }[], type: UnitType) => units.filter(u => u.type === type).length

describe('R2 setup', () => {
  const g = createGame(config, 1)
  it('starts in round 1 strategy phase with the speaker to pick and all six cards in the pool', () => {
    expect(g.round).toBe(1); expect(g.phase).toBe('strategy'); expect(g.active).toBe(0)
    expect(g.draft).toEqual([0, 1, 1, 0])
    expect(g.strategyPool.map(c => c.id)).toEqual(ALL_STRATEGY_CARDS)
    expect(g.publicObjectives).toEqual(['own_3_techs'])
  })
  it('places the printed starting units', () => {
    const north = g.systems['home-n'], south = g.systems['home-s']
    expect(count(north.space, 'dreadnought')).toBe(1); expect(count(north.space, 'carrier')).toBe(1); expect(count(north.space, 'fighter')).toBe(3)
    expect(count(north.planets[0].ground, 'infantry')).toBe(5)
    expect(north.planets[0].structures.map(u => u.type).sort()).toEqual(['pds', 'spacedock'])
    expect(count(south.space, 'dreadnought')).toBe(1); expect(count(south.space, 'carrier')).toBe(1); expect(count(south.space, 'destroyer')).toBe(1); expect(count(south.space, 'fighter')).toBe(1)
    expect(count(south.planets[0].ground, 'infantry')).toBe(2); expect(count(south.planets[1].ground, 'infantry')).toBe(1)
    expect(south.planets[0].structures.map(u => u.type)).toEqual(['spacedock'])
    expect(north.planets[0].owner).toBe(0); expect(south.planets[1].owner).toBe(1)
  })
  it('gives starting techs, tokens, commodities and reinforcements', () => {
    expect(g.players[0].techs).toEqual(['neural_motivator', 'plasma_scoring'])
    expect(g.players[1].techs).toEqual(['antimass_deflectors', 'plasma_scoring'])
    expect(g.players[0].tokens).toEqual({ tactic: 3, fleet: 3, strategy: 2 })
    expect(g.players[0].commodities).toBe(2); expect(g.players[0].tradeGoods).toBe(0)
    expect(g.players[0].reinforcements.infantry).toBe(7); expect(g.players[0].reinforcements.pds).toBe(5); expect(g.players[1].reinforcements.pds).toBe(6)
  })
  it('unit ids are unique across the map', () => {
    const ids = [...unitsOf(g, 0), ...unitsOf(g, 1), ...unitsOf(g, 'guardian')].map(u => u.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(g.nextUnitId).toBe(Math.max(...ids) + 1)
  })
})

describe('R4.2 guardian fleet', () => {
  it('every table entry costs exactly 8', () => {
    for (const fleet of GUARDIAN_FLEETS) {
      const cost = (Object.entries(fleet) as [UnitType, number][]).reduce((sum, [type, n]) => {
        const s = unitStats(type, 'guardian'); return sum + (n / s.producedPerCost) * s.cost
      }, 0)
      expect(cost).toBe(8)
    }
    expect(GUARDIAN_FLEETS).toHaveLength(6)
  })
  it('createGame places a guardian fleet and 2 guardian infantry on Mecatol Rex', () => {
    const g = createGame(config, 5)
    const space = g.systems.mecatol.space
    expect(space.length).toBeGreaterThan(0)
    expect(space.every(u => u.owner === 'guardian')).toBe(true)
    expect(count(g.systems.mecatol.planets[0].ground, 'infantry')).toBe(2)
    expect(g.systems.mecatol.planets[0].owner).toBeNull()
    expect(g.guardianRolls).toBe(1)
  })
  it('rolling is seeded and replaces the previous fleet', () => {
    const a = createGame(config, 11), b = createGame(config, 11), c = createGame(config, 12)
    const sig = (s: typeof a) => s.systems.mecatol.space.map(u => u.type).sort().join(',')
    expect(sig(a)).toBe(sig(b))
    const rerolled = rollGuardianFleet(a, 99)
    expect(rerolled.guardianRolls).toBe(2)
    expect(rerolled.systems.mecatol.space.every(u => u.owner === 'guardian')).toBe(true)
    expect(count(rerolled.systems.mecatol.planets[0].ground, 'infantry')).toBe(2)
    expect(a.guardianRolls).toBe(1)   // input not mutated
    void c
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/engine/setup.test.ts`
Expected: FAIL, `Cannot find module './setup'`.

- [ ] **Step 3: Implement factions, objectives and setup**

```ts
// src/data/factions.ts
import type { FactionId, UnitType } from '../engine/types'

export interface FactionDef {
  id: FactionId; name: string; commodities: number
  startingTechs: string[]
  startingUnits: { type: UnitType; count: number; planetId?: string }[]
  abilities: string[]
}

export const FACTIONS: Record<FactionId, FactionDef> = {
  l1z1x: {
    id: 'l1z1x', name: 'L1Z1X Mindnet', commodities: 2,
    startingTechs: ['neural_motivator', 'plasma_scoring'],
    startingUnits: [
      { type: 'dreadnought', count: 1 }, { type: 'carrier', count: 1 }, { type: 'fighter', count: 3 },
      { type: 'infantry', count: 5, planetId: '000' }, { type: 'spacedock', count: 1, planetId: '000' }, { type: 'pds', count: 1, planetId: '000' },
    ],
    abilities: ['assimilate', 'harrow'],
  },
  letnev: {
    id: 'letnev', name: 'Barony of Letnev', commodities: 2,
    startingTechs: ['antimass_deflectors', 'plasma_scoring'],
    startingUnits: [
      { type: 'dreadnought', count: 1 }, { type: 'carrier', count: 1 }, { type: 'destroyer', count: 1 }, { type: 'fighter', count: 1 },
      { type: 'infantry', count: 2, planetId: 'arc-prime' }, { type: 'infantry', count: 1, planetId: 'wren-terra' }, { type: 'spacedock', count: 1, planetId: 'arc-prime' },
    ],
    abilities: ['munitions_reserves', 'armada'],
  },
}
```

```ts
// src/data/objectives.ts
export interface ObjectiveDef { id: string; text: string; round: number }

export const PUBLIC_OBJECTIVES: ObjectiveDef[] = [
  { id: 'own_3_techs', text: 'Own 3 technologies', round: 1 },
  { id: 'control_4_outside_home', text: 'Control 4 planets outside your home system', round: 2 },
  { id: 'three_ships_mecatol', text: 'Have 3 or more non-fighter ships in the Mecatol Rex system', round: 3 },
  { id: 'spend_6_production', text: 'Spend 6 resources in a single production', round: 4 },
  { id: 'control_5_planets', text: 'Control 5 planets', round: 5 },
  { id: 'two_techs_same_colour', text: 'Own 2 technologies of the same colour', round: 6 },
]

export const MANDATE = { id: 'first_strike' as const, text: 'First Strike: win a space combat in the Mecatol Rex system or in the enemy home system' }
```

```ts
// src/engine/setup.ts
import { FACTIONS } from '../data/factions'
import { SYSTEMS } from '../data/map'
import { PUBLIC_OBJECTIVES } from '../data/objectives'
import { mulberry32 } from './rng'
import type { GameConfig, GameState, Owner, Planet, Player, Seat, StrategyCardId, System, Unit, UnitType } from './types'

export const START_TOKENS = { tactic: 3, fleet: 3, strategy: 2 }
export const ALL_STRATEGY_CARDS: StrategyCardId[] = ['leadership', 'diplomacy', 'trade', 'warfare', 'technology', 'imperial']
export const REINFORCEMENTS: Record<UnitType, number> = { infantry: 12, fighter: 10, destroyer: 8, cruiser: 8, carrier: 4, dreadnought: 5, warsun: 2, flagship: 1, pds: 6, spacedock: 3 }

export const GUARDIAN_FLEETS: Partial<Record<UnitType, number>>[] = [
  { dreadnought: 1, cruiser: 1, destroyer: 1, fighter: 2 },
  { dreadnought: 2 },
  { carrier: 1, cruiser: 1, destroyer: 2, fighter: 2 },
  { dreadnought: 1, cruiser: 2 },
  { cruiser: 2, destroyer: 2, fighter: 4 },
  { carrier: 1, dreadnought: 1, fighter: 2 },
]

function makeUnit(state: { nextUnitId: number }, type: UnitType, owner: Owner): Unit {
  return { id: state.nextUnitId++, type, owner, damaged: false }
}

function makePlayer(seat: Seat, cfg: GameConfig['players'][number]): Player {
  const f = FACTIONS[cfg.faction]
  const reinforcements = { ...REINFORCEMENTS }
  for (const su of f.startingUnits) reinforcements[su.type] -= su.count
  return {
    seat, faction: cfg.faction, color: cfg.color, name: cfg.name, vp: 0,
    tokens: { ...START_TOKENS }, tradeGoods: 0, commodities: f.commodities,
    techs: [...f.startingTechs], strategyCards: [], passed: false,
    scoredObjectives: [], mandateScored: false, mandateEarnedThisRound: false,
    spentInOneProductionThisRound: 0, tradedThisRound: { west: false, east: false },
    inheritanceExhausted: false, shipyardUsed: false, reinforcements,
  }
}

export function createGame(config: GameConfig, seed: number): GameState {
  const counter = { nextUnitId: 1 }
  const systems: Record<string, System> = {}
  for (const def of SYSTEMS) {
    const planets: Planet[] = def.planets.map(p => ({ id: p.id, name: p.name, resources: p.resources, influence: p.influence, owner: def.home, exhausted: false, ground: [], structures: [] }))
    systems[def.id] = { id: def.id, name: def.name, planets, anomaly: def.anomaly, wormhole: def.wormhole, space: [], activatedBy: [] }
  }
  for (const seat of [0, 1] as Seat[]) {
    const home = SYSTEMS.find(s => s.home === seat)
    if (!home) throw new Error('missing home system')
    const sys = systems[home.id]
    for (const su of FACTIONS[config.players[seat].faction].startingUnits) {
      for (let i = 0; i < su.count; i++) {
        const unit = makeUnit(counter, su.type, seat)
        if (!su.planetId) { sys.space.push(unit); continue }
        const planet = sys.planets.find(p => p.id === su.planetId)
        if (!planet) throw new Error(`unknown planet ${su.planetId}`)
        if (su.type === 'infantry') planet.ground.push(unit); else planet.structures.push(unit)
      }
    }
  }
  const other: Seat = config.speaker === 0 ? 1 : 0
  const state: GameState = {
    version: 1, round: 1, phase: 'strategy', speaker: config.speaker, active: config.speaker,
    strategyPool: ALL_STRATEGY_CARDS.map(id => ({ id, bonus: 0 })),
    draft: [config.speaker, other, other, config.speaker],
    publicObjectives: [PUBLIC_OBJECTIVES[0].id],
    players: [makePlayer(0, config.players[0]), makePlayer(1, config.players[1])],
    systems, tactical: null, pendingSecondary: null,
    nextUnitId: counter.nextUnitId, guardianRolls: 0, winner: null, log: [],
  }
  return rollGuardianFleet(state, seed)
}

export function rollGuardianFleet(state: GameState, seed: number): GameState {
  const rng = mulberry32(seed)
  const fleet = GUARDIAN_FLEETS[Math.floor(rng() * GUARDIAN_FLEETS.length)]
  const counter = { nextUnitId: state.nextUnitId }
  const space: Unit[] = []
  for (const [type, n] of Object.entries(fleet) as [UnitType, number][]) for (let i = 0; i < n; i++) space.push(makeUnit(counter, type, 'guardian'))
  const mecatol = state.systems.mecatol
  const planet = mecatol.planets[0]
  const ground = [makeUnit(counter, 'infantry', 'guardian'), makeUnit(counter, 'infantry', 'guardian')]
  return {
    ...state,
    nextUnitId: counter.nextUnitId,
    guardianRolls: state.guardianRolls + 1,
    systems: { ...state.systems, mecatol: { ...mecatol, space, planets: [{ ...planet, ground, owner: null }] } },
    log: [...state.log, { t: 'info', text: `Guardian fleet: ${Object.entries(fleet).map(([t, n]) => `${n} ${t}`).join(', ')} and 2 infantry` }],
  }
}

export function unitsOf(state: GameState, owner: Owner): Unit[] {
  const out: Unit[] = []
  for (const sys of Object.values(state.systems)) {
    out.push(...sys.space.filter(u => u.owner === owner))
    for (const p of sys.planets) { out.push(...p.ground.filter(u => u.owner === owner)); out.push(...p.structures.filter(u => u.owner === owner)) }
  }
  return out
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/engine/setup.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/factions.ts src/data/objectives.ts src/engine/setup.ts src/engine/setup.test.ts
git commit -m "feat(engine): factions, objectives, game setup and guardian fleet"
```

---

### Task 6: Strategy phase, economy helpers, dispatcher and legal moves

**Files:**
- Create: `src/engine/economy.ts`
- Create: `src/engine/strategyPhase.ts`
- Create: `src/engine/legalMoves.ts`
- Create: `src/engine/index.ts`
- Test: `src/engine/economy.test.ts`, `src/engine/strategyPhase.test.ts`

**Interfaces:**
- Produces in `economy.ts`:
  ```ts
  export function readyResources(state: GameState, seat: Seat): number          // sum of resources of ready planets the seat controls
  export function payCost(state: GameState, seat: Seat, cost: number, planets: string[], tradeGoods: number): Result<GameState>
      // exhausts the given planets (must be ready, controlled) and spends trade goods; fails if the total is below cost; overpay is lost
  export function productionCost(units: Partial<Record<UnitType, number>>, owner: StatsOwner, sarween: boolean): number
      // sum over types of ceil(count / producedPerCost) * cost, minus 1 if sarween (min 0)
  export function productionLimit(state: GameState, seat: Seat, systemId: string): number
      // planet resources + dock production bonus for the dock in that system, 0 if no dock owned there
  export function fleetPoolLimit(player: Player): number                          // tokens.fleet, +2 for letnev (armada)
  export function nonFighterShips(units: Unit[]): number
  export function capacity(units: Unit[], owner: StatsOwner): number              // sum of capacity of ships
  ```
- Produces in `strategyPhase.ts`:
  ```ts
  export function pickStrategyCard(state: GameState, card: StrategyCardId): Result<GameState>
      // active must be draft[0]; card must be in the pool; player gains the card and its bonus trade goods; draft shifts;
      // when the draft is empty: the two remaining pool cards get bonus + 1, phase becomes 'action', active = player with the lowest card, both players' passed = false
  export function initiativeOrder(state: GameState): [Seat, Seat]
  ```
- Produces in `legalMoves.ts`:
  ```ts
  export function legalMoves(state: GameState): Move[]   // strategy phase: one pickStrategyCard per pool card for draft[0]; other phases: [] for now (later plans extend)
  export function validateMove(state: GameState, move: Move): Result<true>   // uses legalMoves for template moves
  ```
- Produces in `index.ts`:
  ```ts
  export function applyMove(state: GameState, move: Move, seed: number): Result<GameState>
      // appends { t: 'move', seat: state.active, move } to the log on success; dispatches by move.type; unknown or not-yet-implemented types return { ok: false, error: 'not implemented: <type>' }
  export { createGame } from './setup'
  export { legalMoves, validateMove } from './legalMoves'
  export type * from './types'
  ```
  Card initiative numbers: leadership 1, diplomacy 2, trade 5, warfare 6, technology 7, imperial 8 (`export const INITIATIVE: Record<StrategyCardId, number>` in `strategyPhase.ts`).

- [ ] **Step 1: Write the failing tests**

```ts
// src/engine/economy.test.ts
import { describe, expect, it } from 'vitest'
import { capacity, fleetPoolLimit, nonFighterShips, payCost, productionCost, productionLimit, readyResources } from './economy'
import { createGame } from './setup'
import type { GameConfig } from './types'

const config: GameConfig = { players: [{ faction: 'l1z1x', color: 'blue', name: 'A' }, { faction: 'letnev', color: 'red', name: 'B' }], speaker: 0 }

describe('R4.4 economy helpers', () => {
  const g = createGame(config, 1)
  it('ready resources sum controlled ready planets', () => {
    expect(readyResources(g, 0)).toBe(5)
    expect(readyResources(g, 1)).toBe(6)
  })
  it('payCost exhausts planets and spends trade goods, overpay is lost', () => {
    const withTg = { ...g, players: [{ ...g.players[1], tradeGoods: 3 }, g.players[1]] as typeof g.players }
    withTg.players[0] = g.players[0]
    const s = { ...g, players: [g.players[0], { ...g.players[1], tradeGoods: 3 }] as typeof g.players }
    const r = payCost(s, 1, 5, ['arc-prime'], 2)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.systems['home-s'].planets[0].exhausted).toBe(true)
    expect(r.value.players[1].tradeGoods).toBe(1)
    expect(g.systems['home-s'].planets[0].exhausted).toBe(false)
  })
  it('payCost fails when the payment is short or a planet is not ready', () => {
    expect(payCost(g, 1, 5, ['arc-prime'], 0).ok).toBe(false)
    const exhausted = payCost(g, 1, 4, ['arc-prime'], 0)
    if (!exhausted.ok) throw new Error(exhausted.error)
    expect(payCost(exhausted.value, 1, 1, ['arc-prime'], 0).ok).toBe(false)
    expect(payCost(g, 0, 1, ['arc-prime'], 0).ok).toBe(false)   // not controlled by seat 0
  })
  it('productionCost pairs fighters and infantry and applies Sarween Tools', () => {
    const owner = { faction: 'letnev' as const, techs: [] as string[] }
    expect(productionCost({ fighter: 2, infantry: 2, dreadnought: 1 }, owner, false)).toBe(6)
    expect(productionCost({ fighter: 3 }, owner, false)).toBe(2)
    expect(productionCost({ fighter: 1, cruiser: 1 }, owner, true)).toBe(2)
    expect(productionCost({}, owner, true)).toBe(0)
  })
  it('productionLimit is planet resources plus the dock bonus', () => {
    expect(productionLimit(g, 0, 'home-n')).toBe(7)
    expect(productionLimit(g, 1, 'home-s')).toBe(6)
    expect(productionLimit(g, 0, 'home-s')).toBe(0)
    const dock2 = { ...g, players: [{ ...g.players[0], techs: [...g.players[0].techs, 'space_dock_ii'] }, g.players[1]] as typeof g.players }
    expect(productionLimit(dock2, 0, 'home-n')).toBe(9)
  })
  it('fleet pool, non-fighter count and capacity', () => {
    expect(fleetPoolLimit(g.players[0])).toBe(3)
    expect(fleetPoolLimit(g.players[1])).toBe(5)
    expect(nonFighterShips(g.systems['home-n'].space)).toBe(2)
    expect(capacity(g.systems['home-n'].space, { faction: 'l1z1x', techs: [] })).toBe(6)   // super-dreadnought 2 + carrier 4
    expect(capacity(g.systems['home-s'].space, { faction: 'letnev', techs: [] })).toBe(5)   // dreadnought 1 + carrier 4
  })
})
```

```ts
// src/engine/strategyPhase.test.ts
import { describe, expect, it } from 'vitest'
import { applyMove, legalMoves } from './index'
import { createGame } from './setup'
import { INITIATIVE, initiativeOrder } from './strategyPhase'
import type { GameConfig, GameState } from './types'

const config: GameConfig = { players: [{ faction: 'l1z1x', color: 'blue', name: 'A' }, { faction: 'letnev', color: 'red', name: 'B' }], speaker: 0 }

function pick(state: GameState, card: Parameters<typeof applyMove>[1] extends infer M ? Extract<M, { type: 'pickStrategyCard' }>['card'] : never): GameState {
  const r = applyMove(state, { type: 'pickStrategyCard', card }, 0)
  if (!r.ok) throw new Error(r.error)
  return r.value
}

describe('R3.1 strategy phase', () => {
  it('initiative numbers are the printed ones', () => {
    expect(INITIATIVE).toEqual({ leadership: 1, diplomacy: 2, trade: 5, warfare: 6, technology: 7, imperial: 8 })
  })
  it('legal moves in the strategy phase are one pick per pool card for the drafting player', () => {
    const g = createGame(config, 1)
    expect(legalMoves(g)).toHaveLength(6)
    expect(legalMoves(g).every(m => m.type === 'pickStrategyCard')).toBe(true)
  })
  it('snake draft: speaker, other, other, speaker; wrong player or missing card is rejected', () => {
    const g = createGame(config, 1)
    expect(applyMove({ ...g, active: 1 }, { type: 'pickStrategyCard', card: 'trade' }, 0).ok).toBe(false)
    const s1 = pick(g, 'warfare')
    expect(s1.active).toBe(1); expect(s1.players[0].strategyCards).toEqual([{ id: 'warfare', used: false }])
    expect(applyMove(s1, { type: 'pickStrategyCard', card: 'warfare' }, 0).ok).toBe(false)
    const s2 = pick(s1, 'leadership'); expect(s2.active).toBe(1)
    const s3 = pick(s2, 'imperial'); expect(s3.active).toBe(0)
    const s4 = pick(s3, 'technology')
    expect(s4.phase).toBe('action')
    expect(s4.strategyPool.map(c => [c.id, c.bonus])).toEqual([['diplomacy', 1], ['trade', 1]])
    expect(s4.active).toBe(1)   // leadership 1 beats warfare 6
    expect(initiativeOrder(s4)).toEqual([1, 0])
    expect(s4.players[0].passed).toBe(false); expect(s4.players[1].passed).toBe(false)
    expect(s4.log.filter(e => e.t === 'move')).toHaveLength(4)
  })
  it('a picked card with bonus trade goods pays them out and resets the bonus', () => {
    const g = createGame(config, 1)
    const pool = g.strategyPool.map(c => c.id === 'trade' ? { ...c, bonus: 2 } : c)
    const s = pick({ ...g, strategyPool: pool }, 'trade')
    expect(s.players[0].tradeGoods).toBe(2)
    expect(s.strategyPool.find(c => c.id === 'trade')).toBeUndefined()
  })
  it('moves of other types are rejected in the strategy phase', () => {
    const g = createGame(config, 1)
    expect(applyMove(g, { type: 'pass' }, 0).ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/engine/economy.test.ts src/engine/strategyPhase.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement economy, strategy phase, legal moves and the dispatcher**

```ts
// src/engine/economy.ts
import { unitStats, type StatsOwner } from '../data/units'
import { NON_FIGHTER_SHIPS, isShip } from '../data/units'
import type { GameState, Player, Result, Seat, Unit, UnitType } from './types'

export function readyResources(state: GameState, seat: Seat): number {
  let sum = 0
  for (const sys of Object.values(state.systems)) for (const p of sys.planets) if (p.owner === seat && !p.exhausted) sum += p.resources
  return sum
}

export function payCost(state: GameState, seat: Seat, cost: number, planets: string[], tradeGoods: number): Result<GameState> {
  const player = state.players[seat]
  if (tradeGoods < 0 || tradeGoods > player.tradeGoods) return { ok: false, error: 'not enough trade goods' }
  let paid = tradeGoods
  const systems = { ...state.systems }
  for (const planetId of planets) {
    const sysId = Object.keys(systems).find(id => systems[id].planets.some(p => p.id === planetId))
    if (!sysId) return { ok: false, error: `unknown planet ${planetId}` }
    const sys = systems[sysId]
    const planet = sys.planets.find(p => p.id === planetId)
    if (!planet || planet.owner !== seat) return { ok: false, error: `planet ${planetId} not controlled` }
    if (planet.exhausted) return { ok: false, error: `planet ${planetId} is exhausted` }
    paid += planet.resources
    systems[sysId] = { ...sys, planets: sys.planets.map(p => p.id === planetId ? { ...p, exhausted: true } : p) }
  }
  if (paid < cost) return { ok: false, error: `paid ${paid} of ${cost}` }
  const players = [...state.players] as GameState['players']
  players[seat] = { ...player, tradeGoods: player.tradeGoods - tradeGoods }
  return { ok: true, value: { ...state, systems, players } }
}

export function productionCost(units: Partial<Record<UnitType, number>>, owner: StatsOwner, sarween: boolean): number {
  let cost = 0
  for (const [type, n] of Object.entries(units) as [UnitType, number][]) {
    if (!n) continue
    const s = unitStats(type, owner)
    cost += Math.ceil(n / s.producedPerCost) * s.cost
  }
  return sarween ? Math.max(0, cost - 1) : cost
}

export function productionLimit(state: GameState, seat: Seat, systemId: string): number {
  const player = state.players[seat]
  const sys = state.systems[systemId]
  if (!sys) return 0
  for (const p of sys.planets) {
    const dock = p.structures.find(u => u.type === 'spacedock' && u.owner === seat)
    if (dock) return p.resources + (unitStats('spacedock', { faction: player.faction, techs: player.techs }).production ?? 0)
  }
  return 0
}

export function fleetPoolLimit(player: Player): number {
  return player.tokens.fleet + (player.faction === 'letnev' ? 2 : 0)
}

export function nonFighterShips(units: Unit[]): number {
  return units.filter(u => NON_FIGHTER_SHIPS.includes(u.type)).length
}

export function capacity(units: Unit[], owner: StatsOwner): number {
  return units.filter(u => isShip(u.type)).reduce((sum, u) => sum + unitStats(u.type, owner).capacity, 0)
}
```

```ts
// src/engine/strategyPhase.ts
import type { GameState, Result, Seat, StrategyCardId } from './types'

export const INITIATIVE: Record<StrategyCardId, number> = { leadership: 1, diplomacy: 2, trade: 5, warfare: 6, technology: 7, imperial: 8 }

export function initiativeOrder(state: GameState): [Seat, Seat] {
  const lowest = (seat: Seat) => Math.min(...state.players[seat].strategyCards.map(c => INITIATIVE[c.id]))
  return lowest(0) <= lowest(1) ? [0, 1] : [1, 0]
}

export function pickStrategyCard(state: GameState, card: StrategyCardId): Result<GameState> {
  if (state.phase !== 'strategy') return { ok: false, error: 'not in the strategy phase' }
  const seat = state.draft[0]
  if (seat === undefined || seat !== state.active) return { ok: false, error: 'not this player\'s pick' }
  const entry = state.strategyPool.find(c => c.id === card)
  if (!entry) return { ok: false, error: `card ${card} is not available` }
  const players = [...state.players] as GameState['players']
  const player = players[seat]
  players[seat] = { ...player, strategyCards: [...player.strategyCards, { id: card, used: false }], tradeGoods: player.tradeGoods + entry.bonus }
  const draft = state.draft.slice(1)
  let strategyPool = state.strategyPool.filter(c => c.id !== card)
  let next: GameState = { ...state, players, draft, strategyPool, active: draft[0] ?? state.active }
  if (draft.length === 0) {
    strategyPool = strategyPool.map(c => ({ ...c, bonus: c.bonus + 1 }))
    const order = initiativeOrder(next)
    next = { ...next, strategyPool, phase: 'action', active: order[0], players: [{ ...next.players[0], passed: false }, { ...next.players[1], passed: false }] }
  }
  return { ok: true, value: next }
}
```

```ts
// src/engine/legalMoves.ts
import type { GameState, Move, Result } from './types'

export function legalMoves(state: GameState): Move[] {
  if (state.winner !== null) return []
  if (state.phase === 'strategy') {
    const seat = state.draft[0]
    if (seat === undefined || seat !== state.active) return []
    return state.strategyPool.map(c => ({ type: 'pickStrategyCard', card: c.id }))
  }
  return []   // action and status phase moves are added by later plans
}

export function validateMove(state: GameState, move: Move): Result<true> {
  const ok = legalMoves(state).some(m => JSON.stringify(m) === JSON.stringify(move))
  return ok ? { ok: true, value: true } : { ok: false, error: `illegal move ${move.type}` }
}
```

```ts
// src/engine/index.ts
import { pickStrategyCard } from './strategyPhase'
import type { GameState, Move, Result } from './types'

export function applyMove(state: GameState, move: Move, seed: number): Result<GameState> {
  void seed   // used by later plans for dice
  if (state.winner !== null) return { ok: false, error: 'game over' }
  let result: Result<GameState>
  switch (move.type) {
    case 'pickStrategyCard': result = pickStrategyCard(state, move.card); break
    default: result = { ok: false, error: `not implemented: ${move.type}` }
  }
  if (!result.ok) return result
  return { ok: true, value: { ...result.value, log: [...result.value.log, { t: 'move', seat: state.active, move }] } }
}

export { createGame } from './setup'
export { legalMoves, validateMove } from './legalMoves'
export type * from './types'
```

- [ ] **Step 4: Run all tests to verify they pass**

Run: `npm test`
Expected: PASS, all suites (units, rng, adjacency, research, setup, economy, strategyPhase).

- [ ] **Step 5: Type-check, lint and commit**

Run: `npx tsc -p tsconfig.app.json --noEmit && npm run lint`
Expected: no errors (fix unused imports if the linter complains).

```bash
git add src/engine/economy.ts src/engine/strategyPhase.ts src/engine/legalMoves.ts src/engine/index.ts src/engine/economy.test.ts src/engine/strategyPhase.test.ts
git commit -m "feat(engine): economy helpers, strategy phase draft, legal moves and applyMove dispatcher"
```

---

## Self-review notes

- Spec coverage of this plan: R1 (map, adjacency, anomaly flags, wormholes, trade post links), R2 (setup), R3.1 (strategy phase), R4.2 (guardian fleet table and rolling), R4.4 cost and limit helpers, R5 (tech table and prerequisites), R7 (objective ids). Not covered here, by design: tactical actions and combat (plan 2), strategic actions, trade posts, status phase and victory (plan 3).
- Type consistency: `StatsOwner` is exported from `src/data/units.ts` and reused by `economy.ts`; `Result` and `GameState` come from `types.ts`; `INITIATIVE` lives in `strategyPhase.ts`.
- Known simplification: `validateMove` compares JSON; fine while moves are small, replace with structural checks when tactical moves arrive.
