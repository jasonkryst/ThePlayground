import { useState, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts'
import useScores from '../hooks/useScores'
import adapter from '../storage/index'
import {
  computeScoreTrend,
  computeResponseTimes,
  computeStreakHistory,
  computeSessionHeatmap,
  computeMissedItems,
  buildCsvContent,
  downloadCsv,
} from '../utils/dashboardUtils'
import './ParentDashboard.css'

// One distinct stroke color per game line in charts
const CHART_COLORS = ['#006C7A', '#00695C', '#6A4FA3', '#8E24AA']

// i18n namespace to use when resolving an item label for a given game
const GAME_ITEM_NS = {
  'animal-sounds': 'animal',
  'color-match':   'color',
}

function formatDate(dateStr) {
  const [, m, d] = dateStr.split('-')
  return `${parseInt(m)}/${parseInt(d)}`
}

function formatMs(ms) {
  return `${(ms / 1000).toFixed(1)}s`
}

// ─── Section: Score Trend ────────────────────────────────────────────────────

function ScoreTrendChart({ data, gameIds, gameNames }) {
  const { t } = useTranslation()
  if (data.length < 2) return <p className="parent__empty-chart">{t('parent.notEnoughData')}</p>
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
        <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 12 }} />
        <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 12 }} width={42} />
        <Tooltip formatter={v => `${v}%`} labelFormatter={formatDate} />
        <Legend />
        {gameIds.map((id, i) => (
          <Line
            key={id}
            type="monotone"
            dataKey={id}
            name={gameNames[id] ?? id}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            dot={false}
            strokeWidth={2}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

// ─── Section: Response Time ──────────────────────────────────────────────────

function ResponseTimeChart({ data, gameIds, gameNames }) {
  const { t } = useTranslation()
  if (data.length < 2) return <p className="parent__empty-chart">{t('parent.notEnoughData')}</p>
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
        <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={formatMs} tick={{ fontSize: 12 }} width={48} />
        <Tooltip formatter={formatMs} labelFormatter={formatDate} />
        <Legend />
        {gameIds.map((id, i) => (
          <Line
            key={id}
            type="monotone"
            dataKey={id}
            name={gameNames[id] ?? id}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            dot={false}
            strokeWidth={2}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

// ─── Section: Streak History ─────────────────────────────────────────────────

function StreakHistoryPanel({ streakHistory, gameNames }) {
  const { t }  = useTranslation()
  const games  = Object.keys(streakHistory)
  if (games.length === 0) return <p className="parent__empty-chart">{t('parent.notEnoughData')}</p>
  return (
    <table className="parent__streak-table" aria-label={t('parent.streakHistoryHeading')}>
      <thead>
        <tr>
          <th>{t('parent.streakGame')}</th>
          <th>{t('parent.streakLast7')}</th>
          <th>{t('parent.streakLast30')}</th>
          <th>{t('parent.streakAllTime')}</th>
        </tr>
      </thead>
      <tbody>
        {games.map(gameId => {
          const { last7, last30, allTime } = streakHistory[gameId]
          return (
            <tr key={gameId}>
              <td>{gameNames[gameId] ?? gameId}</td>
              <td>{last7}</td>
              <td>{last30}</td>
              <td>{allTime}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ─── Section: Session Heatmap ────────────────────────────────────────────────

const HEATMAP_WEEKS = 13
const DAY_LABELS    = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function intensityLevel(questions) {
  if (questions === 0) return 0
  if (questions <= 5)  return 1
  if (questions <= 15) return 2
  return 3
}

function buildHeatmapCells(heatmapData) {
  const today = new Date()
  // Align start to the most recent Sunday that is at least WEEKS*7 days back
  const start = new Date(today)
  start.setDate(start.getDate() - HEATMAP_WEEKS * 7)
  start.setDate(start.getDate() - start.getDay()) // back to Sunday

  const dataMap = Object.fromEntries(heatmapData.map(d => [d.date, d]))
  const cells   = []
  const cur     = new Date(start)

  while (cur <= today) {
    const dateStr = cur.toISOString().split('T')[0]
    cells.push({ date: dateStr, ...(dataMap[dateStr] ?? { questions: 0, estimatedMs: null }) })
    cur.setDate(cur.getDate() + 1)
  }
  return cells
}

function SessionHeatmap({ heatmapData }) {
  const { t }   = useTranslation()
  const cells   = useMemo(() => buildHeatmapCells(heatmapData), [heatmapData])

  return (
    <div className="heatmap" role="img" aria-label={t('parent.heatmapLabel')}>
      <div className="heatmap__inner">
        <div className="heatmap__days" aria-hidden="true">
          {DAY_LABELS.map((d, i) => <span key={i} className="heatmap__day-label">{d}</span>)}
        </div>
        <div className="heatmap__scroll">
        <div className="heatmap__grid">
          {cells.map(cell => {
            const level   = intensityLevel(cell.questions)
            const minutes = cell.estimatedMs ? Math.round(cell.estimatedMs / 60000) : null
            const tip     = cell.questions > 0
              ? `${cell.date}: ${cell.questions} questions${minutes ? ` (~${minutes} min)` : ''}`
              : cell.date
            return (
              <div
                key={cell.date}
                className={`heatmap__cell heatmap__cell--${level}`}
                title={tip}
              />
            )
          })}
        </div>
        </div>
      </div>
      <div className="heatmap__legend" aria-hidden="true">
        <span>{t('parent.heatmapLess')}</span>
        {[0, 1, 2, 3].map(i => <div key={i} className={`heatmap__cell heatmap__cell--${i}`} />)}
        <span>{t('parent.heatmapMore')}</span>
      </div>
    </div>
  )
}

// ─── Section: Missed Items ───────────────────────────────────────────────────

function MissedItemsPanel({ missedItems, gameNames }) {
  const { t }  = useTranslation()
  const games  = Object.keys(missedItems)

  if (games.length === 0) {
    return <p className="parent__empty-chart">{t('parent.missedNoData')}</p>
  }

  return (
    <div className="parent__missed">
      {games.map(gameId => {
        const ns    = GAME_ITEM_NS[gameId]
        const items = missedItems[gameId]
        const max   = items[0]?.count ?? 1
        const name  = gameNames[gameId] ?? gameId
        return (
          <div key={gameId} className="parent__missed-game">
            <h3 className="parent__missed-title">{name}</h3>
            <ul className="parent__missed-list" aria-label={t('parent.missedItemsAriaLabel', { name })}>
              {items.map(({ itemId, count }) => {
                const label = ns ? t(`${ns}.${itemId}.name`, { defaultValue: itemId }) : itemId
                return (
                  <li key={itemId} className="parent__missed-item">
                    <span className="parent__missed-label">{label}</span>
                    <div className="parent__missed-bar-wrap">
                      <div
                        className="parent__missed-bar"
                        style={{ width: `${Math.round((count / max) * 100)}%` }}
                      />
                    </div>
                    <span className="parent__missed-count">{count}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ParentDashboard({ manifests = [] }) {
  const { t }          = useTranslation()
  const { getAllScores } = useScores()
  const [bestStreaks, setBestStreaks] = useState({})
  const scores  = getAllScores()
  const gameIds = useMemo(() => [...new Set(scores.map(s => s.gameId))], [scores])
  const gameNames = useMemo(
    () => Object.fromEntries(manifests.map(m => [m.id, m.name])),
    [manifests]
  )

  const titleRef = useRef(null)
  useEffect(() => { titleRef.current?.focus() }, [])

  useEffect(() => {
    adapter.getBestStreaks().then(setBestStreaks)
  }, [])

  const scoreTrend    = useMemo(() => computeScoreTrend(scores),                [scores])
  const responseTimes = useMemo(() => computeResponseTimes(scores),              [scores])
  const streakHistory = useMemo(() => computeStreakHistory(scores, bestStreaks),  [scores, bestStreaks])
  const heatmapData   = useMemo(() => computeSessionHeatmap(scores),             [scores])
  const missedItems   = useMemo(() => computeMissedItems(scores),                [scores])

  function handleExport() {
    const csv      = buildCsvContent(scores)
    const today    = new Date().toISOString().split('T')[0]
    downloadCsv(`playground-scores-${today}.csv`, csv)
  }

  return (
    <div className="parent">
      <main>
        <div className="parent__header">
          <Link to="/" className="parent__back" aria-label={t('parent.back')}>←</Link>
          <h1 className="parent__title" tabIndex={-1} ref={titleRef}>{t('parent.title')}</h1>
          <button className="parent__export-btn" onClick={handleExport} aria-label={t('parent.exportCsv')}>
            {t('parent.exportCsv')}
          </button>
        </div>

        {scores.length === 0 ? (
          <p className="parent__empty">{t('parent.empty')}</p>
        ) : (
          <>
            <section className="parent__section" aria-labelledby="score-trend-heading">
              <h2 id="score-trend-heading">{t('parent.scoreTrendHeading')}</h2>
              <p className="parent__hint">{t('parent.scoreTrendHint')}</p>
              <ScoreTrendChart data={scoreTrend} gameIds={gameIds} gameNames={gameNames} />
            </section>

            <section className="parent__section" aria-labelledby="response-time-heading">
              <h2 id="response-time-heading">{t('parent.responseTimeHeading')}</h2>
              <p className="parent__hint">{t('parent.responseTimeHint')}</p>
              <ResponseTimeChart data={responseTimes} gameIds={gameIds} gameNames={gameNames} />
            </section>

            <section className="parent__section" aria-labelledby="streak-heading">
              <h2 id="streak-heading">{t('parent.streakHistoryHeading')}</h2>
              <p className="parent__hint">{t('parent.streakHistoryHint')}</p>
              <StreakHistoryPanel streakHistory={streakHistory} gameNames={gameNames} />
            </section>

            <section className="parent__section" aria-labelledby="heatmap-heading">
              <h2 id="heatmap-heading">{t('parent.heatmapHeading')}</h2>
              <p className="parent__hint">{t('parent.heatmapHint')}</p>
              <SessionHeatmap heatmapData={heatmapData} />
            </section>

            <section className="parent__section" aria-labelledby="missed-heading">
              <h2 id="missed-heading">{t('parent.missedHeading')}</h2>
              <p className="parent__hint">{t('parent.missedHint')}</p>
              <MissedItemsPanel missedItems={missedItems} gameNames={gameNames} />
            </section>
          </>
        )}
      </main>
    </div>
  )
}
