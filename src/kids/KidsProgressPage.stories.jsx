import { MemoryRouter } from 'react-router-dom'
import KidsProgressPage from './KidsProgressPage'

const manifests = [
  { id: 'animal-sounds', nameKey: 'animalSounds.manifestName', icon: '🐘', color: '#B39DDB' },
  { id: 'color-match',   nameKey: 'colorMatch.manifestName',   icon: '🎨', color: '#CE93D8' },
]

export default {
  title: 'Pages/KidsProgressPage',
  component: KidsProgressPage,
  decorators: [Story => <MemoryRouter><Story /></MemoryRouter>],
}

export const Default = { args: { manifests } }
