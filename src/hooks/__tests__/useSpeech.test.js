import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import useSpeech from '../useSpeech'

let speakSpy, cancelSpy

function installSynth() {
  speakSpy = vi.fn()
  cancelSpy = vi.fn()
  window.speechSynthesis = { speak: speakSpy, cancel: cancelSpy }
  window.SpeechSynthesisUtterance = class {
    constructor(text) { this.text = text; this.lang = ''; this.rate = 1 }
  }
}

function removeSynth() {
  delete window.speechSynthesis
  delete window.SpeechSynthesisUtterance
}

afterEach(() => { removeSynth(); vi.restoreAllMocks() })

describe('useSpeech (supported)', () => {
  beforeEach(installSynth)

  it('reports supported when the API is present', () => {
    const { result } = renderHook(() => useSpeech())
    expect(result.current.supported).toBe(true)
  })

  it('speak() cancels prior speech then speaks an utterance with the text', () => {
    const { result } = renderHook(() => useSpeech())
    result.current.speak('apple')
    expect(cancelSpy).toHaveBeenCalledTimes(1)
    expect(speakSpy).toHaveBeenCalledTimes(1)
    expect(speakSpy.mock.calls[0][0].text).toBe('apple')
    expect(speakSpy.mock.calls[0][0].lang).toBe('en-US')
  })

  it('cancel() stops in-flight speech', () => {
    const { result } = renderHook(() => useSpeech())
    result.current.cancel()
    expect(cancelSpy).toHaveBeenCalled()
  })

  it('cancels speech on unmount', () => {
    const { unmount } = renderHook(() => useSpeech())
    cancelSpy.mockClear()
    unmount()
    expect(cancelSpy).toHaveBeenCalledTimes(1)
  })

  it('speak() is a no-op for empty or nullish text (no utterance)', () => {
    const { result } = renderHook(() => useSpeech())
    result.current.speak('')
    result.current.speak(null)
    expect(speakSpy).not.toHaveBeenCalled()
  })
})

describe('useSpeech (unsupported)', () => {
  beforeEach(removeSynth)

  it('reports not supported and speak/cancel are safe no-ops', () => {
    const { result } = renderHook(() => useSpeech())
    expect(result.current.supported).toBe(false)
    expect(() => { result.current.speak('apple'); result.current.cancel() }).not.toThrow()
  })
})
