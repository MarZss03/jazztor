import { useEffect, useState } from 'react'
import { useProgress } from '@react-three/drei'
import { useJazz, shelfAlbums, shelfPages, visibleAlbums, type TimeSetting } from '../state/store'
import { ALBUMS } from '../data/albums'
import { instrumentById } from '../data/instruments'
import { actions } from '../scene/Experience'
import { deck } from '../scene/deck'
import { LABELS } from '../scene/prepare'
import { openPanel } from './Panels'
import { enterMuseum } from './Museum'
import { museum } from '../scene/MuseumWorld'
import { mapActions, venueIndex } from '../scene/MapStation'
import { CATEGORY_LABEL, FILTERS, matchesFilter } from '../data/venues'

const NAV = ['MAP', 'MUSEUM', 'TORONTO JAZZ LEGACY', 'COLLECTION']

export function TopNav() {
  const station = useJazz((s) => s.station)
  return (
    <nav className="topnav" aria-label="Stations">
      {station !== 'home' && station !== 'museum' && (
        <button className="topnav__item topnav__back" onClick={() => actions.goStation('home')}>
          ← HOME
        </button>
      )}
      {NAV.map((label) => (
        <button key={label} className="topnav__item"
          onClick={() =>
            label === 'COLLECTION'
              ? openPanel('crate')
              : label === 'MUSEUM'
              ? enterMuseum('vestibule')
              : label === 'TORONTO JAZZ LEGACY'
              ? enterMuseum('toronto')
              : label === 'MAP'
              ? station === 'museum' ? void museum.exit(() => actions.goStation('map')) : actions.goStation('map')
              : useJazz.getState().showToast(`${label.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())} — station opens in a later milestone`)
          }>
          {label}
        </button>
      ))}
    </nav>
  )
}

export function TimeSwitch() {
  const setting = useJazz((s) => s.timeSetting)
  const resolved = useJazz((s) => s.resolvedMode)
  const opts: TimeSetting[] = ['AUTO', 'DAY', 'DUSK', 'NIGHT']
  return (
    <div className="timeswitch" role="radiogroup" aria-label="Time of day">
      {opts.map((o) => (
        <button key={o} role="radio" aria-checked={setting === o} className={setting === o ? 'is-on' : ''}
          onClick={() => actions.setTime(o)}>
          <span className="pilot" aria-hidden />
          {o}
        </button>
      ))}
      {setting === 'AUTO' && <span className="timeswitch__now">Toronto · {resolved.toLowerCase()}</span>}
    </div>
  )
}

export function HoverHint() {
  const hovered = useJazz((s) => s.hovered)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [show, setShow] = useState(false)
  useEffect(() => {
    const m = (e: PointerEvent) => setPos({ x: e.clientX, y: e.clientY })
    window.addEventListener('pointermove', m)
    return () => window.removeEventListener('pointermove', m)
  }, [])
  useEffect(() => {
    setShow(false)
    if (!hovered || hovered === 'play') return // the play control stays unlabelled by design
    const id = window.setTimeout(() => setShow(true), 650)
    return () => window.clearTimeout(id)
  }, [hovered])
  if (!show || !hovered) return null
  let text = LABELS[hovered]
  // a sleeve carries its own caption above it (ui/SleeveCaption): no second label at the pointer
  if (hovered.startsWith('sleeve:')) text = ''
  else if (hovered.startsWith('seat:')) text = 'Sit down — walk to stand up'
  else if (hovered.startsWith('instrument:')) {
    const i = instrumentById.get(hovered.slice(11) as never)
    text = i ? `${i.player}’s ${i.title.replace(/^The /, '').replace(/^“/, '“')} — click to look closer` : ''
  }
  else if (hovered.startsWith('pin:')) {
    const v = venueIndex.get(hovered.slice(4))
    text = v ? `${v.name} · ${CATEGORY_LABEL[v.category].toLowerCase()}` : ''
  }
  if (!text) return null
  return (
    <div className="hint" style={{ left: pos.x + 16, top: pos.y + 18 }} aria-hidden>
      {text}
    </div>
  )
}

/** Cabinet view: which crate and shelf is showing, flip between shelves (8 sleeves each), or a hint when the crate is
 * empty. Quiet strip above the console; only in the cabinet view. */
