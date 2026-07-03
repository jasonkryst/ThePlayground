# Time Limit, Personal Best, and Milestone Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement three engine features from `docs/superpowers/specs/2026-07-03-personal-best-badges-timelimit-design.md` — a configurable "answer within N seconds" countdown mode, per-session personal-best banners (accuracy + speed), and repeatable milestone badges — wired into both existing games (`AnimalSoundsGame`, `ColorMatchGame`).

**Architecture:** Two new pure functions (`evaluatePersonalBest`, `computeBadgeAwards`) under `src/utils/` do all the record/award decision logic with zero React/storage dependency. Two new hooks (`usePersonalBest`, `useBadges`) wrap those pure functions with the existing adapter-based storage pattern (mirroring `useBestStreak`). `useGameSession` derives timer behavior from settings and calls both new hooks from `finishGame()`. `GameResults` and a new `BadgeGallery` component render the results.

**Tech Stack:** React 18, Vitest + React Testing Library + jest-axe, Playwright (E2E + visual regression), react-i18next, localStorage-backed storage adapter.

## Global Constraints

- Tests covering timed feedback (delays, auto-advance) use `vi.useFakeTimers()` with `fireEvent`, never `userEvent`.
- Hook tests mock `src/storage/index.js` via `vi.mock()` + `vi.hoisted()`.
- Any test touching `useGameSession` or a game component mocks `src/lib/confetti.js`.
- Every component test file asserts `expect(await axe(container)).toHaveNoViolations()`.
- All user-facing strings go through `src/i18n/en.json` and `useTranslation()` — never hardcode English in JSX.
- New games/components render answer choices via `GameChoiceGrid`, not bespoke markup (not applicable to this plan's new components, but keep in mind if touching game screens).
- Bump `package.json` (app) and both game `manifest.json` files' minor version as part of this release.
- Follow Keep a Changelog format in `CHANGELOG.md`; update `docs/ENHANCEMENTS.md` and `README.md`'s Settings Reference table.

---

## Task 1: Settings shape — `timerMode`, `timeLimitSeconds`, `speedRecordMinAccuracy`

**Files:**
- Modify: `src/storage/adapter.js` (`DEFAULT_SETTINGS`, doc comment at top of file)
- Modify: `src/storage/localStorageAdapter.js:23-31` (`getSettings`, add migration)
- Test: `src/storage/__tests__/localStorageAdapter.timerMigration.test.js` (new)

**Interfaces:**
- Produces: `DEFAULT_SETTINGS.timerMode = 'countUp'`, `DEFAULT_SETTINGS.timeLimitSeconds = 10`, `DEFAULT_SETTINGS.speedRecordMinAccuracy = 70`. `timerDisplayEnabled` no longer exists in `DEFAULT_SETTINGS`.
- Consumes: nothing from other tasks.

- [ ] **Step 1: Write the failing migration test**

```js
// src/storage/__tests__/localStorageAdapter.timerMigration.test.js
import { vi, describe, it, expect, beforeEach } from 'vitest'
import localStorageAdapter from '../localStorageAdapter'

const SETTINGS_KEY = 'playground_settings'

const makeLocalStorage = () => {
  let store = {}
  return {
    getItem:    (key)        => Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
    setItem:    (key, value) => { store[key] = String(value) },
    removeItem: (key)        => { delete store[key] },
    clear:      ()           => { store = {} },
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', makeLocalStorage())
})

describe('localStorageAdapter — timerMode migration', () => {
  it('maps a stored timerDisplayEnabled=true to timerMode="countUp" when timerMode is absent', async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ timerDisplayEnabled: true }))
    const settings = await localStorageAdapter.getSettings()
    expect(settings.timerMode).toBe('countUp')
  })

  it('maps a stored timerDisplayEnabled=false to timerMode="off" when timerMode is absent', async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ timerDisplayEnabled: false }))
    const settings = await localStorageAdapter.getSettings()
    expect(settings.timerMode).toBe('off')
  })

  it('does not override an already-stored timerMode with the legacy flag', async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ timerDisplayEnabled: false, timerMode: 'countdown', timeLimitSeconds: 15 }))
    const settings = await localStorageAdapter.getSettings()
    expect(settings.timerMode).toBe('countdown')
    expect(settings.timeLimitSeconds).toBe(15)
  })

  it('defaults to timerMode="countUp" when neither timerMode nor the legacy flag is stored', async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({}))
    const settings = await localStorageAdapter.getSettings()
    expect(settings.timerMode).toBe('countUp')
  })

  it('defaults speedRecordMinAccuracy to 70 and timeLimitSeconds to 10', async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({}))
    const settings = await localStorageAdapter.getSettings()
    expect(settings.speedRecordMinAccuracy).toBe(70)
    expect(settings.timeLimitSeconds).toBe(10)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/storage/__tests__/localStorageAdapter.timerMigration.test.js`
Expected: FAIL — `settings.timerMode` is `undefined` (no `timerMode` default or migration exists yet).

- [ ] **Step 3: Update `DEFAULT_SETTINGS` in `src/storage/adapter.js`**

Replace the whole file's content with:

```js
export const DEFAULT_SETTINGS = {
  numChoices: 2,
  feedbackMode: 'immediate',
  questionsPerSession: 10,
  gaId: '',
  childName: '',
  animationsEnabled: true,
  tagOverrides: {},
  timerMode: 'countUp',
  timeLimitSeconds: 10,
  maxTries: 'none',
  hintsEnabled: false,
  hintAfterWrongTaps: 2,
  retryCountsAsStreak: true,
  spacedRepetitionEnabled: false,
  difficultyAutoProgressionEnabled: false,
  introDismissed: {},
  speedRecordMinAccuracy: 70,
}

/**
 * Storage adapter interface. Every adapter must implement these four async methods.
 *
 * getScores()              → Promise<Score[]>
 * addScore(score)          → Promise<void>
 * getSettings()             → Promise<Settings>
 * saveSettings(settings)   → Promise<void>
 *
 * Score shape:   { gameId, score, total, date, timestamp, peakStreak?, timings? }
 *   peakStreak?: number — highest consecutive-correct run in that session (added v0.4.0)
 *   timings?: Array<{ questionIndex: number, itemId: string, correct: boolean, durationMs: number, attemptNumber: number, timedOut?: boolean }>
 *     itemId added in v0.4.0; older records omit it
 *     attemptNumber added in v0.6.0 (1 = first tap, 2 = first retry, etc.); older records omit it
 *     timedOut added in v0.8.0 (true when the entry was recorded because the countdown ran out); older records omit it
 * Settings shape: { numChoices, feedbackMode, questionsPerSession, gaId, childName, animationsEnabled, tagOverrides,
 *                    timerMode, timeLimitSeconds, maxTries, hintsEnabled, hintAfterWrongTaps, retryCountsAsStreak,
 *                    spacedRepetitionEnabled, difficultyAutoProgressionEnabled, introDismissed, speedRecordMinAccuracy }
 *   maxTries: 'none' | 1 | 2 | 3 | 4 | 5 | 'unlimited' — 'none' reproduces pre-v0.6.0 behavior (locks on first wrong tap)
 *   introDismissed: { [gameId: string]: true } — gameIds present here permanently suppress that game's how-to-play intro
 *   timerMode: 'off' | 'countUp' | 'countdown' — replaces the v0.6.0 boolean `timerDisplayEnabled` (added v0.8.0)
 *   timeLimitSeconds: 5 | 10 | 15 | 20 — only enforced when timerMode === 'countdown' (added v0.8.0)
 *   speedRecordMinAccuracy: 70 | 75 | 80 | 85 | 90 | 95 | 100 — minimum session accuracy % for a speed record to be eligible (added v0.8.0)
 *
 * Best-streak adapter methods (added for per-game streak tracking):
 * getBestStreaks()            → Promise<{ [gameId: string]: number }>
 * saveBestStreaks(streaksMap) → Promise<void>
 *
 * Personal-best adapter methods (added v0.8.0):
 * getPersonalBests()           → Promise<{ [gameId: string]: { accuracy?: {...}, speedMs?: {...} } }>
 * savePersonalBests(bestsMap)  → Promise<void>
 *
 * Badge adapter methods (added v0.8.0):
 * getBadgeData()  → Promise<{ awards: { [gameId: string]: { [badgeId: string]: number } }, lifetimeQuestions: { [gameId: string]: number } }>
 * saveBadgeData(data) → Promise<void>
 */
```

- [ ] **Step 4: Add the migration to `getSettings()` in `src/storage/localStorageAdapter.js`**

Replace lines 23-31 (the existing `getSettings` method) with:

```js
  async getSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
      const stored = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
      const migrated = { ...stored }
      if (migrated.timerMode === undefined && migrated.timerDisplayEnabled !== undefined) {
        migrated.timerMode = migrated.timerDisplayEnabled ? 'countUp' : 'off'
      }
      return { ...DEFAULT_SETTINGS, ...migrated }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/storage/__tests__/localStorageAdapter.timerMigration.test.js`
Expected: PASS (5 tests)

- [ ] **Step 6: Run the full existing settings/adapter test suite to check for regressions**

Run: `npx vitest run src/storage/__tests__ src/hooks/__tests__/useSettings.test.js`
Expected: PASS — no test in this run should reference `timerDisplayEnabled` as a required default (if any does, it's covered in Task 9).

- [ ] **Step 7: Commit**

```bash
git add src/storage/adapter.js src/storage/localStorageAdapter.js src/storage/__tests__/localStorageAdapter.timerMigration.test.js
git commit -m "feat: replace timerDisplayEnabled with timerMode/timeLimitSeconds settings"
```

---

## Task 2: Personal-best storage adapter methods

**Files:**
- Modify: `src/storage/localStorageAdapter.js` (add `getPersonalBests`/`savePersonalBests`, new `PERSONAL_BESTS_KEY` constant)
- Test: `src/storage/__tests__/localStorageAdapter.personalBests.test.js` (new)

**Interfaces:**
- Produces: `getPersonalBests() → Promise<{ [gameId]: { accuracy?, speedMs? } }>`, `savePersonalBests(bests) → Promise<void>`.
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

```js
// src/storage/__tests__/localStorageAdapter.personalBests.test.js
import { vi, describe, it, expect, beforeEach } from 'vitest'
import localStorageAdapter from '../localStorageAdapter'

const PERSONAL_BESTS_KEY = 'playground_personal_bests'

const makeLocalStorage = () => {
  let store = {}
  return {
    getItem:    (key)        => Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
    setItem:    (key, value) => { store[key] = String(value) },
    removeItem: (key)        => { delete store[key] },
    clear:      ()           => { store = {} },
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', makeLocalStorage())
})

describe('localStorageAdapter — personal bests', () => {
  describe('getPersonalBests', () => {
    it('returns {} when localStorage is empty', async () => {
      expect(await localStorageAdapter.getPersonalBests()).toEqual({})
    })

    it('returns stored bests when data is valid', async () => {
      const stored = { 'animal-sounds': { accuracy: { ratio: 0.8, score: 8, total: 10, timestamp: 1000 } } }
      localStorage.setItem(PERSONAL_BESTS_KEY, JSON.stringify(stored))
      expect(await localStorageAdapter.getPersonalBests()).toEqual(stored)
    })

    it('returns {} when the stored value is invalid JSON', async () => {
      localStorage.setItem(PERSONAL_BESTS_KEY, 'not{valid}json')
      expect(await localStorageAdapter.getPersonalBests()).toEqual({})
    })

    it('returns {} when the stored value is a JSON array', async () => {
      localStorage.setItem(PERSONAL_BESTS_KEY, JSON.stringify([1, 2, 3]))
      expect(await localStorageAdapter.getPersonalBests()).toEqual({})
    })
  })

  describe('savePersonalBests', () => {
    it('persists a bests map to localStorage', async () => {
      const bests = { 'color-match': { speedMs: { avgMs: 1800, timestamp: 2000 } } }
      await localStorageAdapter.savePersonalBests(bests)
      expect(JSON.parse(localStorage.getItem(PERSONAL_BESTS_KEY))).toEqual(bests)
    })

    it('overwrites the previous bests map', async () => {
      await localStorageAdapter.savePersonalBests({ 'animal-sounds': { accuracy: { ratio: 0.5, score: 5, total: 10, timestamp: 1 } } })
      await localStorageAdapter.savePersonalBests({ 'animal-sounds': { accuracy: { ratio: 0.9, score: 9, total: 10, timestamp: 2 } } })
      const stored = JSON.parse(localStorage.getItem(PERSONAL_BESTS_KEY))
      expect(stored['animal-sounds'].accuracy.ratio).toBe(0.9)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/storage/__tests__/localStorageAdapter.personalBests.test.js`
Expected: FAIL — `localStorageAdapter.getPersonalBests is not a function`

- [ ] **Step 3: Implement in `src/storage/localStorageAdapter.js`**

Add a constant alongside the existing `STREAKS_KEY` (top of file):

```js
const PERSONAL_BESTS_KEY = 'playground_personal_bests'
```

Add these two methods to the `localStorageAdapter` object, after `saveBestStreaks`:

```js
  async getPersonalBests() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PERSONAL_BESTS_KEY) || '{}')
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  },

  async savePersonalBests(bests) {
    localStorage.setItem(PERSONAL_BESTS_KEY, JSON.stringify(bests))
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/storage/__tests__/localStorageAdapter.personalBests.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/storage/localStorageAdapter.js src/storage/__tests__/localStorageAdapter.personalBests.test.js
git commit -m "feat: add personal-best storage adapter methods"
```

---

## Task 3: Badge-data storage adapter methods

**Files:**
- Modify: `src/storage/localStorageAdapter.js` (add `getBadgeData`/`saveBadgeData`, new `BADGES_KEY` constant)
- Test: `src/storage/__tests__/localStorageAdapter.badges.test.js` (new)

**Interfaces:**
- Produces: `getBadgeData() → Promise<{ awards: { [gameId]: { [badgeId]: number } }, lifetimeQuestions: { [gameId]: number } }>`, `saveBadgeData(data) → Promise<void>`.
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

```js
// src/storage/__tests__/localStorageAdapter.badges.test.js
import { vi, describe, it, expect, beforeEach } from 'vitest'
import localStorageAdapter from '../localStorageAdapter'

const BADGES_KEY = 'playground_badges'

const makeLocalStorage = () => {
  let store = {}
  return {
    getItem:    (key)        => Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
    setItem:    (key, value) => { store[key] = String(value) },
    removeItem: (key)        => { delete store[key] },
    clear:      ()           => { store = {} },
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', makeLocalStorage())
})

describe('localStorageAdapter — badge data', () => {
  describe('getBadgeData', () => {
    it('returns empty awards/lifetimeQuestions when localStorage is empty', async () => {
      expect(await localStorageAdapter.getBadgeData()).toEqual({ awards: {}, lifetimeQuestions: {} })
    })

    it('returns stored data when valid', async () => {
      const stored = { awards: { 'animal-sounds': { hotStreak: 2 } }, lifetimeQuestions: { 'animal-sounds': 120 } }
      localStorage.setItem(BADGES_KEY, JSON.stringify(stored))
      expect(await localStorageAdapter.getBadgeData()).toEqual(stored)
    })

    it('returns empty shape when the stored value is invalid JSON', async () => {
      localStorage.setItem(BADGES_KEY, 'not{valid}json')
      expect(await localStorageAdapter.getBadgeData()).toEqual({ awards: {}, lifetimeQuestions: {} })
    })

    it('returns empty shape when the stored value is a JSON array', async () => {
      localStorage.setItem(BADGES_KEY, JSON.stringify([1, 2, 3]))
      expect(await localStorageAdapter.getBadgeData()).toEqual({ awards: {}, lifetimeQuestions: {} })
    })

    it('fills in an empty awards object when only lifetimeQuestions is present', async () => {
      localStorage.setItem(BADGES_KEY, JSON.stringify({ lifetimeQuestions: { 'color-match': 10 } }))
      expect(await localStorageAdapter.getBadgeData()).toEqual({ awards: {}, lifetimeQuestions: { 'color-match': 10 } })
    })
  })

  describe('saveBadgeData', () => {
    it('persists badge data to localStorage', async () => {
      const data = { awards: { 'color-match': { perfectSession: 1 } }, lifetimeQuestions: { 'color-match': 10 } }
      await localStorageAdapter.saveBadgeData(data)
      expect(JSON.parse(localStorage.getItem(BADGES_KEY))).toEqual(data)
    })

    it('overwrites the previous badge data', async () => {
      await localStorageAdapter.saveBadgeData({ awards: {}, lifetimeQuestions: { 'animal-sounds': 10 } })
      await localStorageAdapter.saveBadgeData({ awards: {}, lifetimeQuestions: { 'animal-sounds': 20 } })
      const stored = JSON.parse(localStorage.getItem(BADGES_KEY))
      expect(stored.lifetimeQuestions['animal-sounds']).toBe(20)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/storage/__tests__/localStorageAdapter.badges.test.js`
Expected: FAIL — `localStorageAdapter.getBadgeData is not a function`

- [ ] **Step 3: Implement in `src/storage/localStorageAdapter.js`**

Add a constant alongside `PERSONAL_BESTS_KEY`:

```js
const BADGES_KEY = 'playground_badges'
```

Add these two methods after `savePersonalBests`:

```js
  async getBadgeData() {
    try {
      const parsed = JSON.parse(localStorage.getItem(BADGES_KEY) || '{}')
      const valid = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      return {
        awards: valid && parsed.awards && typeof parsed.awards === 'object' ? parsed.awards : {},
        lifetimeQuestions: valid && parsed.lifetimeQuestions && typeof parsed.lifetimeQuestions === 'object' ? parsed.lifetimeQuestions : {},
      }
    } catch {
      return { awards: {}, lifetimeQuestions: {} }
    }
  },

  async saveBadgeData(data) {
    localStorage.setItem(BADGES_KEY, JSON.stringify(data))
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/storage/__tests__/localStorageAdapter.badges.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/storage/localStorageAdapter.js src/storage/__tests__/localStorageAdapter.badges.test.js
git commit -m "feat: add badge-data storage adapter methods"
```

---

## Task 4: Badge catalog

**Files:**
- Create: `src/lib/badges.js`
- Test: `src/lib/__tests__/badges.test.js` (new — sanity-checks the catalog itself, not behavior)
- Modify: `src/i18n/en.json` (add `badges` namespace)

**Interfaces:**
- Produces: `BADGE_CATALOG: Array<{ id: string, category: 'streak' | 'perfect' | 'totalQuestions', tier: number | null, icon: string, nameKey: string, descKey: string }>` — consumed by Task 6 (`computeBadgeAwards`), Task 8 (`useBadges`), Task 12 (`GameResults`), Task 13 (`BadgeGallery`).
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

```js
// src/lib/__tests__/badges.test.js
import { describe, it, expect } from 'vitest'
import { BADGE_CATALOG } from '../badges'

describe('BADGE_CATALOG', () => {
  it('has 8 entries', () => {
    expect(BADGE_CATALOG).toHaveLength(8)
  })

  it('has unique ids', () => {
    const ids = BADGE_CATALOG.map(b => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every entry has an id, category, icon, nameKey, and descKey', () => {
    for (const badge of BADGE_CATALOG) {
      expect(badge.id).toEqual(expect.any(String))
      expect(['streak', 'perfect', 'totalQuestions']).toContain(badge.category)
      expect(badge.icon).toEqual(expect.any(String))
      expect(badge.nameKey).toEqual(expect.any(String))
      expect(badge.descKey).toEqual(expect.any(String))
    }
  })

  it('streak tiers are ascending: 5, 10, 25', () => {
    const streakTiers = BADGE_CATALOG.filter(b => b.category === 'streak').map(b => b.tier)
    expect(streakTiers).toEqual([5, 10, 25])
  })

  it('totalQuestions tiers are ascending: 50, 100, 500, 1000', () => {
    const tiers = BADGE_CATALOG.filter(b => b.category === 'totalQuestions').map(b => b.tier)
    expect(tiers).toEqual([50, 100, 500, 1000])
  })

  it('has exactly one perfect-category badge with a null tier', () => {
    const perfectBadges = BADGE_CATALOG.filter(b => b.category === 'perfect')
    expect(perfectBadges).toHaveLength(1)
    expect(perfectBadges[0].tier).toBe(null)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/badges.test.js`
Expected: FAIL — cannot find module `../badges`

- [ ] **Step 3: Create `src/lib/badges.js`**

```js
export const BADGE_CATALOG = [
  { id: 'hotStreak',       category: 'streak',         tier: 5,    icon: '🔥', nameKey: 'badges.hotStreak.name',       descKey: 'badges.hotStreak.desc' },
  { id: 'onFire',          category: 'streak',         tier: 10,   icon: '⚡', nameKey: 'badges.onFire.name',          descKey: 'badges.onFire.desc' },
  { id: 'unstoppable',     category: 'streak',         tier: 25,   icon: '🌟', nameKey: 'badges.unstoppable.name',     descKey: 'badges.unstoppable.desc' },
  { id: 'perfectSession',  category: 'perfect',         tier: null, icon: '🎯', nameKey: 'badges.perfectSession.name', descKey: 'badges.perfectSession.desc' },
  { id: 'gettingStarted',  category: 'totalQuestions',  tier: 50,   icon: '🌱', nameKey: 'badges.gettingStarted.name', descKey: 'badges.gettingStarted.desc' },
  { id: 'centuryClub',     category: 'totalQuestions',  tier: 100,  icon: '💯', nameKey: 'badges.centuryClub.name',    descKey: 'badges.centuryClub.desc' },
  { id: 'dedicatedPlayer', category: 'totalQuestions',  tier: 500,  icon: '🏆', nameKey: 'badges.dedicatedPlayer.name', descKey: 'badges.dedicatedPlayer.desc' },
  { id: 'grandMaster',     category: 'totalQuestions',  tier: 1000, icon: '👑', nameKey: 'badges.grandMaster.name',    descKey: 'badges.grandMaster.desc' },
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/badges.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Add the `badges` i18n namespace to `src/i18n/en.json`**

Add a new top-level key (after the existing `"color"` block, before the final closing `}`):

```json
  "badges": {
    "hotStreak": { "name": "Hot Streak", "desc": "Reach a streak of 5 correct answers in a row." },
    "onFire": { "name": "On Fire", "desc": "Reach a streak of 10 correct answers in a row." },
    "unstoppable": { "name": "Unstoppable", "desc": "Reach a streak of 25 correct answers in a row." },
    "perfectSession": { "name": "Perfect Session", "desc": "Answer every question correctly in one session." },
    "gettingStarted": { "name": "Getting Started", "desc": "Answer 50 questions in this game." },
    "centuryClub": { "name": "Century Club", "desc": "Answer 100 questions in this game." },
    "dedicatedPlayer": { "name": "Dedicated Player", "desc": "Answer 500 questions in this game." },
    "grandMaster": { "name": "Grand Master", "desc": "Answer 1000 questions in this game." },
    "locked": "Locked"
  }
```

- [ ] **Step 6: Run the i18n structural test to confirm the JSON is still valid and complete**

Run: `npx vitest run src/i18n/__tests__/i18n.test.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/badges.js src/lib/__tests__/badges.test.js src/i18n/en.json
git commit -m "feat: add milestone badge catalog"
```

---

## Task 5: `evaluatePersonalBest` pure function

**Files:**
- Create: `src/utils/evaluatePersonalBest.js`
- Test: `src/utils/__tests__/evaluatePersonalBest.test.js` (new)

**Interfaces:**
- Produces: `evaluatePersonalBest({ score, total, timings, minAccuracyPct, previous }) → { accuracy: { isNewRecord, value, previous }, speed: { isNewRecord, value, previous }, updatedBests }`, where `previous` is `{ accuracy?: { ratio, score, total, timestamp }, speedMs?: { avgMs, timestamp } } | null`. Consumed by Task 7 (`usePersonalBest`).
- Consumes: nothing.

- [ ] **Step 1: Write the failing tests**

```js
// src/utils/__tests__/evaluatePersonalBest.test.js
import { describe, it, expect, vi, afterEach } from 'vitest'
import evaluatePersonalBest from '../evaluatePersonalBest'

const timings = (...corrects) => corrects.map((correct, i) => ({
  questionIndex: i, itemId: `item-${i}`, correct, durationMs: 1000 + i * 100, attemptNumber: 1,
}))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('evaluatePersonalBest', () => {
  it('on a first-ever session (no previous), persists both bests but announces neither', () => {
    vi.spyOn(Date, 'now').mockReturnValue(5000)
    const result = evaluatePersonalBest({
      score: 8, total: 10, timings: timings(true, true, true, true, true, true, true, true, false, false),
      minAccuracyPct: 70, previous: null,
    })

    expect(result.accuracy.isNewRecord).toBe(false)
    expect(result.speed.isNewRecord).toBe(false)
    expect(result.updatedBests.accuracy).toEqual({ ratio: 0.8, score: 8, total: 10, timestamp: 5000 })
    expect(result.updatedBests.speedMs).toBeDefined()
  })

  it('announces a new accuracy record when the ratio improves over the previous one', () => {
    vi.spyOn(Date, 'now').mockReturnValue(9000)
    const previous = { accuracy: { ratio: 0.7, score: 7, total: 10, timestamp: 1000 } }
    const result = evaluatePersonalBest({
      score: 9, total: 10, timings: timings(...Array(9).fill(true), false),
      minAccuracyPct: 70, previous,
    })

    expect(result.accuracy.isNewRecord).toBe(true)
    expect(result.accuracy.previous).toEqual(previous.accuracy)
    expect(result.updatedBests.accuracy).toEqual({ ratio: 0.9, score: 9, total: 10, timestamp: 9000 })
  })

  it('does not announce a record when the ratio ties the previous one', () => {
    const previous = { accuracy: { ratio: 0.8, score: 8, total: 10, timestamp: 1000 } }
    const result = evaluatePersonalBest({
      score: 8, total: 10, timings: timings(...Array(8).fill(true), false, false),
      minAccuracyPct: 70, previous,
    })

    expect(result.accuracy.isNewRecord).toBe(false)
    expect(result.updatedBests.accuracy).toEqual(previous.accuracy)
  })

  it('does not announce a record when the ratio is lower than the previous one', () => {
    const previous = { accuracy: { ratio: 0.9, score: 9, total: 10, timestamp: 1000 } }
    const result = evaluatePersonalBest({
      score: 5, total: 10, timings: timings(...Array(5).fill(true), ...Array(5).fill(false)),
      minAccuracyPct: 70, previous,
    })

    expect(result.accuracy.isNewRecord).toBe(false)
    expect(result.updatedBests.accuracy).toEqual(previous.accuracy)
  })

  it('is speed-eligible and beats the previous average when accuracy meets the gate and is faster', () => {
    const previous = { speedMs: { avgMs: 2000, timestamp: 1000 } }
    const result = evaluatePersonalBest({
      score: 8, total: 10,
      timings: [
        { questionIndex: 0, itemId: 'a', correct: true, durationMs: 1000, attemptNumber: 1 },
        { questionIndex: 1, itemId: 'b', correct: true, durationMs: 1200, attemptNumber: 1 },
        { questionIndex: 2, itemId: 'c', correct: false, durationMs: 5000, attemptNumber: 1 },
      ],
      minAccuracyPct: 70, previous,
    })

    expect(result.speed.isNewRecord).toBe(true)
    expect(result.speed.value).toBe(1100) // avg of the two correct durations, wrong excluded
  })

  it('is not speed-eligible when session accuracy is below minAccuracyPct, even if fast', () => {
    const previous = { speedMs: { avgMs: 5000, timestamp: 1000 } }
    const result = evaluatePersonalBest({
      score: 1, total: 10,
      timings: [
        { questionIndex: 0, itemId: 'a', correct: true, durationMs: 100, attemptNumber: 1 },
        ...Array.from({ length: 9 }, (_, i) => ({ questionIndex: i + 1, itemId: `x${i}`, correct: false, durationMs: 100, attemptNumber: 1 })),
      ],
      minAccuracyPct: 70, previous,
    })

    expect(result.speed.isNewRecord).toBe(false)
    expect(result.updatedBests.speedMs).toEqual(previous.speedMs)
  })

  it('is speed-eligible exactly at the minAccuracyPct boundary', () => {
    const result = evaluatePersonalBest({
      score: 7, total: 10,
      timings: [
        ...Array.from({ length: 7 }, (_, i) => ({ questionIndex: i, itemId: `c${i}`, correct: true, durationMs: 1000, attemptNumber: 1 })),
        ...Array.from({ length: 3 }, (_, i) => ({ questionIndex: i + 7, itemId: `w${i}`, correct: false, durationMs: 1000, attemptNumber: 1 })),
      ],
      minAccuracyPct: 70, previous: null,
    })

    expect(result.updatedBests.speedMs).toBeDefined()
  })

  it('does not evaluate a speed record when there are zero correct answers (no divide-by-zero)', () => {
    const previous = { speedMs: { avgMs: 5000, timestamp: 1000 } }
    const result = evaluatePersonalBest({
      score: 0, total: 5,
      timings: Array.from({ length: 5 }, (_, i) => ({ questionIndex: i, itemId: `x${i}`, correct: false, durationMs: 100, attemptNumber: 1 })),
      minAccuracyPct: 70, previous,
    })

    expect(result.speed.isNewRecord).toBe(false)
    expect(result.speed.value).toBe(null)
    expect(result.updatedBests.speedMs).toEqual(previous.speedMs)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/evaluatePersonalBest.test.js`
Expected: FAIL — cannot find module `../evaluatePersonalBest`

- [ ] **Step 3: Create `src/utils/evaluatePersonalBest.js`**

```js
export default function evaluatePersonalBest({ score, total, timings, minAccuracyPct, previous }) {
  const accuracyRatio = total > 0 ? score / total : 0
  const prevAccuracy = previous?.accuracy ?? null
  const isFirstAccuracy = !prevAccuracy
  const accuracyImproved = !isFirstAccuracy && accuracyRatio > prevAccuracy.ratio
  const accuracyShouldPersist = isFirstAccuracy || accuracyImproved

  const correctDurations = timings.filter(t => t.correct).map(t => t.durationMs)
  const hasCorrect = correctDurations.length > 0
  const avgCorrectDurationMs = hasCorrect
    ? correctDurations.reduce((sum, ms) => sum + ms, 0) / correctDurations.length
    : null

  const meetsAccuracyGate = accuracyRatio >= minAccuracyPct / 100
  const speedEligible = hasCorrect && meetsAccuracyGate
  const prevSpeed = previous?.speedMs ?? null
  const isFirstSpeed = !prevSpeed
  const speedImproved = speedEligible && !isFirstSpeed && avgCorrectDurationMs < prevSpeed.avgMs
  const speedShouldPersist = speedEligible && (isFirstSpeed || speedImproved)

  const updatedBests = { ...previous }
  if (accuracyShouldPersist) {
    updatedBests.accuracy = { ratio: accuracyRatio, score, total, timestamp: Date.now() }
  }
  if (speedShouldPersist) {
    updatedBests.speedMs = { avgMs: avgCorrectDurationMs, timestamp: Date.now() }
  }

  return {
    accuracy: { isNewRecord: accuracyImproved, value: accuracyRatio, previous: prevAccuracy },
    speed: { isNewRecord: speedImproved, value: hasCorrect ? avgCorrectDurationMs : null, previous: prevSpeed },
    updatedBests,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/__tests__/evaluatePersonalBest.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/evaluatePersonalBest.js src/utils/__tests__/evaluatePersonalBest.test.js
git commit -m "feat: add evaluatePersonalBest pure function"
```

---

## Task 6: `computeBadgeAwards` pure function

**Files:**
- Create: `src/utils/computeBadgeAwards.js`
- Test: `src/utils/__tests__/computeBadgeAwards.test.js` (new)

**Interfaces:**
- Produces: `computeBadgeAwards({ peakStreak, isPerfect, prevLifetimeTotal, newLifetimeTotal }) → string[]` (badge ids newly earned this session, in `BADGE_CATALOG` order). Consumed by Task 8 (`useBadges`).
- Consumes: `BADGE_CATALOG` from `src/lib/badges.js` (Task 4).

- [ ] **Step 1: Write the failing tests**

```js
// src/utils/__tests__/computeBadgeAwards.test.js
import { describe, it, expect } from 'vitest'
import computeBadgeAwards from '../computeBadgeAwards'

describe('computeBadgeAwards', () => {
  it('awards hotStreak when peakStreak reaches 5', () => {
    const earned = computeBadgeAwards({ peakStreak: 5, isPerfect: false, prevLifetimeTotal: 0, newLifetimeTotal: 5 })
    expect(earned).toEqual(['hotStreak'])
  })

  it('awards nothing when peakStreak is below every streak tier', () => {
    const earned = computeBadgeAwards({ peakStreak: 4, isPerfect: false, prevLifetimeTotal: 0, newLifetimeTotal: 5 })
    expect(earned).toEqual([])
  })

  it('awards multiple streak tiers at once when peakStreak crosses several thresholds in one session', () => {
    const earned = computeBadgeAwards({ peakStreak: 12, isPerfect: false, prevLifetimeTotal: 0, newLifetimeTotal: 12 })
    expect(earned).toEqual(['hotStreak', 'onFire'])
  })

  it('awards all three streak tiers when peakStreak reaches 25', () => {
    const earned = computeBadgeAwards({ peakStreak: 25, isPerfect: false, prevLifetimeTotal: 0, newLifetimeTotal: 25 })
    expect(earned).toEqual(['hotStreak', 'onFire', 'unstoppable'])
  })

  it('awards perfectSession when isPerfect is true, alongside any streak tiers earned', () => {
    const earned = computeBadgeAwards({ peakStreak: 5, isPerfect: true, prevLifetimeTotal: 0, newLifetimeTotal: 5 })
    expect(earned).toEqual(['hotStreak', 'perfectSession'])
  })

  it('does not award perfectSession when isPerfect is false', () => {
    const earned = computeBadgeAwards({ peakStreak: 0, isPerfect: false, prevLifetimeTotal: 0, newLifetimeTotal: 5 })
    expect(earned).toEqual([])
  })

  it('awards a totalQuestions tier exactly when it is crossed this session', () => {
    const earned = computeBadgeAwards({ peakStreak: 0, isPerfect: false, prevLifetimeTotal: 45, newLifetimeTotal: 50 })
    expect(earned).toEqual(['gettingStarted'])
  })

  it('does not re-award a totalQuestions tier that was already crossed before this session', () => {
    const earned = computeBadgeAwards({ peakStreak: 0, isPerfect: false, prevLifetimeTotal: 60, newLifetimeTotal: 70 })
    expect(earned).toEqual([])
  })

  it('awards multiple totalQuestions tiers crossed in one large session', () => {
    const earned = computeBadgeAwards({ peakStreak: 0, isPerfect: false, prevLifetimeTotal: 40, newLifetimeTotal: 120 })
    expect(earned).toEqual(['gettingStarted', 'centuryClub'])
  })

  it('awards nothing when no thresholds are crossed and the session is imperfect', () => {
    const earned = computeBadgeAwards({ peakStreak: 2, isPerfect: false, prevLifetimeTotal: 10, newLifetimeTotal: 15 })
    expect(earned).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/computeBadgeAwards.test.js`
Expected: FAIL — cannot find module `../computeBadgeAwards`

- [ ] **Step 3: Create `src/utils/computeBadgeAwards.js`**

```js
import { BADGE_CATALOG } from '../lib/badges'

export default function computeBadgeAwards({ peakStreak, isPerfect, prevLifetimeTotal, newLifetimeTotal }) {
  const earned = []

  for (const badge of BADGE_CATALOG) {
    if (badge.category === 'streak' && peakStreak >= badge.tier) {
      earned.push(badge.id)
    } else if (badge.category === 'perfect' && isPerfect) {
      earned.push(badge.id)
    } else if (badge.category === 'totalQuestions' && prevLifetimeTotal < badge.tier && newLifetimeTotal >= badge.tier) {
      earned.push(badge.id)
    }
  }

  return earned
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/__tests__/computeBadgeAwards.test.js`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/computeBadgeAwards.js src/utils/__tests__/computeBadgeAwards.test.js
git commit -m "feat: add computeBadgeAwards pure function"
```

---

## Task 7: `usePersonalBest` hook

**Files:**
- Create: `src/hooks/usePersonalBest.js`
- Test: `src/hooks/__tests__/usePersonalBest.test.js` (new)

**Interfaces:**
- Produces: `usePersonalBest(gameId) → { personalBest: { accuracy?, speedMs? } | null, recordSession({ score, total, timings, minAccuracyPct }) → Promise<{ accuracy, speed }> }`. Consumed by Task 10 (`useGameSession`).
- Consumes: `adapter.getPersonalBests()` / `adapter.savePersonalBests()` (Task 2), `evaluatePersonalBest` (Task 5).

- [ ] **Step 1: Write the failing tests**

```js
// src/hooks/__tests__/usePersonalBest.test.js
import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetPersonalBests, mockSavePersonalBests } = vi.hoisted(() => ({
  mockGetPersonalBests: vi.fn(),
  mockSavePersonalBests: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../storage/index', () => ({
  default: {
    getPersonalBests: mockGetPersonalBests,
    savePersonalBests: mockSavePersonalBests,
  },
}))

import usePersonalBest from '../usePersonalBest'

const timings = (...corrects) => corrects.map((correct, i) => ({
  questionIndex: i, itemId: `item-${i}`, correct, durationMs: 1000, attemptNumber: 1,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockGetPersonalBests.mockResolvedValue({
    'animal-sounds': { accuracy: { ratio: 0.7, score: 7, total: 10, timestamp: 1 } },
  })
})

describe('usePersonalBest', () => {
  it('loads the stored personal best for the given gameId', async () => {
    const { result } = renderHook(() => usePersonalBest('animal-sounds'))
    await waitFor(() => expect(result.current.personalBest).toEqual({
      accuracy: { ratio: 0.7, score: 7, total: 10, timestamp: 1 },
    }))
  })

  it('defaults to null when no best is stored for the gameId', async () => {
    const { result } = renderHook(() => usePersonalBest('color-match'))
    await waitFor(() => expect(mockGetPersonalBests).toHaveBeenCalled())
    expect(result.current.personalBest).toBe(null)
  })

  it('recordSession persists an improved accuracy record and updates personalBest', async () => {
    const { result } = renderHook(() => usePersonalBest('animal-sounds'))
    await waitFor(() => expect(result.current.personalBest).not.toBe(null))

    let outcome
    await act(async () => {
      outcome = await result.current.recordSession({ score: 9, total: 10, timings: timings(...Array(9).fill(true), false), minAccuracyPct: 70 })
    })

    expect(outcome.accuracy.isNewRecord).toBe(true)
    expect(mockSavePersonalBests).toHaveBeenCalledWith(
      expect.objectContaining({ 'animal-sounds': expect.objectContaining({ accuracy: expect.objectContaining({ ratio: 0.9 }) }) })
    )
    expect(result.current.personalBest.accuracy.ratio).toBe(0.9)
  })

  it('recordSession does not report a record when the session does not improve on the stored best', async () => {
    const { result } = renderHook(() => usePersonalBest('animal-sounds'))
    await waitFor(() => expect(result.current.personalBest).not.toBe(null))

    let outcome
    await act(async () => {
      outcome = await result.current.recordSession({ score: 5, total: 10, timings: timings(...Array(5).fill(true), ...Array(5).fill(false)), minAccuracyPct: 70 })
    })

    expect(outcome.accuracy.isNewRecord).toBe(false)
  })

  it('keeps separate bests per gameId', async () => {
    const { result: animalResult } = renderHook(() => usePersonalBest('animal-sounds'))
    const { result: colorResult } = renderHook(() => usePersonalBest('color-match'))
    await waitFor(() => expect(animalResult.current.personalBest).not.toBe(null))
    await waitFor(() => expect(colorResult.current.personalBest).toBe(null))

    await act(async () => {
      await colorResult.current.recordSession({ score: 10, total: 10, timings: timings(...Array(10).fill(true)), minAccuracyPct: 70 })
    })

    expect(mockSavePersonalBests).toHaveBeenCalledWith(
      expect.objectContaining({
        'animal-sounds': expect.objectContaining({ accuracy: expect.objectContaining({ ratio: 0.7 }) }),
        'color-match': expect.objectContaining({ accuracy: expect.objectContaining({ ratio: 1 }) }),
      })
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/__tests__/usePersonalBest.test.js`
Expected: FAIL — cannot find module `../usePersonalBest`

- [ ] **Step 3: Create `src/hooks/usePersonalBest.js`**

```js
import { useState, useEffect, useRef } from 'react'
import adapter from '../storage/index'
import evaluatePersonalBest from '../utils/evaluatePersonalBest'

export default function usePersonalBest(gameId) {
  const [personalBest, setPersonalBest] = useState(null)
  const bestsRef = useRef({})

  useEffect(() => {
    adapter.getPersonalBests().then(bests => {
      bestsRef.current = bests
      setPersonalBest(bests[gameId] ?? null)
    })
  }, [gameId])

  async function recordSession({ score, total, timings, minAccuracyPct }) {
    const previous = bestsRef.current[gameId] ?? null
    const { accuracy, speed, updatedBests } = evaluatePersonalBest({ score, total, timings, minAccuracyPct, previous })

    const nextBests = { ...bestsRef.current, [gameId]: updatedBests }
    bestsRef.current = nextBests
    setPersonalBest(updatedBests)
    await adapter.savePersonalBests(nextBests)

    return { accuracy, speed }
  }

  return { personalBest, recordSession }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/__tests__/usePersonalBest.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePersonalBest.js src/hooks/__tests__/usePersonalBest.test.js
git commit -m "feat: add usePersonalBest hook"
```

---

## Task 8: `useBadges` hook

**Files:**
- Create: `src/hooks/useBadges.js`
- Test: `src/hooks/__tests__/useBadges.test.js` (new)

**Interfaces:**
- Produces: `useBadges() → { badgeData: { awards, lifetimeQuestions }, awardSession(gameId, { peakStreak, isPerfect, questionsAnswered }) → Promise<CatalogEntry[]> }`. Consumed by Task 10 (`useGameSession`) and Task 14 (`AdminPage` Badges tab, via Task 13's `BadgeGallery`).
- Consumes: `adapter.getBadgeData()` / `adapter.saveBadgeData()` (Task 3), `computeBadgeAwards` (Task 6), `BADGE_CATALOG` (Task 4).

- [ ] **Step 1: Write the failing tests**

```js
// src/hooks/__tests__/useBadges.test.js
import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetBadgeData, mockSaveBadgeData } = vi.hoisted(() => ({
  mockGetBadgeData: vi.fn(),
  mockSaveBadgeData: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../storage/index', () => ({
  default: {
    getBadgeData: mockGetBadgeData,
    saveBadgeData: mockSaveBadgeData,
  },
}))

import useBadges from '../useBadges'

beforeEach(() => {
  vi.clearAllMocks()
  mockGetBadgeData.mockResolvedValue({ awards: { 'animal-sounds': { hotStreak: 1 } }, lifetimeQuestions: { 'animal-sounds': 45 } })
})

describe('useBadges', () => {
  it('loads the stored badge data', async () => {
    const { result } = renderHook(() => useBadges())
    await waitFor(() => expect(result.current.badgeData.lifetimeQuestions['animal-sounds']).toBe(45))
    expect(result.current.badgeData.awards['animal-sounds']).toEqual({ hotStreak: 1 })
  })

  it('awardSession increments lifetimeQuestions and persists newly earned badges', async () => {
    const { result } = renderHook(() => useBadges())
    await waitFor(() => expect(result.current.badgeData.lifetimeQuestions['animal-sounds']).toBe(45))

    let earned
    await act(async () => {
      earned = await result.current.awardSession('animal-sounds', { peakStreak: 0, isPerfect: false, questionsAnswered: 10 })
    })

    expect(earned).toEqual([]) // 45 + 10 = 55, crosses no new tier (50 already passed... wait see step below)
  })

  it('awardSession returns resolved catalog entries for badges earned this session', async () => {
    mockGetBadgeData.mockResolvedValue({ awards: {}, lifetimeQuestions: { 'animal-sounds': 0 } })
    const { result } = renderHook(() => useBadges())
    await waitFor(() => expect(result.current.badgeData.lifetimeQuestions['animal-sounds']).toBe(0))

    let earned
    await act(async () => {
      earned = await result.current.awardSession('animal-sounds', { peakStreak: 5, isPerfect: true, questionsAnswered: 10 })
    })

    expect(earned.map(b => b.id)).toEqual(['hotStreak', 'perfectSession'])
    expect(earned[0].icon).toBe('🔥')
  })

  it('awardSession increments an existing badge count rather than resetting it', async () => {
    const { result } = renderHook(() => useBadges())
    await waitFor(() => expect(result.current.badgeData.awards['animal-sounds']).toEqual({ hotStreak: 1 }))

    await act(async () => {
      await result.current.awardSession('animal-sounds', { peakStreak: 5, isPerfect: false, questionsAnswered: 10 })
    })

    expect(result.current.badgeData.awards['animal-sounds'].hotStreak).toBe(2)
  })

  it('awardSession tracks lifetimeQuestions and awards independently per gameId', async () => {
    const { result } = renderHook(() => useBadges())
    await waitFor(() => expect(result.current.badgeData.lifetimeQuestions['animal-sounds']).toBe(45))

    await act(async () => {
      await result.current.awardSession('color-match', { peakStreak: 0, isPerfect: false, questionsAnswered: 10 })
    })

    expect(result.current.badgeData.lifetimeQuestions).toEqual({ 'animal-sounds': 45, 'color-match': 10 })
    expect(mockSaveBadgeData).toHaveBeenCalledWith(
      expect.objectContaining({ lifetimeQuestions: { 'animal-sounds': 45, 'color-match': 10 } })
    )
  })
})
```

Note the second test's inline comment documents the expected math (45 + 10 = 55, which is below the next tier boundary — 50 was already crossed before this session since `prevLifetimeTotal` is 45 < 50 but wait, 45 < 50 ≤ 55, so `gettingStarted` **is** crossed this call). Fix that test to assert the correct outcome:

- [ ] **Step 1b: Correct the second test's assertion before running**

Replace:
```js
    expect(earned).toEqual([]) // 45 + 10 = 55, crosses no new tier (50 already passed... wait see step below)
```
with:
```js
    expect(earned.map(b => b.id)).toEqual(['gettingStarted']) // 45 -> 55 crosses the 50-question tier
```

And change that test's name/body to reflect resolved catalog entries consistently — full corrected test:

```js
  it('awardSession crosses a totalQuestions tier and returns its resolved catalog entry', async () => {
    const { result } = renderHook(() => useBadges())
    await waitFor(() => expect(result.current.badgeData.lifetimeQuestions['animal-sounds']).toBe(45))

    let earned
    await act(async () => {
      earned = await result.current.awardSession('animal-sounds', { peakStreak: 0, isPerfect: false, questionsAnswered: 10 })
    })

    expect(earned.map(b => b.id)).toEqual(['gettingStarted'])
    expect(result.current.badgeData.lifetimeQuestions['animal-sounds']).toBe(55)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/__tests__/useBadges.test.js`
Expected: FAIL — cannot find module `../useBadges`

- [ ] **Step 3: Create `src/hooks/useBadges.js`**

```js
import { useState, useEffect, useRef } from 'react'
import adapter from '../storage/index'
import computeBadgeAwards from '../utils/computeBadgeAwards'
import { BADGE_CATALOG } from '../lib/badges'

const EMPTY = { awards: {}, lifetimeQuestions: {} }

export default function useBadges() {
  const [badgeData, setBadgeData] = useState(EMPTY)
  const dataRef = useRef(EMPTY)

  useEffect(() => {
    adapter.getBadgeData().then(data => {
      dataRef.current = data
      setBadgeData(data)
    })
  }, [])

  async function awardSession(gameId, { peakStreak, isPerfect, questionsAnswered }) {
    const prevLifetimeTotal = dataRef.current.lifetimeQuestions[gameId] ?? 0
    const newLifetimeTotal = prevLifetimeTotal + questionsAnswered
    const earnedIds = computeBadgeAwards({ peakStreak, isPerfect, prevLifetimeTotal, newLifetimeTotal })

    const gameAwards = { ...(dataRef.current.awards[gameId] ?? {}) }
    for (const id of earnedIds) {
      gameAwards[id] = (gameAwards[id] ?? 0) + 1
    }

    const nextData = {
      awards: { ...dataRef.current.awards, [gameId]: gameAwards },
      lifetimeQuestions: { ...dataRef.current.lifetimeQuestions, [gameId]: newLifetimeTotal },
    }
    dataRef.current = nextData
    setBadgeData(nextData)
    await adapter.saveBadgeData(nextData)

    return earnedIds.map(id => BADGE_CATALOG.find(b => b.id === id))
  }

  return { badgeData, awardSession }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/__tests__/useBadges.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useBadges.js src/hooks/__tests__/useBadges.test.js
git commit -m "feat: add useBadges hook"
```

---

## Task 9: `useGameSession` — timer mode and countdown timeout

**Files:**
- Modify: `src/hooks/useGameSession.js` (whole file restructure of timer-related bits; see step-by-step diffs below)
- Modify: `src/hooks/__tests__/useGameSession.test.js` (update mock settings, replace the two `timeLimitMs`/`onTimeout` prop-based tests, add new countdown tests)

**Interfaces:**
- Produces: hook return gains `timerMode`, `timeLimitMs`, `timedOut` and drops `timerDisplayEnabled`. The hook no longer accepts external `timeLimitMs`/`onTimeout` params.
- Consumes: `settings.timerMode`, `settings.timeLimitSeconds` (Task 1).

- [ ] **Step 1: Update the mock settings and remove the two now-invalid tests in `useGameSession.test.js`**

In `src/hooks/__tests__/useGameSession.test.js`, replace every occurrence of `timerDisplayEnabled: true,` (there are two — the `let mockSettings = {...}` initializer around line 12-16 and the `beforeEach` reset around line 49-55) with `timerMode: 'countUp', timeLimitSeconds: 10,`.

Delete these two tests (lines 195-222 in the current file — they test the old external-prop API that this task removes):

```js
  it('calls onTimeout after timeLimitMs ms if not yet locked', () => {
    vi.useFakeTimers()
    const onTimeout = vi.fn()
    const { result } = renderHook(() =>
      useGameSession({ gameId: 'test-game', items, timeLimitMs: 5000, onTimeout })
    )
    act(() => {})
    expect(result.current.current).toBeDefined()

    act(() => { vi.advanceTimersByTime(5001) })
    expect(onTimeout).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('does not call onTimeout if the question was already locked', () => {
    vi.useFakeTimers()
    const onTimeout = vi.fn()
    const { result } = renderHook(() =>
      useGameSession({ gameId: 'test-game', items, timeLimitMs: 5000, onTimeout })
    )
    act(() => {})
    expect(result.current.current).toBeDefined()

    act(() => { result.current.handleChoice(result.current.current.correct) })
    act(() => { vi.advanceTimersByTime(5001) })
    expect(onTimeout).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
```

- [ ] **Step 2: Add the new failing countdown tests**

Add this new `describe` block at the end of the file, before the final closing (after the "how-to-play intro" describe block):

```js
describe('useGameSession — countdown timer', () => {
  it('does not enforce a limit or expose timeLimitMs when timerMode is "countUp"', () => {
    setSettings({ timerMode: 'countUp' })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    expect(result.current.timeLimitMs).toBeUndefined()
  })

  it('exposes timeLimitMs derived from timeLimitSeconds when timerMode is "countdown"', () => {
    setSettings({ timerMode: 'countdown', timeLimitSeconds: 5 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    expect(result.current.timeLimitMs).toBe(5000)
  })

  it('locks the question, marks timedOut, and records a timedOut timing entry when the countdown runs out', async () => {
    vi.useFakeTimers()
    setSettings({ timerMode: 'countdown', timeLimitSeconds: 5 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    act(() => {})
    expect(result.current.current).toBeDefined()

    act(() => { vi.advanceTimersByTime(5001) })

    expect(result.current.locked).toBe(true)
    expect(result.current.timedOut).toBe(true)
    expect(result.current.streak).toBe(0)
    expect(result.current.missed).toHaveLength(1)
    expect(result.current.timings).toHaveLength(1)
    expect(result.current.timings[0]).toEqual(expect.objectContaining({ correct: false, timedOut: true }))
    vi.useRealTimers()
  })

  it('does not time out a question that was already answered correctly', async () => {
    vi.useFakeTimers()
    setSettings({ timerMode: 'countdown', timeLimitSeconds: 5 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    act(() => {})

    act(() => { result.current.handleChoice(result.current.current.correct) })
    act(() => { vi.advanceTimersByTime(5001) })

    expect(result.current.timedOut).toBe(false)
    expect(result.current.timings).toHaveLength(1)
    vi.useRealTimers()
  })

  it('auto-advances after a timeout even in parent-tap feedback mode', async () => {
    vi.useFakeTimers()
    setSettings({ timerMode: 'countdown', timeLimitSeconds: 5, feedbackMode: 'parent-tap', questionsPerSession: 3 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    act(() => {})

    act(() => { vi.advanceTimersByTime(5001) }) // triggers timeout
    expect(result.current.index).toBe(0)

    act(() => { vi.advanceTimersByTime(1501) }) // triggers the auto-advance delay
    expect(result.current.index).toBe(1)
    vi.useRealTimers()
  })

  it('does not auto-advance a normal wrong answer in parent-tap mode (regression guard)', async () => {
    setSettings({ feedbackMode: 'parent-tap' })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())

    const correctItem = result.current.current.correct
    const wrongItem = result.current.current.choices.find(c => c.id !== correctItem.id)
    await act(async () => { result.current.handleChoice(wrongItem) })

    expect(result.current.locked).toBe(true)
    expect(result.current.index).toBe(0)
  })

  it('resets timedOut on advance() to the next question', async () => {
    vi.useFakeTimers()
    setSettings({ timerMode: 'countdown', timeLimitSeconds: 5, questionsPerSession: 3 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    act(() => {})

    act(() => { vi.advanceTimersByTime(5001) })
    expect(result.current.timedOut).toBe(true)
    act(() => { vi.advanceTimersByTime(1501) }) // auto-advance fires
    expect(result.current.timedOut).toBe(false)
    vi.useRealTimers()
  })

  it('respects spaced repetition on a timeout, reinserting the missed item', async () => {
    vi.useFakeTimers()
    setSettings({ timerMode: 'countdown', timeLimitSeconds: 5, spacedRepetitionEnabled: true, questionsPerSession: 4 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    act(() => {})
    const missedCorrectId = result.current.current.correct.id

    act(() => { vi.advanceTimersByTime(5001) }) // timeout
    act(() => { vi.advanceTimersByTime(1501) }) // auto-advance

    const seenCorrectIds = []
    while (!result.current.done) {
      seenCorrectIds.push(result.current.current.correct.id)
      act(() => { result.current.handleChoice(result.current.current.correct) })
      act(() => { result.current.advance() })
    }
    expect(seenCorrectIds.filter(id => id === missedCorrectId).length).toBeGreaterThanOrEqual(1)
    vi.useRealTimers()
  })

  it('currentElapsedMs still ticks up when timerMode is "off"', () => {
    vi.useFakeTimers()
    setSettings({ timerMode: 'off' })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    act(() => {})
    expect(result.current.currentElapsedMs).toBe(0)

    act(() => { vi.advanceTimersByTime(300) })
    expect(result.current.currentElapsedMs).toBeGreaterThanOrEqual(300)
    vi.useRealTimers()
  })
})
```

Also update the existing `'currentElapsedMs ticks up even without a timeLimitMs'` test (around line 224) — it still passes as-is since `timerMode: 'countUp'` is now the default in `mockSettings`, but rename it for clarity: change its title to `'currentElapsedMs ticks up in countUp mode'`.

- [ ] **Step 3: Run tests to verify the new ones fail**

Run: `npx vitest run src/hooks/__tests__/useGameSession.test.js`
Expected: FAIL on the new "countdown timer" tests — `timeLimitMs` is `undefined` in countdown mode, no `timedOut` in return value, etc. (Other tests should still pass since `mockSettings` now has `timerMode`/`timeLimitSeconds` but `useGameSession.js` hasn't changed yet, so `timerDisplayEnabled`'s removal from mocks doesn't affect anything since the hook itself still reads the old key — expect only the new tests to fail at this point, plus the deleted two are gone.)

- [ ] **Step 4: Update `src/hooks/useGameSession.js`**

Change the settings destructure (lines 20-24) from:

```js
  const {
    numChoices, feedbackMode, questionsPerSession, animationsEnabled,
    timerDisplayEnabled, maxTries, hintsEnabled, hintAfterWrongTaps,
    retryCountsAsStreak, spacedRepetitionEnabled, difficultyAutoProgressionEnabled,
  } = settings
```

to:

```js
  const {
    numChoices, feedbackMode, questionsPerSession, animationsEnabled,
    timerMode, timeLimitSeconds, maxTries, hintsEnabled, hintAfterWrongTaps,
    retryCountsAsStreak, spacedRepetitionEnabled, difficultyAutoProgressionEnabled,
  } = settings

  const timeLimitMs = timerMode === 'countdown' ? timeLimitSeconds * 1000 : undefined
```

Change the hook's function signature (line 15) from:

```js
export default function useGameSession({ gameId, items, timeLimitMs, onTimeout }) {
```

to:

```js
export default function useGameSession({ gameId, items }) {
```

Add a new `timedOut` state near the other per-question state (after `offerDifficultyBump`, around line 38):

```js
  const [timedOut,             setTimedOut]            = useState(false)
```

Remove the now-unused `onTimeoutRef` (lines 55 and 58):

```js
  const onTimeoutRef    = useRef(onTimeout)
```
and
```js
  useEffect(() => { onTimeoutRef.current = onTimeout })
```

Add a `handleTimeoutRef` in its place (same spot), since `handleTimeout` (defined below) closes over state setters that would otherwise be stale inside the per-question effect's `setTimeout`:

```js
  const handleTimeoutRef = useRef(null)
```

In the per-question timer effect (lines 86-113), reset `timedOut` alongside the other per-question resets, and change the timer/timeout logic to use `timerMode`/`handleTimeoutRef` instead of `timerDisplayEnabled`/`onTimeoutRef`. Replace the whole effect with:

```js
  // Per-question timer, retry-state reset, and optional timeout
  useEffect(() => {
    if (!queueRef.current[indexRef.current]) return
    questionStartRef.current = Date.now()
    lockedRef.current = false
    wrongAttemptsRef.current = 0
    disabledChoiceIdsRef.current = []
    setLocked(false)
    setWrongAttempts(0)
    setDisabledChoiceIds([])
    setCurrentElapsedMs(0)
    setTimedOut(false)

    const intervalId = (timerMode !== 'off' || timeLimitMs)
      ? setInterval(() => {
          setCurrentElapsedMs(Date.now() - questionStartRef.current)
        }, 100)
      : null

    const timeoutId = timeLimitMs
      ? setTimeout(() => {
          if (!lockedRef.current) handleTimeoutRef.current?.()
        }, timeLimitMs)
      : null

    return () => {
      clearInterval(intervalId)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [index, queue, timeLimitMs, timerMode])
```

Add a `lockAsMissed` helper and a `handleTimeout` function just above `handleChoice` (after the `hintActive` line, before `function handleChoice(item) {`):

```js
  function lockAsMissed(missedItem) {
    streakRef.current = 0
    setStreak(0)
    missedRef.current = [...missedRef.current, missedItem]
    setMissed(missedRef.current)

    if (spacedRepetitionEnabled) {
      pendingReinsertRef.current = { missedIndex: indexRef.current, missedEntry: queueRef.current[indexRef.current] }
    }
  }

  function handleTimeout() {
    if (lockedRef.current) return
    const q = queueRef.current[indexRef.current]
    const attemptNumber = wrongAttemptsRef.current + 1
    const entry = {
      questionIndex: indexRef.current, itemId: q.correct.id, correct: false,
      durationMs: timeLimitMs, attemptNumber, timedOut: true,
    }
    const nextTimings = [...timingsRef.current, entry]
    timingsRef.current = nextTimings
    setTimings(nextTimings)

    lockAsMissed(q.correct)
    setLocked(true)
    lockedRef.current = true
    setTimedOut(true)
    setTimeout(advance, 1500)
  }

  useEffect(() => { handleTimeoutRef.current = handleTimeout })
```

In `handleChoice`, replace the wrong-answer-exhausted block (currently):

```js
      if (nextWrongAttempts >= resolvedMax) {
        streakRef.current = 0
        setStreak(0)
        missedRef.current = [...missedRef.current, current.correct]
        setMissed(missedRef.current)

        if (spacedRepetitionEnabled) {
          // Deferred to advance() rather than applied here: mutating `queue`
          // now would change the per-question effect's `queue` dependency
          // while `index` stays the same, re-running it and immediately
          // undoing the `setLocked(true)` below.
          pendingReinsertRef.current = { missedIndex: indexRef.current, missedEntry: current }
        }

        willLock = true
      }
```

with:

```js
      if (nextWrongAttempts >= resolvedMax) {
        // Deferred reinsertion note (still applies): mutating `queue` now
        // would change the per-question effect's `queue` dependency while
        // `index` stays the same, re-running it and immediately undoing the
        // `setLocked(true)` below — so lockAsMissed only stages the pending
        // reinsertion; advance() applies it.
        lockAsMissed(current.correct)
        willLock = true
      }
```

In `restart()`, add `setTimedOut(false)` alongside the other per-question resets (near `setCurrentElapsedMs(0)`):

```js
    setCurrentElapsedMs(0)
    setTimedOut(false)
    setOfferDifficultyBump(false)
```

Finally, update the hook's return statement — replace:

```js
  return {
    current, index, total: queue.length, locked, disabledChoiceIds, hintActive, selected,
    score, streak, bestStreak, missed, done, feedbackMode, numChoices,
    currentElapsedMs, timings, timerDisplayEnabled, offerDifficultyBump,
    showIntro, introResolved, settingsLoaded: loaded, dontShowAgain, setDontShowAgain,
    handleChoice, advance, restart, acceptDifficultyBump, dismissDifficultyBump, dismissIntro,
  }
```

with:

```js
  return {
    current, index, total: queue.length, locked, disabledChoiceIds, hintActive, selected,
    score, streak, bestStreak, missed, done, feedbackMode, numChoices,
    currentElapsedMs, timings, timerMode, timeLimitMs, timedOut, offerDifficultyBump,
    showIntro, introResolved, settingsLoaded: loaded, dontShowAgain, setDontShowAgain,
    handleChoice, advance, restart, acceptDifficultyBump, dismissDifficultyBump, dismissIntro,
  }
```

- [ ] **Step 5: Run the full hook test suite**

Run: `npx vitest run src/hooks/__tests__/useGameSession.test.js`
Expected: PASS (all tests, including the new countdown block)

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useGameSession.js src/hooks/__tests__/useGameSession.test.js
git commit -m "feat: derive countdown timer and timeout-as-missed behavior from settings"
```

---

## Task 10: `useGameSession` — wire personal best and badges into `finishGame`

**Files:**
- Modify: `src/hooks/useGameSession.js`
- Modify: `src/hooks/__tests__/useGameSession.test.js`

**Interfaces:**
- Produces: hook return gains `personalBestResult` (`{ accuracy, speed } | null`) and `newBadges` (`CatalogEntry[]`, default `[]`).
- Consumes: `usePersonalBest` (Task 7), `useBadges` (Task 8), `settings.speedRecordMinAccuracy` (Task 1).

- [ ] **Step 1: Write the failing tests**

Add mocks for the two new hooks near the top of `useGameSession.test.js` (alongside the existing `vi.mock('../useBestStreak', ...)`):

```js
const mockRecordSession = vi.fn().mockResolvedValue({
  accuracy: { isNewRecord: false, value: 0, previous: null },
  speed: { isNewRecord: false, value: null, previous: null },
})
const mockAwardSession = vi.fn().mockResolvedValue([])

vi.mock('../usePersonalBest', () => ({
  default: () => ({ personalBest: null, recordSession: mockRecordSession }),
}))

vi.mock('../useBadges', () => ({
  default: () => ({ badgeData: { awards: {}, lifetimeQuestions: {} }, awardSession: mockAwardSession }),
}))
```

Reset the two new mocks in `beforeEach` (add to the existing `vi.clearAllMocks()` block — no extra code needed since `clearAllMocks` covers them, but restore their default resolved values since `clearAllMocks` clears mock implementations set via `.mockResolvedValue` on plain `vi.fn()` — add explicitly):

```js
beforeEach(() => {
  vi.clearAllMocks()
  mockLoaded = true
  mockRecordSession.mockResolvedValue({
    accuracy: { isNewRecord: false, value: 0, previous: null },
    speed: { isNewRecord: false, value: null, previous: null },
  })
  mockAwardSession.mockResolvedValue([])
  mockSettings = {
    numChoices: 2, feedbackMode: 'parent-tap', questionsPerSession: 3, animationsEnabled: true,
    timerMode: 'countUp', timeLimitSeconds: 10, speedRecordMinAccuracy: 70,
    maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
    spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false,
    introDismissed: {},
  }
})
```

Add a new `describe` block at the end of the file:

```js
describe('useGameSession — personal best and badges on finish', () => {
  it('calls recordSession with the session summary and minAccuracyPct when the session finishes', async () => {
    setSettings({ questionsPerSession: 2, speedRecordMinAccuracy: 80 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.total).toBe(2))

    for (let i = 0; i < 2; i++) {
      await act(async () => { result.current.handleChoice(result.current.current.correct) })
      await act(async () => { result.current.advance() })
    }

    expect(mockRecordSession).toHaveBeenCalledWith(
      expect.objectContaining({ score: 2, total: 2, minAccuracyPct: 80 })
    )
  })

  it('exposes personalBestResult once the session finishes', async () => {
    mockRecordSession.mockResolvedValue({
      accuracy: { isNewRecord: true, value: 1, previous: { ratio: 0.5, score: 1, total: 2, timestamp: 1 } },
      speed: { isNewRecord: false, value: 900, previous: null },
    })
    setSettings({ questionsPerSession: 2 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.total).toBe(2))

    for (let i = 0; i < 2; i++) {
      await act(async () => { result.current.handleChoice(result.current.current.correct) })
      await act(async () => { result.current.advance() })
    }

    expect(result.current.personalBestResult.accuracy.isNewRecord).toBe(true)
  })

  it('personalBestResult is null before any session has finished', async () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.current).toBeDefined())
    expect(result.current.personalBestResult).toBe(null)
  })

  it('calls awardSession with peakStreak, isPerfect, and questionsAnswered when the session finishes', async () => {
    setSettings({ questionsPerSession: 2 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.total).toBe(2))

    for (let i = 0; i < 2; i++) {
      await act(async () => { result.current.handleChoice(result.current.current.correct) })
      await act(async () => { result.current.advance() })
    }

    expect(mockAwardSession).toHaveBeenCalledWith('test-game', { peakStreak: 2, isPerfect: true, questionsAnswered: 2 })
  })

  it('exposes newBadges resolved from awardSession once the session finishes', async () => {
    mockAwardSession.mockResolvedValue([{ id: 'perfectSession', category: 'perfect', icon: '🎯', nameKey: 'badges.perfectSession.name', descKey: 'badges.perfectSession.desc' }])
    setSettings({ questionsPerSession: 2 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.total).toBe(2))

    for (let i = 0; i < 2; i++) {
      await act(async () => { result.current.handleChoice(result.current.current.correct) })
      await act(async () => { result.current.advance() })
    }

    expect(result.current.newBadges.map(b => b.id)).toEqual(['perfectSession'])
  })

  it('newBadges defaults to an empty array before any session has finished', () => {
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    expect(result.current.newBadges).toEqual([])
  })

  it('restart() clears personalBestResult and newBadges', async () => {
    mockAwardSession.mockResolvedValue([{ id: 'perfectSession', category: 'perfect', icon: '🎯', nameKey: 'x', descKey: 'y' }])
    mockRecordSession.mockResolvedValue({
      accuracy: { isNewRecord: true, value: 1, previous: { ratio: 0.5, score: 1, total: 2, timestamp: 1 } },
      speed: { isNewRecord: false, value: null, previous: null },
    })
    setSettings({ questionsPerSession: 2 })
    const { result } = renderHook(() => useGameSession({ gameId: 'test-game', items }))
    await waitFor(() => expect(result.current.total).toBe(2))

    for (let i = 0; i < 2; i++) {
      await act(async () => { result.current.handleChoice(result.current.current.correct) })
      await act(async () => { result.current.advance() })
    }
    expect(result.current.newBadges).toHaveLength(1)

    await act(async () => { result.current.restart() })

    expect(result.current.personalBestResult).toBe(null)
    expect(result.current.newBadges).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/__tests__/useGameSession.test.js`
Expected: FAIL — `usePersonalBest`/`useBadges` mocks exist but `useGameSession.js` doesn't call them yet, so `personalBestResult`/`newBadges` are `undefined`.

- [ ] **Step 3: Wire the hooks into `useGameSession.js`**

Add the two new imports at the top of the file (alongside `useBestStreak`):

```js
import usePersonalBest from './usePersonalBest'
import useBadges from './useBadges'
```

Call both hooks alongside the existing `useBestStreak` call:

```js
  const { bestStreak, recordStreak } = useBestStreak(gameId)
  const { personalBest, recordSession: recordPersonalBestSession } = usePersonalBest(gameId)
  const { awardSession } = useBadges()
```

Destructure the new setting alongside the others:

```js
  const {
    numChoices, feedbackMode, questionsPerSession, animationsEnabled,
    timerMode, timeLimitSeconds, maxTries, hintsEnabled, hintAfterWrongTaps,
    retryCountsAsStreak, spacedRepetitionEnabled, difficultyAutoProgressionEnabled,
    speedRecordMinAccuracy,
  } = settings
```

Add new state near `offerDifficultyBump`:

```js
  const [personalBestResult,  setPersonalBestResult]  = useState(null)
  const [newBadges,           setNewBadges]            = useState([])
```

Update `finishGame()` — replace:

```js
  async function finishGame() {
    const result = {
      gameId,
      score:      scoreRef.current,
      total:      queueRef.current.length,
      date:       new Date().toISOString().split('T')[0],
      timestamp:  Date.now(),
      timings:    timingsRef.current,
      peakStreak: peakStreakRef.current,
    }
    await addScore(result)

    if (
      difficultyAutoProgressionEnabled &&
      scoreRef.current === queueRef.current.length &&
      numChoices < 4
    ) {
      setOfferDifficultyBump(true)
    }

    setDone(true)
  }
```

with:

```js
  async function finishGame() {
    const total = queueRef.current.length
    const isPerfect = scoreRef.current === total
    const result = {
      gameId,
      score:      scoreRef.current,
      total,
      date:       new Date().toISOString().split('T')[0],
      timestamp:  Date.now(),
      timings:    timingsRef.current,
      peakStreak: peakStreakRef.current,
    }
    await addScore(result)

    const bestResult = await recordPersonalBestSession({
      score: scoreRef.current, total, timings: timingsRef.current, minAccuracyPct: speedRecordMinAccuracy,
    })
    setPersonalBestResult(bestResult)

    const earnedBadges = await awardSession(gameId, {
      peakStreak: peakStreakRef.current, isPerfect, questionsAnswered: total,
    })
    setNewBadges(earnedBadges)

    if (difficultyAutoProgressionEnabled && isPerfect && numChoices < 4) {
      setOfferDifficultyBump(true)
    }

    setDone(true)
  }
```

Add resets to `restart()` alongside `setOfferDifficultyBump(false)`:

```js
    setPersonalBestResult(null)
    setNewBadges([])
    setOfferDifficultyBump(false)
```

Update the hook's return statement to expose the two new fields:

```js
  return {
    current, index, total: queue.length, locked, disabledChoiceIds, hintActive, selected,
    score, streak, bestStreak, missed, done, feedbackMode, numChoices,
    currentElapsedMs, timings, timerMode, timeLimitMs, timedOut, offerDifficultyBump,
    personalBestResult, newBadges,
    showIntro, introResolved, settingsLoaded: loaded, dontShowAgain, setDontShowAgain,
    handleChoice, advance, restart, acceptDifficultyBump, dismissDifficultyBump, dismissIntro,
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/__tests__/useGameSession.test.js`
Expected: PASS (full file, including all prior describe blocks)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useGameSession.js src/hooks/__tests__/useGameSession.test.js
git commit -m "feat: wire personal best and badge awards into useGameSession finishGame"
```

---

## Task 11: `Timer` component — countdown mode

**Files:**
- Modify: `src/components/Timer.jsx`
- Modify: `src/components/Timer.css`
- Modify: `src/components/__tests__/Timer.test.jsx`
- Modify: `src/components/Timer.stories.jsx`
- Modify: `src/i18n/en.json` (new `timerTimeUpAriaLabel` string, optional distinct label)

**Interfaces:**
- Produces: `Timer({ elapsedMs, mode = 'countUp', limitMs })` — in `'countdown'` mode, counts down from `limitMs` to 0 and adds a `timer--up` class at zero. Consumed by Task 15 (both games).
- Consumes: nothing new.

- [ ] **Step 1: Write the failing tests**

Add to `src/components/__tests__/Timer.test.jsx` (after the existing tests, before the final closing `})`):

```js
  it('counts down from limitMs in countdown mode', () => {
    render(<Timer elapsedMs={2000} mode="countdown" limitMs={5000} />)
    expect(screen.getByText('3.0s')).toBeInTheDocument()
  })

  it('clamps the countdown display at 0.0s rather than going negative', () => {
    render(<Timer elapsedMs={6000} mode="countdown" limitMs={5000} />)
    expect(screen.getByText('0.0s')).toBeInTheDocument()
  })

  it('defaults to countUp behavior when mode is omitted', () => {
    render(<Timer elapsedMs={1200} />)
    expect(screen.getByText('1.2s')).toBeInTheDocument()
  })

  it('has no accessibility violations in countdown mode', async () => {
    const { container } = render(<Timer elapsedMs={1000} mode="countdown" limitMs={5000} />)
    expect(await axe(container)).toHaveNoViolations()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/Timer.test.jsx`
Expected: FAIL — countdown tests show `5.0s`/negative-derived values instead of the expected countdown values (component doesn't accept `mode`/`limitMs` yet).

- [ ] **Step 3: Update `src/components/Timer.jsx`**

Replace the whole file:

```jsx
import { useTranslation } from 'react-i18next'
import './Timer.css'

export default function Timer({ elapsedMs, mode = 'countUp', limitMs }) {
  const { t } = useTranslation()
  const displayMs = mode === 'countdown' ? Math.max(0, limitMs - elapsedMs) : elapsedMs
  const seconds = (displayMs / 1000).toFixed(1)
  const isTimeUp = mode === 'countdown' && displayMs === 0

  return (
    <div className={`timer${isTimeUp ? ' timer--up' : ''}`} aria-label={t('common.timerAriaLabel', { seconds })}>
      <span className="timer__icon" aria-hidden="true">⏱️</span>
      <span className="timer__value">{seconds}s</span>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/__tests__/Timer.test.jsx`
Expected: PASS (all tests, existing + new)

- [ ] **Step 5: Add a `.timer--up` visual accent to `Timer.css`**

Append to `src/components/Timer.css`:

```css
.timer--up {
  color: var(--color-error);
}

.timer--up .timer__icon {
  animation: timer-pulse 0.4s ease-in-out infinite;
}
```

- [ ] **Step 6: Add countdown Storybook variants to `Timer.stories.jsx`**

Replace the file:

```jsx
import Timer from './Timer'

export default {
  title: 'Components/Timer',
  component: Timer,
}

export const Start    = { args: { elapsedMs: 0 } }
export const MidTick   = { args: { elapsedMs: 4700 } }
export const CountdownMidway = { args: { elapsedMs: 2000, mode: 'countdown', limitMs: 5000 } }
export const CountdownTimeUp = { args: { elapsedMs: 5000, mode: 'countdown', limitMs: 5000 } }
```

- [ ] **Step 7: Commit**

```bash
git add src/components/Timer.jsx src/components/Timer.css src/components/__tests__/Timer.test.jsx src/components/Timer.stories.jsx
git commit -m "feat: add countdown mode to Timer component"
```

---

## Task 12: `GameResults` — personal-best and badge banners

**Files:**
- Modify: `src/components/GameResults.jsx`
- Modify: `src/components/GameResults.css`
- Modify: `src/components/__tests__/GameResults.test.jsx`
- Modify: `src/components/GameResults.stories.jsx`
- Modify: `src/i18n/en.json` (new `common.newAccuracyRecord`, `common.newSpeedRecord`, `common.newBadgeAnnounce`, `common.timeUp`)

**Interfaces:**
- Produces: `GameResults` gains props `personalBestResult` (default `null`) and `newBadges` (default `[]`).
- Consumes: `personalBestResult`/`newBadges` shapes from Task 10; `BADGE_CATALOG` entry shape from Task 4 (icon/nameKey).

- [ ] **Step 1: Add the new i18n strings to `src/i18n/en.json`**

In the `"common"` block, add (after `"gameIntroDontShowAgain"`):

```json
    "timeUp": "⏰ Time's up!",
    "newAccuracyRecord": "🏆 New accuracy record! {{score}}/{{total}} (was {{prevScore}}/{{prevTotal}})",
    "newSpeedRecord": "⚡ New speed record! {{seconds}}s avg (was {{prevSeconds}}s avg)",
    "newBadgeAnnounce": "🎉 New Badge!"
```

- [ ] **Step 2: Write the failing tests**

Add to `src/components/__tests__/GameResults.test.jsx` (before the final closing `})`):

```js
  it('does not show a personal-best banner by default', () => {
    render(<GameResults score={3} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem} />)
    expect(screen.queryByText(/new accuracy record/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/new speed record/i)).not.toBeInTheDocument()
  })

  it('shows the accuracy-record banner with previous score/total when isNewRecord is true', () => {
    render(
      <GameResults
        score={9} total={10} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem}
        personalBestResult={{
          accuracy: { isNewRecord: true, value: 0.9, previous: { ratio: 0.8, score: 8, total: 10, timestamp: 1 } },
          speed: { isNewRecord: false, value: null, previous: null },
        }}
      />
    )
    expect(screen.getByText('🏆 New accuracy record! 9/10 (was 8/10)')).toBeInTheDocument()
  })

  it('shows the speed-record banner with previous seconds when isNewRecord is true', () => {
    render(
      <GameResults
        score={9} total={10} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem}
        personalBestResult={{
          accuracy: { isNewRecord: false, value: 0.9, previous: null },
          speed: { isNewRecord: true, value: 2100, previous: { avgMs: 2600, timestamp: 1 } },
        }}
      />
    )
    expect(screen.getByText('⚡ New speed record! 2.1s avg (was 2.6s avg)')).toBeInTheDocument()
  })

  it('shows both banners at once when both records are broken', () => {
    render(
      <GameResults
        score={10} total={10} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem}
        personalBestResult={{
          accuracy: { isNewRecord: true, value: 1, previous: { ratio: 0.9, score: 9, total: 10, timestamp: 1 } },
          speed: { isNewRecord: true, value: 1000, previous: { avgMs: 1500, timestamp: 1 } },
        }}
      />
    )
    expect(screen.getByText(/new accuracy record/i)).toBeInTheDocument()
    expect(screen.getByText(/new speed record/i)).toBeInTheDocument()
  })

  it('does not show any badge announcement by default', () => {
    render(<GameResults score={3} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem} />)
    expect(screen.queryByText(/new badge/i)).not.toBeInTheDocument()
  })

  it('shows a line per newly earned badge', () => {
    render(
      <GameResults
        score={5} total={5} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem}
        newBadges={[
          { id: 'hotStreak', icon: '🔥', nameKey: 'badges.hotStreak.name' },
          { id: 'perfectSession', icon: '🎯', nameKey: 'badges.perfectSession.name' },
        ]}
      />
    )
    expect(screen.getByText('🎉 New Badge! 🔥 Hot Streak')).toBeInTheDocument()
    expect(screen.getByText('🎉 New Badge! 🎯 Perfect Session')).toBeInTheDocument()
  })

  it('has no accessibility violations with all banners present', async () => {
    const { container } = render(
      <GameResults
        score={10} total={10} missed={[]} onPlayAgain={vi.fn()} onHome={vi.fn()} renderMissedItem={renderMissedItem}
        personalBestResult={{
          accuracy: { isNewRecord: true, value: 1, previous: { ratio: 0.9, score: 9, total: 10, timestamp: 1 } },
          speed: { isNewRecord: true, value: 1000, previous: { avgMs: 1500, timestamp: 1 } },
        }}
        newBadges={[{ id: 'perfectSession', icon: '🎯', nameKey: 'badges.perfectSession.name' }]}
      />
    )
    expect(await axe(container)).toHaveNoViolations()
  })
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/GameResults.test.jsx`
Expected: FAIL — `GameResults` doesn't accept/render `personalBestResult`/`newBadges` yet.

- [ ] **Step 4: Update `src/components/GameResults.jsx`**

Replace the whole file:

```jsx
import { useTranslation } from 'react-i18next'
import './GameResults.css'

export default function GameResults({
  score, total, missed, onPlayAgain, onHome, renderMissedItem,
  offerDifficultyBump = false, numChoices, onAcceptDifficultyBump, onDismissDifficultyBump,
  personalBestResult = null, newBadges = [],
}) {
  const { t } = useTranslation()
  return (
    <div className="results">
      <div className="results__emoji">{missed.length === 0 ? '🎉' : '⭐'}</div>
      <div className="results__score">{score} / {total}</div>
      <div className="results__label">{t('common.scoreLabel', { score, total })}</div>

      {personalBestResult?.accuracy?.isNewRecord && (
        <div className="results__record">
          {t('common.newAccuracyRecord', {
            score, total,
            prevScore: personalBestResult.accuracy.previous.score,
            prevTotal: personalBestResult.accuracy.previous.total,
          })}
        </div>
      )}

      {personalBestResult?.speed?.isNewRecord && (
        <div className="results__record">
          {t('common.newSpeedRecord', {
            seconds: (personalBestResult.speed.value / 1000).toFixed(1),
            prevSeconds: (personalBestResult.speed.previous.avgMs / 1000).toFixed(1),
          })}
        </div>
      )}

      {newBadges.map(badge => (
        <div key={badge.id} className="results__badge-award">
          {t('common.newBadgeAnnounce')} {badge.icon} {t(badge.nameKey)}
        </div>
      ))}

      {missed.length === 0 ? (
        <div className="results__label">{t('common.perfectRun')}</div>
      ) : (
        <div>
          <div className="results__missed-heading">{t('common.missedHeading')}</div>
          <ul className="results__missed">
            {missed.map((item, i) => (
              <li key={`${item.id}-${i}`}>{renderMissedItem(item)}</li>
            ))}
          </ul>
        </div>
      )}

      {offerDifficultyBump && (
        <div className="results__difficulty-offer">
          <div className="results__label">{t('common.difficultyOfferHeading', { count: numChoices + 1 })}</div>
          <div className="results__actions">
            <button className="results__btn results__btn--play" onClick={onAcceptDifficultyBump}>
              {t('common.difficultyOfferAccept')}
            </button>
            <button className="results__btn results__btn--home" onClick={onDismissDifficultyBump}>
              {t('common.difficultyOfferDismiss')}
            </button>
          </div>
        </div>
      )}

      <div className="results__actions">
        <button className="results__btn results__btn--play" onClick={onPlayAgain}>{t('common.playAgain')}</button>
        <button className="results__btn results__btn--home" onClick={onHome}>{t('common.home')}</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/__tests__/GameResults.test.jsx`
Expected: PASS (all tests, existing + new)

- [ ] **Step 6: Add minimal CSS for the new banners in `GameResults.css`**

Append:

```css
.results__record { font-weight: 700; color: var(--color-teal-dark); }
.results__badge-award { font-weight: 700; }
```

- [ ] **Step 7: Add Storybook variants to `GameResults.stories.jsx`**

Append after `PerfectWithDifficultyOffer`:

```jsx
export const WithPersonalBestRecords = {
  args: {
    score: 10, total: 10, missed: [], onPlayAgain: () => {}, onHome: () => {}, renderMissedItem,
    personalBestResult: {
      accuracy: { isNewRecord: true, value: 1, previous: { ratio: 0.9, score: 9, total: 10, timestamp: 1 } },
      speed: { isNewRecord: true, value: 1000, previous: { avgMs: 1500, timestamp: 1 } },
    },
  },
}

export const WithNewBadges = {
  args: {
    score: 5, total: 5, missed: [], onPlayAgain: () => {}, onHome: () => {}, renderMissedItem,
    newBadges: [
      { id: 'hotStreak', icon: '🔥', nameKey: 'badges.hotStreak.name' },
      { id: 'perfectSession', icon: '🎯', nameKey: 'badges.perfectSession.name' },
    ],
  },
}
```

- [ ] **Step 8: Commit**

```bash
git add src/components/GameResults.jsx src/components/GameResults.css src/components/__tests__/GameResults.test.jsx src/components/GameResults.stories.jsx src/i18n/en.json
git commit -m "feat: show personal-best and new-badge banners on GameResults"
```

---

## Task 13: `BadgeGallery` component

**Files:**
- Create: `src/components/BadgeGallery.jsx`
- Create: `src/components/BadgeGallery.css`
- Create: `src/components/__tests__/BadgeGallery.test.jsx`
- Create: `src/components/BadgeGallery.stories.jsx`

**Interfaces:**
- Produces: `BadgeGallery({ manifests, badgeData })` — renders every catalog badge per game, locked (count 0) or earned (`×count` when count > 1). Consumed by Task 14 (`AdminPage` Badges tab).
- Consumes: `BADGE_CATALOG` (Task 4), `badgeData` shape from Task 3/8.

- [ ] **Step 1: Write the failing tests**

```jsx
// src/components/__tests__/BadgeGallery.test.jsx
import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { axe } from 'jest-axe'
import BadgeGallery from '../BadgeGallery'

const manifests = [
  { id: 'animal-sounds', name: 'Animal Sounds' },
  { id: 'color-match', name: 'Color Match' },
]

describe('BadgeGallery', () => {
  it('renders a heading for each game', () => {
    render(<BadgeGallery manifests={manifests} badgeData={{ awards: {}, lifetimeQuestions: {} }} />)
    expect(screen.getByText('Animal Sounds')).toBeInTheDocument()
    expect(screen.getByText('Color Match')).toBeInTheDocument()
  })

  it('renders every catalog badge for each game', () => {
    render(<BadgeGallery manifests={manifests} badgeData={{ awards: {}, lifetimeQuestions: {} }} />)
    const animalSection = screen.getByText('Animal Sounds').closest('.badge-gallery__game')
    expect(within(animalSection).getByText('Hot Streak')).toBeInTheDocument()
    expect(within(animalSection).getByText('Grand Master')).toBeInTheDocument()
  })

  it('shows a locked label for a badge with a count of 0', () => {
    render(<BadgeGallery manifests={manifests} badgeData={{ awards: {}, lifetimeQuestions: {} }} />)
    const animalSection = screen.getByText('Animal Sounds').closest('.badge-gallery__game')
    const hotStreakBadge = within(animalSection).getByText('Hot Streak').closest('.badge-gallery__badge')
    expect(within(hotStreakBadge).getByText('Locked')).toBeInTheDocument()
  })

  it('shows no count suffix for a badge earned exactly once', () => {
    render(<BadgeGallery manifests={manifests} badgeData={{ awards: { 'animal-sounds': { hotStreak: 1 } }, lifetimeQuestions: {} }} />)
    const animalSection = screen.getByText('Animal Sounds').closest('.badge-gallery__game')
    const hotStreakBadge = within(animalSection).getByText('Hot Streak').closest('.badge-gallery__badge')
    expect(within(hotStreakBadge).queryByText(/Locked/)).not.toBeInTheDocument()
    expect(within(hotStreakBadge).queryByText(/×/)).not.toBeInTheDocument()
  })

  it('shows a ×N count suffix for a badge earned more than once', () => {
    render(<BadgeGallery manifests={manifests} badgeData={{ awards: { 'animal-sounds': { hotStreak: 3 } }, lifetimeQuestions: {} }} />)
    const animalSection = screen.getByText('Animal Sounds').closest('.badge-gallery__game')
    const hotStreakBadge = within(animalSection).getByText('Hot Streak').closest('.badge-gallery__badge')
    expect(within(hotStreakBadge).getByText('×3')).toBeInTheDocument()
  })

  it('tracks badge counts independently per game', () => {
    render(<BadgeGallery manifests={manifests} badgeData={{ awards: { 'animal-sounds': { hotStreak: 2 } }, lifetimeQuestions: {} }} />)
    const colorSection = screen.getByText('Color Match').closest('.badge-gallery__game')
    const hotStreakBadge = within(colorSection).getByText('Hot Streak').closest('.badge-gallery__badge')
    expect(within(hotStreakBadge).getByText('Locked')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<BadgeGallery manifests={manifests} badgeData={{ awards: { 'animal-sounds': { hotStreak: 2 } }, lifetimeQuestions: {} }} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/BadgeGallery.test.jsx`
Expected: FAIL — cannot find module `../BadgeGallery`

- [ ] **Step 3: Create `src/components/BadgeGallery.jsx`**

```jsx
import { useTranslation } from 'react-i18next'
import { BADGE_CATALOG } from '../lib/badges'
import './BadgeGallery.css'

export default function BadgeGallery({ manifests, badgeData }) {
  const { t } = useTranslation()
  return (
    <div className="badge-gallery">
      {manifests.map(game => (
        <div key={game.id} className="badge-gallery__game">
          <h3 className="badge-gallery__game-name">{game.name}</h3>
          <div className="badge-gallery__badges">
            {BADGE_CATALOG.map(badge => {
              const count = badgeData.awards[game.id]?.[badge.id] ?? 0
              const earned = count > 0
              return (
                <div
                  key={badge.id}
                  className={`badge-gallery__badge${earned ? '' : ' badge-gallery__badge--locked'}`}
                >
                  <span className="badge-gallery__icon" aria-hidden="true">{badge.icon}</span>
                  <span className="badge-gallery__name">{t(badge.nameKey)}</span>
                  {earned && count > 1 && <span className="badge-gallery__count">×{count}</span>}
                  {!earned && <span className="badge-gallery__locked-label">{t('badges.locked')}</span>}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/__tests__/BadgeGallery.test.jsx`
Expected: PASS (7 tests)

- [ ] **Step 5: Add `src/components/BadgeGallery.css`**

```css
.badge-gallery__game { margin-bottom: 24px; }
.badge-gallery__game-name { font-size: 16px; font-weight: 700; margin-bottom: 10px; }

.badge-gallery__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.badge-gallery__badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 14px;
  border-radius: var(--radius-button);
  border: 2px solid var(--color-aqua);
  min-width: 96px;
  text-align: center;
}

.badge-gallery__badge--locked {
  opacity: 0.45;
  border-color: var(--color-text-muted);
}

.badge-gallery__icon { font-size: 28px; }
.badge-gallery__name { font-size: 13px; font-weight: 700; }
.badge-gallery__count { font-size: 12px; font-weight: 700; color: var(--color-teal-dark); }
.badge-gallery__locked-label { font-size: 11px; color: var(--color-text-muted); }
```

- [ ] **Step 6: Add `src/components/BadgeGallery.stories.jsx`**

```jsx
import BadgeGallery from './BadgeGallery'

const manifests = [
  { id: 'animal-sounds', name: 'Animal Sounds' },
  { id: 'color-match', name: 'Color Match' },
]

export default {
  title: 'Components/BadgeGallery',
  component: BadgeGallery,
}

export const AllLocked = {
  args: { manifests, badgeData: { awards: {}, lifetimeQuestions: {} } },
}

export const MixedProgress = {
  args: {
    manifests,
    badgeData: {
      awards: {
        'animal-sounds': { hotStreak: 3, onFire: 1, perfectSession: 2, gettingStarted: 1 },
        'color-match': { hotStreak: 1 },
      },
      lifetimeQuestions: { 'animal-sounds': 62, 'color-match': 10 },
    },
  },
}
```

- [ ] **Step 7: Commit**

```bash
git add src/components/BadgeGallery.jsx src/components/BadgeGallery.css src/components/__tests__/BadgeGallery.test.jsx src/components/BadgeGallery.stories.jsx
git commit -m "feat: add BadgeGallery component"
```

---

## Task 14: `AdminPage` — timer radio row, speed-threshold section, Badges tab

**Files:**
- Modify: `src/admin/AdminPage.jsx`
- Modify: `src/admin/AdminPage.css` (only if a new rule is needed — likely none, existing `admin__radios`/`admin__section` cover it)
- Modify: `src/admin/__tests__/AdminPage.test.jsx`
- Modify: `src/i18n/en.json` (admin namespace: remove `timerDisplay*`, add `timer*`, `speedRecordThreshold*`, `tabBadges`, `badgesHeading`)
- Modify: `e2e/admin.spec.js` (the existing `'new engine settings persist after reload'` test references the old "Timer Display" section and will break)

**Interfaces:**
- Consumes: `useBadges` (Task 8), `BadgeGallery` (Task 13), `timerMode`/`timeLimitSeconds`/`speedRecordMinAccuracy` settings (Task 1).

- [ ] **Step 1: Update `src/i18n/en.json`'s `admin` namespace**

Replace:

```json
    "timerDisplayHeading": "Timer Display",
    "timerDisplayOn": "⏱️ On",
    "timerDisplayOff": "Off",
```

with:

```json
    "timerHeading": "Timer",
    "timerOff": "Off",
    "timerCountUp": "⏱️ Show timer",
    "timerCountdown": "Answer within {{seconds}}s",
    "speedRecordThresholdHeading": "Speed Record Threshold",
    "speedRecordThresholdHint": "Minimum session accuracy required for a new average-speed record to count.",
```

Add two more keys at the end of the `admin` block (after `"introReplayButton"`):

```json
    "tabBadges": "Badges",
    "badgesHeading": "Badges"
```

- [ ] **Step 2: Write the failing tests**

Update the mock settings defaults near the top of `src/admin/__tests__/AdminPage.test.jsx` — replace:

```js
const mockSettingsDefaults = {
  numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 10, childName: '', animationsEnabled: true,
  timerDisplayEnabled: true, maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2,
  retryCountsAsStreak: true, spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false,
}
```

with:

```js
const mockSettingsDefaults = {
  numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 10, childName: '', animationsEnabled: true,
  timerMode: 'countUp', timeLimitSeconds: 10, speedRecordMinAccuracy: 70,
  maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2,
  retryCountsAsStreak: true, spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false,
}
```

Add a `useBadges` mock near the existing `useScores` mock:

```js
vi.mock('../../hooks/useBadges', () => ({
  default: () => ({
    badgeData: {
      awards: { 'animal-sounds': { hotStreak: 2 } },
      lifetimeQuestions: { 'animal-sounds': 45 },
    },
  }),
}))
```

Add new tests (before the file's final closing):

```js
  it('renders the timer radio row with 6 options', () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    const timerSection = screen.getByRole('heading', { name: 'Timer' }).closest('.admin__section')
    expect(within(timerSection).getByRole('radio', { name: 'Off' })).toBeInTheDocument()
    expect(within(timerSection).getByRole('radio', { name: '⏱️ Show timer' })).toBeInTheDocument()
    expect(within(timerSection).getByRole('radio', { name: 'Answer within 5s' })).toBeInTheDocument()
    expect(within(timerSection).getByRole('radio', { name: 'Answer within 10s' })).toBeInTheDocument()
    expect(within(timerSection).getByRole('radio', { name: 'Answer within 15s' })).toBeInTheDocument()
    expect(within(timerSection).getByRole('radio', { name: 'Answer within 20s' })).toBeInTheDocument()
  })

  it('selecting a countdown option updates both timerMode and timeLimitSeconds', async () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    const timerSection = screen.getByRole('heading', { name: 'Timer' }).closest('.admin__section')
    await userEvent.click(within(timerSection).getByRole('radio', { name: 'Answer within 15s' }))
    expect(mockUpdateSetting).toHaveBeenCalledWith('timerMode', 'countdown')
    expect(mockUpdateSetting).toHaveBeenCalledWith('timeLimitSeconds', 15)
  })

  it('selecting "Off" sets timerMode to off', async () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    const timerSection = screen.getByRole('heading', { name: 'Timer' }).closest('.admin__section')
    await userEvent.click(within(timerSection).getByRole('radio', { name: 'Off' }))
    expect(mockUpdateSetting).toHaveBeenCalledWith('timerMode', 'off')
  })

  it('renders the speed record threshold radio row', () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    const section = screen.getByRole('heading', { name: 'Speed Record Threshold' }).closest('.admin__section')
    expect(within(section).getByRole('radio', { name: '70%' })).toBeInTheDocument()
    expect(within(section).getByRole('radio', { name: '100%' })).toBeInTheDocument()
  })

  it('selecting a speed threshold option calls updateSetting', async () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    const section = screen.getByRole('heading', { name: 'Speed Record Threshold' }).closest('.admin__section')
    await userEvent.click(within(section).getByRole('radio', { name: '90%' }))
    expect(mockUpdateSetting).toHaveBeenCalledWith('speedRecordMinAccuracy', 90)
  })

  it('renders a Badges tab', () => {
    render(<MemoryRouter><AdminPage manifests={manifestsFixture} /></MemoryRouter>)
    expect(screen.getByRole('tab', { name: 'Badges' })).toBeInTheDocument()
  })

  it('shows the badge gallery when the Badges tab is active', async () => {
    render(<MemoryRouter><AdminPage manifests={manifestsFixture} /></MemoryRouter>)
    await userEvent.click(screen.getByRole('tab', { name: 'Badges' }))
    expect(screen.getByText('Animal Sounds')).toBeInTheDocument()
    expect(screen.getByText('×2')).toBeInTheDocument() // hotStreak count for animal-sounds
  })
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/admin/__tests__/AdminPage.test.jsx`
Expected: FAIL — no "Timer" heading (still says "Timer Display"), no Badges tab, `useBadges` not imported.

- [ ] **Step 4: Update `src/admin/AdminPage.jsx`**

Add the import near the other hook imports:

```js
import useBadges from '../hooks/useBadges'
import BadgeGallery from '../components/BadgeGallery'
```

Call the hook alongside `useSettings`/`useScores`:

```js
  const { badgeData } = useBadges()
```

Add `'badges'` to the `tabs` array:

```js
  const tabs = [
    { id: 'settings', label: t('admin.tabSettings') },
    { id: 'games',    label: t('admin.tabGames') },
    { id: 'badges',   label: t('admin.tabBadges') },
    { id: 'history',  label: t('admin.tabHistory') },
  ]
```

Replace the "Timer Display" section (currently):

```jsx
            <div className="admin__section">
              <h2>{t('admin.timerDisplayHeading')}</h2>
              <div className="admin__toggle">
                <button
                  className={`admin__toggle-btn${settings.timerDisplayEnabled ? ' active' : ''}`}
                  onClick={() => updateSetting('timerDisplayEnabled', true)}
                >
                  {t('admin.timerDisplayOn')}
                </button>
                <button
                  className={`admin__toggle-btn${!settings.timerDisplayEnabled ? ' active' : ''}`}
                  onClick={() => updateSetting('timerDisplayEnabled', false)}
                >
                  {t('admin.timerDisplayOff')}
                </button>
              </div>
            </div>
```

with:

```jsx
            <div className="admin__section">
              <h2>{t('admin.timerHeading')}</h2>
              <div className="admin__radios">
                <label className={`admin__radio-label${settings.timerMode === 'off' ? ' selected' : ''}`}>
                  <input
                    type="radio"
                    name="timerMode"
                    checked={settings.timerMode === 'off'}
                    onChange={() => updateSetting('timerMode', 'off')}
                    aria-label={t('admin.timerOff')}
                  />
                  {t('admin.timerOff')}
                </label>
                <label className={`admin__radio-label${settings.timerMode === 'countUp' ? ' selected' : ''}`}>
                  <input
                    type="radio"
                    name="timerMode"
                    checked={settings.timerMode === 'countUp'}
                    onChange={() => updateSetting('timerMode', 'countUp')}
                    aria-label={t('admin.timerCountUp')}
                  />
                  {t('admin.timerCountUp')}
                </label>
                {[5, 10, 15, 20].map(n => (
                  <label
                    key={n}
                    className={`admin__radio-label${settings.timerMode === 'countdown' && settings.timeLimitSeconds === n ? ' selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="timerMode"
                      checked={settings.timerMode === 'countdown' && settings.timeLimitSeconds === n}
                      onChange={() => {
                        updateSetting('timerMode', 'countdown')
                        updateSetting('timeLimitSeconds', n)
                      }}
                      aria-label={t('admin.timerCountdown', { seconds: n })}
                    />
                    {t('admin.timerCountdown', { seconds: n })}
                  </label>
                ))}
              </div>
            </div>

            <div className="admin__section">
              <h2>{t('admin.speedRecordThresholdHeading')}</h2>
              <p className="admin__hint">{t('admin.speedRecordThresholdHint')}</p>
              <div className="admin__radios">
                {[70, 75, 80, 85, 90, 95, 100].map(pct => (
                  <label
                    key={pct}
                    className={`admin__radio-label${settings.speedRecordMinAccuracy === pct ? ' selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="speedRecordMinAccuracy"
                      checked={settings.speedRecordMinAccuracy === pct}
                      onChange={() => updateSetting('speedRecordMinAccuracy', pct)}
                      aria-label={`${pct}%`}
                    />
                    {pct}%
                  </label>
                ))}
              </div>
            </div>
```

Add the new `'badges'` tab panel, after the `'games'` tab panel and before the `'history'` tab panel:

```jsx
        {activeTab === 'badges' && (
          <div className="admin__section">
            <h2>{t('admin.badgesHeading')}</h2>
            <BadgeGallery manifests={manifests} badgeData={badgeData} />
          </div>
        )}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/admin/__tests__/AdminPage.test.jsx`
Expected: PASS (full file, existing + new tests)

- [ ] **Step 6: Fix the existing e2e test that references the old Timer Display section**

In `e2e/admin.spec.js`, replace the `'new engine settings persist after reload'` test's timer-section block:

```js
  // Scope to the "Timer Display" section — "Off" is rendered by six different
  // toggle sections on this page, so an unscoped button lookup is ambiguous.
  const timerSection = page.getByRole('heading', { name: 'Timer Display' }).locator('xpath=..')
  await timerSection.getByRole('button', { name: 'Off', exact: true }).click()
  await timerSection.getByRole('button', { name: '⏱️ On' }).click() // force a write back to true
```

with:

```js
  // Scope to the "Timer" section — a countdown radio's label ("Answer within
  // 10s") is unique across the page, so no ambiguity guard is needed here,
  // but scoping keeps the pattern consistent with the section above.
  const timerSection = page.getByRole('heading', { name: 'Timer' }).locator('xpath=..')
  await timerSection.getByRole('radio', { name: 'Answer within 10s' }).check()
  await timerSection.getByRole('radio', { name: '⏱️ Show timer' }).check() // force a write back to countUp
```

Add a new assertion after the existing `expect(...).toBeChecked()` line for Retry Attempts, verifying the countdown selection round-trips too — insert before the final `await page.reload()`/assertion pairing is unnecessary since the test already reloads once; instead add this new test to the same file:

```js
test('timer countdown setting persists after reload', async ({ page }) => {
  await page.goto('/admin')
  const timerSection = page.getByRole('heading', { name: 'Timer' }).locator('xpath=..')
  await timerSection.getByRole('radio', { name: 'Answer within 15s' }).check()

  await page.reload()

  await expect(
    page.getByRole('heading', { name: 'Timer' }).locator('xpath=..').getByRole('radio', { name: 'Answer within 15s' })
  ).toBeChecked()
})
```

- [ ] **Step 7: Commit**

```bash
git add src/admin/AdminPage.jsx src/admin/__tests__/AdminPage.test.jsx src/i18n/en.json e2e/admin.spec.js
git commit -m "feat: replace Timer Display admin section and add Badges tab"
```

---

## Task 15: Wire both games — countdown display, Time's-up message, personal-best/badge props, version bumps

**Files:**
- Modify: `src/games/animal-sounds/index.jsx`
- Modify: `src/games/animal-sounds/AnimalSoundsGame.css`
- Modify: `src/games/animal-sounds/manifest.json` (version bump)
- Modify: `src/games/color-match/index.jsx`
- Modify: `src/games/color-match/ColorMatchGame.css`
- Modify: `src/games/color-match/manifest.json` (version bump)
- Modify: `src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx` (find via glob if present — check for `timerDisplayEnabled` references)
- Modify: `src/games/color-match/__tests__/ColorMatchGame.test.jsx` (same)

**Interfaces:**
- Consumes: `timerMode`, `timeLimitMs`, `timedOut`, `personalBestResult`, `newBadges` from `useGameSession` (Tasks 9-10); `mode`/`limitMs` props on `Timer` (Task 11); `personalBestResult`/`newBadges` props on `GameResults` (Task 12).

- [ ] **Step 1: Check both game test files for `timerDisplayEnabled` references**

Run: `grep -rn "timerDisplayEnabled" src/games/`
Expected: no matches in game source (games never destructured it directly — only `AdminPage.test.jsx` and `useGameSession.test.js` referenced it, both already updated in Tasks 9/14). If any match appears, update it to `timerMode: 'countUp'` following the same pattern as Task 9/14.

- [ ] **Step 2: Update `src/games/animal-sounds/index.jsx`**

Replace the destructure (lines 23-29):

```js
  const {
    current, index, total, locked, disabledChoiceIds, hintActive, selected,
    score, streak, missed, done, feedbackMode, handleChoice, advance, restart,
    currentElapsedMs, timerDisplayEnabled, offerDifficultyBump, numChoices,
    acceptDifficultyBump, dismissDifficultyBump,
    showIntro, introResolved, settingsLoaded, dontShowAgain, setDontShowAgain, dismissIntro,
  } = useGameSession({ gameId: 'animal-sounds', items: animals })
```

with:

```js
  const {
    current, index, total, locked, disabledChoiceIds, hintActive, selected,
    score, streak, missed, done, feedbackMode, handleChoice, advance, restart,
    currentElapsedMs, timerMode, timeLimitMs, timedOut, offerDifficultyBump, numChoices,
    personalBestResult, newBadges,
    acceptDifficultyBump, dismissDifficultyBump,
    showIntro, introResolved, settingsLoaded, dontShowAgain, setDontShowAgain, dismissIntro,
  } = useGameSession({ gameId: 'animal-sounds', items: animals })
```

Replace the `<GameResults .../>` call (in the `done` branch) — add the two new props:

```jsx
      <GameResults
        score={score}
        total={total}
        missed={missed}
        onPlayAgain={restart}
        onHome={() => onGameEnd(score, total)}
        renderMissedItem={animal => (
          <>
            <span aria-hidden="true">{animal.emoji}</span> {t(animal.nameKey)}
          </>
        )}
        offerDifficultyBump={offerDifficultyBump}
        numChoices={numChoices}
        onAcceptDifficultyBump={acceptDifficultyBump}
        onDismissDifficultyBump={dismissDifficultyBump}
        personalBestResult={personalBestResult}
        newBadges={newBadges}
      />
```

Replace the Timer render line:

```jsx
        {timerDisplayEnabled && <Timer elapsedMs={currentElapsedMs} />}
```

with:

```jsx
        {timerMode !== 'off' && (
          <Timer elapsedMs={currentElapsedMs} mode={timerMode === 'countdown' ? 'countdown' : 'countUp'} limitMs={timeLimitMs} />
        )}
```

Add the "Time's up!" message, right after the `<GameChoiceGrid .../>` block and before the `parent-tap` Next button:

```jsx
      {timedOut && <div className="game__timeout" role="status">{t('common.timeUp')}</div>}

      {locked && feedbackMode === 'parent-tap' && (
        <button className="game__next" onClick={advance}>{t('common.next')}</button>
      )}
```

- [ ] **Step 3: Apply the identical changes to `src/games/color-match/index.jsx`**

Replace the destructure (lines 16-22):

```js
  const {
    current, index, total, locked, disabledChoiceIds, hintActive, selected,
    score, streak, missed, done, feedbackMode, handleChoice, advance, restart,
    currentElapsedMs, timerDisplayEnabled, offerDifficultyBump, numChoices,
    acceptDifficultyBump, dismissDifficultyBump,
    showIntro, introResolved, settingsLoaded, dontShowAgain, setDontShowAgain, dismissIntro,
  } = useGameSession({ gameId: 'color-match', items: colors })
```

with:

```js
  const {
    current, index, total, locked, disabledChoiceIds, hintActive, selected,
    score, streak, missed, done, feedbackMode, handleChoice, advance, restart,
    currentElapsedMs, timerMode, timeLimitMs, timedOut, offerDifficultyBump, numChoices,
    personalBestResult, newBadges,
    acceptDifficultyBump, dismissDifficultyBump,
    showIntro, introResolved, settingsLoaded, dontShowAgain, setDontShowAgain, dismissIntro,
  } = useGameSession({ gameId: 'color-match', items: colors })
```

Add the two new props to `<GameResults .../>`:

```jsx
        offerDifficultyBump={offerDifficultyBump}
        numChoices={numChoices}
        onAcceptDifficultyBump={acceptDifficultyBump}
        onDismissDifficultyBump={dismissDifficultyBump}
        personalBestResult={personalBestResult}
        newBadges={newBadges}
      />
```

Replace the Timer render line:

```jsx
        {timerDisplayEnabled && <Timer elapsedMs={currentElapsedMs} />}
```

with:

```jsx
        {timerMode !== 'off' && (
          <Timer elapsedMs={currentElapsedMs} mode={timerMode === 'countdown' ? 'countdown' : 'countUp'} limitMs={timeLimitMs} />
        )}
```

Add the "Time's up!" message before the parent-tap Next button:

```jsx
      {timedOut && <div className="game__timeout" role="status">{t('common.timeUp')}</div>}

      {locked && feedbackMode === 'parent-tap' && (
        <button className="game__next" onClick={advance}>{t('common.next')}</button>
      )}
```

- [ ] **Step 4: Add `.game__timeout` styling to both games' CSS files**

Append to both `src/games/animal-sounds/AnimalSoundsGame.css` and `src/games/color-match/ColorMatchGame.css`:

```css
.game__timeout { text-align: center; font-size: 18px; font-weight: 700; color: var(--color-error); margin-top: 8px; }
```

- [ ] **Step 5: Bump both games' manifest versions**

In `src/games/animal-sounds/manifest.json`, change `"version": "1.3.0"` to `"version": "1.4.0"`.
In `src/games/color-match/manifest.json`, change `"version": "1.3.0"` to `"version": "1.4.0"`.

- [ ] **Step 6: Run each game's existing test suite and fix any fallout**

Run: `npx vitest run src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx src/games/color-match/__tests__/ColorMatchGame.test.jsx`
Expected: PASS. If a test asserts on the rendered version string (`v1.3.0`), update it to `v1.4.0`. If any test mocks `useGameSession`'s return value and destructures `timerDisplayEnabled`, update it to `timerMode`/`timeLimitMs`/`timedOut` per the pattern in Task 9.

- [ ] **Step 7: Run the full unit test suite for a final regression check**

Run: `npx vitest run`
Expected: PASS across the whole suite.

- [ ] **Step 8: Commit**

```bash
git add src/games/animal-sounds/index.jsx src/games/animal-sounds/AnimalSoundsGame.css src/games/animal-sounds/manifest.json src/games/animal-sounds/__tests__/AnimalSoundsGame.test.jsx src/games/color-match/index.jsx src/games/color-match/ColorMatchGame.css src/games/color-match/manifest.json src/games/color-match/__tests__/ColorMatchGame.test.jsx
git commit -m "feat: wire countdown timer, personal best, and badges into both games; bump game versions to 1.4.0"
```

---

## Task 16: E2E coverage — countdown timeout and Badges tab

**Files:**
- Modify: `e2e/animal-sounds.spec.js` (add a countdown-timeout test)
- Modify: `e2e/admin.spec.js` (add a Badges-tab render test)

**Interfaces:**
- Consumes: the running app (via `npm run dev`, started automatically by Playwright's `webServer` config) — no new interfaces produced.

- [ ] **Step 1: Add a countdown auto-advance E2E test to `e2e/animal-sounds.spec.js`**

Append:

```js
test('animal sounds: a countdown timeout auto-advances to the next question', async ({ page }) => {
  await page.goto('/admin')
  const timerSection = page.getByRole('heading', { name: 'Timer' }).locator('xpath=..')
  await timerSection.getByRole('radio', { name: 'Answer within 5s' }).check()

  await page.goto('/game/animal-sounds')
  await page.getByTestId('game-intro-start').click()

  await expect(page.getByText("Question 1 of")).toBeVisible()
  await page.waitForTimeout(5200) // countdown expires
  await expect(page.getByText("⏰ Time's up!")).toBeVisible()
  await page.waitForTimeout(1600) // auto-advance delay
  await expect(page.getByText("Question 2 of")).toBeVisible()

  // Reset the timer setting so later specs in this file aren't affected
  // (each Playwright test gets a fresh browser context, so this is
  // defense-in-depth rather than strictly required, but keeps intent explicit).
  await page.goto('/admin')
  await timerSection.getByRole('radio', { name: '⏱️ Show timer' }).check()
})
```

- [ ] **Step 2: Add a Badges-tab E2E test to `e2e/admin.spec.js`**

Append:

```js
test('badges tab shows the badge gallery for each game', async ({ page }) => {
  await page.goto('/admin')
  await page.getByRole('tab', { name: 'Badges' }).click()

  await expect(page.getByText('Animal Sounds')).toBeVisible()
  await expect(page.getByText('Color Match')).toBeVisible()
  await expect(page.getByText('Hot Streak')).toBeVisible()
})

test('badges tab has no accessibility violations', async ({ page }) => {
  await page.goto('/admin')
  await page.getByRole('tab', { name: 'Badges' }).click()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
```

- [ ] **Step 3: Run the full E2E suite**

Run: `npm run e2e`
Expected: PASS. (This run also exercises `e2e/visual.spec.js` against the new/changed Storybook stories from Tasks 11-13 — new stories need baseline screenshots, generated in Step 4.)

- [ ] **Step 4: Generate visual-regression baselines for the new/changed stories**

Run: `npx playwright test visual.spec.js --update-snapshots`
Expected: New PNGs created under `e2e/visual.spec.js-snapshots/` for `components-timer--countdown-midway`, `components-timer--countdown-time-up`, `components-gameresults--with-personal-best-records`, `components-gameresults--with-new-badges`, `components-badgegallery--all-locked`, `components-badgegallery--mixed-progress`. Review the diffs/new images before committing.

- [ ] **Step 5: Commit**

```bash
git add e2e/animal-sounds.spec.js e2e/admin.spec.js e2e/visual.spec.js-snapshots
git commit -m "test(e2e): cover countdown timeout auto-advance and Badges tab"
```

---

## Task 17: Documentation and versioning

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/ENHANCEMENTS.md`
- Modify: `README.md`
- Modify: `package.json` (version bump)

**Interfaces:** none — documentation only.

- [ ] **Step 1: Add a new `[0.8.0]` entry to `CHANGELOG.md`**

Insert after the `# Changelog` header/format line, before the existing `## [0.7.0]` entry:

```markdown
## [0.8.0] - 2026-07-03

### Added
- **Answer within N seconds** — an admin-configurable countdown mode replaces the passive stopwatch; when a question's timer runs out, it locks in as missed (breaking the streak, added to the results-screen missed list) and always auto-advances after showing "Time's up!", regardless of feedback mode.
- **Per-session personal best** — a session's accuracy and average correct-answer speed are compared against that game's stored bests. Breaking either shows a banner on the results screen ("New accuracy record!" / "New speed record!"); a speed record only counts if the session's accuracy meets a configurable minimum (default 70%, adjustable in 5% increments up to 100%).
- **Milestone badges** — 8 repeatable, per-game achievements across three categories (streak tiers, perfect sessions, lifetime questions answered), each with an emoji icon shown on the results screen when newly earned and browsable in a new AdminPage "Badges" tab.
- `timerMode` (`'off' | 'countUp' | 'countdown'`), `timeLimitSeconds`, `speedRecordMinAccuracy` settings.
- `getPersonalBests`/`savePersonalBests` and `getBadgeData`/`saveBadgeData` storage adapter methods.
- `usePersonalBest`, `useBadges` hooks; `evaluatePersonalBest`, `computeBadgeAwards` pure utility functions; `BADGE_CATALOG` in `src/lib/badges.js`.
- `BadgeGallery` component.
- `timedOut` field on timing entries recorded when a countdown expires.

### Changed
- `timerDisplayEnabled` (boolean) is replaced by `timerMode`/`timeLimitSeconds`; existing stored settings are migrated automatically on load.
- `useGameSession` no longer accepts external `timeLimitMs`/`onTimeout` parameters — countdown behavior is now derived entirely from settings.
- `Timer` gains a `mode`/`limitMs` prop pair to support counting down.
- `GameResults` gains `personalBestResult`/`newBadges` props.
```

- [ ] **Step 2: Update `docs/ENHANCEMENTS.md`**

Add a new "Recently Completed" entry right after the `## Recently Completed` heading, before the existing `### v0.7.0` entry:

```markdown
### v0.8.0 — Time Limit, Personal Best, and Milestone Badges (2026-07-03)
- **Answer within N seconds** (issue: core engine backlog) — configurable countdown mode, mutually exclusive with the passive count-up timer; a timeout locks the question as missed and always auto-advances
- **Per-session personal best** — accuracy and speed records per game, with results-screen banners and a configurable minimum-accuracy gate for speed records
- **Milestone badges** — 8 repeatable per-game achievements (streak tiers, perfect sessions, lifetime questions answered), with a new AdminPage "Badges" gallery tab
```

Remove the now-implemented bullet from the "Core Game Engine" section:

```markdown
- **Answer within N seconds** — enforce `timeLimitMs`/`onTimeout` (already wired as unused parameters in `useGameSession`, reserved during the v0.6.0 timer work) as a configurable per-question time limit, pairing with the existing timer display. Games should be set to either play as show timer or answer within n seconds.
```

Remove this line too (from the same section):

```markdown
- **Per-session "personal best"** — compare the current session's score and speed against the stored best; show a "New record!" banner on the results screen using the `timings` data already saved
```

Remove this bullet from the "Scoring & Progress" section:

```markdown
- **Milestone badges** — award badges for streaks, perfect sessions, or total questions answered.
```

- [ ] **Step 3: Update `README.md`'s Settings Reference table and prose**

Replace this row:

```markdown
| Timer display | On | On, Off |
```

with:

```markdown
| Timer | Show timer | Off, Show timer, Answer within 5/10/15/20s |
| Speed record threshold | 70% | 70, 75, 80, 85, 90, 95, 100 |
```

Replace this paragraph:

```markdown
**Timer display** — shows a running stopwatch next to the question, counting up from 0 each time a new question appears. Purely informational; there is no time limit today.
```

with:

```markdown
**Timer** — "Show timer" is a running stopwatch, purely informational. "Answer within Ns" instead counts down; when it reaches zero the question locks in as missed (same as exhausting retries) and always advances after a "Time's up!" message, regardless of feedback mode. "Off" hides the timer and enforces no limit.

**Speed record threshold** — the minimum session accuracy required for a new average-speed personal best to be announced, so a fast-but-mostly-wrong session can't set a "speed record."
```

- [ ] **Step 4: Bump `package.json`'s version**

Change `"version": "0.7.0"` to `"version": "0.8.0"`.

- [ ] **Step 5: Verify the full test suite, lint, and build all still pass**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all three succeed with no errors.

- [ ] **Step 6: Commit**

```bash
git add CHANGELOG.md docs/ENHANCEMENTS.md README.md package.json
git commit -m "docs: document v0.8.0 time limit, personal best, and badges; bump version"
```

---

## Self-Review Notes

- **Spec coverage:** every section of the design spec (settings, timer/timeout, personal best, badges, testing, docs) maps to a task above (Tasks 1-8 = data/logic layer, 9-10 = engine wiring, 11-15 = UI, 16 = E2E, 17 = docs/versioning).
- **Placeholder scan:** no `TBD`/`TODO`/"add appropriate handling" phrases; every step shows complete code or an exact command.
- **Type/signature consistency check:** `evaluatePersonalBest`'s return shape (`{ accuracy: { isNewRecord, value, previous }, speed: { isNewRecord, value, previous }, updatedBests }`) is used identically in `usePersonalBest` (Task 7), `useGameSession` (Task 10), and `GameResults` (Task 12). `computeBadgeAwards`'s return (`string[]` of badge ids) is used identically in `useBadges` (Task 8) and its tests (Task 6). `BADGE_CATALOG` entry shape (`id, category, tier, icon, nameKey, descKey`) is consistent across Tasks 4, 6, 8, 12, 13.
