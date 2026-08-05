// One-off generator for the PWA app icons (issue #96), standing in for real
// brand artwork. Follows the same hand-rolled-PNG approach as
// generate-character-match-placeholders.mjs (no image-library dependency):
// draws a flat --color-aqua background with a --color-aqua-dark circle,
// kept within the ~80% "safe zone" so the same 512px file works for both
// the "any" and "maskable" manifest purposes without being clipped. Real
// artwork can later overwrite these files in place with no code changes.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const BG = [0x80, 0xDE, 0xEA] // --color-aqua
const FG = [0x00, 0x6C, 0x7A] // --color-aqua-dark

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let crc = 0xFFFFFFFF
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

// Flat background with a centered circle at 62% of the canvas diameter —
// comfortably inside Android's ~80% maskable safe zone, so the icon reads
// fine whether the platform circle-crops it, squircle-crops it, or shows it
// at full bleed.
function appIconPng(size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8  // bit depth
  ihdr[9] = 2  // color type: truecolor (RGB)
  ihdr[10] = 0 // compression method
  ihdr[11] = 0 // filter method
  ihdr[12] = 0 // interlace method

  const center = size / 2
  const radius = size * 0.31
  const rows = []
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3) // leading filter-type byte (0 = none)
    for (let x = 0; x < size; x++) {
      const dx = x - center + 0.5
      const dy = y - center + 0.5
      const inCircle = dx * dx + dy * dy <= radius * radius
      const [r, g, b] = inCircle ? FG : BG
      row[1 + x * 3] = r
      row[1 + x * 3 + 1] = g
      row[1 + x * 3 + 2] = b
    }
    rows.push(row)
  }
  const idat = deflateSync(Buffer.concat(rows))

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const publicDir = join(root, 'public')
mkdirSync(publicDir, { recursive: true })

const files = {
  'favicon.png': 48,
  'apple-touch-icon.png': 180,
  'pwa-192.png': 192,
  'pwa-512.png': 512,
}

for (const [filename, size] of Object.entries(files)) {
  writeFileSync(join(publicDir, filename), appIconPng(size))
  console.log(`wrote ${filename} (${size}x${size})`)
}
