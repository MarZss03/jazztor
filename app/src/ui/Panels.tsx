// HTML stations that slide over the live room: main menu, My Crate, My Listening Room, Connect Music, Account.
// Styled as walnut-and-brass hardware panels (see assets/ui 17-21); the 3D room shifts right and keeps running.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useJazz, DEFAULT_PREFS, visibleAlbums, type Panel, type Prefs, type TimeSetting } from '../state/store'
import { ALBUMS, type Album } from '../data/albums'
import { localLibrary } from '../data/localLibrary'
import { deck } from '../scene/deck'
import { actions } from '../scene/Experience'
import { audio } from '../audio/engine'
import { torontoClock } from '../scene/timeMode'
import { enterMuseum } from './Museum'
import { museum } from '../scene/MuseumWorld'

export const PANEL_TITLES: Record<Panel, string> = {
  menu: 'Menu', crate: 'My Crate', room: 'My Listening Room', connect: 'Connect Music', account: 'Account',
}
/** Width the panel takes from the left edge (the 3D view shifts by half of it). */
export function panelWidthPx(p: Panel | null, vw = window.innerWidth) {
  if (!p) return 0
  if (vw < 760) return vw
  return p === 'menu' ? Math.min(360, vw * 0.3) : Math.min(640, vw * 0.5)
}

export const openPanel = (p: Panel | null) => {
  // a panel belongs to the listening room: step back out through the museum door first
  if (p && p !== 'menu' && useJazz.getState().station === 'museum') return void museum.exit(() => openPanel(p))
  audio.sfx(p ? 'lever' : 'switch')
  useJazz.getState().set({ panel: p, ...(p ? { station: 'home' as const } : {}) })
}

const fmtDur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : `${Math.round(s / 60)} min`)
const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}

// ------------------------------------------------------------------ shared chrome
function Station({ panel, title, subtitle, children }: { panel: Panel; title: string; subtitle?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    // move focus into the panel for keyboard users; return it to the opener on close
    const prev = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('h2')?.focus()
    return () => prev?.focus?.()
  }, [])
  return (
    <section ref={ref} className={`station station--${panel}`} aria-labelledby={`station-${panel}`}
      style={{ width: panelWidthPx(panel) }}>
      <span className="screw screw--tl" aria-hidden /><span className="screw screw--tr" aria-hidden />
      <span className="screw screw--bl" aria-hidden /><span className="screw screw--br" aria-hidden />
      <header className="station__head">
        <h2 id={`station-${panel}`} tabIndex={-1}>{title}{subtitle && <small> / {subtitle}</small>}</h2>
        <button className="station__close" onClick={() => openPanel(null)} aria-label="Close and return to the room">
          <span aria-hidden>×</span>
        </button>
      </header>
      <div className="station__body">{children}</div>
    </section>
  )
}

function Row({ label, icon, children }: { label: string; icon?: string; children: ReactNode }) {
  return (
    <div className="row" role="group" aria-label={label}>
      <span className="screw screw--row" aria-hidden />
      <div className="row__label">{icon && <span className="row__icon" aria-hidden>{icon}</span>}{label}</div>
      <div className="row__controls">{children}</div>
    </div>
  )
}

/** Engraved selector: a row of detented positions with an amber pilot on the active one. */
function Selector<T extends string>({ value, options, onChange, label }: {
  value: T; options: readonly T[] | { value: T; label: string }[]; onChange: (v: T) => void; label: string
}) {
  const opts = (options as (T | { value: T; label: string })[]).map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
  return (
    <div className="selector" role="radiogroup" aria-label={label}>
      {opts.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} className={value === o.value ? 'is-on' : ''}
          onClick={() => { audio.sfx('detent'); onChange(o.value) }}>
          <span className="pilot" aria-hidden />{o.label}
        </button>
      ))}
    </div>
  )
}

