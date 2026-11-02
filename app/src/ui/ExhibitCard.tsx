// Reading card for the exhibit in front of the camera: the full wall text in crisp type beside the 3D picture
// (title, date and place, the history, what the picture shows, maker, licence and source links).
import { useEffect, useState } from 'react'
import { useJazz } from '../state/store'
import { exhibitById, wallText, type ImageCredit } from '../data/exhibits'

export const EXHIBIT_CARD_PX = 380
let creditsP: Promise<Record<string, ImageCredit>> | null = null
const loadCredits = () => (creditsP ??= fetch('/data/museum-images.json').then((r) => r.json()))

export function ExhibitCard() {
  const room = useJazz((s) => s.museumRoom)
  const id = useJazz((s) => s.museumExhibit)
  const [credits, setCredits] = useState<Record<string, ImageCredit>>({})
  useEffect(() => { void loadCredits().then(setCredits) }, [])
  if (room !== 'exhibit' || !id) return null
  const ex = exhibitById.get(id)
  const t = wallText(id)
  if (!ex || !t) return null
  const c = credits[id]
  return (
    <aside className="excard" aria-label="Wall text" aria-live="polite" style={{ width: EXHIBIT_CARD_PX }} key={id}>
      {t.kicker && <p className="excard__kicker">{t.kicker}</p>}
      <h3>{t.title}</h3>
      {t.sub && <p className="excard__sub">{t.sub}</p>}
      {t.people && <p className="excard__people">{t.people}</p>}
      {t.body.map((b, i) => <p key={i}>{b}</p>)}
      {t.note && <p className="excard__note">{t.note}</p>}
      {(t.caption || c) && (
        <figure className="excard__credit">
          {t.caption && <figcaption>{t.caption}</figcaption>}
          {c && (
            <p>
              {c.author || 'Unknown author'} · {c.licenceUrl ? <a href={c.licenceUrl} target="_blank" rel="noreferrer">{c.licence}</a> : c.licence}
              {' · '}<a href={c.page} target="_blank" rel="noreferrer">Wikimedia Commons</a>
            </p>
          )}
        </figure>
      )}
      {t.sources.length > 0 && (
        <p className="excard__sources">Sources: {t.sources.map((s, i) => (
          <span key={s.url}>{i ? ', ' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.label.replace(/^Wikipedia: /, '')}</a></span>
        ))} (Wikipedia)</p>
      )}
    </aside>
  )
}
