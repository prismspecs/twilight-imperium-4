/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SPRITE_FOLDER, SPRITE_SETS, spriteSize } from './sprites'
import type { ModelStyle } from './modelStyle'

const MODEL_STYLE_IDS: ModelStyle[] = ['models', 'topdown', 'counters']

interface Manifest { units: Record<string, { pxPerModelUnit: number; spriteW: number; spriteH: number }> }

describe('unit sprites', () => {
  it('every style table is a faithful copy of its shipped manifest', () => {
    for (const style of MODEL_STYLE_IDS) {
      const raw = readFileSync(new URL(`../../public/assets/sprites/${SPRITE_FOLDER[style]}manifest.json`, import.meta.url), 'utf8')
      const manifest = JSON.parse(raw) as Manifest
      for (const [type, def] of Object.entries(SPRITE_SETS[style])) {
        expect(manifest.units[type], `${style} ${type}`).toBeDefined()
        expect(manifest.units[type].pxPerModelUnit).toBe(def.pxPerModelUnit)
        expect(manifest.units[type].spriteW).toBe(def.spriteW)
        expect(manifest.units[type].spriteH).toBe(def.spriteH)
      }
    }
  })
  it('every style ships a file for every colour and every unit', () => {
    const colours = ['red', 'blue', 'green', 'yellow', 'purple', 'black', 'orange', 'pink', 'grey']
    for (const style of MODEL_STYLE_IDS) {
      for (const type of Object.keys(SPRITE_SETS[style])) {
        for (const colour of colours) {
          const url = new URL(`../../public/assets/sprites/${SPRITE_FOLDER[style]}${colour}_${type}.png`, import.meta.url)
          expect(existsSync(url), `${style} ${colour} ${type}`).toBe(true)
        }
      }
    }
  })
  it('the three styles put a unit on the board at about the same size', () => {
    for (const type of ['dreadnought', 'carrier', 'fighter'] as const) {
      const widths = MODEL_STYLE_IDS.map(style => spriteSize(type, undefined, style).width)
      const min = Math.min(...widths)
      const max = Math.max(...widths)
      expect(max - min, type).toBeLessThanOrEqual(Math.round(max * 0.55))
    }
  })
  it('the world scale reproduces the mockup sizes', () => {
    expect(spriteSize('dreadnought')).toEqual({ width: 44, height: 40 })
    expect(spriteSize('carrier')).toEqual({ width: 36, height: 36 })
    expect(spriteSize('cruiser')).toEqual({ width: 33, height: 33 })
    expect(spriteSize('destroyer')).toEqual({ width: 29, height: 23 })
    expect(spriteSize('fighter')).toEqual({ width: 27, height: 17 })
    expect(spriteSize('infantry')).toEqual({ width: 25, height: 30 })
    expect(spriteSize('pds')).toEqual({ width: 22, height: 18 })
    expect(spriteSize('spacedock')).toEqual({ width: 26, height: 32 })
  })
  it('a smaller scale keeps the proportions', () => {
    const big = spriteSize('dreadnought')
    const small = spriteSize('dreadnought', 5.8)
    expect(small.width).toBe(Math.round(big.width / 2))
  })
})
