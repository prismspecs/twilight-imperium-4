/**
 * TI4 Base Game Public Objectives (10 Stage I, 10 Stage II).
 * In setup, 5 Stage I and 5 Stage II are placed in the public objective deck.
 * Stage I objectives are worth 1 VP each; Stage II are worth 2 VP each.
 */
export type ObjectiveStage = 'stage1' | 'stage2' | 'secret'

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

export const SECRET_OBJECTIVES: readonly ObjectiveDef[] = [
  {
    id: 'ans',
    name: 'Adapt New Strategies',
    stage: 'secret',
    points: 1,
    text: 'Own 2 faction technologies.',
    short: '2 faction techs',
  },
  {
    id: 'btgk',
    name: 'Become the Gatekeeper',
    stage: 'secret',
    points: 1,
    text: 'Have 1 or more ships in a system that contains an alpha wormhole and 1 or more ships in a system that contains a beta wormhole.',
    short: 'Alpha & beta wormholes',
  },
  {
    id: 'csl',
    name: 'Cut Supply Lines',
    stage: 'secret',
    points: 1,
    text: "Have 1 or more ships in the same system as another player's space dock.",
    short: 'Blockade space dock',
  },
  {
    id: 'ctr',
    name: 'Control the Region',
    stage: 'secret',
    points: 1,
    text: 'Have 1 or more ships in 6 systems.',
    short: 'Ships in 6 systems',
  },
  {
    id: 'dtgs',
    name: 'Destroy Their Greatest Ship',
    stage: 'secret',
    points: 1,
    text: "Destroy another player's war sun or flagship.",
    short: 'Destroy flagship/war sun',
  },
  {
    id: 'eap',
    name: 'Establish a Perimeter',
    stage: 'secret',
    points: 1,
    text: 'Have 4 PDS units on the game board.',
    short: '4 PDS units',
  },
  {
    id: 'faa',
    name: 'Forge an Alliance',
    stage: 'secret',
    points: 1,
    text: 'Control 4 cultural planets.',
    short: '4 cultural planets',
  },
  {
    id: 'fsn',
    name: 'Form a Spy Network',
    stage: 'secret',
    points: 1,
    text: 'Discard 5 action cards.',
    short: 'Discard 5 action cards',
  },
  {
    id: 'fwm',
    name: 'Fuel the War Machine',
    stage: 'secret',
    points: 1,
    text: 'Have 3 space docks on the game board.',
    short: '3 space docks',
  },
  {
    id: 'gamf',
    name: 'Gather a Mighty Fleet',
    stage: 'secret',
    points: 1,
    text: 'Have 5 dreadnoughts on the game board.',
    short: '5 dreadnoughts',
  },
  {
    id: 'lsc',
    name: 'Learn the Secrets of the Cosmos',
    stage: 'secret',
    points: 1,
    text: 'Have 1 or more ships in 3 systems that are each adjacent to an anomaly.',
    short: 'Ships near 3 anomalies',
  },
  {
    id: 'mew',
    name: 'Make an Example of Their World',
    stage: 'secret',
    points: 1,
    text: "Destroy the last of a player's ground forces on a planet using bombardment.",
    short: 'Bombard all ground forces',
  },
  {
    id: 'mlp',
    name: 'Master the Laws of Physics',
    stage: 'secret',
    points: 1,
    text: 'Own 4 technologies of the same color.',
    short: '4 techs of same color',
  },
  {
    id: 'mp',
    name: 'Monopolize Production',
    stage: 'secret',
    points: 1,
    text: 'Control 4 industrial planets.',
    short: '4 industrial planets',
  },
  {
    id: 'mrm',
    name: 'Mine Rare Metals',
    stage: 'secret',
    points: 1,
    text: 'Control 4 hazardous planets.',
    short: '4 hazardous planets',
  },
  {
    id: 'ose',
    name: 'Occupy the Seat of the Empire',
    stage: 'secret',
    points: 1,
    text: 'Control Mecatol Rex and have 3 or more ships in its system.',
    short: 'Control Mecatol & 3 ships',
  },
  {
    id: 'sar',
    name: 'Spark a Rebellion',
    stage: 'secret',
    points: 1,
    text: 'Win a combat against a player who has the most victory points.',
    short: 'Beat leader in combat',
  },
  {
    id: 'te',
    name: 'Threaten Enemies',
    stage: 'secret',
    points: 1,
    text: "Have 1 or more ships in a system that is adjacent to another player's home system.",
    short: 'Ships near other home',
  },
  {
    id: 'ttfd',
    name: 'Turn Their Fleets to Dust',
    stage: 'secret',
    points: 1,
    text: "Destroy the last of a player's non-fighter ships in the active system using Space Cannon Offense.",
    short: 'Space cannon wipes fleet',
  },
  {
    id: 'uf',
    name: 'Unveil Flagship',
    stage: 'secret',
    points: 1,
    text: 'Win a space combat in a system that contains your flagship. You cannot score this objective if your flagship is destroyed in the combat.',
    short: 'Win combat with flagship',
  },
]

export const ALL_OBJECTIVES: readonly ObjectiveDef[] = [
  ...PUBLIC_OBJECTIVES,
  ...SECRET_OBJECTIVES,
]

const BY_ID = new Map<string, ObjectiveDef>(ALL_OBJECTIVES.map(o => [o.id, o]))

export function isSecretObjective(id: string): boolean {
  return SECRET_OBJECTIVES.some(o => o.id === id)
}

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