export function CabinetShelf() {
  const station = useJazz((s) => s.station)
  const crate = useJazz((s) => s.crate)
  const myCrate = useJazz((s) => s.myCrate)
  const page = useJazz((s) => s.cabinetPage)
  const albumId = useJazz((s) => s.albumId)
  const hovered = useJazz((s) => s.hovered)
  useJazz((s) => s.catalogVersion)
  if (station !== 'cabinet') return null
  const n = visibleAlbums(crate, myCrate).length
  const pages = shelfPages({ crate, myCrate, cabinetPage: page })
  const at = Math.min(page, pages - 1)
  const shelf = shelfAlbums({ crate, myCrate, cabinetPage: page })
  const set = useJazz.getState().set
  return (
    <div className="shelfdock">
    {shelf.length > 0 && (
      // the shelf's sleeves as covers: hovering one pulls its sleeve out of the cabinet, clicking puts it on the deck
      <ul className="shelfthumbs" aria-label="Records on this shelf">
        {shelf.map((a, i) => (
          <li key={a.id}>
            <button className={`shelfthumb${a.id === albumId ? ' is-on' : ''}${hovered === `sleeve:${i}` ? ' is-hover' : ''}`}
              aria-current={a.id === albumId} aria-label={`${a.title} — ${a.artist}`}
              onPointerEnter={() => set({ hovered: `sleeve:${i}` })} onPointerLeave={() => set({ hovered: null })}
              onFocus={() => set({ hovered: `sleeve:${i}` })} onBlur={() => set({ hovered: null })}
              onClick={() => actions.selectAlbum(a.id)}>
              <img src={a.cover} alt="" loading="lazy" />
            </button>
          </li>
        ))}
      </ul>
    )}
    <div className="shelfbar" role="group" aria-label="Record cabinet">
      <button onClick={actions.crateToggle} aria-label={`Showing ${crate === 'FOR_YOU' ? 'For You' : 'My Crate'}, switch crate`}>
        {crate === 'FOR_YOU' ? 'For You' : 'My Crate'} ⇄</button>
      {n === 0 ? (
        <button onClick={() => openPanel('crate')}>My Crate is empty — add records</button>
      ) : pages > 1 ? (
        <>
          <button onClick={() => actions.shelfStep(-1)} aria-label="Previous shelf">‹</button>
          <span className="shelfbar__count" aria-live="polite">Shelf {at + 1} / {pages} · {n} records</span>
          <button onClick={() => actions.shelfStep(1)} aria-label="Next shelf">›</button>
        </>
      ) : (
        <span className="shelfbar__count">{n} {n === 1 ? 'record' : 'records'}</span>
      )}
    </div>
    </div>
  )
}

export function Toast() {
  const toast = useJazz((s) => s.toast)
  return (
    <div className="toast" role="status" aria-live="polite">
      {toast && <span>{toast}</span>}
    </div>
  )
}

export function Loader() {
  const { progress } = useProgress()
  const loaded = useJazz((s) => s.loaded)
  // only the first load covers the page; later loads (map prefetch, the museum) happen behind the live room
  if (loaded) return null // (set after the first frames are drawn, so the shader compile happens under this screen)
  return (
    <div className="loader">
      <img className="loader__mark" src="/assets/brand/jazztor-wordmark.svg" alt="JazzTor" />
      <div className="loader__bar"><div style={{ width: `${progress}%` }} /></div>
      <div className="loader__note">Warming the valves · {Math.round(progress)}%</div>
    </div>
  )
}

