import ReplayButton from './ReplayButton'

export default {
  title: 'Components/ReplayButton',
  component: ReplayButton,
}

const baseArgs = { labelKey: 'animalSounds.replay', onClick: () => {} }

export const Default = { args: { ...baseArgs, blocked: false } }
export const Blocked = { args: { ...baseArgs, blocked: true } }
