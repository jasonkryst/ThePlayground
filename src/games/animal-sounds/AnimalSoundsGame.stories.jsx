import AnimalSoundsGame from './index'

// The game shuffles its choices with Math.random() on mount, which makes
// screenshots non-deterministic across renders. Pin it to a fixed value for
// this story's render only (the shuffle runs synchronously during mount, so
// restoring right after Story() covers it) rather than mutating Math.random
// for the rest of the Storybook session.
const pinRandom = (Story) => {
  const original = Math.random
  Math.random = () => 0.5
  try {
    return Story()
  } finally {
    Math.random = original
  }
}

export default {
  title: 'Games/AnimalSoundsGame',
  component: AnimalSoundsGame,
  decorators: [pinRandom],
}

export const Default = { args: { onGameEnd: () => {} } }
