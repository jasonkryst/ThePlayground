import ColorMatchGame from './index'

// The game shuffles its choices with Math.random() on mount, which makes
// screenshots non-deterministic across renders. Seed it to a fixed value
// so visual regression snapshots stay stable.
Math.random = () => 0.5

export default {
  title: 'Games/ColorMatchGame',
  component: ColorMatchGame,
}

export const Default = { args: { onGameEnd: () => {} } }
