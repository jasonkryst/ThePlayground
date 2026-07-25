export const RESUME_TTL_MS = 4 * 60 * 60 * 1000

export function isResumeValid(saved, gameId, now = Date.now()) {
  return !!saved && saved.gameId === gameId && (now - saved.savedAt) < RESUME_TTL_MS
}
