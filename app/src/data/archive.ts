// Museum chapters and Toronto Jazz Legacy figures. Every statement is drawn from the cited sources (checked
// 2026-10-20); where sources disagree, the text says so instead of choosing. Wording is our own summary.
// Portraits: none are licensed yet - the archive frame shows a placeholder until rights-cleared photographs exist.

export type Source = { label: string; url: string }
export type Chapter = {
  id: string
  year: number
  era: string
  title: string
  artists: string[]
  body: string[]
  venueId?: string // links to the Jazz Map
  sources: Source[]
}
export type Figure = {
  id: string
  name: string
  life: string
  role: string
  toronto: string
  bio: string[]
  works: string[]
  related: { people: string[]; venues: string[] }
  sources: Source[]
}

const WP = (page: string, label = 'Wikipedia'): Source => ({ label: `${label}: ${decodeURIComponent(page).replace(/_/g, ' ')}`, url: `https://en.wikipedia.org/wiki/${page}` })

export const CHAPTERS: Chapter[] = [
  {
    id: 'town-tavern', year: 1949, era: '1949 – early 1970s', title: 'The Town Tavern opens on Queen Street',
    artists: ['Oscar Peterson', 'Herb Ellis', 'Ray Brown', 'Archie Alleyne'], venueId: 'towntavern',
    body: [
      'Sam Berger opened the Town Tavern at 16 Queen Street East in 1949 as a theatre restaurant with live entertainment. In 1955 Oscar Peterson encouraged him to turn it into a jazz room, and it became one of the city’s leading jazz venues.',
      'Peterson’s trio with Herb Ellis and Ray Brown recorded a live album there for Verve in July 1958. Archie Alleyne was the house drummer from 1955 to 1966. Sources differ on whether the club closed in 1971 or 1972; an office tower at 2 Queen Street East now stands on the site.',
    ],
    sources: [WP('Town_Tavern'), { label: 'Heritage Toronto: Town Tavern', url: 'https://www.heritagetoronto.org/explore/music-city/town-tavern-saphire/' }],
  },
  {
    id: 'massey-1953', year: 1953, era: '15 May 1953', title: 'Jazz at Massey Hall',
    artists: ['Dizzy Gillespie', 'Charlie Parker', 'Bud Powell', 'Charles Mingus', 'Max Roach'], venueId: 'massey',
    body: [
      'Presented by the Toronto New Jazz Society, the concert brought together Gillespie, Parker, Powell, Mingus and Roach — the only time all five recorded as a group, and the last recorded meeting of Parker and Gillespie. Parker was billed as “Charlie Chan” for contractual reasons.',
      'A heavyweight title fight on the same night kept the audience small, and the Society could not pay the musicians’ fees. The recording came out in December 1953 on Mingus’s Debut label and entered the Grammy Hall of Fame in 1995.',
    ],
    sources: [WP('Jazz_at_Massey_Hall')],
  },
  {
    id: 'colonial', year: 1955, era: '1950s – late 1970s', title: 'The Colonial Tavern on Yonge Street',
    artists: ['Cy McLean', 'Miles Davis', 'Thelonious Monk', 'Carmen McRae', 'Art Blakey'], venueId: 'colonial',
    body: [
      'At 201–203 Yonge Street, the Colonial was among the best-known jazz rooms in Canada from the 1950s until it closed in the late 1970s. Its first band was led by pianist Cy McLean, and the long list of visiting artists includes Miles Davis, Thelonious Monk, Carmen McRae, Art Blakey and Oscar Peterson.',
      'The site is now an empty lot; a brass plate in the nearby park commemorates the building and the musicians who played there.',
    ],
    sources: [WP('Colonial_Tavern')],
  },
  {
    id: 'georges', year: 1956, era: '1956 – 1980s/90s', title: 'George’s Spaghetti House',
    artists: ['Moe Koffman', 'Ed Bickert', 'Rob McConnell', 'Don Thompson'], venueId: 'georges',
    body: [
      'Doug Cole bought the restaurant at Dundas and Sherbourne in 1956, kept its name, and began presenting jazz — on weekends at first, then six nights a week from 5 September 1960. Moe Koffman booked the music and played there weekly.',
      'The club moved to a second-floor room in 1984. Sources give different end dates (the mid-1980s, 1990 for Koffman’s regular bands, or 1994), so the closing year is left open here.',
    ],
    sources: [WP('George%27s_Spaghetti_House'), { label: 'The Canadian Encyclopedia: George’s Jazz Room', url: 'https://thecanadianencyclopedia.ca/en/article/georges-jazz-room-emc' }, WP('Moe_Koffman')],
  },
  {
    id: 'shepherd', year: 1957, era: '1957', title: '“Swinging Shepherd Blues”',
    artists: ['Moe Koffman'],
    body: [
      'Toronto saxophonist and flautist Moe Koffman recorded “Swinging Shepherd Blues” in 1957. It reached No. 4 on Toronto’s CHUM chart, No. 38 on the US Billboard pop chart and No. 23 in the UK — a rare international hit for a Canadian jazz instrumental.',
    ],
    sources: [WP('Moe_Koffman')],
  },
  {
    id: 'school', year: 1960, era: '1960s', title: 'Oscar Peterson’s school in Toronto',
    artists: ['Oscar Peterson'],
    body: [
      'In the 1960s Oscar Peterson started and led the Advanced School of Contemporary Music in Toronto for about five years. It closed when touring called him and his colleagues away and government funding did not come.',
    ],
    sources: [WP('Oscar_Peterson')],
  },
  {
    id: 'boss-brass', year: 1968, era: '1968 – 1993', title: 'Rob McConnell and the Boss Brass',
    artists: ['Rob McConnell'],
    body: [
      'Valve trombonist Rob McConnell assembled the Boss Brass from Toronto studio musicians in 1968. The band won the 1984 Grammy for Best Jazz Instrumental Performance, Big Band, for “All in Good Time”, and several Juno Awards for Best Jazz Album.',
    ],
    sources: [WP('Rob_McConnell')],
  },
  {
    id: 'rex', year: 1981, era: '1981 – today', title: 'The Rex makes jazz nightly',
    artists: [], venueId: 'rex',
    body: [
      'The Ross family has owned the Rex on Queen Street West since the early 1950s. Music arrived around 1980 and jazz programming soon followed; the club grew to two shows a night, seven nights a week, and describes itself as Toronto’s longest-running jazz club.',
    ],
    sources: [{ label: 'The Rex: History', url: 'https://www.therex.ca/history' }, { label: 'blogTO: A brief history of the Rex Hotel', url: 'https://www.blogto.com/music/2014/08/a_brief_history_of_the_rex_hotel' }],
  },
  {
    id: 'festival', year: 1987, era: '1987 – today', title: 'The Toronto Jazz Festival',
    artists: ['Jim Galloway'],
    body: [
      'Patrick Taylor and Jim Galloway co-founded the festival in 1987. Centred on Nathan Phillips Square with more than 40 other locations, it now runs for ten days around late June and early July.',
    ],
    sources: [WP('TD_Toronto_Jazz_Festival')],
  },
]

