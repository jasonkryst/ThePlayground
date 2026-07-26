// Efraimidis-Spirakis weighted random sampling without replacement: each
// item gets a random key raised to 1/weight, then a plain descending sort
// on that key yields a weighted-random order. With weight=1 for every item
// this reduces to a uniform random permutation (the random draw IS the
// key), which is why callers with no real weight data can pass () => 1 and
// get ordinary shuffle-equivalent behavior.
export default function weightedShuffle(items, weightOf) {
  return items
    .map(item => ({ item, key: Math.random() ** (1 / weightOf(item)) }))
    .sort((a, b) => b.key - a.key)
    .map(({ item }) => item)
}
