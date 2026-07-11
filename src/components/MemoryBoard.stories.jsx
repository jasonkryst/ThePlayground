import MemoryBoard from './MemoryBoard'

const TILES = [
  { tileId: 'dog-a', itemId: 'dog', state: 'down' },
  { tileId: 'cat-a', itemId: 'cat', state: 'up' },
  { tileId: 'cow-a', itemId: 'cow', state: 'matched' },
  { tileId: 'cow-b', itemId: 'cow', state: 'matched' },
  { tileId: 'cat-b', itemId: 'cat', state: 'mismatch' },
  { tileId: 'dog-b', itemId: 'dog', state: 'down' },
]

const EMOJI = { dog: '🐕', cat: '🐈', cow: '🐄' }
const NAMES = { dog: 'Dog', cat: 'Cat', cow: 'Cow' }

export default {
  title: 'Components/MemoryBoard',
  component: MemoryBoard,
  args: {
    tiles: TILES,
    onFlip: () => {},
    renderFace: itemId => <span>{EMOJI[itemId]}</span>,
    getFaceLabel: itemId => NAMES[itemId],
    liveMessage: '',
  },
}

export const Default = {}
export const AllFaceDown = { args: { tiles: TILES.map(t => ({ ...t, state: 'down' })) } }
export const AnimationsDisabled = { args: { animationsEnabled: false } }
