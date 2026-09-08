import { FACTIONS } from '../../data/factions'
import { FLAGSHIP_INFO } from '../../data/flagships'
import { unitStats } from '../../data/units'
import { COLOUR_INK } from '../art'
import type { Color, FactionId } from '../../engine/types'

export interface FlagshipCardProps {
  faction: FactionId
  colour: Color
}

/**
 * No faction but l1z1x and letnev has real reference-card art anywhere reachable (checked the TI4 Fandom
 * wiki; see docs/superpowers/plans/2026-09-04-ti4-full-game.ledger.md) — flagships there are a plain stats
 * table, not a card scan. Rather than show 15 factions the wrong faction's ship, every flagship renders as
 * this text card instead, built from the same FLAGSHIPS stats `unitStats` already uses for combat.
 */
export function FlagshipCard({ faction, colour }: FlagshipCardProps) {
  const info = FLAGSHIP_INFO[faction]
  const stats = unitStats('flagship', { faction, techs: [] })
  const ink = COLOUR_INK[colour]
  const keywords: string[] = []
  if (stats.afb) keywords.push(`Anti-Fighter Barrage ${String(stats.afb.value)} (x${String(stats.afb.dice)})`)
  if (stats.bombardment) keywords.push(`Bombardment ${String(stats.bombardment.value)} (x${String(stats.bombardment.dice)})`)
  if (stats.spaceCannon) keywords.push(`Space Cannon ${String(stats.spaceCannon.value)} (x${String(stats.spaceCannon.dice)})`)
  return (
    <div className="flagship-card" style={{ borderColor: ink.accent }} data-testid={`flagship-card-${faction}`}>
      <div className="flagship-card-head" style={{ borderBottomColor: ink.accent }}>
        <span className="flagship-card-eyebrow" style={{ color: ink.accent }}>{FACTIONS[faction].name} · Flagship</span>
        <span className="flagship-card-name">{info.name}</span>
      </div>
      <div className="flagship-card-body">
        {info.ability ? <p className="flagship-card-ability">{info.ability}</p> : null}
        <p className="flagship-card-ability">Sustain Damage: the first hit against it can be shrugged off instead of destroying it.</p>
        {keywords.length ? <p className="flagship-card-keywords">{keywords.join(' · ')}</p> : null}
      </div>
      <div className="flagship-card-stats">
        <div className="flagship-card-stat"><b>{stats.cost}</b><span>Cost</span></div>
        <div className="flagship-card-stat"><b>{stats.combat}{stats.combatDice > 1 ? ` (x${String(stats.combatDice)})` : ''}</b><span>Combat</span></div>
        <div className="flagship-card-stat"><b>{stats.move}</b><span>Move</span></div>
        <div className="flagship-card-stat"><b>{stats.capacity}</b><span>Capacity</span></div>
      </div>
    </div>
  )
}
