# ThePlayground — Infant Game Dashboard Design Spec

**Date:** 2026-06-07  
**Status:** Approved

---

## Overview

A browser-based game dashboard for an infant, built with React + Vite. Games are self-contained plugins dropped into a folder — no manual wiring needed. The first game is Animal Sounds: an animal image and sound are presented, and the child selects the correct animal from large visual buttons. Scores are persisted via a swappable storage adapter (localStorage today, backend-ready for the future).

---

## 1. Tech Stack

- **Framework:** React + Vite
- **Routing:** React Router
- **Testing:** Vitest + React Testing Library + @testing-library/user-event + jsdom
- **Styling:** Plain CSS with custom properties (no CSS framework)
- **Storage:** Adapter pattern — localStorage adapter active today, interface is backend-agnostic

---

## 2. Project Structure

```
ThePlayground/
├── public/
├── src/
│   ├── games/
│   │   └── animal-sounds/
│   │       ├── __tests__/
│   │       │   ├── AnimalSoundsGame.test.jsx
│   │       │   └── animals.test.js
│   │       ├── manifest.json
│   │       ├── index.jsx
│   │       ├── data/animals.js
│   │       └── sounds/               ← .mp3 files, one per animal
│   ├── components/
│   │   ├── __tests__/
│   │   │   ├── Dashboard.test.jsx
│   │   │   ├── GameCard.test.jsx
│   │   │   └── ScoreHistory.test.jsx
│   │   ├── Dashboard.jsx
│   │   ├── GameCard.jsx
│   │   └── ScoreHistory.jsx
│   ├── admin/
│   │   ├── __tests__/
│   │   │   └── AdminPage.test.jsx
│   │   └── AdminPage.jsx
│   ├── hooks/
│   │   ├── __tests__/
│   │   │   ├── useSettings.test.js
│   │   │   └── useScores.test.js
│   │   ├── useSettings.js
│   │   └── useScores.js
│   ├── storage/
│   │   ├── adapter.js               ← interface definition/documentation
│   │   ├── localStorageAdapter.js   ← active implementation
│   │   └── index.js                 ← exports active adapter
│   ├── App.jsx
│   └── index.css
├── vite.config.js
└── package.json
```

---

## 3. Routes

| Path | Component | Description |
|---|---|---|
| `/` | `Dashboard` | Card grid of all discovered games |
| `/game/:gameId` | (lazy-loaded game component) | Plays the selected game |
| `/admin` | `AdminPage` | Parent-facing settings panel |

---

## 4. Game Plugin System

### Contract

Every game must provide:

**`manifest.json`**
```json
{
  "id": "animal-sounds",
  "name": "Animal Sounds",
  "description": "Match the animal to its sound!",
  "icon": "🐘",
  "color": "#B39DDB"
}
```

**`index.jsx`** — default export is a React component that receives:
```js
{ onGameEnd: (score: number, total: number) => void }
```
The game calls `onGameEnd` when the session is complete.

### Auto-Discovery

`App.jsx` uses Vite's glob import at build time:
```js
const manifests = import.meta.glob('./games/*/manifest.json', { eager: true })
const games     = import.meta.glob('./games/*/index.jsx')
```

The dashboard renders one `GameCard` per manifest. Clicking a card lazy-loads the game component via the second glob. Adding a new game requires only dropping a correctly structured folder into `src/games/` and rebuilding.

---

## 5. Animal Sounds Game

### Animal Data

`data/animals.js` exports an array of objects:
```js
{ id: "elephant", name: "Elephant", emoji: "🐘", sound: "elephant.mp3" }
```

Starting set (12 animals): elephant, lion, cow, dog, cat, frog, duck, horse, pig, sheep, rooster, owl.

### Session Flow

1. Read `questionsPerSession` and `numChoices` from settings
2. Shuffle full animal list, take first `min(questionsPerSession, animals.length)` entries as the question queue
3. For each question:
   - Auto-play the animal's `.mp3` sound on mount
   - Show a replay 🔊 button on the question card
   - Display `numChoices` answer cards (1 correct + random wrong picks), shuffled
   - Child taps a card → evaluate answer
   - **Correct:** card pulses green + plays cheerful chime → advance per feedback mode
   - **Wrong:** card shakes red + plays soft buzz, correct card highlights green → advance per feedback mode
   - **Immediate mode:** auto-advance after 1500ms
   - **Parent-tap mode:** show a "Next →" button, wait for tap
