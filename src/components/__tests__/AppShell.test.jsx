import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import AppShell from '../AppShell'
import { useShellGameStatus } from '../ShellContext'

const manifests = [
  { id: 'color-match', name: 'Color Match', description: 'Colors!', icon: '🎨', color: '#CE93D8' },
]

function FakeGame({ streak = 0, sessionActive = false }) {
  useShellGameStatus({ streak, sessionActive })
  return <div>FakeGameBody</div>
}

function renderShell(initialPath, gameElement = <FakeGame />) {
  return render(
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
}

describe('AppShell — home route', () => {
  it('renders brand link, all three nav links, and the footer', () => {
    renderShell('/')
    expect(screen.getByRole('link', { name: /the playground/i })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: /progress dashboard/i })).toHaveAttribute('href', '/parent')
    expect(screen.getByRole('link', { name: /my progress/i })).toHaveAttribute('href', '/my-progress')
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('href', '/admin')
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    expect(screen.getByText('HomeBody')).toBeInTheDocument()
  })

  it('renders no back link and no shell page title on home', () => {
    renderShell('/')
    expect(screen.queryByRole('link', { name: /back to home/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderShell('/')
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('AppShell — subpages', () => {
  it('renders back link, focused page title, and marks the current nav link', () => {
    renderShell('/admin')
    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/')
    const title = screen.getByRole('heading', { level: 1, name: /settings/i })
    expect(title).toHaveFocus()
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /progress dashboard/i })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })

  it('shows the right titles for parent and my-progress', () => {
    renderShell('/parent')
    expect(screen.getByRole('heading', { level: 1, name: /progress dashboard/i })).toBeInTheDocument()
  })
})

describe('AppShell — game route', () => {
  it('shows the game name as h1, a home button, no nav links, no footer', () => {
    renderShell('/game/color-match')
    expect(screen.getByRole('heading', { level: 1, name: /color match/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /go to home/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /progress dashboard/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
  })

  it('renders the streak badge while a session is active', () => {
    renderShell('/game/color-match', <FakeGame streak={4} sessionActive={true} />)
    expect(screen.getByText('🔥 4 in a row!')).toBeInTheDocument()
  })

  it('survives an unknown game id (no title, working home button)', async () => {
    renderShell('/game/nope', <div>NotFoundBody</div>)
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /go to home/i }))
    expect(screen.getByText('HomeBody')).toBeInTheDocument()
  })
})

describe('AppShell — exit guard', () => {
  it('navigates home immediately when no session is active', async () => {
    renderShell('/game/color-match', <FakeGame sessionActive={false} />)
    await userEvent.click(screen.getByRole('button', { name: /go to home/i }))
    expect(screen.getByText('HomeBody')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the confirm dialog instead of navigating while a session is active', async () => {
    renderShell('/game/color-match', <FakeGame sessionActive={true} />)
    await userEvent.click(screen.getByRole('button', { name: /go to home/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('FakeGameBody')).toBeInTheDocument()
  })

  it('keep-playing closes the dialog and returns focus to the home button', async () => {
    renderShell('/game/color-match', <FakeGame sessionActive={true} />)
    const homeBtn = screen.getByRole('button', { name: /go to home/i })
    await userEvent.click(homeBtn)
    await userEvent.click(screen.getByRole('button', { name: /keep playing/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('FakeGameBody')).toBeInTheDocument()
    expect(homeBtn).toHaveFocus()
  })

  it('leave-game navigates home', async () => {
    renderShell('/game/color-match', <FakeGame sessionActive={true} />)
    await userEvent.click(screen.getByRole('button', { name: /go to home/i }))
    await userEvent.click(screen.getByRole('button', { name: /leave game/i }))
    expect(screen.getByText('HomeBody')).toBeInTheDocument()
  })

  it('guards the brand link too while a session is active', async () => {
    renderShell('/game/color-match', <FakeGame sessionActive={true} />)
    await userEvent.click(screen.getByRole('link', { name: /the playground/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('FakeGameBody')).toBeInTheDocument()
  })

  it('does not guard the brand link on non-game pages', async () => {
    renderShell('/admin')
    await userEvent.click(screen.getByRole('link', { name: /the playground/i }))
    expect(screen.getByText('HomeBody')).toBeInTheDocument()
  })
})
