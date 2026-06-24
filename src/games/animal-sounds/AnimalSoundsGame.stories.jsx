import AnimalSoundsGame from './index'

// The game shuffles its choices with Math.random() on mount, which makes
// screenshots non-deterministic across renders. Pin it to a fixed value
// so visual regression snapshots stay stable.
Math.random = () => 0.5

export default {
  title: 'Games/AnimalSoundsGame',
  component: AnimalSoundsGame,
}

export const Default = { args: { onGameEnd: () => {} } }
