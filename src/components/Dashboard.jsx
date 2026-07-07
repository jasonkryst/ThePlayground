import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import GameCard from './GameCard'
import FeaturedGameCard from './FeaturedGameCard'
import CategorySection from './CategorySection'
import useScores from '../hooks/useScores'
import useSettings from '../hooks/useSettings'
import useRecentlyPlayed from '../hooks/useRecentlyPlayed'
import useFeaturedGame from '../hooks/useFeaturedGame'
import useGameTags from '../hooks/useGameTags'
import { version } from '../../package.json'
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

function buildSections(manifests, tagMap, featuredId, allTags, t) {
  const sections = []
  for (const tag of allTags) {
    const games = manifests.filter(
      m => m.id !== featuredId && (tagMap.get(m.id) ?? []).includes(tag)
    )
    if (games.length > 0) {
      const icon = TAG_ICONS[tag] ?? ''
      const label = `${icon} ${tagLabel(tag, t)}`.trim()
      sections.push({ heading: label, games })
    }
  }
  const untagged = manifests.filter(
    m => m.id !== featuredId && (tagMap.get(m.id) ?? []).length === 0
  )
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
  const [activeTag, setActiveTag] = useState('all')
  const titleRef = useRef(null)
  useEffect(() => { titleRef.current?.focus() }, [])

  const name = settings.childName?.trim()
  const title = name ? t('dashboard.titleNamed', { name }) : t('dashboard.titleDefault')

  const filteredManifests = activeTag === 'all'
    ? manifests
    : manifests.filter(m => (tagMap.get(m.id) ?? []).includes(activeTag))

  const sections = activeTag === 'all'
    ? buildSections(manifests, tagMap, featured?.id, allTags, t)
    : null

  return (
    <div className="dashboard">
      <main>
        <div className="dashboard__header">
          <h1 className="dashboard__title" tabIndex={-1} ref={titleRef}>🌊 {title}</h1>
          <div className="dashboard__nav">
            <Link to="/parent" className="dashboard__nav-link" aria-label={t('dashboard.parentLabel')}>📊</Link>
            <Link to="/my-progress" className="dashboard__nav-link" aria-label={t('dashboard.myProgressLabel')}>🌟</Link>
            <Link to="/admin"  className="dashboard__nav-link" aria-label={t('dashboard.settingsLabel')}>⚙️</Link>
          </div>
        </div>

        {activeTag === 'all' && <FeaturedGameCard manifest={featured} />}

        {manifests.length === 0 ? (
          <p className="dashboard__empty">{t('dashboard.empty')}</p>
        ) : (
          <>
            {allTags.length > 0 && (
              <div className="dashboard__tabs" role="tablist" aria-label={t('dashboard.tabsLabel')}>
                <button
                  id="dashboard-tab-all"
                  role="tab"
                  aria-selected={activeTag === 'all'}
                  aria-controls="dashboard-panel-all"
                  className={`dashboard__tab${activeTag === 'all' ? ' dashboard__tab--active' : ''}`}
                  onClick={() => setActiveTag('all')}
                >
                  {t('dashboard.tabAll')}
                </button>
                {allTags.map(tag => (
                  <button
                    key={tag}
                    id={`dashboard-tab-${tag}`}
                    role="tab"
                    aria-selected={activeTag === tag}
                    aria-controls={`dashboard-panel-${tag}`}
                    className={`dashboard__tab${activeTag === tag ? ' dashboard__tab--active' : ''}`}
                    onClick={() => setActiveTag(tag)}
                  >
                    {tagLabel(tag, t)}
                  </button>
                ))}
              </div>
            )}

            <div
              {...(allTags.length > 0
                ? {
                    role: 'tabpanel',
                    id: `dashboard-panel-${activeTag}`,
                    'aria-labelledby': `dashboard-tab-${activeTag}`,
                  }
                : {})}
            >
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
            </div>
          </>
        )}
      </main>

      <footer className="dashboard__footer">
        <span>{t('dashboard.footerName')}</span>
        <span className="dashboard__version">v{version}</span>
      </footer>
    </div>
  )
}
