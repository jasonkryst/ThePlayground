# Parental Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate `/admin` and `/parent` behind a toddler-proofing unlock challenge (issue #127) — a generated math problem by default, or an optional parent-set PIN — so a child can't reach settings or the parent dashboard by tapping around.

**Architecture:** Three new layers (pure verification logic → session-unlock hook → route-gating component), plus a nested `parentalLock` settings object, an `AdminPage` settings section to configure it, `App.jsx` route wiring, and updates to the ~10 pre-existing e2e specs that navigate straight to `/admin`/`/parent` and would otherwise hit the new lock screen instead of real page content.

**Tech Stack:** React, react-i18next, Vitest + React Testing Library + jsdom, Playwright, existing `useSettings`/storage-adapter infrastructure.

## Global Constraints

- Settings key is a nested object: `parentalLock: { enabled: true, pin: '' }` (not flat keys) — see `docs/superpowers/specs/2026-07-26-parental-lock-design.md` § Data model.
- No hashing, no rate-limiting/lockout, no recovery flow beyond the existing "clear browser site data" path — this is a toddler deterrent, not a security boundary (see spec § Goals / non-goals).
- Unlock is session-scoped (`sessionStorage`, not `localStorage`).
- Every new user-facing string needs `en.json`, `es.json`, and `pl.json` entries — `src/i18n/__tests__/i18n.test.js` fails on any key-set mismatch across locales.
- Reuse existing CSS classes wherever the existing patterns already fit (`admin__toggle-btn`, `admin__tag-row`, `admin__tag-buttons`, `admin__tag-save`, `admin__tag-reset`, `admin__tag-error`, `admin__text-input`, `admin__hint`) — no new AdminPage CSS is needed.
- `ParentalLockGate`'s heading must be an `<h2>`, not `<h1>` — `AppShell` already renders the route's `<h1>` page title outside the gated Outlet content, so a second `<h1>` would be a duplicate-heading a11y/HTML defect.

---

### Task 1: Settings data model

**Files:**
- Modify: `src/storage/adapter.js` (the `DEFAULT_SETTINGS` object, currently lines 1–24)

**Interfaces:**
- Produces: `DEFAULT_SETTINGS.parentalLock = { enabled: true, pin: '' }`, consumed by every later task.

- [ ] **Step 1: Add the new default and a JSDoc line**

In `src/storage/adapter.js`, add `parentalLock` to `DEFAULT_SETTINGS` (keep it alongside the other nested-object settings like `tagOverrides`/`introDismissed`/`parentDateRange`):

```js
export const DEFAULT_SETTINGS = {
  numChoices: 2,
  feedbackMode: 'immediate',
  questionsPerSession: 10,
  gaId: '',
  childName: '',
  animationsEnabled: true,
  tagOverrides: {},
  timerMode: 'countUp',
  timeLimitSeconds: 10,
  maxTries: 'none',
  hintsEnabled: false,
  hintAfterWrongTaps: 2,
  retryCountsAsStreak: true,
  spacedRepetitionEnabled: false,
  adaptiveItemSelectionEnabled: false,
  difficultyAutoProgressionEnabled: false,
  introDismissed: {},
  speedRecordMinAccuracy: 70,
  locale: 'en',
  parentDateRange: { preset: 'all', start: null, end: null },
  memoryPairs: 5,
  soundEffectsEnabled: true,
  // parentalLock.enabled gates /admin and /parent behind a challenge (issue
  // #127); parentalLock.pin === '' means "use a generated math challenge",
  // a 4-digit string switches the gate to PIN mode. See
  // src/lib/parentalLock.js and src/components/ParentalLockGate.jsx.
  parentalLock: { enabled: true, pin: '' },
}
```

No migration code is needed: `localStorageAdapter.getSettings()` already does `{ ...DEFAULT_SETTINGS, ...migrated }`, so an existing install's persisted settings (which has no `parentalLock` key at all) picks up this default automatically, the same way every prior new setting has.

- [ ] **Step 2: Verify the existing adapter contract test still passes with the new default**

Run: `npx vitest run src/storage/__tests__/localStorageAdapter.contract.test.js`
Expected: PASS — `adapterContract.js`'s `'returns exactly DEFAULT_SETTINGS before any settings are saved'` test does a deep-equal against the live `DEFAULT_SETTINGS` export, so it picks up the new key automatically with no test changes needed.

- [ ] **Step 3: Commit**

```bash
git add src/storage/adapter.js
git commit -m "$(cat <<'EOF'
feat(settings): add parentalLock default setting (#127)

Nested {enabled, pin} object, consistent with tagOverrides/introDismissed/
parentDateRange — leaves room to grow (e.g. a future login mode) without a
settings migration. No migration needed for existing installs: getSettings()
already backfills any missing DEFAULT_SETTINGS key.
EOF
)"
```

---

### Task 2: Pure unlock-verification logic (`src/lib/parentalLock.js`)

**Files:**
- Create: `src/lib/parentalLock.js`
- Test: `src/lib/__tests__/parentalLock.test.js`

**Interfaces:**
- Consumes: nothing (pure functions, no imports beyond none needed).
- Produces:
  - `getChallenge(parentalLockSettings, rng = Math.random)` → `{ mode: 'math', a: number, b: number, answer: number }` when `parentalLockSettings?.pin` is falsy/empty, or `{ mode: 'pin', pin: string }` when it's set.
  - `verifyUnlock(challenge, input)` → `boolean`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/parentalLock.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { getChallenge, verifyUnlock } from '../parentalLock'

describe('getChallenge', () => {
  it('returns a math challenge with in-range operands when no PIN is set', () => {
    const challenge = getChallenge({ enabled: true, pin: '' }, () => 0.5)
    expect(challenge.mode).toBe('math')
    expect(challenge.a).toBeGreaterThanOrEqual(2)
    expect(challenge.a).toBeLessThanOrEqual(9)
    expect(challenge.b).toBeGreaterThanOrEqual(2)
    expect(challenge.b).toBeLessThanOrEqual(9)
    expect(challenge.answer).toBe(challenge.a + challenge.b)
  })

  it('returns a pin challenge when a PIN is set', () => {
    const challenge = getChallenge({ enabled: true, pin: '4242' })
    expect(challenge).toEqual({ mode: 'pin', pin: '4242' })
  })

  it('treats a missing settings object as math mode (negative: no crash on undefined)', () => {
    const challenge = getChallenge(undefined, () => 0)
    expect(challenge.mode).toBe('math')
  })
})

