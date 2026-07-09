# The Playground

A browser-based game dashboard designed for infants and toddlers. Games are displayed as large, tappable cards. Each game is self-contained in its own folder — adding a new game requires no changes to the core application.

## Features

- **Ocean & Dream design** — soft aquas, teals, lavenders, and lilacs; 64×64 px minimum tap targets throughout
- **Auto-discovered games** — drop a folder into `src/games/` and it appears on the dashboard automatically
- **Animal Sounds** — an animal sound plays automatically; the child picks the matching animal from picture buttons
- **Color Match** — a color swatch is shown; the child picks the matching colored object from picture buttons
- **Character Match** — a character's name is shown; the child picks the matching character from picture buttons
- **Admin / Settings** — tabbed settings page (Settings · Games · History); configure child's name, answer choices (2–4), feedback mode, questions per session, Google Analytics ID, and per-game tag overrides
- **My Progress page** — a kid-facing `/my-progress` page (🌟 link on the dashboard) showing each game's best score, best streak, total questions answered, and earned badges, with locked badges shown dimmed rather than as unreadable text; separate from the parent-facing `/parent` analytics dashboard and the admin `/admin` settings page
- **How-to-play intro screens** — each game shows a brief instructional screen before its first question; parents can permanently dismiss it per game, or bring it back from the admin Games tab
- **Persistent scoring** — game history stored in `localStorage`; swappable for a backend without touching game code
- **Version display** — app version shown in the dashboard footer; game version shown in the game header
- **Google Analytics** — optional GA4 tracking configured at runtime via the admin page; fires page view events on every React Router navigation

---

## Dashboard Features

### Daily Challenge

Each day, one game is automatically selected as "Today's Game" and displayed as a featured hero card above the game grid. The selection is deterministic (based on a date-seeded hash), so all users see the same featured game each day. This encourages daily return visits and variety in play.

### Recently Played Badges

When a game has been played, its card displays a colored glow border and a badge showing when it was last played:
- "Today · N plays" — played today
- "Yesterday · N plays" — played yesterday
- "N days ago · N plays" — played N days ago

This visual indicator comes from your existing score history with no additional storage needed.

### Game Categories & Tags

Games are now organized under category headings ("Sounds 🔊", "Visual 👁️", etc.) on the dashboard. A tab strip at the top of the dashboard lets parents filter by category to see only games in a particular group.

Each game's category is defined by a `"tags"` array in its `manifest.json` (required field, minimum one tag). Tags can be customized per-game in the admin panel under the **Games** tab, allowing you to reorganize games without modifying code.

### How-to-Play Intro

The first time a game is opened, it shows a full-screen intro with the game's icon, name, and a one-sentence explanation of how to play, before any question appears. A "Don't show this again" checkbox permanently dismisses it for that game (stored in the `introDismissed` setting); leaving it unchecked means the intro reappears the next time the game is opened fresh (it does not reappear after tapping "Play Again" within the same visit). Parents can bring back a dismissed intro from the admin page's **Games** tab via the "Replay Intro" button next to each game's tags.

### My Progress Page

