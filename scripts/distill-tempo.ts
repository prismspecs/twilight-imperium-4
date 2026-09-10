/**
 * Distills per-faction tempo and opening strategies from AsyncTI4 per-move records.
 *
 * Reads NDJSON from the extractor (data/asyncti4/dataset/*.ndjson), reconstructs
 * per-game outcomes (winner from GAME_ENDED), and computes per-faction:
 *   - Tech order preferences (which techs researched 1st/2nd/3rd)
 *   - Round 1 strategy card pick distribution
 *   - Expansion vs conflict ratio (tactical actions without combat)
 *
 * Outputs `src/ai/tempoData.ts` with `FactionTempo` calibration data.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { FactionId, StrategyCardId } from '../src/engine/types'

export interface FactionTempo {
  gamesCount: number
  gamesWon: number
  techOrder: { first: string[]; second: string[]; third: string[] }
  round1ScTop: string[]
  expansionRatio: number
  aggression: number
  avgResearchRound: number
}

const FACTION_MAP: Record<string, FactionId> = {
  'The Federation of Sol': 'sol',
  'The Barony of Letnev': 'letnev',
  'The Emirates of Hacan': 'hacan',
  'The Universities of Jol-Nar': 'jolnar',
  'The L1Z1X Mindnet': 'l1z1x',
  'The Xxcha Kingdom': 'xxcha',
  'The Clan of Saar': 'saar',
  'The Embers of Muaat': 'muaat',
  'The Ghosts of Creuss': 'creuss',
  'The Mentak Coalition': 'mentak',
  'The Naalu Collective': 'naalu',
  'The Nekro Virus': 'nekro',
  'Sardakk Norr': 'sardakk',
  'The Winnu': 'winnu',
  'The Yin Brotherhood': 'yin',
  'The Yssaril Tribes': 'yssaril',
  'The Arborec': 'arborec',
}

const STRATEGY_CARD_MAP: Record<string, StrategyCardId> = {
  Imperial: 'imperial',
  Leadership: 'leadership',
  Politics: 'politics',
  Diplomacy: 'diplomacy',
  Warfare: 'warfare',
  Technology: 'technology',
  Construction: 'construction',
  Trade: 'trade',
}

// Tech aliases to normalize (matches calibrate-asyncti4.ts)
const TECH_ALIAS_MAP: Record<string, string> = {
  'antimass deflectors': 'antimass_deflectors',
  'gravity drive': 'gravity_drive',
  'fleet logistics': 'fleet_logistics',
  'light/wave deflector': 'light_wave_deflector',
  'light-wave deflector': 'light_wave_deflector',
  'plasma scoring': 'plasma_scoring',
  'magen defense grid': 'magen_defense_grid',
  'duranium armor': 'duranium_armor',
  'assault cannon': 'assault_cannon',
  'neural motivator': 'neural_motivator',
  'dacxive animators': 'dacxive_animators',
  'hyper metabolism': 'hyper_metabolism',
  'x-89 bacterial weapon': 'x89_bacterial_weapon',
  'sarween tools': 'sarween_tools',
  'graviton laser system': 'graviton_laser_system',
  'transit diodes': 'transit_diodes',
  'integrated economy': 'integrated_economy',
  'infantry ii': 'infantry_ii',
  'spec ops ii': 'infantry_ii',
  'crimson legionnaire ii': 'infantry_ii',
  'fighter ii': 'fighter_ii',
  'hybrid crystal fighter ii': 'fighter_ii',
  'destroyer ii': 'destroyer_ii',
  'strike wing alpha ii': 'destroyer_ii',
  'cruiser ii': 'cruiser_ii',
  'carrier ii': 'carrier_ii',
  'advanced carrier ii': 'carrier_ii',
  'dreadnought ii': 'dreadnought_ii',
  'exotrireme ii': 'dreadnought_ii',
  'space dock ii': 'space_dock_ii',
  'floating factory ii': 'space_dock_ii',
  'dimensional tear ii': 'space_dock_ii',
  'inheritance systems': 'inheritance_systems',
  'super dreadnought ii': 'super_dreadnought_ii',
  'super-dreadnought ii': 'super_dreadnought_ii',
  'l4 disruptors': 'l4_disruptors',
  'non-euclidean shielding': 'non_euclidean_shielding',
}

function normalizeTech(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null
  const cleaned = raw.toLowerCase().replace(/[ωΩ]/g, '').replace(/omega/g, '').trim()
  return TECH_ALIAS_MAP[cleaned] ?? null
}

function normalizeFaction(raw: string): FactionId | null {
  return FACTION_MAP[raw] ?? null
}

function normalizeStrategyCard(raw: string): StrategyCardId | null {
  return STRATEGY_CARD_MAP[raw] ?? null
}

// Stats per faction
interface FactionStats {
  games: number
  wins: number
  techFirst: Record<string, number>
  techSecond: Record<string, number>
  techThird: Record<string, number>
  round1Sc: Record<string, number>
  tacticalActions: number
  expansionActions: number
  combatActions: number
  totalResearchRound: number
  researchCount: number
}

interface GameResult {
  winner: string | null // faction string from AsyncTI4
  players: Map<string, {
    faction: string
    techs: string[]
    round1Sc: string[]
    tacticalActions: { combat: boolean }[]
  }>
}

function findDatasetPath(): string {
  const envPath = process.env.ASYNC_TI4_DATASET
  if (envPath && fs.existsSync(envPath)) return envPath
  const candidates = [
    path.resolve(process.cwd(), 'data/asyncti4/dataset'),
    path.resolve(process.cwd(), 'scratch/dataset'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  throw new Error(`Dataset dir not found. Set ASYNC_TI4_DATASET or place dataset at data/asyncti4/dataset`)
}

function isWinningFaction(game: GameResult, faction: string): boolean {
  if (!game.winner) return false
  // winner can be faction string or user ID; AsyncTI4 uses faction in GAME_ENDED.payload.winner
  if (typeof game.winner === 'string') return game.winner === faction
  return false
}

function processDataset(datasetDir: string): Map<string, FactionStats> {
  const stats: Map<string, FactionStats> = new Map()
  const gameFiles = fs.readdirSync(datasetDir).filter((f) => f.endsWith('.ndjson'))
  let processed = 0

  for (const file of gameFiles) {
    const filePath = path.join(datasetDir, file)
    const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n').filter((l) => l.trim())
    if (lines.length === 0) continue

    // First pass: collect game metadata (winner, per-player state)
    let gameWinner: string | null = null
    const playerState = new Map<string, {
      faction: string
      techs: string[]
      round1Sc: string[]
      tacticalActions: { combat: boolean }[]
    }>()

    for (const line of lines) {
      const r = JSON.parse(line)
      if (r.gameWinner) gameWinner = r.gameWinner
      if (r.faction && r.archetype === 'GAME_ENDED') {
        // Already set from gameWinner field, but fallback
        gameWinner = r.faction
      }
      if (r.archetype === 'GAME_ENDED' && r.payload?.winner) {
        gameWinner = Array.isArray(r.payload.winner) ? r.payload.winner[0] ?? null : r.payload.winner
      }
      if (r.faction && r.archetype === 'TECH_RESEARCHED') {
        // Collect tech order
        const factionId = normalizeFaction(r.faction)
        if (factionId) {
          if (!playerState.has(factionId)) {
            playerState.set(factionId, { faction: r.faction, techs: [], round1Sc: [], tacticalActions: [] })
          }
          const techId = normalizeTech(r.payload?.tech)
          if (techId) {
            const s = playerState.get(factionId)!
            s.techs.push(techId)
          }
        }
      }
      if (r.faction && r.archetype === 'SC_PICKED' && r.round === 1) {
        const factionId = normalizeFaction(r.faction)
        if (factionId) {
          if (!playerState.has(factionId)) {
            playerState.set(factionId, { faction: r.faction, techs: [], round1Sc: [], tacticalActions: [] })
          }
          const scId = normalizeStrategyCard(r.payload?.strategyCard)
          if (scId) {
            const s = playerState.get(factionId)!
            s.round1Sc.push(scId)
          }
        }
      }
      if (r.faction && r.archetype === 'TACTICAL_ACTION') {
        const factionId = normalizeFaction(r.faction)
        if (factionId) {
          if (!playerState.has(factionId)) {
            playerState.set(factionId, { faction: r.faction, techs: [], round1Sc: [], tacticalActions: [] })
          }
          const s = playerState.get(factionId)!
          const combat = (r.payload?.planetsTaken && r.payload.planetsTaken.length > 0) || (r.payload?.spaceBattle && r.payload.spaceBattle === true)
          s.tacticalActions.push({ combat })
        }
      }
    }

    // Skip games without winner signal (stalled/abandoned)
    if (!gameWinner) continue

    const result: GameResult = { winner: gameWinner, players: playerState }
    processed++

    // Aggregate per-faction stats
    for (const [factionId, p] of playerState) {
      if (!stats.has(factionId)) {
        stats.set(factionId, {
          games: 0,
          wins: 0,
          techFirst: {},
          techSecond: {},
          techThird: {},
          round1Sc: {},
          tacticalActions: 0,
          expansionActions: 0,
          combatActions: 0,
          totalResearchRound: 0,
          researchCount: 0,
        })
      }
      const s = stats.get(factionId)!
      s.games++
      if (isWinningFaction(result, p.faction)) s.wins++
      // Tech order (first 3)
      if (p.techs.length >= 1) {
        const t1 = p.techs[0]
        s.techFirst[t1] = (s.techFirst[t1] ?? 0) + 1
      }
      if (p.techs.length >= 2) {
        const t2 = p.techs[1]
        s.techSecond[t2] = (s.techSecond[t2] ?? 0) + 1
      }
      if (p.techs.length >= 3) {
        const t3 = p.techs[2]
        s.techThird[t3] = (s.techThird[t3] ?? 0) + 1
      }
      // Round 1 SC
      for (const sc of p.round1Sc) {
        s.round1Sc[sc] = (s.round1Sc[sc] ?? 0) + 1
      }
      // Expansion vs combat
      for (const t of p.tacticalActions) {
        s.tacticalActions++
        if (t.combat) s.combatActions++
        else s.expansionActions++
      }
    }
  }

  console.log(`Processed ${processed} games with winner signal`)
  return stats
}

function buildTempoData(stats: Map<string, FactionStats>): Record<string, FactionTempo> {
  const result: Record<string, FactionTempo> = {}

  for (const [factionId, s] of stats) {
    const topN = (map: Record<string, number>, n: number): string[] =>
      Object.entries(map)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([k]) => k)

    const avgRound = s.researchCount > 0 ? s.totalResearchRound / s.researchCount : 0
    const totalTactical = s.tacticalActions > 0 ? s.tacticalActions : 1
    const expansionRatio = s.expansionActions / totalTactical
    const aggression = s.combatActions / totalTactical

    result[factionId] = {
      gamesCount: s.games,
      gamesWon: s.wins,
      techOrder: {
        first: topN(s.techFirst, 5),
        second: topN(s.techSecond, 5),
        third: topN(s.techThird, 5),
      },
      round1ScTop: topN(s.round1Sc, 4),
      expansionRatio: Number(expansionRatio.toFixed(3)),
      aggression: Number(aggression.toFixed(3)),
      avgResearchRound: Number(avgRound.toFixed(2)),
    }
  }

  return result
}

function formatTempoData(data: Record<string, FactionTempo>): string {
  const lines: string[] = []
  lines.push('{')
  for (const [factionId, d] of Object.entries(data)) {
    lines.push(`  ${JSON.stringify(factionId)}: {`)
    lines.push(`    gamesCount: ${d.gamesCount},`)
    lines.push(`    gamesWon: ${d.gamesWon},`)
    lines.push(`    techOrder: { first: ${JSON.stringify(d.techOrder.first)}, second: ${JSON.stringify(d.techOrder.second)}, third: ${JSON.stringify(d.techOrder.third)} },`)
    lines.push(`    round1ScTop: ${JSON.stringify(d.round1ScTop)},`)
    lines.push(`    expansionRatio: ${d.expansionRatio.toFixed(3)},`)
    lines.push(`    aggression: ${d.aggression.toFixed(3)},`)
    lines.push(`    avgResearchRound: ${d.avgResearchRound.toFixed(2)},`)
    lines.push('  },')
  }
  lines.push('}')
  return lines.join('\n')
}

function generateSource(tempo: Record<string, FactionTempo>): string {
  const techOrderType = '{ first: string[]; second: string[]; third: string[] }'
  return `/**
 * Per-faction tempo and opening strategies distilled from AsyncTI4 per-move records.
 * Auto-generated by scripts/distill-tempo.ts — DO NOT EDIT DIRECTLY.
 */
