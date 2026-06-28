# Dashboard Enhancements Design

**Date:** 2026-06-28  
**Status:** Approved  
**Features:** Daily Challenge · Recently Played · Game Categories/Tags

---

## Overview

Three independent dashboard enhancements that all touch `Dashboard`, `GameCard`, and `AdminPage`. Implemented via Approach A (hook-per-concern), consistent with the existing `useScores` / `useSettings` pattern. No changes to `App.jsx` or the storage adapter interface.

---

## Architecture

### New files

```
src/
  hooks/
    useFeaturedGame.js       — date-seeded daily game selection (pure computation)
    useRecentlyPlayed.js     — derives play history from existing scores
    useGameTags.js           — merges manifest tags with admin overrides
  components/
    FeaturedGameCard.jsx     — hero banner card rendered above the grid
    FeaturedGameCard.css
    CategorySection.jsx      — labeled section heading + sub-grid of game cards
    CategorySection.css
```

### Modified files

```
src/
  components/
    Dashboard.jsx            — orchestrates all three hooks; adds tabs + sections
    Dashboard.css
    GameCard.jsx             — accepts recentInfo prop; renders badge + glow
    GameCard.css
  admin/
    AdminPage.jsx            — adds tag override editor section
src/games/
  animal-sounds/manifest.json   — add required tags field
  color-match/manifest.json     — add required tags field
src/storage/
  adapter.js                    — add tagOverrides: {} to DEFAULT_SETTINGS
```

### Schema changes

**`manifest.json`** — `tags` is now a required field (minimum one entry):
```json
{
  "id": "animal-sounds",
  "name": "Animal Sounds",
  "tags": ["sounds", "animals"],
  ...
}
```

**Settings** — `tagOverrides` added to `DEFAULT_SETTINGS`:
```js
tagOverrides: {}   // shape: { [gameId: string]: string[] }
```

No migration needed — both additions are backward-compatible (absent = default).

---

## Feature 1: Daily Challenge

### Hook — `useFeaturedGame(manifests)`

Picks one game per day using a deterministic date-based hash. Pure computation; no storage reads or writes.

```js
function hashDate(str) {
  return str.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
}
// today = new Date().toISOString().slice(0, 10)  →  "2026-06-28"
// featured = manifests[hashDate(today) % manifests.length]
```

**Returns:** the featured manifest object, or `null` if `manifests` is empty.

Same date always returns the same game. All users see the same featured game each day. The sequence is visually unpredictable (not a simple rotation).

### Component — `FeaturedGameCard`

Rendered above the grid in `Dashboard`. Wide banner layout: large game icon centered, name, description, "⭐ Today's Game" label, and a play button linking to `/game/:id`.

The featured game **also remains in the grid** — removing it would break the grid's completeness and confuse parents looking for it.

---

## Feature 2: Recently Played

### Hook — `useRecentlyPlayed()`

Reads all scores from the storage adapter (existing `getScores`). Derives a `Map<gameId, { lastPlayed: Date, playCount: number }>` from the `timestamp` field already present in the score shape. No new storage writes; no schema changes.

**Returns:** `Map<gameId, { lastPlayed: Date, playCount: number }>`

### `GameCard` updates

Receives a `recentInfo` prop (`null` or `{ lastPlayed, playCount }`). When present:

1. **Glow border** — replaces the existing `borderTop` accent with a full `box-shadow` pulse in the game's theme color, readable as "active" at a glance
2. **Text badge** — pill inside the card with relative time + count:
   - `"Today · 4 plays"`
   - `"Yesterday · 2 plays"`
   - `"3 days ago · 1 play"`

Relative time is computed from `lastPlayed` vs. today's date at render time. No date library needed — integer day-difference arithmetic.

---

## Feature 3: Game Categories / Tags

### Tag sources and precedence

Tags come from two places, with admin overrides taking precedence:

```
effectiveTags(gameId) = tagOverrides[gameId] ?? manifest.tags
```

`tags` in `manifest.json` is **required** (minimum one tag). Both existing games will have `tags` added. A **console warning** fires at startup if any discovered manifest is missing `tags`, so future game authors get immediate feedback during development.

### Hook — `useGameTags(manifests)`

Merges manifest tags with `tagOverrides` from settings.

