# Dashboard Tap-Target Standard (Issue #91) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out issue #91 by proving (with a real-browser regression test) that the dashboard tag-filter pills already meet the app's 64×64px tap-target standard, and make that fact discoverable so it stops being re-reported.

**Architecture:** No production CSS sizing changes — `.dashboard__tab` and `.date-range-filter__tab` both already inherit a 64×64px floor from the global `button` rule in `src/index.css` (only `.admin__tab` genuinely overrides it smaller). This plan adds a Playwright e2e spec that measures real rendered box sizes (positive: dashboard pills and parent date-range tabs ≥ 64px; negative: the dashboard's own smaller secondary controls and the admin tab bar stay below 64px but above the WCAG 24px floor), a clarifying code comment, and doc/changelog updates.

**Tech Stack:** Playwright (`@playwright/test`), existing CSS/i18n conventions.

## Global Constraints

- No changes to any CSS sizing/layout rule — the standard is already met; only a comment is added. (Confirmed live: `src/index.css:63-70`'s `button { min-width: 64px; min-height: 64px; }`, inherited by `.dashboard__tab` since neither `Dashboard.css` nor `TagFilterBar.css` overrides it.)
- No visual-regression baseline changes (no pixel output changes).
- Do not edit `docs/accessibility_usability.md` (point-in-time audit record, not edited retroactively) or `docs/ENHANCEMENTS.md` (its AU-7 entry was already removed in v0.32.0 — nothing stale remains).
- New e2e spec file: `e2e/tap-target-standard.spec.js`, following this repo's existing Playwright conventions (`import { test, expect } from '@playwright/test'`, `page.goto(...)`, `locator.boundingBox()` for real rendered size — see `e2e/animal-memory-match.spec.js:125` for the existing `boundingBox()` precedent).
- Commit message format: `type(91): description`, matching this repo's convention (see `git log`: `feat(39): ...`).
- App version: bump `package.json` `"version"` from `0.32.2` to `0.32.3`; add a matching `CHANGELOG.md` entry under `### Changed` (same pattern as the existing `[0.32.0]` AU-7 entry).

---

### Task 1: Add the tap-target regression e2e spec

**Files:**
- Create: `e2e/tap-target-standard.spec.js`

**Interfaces:**
- Consumes: the running dev-server routes `/` (dashboard), `/admin`, `/parent` (all already served by Playwright's `webServer` config — no setup needed). Locators rely on existing accessible names already proven in other specs: `getByRole('button', { name: 'Animals' })` / `'Sounds'` / `'Clear filters'` (dashboard.spec.js), `getByRole('tab', { name: 'Settings' })` (admin.spec.js pattern), `getByRole('tab', { name: 'All time' })` (parent-dashboard.spec.js).
- Produces: nothing consumed by later tasks — this is a standalone regression spec.

This spec asserts current, already-correct behavior — there is no code to make it pass. The right-first-time flow here is: write it, run it, and confirm every test **passes immediately** (that pass result *is* the reconfirmation issue #91 asked for), not a red→green cycle.

- [ ] **Step 1: Write the spec**

```javascript
import { test, expect } from '@playwright/test'

const PHONE_VIEWPORT = { width: 390, height: 844 }
const PRIMARY_TAP_TARGET = 64
const WCAG_MIN_TAP_TARGET = 24

// Issue #91 (restating audit finding AU-7): verifies live that
// `.dashboard__tab` already meets the app's 64x64px primary tap-target
// standard via the global `button` rule in src/index.css (padding-only
// arithmetic under-counts it, since a min-height floor wins over whatever
// height padding+content would otherwise produce) -- see the comment on
// `.dashboard__tab` in Dashboard.css and CHANGELOG.md's [0.32.0]/[0.32.3]
// entries. The negative tests below prove this assertion is scoped, not
// trivially true for every button in the app, and guard the documented
// parent-only/secondary-control exceptions from being "fixed" by mistake.

test.describe('dashboard tab strip meets the primary 64px tap-target standard', () => {
  test('an unselected tag pill meets the 64px floor at desktop width', async ({ page }) => {
    await page.goto('/')
    const box = await page.getByRole('button', { name: 'Animals' }).boundingBox()
    expect(box.width).toBeGreaterThanOrEqual(PRIMARY_TAP_TARGET)
    expect(box.height).toBeGreaterThanOrEqual(PRIMARY_TAP_TARGET)
  })

  test('a selected (active) tag pill also meets the 64px floor at desktop width', async ({ page }) => {
    await page.goto('/')
    const pill = page.getByRole('button', { name: 'Sounds' })
    await pill.click()
    await expect(pill).toHaveAttribute('aria-pressed', 'true')
    const box = await pill.boundingBox()
    expect(box.width).toBeGreaterThanOrEqual(PRIMARY_TAP_TARGET)
    expect(box.height).toBeGreaterThanOrEqual(PRIMARY_TAP_TARGET)
  })

  test('a tag pill meets the 64px floor at phone width, the viewport a child is most likely to use', async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT)
    await page.goto('/')
    const box = await page.getByRole('button', { name: 'Animals' }).boundingBox()
    expect(box.width).toBeGreaterThanOrEqual(PRIMARY_TAP_TARGET)
    expect(box.height).toBeGreaterThanOrEqual(PRIMARY_TAP_TARGET)
  })
})

test.describe('negative: deliberate secondary/parent-only controls stay below 64px but clear the WCAG 24px minimum', () => {
  test('dashboard "Clear filters" button is a smaller secondary control, not held to the 64px standard', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Sounds' }).click()
    const box = await page.getByRole('button', { name: 'Clear filters' }).boundingBox()
    expect(box.height).toBeLessThan(PRIMARY_TAP_TARGET)
    expect(box.height).toBeGreaterThanOrEqual(WCAG_MIN_TAP_TARGET)
  })

  test('dashboard "+N more" tag-overflow toggle is a smaller secondary control at phone width', async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT)
    await page.goto('/')
    const toggle = page.getByRole('button', { name: /\+\d+ more/ })
    await expect(toggle).toBeVisible()
    const box = await toggle.boundingBox()
    expect(box.height).toBeLessThan(PRIMARY_TAP_TARGET)
    expect(box.height).toBeGreaterThanOrEqual(WCAG_MIN_TAP_TARGET)
  })

  test('admin tab bar is a deliberately smaller parent-only surface, not held to the 64px standard', async ({ page }) => {
    await page.goto('/admin')
    const box = await page.getByRole('tab', { name: 'Settings' }).boundingBox()
    expect(box.height).toBeLessThan(PRIMARY_TAP_TARGET)
    expect(box.height).toBeGreaterThanOrEqual(WCAG_MIN_TAP_TARGET)
  })

  test('admin tab bar is a deliberately smaller parent-only surface, not held to the 64px standard', async ({ page }) => {
    await page.goto('/admin')
    const box = await page.getByRole('tab', { name: 'Settings' }).boundingBox()
    expect(box.height).toBeLessThan(PRIMARY_TAP_TARGET)
    expect(box.height).toBeGreaterThanOrEqual(WCAG_MIN_TAP_TARGET)
  })
})
```

**Correction found during implementation (not in the original design):** the
audit's AU-7 finding claims "the admin and parent-dashboard tab bars share
the same compact sizing," but `.date-range-filter__tab`
(`src/parent/DateRangeFilter.css:10-20`) carries no `min-height` override
of its own — unlike `.admin__tab`, which genuinely does (`min-height:
56px`). The parent date-range tab therefore inherits the same 64px floor
as the dashboard tab strip. Add this as a **fourth positive test**, not a
negative one, appended inside the first `test.describe` block above (after
the phone-width test, before its closing `})`):

```javascript
  test('the parent date-range tab bar also meets the 64px floor (it has no min-height override, unlike .admin__tab)', async ({ page }) => {
    await page.goto('/parent')
    const box = await page.getByRole('tab', { name: 'All time' }).boundingBox()
    expect(box.width).toBeGreaterThanOrEqual(PRIMARY_TAP_TARGET)
    expect(box.height).toBeGreaterThanOrEqual(PRIMARY_TAP_TARGET)
  })
```

- [ ] **Step 2: Run the new spec in isolation**

Run: `npx playwright test tap-target-standard.spec.js`
Expected: `7 passed` (4 positive + 3 negative), no failures. If any test fails, stop and re-verify the underlying CSS assumption in this plan's Global Constraints against the live-rendered page before touching the test — a failure here means the codebase state has changed since this plan was written, not that the test is wrong.

- [ ] **Step 3: Commit**

```bash
git add e2e/tap-target-standard.spec.js
git commit -m "$(cat <<'EOF'
test(91): add tap-target regression spec for dashboard tab strip

Reconfirms .dashboard__tab and .date-range-filter__tab already meet
the app's 64x64px primary tap-target standard via the global button
rule (issue #91 restates the AU-7 finding already closed in CHANGELOG
[0.32.0]); corrects AU-7's own claim that the parent date-range tab
bar shares the admin tab bar's smaller sizing -- it doesn't, it has
no min-height override. Locks in the one real exception (.admin__tab)
plus the dashboard's own smaller secondary controls so a future
change can't silently regress either direction.
EOF
)"
```

---

### Task 2: Add a clarifying comment to `Dashboard.css`

**Files:**
- Modify: `src/components/Dashboard.css:24-34` (the `.dashboard__tab` rule)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks (informational only), but references `e2e/tap-target-standard.spec.js` by name (from Task 1) so keep task order as written.

- [ ] **Step 1: Add the comment**

In `src/components/Dashboard.css`, immediately above the existing `.dashboard__tab {` rule (currently at line 24), add:

```css
/* No explicit min-width/min-height here -- this inherits its 64x64px
   floor from the global `button` rule in src/index.css, which wins over
   whatever height this rule's own padding (6px 16px) + font-size would
   otherwise produce. Padding-only arithmetic undercounts this (it looks
   like ~33px), which is exactly the mistake that produced audit finding
   AU-7 and its duplicate, issue #91 -- both closed as no-CSS-change-needed
   (see CHANGELOG.md). If you add an explicit min-height/min-width
   override here, update e2e/tap-target-standard.spec.js accordingly. */
.dashboard__tab {
```

So the full result reads:

```css
/* No explicit min-width/min-height here -- this inherits its 64x64px
   floor from the global `button` rule in src/index.css, which wins over
   whatever height this rule's own padding (6px 16px) + font-size would
   otherwise produce. Padding-only arithmetic undercounts this (it looks
   like ~33px), which is exactly the mistake that produced audit finding
   AU-7 and its duplicate, issue #91 -- both closed as no-CSS-change-needed
   (see CHANGELOG.md). If you add an explicit min-height/min-width
   override here, update e2e/tap-target-standard.spec.js accordingly. */
.dashboard__tab {
  padding: 6px 16px;
  border-radius: var(--radius-button);
  border: 2px solid rgb(0 0 0 / 12%);
  background: transparent;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
```

(Only the comment is new; the rule body is unchanged.)

- [ ] **Step 2: Verify no CSS regression**

Run: `npm run lint:css`
Expected: passes with no new errors (comment-only change; confirms the CSS is still valid and the file's existing lint-disable exceptions aren't affected).

- [ ] **Step 3: Commit**

```bash
git add src/components/Dashboard.css
git commit -m "$(cat <<'EOF'
docs(91): clarify why .dashboard__tab already meets the 64px standard

Padding-only arithmetic on this rule undercounts its real rendered
size (~33px), which is exactly the mistake behind audit finding AU-7
and its duplicate, issue #91. A comment now points at the global
button rule that actually governs it, and at the regression spec
that guards this fact.
EOF
)"
```

---

### Task 3: Documentation updates (`TESTING.md`, `README.md`, `CHANGELOG.md`, `package.json`)

**Files:**
- Modify: `docs/TESTING.md` (Layer 3 spec table, around line 86)
- Modify: `README.md:7`
- Modify: `CHANGELOG.md` (new `[0.32.3]` entry at the top)
- Modify: `package.json` (`"version"` field)

**Interfaces:**
- Consumes: `e2e/tap-target-standard.spec.js` (Task 1) and the `Dashboard.css` comment (Task 2) by name/description only — no code interfaces.
- Produces: nothing consumed by later tasks (this is the final task).

- [ ] **Step 1: Add a row to the `docs/TESTING.md` e2e spec table**

In `docs/TESTING.md`, in the table under "Layer 3: End-to-end tests (Playwright)" (currently ending with the `visual.spec.js` / `html-validity.spec.js` / `css-validity.spec.js` rows around line 84-86), add a new row directly above the `visual.spec.js` row:

```markdown
| `tap-target-standard.spec.js` | Real-rendered tap-target sizes (issue #91): dashboard tag pills and the parent date-range tabs meet the app's 64px primary standard, while the dashboard's own secondary controls and the admin tab bar — the one genuine smaller-by-design exception — stay below 64px but above the WCAG 2.5.8 24px minimum |
```

- [ ] **Step 2: Reword the README tap-target claim**

In `README.md`, change line 7 from:

```markdown
- **Ocean & Dream design** — soft aquas, teals, lavenders, and lilacs; 64×64 px minimum tap targets throughout
```

to:

```markdown
- **Ocean & Dream design** — soft aquas, teals, lavenders, and lilacs; 64×64 px minimum tap targets on primary/child-facing controls (compact secondary controls in parent-only surfaces, like the admin tab bar, are a deliberate exception — see `docs/accessibility_usability.md`)
```

- [ ] **Step 3: Bump the app version**

In `package.json`, change:

```json
  "version": "0.32.2",
```

to:

```json
  "version": "0.32.3",
```

- [ ] **Step 4: Add the CHANGELOG entry**

In `CHANGELOG.md`, add a new section immediately below the `# Changelog` header/intro and above the existing `## [0.32.2] - 2026-07-21` entry:

```markdown
## [0.32.3] - 2026-07-22

### Changed

- Issue #91 ("UX - TAP SIZE") investigated and reconfirmed already-compliant: `.dashboard__tab` still meets the app's 64×64px primary tap-target standard via the global `button` rule in `src/index.css` (the padding-only arithmetic issue #91 used, like the original AU-7 finding it restates, undercounts the rendered size because `min-height` wins over content-driven height). No CSS sizing change was needed. While implementing, also found AU-7 itself was wrong about `.date-range-filter__tab` (the parent-dashboard date-range tabs): it has no `min-height` override and meets the same 64px floor, unlike `.admin__tab`, which is a genuine smaller-by-design exception (`min-height: 56px`). Locked in with `e2e/tap-target-standard.spec.js` (positive checks on the dashboard pills and the parent date-range tabs; negative checks proving the dashboard's own secondary controls and the admin tab bar correctly stay below 64px) and a clarifying comment on `.dashboard__tab` in `Dashboard.css`. README's tap-target claim reworded to scope "throughout" to primary/child-facing controls, since the admin tab bar exception already meant it overclaimed independently of this issue.
```

- [ ] **Step 5: Verify the full suite still passes**

Run: `npm run lint && npm run lint:css && npm test -- --run`
Expected: all pass (no application code changed; this confirms the doc/version edits didn't accidentally break a JSON/CSS file's syntax — `package.json` and `CHANGELOG.md`/`README.md` edits are the kind of hand-edit that can silently introduce a trailing-comma or heading-level typo).

- [ ] **Step 6: Commit**

```bash
git add docs/TESTING.md README.md CHANGELOG.md package.json
git commit -m "$(cat <<'EOF'
docs(91): document tap-target verification and scope the README claim

Adds the new e2e spec to TESTING.md's layer table, scopes README's
"64x64 px minimum tap targets throughout" claim to primary/child-facing
controls (the admin tab bar was already a deliberate smaller exception),
and records the issue #91 investigation -- including the AU-7 correction
about the parent date-range tabs -- in CHANGELOG [0.32.3].
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** all five design-doc changes (Dashboard.css comment, new e2e spec with the specified positive/negative cases, TESTING.md row, README wording, CHANGELOG+version bump) map onto Task 1–3. The design doc's "explicitly out of scope" items (`docs/accessibility_usability.md`, `docs/ENHANCEMENTS.md`, visual baselines, admin/parent CSS sizing) have no corresponding task, as intended.
- **Placeholder scan:** no TBD/TODO; every step has literal file paths, exact code, and exact commands.
- **Type/name consistency:** the e2e spec file name (`e2e/tap-target-standard.spec.js`) is identical across Task 1's creation, Task 2's comment reference, and Task 3's TESTING.md row and CHANGELOG entry. Constant names (`PRIMARY_TAP_TARGET`, `WCAG_MIN_TAP_TARGET`, `PHONE_VIEWPORT`) are defined once in Task 1 and not referenced elsewhere as code (only described in prose), so no cross-task drift risk.
- **Correction (post-initial-write):** the first implementer run of Task 1 found live that `.date-range-filter__tab` does not carry a smaller `min-height` override (contrary to this plan's and the design doc's original text, which mis-attributed a neighboring rule's `min-height: 40px` to it) — it meets the 64px floor same as `.dashboard__tab`. Task 1's spec, and Task 3's TESTING.md/README/CHANGELOG text, were updated in place above to reflect this; `.admin__tab` remains the one genuine smaller-by-design exception. The design doc (`docs/superpowers/specs/2026-07-22-dashboard-tap-target-design.md`) was corrected to match.
