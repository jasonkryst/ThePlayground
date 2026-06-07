import { useState, useEffect } from 'react'
import adapter from '../storage/index'

export default function useScores() {
  const [scores, setScores] = useState([])

  useEffect(() => {
    adapter.getScores().then(setScores)
  }, [])

  async function addScore(result) {
    await adapter.addScore(result)
    const updated = await adapter.getScores()
    setScores(updated)
  }

  function getScoresByGame(gameId) {
    return scores
      .filter(s => s.gameId === gameId)
      .sort((a, b) => b.timestamp - a.timestamp)
  }

  function getBestScore(gameId) {
    const game = scores.filter(s => s.gameId === gameId)
    return game.length === 0 ? 0 : Math.max(...game.map(s => s.score))
  }

  function getAllScores() {
    return scores
  }

  return { addScore, getScoresByGame, getBestScore, getAllScores }
}
