import './Timer.css'

export default function Timer({ elapsedMs }) {
  const seconds = (elapsedMs / 1000).toFixed(1)
  return (
    <div className="timer" aria-label={`Elapsed time: ${seconds} seconds`}>
      <span className="timer__icon" aria-hidden="true">⏱️</span>
      <span className="timer__value">{seconds}s</span>
    </div>
  )
}
