// Credits (CC attribution: title, author, source, licence) for every record in the catalogue and every picture in the
// museum (the photographs, posters and the painting - their licences come from each file's own Commons record).
import { useEffect, useRef, useState } from 'react'
import { ALBUMS } from '../data/albums'
import type { ImageCredit } from '../data/exhibits'

let picturesP: Promise<Record<string, ImageCredit>> | null = null
const loadPictures = () => (picturesP ??= fetch('/data/museum-images.json').then((r) => r.json()))

export function Credits() {
  const [open, setOpen] = useState(false)
  const [pictures, setPictures] = useState<Record<string, ImageCredit>>({})
  useEffect(() => { if (open) void loadPictures().then(setPictures).catch(() => {}) }, [open])
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <>
      <button className="credits-link" onClick={() => setOpen(true)}>CREDITS</button>
      <dialog ref={dialog} className="credits" aria-labelledby="credits-title" onClose={() => setOpen(false)}
        onClick={(e) => e.target === dialog.current && setOpen(false)}>
        <div className="credits__sheet">
          <h2 id="credits-title">Music in this room</h2>
          <p className="credits__lede">
            Every recording is used under the licence shown, checked track by track on the Free Music Archive.
            Album artwork is the artists&rsquo; own release art, except sleeves marked as a JazzTor design.
          </p>
          {ALBUMS.map((a) => (
            <section key={a.id} className="credits__record">
              <img src={a.cover} alt="" width={72} height={72} />
              <div>
                <h3>{a.title}</h3>
                <p>
                  <a href={a.artistUrl} target="_blank" rel="noreferrer">{a.artist}</a>
                  {' · '}
                  <a href={a.licenceUrl} target="_blank" rel="noreferrer">{a.licence}</a>
                  {a.attributionRequired ? ' · attribution required' : ' · public domain dedication'}
                </p>
                {a.coverCredit && <p className="credits__note">{a.coverCredit}</p>}
                <ol>
                  {a.tracks.map((t) => (
                    <li key={t.id}>
                      <a href={t.sourceUrl ?? a.sourceUrl} target="_blank" rel="noreferrer">&ldquo;{t.title}&rdquo;</a>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          ))}
          <h2 className="credits__h2">Pictures in the museum</h2>
          <p className="credits__lede">
            Photographs, posters and the painting on the walls, each under the licence shown on its Wikimedia Commons or
            Standard Ebooks page. The 3D instruments are JazzTor interpretations made from photographs.
          </p>
          <ul className="credits__pictures">
            {Object.entries(pictures).map(([id, p]) => (
              <li key={id}>
                <a href={p.page} target="_blank" rel="noreferrer">{p.title.replace(/\.(jpe?g|png|tiff?)$/i, '')}</a>
                {' · '}{p.author || 'Unknown author'}{' · '}
                {p.licenceUrl ? <a href={p.licenceUrl} target="_blank" rel="noreferrer">{p.licence}</a> : p.licence}
              </li>
            ))}
          </ul>
          <h2 className="credits__h2">The listening room</h2>
          <p className="credits__lede">
            The view of Toronto from the window and the walnut, brass and marble surfaces are AI-generated images
            (ChatGPT), made by the JazzTor project owner &mdash; not photographs. The 3D models are original JazzTor work.
          </p>
          <p className="credits__lede">Map data &copy; OpenStreetMap contributors (ODbL).</p>
          <button className="credits__close" onClick={() => setOpen(false)}>CLOSE</button>
        </div>
      </dialog>
    </>
  )
}
