import { Fragment, useState } from 'react'
import { FACTIONS } from '../../data/factions'
import { techDef } from '../../data/techs'
import { relativeTime } from '../format'
import { deleteGame, listGames } from '../persist'
import { gamePath, navigate, seedFromRoute, useHashRoute } from '../route'
import { MISC, spriteUrl, techIconUrl } from '../art'
import { spriteSize } from '../sprites'
import { useModelStyle } from '../modelStyle'
import type { ModelStyle } from '../modelStyle'
import { useGame } from '../store'
import '../setup.css'
import type { CSSProperties, ReactElement } from 'react'
import type { Color, FactionId, PlayerType, Seat, UnitType } from '../../engine/types'
import { SpaceBackdrop } from '../SpaceBackdrop'
import { MusicButton } from '../music'

const COLOURS: Color[] = ['red', 'blue', 'green', 'yellow', 'purple', 'black', 'orange', 'pink']
const COLOUR_NAMES: Record<Color, string> = {
  red: 'Red', blue: 'Blue', green: 'Green', yellow: 'Yellow',
  purple: 'Purple', black: 'Black', orange: 'Orange', pink: 'Pink',
}
/** The swatch colours, the tint the seat's copy is set in, and the lamp on the galaxy plot. */
const COLOUR_INK: Record<Color, { accent: string; tint: string; glow: string }> = {
  red: { accent: '#d63b3b', tint: '#f09a9a', glow: 'rgba(214,59,59,.16)' },
  blue: { accent: '#3d7be8', tint: '#8fb4ff', glow: 'rgba(61,123,232,.16)' },
  green: { accent: '#3aa655', tint: '#84d69d', glow: 'rgba(58,166,85,.16)' },
  yellow: { accent: '#e5c531', tint: '#f0dc86', glow: 'rgba(229,197,49,.16)' },
  purple: { accent: '#8a47c9', tint: '#c39bf0', glow: 'rgba(138,71,201,.16)' },
  black: { accent: '#7d8494', tint: '#b9bfcc', glow: 'rgba(125,132,148,.16)' },
  orange: { accent: '#e8842a', tint: '#f2ac6f', glow: 'rgba(232,132,42,.16)' },
  pink: { accent: '#e067b0', tint: '#f3a3d0', glow: 'rgba(224,103,176,.16)' },
}
const POSITIONS: Record<number, string[]> = {
  2: ['North', 'South'],
  3: ['East', 'North-West', 'South-West'],
  4: ['East', 'North-East', 'West', 'South-West'],
  5: ['East', 'North-East', 'North-West', 'West', 'South-West'],
  6: ['East', 'North-East', 'North-West', 'West', 'South-West', 'South-East'],
}
const DEFAULT_NAMES = ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6']
const DEFAULT_FACTIONS: FactionId[] = ['l1z1x', 'letnev', 'sol', 'hacan', 'jolnar', 'xxcha']
const DEFAULT_COLOURS: Color[] = ['blue', 'red', 'green', 'yellow', 'purple', 'black']
// All but the first seat default to AI: a new game starts as one human vs the rest of the table.
const DEFAULT_TYPES: PlayerType[] = ['human', 'ai', 'ai', 'ai', 'ai', 'ai']

// Display order for the fleet row; only the types a starting fleet can actually contain matter here.
const FLEET_ORDER: UnitType[] = ['dreadnought', 'warsun', 'flagship', 'carrier', 'cruiser', 'destroyer', 'fighter', 'infantry', 'pds', 'spacedock']
const UNIT_LABEL: Record<UnitType, string> = {
  dreadnought: 'Dreadnought', warsun: 'War Sun', flagship: 'Flagship', carrier: 'Carrier', cruiser: 'Cruiser',
  destroyer: 'Destroyer', fighter: 'Fighter', infantry: 'Infantry', pds: 'PDS', spacedock: 'Space Dock',
}
const UNIT_PLURAL: Record<UnitType, string> = {
  dreadnought: 'Dreadnoughts', warsun: 'War Suns', flagship: 'Flagships', carrier: 'Carriers', cruiser: 'Cruisers',
  destroyer: 'Destroyers', fighter: 'Fighters', infantry: 'Infantry', pds: 'PDS', spacedock: 'Space Docks',
}
// Fighters and infantry get a count badge instead of one sprite per unit; every other type is capped at one
// in the starting fleets, so a badge would just always read "1".
const BADGE_TYPES: readonly UnitType[] = ['fighter', 'infantry']
// The row's sprites are sized proportionally to the actual ships via src/ui/sprites.ts, the shared copy of
// public/assets/sprites/manifest.json's world scale.
const FLEET_SPRITE_SCALE = 13