/** Semantic mirror of the physical room for keyboard and screen-reader users. */
export function AccessibleControls() {
  const deckState = useJazz((s) => s.deck)
  const crate = useJazz((s) => s.crate)
  const curtain = useJazz((s) => s.curtain)
  const lamp = useJazz((s) => s.lampLevel)
  const albumId = useJazz((s) => s.albumId)
  return (
    <section className="sr-only" aria-label="Listening room controls">
      <button onClick={() => void deck.toggle(true)}>{deckState === 'playing' ? 'Pause record' : 'Play record'}</button>
      <button onClick={actions.lampToggle}>Lamp {lamp > 0.02 ? 'off' : 'on'}</button>
      <button onClick={actions.curtainCycle}>Curtains: {curtain.toLowerCase()} (change)</button>
      <button onClick={actions.crateToggle}>Showing {crate === 'FOR_YOU' ? 'For You' : 'My Crate'} (switch)</button>
      <ul aria-label="Records">
        {ALBUMS.map((a) => (
          <li key={a.id}>
            <button aria-current={a.id === albumId} onClick={() => actions.selectAlbum(a.id)}>
              {a.title} — {a.artist}
            </button>
          </li>
        ))}
      </ul>
      <ul aria-label="Legendary instruments in the room">
        {[...instrumentById.values()].filter((i) => i.where === 'room').map((i) => (
          <li key={i.id}>
            <button onClick={() => { useJazz.getState().set({ instrument: i.id, panel: null }); actions.goStation('instrument') }}>
              Look closer: {i.player} — {i.title}
            </button>
          </li>
        ))}
      </ul>
      <AccessibleMap />
    </section>
  )
}

/** Semantic mirror of the Jazz Map station: filter, time range and venues with their card details. */
function AccessibleMap() {
  const station = useJazz((s) => s.station)
  const filter = useJazz((s) => s.mapFilter)
  const range = useJazz((s) => s.mapRange)
  const selected = useJazz((s) => s.selectedVenue)
  const saved = useJazz((s) => s.savedVenues)
  const venues = [...venueIndex.values()].filter((v) => matchesFilter(v, filter))
  const sel = selected ? venueIndex.get(selected) : null
  return (
    <div role="group" aria-label="Jazz Map">
      <button onClick={() => actions.goStation(station === 'map' ? 'home' : 'map')}>
        {station === 'map' ? 'Leave the Jazz Map' : 'Open the Jazz Map'}
      </button>
      {station === 'map' && (
        <>
          <button onClick={mapActions.cycleFilter}>Show: {filter.toLowerCase()} (next of {FILTERS.join(', ').toLowerCase()})</button>
          <button onClick={mapActions.cycleRange}>When: {range.toLowerCase()} (change)</button>
          <ul aria-label="Venues">
            {venues.map((v) => (
              <li key={v.id}>
                <button aria-pressed={v.id === selected} onClick={() => mapActions.select(v.id)}>
                  {v.name}, {CATEGORY_LABEL[v.category].toLowerCase()}, {v.address}
                </button>
              </li>
            ))}
          </ul>
          <p aria-live="polite">
            {sel ? `${sel.name}. ${sel.address}. ${saved.includes(sel.id) ? 'Saved.' : ''} Event listings are samples.` : ''}
          </p>
          {sel && (
            <button onClick={() => mapActions.toggleSave(sel.id)}>{saved.includes(sel.id) ? 'Unsave venue' : 'Save venue'}</button>
          )}
        </>
      )}
    </div>
  )
}

export function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.metaKey || e.ctrlKey) return
      const k = e.key.toLowerCase()
      // a focused button keeps Space / Enter (they press it); the room's other keys still work after a click
      if (tag === 'BUTTON' && (k === ' ' || k === 'enter')) return
      if (k === ' ') {
        e.preventDefault()
        void deck.toggle(true)
      } else if (k === 't') actions.cycleTime()
      else if (k === 'l') actions.lampToggle()
      else if (k === 'c') actions.curtainCycle()
      else if (k === 'r') actions.goStation(useJazz.getState().station === 'platter' ? 'home' : 'platter')
      else if (k === 'b') actions.goStation(useJazz.getState().station === 'cabinet' ? 'home' : 'cabinet')
      else if (k === 'escape') {
        const s = useJazz.getState()
        if (s.selectedVenue) mapActions.select(null)
        else actions.goStation('home')
      } else if (k === 'm') actions.goStation(useJazz.getState().station === 'map' ? 'home' : 'map')
      else if (k === 'arrowright' && e.shiftKey) actions.step(1)
      else if (k === 'arrowleft' && e.shiftKey) actions.step(-1)
      else if (k === 'arrowright' && useJazz.getState().station === 'cabinet') actions.shelfStep(1)
      else if (k === 'arrowleft' && useJazz.getState().station === 'cabinet') actions.shelfStep(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
