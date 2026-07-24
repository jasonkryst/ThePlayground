import { act, renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import i18n, { SUPPORTED_LOCALES } from '../../i18n'
import useSpeech, { SPEECH_LANG_BY_LOCALE } from '../useSpeech'

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

  it('speak() sets an es-US lang when the active locale is es', async () => {
    // changeLanguage triggers a state update in react-i18next's internal
    // subscription on any mounted useTranslation() consumer; wrap in act()
    // so that update (both before and after mounting the hook) isn't left
    // dangling outside React's test render cycle.
    await act(async () => { await i18n.changeLanguage('es') })
    const { result } = renderHook(() => useSpeech())
    result.current.speak('manzana')
    expect(speakSpy.mock.calls[0][0].lang).toBe('es-US')
    await act(async () => { await i18n.changeLanguage('en') })
  })

  it('speak() sets a pl-PL lang when the active locale is pl', async () => {
    await act(async () => { await i18n.changeLanguage('pl') })
    const { result } = renderHook(() => useSpeech())
    result.current.speak('jabłko')
    expect(speakSpy.mock.calls[0][0].lang).toBe('pl-PL')
    await act(async () => { await i18n.changeLanguage('en') })
  })

  it('speak() falls back to en-US for an unmapped locale instead of leaving lang unset', async () => {
    await act(async () => { await i18n.changeLanguage('xx') })
    const { result } = renderHook(() => useSpeech())
    result.current.speak('hello')
    expect(speakSpy.mock.calls[0][0].lang).toBe('en-US')
    await act(async () => { await i18n.changeLanguage('en') })
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

describe('useSpeech blocked state', () => {
  beforeEach(installSynth)

  it('blocked is initially false', () => {
    const { result } = renderHook(() => useSpeech())
    expect(result.current.blocked).toBe(false)
  })

  it('blocked stays false when the utterance starts successfully', () => {
    const { result } = renderHook(() => useSpeech())
    act(() => { result.current.speak('apple') })
    act(() => { speakSpy.mock.calls[0][0].onstart() })
    expect(result.current.blocked).toBe(false)
  })

  it('blocked becomes true when the utterance errors', () => {
    const { result } = renderHook(() => useSpeech())
    act(() => { result.current.speak('apple') })
    act(() => { speakSpy.mock.calls[0][0].onerror() })
    expect(result.current.blocked).toBe(true)
  })

  it('cancel() firing the interrupted utterance\'s error does NOT set blocked (negative/race)', () => {
    const { result } = renderHook(() => useSpeech())
    act(() => { result.current.speak('apple') })
    const utterance = speakSpy.mock.calls[0][0]
    act(() => { result.current.cancel() })
    // Simulate the browser firing the cancelled utterance's error event
    // after cancel() has already nulled the ref.
    act(() => { utterance.onerror() })
    expect(result.current.blocked).toBe(false)
  })

  it('a fresh speak() clears a stale blocked=true immediately', () => {
    const { result } = renderHook(() => useSpeech())
    act(() => { result.current.speak('apple') })
    act(() => { speakSpy.mock.calls[0][0].onerror() })
    expect(result.current.blocked).toBe(true)

    act(() => { result.current.speak('banana') })
    expect(result.current.blocked).toBe(false)
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

describe('SPEECH_LANG_BY_LOCALE coverage', () => {
  it('has an entry for every locale in SUPPORTED_LOCALES', () => {
    for (const loc of SUPPORTED_LOCALES) {
      expect(SPEECH_LANG_BY_LOCALE[loc]).toBeDefined()
    }
  })
})
