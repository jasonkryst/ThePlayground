import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import useSettings from '../useSettings'
import { DEFAULT_SETTINGS } from '../../storage/index'

const mockAdapter = vi.hoisted(() => ({
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
}))

vi.mock('../../storage/index', () => ({
  default: mockAdapter,
  DEFAULT_SETTINGS: { numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 10 },
}))

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
    expect(result.current.settings.numChoices).toBe(DEFAULT_SETTINGS.numChoices)
    expect(result.current.settings.feedbackMode).toBe(DEFAULT_SETTINGS.feedbackMode)
    expect(result.current.settings.questionsPerSession).toBe(DEFAULT_SETTINGS.questionsPerSession)
  })

  it('broadcasts updateSetting changes to other mounted instances', async () => {
    const a = renderHook(() => useSettings())
    const b = renderHook(() => useSettings())
    await act(async () => {})
    await act(async () => {
      await a.result.current.updateSetting('numChoices', 4)
    })
    expect(b.result.current.settings.numChoices).toBe(4)
  })

  it('broadcasts resetSettings changes to other mounted instances', async () => {
    mockAdapter.getSettings.mockResolvedValue({
      numChoices: 4,
      feedbackMode: 'parent-tap',
      questionsPerSession: 20,
    })
    const a = renderHook(() => useSettings())
    const b = renderHook(() => useSettings())
    await act(async () => {})
    await act(async () => {
      await a.result.current.resetSettings()
    })
    expect(b.result.current.settings.numChoices).toBe(DEFAULT_SETTINGS.numChoices)
    expect(b.result.current.settings.feedbackMode).toBe(DEFAULT_SETTINGS.feedbackMode)
    expect(b.result.current.settings.questionsPerSession).toBe(DEFAULT_SETTINGS.questionsPerSession)
  })

  it('does not update or warn about an unmounted instance when another instance calls updateSetting', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const a = renderHook(() => useSettings())
    const b = renderHook(() => useSettings())
    await act(async () => {})
    b.unmount()
    await act(async () => {
      await a.result.current.updateSetting('numChoices', 4)
    })
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('updateSetting and resetSettings do not throw when there are no other subscribers', async () => {
    const { result } = renderHook(() => useSettings())
    await act(async () => {})
    await act(async () => {
      await result.current.updateSetting('numChoices', 4)
    })
    await act(async () => {
      await result.current.resetSettings()
    })
    expect(result.current.settings.numChoices).toBe(DEFAULT_SETTINGS.numChoices)
  })
})
