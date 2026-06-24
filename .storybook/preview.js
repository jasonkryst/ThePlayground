import '../src/index.css'
import '../src/i18n'

const disableMotionStyle = document.createElement('style')
disableMotionStyle.innerHTML = '*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }'
document.head.appendChild(disableMotionStyle)

// Games like AnimalSoundsGame/ColorMatchGame shuffle their question queue
// with Math.random() on every render, which makes their stories
// non-deterministic for screenshot diffing. Seed a small PRNG so repeated
// renders of the same story are pixel-stable.
function seededRandom(seed) {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }
}

const withSeededRandom = (Story) => {
  Math.random = seededRandom(42)
  return Story()
}

/** @type { import('@storybook/react-vite').Preview } */
const preview = {
  decorators: [withSeededRandom],
  parameters: {
    controls: { expanded: true },
  },
}

export default preview
