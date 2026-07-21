import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import GameCard from './GameCard'
import FeaturedGameCard from './FeaturedGameCard'
import CategorySection from './CategorySection'
import TagFilterBar from './TagFilterBar'
import useScores from '../hooks/useScores'
import useSettings from '../hooks/useSettings'
import useRecentlyPlayed from '../hooks/useRecentlyPlayed'
import useFeaturedGame from '../hooks/useFeaturedGame'
import useGameTags from '../hooks/useGameTags'
import useFocusOnMount from '../hooks/useFocusOnMount'
import './Dashboard.css'

const TAG_ICONS = {
  sounds:     '🔊',
  visual:     '👁️',
  numbers:    '🔢',
  animals:    '🐾',
  colors:     '🎨',
  characters: '🎭',
}

function tagLabel(tag, t) {
  return t(`dashboard.tag.${tag}`, { defaultValue: tag.charAt(0).toUpperCase() + tag.slice(1) })
}

function buildSections(manifests, tagMap, allTags, t) {
  const sections = []
  for (const tag of allTags) {
    // Primary-tag membership (first tag in the manifest's own tags array),
    // not "any matching tag" -- a game with multiple tags (the common case
    // in production manifests, e.g. animal-sounds: ["sounds", "animals"])
    // would otherwise render into every one of its tag sections at once in
    // this unfiltered browse view, duplicating its card (and any per-card
    // state, like the recently-played badge) on the page.
    const games = manifests.filter(m => (tagMap.get(m.id) ?? [])[0] === tag)
    if (games.length > 0) {
      const icon = TAG_ICONS[tag] ?? ''
      const label = `${icon} ${tagLabel(tag, t)}`.trim()
      sections.push({ heading: label, games })
    }
  }
  const untagged = manifests.filter(m => (tagMap.get(m.id) ?? []).length === 0)
  if (untagged.length > 0) {
    sections.push({ heading: t('dashboard.categoryOther'), games: untagged })
  }
  return sections
}

export default function Dashboard({ manifests = [] }) {
  const { t } = useTranslation()
  const { getBestScore } = useScores()
  const { settings } = useSettings()
  const recentlyPlayed = useRecentlyPlayed()
  const featured = useFeaturedGame(manifests)
  const { tagMap, allTags } = useGameTags(manifests)
  const [searchText, setSearchText] = useState('')
  const [selectedTags, setSelectedTags] = useState(() => new Set())
  const titleRef = useFocusOnMount()

  const name = settings.childName?.trim()
  const title = name ? t('dashboard.titleNamed', { name }) : t('dashboard.titleDefault')

  const normalizedSearch = searchText.trim().toLowerCase()

  const searchMatches = useMemo(
    () => manifests.filter(m =>
      normalizedSearch === '' || t(m.nameKey).toLowerCase().includes(normalizedSearch)
    ),
    [manifests, normalizedSearch, t]
  )

  const visibleTags = useMemo(() => {
    const tagSet = new Set()
    for (const m of searchMatches) {
      for (const tag of tagMap.get(m.id) ?? []) tagSet.add(tag)
    }
    return allTags.filter(tag => tagSet.has(tag))
  }, [searchMatches, tagMap, allTags])

  const isFiltering = normalizedSearch !== '' || selectedTags.size > 0

  const filteredManifests = isFiltering
    ? searchMatches.filter(m => {
        const tags = tagMap.get(m.id) ?? []
        return [...selectedTags].every(tag => tags.includes(tag))
      })
    : manifests

  const sections = isFiltering ? null : buildSections(manifests, tagMap, allTags, t)

  function toggleTag(tag) {
    setSelectedTags(prev => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  function clearFilters() {
    setSearchText('')
    setSelectedTags(new Set())
  }

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <h1 className="dashboard__title" tabIndex={-1} ref={titleRef}>🌊 {title}</h1>
      </div>

      <FeaturedGameCard manifest={featured} />

      {manifests.length === 0 ? (
        <p className="dashboard__empty">{t('dashboard.empty')}</p>
      ) : (
        <>
          <div className="dashboard__search">
            <label htmlFor="dashboard-search" className="sr-only">
              {t('dashboard.searchLabel')}
            </label>
            <input
              id="dashboard-search"
              type="search"
              className="dashboard__search-input"
              placeholder={t('dashboard.searchPlaceholder')}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
          </div>

          <TagFilterBar
            tags={visibleTags}
            selectedTags={selectedTags}
            onToggleTag={toggleTag}
            tagLabel={tag => tagLabel(tag, t)}
          />

          {isFiltering && (
            <div className="dashboard__filter-status">
              <span role="status">{t('dashboard.resultsCount', { count: filteredManifests.length })}</span>
              <button type="button" className="dashboard__clear-filters" onClick={clearFilters}>
                {t('dashboard.clearFilters')}
              </button>
            </div>
          )}

          {sections ? (
            <div className="dashboard__sections">
              {sections.map(({ heading, games }) => (
                <CategorySection key={heading} heading={heading}>
                  {games.map(m => (
                    <GameCard
                      key={m.id}
                      manifest={m}
                      bestScore={getBestScore(m.id)}
                      recentInfo={recentlyPlayed.get(m.id) ?? null}
                    />
                  ))}
                </CategorySection>
              ))}
            </div>
          ) : filteredManifests.length === 0 ? (
            <p className="dashboard__empty">{t('dashboard.noResults')}</p>
          ) : (
            <div className="dashboard__grid">
              {filteredManifests.map(m => (
                <GameCard
                  key={m.id}
                  manifest={m}
                  bestScore={getBestScore(m.id)}
                  recentInfo={recentlyPlayed.get(m.id) ?? null}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