4. After all questions: the game component calls `useScores.addScore()` to persist the result, then shows the results screen (`score / total`, celebratory emoji, "Play Again" and "Home" buttons)
5. "Play Again" restarts the session; "Home" calls `onGameEnd(score, total)` to signal the router to return to the dashboard — `onGameEnd` is a navigation signal only, not responsible for saving scores

### Scoring

- Each correct answer = 1 point
- Score saved on session end via `useScores.addScore()`

---

## 6. Storage Adapter

### Interface (`storage/adapter.js`)

```js
{
  getScores:    async () => Score[],
  addScore:     async (result: Score) => void,
  getSettings:  async () => Settings,
  saveSettings: async (settings: Settings) => void,
}
```

### Data Shapes

**Score:**
```json
{
  "gameId": "animal-sounds",
  "score": 8,
  "total": 10,
  "date": "2026-06-07",
  "timestamp": 1780847210252
}
```

**Settings:**
```json
{
  "numChoices": 2,
  "feedbackMode": "immediate",
  "questionsPerSession": 10
}
```

### Active Adapter

`storage/index.js` exports `localStorageAdapter` today. Switching to a backend adapter requires writing a new adapter file and updating this single export — no hooks or game code changes needed.

### localStorage Keys

- `playground_scores` — JSON array of Score objects, appended on each game end
- `playground_settings` — JSON object, overwritten on each settings change

---

## 7. Hooks

### `useSettings`
- `settings` — settings object with defaults merged in for any missing keys
- `updateSetting(key, value)` — writes a single setting immediately via the adapter
- Defaults: `{ numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 10 }`

### `useScores`
- `addScore(result)` — appends a score record via the adapter
- `getScoresByGame(gameId)` — returns all scores for a game, newest first
- `getBestScore(gameId)` — returns highest score for a game
- `getAllScores()` — returns full score history

Hooks import only from `src/storage/index.js` — backend-agnostic.

---

## 8. Admin Settings Page

Accessible via a ⚙️ gear icon in the corner of the dashboard. Route: `/admin`.

| Setting | Control | Default |
|---|---|---|
| Number of answer choices | Radio: 2 / 3 / 4 | 2 |
| Feedback mode | Toggle: Immediate / Parent tap | Immediate |
| Questions per session | Radio: 5 / 10 / 15 / 20 | 10 |

- Changes persist immediately on each interaction (no submit button)
- "Reset to defaults" button restores all settings to defaults
- No authentication — personal-use app

---

## 9. Dashboard

- Card grid layout, responsive (mobile-first, scales to tablet and desktop)
- One `GameCard` per discovered game manifest
- Each `GameCard` shows: icon, name, description, best score (from `useScores`)
- ⚙️ gear icon in top-right corner navigates to `/admin`
- Cards are large (minimum 64×64px tap targets throughout the entire app)

---

## 10. Color Theme & Design System

**Ocean & Dream palette:**

```css
:root {
  --color-aqua:     #80DEEA;
  --color-teal:     #80CBC4;
  --color-lavender: #B39DDB;
  --color-lilac:    #CE93D8;
  --color-bg:       #F0FDFF;
  --color-surface:  #FFFFFF;
  --color-text:     #37474F;

  --radius-card:    20px;
  --radius-button:  16px;
  --font-main:      'Nunito', sans-serif;
}
```

**UI principles:**
- Minimum tap target: 64×64px
- Minimum text size: 18px; game labels 24px+
- Card shadows: `box-shadow: 0 4px 16px rgba(0,0,0,0.1)`
- Correct answer: green glow pulse animation
- Wrong answer: horizontal shake + red tint animation
- All transitions: ≤300ms

---

## 11. Testing Coverage

| File | What is tested |
|---|---|
| `AnimalSoundsGame.test.jsx` | Correct/wrong answer flow, score accumulation, question progression, session end |
| `animals.test.js` | Every animal entry has id, name, emoji, and a sound file reference |
| `Dashboard.test.jsx` | Renders one card per manifest, best score displayed |
| `GameCard.test.jsx` | Click navigates to correct game route |
| `ScoreHistory.test.jsx` | Renders score list in correct order |
| `AdminPage.test.jsx` | Each setting change calls adapter, reset restores defaults |
| `useSettings.test.js` | Defaults applied, read/write, persistence across hook instances |
| `useScores.test.js` | addScore appends, getBestScore returns max, getScoresByGame filters correctly |

All hook tests use a mock adapter — no localStorage in tests.

---

## 12. Future Considerations

- Backend storage adapter (Supabase, Firebase, or custom API) — adapter interface is already in place
- Admin page password protection
- Additional games (colors, shapes, numbers) — drop a folder into `src/games/`
- Difficulty levels per game
- Per-child profiles