/* ---------------------------------------------------------------------------
 * The galaxy plot
 *
 * The lobby's signature: a schematic of the exact galaxy this table is about to
 * generate, drawn from the same constants the generator uses (engine/galaxy.ts)
 * and the same axial-to-pixel mapping the board uses (ui/layout.ts), so the
 * home system a seat is promised sits where it will really sit. Mecatol Rex
 * stays lit at the centre; every seat's home burns in that seat's own colour and
 * follows its colour picker; the row under the pointer flares.
 * ------------------------------------------------------------------------- */

/** ui/layout.ts: flat-top hexes, 232 x 201, stepping 174 across and 100.5 / 201 down. */
const HEX_DX = 174
const HEX_DY = 201
const HEX_HALF = HEX_DY / 2
const HEX_W = 232
const RADIUS = 3
/** engine/galaxy.ts CORNERS: the six corner cells of the radius-3 hex, clockwise from due east. */
const CORNERS: readonly (readonly [number, number])[] = [
  [RADIUS, 0], [RADIUS, -RADIUS], [0, -RADIUS], [-RADIUS, 0], [-RADIUS, RADIUS], [0, RADIUS],
]
/** engine/galaxy.ts HOME_CORNERS: which corners the homes take at each player count. */
const HOME_CORNERS: Record<number, readonly number[]> = {
  3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5],
}
/** engine/galaxy.ts REMOVED_CORNERS: the 3-player galaxy leaves its three empty corners off the board. */
const REMOVED_CORNERS: Record<number, readonly number[]> = { 3: [1, 3, 5] }

interface PlotCell { key: string; cx: number; cy: number }

function plotCells(): PlotCell[] {
  const cells: PlotCell[] = []
  for (let q = -RADIUS; q <= RADIUS; q++) {
    const lo = Math.max(-RADIUS, -q - RADIUS)
    const hi = Math.min(RADIUS, -q + RADIUS)
    for (let r = lo; r <= hi; r++) cells.push({ key: `${String(q)},${String(r)}`, cx: HEX_DX * q, cy: HEX_HALF * q + HEX_DY * r })
  }
  return cells
}
const PLOT_CELLS = plotCells()

/** A flat-top hexagon: the outline of one system, inset so neighbouring cells keep a visible seam. */
function hexPoints(cx: number, cy: number, inset: number): string {
  const w = HEX_W / 2 - inset
  const h = HEX_HALF - inset * 0.87
  const q = w / 2
  return `${String(cx - w)},${String(cy)} ${String(cx - q)},${String(cy - h)} ${String(cx + q)},${String(cy - h)} ${String(cx + w)},${String(cy)} ${String(cx + q)},${String(cy + h)} ${String(cx - q)},${String(cy + h)}`
}

function GalaxyPlot({ playerCount, colours, lit }: { playerCount: number; colours: Color[]; lit: number | null }) {
  const cornerIdx = HOME_CORNERS[playerCount] ?? HOME_CORNERS[6]
  const homes = new Map<string, number>()
  cornerIdx.forEach((corner, seat) => { homes.set(CORNERS[corner].join(','), seat) })
  const removed = new Set((REMOVED_CORNERS[playerCount] ?? []).map(corner => CORNERS[corner].join(',')))

  const halfW = RADIUS * HEX_DX + HEX_W / 2
  const halfH = RADIUS * HEX_DY + HEX_HALF
  return (
    <svg
      className="pf-plot-svg" aria-hidden="true" role="presentation"
      viewBox={`${String(-halfW)} ${String(-halfH)} ${String(halfW * 2)} ${String(halfH * 2)}`}
    >
      {PLOT_CELLS.map(cell => {
        if (removed.has(cell.key)) return null
        const seat = homes.get(cell.key)
        const mecatol = cell.key === '0,0'
        if (seat === undefined) {
          return <polygon key={cell.key} className={`pf-hex${mecatol ? ' rex' : ''}`} points={hexPoints(cell.cx, cell.cy, 8)} />
        }
        const ink = COLOUR_INK[colours[seat]]
        return (
          <g key={cell.key} className={`pf-home${lit === seat ? ' lit' : ''}`} style={{ '--accent': ink.accent } as CSSProperties}>
            <polygon className="pf-hex home" points={hexPoints(cell.cx, cell.cy, 8)} />
            <text className="pf-home-n" x={cell.cx} y={cell.cy}>{seat + 1}</text>
          </g>
        )
      })}
    </svg>
  )
}

