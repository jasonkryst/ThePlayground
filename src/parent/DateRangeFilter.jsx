import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import './DateRangeFilter.css'

const PRESETS = ['7d', '30d', '90d', 'all']
const PRESET_LABEL_KEY = {
  '7d':  'parent.dateRange7d',
  '30d': 'parent.dateRange30d',
  '90d': 'parent.dateRange90d',
  'all': 'parent.dateRangeAll',
}
const PANEL_ID = 'date-range-filter-panel'
const tabId = preset => `date-range-tab-${preset}`

export default function DateRangeFilter({ range, onChange }) {
  const { t } = useTranslation()
  const [draftStart, setDraftStart] = useState(range.preset === 'custom' ? range.start ?? '' : '')
  const [draftEnd,   setDraftEnd]   = useState(range.preset === 'custom' ? range.end ?? ''   : '')

  // Keep local drafts in sync when the range changes from outside this component
  // (e.g. a persisted setting finishing its async load after initial mount).
  useEffect(() => {
    setDraftStart(range.preset === 'custom' ? range.start ?? '' : '')
    setDraftEnd(range.preset === 'custom' ? range.end ?? ''   : '')
  }, [range.preset, range.start, range.end])

  const invalid = draftStart !== '' && draftEnd !== '' && draftEnd < draftStart

  function selectPreset(preset) {
    onChange({ preset, start: null, end: null })
  }

  function handleDraftChange(field, value) {
    const nextStart = field === 'start' ? value : draftStart
    const nextEnd   = field === 'end'   ? value : draftEnd
    if (field === 'start') setDraftStart(value)
    else setDraftEnd(value)

    if (nextStart !== '' && nextEnd !== '' && nextEnd >= nextStart) {
      onChange({ preset: 'custom', start: nextStart, end: nextEnd })
    }
  }

  return (
    <div className="date-range-filter">
      <div
        className="date-range-filter__tabs"
        role="tablist"
        aria-label={t('parent.dateRangeAriaLabel')}
      >
        {PRESETS.map(preset => (
          <button
            key={preset}
            id={tabId(preset)}
            role="tab"
            aria-selected={range.preset === preset}
            aria-controls={PANEL_ID}
            className={`date-range-filter__tab${range.preset === preset ? ' date-range-filter__tab--active' : ''}`}
            onClick={() => selectPreset(preset)}
          >
            {t(PRESET_LABEL_KEY[preset])}
          </button>
        ))}
      </div>

      {/* Unlike AdminPage's tabs (one exclusive panel per tab), every preset
          here shares this single custom-range panel — picking a preset
          doesn't hide it, and typing dates directly switches the range to
          'custom' without any tab click. So aria-controls/aria-labelledby
          reference it as jointly owned by all four tabs, not one each. */}
      <div
        className="date-range-filter__custom"
        role="tabpanel"
        id={PANEL_ID}
        aria-labelledby={PRESETS.map(tabId).join(' ')}
      >
        <label className="date-range-filter__label" htmlFor="date-range-from">
          {t('parent.dateRangeFrom')}
        </label>
        <input
          id="date-range-from"
          type="date"
          value={draftStart}
          onChange={e => handleDraftChange('start', e.target.value)}
          aria-describedby={invalid ? 'date-range-filter-error' : undefined}
        />
        <label className="date-range-filter__label" htmlFor="date-range-to">
          {t('parent.dateRangeTo')}
        </label>
        <input
          id="date-range-to"
          type="date"
          value={draftEnd}
          onChange={e => handleDraftChange('end', e.target.value)}
          aria-describedby={invalid ? 'date-range-filter-error' : undefined}
        />
      </div>

      {invalid && (
        <p id="date-range-filter-error" className="date-range-filter__error" role="alert">
          {t('parent.dateRangeInvalid')}
        </p>
      )}
    </div>
  )
}
