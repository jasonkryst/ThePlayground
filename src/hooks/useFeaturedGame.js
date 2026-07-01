export function hashDate(str) {
  return str.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
}

export default function useFeaturedGame(manifests) {
  if (!manifests || manifests.length === 0) return null
  const today = new Date().toISOString().slice(0, 10)
  return manifests[hashDate(today) % manifests.length]
}
