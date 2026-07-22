# Live Settings Sync — Language Change Without Refresh (Issue #117)

## Problem

"A language change requires a refresh to take place." Changing the locale in the Admin page's `LocaleSelector` persists correctly to storage and updates the Admin page's own UI, but the rest of the already-mounted app keeps rendering in the old language until the page is reloaded.

**Root cause:** `src/hooks/useSettings.js` gives every call site its own independent `useState` copy of settings, populated by a single `adapter.getSettings()` call on mount. There is no shared state or event bus between instances — each is only ever in sync with storage at the moment it mounted.

This is invisible for most consumers because they live inside `<Routes>` (`src/App.jsx:96-101`) and remount — and therefore refetch — on every navigation. It breaks specifically for the two consumers mounted as permanent siblings of `<Routes>`, which never remount for the life of the tab: `LocaleSync` and `GoogleAnalytics` (`src/App.jsx:35-72`). `LocaleSync` is what actually calls `i18n.changeLanguage()` — since it never remounts, it never re-reads storage, so it never learns the locale changed. `App.test.jsx:36-39` already has a comment documenting these as "several independent `useSettings()` consumers," written for an unrelated test-mocking reason, without connecting it to this bug.

Everything downstream of `i18n.changeLanguage()` already reacts live and correctly — every component using `useTranslation()` re-renders automatically on i18next's own `languageChanged` event (`ScoreHistory.jsx`, `ParentDashboard.jsx`, etc. already do this via `i18n.language`). The only missing link is getting `changeLanguage` invoked promptly when the setting changes in a different mounted instance.

## Design

### Architecture — module-level pub/sub in `useSettings.js`

Add a module-scoped `Set` of listener callbacks, shared by every `useSettings()` call in the app. No other hook or component's usage changes — the hook's returned shape (`{ settings, loaded, updateSetting, resetSettings }`) is unchanged.

