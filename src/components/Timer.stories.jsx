import Timer from './Timer'

export default {
  title: 'Components/Timer',
  component: Timer,
}

export const Start   = { args: { elapsedMs: 0 } }
export const MidTick  = { args: { elapsedMs: 4700 } }
