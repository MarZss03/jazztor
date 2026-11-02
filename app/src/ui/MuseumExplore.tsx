// Free-walk controls for the museum: keys / drag / wheel on desktop, a virtual stick + drag-to-look on touch, a small
// floor-plan map with the visitor's position, and a first-time hint. The walk itself lives in scene/museumWalk.ts.
import { useEffect, useRef, useState } from 'react'
import { useJazz } from '../state/store'
import { museumWalk } from '../scene/MuseumWorld'
import { isOverConsole } from '../scene/PlayerConsole'

const KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'])

export function MuseumExplore() {
  const room = useJazz((s) => s.museumRoom)
  const station = useJazz((s) => s.station)
  const on = station === 'museum' && room === 'explore'
  const [hint, setHint] = useState(true)

  // keyboard + mouse look (drag on the canvas) + wheel steps
  useEffect(() => {
    if (!on) return
    const w = museumWalk()
    if (!w) return
    const canvas = document.querySelector('canvas')
    const typing = (e: Event) => /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName ?? '')
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (typing(e) || !KEYS.has(k)) return
      w.st.keys.add(k)
      if (k.startsWith('arrow')) e.preventDefault()
      setHint(false)
    }
    const up = (e: KeyboardEvent) => w.st.keys.delete(e.key.toLowerCase())
    const blur = () => w.st.keys.clear()
    let drag: { x: number; y: number; id: number; moved: number } | null = null
    const pd = (e: PointerEvent) => {
      if (e.target !== canvas || isOverConsole(e.clientY, canvas as HTMLCanvasElement) || (e.pointerType === 'touch' && stickId.current === e.pointerId)) return
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: 0 }
      w.st.dragged = false
    }
    const pm = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y
      drag.moved += Math.abs(dx) + Math.abs(dy)
      drag.x = e.clientX
      drag.y = e.clientY
      // (a press that barely moves stays a click: exhibits open on click)
      if (drag.moved > 4) { w.look(dx * 0.0042, -dy * 0.0032); w.st.dragged = true; setHint(false) }
    }
    const pu = (e: PointerEvent) => { if (drag && e.pointerId === drag.id) drag = null }
    const wheel = (e: WheelEvent) => {
      if (e.target !== canvas) return
      e.preventDefault()
      // a wheel notch walks ~0.35 m (collisions still apply)
      w.st.vx += Math.sin(w.st.yaw) * -Math.sign(e.deltaY) * 2.2
      w.st.vy += Math.cos(w.st.yaw) * -Math.sign(e.deltaY) * 2.2
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    window.addEventListener('pointerdown', pd)
    window.addEventListener('pointermove', pm)
    window.addEventListener('pointerup', pu)
    window.addEventListener('wheel', wheel, { passive: false })
    return () => {
      w.st.keys.clear()
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      window.removeEventListener('pointerdown', pd)
      window.removeEventListener('pointermove', pm)
      window.removeEventListener('pointerup', pu)
      window.removeEventListener('wheel', wheel)
    }
  }, [on])

  // touch stick
  const stickId = useRef<number | null>(null)
  const base = useRef<HTMLDivElement>(null)
  const knob = useRef<HTMLDivElement>(null)
  const moveStick = (e: React.PointerEvent) => {
    const w = museumWalk()
    const b = base.current?.getBoundingClientRect()
    if (!w || !b || stickId.current !== e.pointerId) return
    let x = (e.clientX - (b.left + b.width / 2)) / (b.width / 2)
    let y = (e.clientY - (b.top + b.height / 2)) / (b.height / 2)
    const l = Math.hypot(x, y)
    if (l > 1) { x /= l; y /= l }
    w.st.stick.x = x
    w.st.stick.y = y
    if (knob.current) knob.current.style.transform = `translate(${x * 30}px, ${y * 30}px)`
  }
  const endStick = () => {
    const w = museumWalk()
    stickId.current = null
    if (w) w.st.stick.x = w.st.stick.y = 0
    if (knob.current) knob.current.style.transform = ''
  }

  // minimap (redrawn every frame while walking; tiny canvas)
  const map = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!on) return
    let raf = 0
    const draw = () => {
      const w = museumWalk()
      const c = map.current
      if (w && c) {
        const g = c.getContext('2d')!
        const S = 13, ox = c.width / 2, oy = c.height - 8 // 13 px per metre, museum x centred, door at the bottom
        const X = (x: number) => ox + x * S, Y = (y: number) => oy - y * S
        g.clearRect(0, 0, c.width, c.height)
        g.fillStyle = 'rgba(236, 223, 198, 0.16)'
        for (const f of w.plan.floor) g.fillRect(X(f.x0), Y(f.y1), (f.x1 - f.x0) * S, (f.y1 - f.y0) * S)
        g.fillStyle = 'rgba(201, 163, 104, 0.55)'
        for (const r of w.plan.rects) g.fillRect(X(r.x0), Y(r.y1), (r.x1 - r.x0) * S, (r.y1 - r.y0) * S)
        for (const d of w.plan.discs) { g.beginPath(); g.arc(X(d.x), Y(d.y), d.r * S, 0, Math.PI * 2); g.fill() }
        // the visitor: a dot and a view cone
        const px = X(w.st.x), py = Y(w.st.y), a = w.st.yaw
        g.fillStyle = 'rgba(255, 196, 120, 0.35)'
        g.beginPath(); g.moveTo(px, py)
        g.arc(px, py, 26, -Math.PI / 2 + a - 0.5, -Math.PI / 2 + a + 0.5)
        g.closePath(); g.fill()
        g.fillStyle = '#ffd9a0'
        g.beginPath(); g.arc(px, py, 3.5, 0, Math.PI * 2); g.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [on])

  if (!on) return null
  const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
  return (
    <>
      <canvas className="explore-map" ref={map} width={170} height={160} aria-hidden />
      {hint && (
        <p className="explore-hint" role="status">
          {touch ? 'Walk with the stick · drag to look around · tap a picture or instrument to look closer'
            : 'W A S D or arrow keys to walk · drag to look around · Shift to hurry · click a picture or instrument to look closer'}
        </p>
      )}
      {touch && (
        <div className="explore-stick" ref={base} aria-hidden
          onPointerDown={(e) => { stickId.current = e.pointerId; (e.target as HTMLElement).setPointerCapture(e.pointerId); moveStick(e); setHint(false) }}
          onPointerMove={moveStick} onPointerUp={endStick} onPointerCancel={endStick}>
          <div className="explore-stick__knob" ref={knob} />
        </div>
      )}
    </>
  )
}
