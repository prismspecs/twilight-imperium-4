import type { UnitType } from '../engine/types'
import type { ModelStyle } from './modelStyle'

export interface SpriteDef { pxPerModelUnit: number; spriteW: number; spriteH: number }

/** Copy of public/assets/sprites/manifest.json (`units`); src/ui/sprites.test.ts keeps the two in step. */
const MINIATURES: Record<UnitType, SpriteDef> = {
  dreadnought: { pxPerModelUnit: 144.4, spriteW: 548, spriteH: 503 },
  carrier: { pxPerModelUnit: 188.59, spriteW: 593, spriteH: 587 },
  cruiser: { pxPerModelUnit: 198.59, spriteW: 563, spriteH: 566 },
  destroyer: { pxPerModelUnit: 222.68, spriteW: 555, spriteH: 451 },
  fighter: { pxPerModelUnit: 357.26, spriteW: 826, spriteH: 517 },
  flagship: { pxPerModelUnit: 130.02, spriteW: 559, spriteH: 496 },
  warsun: { pxPerModelUnit: 156.33, spriteW: 505, spriteH: 606 },
  infantry: { pxPerModelUnit: 255.99, spriteW: 552, spriteH: 660 },
  spacedock: { pxPerModelUnit: 238.5, spriteW: 528, spriteH: 651 },
  pds: { pxPerModelUnit: 304.84, spriteW: 590, spriteH: 465 },
}

/** Copy of public/assets/sprites/topdown/manifest.json: the same models, orthographic and bow up. */
const TOP_DOWN: Record<UnitType, SpriteDef> = {
  dreadnought: { pxPerModelUnit: 144.4, spriteW: 392, spriteH: 795 },
  carrier: { pxPerModelUnit: 188.59, spriteW: 314, spriteH: 836 },
  cruiser: { pxPerModelUnit: 198.59, spriteW: 285, spriteH: 846 },
  destroyer: { pxPerModelUnit: 222.68, spriteW: 523, spriteH: 722 },
  fighter: { pxPerModelUnit: 357.26, spriteW: 660, spriteH: 612 },
  flagship: { pxPerModelUnit: 130.02, spriteW: 390, spriteH: 804 },
  warsun: { pxPerModelUnit: 156.33, spriteW: 494, spriteH: 500 },
  infantry: { pxPerModelUnit: 255.99, spriteW: 546, spriteH: 434 },
  spacedock: { pxPerModelUnit: 238.5, spriteW: 544, spriteH: 538 },
  pds: { pxPerModelUnit: 304.85, spriteW: 628, spriteH: 484 },
}

/**
 * Copy of public/assets/sprites/counters/manifest.json. The counter art is drawn at its own proportions, so
 * the scale is derived: each unit is set to come out the same size on the board as the top down render.
 */
const COUNTERS: Record<UnitType, SpriteDef> = {
  dreadnought: { pxPerModelUnit: 113.46, spriteW: 308, spriteH: 308 },
  carrier: { pxPerModelUnit: 168.17, spriteW: 280, spriteH: 276 },
  cruiser: { pxPerModelUnit: 186.74, spriteW: 268, spriteH: 268 },
  destroyer: { pxPerModelUnit: 86.86, spriteW: 204, spriteH: 196 },
  fighter: { pxPerModelUnit: 69.29, spriteW: 128, spriteH: 124 },
  flagship: { pxPerModelUnit: 106.68, spriteW: 320, spriteH: 324 },
  warsun: { pxPerModelUnit: 70.89, spriteW: 224, spriteH: 260 },
  infantry: { pxPerModelUnit: 73.14, spriteW: 156, spriteH: 172 },
  spacedock: { pxPerModelUnit: 73.65, spriteW: 168, spriteH: 172 },
  pds: { pxPerModelUnit: 64.08, spriteW: 132, spriteH: 148 },
}

export const SPRITE_SETS: Record<ModelStyle, Record<UnitType, SpriteDef>> = {
  models: MINIATURES, topdown: TOP_DOWN, counters: COUNTERS,
}

/** The folder each style's files live in; the miniatures kept the original flat path. */
export const SPRITE_FOLDER: Record<ModelStyle, string> = { models: '', topdown: 'topdown/', counters: 'counters/' }

/** Board pixels per model unit. The manifest's scale is what makes a fighter small next to a dreadnought. */
export const BOARD_SCALE = 11.6
/** The side panels and the production drawer show the same models smaller. */
export const PANEL_SCALE = 10.4

export function spriteSize(type: UnitType, scale: number = BOARD_SCALE, style: ModelStyle = 'models'): { width: number; height: number } {
  const def = SPRITE_SETS[style][type]
  return {
    width: Math.round(def.spriteW / def.pxPerModelUnit * scale),
    height: Math.round(def.spriteH / def.pxPerModelUnit * scale),
  }
}

/**
 * A unit's true width and height, scaled to fit inside a `box`-sized square without distorting its aspect
 * ratio — for small UI icons (the tech drawer's unit symbols) that need one shared bounding box rather than
 * the board's or a panel's relative scale. Reads the same manifest as `spriteSize`, so an icon never drifts
 * from how the model actually looks everywhere else it is drawn.
 */
export function iconFitSize(type: UnitType, box: number, style: ModelStyle = 'models'): { width: number; height: number } {
  const def = SPRITE_SETS[style][type]
  const scale = box / Math.max(def.spriteW, def.spriteH) * def.pxPerModelUnit
  return spriteSize(type, scale, style)
}
