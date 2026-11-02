// Semantic mirror of the 3D player console (A09) for keyboard and screen-reader users.
// Visually hidden until focused; the visible player is the modelled console in scene/PlayerConsole.tsx.
import { useEffect, useState } from 'react'
import { useJazz } from '../state/store'
import { albumById } from '../data/albums'
import { audio } from '../audio/engine'
import { deck } from '../scene/deck'
import { actions } from '../scene/Experience'

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

export function PlayerBar() {
  const albumId = useJazz((s) => s.albumId)
  const deckState = useJazz((s) => s.deck)
  const volume = useJazz((s) => s.volume)
  const saved = useJazz((s) => s.myCrate.includes(s.albumId))
  const album = albumById(albumId)
  const [pos, setPos] = useState(0)
  const [dur, setDur] = useState(album.duration)

  useEffect(() => {
    let alive = true
    void audio.duration(album).then((d) => alive && setDur(d))
    return () => {
      alive = false
    }
  }, [album])
  useEffect(() => {
    const id = window.setInterval(() => {
      const s = useJazz.getState()
      setPos(audio.isPlaying && audio.playingAlbum === s.albumId ? audio.position() : s.positions[s.albumId] ?? 0)
    }, 500)
    return () => window.clearInterval(id)
  }, [])
  useEffect(() => audio.setVolume(volume), [volume])

  const playing = deckState === 'playing' || deckState === 'starting'
  return (
    <section className="sr-only" aria-label="Player">
      <p aria-live="polite">
        {album.title} — {album.artist}
      </p>
      <button onClick={() => actions.step(-1)}>Previous record</button>
      <button onClick={() => void deck.toggle(true)}>{playing ? 'Pause' : 'Play'}</button>
      <button onClick={() => actions.step(1)}>Next record</button>
      <button aria-pressed={saved} onClick={() => useJazz.getState().toggleCrateAlbum(album.id)}>
        {saved ? 'Remove from My Crate' : 'Add to My Crate'}
      </button>
      <label>
        Position {fmt(pos)} of {fmt(dur)}
        <input type="range" min={0} max={Math.round(dur)} step={1} value={Math.round(pos)}
          onChange={(e) => void deck.seek(Number(e.target.value))} />
      </label>
      <label>
        Volume
        <input type="range" min={0} max={1} step={0.01} value={volume}
          onChange={(e) => useJazz.getState().set({ volume: Number(e.target.value) })} />
      </label>
    </section>
  )
}
