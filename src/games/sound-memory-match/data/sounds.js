// A different slice of the shared animal-sound library than Animal Memory
// Match uses (dog/cat/cow/duck/frog/lion) so the two memory games never play
// the exact same clips. `emoji` is only ever shown once a pair is matched
// (see index.jsx's renderFace) — the reward reveal, never a mid-game hint.
const sounds = [
  { id: 'elephant', nameKey: 'soundMemoryMatch.sounds.elephant.name', emoji: '🐘', sound: 'elephant.mp3' },
  { id: 'horse',    nameKey: 'soundMemoryMatch.sounds.horse.name',    emoji: '🐴', sound: 'horse.mp3' },
  { id: 'owl',      nameKey: 'soundMemoryMatch.sounds.owl.name',      emoji: '🦉', sound: 'owl.mp3' },
  { id: 'pig',      nameKey: 'soundMemoryMatch.sounds.pig.name',      emoji: '🐷', sound: 'pig.mp3' },
  { id: 'rooster',  nameKey: 'soundMemoryMatch.sounds.rooster.name',  emoji: '🐓', sound: 'rooster.mp3' },
  { id: 'sheep',    nameKey: 'soundMemoryMatch.sounds.sheep.name',    emoji: '🐑', sound: 'sheep.mp3' },
]

export default sounds
