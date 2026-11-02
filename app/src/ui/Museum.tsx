// DOM layer for the 3D museum: a restrained wayfinding strip, plus an accessible mirror of everything the 3D
// exhibits show (keyboard and screen-reader users choose chapters here; the placards repaint the same selection).
import { useEffect, useRef } from 'react'
import { useJazz, type MuseumRoom } from '../state/store'
import { museum, MuseumFade, spaceOf } from '../scene/MuseumWorld'
import { EXHIBITS, exhibitById } from '../data/exhibits'
import { ExhibitCard } from './ExhibitCard'
import { MuseumExplore } from './MuseumExplore'
import { instrumentById } from '../data/instruments'
import { PlacardCard, selectEntry } from './PlacardCard'
import { placardEntries, stepEntry, type Wing } from '../data/placards'
import { WORLD } from '../data/worldJazz'
import { CHAPTERS, FIGURES } from '../data/archive'
import { actions } from '../scene/Experience'

const ROOM_LABEL: Record<MuseumRoom, string> = {
  door: 'Museum door', vestibule: 'Vestibule', world: 'World Jazz History', toronto: 'Toronto Jazz Legacy',
  'world-read': 'World Jazz History · reading', 'toronto-read': 'Toronto Jazz Legacy · reading', exhibit: 'Exhibit',
  instrument: 'Legendary instrument', explore: 'Exploring freely',
}
const SPACE_LABEL = { vestibule: 'Vestibule', world: 'World Jazz History', toronto: 'Toronto Jazz Legacy' }

let returnFocus: HTMLElement | null = null
/** Remember where keyboard focus was so leaving the museum puts it back. */
export const enterMuseum = (room: MuseumRoom = 'vestibule') => {
  if (useJazz.getState().station !== 'museum') returnFocus = document.activeElement as HTMLElement | null
  void museum.enter(room)
}