function fleetUnits(factionId: FactionId): { type: UnitType; count: number }[] {
  const totals = new Map<UnitType, number>()
  for (const su of FACTIONS[factionId].startingUnits) totals.set(su.type, (totals.get(su.type) ?? 0) + su.count)
  return FLEET_ORDER.filter(type => totals.has(type)).map(type => ({ type, count: totals.get(type) ?? 0 }))
}

/** R5's naming, without a player: the L1Z1X start with the Super-Dreadnought instead of a dreadnought. */
function unitName(factionId: FactionId, type: UnitType, count: number): string {
  if (type === 'dreadnought' && factionId === 'l1z1x') return count > 1 ? `${String(count)} Super-Dreadnoughts I` : 'Super-Dreadnought I'
  return count > 1 ? `${String(count)} ${UNIT_PLURAL[type]}` : UNIT_LABEL[type]
}

function fleetCaption(factionId: FactionId): string {
  return fleetUnits(factionId).map(({ type, count }) => unitName(factionId, type, count)).join(', ')
}

function spriteWidth(type: UnitType, style: ModelStyle): number {
  return spriteSize(type, FLEET_SPRITE_SCALE, style).width
}

/** "L1Z1X Mindnet": the digits are set in the condensed face, as in the mockup. */
function factionTitle(name: string): (string | ReactElement)[] {
  return name.split(/(\d)/).map((part, i) => (/\d/.test(part) ? <i className="dg" key={`${String(i)}${part}`}>{part}</i> : part))
}

/**
 * The commander portrait art only exists for a couple of factions so far (see
 * public/assets/factions/). Every other faction would otherwise show the browser's broken-image
 * glyph plus its spilling alt text — worse than having no portrait at all — so this falls back to
 * a monogram plate in the seat's colour, which reads as a deliberate placeholder rather than a
 * missing asset. `key={factionId}` on the caller resets the broken flag when the seat's faction
 * changes.
 */
function FactionPortrait({ factionId, name }: { factionId: FactionId; name: string }) {
  const [broken, setBroken] = useState(false)
  if (broken) {
    return (
      <div className="crop fallback" aria-hidden="true">
        <span>{name.trim().charAt(0).toUpperCase()}</span>
      </div>
    )
  }
  return (
    <div className={`crop ${factionId}`}>
      <img src={`/assets/factions/leader_${factionId}_commander.png`} alt={`${name} portrait`} onError={() => { setBroken(true) }} />
    </div>
  )
}

