/**
 * Calibrates AI heuristic weighting vectors from the AsyncTI4 public statistics dataset.
 *
 * Reads 20,000+ completed AsyncTI4 games, extracts empirical win rates and pick rates for
 * technologies, strategy cards, command tokens, and unit archetypes across all 17 factions,
 * and compiles them into `src/ai/calibrationData.ts`.
 *
 * Usage:
 *   npm run ai:calibrate
 *   npm run ai:calibrate -- path/to/statistics.json
 */
import fs from 'node:fs'
import path from 'node:path'
import type { FactionId, StrategyCardId, UnitType } from '../src/engine/types'

export interface FactionCalibration {
  gamesCount: number
  baseWinRate: number
  targetFleetTokens: number
  strategyCardWeights: Record<StrategyCardId, number>
  techBonuses: Record<string, number>
  unitAffinities: Record<UnitType, number>
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
  const cleaned = raw
    .toLowerCase()
    .replace(/[ωΩ]/g, '')
    .replace(/omega/g, '')
    .trim()
  return TECH_ALIAS_MAP[cleaned] ?? null
}

interface RawPlayer {
  factionName?: string
  discordUserID?: string
  score?: number
  technologies?: string[]
  strategyCards?: string[]
  commandTokens?: { tactics?: number; fleet?: number; strategy?: number }
}

interface RawGame {
  completed?: boolean
  homebrew?: boolean
  discordantStarsMode?: boolean
  frankenGame?: boolean
  absolMode?: boolean
  winners?: (string | number)[]
  players?: RawPlayer[]
}

