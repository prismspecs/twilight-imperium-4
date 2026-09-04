/**
 * TI4 Base Game Public Objectives (10 Stage I, 10 Stage II).
 * In setup, 5 Stage I and 5 Stage II are placed in the public objective deck.
 * Stage I objectives are worth 1 VP each; Stage II are worth 2 VP each.
 */
export type ObjectiveStage = 'stage1' | 'stage2'

export interface ObjectiveDef {
  id: string
  name: string
  stage: ObjectiveStage
  points: number
  text: string
  short: string
}

export const STAGE_1_OBJECTIVES: readonly ObjectiveDef[] = [
  {
    id: 'corner_the_market',
    name: 'Corner the Market',
    stage: 'stage1',
    points: 1,
    text: 'Control 4 planets that each have the same planet trait.',
    short: '4 same-trait planets',
  },
  {
    id: 'develop_weaponry',
    name: 'Develop Weaponry',
    stage: 'stage1',
    points: 1,
    text: 'Own 2 unit upgrade technologies.',
    short: '2 unit upgrades',
  },
  {
    id: 'diversify_research',
    name: 'Diversify Research',
    stage: 'stage1',
    points: 1,
    text: 'Own 2 technologies in each of 2 colors.',
    short: '2 tech in 2 colors',
  },
  {
    id: 'erect_a_monument',
    name: 'Erect a Monument',
    stage: 'stage1',
    points: 1,
    text: 'Spend 8 resources.',
    short: 'Spend 8 resources',
  },
  {
    id: 'expand_borders',
    name: 'Expand Borders',
    stage: 'stage1',
    points: 1,
    text: 'Control 6 planets in non-home systems.',
    short: '6 non-home planets',
  },
  {
    id: 'found_research_outposts',
    name: 'Found Research Outposts',
    stage: 'stage1',
    points: 1,
    text: 'Control 3 planets that have technology specialties.',
    short: '3 tech specialties',
  },
  {
    id: 'intimidate_council',
    name: 'Intimidate Council',
    stage: 'stage1',
    points: 1,
    text: "Have 1 or more ships in 2 systems that are adjacent to Mecatol Rex's system.",
    short: 'Ships near Mecatol',
  },
  {
    id: 'lead_from_the_front',
    name: 'Lead From the Front',
    stage: 'stage1',
    points: 1,
    text: 'Spend a total of 3 tokens from your tactic and/or strategy pools.',
    short: 'Spend 3 tokens',
  },
  {
    id: 'negotiate_trade_routes',
    name: 'Negotiate Trade Routes',
    stage: 'stage1',
    points: 1,
    text: 'Spend 5 trade goods.',
    short: 'Spend 5 trade goods',
  },
  {
    id: 'sway_the_council',
    name: 'Sway the Council',
    stage: 'stage1',
    points: 1,
    text: 'Spend 8 influence.',
    short: 'Spend 8 influence',
  },
]

export const STAGE_2_OBJECTIVES: readonly ObjectiveDef[] = [
  {
    id: 'centralize_galactic_trade',
    name: 'Centralize Galactic Trade',
    stage: 'stage2',
    points: 2,
    text: 'Spend 10 trade goods.',
    short: 'Spend 10 trade goods',
  },
  {
    id: 'conquer_the_weak',
    name: 'Conquer the Weak',
    stage: 'stage2',
    points: 2,
    text: "Control 1 planet that is in another player's home system.",
    short: 'Planet in other home',
  },
  {
    id: 'form_galactic_brain_trust',
    name: 'Form Galactic Brain Trust',
    stage: 'stage2',
    points: 2,
    text: 'Control 5 planets that have technology specialties.',
    short: '5 tech specialties',
  },
  {
    id: 'found_a_golden_age',
    name: 'Found a Golden Age',
    stage: 'stage2',
    points: 2,
    text: 'Spend 16 resources.',
    short: 'Spend 16 resources',
  },
  {
    id: 'galvanize_the_people',
    name: 'Galvanize the People',
    stage: 'stage2',
    points: 2,
    text: 'Spend a total of 6 tokens from your tactic and/or strategy pools.',
    short: 'Spend 6 tokens',
  },
  {
    id: 'manipulate_galactic_law',
    name: 'Manipulate Galactic Law',
    stage: 'stage2',
    points: 2,
    text: 'Spend 16 influence.',
    short: 'Spend 16 influence',
  },
  {
    id: 'master_the_sciences',
    name: 'Master the Sciences',
    stage: 'stage2',
    points: 2,
    text: 'Own 2 technologies in each of 4 colors.',
    short: '2 tech in 4 colors',
  },
  {
    id: 'revolutionize_warfare',
    name: 'Revolutionize Warfare',
    stage: 'stage2',
    points: 2,
    text: 'Own 3 unit upgrade technologies.',
    short: '3 unit upgrades',
  },
  {
    id: 'subdue_the_galaxy',
    name: 'Subdue the Galaxy',
    stage: 'stage2',
    points: 2,
    text: 'Control 11 planets in non-home systems.',
    short: '11 non-home planets',
  },
  {
    id: 'unify_the_colonies',
    name: 'Unify the Colonies',
    stage: 'stage2',
    points: 2,
    text: 'Control 6 planets that each have the same planet trait.',
    short: '6 same-trait planets',
  },
]

export const PUBLIC_OBJECTIVES: readonly ObjectiveDef[] = [
  ...STAGE_1_OBJECTIVES,
  ...STAGE_2_OBJECTIVES,
]

const BY_ID = new Map<string, ObjectiveDef>(PUBLIC_OBJECTIVES.map(o => [o.id, o]))

export function objectiveDef(id: string): ObjectiveDef | undefined {
  return BY_ID.get(id) ?? MANDATES.find(m => m.id === id)
}

export function findObjective(id: string): ObjectiveDef | undefined {
  return BY_ID.get(id)
}

/** Legacy duel mandates kept for transitional compatibility until test suites are updated. */
export const FIRST_STRIKE: ObjectiveDef = {
  id: 'first_strike',
  name: 'First Strike',
  stage: 'stage1',
  points: 1,
  short: 'First Strike',
  text: 'First Strike: be the first to win a space combat in the Mecatol Rex system',
}

export const FOOTHOLD: ObjectiveDef = {
  id: 'foothold',
  name: 'Foothold',
  stage: 'stage1',
  points: 1,
  short: 'Foothold',
  text: 'Foothold: take a planet in your opponent’s home system',
}

export const MANDATES: ObjectiveDef[] = [FIRST_STRIKE, FOOTHOLD]
export const MANDATE_IDS: readonly string[] = MANDATES.map(m => m.id)
