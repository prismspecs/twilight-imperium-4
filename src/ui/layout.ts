export const TILE_W = 232
export const TILE_H = 201
export interface Point { left: number; top: number }

export const FLOWER_ORIGIN: Point = { left: 354, top: 248 }
export const FLOWER_MAP_SIZE = { width: 940, height: 698 }
export const GALAXY_ORIGIN: Point = { left: 522, top: 603 }
export const GALAXY_MAP_SIZE = { width: 1276, height: 1407 }

/** Converts axial hex coordinates (q, r) to pixel offset relative to origin. */
export function hexToPixel(q: number, r: number, origin: Point = GALAXY_ORIGIN): Point {
  return {
    left: Math.round(origin.left + 174 * q),
    top: Math.round(origin.top + 100.5 * q + 201 * r),
  }
}

/** Flower positions inside the 940x698 map box, taken from the approved mockup. */
export const TILE_POS: Record<string, Point> = {
  'home-n': { left: 354, top: 47 },
  bereg: { left: 528, top: 148 },
  sakulag: { left: 180, top: 148 },
  mecatol: { left: 354, top: 248 },
  quann: { left: 528, top: 349 },
  starpoint: { left: 180, top: 349 },
  'home-s': { left: 354, top: 449 },
}

export interface PlanetSpot {
  /** The disc: square box of the planet render, taken 1:1 off the printed tile art. */
  art: { left: number; top: number; width: number; height: number }
  /**
   * The nameplate's two value badges. `left`/`top` is the badge block's corner; the name banner runs to
   * the right of it, or to the left when `flip` is set, exactly as the printed tile prints it.
   */
  plate: { left: number; top: number; flip?: boolean }
}

/**
 * Planet geometry, rebuilt 1:1 from the printed tiles we ship in `public/assets/tiles`: the four original
 * tiles (06_000, 10_ArcPime, 18_MR, 35_Bereg) are 345x299 and the board draws a tile at 232x201, so every
 * measurement below is the printed one times 232/345 = 0.6725. Each disc was fitted by maximising the rim
 * contrast of a circle over the art (see the task report for the fitted centres and radii); each plate sits
 * where the print puts it: value badges on the disc's outward rim, banner running inwards along the top of
 * an upper planet and along the bottom of a lower one.
 *
 * Systems whose tile we do not have printed art for (Sakulag, Quann, Starpoint) copy the geometry of the
 * printed tile with the same planet arrangement: a single planet follows [0.0.0], an upper-left planet
 * follows Bereg, a lower-right planet follows Lirta IV.
 *
 * Plates are nudged a couple of pixels off the printed spot where the print bleeds over the tile edge: our
 * hexagon is drawn with a visible outline, so `layout.test.ts` holds every plate corner inside it.
 */
export const PLANET_SPOTS: Record<string, PlanetSpot> = {
  // 06_000.png: disc fitted at art (171,131) r 64 -> board centre (115,88) d 86; banner along the bottom
  '000': { art: { left: 72, top: 45, width: 86, height: 86 }, plate: { left: 75, top: 98 } },
  // same arrangement as [0.0.0]: one planet, banner along the bottom of the disc
  sakulag: { art: { left: 72, top: 45, width: 86, height: 86 }, plate: { left: 75, top: 98 } },
  quann: { art: { left: 72, top: 45, width: 86, height: 86 }, plate: { left: 75, top: 98 } },
  // 35_Bereg.png: disc fitted at art (138,90) r 61 -> board centre (93,61) d 82; banner along the top
  bereg: { art: { left: 52, top: 20, width: 82, height: 82 }, plate: { left: 52, top: 14 } },
  starpoint: { art: { left: 52, top: 20, width: 82, height: 82 }, plate: { left: 52, top: 14 } },
  // 35_Bereg.png: Lirta IV fitted at art (205,208) r 63 -> board centre (138,140) d 86; the print mirrors
  // its plate, badges on the outward (right) rim and the banner running left along the bottom
  'lirta-iv': { art: { left: 95, top: 97, width: 86, height: 86 }, plate: { left: 146, top: 152, flip: true } },
  centauri: { art: { left: 95, top: 97, width: 86, height: 86 }, plate: { left: 146, top: 152, flip: true } },
  // 18_MR.png: disc fitted at art (171,152) r 121 -> board d 164, centred on the tile like the print
  'mecatol-rex': { art: { left: 34, top: 18.5, width: 164, height: 164 }, plate: { left: 64, top: 150 } },
  // 10_ArcPime.png: Arc Prime fitted at art (131,87) r 63, Wren Terra at (224,205) r 63, both with the
  // banner along the top of their disc
  'arc-prime': { art: { left: 45, top: 16, width: 86, height: 86 }, plate: { left: 56, top: 10 } },
  'wren-terra': { art: { left: 108, top: 95, width: 86, height: 86 }, plate: { left: 107, top: 88 } },
}

