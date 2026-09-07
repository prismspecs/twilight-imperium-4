import { techDef } from '../data/techs'
import { spriteUrl, techIconUrl } from './art'
import { useModelStyle } from './modelStyle'
import { iconFitSize } from './sprites'
import type { Color, TechColor } from '../engine/types'

const COLOUR_NAME: Record<TechColor, string> = {
  blue: 'Propulsion', red: 'Warfare', green: 'Biotic', yellow: 'Cybernetic',
}

/** The four printed technology symbols; the tech drawer heads its columns with them. */
export function TechColourIcon({ colour, size = 18 }: { colour: TechColor; size?: number }) {
  return <img className="ticon" src={techIconUrl(colour)} alt={COLOUR_NAME[colour]} width={size} height={size} />
}

/**
 * The symbol a technology carries on its card: its colour for a research technology, and the unit itself for
 * a unit upgrade, which is what makes a Dreadnought II readable at a glance next to a Neural Motivator.
 */
export function TechIcon({ techId, colour: playerColour, size = 18 }: { techId: string; colour: Color; size?: number }) {
  const { style } = useModelStyle()
  const def = techDef(techId)
  if (def.unit) {
    const fit = iconFitSize(def.unit, size, style)
    return (
      <span className="ticon unit" style={{ width: size, height: size }} title={def.name}>
        <img
          src={spriteUrl(playerColour, def.unit, style)}
          alt={def.name}
          width={fit.width}
          height={fit.height}
          onError={e => {
            const target = e.currentTarget as HTMLImageElement
            target.onerror = null
            if (style !== 'models') {
              target.src = spriteUrl(playerColour, def.unit!, 'models')
            }
          }}
        />
      </span>
    )
  }
  if (def.colour) return <TechColourIcon colour={def.colour} size={size} />
  return <span className="tdot none" />
}
