import { Fragment, useRef, useState } from 'react'
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
import { useFitScale } from '../useViewportScale'
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
/** The swatch colours, the tint the seat's copy is set in, and the glow behind its unit sprites. */
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
// in v1's two starting fleets, so a badge would just always read "1".
const BADGE_TYPES: readonly UnitType[] = ['fighter', 'infantry']
// The row's sprites are sized proportionally to the actual ships via src/ui/sprites.ts, the shared copy of
// public/assets/sprites/manifest.json's world scale.
const FLEET_SPRITE_SCALE = 14

/**
 * The lobby is drawn in a 1440x900 frame and `useFitScale` scales that frame to the viewport. The
 * saved-games block makes the page taller than the frame, so the page is scaled down by whatever it adds
 * and keeps fitting instead of growing a scrollbar. The three numbers mirror `.saved` in setup.css.
 */
const PAGE_H = 900
/** the block's top margin plus its panel padding */
const SAVED_BLOCK_H = 68
/** one `.gamerow` */
const SAVED_ROW_H = 52
/** `.glist` stops at three and a half rows and scrolls; the page never grows past that */
const SAVED_LIST_H = 182

function fleetUnits(factionId: FactionId): { type: UnitType; count: number }[] {
  const totals = new Map<UnitType, number>()
  for (const su of FACTIONS[factionId].startingUnits) totals.set(su.type, (totals.get(su.type) ?? 0) + su.count)
  return FLEET_ORDER.filter(type => totals.has(type)).map(type => ({ type, count: totals.get(type) ?? 0 }))
}

