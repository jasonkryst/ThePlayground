import { useTranslation } from 'react-i18next'
import './ResumePrompt.css'

export default function ResumePrompt({ index, total, score, onResume, onStartFresh }) {
  const { t } = useTranslation()

  return (
    <div className="resume-prompt">
      <h2 className="resume-prompt__heading">{t('common.resumeHeading')}</h2>
      <p className="resume-prompt__progress">
        {t('common.resumeProgress', { current: index + 1, total, score })}
      </p>
      <div className="resume-prompt__actions">
        <button className="resume-prompt__resume" data-testid="resume-prompt-resume" onClick={onResume}>
          {t('common.resumeAction')}
        </button>
        <button className="resume-prompt__start-fresh" data-testid="resume-prompt-start-fresh" onClick={onStartFresh}>
          {t('common.resumeStartFreshAction')}
        </button>
      </div>
    </div>
  )
}