describe('verifyUnlock', () => {
  it('accepts the correct sum for a math challenge', () => {
    const challenge = { mode: 'math', a: 3, b: 4, answer: 7 }
    expect(verifyUnlock(challenge, '7')).toBe(true)
  })

  it('rejects a wrong sum for a math challenge (negative)', () => {
    const challenge = { mode: 'math', a: 3, b: 4, answer: 7 }
    expect(verifyUnlock(challenge, '8')).toBe(false)
  })

  it('rejects non-numeric input for a math challenge (negative)', () => {
    const challenge = { mode: 'math', a: 3, b: 4, answer: 7 }
    expect(verifyUnlock(challenge, 'seven')).toBe(false)
  })

  it('accepts the correct PIN', () => {
    expect(verifyUnlock({ mode: 'pin', pin: '4242' }, '4242')).toBe(true)
  })

  it('rejects an incorrect PIN (negative)', () => {
    expect(verifyUnlock({ mode: 'pin', pin: '4242' }, '1234')).toBe(false)
  })

  it('rejects empty input (negative)', () => {
    expect(verifyUnlock({ mode: 'math', a: 3, b: 4, answer: 7 }, '')).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/__tests__/parentalLock.test.js`
Expected: FAIL with "Failed to resolve import" / "does not provide an export named 'getChallenge'" (the module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/parentalLock.js`:

```js
// Pure unlock-challenge logic for ParentalLockGate (issue #127). No React,
// no storage access — this is deliberately isolated so a future login
// system can add a third `mode` here without touching the gate component
// or useParentalLockSession (see docs/superpowers/specs/2026-07-26-parental-lock-design.md).
//
// This is a toddler deterrent, not a real security boundary: embedding the
// expected answer in the returned challenge object is fine (the whole app
// already runs client-side with full access to its own state).

export function getChallenge(parentalLockSettings, rng = Math.random) {
  const pin = parentalLockSettings?.pin ?? ''
  if (pin) {
    return { mode: 'pin', pin }
  }
  const a = 2 + Math.floor(rng() * 8) // 2-9 inclusive
  const b = 2 + Math.floor(rng() * 8) // 2-9 inclusive
  return { mode: 'math', a, b, answer: a + b }
}

export function verifyUnlock(challenge, input) {
  const trimmed = String(input ?? '').trim()
  if (trimmed === '') return false
  if (challenge.mode === 'pin') {
    return trimmed === challenge.pin
  }
  return Number(trimmed) === challenge.answer
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/__tests__/parentalLock.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/parentalLock.js src/lib/__tests__/parentalLock.test.js
git commit -m "$(cat <<'EOF'
feat(lib): add parentalLock challenge/verification logic (#127)

Pure module: getChallenge resolves math-vs-PIN mode from settings,
verifyUnlock checks an answer against it. Isolated from React/storage so a
future login mode is additive here without touching the gate component.
EOF
)"
```

---

### Task 3: Session-unlock hook (`src/hooks/useParentalLockSession.js`)

**Files:**
- Create: `src/hooks/useParentalLockSession.js`
- Test: `src/hooks/__tests__/useParentalLockSession.test.js`

**Interfaces:**
- Consumes: nothing beyond the browser `sessionStorage` global.
- Produces: `useParentalLockSession()` → `{ unlocked: boolean, unlock: () => void, lock: () => void }`. Consumed by `ParentalLockGate` in Task 5.
- sessionStorage key: `'pg-parental-lock-unlocked'` (exact string — the e2e bypass helper added in Task 8 must match this literal).

- [ ] **Step 1: Write the failing test**

Create `src/hooks/__tests__/useParentalLockSession.test.js`:

```jsx
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import useParentalLockSession from '../useParentalLockSession'

beforeEach(() => {
  sessionStorage.clear()
})

describe('useParentalLockSession', () => {
  it('starts locked when no session flag is present (negative)', () => {
    const { result } = renderHook(() => useParentalLockSession())
    expect(result.current.unlocked).toBe(false)
  })

  it('unlock() flips unlocked to true and persists the session flag', () => {
    const { result } = renderHook(() => useParentalLockSession())
    act(() => result.current.unlock())
    expect(result.current.unlocked).toBe(true)
    expect(sessionStorage.getItem('pg-parental-lock-unlocked')).toBe('1')
  })

  it('a fresh hook instance reads a pre-existing session flag as already unlocked (positive persistence)', () => {
    sessionStorage.setItem('pg-parental-lock-unlocked', '1')
    const { result } = renderHook(() => useParentalLockSession())
    expect(result.current.unlocked).toBe(true)
  })

  it('lock() clears the flag and flips unlocked back to false (negative re-arm)', () => {
    const { result } = renderHook(() => useParentalLockSession())
    act(() => result.current.unlock())
    act(() => result.current.lock())
    expect(result.current.unlocked).toBe(false)
    expect(sessionStorage.getItem('pg-parental-lock-unlocked')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/hooks/__tests__/useParentalLockSession.test.js`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/hooks/useParentalLockSession.js`:

```js
import { useState, useCallback } from 'react'

const SESSION_KEY = 'pg-parental-lock-unlocked'

// Per-tab-session unlock for ParentalLockGate (issue #127): a sessionStorage
// flag, not localStorage, so closing the tab/browser re-locks. This hook is
// the seam a future login system would replace internals of (a real
// session/token check instead of a flag) without any consumer changing —
// see docs/superpowers/specs/2026-07-26-parental-lock-design.md.
export default function useParentalLockSession() {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(SESSION_KEY) === '1')

  const unlock = useCallback(() => {
    sessionStorage.setItem(SESSION_KEY, '1')
    setUnlocked(true)
  }, [])

  const lock = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY)
    setUnlocked(false)
  }, [])

  return { unlocked, unlock, lock }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/hooks/__tests__/useParentalLockSession.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useParentalLockSession.js src/hooks/__tests__/useParentalLockSession.test.js
git commit -m "$(cat <<'EOF'
feat(hooks): add useParentalLockSession (#127)

Wraps the sessionStorage-backed per-session unlock flag behind a
{unlocked, unlock, lock} hook, so ParentalLockGate never touches
sessionStorage directly and a future login system has one seam to replace.
EOF
)"
```

---

### Task 4: i18n strings

**Files:**
- Modify: `src/i18n/en.json`
- Modify: `src/i18n/es.json`
- Modify: `src/i18n/pl.json`

**Interfaces:**
- Produces the translation keys `ParentalLockGate` (Task 5) and `AdminPage`'s new section (Task 7) read via `t(...)`.

- [ ] **Step 1: Add gate-screen strings under `common` in all three locale files**

In `src/i18n/en.json`, find the `"resumeStartFreshAction"` line (end of the `common` block) and add four new keys after it, before the closing `},`:

```json
    "resumeStartFreshAction": "Start Fresh",
    "parentalLockHeading": "Parents Only",
    "parentalLockMathPrompt": "What's {{a}} + {{b}}?",
    "parentalLockPinPrompt": "Enter the PIN to continue",
    "parentalLockSubmitButton": "Unlock",
    "parentalLockWrongAnswer": "That's not it — try again."
  },
```

In `src/i18n/es.json`, same anchor:

```json
    "resumeStartFreshAction": "Empezar de cero",
    "parentalLockHeading": "Solo para adultos",
    "parentalLockMathPrompt": "¿Cuánto es {{a}} + {{b}}?",
    "parentalLockPinPrompt": "Ingresa el PIN para continuar",
    "parentalLockSubmitButton": "Desbloquear",
    "parentalLockWrongAnswer": "Eso no es correcto — inténtalo de nuevo."
  },
```

In `src/i18n/pl.json`, same anchor:

```json
    "resumeStartFreshAction": "Zacznij od nowa",
    "parentalLockHeading": "Tylko dla dorosłych",
    "parentalLockMathPrompt": "Ile to {{a}} + {{b}}?",
    "parentalLockPinPrompt": "Wpisz PIN, aby kontynuować",
    "parentalLockSubmitButton": "Odblokuj",
    "parentalLockWrongAnswer": "To nie to — spróbuj ponownie."
  },
```

- [ ] **Step 2: Add AdminPage settings-section strings under `admin` in all three locale files**

In `src/i18n/en.json`, find `"soundEffectsOff": "Off",` (immediately before `"reset": "Reset to Defaults",` inside the `admin` block) and insert after it:

```json
    "soundEffectsOff": "Off",
    "parentalLockHeading": "Parental Lock",
    "parentalLockHint": "Require solving a simple challenge before Settings or the Parent Dashboard can be opened.",
    "parentalLockToggleOn": "On",
    "parentalLockToggleOff": "Off",
    "parentalLockModeMathHint": "Currently using a math challenge — no PIN is set.",
    "parentalLockModePinHint": "A custom PIN is set.",
    "parentalLockPinLabel": "Set a PIN",
    "parentalLockPinPlaceholder": "4-digit PIN",
    "parentalLockPinConfirmLabel": "Confirm PIN",
    "parentalLockPinConfirmPlaceholder": "Re-enter PIN",
    "parentalLockSetPinButton": "Save PIN",
    "parentalLockRemovePinButton": "Remove PIN",
    "parentalLockPinMismatchError": "PINs don't match.",
    "parentalLockPinInvalidError": "PIN must be exactly 4 digits.",
    "reset": "Reset to Defaults",
