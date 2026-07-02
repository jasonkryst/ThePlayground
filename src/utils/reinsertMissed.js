export default function reinsertMissed(queue, currentIndex, missedEntry) {
  if (currentIndex >= queue.length - 1) return queue

  const offset = 2 + Math.floor(Math.random() * 3) // 2, 3, or 4 questions ahead
  const targetIndex = Math.min(currentIndex + offset, queue.length - 1)

  const next = [...queue]
  next[targetIndex] = missedEntry
  return next
}
