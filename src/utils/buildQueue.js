function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function buildQueue(items, numChoices, questionsPerSession) {
  const shuffled = shuffle(items)
  const count = Math.min(questionsPerSession, items.length)
  return shuffled.slice(0, count).map(correct => {
    const wrongPool = items.filter(item => item.id !== correct.id)
    const wrongCount = Math.min(numChoices - 1, wrongPool.length)
    const wrong = shuffle(wrongPool).slice(0, wrongCount)
    return { correct, choices: shuffle([correct, ...wrong]) }
  })
}
