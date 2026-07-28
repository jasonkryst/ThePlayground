import { MemoryRouter } from 'react-router-dom'
import Dashboard from './Dashboard'

export default {
  title: 'Components/Dashboard',
  component: Dashboard,
  decorators: [Story => <MemoryRouter><Story /></MemoryRouter>],
}

const manifests = [
  { id: 'animal-sounds', nameKey: 'animalSounds.manifestName', descriptionKey: 'animalSounds.manifestDescription', icon: '🐘', color: '#B39DDB' },
  { id: 'color-match', nameKey: 'colorMatch.manifestName', descriptionKey: 'colorMatch.manifestDescription', icon: '🎨', color: '#CE93D8' },
]

export const Default = { args: { manifests } }
export const Empty = { args: { manifests: [] } }
export const DefaultDark = { args: { manifests }, parameters: { theme: 'dark' } }
export const DefaultHighContrast = { args: { manifests }, parameters: { theme: 'high-contrast' } }
