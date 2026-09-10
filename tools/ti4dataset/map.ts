/**
 * Milestone 2: map decoded AsyncTI4 events onto this repo's action vocabulary.
 *
 * Each record's `event` becomes a `NormalizedAction` — `{ kind, detail }` — plus a
 * `mapped: boolean` and, when unmapped, a human `reason`. Mapping is conservative:
 * where an AsyncTI4 action has no clean counterpart in this repo's base game (homebrew
 * faction, unknown tech, a card this repo doesn't model), we emit `mapped: false` with
 * the reason rather than guess. Panel (A) distillation keys off the `kind`/`detail`.
 */
import { normalizeFaction, normalizeTech } from './normalize'
import type { RawEvent } from './types'

export interface NormalizedAction {
  kind: string
  detail: string | null
  /** Actor faction, normalised to a repo FactionId when possible, else raw. */
  faction: string | null
  factionMapped: boolean
}

export interface MappedEvent {
  action: NormalizedAction
  mapped: boolean
  reason?: string
}

/** Strategy card numbers are shared 1-8 between AsyncTI4 and this repo. */
function mapSc(sc: unknown): string | null {
  const n = Number(sc)
  return Number.isInteger(n) && n >= 1 && n <= 8 ? String(n) : null
}

/** Map one event to a NormalizedAction. */
export function mapEvent(e: RawEvent): MappedEvent {
  const p = e.payload as Record<string, unknown>
  const faction = e.faction && e.faction !== 'null' ? e.faction : null
  const factionMapped = !!normalizeFaction(faction)

  switch (e.archetype) {
    case 'TECH_RESEARCHED': {
      const tech = normalizeTech(String(p.techId ?? ''))
      return {
        action: { kind: 'research', detail: tech, faction, factionMapped },
        mapped: !!tech,
        reason: tech ? undefined : `unmapped tech code: ${String(p.techId ?? '')}`,
      }
    }
    case 'SC_PICKED': {
      const sc = mapSc(p.scNumber)
      return {
        action: { kind: 'pick_strategy', detail: sc, faction, factionMapped },
        mapped: !!sc,
        reason: sc ? undefined : `unmapped SC number: ${String(p.scNumber ?? '')}`,
      }
    }
    case 'SC_PLAYED': {
      const sc = mapSc(p.scNumber)
      return {
        action: { kind: 'play_strategy', detail: sc, faction, factionMapped },
        mapped: !!sc,
        reason: sc ? undefined : `unmapped SC number: ${String(p.scNumber ?? '')}`,
      }
    }
    case 'TACTICAL_ACTION': {
      // The core AI decision: activate a system (+ move/produce). `activeSystem` is
      // the geo id; `planetsTaken`/`combat` give expansion-vs-conflict detail.
      const sys = String(p.activeSystem ?? p.systemId ?? '')
      const hasCombat = !!(p.subEvents as unknown[])?.some((s) =>
        String((s as { type?: string }).type).startsWith('COMBAT'),
      )
      const detail = sys ? (hasCombat ? `attack:${sys}` : `expand:${sys}`) : null
      return {
        action: { kind: 'tactical_action', detail, faction, factionMapped },
        mapped: !!sys,
        reason: sys ? undefined : `no activeSystem on tactical action seq ${e.seq}`,
      }
    }
    case 'TURN': {
      const passed = p.pass === true || p.passed === true
      const detail = passed ? 'pass' : 'action'
      return { action: { kind: 'turn', detail, faction, factionMapped }, mapped: true }
    }
    case 'TRANSACTION': {
      // Not a primary AI move; keep as informational, tagged unmapped for cloning use.
      return { action: { kind: 'transaction', detail: null, faction, factionMapped }, mapped: false, reason: 'transaction: not a primary action label' }
    }
    default: {
      // PHASE_STARTED / ROUND_STARTED / GAME_ENDED / AGENDA_RESOLVED / OBJECTIVE_SCORED
      // are state bookkeeping, not imitation actions. Phase boundaries are useful as
      // temporal markers but not cloning labels.
      return { action: { kind: e.archetype, detail: null, faction, factionMapped }, mapped: false, reason: `archetype '${e.archetype}' is bookkeeping, not an imitation action` }
    }
  }
}

/** The archetypes we want as cloning labels for panel (A). */
export const CLONE_ARCHETYPES: ReadonlySet<string> = new Set([
  'TECH_RESEARCHED',
  'SC_PICKED',
  'SC_PLAYED',
  'TACTICAL_ACTION',
  'TURN',
])

export function isCloneRecord(m: MappedEvent): boolean {
  return m.mapped
}
