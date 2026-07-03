import Timer from './Timer'

export default {
  title: 'Components/Timer',
  component: Timer,
}

export const Start    = { args: { elapsedMs: 0 } }
export const MidTick   = { args: { elapsedMs: 4700 } }
export const CountdownMidway = { args: { elapsedMs: 2000, mode: 'countdown', limitMs: 5000 } }
export const CountdownTimeUp = { args: { elapsedMs: 5000, mode: 'countdown', limitMs: 5000 } }
