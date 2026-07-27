import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import useSettings from '../hooks/useSettings'
import useScores from '../hooks/useScores'
import useBadges from '../hooks/useBadges'
import ScoreHistory from '../components/ScoreHistory'
import BadgeGallery from '../components/BadgeGallery'
import LocaleSelector from '../components/LocaleSelector'
import { SUPPORTED_LOCALES } from '../i18n'
import './AdminPage.css'

export default function AdminPage({ manifests = [] }) {
  const { t } = useTranslation()
  const { settings, loaded, updateSetting, resetSettings } = useSettings()
  const { getAllScores } = useScores()
  const { badgeData } = useBadges()

  const [activeTab, setActiveTab] = useState('settings')

  const [resetConfirming, setResetConfirming] = useState(false)
  const resetConfirmTimeoutRef = useRef(null)
  useEffect(() => () => clearTimeout(resetConfirmTimeoutRef.current), [])

  const [pinDraft, setPinDraft] = useState('')
  const [pinConfirmDraft, setPinConfirmDraft] = useState('')
  const [pinError, setPinError] = useState(null) // 'mismatch' | 'invalid' | null

  function handleSetPin() {
    if (!/^\d{4}$/.test(pinDraft)) {
      setPinError('invalid')
      return
    }
    if (pinDraft !== pinConfirmDraft) {
      setPinError('mismatch')
      return
    }
    setPinError(null)
    updateSetting('parentalLock', { ...settings.parentalLock, pin: pinDraft })
    setPinDraft('')
    setPinConfirmDraft('')
  }

  function handleRemovePin() {
    updateSetting('parentalLock', { ...settings.parentalLock, pin: '' })
    setPinDraft('')
    setPinConfirmDraft('')
    setPinError(null)
  }

  function handleResetClick() {
    if (resetConfirming) {
      clearTimeout(resetConfirmTimeoutRef.current)
      setResetConfirming(false)
      resetSettings()
      return
    }
    setResetConfirming(true)
    resetConfirmTimeoutRef.current = setTimeout(() => setResetConfirming(false), 4000)
  }

  const [tagDraft, setTagDraft] = useState(() =>
    Object.fromEntries(
      manifests.map(m => {
        const effective = (settings.tagOverrides ?? {})[m.id] ?? m.tags ?? []
        return [m.id, { value: effective.join(', '), error: false }]
      })
    )
  )

  // Settings load asynchronously after mount; the tagDraft initializer above
  // runs before that resolves, so it captures manifest defaults instead of
  // any persisted overrides. Re-sync once loaded flips true (a single
  // one-time transition), so persisted tag overrides actually appear.
  useEffect(() => {
    if (!loaded) return
    setTagDraft(Object.fromEntries(
      manifests.map(m => {
        const effective = (settings.tagOverrides ?? {})[m.id] ?? m.tags ?? []
        return [m.id, { value: effective.join(', '), error: false }]
      })
    ))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

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

  function handleIntroReplay(gameId) {
    const { [gameId]: _, ...rest } = settings.introDismissed ?? {}
    updateSetting('introDismissed', rest)
  }

  const tabs = [
    { id: 'settings', label: t('admin.tabSettings') },
    { id: 'games',    label: t('admin.tabGames') },
    { id: 'badges',   label: t('admin.tabBadges') },
    { id: 'history',  label: t('admin.tabHistory') },
  ]

  return (
    <div className="admin">
      <div className="admin__tabs" role="tablist" aria-label={t('admin.title')}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            id={`admin-tab-${tab.id}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`admin-panel-${tab.id}`}
            className={`admin__tab${activeTab === tab.id ? ' admin__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'settings' && (
        <div role="tabpanel" id="admin-panel-settings" aria-labelledby="admin-tab-settings">
          <section className="admin__group">
            <h2 className="admin__group-heading">{t('admin.groupGeneral')}</h2>

            <LocaleSelector
              locales={SUPPORTED_LOCALES}
              value={settings.locale}
              onChange={val => updateSetting('locale', val)}
            />

            <div className="admin__section">
              <h3>{t('admin.childNameHeading')}</h3>
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
              <h3>{t('admin.animationsHeading')}</h3>
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
              <h3>{t('admin.soundEffectsHeading')}</h3>
              <div className="admin__toggle">
                <button
                  className={`admin__toggle-btn${settings.soundEffectsEnabled ? ' active' : ''}`}
                  onClick={() => updateSetting('soundEffectsEnabled', true)}
                >
                  {t('admin.soundEffectsOn')}
                </button>
                <button
                  className={`admin__toggle-btn${!settings.soundEffectsEnabled ? ' active' : ''}`}
                  onClick={() => updateSetting('soundEffectsEnabled', false)}
                >
                  {t('admin.soundEffectsOff')}
                </button>
              </div>
            </div>

            <div className="admin__section">
              <h3>{t('admin.themeHeading')}</h3>
              <div className="admin__toggle">
                {[
                  { value: 'system', label: t('admin.themeSystem') },
                  { value: 'light', label: t('admin.themeLight') },
                  { value: 'dark', label: t('admin.themeDark') },
                  { value: 'high-contrast', label: t('admin.themeHighContrast') },
                ].map(opt => (
                  <button
                    key={opt.value}
                    className={`admin__toggle-btn${settings.theme === opt.value ? ' active' : ''}`}
                    onClick={() => updateSetting('theme', opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="admin__section">
              <h3>{t('admin.gaHeading')}</h3>
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

            <div className="admin__section">
              <h3>{t('admin.parentalLockHeading')}</h3>
              <p className="admin__hint">{t('admin.parentalLockHint')}</p>
              <div className="admin__toggle">
                <button
                  className={`admin__toggle-btn${settings.parentalLock?.enabled ? ' active' : ''}`}
                  onClick={() => updateSetting('parentalLock', { ...settings.parentalLock, enabled: true })}
                >
                  {t('admin.parentalLockToggleOn')}
                </button>
                <button
                  className={`admin__toggle-btn${!settings.parentalLock?.enabled ? ' active' : ''}`}
                  onClick={() => updateSetting('parentalLock', { ...settings.parentalLock, enabled: false })}
                >
                  {t('admin.parentalLockToggleOff')}
                </button>
              </div>
              {settings.parentalLock?.enabled && (
                <div className="admin__tag-row">
                  <p className="admin__hint">
                    {settings.parentalLock?.pin ? t('admin.parentalLockModePinHint') : t('admin.parentalLockModeMathHint')}
                  </p>
                  <input
                    className="admin__text-input"
                    type="text"
                    inputMode="numeric"
                    placeholder={t('admin.parentalLockPinPlaceholder')}
                    value={pinDraft}
                    onChange={e => { setPinDraft(e.target.value); setPinError(null) }}
                    aria-label={t('admin.parentalLockPinLabel')}
                  />
                  <input
                    className="admin__text-input"
                    type="text"
                    inputMode="numeric"
                    placeholder={t('admin.parentalLockPinConfirmPlaceholder')}
                    value={pinConfirmDraft}
                    onChange={e => { setPinConfirmDraft(e.target.value); setPinError(null) }}
                    aria-label={t('admin.parentalLockPinConfirmLabel')}
                  />
                  {pinError === 'mismatch' && <p className="admin__tag-error">{t('admin.parentalLockPinMismatchError')}</p>}
                  {pinError === 'invalid' && <p className="admin__tag-error">{t('admin.parentalLockPinInvalidError')}</p>}
                  <div className="admin__tag-buttons">
                    <button className="admin__tag-save" onClick={handleSetPin}>
                      {t('admin.parentalLockSetPinButton')}
                    </button>
                    {settings.parentalLock?.pin && (
                      <button className="admin__tag-reset" onClick={handleRemovePin}>
                        {t('admin.parentalLockRemovePinButton')}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="admin__group">
            <h2 className="admin__group-heading">{t('admin.groupQuizGames')}</h2>

            <div className="admin__section">
              <h3>{t('admin.answerChoicesHeading')}</h3>
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
              <h3>{t('admin.feedbackModeHeading')}</h3>
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
              <h3>{t('admin.questionsPerSessionHeading')}</h3>
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
              <h3>{t('admin.timerHeading')}</h3>
              <div className="admin__radios">
                <label className={`admin__radio-label${settings.timerMode === 'off' ? ' selected' : ''}`}>
                  <input
                    type="radio"
                    name="timerMode"
                    checked={settings.timerMode === 'off'}
                    onChange={() => updateSetting('timerMode', 'off')}
                    aria-label={t('admin.timerOff')}
                  />
                  {t('admin.timerOff')}
                </label>
                <label className={`admin__radio-label${settings.timerMode === 'countUp' ? ' selected' : ''}`}>
                  <input
                    type="radio"
                    name="timerMode"
                    checked={settings.timerMode === 'countUp'}
                    onChange={() => updateSetting('timerMode', 'countUp')}
                    aria-label={t('admin.timerCountUp')}
                  />
                  {t('admin.timerCountUp')}
                </label>
                {[5, 10, 15, 20].map(n => (
                  <label
                    key={n}
                    className={`admin__radio-label${settings.timerMode === 'countdown' && settings.timeLimitSeconds === n ? ' selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="timerMode"
                      checked={settings.timerMode === 'countdown' && settings.timeLimitSeconds === n}
                      onChange={() => {
                        updateSetting('timerMode', 'countdown')
                        updateSetting('timeLimitSeconds', n)
                      }}
                      aria-label={t('admin.timerCountdown', { seconds: n })}
                    />
                    {t('admin.timerCountdown', { seconds: n })}
                  </label>
                ))}
              </div>
            </div>

            <div className="admin__section">
              <h3>{t('admin.speedRecordThresholdHeading')}</h3>
              <p className="admin__hint">{t('admin.speedRecordThresholdHint')}</p>
              <div className="admin__radios">
                {[70, 75, 80, 85, 90, 95, 100].map(pct => (
                  <label
                    key={pct}
                    className={`admin__radio-label${settings.speedRecordMinAccuracy === pct ? ' selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="speedRecordMinAccuracy"
                      checked={settings.speedRecordMinAccuracy === pct}
                      onChange={() => updateSetting('speedRecordMinAccuracy', pct)}
                      aria-label={`${pct}%`}
                    />
                    {pct}%
                  </label>
                ))}
              </div>
            </div>

            <div className="admin__section">
              <h3>{t('admin.maxTriesHeading')}</h3>
              <p className="admin__hint">{t('admin.maxTriesHint')}</p>
              <div className="admin__radios">
                {['none', 1, 2, 3, 4, 5, 'unlimited'].map(value => (
                  <label
                    key={value}
                    className={`admin__radio-label${settings.maxTries === value ? ' selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="maxTries"
                      checked={settings.maxTries === value}
                      onChange={() => updateSetting('maxTries', value)}
                      aria-label={value === 'none' ? t('admin.maxTriesNone') : value === 'unlimited' ? t('admin.maxTriesUnlimited') : String(value)}
                    />
                    {value === 'none' ? t('admin.maxTriesNone') : value === 'unlimited' ? t('admin.maxTriesUnlimited') : value}
                  </label>
                ))}
              </div>
            </div>

            <div className="admin__section">
              <h3>{t('admin.hintsHeading')}</h3>
              <div className="admin__toggle">
                <button
                  className={`admin__toggle-btn${settings.hintsEnabled ? ' active' : ''}`}
                  onClick={() => updateSetting('hintsEnabled', true)}
                >
                  {t('admin.hintsOn')}
                </button>
                <button
                  className={`admin__toggle-btn${!settings.hintsEnabled ? ' active' : ''}`}
                  onClick={() => updateSetting('hintsEnabled', false)}
                >
                  {t('admin.hintsOff')}
                </button>
              </div>
              {settings.hintsEnabled && (
                <div className="admin__radios">
                  <h3>{t('admin.hintAfterWrongTapsHeading')}</h3>
                  {[1, 2, 3, 4, 5].map(n => (
                    <label
                      key={n}
                      className={`admin__radio-label${settings.hintAfterWrongTaps === n ? ' selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="hintAfterWrongTaps"
                        checked={settings.hintAfterWrongTaps === n}
                        onChange={() => updateSetting('hintAfterWrongTaps', n)}
                        aria-label={String(n)}
                      />
                      {n}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="admin__section">
              <h3>{t('admin.retryStreakHeading')}</h3>
              <div className="admin__toggle">
                <button
                  className={`admin__toggle-btn${settings.retryCountsAsStreak ? ' active' : ''}`}
                  onClick={() => updateSetting('retryCountsAsStreak', true)}
                >
                  {t('admin.retryStreakOn')}
                </button>
                <button
                  className={`admin__toggle-btn${!settings.retryCountsAsStreak ? ' active' : ''}`}
                  onClick={() => updateSetting('retryCountsAsStreak', false)}
                >
                  {t('admin.retryStreakOff')}
                </button>
              </div>
            </div>

            <div className="admin__section">
              <h3>{t('admin.spacedRepetitionHeading')}</h3>
              <div className="admin__toggle">
                <button
                  className={`admin__toggle-btn${settings.spacedRepetitionEnabled ? ' active' : ''}`}
                  onClick={() => updateSetting('spacedRepetitionEnabled', true)}
                >
                  {t('admin.spacedRepetitionOn')}
                </button>
                <button
                  className={`admin__toggle-btn${!settings.spacedRepetitionEnabled ? ' active' : ''}`}
                  onClick={() => updateSetting('spacedRepetitionEnabled', false)}
                >
                  {t('admin.spacedRepetitionOff')}
                </button>
              </div>
            </div>

            <div className="admin__section">
              <h3>{t('admin.adaptiveItemSelectionHeading')}</h3>
              <div className="admin__toggle">
                <button
                  className={`admin__toggle-btn${settings.adaptiveItemSelectionEnabled ? ' active' : ''}`}
                  onClick={() => updateSetting('adaptiveItemSelectionEnabled', true)}
                >
                  {t('admin.adaptiveItemSelectionOn')}
                </button>
                <button
                  className={`admin__toggle-btn${!settings.adaptiveItemSelectionEnabled ? ' active' : ''}`}
                  onClick={() => updateSetting('adaptiveItemSelectionEnabled', false)}
                >
                  {t('admin.adaptiveItemSelectionOff')}
                </button>
              </div>
            </div>

            <div className="admin__section">
              <h3>{t('admin.difficultyAutoProgressionHeading')}</h3>
              <div className="admin__toggle">
                <button
                  className={`admin__toggle-btn${settings.difficultyAutoProgressionEnabled ? ' active' : ''}`}
                  onClick={() => updateSetting('difficultyAutoProgressionEnabled', true)}
                >
                  {t('admin.difficultyAutoProgressionOn')}
                </button>
                <button
                  className={`admin__toggle-btn${!settings.difficultyAutoProgressionEnabled ? ' active' : ''}`}
                  onClick={() => updateSetting('difficultyAutoProgressionEnabled', false)}
                >
                  {t('admin.difficultyAutoProgressionOff')}
                </button>
              </div>
            </div>
          </section>

          <section className="admin__group">
            <h2 className="admin__group-heading">{t('admin.groupMemoryGames')}</h2>
            <div className="admin__section">
              <h3>{t('admin.memoryPairsHeading')}</h3>
              <p className="admin__hint">{t('admin.memoryPairsHint')}</p>
              <div className="admin__radios">
                {[3, 4, 5, 6].map(n => (
                  <label
                    key={n}
                    className={`admin__radio-label${settings.memoryPairs === n ? ' selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="memoryPairs"
                      checked={settings.memoryPairs === n}
                      onChange={() => updateSetting('memoryPairs', n)}
                      aria-label={String(n)}
                    />
                    {n}
                  </label>
                ))}
              </div>
            </div>
          </section>

          <button className="admin__reset" onClick={handleResetClick}>
            {resetConfirming ? t('admin.resetConfirm') : t('admin.reset')}
          </button>
        </div>
      )}

      {activeTab === 'games' && (
        <div className="admin__section" role="tabpanel" id="admin-panel-games" aria-labelledby="admin-tab-games">
          <h2>{t('admin.tagsHeading')}</h2>
          <p className="admin__hint">{t('admin.tagsHint')}</p>
          {manifests.length === 0 && (
            <p className="admin__hint">{t('admin.noGamesFound')}</p>
          )}
          {manifests.map(m => (
            <div key={m.id} className="admin__tag-row">
              <label htmlFor={`tags-${m.id}`} className="admin__tag-label">
                {t('admin.tagsGameLabel', { name: t(m.nameKey) })}
              </label>
              <input
                id={`tags-${m.id}`}
                className="admin__text-input"
                type="text"
                value={tagDraft[m.id]?.value ?? ''}
                placeholder={t('admin.tagsInputPlaceholder')}
                onChange={e => handleTagChange(m.id, e.target.value)}
                aria-label={t('admin.tagsGameLabel', { name: t(m.nameKey) })}
                spellCheck={false}
              />
              <div className="admin__tag-buttons">
                <button className="admin__tag-save" onClick={() => handleTagSave(m.id)}>
                  {t('admin.tagsSaveButton')}
                </button>
                <button className="admin__tag-reset" onClick={() => handleTagReset(m.id)}>
                  {t('admin.tagsResetButton')}
                </button>
                <button className="admin__intro-replay" onClick={() => handleIntroReplay(m.id)}>
                  {t('admin.introReplayButton')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'badges' && (
        <div className="admin__section" role="tabpanel" id="admin-panel-badges" aria-labelledby="admin-tab-badges">
          <h2>{t('admin.badgesHeading')}</h2>
          <BadgeGallery manifests={manifests} badgeData={badgeData} />
        </div>
      )}

      {activeTab === 'history' && (
        <div className="admin__section" role="tabpanel" id="admin-panel-history" aria-labelledby="admin-tab-history">
          <h2>{t('admin.scoreHistoryHeading')}</h2>
          <ScoreHistory scores={getAllScores()} />
        </div>
      )}
    </div>
  )
}