export const FIGURES: Figure[] = [
  {
    id: 'koffman', name: 'Moe Koffman', life: '1928 – 2001', role: 'Saxophone · flute · bandleader',
    toronto: 'Born in Toronto; booked and played George’s Spaghetti House from 1956.',
    bio: [
      'Born Morris Koffman in Toronto on 28 December 1928, he became known on saxophone and flute, including bass flute and circular breathing.',
      'His 1957 recording “Swinging Shepherd Blues” charted in Canada, the United States and the United Kingdom. For decades he booked the music at George’s Spaghetti House and played there weekly. He was appointed to the Order of Canada in 1993 and inducted into the Canadian Music Hall of Fame in 1997, and died in Orangeville, Ontario, on 28 March 2001.',
    ],
    works: ['“Swinging Shepherd Blues” (1957)'],
    related: { people: ['mcconnell'], venues: ['georges'] },
    sources: [WP('Moe_Koffman'), WP('George%27s_Spaghetti_House')],
  },
  {
    id: 'alleyne', name: 'Archie Alleyne', life: '1933 – 2015', role: 'Drums · bandleader',
    toronto: 'Grew up in Kensington Market; house drummer at the Town Tavern, 1955–1966.',
    bio: [
      'Born in Toronto on 7 January 1933, Archie Alleyne grew up in Kensington Market and became the Town Tavern’s house drummer from 1955 to 1966, also playing the Colonial Tavern. He accompanied Billie Holiday, Lester Young, Stan Getz, Coleman Hawkins and Ben Webster, and is remembered for breaking colour barriers in Toronto clubs.',
      'In 2000 he formed the hard-bop group Kollage with Doug Richardson, and in 2003 he founded a scholarship fund for music students. He was appointed to the Order of Canada in 2011 and died on 8 June 2015.',
    ],
    works: ['Kollage (from 2000)', 'Recordings with Oliver Jones, Cy McLean and Brian Browne'],
    related: { people: ['peterson'], venues: ['towntavern', 'colonial'] },
    sources: [WP('Archie_Alleyne'), WP('Town_Tavern')],
  },
  {
    id: 'mcconnell', name: 'Rob McConnell', life: '1935 – 2010', role: 'Valve trombone · arranger · bandleader',
    toronto: 'Built the Boss Brass from Toronto studio musicians in 1968.',
    bio: [
      'Born in London, Ontario, on 14 February 1935, Rob McConnell took up the valve trombone and in 1968 assembled the Boss Brass, a big band of Toronto studio players.',
      'The band’s “All in Good Time” won the 1984 Grammy for Best Jazz Instrumental Performance, Big Band; McConnell won further Grammys for arranging in 1993 and 1996, and several Junos. He died in Toronto on 1 May 2010.',
    ],
    works: ['All in Good Time (1984 Grammy)', 'Big Band Jazz (1978 Juno)', 'Present Perfect (1981 Juno)', 'Rob McConnell Tentet (2001 Juno)'],
    related: { people: ['koffman'], venues: ['georges'] },
    sources: [WP('Rob_McConnell')],
  },
  {
    id: 'peterson', name: 'Oscar Peterson', life: '1925 – 2007', role: 'Piano · composer · educator',
    toronto: 'Steered the Town Tavern toward jazz, recorded there in 1958, and led a music school in Toronto.',
    bio: [
      'Born in Montreal on 15 August 1925, Oscar Peterson is tied to Toronto through its clubs and classrooms. He encouraged the Town Tavern to become a jazz room in 1955, and in July 1958 his trio with Herb Ellis and Ray Brown recorded a live album there for Verve.',
      'In the 1960s he started and led the Advanced School of Contemporary Music in Toronto for about five years. He died at his home in Mississauga, Ontario, on 23 December 2007.',
    ],
    works: ['Live trio album recorded at the Town Tavern (Verve, 1958)'],
    related: { people: ['alleyne'], venues: ['towntavern', 'colonial'] },
    sources: [WP('Oscar_Peterson'), WP('Town_Tavern')],
  },
]