function Fader({ value, onChange, label, min = 0, max = 1, step = 0.01 }: {
  value: number; onChange: (v: number) => void; label: string; min?: number; max?: number; step?: number
}) {
  return (
    <label className="fader">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

// ------------------------------------------------------------------ main menu (hi-fi control drawer)
const MENU: { label: string; go: () => void; on: (s: ReturnType<typeof useJazz.getState>) => boolean }[] = [
  { label: 'Listening Room', go: () => { openPanel(null); actions.goStation('home') }, on: (s) => !s.panel && s.station === 'home' },
  { label: 'Jazz Map', go: () => { openPanel(null); actions.goStation('map') }, on: (s) => s.station === 'map' },
  { label: 'Museum', go: () => { openPanel(null); enterMuseum('vestibule') }, on: (s) => s.station === 'museum' && !s.museumRoom.startsWith('toronto') },
  { label: 'Toronto Jazz Legacy', go: () => { openPanel(null); enterMuseum('toronto') }, on: (s) => s.station === 'museum' && s.museumRoom.startsWith('toronto') },
  { label: 'Collection', go: () => openPanel('crate'), on: (s) => s.panel === 'crate' },
  { label: 'My Listening Room', go: () => openPanel('room'), on: (s) => s.panel === 'room' },
  { label: 'Connect Music', go: () => openPanel('connect'), on: (s) => s.panel === 'connect' },
  { label: 'Account', go: () => openPanel('account'), on: (s) => s.panel === 'account' },
]

function MenuPanel() {
  const s = useJazz()
  return (
    <section className="station station--menu" aria-label="Main menu" style={{ width: panelWidthPx('menu') }}>
      <span className="screw screw--tl" aria-hidden /><span className="screw screw--bl" aria-hidden />
      <header className="station__head station__head--menu">
        <img src="/assets/brand/jazztor-wordmark.svg" alt="JazzTor" className="menu__mark" />
        <button className="station__close" onClick={() => openPanel(null)} aria-label="Close menu"><span aria-hidden>×</span></button>
      </header>
      <nav className="menu__list">
        {MENU.map((m, i) => (
          <button key={m.label} className={`menu__item ${m.on(s) ? 'is-on' : ''}`} aria-current={m.on(s) ? 'page' : undefined}
            onClick={() => { audio.sfx('detent'); m.go() }} autoFocus={i === 0}>
            <span className="pilot" aria-hidden />{m.label}
          </button>
        ))}
      </nav>
      <footer className="menu__profile">
        <strong>{s.profile?.name ?? 'Guest'}</strong>
        <span>Listening memory · {s.prefs.memory ? 'On' : 'Off'}</span>
        <span className={`pilot ${s.prefs.memory ? 'is-lit' : ''}`} aria-hidden />
      </footer>
    </section>
  )
}

// ------------------------------------------------------------------ My Crate / Collection
type CrateTab = 'FOR_YOU' | 'MY_CRATE' | 'RECENT'
type Sort = 'added' | 'artist' | 'title' | 'length'

function CratePanel() {
  const { crate, myCrate, albumId, history, deck: deckState, prefs } = useJazz()
  useJazz((s) => s.catalogVersion)
  const [tab, setTab] = useState<CrateTab>(crate)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('added')
  const lastPlayed = useMemo(() => {
    const m = new Map<string, number>()
    for (const h of history) if (!m.has(h.albumId)) m.set(h.albumId, h.at)
    return m
  }, [history])
  const list = useMemo(() => {
    let l: Album[] = tab === 'RECENT'
      ? [...new Set(history.map((h) => h.albumId))].map((id) => ALBUMS.find((a) => a.id === id)).filter((a): a is Album => !!a)
      : visibleAlbums(tab, myCrate)
    const needle = q.trim().toLowerCase()
    if (needle) l = l.filter((a) => `${a.title} ${a.artist} ${a.tracks.map((t) => t.title).join(' ')}`.toLowerCase().includes(needle))
    if (tab !== 'RECENT') {
      if (sort === 'artist') l = [...l].sort((a, b) => a.artist.localeCompare(b.artist))
      else if (sort === 'title') l = [...l].sort((a, b) => a.title.localeCompare(b.title))
      else if (sort === 'length') l = [...l].sort((a, b) => b.duration - a.duration)
    }
    return l
  }, [tab, myCrate, history, q, sort])
  const crateTotal = visibleAlbums('MY_CRATE', myCrate)
  const select = (a: Album) => {
    audio.sfx('slide')
    void deck.changeAlbum(a.id, prefs.autoplayOnSelect)
  }
  return (
    <Station panel="crate" title="Collection" subtitle={tab === 'MY_CRATE' ? 'My Crate' : tab === 'RECENT' ? 'Recently Played' : 'For You'}>
      <div className="crate__bar">
        <Selector label="Shelf" value={tab} onChange={(v) => { setTab(v); if (v !== 'RECENT') useJazz.getState().set({ crate: v }) }}
          options={[{ value: 'FOR_YOU', label: 'For You' }, { value: 'MY_CRATE', label: 'My Crate' }, { value: 'RECENT', label: 'Recently Played' }]} />
      </div>
      <div className="crate__tools">
        <label className="search">
          <span className="sr-only">Search the crate</span>
          <span aria-hidden>⌕</span>
          <input type="search" placeholder="Search records, artists, tracks…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {tab !== 'RECENT' && (
          <label className="sort">
            <span>Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="added">Recently added</option>
              <option value="artist">Artist</option>
              <option value="title">Title</option>
              <option value="length">Length</option>
            </select>
          </label>
        )}
      </div>
      <div className="crate__summary">
        <span>{crateTotal.length} records in My Crate · {crateTotal.reduce((n, a) => n + a.tracks.length, 0)} tracks</span>
        <span>{history[0] ? `Last played ${ago(history[0].at)}` : 'Nothing played yet'}</span>
        <button className="brass-btn" disabled={!crateTotal.length}
          onClick={() => { useJazz.getState().set({ crate: 'MY_CRATE' }); void deck.changeAlbum(crateTotal[0].id, true) }}>
          ▶ Play My Crate
        </button>
      </div>
      {list.length === 0 && (
        <p className="crate__empty">
          {tab === 'RECENT' ? (prefs.memory ? 'Records you play will appear here.' : 'Listening memory is off (My Listening Room).')
            : q ? 'No record matches that search.' : 'Your crate is empty — add records with “+ Crate”.'}
        </p>
      )}
      <ul className="crate__grid">
        {list.map((a) => {
          const inCrate = myCrate.includes(a.id)
          const current = a.id === albumId
          return (
            <li key={a.id} className={`record ${current ? 'is-current' : ''}`}>
              <button className="record__sleeve" onClick={() => select(a)}
                aria-label={`${current && deckState === 'playing' ? 'Now playing' : 'Play'}: ${a.title} by ${a.artist}`}>
                <img src={a.cover} alt="" loading="lazy" />
                {current && <span className="record__now">{deckState === 'playing' ? 'ON THE PLATTER' : 'ON THE DECK'}</span>}
              </button>
              <div className="record__meta">
                <strong>{a.title}</strong>
                <em>— {a.artist}</em>
                <span>{a.tracks.length} {a.tracks.length === 1 ? 'track' : 'tracks'} · {fmtDur(a.duration)}</span>
                <span className="record__src">{a.source === 'local' ? 'Your file · this browser' : `${a.licence} · Free Music Archive`}</span>
                {lastPlayed.get(a.id) && <span>Played {ago(lastPlayed.get(a.id)!)}</span>}
              </div>
              <button className={`chip ${inCrate ? 'is-on' : ''}`} aria-pressed={inCrate}
                onClick={() => { audio.sfx('switch'); useJazz.getState().toggleCrateAlbum(a.id) }}>
                {inCrate ? '✓ In Crate' : '+ Crate'}
              </button>
            </li>
          )
        })}
      </ul>
    </Station>
  )
}

