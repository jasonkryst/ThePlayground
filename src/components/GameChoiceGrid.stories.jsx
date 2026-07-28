import GameChoiceGrid from './GameChoiceGrid'

const choices = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
const baseArgs = {
  choices,
  correctId: 'a',
  onChoose: () => {},
  getChoiceProps: () => ({}),
  renderChoiceContent: item => item.id.toUpperCase(),
}

export default {
  title: 'Components/GameChoiceGrid',
  component: GameChoiceGrid,
}

export const Default = { args: { ...baseArgs, selected: null, locked: false, disabledChoiceIds: [], hintActive: false } }
export const RetryInProgress = { args: { ...baseArgs, selected: null, locked: false, disabledChoiceIds: ['b'], hintActive: false } }
export const HintActiveSubtle = { args: { ...baseArgs, selected: null, locked: false, disabledChoiceIds: ['b'], hintActive: true, hintStrength: 0.33 } }
export const HintActiveBold = { args: { ...baseArgs, selected: null, locked: false, disabledChoiceIds: ['b'], hintActive: true, hintStrength: 1 } }
export const Locked = { args: { ...baseArgs, selected: 'a', locked: true, disabledChoiceIds: [], hintActive: false } }
export const LockedWrong = { args: { ...baseArgs, selected: 'b', locked: true, disabledChoiceIds: ['b'], hintActive: false } }
export const DefaultDark = { args: { ...baseArgs, selected: null, locked: false, disabledChoiceIds: [], hintActive: false }, parameters: { theme: 'dark' } }
export const DefaultHighContrast = { args: { ...baseArgs, selected: null, locked: false, disabledChoiceIds: [], hintActive: false }, parameters: { theme: 'high-contrast' } }
