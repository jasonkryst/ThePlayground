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
export const HintActive = { args: { ...baseArgs, selected: null, locked: false, disabledChoiceIds: ['b'], hintActive: true } }
export const Locked = { args: { ...baseArgs, selected: 'a', locked: true, disabledChoiceIds: [], hintActive: false } }