```

In `src/i18n/es.json`, find `"soundEffectsOff": "Desactivados",` and insert after it:

```json
    "soundEffectsOff": "Desactivados",
    "parentalLockHeading": "Bloqueo parental",
    "parentalLockHint": "Exigir resolver un desafío sencillo antes de abrir Configuración o el Panel de padres.",
    "parentalLockToggleOn": "Activado",
    "parentalLockToggleOff": "Desactivado",
    "parentalLockModeMathHint": "Actualmente se usa un desafío matemático — no hay PIN configurado.",
    "parentalLockModePinHint": "Hay un PIN personalizado configurado.",
    "parentalLockPinLabel": "Establecer un PIN",
    "parentalLockPinPlaceholder": "PIN de 4 dígitos",
    "parentalLockPinConfirmLabel": "Confirmar PIN",
    "parentalLockPinConfirmPlaceholder": "Vuelve a ingresar el PIN",
    "parentalLockSetPinButton": "Guardar PIN",
    "parentalLockRemovePinButton": "Quitar PIN",
    "parentalLockPinMismatchError": "Los PIN no coinciden.",
    "parentalLockPinInvalidError": "El PIN debe tener exactamente 4 dígitos.",
    "reset": "Restablecer valores predeterminados",
```

In `src/i18n/pl.json`, find `"soundEffectsOff": "Wyłączone",` and insert after it:

```json
    "soundEffectsOff": "Wyłączone",
    "parentalLockHeading": "Blokada rodzicielska",
    "parentalLockHint": "Wymagaj rozwiązania prostego zadania przed otwarciem Ustawień lub Panelu rodzica.",
    "parentalLockToggleOn": "Włączona",
    "parentalLockToggleOff": "Wyłączona",
    "parentalLockModeMathHint": "Obecnie używane jest zadanie matematyczne — kod PIN nie jest ustawiony.",
    "parentalLockModePinHint": "Ustawiono niestandardowy kod PIN.",
    "parentalLockPinLabel": "Ustaw kod PIN",
    "parentalLockPinPlaceholder": "4-cyfrowy PIN",
    "parentalLockPinConfirmLabel": "Potwierdź PIN",
    "parentalLockPinConfirmPlaceholder": "Wpisz PIN ponownie",
    "parentalLockSetPinButton": "Zapisz PIN",
    "parentalLockRemovePinButton": "Usuń PIN",
    "parentalLockPinMismatchError": "Kody PIN się nie zgadzają.",
    "parentalLockPinInvalidError": "PIN musi mieć dokładnie 4 cyfry.",
    "reset": "Przywróć ustawienia domyślne",
```

- [ ] **Step 3: Verify cross-locale key parity**

Run: `npx vitest run src/i18n/__tests__/i18n.test.js`
Expected: PASS — the `'has the exact same set of base translation keys in en, es, and pl'` test confirms all 21 new keys (5 `common.*` + 16 `admin.*`... actually 6 + 15, count doesn't matter, exact set does) exist identically in all three files.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/en.json src/i18n/es.json src/i18n/pl.json
git commit -m "$(cat <<'EOF'
feat(i18n): add parental lock strings (#127)

Gate-screen copy under common.parentalLock*, AdminPage settings-section
copy under admin.parentalLock*, translated to en/es/pl.
EOF
)"
```

---

### Task 5: `ParentalLockGate` component

**Files:**
- Create: `src/components/ParentalLockGate.jsx`
- Create: `src/components/ParentalLockGate.css`
- Test: `src/components/__tests__/ParentalLockGate.test.jsx`

**Interfaces:**
- Consumes: `useSettings()` (existing hook, `settings.parentalLock`), `useParentalLockSession()` (Task 3), `getChallenge`/`verifyUnlock` (Task 2), `useFocusOnMount()` (existing hook).
- Produces: `<ParentalLockGate>{children}</ParentalLockGate>` — renders `children` when unlocked/disabled, otherwise a full-page challenge. Consumed by `App.jsx` in Task 6.
- Input element has a stable `id="parental-lock-input"` (Task 9's e2e spec targets this id directly, since the visible prompt text is randomized in math mode).

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/ParentalLockGate.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ParentalLockGate from '../ParentalLockGate'

let mockParentalLock = { enabled: true, pin: '' }

vi.mock('../../hooks/useSettings', () => ({
  default: () => ({
    settings: { parentalLock: mockParentalLock },
    loaded: true,
    updateSetting: vi.fn(),
    resetSettings: vi.fn(),
  }),
}))

const { mockGetChallenge, mockVerifyUnlock } = vi.hoisted(() => ({
  mockGetChallenge: vi.fn(),
  mockVerifyUnlock: vi.fn(),
}))

vi.mock('../../lib/parentalLock', () => ({
  getChallenge: mockGetChallenge,
  verifyUnlock: mockVerifyUnlock,
}))

beforeEach(() => {
  sessionStorage.clear()
  mockParentalLock = { enabled: true, pin: '' }
  mockGetChallenge.mockReset()
  mockVerifyUnlock.mockReset()
  let call = 0
  mockGetChallenge.mockImplementation(() => {
    call += 1
    return { mode: 'math', a: call, b: call, answer: call * 2 }
  })
})

function renderGate() {
  return render(
    <ParentalLockGate>
      <div data-testid="protected-content">Secret</div>
    </ParentalLockGate>
  )
}

describe('ParentalLockGate', () => {
  it('renders children immediately when the lock is disabled (positive passthrough)', () => {
    mockParentalLock = { enabled: false, pin: '' }
    renderGate()
    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
  })

  it('shows the challenge and withholds children when the lock is enabled and not yet unlocked (negative)', () => {
    renderGate()
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Parents Only' })).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('unlocks and reveals children on a correct answer', () => {
    mockVerifyUnlock.mockReturnValue(true)
    renderGate()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
    expect(sessionStorage.getItem('pg-parental-lock-unlocked')).toBe('1')
  })

  it('stays locked, shows an error, clears the input, and rolls a new challenge on a wrong answer (negative)', () => {
    mockVerifyUnlock.mockReturnValue(false)
    renderGate()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '99' } })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent("That's not it")
    expect(screen.getByRole('textbox').value).toBe('')
    expect(mockGetChallenge).toHaveBeenCalledTimes(2)
  })

  it('shows the PIN prompt instead of a math prompt when the challenge is pin mode', () => {
    mockGetChallenge.mockReturnValue({ mode: 'pin', pin: '4242' })
    renderGate()
    expect(screen.getByText('Enter the PIN to continue')).toBeInTheDocument()
  })

  it('reveals children without showing the challenge when the session is already unlocked (positive)', () => {
    sessionStorage.setItem('pg-parental-lock-unlocked', '1')
    renderGate()
    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Parents Only' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/__tests__/ParentalLockGate.test.jsx`
Expected: FAIL — `ParentalLockGate` module doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/components/ParentalLockGate.jsx`:

```jsx
import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import useSettings from '../hooks/useSettings'
import useParentalLockSession from '../hooks/useParentalLockSession'
import useFocusOnMount from '../hooks/useFocusOnMount'
import { getChallenge, verifyUnlock } from '../lib/parentalLock'
import './ParentalLockGate.css'

// Route-level gate for /admin and /parent (issue #127): a toddler-proofing
// challenge, not a real access-control boundary (see SECURITY.md). Children
// are never mounted while locked — not just visually hidden — so no
// settings/score data reaches the DOM pre-unlock. getChallenge/verifyUnlock
// (src/lib/parentalLock.js) own what counts as a valid answer; this
// component only renders the prompt and tracks the per-session unlock via
// useParentalLockSession.
export default function ParentalLockGate({ children }) {
  const { t } = useTranslation()
  const { settings } = useSettings()
  const { unlocked, unlock } = useParentalLockSession()
  const [challenge, setChallenge] = useState(() => getChallenge(settings.parentalLock))
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)
  const headingRef = useFocusOnMount()
  const inputRef = useRef(null)

  if (!settings.parentalLock?.enabled || unlocked) {
    return children
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (verifyUnlock(challenge, input)) {
      unlock()
      return
    }
    setError(true)
    setInput('')
    if (challenge.mode === 'math') {
      setChallenge(getChallenge(settings.parentalLock))
    }
    inputRef.current?.focus()
  }

  const prompt = challenge.mode === 'math'
    ? t('common.parentalLockMathPrompt', { a: challenge.a, b: challenge.b })
    : t('common.parentalLockPinPrompt')

  return (
    <div className="parental-lock-gate">
      <form className="parental-lock-gate__card" onSubmit={handleSubmit}>
        <h2 className="parental-lock-gate__heading" tabIndex={-1} ref={headingRef}>
          {t('common.parentalLockHeading')}
        </h2>
        <label className="parental-lock-gate__label" htmlFor="parental-lock-input">
          {prompt}
        </label>
        <input
          id="parental-lock-input"
          ref={inputRef}
          className="parental-lock-gate__input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={input}
          onChange={e => { setInput(e.target.value); setError(false) }}
        />
        <button type="submit" className="parental-lock-gate__submit">
          {t('common.parentalLockSubmitButton')}
        </button>
        {error && (
          <p className="parental-lock-gate__error" role="alert">
            {t('common.parentalLockWrongAnswer')}
          </p>
        )}
      </form>
    </div>
  )
}
```

Create `src/components/ParentalLockGate.css`:

```css
.parental-lock-gate {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--color-bg);
}

