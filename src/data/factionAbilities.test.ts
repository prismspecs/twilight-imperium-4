import { describe, expect, it } from 'vitest'
import { FACTIONS } from './factions'
import { factionAbility } from './factionAbilities'

describe('faction ability reference text', () => {
  it('covers every ability id named by every faction', () => {
    for (const faction of Object.values(FACTIONS)) {
      for (const id of faction.abilities) {
        const def = factionAbility(id)
        expect(def, `${faction.id}: missing ability text for "${id}"`).toBeDefined()
        expect(def?.text.length).toBeGreaterThan(0)
      }
    }
  })
})
