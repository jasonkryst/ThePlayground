import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import useGameTags from '../useGameTags'

const mockSettings = { tagOverrides: {} }
vi.mock('../useSettings', () => ({
  default: () => ({ settings: mockSettings }),
}))

const manifests = [
  { id: 'animal-sounds', name: 'Animal Sounds', tags: ['sounds', 'animals'] },
  { id: 'color-match',   name: 'Color Match',   tags: ['visual', 'colors']  },
]

beforeEach(() => {
  mockSettings.tagOverrides = {}
  vi.restoreAllMocks()
})

describe('useGameTags', () => {
  it('returns manifest tags when no overrides', () => {
    const { result } = renderHook(() => useGameTags(manifests))
    expect(result.current.tagMap.get('animal-sounds')).toEqual(['sounds', 'animals'])
    expect(result.current.tagMap.get('color-match')).toEqual(['visual', 'colors'])
  })

  it('override takes precedence over manifest tags', () => {
    mockSettings.tagOverrides = { 'animal-sounds': ['numbers'] }
    const { result } = renderHook(() => useGameTags(manifests))
    expect(result.current.tagMap.get('animal-sounds')).toEqual(['numbers'])
  })

  it('returns sorted deduplicated allTags', () => {
    const { result } = renderHook(() => useGameTags(manifests))
    expect(result.current.allTags).toEqual(['animals', 'colors', 'sounds', 'visual'])
  })

  it('allTags reflects overrides', () => {
    mockSettings.tagOverrides = { 'animal-sounds': ['numbers'] }
    const { result } = renderHook(() => useGameTags(manifests))
    expect(result.current.allTags).toContain('numbers')
    expect(result.current.allTags).not.toContain('sounds')
    expect(result.current.allTags).not.toContain('animals')
  })

  it('game with no effective tags excluded from allTags', () => {
    mockSettings.tagOverrides = { 'animal-sounds': [] }
    const { result } = renderHook(() => useGameTags(manifests))
    expect(result.current.tagMap.get('animal-sounds')).toEqual([])
    expect(result.current.allTags).not.toContain('sounds')
  })

  it('warns when a manifest has no tags', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const noTagManifests = [{ id: 'broken-game', name: 'Broken' }]
    renderHook(() => useGameTags(noTagManifests))
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('broken-game'))
  })

  it('returns empty tagMap and allTags for empty manifests', () => {
    const { result } = renderHook(() => useGameTags([]))
    expect(result.current.tagMap.size).toBe(0)
    expect(result.current.allTags).toEqual([])
  })
})
