# Parental Lock (Issue #127)

## Problem

`/admin` (settings) and `/parent` (score analytics/export) are reachable by anyone who taps the nav icon — including a toddler exploring the screen. There is currently no access control on either route.

## Goals / non-goals

**Goals:** stop *undirected* taps (a toddler poking at the screen) from reaching settings or the parent dashboard, with zero required setup.

**Non-goals**, stated explicitly because they shape several decisions below: this is not a defense against a deliberate adult attacker. No hashing, no rate-limiting/lockout, no server-side anything — consistent with `SECURITY.md`'s existing posture that physical access to the device is already access to the data. A forgotten custom PIN has no recovery path beyond the same "clear browser site data" wipe `SECURITY.md` already documents for score/settings data loss. No accounts, no login page, no multi-user concept — see "Future: login" below for how this design leaves room for that without building it now.

## Scope

Gates two routes behind one shared unlock: `/admin` and `/parent`. `/my-progress` (kid-facing, read-only) is unaffected. This matches the existing `docs/ENHANCEMENTS.md` backlog note ("PIN gate for `/admin` and `/parent` — same as the UX parental-lock entry") rather than the issue's literal "admin page" wording, since both are parent-only surfaces of the same trust tier.

## Unlock mechanism

Two modes, resolved from settings — no forced setup:

- **Math challenge (default)** — a generated single-digit-ish addition problem ("7 + 8 = ?", operands 2–9, regenerated on every wrong attempt). Trivial for a parent, opaque to a toddler, nothing to configure or forget.
- **PIN** — if a parent sets a 4-digit PIN in Settings, it replaces the math challenge. Removing it reverts to math mode.

Entry is a single `<input inputMode="numeric">` — no custom keypad component; the OS/tablet's own numeric keyboard is enough, and typing an exact 1–2 digit answer is already hard to hit by accident.

Unlock is **session-scoped**: solving the challenge once covers in-app navigation between `/admin` and `/parent` for the rest of the browser session, but closing the tab/browser re-locks it. Stored in `sessionStorage`, not `localStorage`.

Lock is **on by default** (`parentalLock.enabled: true`) — this only works cleanly *because* the math-challenge fallback needs no setup; there's no chicken-and-egg problem of needing to be inside Settings to turn on the thing that gates Settings.

## Data model

`src/storage/adapter.js` `DEFAULT_SETTINGS` gains one nested key, grouped rather than flat (matching the existing `tagOverrides`/`introDismissed`/`parentDateRange` pattern) so it has room to grow without a future settings migration:

```js
parentalLock: {
  enabled: true,
  pin: '',       // '' → math-challenge mode; a 4-digit string → PIN mode
}
```

No migration needed for existing installs: `localStorageAdapter.getSettings()` already does `{ ...DEFAULT_SETTINGS, ...migrated }`, and a persisted settings object from before this change simply has no `parentalLock` key, so the default (`enabled: true`, math-challenge mode) fills in automatically — same mechanism every prior new setting has relied on.

## Architecture

Three new pieces, deliberately layered so a future login system can replace the *inside* of a layer without touching the layers around it (see "Future: login"):

1. **`src/lib/parentalLock.js`** — pure verification logic, no React, no storage access.
   - `getChallenge(parentalLockSettings, rng = Math.random)` → `{ mode: 'math', a, b, answer }` or `{ mode: 'pin' }`.
   - `verifyUnlock(challenge, input)` → `boolean`.
   - This module is the seam: today it only knows `'math'` and `'pin'`; a future `'account'` mode is an additive branch here, not a rewrite of the gate or the routing.

2. **`src/hooks/useParentalLockSession.js`** — owns the *unlocked-for-this-session* boolean, backed by `sessionStorage`. Returns `{ unlocked, unlock(), lock() }`. `ParentalLockGate` never touches `sessionStorage` directly. This hook is the seam a future login would swap (real session/token check instead of a flag) without changing any consumer.

3. **`src/components/ParentalLockGate.jsx`** (+ `.css`) — a route wrapper, structurally mirroring `OrientationGate`: it asks "am I unlocked" (via the hook above) and renders either the challenge screen or `children`. It has no opinion on *how* unlocking works — that's `parentalLock.js` + the settings shape. Unlike `OrientationGate`, children are **not** mounted-but-hidden while locked; they're simply not rendered at all, so no settings/score data reaches the DOM or accessibility tree pre-unlock.

   Wired in `App.jsx` *outside* `<Suspense>` for both routes, so the lazy `AdminPage`/`ParentDashboard` chunk isn't even fetched until the gate is passed:

   ```jsx
   <Route path="/admin" element={
     <ParentalLockGate>
       <Suspense fallback={...}><AdminPage manifests={manifests} /></Suspense>
     </ParentalLockGate>
   } />
   <Route path="/parent" element={
     <ParentalLockGate>
       <Suspense fallback={...}><ParentDashboard manifests={manifests} /></Suspense>
     </ParentalLockGate>
   } />
   ```

### Challenge screen behavior