// ------------------------------------------------------------------ My Listening Room / preferences
function RoomPanel() {
  const s = useJazz()
  const p = s.prefs
  const set = (x: Partial<Prefs>) => s.setPrefs(x)
  const [clock, setClock] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  const t = torontoClock(clock)
  const hh = Math.floor(t.hour)
  const tTime = `${((hh + 11) % 12) + 1}:${String(Math.round((t.hour - hh) * 60)).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`
  return (
    <Station panel="room" title="My Listening Room" subtitle="Preferences">
      <Row label="Time & Light" icon="☼">
        <Selector label="Time of day" value={s.timeSetting} options={['AUTO', 'DAY', 'DUSK', 'NIGHT'] as TimeSetting[]}
          onChange={(v) => actions.setTime(v)} />
        <span className="readout">Toronto time · {tTime}{s.timeSetting === 'AUTO' ? ` · ${s.resolvedMode.toLowerCase()}` : ''}</span>
      </Row>
      <Row label="Curtains" icon="⫴">
        <Selector label="Curtains" value={s.curtain} options={['OPEN', 'HALF', 'CLOSED'] as const}
          onChange={(v) => { audio.sfx('curtain'); s.set({ curtain: v }) }} />
      </Row>
      <Row label="Lamp" icon="◒">
        <Selector label="Lamp" value={s.lampLevel > 0.02 ? 'ON' : 'OFF'} options={['OFF', 'ON'] as const}
          onChange={(v) => s.set({ lampLevel: v === 'ON' ? Math.max(0.35, s.lampLevel || 0.7) : 0 })} />
        <Fader label="Dimmer" value={s.lampLevel} onChange={(v) => s.set({ lampLevel: v })} />
      </Row>
      <Row label="Whiskey Display" icon="◫">
        <Selector label="Display rotation" value={p.whiskeySpeed}
          options={[{ value: 'off', label: 'Off' }, { value: 'slow', label: 'Slow' }, { value: 'fast', label: 'Fast' }]}
          onChange={(v) => set({ whiskeySpeed: v })} />
      </Row>
      <Row label="Room Finish" icon="▤">
        <div className="swatches" role="radiogroup" aria-label="Room finish">
          {([['walnut', 'Walnut'], ['lacquer', 'Black Lacquer'], ['oak', 'Smoked Oak']] as const).map(([v, label]) => (
            <button key={v} role="radio" aria-checked={p.roomFinish === v} className={`swatch swatch--${v} ${p.roomFinish === v ? 'is-on' : ''}`}
              onClick={() => { audio.sfx('detent'); set({ roomFinish: v }) }}>
              <span aria-hidden /> {label}
            </button>
          ))}
        </div>
      </Row>
      <Row label="Sound" icon="∿">
        <Fader label="Music" value={s.volume} onChange={(v) => s.set({ volume: v })} />
        <Fader label="Mechanical" value={p.sfxLevel} onChange={(v) => set({ sfxLevel: v })} />
        <Selector label="Needle touchdown ticks" value={p.needleCrackle ? 'ON' : 'OFF'}
          options={[{ value: 'ON', label: 'Needle ticks' }, { value: 'OFF', label: 'Silent drop' }]}
          onChange={(v) => set({ needleCrackle: v === 'ON' })} />
      </Row>
      <Row label="Picture" icon="◎">
        <Selector label="Rendering quality" value={p.quality}
          options={[{ value: 'auto', label: 'Auto' }, { value: 'high', label: 'High' }, { value: 'medium', label: 'Balanced' }, { value: 'low', label: 'Light' }]}
          onChange={(v) => set({ quality: v })} />
        <Fader label="Film grain" value={p.grain} max={0.6} onChange={(v) => set({ grain: v })} />
        <Selector label="Motion" value={p.motion}
          options={[{ value: 'system', label: 'System' }, { value: 'full', label: 'Full' }, { value: 'reduced', label: 'Reduced' }]}
          onChange={(v) => set({ motion: v })} />
      </Row>
      <Row label="Playback" icon="▷">
        <Selector label="Choosing a record" value={p.autoplayOnSelect ? 'play' : 'load'}
          options={[{ value: 'play', label: 'Plays it' }, { value: 'load', label: 'Loads it' }]}
          onChange={(v) => set({ autoplayOnSelect: v === 'play' })} />
      </Row>
      <Row label="Listening Memory" icon="≡">
        <Selector label="Listening memory" value={p.memory ? 'ON' : 'OFF'} options={['ON', 'OFF'] as const}
          onChange={(v) => set({ memory: v === 'ON' })} />
        <span className="readout">{s.history.length} plays remembered on this device</span>
        <button className="text-btn" disabled={!s.history.length}
          onClick={() => { s.set({ history: [] }); s.showToast('Listening history cleared') }}>Forget history</button>
      </Row>
      <div className="station__actions">
        <span className="readout">Changes apply to the room immediately and are remembered on this device.</span>
        <button className="outline-btn" onClick={() => {
          s.set({ prefs: DEFAULT_PREFS, timeSetting: 'AUTO', curtain: 'OPEN', lampLevel: 0.7, volume: 0.8 })
          s.showToast('Restored the JazzTor original room')
        }}>↺ Restore JazzTor Original</button>
      </div>
    </Station>
  )
}

