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
