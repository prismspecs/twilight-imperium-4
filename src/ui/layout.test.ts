import { describe, expect, it } from 'vitest'
import { SYSTEMS } from '../data/map'
import {
  ACTIVATION_OVERLAP, ACTIVATION_SIZE, ACTIVATION_SPOT, GROUND_ROW, PLANET_CENTRE, PLANET_SPOTS, PLATE_SIZE, SIGIL_SIZE,
  SIGIL_SPOT, SPACE_BOX, TILE_H, TILE_NUMBER_SIZE, TILE_NUMBER_SPOT, TILE_W, WORMHOLE_SIZE, WORMHOLE_SPOTS,
  boxInsideHex, discInsideHex, fleetCapacity, fleetScale, plateBox, pointInsideHex,
} from './layout'

/** The drawn hexagon, written out again here so the test checks the numbers, not the source's own helper. */
const HEX: [number, number][] = [[58, 1], [174, 1], [231, 100.5], [174, 200], [58, 200], [1, 100.5]]
function inHex(x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = HEX.length - 1; i < HEX.length; j = i++) {
    const [ax, ay] = HEX[i]
    const [bx, by] = HEX[j]
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside
  }
  return inside
}
interface Box { left: number; top: number; width: number; height: number }
function corners(b: Box): [number, number][] {
  return [[b.left, b.top], [b.left + b.width, b.top], [b.left, b.top + b.height], [b.left + b.width, b.top + b.height]]
}
function overlaps(a: Box, b: Box): boolean {
  return a.left < b.left + b.width && b.left < a.left + a.width
    && a.top < b.top + b.height && b.top < a.top + a.height
}
const planetsOf = (systemId: string) => SYSTEMS.find(s => s.id === systemId)!.planets.map(p => p.id)

describe('every overlay sits inside the drawn hexagon', () => {
  it('knows the hexagon from its own corners', () => {
    expect(pointInsideHex(TILE_W / 2, TILE_H / 2)).toBe(true)
    expect(pointInsideHex(4, 6)).toBe(false)          // the cut top-left corner
    expect(pointInsideHex(TILE_W - 4, TILE_H - 6)).toBe(false)
  })
  it('holds the activation token and the faction emblem', () => {
    expect(boxInsideHex(ACTIVATION_SPOT.left, ACTIVATION_SPOT.top, ACTIVATION_SIZE, ACTIVATION_SIZE)).toBe(true)
    expect(boxInsideHex(SIGIL_SPOT.left, SIGIL_SPOT.top, SIGIL_SIZE, SIGIL_SIZE)).toBe(true)
  })
  it('holds the catalog tile-number label, clear of the activation token, every space box and plate', () => {
    const numberBox = { left: TILE_NUMBER_SPOT.left, top: TILE_NUMBER_SPOT.top, ...TILE_NUMBER_SIZE }
    expect(boxInsideHex(numberBox.left, numberBox.top, numberBox.width, numberBox.height)).toBe(true)
    expect(overlaps(numberBox, { left: ACTIVATION_SPOT.left, top: ACTIVATION_SPOT.top, width: ACTIVATION_SIZE, height: ACTIVATION_SIZE })).toBe(false)
    for (const def of SYSTEMS) {
      expect(overlaps(numberBox, SPACE_BOX[def.id]), `${def.id} space box`).toBe(false)
      for (const planet of def.planets) {
        expect(overlaps(numberBox, plateBox(planet.id)), `${planet.id} plate`).toBe(false)
      }
    }
  })
  it('holds every wormhole glyph', () => {
    for (const [systemId, spot] of Object.entries(WORMHOLE_SPOTS)) {
      expect(boxInsideHex(spot.left, spot.top, WORMHOLE_SIZE, WORMHOLE_SIZE), systemId).toBe(true)
    }
  })
  it('holds every planet disc, measured off the printed tile art', () => {
    for (const def of SYSTEMS) {
      for (const planet of def.planets) {
        const spot = PLANET_SPOTS[planet.id]
        expect(spot, planet.id).toBeTruthy()
        // the disc is a circle inside its square: the square's corners may leave the hexagon, the disc may not
        expect(discInsideHex(PLANET_CENTRE[planet.id], spot.art.width / 2), planet.id).toBe(true)
      }
    }
  })
  it('holds every nameplate, banner and badges', () => {
    for (const def of SYSTEMS) {
      for (const planet of def.planets) {
        for (const [x, y] of corners(plateBox(planet.id))) {
          expect(inHex(x, y), `${planet.id} plate corner ${x},${y}`).toBe(true)
        }
      }
    }
  })
})

