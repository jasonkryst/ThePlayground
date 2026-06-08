const sounds = import.meta.glob('../sounds/*.mp3', { eager: true, query: '?url', import: 'default' })

export function getSoundUrl(filename) {
  const key = `../sounds/${filename}`
  return sounds[key] ?? null
}
