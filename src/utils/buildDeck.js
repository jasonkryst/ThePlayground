// src/utils/buildDeck.js
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function buildDeck(items, pairs) {
  if (pairs < 1) throw new Error(`buildDeck: pairs must be >= 1, got ${pairs}`)
  if (items.length < pairs) {
    console.warn(`buildDeck: requested ${pairs} pairs but pool has ${items.length} items; clamping`)
  }
  const chosen = shuffle(items).slice(0, Math.min(pairs, items.length))
  const tiles = chosen.flatMap(item => [
    { tileId: `${item.id}-a`, itemId: item.id },
    { tileId: `${item.id}-b`, itemId: item.id },
  ])
  return shuffle(tiles)
}
