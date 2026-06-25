import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useSettings from '../hooks/useSettings'
import useScores from '../hooks/useScores'
import ScoreHistory from '../components/ScoreHistory'
import './AdminPage.css'

export default function AdminPage() {
  const { t } = useTranslation()
  const { settings, updateSetting, resetSettings } = useSettings()
  const { getAllScores } = useScores()

  return (
    <div className="admin">
      <main>
        <div className="admin__header">
          <Link to="/" className="admin__back" aria-label={t('admin.back')}>←</Link>
          <h1 className="admin__title">{t('admin.title')}</h1>
        </div>

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

        <div className="admin__section">
          <h2>{t('admin.scoreHistoryHeading')}</h2>
          <ScoreHistory scores={getAllScores()} />
        </div>
      </main>
    </div>
  )
}
