import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import useTagRowOverflow from '../hooks/useTagRowOverflow'
import './TagFilterBar.css'

export default function TagFilterBar({ tags, selectedTags, onToggleTag, tagLabel }) {
  const { t } = useTranslation()
  const rowRef = useRef(null)
  const [expanded, setExpanded] = useState(false)

  const orderedTags = useMemo(
    () => [
      ...tags.filter(tag => selectedTags.has(tag)),
      ...tags.filter(tag => !selectedTags.has(tag)),
    ],
    [tags, selectedTags]
  )

  const { visibleCount, rowHeight } = useTagRowOverflow(rowRef, orderedTags.join('|'))
  const hiddenCount = Math.max(0, orderedTags.length - visibleCount)

  if (tags.length === 0) return null

  return (
    <div className="tag-filter-bar">
      <div
        ref={rowRef}
        role="group"
        aria-label={t('dashboard.tagsGroupLabel')}
        className="tag-filter-bar__row"
        style={!expanded && rowHeight ? { maxHeight: rowHeight, overflow: 'hidden' } : undefined}
      >
        {orderedTags.map(tag => (
          <button
            key={tag}
            type="button"
            aria-pressed={selectedTags.has(tag)}
            className={`dashboard__tab${selectedTags.has(tag) ? ' dashboard__tab--active' : ''}`}
            onClick={() => onToggleTag(tag)}
          >
            {tagLabel(tag)}
          </button>
        ))}
      </div>
      {hiddenCount > 0 && (
        <button
          type="button"
          className="tag-filter-bar__toggle"
          onClick={() => setExpanded(e => !e)}
        >
          {expanded ? t('dashboard.showLessTags') : t('dashboard.moreTags', { count: hiddenCount })}
        </button>
      )}
    </div>
  )
}
