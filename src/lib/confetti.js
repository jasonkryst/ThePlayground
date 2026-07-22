import { create } from 'canvas-confetti'

// canvas-confetti's default export lazily builds a *shared* cannon with
// `useWorker: true`, which loads its animation loop from a `blob:` Worker.
// This app's CSP has no `worker-src`, so it falls back to `script-src`,
// which doesn't allow `blob:` — the Worker fails silently (Chrome fires an
// error event, not a thrown exception, so canvas-confetti's own try/catch
// never sees it), and nothing ever renders (issue #109). `create()` with
// `useWorker: false` builds our own cannon that always animates on the main
// thread, sidestepping the Worker (and the CSP mismatch) entirely. Don't
// swap this back to the bare default import — it silently breaks under any
// CSP that doesn't explicitly allow `blob:` workers, and dev (`npm run dev`)
// sends no CSP header, so the regression won't show up there.
const confetti = create(null, { resize: true, useWorker: false })

export function fireConfetti() {
  confetti({
    particleCount: 80,
    spread: 70,
    origin: { y: 0.6 },
  })
}

export const FIREWORKS_BURSTS = 6
export const FIREWORKS_INTERVAL_MS = 350

export function fireFireworks() {
  for (let i = 0; i < FIREWORKS_BURSTS; i++) {
    setTimeout(() => {
      confetti({
        particleCount: 120,
        spread: 100,
        startVelocity: 45,
        origin: { x: 0.2 + Math.random() * 0.6, y: 0.2 + Math.random() * 0.3 },
      })
    }, i * FIREWORKS_INTERVAL_MS)
  }
}
