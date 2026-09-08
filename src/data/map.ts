export const MECATOL_ID = 'mecatol'

/** The shape of a system definition (for the generated galaxy and the static duel map). */
export interface SystemDef {
  id: string; name: string; tile: string
  planets: { id: string; name: string; resources: number; influence: number; trait?: string | null; techSkip?: string | null }[]
  wormhole: 'alpha' | 'beta' | 'delta' | null
  neighbours: string[]
  home: number | null
  anomalies?: import('../engine/types').Anomaly[]
  q?: number; r?: number
}

export interface PlanetDef { id: string; name: string; resources: number; influence: number; trait?: string | null; techSkip?: string | null }
