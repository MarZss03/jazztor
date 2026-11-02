// Reading card for a lectern placard: the wing's contents (each entry opens on the placard), or the chosen entry's
// full text with its sources - the same text the 3D placard carries, in crisp type beside it.
import { useJazz } from '../state/store'
import { placardEntries, placardText, WING_INTRO, WING_TITLE, type Wing } from '../data/placards'
import { EXHIBIT_CARD_PX } from './ExhibitCard'

export const placardSelection = (wing: Wing) => (s: ReturnType<typeof useJazz.getState>) => wing === 'world' ? s.museumWorld : s.museumToronto
export const selectEntry = (wing: Wing, id: string | null) =>
  useJazz.getState().set(wing === 'world' ? { museumWorld: id } : { museumToronto: id })

export function PlacardCard() {
  const room = useJazz((s) => s.museumRoom)
  const wing: Wing | null = room === 'world-read' ? 'world' : room === 'toronto-read' ? 'toronto' : null
  const id = useJazz((s) => (wing ? placardSelection(wing)(s) : null))
  if (!wing) return null
  const t = placardText(wing, id)
  const list = placardEntries(wing)
  return (
    <aside className="excard plcard" aria-label="Placard" aria-live="polite" style={{ width: EXHIBIT_CARD_PX }} key={`${wing}:${id ?? ''}`}>
      {!t ? (
        <>
          <p className="excard__kicker">{WING_TITLE[wing]} · guide to the room</p>
          <h3>In this room</h3>
          <p className="excard__sub">{WING_INTRO[wing]}</p>
          <ol className="plcard__list">
            {list.map((e, i) => (
              <li key={e.id}>
                {(i === 0 || e.group !== list[i - 1].group) && wing === 'toronto' && <span className="plcard__group">{e.group}</span>}
                <button onClick={() => selectEntry(wing, e.id)}>
                  <span className="plcard__year">{e.year}</span>{e.title}
                </button>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <>
          <p className="excard__kicker">{t.kicker}</p>
          <h3>{t.title}</h3>
          {t.sub && <p className="excard__sub">{t.sub}</p>}
          {t.people && <p className="excard__people">{t.people}</p>}
          {t.body.map((b, i) => <p key={i}>{b}</p>)}
          {t.foot && <p className="excard__note">{t.foot}</p>}
          {t.note && <p className="excard__note">{t.note}</p>}
          {t.sources.length > 0 && (
            <p className="excard__sources">Sources: {t.sources.map((s, i) => (
              <span key={s.url}>{i ? ', ' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.label.replace(/^Wikipedia: /, '')}</a></span>
            ))} (Wikipedia)</p>
          )}
        </>
      )}
    </aside>
  )
}