export function MuseumUI() {
  const inside = useJazz((s) => s.museumInside)
  const room = useJazz((s) => s.museumRoom)
  const world = useJazz((s) => s.museumWorld)
  const tor = useJazz((s) => s.museumToronto)
  const set = useJazz((s) => s.set)
  const exId = useJazz((s) => s.museumExhibit)
  const inst = useJazz((s) => s.instrument)
  const space = spaceOf(room, exId)
  const ex = room === 'exhibit' ? exhibitById.get(exId ?? '') : undefined
  const head = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (inside) head.current?.focus({ preventScroll: true })
    else if (returnFocus) { returnFocus.focus({ preventScroll: true }); returnFocus = null }
  }, [inside])
  const wing = space === 'vestibule' ? null : space // exhibit views belong to their wing
  const wc = WORLD.find((c) => c.id === world)
  const tc = CHAPTERS.find((c) => c.id === tor)
  // the map link follows the exhibit in view (else the chapter last chosen in the wing)
  const linkCh = (ex?.room === 'toronto' && ex.chapter ? CHAPTERS.find((c) => c.id === ex.chapter) : undefined) ?? (ex ? undefined : tc)
  const tf = FIGURES.find((f) => f.id === tor)
  // placard reading view: page through the wing's entries (the contents page is "no entry chosen")
  const readWing: Wing | null = room === 'world-read' ? 'world' : room === 'toronto-read' ? 'toronto' : null
  const readId = readWing === 'world' ? world : readWing === 'toronto' ? tor : null
  const readList = readWing ? placardEntries(readWing) : []
  const readIdx = readList.findIndex((e) => e.id === readId)
  return (
    <>
      <MuseumFade />
      {inside && <ExhibitCard />}
      {inside && <MuseumExplore />}
      {inside && <PlacardCard />}
      {inside && (
        <section className="museum-ui" aria-label="Museum">
          <div className="museum-ui__bar">
            <button className="museum-ui__back" onClick={() => void museum.back()}>
              ← {room === 'vestibule' || room === 'door' ? 'Listening room' : room === 'explore' ? 'Guided tour' : room.endsWith('read') ? 'Step back'
                : room === 'exhibit' ? SPACE_LABEL[space] : 'Vestibule'}
            </button>
            <h2 className="museum-ui__where" ref={head} tabIndex={-1}>{ex ? ex.title ?? SPACE_LABEL[space]
              : room === 'instrument' ? `${instrumentById.get(inst as never)?.player ?? ''} · ${instrumentById.get(inst as never)?.title ?? ''}` : ROOM_LABEL[room]}</h2>
            {ex && (
              <div className="museum-ui__wings">
                <button onClick={() => void museum.step(-1)} aria-label="Previous exhibit">← Previous</button>
                <span className="museum-ui__count" aria-label="Exhibit position">{EXHIBITS.indexOf(ex) + 1} / {EXHIBITS.length}</span>
                <button onClick={() => void museum.step(1)} aria-label="Next exhibit">Next →</button>
              </div>
            )}
            {readWing && (
              <div className="museum-ui__wings">
                <button onClick={() => selectEntry(readWing, stepEntry(readWing, readId, -1))} aria-label="Previous entry">← Previous</button>
                <span className="museum-ui__count" aria-label="Entry position">
                  {readIdx < 0 ? 'Contents' : `${readIdx + 1} / ${readList.length}`}</span>
                <button onClick={() => selectEntry(readWing, stepEntry(readWing, readId, 1))} aria-label="Next entry">Next →</button>
                {readIdx >= 0 && <button onClick={() => selectEntry(readWing, null)}>Contents</button>}
              </div>
            )}
            {room !== 'explore' && room !== 'door' && (
              <button className="museum-ui__explore" onClick={() => museum.explore(true)}>Explore freely</button>
            )}
            {room === 'vestibule' && (
              <div className="museum-ui__wings">
                <button onClick={() => void museum.go('world')}>World Jazz History →</button>
                <button onClick={() => void museum.go('toronto')}>Toronto Jazz Legacy →</button>
              </div>
            )}
            {(room === 'vestibule' || room === 'world' || room === 'toronto') && (
              <button onClick={() => void museum.view(EXHIBITS.find((e) => e.room === space)!.id)}>Walk the pictures →</button>
            )}
            {wing && room !== 'exhibit' && !room.endsWith('read') && (
              <button className="museum-ui__read" onClick={() => void museum.go(`${wing}-read` as MuseumRoom)}>Read placard</button>
            )}
            {wing === 'toronto' && linkCh?.venueId && (
              <button onClick={() => void museum.exit(() => { actions.goStation('map'); set({ selectedVenue: linkCh.venueId! }) })}>
                {linkCh.title.replace(/^The /, '').split(' opens')[0]} on the Jazz Map →</button>
            )}
          </div>
          {/* accessible mirror of the exhibits (visually hidden; the 3D placards show the same text) */}
          <div className="sr-only">
            {space === 'vestibule' && (
              <>
                <h3>Legendary instruments</h3>
                <ul>{[...instrumentById.values()].filter((i) => i.where === 'museum').map((i) => (
                  <li key={i.id}><button onClick={() => void museum.viewInstrument(i.id)}>{i.player} — {i.title}</button></li>
                ))}</ul>
              </>
            )}
            {space !== 'toronto' && (
              <button onClick={() => void museum.sit(space === 'world' ? 'world' : 'vestibule')}>
                {space === 'world' ? 'Sit on the bench before the world map' : 'Sit on the velvet bench'}
              </button>
            )}
            <h3>On the walls — {SPACE_LABEL[space]}</h3>
            <ul>
              {EXHIBITS.filter((e) => e.room === space).map((e) => (
                <li key={e.id}><button aria-pressed={exId === e.id && room === 'exhibit'} onClick={() => void museum.view(e.id)}>
                  {e.title ?? e.caption}</button></li>
              ))}
            </ul>
            {ex && (
              <article aria-live="polite">
                <h4>{ex.title ?? ex.caption}</h4>
                {ex.body?.map((b, i) => <p key={i}>{b}</p>)}
              </article>
            )}
            {wing === 'world' && (
              <>
                <h3>World Jazz History — timeline 1917 to 1964</h3>
                <ul>
                  {WORLD.map((c) => (
                    <li key={c.id}><button aria-pressed={world === c.id} onClick={() => set({ museumWorld: c.id })}>
                      {c.year} · {c.title} · {c.location.city}</button></li>
                  ))}
                </ul>
                {wc && (
                  <article aria-live="polite">
                    <h4>{wc.title}</h4>
                    <p>{wc.date} · {wc.location.city} · {wc.movement}</p>
                    <p>{wc.artists.join(', ')}</p>
                    {wc.body.map((b, i) => <p key={i}>{b}</p>)}
                    <p>{wc.recording ? `${wc.recording}. ` : ''}{wc.rights}.</p>
                    <ul>{wc.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></li>)}</ul>
                  </article>
                )}
              </>
            )}
            {wing === 'toronto' && (
              <>
                <h3>Toronto Jazz Legacy — venues and people</h3>
                <ul>
                  {CHAPTERS.map((c) => (
                    <li key={c.id}><button aria-pressed={tor === c.id} onClick={() => set({ museumToronto: c.id })}>{c.era} · {c.title}</button></li>
                  ))}
                  {FIGURES.map((f) => (
                    <li key={f.id}><button aria-pressed={tor === f.id} onClick={() => set({ museumToronto: f.id })}>{f.name}</button></li>
                  ))}
                </ul>
                {(tc || tf) && (
                  <article aria-live="polite">
                    <h4>{tc?.title ?? tf?.name}</h4>
                    {tc && <p>{tc.era} · {tc.artists.join(', ')}</p>}
                    {tf && <p>{tf.life} · {tf.role}. {tf.toronto}</p>}
                    {(tc?.body ?? tf?.bio ?? []).map((b, i) => <p key={i}>{b}</p>)}
                    <ul>{(tc?.sources ?? tf?.sources ?? []).map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></li>)}</ul>
                  </article>
                )}
              </>
            )}
          </div>
        </section>
      )}
    </>
  )
}
