// Shared sound assets. Games resolve mp3 urls from src/assets/sounds via this
// single glob so multiple games can reference one copy of each file.
const sounds = import.meta.glob('../assets/sounds/*.mp3', { eager: true, query: '?url', import: 'default' })

export function getSoundUrl(filename) {
  const key = `../assets/sounds/${filename}`
  return sounds[key] ?? null
}