// ------------------------------------------------------------------ Connect Music & Playlists
function ConnectPanel() {
  useJazz((s) => s.catalogVersion)
  const crate = useJazz((s) => s.crate)
  const [usage, setUsage] = useState({ files: 0, bytes: 0 })
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const local = ALBUMS.filter((a) => a.source === 'local')
  useEffect(() => { void localLibrary.usage().then(setUsage) }, [local.length])
  const add = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    const n = await localLibrary.add(files)
    setBusy(false)
    useJazz.getState().showToast(n ? `${n} file${n > 1 ? 's' : ''} added to your shelf` : 'No audio files in that selection')
  }
  return (
    <Station panel="connect" title="Connect Music" subtitle="Sources">
      <Row label="Local Files" icon="▣">
        <div className="source">
          <span className="pilot is-lit" aria-hidden />
          <div>
            <strong>Connected · this browser</strong>
            <p>Your MP3, AAC, OGG, FLAC or WAV files become records on the shelf. They stay on this device and are never
              uploaded. Titles, artists, albums and cover art are read from the files&rsquo; tags.</p>
            <p className="readout">{usage.files} files · {(usage.bytes / 1e6).toFixed(1)} MB in this browser</p>
          </div>
        </div>
        <input ref={input} type="file" accept="audio/*,.mp3,.m4a,.ogg,.opus,.flac,.wav" multiple hidden
          onChange={(e) => { void add(e.target.files); e.target.value = '' }} />
        <div className="drop" onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); void add(e.dataTransfer.files) }}>
          <button className="brass-btn" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Reading files…' : '+ Add music files'}</button>
          <span>or drop files here</span>
        </div>
        {local.length > 0 && (
          <ul className="local-list">
            {local.map((a) => (
              <li key={a.id}>
                <img src={a.cover} alt="" width={40} height={40} />
                <span><strong>{a.title}</strong> — {a.artist} · {a.tracks.length} tr</span>
                <button className="text-btn" onClick={() => void localLibrary.remove(a)} aria-label={`Remove ${a.title}`}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </Row>
      <Row label="Free Music Archive" icon="◉">
        <div className="source">
          <span className="pilot is-lit" aria-hidden />
          <div>
            <strong>Built in · {ALBUMS.filter((a) => a.source === 'fma').length} records</strong>
            <p>CC0 and CC BY recordings, licence-checked track by track. Credits are listed under CREDITS.</p>
          </div>
        </div>
      </Row>
      <Row label="Streaming Services" icon="≋">
        <div className="source">
          <span className="pilot" aria-hidden />
          <div>
            <strong>Not connected</strong>
            <p>Linking a streaming account needs that provider&rsquo;s developer agreement and sign-in, which this build
              does not include. Playback from a provider would also depend on your subscription and region.</p>
          </div>
        </div>
      </Row>
      <Row label="Cabinet Default" icon="▥">
        <Selector label="Records shown in the cabinet" value={crate}
          options={[{ value: 'FOR_YOU', label: 'For You' }, { value: 'MY_CRATE', label: 'My Crate' }]}
          onChange={(v) => useJazz.getState().set({ crate: v })} />
      </Row>
    </Station>
  )
}

// ------------------------------------------------------------------ Account (on-device profile)
function AccountPanel() {
  const s = useJazz()
  const [name, setName] = useState(s.profile?.name ?? '')
  return (
    <Station panel="account" title="Account">
      <Row label={s.profile ? 'Your Profile' : 'Guest'} icon="◌">
        <div className="source">
          <span className={`pilot ${s.profile ? 'is-lit' : ''}`} aria-hidden />
          <div>
            <strong>{s.profile ? `Listening as ${s.profile.name}` : 'Listening as a guest'}</strong>
            <p>JazzTor accounts are not open yet. A profile here is kept on this device only — your room, crate and
              listening memory stay in this browser. Nothing is sent to a server.</p>
          </div>
        </div>
        <form className="profile-form" onSubmit={(e) => {
          e.preventDefault()
          const n = name.trim().slice(0, 40)
          s.set({ profile: n ? { name: n } : null })
          s.showToast(n ? `Welcome, ${n}` : 'Continuing as a guest')
        }}>
          <label>
            <span>Name shown in the room</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" maxLength={40} />
          </label>
          <button className="brass-btn" type="submit">Save on this device</button>
        </form>
      </Row>
      <Row label="Privacy" icon="⊘">
        <p className="readout">Stored in this browser: room settings, crate, saved venues, listening memory
          ({s.history.length} plays) and any music files you added.</p>
        <button className="outline-btn" onClick={async () => {
          if (!window.confirm('Remove everything JazzTor keeps in this browser, including your imported music files?')) return
          await localLibrary.clear()
          localStorage.removeItem('jazztor-room-v2')
          location.reload()
        }}>Erase all data on this device</button>
      </Row>
    </Station>
  )
}

export function Panels() {
  const panel = useJazz((s) => s.panel)
  useEffect(() => {
    if (!panel) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopImmediatePropagation(), openPanel(null))
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [panel])
  return (
    <>
      <button className="menu-button" onClick={() => openPanel(panel === 'menu' ? null : 'menu')} aria-expanded={panel === 'menu'}
        aria-label="Menu">
        <img src="/assets/brand/jazztor-wordmark.svg" alt="" />
      </button>
      {panel === 'menu' && <MenuPanel />}
      {panel === 'crate' && <CratePanel />}
      {panel === 'room' && <RoomPanel />}
      {panel === 'connect' && <ConnectPanel />}
      {panel === 'account' && <AccountPanel />}
    </>
  )
}

