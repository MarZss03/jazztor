// A small, quiet caption over the record sleeve standing out of the cabinet: title and artist in the room's serif,
// fading in with the sleeve. No box, no pointer events - it reads like a printed spine label, not a tooltip.
// The DOM is touched only when something changed (a per-frame style write costs style + compositing work every frame).
import { useEffect, useRef } from 'react'
import { sleeveCaption } from '../scene/Experience'

export function SleeveCaption() {
  const el = useRef<HTMLDivElement>(null)
  const title = useRef<HTMLSpanElement>(null)
  const artist = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    let last = ''
    const tick = () => {
      const d = el.current
      const c = sleeveCaption
      if (d) {
        const o = Math.round(Math.max(0, Math.min(1, c.show)) * 100) / 100
        const key = o > 0.01 ? `${o}|${Math.round(c.x)}|${Math.round(c.y)}|${c.title}|${c.artist}` : 'hidden'
        if (key !== last) {
          last = key
          if (key === 'hidden') d.style.visibility = 'hidden'
          else {
            d.style.visibility = 'visible'
            d.style.opacity = String(o)
            d.style.transform = `translate(-50%, calc(-100% - ${10 + 6 * (1 - o)}px)) translate(${Math.round(c.x)}px, ${Math.round(c.y)}px)`
            if (title.current && title.current.textContent !== c.title) title.current.textContent = c.title
            if (artist.current && artist.current.textContent !== c.artist) artist.current.textContent = c.artist
          }
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div className="sleevecap" ref={el} aria-hidden>
      <span className="sleevecap__title" ref={title} />
      <span className="sleevecap__artist" ref={artist} />
    </div>
  )
}
