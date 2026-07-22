const ICON_PATH_RE = /\/games\/([^/]+)\/icon\.[^./]+$/

export function buildIconMap(entries) {
  const sourcePaths = {}
  const map = {}
  for (const [path, url] of entries) {
    const match = path.match(ICON_PATH_RE)
    if (!match) continue
    const id = match[1]
    if (id in sourcePaths) {
      throw new Error(
        `Multiple icon files found for game "${id}": ${sourcePaths[id]} and ${path}. ` +
        'Each game may have at most one icon.<ext> file.'
      )
    }
    sourcePaths[id] = path
    map[id] = url
  }
  return map
}

export function resolveIcon(manifest, iconMap) {
  return iconMap[manifest.id] ?? manifest.icon
}

const iconModules = import.meta.glob('../games/*/icon.{png,gif,jpg,jpeg,webp,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
})

export const gameIconMap = buildIconMap(Object.entries(iconModules))
