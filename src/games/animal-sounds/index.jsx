import { useState, useEffect, useRef } from 'react'
import useSettings from '../../hooks/useSettings'
import useScores from '../../hooks/useScores'
import animals from './data/animals'
import { getSoundUrl } from './data/sounds'
import './AnimalSoundsGame.css'

const CHOICE_COLORS = [
  'var(--color-lavender)',
  'var(--color-teal)',
  'var(--color-aqua)',
  'var(--color-lilac)',
]

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildQueue(numChoices, questionsPerSession) {
  const shuffled = shuffle(animals)
  const count = Math.min(questionsPerSession, animals.length)
  return shuffled.slice(0, count).map(correct => {
    const wrong = shuffle(animals.filter(a => a.id !== correct.id)).slice(0, numChoices - 1)
    return { correct, choices: shuffle([correct, ...wrong]) }
  })
}

export default function AnimalSoundsGame({ onGameEnd }) {
  const { settings } = useSettings()
  const { addScore }  = useScores()

  const [queue,    setQueue]    = useState([])
  const [index,    setIndex]    = useState(0)
  const [answered, setAnswered] = useState(false)
  const [selected, setSelected] = useState(null)
  const [score,    setScore]    = useState(0)
  const [done,     setDone]     = useState(false)

  // Refs avoid stale closures in setTimeout callbacks
  const audioRef   = useRef(null)
  const scoreRef   = useRef(0)
  const indexRef   = useRef(0)
  const queueRef   = useRef([])

  const { numChoices, feedbackMode, questionsPerSession } = settings

  useEffect(() => {
    if (numChoices && questionsPerSession) {
      const q = buildQueue(numChoices, questionsPerSession)
      queueRef.current = q
      setQueue(q)
    }
  }, [numChoices, questionsPerSession])

  const current = queue[index]

  useEffect(() => {
    if (!current) return
    playSound()
  }, [index, queue])

  function playSound() {
    if (!current) return
    const url = getSoundUrl(current.correct.sound)
    if (!url) return
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    const audio = new Audio(url)
    audioRef.current = audio
    audio.play().catch(() => {})
  }

  function handleChoice(animal) {
    if (answered) return
    setAnswered(true)
    setSelected(animal.id)

    const isCorrect = animal.id === current.correct.id
    if (isCorrect) {
      scoreRef.current += 1
      setScore(scoreRef.current)
    }

    if (feedbackMode === 'immediate') {
      setTimeout(advance, 1500)
    }
  }

  function advance() {
    const nextIndex = indexRef.current + 1
    if (nextIndex >= queueRef.current.length) {
      finishGame()
    } else {
      indexRef.current = nextIndex
      setIndex(nextIndex)
      setAnswered(false)
      setSelected(null)
    }
  }

  async function finishGame() {
    const result = {
      gameId: 'animal-sounds',
      score: scoreRef.current,
      total: queueRef.current.length,
      date: new Date().toISOString().split('T')[0],
      timestamp: Date.now(),
    }
    await addScore(result)
    setDone(true)
  }

  function restart() {
    scoreRef.current = 0
    indexRef.current = 0
    const q = buildQueue(numChoices, questionsPerSession)
    queueRef.current = q
    setQueue(q)
    setIndex(0)
    setAnswered(false)
    setSelected(null)
    setScore(0)
    setDone(false)
  }

  if (done) {
    const total = queueRef.current.length
    return (
      <div className="results">
        <div className="results__emoji">{scoreRef.current === total ? '🎉' : '⭐'}</div>
        <div className="results__score">{scoreRef.current} / {total}</div>
        <div className="results__label">You scored {scoreRef.current} out of {total}!</div>
        <div className="results__actions">
          <button className="results__btn results__btn--play" onClick={restart}>Play Again</button>
          <button className="results__btn results__btn--home" onClick={() => onGameEnd(scoreRef.current, total)}>Home</button>
        </div>
      </div>
    )
  }

  if (!current) return null

  return (
    <div className="game">
      {/* Hidden testid so tests can find the correct answer id */}
      <span data-testid="correct-animal-id" style={{ display: 'none' }}>{current.correct.id}</span>

      <div className="game__question">
        <div className="game__progress">Question {index + 1} of {queue.length}</div>
        <div className="game__prompt">What animal makes this sound?</div>
        <button className="game__replay" aria-label="Replay sound" onClick={playSound}>🔊</button>
      </div>

      <div className="game__choices">
        {current.choices.map((animal, i) => {
          const isSelected = selected === animal.id
          const isCorrect  = animal.id === current.correct.id
          let cls = 'game__choice'
          if (answered && isSelected && isCorrect)  cls += ' correct'
          if (answered && isSelected && !isCorrect) cls += ' wrong'
          if (answered && !isSelected && isCorrect) cls += ' highlight-correct'

          return (
            <button
              key={animal.id}
              className={cls}
              style={{ background: CHOICE_COLORS[i % CHOICE_COLORS.length] }}
              disabled={answered}
              onClick={() => handleChoice(animal)}
              data-animal-id={animal.id}
            >
              {animal.emoji}
              <span className="game__choice-name">{animal.name}</span>
            </button>
          )
        })}
      </div>

      {answered && feedbackMode === 'parent-tap' && (
        <button className="game__next" onClick={advance}>Next →</button>
      )}
    </div>
  )
}
