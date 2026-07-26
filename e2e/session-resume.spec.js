import { test, expect } from '@playwright/test'
import buildQueue from '../src/utils/buildQueue.js'
import animals from '../src/games/animal-sounds/data/animals.js'

// Mirrors DEFAULT_SETTINGS in src/storage/adapter.js — these specs don't seed
// playground_settings, so the app runs with the real defaults, and the
// seeded queue must be built with the same numChoices/questionsPerSession
// the app would actually use or QuizGameShell's total/index math won't match.
const NUM_CHOICES = 2
const QUESTIONS_PER_SESSION = 10
const GAME_ID = 'animal-sounds'

// Builds a real buildQueue() output for animal-sounds (full item objects in
// `correct`/`choices`, not id stubs) and wraps it in a SessionResumeState
// snapshot shaped exactly like src/storage/adapter.js's JSDoc contract.
function buildResumeSnapshot({ index, score }) {
  const queue = buildQueue(animals, NUM_CHOICES, QUESTIONS_PER_SESSION, null)
  const timings = queue.slice(0, index).map((entry, i) => ({
    questionIndex: i,
    itemId: entry.correct.id,
    correct: i < score,
    durationMs: 1200,
    attemptNumber: 1,
  }))
  const missed = queue.slice(0, index - score).map(entry => entry.correct)

  return {
    gameId: GAME_ID,
    queue,
    index,
    score,
    streak: score,
    missed,
    timings,
    peakStreak: score,
    savedAt: Date.now(),
  }
}

function seedResume(page, snapshot) {
  return page.addInitScript((state) => {
    localStorage.setItem('playground_session_resume', JSON.stringify(state))
  }, snapshot)
}

async function playUntilDone(page) {
  for (let i = 0; i < QUESTIONS_PER_SESSION; i++) {
    if (await page.getByText(/you scored/i).isVisible()) break
    const correctId = await page.getByTestId('correct-animal-id').textContent()
    await page.locator(`[data-animal-id="${correctId}"]`).click()
    await page.waitForTimeout(1600)
  }
}

test('animal sounds: a valid resume snapshot offers to continue, and resuming restores progress and score', async ({ page }) => {
  const snapshot = buildResumeSnapshot({ index: 4, score: 3 })
  await seedResume(page, snapshot)

  await page.goto('/game/animal-sounds')

  await expect(page.getByTestId('resume-prompt-resume')).toBeVisible()
  await expect(page.getByText('You were on question 5 of 10, with a score of 3.')).toBeVisible()

  await page.getByTestId('resume-prompt-resume').click()

  // Game view resumes at the saved index (0-based 4 -> displayed "5 of 10").
  await expect(page.getByText('Question 5 of 10')).toBeVisible()
  await expect(page.locator('[data-animal-id]').first()).toBeVisible()

  // Score isn't rendered during play (only on the resume prompt and results
  // screen), so verify the resumed score of 3 actually round-tripped by
  // answering every remaining question (5 of the 6 left, index 4..9)
  // correctly and checking the final tally reflects 3 (resumed) + 6 (new).
  await playUntilDone(page)
  await expect(page.getByText('You scored 9 out of 10!')).toBeVisible()
})

test('animal sounds: starting fresh clears the saved snapshot and restarts at question 1 with score 0', async ({ page }) => {
  const snapshot = buildResumeSnapshot({ index: 6, score: 5 })
  await seedResume(page, snapshot)

  await page.goto('/game/animal-sounds')

  await expect(page.getByTestId('resume-prompt-resume')).toBeVisible()
  await page.getByTestId('resume-prompt-start-fresh').click()

  // introDismissed defaults to false for this game, so declining resume
  // falls through to the normal how-to-play intro, same as any other fresh
  // visit -- start it to reach the game view.
  await expect(page.getByTestId('game-intro-start')).toBeVisible()
  await page.getByTestId('game-intro-start').click()

  await expect(page.getByText('Question 1 of 10')).toBeVisible()
  await expect(page.locator('[data-animal-id]').first()).toBeVisible()

  // The stale (index 6, score 5) snapshot is gone -- but useGameSession
  // autosaves progress from the very first question of every session, so
  // the key itself is never simply null again once the fresh queue has
  // built. Assert the *old* progress was actually discarded by checking
  // what replaced it is a genuinely fresh (index 0, score 0) snapshot.
  await expect.poll(async () => {
    const raw = await page.evaluate(() => localStorage.getItem('playground_session_resume'))
    return raw && JSON.parse(raw)
  }).toMatchObject({ gameId: 'animal-sounds', index: 0, score: 0 })

  // Answering every question correctly from a genuinely fresh (score 0)
  // session yields a perfect 10/10 -- if the old score of 5 had leaked
  // through, this would read 15 (impossible) or the session would already
  // have been mid-way through instead of starting at question 1.
  await playUntilDone(page)
  await expect(page.getByText('You scored 10 out of 10!')).toBeVisible()
})

test('animal sounds: an expired resume snapshot is discarded and the game starts fresh (no resume prompt)', async ({ page }) => {
  const snapshot = buildResumeSnapshot({ index: 4, score: 3 })
  snapshot.savedAt = Date.now() - (4 * 60 * 60 * 1000 + 1000) // 1s past the 4h TTL
  await seedResume(page, snapshot)

  await page.goto('/game/animal-sounds')

  await expect(page.getByTestId('resume-prompt-resume')).not.toBeVisible()
  await expect(page.getByTestId('game-intro-start')).toBeVisible()

  // The expired snapshot itself is discarded (isResumeValid rejects it on
  // TTL), but useGameSession immediately persists a brand-new snapshot for
  // the fresh session it starts instead -- so this key is never simply
  // null again once the queue has built. Assert the *stale* progress is
  // gone rather than the key itself, by polling for a fresh (index 0,
  // score 0) snapshot to replace it.
  await expect.poll(async () => {
    const raw = await page.evaluate(() => localStorage.getItem('playground_session_resume'))
    return raw && JSON.parse(raw)
  }).toMatchObject({ gameId: 'animal-sounds', index: 0, score: 0 })
})
