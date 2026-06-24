import { MemoryRouter } from 'react-router-dom'
import GameCard from './GameCard'

export default {
  title: 'Components/GameCard',
  component: GameCard,
  decorators: [Story => <MemoryRouter><Story /></MemoryRouter>],
}

const manifest = {
  id: 'animal-sounds',
  name: 'Animal Sounds',
  description: 'Match the animal to its sound!',
  icon: '🐘',
  color: '#B39DDB',
}

export const Default = { args: { manifest, bestScore: 0 } }
export const WithBestScore = { args: { manifest, bestScore: 8 } }