- Each instance still does exactly what it does today on mount: call `adapter.getSettings()` once, populate local `useState`. This preserves every existing test's assumption that each instance independently fetches on mount — **no changes needed to the ~13 existing test files that mock `storage/index.js`** for other hooks/components.
- Each instance additionally subscribes a listener in a `useEffect` (added/removed via the effect's cleanup, so unmounting stops receiving broadcasts):
  ```js
  useEffect(() => {
    function onSettingsChanged(next) {
      settingsRef.current = next
      setSettings(next)
    }
    listeners.add(onSettingsChanged)
    return () => listeners.delete(onSettingsChanged)
  }, [])
  ```
- `updateSetting(key, value)` and `resetSettings()` compute the new object, update their own local state (as today via `setSettings`/`settingsRef`), then broadcast that object to every listener, then `await adapter.saveSettings(next)` (unchanged):
  ```js
  function broadcast(next) {
    for (const listener of listeners) listener(next)
  }
  ```

Broadcasting to all listeners, including the caller's own, is intentionally not filtered — the caller's `setSettings(next)` and the broadcast's `setSettings(next)` pass the identical object reference, so React's `Object.is` bail-out means the extra call is a no-op, not an extra render. Keeping this unfiltered avoids tracking "which listener is mine."

**Why this fixes the bug:** the moment Admin's `updateSetting('locale', 'es')` fires, `LocaleSync`'s subscribed listener receives the new settings object synchronously, its `settings.locale` updates, its existing `useEffect` (`src/App.jsx:64-69`) re-runs, and `i18n.changeLanguage('es')` fires immediately.

**Side benefit:** this fix is generic to all settings, not locale-specific — `GoogleAnalytics`, the other permanent sibling, gets the same live-update fix for free, with no changes to its own code.

**Error handling:** broadcast is a synchronous, in-memory dispatch — no I/O, nothing new to catch. `saveSettings` failure handling is unchanged from today (unhandled either way, same as the current code — out of scope to add retry/error UI as part of this fix).

**Race conditions:** none introduced. `localStorageAdapter.saveSettings` is a synchronous `localStorage.setItem` wrapped in an `async` function with no internal `await`, so by the time any `await adapter.saveSettings(next)` call resolves, the write has already happened — no ordering issue between the broadcast (in-memory, immediate) and persistence (synchronous, before the broadcasting call even suspends).

### Confirmation UI — `LocaleSelector.jsx`

The instant re-render is itself the primary feedback (the app visibly changes language), but per user request, add a brief, self-contained confirmation message:

- `LocaleSelector` tracks its own transient `confirming` boolean state, set `true` in its change handler and cleared via `setTimeout` (3000ms, matching the existing `resetConfirming` pattern in `AdminPage.jsx:20-33`), with the timeout cleared on unmount.
- Rendered as `<p role="status">{t('admin.localeUpdated')}</p>` next to the `<select>` — reusing the existing dual-purpose (visible text + screen-reader announcement) `role="status"` convention already used by `QuizGameShell.jsx`'s timeout message, rather than inventing a new toast mechanism.
- New i18n key `admin.localeUpdated` added to **all three** locale files (`en.json`, `es.json`, `pl.json`) — required by the existing cross-locale key-parity test in `src/i18n/__tests__/i18n.test.js`.

### Docs

- **CLAUDE.md** — one sentence added to the storage/hooks architecture paragraph noting that `useSettings()` instances stay synchronized with each other during a session (cross-instance broadcast on update), so a future reader doesn't reintroduce the per-instance-only assumption when touching this hook.
- **CHANGELOG.md** — new entry under the next patch version describing the fix and root cause, in this repo's existing narrative style (see `0.32.2`/`0.32.1` entries for the tone/detail level expected).
- **package.json** — patch version bump (`0.32.3` → `0.32.4`).

## Testing

**Unit — `src/hooks/__tests__/useSettings.test.js` (extend):**
- Positive: a second `renderHook(() => useSettings())` instance receives the new settings after a *different* instance's `updateSetting` call, without either instance remounting.
- Positive: same for `resetSettings` — a second instance observes the reset defaults.
- Negative: after one instance unmounts, a subsequent `updateSetting` from another instance does not throw and does not touch the unmounted instance's setter (no React act-warning about state updates on an unmounted component).
- Negative: a single instance with no other subscribers calls `updateSetting`/`resetSettings` without error (broadcasting to an empty listener set is a no-op, not a crash).

**Component — `src/components/__tests__/LocaleSelector.test.jsx` (extend):**
- Positive: selecting a new locale shows the confirmation message.
- Negative: the message is not present before any interaction, and disappears after the timeout elapses (use `vi.useFakeTimers()` + `fireEvent`, per this repo's established timed-feedback testing convention — not `userEvent`, which deadlocks with fake timers here).

**Integration — `src/App.test.jsx` (extend):** this is the actual regression test for the reported bug.
- Positive: render `<App/>` once, navigate to `/admin`, change the locale via `LocaleSelector`'s `<select>`, then assert `i18n.changeLanguage` is called and `document.documentElement.lang` updates — **without unmounting/remounting `App`**. This scenario fails today (requires a reload) and is the direct proof the fix works.
- Negative: changing the selector to the locale it's already on does not call `i18n.changeLanguage` again (confirms `LocaleSync`'s existing redundant-call guard, `src/App.jsx:66`, still holds with the new broadcast path).

**Lint:** `npm run lint` / `npm run lint:css` cover the changed files as usual; no new rules needed.

## Out of scope

- Adding error handling/retry UI for `saveSettings` failures — pre-existing gap, unrelated to this bug.
- Converting `useSettings` to a full external-store singleton (`useSyncExternalStore`) — considered and rejected: correct in principle, but would require every one of the ~13 existing hook/component test files that mock `storage/index.js` to add explicit store-reset wiring between tests, for no behavioral gain over the pub/sub approach here.
- A generic toast/notification system — the confirmation message is local to `LocaleSelector`, not a reusable app-wide component; no other setting currently needs this pattern.
