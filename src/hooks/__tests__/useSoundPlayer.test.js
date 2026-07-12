import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import useSoundPlayer from '../useSoundPlayer'

// Instance-tracking Audio mock: each `new Audio(url)` records its instance so
// tests can assert which clip played, paused, or was reset — a prototype-level
// mock can't distinguish the first clip from the second.
let audioInstances = []
let playImpl = () => Promise.resolve()

function MockAudio(src) {
  this.src = src
  this.currentTime = 0
  this.play = vi.fn(() => playImpl())
  this.pause = vi.fn()
  audioInstances.push(this)
}
window.Audio = MockAudio

beforeEach(() => {
  audioInstances = []
  playImpl = () => Promise.resolve()
})

describe('useSoundPlayer', () => {
  it('play(url) creates an Audio for the url and plays it', () => {
    const { result } = renderHook(() => useSoundPlayer())
    act(() => result.current.play('blob:clip-1'))
    expect(audioInstances).toHaveLength(1)
    expect(audioInstances[0].src).toBe('blob:clip-1')
    expect(audioInstances[0].play).toHaveBeenCalledTimes(1)
  })

  it('play() stops the previous clip before starting the next', () => {
    const { result } = renderHook(() => useSoundPlayer())
    act(() => result.current.play('blob:clip-1'))
    audioInstances[0].currentTime = 5 // pretend the clip is mid-playback
    act(() => result.current.play('blob:clip-2'))
    expect(audioInstances[0].pause).toHaveBeenCalledTimes(1)
    expect(audioInstances[0].currentTime).toBe(0)
    expect(audioInstances[1].play).toHaveBeenCalledTimes(1)
  })

  it('stop() pauses and resets the current clip', () => {
    const { result } = renderHook(() => useSoundPlayer())
    act(() => result.current.play('blob:clip-1'))
    audioInstances[0].currentTime = 5
    act(() => result.current.stop())
    expect(audioInstances[0].pause).toHaveBeenCalledTimes(1)
    expect(audioInstances[0].currentTime).toBe(0)
  })

  it('unmounting stops an in-flight clip', () => {
    const { result, unmount } = renderHook(() => useSoundPlayer())
    act(() => result.current.play('blob:clip-1'))
    unmount()
    expect(audioInstances[0].pause).toHaveBeenCalledTimes(1)
  })

  it('play() with a falsy url is a no-op and does not interrupt the current clip', () => {
    const { result } = renderHook(() => useSoundPlayer())
    act(() => result.current.play('blob:clip-1'))
    act(() => result.current.play(null))
    act(() => result.current.play(undefined))
    expect(audioInstances).toHaveLength(1)
    expect(audioInstances[0].pause).not.toHaveBeenCalled()
  })

  it('stop() with nothing playing does not throw', () => {
    const { result } = renderHook(() => useSoundPlayer())
    expect(() => act(() => result.current.stop())).not.toThrow()
  })

  it('stop() after a previous stop() does not pause the same clip twice', () => {
    const { result } = renderHook(() => useSoundPlayer())
    act(() => result.current.play('blob:clip-1'))
    act(() => result.current.stop())
    act(() => result.current.stop())
    expect(audioInstances[0].pause).toHaveBeenCalledTimes(1)
  })

  it('swallows audio.play() rejections (autoplay policy, missing file)', async () => {
    playImpl = () => Promise.reject(new Error('NotAllowedError'))
    const { result } = renderHook(() => useSoundPlayer())
    expect(() => act(() => result.current.play('blob:clip-1'))).not.toThrow()
    // Flush the microtask queue; an unhandled rejection would fail the run.
    await act(async () => {})
  })
})
