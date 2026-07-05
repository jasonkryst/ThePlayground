const images = import.meta.glob('../images/*', { eager: true, query: '?url', import: 'default' })

export function getImageUrl(filename) {
  const key = `../images/${filename}`
  return images[key] ?? null
}
