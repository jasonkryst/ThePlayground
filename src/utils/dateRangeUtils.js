const MS_PER_DAY = 86_400_000

function toDateStr(date) {
  return date.toISOString().split('T')[0]
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return toDateStr(d)
}

function startOfWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - d.getUTCDay())
  return toDateStr(d)
}

function endOfWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + (6 - d.getUTCDay()))
  return toDateStr(d)
}

const PRESET_DAYS_BACK = { '7d': 6, '30d': 29, '90d': 90 }

/**
 * Resolves a preset key to a concrete { start, end } inclusive date-string range.
 * 'all' and any unrecognized preset resolve to an unbounded range rather than throwing,
 * so a stale/corrupt persisted setting degrades gracefully instead of crashing the page.
 */
export function resolvePresetRange(preset, referenceDate = new Date()) {
  const end = toDateStr(referenceDate)
  const daysBack = PRESET_DAYS_BACK[preset]
  if (daysBack == null) return { start: null, end: null }
  return { start: addDays(end, -daysBack), end }
}

/**
 * Filters scores to those whose `date` falls within [start, end] inclusive.
 * A null start/end is unbounded on that side. Scores without a `date` are excluded,
 * matching how dashboardUtils' compute* functions already treat date-less records.
 */
export function filterScoresByRange(scores, { start, end } = {}) {
  return scores.filter(s => {
    if (!s.date) return false
    if (start && s.date < start) return false
    if (end && s.date > end) return false
    return true
  })
}

/**
 * Builds a Sunday-aligned grid of daily cells spanning the given range.
 * heatmapData is the output of dashboardUtils.computeSessionHeatmap (sorted ascending).
 * `start: null` derives the earliest bound from heatmapData (or falls back to `end`
 * when there's no data at all); `end: null` means today.
 * Returns [] for a malformed range (resolved end before resolved start).
 */
export function buildHeatmapCells(heatmapData, { start, end } = {}) {
  const resolvedEnd   = end ?? toDateStr(new Date())
  const resolvedStart = start ?? (heatmapData[0]?.date ?? resolvedEnd)

  const gridStart = startOfWeek(resolvedStart)
  const gridEnd   = endOfWeek(resolvedEnd)
  if (gridStart > gridEnd) return []

  const dataMap = Object.fromEntries(heatmapData.map(d => [d.date, d]))
  const cells   = []
  let cur = gridStart
  while (cur <= gridEnd) {
    cells.push({ date: cur, ...(dataMap[cur] ?? { questions: 0, estimatedMs: null }) })
    cur = addDays(cur, 1)
  }
  cells._dateRange = { start: resolvedStart, end: resolvedEnd }
  return cells
}

const monthFormatters = {}
function monthFormatter(locale) {
  if (!monthFormatters[locale]) {
    monthFormatters[locale] = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
  }
  return monthFormatters[locale]
}

/**
 * Derives one label per week-column (7 cells each, matching the heatmap grid's
 * column order) marking where a new calendar month begins. The first column is
 * always labeled. `label` is the locale-aware short month name.
 */
export function computeMonthLabels(cells, locale = 'en') {
  if (cells.length === 0) return []

  const formatter = monthFormatter(locale)
  const labels = []
  let prevMonth = null
  const dateRange = cells._dateRange

  // If the entire date range is within a single month, only show one label
  if (dateRange) {
    const startMonth = dateRange.start.slice(0, 7)
    const endMonth = dateRange.end.slice(0, 7)
    if (startMonth === endMonth) {
      // Find the first column that intersects with the date range
      for (let col = 0; col * 7 < cells.length; col++) {
        const cell = cells[col * 7]
        const colStart = cell.date
        const colEnd = cells[Math.min(col * 7 + 6, cells.length - 1)].date
        if (colEnd >= dateRange.start && colStart <= dateRange.end) {
          labels.push({ columnIndex: col, label: formatter.format(new Date(`${dateRange.start}T00:00:00Z`)) })
          return labels
        }
      }
      return labels
    }
  }

  // Otherwise, label columns where month changes
  for (let col = 0; col * 7 < cells.length; col++) {
    const cell  = cells[col * 7]
    const month = cell.date.slice(0, 7) // 'YYYY-MM'
    if (month !== prevMonth) {
      labels.push({ columnIndex: col, label: formatter.format(new Date(`${cell.date}T00:00:00Z`)) })
      prevMonth = month
    }
  }
  return labels
}
