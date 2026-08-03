import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import AppShell from '../AppShell'
import { useShellGameStatus } from '../ShellContext'
import i18n from '../../i18n'
import storage from '../../storage/index'

vi.mock('../../storage/index', () => ({
  default: {
    getSettings: vi.fn().mockResolvedValue({ theme: 'system' }),
    saveSettings: vi.fn().mockResolvedValue(undefined),
  },
  DEFAULT_SETTINGS: { theme: 'system' },
}))

const manifests = [
  { id: 'color-match', nameKey: 'colorMatch.manifestName', icon: '🎨', color: '#CE93D8', version: '1.6.0' },
]

function FakeGame({ streak = 0, sessionActive = false }) {
  useShellGameStatus({ streak, sessionActive })
  return <div>FakeGameBody</div>
}

// AppShell now mounts useSettings() (for the theme toggle), which fires an
// async adapter.getSettings().then(...) on mount. Awaiting an empty act()
// callback right after render flushes that already-in-flight microtask
// before returning control to the test, so the resulting state update is
// captured inside act()'s boundary instead of warning after the fact.
async function renderShell(initialPath, gameElement = <FakeGame />) {
  const utils = render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<AppShell manifests={manifests} />}>
          <Route path="/" element={<div>HomeBody</div>} />
          <Route path="/admin" element={<div>AdminBody</div>} />
          <Route path="/parent" element={<div>ParentBody</div>} />
          <Route path="/my-progress" element={<div>ProgressBody</div>} />
          <Route path="/game/:gameId" element={gameElement} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
  await act(async () => {})
  return utils
}

describe('AppShell — home route', () => {
  it('renders brand link, all three nav links, and the footer', async () => {
    await renderShell('/')
    expect(screen.getByRole('link', { name: /the playground/i })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: /progress dashboard/i })).toHaveAttribute('href', '/parent')
    expect(screen.getByRole('link', { name: /my progress/i })).toHaveAttribute('href', '/my-progress')
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('href', '/admin')
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    expect(screen.getByText('HomeBody')).toBeInTheDocument()
  })

  it('renders no back link and no shell page title on home', async () => {
    await renderShell('/')
    expect(screen.queryByRole('link', { name: /back to home/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = await renderShell('/')
    expect(await axe(container)).toHaveNoViolations()
  })

  it('publishes the header height as a CSS custom property (issue #83)', async () => {
    await renderShell('/')
    const header = document.querySelector('.shell__header')
    expect(header).toBeTruthy()
    const published = document.documentElement.style.getPropertyValue('--shell-header-height')
    expect(published).toMatch(/^[0-9.]+px$/)
  })
})

describe('AppShell — subpages', () => {
  it('renders back link, focused page title, and marks the current nav link', async () => {
    await renderShell('/admin')
    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/')
    const title = screen.getByRole('heading', { level: 1, name: /settings/i })
    expect(title).toHaveFocus()
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /progress dashboard/i })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })

  it('shows and focuses the right title for parent', async () => {
    await renderShell('/parent')
    expect(screen.getByRole('heading', { level: 1, name: /progress dashboard/i })).toHaveFocus()
  })

  it('shows and focuses the right title for my-progress', async () => {
    await renderShell('/my-progress')
    expect(screen.getByRole('heading', { level: 1, name: /my progress/i })).toHaveFocus()
  })
})

describe('AppShell — game route', () => {
  it('shows the game name as h1, a home button, no nav links, and the footer with the game version', async () => {
    await renderShell('/game/color-match')
    expect(screen.getByRole('heading', { level: 1, name: /color match/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /go to home/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /progress dashboard/i })).not.toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    expect(screen.getByText('Color Match v1.6.0')).toBeInTheDocument()
  })

  it('renders the streak badge while a session is active', async () => {
    await renderShell('/game/color-match', <FakeGame streak={4} sessionActive={true} />)
    expect(screen.getByText('🔥 4 in a row!')).toBeInTheDocument()
  })

  it('survives an unknown game id (no title, working home button, no game version in the footer)', async () => {
    await renderShell('/game/nope', <div>NotFoundBody</div>)
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    expect(screen.queryByText(/v1\.6\.0/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /go to home/i }))
    expect(screen.getByText('HomeBody')).toBeInTheDocument()
  })
})

describe('AppShell — footer', () => {
  it('shows the copyright line and engine version on every route', async () => {
    await renderShell('/')
    expect(screen.getByText(new RegExp(`© ${new Date().getFullYear()} The Playground`))).toBeInTheDocument()
  })

  it('does not show a game version on non-game routes', async () => {
    await renderShell('/admin')
    expect(screen.queryByText(/v1\.6\.0/)).not.toBeInTheDocument()
  })
})

