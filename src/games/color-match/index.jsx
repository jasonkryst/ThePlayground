import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import useSettings from '../../hooks/useSettings'
import useScores from '../../hooks/useScores'
import colors from './data/colors'
import manifest from './manifest.json'
import buildQueue from '../../utils/buildQueue'
import './ColorMatchGame.css'

const BORDERED_IDS = new Set(['white', 'gray'])

export default function ColorMatchGame({ onGameEnd }) {
  const { t } = useTranslation()
  const { settings } = useSettings()
  const { addScore }  = useScores()

  const [queue,    setQueue]    = useState([])
  const [index,    setIndex]    = useState(0)
  const [answered, setAnswered] = useState(false)
  const [selected, setSelected] = useState(null)
  const [score,    setScore]    = useState(0)
  const [done,     setDone]     = useState(false)

  // Refs avoid stale closures in setTimeout callbacks
  const scoreRef = useRef(0)
  const indexRef = useRef(0)
  const queueRef = useRef([])

  const { numChoices, feedbackMode, questionsPerSession } = settings

  useEffect(() => {
    if (numChoices && questionsPerSession) {
      const q = buildQueue(colors, numChoices, questionsPerSession)
      queueRef.current = q
      setQueue(q)
    }
  }, [numChoices, questionsPerSession])

  const current = queue[index]

  function handleChoice(color) {
    if (answered) return
    setAnswered(true)
    setSelected(color.id)

    const isCorrect = color.id === current.correct.id
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
      gameId: 'color-match',
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
    const q = buildQueue(colors, numChoices, questionsPerSession)
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
        <div className="results__label">{t('common.scoreLabel', { score: scoreRef.current, total })}</div>
        <div className="results__actions">
          <button className="results__btn results__btn--play" onClick={restart}>{t('common.playAgain')}</button>
          <button className="results__btn results__btn--home" onClick={() => onGameEnd(scoreRef.current, total)}>{t('common.home')}</button>
        </div>
      </div>
    )
  }

  if (!current) return null

  return (
    <main className="game">
      {/* Hidden testid so tests can find the correct answer id */}
      <span data-testid="correct-color-id" style={{ display: 'none' }}>{current.correct.id}</span>

      <div className="game__header">
        <h1 className="game__name">{manifest.name}</h1>
        <span className="game__version">v{manifest.version}</span>
      </div>

      <div className="game__question">
        <div className="game__progress">{t('common.progress', { current: index + 1, total: queue.length })}</div>
        <div className="game__prompt">{t('colorMatch.prompt')}</div>
        <div className="game__swatch" style={{ background: current.correct.color }} />
      </div>

      <div className="game__choices">
        {current.choices.map(color => {
          const isSelected = selected === color.id
          const isCorrect  = color.id === current.correct.id
          let cls = 'game__choice'
          if (BORDERED_IDS.has(color.id)) cls += ' game__choice--bordered'
          if (answered && isSelected && isCorrect)  cls += ' correct'
          if (answered && isSelected && !isCorrect) cls += ' wrong'
          if (answered && !isSelected && isCorrect) cls += ' highlight-correct'

          return (
            <button
              key={color.id}
              className={cls}
              style={{ background: color.color, color: color.textColor }}
              disabled={answered}
              onClick={() => handleChoice(color)}
              data-color-id={color.id}
            >
              {color.emoji}
              <span className="game__choice-name">{t(color.nameKey)}</span>
            </button>
          )
        })}
      </div>

      {answered && feedbackMode === 'parent-tap' && (
        <button className="game__next" onClick={advance}>{t('common.next')}</button>
      )}
    </main>
  )
}