/** R5's naming, without a player: the L1Z1X start with the Super-Dreadnought instead of a dreadnought. */
function unitName(factionId: FactionId, type: UnitType, count: number): string {
  if (type === 'dreadnought' && factionId === 'l1z1x') return count > 1 ? `${count} Super-Dreadnoughts I` : 'Super-Dreadnought I'
  return count > 1 ? `${count} ${UNIT_PLURAL[type]}` : UNIT_LABEL[type]
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

export function SetupScreen() {
  const { start } = useGame()
  const { style: modelStyle } = useModelStyle()
  const route = useHashRoute()
  // the page is drawn for a 1440x900 frame; scale it until it fills the viewport (credits line at the foot)
  const fit = useFitScale()
  // the games this browser holds, read once per visit to the lobby
  const [saved, setSaved] = useState(() => ({ games: listGames(), now: Date.now() }))
  const [playerCount, setPlayerCount] = useState<number>(6)
  const [names, setNames] = useState<string[]>(DEFAULT_NAMES)
  const [factions, setFactions] = useState<FactionId[]>(DEFAULT_FACTIONS)
  const [colours, setColours] = useState<Color[]>(DEFAULT_COLOURS)
  const [playerTypes, setPlayerTypes] = useState<PlayerType[]>(DEFAULT_TYPES)
  const [minutes, setMinutes] = useState(15)
  const [useMiltyDraft, setUseMiltyDraft] = useState(false)
  const seatConfigRef = useRef<HTMLDivElement | null>(null)

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
    if (useMiltyDraft) {
      setUseMiltyDraft(false)
    }
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
        name: names[seat].trim() || `Player ${seat + 1}`,
        playerType: playerTypes[seat],
      })),
      speaker: 0,
    }, seed, minutes)
  }
  function forget(code: string) {
    deleteGame(code)
    setSaved({ games: listGames(), now: Date.now() })
  }
  function goToSeats() {
    const node = seatConfigRef.current
    if (node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ behavior: 'smooth' })
  }

  const pageHeight = saved.games.length === 0
    ? PAGE_H
    : PAGE_H + SAVED_BLOCK_H + Math.min(SAVED_LIST_H, SAVED_ROW_H * saved.games.length)
  const zoom = Math.round(fit * (PAGE_H / pageHeight) * 1000) / 1000

  return (
    <div className="setup lobbyui" data-testid="setup-screen" style={{ zoom }}>
      <SpaceBackdrop dim />

      <header className="hero">
        <h1 className="title goldtext">Twilight Imperium IV</h1>
        <div className="rule"><span /><i className="dia" /><span /></div>
        <p className="tagline">The board game of galactic conquest, diplomacy, and trade</p>
      </header>

      {saved.games.length > 0 ? (
        <section className="box saved" aria-label="Saved games" data-testid="saved-games">
          <div className="frame panel">
            <div className="glist">
              {saved.games.map(game => (
                <div className="gamerow" key={game.code} data-testid={`saved-game-${game.code}`}>
                  <span className="gcode">{game.code}</span>
                  <span className="gwho">
                    {game.names.length <= 2
                      ? <>{game.names[0]}<i className="vs">vs</i>{game.names[1]}</>
                      : game.names.join(' · ')}
                  </span>
                  <span className="gmeta">
                    Round {game.round}<span className="sep" />{relativeTime(game.updatedAt, saved.now)}
                  </span>
                  <div className="gacts">
                    <button
                      type="button" className="btn ghost sm" data-testid={`btn-resume-${game.code}`}
                      onClick={() => { navigate(gamePath(game.code)) }}
                    >
                      Resume
                    </button>
                    <button
                      type="button" className="btn plain sm" data-testid={`btn-delete-${game.code}`}
                      onClick={() => { forget(game.code) }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="tab"><b>Saved games</b>&nbsp; On this device</div>
        </section>
      ) : null}

      <section className="menu" aria-label="Game mode">
        <div className="box primary" data-testid="landing-hotseat">
          <div className="frame panel">
            <div className="lead">
              <div className="ico">
                <img src="/assets/tokens/l1z1x_command.png" alt="" />
                <img src="/assets/tokens/letnev_command.png" alt="" />
              </div>
              <p className="line"><span className="lbl">Hot-seat</span>Pass the tablet, chess clock {minutes} minutes each.</p>
            </div>
            <div className="foot">
              <button type="button" className="btn gold big" data-testid="btn-play-device" onClick={goToSeats}>Play hot-seat</button>
              <span className="note">No account, no network</span>
            </div>
          </div>
          <div className="tab">Play on this device</div>
        </div>

        <div className="box quiet" data-testid="landing-online">
          <div className="frame panel">
            <div className="lead">
              <svg width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
                <circle cx="15" cy="15" r="3" fill="currentColor" stroke="none" />
                <circle cx="15" cy="15" r="8" /><circle cx="15" cy="15" r="13" strokeOpacity=".55" />
                <path d="M3 15h5M22 15h5M15 3v5M15 22v5" strokeOpacity=".8" />
              </svg>
              <p className="line"><span className="lbl">Online</span>You get a six-character code and a link. Your opponent joins from any browser.</p>
            </div>
            <div className="foot">
              <button type="button" className="btn ghost" data-testid="btn-create-online" disabled>Create lobby</button>
              <span className="note">coming with online play</span>
            </div>
          </div>
          <div className="tab">Create online lobby</div>
        </div>

        <div className="box quiet" data-testid="landing-join">
          <div className="frame panel">
            <div className="lead">
              <p className="line"><span className="lbl">Code</span>Enter the six-character code your opponent shared.</p>
            </div>
            <div className="code">
              <div className="codefield">
                <input type="text" placeholder="K7X2QP" aria-label="Lobby code" disabled />
              </div>
              <button type="button" className="btn ghost" data-testid="btn-join-code" disabled>Join</button>
            </div>
            <span className="note">coming with online play</span>
          </div>
          <div className="tab">Join with a code</div>
        </div>
      </section>

      <section className="box lobby">
        <div className="frame panel">
          <div className="lobby-head">
            <div className="mode">
              <span className="lbl">Players</span>
              <div className="segtoggle player-count-picker" data-testid="player-count-picker">
                {[3, 4, 5, 6].map(count => (
                  <button
                    key={count}
                    type="button"
                    className={playerCount === count ? 'on' : ''}
                    data-testid={`player-count-${count}`}
                    aria-pressed={playerCount === count}
                    onClick={() => handleSetPlayerCount(count)}
                  >
                    {count}P
                  </button>
                ))}
              </div>
              <span className="lbl">Mode</span>
              <div className="linkbox"><span>This device{playerTypes.slice(0, playerCount).some(pt => pt === 'ai') ? ', AI turns play themselves' : ', pass it between turns'}</span></div>
              <button
                type="button"
                className="btn ghost sm"
                data-testid="btn-swap-factions"
                onClick={() => setFactions(prev => {
                  const next = [...prev]
                  const tmp = next[0]
                  next[0] = next[1]
                  next[1] = tmp
                  return next
                })}
              >
                Swap factions
              </button>
            </div>
            <div className="status" data-testid="lobby-status">
              {playerTypes.slice(0, playerCount).every(pt => pt === 'ai')
                ? <>AI versus AI<span className="sep" />watch or jump in later</>
                : playerTypes.slice(0, playerCount).some(pt => pt === 'ai')
                  ? <>Human versus AI<span className="sep" />{playerCount} of {playerCount} seats taken</>
                  : <><i className="pulse" />{playerCount === 2 ? 'Both' : `All ${playerCount}`} seats on this device<span className="sep" />{playerCount} of {playerCount} seats taken</>}
            </div>
          </div>

          <div className="seats" id="seat-config" ref={seatConfigRef}>
            {Array.from({ length: playerCount }, (_, i) => i as Seat).map(seat => {
              const factionId = factions[seat]
              const faction = FACTIONS[factionId]
              const ink = COLOUR_INK[colours[seat]]
              const style = { '--accent': ink.accent, '--tint': ink.tint, '--glow': ink.glow } as CSSProperties
              return (
                <div className="frame seat" key={seat} style={style}>
                  <div className="pcol">
                    <div className="portrait">
                      <i className="tl" /><i className="tr" /><i className="bl" /><i className="br" />
                      <div className={`crop ${factionId}`}>
                        <img src={`/assets/factions/leader_${factionId}_commander.png`} alt={`${faction.name} portrait`} />
                      </div>
                    </div>
                    <img className="fsym" src={`/assets/factions/${factionId}.png`} alt="" data-testid={`seat-symbol-${seat}`} />
                  </div>

                  <div className="seat-body">
                    <div className="seat-top">
                      <span className="lbl">Seat {seat + 1}</span>
                      <span className="chip pos" data-testid={`seat-position-${seat}`}>{POSITIONS[playerCount]?.[seat] ?? `Seat ${seat + 1}`}</span>
                      <span className="chip ok">Faction chosen</span>
                    </div>
                    <div className="row controller">
                      <span className="lbl">Controller</span>
                      <div className="segtoggle" data-testid={`controller-${seat}`}>
                        <button
                          type="button"
                          className={playerTypes[seat] === 'human' ? 'on' : ''}
                          data-testid={`controller-${seat}-human`}
                          aria-pressed={playerTypes[seat] === 'human'}
                          onClick={() => setPlayerType(seat, 'human')}
                        >
                          Human
                        </button>
                        <button
                          type="button"
                          className={playerTypes[seat] === 'ai' ? 'on' : ''}
                          data-testid={`controller-${seat}-ai`}
                          aria-pressed={playerTypes[seat] === 'ai'}
                          onClick={() => setPlayerType(seat, 'ai')}
                        >
                          AI
                        </button>
                      </div>
                      <span className="chosen" data-testid={`controller-${seat}-label`}>
                        {playerTypes[seat] === 'ai' ? 'Computer' : 'Local player'}
                      </span>
                    </div>
                    <input
                      className="namefield" data-testid={`seat-name-${seat}`} value={names[seat]}
                      aria-label={`Name of seat ${seat + 1}`} onChange={e => setName(seat, e.target.value)}
                    />
                    <div className="faction-row">
                      <div className="faction goldtext" data-testid={`seat-faction-${seat}`}>{factionTitle(faction.name)}</div>
                      <select
                        className="faction-select"
                        data-testid={`select-faction-${seat}`}
                        aria-label={`Faction for seat ${seat + 1}`}
                        value={factionId}
                        onChange={e => setFaction(seat, e.target.value as FactionId)}
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

                    <div className="row colour">
                      <span className="lbl">Colour</span>
                      <div className="swatches">
                        {COLOURS.map(colour => (
                          <button
                            key={colour} type="button"
                            className={`sw ${colour}${colours[seat] === colour ? ' sel' : ''}`}
                            data-testid={`colour-${seat}-${colour}`}
                            title={COLOUR_NAMES[colour]}
                            aria-label={COLOUR_NAMES[colour]}
                            disabled={colours.slice(0, playerCount).some((c, s) => s !== seat && c === colour)}
                            onClick={() => setColour(seat, colour)}
                          />
                        ))}
                      </div>
                      <span className="chosen" data-testid={`chosen-colour-${seat}`}>{COLOUR_NAMES[colours[seat]]}</span>
                    </div>

                    <div className="row fleet">
                      <span className="lbl">Starting fleet</span>
                      <div className="units" data-testid={`seat-${seat}-fleet`}>
                        {fleetUnits(factionId).map(({ type, count }) => (
                          <div className="unit" key={type} data-testid={`seat-${seat}-fleet-${type}`} title={unitName(factionId, type, count)}>
                            <img src={spriteUrl(colours[seat], type, modelStyle)} width={spriteWidth(type, modelStyle)} alt="" />
                            {BADGE_TYPES.includes(type) && (
                              <span className="cnt" data-testid={`seat-${seat}-fleet-${type}-count`}>{count}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="fleet-caption" data-testid={`seat-${seat}-fleet-caption`}>{fleetCaption(factionId)}</div>

                    <div className="row techs">
                      <span className="lbl">Starting techs</span>
                      <span className="techlist" data-testid={`seat-${seat}-techs`}>
                        {faction.startingTechs.map(techDef).map((tech, i) => (
                          <Fragment key={tech.id}>
                            {i > 0 ? <span className="sep">{', '}</span> : null}
                            <span className="ti">
                              <img src={techIconUrl(tech.colour ?? 'blue')} alt="" />
                            </span>
                            {tech.name}
                          </Fragment>
                        ))}
                      </span>
                    </div>

                    <div className="row commodities">
                      <span className="lbl">Commodities</span>
                      <span className="val comm-val" data-testid={`seat-${seat}-commodities`}>
                        <img src={MISC.commodity} alt="" width={16} height={16} />
                        <b>{faction.commodityValue}</b>
                      </span>
                    </div>
                  </div>

                  <img className="sigil" src={`/assets/factions/${factionId}.png`} alt="" />
                </div>
              )
            })}
          </div>

          <div className="settings">
            <div className="cell" data-testid="setup-map">
              <div className="minimap galaxy-mini" aria-hidden="true">
                <img src="/assets/tiles/18_MR.png" className="mr" alt="" style={{ position: 'relative', width: 40, height: 35, margin: '20px auto 0', display: 'block' }} />
              </div>
              <div>
                <div className="lbl"><i className="dia" />Map</div>
                <div className="val">{`Generated Galaxy (${playerCount === 3 ? 34 : 37} systems)`}</div>
                <div className="sub">
                  {`${playerCount} home systems on outer rim, Mecatol Rex in centre, balanced galaxy tiles`}
                </div>
              </div>
            </div>
            <div className="cell" data-testid="setup-mode">
              <div>
                <div className="lbl"><i className="dia" />Draft</div>
                <div className="segtoggle" data-testid="draft-mode-picker">
                  <button
                    type="button"
                    className={!useMiltyDraft ? 'on' : ''}
                    data-testid="btn-quick-start"
                    aria-pressed={!useMiltyDraft}
                    onClick={() => setUseMiltyDraft(false)}
                  >
                    Quick start
                  </button>
                  <button
                    type="button"
                    className={useMiltyDraft ? 'on' : ''}
                    data-testid="btn-milty-draft"
                    aria-pressed={useMiltyDraft}
                    onClick={() => setUseMiltyDraft(true)}
                  >
                    Milty draft
                  </button>
                </div>
                <div className="sub">
                  {useMiltyDraft
                    ? "Multi-player draft with randomized balanced factions"
                    : "Standard setup with predefined factions"}
                </div>
              </div>
            </div>
            <div className="cell" data-testid="setup-clock">
              <div>
                <div className="lbl"><i className="dia" />Clock</div>
                <label className="val clockfield">
                  <input
                    type="number" min={1} max={60} className="minfield" data-testid="minutes"
                    value={minutes} onChange={e => setMinutes(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
                  />
                  minutes per player
                </label>
                <div className="sub">Chess clock, runs whenever it is your turn to decide</div>
              </div>
            </div>
            <div className="cell" data-testid="setup-music">
              <div>
                <div className="lbl"><i className="dia" />Music</div>
                <div className="stylepick"><MusicButton className="btn ghost sm" /></div>
              </div>
            </div>
            <div className="cell" data-testid="setup-target">
              <div>
                <div className="lbl"><i className="dia" />Target</div>
                <div className="val">10 victory points or 8 rounds</div>
                <div className="sub">First to 10 points claims the galactic throne</div>
              </div>
            </div>
            <button type="button" className="btn gold big" data-testid="btn-start" onClick={onStart}>
              {playerTypes.slice(0, playerCount).every(pt => pt === 'ai') ? 'Watch AI game' : playerTypes.slice(0, playerCount).some(pt => pt === 'ai') ? 'Play vs AI' : 'Play hot-seat'}
            </button>
          </div>
        </div>
        <div className="tab" data-testid="lobby-tab"><b>Lobby</b>&nbsp; {playerTypes.slice(0, playerCount).every(pt => pt === 'ai') ? 'AI vs AI' : playerTypes.slice(0, playerCount).some(pt => pt === 'ai') ? 'vs AI' : 'Hot-seat'}</div>
      </section>

      <p className="legal" data-testid="setup-legal">
        Fan project. Twilight Imperium and its artwork belong to Fantasy Flight Games. Unit, tile and card images via AsyncTI4.
        {' '}Music by Kevin MacLeod (incompetech.com), licensed under Creative Commons By Attribution 4.0.
      </p>
    </div>
  )
}