describe('AppShell — exit guard', () => {
  it('navigates home immediately when no session is active', async () => {
    await renderShell('/game/color-match', <FakeGame sessionActive={false} />)
    await userEvent.click(screen.getByRole('button', { name: /go to home/i }))
    expect(screen.getByText('HomeBody')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the confirm dialog instead of navigating while a session is active', async () => {
    await renderShell('/game/color-match', <FakeGame sessionActive={true} />)
    await userEvent.click(screen.getByRole('button', { name: /go to home/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('FakeGameBody')).toBeInTheDocument()
  })

  it('keep-playing closes the dialog and returns focus to the home button', async () => {
    await renderShell('/game/color-match', <FakeGame sessionActive={true} />)
    const homeBtn = screen.getByRole('button', { name: /go to home/i })
    await userEvent.click(homeBtn)
    await userEvent.click(screen.getByRole('button', { name: /keep playing/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('FakeGameBody')).toBeInTheDocument()
    expect(homeBtn).toHaveFocus()
  })

  it('leave-game navigates home', async () => {
    await renderShell('/game/color-match', <FakeGame sessionActive={true} />)
    await userEvent.click(screen.getByRole('button', { name: /go to home/i }))
    await userEvent.click(screen.getByRole('button', { name: /leave game/i }))
    expect(screen.getByText('HomeBody')).toBeInTheDocument()
  })

  it('guards the brand link too while a session is active', async () => {
    await renderShell('/game/color-match', <FakeGame sessionActive={true} />)
    await userEvent.click(screen.getByRole('link', { name: /the playground/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('FakeGameBody')).toBeInTheDocument()
  })

  it('does not guard the brand link on non-game pages', async () => {
    await renderShell('/admin')
    await userEvent.click(screen.getByRole('link', { name: /the playground/i }))
    expect(screen.getByText('HomeBody')).toBeInTheDocument()
  })
})

describe('AppShell — back-button guard (popstate)', () => {
  it('opens the confirm dialog on a back-navigation popstate while a session is active', async () => {
    await renderShell('/game/color-match', <FakeGame sessionActive={true} />)
    fireEvent(window, new PopStateEvent('popstate'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('FakeGameBody')).toBeInTheDocument()
  })

  it('does not open the dialog on popstate when no session is active', async () => {
    await renderShell('/game/color-match', <FakeGame sessionActive={false} />)
    fireEvent(window, new PopStateEvent('popstate'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('AppShell — background inertness while the exit dialog is open', () => {
  it('makes the shell body inert and aria-hidden while open, and clears both on resume', async () => {
    const { container } = await renderShell('/game/color-match', <FakeGame sessionActive={true} />)
    const body = container.querySelector('.shell__body')
    expect(body).not.toHaveAttribute('inert')
    expect(body).not.toHaveAttribute('aria-hidden')

    await userEvent.click(screen.getByRole('button', { name: /go to home/i }))
    expect(body).toHaveAttribute('inert')
    expect(body).toHaveAttribute('aria-hidden', 'true')

    await userEvent.click(screen.getByRole('button', { name: /keep playing/i }))
    expect(body).not.toHaveAttribute('inert')
    expect(body).not.toHaveAttribute('aria-hidden')
  })
})

describe('AppShell — Spanish locale', () => {
  beforeEach(async () => { await act(async () => { await i18n.changeLanguage('es') }) })
  afterEach(async () => { await act(async () => { await i18n.changeLanguage('en') }) })

  it('renders the translated Spanish game name as the in-game h1 title and footer version line', async () => {
    await renderShell('/game/color-match')
    expect(screen.getByRole('heading', { level: 1, name: /combinar colores/i })).toBeInTheDocument()
    expect(screen.getByText('Combinar Colores v1.6.0')).toBeInTheDocument()
  })
})

describe('AppShell — Polish locale', () => {
  beforeEach(async () => { await act(async () => { await i18n.changeLanguage('pl') }) })
  afterEach(async () => { await act(async () => { await i18n.changeLanguage('en') }) })

  it('renders the translated Polish game name as the in-game h1 title and footer version line', async () => {
    await renderShell('/game/color-match')
    expect(screen.getByRole('heading', { level: 1, name: /dopasuj kolory/i })).toBeInTheDocument()
    expect(screen.getByText('Dopasuj Kolory v1.6.0')).toBeInTheDocument()
  })
})

describe('AppShell — theme toggle', () => {
  beforeEach(() => {
    storage.getSettings.mockResolvedValue({ theme: 'system' })
  })

  it('renders a theme toggle button reachable on every route', async () => {
    await renderShell('/')
    expect(await screen.findByRole('button', { name: /theme/i })).toBeInTheDocument()
  })

  it('cycles system -> light -> dark -> high-contrast -> system on successive clicks', async () => {
    await renderShell('/')
    const button = await screen.findByRole('button', { name: /theme/i })

    fireEvent.click(button)
    await waitFor(() => expect(storage.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'light' })))

    fireEvent.click(button)
    await waitFor(() => expect(storage.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'dark' })))

    fireEvent.click(button)
    await waitFor(() => expect(storage.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'high-contrast' })))

    fireEvent.click(button)
    await waitFor(() => expect(storage.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'system' })))
  })

  it('does not throw or run off the end when cycling from high-contrast', async () => {
    storage.getSettings.mockResolvedValue({ theme: 'high-contrast' })
    await renderShell('/')
    const button = await screen.findByRole('button', { name: /theme/i })
    expect(() => fireEvent.click(button)).not.toThrow()
    await waitFor(() => expect(storage.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'system' })))
  })

  // Regression coverage for issue #152: the toggle rendered the right glyph
  // for every theme, but the high-contrast glyph (a plain-text symbol, not a
  // color emoji like the other three) was invisible against the
  // high-contrast header because .shell__theme-toggle never set `color` --
  // jsdom doesn't apply real CSS, so that part is covered separately in
  // e2e/themes.spec.js. This suite only guards the glyph-per-theme logic.
  it.each([
    ['system', '🌓'],
    ['light', '☀️'],
    ['dark', '🌙'],
    ['high-contrast', '◐'],
  ])('renders the %s theme icon glyph', async (theme, glyph) => {
    storage.getSettings.mockResolvedValue({ theme })
    await renderShell('/')
    const button = await screen.findByRole('button', { name: /theme/i })
    expect(button).toHaveTextContent(glyph)
  })

  it('falls back to the system icon glyph for an unrecognized persisted theme value', async () => {
    storage.getSettings.mockResolvedValue({ theme: 'not-a-real-theme' })
    await renderShell('/')
    const button = await screen.findByRole('button', { name: /theme/i })
    expect(button).toHaveTextContent('🌓')
  })
})
