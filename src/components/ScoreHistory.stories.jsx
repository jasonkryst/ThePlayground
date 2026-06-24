import ScoreHistory from './ScoreHistory'

export default {
  title: 'Components/ScoreHistory',
  component: ScoreHistory,
}

const scores = [
  { gameId: 'animal-sounds', score: 9, total: 10, date: '2026-06-07', timestamp: 2000 },
  { gameId: 'animal-sounds', score: 6, total: 10, date: '2026-06-06', timestamp: 1000 },
]

export const Default = { args: { scores } }
export const Empty = { args: { scores: [] } }
