import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import TagFilterBar from '../TagFilterBar'

const mockOverflow = { visibleCount: Infinity, rowHeight: null }
vi.mock('../../hooks/useTagRowOverflow', () => ({
  default: () => mockOverflow,
}))

const tagLabel = tag => tag.charAt(0).toUpperCase() + tag.slice(1)

beforeEach(() => {
  mockOverflow.visibleCount = Infinity
  mockOverflow.rowHeight = null
})

describe('TagFilterBar', () => {
  it('renders nothing when tags is empty', () => {
    const { container } = render(
      <TagFilterBar tags={[]} selectedTags={new Set()} onToggleTag={() => {}} tagLabel={tagLabel} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a toggle button per tag with aria-pressed reflecting selection', () => {
    render(
      <TagFilterBar
        tags={['sounds', 'visual']}
        selectedTags={new Set(['sounds'])}
        onToggleTag={() => {}}
        tagLabel={tagLabel}
      />
    )
    expect(screen.getByRole('button', { name: 'Sounds' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Visual' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onToggleTag with the clicked tag', async () => {
    const user = userEvent.setup()
    const onToggleTag = vi.fn()
    render(
      <TagFilterBar tags={['sounds']} selectedTags={new Set()} onToggleTag={onToggleTag} tagLabel={tagLabel} />
    )
    await user.click(screen.getByRole('button', { name: 'Sounds' }))
    expect(onToggleTag).toHaveBeenCalledWith('sounds')
  })

  it('sorts selected tags to the front of the list', () => {
    render(
      <TagFilterBar
        tags={['animals', 'sounds', 'visual']}
        selectedTags={new Set(['visual'])}
        onToggleTag={() => {}}
        tagLabel={tagLabel}
      />
    )
    const buttons = screen.getAllByRole('button')
    expect(buttons.map(b => b.textContent)).toEqual(['Visual', 'Animals', 'Sounds'])
  })

  it('shows a "+N more" toggle when the row reports hidden tags', () => {
    mockOverflow.visibleCount = 2
    mockOverflow.rowHeight = 44
    render(
      <TagFilterBar
        tags={['animals', 'sounds', 'visual']}
        selectedTags={new Set()}
        onToggleTag={() => {}}
        tagLabel={tagLabel}
      />
    )
    expect(screen.getByRole('button', { name: '+1 more' })).toBeInTheDocument()
  })

  it('expands to show all tags and switches to "Show less" when the toggle is clicked', async () => {
    mockOverflow.visibleCount = 2
    mockOverflow.rowHeight = 44
    const user = userEvent.setup()
    render(
      <TagFilterBar
        tags={['animals', 'sounds', 'visual']}
        selectedTags={new Set()}
        onToggleTag={() => {}}
        tagLabel={tagLabel}
      />
    )
    await user.click(screen.getByRole('button', { name: '+1 more' }))
    expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument()
  })

  it('negative: does not render a more/less toggle when nothing is hidden', () => {
    mockOverflow.visibleCount = 3
    mockOverflow.rowHeight = 44
    render(
      <TagFilterBar
        tags={['animals', 'sounds', 'visual']}
        selectedTags={new Set()}
        onToggleTag={() => {}}
        tagLabel={tagLabel}
      />
    )
    expect(screen.queryByText(/more/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/show less/i)).not.toBeInTheDocument()
  })

  it('groups the pills under a labeled role="group", not role="tablist"', () => {
    render(
      <TagFilterBar tags={['sounds']} selectedTags={new Set()} onToggleTag={() => {}} tagLabel={tagLabel} />
    )
    expect(screen.getByRole('group', { name: 'Filter games by category' })).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })
})
