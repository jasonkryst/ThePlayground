const badges = [
  { id: 'sharpMind',    icon: '🧠', nameKey: 'animalMemoryMatch.badges.sharpMind.name',    descKey: 'animalMemoryMatch.badges.sharpMind.desc',    kind: 'session',  earned: s => s.flipAttempts <= s.pairs + 2 },
  { id: 'matchStreak',  icon: '⚡', nameKey: 'animalMemoryMatch.badges.matchStreak.name',  descKey: 'animalMemoryMatch.badges.matchStreak.desc',  kind: 'session',  earned: s => s.peakMatchStreak >= 3 },
  { id: 'bigBoard',     icon: '🏁', nameKey: 'animalMemoryMatch.badges.bigBoard.name',     descKey: 'animalMemoryMatch.badges.bigBoard.desc',     kind: 'session',  earned: s => s.pairs >= 6 },
  { id: 'pairSpotter',  icon: '🐾', nameKey: 'animalMemoryMatch.badges.pairSpotter.name',  descKey: 'animalMemoryMatch.badges.pairSpotter.desc',  kind: 'lifetime', counter: 'pairsMatched', tier: 25 },
  { id: 'pairPro',      icon: '🐾', nameKey: 'animalMemoryMatch.badges.pairPro.name',      descKey: 'animalMemoryMatch.badges.pairPro.desc',      kind: 'lifetime', counter: 'pairsMatched', tier: 100 },
  { id: 'pairChampion', icon: '🐾', nameKey: 'animalMemoryMatch.badges.pairChampion.name', descKey: 'animalMemoryMatch.badges.pairChampion.desc', kind: 'lifetime', counter: 'pairsMatched', tier: 500 },
]

export default badges
