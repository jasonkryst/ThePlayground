# The Playground

[![CI](https://github.com/jasonkryst/ThePlayground/actions/workflows/ci.yml/badge.svg)](https://github.com/jasonkryst/ThePlayground/actions/workflows/ci.yml)
[![Copilot](https://github.com/jasonkryst/ThePlayground/actions/workflows/agents/copilot-pull-request-reviewer/badge.svg)](https://github.com/jasonkryst/ThePlayground/actions/workflows/agents/copilot-pull-request-reviewer)
[![Docker Release](https://github.com/jasonkryst/ThePlayground/actions/workflows/docker-image.yml/badge.svg)](https://github.com/jasonkryst/ThePlayground/actions/workflows/docker-image.yml)

A browser-based game dashboard designed for infants and toddlers. Games are displayed as large, tappable cards. Each game is self-contained in its own folder — adding a new game requires no changes to the core application.

## Features

- **Ocean & Dream design** — soft aquas, teals, lavenders, and lilacs; 64×64 px minimum tap targets on primary/child-facing controls (compact secondary controls in parent-only surfaces, like the admin tab bar, are a deliberate exception — see `docs/accessibility_usability.md`)
- **Auto-discovered games** — drop a folder into `src/games/` and it appears on the dashboard automatically
- **Two game types** — *quiz games* (a prompt is shown or played; the child picks the matching answer from picture buttons) and *memory games* (face-down tiles flipped two at a time to find pairs)
- **Animal Sounds** (quiz) — an animal sound plays automatically; the child picks the matching animal from picture buttons
- **Fruit & Veggie ID** (quiz) — a fruit or vegetable's name is spoken aloud (browser speech synthesis); the child taps the matching picture from picture-only buttons (falls back to on-screen text where the browser has no speech synthesis)
- **Color Match** (quiz) — a color swatch is shown; the child picks the matching colored object from picture buttons
- **Emotions Match** (quiz) — an emotion word is shown (and spoken aloud); the child picks the matching face from picture buttons
- **Character Match** (quiz) — a character's name is shown; the child picks the matching character from picture buttons (real images rather than emoji)
- **Character Match: Bluey** (quiz) — the same Character Match gameplay, themed around the Bluey cast, as its own auto-discovered game with its own manifest and assets
- **Animal Memory Match** (memory) — face-down tiles (3–6 animal pairs, parent-configurable); the child flips two at a time, hearing the animal's sound on each match, with fireworks on completing the board
- **Sound Memory Match** (memory) — the same memory engine, but a tile's sound *is* its face: flipping a tile plays a clip instead of revealing a picture, so pairs are found by ear rather than by sight; a matched pair reveals its real picture afterward as a reward, never as a hint beforehand
- **Admin / Settings** — tabbed settings page (Settings · Games · Badges · History); configure child's name, answer choices (2–4), feedback mode, questions per session, memory board size, Google Analytics ID, and per-game tag overrides
- **Parental Lock** — `/admin` and `/parent` are gated behind a generated math challenge by default (or an optional 4-digit PIN a parent sets), so a toddler tapping around the dashboard can't reach settings or the parent dashboard
- **My Progress page** — a kid-facing `/my-progress` page (🌟 link on the dashboard) showing each game's best score, best streak, total questions answered, and earned badges (memory games show fewest flips and pairs matched instead of score/questions), with locked badges shown dimmed rather than as unreadable text; separate from the parent-facing `/parent` analytics dashboard and the admin `/admin` settings page
- **How-to-play intro screens** — each game shows a brief instructional screen before its first question; parents can permanently dismiss it per game, or bring it back from the admin Games tab
- **Persistent scoring** — game history stored in `localStorage`; swappable for a backend without touching game code (see [Storage Adapter](#storage-adapter))
- **Personal bests** — quiz games track best accuracy and average answer speed; memory games track fewest flips and fastest board time per board size; new records are announced on the results screen
- **Milestone badges** — repeatable per-game achievements (streak tiers, perfect sessions, lifetime totals); memory games ship their own badge catalog via per-game `badges.js` files
- **Kid-safe exit guard** — leaving a game mid-session requires a deliberate second tap, so a stray toddler tap can't kill a session
- **Session resume** — a browser crash, tab close, reload, or even a deliberate exit mid-session leaves a resumable snapshot; reopening that game within 4 hours offers to continue where the child left off, or start fresh
- **Version display** — app version shown in the dashboard footer; game version shown alongside it on game routes
- **Google Analytics** — optional GA4 tracking configured at runtime via the admin page; fires page view events on every React Router navigation (off by default — see [`SECURITY.md`](SECURITY.md))

---

## Dashboard Features

### Daily Challenge

Each day, one game is automatically selected as "Today's Game" and displayed as a featured hero card above the game grid. The selection is deterministic (based on a date-seeded hash), so all users see the same featured game each day. This encourages daily return visits and variety in play. The banner stays visible no matter which category tab is selected, and the featured game also appears in its normal category section or grid position — it is not hidden or removed from the list underneath.

### Recently Played Badges

When a game has been played, its card displays a colored glow border and a badge showing when it was last played:

- "Today · N plays" — played today
- "Yesterday · N plays" — played yesterday
- "N days ago · N plays" — played N days ago

This visual indicator comes from your existing score history with no additional storage needed.

### Game Categories & Tags, Search

Games are organized under category headings ("Sounds 🔊", "Visual 👁️", "Memory 🧠", etc.) on the dashboard. A search box filters games by name, and a row of tag pills below it lets parents select one or more categories at once — a game must carry every selected tag to stay visible (e.g. "Visual" + "Colors" narrows to games tagged with both). Selected pills always sort to the front of the row so an active filter is never hidden; once there are more tags than fit on one line, the rest collapse behind a "+N more" toggle. A "Clear filters" button appears whenever search text or a tag is active, resetting both at once. The "Today's Game" featured banner is unaffected by any of this and always stays at the top.

Each game's category is defined by a `"tags"` array in its `manifest.json` (required field, minimum one tag). Tags can be customized per-game in the admin panel under the **Games** tab, allowing you to reorganize games without modifying code.

### How-to-Play Intro

The first time a game is opened, it shows a full-screen intro with the game's icon, name, and a one-sentence explanation of how to play, before any question appears. A "Don't show this again" checkbox permanently dismisses it for that game (stored in the `introDismissed` setting); leaving it unchecked means the intro reappears the next time the game is opened fresh (it does not reappear after tapping "Play Again" within the same visit). Parents can bring back a dismissed intro from the admin page's **Games** tab via the "Replay Intro" button next to each game's tags.

### My Progress Page

A dedicated `/my-progress` page, linked via the 🌟 button on the main dashboard, shows kids their own progress: for each game, a best-score percentage, best streak, and lifetime questions answered, plus every milestone badge earned so far. Memory games show memory-appropriate stats instead — fewest flips and lifetime pairs matched. Locked badges are shown as dimmed icons with no text label (rather than the admin page's "Locked" text), since the intended audience can't read yet — earned/locked state is still conveyed to assistive tech via each badge's `aria-label`.

### Parent Analytics Dashboard

A dedicated `/parent` page shows five sections built from score history: **Score Trend** (accuracy % per game over time), **Response Time** (average answer speed per game), **Streak History** (longest correct-answer run in the last 7 days, last 30 days, and all-time), **Play Calendar** (a GitHub-style heatmap of daily activity, with month labels above the week columns), and **Missed Items** (which items are answered incorrectly most often, per game).

Every section reacts to the **date-range filter** at the top of the page: quick presets (7 days / 30 days / 90 days / All time) or a custom from–to range. The heatmap resizes to span exactly the selected range instead of always showing a fixed window, and Streak History's "last 7/30 days" columns re-anchor to the end of the selected range rather than always meaning "as of right now" — so a past custom range still shows meaningful streak data. The selected range is remembered across visits (stored alongside the other settings). CSV export via the toolbar button reflects whatever range is currently active.

---

## Getting Started

**Prerequisites:** Node.js 18+

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The dashboard appears immediately; tap any game card to play.

For production builds, Docker deployment, and self-hosting guidance, see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server with hot reload (port 5173) |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Unit/component tests (Vitest), watch mode |
| `npm run coverage` | Run tests once and generate coverage report |
| `npm run lint` | ESLint (including `eslint-plugin-jsx-a11y`) |
| `npm run lint:css` | Stylelint over every source `.css` file |
| `npm run e2e` | Playwright: end-to-end + accessibility + visual regression + HTML5/CSS validation |
| `npm run validate:html` | HTML5 validation of the rendered DOM only (subset of `e2e`) |
| `npm run validate:css` | CSS validation of dynamic inline styles only (subset of `e2e`) |
| `npm run storybook` | Browse component/game stories at [localhost:6006](http://localhost:6006) |
| `npm run build-storybook` | Production Storybook build check |
| `npm run mutation` | Mutation testing (Stryker) over core hooks/utils |

---

## Architecture

```text
src/
├── App.jsx                    # Auto-discovery routing, GA loader, locale sync
├── index.css                  # Design system (CSS custom properties)
├── main.jsx                   # React entry point
│
├── components/                # Shared UI: AppShell (persistent header, route-aware footer + exit guard),
│                              #   ShellContext, Dashboard, GameCard, FeaturedGameCard, CategorySection,
│                              #   GameIntro, GameResults, QuizGameShell, GameChoiceGrid, MemoryBoard, Timer,
│                              #   StreakBadge, BadgeGallery, ScoreHistory, ManifestIcon, ExitConfirmDialog,
│                              #   LocaleSelector, ParentalLockGate, OrientationGate/OrientationGateContext/
│                              #   OrientationOverlay, ReplayButton, ResumePrompt, TagFilterBar
├── admin/
│   └── AdminPage.jsx          # Settings, game tags, badges, score history (tabbed)
├── parent/
│   └── ParentDashboard.jsx    # Score/response-time charts, streak history, play calendar, missed items
├── kids/
│   └── KidsProgressPage.jsx   # Kid-facing per-game stats + badges (/my-progress)
│
├── hooks/                     # useGameSession (quiz loop), useMemorySession (memory loop),
│                              #   useSettings, useScores, useBadges, useBestStreak, usePersonalBest,
│                              #   useSoundPlayer, useFocusOnMount, useFeaturedGame, useRecentlyPlayed, useGameTags,
│                              #   useParentalLockSession, useItemStats, useOrientation, useQuestionAudio,
│                              #   useSpeech, useFitTileSize, useHeaderHeightVar, useTagRowOverflow
├── lib/                       # badges.js (quiz badge catalog), confetti.js, soundLibrary.js, parentalLock.js
├── utils/                     # buildQueue, buildDeck, reinsertMissed, idealColumns, kidStats,
│                              #   dashboardUtils, dateRangeUtils, computeBadgeAwards,
│                              #   computeGameBadgeAwards, evaluatePersonalBest, evaluateMemoryPersonalBest,
│                              #   computeItemWeight, weightedShuffle, sessionResume
├── assets/
│   └── sounds/                # Shared sound library (animal mp3s and future effect sounds)
│
├── storage/
│   ├── adapter.js             # Interface definition + DEFAULT_SETTINGS (every stored shape documented here)
│   ├── localStorageAdapter.js # localStorage implementation
│   └── index.js               # Active adapter export (swap here for a backend)
│
├── i18n/
│   ├── en.json                # Core cross-cutting strings (common, dashboard, admin, ...)
│   ├── es.json                # Spanish translation, same structure as en.json
│   ├── pl.json                # Polish translation, same structure as en.json
│   └── index.js               # Merges en.json/es.json/pl.json + every game's i18n/*.json at startup
│
└── games/                     # One folder per game — animal-sounds, color-match, character-match,
    └── animal-memory-match/   #   character-match-bluey, fruit-veggie-id, emotions-match,
                                #   animal-memory-match, sound-memory-match; drop a new folder to add one
        ├── manifest.json      # Game metadata (id, nameKey/descriptionKey, tags, version, optional gameType, orientation)
        ├── index.jsx          # Game component (default export accepting onGameEnd)
        ├── badges.js          # Optional per-game badge catalog (auto-discovered)
        ├── data/              # Item catalog (e.g. animals.js, colors.js)
        ├── i18n/en.json       # This game's own strings — auto-merged, no shared file to edit
        ├── i18n/es.json       # Spanish translation of the same strings
        ├── i18n/pl.json       # Polish translation of the same strings
        └── <assets>/          # Images/audio, game-specific
```

### Auto-Discovery

`App.jsx` uses Vite's `import.meta.glob` to scan for games at build time:

```js
const manifestModules = import.meta.glob('./games/*/manifest.json', { eager: true })
const gameModules     = import.meta.glob('./games/*/index.jsx')
```

Every `manifest.json` becomes a dashboard card. Every `index.jsx` becomes a lazy-loaded route at `/game/<id>`. No imports, no registries — just files. The same auto-discovery principle covers a game's translations (`src/games/<id>/i18n/en.json`, merged at startup) and its optional badge catalog (`src/games/<id>/badges.js`).

### Wrapper UI (AppShell)

Every route renders inside `AppShell`, a React Router layout route that owns the
page chrome: brand/home link, contextual nav, back links, page titles, footer,
and the kid-safe exit guard on game routes. Games must NOT render their own
`header`/`main`/`footer` — they render a `<div className="game">` (layout in
`src/components/GameLayout.css`) and report live status to the shell with:

```jsx
useShellGameStatus({ streak, sessionActive: introResolved && !showIntro && !done })
```

While `sessionActive` is true, leaving the game (home button, brand link, or
the browser back button) opens a confirm overlay instead of navigating, so a
stray toddler tap can't kill a session. The guard is fail-open: a game that
never reports status can always be exited immediately.

### Storage Adapter

All persistence goes through the paired get/save interface defined in `src/storage/adapter.js` — 15 methods across 7 groups (6 get/save pairs plus a 3-method session-resume group):

```js
getScores()                  // → Promise<Score[]>
addScore(score)              // → Promise<void>
getSettings()                // → Promise<Settings>
saveSettings(settings)       // → Promise<void>
getBestStreaks()             // → Promise<{ [gameId]: number }>
saveBestStreaks(streaksMap)  // → Promise<void>
getPersonalBests()           // → Promise<{ [gameId]: { accuracy?, speedMs?, fewestFlips?, fastestMs? } }>
savePersonalBests(bestsMap)  // → Promise<void>
getBadgeData()               // → Promise<{ awards, lifetimeQuestions, lifetimeCounters }>
saveBadgeData(data)          // → Promise<void>
getItemStats()               // → Promise<{ [gameId]: { [itemId]: { missCount, lastMissedAt } } }>
saveItemStats(data)          // → Promise<void>
getSessionResume()           // → Promise<SessionResumeState | null>
saveSessionResume(state)     // → Promise<void>
clearSessionResume()         // → Promise<void>
```

**Score shape:** every record carries the base `{ gameId, score, total, date, timestamp }`. Quiz sessions add `peakStreak` and a `timings[]` array (`{ questionIndex, itemId, correct, durationMs, attemptNumber, timedOut? }` per question). Memory sessions add `flipAttempts`, `mismatches`, `peakMatchStreak`, and `durationMs`. The JSDoc in `src/storage/adapter.js` is the authoritative contract for every stored shape.

The active adapter is exported from `src/storage/index.js`. To swap `localStorage` for Supabase, Firebase, or any other backend, implement these 15 methods and change that one export — no game code or hook changes needed. Games consume shared state through the `useSettings`/`useScores` hooks (and friends) rather than props drilling.

A new adapter's compliance with this interface is enforced by a shared contract test suite (`src/storage/__tests__/adapterContract.js`) rather than left to convention — see [`docs/TESTING.md`](docs/TESTING.md) § Layer 1.

### Design Tokens

All colors and radii are CSS custom properties defined in `src/index.css`:

```css
--color-aqua:       #80DEEA   /* each hue has a -dark variant for higher-contrast pairings */
--color-teal:       #80CBC4   /* (--color-aqua-dark, --color-teal-dark, etc.) */
--color-lavender:   #B39DDB
--color-lilac:      #CE93D8
--color-error:      #c62828
--color-bg:         #F0FDFF
--color-surface:    #FFFFFF
--color-text:       #37474F
--color-text-muted: #5B6B70
```

Use `var(--color-aqua)` etc. rather than hardcoding hex values, so games stay visually consistent with the dashboard.

---

## Adding a New Game

1. Create a folder under `src/games/<your-game-id>/`
2. Add `manifest.json` — `tags` is **required** (it places the game in a dashboard category). `nameKey`/`descriptionKey` point at strings you'll add to the game's own `i18n/en.json`/`es.json`/`pl.json` (step 4) rather than literal text:

   ```json
   {
     "id": "your-game-id",
     "nameKey": "yourGame.manifestName",
     "descriptionKey": "yourGame.manifestDescription",
     "icon": "🎮",
     "color": "#80DEEA",
     "version": "1.0.0",
     "tags": ["visual"]
   }
   ```

   The `icon` value is normally an emoji, rendered as text — it's always required, even for games using an image icon (it's the fallback if the image is ever removed). To use an image instead, drop an `icon.png`/`icon.gif`/`icon.jpg`/`icon.jpeg`/`icon.webp`/`icon.svg` file directly in the game's own folder (see Character Match) — it's auto-discovered and rendered in place of the emoji, no manifest field needed. Each game may have at most one `icon.<ext>` file. Memory-type games add `"gameType": "memory"`, which switches the My Progress page to memory-appropriate stat tiles.

   Games that only lay out well in one orientation can add `"orientation": "landscape"` or `"orientation": "portrait"`. The engine then enforces it for that game's whole route: a full-screen rotate prompt blocks play (and pauses the memory-session/quiz-session timer) whenever the device/viewport is in the wrong orientation, the intro slide announces the requirement, and the dashboard card shows a ↔️ *Landscape only* badge (or a ↕️ *Portrait only* badge). Detection is hybrid — physical device orientation on touch devices, viewport aspect ratio on desktop. No game code is needed beyond the manifest field (pass `manifest.orientation` to `GameIntro` if the game renders its own intro).

3. Add `index.jsx` with a default export that accepts `onGameEnd`:

```jsx
export default function YourGame({ onGameEnd }) {
  // call onGameEnd() when the session is complete
  return <div>Your game here</div>
}
```

That's it — the game appears on the dashboard and gets its own route automatically.

**Optional extension points, all auto-discovered:**

- `i18n/en.json` — the game's own UI strings and item names, merged into the app's i18n resources at startup (see [`docs/TESTING.md`](docs/TESTING.md) for the string conventions).
- `badges.js` — a per-game badge catalog that fully replaces the global quiz catalog for that game (Animal Memory Match's six badges work this way).

**Engine hooks:** quiz games get their entire session loop (queue building, retries, hints, timers, scoring, personal bests, badges, intro screen) from `useGameSession`; memory games use `useMemorySession`. Settings and score persistence come from `useSettings` / `useScores`:

```js
import useSettings from '../../hooks/useSettings'
import useScores   from '../../hooks/useScores'

const { settings } = useSettings()
const { addScore }  = useScores()
```

New quiz games should render their answer choices via `GameChoiceGrid` (render-prop pattern — see `AnimalSoundsGame`/`ColorMatchGame`) rather than duplicating the correct/wrong/hint/disabled logic.

---

## Deployment

Two supported paths:

- **Static hosting:** `npm run build` produces a fully static `dist/` — serve it from any web server that can fall back to `index.html` for unmatched routes.
- **Docker:** a two-stage build (Node compiles, `nginxinc/nginx-unprivileged:1.30-alpine` serves as a non-root user, ~25 MB image). `docker compose up --build`, then open [http://localhost:8080](http://localhost:8080).

The full guide — annotated nginx configuration, cache tiers, HTTPS/reverse-proxy setup, data persistence and backup, troubleshooting — is in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

## Testing

The Playground has six layers of automated testing — unit/component (Vitest + RTL), accessibility audits (jest-axe + axe-core/playwright), end-to-end (Playwright), visual regression (Storybook + Playwright screenshots), HTML5 validation against the rendered DOM (html-validate), and CSS validation of dynamic inline styles (Stylelint against the live DOM) — all runnable locally with no external accounts. Static linting (ESLint with `eslint-plugin-jsx-a11y`, Stylelint against every `.css` source file) catches most CSS3/accessibility conformance issues at edit time, before any of the above run. All six layers, plus a Docker build check, a two-tier `npm audit` gate, a Trivy container image scan, and Lighthouse performance/accessibility budgets, also run in CI on every push and pull request (`.github/workflows/ci.yml`) — see [`docs/TESTING.md`](docs/TESTING.md) for the full reference, including how to run each layer and update visual baselines.

```bash
npm test           # unit/component tests, watch mode
npm run lint       # ESLint (incl. jsx-a11y)
npm run lint:css   # Stylelint (source .css files)
npm run e2e        # end-to-end + accessibility + visual regression + HTML5/CSS validation
npm run storybook  # browse component/game stories locally
```

---

## Settings Reference

Accessible from the dashboard via the gear icon (⚙).

| Setting | Default | Options |
|---|---|---|
| Child's Name | *(empty)* | Any text |
| Language | English | English, Español, Polski |
| Answer choices | 2 | 2, 3, 4 |
| Feedback mode | Immediate | Immediate, Parent tap |
| Questions per session | 10 | 5, 10, 15, 20 |
| Celebration animations | On | On, Off |
| Timer | Show timer | Off, Show timer, Answer within 5/10/15/20s |
| Speed record threshold | 70% | 70, 75, 80, 85, 90, 95, 100 |
| Retry attempts | None | None, 1, 2, 3, 4, 5, Unlimited |
| Hints | Off | On, Off |
| Show hint after | 2 | 1, 2, 3, 4, 5 (only shown when Hints is On) |
| Retry counts toward streak | On | On, Off |
| Spaced repetition | Off | On, Off |
| Adaptive item selection | Off | On, Off |
| Difficulty auto-progression | Off | On, Off |
| Pairs per board | 5 | 3, 4, 5, 6 |
| Sound effects | On | On, Off |
| Theme | System | System, Light, Dark, High Contrast |
| Google Analytics ID | *(empty)* | Any valid GA4 Measurement ID (e.g. `G-XXXXXXXXXX`) |
| Parental Lock | On (math challenge) | On/Off; optional 4-digit PIN |

**Questions per session** — if a game's item set is smaller than the selected count (for example, a 12-item game with "20" selected), items repeat to fill the session. Repeats are distributed evenly across the pool and the same item is never asked twice in a row.

**Immediate** — correct/wrong feedback shown instantly; next question advances automatically after 1.5 s.

**Parent tap** — feedback shown after a parent taps "Next", giving time to discuss the answer.

**Google Analytics** — when a Measurement ID is entered, the GA4 script is injected at runtime and page view events fire on every navigation. Leaving the field blank disables tracking entirely. The ID is stored in `localStorage` alongside other settings. See [`SECURITY.md`](SECURITY.md) for the privacy analysis.

**Parental Lock** — gates `/admin` and `/parent` behind a single shared unlock: by default, a generated math problem (e.g. "What's 7 + 8?"); setting a 4-digit PIN here replaces it with that PIN instead, until removed. Unlocking once covers the rest of the browser session (closing the tab/browser re-locks it). See [`SECURITY.md`](SECURITY.md#parental-lock) for what this does and doesn't protect against.

**Child's Name** — when set, the dashboard title reads "&lt;Name&gt;'s Playground"; when left blank, it shows the default "My Playground".

**Celebration animations** — when on, a confetti burst plays on every correct answer (and fireworks on completing a memory board) and the game header shows the current answer streak once it reaches 2; the end-of-game screen lists any missed items. Turning this off disables the confetti only — streak tracking and the missed-items summary remain.

**Theme** — "System" follows the device's light/dark preference automatically; "Light", "Dark", and "High Contrast" are explicit overrides. Also reachable via a quick-toggle button in the header on every page (cycles through all four), independent of the Admin page. All three rendered themes (Light, Dark, High Contrast) meet WCAG AA contrast (4.5:1 text, 3:1 borders/non-text).

**Timer** — "Show timer" is a running stopwatch, purely informational. "Answer within Ns" instead counts down; when it reaches zero the question locks in as missed (same as exhausting retries) and always advances after a "Time's up!" message, regardless of feedback mode. "Off" hides the timer and enforces no limit. Memory games use the stopwatch for the fastest-board record but are not subject to the countdown.

**Speed record threshold** — the minimum session accuracy required for a new average-speed personal best to be announced, so a fast-but-mostly-wrong session can't set a "speed record."

**Retry attempts** — how many wrong taps are allowed on a question before it locks in as missed. "None" reproduces the original behavior (locks on the very first wrong tap). Each wrong choice becomes disabled (but stays visible) so the child can try a different one.

**Hints** — when on, the correct answer is highlighted once the child has reached "Show hint after" wrong taps on the current question, without locking it. The highlight starts subtle and grows bolder with each further wrong tap, reaching full strength on the last try before the question locks in as missed (or, with Retry attempts set to Unlimited, after a fixed few wrong taps past the threshold).

**Retry counts toward streak** — when on, getting a question right after 1+ wrong taps still counts toward the answer streak. When off, a correct-after-retry still scores as correct but resets the streak to 0.

**Spaced repetition** — when on, a missed item reappears a few questions later in the same session (replacing one of the not-yet-asked items, so the session length stays the same).

**Adaptive item selection** — when on, future sessions weight their queue toward items your child has missed before (weighted more heavily the more recently they were missed), on top of — and independent from — same-session spaced repetition.

**Difficulty auto-progression** — when on, finishing a session with a perfect score offers to raise Answer Choices by 1 (up to the maximum of 4) on the results screen.

**Pairs per board** — pairs per board for memory games, 3–6 (10 tiles at the default 5).

**Sound effects** — gates memory-game celebration sounds (e.g. the matched animal's sound) and quiz games' correct/wrong chimes.

---

## Versioning

The app version is read from `package.json` at build time (via Vite's JSON import) and displayed in the dashboard footer. Each game's version comes from its own `manifest.json` and is shown in the footer on that game's route.

To release a new version, bump `version` in `package.json` and the relevant game `manifest.json` files, add a `CHANGELOG.md` entry, then rebuild.

---

## Animal Sounds Game

Animals: elephant, lion, cow, dog, cat, frog, duck, horse, pig, sheep, rooster, owl.

Sound files live in the shared sound library (`src/assets/sounds/`) and must be named `<animal>.mp3`. Games resolve URLs through a single Vite asset glob in `src/lib/soundLibrary.js`, so the paths are production-safe and multiple games can share one copy of each file:

```js
// src/lib/soundLibrary.js
const sounds = import.meta.glob('../assets/sounds/*.mp3', { eager: true, query: '?url', import: 'default' })
```

Free CC0 animal sounds are available at [freesound.org](https://freesound.org).

---

## Documentation

| Document | What it covers |
|---|---|
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Local dev, production builds, Docker, nginx, HTTPS, data persistence, troubleshooting |
| [`SECURITY.md`](SECURITY.md) | Security posture, data privacy, children's-privacy analysis, vulnerability reporting |
| [`docs/TESTING.md`](docs/TESTING.md) | All six test layers, testing patterns and gotchas, i18n string conventions |
| [`docs/ENHANCEMENTS.md`](docs/ENHANCEMENTS.md) | Backlog of planned games, features, and technical improvements |
| [`CHANGELOG.md`](CHANGELOG.md) | Release history (Keep a Changelog format) |
