import './ScoreHistory.css'

export default function ScoreHistory({ scores = [] }) {
  if (scores.length === 0) {
    return <p className="score-history__empty">No scores yet — play a game!</p>
  }
  return (
    <ul className="score-history">
      {scores.map(s => (
        <li key={s.timestamp} className="score-history__item">
          <span className="score-history__result">{s.score} / {s.total}</span>
          <span className="score-history__date">{s.date ?? new Date(s.timestamp).toLocaleDateString()}</span>
        </li>
      ))}
    </ul>
  )
}
