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
            role="tab"
            aria-selected={range.preset === preset}
            className={`date-range-filter__tab${range.preset === preset ? ' date-range-filter__tab--active' : ''}`}
            onClick={() => selectPreset(preset)}
          >
            {t(PRESET_LABEL_KEY[preset])}
          </button>
        ))}
      </div>

      <div className="date-range-filter__custom">
        <label className="date-range-filter__label" htmlFor="date-range-from">
          {t('parent.dateRangeFrom')}
        </label>
        <input
          id="date-range-from"
          type="date"
          value={draftStart}
          onChange={e => handleDraftChange('start', e.target.value)}
        />
        <label className="date-range-filter__label" htmlFor="date-range-to">
          {t('parent.dateRangeTo')}
        </label>
        <input
          id="date-range-to"
          type="date"
          value={draftEnd}
          onChange={e => handleDraftChange('end', e.target.value)}
        />
      </div>

      {invalid && (
        <p className="date-range-filter__error" role="alert">
          {t('parent.dateRangeInvalid')}
        </p>
      )}
    </div>
  )
}
