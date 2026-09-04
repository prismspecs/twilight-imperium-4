/** Which set of unit art the board draws. AsyncTI4/ti4_web_new's flat counter art is the one style. */
export type ModelStyle = 'models' | 'topdown' | 'counters'

const STYLE: ModelStyle = 'counters'

export function useModelStyle(): { style: ModelStyle } {
  return { style: STYLE }
}
