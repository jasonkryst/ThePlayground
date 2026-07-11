import confetti from 'canvas-confetti'

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
