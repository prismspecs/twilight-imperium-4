import type { CSSProperties, ReactElement } from 'react'
import { tileUrl } from '../art'
import type { DraftSlice } from '../../engine/draft/sliceGenerator'
import type { TileDef } from '../../data/tiles'
import type { TechColor } from '../../engine/types'

export interface SliceHexViewProps {
  slice: DraftSlice
  interactive?: boolean
  onTileClick?: (tile: TileDef) => void
  style?: CSSProperties
  className?: string
}

interface PositionDef {
  key: string
  label: string
  shortLabel: string
  cx: number
  cy: number
}

const HEX_RADIUS = 33
const HEX_HEIGHT = Math.sqrt(3) * HEX_RADIUS // ~57.16

/**
 * Positions of the 5 slice systems and the home system in the standard Milty Draft wedge:
 * - Tile 4: Mecatol Adjacent (Top center)
 * - Tile 1: Front (Center)
 * - Tile 3: Equidistant (Top left)
 * - Tile 0: Left (Bottom left)
 * - Tile 2: Right (Bottom right)
 * - Home: Player Home System (Bottom center)
 */
const POSITIONS: readonly PositionDef[] = [
  { key: 'left', label: 'Left', shortLabel: 'L', cx: 79, cy: 130.5 },
  { key: 'front', label: 'Front', shortLabel: 'F', cx: 130, cy: 101 },
  { key: 'right', label: 'Right', shortLabel: 'R', cx: 181, cy: 130.5 },
  { key: 'equidistant', label: 'Equidistant', shortLabel: 'EQ', cx: 79, cy: 71.5 },
  { key: 'mecatol', label: 'Mecatol Adj', shortLabel: 'MR', cx: 130, cy: 42 },
]

const HOME_HEX: PositionDef = {
  key: 'home',
  label: 'HOME',
  shortLabel: 'H',
  cx: 130,
  cy: 160,
}

function flatHexPoints(cx: number, cy: number, r: number): string {
  const h = (Math.sqrt(3) * r) / 2
  const rHalf = r / 2
  const p1 = `${(cx - rHalf).toFixed(2)},${(cy - h).toFixed(2)}`
  const p2 = `${(cx + rHalf).toFixed(2)},${(cy - h).toFixed(2)}`
  const p3 = `${(cx + r).toFixed(2)},${cy.toFixed(2)}`
  const p4 = `${(cx + rHalf).toFixed(2)},${(cy + h).toFixed(2)}`
  const p5 = `${(cx - rHalf).toFixed(2)},${(cy + h).toFixed(2)}`
  const p6 = `${(cx - r).toFixed(2)},${cy.toFixed(2)}`
  return `${p1} ${p2} ${p3} ${p4} ${p5} ${p6}`
}

function techSkipColor(color: TechColor): string {
  switch (color) {
    case 'green': return '#22c55e'
    case 'blue': return '#3b82f6'
    case 'yellow': return '#eab308'
    case 'red': return '#ef4444'
    default: return '#94a3b8'
  }
}

function techSkipLetter(color: TechColor): string {
  switch (color) {
    case 'green': return 'G'
    case 'blue': return 'B'
    case 'yellow': return 'Y'
    case 'red': return 'R'
    default: return '?'
  }
}

