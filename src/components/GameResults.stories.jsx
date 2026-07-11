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

export const WithPersonalBestRecords = {
  args: {
    score: 10, total: 10, missed: [], onPlayAgain: () => {}, onHome: () => {}, renderMissedItem,
    personalBestResult: {
      accuracy: { isNewRecord: true, value: 1, previous: { ratio: 0.9, score: 9, total: 10, timestamp: 1 } },
      speed: { isNewRecord: true, value: 1000, previous: { avgMs: 1500, timestamp: 1 } },
    },
  },
}

export const WithMemoryRecords = {
  args: {
    score: 10, total: 10, missed: [], onPlayAgain: () => {}, onHome: () => {}, renderMissedItem,
    personalBestResult: {
      fewestFlips: { isNewRecord: true, value: 7, previous: { flips: 9, timestamp: 1 } },
      fastestMs:   { isNewRecord: true, value: 42300, previous: { ms: 51800, timestamp: 1 } },
    },
  },
}

export const WithNewBadges = {
  args: {
    score: 5, total: 5, missed: [], onPlayAgain: () => {}, onHome: () => {}, renderMissedItem,
    newBadges: [
      { id: 'hotStreak', icon: '🔥', nameKey: 'badges.hotStreak.name' },
      { id: 'perfectSession', icon: '🎯', nameKey: 'badges.perfectSession.name' },
    ],
  },
}
