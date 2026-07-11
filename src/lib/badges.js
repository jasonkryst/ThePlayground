export const BADGE_CATALOG = [
  { id: 'hotStreak',       category: 'streak',         tier: 5,    icon: '🔥', nameKey: 'badges.hotStreak.name',       descKey: 'badges.hotStreak.desc' },
  { id: 'onFire',          category: 'streak',         tier: 10,   icon: '⚡', nameKey: 'badges.onFire.name',          descKey: 'badges.onFire.desc' },
  { id: 'unstoppable',     category: 'streak',         tier: 25,   icon: '🌟', nameKey: 'badges.unstoppable.name',     descKey: 'badges.unstoppable.desc' },
  { id: 'perfectSession',  category: 'perfect',         tier: null, icon: '🎯', nameKey: 'badges.perfectSession.name', descKey: 'badges.perfectSession.desc' },
  { id: 'gettingStarted',  category: 'totalQuestions',  tier: 50,   icon: '🌱', nameKey: 'badges.gettingStarted.name', descKey: 'badges.gettingStarted.desc' },
  { id: 'centuryClub',     category: 'totalQuestions',  tier: 100,  icon: '💯', nameKey: 'badges.centuryClub.name',    descKey: 'badges.centuryClub.desc' },
  { id: 'dedicatedPlayer', category: 'totalQuestions',  tier: 500,  icon: '🏆', nameKey: 'badges.dedicatedPlayer.name', descKey: 'badges.dedicatedPlayer.desc' },
  { id: 'grandMaster',     category: 'totalQuestions',  tier: 1000, icon: '👑', nameKey: 'badges.grandMaster.name',    descKey: 'badges.grandMaster.desc' },
]

export function buildGameBadgeCatalogs(modules) {
  const catalogs = {}
  for (const [path, mod] of Object.entries(modules)) {
    const gameId = path.match(/games\/([^/]+)\//)[1]
    catalogs[gameId] = mod.default ?? mod
  }
  return catalogs
}

// Auto-discovered, like game i18n files: a game ships src/games/<id>/badges.js
// and its catalog fully replaces the global quiz catalog for that game.
export const GAME_BADGE_CATALOGS = buildGameBadgeCatalogs(
  import.meta.glob('../games/*/badges.js', { eager: true })
)

export function getBadgesForGame(gameId) {
  return GAME_BADGE_CATALOGS[gameId] ?? BADGE_CATALOG
}