export function SliceHexView({
  slice,
  interactive = false,
  onTileClick,
  style,
  className = '',
}: SliceHexViewProps): ReactElement {
  const homePts = flatHexPoints(HOME_HEX.cx, HOME_HEX.cy, HEX_RADIUS)

  return (
    <div
      className={`slice-hex-container ${className}`}
      data-testid={`slice-hex-view-${slice.id}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
        userSelect: 'none',
        ...style,
      }}
    >
      <svg
        viewBox="0 0 260 205"
        className="slice-hex-svg"
        style={{
          width: '100%',
          height: 'auto',
          overflow: 'visible',
        }}
      >
        <defs>
          {POSITIONS.map(pos => {
            const pts = flatHexPoints(pos.cx, pos.cy, HEX_RADIUS - 1)
            return (
              <clipPath key={`clip-${slice.id}-${pos.key}`} id={`clip-${slice.id}-${pos.key}`}>
                <polygon points={pts} />
              </clipPath>
            )
          })}
        </defs>

        {/* Top guide label: Towards Mecatol Rex */}
        <text
          x={130}
          y={10}
          textAnchor="middle"
          fill="#ffd700"
          fontSize="9"
          fontWeight="700"
          letterSpacing="0.05em"
          opacity="0.85"
        >
          ▲ MECATOL REX
        </text>

        {/* 5 Slice Systems */}
        {POSITIONS.map((pos, idx) => {
          const tile = slice.tiles[idx]
          if (!tile) return null

          const pts = flatHexPoints(pos.cx, pos.cy, HEX_RADIUS)
          const imgUrl = tileUrl('', String(tile.tile), true)
          const isRed = tile.back === 'red' || tile.category === 'red_anomaly_or_empty'
          const res = tile.planets.reduce((sum, p) => sum + p.resources, 0)
          const inf = tile.planets.reduce((sum, p) => sum + p.influence, 0)
          const hasPlanets = tile.planets.length > 0
          const techSkip = tile.planets.find(p => p.techSkip)?.techSkip
          const wormhole = tile.wormholes[0]
          const anomaly = tile.anomalies[0]

          // Tooltip description
          const tooltipLines = [
            `${tile.name} (Tile #${tile.tile})`,
            `Position: ${pos.label}`,
          ]
          if (hasPlanets) {
            tooltipLines.push(
              ...tile.planets.map(
                p => `• ${p.name}: ${p.resources}r / ${p.influence}i${p.techSkip ? ` (${p.techSkip} skip)` : ''}`
              ),
              `Total: ${res} Res / ${inf} Inf`
            )
          }
          if (anomaly) tooltipLines.push(`Anomaly: ${anomaly.replace('_', ' ')}`)
          if (wormhole) tooltipLines.push(`Wormhole: ${wormhole}`)

          return (
            <g
              key={pos.key}
              data-testid={`slice-tile-${tile.tile}`}
              className="slice-hex-cell"
              style={{ cursor: interactive ? 'pointer' : 'default' }}
              onClick={() => onTileClick?.(tile)}
            >
              <title>{tooltipLines.join('\n')}</title>

              {/* Background fallback */}
              <polygon
                points={pts}
                fill={isRed ? '#231215' : '#0e1726'}
              />

              {/* High-res tile face art */}
              <image
                data-testid={`slice-tile-img-${tile.tile}`}
                href={imgUrl}
                x={pos.cx - HEX_RADIUS}
                y={pos.cy - HEX_HEIGHT / 2}
                width={HEX_RADIUS * 2}
                height={HEX_HEIGHT}
                clipPath={`url(#clip-${slice.id}-${pos.key})`}
                preserveAspectRatio="xMidYMid slice"
              />

              {/* Hexagonal border stroke */}
              <polygon
                points={pts}
                fill="none"
                stroke={isRed ? 'rgba(239, 68, 68, 0.75)' : 'rgba(59, 130, 246, 0.75)'}
                strokeWidth="1.5"
                className="slice-border-poly"
              />

              {/* Top pill: Tile Number */}
              <g transform={`translate(${pos.cx}, ${pos.cy - 16})`}>
                <rect
                  x="-13"
                  y="-7"
                  width="26"
                  height="12"
                  rx="3"
                  fill="rgba(10, 15, 26, 0.85)"
                  stroke="rgba(255, 255, 255, 0.2)"
                  strokeWidth="0.75"
                />
                <text
                  textAnchor="middle"
                  y="2.5"
                  fill="#ffd700"
                  fontSize="8"
                  fontWeight="bold"
                >
                  #{tile.tile}
                </text>
              </g>

              {/* Center Position Label */}
              <g transform={`translate(${pos.cx}, ${pos.cy - 4})`}>
                <rect
                  x="-23"
                  y="-5"
                  width="46"
                  height="10"
                  rx="2"
                  fill="rgba(0, 0, 0, 0.65)"
                />
                <text
                  textAnchor="middle"
                  y="3"
                  fill="#94a3b8"
                  fontSize="7"
                  fontWeight="600"
                  letterSpacing="0.02em"
                >
                  {pos.label}
                </text>
              </g>

              {/* Bottom stats / anomaly pill */}
              <g transform={`translate(${pos.cx}, ${pos.cy + 14})`}>
                {hasPlanets ? (
                  <>
                    <rect
                      x={techSkip || wormhole ? '-24' : '-19'}
                      y="-7"
                      width={techSkip || wormhole ? '48' : '38'}
                      height="13"
                      rx="3"
                      fill="rgba(15, 23, 42, 0.9)"
                      stroke="rgba(255, 255, 255, 0.25)"
                      strokeWidth="0.75"
                    />
                    <text
                      textAnchor="middle"
                      y="3"
                      fontSize="8"
                      fontWeight="bold"
                    >
                      <tspan fill="#f59e0b">{res}</tspan>
                      <tspan fill="#94a3b8"> / </tspan>
                      <tspan fill="#38bdf8">{inf}</tspan>
                    </text>
                    {techSkip && (
                      <>
                        <circle
                          cx="18"
                          cy="-0.5"
                          r="4"
                          fill={techSkipColor(techSkip)}
                          stroke="#0f172a"
                          strokeWidth="0.5"
                        />
                        <text
                          x="18"
                          y="1.5"
                          textAnchor="middle"
                          fill="#0f172a"
                          fontSize="5.5"
                          fontWeight="bold"
                        >
                          {techSkipLetter(techSkip)}
                        </text>
                      </>
                    )}
                    {wormhole && !techSkip && (
                      <text
                        x="18"
                        y="2.5"
                        textAnchor="middle"
                        fill="#c084fc"
                        fontSize="8"
                        fontWeight="bold"
                      >
                        {wormhole === 'alpha' ? 'α' : wormhole === 'beta' ? 'β' : 'δ'}
                      </text>
                    )}
                  </>
                ) : (
                  <rect
                    x="-22"
                    y="-7"
                    width="44"
                    height="13"
                    rx="3"
                    fill="rgba(239, 68, 68, 0.25)"
                    stroke="rgba(239, 68, 68, 0.5)"
                    strokeWidth="0.75"
                  />
                )}
                {!hasPlanets && (
                  <text
                    textAnchor="middle"
                    y="3"
                    fill={isRed ? '#fca5a5' : '#94a3b8'}
                    fontSize="7"
                    fontWeight="600"
                  >
                    {wormhole
                      ? `${wormhole === 'alpha' ? 'α' : wormhole === 'beta' ? 'β' : 'δ'} Hole`
                      : anomaly
                      ? anomaly.replace('_', ' ').slice(0, 8)
                      : 'Void'}
                  </text>
                )}
              </g>
            </g>
          )
        })}

        {/* Ghost Home Hex */}
        <g data-testid="slice-home-hex" className="slice-home-hex">
          <polygon
            points={homePts}
            fill="rgba(30, 41, 59, 0.55)"
            stroke="rgba(255, 215, 0, 0.5)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
          <text
            x={HOME_HEX.cx}
            y={HOME_HEX.cy - 2}
            textAnchor="middle"
            fill="#ffd700"
            fontSize="10"
            fontWeight="bold"
            letterSpacing="0.05em"
          >
            HOME
          </text>
          <text
            x={HOME_HEX.cx}
            y={HOME_HEX.cy + 10}
            textAnchor="middle"
            fill="#94a3b8"
            fontSize="7"
            fontWeight="600"
          >
            Your System
          </text>
        </g>
      </svg>
    </div>
  )
}
