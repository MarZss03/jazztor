// Reading card for a legendary instrument in close-up (listening room station 'instrument', or the museum's
// 'instrument' room): whose it was, what it is, its story, where it is now, sources - and that the model is an
// interpretation, not a scan.
import { useJazz } from '../state/store'
import { instrumentById, MODEL_NOTE } from '../data/instruments'
import { EXHIBIT_CARD_PX } from './ExhibitCard'
import { actions } from '../scene/Experience'
import { museum } from '../scene/MuseumWorld'

export function InstrumentCard() {
  const station = useJazz((s) => s.station)
  const room = useJazz((s) => s.museumRoom)
  const id = useJazz((s) => s.instrument)
  const open = station === 'instrument' || (station === 'museum' && room === 'instrument')
  const inst = open && id ? instrumentById.get(id as never) : undefined
  if (!inst) return null
  const close = () => (station === 'museum' ? void museum.back() : actions.goStation('home'))
  return (
    <aside className="excard instcard" aria-label="Instrument" aria-live="polite" style={{ width: EXHIBIT_CARD_PX }} key={inst.id}>
      <button className="instcard__close" onClick={close} aria-label="Close and step back">×</button>
      <p className="excard__kicker">{inst.kicker}</p>
      <h3>{inst.title}</h3>
      <p className="excard__sub">{inst.player}</p>
      {inst.body.map((b, i) => <p key={i}>{b}</p>)}
      <p className="excard__note">{inst.status}</p>
      <p className="excard__sources">Sources: {inst.sources.map((s, i) => (
        <span key={s.url}>{i ? ', ' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>
      ))}</p>
      <p className="excard__sources">{MODEL_NOTE}</p>
    </aside>
  )
}
