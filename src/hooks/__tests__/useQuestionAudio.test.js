import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import useQuestionAudio from '../useQuestionAudio'

const q1 = { correct: { id: 'a' } }
const q2 = { correct: { id: 'b' } }

let announce, stop
beforeEach(() => { announce = vi.fn(); stop = vi.fn() })

const base = {
  index: 0, current: q1, showIntro: false, introResolved: true, done: false, resumeAvailable: false,
}

describe('useQuestionAudio', () => {
  it('announces the active question once on mount', () => {
    renderHook(() => useQuestionAudio({ ...base, announce, stop }))
    expect(announce).toHaveBeenCalledTimes(1)
    expect(announce).toHaveBeenCalledWith(q1)
  })

  it('re-announces via the returned replay callback', () => {
    const { result } = renderHook(() => useQuestionAudio({ ...base, announce, stop }))
    announce.mockClear()
    result.current()
    expect(announce).toHaveBeenCalledWith(q1)
  })

  it('re-announces when the question index changes', () => {
    const { rerender } = renderHook(
      props => useQuestionAudio({ ...props, announce, stop }),
      { initialProps: base }
    )
    announce.mockClear()
    rerender({ ...base, index: 1, current: q2 })
    expect(announce).toHaveBeenCalledWith(q2)
  })

  it('stops audio when leaving a question (current changes)', () => {
    const { rerender } = renderHook(
      props => useQuestionAudio({ ...props, announce, stop }),
      { initialProps: base }
    )
    rerender({ ...base, index: 1, current: q2 })
    expect(stop).toHaveBeenCalled()
  })

  it('stops audio when the session is done', () => {
    const { rerender } = renderHook(
      props => useQuestionAudio({ ...props, announce, stop }),
      { initialProps: base }
    )
    stop.mockClear()
    rerender({ ...base, done: true })
    expect(stop).toHaveBeenCalled()
  })

  // Negative: leak guards
  it('does NOT announce while the intro is showing', () => {
    renderHook(() => useQuestionAudio({ ...base, showIntro: true, announce, stop }))
    expect(announce).not.toHaveBeenCalled()
  })

  it('does NOT announce until the intro decision has resolved', () => {
    renderHook(() => useQuestionAudio({ ...base, introResolved: false, announce, stop }))
    expect(announce).not.toHaveBeenCalled()
  })

  it('does NOT announce when there is no current question', () => {
    renderHook(() => useQuestionAudio({ ...base, current: null, announce, stop }))
    expect(announce).not.toHaveBeenCalled()
  })

  // Regression test for issue #153: useGameSession's resume-check effect
  // populates `current`/`index` from the saved snapshot and forces
  // showIntro closed for the entire awaiting-resume-choice window, before
  // the player has chosen Resume or Start Fresh on the ResumePrompt screen
  // (QuizGameShell renders only that prompt while resumeAvailable is true).
  // Without a resumeAvailable guard here, this effect's other conditions
  // (`current` truthy, `showIntro` false, `introResolved` true) are already
  // satisfied at that point, so the question's audio/speech would fire
  // before the prompt is ever answered.
  it('does NOT announce while a resume decision is pending (resumeAvailable)', () => {
    renderHook(() => useQuestionAudio({ ...base, resumeAvailable: true, announce, stop }))
    expect(announce).not.toHaveBeenCalled()
  })

  it('announces once acceptResume flips resumeAvailable back to false', () => {
    const { rerender } = renderHook(
      props => useQuestionAudio({ ...props, announce, stop }),
      { initialProps: { ...base, resumeAvailable: true } }
    )
    expect(announce).not.toHaveBeenCalled()
    rerender({ ...base, resumeAvailable: false })
    expect(announce).toHaveBeenCalledWith(q1)
  })
})
