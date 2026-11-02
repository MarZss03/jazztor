// Legendary jazz instruments: five 3D models (blender/scripts/jt_instruments.py) shown as decoration you can pick up -
// two in the listening room, three on plinths in the museum vestibule. Every statement is a summary of the cited
// source (checked 2026-10-22); where sources disagree, the text leaves the point out rather than choose (Armstrong's
// and Parker's sale prices; the day Coltrane's alto was given to him). The models are interpretations made from photographs
// and concept sketches - not scans, and no maker's engraving, serial number or inscription is reproduced.
import type { Source } from './archive'

export type Instrument = {
  id: 'miles' | 'coltrane' | 'armstrong' | 'gillespie' | 'parker'
  node: string // root in JT_Instruments.glb
  where: 'room' | 'museum'
  player: string
  title: string // the instrument
  kicker: string // maker · year
  body: string[]
  /** where it is now / how it was last sold */
  status: string
  sources: Source[]
}

const CHRISTIES = (lot: string, label: string): Source => ({ label: `Christie’s: ${label}`, url: `https://www.christies.com/en/lot/lot-${lot}` })

export const INSTRUMENTS: Instrument[] = [
  {
    id: 'miles', node: 'JT_Inst_Miles', where: 'room', player: 'Miles Davis',
    title: 'The “Moon and Stars” trumpet', kicker: 'Martin Committee · custom-made, about 1980',
    body: [
      'Black lacquer, gold-plated hardware, gilt crescent moons and stars on the bell, and a custom angled Giardinelli mouthpiece engraved M. DAVIS.',
      'It is one of three “Moon and Stars” horns - red, blue and black - that the Martin designer Larry Ramirez built for Davis around 1980. Davis had stayed loyal to the Committee model since his early days.',
      'He played it at the 1984 Montreux Jazz Festival, on You’re Under Arrest (1985) and on his Grammy-winning album Aura (1989).',
    ],
    status: 'Sold at Christie’s, New York, 12 March 2026, for USD 1,651,000 (The Jim Irsay Collection: Hall of Fame).',
    sources: [CHRISTIES('6573408', 'Miles Davis: a Martin Committee trumpet')],
  },
  {
    id: 'coltrane', node: 'JT_Inst_Coltrane', where: 'room', player: 'John Coltrane',
    title: 'The 1966 Yamaha prototype alto', kicker: 'Yamaha (Nippon Gakki) · prototype, 1966',
    body: [
      'A prototype alto saxophone - brass, with pearloid key touches - from Yamaha’s first years of making wind instruments.',
      'Yamaha gave it to Coltrane in his dressing room in Shizuoka during his July 1966 tour of Japan. He played it that night and on the next dates, including a 57-minute “My Favorite Things” in Tokyo on 22 July, heard on Live in Japan (1973), whose cover shows him with this horn.',
      'By then Coltrane played tenor and soprano, but alto had been his first saxophone. He reportedly told Yamaha how to improve the design - that the D key sat too low - and kept the horn in his home studio until his death.',
    ],
    status: 'Sold by the John Coltrane Foundation in 2005; sold at Christie’s, New York, 12 March 2026, for USD 431,800.',
    sources: [CHRISTIES('6573400', 'John Coltrane: a prototype Yamaha Nippon Gakki alto saxophone')],
  },
  {
    id: 'armstrong', node: 'JT_Inst_Armstrong', where: 'museum', player: 'Louis Armstrong',
    title: 'The 1948 Selmer trumpet', kicker: 'Henri Selmer, Paris · Model 19 Balanced Action, 1948',
    body: [
      'A medium-bore Selmer Balanced Action trumpet made in Paris in 1948, its gold plate worn where the hands rested.',
      'Armstrong inscribed it and gave it, dated 7/10/53, to Duke Donin, the son of friends he had met in Los Angeles in the 1930s. Christie’s noted that only a handful of Armstrong trumpets were ever inscribed, and believed he likely played this one on The California Concerts (1951).',
    ],
    status: 'Offered at Christie’s Exceptional Sale, New York, 14 October 2020.',
    sources: [
      CHRISTIES('6281282', 'The 1948 Louis “Satchmo” Armstrong trumpet'),
      { label: 'Rolling Stone: Louis Armstrong’s 1948-made trumpet heads to auction', url: 'https://www.rollingstone.com/music/music-news/louis-armstrong-trumpet-auction-christies-1061269/' },
    ],
  },
  {
    id: 'gillespie', node: 'JT_Inst_Gillespie', where: 'museum', player: 'Dizzy Gillespie',
    title: 'The bent “Silver Flair” trumpet', kicker: 'King Musical Instruments, Eastlake, Ohio · 1977',
    body: [
      'A silver-plated King B-flat trumpet with the upturned bell that became Gillespie’s trademark around the world.',
      'By his own account, the bend began in 1953, when a performer stumbled into his horn during a party for his wife, Lorraine; he went on to have trumpets built with the bell turned up.',
      'He played this one from the late 1970s into the early 1980s. Dizzy Gillespie played Massey Hall in Toronto in 1953, the same year his bell was first bent.',
    ],
    status: 'Smithsonian National Museum of American History, gift of Lorraine Gillespie (1986.0003.01).',
    sources: [
      { label: 'Smithsonian NMAH: King B-flat trumpet, used by Dizzy Gillespie', url: 'https://americanhistory.si.edu/collections/object/nmah_606128' },
      { label: 'Smithsonian Magazine: Dizzy Gillespie and his bent trumpet', url: 'https://www.smithsonianmag.com/smithsonian-institution/dizzy-gillespie-and-his-bent-trumpet-114626062/' },
    ],
  },
  {
    id: 'parker', node: 'JT_Inst_Parker', where: 'museum', player: 'Charlie Parker',
    title: 'The plastic Grafton alto', kicker: 'Grafton, London · acrylic alto saxophone, 1950s',
    body: [
      'An alto saxophone with an injection-moulded acrylic body and metal keys, designed by Ettore Sommaruga in London and made from 1950 for about a decade.',
      'Parker played a Grafton at Jazz at Massey Hall in Toronto on 15 May 1953, with Dizzy Gillespie, Bud Powell, Charles Mingus and Max Roach; his own horn was in pawn, and he was billed as “Charlie Chan” for contractual reasons.',
    ],
    status: 'A Grafton that Parker used (serial 10265) was sold at Christie’s, London, in September 1994 to the American Jazz Museum in Kansas City, his home town, where it is on display.',
    sources: [
      { label: 'Wikipedia: Grafton saxophone', url: 'https://en.wikipedia.org/wiki/Grafton_saxophone' },
      { label: 'Smithsonian Magazine: The long journey of Charlie Parker’s saxophone', url: 'https://www.smithsonianmag.com/smithsonian-institution/long-journey-charlie-parker-saxophone-180973393/' },
      { label: 'American Jazz Museum: Saxophone Supreme', url: 'https://americanjazzmuseum.org/exhibits-events/saxophone-supreme/' },
    ],
  },
]
export const instrumentById = new Map(INSTRUMENTS.map((i) => [i.id, i]))
export const MODEL_NOTE = 'A 3D interpretation made from photographs - not a scan of the instrument.'