**Returns:**
```js
{
  tagMap: Map<gameId, string[]>,   // effective tags per game
  allTags: string[]                // sorted, deduplicated union of all tags in use
}
```

`allTags` drives the filter tab strip dynamically — adding a tag to any manifest automatically creates a new tab.

### Dashboard layout

**"All" view** (default):
- Filter tab strip: `All · Sounds · Visual · Numbers · …`
- Grid rendered as `CategorySection` groups with labeled headings (`"Sounds 🔊"`, `"Visual 👁️"`, etc.)
- Games with no effective tags fall into an "Other" section at the bottom (safety net; not expected in normal operation)
- The featured game is excluded from section groups (already shown in the hero card above)

**Filtered view** (tag tab selected):
- Same tab strip with the active tab highlighted
- Flat grid of games matching that tag only — no section headings

### AdminPage — tag editor

New "Game Tags" section: for each game, a text input pre-populated with its current effective tags (comma-separated). Saving writes to `tagOverrides` in settings via the existing `saveSettings` adapter method. The input validates at least one tag before saving — prevents saving an empty tag list.

---

## i18n

New translation keys required (English baseline + any existing locale files):

```
dashboard.todaysGame           — "Today's Game"
dashboard.categoryOther        — "Other"
gameCard.playedToday           — "Today · {{count}} plays"
gameCard.playedYesterday       — "Yesterday · {{count}} plays"
gameCard.playedDaysAgo         — "{{days}} days ago · {{count}} plays"
gameCard.playCount_one         — "{{count}} play"
gameCard.playCount_other       — "{{count}} plays"
admin.tagsLabel                — "Tags"
admin.tagsPlaceholder          — "e.g. sounds, animals"
admin.tagsValidation           — "At least one tag is required"
```

---

## Testing

### Unit tests (Vitest + RTL)

**`useFeaturedGame`**
- Same date always returns the same game
- Different dates may return different games
- Empty manifests returns null
- Index wraps correctly at game count boundaries

**`useRecentlyPlayed`**
- Derives correct `lastPlayed` and `playCount` from score records
- Handles zero scores (returns empty Map)
- Correctly buckets "today" / "yesterday" / "N days ago"
- Multiple scores for one game counted correctly

**`useGameTags`**
- `tagOverrides` entry takes precedence over manifest tags
- Missing override falls back to manifest tags
- `allTags` is sorted and deduplicated across all games
- Games with no effective tags not included in `allTags`

**`FeaturedGameCard`**
- Renders hero layout with icon, name, description
- Shows "Today's Game" label
- Links to correct `/game/:id` route
- Renders nothing when manifest is null

**`CategorySection`**
- Renders section heading and child game cards
- Handles empty games list without crashing

**`GameCard` (updated)**
- Renders badge and glow when `recentInfo` is present
- Omits badge and glow when `recentInfo` is null
- Displays correct relative time strings for today / yesterday / N days ago
- Singular "1 play" vs plural "N plays"

**`AdminPage` (updated)**
- Tag editor renders one input per game
- Prevents save when tag input is empty (shows validation message)
- Calls `saveSettings` with correct `tagOverrides` shape on save

**`Dashboard` (updated)**
- Renders `FeaturedGameCard` above the grid
- Filter tabs generated from `allTags`
- "All" view renders `CategorySection` groups
- Filtered view renders flat grid matching the selected tag
- Featured game appears in grid as well as hero position

### Integration tests (Vitest + RTL)

- Full Dashboard render with mocked storage: featured game in hero position AND in grid
- Play count badge visible after scores recorded in mocked adapter
- Tag filtering hides and shows correct cards

### E2E tests (Playwright)

- Featured hero card visible on dashboard load and navigates to the game on click
- Clicking a category tab filters the grid correctly; clicking "All" restores full view
- Recently played badge appears after completing a game session
- Admin tag override persists across page reload

---

## Implementation order

Build in this sequence to keep each step independently shippable:

1. **Recently Played** — zero schema changes, derives from existing data, lowest risk
2. **Daily Challenge** — pure computation hook + new component, no storage
3. **Game Categories/Tags** — schema additions + admin UI, most moving parts

---

## Out of scope

- Drag-to-reorder (removed from requirements)
- Tag hierarchy or parent/child tag relationships
- Server-side featured game selection