export function SetupScreen() {
  const { start } = useGame()
  const { style: modelStyle } = useModelStyle()
  const route = useHashRoute()
  // the games this browser holds, read once per visit to the lobby
  const [saved, setSaved] = useState(() => ({ games: listGames(), now: Date.now() }))
  const [playerCount, setPlayerCount] = useState<number>(6)
  const [names, setNames] = useState<string[]>(DEFAULT_NAMES)
  const [factions, setFactions] = useState<FactionId[]>(DEFAULT_FACTIONS)
  const [colours, setColours] = useState<Color[]>(DEFAULT_COLOURS)
  const [playerTypes, setPlayerTypes] = useState<PlayerType[]>(DEFAULT_TYPES)
  const [minutes, setMinutes] = useState(15)
  const [useMiltyDraft, setUseMiltyDraft] = useState(false)
  // the seat the pointer or the keyboard is in, so its home system flares on the plot
  const [litSeat, setLitSeat] = useState<number | null>(null)

  function setName(seat: number, value: string) {
    setNames(prev => {
      const next = [...prev]
      next[seat] = value
      return next
    })
  }
  function setColour(seat: number, value: Color) {
    setColours(prev => {
      const next = [...prev]
      next[seat] = value
      return next
    })
  }
  function setPlayerType(seat: number, value: PlayerType) {
    setPlayerTypes(prev => {
      const next = [...prev]
      next[seat] = value
      return next
    })
  }
  function setFaction(seat: number, value: FactionId) {
    setFactions(prev => {
      const next = [...prev]
      next[seat] = value
      return next
    })
  }
  function handleSetPlayerCount(newCount: number) {
    setPlayerCount(newCount)
    setFactions(prev => {
      const next = [...prev]
      const allFactionIds = Object.keys(FACTIONS) as FactionId[]
      for (let s = 0; s < newCount; s++) {
        if (next.slice(0, s).includes(next[s])) {
          const available = allFactionIds.find(f => !next.slice(0, s).includes(f))
          if (available) next[s] = available
        }
      }
      return next
    })
    setColours(prev => {
      const next = [...prev]
      for (let s = 0; s < newCount; s++) {
        if (next.slice(0, s).includes(next[s])) {
          const available = COLOURS.find(c => !next.slice(0, s).includes(c))
          if (available) next[s] = available
        }
      }
      return next
    })
    // Reset draft mode when player count changes
    if (useMiltyDraft) setUseMiltyDraft(false)
  }
  function onStart() {
    const seed = seedFromRoute(route, Math.floor(Math.random() * 0x7fffffff))
    const playerFactions = useMiltyDraft
      ? (() => {
          const allFactionIds = Object.keys(FACTIONS) as FactionId[]
          // Fisher-Yates shuffle: pick playerCount distinct factions from the full pool
          const shuffled = [...allFactionIds]
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
          }
          return shuffled.slice(0, playerCount)
        })()
      : factions
    start({
      players: Array.from({ length: playerCount }, (_, seat) => ({
        faction: playerFactions[seat],
        color: colours[seat],
        name: names[seat].trim() || `Player ${String(seat + 1)}`,
        playerType: playerTypes[seat],
      })),
      speaker: 0,
    }, seed, minutes)
  }
  function forget(code: string) {
    deleteGame(code)
    setSaved({ games: listGames(), now: Date.now() })
  }

  const live = playerTypes.slice(0, playerCount)
  const allAi = live.every(pt => pt === 'ai')
  const anyAi = live.some(pt => pt === 'ai')
  const systems = playerCount === 3 ? 34 : 37
  const startLabel = allAi ? 'Watch AI game' : anyAi ? 'Launch vs AI' : 'Launch hot-seat'

  return (
    <div className="preflight" data-testid="setup-screen">
      <SpaceBackdrop dim />

      <header className="pf-rail">
        <div className="pf-mark">
          <h1 className="pf-title">Twilight Imperium <i>IV</i></h1>
          <span className="pf-kicker">Pre-flight</span>
        </div>
        {/* A graduated rule, the same instrument chrome the board's decks carry, rather than empty band. */}
        <i className="pf-rule" aria-hidden="true" />
        <div className="pf-rail-set">
          <span className="lbl">Seats at the table</span>
          <div className="pf-seg pf-seg-lg player-count-picker" data-testid="player-count-picker">
            {[3, 4, 5, 6].map(count => (
              <button
                key={count}
                type="button"
                className={playerCount === count ? 'on' : ''}
                data-testid={`player-count-${count}`}
                aria-pressed={playerCount === count}
                onClick={() => { handleSetPlayerCount(count) }}
              >
                {count}
              </button>
            ))}
          </div>
        </div>
        <div className="pf-rail-end" data-testid="setup-music">
          <MusicButton className="pf-btn quiet" />
        </div>
      </header>

      <main className="pf-body">
        <aside className="pf-plan">
          <section className="pf-plot-card" data-testid="setup-map">
            <div className="pf-plot">
              <i className="pf-bracket tl" /><i className="pf-bracket tr" />
              <i className="pf-bracket bl" /><i className="pf-bracket br" />
              <GalaxyPlot playerCount={playerCount} colours={colours} lit={litSeat} />
            </div>
            <dl className="pf-facts">
              <div>
                <dt className="lbl">Map</dt>
                <dd>{`Generated Galaxy (${String(systems)} systems)`}</dd>
              </div>
              <div>
                <dt className="lbl">Centre</dt>
                <dd>Mecatol Rex, three rings out from every home</dd>
              </div>
              <div>
                <dt className="lbl">Homes</dt>
                <dd>{`${String(playerCount)} on the corners of the outer rim`}</dd>
              </div>
            </dl>
          </section>

          {saved.games.length > 0 ? (
            <section className="pf-block" aria-label="Saved games" data-testid="saved-games">
              <h2 className="lbl pf-block-head">In progress on this device</h2>
              <div className="pf-saves">
                {saved.games.map(game => (
                  <div className="pf-save" key={game.code} data-testid={`saved-game-${game.code}`}>
                    <span className="pf-save-code">{game.code}</span>
                    <span className="pf-save-who">{game.names.join(' · ')}</span>
                    <span className="pf-save-meta">
                      {`Round ${String(game.round)}`}<i /> {relativeTime(game.updatedAt, saved.now)}
                    </span>
                    <span className="pf-save-acts">
                      <button
                        type="button" className="pf-btn sm" data-testid={`btn-resume-${game.code}`}
                        onClick={() => { navigate(gamePath(game.code)) }}
                      >
                        Resume
                      </button>
                      <button
                        type="button" className="pf-btn sm plain" data-testid={`btn-delete-${game.code}`}
                        onClick={() => { forget(game.code) }}
                      >
                        Delete
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="pf-block pf-soon">
            <h2 className="lbl dim pf-block-head">Not on the network yet</h2>
            <div className="pf-soon-row" data-testid="landing-online">
              <p>Share a six-character code and a link; your opponents join from any browser.</p>
              <button type="button" className="pf-btn sm" data-testid="btn-create-online" disabled>Create lobby</button>
              <span className="pf-note">coming with online play</span>
            </div>
            <div className="pf-soon-row" data-testid="landing-join">
              <p>Enter the six-character code someone shared with you.</p>
              <button type="button" className="pf-btn sm" data-testid="btn-join-code" disabled>Join</button>
              <span className="pf-note">coming with online play</span>
            </div>
          </section>
        </aside>

        <section className="pf-manifest">
          <div className="pf-manifest-head">
            <h2 className="pf-manifest-title">Seat manifest</h2>
            <span className="pf-status" data-testid="lobby-status">
              {allAi
                ? <>AI versus AI<i /> watch or jump in later</>
                : anyAi
                  ? <>Human versus AI<i /> {playerCount} of {playerCount} seats taken</>
                  : <><b className="pf-live" />All {playerCount} seats on this device<i /> {playerCount} of {playerCount} seats taken</>}
            </span>
            <button
              type="button" className="pf-btn sm" data-testid="btn-swap-factions"
              onClick={() => { setFactions(prev => { const next = [...prev]; [next[0], next[1]] = [next[1], next[0]]; return next }) }}
            >
              Swap seats 1 and 2
            </button>
          </div>

          <div className="pf-cols" aria-hidden="true">
            <span className="lbl">Seat</span>
            <span className="lbl">Commander</span>
            <span className="lbl">Faction</span>
            <span className="lbl">Colour</span>
            <span className="lbl">Control</span>
            <span className="lbl">Starting fleet</span>
            <span className="lbl">Starting techs</span>
            <span className="lbl">Com</span>
          </div>

          <div className="pf-rows" id="seat-config">
            {Array.from({ length: playerCount }, (_, i) => i as Seat).map(seat => {
              const factionId = factions[seat]
              const faction = FACTIONS[factionId]
              const ink = COLOUR_INK[colours[seat]]
              const style = { '--accent': ink.accent, '--tint': ink.tint, '--glow': ink.glow } as CSSProperties
              return (
                <div
                  className="pf-seat" key={seat} style={style}
                  onMouseEnter={() => { setLitSeat(seat) }}
                  onMouseLeave={() => { setLitSeat(null) }}
                  onFocusCapture={() => { setLitSeat(seat) }}
                >
                  <div className="pf-id">
                    <b className="pf-id-n">{seat + 1}</b>
                    <span className="pf-id-pos" data-testid={`seat-position-${seat}`}>{POSITIONS[playerCount]?.[seat] ?? `Seat ${String(seat + 1)}`}</span>
                  </div>

                  <div className="pf-who">
                    <div className="pf-portrait">
                      <FactionPortrait key={factionId} factionId={factionId} name={faction.name} />
                    </div>
                    <div className="pf-who-text">
                      <input
                        className="pf-name" data-testid={`seat-name-${seat}`} value={names[seat]}
                        aria-label={`Name of seat ${String(seat + 1)}`} onChange={e => { setName(seat, e.target.value) }}
                      />
                      <div className="pf-faction" data-testid={`seat-faction-${seat}`}>{factionTitle(faction.name)}</div>
                    </div>
                  </div>

                  <div className="pf-cell">
                    <img
                      className="pf-sigil" src={`/assets/factions/${factionId}.png`} alt="" data-testid={`seat-symbol-${seat}`}
                      onError={e => { e.currentTarget.style.visibility = 'hidden' }}
                    />
                    <select
                      className="pf-select"
                      data-testid={`select-faction-${seat}`}
                      aria-label={`Faction for seat ${String(seat + 1)}`}
                      value={factionId}
                      onChange={e => { setFaction(seat, e.target.value as FactionId) }}
                    >
                      {Object.values(FACTIONS).map(f => {
                        const isTaken = factions.slice(0, playerCount).some((fid, s) => s !== seat && fid === f.id)
                        return (
                          <option key={f.id} value={f.id} disabled={isTaken}>
                            {f.name}{isTaken ? ' (chosen)' : ''}
                          </option>
                        )
                      })}
                    </select>
                  </div>

                  <div className="pf-cell pf-colour">
                    <div className="pf-swatches">
                      {COLOURS.map(colour => (
                        <button
                          key={colour} type="button"
                          className={`pf-sw ${colour}${colours[seat] === colour ? ' sel' : ''}`}
                          data-testid={`colour-${seat}-${colour}`}
                          title={COLOUR_NAMES[colour]}
                          aria-label={COLOUR_NAMES[colour]}
                          disabled={colours.slice(0, playerCount).some((c, s) => s !== seat && c === colour)}
                          onClick={() => { setColour(seat, colour) }}
                        />
                      ))}
                    </div>
                    <span className="pf-chosen" data-testid={`chosen-colour-${seat}`}>{COLOUR_NAMES[colours[seat]]}</span>
                  </div>

                  <div className="pf-cell pf-control">
                    <div className="pf-seg" data-testid={`controller-${seat}`}>
                      <button
                        type="button"
                        className={playerTypes[seat] === 'human' ? 'on' : ''}
                        data-testid={`controller-${seat}-human`}
                        aria-pressed={playerTypes[seat] === 'human'}
                        onClick={() => { setPlayerType(seat, 'human') }}
                      >
                        Human
                      </button>
                      <button
                        type="button"
                        className={playerTypes[seat] === 'ai' ? 'on' : ''}
                        data-testid={`controller-${seat}-ai`}
                        aria-pressed={playerTypes[seat] === 'ai'}
                        onClick={() => { setPlayerType(seat, 'ai') }}
                      >
                        AI
                      </button>
                    </div>
                    <span className="pf-chosen" data-testid={`controller-${seat}-label`}>
                      {playerTypes[seat] === 'ai' ? 'Computer' : 'Local player'}
                    </span>
                  </div>

                  <div className="pf-cell pf-fleet">
                    <div className="pf-units" data-testid={`seat-${seat}-fleet`}>
                      {fleetUnits(factionId).map(({ type, count }) => (
                        <div className="pf-unit" key={type} data-testid={`seat-${seat}-fleet-${type}`} title={unitName(factionId, type, count)}>
                          <img src={spriteUrl(colours[seat], type, modelStyle)} width={spriteWidth(type, modelStyle)} alt="" />
                          {BADGE_TYPES.includes(type) && (
                            <span className="pf-cnt" data-testid={`seat-${seat}-fleet-${type}-count`}>{count}</span>
                          )}
                        </div>
                      ))}
                    </div>
                    <span className="pf-caption" data-testid={`seat-${seat}-fleet-caption`}>{fleetCaption(factionId)}</span>
                  </div>

                  <div className="pf-cell pf-techs" data-testid={`seat-${seat}-techs`}>
                    {faction.startingTechs.map(techDef).map((tech, i) => (
                      <Fragment key={tech.id}>
                        {i > 0 ? <span className="sep">{', '}</span> : null}
                        <span className="ti"><img src={techIconUrl(tech.colour ?? 'blue')} alt="" /></span>
                        {tech.name}
                      </Fragment>
                    ))}
                  </div>

                  <div className="pf-cell pf-comm">
                    <span className="pf-comm-v" data-testid={`seat-${seat}-commodities`}>
                      <img src={MISC.commodity} alt="" width={15} height={15} />
                      <b>{faction.commodityValue}</b>
                    </span>
                  </div>
                </div>
              )
            })}
            {/* Seats this table does not use are sealed sockets rather than absent rows: the rack keeps its
                six bays, so changing the seat count reads as arming and sealing seats, not as the list
                growing and shrinking. */}
            {Array.from({ length: 6 - playerCount }, (_, i) => playerCount + i).map(seat => (
              <div className="pf-seat sealed" key={`sealed-${String(seat)}`} aria-hidden="true">
                <div className="pf-id">
                  <b className="pf-id-n">{seat + 1}</b>
                  <span className="pf-id-pos">Sealed</span>
                </div>
                <span className="pf-sealed-note">No seat at a {playerCount}-player table</span>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="pf-launch">
        <div className="pf-set" data-testid="setup-mode">
          <span className="lbl">Draft</span>
          <div className="pf-seg" data-testid="draft-mode-picker">
            <button
              type="button" className={useMiltyDraft ? '' : 'on'} data-testid="btn-quick-start"
              aria-pressed={!useMiltyDraft} onClick={() => { setUseMiltyDraft(false) }}
            >
              Quick start
            </button>
            <button
              type="button" className={useMiltyDraft ? 'on' : ''} data-testid="btn-milty-draft"
              aria-pressed={useMiltyDraft} onClick={() => { setUseMiltyDraft(true) }}
            >
              Milty draft
            </button>
          </div>
          <span className="pf-set-sub">{useMiltyDraft ? 'Randomised balanced factions' : 'The factions on the manifest'}</span>
        </div>

        <div className="pf-set" data-testid="setup-clock">
          <span className="lbl">Clock</span>
          <label className="pf-clock">
            <input
              type="number" min={1} max={60} className="pf-min" data-testid="minutes"
              value={minutes} onChange={e => { setMinutes(Math.max(1, Number.parseInt(e.target.value, 10) || 1)) }}
            />
            <span>minutes per player</span>
          </label>
          <span className="pf-set-sub">Runs whenever it is your turn to decide</span>
        </div>

        <div className="pf-set" data-testid="setup-target">
          <span className="lbl">Target</span>
          <strong className="pf-set-val">10 victory points or 8 rounds</strong>
          <span className="pf-set-sub">First to 10 points claims the galactic throne</span>
        </div>

        <div className="pf-go" data-testid="landing-hotseat">
          <button type="button" className="pf-launch-btn" data-testid="btn-start" onClick={onStart}>{startLabel}</button>
          <span className="pf-set-sub">{`Hot-seat, pass the tablet, chess clock ${String(minutes)} minutes each.`}</span>
        </div>
      </footer>

      <p className="pf-legal" data-testid="setup-legal">
        Fan project. Twilight Imperium and its artwork belong to Fantasy Flight Games. Unit, tile and card images via AsyncTI4.
        {' '}Music by Kevin MacLeod (incompetech.com), licensed under Creative Commons By Attribution 4.0.
      </p>
    </div>
  )
}
