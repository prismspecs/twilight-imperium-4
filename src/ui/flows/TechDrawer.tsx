import { useState } from 'react'
import { TECHS, type TechDef } from '../../data/techs'
import { techArtUrl } from '../art'
import { TechColourIcon, TechIcon } from '../TechIcon'
import type { GameState, Seat, TechColor } from '../../engine/types'

const COLOURS: TechColor[] = ['blue', 'red', 'green', 'yellow']
const COLUMN_NAME: Record<TechColor, string> = {
  blue: 'Propulsion',
  red: 'Warfare',
  green: 'Biotic',
  yellow: 'Cybernetic',
}

function tier(prereq: Partial<Record<TechColor, number>>): number {
  return Object.values(prereq).reduce((sum, n) => sum + (n ?? 0), 0)
}

export interface TechDrawerProps {
  state: GameState
  seat: Seat
  allowed: string[]
  selected: string | null
  onSelect: (techId: string) => void
}

type TabType = 'all' | TechColor | 'units'

/** R5 and R8: Redesigned technology drawer with category tabs, large readable cards, and clear prerequisite badges. */
export function TechDrawer({ state, seat, allowed, selected, onSelect }: TechDrawerProps) {
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const owned = state.players[seat].techs
  const faction = state.players[seat].faction

  const columns = COLOURS.map(colour => ({
    colour,
    techs: TECHS.filter(t => t.kind === 'general' && t.colour === colour).sort((a, b) => tier(a.prereq) - tier(b.prereq)),
  }))
  const extras = TECHS.filter(t => t.kind !== 'general' && (t.faction === undefined || t.faction === faction))
    .sort((a, b) => tier(a.prereq) - tier(b.prereq))

  const countAvailable = (techs: TechDef[]) => techs.filter(t => allowed.includes(t.id)).length

  const renderCard = (t: TechDef) => {
    const techId = t.id
    const name = t.name
    const isOwned = owned.includes(techId)
    const open = allowed.includes(techId)
    const isSel = selected === techId
    const stateClass = isOwned ? 'owned' : isSel ? 'sel' : open ? 'now' : 'dim'

    const prereqList = Object.entries(t.prereq ?? {}).filter(([, count]) => (count ?? 0) > 0)
    const prereqLabel = prereqList.length === 0
      ? 'Level 0 (No prereqs)'
      : prereqList.map(([c, count]) => `${count} ${COLUMN_NAME[c as TechColor] ?? c}`).join(', ')

    return (
      <button
        key={techId}
        type="button"
        className={`tc ${stateClass}`}
        data-testid={`tech-card-${techId}`}
        disabled={!open}
        onClick={() => onSelect(techId)}
        title={`${name} (${isOwned ? 'Owned' : open ? 'Available' : `Requires ${prereqLabel}`})`}
      >
        <div className="tc-media">
          <img className="art" src={techArtUrl(techId)} alt={name} loading="lazy" />
          <span className={`tc-badge ${stateClass}`}>
            {isOwned ? 'Owned' : isSel ? 'Selected' : open ? 'Researchable' : 'Locked'}
          </span>
        </div>
        <div className="cap">
          <div className="cap-top">
            <TechIcon techId={techId} colour={state.players[seat].color} size={15} />
            <span className="tc-name">{name}</span>
          </div>
          <div className="tc-meta">
            {t.kind === 'upgrade' ? (
              <span className="tc-tag upgrade">Unit Upgrade</span>
            ) : t.kind === 'faction' ? (
              <span className="tc-tag faction">Faction Tech</span>
            ) : null}
            <span className="tc-prereq">{prereqLabel}</span>
          </div>
        </div>
      </button>
    )
  }

  const extrasAvail = countAvailable(extras)

  return (
    <div className="tech-drawer-container" data-testid="tech-drawer">
      {/* Category filter tabs */}
      <div className="tech-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'all'}
          className={`tech-tab${activeTab === 'all' ? ' active' : ''}`}
          data-testid="tech-tab-all"
          onClick={() => setActiveTab('all')}
        >
          All Disciplines
          <span className="tab-pill">{allowed.length}</span>
        </button>
        {columns.map(col => {
          const avail = countAvailable(col.techs)
          return (
            <button
              key={col.colour}
              type="button"
              role="tab"
              aria-selected={activeTab === col.colour}
              className={`tech-tab tech-tab-${col.colour}${activeTab === col.colour ? ' active' : ''}`}
              data-testid={`tech-tab-${col.colour}`}
              onClick={() => setActiveTab(col.colour)}
            >
              <TechColourIcon colour={col.colour} />
              {COLUMN_NAME[col.colour]}
              {avail > 0 ? <span className="tab-pill ready">{avail}</span> : null}
            </button>
          )
        })}
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'units'}
          className={`tech-tab${activeTab === 'units' ? ' active' : ''}`}
          data-testid="tech-tab-units"
          onClick={() => setActiveTab('units')}
        >
          Unit & Faction
          {extrasAvail > 0 ? <span className="tab-pill ready">{extrasAvail}</span> : null}
        </button>
      </div>

      {/* Content area: multi-column when 'all', spacious grid when filtered */}
      {activeTab === 'all' ? (
        <div className="tcols">
          {columns.map(column => (
            <div className="tcol" key={column.colour}>
              <h4><TechColourIcon colour={column.colour} />{COLUMN_NAME[column.colour]}</h4>
              <div className="tcol-cards">
                {column.techs.map(renderCard)}
              </div>
            </div>
          ))}
          <div className="tcol units">
            <h4>Unit upgrades & faction</h4>
            <div className="tcol-cards">
              {extras.map(renderCard)}
            </div>
          </div>
        </div>
      ) : activeTab === 'units' ? (
        <div className="tech-grid">
          {extras.map(renderCard)}
        </div>
      ) : (
        <div className="tech-grid">
          {columns.find(c => c.colour === activeTab)?.techs.map(renderCard)}
        </div>
      )}
    </div>
  )
}
