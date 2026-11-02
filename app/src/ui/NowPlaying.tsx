// Now Playing card: a quiet, readable view of the console's cover and title module - large artwork, track, artist,
// record and licence (the CC attribution). Appears while the pointer rests on that module, and briefly when the
// track changes; never takes pointer events away from the console underneath.
import { useEffect, useState } from 'react'
import { useJazz } from '../state/store'
import { albumById, trackAt } from '../data/albums'
import { audio } from '../audio/engine'
import { nowPlayingZone } from '../scene/PlayerConsole'

export function NowPlaying() {
  const albumId = useJazz((s) => s.albumId)
  const [hover, setHover] = useState(false)
  const [peek, setPeek] = useState(false)
  const [trackIndex, setTrackIndex] = useState(0)
  useEffect(() => {
    let t = 0
    const onMove = (e: PointerEvent) => {
      const z = nowPlayingZone
      const inside = z.ok && e.clientX >= z.x0 - 6 && e.clientX <= z.x1 + 6 && e.clientY >= z.y0 - 6 && e.clientY <= z.y1 + 6
      window.clearTimeout(t)
      t = window.setTimeout(() => setHover(inside), inside ? 280 : 420)
    }
    window.addEventListener('pointermove', onMove)
    return () => { window.removeEventListener('pointermove', onMove); window.clearTimeout(t) }
  }, [])
  // follow the track along the side; peek for a few seconds whenever it changes
  useEffect(() => {
    const id = window.setInterval(() => {
      const s = useJazz.getState()
      const a = albumById(s.albumId)
      const pos = audio.isPlaying && audio.playingAlbum === a.id ? audio.position() : s.positions[a.id] ?? 0
      setTrackIndex(trackAt(a, pos).index)
    }, 1000)
    return () => window.clearInterval(id)
  }, [])
  useEffect(() => {
    if (useJazz.getState().station === 'museum') return
    setPeek(true)
    const id = window.setTimeout(() => setPeek(false), 3800)
    return () => window.clearTimeout(id)
  }, [albumId, trackIndex])
  const a = albumById(albumId)
  const t = a.tracks[Math.min(trackIndex, a.tracks.length - 1)]
  const show = hover || peek
  return (
    <div className={`nowplaying${show ? ' is-on' : ''}`} aria-hidden={!show} role="status" aria-label="Now playing"
      style={{ left: Math.max(16, nowPlayingZone.ok ? nowPlayingZone.x0 : 40) }}>
      <img src={a.cover} alt="" width={132} height={132} />
      <div className="nowplaying__text">
        <p className="nowplaying__kicker">Now playing{a.tracks.length > 1 ? ` · track ${trackIndex + 1} of ${a.tracks.length}` : ''}</p>
        <p className="nowplaying__title">{t?.title ?? a.title}</p>
        <p className="nowplaying__artist">{a.artist}</p>
        {a.tracks.length > 1 && <p className="nowplaying__album">from <em>{a.title}</em></p>}
        <p className="nowplaying__licence">
          {a.source === 'local' ? 'Your file · this browser' : <>{a.licence} · <a href={a.sourceUrl} target="_blank" rel="noreferrer" tabIndex={show ? 0 : -1}>Free Music Archive</a></>}
        </p>
      </div>
    </div>
  )
}