export function fallbackPlanetSpot(index: number, count: number): PlanetSpot {
  if (count <= 1) {
    return { art: { left: 72, top: 45, width: 86, height: 86 }, plate: { left: 75, top: 98 } }
  }
  if (count === 2) {
    if (index === 0) {
      return { art: { left: 52, top: 20, width: 82, height: 82 }, plate: { left: 52, top: 14 } }
    }
    return { art: { left: 95, top: 97, width: 86, height: 86 }, plate: { left: 146, top: 152, flip: true } }
  }
  // 3 planets
  if (index === 0) {
    return { art: { left: 86, top: 15, width: 60, height: 60 }, plate: { left: 86, top: 10 } }
  }
  if (index === 1) {
    return { art: { left: 45, top: 95, width: 60, height: 60 }, plate: { left: 45, top: 90 } }
  }
  return { art: { left: 125, top: 95, width: 60, height: 60 }, plate: { left: 140, top: 145, flip: true } }
}

export function getPlanetSpot(planetId: string, index = 0, count = 1): PlanetSpot {
  return PLANET_SPOTS[planetId] ?? fallbackPlanetSpot(index, count)
}

export function getPlanetCentre(planetId: string, spot: PlanetSpot): Point {
  const existing = PLANET_CENTRE[planetId]
  if (existing) return existing
  return {
    left: spot.art.left + spot.art.width / 2,
    top: spot.art.top + spot.art.height / 2,
  }
}

/** The middle of a planet's disc: what the control token and the landed ground forces centre on. */
export const PLANET_CENTRE: Record<string, Point> = Object.fromEntries(
  Object.entries(PLANET_SPOTS).map(([id, spot]) => [id, {
    left: spot.art.left + spot.art.width / 2,
    top: spot.art.top + spot.art.height / 2,
  }]),
)

/** The badge block of a nameplate; the banner runs off its right (or its left when the plate is flipped). */
export const PLATE_VALS_W = 36
export const PLATE_H = 30
/**
 * Rendered width of each nameplate, read off the live board with the CDP measuring harness (see report);
 * the geometry tests use it, so a plate that grows past its measured width shows up as a failing test
 * rather than as a banner hanging over the hexagon edge.
 */
export const PLATE_SIZE: Record<string, { width: number; height: number }> = {
  '000': { width: 79, height: PLATE_H }, sakulag: { width: 102, height: PLATE_H },
  quann: { width: 92, height: PLATE_H }, bereg: { width: 90, height: PLATE_H },
  starpoint: { width: 110, height: PLATE_H }, 'lirta-iv': { width: 99, height: PLATE_H },
  centauri: { width: 105, height: PLATE_H }, 'mecatol-rex': { width: 106, height: PLATE_H },
  'arc-prime': { width: 94, height: PLATE_H }, 'wren-terra': { width: 104, height: PLATE_H },
}

/** The nameplate's box on the tile, badges and banner together. */
export function plateBox(planetId: string): { left: number; top: number; width: number; height: number } {
  const { plate } = PLANET_SPOTS[planetId]
  const { width, height } = PLATE_SIZE[planetId]
  return { left: plate.flip ? plate.left + PLATE_VALS_W - width : plate.left, top: plate.top, width, height }
}

/** The control token and the landed infantry, centred on the planet; the structures row is the same size. */
export const GROUND_ROW = { width: 62, height: 38 }

/**
 * The empty space of a system: where the fleet is drawn, and the only place it is drawn. The box is clear
 * of every nameplate, wormhole glyph, faction emblem, guardian label and played command token, and every
 * corner sits inside the hexagon with room to spare, so `overflow:hidden` on it guarantees that no ship
 * ever leaves its tile. Ships do cross a planet's disc where the printed geometry leaves them nowhere else
 * to stand (Mecatol Rex's disc alone is 164px across on a 232x201 tile); the ground forces and the plates
 * are painted over the fleet, so nothing that stands on a planet is ever hidden by a ship.
 *
 * Every box below is the largest rectangle the tile has left over, found by sweeping the free pixels of the
 * hexagon (6px off its edges) against those obstacles and scoring the result by how many unit stacks it can
 * hold; the per-system note says what bounds it.
 */
export const SPACE_BOX: Record<string, { left: number; top: number; width: number; height: number }> = {
  // below the [0.0.0] banner (ends y128) and clear of the disc, which stops at y131
  'home-n': { left: 61, top: 131, width: 110, height: 63 },
  // same tile shape as home-n; the beta wormhole sits up at (36,40), out of the way
  sakulag: { left: 61, top: 131, width: 110, height: 63 },
  // 4px narrower than Sakulag's: the beta wormhole glyph sits at (170,134), right of the box
  quann: { left: 61, top: 131, width: 106, height: 63 },
  // Mecatol's printed disc leaves no empty space at all, so the box runs from under the guardian label
  // (ends y24) down to the nameplate (starts y150), the tallest box on the map
  mecatol: { left: 77, top: 27, width: 104, height: 120 },
  // between Bereg's banner (ends y44) and Lirta IV's (starts y152), left of the alpha wormhole at (170,40)
  bereg: { left: 77, top: 69, width: 122, height: 74 },
  // like Bereg, but the alpha wormhole sits out on the right rim at (194,88), so the box is taller
  starpoint: { left: 77, top: 47, width: 114, height: 94 },
  // under Wren Terra's banner (ends y118) and right of the command tokens (end x74): the tallest box the
  // two printed discs leave, so seat 1's home fleet still draws at full size
  'home-s': { left: 77, top: 121, width: 94, height: 72 },
}