import type { FactionId, StrategyCardId } from '../engine/types'

export interface FactionTempo {
  gamesCount: number
  gamesWon: number
  techOrder: ${techOrderType}
  round1ScTop: string[]
  expansionRatio: number
  aggression: number
  avgResearchRound: number
}

export interface TempoData {
  [faction: string]: FactionTempo
}

export const TEMPORAL_DATA: Readonly<TempoData> = ${formatTempoData(tempo)} as const

/** Tech order preference for faction (top N picks for position). */
export function getTechOrderPreference(faction: FactionId, position: 1 | 2 | 3, n: number = 3): string[] {
  const t = TEMPORAL_DATA[faction]?.techOrder
  if (!t) return []
  if (position === 1) return t.first.slice(0, n)
  if (position === 2) return t.second.slice(0, n)
  return t.third.slice(0, n)
}

/** Round 1 strategy card top picks for faction. */
export function getRound1ScTop(faction: FactionId, n: number = 3): string[] {
  return TEMPORAL_DATA[faction]?.round1ScTop?.slice(0, n) ?? []
}

/** Expansion vs conflict ratio (0=aggressive, 1=expansive). */
export function getExpansionRatio(faction: FactionId): number {
  return TEMPORAL_DATA[faction]?.expansionRatio ?? 0.5
}

/** Aggression ratio (fraction of tactical actions that are combat). */
export function getAggression(faction: FactionId): number {
  return TEMPORAL_DATA[faction]?.aggression ?? 0.5
}
`
}

function main() {
  const datasetDir = findDatasetPath()
  console.log(`Reading AsyncTI4 dataset from: ${datasetDir}`)
  const startTime = Date.now()

  const stats = processDataset(datasetDir)
  console.log(`Collected stats for ${stats.size} factions from ${Date.now() - startTime}ms`)

  const tempo = buildTempoData(stats)
  const source = generateSource(tempo)
  const targetPath = path.resolve(process.cwd(), 'src/ai/tempoData.ts')
  fs.writeFileSync(targetPath, source, 'utf8')
  console.log(`Successfully generated: ${targetPath} (${(source.length / 1024).toFixed(1)} KB)`)
}

if (process.argv[1]?.includes('distill-tempo')) main()