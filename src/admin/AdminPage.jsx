import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useSettings from '../hooks/useSettings'
import useScores from '../hooks/useScores'
import ScoreHistory from '../components/ScoreHistory'
import './AdminPage.css'

export default function AdminPage({ manifests = [] }) {
  const { t } = useTranslation()
  const { settings, updateSetting, resetSettings } = useSettings()
  const { getAllScores } = useScores()

  const [activeTab, setActiveTab] = useState('settings')

  const [tagDraft, setTagDraft] = useState(() =>
    Object.fromEntries(
      manifests.map(m => {
        const effective = (settings.tagOverrides ?? {})[m.id] ?? m.tags ?? []
        return [m.id, { value: effective.join(', '), error: false }]
      })
    )
  )

  function handleTagChange(gameId, value) {
    setTagDraft(d => ({ ...d, [gameId]: { value } }))
  }

  function handleTagSave(gameId) {
    const raw = tagDraft[gameId]?.value ?? ''
    const trimmed = raw.trim()
    if (trimmed === '') {
      const { [gameId]: _, ...rest } = settings.tagOverrides ?? {}
      updateSetting('tagOverrides', rest)
    } else {
      const tags = trimmed.split(',').map(s => s.trim()).filter(Boolean)
      const next = { ...(settings.tagOverrides ?? {}), [gameId]: tags }
      updateSetting('tagOverrides', next)
    }
  }

  function handleTagReset(gameId) {
    const manifest = manifests.find(m => m.id === gameId)
    if (manifest) {
      setTagDraft(d => ({ ...d, [gameId]: { value: (manifest.tags ?? []).join(', ') } }))
      const { [gameId]: _, ...rest } = settings.tagOverrides ?? {}
      updateSetting('tagOverrides', rest)
    }
  }

  const tabs = [
    { id: 'settings', label: t('admin.tabSettings') },
    { id: 'games',    label: t('admin.tabGames') },
    { id: 'history',  label: t('admin.tabHistory') },
  ]

  return (
    <div className="admin">
      <main>
        <div className="admin__header">
          <Link to="/" className="admin__back" aria-label={t('admin.back')}>←</Link>
          <h1 className="admin__title">{t('admin.title')}</h1>
        </div>

        <div className="admin__tabs" role="tablist" aria-label={t('admin.title')}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`admin__tab${activeTab === tab.id ? ' admin__tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'settings' && (
          <>
            <div className="admin__section">
              <h2>{t('admin.childNameHeading')}</h2>
              <p className="admin__hint">{t('admin.childNameHint')}</p>
              <input
                className="admin__text-input"
                type="text"
                placeholder={t('admin.childNamePlaceholder')}
                value={settings.childName || ''}
                onChange={e => updateSetting('childName', e.target.value)}
                aria-label={t('admin.childNameLabel')}
                spellCheck={false}
              />
            </div>

            <div className="admin__section">
              <h2>{t('admin.answerChoicesHeading')}</h2>
              <div className="admin__radios">
                {[2, 3, 4].map(n => (
                  <label
                    key={n}
                    className={`admin__radio-label${settings.numChoices === n ? ' selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="numChoices"
                      checked={settings.numChoices === n}
                      onChange={() => updateSetting('numChoices', n)}
                      aria-label={String(n)}
                    />
                    {n}
                  </label>
                ))}
              </div>
            </div>

            <div className="admin__section">
              <h2>{t('admin.feedbackModeHeading')}</h2>
              <div className="admin__toggle">
                {[
                  { value: 'immediate', label: t('admin.feedbackImmediate') },
                  { value: 'parent-tap', label: t('admin.feedbackParentTap') },
                ].map(opt => (
                  <button
                    key={opt.value}
                    className={`admin__toggle-btn${settings.feedbackMode === opt.value ? ' active' : ''}`}
                    onClick={() => updateSetting('feedbackMode', opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="admin__section">
              <h2>{t('admin.animationsHeading')}</h2>
              <div className="admin__toggle">
                <button
                  className={`admin__toggle-btn${settings.animationsEnabled ? ' active' : ''}`}
                  onClick={() => updateSetting('animationsEnabled', true)}
                >
                  {t('admin.animationsOn')}
                </button>
                <button
                  className={`admin__toggle-btn${!settings.animationsEnabled ? ' active' : ''}`}
                  onClick={() => updateSetting('animationsEnabled', false)}
                >
                  {t('admin.animationsOff')}
                </button>
              </div>
            </div>

            <div className="admin__section">
              <h2>{t('admin.questionsPerSessionHeading')}</h2>
              <div className="admin__radios">
                {[5, 10, 15, 20].map(n => (
                  <label
                    key={n}
                    className={`admin__radio-label${settings.questionsPerSession === n ? ' selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="questionsPerSession"
                      checked={settings.questionsPerSession === n}
                      onChange={() => updateSetting('questionsPerSession', n)}
                      aria-label={String(n)}
                    />
                    {n}
                  </label>
                ))}
              </div>
            </div>

            <div className="admin__section">
              <h2>{t('admin.gaHeading')}</h2>
              <p className="admin__hint">{t('admin.gaHint')}</p>
              <input
                className="admin__text-input"
                type="text"
                placeholder="G-XXXXXXXXXX"
                value={settings.gaId || ''}
                onChange={e => updateSetting('gaId', e.target.value)}
                aria-label={t('admin.gaLabel')}
                spellCheck={false}
              />
            </div>

            <button className="admin__reset" onClick={resetSettings}>
              {t('admin.reset')}
            </button>
          </>
        )}

        {activeTab === 'games' && (
          <div className="admin__section">
            <h2>{t('admin.tagsHeading')}</h2>
            <p className="admin__hint">{t('admin.tagsHint')}</p>
            {manifests.length === 0 && (
              <p className="admin__hint">No games found.</p>
            )}
            {manifests.map(m => (
              <div key={m.id} className="admin__tag-row">
                <label htmlFor={`tags-${m.id}`} className="admin__tag-label">
                  {t('admin.tagsGameLabel', { name: m.name })}
                </label>
                <input
                  id={`tags-${m.id}`}
                  className="admin__text-input"
                  type="text"
                  value={tagDraft[m.id]?.value ?? ''}
                  placeholder={t('admin.tagsInputPlaceholder')}
                  onChange={e => handleTagChange(m.id, e.target.value)}
                  aria-label={t('admin.tagsGameLabel', { name: m.name })}
                  spellCheck={false}
                />
                <div className="admin__tag-buttons">
                  <button className="admin__tag-save" onClick={() => handleTagSave(m.id)}>
                    {t('admin.tagsSaveButton')}
                  </button>
                  <button className="admin__tag-reset" onClick={() => handleTagReset(m.id)}>
                    {t('admin.tagsResetButton')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="admin__section">
            <h2>{t('admin.scoreHistoryHeading')}</h2>
            <ScoreHistory scores={getAllScores()} />
          </div>
        )}
      </main>
    </div>
  )
}