A dedicated `/my-progress` page, linked via the 🌟 button on the main dashboard, shows kids their own progress: for each game, a best-score percentage, best streak, and lifetime questions answered, plus every milestone badge earned so far. Locked badges are shown as dimmed icons with no text label (rather than the admin page's "Locked" text), since the intended audience can't read yet — earned/locked state is still conveyed to assistive tech via each badge's `aria-label`.

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

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run tests in watch mode |
| `npm run coverage` | Run tests once and generate coverage report |

---

## Architecture

```
src/
├── App.jsx                    # Auto-discovery routing
├── index.css                  # Design system (CSS custom properties)
├── main.jsx                   # React entry point
│
├── components/                # Shared UI: AppShell (persistent header, route-aware footer + exit guard),
│                               # ShellContext, GameCard, GameIntro/GameResults,
│                               # GameChoiceGrid, BadgeGallery, Timer, StreakBadge, ...
├── admin/
│   └── AdminPage.jsx          # Settings, game tags, badges, score history (tabbed)
├── parent/
│   └── ParentDashboard.jsx    # Score/response-time charts, streak history, missed items
├── kids/
│   └── KidsProgressPage.jsx   # Kid-facing per-game stats + badges (/my-progress)
│
├── hooks/                     # useSettings, useScores, useBadges, useGameSession, ...
├── lib/                       # badges.js, confetti.js
├── utils/                     # buildQueue, computeBadgeAwards, dashboardUtils, ...
│
├── storage/
│   ├── adapter.js             # Interface definition + DEFAULT_SETTINGS
│   ├── localStorageAdapter.js # localStorage implementation
│   └── index.js               # Active adapter export (swap here for a backend)
│
├── i18n/
│   ├── en.json                # Core cross-cutting strings (common, dashboard, admin, ...)
│   └── index.js                # Merges en.json + every game's i18n/en.json at startup
│
└── games/                     # One folder per game — animal-sounds, color-match,
    └── character-match/        # character-match today; drop a new folder to add one
        ├── manifest.json      # Game metadata (id, name, tags, version)
        ├── index.jsx          # Game component
        ├── data/               # Item catalog (e.g. characters.js)
        ├── i18n/en.json        # This game's own strings — auto-merged, no shared file to edit
        └── <assets>/           # Images/audio, game-specific
```

### Auto-Discovery

`App.jsx` uses Vite's `import.meta.glob` to scan for games at build time:

```js
const manifestModules = import.meta.glob('./games/*/manifest.json', { eager: true })
const gameModules     = import.meta.glob('./games/*/index.jsx')
```

Every `manifest.json` becomes a dashboard card. Every `index.jsx` becomes a lazy-loaded route at `/game/<id>`. No imports, no registries — just files.

### Wrapper UI (AppShell)

Every route renders inside `AppShell`, a React Router layout route that owns the
page chrome: brand/home link, contextual nav, back links, page titles, footer,
and the kid-safe exit guard on game routes. Games must NOT render their own
`header`/`main`/`footer` — they render a `<div className="game">` (layout in
`src/components/GameLayout.css`) and report live status to the shell with:

```jsx
useShellGameStatus({ streak, sessionActive: introResolved && !showIntro && !done })
```

While `sessionActive` is true, leaving the game (home button or brand link)
opens a confirm overlay instead of navigating, so a stray toddler tap can't
kill a session. The guard is fail-open: a game that never reports status can
always be exited immediately.

### Storage Adapter

All persistence goes through a four-method interface:

```js
getScores()           // → Promise<Score[]>
addScore(score)       // → Promise<void>
getSettings()         // → Promise<Settings>
saveSettings(settings)// → Promise<void>
```

The active adapter is exported from `src/storage/index.js`. To swap `localStorage` for Supabase, Firebase, or any other backend, implement those four methods and change that one export.

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

---

## Adding a New Game

1. Create a folder under `src/games/<your-game-id>/`
2. Add `manifest.json`:

```json
{
  "id": "your-game-id",
  "name": "Your Game Name",
  "description": "One sentence description.",
  "icon": "🎮",
  "color": "#80DEEA"
}
```

3. Add `index.jsx` with a default export that accepts `onGameEnd`:

```jsx
export default function YourGame({ onGameEnd }) {
  // call onGameEnd() when the session is complete
  return <div>Your game here</div>
}
```

That's it — the game appears on the dashboard and gets its own route automatically.

The game component receives settings via the `useSettings` hook and can persist scores via `useScores`:

```js
import useSettings from '../../hooks/useSettings'
import useScores   from '../../hooks/useScores'

const { settings } = useSettings()
const { addScore }  = useScores()
```

Score shape: `{ gameId, score, total, date, timestamp }`

---

## Docker

**Prerequisites:** Docker with Compose

```bash
docker compose up --build    # build image and start
docker compose up -d         # run in background after first build
```

App is served at [http://localhost:8080](http://localhost:8080).

The production image is a two-stage build: a Node LTS container compiles `dist/`, then a lean `nginx:alpine` container (~25 MB) serves the static files. `nginx.conf` includes an SPA fallback (`try_files`) so React Router routes like `/admin`, `/my-progress`, and `/game/animal-sounds` work on direct navigation and page refresh.

| File | Purpose |
|---|---|
| `Dockerfile` | Multi-stage build definition |
| `nginx.conf` | SPA routing fallback, asset caching, security headers |
| `docker-compose.yml` | Single-service compose for local/self-hosted use |
| `.dockerignore` | Excludes `node_modules`, `dist`, `coverage`, tool state |

---

## Testing

The Playground has six layers of automated testing — unit/component (Vitest + RTL), accessibility audits (jest-axe + axe-core/playwright), end-to-end (Playwright), visual regression (Storybook + Playwright screenshots), HTML5 validation against the rendered DOM (html-validate), and CSS validation of dynamic inline styles (Stylelint against the live DOM) — all runnable locally with no external accounts. Static linting (ESLint with `eslint-plugin-jsx-a11y`, Stylelint against every `.css` source file) catches most CSS3/accessibility conformance issues at edit time, before any of the above run. See [`docs/TESTING.md`](docs/TESTING.md) for the full reference, including how to run each layer and update visual baselines.

```bash
npm test           # unit/component tests, watch mode
npm run lint        # ESLint (incl. jsx-a11y)
npm run lint:css    # Stylelint (source .css files)
npm run e2e         # end-to-end + accessibility + visual regression + HTML5/CSS validation
npm run storybook   # browse component/game stories locally
```

---

## Settings Reference

Accessible from the dashboard via the gear icon (⚙).

| Setting | Default | Options |
|---|---|---|
| Child's Name | *(empty)* | Any text |
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
| Difficulty auto-progression | Off | On, Off |
| Google Analytics ID | *(empty)* | Any valid GA4 Measurement ID (e.g. `G-XXXXXXXXXX`) |

**Questions per session** — if a game's item set is smaller than the selected count (for example, a 12-item game with "20" selected), items repeat to fill the session. Repeats are distributed evenly across the pool and the same item is never asked twice in a row.

**Immediate** — correct/wrong feedback shown instantly; next question advances automatically after 1.5 s.

**Parent tap** — feedback shown after a parent taps "Next", giving time to discuss the answer.

**Google Analytics** — when a Measurement ID is entered, the GA4 script is injected at runtime and page view events fire on every navigation. Leaving the field blank disables tracking entirely. The ID is stored in `localStorage` alongside other settings.

**Child's Name** — when set, the dashboard title reads "<Name>'s Playground"; when left blank, it shows the default "My Playground".

**Celebration animations** — when on, a confetti burst plays on every correct answer and the game header shows the current answer streak once it reaches 2; the end-of-game screen lists any missed items. Turning this off disables the confetti only — streak tracking and the missed-items summary remain.

**Timer** — "Show timer" is a running stopwatch, purely informational. "Answer within Ns" instead counts down; when it reaches zero the question locks in as missed (same as exhausting retries) and always advances after a "Time's up!" message, regardless of feedback mode. "Off" hides the timer and enforces no limit.

**Speed record threshold** — the minimum session accuracy required for a new average-speed personal best to be announced, so a fast-but-mostly-wrong session can't set a "speed record."

**Retry attempts** — how many wrong taps are allowed on a question before it locks in as missed. "None" reproduces the original behavior (locks on the very first wrong tap). Each wrong choice becomes disabled (but stays visible) so the child can try a different one.

**Hints** — when on, the correct answer is highlighted once the child has reached "Show hint after" wrong taps on the current question, without locking it.

**Retry counts toward streak** — when on, getting a question right after 1+ wrong taps still counts toward the answer streak. When off, a correct-after-retry still scores as correct but resets the streak to 0.

**Spaced repetition** — when on, a missed item reappears a few questions later in the same session (replacing one of the not-yet-asked items, so the session length stays the same).

**Difficulty auto-progression** — when on, finishing a session with a perfect score offers to raise Answer Choices by 1 (up to the maximum of 4) on the results screen.

---

## Versioning

The app version is read from `package.json` at build time (via Vite's JSON import) and displayed in the dashboard footer. Each game's version comes from its own `manifest.json` and is shown in the game header.

To release a new version, bump `version` in `package.json` and the relevant game `manifest.json` files, then rebuild.

---

## Animal Sounds Game

Animals: elephant, lion, cow, dog, cat, frog, duck, horse, pig, sheep, rooster, owl.

Sound files live in `src/games/animal-sounds/sounds/` and must be named `<animal>.mp3`. The game uses a Vite asset glob to resolve URLs at build time, so the paths are production-safe:

```js
// src/games/animal-sounds/data/sounds.js
const sounds = import.meta.glob('../sounds/*.mp3', { eager: true, query: '?url', import: 'default' })
```

Free CC0 animal sounds are available at [freesound.org](https://freesound.org).

---

## Future Enhancements

A tracked list of ideas for new games, UX improvements, scoring features, and technical work is maintained in [`docs/ENHANCEMENTS.md`](docs/ENHANCEMENTS.md).
