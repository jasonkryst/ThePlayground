import BadgeGallery from './BadgeGallery'

const manifests = [
  { id: 'animal-sounds', name: 'Animal Sounds' },
  { id: 'color-match', name: 'Color Match' },
]

export default {
  title: 'Components/BadgeGallery',
  component: BadgeGallery,
}

export const AllLocked = {
  args: { manifests, badgeData: { awards: {}, lifetimeQuestions: {} } },
}

export const MixedProgress = {
  args: {
    manifests,
    badgeData: {
      awards: {
        'animal-sounds': { hotStreak: 3, onFire: 1, perfectSession: 2, gettingStarted: 1 },
        'color-match': { hotStreak: 1 },
      },
      lifetimeQuestions: { 'animal-sounds': 62, 'color-match': 10 },
    },
  },
}
