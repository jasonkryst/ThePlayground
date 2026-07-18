// Shared contract suite for any storage adapter implementing the ten-method
// interface documented in src/storage/adapter.js. Call this from a thin
// per-adapter test file: runAdapterContractTests(() => myAdapter, { label: 'myAdapter' }).
// It only asserts the parts of the interface every adapter must uphold —
// adapter-specific behavior (corrupt-JSON recovery, migrations, quota
// handling) belongs in that adapter's own test file, not here.
import { describe, it, expect, beforeEach } from 'vitest'
import { DEFAULT_SETTINGS } from '../adapter'

export function runAdapterContractTests(adapterFactory, { label }) {
  describe(`storage adapter contract — ${label}`, () => {
    let adapter

    beforeEach(() => {
      adapter = adapterFactory()
    })

    describe('getScores / addScore', () => {
      it('returns an empty array before any score is added', async () => {
        expect(await adapter.getScores()).toEqual([])
      })

      it('round-trips an added score unmodified', async () => {
        const score = { gameId: 'animal-sounds', score: 4, total: 5, date: '2026-07-18', timestamp: 1000 }
        await adapter.addScore(score)
        expect(await adapter.getScores()).toEqual([score])
      })

      it('appends rather than replacing on a second addScore', async () => {
        const first = { gameId: 'animal-sounds', score: 4, total: 5, date: '2026-07-18', timestamp: 1000 }
        const second = { gameId: 'color-match', score: 3, total: 5, date: '2026-07-18', timestamp: 2000 }
        await adapter.addScore(first)
        await adapter.addScore(second)
        expect(await adapter.getScores()).toEqual([first, second])
      })

      it('preserves documented optional fields (peakStreak, timings) without stripping them', async () => {
        const score = {
          gameId: 'animal-sounds', score: 5, total: 5, date: '2026-07-18', timestamp: 1000,
          peakStreak: 5, timings: [{ questionIndex: 0, itemId: 'a', correct: true, durationMs: 800, attemptNumber: 1 }],
        }
        await adapter.addScore(score)
        expect(await adapter.getScores()).toEqual([score])
      })
    })

    describe('getSettings / saveSettings', () => {
      it('returns exactly DEFAULT_SETTINGS before any settings are saved', async () => {
        expect(await adapter.getSettings()).toEqual(DEFAULT_SETTINGS)
      })

      it('merges a saved partial settings object over the defaults on read-back', async () => {
        await adapter.saveSettings({ childName: 'Riley', numChoices: 3 })
        const settings = await adapter.getSettings()
        expect(settings.childName).toBe('Riley')
        expect(settings.numChoices).toBe(3)
        expect(settings.feedbackMode).toBe(DEFAULT_SETTINGS.feedbackMode)
      })
    })

    describe('getBestStreaks / saveBestStreaks', () => {
      it('returns an empty object before any streaks are saved', async () => {
        expect(await adapter.getBestStreaks()).toEqual({})
      })

      it('round-trips a streaks map', async () => {
        await adapter.saveBestStreaks({ 'animal-sounds': 7 })
        expect(await adapter.getBestStreaks()).toEqual({ 'animal-sounds': 7 })
      })

      it('does not leak into unrelated storage (scores stay empty after saving streaks)', async () => {
        await adapter.saveBestStreaks({ 'animal-sounds': 7 })
        expect(await adapter.getScores()).toEqual([])
      })
    })

    describe('getPersonalBests / savePersonalBests', () => {
      it('returns an empty object before any bests are saved', async () => {
        expect(await adapter.getPersonalBests()).toEqual({})
      })

      it('round-trips a per-game bests map', async () => {
        const bests = { 'animal-sounds': { accuracy: { ratio: 0.9, score: 9, total: 10, timestamp: 1 } } }
        await adapter.savePersonalBests(bests)
        expect(await adapter.getPersonalBests()).toEqual(bests)
      })

      it('keeps different games isolated from each other', async () => {
        await adapter.savePersonalBests({ 'animal-sounds': { accuracy: { ratio: 0.9, score: 9, total: 10, timestamp: 1 } } })
        const bests = await adapter.getPersonalBests()
        expect(bests['color-match']).toBeUndefined()
      })
    })

    describe('getBadgeData / saveBadgeData', () => {
      it('returns the full default shape (awards, lifetimeQuestions, lifetimeCounters) before any badges are saved', async () => {
        expect(await adapter.getBadgeData()).toEqual({ awards: {}, lifetimeQuestions: {}, lifetimeCounters: {} })
      })

      it('round-trips all three top-level keys', async () => {
        const data = {
          awards: { 'animal-sounds': { hotStreak: 1 } },
          lifetimeQuestions: { 'animal-sounds': 30 },
          lifetimeCounters: { 'memory-match': { pairsMatched: 8 } },
        }
        await adapter.saveBadgeData(data)
        expect(await adapter.getBadgeData()).toEqual(data)
      })
    })
  })
}
