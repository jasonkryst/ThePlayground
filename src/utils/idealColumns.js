// src/utils/idealColumns.js
export default function idealColumns(count) {
  if (count <= 1) return 1
  let cols = Math.ceil(Math.sqrt(count))
  while (count % cols !== 0) cols++
  return cols
}
