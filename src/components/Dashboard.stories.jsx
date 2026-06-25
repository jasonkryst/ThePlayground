import { MemoryRouter } from 'react-router-dom'
import Dashboard from './Dashboard'

export default {
  title: 'Components/Dashboard',
  component: Dashboard,
  decorators: [Story => <MemoryRouter><Story /></MemoryRouter>],
}

const manifests = [
  { id: 'animal-sounds', name: 'Animal Sounds', description: 'Match the animal to its sound!', icon: '🐘', color: '#B39DDB' },
  { id: 'color-match', name: 'Color Match', description: 'Match the color to its object!', icon: '🎨', color: '#CE93D8' },
]

export const Default = { args: { manifests } }
export const Empty = { args: { manifests: [] } }