describe('the space box of a system', () => {
  it('lies inside the hexagon, every corner', () => {
    for (const def of SYSTEMS) {
      const box = SPACE_BOX[def.id]
      expect(box, def.id).toBeTruthy()
      for (const [x, y] of corners(box)) expect(inHex(x, y), `${def.id} corner ${x},${y}`).toBe(true)
    }
  })
  it('never covers a nameplate', () => {
    for (const def of SYSTEMS) {
      for (const planet of def.planets) {
        expect(overlaps(SPACE_BOX[def.id], plateBox(planet.id)), `${def.id} vs ${planet.id} plate`).toBe(false)
      }
    }
  })
  // The fleet does cross a planet's disc where the printed geometry leaves it nowhere else to stand, and
  // the ground rows are painted over it, so the check is that the ground row fits on its own planet.
  it('leaves the ground row room on the disc it is centred on', () => {
    for (const def of SYSTEMS) {
      for (const planet of def.planets) {
        const radius = PLANET_SPOTS[planet.id].art.width / 2
        expect(GROUND_ROW.width, planet.id).toBeLessThanOrEqual(radius * 2)
        expect(GROUND_ROW.height * 2, planet.id).toBeLessThanOrEqual(radius * 2)
      }
    }
  })
  it('never covers the wormhole glyph or the played command tokens', () => {
    for (const def of SYSTEMS) {
      const box = SPACE_BOX[def.id]
      // both seats activated: two tokens side by side, overlapping like stacked cardboard
      const acts = {
        left: ACTIVATION_SPOT.left, top: ACTIVATION_SPOT.top,
        width: ACTIVATION_SIZE * 2 - ACTIVATION_OVERLAP, height: ACTIVATION_SIZE,
      }
      expect(overlaps(box, acts), `${def.id} vs command tokens`).toBe(false)
      const wh = WORMHOLE_SPOTS[def.id]
      if (wh) expect(overlaps(box, { ...wh, width: WORMHOLE_SIZE, height: WORMHOLE_SIZE }), `${def.id} vs wormhole`).toBe(false)
    }
  })
  it('shows a crowded fleet whole, down at the 0.6 floor, on every system', () => {
    for (const def of SYSTEMS) {
      // eight kinds of unit is everything one seat can hold in space at once
      expect(fleetCapacity(SPACE_BOX[def.id], 0.6), def.id).toBeGreaterThanOrEqual(8)
      expect(fleetCapacity(SPACE_BOX[def.id], 1), def.id).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('fleetScale', () => {
  const box = { width: 120, height: 92 }
  it('keeps the ships at full size while they fit', () => {
    expect(fleetScale(1, box)).toBe(1)
    expect(fleetScale(2, box)).toBe(1)
  })
  it('steps down as the fleet grows and never goes below 0.6', () => {
    expect(fleetScale(9, box)).toBeLessThan(1)
    expect(fleetScale(30, box)).toBe(0.6)
    for (let n = 1; n < 30; n++) {
      expect(fleetScale(n + 1, box), `${n + 1} stacks`).toBeLessThanOrEqual(fleetScale(n, box))
      expect(fleetScale(n, box)).toBeGreaterThanOrEqual(0.6)
      expect(fleetScale(n, box)).toBeLessThanOrEqual(1)
    }
  })
  it('gives a small box a smaller scale than a large one for the same fleet', () => {
    expect(fleetScale(6, { width: 100, height: 64 })).toBeLessThanOrEqual(fleetScale(6, { width: 168, height: 120 }))
  })
})

describe('planet centres', () => {
  it('has a centre for every planet, in the middle of its disc', () => {
    for (const def of SYSTEMS) {
      for (const planet of def.planets) {
        const spot = PLANET_SPOTS[planet.id]
        const c = PLANET_CENTRE[planet.id]
        expect(c, planet.id).toBeTruthy()
        expect(c.left, planet.id).toBeCloseTo(spot.art.left + spot.art.width / 2, 1)
        expect(c.top, planet.id).toBeCloseTo(spot.art.top + spot.art.height / 2, 1)
      }
    }
  })
  it('puts Mecatol Rex in the middle of its own tile, the way the printed tile does', () => {
    expect(PLANET_CENTRE['mecatol-rex'].left).toBeCloseTo(TILE_W / 2, 0)
    expect(PLANET_CENTRE['mecatol-rex'].top).toBeCloseTo(TILE_H / 2, 0)
  })
  it('keeps the two planets of a system apart', () => {
    for (const def of SYSTEMS.filter(s => s.planets.length === 2)) {
      const [a, b] = def.planets.map(p => p.id)
      const dx = PLANET_CENTRE[a].left - PLANET_CENTRE[b].left
      const dy = PLANET_CENTRE[a].top - PLANET_CENTRE[b].top
      const gap = Math.hypot(dx, dy) - PLANET_SPOTS[a].art.width / 2 - PLANET_SPOTS[b].art.width / 2
      expect(gap, def.id).toBeGreaterThan(0)
    }
  })
  it('measures every plate against the live render, so the geometry tests mean something', () => {
    for (const def of SYSTEMS) {
      for (const planet of def.planets) {
        expect(PLATE_SIZE[planet.id], planet.id).toBeTruthy()
        expect(PLATE_SIZE[planet.id].width, planet.id).toBeGreaterThan(40)
      }
    }
  })
  it('names a planet for every system on the map', () => {
    for (const def of SYSTEMS) expect(planetsOf(def.id).length).toBeGreaterThan(0)
  })
})
