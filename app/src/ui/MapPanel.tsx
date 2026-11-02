// Jazz Map reading panel: the venue list and the selected venue's card in readable type beside the 3D table,
// plus the magnifier controls (the table itself zooms with the wheel / trackpad pinch and pans by dragging).
import { useJazz } from '../state/store'
import { mapActions, venueIndex } from '../scene/MapStation'
import { CATEGORY_LABEL, FILTERS, RANGES, fmtEventDate, matchesFilter, sampleEvents } from '../data/venues'
import { CHAPTERS } from '../data/archive'
import { MAX_ZOOM, resetMapView, zoomAt } from '../scene/mapView'
import { enterMuseum } from './Museum'

export const MAP_PANEL_PX = 280

export function MapPanel() {
  const station = useJazz((s) => s.station)
  const filter = useJazz((s) => s.mapFilter)
  const range = useJazz((s) => s.mapRange)
  const selected = useJazz((s) => s.selectedVenue)
  const saved = useJazz((s) => s.savedVenues)
  const zoom = useJazz((s) => s.mapZoom)
  const set = useJazz((s) => s.set)
  const open = useJazz((s) => s.mapPanelOpen)
  if (station !== 'map') return null
  if (!open) {
    return (
      <button className="mappanel-tab" onClick={() => set({ mapPanelOpen: true })} aria-label="Show the venue list">
        Venues <span aria-hidden>‹</span>
      </button>
    )
  }
  const venues = [...venueIndex.values()].filter((v) => matchesFilter(v, filter)).sort((a, b) => a.name.localeCompare(b.name))
  const sel = selected ? venueIndex.get(selected) : null
  const story = sel ? CHAPTERS.find((c) => c.venueId === sel.id) : undefined
  return (
    <aside className="mappanel" aria-label="Jazz Map venues" style={{ width: MAP_PANEL_PX }}>
      <header className="mappanel__head">
        <div className="mappanel__title">
          <h2>Jazz Map · Toronto</h2>
          <button className="mappanel__min" onClick={() => set({ mapPanelOpen: false })} aria-label="Minimise the venue list" title="Minimise">–</button>
        </div>
        <div className="mappanel__chips" role="radiogroup" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f} role="radio" aria-checked={filter === f} className={filter === f ? 'is-on' : ''}
              onClick={() => set({ mapFilter: f, selectedVenue: sel && !matchesFilter(sel, f) ? null : selected })}>{f}</button>
          ))}
        </div>
        <div className="mappanel__chips" role="radiogroup" aria-label="When">
          {RANGES.map((r) => (
            <button key={r} role="radio" aria-checked={range === r} className={range === r ? 'is-on' : ''} onClick={() => set({ mapRange: r })}>{r}</button>
          ))}
        </div>
      </header>
      {sel ? (
        <article className="mappanel__card" aria-live="polite">
          <button className="mappanel__close" onClick={() => mapActions.select(null)} aria-label="Back to the venue list">← All venues</button>
          <p className="mappanel__kicker">{CATEGORY_LABEL[sel.category]}</p>
          <h3>{sel.name}</h3>
          <p className="mappanel__addr">{sel.address}</p>
          <h4>{range.toLowerCase()} <span>· sample listings</span></h4>
          <ul className="mappanel__events">
            {sel.category === 'historic' && <li className="mappanel__none">A historic site — no current listings.</li>}
            {sampleEvents(sel, range).map((e, i) => (
              <li key={i}><span>{fmtEventDate(e.date)}</span><strong>{e.artist}</strong><em>{e.style}</em></li>
            ))}
          </ul>
          <div className="mappanel__actions">
            <button onClick={() => mapActions.toggleSave(sel.id)}>{saved.includes(sel.id) ? '★ Saved' : '☆ Save venue'}</button>
            {story && (
              <button onClick={() => { useJazz.getState().set({ museumToronto: story.id }); enterMuseum('toronto') }}>
                Its story in the museum →</button>
            )}
          </div>
        </article>
      ) : (
        <ul className="mappanel__list">
          {venues.map((v) => (
            <li key={v.id}>
              <button onClick={() => mapActions.select(v.id)}>
                <strong>{v.name}</strong>
                <span>{CATEGORY_LABEL[v.category].toLowerCase()} · {v.address}</span>
                {saved.includes(v.id) && <em aria-label="saved">★</em>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mappanel__zoom" role="group" aria-label="Magnify the map">
        <button onClick={() => zoomAt(1 / 1.5)} disabled={zoom <= 1.001} aria-label="Zoom out">−</button>
        <span>{zoom.toFixed(1)}×</span>
        <button onClick={() => zoomAt(1.5)} disabled={zoom >= MAX_ZOOM - 0.01} aria-label="Zoom in">+</button>
        <button onClick={resetMapView} disabled={zoom <= 1.001}>Whole map</button>
      </div>
      <p className="mappanel__hint">Scroll or pinch to zoom · drag to move</p>
    </aside>
  )
}
