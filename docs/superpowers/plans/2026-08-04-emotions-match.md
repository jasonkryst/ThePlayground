# Emotions Match Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a new auto-discovered quiz game, Emotions Match (issue #76) — an emotion word is shown and spoken aloud, the child taps the matching emoji face.

**Architecture:** Follows this repo's existing auto-discovery game-plugin convention exactly (`CLAUDE.md`): a new `src/games/emotions-match/` folder with `manifest.json` + `index.jsx` is picked up automatically by `App.jsx`'s `import.meta.glob`, no engine/router changes. The game is a thin consumer of the existing `QuizGameShell` + `useGameSession` + `useSpeech` + `useQuestionAudio` + `ReplayButton` stack, closely modeled on `src/games/fruit-veggie-id/` with one difference: the word is always visible as the prompt (never hidden), so there's no `promptFallback` branch.

**Tech Stack:** React 18, react-i18next, Vitest + React Testing Library + jest-axe, Storybook.

## Global Constraints

- New game folder: `src/games/emotions-match/` (id `emotions-match`).
- Face choices are plain emoji — no new image/audio assets to source.
- Full en/es/pl i18n parity is required for every string (this repo's existing convention; other games' locale-specific tests assert the translations actually work, not just exist).
- No `badges.js` (only the two memory-type games override the badge catalog), no `icon.<ext>` file (only the licensed-character games have one), no `orientation` manifest field (only memory games lock orientation).
- No changes to `QuizGameShell`, `useGameSession`, `useSpeech`, `useQuestionAudio`, `ReplayButton`, or `Dashboard.jsx` — this game needs nothing the shell doesn't already provide, and the `vocabulary`/`emotions` tags fall back to the dashboard's existing auto-capitalize behavior (`tagLabel`'s `defaultValue`) exactly like the pre-existing `vocabulary`/`food` tags already do — no new `dashboard.tag.*` i18n keys needed.
- Spec: `docs/superpowers/specs/2026-08-04-emotions-match-design.md`.

---

### Task 1: Manifest, data, and i18n

**Files:**
- Create: `src/games/emotions-match/manifest.json`
- Create: `src/games/emotions-match/data/emotions.js`
- Create: `src/games/emotions-match/i18n/en.json`
- Create: `src/games/emotions-match/i18n/es.json`
- Create: `src/games/emotions-match/i18n/pl.json`
- Test: `src/games/emotions-match/__tests__/emotions.test.js`

**Interfaces:**
- Produces: `emotions` default export from `data/emotions.js` — an array of exactly 8 objects shaped `{ id: string, nameKey: string, emoji: string }`, `nameKey` always `emotion.<id>.name`. Task 2 imports this as `import emotions from './data/emotions'`.
- Produces: i18n namespace `emotionsMatch` (keys: `manifestName`, `manifestDescription`, `prompt`, `replay`, `howToPlay`) and `emotion.<id>.name` for each of the 8 ids. Task 2 calls `t('emotionsMatch.prompt', { emotion: ... })`, `t('emotionsMatch.howToPlay')`, `labelKey="emotionsMatch.replay"`, and `t(emotion.nameKey)`.
- Consumes: nothing (first task).

- [ ] **Step 1: Create the manifest**

`src/games/emotions-match/manifest.json`:

```json
{
  "id": "emotions-match",
  "nameKey": "emotionsMatch.manifestName",
  "descriptionKey": "emotionsMatch.manifestDescription",
  "icon": "😊",
  "color": "#FFD54F",
  "version": "1.0.0",
  "tags": ["vocabulary", "emotions"]
}
```

- [ ] **Step 2: Create the data file**

`src/games/emotions-match/data/emotions.js`:

```js
const emotions = [
  { id: 'happy',     nameKey: 'emotion.happy.name',     emoji: '😊' },
  { id: 'sad',       nameKey: 'emotion.sad.name',       emoji: '😢' },
  { id: 'angry',     nameKey: 'emotion.angry.name',     emoji: '😠' },
  { id: 'scared',    nameKey: 'emotion.scared.name',    emoji: '😨' },
  { id: 'surprised', nameKey: 'emotion.surprised.name', emoji: '😲' },
  { id: 'tired',     nameKey: 'emotion.tired.name',     emoji: '😴' },
  { id: 'silly',     nameKey: 'emotion.silly.name',     emoji: '🤪' },
  { id: 'calm',      nameKey: 'emotion.calm.name',      emoji: '😌' },
]

export default emotions
```

- [ ] **Step 3: Create the English i18n file**

`src/games/emotions-match/i18n/en.json`:

```json
{
  "emotionsMatch": {
    "manifestName": "Emotions Match",
    "manifestDescription": "See the word, tap the matching face!",
    "prompt": "Find: {{emotion}}!",
    "replay": "Say it again",
    "howToPlay": "An emotion word appears — tap the face that matches how it feels!"
  },
  "emotion": {
    "happy": { "name": "Happy" },
    "sad": { "name": "Sad" },
    "angry": { "name": "Angry" },
    "scared": { "name": "Scared" },
    "surprised": { "name": "Surprised" },
    "tired": { "name": "Tired" },
    "silly": { "name": "Silly" },
    "calm": { "name": "Calm" }
  }
}
```

- [ ] **Step 4: Create the Spanish i18n file**

`src/games/emotions-match/i18n/es.json`:

```json
{
  "emotionsMatch": {
    "manifestName": "Combinar Emociones",
    "manifestDescription": "¡Mira la palabra y toca la cara que coincida!",
    "prompt": "¡Encuentra: {{emotion}}!",
    "replay": "Decirlo de nuevo",
    "howToPlay": "Aparece una palabra de emoción — ¡toca la cara que coincida con ese sentimiento!"
  },
  "emotion": {
    "happy": { "name": "Feliz" },
    "sad": { "name": "Triste" },
    "angry": { "name": "Enojado" },
    "scared": { "name": "Asustado" },
    "surprised": { "name": "Sorprendido" },
    "tired": { "name": "Cansado" },
    "silly": { "name": "Gracioso" },
    "calm": { "name": "Tranquilo" }
  }
}
```

- [ ] **Step 5: Create the Polish i18n file**

`src/games/emotions-match/i18n/pl.json`:

```json
{
  "emotionsMatch": {
    "manifestName": "Dopasuj Emocje",
    "manifestDescription": "Zobacz słowo i dotknij pasującej buzi!",
    "prompt": "Znajdź: {{emotion}}!",
    "replay": "Powiedz ponownie",
    "howToPlay": "Pojawia się słowo emocji — dotknij buzi, która pasuje do tego uczucia!"
  },
  "emotion": {
    "happy": { "name": "Wesoły" },
    "sad": { "name": "Smutny" },
    "angry": { "name": "Zły" },
    "scared": { "name": "Przestraszony" },
    "surprised": { "name": "Zaskoczony" },
    "tired": { "name": "Zmęczony" },
    "silly": { "name": "Głupkowaty" },
    "calm": { "name": "Spokojny" }
  }
}
```

- [ ] **Step 6: Write the data test**

`src/games/emotions-match/__tests__/emotions.test.js` (mirrors `src/games/fruit-veggie-id/__tests__/foods.test.js`):

```js
import { describe, it, expect } from 'vitest'
import i18n from '../../../i18n'
import emotions from '../data/emotions'

describe('emotions data', () => {
  it('exports an array of exactly 8 emotions', () => {
    expect(Array.isArray(emotions)).toBe(true)
    expect(emotions.length).toBe(8)
  })

  it('every emotion has id, nameKey and emoji', () => {
    for (const emotion of emotions) {
      expect(emotion.id,      `${emotion.nameKey} missing id`).toBeTruthy()
      expect(emotion.nameKey, `${emotion.id} missing nameKey`).toBeTruthy()
      expect(emotion.emoji,   `${emotion.id} missing emoji`).toBeTruthy()
    }
  })

  it('nameKey always follows the emotion.<id>.name convention', () => {
    for (const emotion of emotions) {
      expect(emotion.nameKey).toBe(`emotion.${emotion.id}.name`)
    }
  })

  // Negative: no collisions
  it('all ids are unique', () => {
    const ids = emotions.map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all emojis are unique', () => {
    const emojis = emotions.map(e => e.emoji)
    expect(new Set(emojis).size).toBe(emojis.length)
  })

  // Negative: no missing translations
  it('every nameKey resolves to a real, non-fallback translation', () => {
    for (const emotion of emotions) {
      expect(i18n.exists(emotion.nameKey), `${emotion.nameKey} not in i18n`).toBe(true)
      expect(i18n.t(emotion.nameKey)).not.toBe(emotion.nameKey)
    }
  })
})
```

- [ ] **Step 7: Run the data test to verify it passes**

Run: `npx vitest run src/games/emotions-match/__tests__/emotions.test.js`
Expected: PASS, 6/6 tests (this test only depends on the data/i18n files just created, not on `index.jsx`, so it should pass immediately — no red-green cycle needed here since there's no behavior to get wrong yet, just data to declare correctly).

- [ ] **Step 8: Commit**

```bash
git add src/games/emotions-match/manifest.json src/games/emotions-match/data/emotions.js src/games/emotions-match/i18n/ src/games/emotions-match/__tests__/emotions.test.js
git commit -m "feat(76): add Emotions Match manifest, data, and i18n"
```

---

### Task 2: Game component and its test suite

**Files:**
- Create: `src/games/emotions-match/index.jsx`
- Test: `src/games/emotions-match/__tests__/EmotionsMatchGame.test.jsx`

**Interfaces:**
- Consumes: `emotions` from `../data/emotions` (Task 1), `manifest` from `../manifest.json` (Task 1), `i18n` namespaces `emotionsMatch.*`/`emotion.*.name` (Task 1). Also consumes existing shared modules unchanged: `useGameSession` (`src/hooks/useGameSession.js`), `useSpeech` (`src/hooks/useSpeech.js`, returns `{ speak, cancel, supported, blocked }`), `useQuestionAudio` (`src/hooks/useQuestionAudio.js`, signature `{ index, current, showIntro, introResolved, done, resumeAvailable, announce, stop }` returning a `replay` callback), `QuizGameShell` (`src/components/QuizGameShell.jsx`, props `session, manifest, onGameEnd, instructions, correctTestId, prompt, renderPromptExtra, getChoiceProps, renderChoiceContent, renderMissedItem`), `ReplayButton` (`src/components/ReplayButton.jsx`, props `labelKey, blocked, onClick`).
- Produces: default export `EmotionsMatchGame({ onGameEnd })`, a React component. `data-testid="correct-emotion-id"` hidden span (from `QuizGameShell`'s `correctTestId` prop) and `data-emotion-id` on every choice button (from `getChoiceProps`) — later tasks and any future test rely on these exact attribute names.

- [ ] **Step 1: Write the failing test file**

`src/games/emotions-match/__tests__/EmotionsMatchGame.test.jsx` (mirrors `src/games/fruit-veggie-id/__tests__/FruitVeggieIdGame.test.jsx`):

```jsx
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { axe } from 'jest-axe'
import EmotionsMatchGame from '../index'
import { ShellContext } from '../../../components/ShellContext'
import i18n from '../../../i18n'
import emotions from '../data/emotions'

vi.mock('../../../lib/confetti', () => ({ fireConfetti: vi.fn() }))

// Mock the speech hook (per the "mock the hook, not the browser primitive" rule).
let mockSupported = true
let mockBlocked = false
const mockSpeak = vi.fn()
const mockCancel = vi.fn()
vi.mock('../../../hooks/useSpeech', () => ({
  default: () => ({ speak: mockSpeak, cancel: mockCancel, supported: mockSupported, blocked: mockBlocked }),
}))

let mockSettings = {
  numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 3,
  maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
  spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false, adaptiveItemSelectionEnabled: false, timerMode: 'countUp',
  introDismissed: { 'emotions-match': true },
}
const mockUpdateSetting = vi.fn()
let mockLoaded = true

vi.mock('../../../hooks/useSettings', () => ({
  default: () => ({ settings: mockSettings, loaded: mockLoaded, updateSetting: mockUpdateSetting }),
}))
vi.mock('../../../hooks/useScores', () => ({
  default: () => ({ addScore: vi.fn().mockResolvedValue(undefined), scores: [], getBestScore: () => 0, getScoresByGame: () => [], getAllScores: () => [] }),
}))
vi.mock('../../../hooks/useBestStreak', () => ({
  default: () => ({ bestStreak: 0, recordStreak: vi.fn().mockResolvedValue(undefined) }),
}))
vi.mock('../../../hooks/usePersonalBest', () => ({
  default: () => ({
    personalBest: null,
    recordSession: vi.fn().mockResolvedValue({
      accuracy: { isNewRecord: false, value: 0, previous: null },
      speed: { isNewRecord: false, value: null, previous: null },
    }),
  }),
}))
vi.mock('../../../hooks/useBadges', () => ({
  default: () => ({ badgeData: { awards: {}, lifetimeQuestions: {} }, awardSession: vi.fn().mockResolvedValue([]) }),
}))

vi.mock('../../../hooks/useItemStats', () => ({
  default: () => ({ itemStats: {}, recordMisses: vi.fn().mockResolvedValue(undefined) }),
}))

const { mockGetSessionResume } = vi.hoisted(() => ({
  mockGetSessionResume: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../../storage/index', () => ({
  default: {
    getSessionResume: mockGetSessionResume,
    saveSessionResume: vi.fn(),
    clearSessionResume: vi.fn(),
  },
}))

const onGameEnd = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockLoaded = true
  mockSupported = true
  mockBlocked = false
  mockSettings = {
    numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 3,
    maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2, retryCountsAsStreak: true,
    spacedRepetitionEnabled: false, difficultyAutoProgressionEnabled: false, adaptiveItemSelectionEnabled: false, timerMode: 'countUp',
    introDismissed: { 'emotions-match': true },
  }
})

const emotionButtons = () => screen.getAllByRole('button').filter(b => b.dataset.emotionId)

describe('EmotionsMatchGame', () => {
  it('renders the word prompt with picture choices', async () => {
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    expect(screen.getByText(/find:/i)).toBeInTheDocument()
    expect(emotionButtons().length).toBeGreaterThanOrEqual(2)
  })

  it('speaks the name automatically when a question is shown', async () => {
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    expect(mockSpeak).toHaveBeenCalled()
  })

  it('shows a replay button that re-speaks the name on click', async () => {
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    const replay = screen.getByLabelText(/say it again/i)
    mockSpeak.mockClear()
    await act(async () => { await userEvent.click(replay) })
    expect(mockSpeak).toHaveBeenCalledTimes(1)
  })

  it('labels each picture choice with its name for screen readers', async () => {
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    for (const btn of emotionButtons()) {
      expect(btn.getAttribute('aria-label')).toBeTruthy()
    }
  })

  it('clicking the correct picture adds the correct class', async () => {
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    const correctId = screen.getByTestId('correct-emotion-id').textContent
    const correctBtn = emotionButtons().find(b => b.dataset.emotionId === correctId)
    await act(async () => { await userEvent.click(correctBtn) })
    expect(correctBtn.classList.contains('correct')).toBe(true)
  })

  it('shows results after all questions in immediate mode', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    for (let i = 0; i < 3; i++) {
      const correctId = screen.getByTestId('correct-emotion-id').textContent
      const correctBtn = emotionButtons().find(b => b.dataset.emotionId === correctId)
      act(() => { fireEvent.click(correctBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }
    vi.useRealTimers()
    expect(screen.getByText(/you scored/i)).toBeInTheDocument()
  })

  it('Home button calls onGameEnd', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    for (let i = 0; i < 3; i++) {
      const correctId = screen.getByTestId('correct-emotion-id').textContent
      const correctBtn = emotionButtons().find(b => b.dataset.emotionId === correctId)
      act(() => { fireEvent.click(correctBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }
    vi.useRealTimers()
    await act(async () => { await userEvent.click(screen.getByRole('button', { name: /home/i })) })
    expect(onGameEnd).toHaveBeenCalled()
  })

  it('reports the streak to the shell after 2 correct answers', async () => {
    vi.useFakeTimers()
    const setGameStatus = vi.fn()
    await act(async () => {
      render(
        <ShellContext.Provider value={{ setGameStatus }}>
          <EmotionsMatchGame onGameEnd={onGameEnd} />
        </ShellContext.Provider>
      )
    })
    for (let i = 0; i < 2; i++) {
      const correctId = screen.getByTestId('correct-emotion-id').textContent
      const correctBtn = emotionButtons().find(b => b.dataset.emotionId === correctId)
      act(() => { fireEvent.click(correctBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }
    vi.useRealTimers()
    expect(setGameStatus).toHaveBeenLastCalledWith({ streak: 2, sessionActive: true })
  })

  it('cancels speech when advancing to the next question', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    const correctId = screen.getByTestId('correct-emotion-id').textContent
    const correctBtn = emotionButtons().find(b => b.dataset.emotionId === correctId)
    act(() => { fireEvent.click(correctBtn) })
    act(() => { vi.advanceTimersByTime(1600) })
    await act(async () => {})
    vi.useRealTimers()
    expect(mockCancel).toHaveBeenCalled()
  })

  it('cancels speech when the session ends', async () => {
    mockSettings = { ...mockSettings, questionsPerSession: 1 }
    vi.useFakeTimers()
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    const correctId = screen.getByTestId('correct-emotion-id').textContent
    const correctBtn = emotionButtons().find(b => b.dataset.emotionId === correctId)
    act(() => { fireEvent.click(correctBtn) })
    act(() => { vi.advanceTimersByTime(1600) })
    await act(async () => {})
    vi.useRealTimers()
    expect(screen.getByText(/you scored/i)).toBeInTheDocument()
    expect(mockCancel).toHaveBeenCalled()
  })

  it('shows missed emotions in the results when an answer is wrong', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    for (let i = 0; i < 3; i++) {
      const correctId = screen.getByTestId('correct-emotion-id').textContent
      const wrongBtn = emotionButtons().find(b => b.dataset.emotionId !== correctId)
      act(() => { fireEvent.click(wrongBtn) })
      act(() => { vi.advanceTimersByTime(1600) })
      await act(async () => {})
    }
    vi.useRealTimers()
    expect(screen.getByText(/let's practice/i)).toBeInTheDocument()
  })

  it('hides the timer when timerMode is "off"', async () => {
    mockSettings = { ...mockSettings, timerMode: 'off' }
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    expect(screen.queryByLabelText(/elapsed time/i)).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    let container
    await act(async () => { container = render(<EmotionsMatchGame onGameEnd={onGameEnd} />).container })
    expect(await axe(container)).toHaveNoViolations()
  })

  // Negative: audio-leak guard
  it('does not speak while settings/intro have not resolved', async () => {
    mockLoaded = false
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    expect(mockSpeak).not.toHaveBeenCalled()
  })

  it('shows the tap-to-hear recovery hint when speech is blocked', async () => {
    mockBlocked = true
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    expect(screen.getByText(/tap.*to hear/i)).toBeInTheDocument()
  })

  it('does not show the tap-to-hear hint when speech is not blocked', async () => {
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    expect(screen.queryByText(/tap.*to hear/i)).not.toBeInTheDocument()
  })

  it('does not show the recovery hint when speech is unsupported (no replay button at all)', async () => {
    mockSupported = false
    mockBlocked = true
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    expect(screen.queryByText(/tap.*to hear/i)).not.toBeInTheDocument()
  })

  it('has no accessibility violations while the recovery hint is showing', async () => {
    mockBlocked = true
    let container
    await act(async () => { container = render(<EmotionsMatchGame onGameEnd={onGameEnd} />).container })
    expect(screen.getByText(/tap.*to hear/i)).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  // Negative: the word is never hidden, unlike Fruit & Veggie ID
  describe('when speech synthesis is unavailable', () => {
    beforeEach(() => { mockSupported = false })

    it('still shows the word prompt and hides the replay button', async () => {
      await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
      expect(screen.getByText(/find:/i)).toBeInTheDocument()
      expect(screen.queryByLabelText(/say it again/i)).not.toBeInTheDocument()
      expect(mockSpeak).not.toHaveBeenCalled()
    })
  })
})

describe('EmotionsMatchGame — how-to-play intro', () => {
  it('shows the intro before the first question when not dismissed', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    expect(screen.getByTestId('game-intro-start')).toBeInTheDocument()
    expect(screen.queryByText(/find:/i)).not.toBeInTheDocument()
  })

  it('starts the session after "Let\'s Play!" is clicked', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-start')) })
    expect(screen.getByText(/find:/i)).toBeInTheDocument()
  })

  it('persists introDismissed for this game when "don\'t show again" is checked', async () => {
    mockSettings = { ...mockSettings, introDismissed: {} }
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-dont-show-again')) })
    await act(async () => { await userEvent.click(screen.getByTestId('game-intro-start')) })
    expect(mockUpdateSetting).toHaveBeenCalledWith('introDismissed', { 'emotions-match': true })
  })
})

describe('EmotionsMatchGame — Spanish locale', () => {
  beforeEach(async () => { await act(async () => { await i18n.changeLanguage('es') }) })
  afterEach(async () => { await act(async () => { await i18n.changeLanguage('en') }) })

  it('replay button speaks the Spanish item name under the es locale', async () => {
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    mockSpeak.mockClear()
    const replay = screen.getByLabelText(/decirlo de nuevo/i)
    await act(async () => { await userEvent.click(replay) })
    const correctId = screen.getByTestId('correct-emotion-id').textContent
    const spanishNameById = {
      happy: 'Feliz', sad: 'Triste', angry: 'Enojado', scared: 'Asustado',
      surprised: 'Sorprendido', tired: 'Cansado', silly: 'Gracioso', calm: 'Tranquilo',
    }
    expect(mockSpeak).toHaveBeenCalledWith(spanishNameById[correctId])
  })
})

describe('EmotionsMatchGame — session resume (issue #153)', () => {
  const savedQueue = [
    { correct: emotions[0], choices: [emotions[0], emotions[1]] },
    { correct: emotions[1], choices: [emotions[0], emotions[1]] },
  ]
  const savedSnapshot = {
    gameId: 'emotions-match', queue: savedQueue, index: 0, score: 1, streak: 1,
    missed: [], timings: [], peakStreak: 1, savedAt: Date.now(),
  }

  it('does NOT speak the name while the resume prompt is showing', async () => {
    mockGetSessionResume.mockResolvedValueOnce(savedSnapshot)
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    await act(async () => {})

    expect(screen.getByTestId('resume-prompt-resume')).toBeInTheDocument()
    expect(mockSpeak).not.toHaveBeenCalled()
  })

  it('speaks the name once the player chooses to resume', async () => {
    mockGetSessionResume.mockResolvedValueOnce(savedSnapshot)
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    await act(async () => {})

    await act(async () => { await userEvent.click(screen.getByTestId('resume-prompt-resume')) })

    expect(mockSpeak).toHaveBeenCalled()
  })

  it('speaks the name once the player starts fresh instead of resuming', async () => {
    mockGetSessionResume.mockResolvedValueOnce(savedSnapshot)
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    await act(async () => {})

    await act(async () => { await userEvent.click(screen.getByTestId('resume-prompt-start-fresh')) })

    expect(mockSpeak).toHaveBeenCalled()
  })
})

describe('EmotionsMatchGame — Polish locale', () => {
  beforeEach(async () => { await act(async () => { await i18n.changeLanguage('pl') }) })
  afterEach(async () => { await act(async () => { await i18n.changeLanguage('en') }) })

  it('replay button speaks the Polish item name under the pl locale', async () => {
    await act(async () => { render(<EmotionsMatchGame onGameEnd={onGameEnd} />) })
    mockSpeak.mockClear()
    const replay = screen.getByLabelText(/powiedz ponownie/i)
    await act(async () => { await userEvent.click(replay) })
    const correctId = screen.getByTestId('correct-emotion-id').textContent
    const polishNameById = {
      happy: 'Wesoły', sad: 'Smutny', angry: 'Zły', scared: 'Przestraszony',
      surprised: 'Zaskoczony', tired: 'Zmęczony', silly: 'Głupkowaty', calm: 'Spokojny',
    }
    expect(mockSpeak).toHaveBeenCalledWith(polishNameById[correctId])
  })
})
```

- [ ] **Step 2: Run the test file to verify it fails**

Run: `npx vitest run src/games/emotions-match/__tests__/EmotionsMatchGame.test.jsx`
Expected: FAIL — `Cannot find module '../index'` (or similar), since `index.jsx` doesn't exist yet.

- [ ] **Step 3: Write the component**

`src/games/emotions-match/index.jsx`:

```jsx
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import useGameSession from '../../hooks/useGameSession'
import useSpeech from '../../hooks/useSpeech'
import useQuestionAudio from '../../hooks/useQuestionAudio'
import QuizGameShell from '../../components/QuizGameShell'
import ReplayButton from '../../components/ReplayButton'
import emotions from './data/emotions'
import manifest from './manifest.json'

export default function EmotionsMatchGame({ onGameEnd }) {
  const { t } = useTranslation()
  const session = useGameSession({ gameId: 'emotions-match', items: emotions })
  const { current, index, done, showIntro, introResolved, resumeAvailable } = session

  // Unlike Fruit & Veggie ID, the emotion word IS the prompt (shown on
  // screen, never hidden) -- so speaking it aloud carries no spoiler risk.
  // It's there purely to help pre-readers, consistent with this app's
  // toddler/infant audience.
  const { speak, cancel, supported, blocked } = useSpeech()
  const announce = useCallback(emotion => {
    if (supported) speak(t(emotion.correct.nameKey))
  }, [supported, speak, t])
  const replay = useQuestionAudio({ index, current, showIntro, introResolved, done, resumeAvailable, announce, stop: cancel })

  return (
    <QuizGameShell
      session={session}
      manifest={manifest}
      onGameEnd={onGameEnd}
      instructions={t('emotionsMatch.howToPlay')}
      correctTestId="correct-emotion-id"
      prompt={q => t('emotionsMatch.prompt', { emotion: t(q.correct.nameKey) })}
      renderPromptExtra={() => supported
        ? <ReplayButton labelKey="emotionsMatch.replay" blocked={blocked} onClick={replay} />
        : null}
      getChoiceProps={emotion => ({
        'data-emotion-id': emotion.id,
        'aria-label': t(emotion.nameKey),
      })}
      renderChoiceContent={emotion => (
        <span className="game__choice-emoji" aria-hidden="true">{emotion.emoji}</span>
      )}
      renderMissedItem={emotion => (
        <>
          <span aria-hidden="true">{emotion.emoji}</span> {t(emotion.nameKey)}
        </>
      )}
    />
  )
}
```

- [ ] **Step 4: Run the test file to verify it passes**

Run: `npx vitest run src/games/emotions-match/__tests__/EmotionsMatchGame.test.jsx`
Expected: PASS, all tests green (~24 tests across the 4 `describe` blocks).

- [ ] **Step 5: Commit**

```bash
git add src/games/emotions-match/index.jsx src/games/emotions-match/__tests__/EmotionsMatchGame.test.jsx
git commit -m "feat(76): add Emotions Match game component"
```

---

### Task 3: Storybook stories

**Files:**
- Create: `src/games/emotions-match/EmotionsMatchGame.stories.jsx`

**Interfaces:**
- Consumes: default export from `./index` (Task 2).
- Produces: nothing consumed by later tasks — Storybook-only, verified by `npm run build-storybook`.

- [ ] **Step 1: Create the stories file**

`src/games/emotions-match/EmotionsMatchGame.stories.jsx` (mirrors `src/games/color-match/ColorMatchGame.stories.jsx`):

```jsx
import { useEffect, useRef } from 'react'
import EmotionsMatchGame from './index'

// The game's shuffle runs inside a useEffect gated on settings loaded from
// useSettings(), so it fires during React's commit phase -- after a plain
// decorator function would already have returned. Override Math.random
// during this wrapper's render (renders run parent-before-child, so the
// override is active before the story's own render/effects) and restore it
// on unmount, so the pin covers the story for as long as it's displayed
// without leaking into whatever story is viewed next.
const pinRandom = (Story) => {
  function PinnedRandom() {
    const original = useRef(null)
    if (original.current === null) {
      original.current = Math.random
      Math.random = () => 0.5
    }
    useEffect(() => () => {
      Math.random = original.current
    }, [])
    return Story()
  }
  return <PinnedRandom />
}

// useSettings() loads settings from localStorage inside an async effect that
// resolves during the commit phase, same timing hazard as pinRandom above.
// Seed 'playground_settings' with introDismissed for this game during the
// wrapper's render (parent-before-child) so useGameSession() sees the intro
// as already dismissed on its very first settings read and renders gameplay,
// not the GameIntro screen. Merge with whatever's already in localStorage
// (e.g. from other stories sharing the same browser context) instead of
// clobbering it.
const seedIntroDismissed = (Story) => {
  function SeededIntroDismissed() {
    const seeded = useRef(false)
    if (!seeded.current) {
      seeded.current = true
      let existing = {}
      try {
        const parsed = JSON.parse(localStorage.getItem('playground_settings') || '{}')
        existing = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
      } catch {
        existing = {}
      }
      localStorage.setItem('playground_settings', JSON.stringify({
        ...existing,
        introDismissed: { ...existing.introDismissed, 'emotions-match': true },
      }))
    }
    return Story()
  }
  return <SeededIntroDismissed />
}

export default {
  title: 'Games/EmotionsMatchGame',
  component: EmotionsMatchGame,
  decorators: [pinRandom, seedIntroDismissed],
}

export const Default = { args: { onGameEnd: () => {} } }
```

- [ ] **Step 2: Verify the Storybook build succeeds**

Run: `npm run build-storybook`
Expected: build succeeds with no errors mentioning `EmotionsMatchGame`.

- [ ] **Step 3: Commit**

```bash
git add src/games/emotions-match/EmotionsMatchGame.stories.jsx
git commit -m "feat(76): add Emotions Match Storybook stories"
```

---

### Task 4: Documentation and version bump

**Files:**
- Modify: `README.md` (games list + directory tree)
- Modify: `docs/ENHANCEMENTS.md` (remove shipped backlog item)
- Modify: `CHANGELOG.md` (new version entry)
- Modify: `package.json` (version bump)

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: nothing (terminal task before final verification).

- [ ] **Step 1: Add the game to README's feature list**

In `README.md`, after the `**Color Match**` bullet (currently line 16) and before the `**Character Match**` bullet (currently line 17), insert:

```markdown
- **Emotions Match** (quiz) — an emotion word is shown (and spoken aloud); the child picks the matching face from picture buttons
```

- [ ] **Step 2: Add the game to README's directory tree**

In `README.md`, the `games/` directory-tree comment block (currently lines 153–155) reads:

```
└── games/                     # One folder per game — animal-sounds, color-match, character-match,
    └── animal-memory-match/   #   character-match-bluey, fruit-veggie-id, animal-memory-match,
                                #   sound-memory-match; drop a new folder to add one
```

Change it to:

```
└── games/                     # One folder per game — animal-sounds, color-match, character-match,
    └── animal-memory-match/   #   character-match-bluey, fruit-veggie-id, emotions-match,
                                #   animal-memory-match, sound-memory-match; drop a new folder to add one
```

- [ ] **Step 3: Remove the shipped item from ENHANCEMENTS.md**

In `docs/ENHANCEMENTS.md`, delete this line from the **New Games** section (currently line 58):

```
- **Emotions Match** — show an emotion word ("happy", "sad"), child picks the matching face; builds emotional vocabulary.
```

- [ ] **Step 4: Bump the app version**

In `package.json`, change:

```json
  "version": "1.0.7",
```

to:

```json
  "version": "1.0.8",
```

- [ ] **Step 5: Add a CHANGELOG entry**

In `CHANGELOG.md`, insert a new section above the current `## [1.0.7]` entry:

```markdown
## [1.0.8] - 2026-08-04

### Added

- Emotions Match (issue #76): a new quiz-type game teaching emotional vocabulary. An emotion word is shown on screen as the prompt itself (unlike Fruit & Veggie ID, which hides its word to avoid spoiling the picture answer — here the word *is* the answer key, so there's no spoiler risk) and spoken aloud via the existing `useSpeech`/`useQuestionAudio`/`ReplayButton` stack for pre-readers; the child taps the matching face among plain-emoji picture-only choices. Ships 8 emotions (happy, sad, angry, scared, surprised, tired, silly, calm) chosen for being visually distinct at a glance, full en/es/pl i18n, and no engine changes — it's a pure consumer of `QuizGameShell`/`useGameSession`, closely modeled on `src/games/fruit-veggie-id/`. Uses the `vocabulary`/`emotions` dashboard tags, the latter falling back to the existing auto-capitalize tag-label behavior other untranslated tags (e.g. `food`) already rely on.
- Added `src/games/emotions-match/__tests__/emotions.test.js` (positive: exactly 8 emotions, each with id/nameKey/emoji, nameKey follows the `emotion.<id>.name` convention, every key resolves in i18n; negative: no duplicate ids or emoji) and `EmotionsMatchGame.test.jsx` (full session flow, intro, session-resume, es/pl locale speech, a11y, and the speech-unsupported case — the word prompt still renders since it was never hidden, and the replay button is absent).
```

- [ ] **Step 6: Run the full verification suite**

Run: `npm run lint && npm run lint:css && npm run coverage && npm run build`
Expected: lint and lint:css report no new errors (pre-existing `useGameSession.js` warnings from an earlier, unrelated change may still appear); the full unit suite passes with the emotions-match tests included; the production build succeeds.

- [ ] **Step 7: Commit**

```bash
git add README.md docs/ENHANCEMENTS.md CHANGELOG.md package.json
git commit -m "docs(76): document Emotions Match, remove shipped backlog item, bump version to 1.0.8"
```
