import type { Move, Seat, StatusParams, StrategicParams, StrategyCardId } from '../engine/types'

export function hasMove(legal: Move[], type: Move['type']): boolean {
  return legal.some(m => m.type === type)
}

export function activatable(legal: Move[]): string[] {
  return legal.flatMap(m => m.type === 'startTactical' ? [m.systemId] : [])
}

export function retreatTargetsOf(legal: Move[]): string[] {
  return legal.flatMap(m => m.type === 'retreat' ? [m.to] : [])
}

export function bombardTargets(legal: Move[]): string[] {
  return legal.flatMap(m => m.type === 'bombard' ? [m.planetId] : [])
}

export function landTargets(legal: Move[]): { planetId: string; infantryIds: number[] }[] {
  return legal.flatMap(m => m.type === 'land' ? [{ planetId: m.planetId, infantryIds: m.infantryIds }] : [])
}

/** R4.1 step 6: the enumerator offers one variant per side, so the checkboxes follow it exactly. */
export function munitionsOptions(legal: Move[]): { attacker: boolean; defender: boolean } {
  let attacker = false
  let defender = false
  for (const move of legal) {
    if (move.type !== 'combatRound' || !move.munitions) continue
    if (move.munitions.attacker) attacker = true
    if (move.munitions.defender) defender = true
  }
  return { attacker, defender }
}

export function strategicCards(legal: Move[]): StrategyCardId[] {
  const cards: StrategyCardId[] = []
  for (const move of legal) {
    if (move.type === 'strategic' && !cards.includes(move.card)) cards.push(move.card)
  }
  return cards
}

/** Every parameter set the enumerator offers for one card; the dialog edits one of them. */
export function strategicVariants(legal: Move[], card: StrategyCardId): StrategicParams[] {
  return legal.flatMap(m => m.type === 'strategic' && m.card === card ? [m.params ?? {}] : [])
}

export function secondaryOffer(legal: Move[]): { accept: StrategicParams | null; card: StrategyCardId | null } {
  const secondaries = legal.filter((m): m is Extract<Move, { type: 'secondary' }> => m.type === 'secondary')
  const card = secondaries[0]?.card ?? null
  const accept = secondaries.find(m => m.accept)?.params ?? null
  return { accept, card }
}

export function inheritanceTechIds(legal: Move[]): string[] {
  return legal.flatMap(m => m.type === 'research' ? [m.techId] : [])
}

export function shipyardOffers(legal: Move[]): { planetId: string; planets: string[]; tradeGoods: number }[] {
  return legal.flatMap(m => m.type === 'shipyard' ? [{ planetId: m.planetId, planets: m.planets, tradeGoods: m.tradeGoods }] : [])
}

export function productionBiomesTargets(legal: Move[]): Seat[] {
  return legal.flatMap(m => m.type === 'productionBiomes' ? [m.target] : [])
}

export function statusTemplate(legal: Move[]): StatusParams | null {
  for (const move of legal) if (move.type === 'status') return move.params
  return null
}