/**
 * The cell one unit stack takes in the space box: the mean footprint of the eight kinds of unit a system
 * can hold in space, at BOARD_SCALE out of `sprites.ts` (flagship 50x44, warsun 37x45, dreadnought 44x40,
 * carrier 36x36, cruiser 33x33, destroyer 29x23, fighter 27x17, infantry 25x30), rounded to 36x34.
 */
const STACK_W = 36
const STACK_H = 34
const FLEET_GAP = 4
const SCALE_STEPS = [1, 0.9, 0.8, 0.7, 0.6]

/**
 * How far to shrink a fleet so that every stack stays inside the space box. Full size while the stacks fit,
 * then down in steps, never below 0.6: a crowded system draws smaller ships rather than ships outside the
 * hexagon or ships clipped away by the box.
 */
export function fleetScale(stackCount: number, box: { width: number; height: number }): number {
  for (const scale of SCALE_STEPS) if (fleetCapacity(box, scale) >= stackCount) return scale
  return SCALE_STEPS[SCALE_STEPS.length - 1]
}

/** How many unit stacks a box shows at a given zoom, rows and columns of the mean stack cell. */
export function fleetCapacity(box: { width: number; height: number }, scale: number): number {
  const cols = Math.floor((box.width + FLEET_GAP) / (STACK_W * scale + FLEET_GAP))
  const rows = Math.floor((box.height + FLEET_GAP) / (STACK_H * scale + FLEET_GAP))
  return cols * rows
}

export const WORMHOLE_SPOTS: Record<string, Point> = {
  bereg: { left: 170, top: 40 },
  sakulag: { left: 36, top: 40 },
  quann: { left: 170, top: 134 },
  starpoint: { left: 194, top: 88 },
}

export function getSpaceBox(systemId: string, planetCount = 1): { left: number; top: number; width: number; height: number } {
  if (SPACE_BOX[systemId]) return SPACE_BOX[systemId]
  if (planetCount === 0) return { left: 58, top: 35, width: 116, height: 130 }
  if (planetCount === 1) return { left: 61, top: 131, width: 110, height: 63 }
  return { left: 77, top: 69, width: 114, height: 74 }
}

export function getWormholeSpot(systemId: string): Point {
  return WORMHOLE_SPOTS[systemId] ?? { left: 170, top: 40 }
}

/**
 * Overlays sit inside the drawn hexagon, not inside the tile's bounding box: the four cut corners are
 * transparent, so anything anchored there floats next to the system instead of on it. `layout.test.ts`
 * checks every spot below against HEX_POINTS.
 */
export const HEX_POINTS: readonly Point[] = [
  { left: 58, top: 1 }, { left: 174, top: 1 }, { left: 231, top: 100.5 },
  { left: 174, top: 200 }, { left: 58, top: 200 }, { left: 1, top: 100.5 },
]

/** True when the whole box lies inside the tile's hexagon. */
export function boxInsideHex(left: number, top: number, width: number, height: number): boolean {
  const corners: [number, number][] = [[left, top], [left + width, top], [left, top + height], [left + width, top + height]]
  return corners.every(([x, y]) => pointInsideHex(x, y))
}

/**
 * True when a planet's disc lies inside the hexagon. A disc is checked as a circle, not as its square: a
 * big planet's bounding box pokes through the cut corners while the printed disc itself never does.
 */
export function discInsideHex(centre: Point, radius: number): boolean {
  return HEX_POINTS.every((a, i) => {
    const b = HEX_POINTS[(i + 1) % HEX_POINTS.length]
    const ex = b.left - a.left
    const ey = b.top - a.top
    const len = Math.hypot(ex, ey)
    return Math.abs((centre.left - a.left) * ey - (centre.top - a.top) * ex) / len >= radius
  })
}

export function pointInsideHex(x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = HEX_POINTS.length - 1; i < HEX_POINTS.length; j = i++) {
    const a = HEX_POINTS[i]
    const b = HEX_POINTS[j]
    const straddles = (a.top > y) !== (b.top > y)
    if (straddles && x < (b.left - a.left) * (y - a.top) / (b.top - a.top) + a.left) inside = !inside
  }
  return inside
}

/** The activation command token, on the wide left flank and above everything else on the tile. */
export const ACTIVATION_SPOT: Point = { left: 20, top: 92 }
export const ACTIVATION_SIZE = 34
/** A system both seats activated stacks its two tokens like cardboard, overlapping by this much. */
export const ACTIVATION_OVERLAP = 14
/** The faction emblem of a home system, top right inside the hexagon. */
export const SIGIL_SPOT: Point = { left: 150, top: 20 }
export const SIGIL_SIZE = 30
export const WORMHOLE_SIZE = 26

export const POST_POS: Record<'west' | 'east', Point> = {
  west: { left: 16, top: 254 },
  east: { left: 776, top: 254 },
}
