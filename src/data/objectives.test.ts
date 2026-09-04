import { describe, expect, it } from 'vitest'
import {
  PUBLIC_OBJECTIVES,
  SECRET_OBJECTIVES,
  STAGE_1_OBJECTIVES,
  STAGE_2_OBJECTIVES,
  isSecretObjective,
  objectiveDef,
} from './objectives'

describe('data/objectives', () => {
  it('contains exactly 10 Stage I and 10 Stage II public objectives', () => {
    expect(STAGE_1_OBJECTIVES).toHaveLength(10)
    expect(STAGE_2_OBJECTIVES).toHaveLength(10)
    expect(PUBLIC_OBJECTIVES).toHaveLength(20)
  })

  it('Stage I objectives are worth 1 VP each', () => {
    for (const obj of STAGE_1_OBJECTIVES) {
      expect(obj.stage).toBe('stage1')
      expect(obj.points).toBe(1)
      expect(obj.name.length).toBeGreaterThan(0)
      expect(obj.text.length).toBeGreaterThan(0)
      expect(obj.short.length).toBeGreaterThan(0)
    }
  })

  it('Stage II objectives are worth 2 VP each', () => {
    for (const obj of STAGE_2_OBJECTIVES) {
      expect(obj.stage).toBe('stage2')
      expect(obj.points).toBe(2)
      expect(obj.name.length).toBeGreaterThan(0)
      expect(obj.text.length).toBeGreaterThan(0)
      expect(obj.short.length).toBeGreaterThan(0)
    }
  })

  it('all 20 objective IDs are unique', () => {
    const ids = PUBLIC_OBJECTIVES.map(o => o.id)
    expect(new Set(ids).size).toBe(20)
  })

  it('contains the verified 10 Stage I base objectives', () => {
    const stage1Ids = STAGE_1_OBJECTIVES.map(o => o.id)
    expect(stage1Ids).toEqual([
      'corner_the_market',
      'develop_weaponry',
      'diversify_research',
      'erect_a_monument',
      'expand_borders',
      'found_research_outposts',
      'intimidate_council',
      'lead_from_the_front',
      'negotiate_trade_routes',
      'sway_the_council',
    ])
  })

  it('contains the verified 10 Stage II base objectives', () => {
    const stage2Ids = STAGE_2_OBJECTIVES.map(o => o.id)
    expect(stage2Ids).toEqual([
      'centralize_galactic_trade',
      'conquer_the_weak',
      'form_galactic_brain_trust',
      'found_a_golden_age',
      'galvanize_the_people',
      'manipulate_galactic_law',
      'master_the_sciences',
      'revolutionize_warfare',
      'subdue_the_galaxy',
      'unify_the_colonies',
    ])
  })

  it('objectiveDef looks up by id', () => {
    for (const obj of PUBLIC_OBJECTIVES) {
      expect(objectiveDef(obj.id)).toEqual(obj)
    }
    for (const obj of SECRET_OBJECTIVES) {
      expect(objectiveDef(obj.id)).toEqual(obj)
      expect(isSecretObjective(obj.id)).toBe(true)
    }
    expect(objectiveDef('unknown_id')).toBeUndefined()
  })

  it('contains exactly 20 secret objectives worth 1 VP each', () => {
    expect(SECRET_OBJECTIVES).toHaveLength(20)
    for (const obj of SECRET_OBJECTIVES) {
      expect(obj.stage).toBe('secret')
      expect(obj.points).toBe(1)
      expect(obj.name.length).toBeGreaterThan(0)
      expect(obj.text.length).toBeGreaterThan(0)
      expect(obj.short.length).toBeGreaterThan(0)
    }
    const ids = SECRET_OBJECTIVES.map(o => o.id)
    expect(new Set(ids).size).toBe(20)
  })
})
