# Child's Name Setting — Design

## Summary

Add a `childName` setting so the home page title can be personalized (e.g. "Mia's Playroom") instead of the hardcoded "Baby's Playroom". The field follows the existing free-text settings pattern already used for `gaId`.

## Goals

- Let a parent enter their child's name in Settings and see it reflected in the dashboard title immediately.
- Reuse the existing settings storage/hook infrastructure unchanged — no new storage methods.
- Fall back to today's wording ("Baby's Playroom") when no name is set.

## Non-goals

- No per-game personalization (game headers, results screens, etc. are untouched).
- No validation/length limits beyond what `gaId` already does (none) — consistent with existing free-text settings.
- No multi-child support — a single name field, like the rest of the settings.

## Data

`DEFAULT_SETTINGS` in `src/storage/adapter.js` gains one field:

```js
export const DEFAULT_SETTINGS = {
  numChoices: 2,
  feedbackMode: 'immediate',
  questionsPerSession: 10,
  gaId: '',
  childName: '',
}
```

The adapter doc comment's "Settings shape" line is updated to include `childName`. No changes to `getSettings`/`saveSettings`/`addScore`/`getScores` — `childName` flows through the existing pass-through merge (`{ ...DEFAULT_SETTINGS, ...stored }`) in `localStorageAdapter.js`.

## Admin UI: `AdminPage.jsx`

A new section, "Child's Name", placed **first** — above "Answer Choices" — since personalization is the most foundational setting:

```jsx
<div className="admin__section">
  <h2>Child's Name</h2>
  <p className="admin__hint">Personalize the home page title.</p>
  <input
    className="admin__text-input"
    type="text"
    placeholder="e.g. Mia"
    value={settings.childName || ''}
    onChange={e => updateSetting('childName', e.target.value)}
    aria-label="Child's Name"
    spellCheck={false}
  />
</div>
```

This mirrors the existing Google Analytics field exactly (same `admin__text-input`/`admin__hint` classes, same `value || ''` guard, same `updateSetting` call pattern) — no new CSS.

## Dashboard title: `Dashboard.jsx`

`Dashboard` currently doesn't consume settings. It adds a `useSettings()` call and computes the title:

```jsx
import useSettings from '../hooks/useSettings'

// inside the component:
const { settings } = useSettings()
const name = settings.childName?.trim()
const title = name ? `${name}'s Playroom` : "Baby's Playroom"
```

Rendered as:

```jsx
<h1 className="dashboard__title">🌊 {title}</h1>
```

This is plain JSX text content (not `dangerouslySetInnerHTML`), so React escapes it automatically — no XSS concerns, consistent with how the rest of the app renders user-entered strings (e.g. `gaId` is never rendered into the DOM at all; this is actually the first free-text setting to be displayed back to the user, and JSX's default escaping covers it).

## Testing

`src/admin/__tests__/AdminPage.test.jsx`:
- Add `childName: ''` to `mockSettings`.
- New test: renders the "Child's Name" field (`getByLabelText(/child's name/i)`).
- New test: typing into the field calls `updateSetting('childName', <value>)`.

`src/components/__tests__/Dashboard.test.jsx`:
- This file does not currently mock `useSettings` — add a `vi.mock('../../hooks/useSettings', ...)` returning `{ settings: { childName: '' } }` by default (mirroring the existing `useScores` mock style), overridable per test via a mutable mock object.
- New test: with `childName: ''`, title reads "🌊 Baby's Playroom".
- New test: with `childName: 'Mia'`, title reads "🌊 Mia's Playroom".

## Documentation

- `README.md`: update the settings reference to list "Child's Name" alongside the other Settings page fields.
- `CLAUDE.md`: update the "Settings shape" line to `(numChoices, feedbackMode, questionsPerSession, gaId, childName)`.
