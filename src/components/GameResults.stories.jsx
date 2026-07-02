import GameResults from './GameResults'

const renderMissedItem = item => <span>{item.label}</span>

export default {
  title: 'Components/GameResults',
  component: GameResults,
}

export const PerfectRun = {
  args: { score: 5, total: 5, missed: [], onPlayAgain: () => {}, onHome: () => {}, renderMissedItem },
}

export const WithMissedItems = {
  args: {
    score: 3, total: 5,
    missed: [{ id: 'a', label: 'Apple' }, { id: 'b', label: 'Banana' }],
    onPlayAgain: () => {}, onHome: () => {}, renderMissedItem,
  },
}

export const PerfectWithDifficultyOffer = {
  args: {
    score: 5, total: 5, missed: [], onPlayAgain: () => {}, onHome: () => {}, renderMissedItem,
    offerDifficultyBump: true, numChoices: 2,
    onAcceptDifficultyBump: () => {}, onDismissDifficultyBump: () => {},
  },
}
