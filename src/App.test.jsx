import { render, waitFor, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import i18n from './i18n'
import App from './App'
import storage from './storage/index'

vi.mock('./storage/index', () => ({
  default: {
    getSettings: vi.fn().mockResolvedValue({ locale: 'en' }),
    saveSettings: vi.fn().mockResolvedValue(undefined),
    getScores: vi.fn().mockResolvedValue([]),
    addScore: vi.fn().mockResolvedValue(undefined),
    getBestStreaks: vi.fn().mockResolvedValue({}),
    saveBestStreaks: vi.fn().mockResolvedValue(undefined),
    getPersonalBests: vi.fn().mockResolvedValue({}),
    savePersonalBests: vi.fn().mockResolvedValue(undefined),
    getBadgeData: vi.fn().mockResolvedValue({ awards: {}, lifetimeQuestions: {} }),
    saveBadgeData: vi.fn().mockResolvedValue(undefined),
  },
  DEFAULT_SETTINGS: { locale: 'en' },
}))

describe('App — locale sync', () => {
  // Reset to a language distinct from the mocked settings locale ('en') so the
  // assertion below exercises a real (non-redundant) sync rather than being a
  // same-language no-op that LocaleSync's redundant-call guard would suppress.
  beforeEach(async () => { await i18n.changeLanguage('xx') })

  it('calls i18n.changeLanguage with the loaded settings locale', async () => {
    const spy = vi.spyOn(i18n, 'changeLanguage')
    render(<App />)
    await waitFor(() => expect(spy).toHaveBeenCalledWith('en'))
  })

  it('drives a Spanish locale end-to-end: changeLanguage + document.documentElement.lang', async () => {
    storage.getSettings.mockResolvedValueOnce({ locale: 'es' })
    const spy = vi.spyOn(i18n, 'changeLanguage')
    render(<App />)
    await waitFor(() => expect(spy).toHaveBeenCalledWith('es'))
    await waitFor(() => expect(document.documentElement.lang).toBe('es'))
  })
})

describe('App — shell chrome', () => {
  it('renders the shared shell header and footer around the home page', async () => {
    render(<App />)
    expect(await screen.findByRole('link', { name: /the playground/i })).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })
})
