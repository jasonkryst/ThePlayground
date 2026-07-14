import { useCallback, useEffect } from 'react'

/**
 * Shared question-announcement lifecycle for quiz games whose prompt is played
 * aloud (Animal Sounds' sound clip, Fruit & Veggie ID's spoken name). It
 * auto-announces the active question, stops audio when leaving a question / on
 * the results screen / on the intro, and returns a stable replay callback for a
 * manual "play again" button. `announce`/`stop` are supplied by the game so the
 * engine stays audio-source-agnostic.
 *
 * @param {object}   p
 * @param {number}   p.index          session.index — drives re-announce per question
 * @param {?object}  p.current        session.current — the active question, or null
 * @param {boolean}  p.showIntro      session.showIntro
 * @param {boolean}  p.introResolved  session.introResolved
 * @param {boolean}  p.done           session.done
 * @param {(current: object) => void} p.announce  plays the prompt for `current`
 * @param {() => void} p.stop         stops any in-flight prompt audio
 * @returns {() => void} replay — re-announces the current question
 */
export default function useQuestionAudio({ index, current, showIntro, introResolved, done, announce, stop }) {
  const replay = useCallback(() => {
    if (!current) return
    announce(current)
  }, [current, announce])

  // Stop any in-flight audio when moving away from this question.
  useEffect(() => {
    if (!current) return
    return () => { stop() }
  }, [current, stop])

  // Auto-announce the active question — but never during loading or the intro.
  useEffect(() => {
    if (!current || showIntro || !introResolved) return
    replay()
  }, [index, replay, current, showIntro, introResolved])

  // Stop when the session ends or returns to the intro screen.
  useEffect(() => {
    if (done || showIntro) stop()
  }, [done, showIntro, stop])

  return replay
}
