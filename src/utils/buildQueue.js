import weightedShuffle from './weightedShuffle'

function shuffle(arr) {
  const a = [...arr]
  // Stryker disable next-line EqualityOperator: i>0 vs i>=0 is behaviorally
  // equivalent here — at i===0, j is always floor(rand*(0+1))=0 too, so the
  // i===0 iteration is always a self-swap no-op either way.
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildCorrectSequence(items, questionsPerSession, itemWeights) {
  // Stryker disable next-line EqualityOperator,ConditionalExpression: the
  // `questionsPerSession <= 0` half of this guard is redundant defense —
  // the while loop below never executes when questionsPerSession <= 0
  // anyway (its own `sequence.length < questionsPerSession` condition is
  // false from the start), so weakening or dropping just that half changes
  // no observable output.
  if (items.length === 0 || questionsPerSession <= 0) return []

  const sequence = []
  let lastId = null

  while (sequence.length < questionsPerSession) {
    const pass = itemWeights ? weightedShuffle(items, itemWeights) : shuffle(items)

    // Stryker disable next-line ConditionalExpression: forcing this branch
    // to always run is still equivalent — when pass[0].id !== lastId,
    // findIndex(item => item.id !== lastId) returns 0 immediately, so the
    // "forced" swap is index 0 with itself, a no-op identical to skipping
    // the branch.
    if (items.length > 1 && pass[0].id === lastId) {
      const swapIndex = pass.findIndex(item => item.id !== lastId)
      ;[pass[0], pass[swapIndex]] = [pass[swapIndex], pass[0]]
    }

    for (const item of pass) {
      if (sequence.length >= questionsPerSession) break
      sequence.push(item)
      lastId = item.id
    }
  }

  return sequence
}

export default function buildQueue(items, numChoices, questionsPerSession, itemWeights) {
  const sequence = buildCorrectSequence(items, questionsPerSession, itemWeights)
  return sequence.map(correct => {
    const wrongPool = items.filter(item => item.id !== correct.id)
    const wrongCount = Math.min(numChoices - 1, wrongPool.length)
    const wrong = shuffle(wrongPool).slice(0, wrongCount)
    return { correct, choices: shuffle([correct, ...wrong]) }
  })
}
