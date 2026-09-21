/**
 * Promissory notes: the printed catalogue of tradable note cards.
 *
 * Each player begins with one faction-unique note plus a set of generic notes (LRR §Promissory Notes,
 * docs/spec/lrr.md lines 1994–2015) that they may give to other players as part of a transaction. A player
 * cannot play their own faction's unique note (LRR 2004.2) — the cards exist to be traded.
 *
 * Like `ACTION_CARDS`, this module is the printed catalogue. Which notes the engine can actually resolve,
 * and therefore which are in play with an effect, is decided by the engine module (`src/engine/promissoryNotes.ts`
 * and the Phase-A `transactions.ts` plumbing). Note texts are sourced from the AsyncTI4 promissory-notes
 * catalogue that `data/reference/factions.json` already trusts (`promissory_notes/promissory_notes.json`),
 * filtered to the 17 base-game factions, plus the four base-game generic notes.
 */
export interface PromissoryNoteDef {
  id: string
  name: string
  /** The faction whose sheet this note belongs to; `undefined` for the generic notes every player holds. */
  faction?: string
  /** The printed timing window / summary, e.g. "After another player activates a system that contains 1 or more of your units". */
  window: string
  text: string
}

export const PROMISSORY_NOTES: readonly PromissoryNoteDef[] = [
  // ---- Generic notes (every player holds one of each in their starting hand; no owner faction) ----
  {
    id: 'ceasefire',
    name: 'Ceasefire',
    window: 'After another player activates a system that contains 1 or more of your units',
    text: 'End that player\'s turn. Then, return this card to the owner.',
  },
  {
    id: 'trade_agreement',
    name: 'Trade Agreement',
    window: 'When the owner replenishes commodities',
    text: 'Gain 2 trade goods. Then, return this card to the owner.',
  },
  {
    id: 'political_secret',
    name: 'Political Secret',
    window: 'After an agenda is revealed',
    text: 'Reveal 1 of your secret objectives. Then, return this card to the owner.',
  },
  {
    id: 'support_for_the_throne',
    name: 'Support for the Throne',
    window: 'When you receive this card',
    text: 'Gain 1 victory point. While this card is in your play area, if you control the owner\'s home system, return this card to the owner. If the owner is eliminated, return this card to the game box.',
  },

  // ---- Base-game faction-unique notes (one per faction; a player cannot play their own) ----
  {
    id: 'ce',
    name: 'Cybernetic Enhancements',
    faction: 'l1z1x',
    window: 'When you gain command tokens during the status phase',
    text: 'Gain 1 additional command token. Then, return this card to the L1Z1X player.',
  },
  {
    id: 'war_funding',
    name: 'War Funding',
    faction: 'letnev',
    window: 'After you and your opponent roll dice during space combat',
    text: 'You may reroll all of your opponent\'s dice. You may reroll any number of your dice. Then, return this card to the Letnev player.',
  },
  {
    id: 'ragh',
    name: 'Raghs Call',
    faction: 'saar',
    window: 'After you commit 1 or more units to land on a planet',
    text: 'Remove all of the Saar player\'s ground forces from that planet and place them on a planet controlled by the Saar player. Then, return this card to the Saar player.',
  },
  {
    id: 'fires',
    name: 'Fires of the Gashlai',
    faction: 'muaat',
    window: 'ACTION',
    text: 'Remove 1 token from the Muaat player\'s fleet pool and return it to their reinforcements. Then, gain your war sun unit upgrade technology card. Then, return this card to the Muaat Player.',
  },
  {
    id: 'convoys',
    name: 'Trade Convoys',
    faction: 'hacan',
    window: 'ACTION',
    text: 'Place this card faceup in your play area. While this card is in your play area, you may negotiate transactions with players who are not your neighbor. If you activate a system that contains 1 or more of the Hacan player\'s units, return this card to the Hacan player.',
  },
  {
    id: 'ms',
    name: 'Military Support',
    faction: 'sol',
    window: 'At the start of the Sol player\'s turn',
    text: 'Remove 1 token from the Sol player\'s strategy pool, if able, and return it to their reinforcements. Then, you may place 2 infantry from your reinforcements on any planet you control. Then, return this card to the Sol player.',
  },
  {
    id: 'iff',
    name: 'Creuss Iff',
    faction: 'creuss',
    window: 'At the start of your turn during the action phase',
    text: 'Place or move a Creuss wormhole token into either a system that contains a planet you control or a non-home system that does not contain another player\'s ships. Then, return this card to the Creuss player.',
  },
  {
    id: 'pop',
    name: 'Promise of Protection',
    faction: 'mentak',
    window: 'ACTION',
    text: 'Place this card faceup in your play area. While this card is in your play area, the Mentak player cannot use their Pillage faction ability against you. If you activate a system that contains 1 or more of the Mentak player\'s units, return this card to the Mentak player.',
  },
  {
    id: 'gift',
    name: 'Gift of Prescience',
    faction: 'naalu',
    window: 'At the end of the Strategy Phase',
    text: 'Place this card faceup in your play area and place the Naalu \'0\' token on your strategy card, you are the first in initiative order. The Naalu player cannot use their Telepathic faction ability during this game round. Return this card to the Naalu player at the end of the status phase.',
  },
  {
    id: 'antivirus',
    name: 'Antivirus',
    faction: 'nekro',
    window: 'At the start of a combat',
    text: 'Place this card faceup in your play area. While this card is in your play area, the Nekro player cannot use their Technological Singularity faction ability against you. If you activate a system that contains 1 or more of the Nekro player\'s units, return this card to the Nekro player.',
  },
  {
    id: 'tekklar',
    name: 'Tekklar Legion',
    faction: 'sardakk',
    window: 'At the start of an invasion combat',
    text: 'Apply +1 to the result of each of your unit\'s combat rolls during this combat. If your opponent is the N\'orr player, apply -1 to the result of each of their unit\'s combat rolls during this combat. Then, return this card to the N\'orr player.',
  },
  {
    id: 'ra',
    name: 'Research Agreement',
    faction: 'jolnar',
    window: 'After the Jol-Nar player researches a technology that is not a faction technology',
    text: 'Gain that technology. Then, return this card to the Jol-Nar player.',
  },
  {
    id: 'acq',
    name: 'Acquiescence',
    faction: 'winnu',
    window: 'When the Winnu player resolves a strategic action',
    text: 'You do not have to spend or place a command token to resolve the secondary ability of that strategy card. Then, return this card to the Winnu player.',
  },
  {
    id: 'favor',
    name: 'Political Favor',
    faction: 'xxcha',
    window: 'When an agenda is revealed',
    text: 'Remove 1 token from the Xxcha player\'s strategy pool and return it to their reinforcements. Then, discard the revealed agenda and reveal 1 agenda from the top of the deck. Players vote on this agenda instead. Then, return this card to the Xxcha player.',
  },
  {
    id: 'greyfire',
    name: 'Greyfire Mutagen',
    faction: 'yin',
    window: 'At the start of a ground combat against 2 or more ground forces that are not controlled by the Yin player',
    text: 'Replace 1 of your opponent\'s infantry with 1 infantry from your reinforcements. Then, return this card to the Yin player.',
  },
  {
    id: 'spynet',
    name: 'Spy Net',
    faction: 'yssaril',
    window: 'At the start of your turn',
    text: 'Look at the Yssaril player\'s hand of action cards. Choose 1 of those cards and add it to your hand. Then, return this card to the Yssaril player.',
  },
  {
    id: 'stymie',
    name: 'Stymie',
    faction: 'arborec',
    window: 'After another player moves ships into a system that contains 1 or more of your units',
    text: 'You may place 1 command token from that player\'s reinforcements in any non-home system. Then, return this card to the Arborec player.',
  },
]

const BY_ID = new Map(PROMISSORY_NOTES.map((n) => [n.id, n]))

export function findPromissoryNote(id: string): PromissoryNoteDef | undefined {
  return BY_ID.get(id)
}

/** The generic notes: those with no owner faction. */
export const GENERIC_PROMISSORY_NOTES: readonly string[] = PROMISSORY_NOTES
  .filter((n) => n.faction === undefined)
  .map((n) => n.id)

/** The unique note id a given faction starts with. */
export function factionPromissoryNote(faction: string): string | undefined {
  const n = PROMISSORY_NOTES.find((n) => n.faction === faction)
  return n ? n.id : undefined
}