- If `settings.parentalLock.enabled` is `false`, or the session hook reports `unlocked`, render `children` immediately — checked synchronously in initial state so there's no flash of the challenge screen.
- Otherwise render a full-page prompt: heading, the math problem or "Enter PIN" label, the numeric input (autofocused via the existing `useFocusOnMount` hook), and a submit button.
- Wrong answer: clear the input, show an inline `aria-live="assertive"` error message, refocus the input, and (math mode only) roll a fresh problem so repeated guesses can't converge on one memorized answer.
- Correct answer: call `unlock()`, which flips local render state to show `children`.

### Settings UI

New "Parental Lock" section in `AdminPage.jsx`'s existing "General" group, placed after the Google Analytics section (both are the "external/parental control" cluster):

- On/off toggle, reusing the existing `admin__toggle-btn` pattern already used for animations/sound.
- When enabled: a PIN field + confirm-PIN field (existing `admin__text-input` pattern), with "Set PIN" / "Remove PIN" actions. Mismatched confirmation blocks saving with an inline error and does not touch stored settings. Removing the PIN sets it back to `''`, reverting to math mode.
- This section is itself only reachable after solving the gate — setting/changing/removing the PIN happens from inside an already-unlocked session, same as every other setting on the page.

### i18n

New `parentalLock.*` top-level key namespace (challenge screen strings — cross-cutting, since it also guards `/parent`, not admin-specific) plus `admin.parentalLock*` keys (settings-section strings), added to `en.json`, `es.json`, and `pl.json` to satisfy the existing cross-locale key-parity test (`src/i18n/__tests__/i18n.test.js`).

## Future: login

Not built now, but the layering above is chosen so it doesn't need undoing later:

- `parentalLock.js`'s `mode` resolution is the extension point for a third mode (e.g. `'account'`) without touching the gate component.
- `useParentalLockSession`'s `{ unlocked, unlock(), lock() }` shape is what a login-backed session check would implement instead of the `sessionStorage` flag — every consumer (`ParentalLockGate`) stays the same.
- The settings shape is nested (`parentalLock: {...}`) specifically so fields like `mode` or an eventual `accounts` list are additive, not a flat-key migration.
- `ParentalLockGate` itself is the reusable route-gating seam regardless of what backs it.

## Docs to update

- `README.md` — feature bullet under Admin/Settings, and a settings-reference entry for the new toggle/PIN fields.
- `SECURITY.md` — new subsection: what this protects against (and explicitly doesn't), plaintext-PIN storage rationale (consistent with the rest of the app's local-only threat model), no-recovery caveat, `sessionStorage` lifetime. Also add the PIN to the existing "Data inventory" table.
- `docs/ENHANCEMENTS.md` — strike the two existing backlog lines (UX parental-lock entry and the Security "PIN gate for `/admin` and `/parent`" entry), referencing #127.
- `CHANGELOG.md` — new entry.

## Testing plan (positive + negative, all applicable layers)

**Unit (`src/lib/__tests__/parentalLock.test.js`):**
- `getChallenge` returns math mode with in-range operands when `pin` is `''`; returns pin mode when `pin` is set.
- `verifyUnlock` — correct math sum passes (positive), wrong sum fails (negative); correct PIN passes (positive), wrong/empty PIN fails (negative).

**Hook (`src/hooks/__tests__/useParentalLockSession.test.js`):**
- Starts locked when no session flag present (negative — not yet unlocked).
- `unlock()` sets the flag and reports `unlocked: true` (positive).
- A fresh hook instance reads a pre-existing session flag as already unlocked (positive — persistence across remount).
- `lock()` clears it (negative path re-armed).

**Component (`src/components/__tests__/ParentalLockGate.test.jsx`):**
- Lock disabled → children render immediately, no challenge shown (positive passthrough).
- Lock enabled + not unlocked → challenge shown, children absent from the DOM entirely (negative — not just visually hidden).
- Correct math answer → unlocks, children render (positive).
- Wrong math answer → stays locked, error shown, input cleared, a new problem is generated (negative).
- PIN mode: correct PIN unlocks (positive); wrong PIN stays locked with an error (negative).
- Already-unlocked session (hook pre-seeded) → children render without showing the challenge first (positive).

**Admin settings (`src/admin/__tests__/AdminPage.test.jsx` additions):**
- Toggling lock on/off calls `updateSetting('parentalLock', ...)` with the expected shape (positive).
- Setting a PIN with matching confirmation saves it (positive).
- Mismatched confirmation shows an error and does not call `updateSetting` (negative).
- "Remove PIN" clears `pin` back to `''` (positive).

**E2E (`e2e/parental-lock.spec.js`, new):**
- Cold visit to `/admin` and to `/parent` each show the challenge screen; underlying page content is not present in the DOM (negative).
- Submitting a wrong answer keeps the route locked (negative).
- Submitting the correct answer unlocks and reveals the real page content (positive).
- After unlocking on `/admin`, navigating to `/parent` does not re-prompt (positive — shared session unlock).
- A new browser context (simulating a closed/reopened browser) is locked again (negative — session, not persistent).
- Gate screen passes existing a11y/HTML/CSS validation checks (`e2e/html-validity.spec.js`- and `css-validity.spec.js`-style coverage, or inline axe check consistent with other specs).

**i18n:** existing cross-locale key-parity test extends automatically once `en.json`/`es.json`/`pl.json` all carry the new keys — no new test needed, but a missing translation would fail it (implicit negative coverage).
