// scripts/generate-chimes.mjs — regenerates the quiz feedback chimes.
// Run from the repo root: node scripts/generate-chimes.mjs
import { writeFileSync } from 'node:fs'

const SAMPLE_RATE = 22050

function wavFromSamples(samples) {
  const n = samples.length
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8)
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SAMPLE_RATE, 24)
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34)
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40)
  samples.forEach((s, i) => buf.writeInt16LE((Math.max(-1, Math.min(1, s)) * 0x7fff) | 0, 44 + i * 2))
  return buf
}

// Adds a sine tone with a 10ms attack and exponential decay (no clicks).
function tone({ freq, start, dur, gain = 0.5, out }) {
  const from = Math.floor(start * SAMPLE_RATE)
  const count = Math.floor(dur * SAMPLE_RATE)
  for (let i = 0; i < count && from + i < out.length; i++) {
    const tSec = i / SAMPLE_RATE
    const env = Math.min(1, i / (0.01 * SAMPLE_RATE)) * Math.exp((-3 * tSec) / dur)
    out[from + i] += Math.sin(2 * Math.PI * freq * tSec) * gain * env
  }
}

// Correct: bright ascending two-note ding (C6 → E6).
const correct = new Float32Array(Math.floor(0.35 * SAMPLE_RATE))
tone({ freq: 1046.5, start: 0, dur: 0.18, out: correct })
tone({ freq: 1318.5, start: 0.12, dur: 0.22, out: correct })
writeFileSync('src/assets/sounds/chime-correct.wav', wavFromSamples(correct))

// Wrong: single soft low tone (G3) — gentle, not punishing.
const wrong = new Float32Array(Math.floor(0.3 * SAMPLE_RATE))
tone({ freq: 196, start: 0, dur: 0.3, gain: 0.4, out: wrong })
writeFileSync('src/assets/sounds/chime-wrong.wav', wavFromSamples(wrong))

console.log('Wrote src/assets/sounds/chime-correct.wav and chime-wrong.wav')
