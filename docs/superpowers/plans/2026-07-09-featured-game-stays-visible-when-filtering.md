# Featured Game Stays Visible When Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the "Today's Game" featured banner visible on the dashboard at all times, including when a tag filter is active, instead of hiding it whenever any tag other than "All" is selected.

**Architecture:** `src/components/Dashboard.jsx` currently gates the `<FeaturedGameCard>` render behind `activeTag === 'all'` and separately excludes the featured game's id from both `buildSections` (the "All" view's per-tag category groupings) and would otherwise need excluding from the flat filtered grid. Per the approved design (GitHub issue #44), the fix is to always render the banner regardless of `activeTag`, and to stop excluding the featured game from sections/grid — it's fine for the same game to appear both in the banner and in its normal category/grid position. This is a render-condition simplification, not a new abstraction: two conditions are removed, nothing is added.

**Tech Stack:** React 18, Vitest + React Testing Library + jsdom, react-i18next, jest-axe for a11y assertions.

## Global Constraints

- Tests covering timed feedback must use `vi.useFakeTimers()` with `fireEvent` — not applicable here (no timers involved), but do not introduce `userEvent` + fake timers together.
- Game/dashboard components expose test hooks via `data-testid`/role/text queries already established in `Dashboard.test.jsx` — keep using `screen.getByRole`/`getByText` patterns, no new test-id conventions needed for this change.
- Bump `package.json` version and add a `CHANGELOG.md` entry for any user-facing behavior change, per this repo's release convention (see existing `## [0.22.0]` entries).
- Run `npm run lint` and the full `npx vitest run` (or targeted file) before considering a task done.

---

### Task 1: Always render the featured banner; stop excluding the featured game from sections/grid

**Files:**
- Modify: `src/components/Dashboard.jsx:27-46` (`buildSections`), `src/components/Dashboard.jsx:65-75` (render logic)
- Test: `src/components/__tests__/Dashboard.test.jsx`

**Interfaces:**
- Consumes: `useFeaturedGame(manifests)` → returns a manifest object or `null` (unchanged, `src/hooks/useFeaturedGame.js`); `useGameTags(manifests)` → `{ tagMap, allTags }` (unchanged, `src/hooks/useGameTags.js`); `FeaturedGameCard({ manifest })` (unchanged, `src/components/FeaturedGameCard.jsx`) — already returns `null` internally when `manifest` is falsy, so no new guard is needed at the call site beyond what's already there.
- Produces: no new exports. `buildSections` keeps its existing signature `buildSections(manifests, tagMap, featuredId, allTags, t)` — the `featuredId` parameter becomes unused by the filtering logic but is left in place (removing a parameter from an internal helper is optional polish, not required by the spec; simplest correct fix is to stop using it in the filter predicates). Actually: since `featuredId` becomes fully unused once the exclusion is removed, delete the parameter entirely and update the one call site — leaving an unused parameter would fail lint (`no-unused-vars` is common in this stack) and is dead weight.

- [ ] **Step 1: Write the failing tests**

Replace the two tests that currently encode the old "hidden when filtering" behavior, and add coverage for the new behavior. Open `src/components/__tests__/Dashboard.test.jsx` and replace the two tests at lines 97-104 (`'featured game also appears in filtered view'`) and 133-140 (`'clicking a tag tab filters the grid to matching games'`) with the versions below, and add three new tests after the `'clicking All tab restores full view'` test (currently ending at line 149).

Replace:
```javascript
  it('featured game also appears in filtered view', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    // click the 'Sounds' tab — animal-sounds should appear in the filtered flat grid
    await user.click(screen.getByRole('tab', { name: 'Sounds' }))
    const links = screen.getAllByRole('link', { name: /animal sounds/i })
    expect(links.length).toBeGreaterThanOrEqual(1) // grid card only (featured card hidden when filtering)
  })
```
with:
```javascript
  it('featured game appears both in the banner and in the filtered grid', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    // useFeaturedGame is mocked to return manifests[0] (animal-sounds)
    await user.click(screen.getByRole('tab', { name: 'Sounds' }))
    const links = screen.getAllByRole('link', { name: /animal sounds/i })
    expect(links.length).toBe(2) // banner card + grid card, no dedupe
  })
```

Replace:
```javascript
  it('clicking a tag tab filters the grid to matching games', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    await user.click(screen.getByRole('tab', { name: 'Sounds' }))
    expect(screen.getByRole('tab', { name: 'Sounds' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByText('Animal Sounds')).toHaveLength(1) // grid card only (featured card hidden when filtering)
    expect(screen.queryByText('Color Match')).not.toBeInTheDocument()
  })
```
with:
```javascript
  it('clicking a tag tab filters the grid to matching games', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    await user.click(screen.getByRole('tab', { name: 'Sounds' }))
    expect(screen.getByRole('tab', { name: 'Sounds' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByText('Animal Sounds')).toHaveLength(2) // banner + grid card, no dedupe
    expect(screen.queryByText('Color Match')).not.toBeInTheDocument()
  })
```

Add after `'clicking All tab restores full view'` (after line 149):
```javascript
  it('keeps the featured banner visible on a filtered tab', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    await user.click(screen.getByRole('tab', { name: 'Sounds' }))
    expect(screen.getByText(/Today's Game/i)).toBeInTheDocument()
  })

  it('keeps the featured banner visible even on a tab that does not match the featured game', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    // useFeaturedGame mock returns manifests[0] (animal-sounds, tag 'sounds') — filter to 'Visual' instead
    await user.click(screen.getByRole('tab', { name: 'Visual' }))
    expect(screen.getByText(/Today's Game/i)).toBeInTheDocument()
    // "Animal Sounds" still appears once, from the banner's own name text — just not duplicated into the (non-matching) grid
    expect(screen.getAllByText('Animal Sounds')).toHaveLength(1)
  })

  it('does not render the featured banner on any tab when manifests is empty', () => {
    render(<MemoryRouter><Dashboard manifests={[]} /></MemoryRouter>)
    expect(screen.queryByText(/Today's Game/i)).not.toBeInTheDocument()
  })
```

Note the third new test (`'does not render the featured banner...manifests is empty'`) is a negative-path duplicate-in-spirit of the existing test at line 106-109 (`'does not render FeaturedGameCard when manifests is empty'`) but explicit that this holds "on any tab" — keep both; they read differently. Also add one more negative case for `buildSections`, since sections used to filter out the featured game and now must include it:

```javascript
  it('includes the featured game inside its own category section in the All view (no longer excluded)', () => {
    // useFeaturedGame mock returns manifests[0] (animal-sounds, tag 'sounds')
    render(<MemoryRouter><Dashboard manifests={manifests} /></MemoryRouter>)
    const soundsSection = screen.getByRole('heading', { name: /sounds/i }).closest('section')
    expect(soundsSection).not.toBeNull()
    expect(within(soundsSection).getByText('Animal Sounds')).toBeInTheDocument()
  })
```

This last test needs `within` imported. Update the top import line:
```javascript
import { render, screen, within } from '@testing-library/react'
```

- [ ] **Step 2: Run the tests to verify the new/changed ones fail**

Run: `npx vitest run src/components/__tests__/Dashboard.test.jsx`
Expected: FAIL — the two rewritten tests fail because they now expect 2 matches instead of 1; the three new "visible on filtered tab" tests fail because the banner is currently hidden when `activeTag !== 'all'`; the "included in section" test fails because `buildSections` currently excludes the featured game.

- [ ] **Step 3: Implement the fix in `Dashboard.jsx`**

Read the current file at `src/components/Dashboard.jsx` first (it's already been read in this session — lines 27-46 and 65-75 are the target). Apply these changes:

Change `buildSections` (lines 27-46) from:
```javascript
function buildSections(manifests, tagMap, featuredId, allTags, t) {
  const sections = []
  for (const tag of allTags) {
    const games = manifests.filter(
      m => m.id !== featuredId && (tagMap.get(m.id) ?? []).includes(tag)
    )
    if (games.length > 0) {
      const icon = TAG_ICONS[tag] ?? ''
      const label = `${icon} ${tagLabel(tag, t)}`.trim()
      sections.push({ heading: label, games })
    }
  }
  const untagged = manifests.filter(
    m => m.id !== featuredId && (tagMap.get(m.id) ?? []).length === 0
  )
  if (untagged.length > 0) {
    sections.push({ heading: t('dashboard.categoryOther'), games: untagged })
  }
  return sections
}
```
to:
```javascript
function buildSections(manifests, tagMap, allTags, t) {
  const sections = []
  for (const tag of allTags) {
    const games = manifests.filter(m => (tagMap.get(m.id) ?? []).includes(tag))
    if (games.length > 0) {
      const icon = TAG_ICONS[tag] ?? ''
      const label = `${icon} ${tagLabel(tag, t)}`.trim()
      sections.push({ heading: label, games })
    }
  }
  const untagged = manifests.filter(m => (tagMap.get(m.id) ?? []).length === 0)
  if (untagged.length > 0) {
    sections.push({ heading: t('dashboard.categoryOther'), games: untagged })
  }
  return sections
}
```

Update its one call site (originally around line 66):
```javascript
  const sections = activeTag === 'all'
    ? buildSections(manifests, tagMap, featured?.id, allTags, t)
    : null
```
to:
```javascript
  const sections = activeTag === 'all'
    ? buildSections(manifests, tagMap, allTags, t)
    : null
```

Change the banner render (originally line 75) from:
```javascript
      {activeTag === 'all' && <FeaturedGameCard manifest={featured} />}
```
to:
```javascript
      <FeaturedGameCard manifest={featured} />
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/__tests__/Dashboard.test.jsx`
Expected: PASS (all tests in the file, including the rewritten and newly added ones)

- [ ] **Step 5: Run the full test suite and lint**

Run: `npx vitest run` and `npm run lint`
Expected: both PASS with no failures/errors (no other file references `buildSections`'s old 5-arg signature or depends on the featured-game exclusion — confirm via the test run rather than a manual grep, since the test suite exercises `Dashboard.jsx` directly).

- [ ] **Step 6: Commit**

```bash
git add src/components/Dashboard.jsx src/components/__tests__/Dashboard.test.jsx
git commit -m "fix: keep featured game banner visible when filtering by tag"
```

---

### Task 2: Update documentation and changelog

**Files:**
- Modify: `README.md:23-25` (Daily Challenge section), `README.md:36-40` (Game Categories & Tags section)
- Modify: `CHANGELOG.md` (new version entry at the top)
- Modify: `package.json:4` (version bump)

**Interfaces:**
- Consumes: nothing (docs-only, no code interfaces).
- Produces: nothing consumed by later tasks — this is the final task in the plan.

- [ ] **Step 1: Update README's Daily Challenge section**

In `README.md`, change:
```markdown
### Daily Challenge

Each day, one game is automatically selected as "Today's Game" and displayed as a featured hero card above the game grid. The selection is deterministic (based on a date-seeded hash), so all users see the same featured game each day. This encourages daily return visits and variety in play.
```
to:
```markdown
### Daily Challenge

Each day, one game is automatically selected as "Today's Game" and displayed as a featured hero card above the game grid. The selection is deterministic (based on a date-seeded hash), so all users see the same featured game each day. This encourages daily return visits and variety in play. The banner stays visible no matter which category tab is selected, and the featured game also appears in its normal category section or grid position — it is not hidden or removed from the list underneath.
```

- [ ] **Step 2: Update README's Game Categories & Tags section**

In `README.md`, change:
```markdown
### Game Categories & Tags

Games are now organized under category headings ("Sounds 🔊", "Visual 👁️", etc.) on the dashboard. A tab strip at the top of the dashboard lets parents filter by category to see only games in a particular group.
```
to:
```markdown
### Game Categories & Tags

Games are now organized under category headings ("Sounds 🔊", "Visual 👁️", etc.) on the dashboard. A tab strip at the top of the dashboard lets parents filter by category to see only games in a particular group. The "Today's Game" featured banner is unaffected by this filter and always stays at the top.
```

- [ ] **Step 3: Add a CHANGELOG entry**

In `CHANGELOG.md`, insert a new section above `## [0.22.0] - 2026-07-09`:
```markdown
## [0.22.1] - 2026-07-09

### Fixed
- The "Today's Game" featured banner disappeared whenever a category tab other than "All" was selected, instead of staying visible while browsing a filtered category. The banner now always renders regardless of the active tab, and the featured game is no longer excluded from its own category section/grid underneath it.

```

- [ ] **Step 4: Bump the version in package.json**

In `package.json`, change:
```json
  "version": "0.22.0",
```
to:
```json
  "version": "0.22.1",
```

- [ ] **Step 5: Verify build and lint still pass**

Run: `npm run lint`
Expected: PASS, no errors.

- [ ] **Step 6: Commit**

```bash
git add README.md CHANGELOG.md package.json
git commit -m "docs: document featured game banner staying visible when filtering"
```
