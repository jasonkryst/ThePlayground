import { useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

export const SPEECH_LANG_BY_LOCALE = { en: 'en-US', es: 'es-US' }

/**
 * Speaks short text aloud via the Web Speech API (SpeechSynthesis), for games
 * whose prompt is a spoken word. Mirrors useSoundPlayer's shape: speaking a new
 * phrase cancels the previous one, and any in-flight speech is cancelled on
 * unmount. `supported` is false when the browser lacks speech synthesis (or in
 * jsdom), letting callers fall back to on-screen text.
 *
 * @returns {{ speak: (text: ?string) => void, cancel: () => void, supported: boolean }}
 *   Both functions are referentially stable and safe to call when unsupported.
 */
export default function useSpeech() {
  const { i18n } = useTranslation()
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
  const Utterance = typeof window !== 'undefined' ? window.SpeechSynthesisUtterance : undefined
  const supported = !!(synth && Utterance)

  const synthRef = useRef(synth)
  synthRef.current = synth

  const cancel = useCallback(() => {
    synthRef.current?.cancel()
  }, [])

  const speak = useCallback(text => {
    const s = synthRef.current
    if (!s || !Utterance || !text) return
    s.cancel()
    const utterance = new Utterance(text)
    utterance.lang = SPEECH_LANG_BY_LOCALE[i18n.language] ?? 'en-US'
    utterance.rate = 0.9
    s.speak(utterance)
  }, [Utterance, i18n.language])

  useEffect(() => () => cancel(), [cancel])

  return { speak, cancel, supported }
}
