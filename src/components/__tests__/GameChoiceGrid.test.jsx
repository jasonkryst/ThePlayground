import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { axe } from 'jest-axe'
import GameChoiceGrid from '../GameChoiceGrid'

const choices = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

function renderGrid(props = {}) {
  return render(
    <GameChoiceGrid
      choices={choices}
      correctId="a"
      selected={null}
      locked={false}
      disabledChoiceIds={[]}
      hintActive={false}
      onChoose={vi.fn()}
      getChoiceProps={item => ({ 'data-choice-id': item.id })}
      renderChoiceContent={item => item.id.toUpperCase()}
      {...props}
    />
  )
}

describe('GameChoiceGrid', () => {
  it('renders one button per choice', () => {
    renderGrid()
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })

  it('calls onChoose with the tapped item', async () => {
    const onChoose = vi.fn()
    renderGrid({ onChoose })
    screen.getByText('A').click()
    expect(onChoose).toHaveBeenCalledWith(choices[0])
  })

  it('applies extra props from getChoiceProps', () => {
    renderGrid()
    expect(screen.getByText('A').closest('button')).toHaveAttribute('data-choice-id', 'a')
  })

  it('marks all choices aria-disabled when locked, but keeps the native disabled state off', () => {
    renderGrid({ locked: true })
    for (const btn of screen.getAllByRole('button')) {
      expect(btn).toHaveAttribute('aria-disabled', 'true')
      expect(btn).not.toBeDisabled()
    }
  })

  it('aria-disables only the wrong-tapped choice when not locked', () => {
    renderGrid({ disabledChoiceIds: ['b'] })
    expect(screen.getByText('B').closest('button')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('A').closest('button')).toHaveAttribute('aria-disabled', 'false')
  })

  it('marks a disabled wrong choice with the disabled-wrong class, not locked', () => {
    renderGrid({ disabledChoiceIds: ['b'] })
    expect(screen.getByText('B').closest('button')).toHaveClass('game__choice--disabled-wrong')
  })

  it('keeps keyboard focus on a choice after it becomes aria-disabled (locked)', () => {
    renderGrid({ locked: true, selected: 'a' })
    const btn = screen.getByText('A').closest('button')
    btn.focus()
    expect(btn).toHaveFocus()
  })

  it('does not call onChoose when a locked choice is clicked', () => {
    const onChoose = vi.fn()
    renderGrid({ locked: true, onChoose })
    screen.getByText('A').click()
    expect(onChoose).not.toHaveBeenCalled()
  })

  it('does not call onChoose when an already-tried wrong choice is clicked', () => {
    const onChoose = vi.fn()
    renderGrid({ disabledChoiceIds: ['b'], onChoose })
    screen.getByText('B').click()
    expect(onChoose).not.toHaveBeenCalled()
  })

  it('shows correct/wrong classes only once locked', () => {
    renderGrid({ locked: true, selected: 'b', disabledChoiceIds: ['b'] })
    expect(screen.getByText('A').closest('button')).toHaveClass('highlight-correct')
    expect(screen.getByText('B').closest('button')).toHaveClass('wrong')
  })

  it('shows highlight-correct when hintActive is true even if not locked', () => {
    renderGrid({ hintActive: true })
    expect(screen.getByText('A').closest('button')).toHaveClass('highlight-correct')
  })

  it('does not show highlight-correct when neither locked nor hintActive', () => {
    renderGrid()
    expect(screen.getByText('A').closest('button')).not.toHaveClass('highlight-correct')
  })

  it('sets --hint-strength on the hinted correct choice to match the hintStrength prop', () => {
    renderGrid({ hintActive: true, hintStrength: 0.5 })
    expect(screen.getByText('A').closest('button').style.getPropertyValue('--hint-strength')).toBe('0.5')
  })

  it('does not set an inline --hint-strength on the locked answer reveal', () => {
    renderGrid({ locked: true, selected: 'b', disabledChoiceIds: ['b'] })
    const correctBtn = screen.getByText('A').closest('button')
    expect(correctBtn).toHaveClass('highlight-correct')
    expect(correctBtn.style.getPropertyValue('--hint-strength')).toBe('')
  })

  it('merges --hint-strength into an existing inline style from getChoiceProps', () => {
    renderGrid({
      hintActive: true,
      hintStrength: 0.5,
      getChoiceProps: item => ({ style: { background: 'hotpink' }, 'data-choice-id': item.id }),
    })
    const correctBtn = screen.getByText('A').closest('button')
    expect(correctBtn.style.background).toBe('hotpink')
    expect(correctBtn.style.getPropertyValue('--hint-strength')).toBe('0.5')
  })

  it('has no accessibility violations', async () => {
    const { container } = renderGrid()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('shows a check glyph on the selected correct choice once locked', () => {
    renderGrid({ locked: true, selected: 'a' })
    const glyph = screen.getByText('A').closest('button').querySelector('.game__choice-glyph')
    expect(glyph).toHaveTextContent('✓')
    expect(glyph).toHaveAttribute('aria-hidden', 'true')
  })

  it('shows a cross glyph on the selected wrong choice once locked', () => {
    renderGrid({ locked: true, selected: 'b', disabledChoiceIds: ['b'] })
    const glyph = screen.getByText('B').closest('button').querySelector('.game__choice-glyph')
    expect(glyph).toHaveTextContent('✗')
  })

  it('shows a check glyph on the revealed correct choice when locked on a wrong pick', () => {
    renderGrid({ locked: true, selected: 'b', disabledChoiceIds: ['b'] })
    const btn = screen.getByText('A').closest('button')
    expect(btn).toHaveClass('highlight-correct')
    expect(btn.querySelector('.game__choice-glyph')).toHaveTextContent('✓')
  })

  it('shows no glyph on any choice before locking', () => {
    renderGrid()
    for (const btn of screen.getAllByRole('button')) {
      expect(btn.querySelector('.game__choice-glyph')).toBeNull()
    }
  })

  it('shows no glyph on the hint-only highlight-correct choice (not locked)', () => {
    renderGrid({ hintActive: true })
    const btn = screen.getByText('A').closest('button')
    expect(btn).toHaveClass('highlight-correct')
    expect(btn.querySelector('.game__choice-glyph')).toBeNull()
  })

  it('shows no glyph on a disabled-wrong choice before lock', () => {
    renderGrid({ disabledChoiceIds: ['b'] })
    expect(screen.getByText('B').closest('button').querySelector('.game__choice-glyph')).toBeNull()
  })
})
