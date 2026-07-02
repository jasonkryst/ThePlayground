import GameIntro from './GameIntro'

export default {
  title: 'Components/GameIntro',
  component: GameIntro,
}

export const Default = {
  args: {
    icon: '🐘',
    name: 'Animal Sounds',
    instructions: 'Listen to the sound, then tap the matching animal!',
    dontShowAgain: false,
    onDontShowAgainChange: () => {},
    onStart: () => {},
  },
}

export const DontShowAgainChecked = {
  args: {
    icon: '🎨',
    name: 'Color Match',
    instructions: 'A color swatch shows — tap the matching colored object!',
    dontShowAgain: true,
    onDontShowAgainChange: () => {},
    onStart: () => {},
  },
}