.parental-lock-gate__card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 360px;
  text-align: center;
}

.parental-lock-gate__heading {
  font-size: 1.75rem;
  font-weight: 800;
  margin: 0;
}

.parental-lock-gate__heading:focus         { outline: none; }
.parental-lock-gate__heading:focus-visible { outline: 3px solid var(--color-lavender); outline-offset: 3px; }

.parental-lock-gate__label {
  font-size: 1.1rem;
}

.parental-lock-gate__input {
  font-size: 1.5rem;
  text-align: center;
  padding: 12px;
  border: 2px solid var(--color-lavender);
  border-radius: 12px;
}

.parental-lock-gate__input:focus { outline: 3px solid var(--color-lavender); outline-offset: 2px; }

.parental-lock-gate__submit {
  font-size: 1.1rem;
  font-weight: 700;
  padding: 12px 24px;
  border-radius: 12px;
  border: none;
  background: var(--color-aqua);
  min-height: 64px;
  cursor: pointer;
}

.parental-lock-gate__submit:hover { opacity: 0.9; }
.parental-lock-gate__submit:focus         { outline: none; }
.parental-lock-gate__submit:focus-visible { outline: 3px solid var(--color-lavender); outline-offset: 3px; }

.parental-lock-gate__error {
  color: var(--color-error);
  margin: 0;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/components/__tests__/ParentalLockGate.test.jsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ParentalLockGate.jsx src/components/ParentalLockGate.css src/components/__tests__/ParentalLockGate.test.jsx
git commit -m "$(cat <<'EOF'
feat(components): add ParentalLockGate (#127)

Route-gating wrapper: renders children when the lock is off or the session
is already unlocked, otherwise a full-page math/PIN challenge. Children are
never mounted while locked. Not yet wired into any route.
EOF
)"
```

---

### Task 6: Wire the gate into `App.jsx`

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `ParentalLockGate` (Task 5).

- [ ] **Step 1: Add the import**

In `src/App.jsx`, add near the other component imports (after `import OrientationGate from './components/OrientationGate'`):

```jsx
import ParentalLockGate from './components/ParentalLockGate'
```

- [ ] **Step 2: Wrap the `/admin` and `/parent` routes**

Replace:

```jsx
          <Route path="/admin"        element={<Suspense fallback={<div style={{ padding: 24 }}>Loading...</div>}><AdminPage manifests={manifests} /></Suspense>} />
          <Route path="/parent"       element={<Suspense fallback={<div style={{ padding: 24 }}>Loading...</div>}><ParentDashboard manifests={manifests} /></Suspense>} />
```

with:

```jsx
          <Route path="/admin"        element={<ParentalLockGate><Suspense fallback={<div style={{ padding: 24 }}>Loading...</div>}><AdminPage manifests={manifests} /></Suspense></ParentalLockGate>} />
          <Route path="/parent"       element={<ParentalLockGate><Suspense fallback={<div style={{ padding: 24 }}>Loading...</div>}><ParentDashboard manifests={manifests} /></Suspense></ParentalLockGate>} />
```

The gate sits outside `<Suspense>` deliberately — the lazy `AdminPage`/`ParentDashboard` chunk isn't fetched at all until the gate is passed. `/my-progress` and `/game/:gameId` are untouched (kid-facing, not gated).

- [ ] **Step 3: Verify existing App-level tests still pass**

Run: `npx vitest run src/App.test.jsx`
Expected: PASS. These tests mock `./storage/index` wholesale with a stub `DEFAULT_SETTINGS: { locale: 'en' }` that has no `parentalLock` key — `settings.parentalLock?.enabled` evaluates to `undefined` (falsy), so `ParentalLockGate` passes through to real content in this test file, same as before the gate existed. If this unexpectedly fails, add `parentalLock: { enabled: false, pin: '' }` to that mock's `DEFAULT_SETTINGS` stub (`src/App.test.jsx` line 20) and re-run.

- [ ] **Step 4: Run the full unit suite as a broader regression check**

Run: `npm test -- --run`
Expected: PASS across the board.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "$(cat <<'EOF'
feat(app): gate /admin and /parent behind ParentalLockGate (#127)

Wrapped outside Suspense so the lazy admin/parent bundle isn't fetched
until the challenge is passed. /my-progress and game routes are unaffected.
EOF
)"
```

---

### Task 7: AdminPage settings section

**Files:**
- Modify: `src/admin/AdminPage.jsx`
- Modify: `src/admin/__tests__/AdminPage.test.jsx`

**Interfaces:**
- Consumes: `settings.parentalLock`, `updateSetting('parentalLock', {...})` (existing `useSettings()` already destructured in `AdminPage.jsx`).

- [ ] **Step 1: Add PIN-draft state and handlers to `AdminPage.jsx`**

Near the existing `resetConfirming` state (around line 20 in `src/admin/AdminPage.jsx`), add:

```jsx
  const [pinDraft, setPinDraft] = useState('')
  const [pinConfirmDraft, setPinConfirmDraft] = useState('')
  const [pinError, setPinError] = useState(null) // 'mismatch' | 'invalid' | null

  function handleSetPin() {
    if (!/^\d{4}$/.test(pinDraft)) {
      setPinError('invalid')
      return
    }
    if (pinDraft !== pinConfirmDraft) {
      setPinError('mismatch')
      return
    }
    setPinError(null)
    updateSetting('parentalLock', { ...settings.parentalLock, pin: pinDraft })
    setPinDraft('')
    setPinConfirmDraft('')
  }

  function handleRemovePin() {
    updateSetting('parentalLock', { ...settings.parentalLock, pin: '' })
    setPinDraft('')
    setPinConfirmDraft('')
    setPinError(null)
  }
```

- [ ] **Step 2: Add the Parental Lock section to the General group**

In `src/admin/AdminPage.jsx`, find the Google Analytics section (ends with the `gaId` input's closing `</div>`, immediately before the General group's closing `</section>`):

```jsx
            <div className="admin__section">
              <h3>{t('admin.gaHeading')}</h3>
              <p className="admin__hint">{t('admin.gaHint')}</p>
              <input
                className="admin__text-input"
                type="text"
                placeholder="G-XXXXXXXXXX"
                value={settings.gaId || ''}
                onChange={e => updateSetting('gaId', e.target.value)}
                aria-label={t('admin.gaLabel')}
                spellCheck={false}
              />
            </div>
          </section>
```

Replace with (new section inserted before the closing `</section>`):

```jsx
            <div className="admin__section">
              <h3>{t('admin.gaHeading')}</h3>
              <p className="admin__hint">{t('admin.gaHint')}</p>
              <input
                className="admin__text-input"
                type="text"
                placeholder="G-XXXXXXXXXX"
                value={settings.gaId || ''}
                onChange={e => updateSetting('gaId', e.target.value)}
                aria-label={t('admin.gaLabel')}
                spellCheck={false}
              />
            </div>

            <div className="admin__section">
              <h3>{t('admin.parentalLockHeading')}</h3>
              <p className="admin__hint">{t('admin.parentalLockHint')}</p>
              <div className="admin__toggle">
                <button
                  className={`admin__toggle-btn${settings.parentalLock?.enabled ? ' active' : ''}`}
                  onClick={() => updateSetting('parentalLock', { ...settings.parentalLock, enabled: true })}
                >
                  {t('admin.parentalLockToggleOn')}
                </button>
                <button
                  className={`admin__toggle-btn${!settings.parentalLock?.enabled ? ' active' : ''}`}
                  onClick={() => updateSetting('parentalLock', { ...settings.parentalLock, enabled: false })}
                >
                  {t('admin.parentalLockToggleOff')}
                </button>
              </div>
              {settings.parentalLock?.enabled && (
                <div className="admin__tag-row">
                  <p className="admin__hint">
                    {settings.parentalLock?.pin ? t('admin.parentalLockModePinHint') : t('admin.parentalLockModeMathHint')}
                  </p>
                  <input
                    className="admin__text-input"
                    type="text"
                    inputMode="numeric"
                    placeholder={t('admin.parentalLockPinPlaceholder')}
                    value={pinDraft}
                    onChange={e => { setPinDraft(e.target.value); setPinError(null) }}
                    aria-label={t('admin.parentalLockPinLabel')}
                  />
                  <input
                    className="admin__text-input"
                    type="text"
                    inputMode="numeric"
                    placeholder={t('admin.parentalLockPinConfirmPlaceholder')}
                    value={pinConfirmDraft}
                    onChange={e => { setPinConfirmDraft(e.target.value); setPinError(null) }}
                    aria-label={t('admin.parentalLockPinConfirmLabel')}
                  />
                  {pinError === 'mismatch' && <p className="admin__tag-error">{t('admin.parentalLockPinMismatchError')}</p>}
                  {pinError === 'invalid' && <p className="admin__tag-error">{t('admin.parentalLockPinInvalidError')}</p>}
                  <div className="admin__tag-buttons">
                    <button className="admin__tag-save" onClick={handleSetPin}>
                      {t('admin.parentalLockSetPinButton')}
                    </button>
                    {settings.parentalLock?.pin && (
                      <button className="admin__tag-reset" onClick={handleRemovePin}>
                        {t('admin.parentalLockRemovePinButton')}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
```

No new CSS is needed — `admin__tag-row`, `admin__tag-buttons`, `admin__tag-save`, `admin__tag-reset`, and `admin__tag-error` already exist in `AdminPage.css` (built for the Games-tab tag editor) and already lay out as a vertical stack with a button row, which is exactly what the PIN fields need.

- [ ] **Step 3: Update the test mock and add coverage in `AdminPage.test.jsx`**

In `src/admin/__tests__/AdminPage.test.jsx`, add `parentalLock` to `mockSettingsDefaults` (near the top of the file):

```js
const mockSettingsDefaults = {
  numChoices: 2, feedbackMode: 'immediate', questionsPerSession: 10, childName: '', animationsEnabled: true,
  timerMode: 'countUp', timeLimitSeconds: 10, speedRecordMinAccuracy: 70,
  maxTries: 'none', hintsEnabled: false, hintAfterWrongTaps: 2,
  retryCountsAsStreak: true, spacedRepetitionEnabled: false, adaptiveItemSelectionEnabled: false, difficultyAutoProgressionEnabled: false,
  memoryPairs: 5, soundEffectsEnabled: true,
  parentalLock: { enabled: false, pin: '' },
}
```

Then add these tests inside the existing `describe('AdminPage', ...)` block (anywhere after the other setting tests, e.g. right before the file's final closing `})`):

```jsx
  it('renders the parental lock toggle', () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    expect(screen.getByText(/parental lock/i)).toBeInTheDocument()
  })

  it('calls updateSetting with the lock enabled when turned on', async () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    const lockSection = screen.getByRole('heading', { name: /parental lock/i }).closest('.admin__section')
    await userEvent.click(within(lockSection).getByRole('button', { name: /^on$/i }))
    expect(mockUpdateSetting).toHaveBeenCalledWith('parentalLock', { enabled: true, pin: '' })
  })

  it('does not show PIN fields when the lock is off (negative)', () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    expect(screen.queryByLabelText(/set a pin/i)).not.toBeInTheDocument()
  })

  it('shows PIN fields when the lock is on', () => {
    mockSettingsDefaults.parentalLock = { enabled: true, pin: '' }
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    expect(screen.getByLabelText(/set a pin/i)).toBeInTheDocument()
    mockSettingsDefaults.parentalLock = { enabled: false, pin: '' }
  })

  it('saves a PIN when the confirmation matches', async () => {
    mockSettingsDefaults.parentalLock = { enabled: true, pin: '' }
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    await userEvent.type(screen.getByLabelText(/set a pin/i), '1234')
    await userEvent.type(screen.getByLabelText(/confirm pin/i), '1234')
    await userEvent.click(screen.getByRole('button', { name: /save pin/i }))
    expect(mockUpdateSetting).toHaveBeenCalledWith('parentalLock', { enabled: true, pin: '1234' })
    mockSettingsDefaults.parentalLock = { enabled: false, pin: '' }
  })

  it('rejects a mismatched PIN confirmation and does not save (negative)', async () => {
    mockSettingsDefaults.parentalLock = { enabled: true, pin: '' }
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    await userEvent.type(screen.getByLabelText(/set a pin/i), '1234')
    await userEvent.type(screen.getByLabelText(/confirm pin/i), '5678')
    await userEvent.click(screen.getByRole('button', { name: /save pin/i }))
    expect(screen.getByText(/pins don't match/i)).toBeInTheDocument()
    expect(mockUpdateSetting).not.toHaveBeenCalledWith('parentalLock', expect.anything())
    mockSettingsDefaults.parentalLock = { enabled: false, pin: '' }
  })

  it('rejects a PIN that is not exactly 4 digits (negative)', async () => {
    mockSettingsDefaults.parentalLock = { enabled: true, pin: '' }
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    await userEvent.type(screen.getByLabelText(/set a pin/i), '12')
    await userEvent.type(screen.getByLabelText(/confirm pin/i), '12')
    await userEvent.click(screen.getByRole('button', { name: /save pin/i }))
    expect(screen.getByText(/must be exactly 4 digits/i)).toBeInTheDocument()
    mockSettingsDefaults.parentalLock = { enabled: false, pin: '' }
  })

  it('removes an existing PIN, reverting to math-challenge mode', async () => {
    mockSettingsDefaults.parentalLock = { enabled: true, pin: '1234' }
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: /remove pin/i }))
    expect(mockUpdateSetting).toHaveBeenCalledWith('parentalLock', { enabled: true, pin: '' })
    mockSettingsDefaults.parentalLock = { enabled: false, pin: '' }
  })

  it('does not show the Remove PIN button when no PIN is set (negative)', () => {
    mockSettingsDefaults.parentalLock = { enabled: true, pin: '' }
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: /remove pin/i })).not.toBeInTheDocument()
    mockSettingsDefaults.parentalLock = { enabled: false, pin: '' }
  })
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/admin/__tests__/AdminPage.test.jsx`
Expected: PASS (all prior tests plus the 9 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/admin/AdminPage.jsx src/admin/__tests__/AdminPage.test.jsx
git commit -m "$(cat <<'EOF'
feat(admin): add Parental Lock settings section (#127)

On/off toggle plus optional 4-digit PIN (set/remove), reusing the existing
tag-row/tag-buttons CSS from the Games tab — no new styles needed.
EOF
)"
```

---

### Task 8: Bypass the lock in pre-existing e2e specs

**Why:** these specs navigate straight to `/admin` or `/parent` to configure settings or validate rendered output; with the lock defaulting to on, they'd hit the challenge screen instead of real content. Each fix seeds the session-unlock flag via `page.addInitScript`, so the app never even shows the gate — this is independent of whatever `playground_settings` localStorage a given spec seeds (or doesn't), since it's a different storage object entirely (`sessionStorage`, key `'pg-parental-lock-unlocked'`, matching Task 3's hook exactly).

**Files:**
- Modify: `e2e/admin.spec.js`
- Modify: `e2e/animal-sounds.spec.js`
- Modify: `e2e/character-match.spec.js`
- Modify: `e2e/color-match.spec.js`
- Modify: `e2e/intro-results-height.spec.js`
- Modify: `e2e/parent-dashboard.spec.js`
- Modify: `e2e/tap-target-standard.spec.js`
- Modify: `e2e/zoom-large-text.spec.js`
- Modify: `e2e/html-validity.spec.js`
- Modify: `e2e/css-validity.spec.js`

- [ ] **Step 1: `e2e/admin.spec.js`**

Replace:

```js
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('admin settings persist after reload', async ({ page }) => {
```

with:

```js
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('pg-parental-lock-unlocked', '1'))
})

test('admin settings persist after reload', async ({ page }) => {
```

- [ ] **Step 2: `e2e/animal-sounds.spec.js`**

Replace:

```js
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('animal sounds: how-to-play intro shows on first visit and starts the session', async ({ page }) => {
```

with:

```js
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('pg-parental-lock-unlocked', '1'))
})

test('animal sounds: how-to-play intro shows on first visit and starts the session', async ({ page }) => {
```

- [ ] **Step 3: `e2e/character-match.spec.js`**

Replace:

```js
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('character match: how-to-play intro shows on first visit and starts the session', async ({ page }) => {
```

with:

```js
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('pg-parental-lock-unlocked', '1'))
})

test('character match: how-to-play intro shows on first visit and starts the session', async ({ page }) => {
```

- [ ] **Step 4: `e2e/color-match.spec.js`**

Replace:

```js
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('color match: how-to-play intro shows on first visit and starts the session', async ({ page }) => {
```

with:

```js
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('pg-parental-lock-unlocked', '1'))
})

test('color match: how-to-play intro shows on first visit and starts the session', async ({ page }) => {
```

- [ ] **Step 5: `e2e/intro-results-height.spec.js`**

Replace:

```js
import { test, expect } from '@playwright/test'

// Regression coverage for issue #55: the intro/results screens must fit
```

with:

```js
import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('pg-parental-lock-unlocked', '1'))
})

// Regression coverage for issue #55: the intro/results screens must fit
```

- [ ] **Step 6: `e2e/tap-target-standard.spec.js`**

Find the block ending `.dashboard__tab in Dashboard.css and CHANGELOG.md's [0.32.0]/[0.32.3]` / `entries. ... exceptions from being "fixed" by mistake.` followed by `test.describe('dashboard tab strip meets the primary 64px tap-target standard', () => {`. Insert a new top-level `test.beforeEach` between that comment block and the first `test.describe`:

Replace:

```js
test.describe('dashboard tab strip meets the primary 64px tap-target standard', () => {
```

with:

```js
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('pg-parental-lock-unlocked', '1'))
})

test.describe('dashboard tab strip meets the primary 64px tap-target standard', () => {
```

- [ ] **Step 7: `e2e/zoom-large-text.spec.js`**

Only one `describe` block in this file touches `/admin` or `/parent` — extend its existing `beforeEach` rather than adding a file-wide one. Replace:

```js
test.describe('parent dashboard: chart-axis labels and heatmap alignment under large text (issue #130)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((scores) => {
      localStorage.setItem('playground_scores', JSON.stringify(scores))
    }, seedParentScores([1, 2, 3, 10, 45]))
  })
```

with:

```js
test.describe('parent dashboard: chart-axis labels and heatmap alignment under large text (issue #130)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('pg-parental-lock-unlocked', '1'))
    await page.addInitScript((scores) => {
      localStorage.setItem('playground_scores', JSON.stringify(scores))
    }, seedParentScores([1, 2, 3, 10, 45]))
  })
```

- [ ] **Step 8: `e2e/parent-dashboard.spec.js`**

Replace:

```js
test.beforeEach(async ({ page }) => {
  // Seed scores before any app script runs so the very first render sees them.
  await page.addInitScript((scores) => {
    localStorage.setItem('playground_scores', JSON.stringify(scores))
  }, seedScores([1, 10, 45]))
})
```

with:

```js
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('pg-parental-lock-unlocked', '1'))
  // Seed scores before any app script runs so the very first render sees them.
  await page.addInitScript((scores) => {
    localStorage.setItem('playground_scores', JSON.stringify(scores))
  }, seedScores([1, 10, 45]))
})
```

- [ ] **Step 9: `e2e/html-validity.spec.js`**

Replace:

```js
const routes = [
  { name: 'dashboard', path: '/' },
  { name: 'admin', path: '/admin' },
  { name: 'parent', path: '/parent' },
  { name: 'kids progress', path: '/my-progress' },
]

for (const { name, path } of routes) {
```

with:

```js
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('pg-parental-lock-unlocked', '1'))
})

const routes = [
  { name: 'dashboard', path: '/' },
  { name: 'admin', path: '/admin' },
  { name: 'parent', path: '/parent' },
  { name: 'kids progress', path: '/my-progress' },
]

for (const { name, path } of routes) {
```

- [ ] **Step 10: `e2e/css-validity.spec.js`**

Replace:

```js
const INLINE_STYLE_CONFIG = { extends: 'stylelint-config-recommended' }
const routes = [
  { name: 'dashboard', path: '/' },
  { name: 'admin', path: '/admin' },
  { name: 'parent', path: '/parent' },
  { name: 'kids progress', path: '/my-progress' },
]
```

with:

```js
const INLINE_STYLE_CONFIG = { extends: 'stylelint-config-recommended' }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('pg-parental-lock-unlocked', '1'))
})

const routes = [
  { name: 'dashboard', path: '/' },
  { name: 'admin', path: '/admin' },
  { name: 'parent', path: '/parent' },
  { name: 'kids progress', path: '/my-progress' },
]
```

- [ ] **Step 11: Run the full e2e suite**

Run: `npm run e2e`
Expected: PASS across all specs (this also exercises the real gate wiring from Task 6 for the first time end-to-end, since Task 9's dedicated spec doesn't exist yet — if any of these 10 files still shows a "Parents Only" heading unexpectedly, double-check the `test.beforeEach` was inserted at file/describe scope, not accidentally nested inside a single `test`).

- [ ] **Step 12: Commit**

```bash
git add e2e/admin.spec.js e2e/animal-sounds.spec.js e2e/character-match.spec.js e2e/color-match.spec.js e2e/intro-results-height.spec.js e2e/parent-dashboard.spec.js e2e/tap-target-standard.spec.js e2e/zoom-large-text.spec.js e2e/html-validity.spec.js e2e/css-validity.spec.js
git commit -m "$(cat <<'EOF'
test(e2e): bypass the parental lock in specs needing direct route access (#127)

Seeds the sessionStorage unlock flag via addInitScript before navigating to
/admin or /parent, independent of whatever playground_settings each spec
seeds — so these specs keep exercising real page content instead of the
new challenge screen.
EOF
)"
```

---

### Task 9: Dedicated e2e coverage for the lock itself

**Files:**
- Create: `e2e/parental-lock.spec.js`

- [ ] **Step 1: Write the spec**

Create `e2e/parental-lock.spec.js`:

```js
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

function seedPin(pin) {
  return page => page.addInitScript((p) => {
    localStorage.setItem('playground_settings', JSON.stringify({ parentalLock: { enabled: true, pin: p } }))
  }, pin)
}

test('cold visit to /admin shows the parental lock challenge, not the settings page (negative)', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Parents Only' })).toBeVisible()
  await expect(page.getByLabel("Child's Name")).not.toBeVisible()
})

test('cold visit to /parent shows the parental lock challenge, not the dashboard (negative)', async ({ page }) => {
  await page.goto('/parent')
  await expect(page.getByRole('heading', { name: 'Parents Only' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'All time' })).toHaveCount(0)
})

test('a wrong answer to the math challenge keeps /admin locked and shows an error (negative)', async ({ page }) => {
  await page.goto('/admin')
  await page.locator('#parental-lock-input').fill('999999')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByRole('alert')).toContainText("not it")
  await expect(page.getByLabel("Child's Name")).not.toBeVisible()
})

test('a correct PIN unlocks /admin, and the session stays unlocked navigating to /parent', async ({ page }) => {
  await seedPin('4242')(page)
  await page.goto('/admin')
  await page.locator('#parental-lock-input').fill('4242')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByLabel("Child's Name")).toBeVisible()

  await page.goto('/parent')
  await expect(page.getByRole('heading', { name: 'Parents Only' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'All time' })).toBeVisible()
})

test('a wrong PIN is rejected (negative)', async ({ page }) => {
  await seedPin('4242')(page)
  await page.goto('/admin')
  await page.locator('#parental-lock-input').fill('0000')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel("Child's Name")).not.toBeVisible()
})

test('a fresh browser context is locked again after a previous unlock (negative — session only, not persistent)', async ({ page, browser }) => {
  await seedPin('4242')(page)
  await page.goto('/admin')
  await page.locator('#parental-lock-input').fill('4242')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByLabel("Child's Name")).toBeVisible()

  const freshContext = await browser.newContext()
  const freshPage = await freshContext.newPage()
  await seedPin('4242')(freshPage)
  await freshPage.goto('/admin')
  await expect(freshPage.getByRole('heading', { name: 'Parents Only' })).toBeVisible()
  await freshContext.close()
})

test('parental lock challenge screen has no accessibility violations', async ({ page }) => {
  await page.goto('/admin')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
```

- [ ] **Step 2: Run it**

Run: `npx playwright test e2e/parental-lock.spec.js`
Expected: PASS (7 tests).

- [ ] **Step 3: Run the full e2e suite once more as a final regression check**

Run: `npm run e2e`
Expected: PASS across every spec, including the new one and the 10 bypassed ones from Task 8.

- [ ] **Step 4: Commit**

```bash
git add e2e/parental-lock.spec.js
git commit -m "$(cat <<'EOF'
test(e2e): add dedicated parental lock coverage (#127)

Cold-visit challenge on /admin and /parent, wrong math/PIN rejection,
correct-PIN unlock with shared-session persistence across the two routes,
fresh-context re-lock, and an axe scan of the challenge screen itself.
EOF
)"
```

---

### Task 10: Docs and version bump

**Files:**
- Modify: `README.md`
- Modify: `SECURITY.md`
- Modify: `docs/ENHANCEMENTS.md`
- Modify: `docs/TESTING.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: `README.md` — Features bullet**

Replace:

```markdown
- **Admin / Settings** — tabbed settings page (Settings · Games · Badges · History); configure child's name, answer choices (2–4), feedback mode, questions per session, memory board size, Google Analytics ID, and per-game tag overrides
```

with:

```markdown
- **Admin / Settings** — tabbed settings page (Settings · Games · Badges · History); configure child's name, answer choices (2–4), feedback mode, questions per session, memory board size, Google Analytics ID, and per-game tag overrides
- **Parental Lock** — `/admin` and `/parent` are gated behind a generated math challenge by default (or an optional 4-digit PIN a parent sets), so a toddler tapping around the dashboard can't reach settings or the parent dashboard
```

- [ ] **Step 2: `README.md` — Architecture file tree**

Replace:

```text
├── components/                # Shared UI: AppShell (persistent header, route-aware footer + exit guard),
│                              #   ShellContext, Dashboard, GameCard, FeaturedGameCard, CategorySection,
│                              #   GameIntro, GameResults, QuizGameShell, GameChoiceGrid, MemoryBoard, Timer,
│                              #   StreakBadge, BadgeGallery, ScoreHistory, ManifestIcon, ExitConfirmDialog,
│                              #   LocaleSelector
```

with:

```text
├── components/                # Shared UI: AppShell (persistent header, route-aware footer + exit guard),
│                              #   ShellContext, Dashboard, GameCard, FeaturedGameCard, CategorySection,
│                              #   GameIntro, GameResults, QuizGameShell, GameChoiceGrid, MemoryBoard, Timer,
│                              #   StreakBadge, BadgeGallery, ScoreHistory, ManifestIcon, ExitConfirmDialog,
│                              #   LocaleSelector, ParentalLockGate
```

Replace:

```text
├── hooks/                     # useGameSession (quiz loop), useMemorySession (memory loop),
│                              #   useSettings, useScores, useBadges, useBestStreak, usePersonalBest,
│                              #   useSoundPlayer, useFocusOnMount, useFeaturedGame, useRecentlyPlayed, useGameTags
├── lib/                       # badges.js (quiz badge catalog), confetti.js, soundLibrary.js
```

with:

```text
├── hooks/                     # useGameSession (quiz loop), useMemorySession (memory loop),
│                              #   useSettings, useScores, useBadges, useBestStreak, usePersonalBest,
│                              #   useSoundPlayer, useFocusOnMount, useFeaturedGame, useRecentlyPlayed, useGameTags,
│                              #   useParentalLockSession
├── lib/                       # badges.js (quiz badge catalog), confetti.js, soundLibrary.js, parentalLock.js
```

- [ ] **Step 3: `README.md` — Settings Reference table + explanation**

Replace:

```markdown
| Google Analytics ID | *(empty)* | Any valid GA4 Measurement ID (e.g. `G-XXXXXXXXXX`) |
```

with:

```markdown
| Google Analytics ID | *(empty)* | Any valid GA4 Measurement ID (e.g. `G-XXXXXXXXXX`) |
| Parental Lock | On (math challenge) | On/Off; optional 4-digit PIN |
```

Replace:

```markdown
**Google Analytics** — when a Measurement ID is entered, the GA4 script is injected at runtime and page view events fire on every navigation. Leaving the field blank disables tracking entirely. The ID is stored in `localStorage` alongside other settings. See [`SECURITY.md`](SECURITY.md) for the privacy analysis.
```

with:

```markdown
**Google Analytics** — when a Measurement ID is entered, the GA4 script is injected at runtime and page view events fire on every navigation. Leaving the field blank disables tracking entirely. The ID is stored in `localStorage` alongside other settings. See [`SECURITY.md`](SECURITY.md) for the privacy analysis.

**Parental Lock** — gates `/admin` and `/parent` behind a single shared unlock: by default, a generated math problem (e.g. "What's 7 + 8?"); setting a 4-digit PIN here replaces it with that PIN instead, until removed. Unlocking once covers the rest of the browser session (closing the tab/browser re-locks it). See [`SECURITY.md`](SECURITY.md#parental-lock) for what this does and doesn't protect against.
```

- [ ] **Step 4: `SECURITY.md` — Data inventory row**

Replace:

```markdown
| Badge data | Earned badges and lifetime counters per game | No |
```

with:

```markdown
| Badge data | Earned badges and lifetime counters per game | No |
| Parental lock PIN | Optional 4-digit PIN a parent sets to gate `/admin`/`/parent`; stored in plaintext alongside other settings (see below) | No |
```

- [ ] **Step 5: `SECURITY.md` — new section**

Replace:

```markdown
## XSS surfaces and mitigations
```

with:

```markdown
## Parental lock

`/admin` and `/parent` are gated behind an unlock challenge (issue #127), on by default: a generated math problem (e.g. "What's 7 + 8?"), or a parent-set 4-digit PIN if one has been configured in Settings. This is a **toddler deterrent, not an access-control boundary** — consistent with this app's overall threat model (no accounts, no server, physical access to the device is already access to the data):

- The PIN is stored in plaintext in the same `localStorage` settings object as everything else — hashing a client-side secret that's checked by client-side JavaScript against client-side storage provides no real protection, since the comparison code and the stored value are both fully visible to anyone with the access a hash would be defending against.
- There is no rate-limiting or lockout on wrong attempts — this app has no attacker model to defend against beyond a curious child, and a lockout would only risk locking out the parent.
- **There is no PIN recovery.** A forgotten PIN has no reset flow beyond the same "clear browser site data" wipe this document already describes for score/settings data loss (see Data inventory, above) — clearing site data also removes the PIN, reverting to the default math challenge.
- Unlocking is scoped to the browser session (`sessionStorage`), not persisted (`localStorage`): navigating between `/admin` and `/parent` within the same visit doesn't re-prompt, but closing the tab or browser re-locks it.

## XSS surfaces and mitigations
```

- [ ] **Step 6: `docs/ENHANCEMENTS.md` — strike the two resolved entries**

Replace:

```markdown
- **Parental lock on settings** — require a simple PIN or gesture to open the admin page; a toddler exploring the screen can currently reach and change settings. (Cross-listed under Security.)
```

with:

```markdown
- ~~**Parental lock on settings**~~ — done (issue #127): `/admin` and `/parent` are gated behind a generated math challenge by default, or an optional 4-digit PIN. (Cross-listed under Security.)
```

Replace:

```markdown
- **PIN gate for `/admin` and `/parent`** — same as the UX parental-lock entry; listed here because it's also the only access control the app would have.
```

with:

```markdown
- ~~**PIN gate for `/admin` and `/parent`**~~ — done (issue #127): same fix as the UX parental-lock entry above. `ParentalLockGate` (`src/components/`) wraps both routes; `src/lib/parentalLock.js` owns the math/PIN verification logic. See `SECURITY.md` § Parental lock for what this does and doesn't protect against.
```

- [ ] **Step 7: `docs/ENHANCEMENTS.md` — trim the shipped fragment from the Backend/Sync bullet**

Replace:

```markdown
- **Parent Dashboard enhancements** — game-name labels in charts, PIN protection for the `/parent` route (the interactive date-range filter and heatmap month labels shipped in v0.21.0).
```

with:

```markdown
- **Parent Dashboard enhancements** — game-name labels in charts (the interactive date-range filter and heatmap month labels shipped in v0.21.0; PIN protection for the `/parent` route shipped in issue #127).
```

- [ ] **Step 8: `docs/TESTING.md` — add the new spec to the e2e table**

Replace:

```markdown
| `css-validity.spec.js` | Inline-style CSS validation (layer 6, below) |
```

with:

```markdown
| `css-validity.spec.js` | Inline-style CSS validation (layer 6, below) |
| `parental-lock.spec.js` | Route-gating challenge (issue #127): cold-visit lock screen on `/admin` and `/parent`, wrong math/PIN rejection, correct-PIN unlock with shared-session persistence between the two routes, a fresh-context re-lock, and an axe scan of the challenge screen |
```

- [ ] **Step 9: Bump the version**

In `package.json`, change:

```json
  "version": "0.36.0",
```

to:

```json
  "version": "0.37.0",
```

In `package-lock.json`, change both occurrences (line 3, the top-level `version`, and line 9, the root package entry's `version`):

```json
  "version": "0.36.0",
```
```json
      "version": "0.36.0",
```

to:

```json
  "version": "0.37.0",
```
```json
      "version": "0.37.0",
```

- [ ] **Step 10: `CHANGELOG.md` — new entry**

Replace:

```markdown
# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.36.0] - 2026-07-26
```

with:

```markdown
# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.37.0] - 2026-07-26

### Added

- Parental lock on `/admin` and `/parent` (issue #127): both routes now sit behind a shared unlock challenge, on by default — a generated math problem (e.g. "What's 7 + 8?") requiring no setup, or a 4-digit PIN a parent can set from a new "Parental Lock" section in Settings. `ParentalLockGate` (`src/components/`) wraps both routes outside their lazy `<Suspense>` boundary, so the admin/parent bundle isn't even fetched until the challenge is passed, and the gated content is never mounted (not just hidden) while locked. Verification logic (`getChallenge`/`verifyUnlock`, `src/lib/parentalLock.js`) and the per-session unlock state (`useParentalLockSession`, backed by `sessionStorage` — closing the tab/browser re-locks it) are deliberately isolated from the gate component itself, so a future login system has clean seams to extend rather than a rewrite. This is a toddler deterrent, not a real access-control boundary — see `SECURITY.md` § Parental lock for the full threat-model rationale (plaintext PIN storage, no rate-limiting, no recovery beyond clearing site data).

## [0.36.0] - 2026-07-26
```

- [ ] **Step 11: Run the full verification suite**

Run: `npm run lint && npm run lint:css && npm test -- --run && npm run build`
Expected: all pass. (Skip `npm run e2e` here — it was already run in full at the end of Task 9.)

- [ ] **Step 12: Commit**

```bash
git add README.md SECURITY.md docs/ENHANCEMENTS.md docs/TESTING.md CHANGELOG.md package.json package-lock.json
git commit -m "$(cat <<'EOF'
docs: document the parental lock feature and bump to v0.37.0 (#127)

README (feature bullet, file tree, settings reference), SECURITY.md (new
§ Parental lock — threat model, plaintext-PIN rationale, no-recovery
caveat), ENHANCEMENTS.md (strike the two resolved backlog entries),
TESTING.md (new e2e spec row), CHANGELOG.
EOF
)"
```

---

## Self-Review Notes

**Spec coverage:** every section of `docs/superpowers/specs/2026-07-26-parental-lock-design.md` maps to a task — data model (Task 1), `parentalLock.js`/`useParentalLockSession`/`ParentalLockGate` layering (Tasks 2–5), route wiring (Task 6), Settings UI (Task 7), i18n (Task 4), pre-existing e2e bypass + dedicated e2e coverage (Tasks 8–9), and all four doc files plus the version bump (Task 10).

**Type/name consistency verified across tasks:** `parentalLock: { enabled, pin }` (Task 1) is read the same way in Task 5 (`settings.parentalLock?.enabled`, `settings.parentalLock`) and Task 7 (`settings.parentalLock?.enabled`, `settings.parentalLock?.pin`, `updateSetting('parentalLock', {...settings.parentalLock, ...})`); `getChallenge(parentalLockSettings, rng)` / `verifyUnlock(challenge, input)` (Task 2) match their call sites in Task 5 exactly; the sessionStorage key `'pg-parental-lock-unlocked'` (Task 3) matches literally in Task 8's ten bypass edits and is exercised (not hardcoded, but implicitly relied on) in Task 9's positive/negative flows; the input's `id="parental-lock-input"` (Task 5) matches Task 9's `page.locator('#parental-lock-input')`.
