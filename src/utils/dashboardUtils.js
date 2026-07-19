const MS_PER_DAY = 86_400_000

/**
 * Accuracy per game per calendar date.
 * Returns sorted array of { date, [gameId]: accuracyPct } rows.
 */
export function computeScoreTrend(scores) {
  const byDate = {}
  for (const s of scores) {
    if (!s.date || s.total == null) continue
    if (!byDate[s.date]) byDate[s.date] = {}
    if (!byDate[s.date][s.gameId]) byDate[s.date][s.gameId] = { totalScore: 0, totalQuestions: 0 }
    byDate[s.date][s.gameId].totalScore    += s.score
    byDate[s.date][s.gameId].totalQuestions += s.total
  }
  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, games]) => {
      const row = { date }
      for (const [gameId, { totalScore, totalQuestions }] of Object.entries(games)) {
        row[gameId] = totalQuestions > 0 ? Math.round((totalScore / totalQuestions) * 100) : 0
      }
      return row
    })
}

/**
 * Average response time (ms) per game per calendar date.
 * Sessions without timing data are excluded.
 * Returns sorted array of { date, [gameId]: avgMs } rows.
 */
export function computeResponseTimes(scores) {
  const byDate = {}
  for (const s of scores) {
    if (!s.date || !Array.isArray(s.timings) || s.timings.length === 0) continue
    if (!byDate[s.date]) byDate[s.date] = {}
    if (!byDate[s.date][s.gameId]) byDate[s.date][s.gameId] = { totalMs: 0, count: 0 }
    for (const t of s.timings) {
      byDate[s.date][s.gameId].totalMs += t.durationMs
      byDate[s.date][s.gameId].count++
    }
  }
  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, games]) => {
      const row = { date }
      for (const [gameId, { totalMs, count }] of Object.entries(games)) {
        row[gameId] = count > 0 ? Math.round(totalMs / count) : null
      }
      return row
    })
}

/**
 * Peak streak per game for last-7-day, last-30-day, and all-time windows,
 * measured relative to `anchor` (defaults to now). For scores that predate
 * the peakStreak field, falls back to using score (correct count) as a proxy.
 */
export function computeStreakHistory(scores, bestStreaks = {}, anchor = new Date()) {
  const anchorMs = anchor.getTime()
  const cutoff7  = anchorMs - 7  * MS_PER_DAY
  const cutoff30 = anchorMs - 30 * MS_PER_DAY
  const gameIds  = [...new Set(scores.map(s => s.gameId))]
  const result   = {}

  for (const gameId of gameIds) {
    const sessions = scores.filter(s => s.gameId === gameId)
    const peakInWindow = (cutoff) =>
      sessions
        .filter(s => (s.timestamp ?? 0) >= cutoff && (s.timestamp ?? 0) <= anchorMs)
        .reduce((max, s) => Math.max(max, s.peakStreak ?? s.score ?? 0), 0)

    result[gameId] = {
      last7:   peakInWindow(cutoff7),
      last30:  peakInWindow(cutoff30),
      allTime: bestStreaks[gameId] ?? 0,
    }
  }
  return result
}

/**
 * Daily play summary for the heatmap.
 * Returns sorted array of { date, questions, estimatedMs } entries.
 * estimatedMs is null when no timing data exists for that day.
 */
export function computeSessionHeatmap(scores) {
  const byDate = {}
  for (const s of scores) {
    if (!s.date) continue
    if (!byDate[s.date]) byDate[s.date] = { questions: 0, totalMs: 0, hasTimings: false }
    byDate[s.date].questions += s.total ?? 0
    if (Array.isArray(s.timings) && s.timings.length > 0) {
      const avgMs = s.timings.reduce((sum, t) => sum + t.durationMs, 0) / s.timings.length
      byDate[s.date].totalMs    += Math.round((s.total ?? s.timings.length) * avgMs)
      byDate[s.date].hasTimings  = true
    }
  }
  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { questions, totalMs, hasTimings }]) => ({
      date,
      questions,
      estimatedMs: hasTimings ? totalMs : null,
    }))
}

/**
 * Frequency table of incorrectly-answered items by game.
 * Requires timings entries to carry itemId (added in v0.4.0); older records are skipped.
 * Returns { [gameId]: [{ itemId, count }, ...] } sorted by count descending.
 */
export function computeMissedItems(scores) {
  const result = {}
  for (const s of scores) {
    if (!Array.isArray(s.timings)) continue
    for (const t of s.timings) {
      if (t.correct || !t.itemId) continue
      if (!result[s.gameId]) result[s.gameId] = {}
      result[s.gameId][t.itemId] = (result[s.gameId][t.itemId] ?? 0) + 1
    }
  }
  return Object.fromEntries(
    Object.entries(result).map(([gameId, items]) => [
      gameId,
      Object.entries(items)
        .map(([itemId, count]) => ({ itemId, count }))
        .sort((a, b) => b.count - a.count),
    ])
  )
}

/**
 * Escapes a single CSV field per RFC 4180 (quote the field, double any
 * embedded quote) and defuses spreadsheet formula injection: a value
 * beginning with =, +, -, or @ gets a leading apostrophe, which Excel/Sheets
 * treat as a forced-text marker rather than evaluating a formula.
 */
function escapeCsvField(value) {
  const str     = value === null || value === undefined ? '' : String(value)
  const defused = /^[=+\-@]/.test(str) ? `'${str}` : str
  return `"${defused.replace(/"/g, '""')}"`
}

/**
 * Build a CSV string from scores. Includes a header row.
 */
export function buildCsvContent(scores) {
  const headers = ['date', 'gameId', 'score', 'total', 'accuracy', 'avgResponseMs', 'peakStreak', 'timestamp']
  const rows = scores.map(s => {
    const accuracy = s.total > 0 ? (s.score / s.total * 100).toFixed(1) : ''
    const avgMs    = Array.isArray(s.timings) && s.timings.length > 0
      ? Math.round(s.timings.reduce((sum, t) => sum + t.durationMs, 0) / s.timings.length)
      : ''
    return [
      s.date       ?? '',
      s.gameId     ?? '',
      s.score      ?? '',
      s.total      ?? '',
      accuracy,
      avgMs,
      s.peakStreak ?? '',
      s.timestamp  ?? '',
    ].map(escapeCsvField).join(',')
  })
  return [headers.map(escapeCsvField).join(','), ...rows].join('\n')
}

/**
 * Trigger a CSV file download in the browser.
 */
export function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href     = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
