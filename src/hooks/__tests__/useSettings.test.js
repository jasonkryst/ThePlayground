import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import useSettings from '../useSettings'

const mockAdapter = vi.hoisted(() => ({
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
}))

vi.mock('../../storage/index', () => ({ default: mockAdapter }))

beforeEach(() => {
  vi.clearAllMocks()
  mockAdapter.getSettings.mockResolvedValue({
    numChoices: 2,
    feedbackMode: 'immediate',
    questionsPerSession: 10,
  })
  mockAdapter.saveSettings.mockResolvedValue(undefined)
})

describe('useSettings', () => {
  it('loads settings from adapter on mount', async () => {
    const { result } = renderHook(() => useSettings())
    await act(async () => {})
    expect(result.current.settings.numChoices).toBe(2)
    expect(result.current.settings.feedbackMode).toBe('immediate')
  })

  it('updateSetting merges new value and saves', async () => {
    const { result } = renderHook(() => useSettings())
    await act(async () => {})
    await act(async () => {
      await result.current.updateSetting('numChoices', 4)
    })
    expect(result.current.settings.numChoices).toBe(4)
    expect(mockAdapter.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ numChoices: 4 })
    )
  })

  it('resetSettings restores defaults', async () => {
    mockAdapter.getSettings.mockResolvedValue({
      numChoices: 4,
      feedbackMode: 'parent-tap',
      questionsPerSession: 20,
    })
    const { result } = renderHook(() => useSettings())
    await act(async () => {})
    await act(async () => {
      await result.current.resetSettings()
    })
    expect(result.current.settings.numChoices).toBe(2)
    expect(result.current.settings.feedbackMode).toBe('immediate')
  })
})
