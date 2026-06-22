import { Link } from 'react-router-dom'
import useSettings from '../hooks/useSettings'
import useScores from '../hooks/useScores'
import ScoreHistory from '../components/ScoreHistory'
import './AdminPage.css'

export default function AdminPage() {
  const { settings, updateSetting, resetSettings } = useSettings()
  const { getAllScores } = useScores()

  return (
    <div className="admin">
      <div className="admin__header">
        <Link to="/" className="admin__back" aria-label="Back to dashboard">←</Link>
        <h1 className="admin__title">⚙️ Settings</h1>
      </div>

      <div className="admin__section">
        <h2>Child's Name</h2>
        <input
          className="admin__text-input"
          type="text"
          placeholder="Enter child's name"
          value={settings.childName || ''}
          onChange={e => updateSetting('childName', e.target.value)}
          aria-label="Child's Name"
          spellCheck={false}
        />
      </div>

      <div className="admin__section">
        <h2>Answer Choices</h2>
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
        <h2>Feedback Mode</h2>
        <div className="admin__toggle">
          {[
            { value: 'immediate', label: '⚡ Immediate' },
            { value: 'parent-tap', label: '👆 Parent Tap' },
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
        <h2>Questions Per Session</h2>
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
        <h2>Google Analytics</h2>
        <p className="admin__hint">Enter your Measurement ID to enable analytics tracking.</p>
        <input
          className="admin__text-input"
          type="text"
          placeholder="G-XXXXXXXXXX"
          value={settings.gaId || ''}
          onChange={e => updateSetting('gaId', e.target.value)}
          aria-label="Google Analytics Measurement ID"
          spellCheck={false}
        />
      </div>

      <button className="admin__reset" onClick={resetSettings}>
        Reset to Defaults
      </button>

      <div className="admin__section">
        <h2>Score History</h2>
        <ScoreHistory scores={getAllScores()} />
      </div>
    </div>
  )
}
