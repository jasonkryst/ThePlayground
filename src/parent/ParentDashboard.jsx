import { useState, useEffect, useMemo } from 'react'
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
import useSettings from '../hooks/useSettings'
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
import {
  resolvePresetRange,
  filterScoresByRange,
  buildHeatmapCells,
  computeMonthLabels,
} from '../utils/dateRangeUtils'
import DateRangeFilter from './DateRangeFilter'
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

function ChartDataTable({ caption, data, gameIds, gameNames, formatValue }) {
  const { t } = useTranslation()
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th>{t('parent.chartDateColumn')}</th>
          {gameIds.map(id => <th key={id}>{gameNames[id] ?? id}</th>)}
        </tr>
      </thead>
      <tbody>
        {data.map(row => (
          <tr key={row.date}>
            <td>{row.date}</td>
            {gameIds.map(id => <td key={id}>{row[id] != null ? formatValue(row[id]) : '—'}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ScoreTrendChart({ data, gameIds, gameNames }) {
  const { t } = useTranslation()
  if (data.length < 2) return <p className="parent__empty-chart">{t('parent.notEnoughData')}</p>
  return (
    <>
      <ChartDataTable
        caption={t('parent.scoreTrendHeading')}
        data={data}
        gameIds={gameIds}
        gameNames={gameNames}
        formatValue={v => `${v}%`}
      />
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
    </>
  )
}

// ─── Section: Response Time ──────────────────────────────────────────────────

function ResponseTimeChart({ data, gameIds, gameNames }) {
  const { t } = useTranslation()
  if (data.length < 2) return <p className="parent__empty-chart">{t('parent.notEnoughData')}</p>
  return (
    <>
      <ChartDataTable
        caption={t('parent.responseTimeHeading')}
        data={data}
        gameIds={gameIds}
        gameNames={gameNames}
        formatValue={formatMs}
      />
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
    </>
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

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function intensityLevel(questions) {
  if (questions === 0) return 0
  if (questions <= 5)  return 1
  if (questions <= 15) return 2
  return 3
}

function SessionHeatmap({ cells }) {
  const { t, i18n } = useTranslation()
  const monthLabels  = useMemo(() => computeMonthLabels(cells, i18n.language), [cells, i18n.language])
  const labelByColumn = useMemo(
    () => Object.fromEntries(monthLabels.map(m => [m.columnIndex, m.label])),
    [monthLabels]
  )
  const columnCount = cells.length / 7

  return (
    <div className="heatmap" role="img" aria-label={t('parent.heatmapLabel')}>
      <div className="heatmap__inner">
        <div className="heatmap__days-col">
          <div className="heatmap__months-spacer" aria-hidden="true" />
          <div className="heatmap__days" aria-hidden="true">
            {DAY_LABELS.map((d, i) => <span key={i} className="heatmap__day-label">{d}</span>)}
          </div>
        </div>
        <div className="heatmap__scroll">
          <div className="heatmap__months" aria-hidden="true">
            {Array.from({ length: columnCount }, (_, col) => (
              <span key={col} className="heatmap__month-label">{labelByColumn[col] ?? ''}</span>
            ))}
          </div>
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
  const { t }             = useTranslation()
  const { getAllScores }  = useScores()
  const { settings, updateSetting } = useSettings()
  const [bestStreaks, setBestStreaks] = useState({})
  const scores  = getAllScores()
  const range   = settings.parentDateRange

  const resolvedRange = useMemo(() => (
    range.preset === 'custom'
      ? { start: range.start, end: range.end }
      : resolvePresetRange(range.preset)
  ), [range.preset, range.start, range.end])

  const filteredScores = useMemo(() => filterScoresByRange(scores, resolvedRange), [scores, resolvedRange])
  const gameIds = useMemo(() => [...new Set(filteredScores.map(s => s.gameId))], [filteredScores])
  const gameNames = useMemo(
    () => Object.fromEntries(manifests.map(m => [m.id, m.name])),
    [manifests]
  )

  useEffect(() => {
    adapter.getBestStreaks().then(setBestStreaks)
  }, [])

  const streakAnchor = useMemo(
    () => (resolvedRange.end ? new Date(`${resolvedRange.end}T23:59:59.999Z`) : new Date()),
    [resolvedRange.end]
  )

  const scoreTrend    = useMemo(() => computeScoreTrend(filteredScores),    [filteredScores])
  const responseTimes = useMemo(() => computeResponseTimes(filteredScores), [filteredScores])
  const streakHistory = useMemo(
    () => computeStreakHistory(filteredScores, bestStreaks, streakAnchor),
    [filteredScores, bestStreaks, streakAnchor]
  )
  const heatmapCells = useMemo(
    () => buildHeatmapCells(computeSessionHeatmap(filteredScores), resolvedRange),
    [filteredScores, resolvedRange]
  )
  const missedItems = useMemo(() => computeMissedItems(filteredScores), [filteredScores])

  function handleExport() {
    const csv   = buildCsvContent(filteredScores)
    const today = new Date().toISOString().split('T')[0]
    downloadCsv(`playground-scores-${today}.csv`, csv)
  }

  function handleRangeChange(next) {
    updateSetting('parentDateRange', next)
  }

  return (
    <div className="parent">
      <div className="parent__toolbar">
        <DateRangeFilter range={range} onChange={handleRangeChange} />
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
            <SessionHeatmap cells={heatmapCells} />
          </section>

          <section className="parent__section" aria-labelledby="missed-heading">
            <h2 id="missed-heading">{t('parent.missedHeading')}</h2>
            <p className="parent__hint">{t('parent.missedHint')}</p>
            <MissedItemsPanel missedItems={missedItems} gameNames={gameNames} />
          </section>
        </>
      )}
    </div>
  )
}
