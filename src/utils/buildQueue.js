function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildCorrectSequence(items, questionsPerSession) {
  if (items.length === 0 || questionsPerSession <= 0) return []

  const sequence = []
  let lastId = null

  while (sequence.length < questionsPerSession) {
    const pass = shuffle(items)

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

export default function buildQueue(items, numChoices, questionsPerSession) {
  const sequence = buildCorrectSequence(items, questionsPerSession)
  return sequence.map(correct => {
    const wrongPool = items.filter(item => item.id !== correct.id)
    const wrongCount = Math.min(numChoices - 1, wrongPool.length)
    const wrong = shuffle(wrongPool).slice(0, wrongCount)
    return { correct, choices: shuffle([correct, ...wrong]) }
  })
}