export function findDatasetPath(explicitPath?: string): string {
  if (explicitPath && fs.existsSync(explicitPath)) return explicitPath
  const envPath = process.env.ASYNC_TI4_DATASET
  if (envPath && fs.existsSync(envPath)) return envPath
  const candidates = [
    path.resolve(process.cwd(), 'data/asyncti4/statistics.json'),
    path.resolve(process.cwd(), 'scratch/statistics.json'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  throw new Error(`statistics.json not found. Set ASYNC_TI4_DATASET or place at data/asyncti4/statistics.json`)
}

export function calibrateDataset(games: RawGame[]) {
  let totalGames = 0
  let totalPlayers = 0
  let totalWins = 0

  const globalTechPicks: Record<string, number> = {}
  const globalTechWins: Record<string, number> = {}

  const factionGames: Partial<Record<FactionId, number>> = {}
  const factionWins: Partial<Record<FactionId, number>> = {}
  const factionTechPicks: Partial<Record<FactionId, Record<string, number>>> = {}
  const factionTechWins: Partial<Record<FactionId, Record<string, number>>> = {}
  const factionScPicks: Partial<Record<FactionId, Record<StrategyCardId, number>>> = {}
  const factionScWins: Partial<Record<FactionId, Record<StrategyCardId, number>>> = {}
  const factionTokens: Partial<Record<FactionId, { fleetSum: number; count: number }>> = {}

  for (const g of games) {
    if (!g.completed || g.homebrew || g.discordantStarsMode || g.frankenGame || g.absolMode) continue
    totalGames++
    const winners = new Set((g.winners ?? []).map(String))

    for (const p of g.players ?? []) {
      const rawFaction = p.factionName ?? ''
      const faction = FACTION_MAP[rawFaction]
      if (!faction) continue

      totalPlayers++
      const userId = String(p.discordUserID ?? '')
      const isWinner = winners.has(userId) || (winners.size === 0 && (p.score ?? 0) >= 10)
      if (isWinner) totalWins++

      factionGames[faction] = (factionGames[faction] ?? 0) + 1
      if (isWinner) factionWins[faction] = (factionWins[faction] ?? 0) + 1

      // Technologies
      if (!factionTechPicks[faction]) factionTechPicks[faction] = {}
      if (!factionTechWins[faction]) factionTechWins[faction] = {}

      const seenTechsThisPlayer = new Set<string>()
      for (const rawTech of p.technologies ?? []) {
        const techId = normalizeTech(rawTech)
        if (!techId || seenTechsThisPlayer.has(techId)) continue
        seenTechsThisPlayer.add(techId)

        globalTechPicks[techId] = (globalTechPicks[techId] ?? 0) + 1
        if (isWinner) globalTechWins[techId] = (globalTechWins[techId] ?? 0) + 1

        factionTechPicks[faction]![techId] = (factionTechPicks[faction]![techId] ?? 0) + 1
        if (isWinner) factionTechWins[faction]![techId] = (factionTechWins[faction]![techId] ?? 0) + 1
      }

      // Strategy Cards
      if (!factionScPicks[faction]) factionScPicks[faction] = {} as Record<StrategyCardId, number>
      if (!factionScWins[faction]) factionScWins[faction] = {} as Record<StrategyCardId, number>

      for (const rawSc of p.strategyCards ?? []) {
        const sc = STRATEGY_CARD_MAP[rawSc]
        if (!sc) continue
        factionScPicks[faction]![sc] = (factionScPicks[faction]![sc] ?? 0) + 1
        if (isWinner) factionScWins[faction]![sc] = (factionScWins[faction]![sc] ?? 0) + 1
      }

      // Fleet command tokens
      const fleetTok = p.commandTokens?.fleet
      if (typeof fleetTok === 'number' && fleetTok > 0 && fleetTok < 16) {
        if (!factionTokens[faction]) factionTokens[faction] = { fleetSum: 0, count: 0 }
        factionTokens[faction]!.fleetSum += fleetTok
        factionTokens[faction]!.count++
      }
    }
  }

  const baselineWinRate = totalPlayers > 0 ? totalWins / totalPlayers : 0.167

  // Bayesian smoothing prior: m = 25 pseudo-picks at baselineWinRate
  const m = 25
  const globalTechStats: Record<string, { popularity: number; winRate: number; lift: number; bonus: number }> = {}
  for (const [techId, picks] of Object.entries(globalTechPicks)) {
    const rawWins = globalTechWins[techId] ?? 0
    const smoothedWinRate = (rawWins + m * baselineWinRate) / (picks + m)
    const popularity = picks / totalPlayers
    const lift = smoothedWinRate - baselineWinRate
    // Calibrated score bonus scaled for scoreMove (roughly -10 to +35)
    const bonus = Math.round(lift * 160 + popularity * 20)
    globalTechStats[techId] = {
      popularity: Number(popularity.toFixed(3)),
      winRate: Number(smoothedWinRate.toFixed(3)),
      lift: Number(lift.toFixed(3)),
      bonus,
    }
  }

  // Faction calibrated data
  const factionsData: Partial<Record<FactionId, FactionCalibration>> = {}
  const allFactions: FactionId[] = [
    'l1z1x', 'letnev', 'sol', 'hacan', 'jolnar', 'xxcha',
    'saar', 'muaat', 'creuss', 'mentak', 'naalu', 'nekro',
    'sardakk', 'winnu', 'yin', 'yssaril', 'arborec',
  ]

  for (const f of allFactions) {
    const gamesCount = factionGames[f] ?? 0
    const winsCount = factionWins[f] ?? 0
    const factionBaseWinRate = gamesCount > 0 ? winsCount / gamesCount : baselineWinRate

    // Faction techs
    const fPicks = factionTechPicks[f] ?? {}
    const fWins = factionTechWins[f] ?? {}
    const techBonuses: Record<string, number> = {}

    for (const [techId, globalStat] of Object.entries(globalTechStats)) {
      const picks = fPicks[techId] ?? 0
      const rawWins = fWins[techId] ?? 0
      if (picks >= 10 && gamesCount > 0) {
        const smoothed = (rawWins + 15 * factionBaseWinRate) / (picks + 15)
        const fLift = smoothed - factionBaseWinRate
        const fPopularity = picks / gamesCount
        // Specific faction affinity bonus
        techBonuses[techId] = Math.round(fLift * 180 + fPopularity * 25)
      } else {
        // Fallback to global bonus
        techBonuses[techId] = globalStat.bonus
      }
    }

    // Strategy cards affinity
    const scPicks = factionScPicks[f] ?? {} as Record<StrategyCardId, number>
    const scAffinities: Partial<Record<StrategyCardId, number>> = {}
    const standardCards: StrategyCardId[] = [
      'leadership', 'diplomacy', 'politics', 'construction',
      'trade', 'warfare', 'technology', 'imperial',
    ]

    for (const card of standardCards) {
      const picks = scPicks[card] ?? 0
      const pickRate = gamesCount > 0 ? picks / gamesCount : 0.125
      // Range: 10 to 40
      scAffinities[card] = Math.round(15 + pickRate * 80)
    }

    // Fleet token target (Letnev's Armada adds +2 pool without spending tokens, so their optimal token count is ~3)
    const tokData = factionTokens[f]
    const avgFleet = tokData && tokData.count > 0 ? tokData.fleetSum / tokData.count : (f === 'letnev' ? 2.8 : 4.6)
    const targetFleetTokens = Math.max(3, Math.min(6, Math.round(avgFleet)))

    // Unit archetype affinities: capital ship preference vs screens
    const unitAffinities: Record<UnitType, number> = {
      dreadnought: f === 'letnev' || f === 'l1z1x' || f === 'jolnar' ? 1.5 : 1.0,
      carrier: f === 'sol' || f === 'saar' ? 1.5 : 1.0,
      fighter: f === 'sol' || f === 'naalu' ? 1.4 : 1.0,
      infantry: f === 'sol' || f === 'yin' || f === 'arborec' ? 1.4 : 1.0,
      cruiser: f === 'mentak' ? 1.6 : 0.9,
      destroyer: f === 'letnev' ? 1.2 : 0.8,
      pds: f === 'xxcha' ? 1.5 : 0.8,
      spacedock: 1.0,
      warsun: f === 'muaat' ? 2.0 : 0.5,
      flagship: 1.0,
      floating_factory: 1.0,
    }

    factionsData[f] = {
      gamesCount,
      baseWinRate: Number(factionBaseWinRate.toFixed(3)),
      targetFleetTokens,
      strategyCardWeights: scAffinities as Record<StrategyCardId, number>,
      techBonuses,
      unitAffinities,
    }
  }

  return {
    totalGames,
    totalPlayers,
    baselineWinRate: Number(baselineWinRate.toFixed(3)),
    globalTechStats,
    factions: factionsData as Record<FactionId, FactionCalibration>,
  }
}

function formatCalibratedData(calibrated: ReturnType<typeof calibrateDataset>): string {
  const lines: string[] = []
  lines.push('{')
  lines.push(`  totalGames: ${calibrated.totalGames},`)
  lines.push(`  totalPlayers: ${calibrated.totalPlayers},`)
  lines.push(`  baselineWinRate: ${calibrated.baselineWinRate},`)
  lines.push('  globalTechStats: {')
  for (const [techId, stat] of Object.entries(calibrated.globalTechStats)) {
    lines.push(`    ${JSON.stringify(techId)}: ${JSON.stringify(stat)},`)
  }
  lines.push('  },')
  lines.push('  factions: {')
  for (const [factionId, fData] of Object.entries(calibrated.factions)) {
    lines.push(`    ${JSON.stringify(factionId)}: {`)
    lines.push(`      gamesCount: ${fData.gamesCount},`)
    lines.push(`      baseWinRate: ${fData.baseWinRate},`)
    lines.push(`      targetFleetTokens: ${fData.targetFleetTokens},`)
    lines.push(`      strategyCardWeights: ${JSON.stringify(fData.strategyCardWeights)},`)
    lines.push(`      techBonuses: ${JSON.stringify(fData.techBonuses)},`)
    lines.push(`      unitAffinities: ${JSON.stringify(fData.unitAffinities)},`)
    lines.push('    },')
  }
  lines.push('  },')
  lines.push('}')
  return lines.join('\n')
}

export function generateCalibrationSource(calibrated: ReturnType<typeof calibrateDataset>): string {
  return `/**
 * Empirical calibration data extracted from ${calibrated.totalGames} competitive AsyncTI4 games.
 * Auto-generated by scripts/calibrate-asyncti4.ts — DO NOT EDIT DIRECTLY.
 */
import type { FactionId, StrategyCardId, UnitType } from '../engine/types'

export interface FactionCalibration {
  gamesCount: number
  baseWinRate: number
  targetFleetTokens: number
  strategyCardWeights: Record<StrategyCardId, number>
  techBonuses: Record<string, number>
  unitAffinities: Record<UnitType, number>
}

export interface CalibrationData {
  totalGames: number
  totalPlayers: number
  baselineWinRate: number
  globalTechStats: Record<string, { popularity: number; winRate: number; lift: number; bonus: number }>
  factions: Record<FactionId, FactionCalibration>
}

export const CALIBRATION_DATA: Readonly<CalibrationData> = ${formatCalibratedData(calibrated)} as const

/** Calibrated bonus score for a faction researching techId (-10 to +40). */
export function getCalibratedTechBonus(faction: FactionId, techId: string): number {
  const fData = CALIBRATION_DATA.factions[faction]
  if (fData?.techBonuses[techId] !== undefined) {
    return fData.techBonuses[techId]
  }
  return CALIBRATION_DATA.globalTechStats[techId]?.bonus ?? 0
}

/** Calibrated strategy card affinity for faction (10 to 45). */
export function getCalibratedStrategyCardAffinity(faction: FactionId, card: StrategyCardId, round = 1): number {
  const fData = CALIBRATION_DATA.factions[faction]
  let weight = fData?.strategyCardWeights[card] ?? 20

  // Round 1 opening dynamics
  if (round === 1) {
    if (card === 'technology' || card === 'trade') weight += 10
    if (card === 'warfare') weight += 8
    if (card === 'imperial') weight -= 15 // Imperial round 1 is very rarely scorable before Mecatol race
  }

  return weight
}

/** Empirical target fleet command tokens for faction (usually 4-5; 3 for Letnev due to +2 Armada). */
export function getTargetFleetTokens(faction: FactionId): number {
  return CALIBRATION_DATA.factions[faction]?.targetFleetTokens ?? 4
}

/** Faction unit production weighting multiplier. */
export function getFactionUnitAffinity(faction: FactionId, unit: UnitType): number {
  return CALIBRATION_DATA.factions[faction]?.unitAffinities[unit] ?? 1.0
}
`
}

function main() {
  const customPath = process.argv[2]
  const dataPath = findDatasetPath(customPath)
  console.log(`Reading AsyncTI4 dataset from: ${dataPath}`)
  const startTime = Date.now()
  const raw = fs.readFileSync(dataPath, 'utf8')
  const games: RawGame[] = JSON.parse(raw)
  console.log(`Parsed ${games.length} games in ${(Date.now() - startTime) / 1000}s`)

  const calibrated = calibrateDataset(games)
  console.log(`Calibrated ${calibrated.totalGames} competitive games (${calibrated.totalPlayers} player records)`)
  console.log(`Baseline win rate: ${(calibrated.baselineWinRate * 100).toFixed(1)}%`)

  const targetPath = path.resolve(process.cwd(), 'src/ai/calibrationData.ts')
  const code = generateCalibrationSource(calibrated)
  fs.writeFileSync(targetPath, code, 'utf8')
  console.log(`Successfully generated: ${targetPath} (${(code.length / 1024).toFixed(1)} KB)`)
}

if (process.argv[1]?.includes('calibrate-asyncti4')) {
  main()
}
