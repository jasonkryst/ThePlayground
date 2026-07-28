const badges = [
  { id: 'goodEar',         icon: '🎧', nameKey: 'soundMemoryMatch.badges.goodEar.name',         descKey: 'soundMemoryMatch.badges.goodEar.desc',         kind: 'session',  earned: s => s.flipAttempts <= s.pairs + 2 },
  { id: 'listeningStreak', icon: '⚡', nameKey: 'soundMemoryMatch.badges.listeningStreak.name', descKey: 'soundMemoryMatch.badges.listeningStreak.desc', kind: 'session',  earned: s => s.peakMatchStreak >= 3 },
  { id: 'fullChorus',      icon: '🎶', nameKey: 'soundMemoryMatch.badges.fullChorus.name',      descKey: 'soundMemoryMatch.badges.fullChorus.desc',      kind: 'session',  earned: s => s.pairs >= 6 },
  { id: 'soundSpotter',    icon: '👂', nameKey: 'soundMemoryMatch.badges.soundSpotter.name',    descKey: 'soundMemoryMatch.badges.soundSpotter.desc',    kind: 'lifetime', counter: 'pairsMatched', tier: 25 },
  { id: 'soundPro',        icon: '👂', nameKey: 'soundMemoryMatch.badges.soundPro.name',        descKey: 'soundMemoryMatch.badges.soundPro.desc',        kind: 'lifetime', counter: 'pairsMatched', tier: 100 },
  { id: 'soundMaestro',    icon: '👂', nameKey: 'soundMemoryMatch.badges.soundMaestro.name',    descKey: 'soundMemoryMatch.badges.soundMaestro.desc',    kind: 'lifetime', counter: 'pairsMatched', tier: 500 },
]

export default badges
