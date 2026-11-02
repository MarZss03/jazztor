// Search Wikimedia Commons for museum images and list candidates with their licence (read from the file's
// extmetadata, not guessed). Only Public domain / CC0 / CC BY are acceptable for JazzTor (no SA / NC / ND).
//   node scripts/find-museum-images.mjs "query one" "query two" ...
const API = 'https://commons.wikimedia.org/w/api.php'
const UA = 'JazzTor-museum/0.1 (local research build; contact via project owner)'
const ok = (lic) => /^(public domain|pd|cc0|cc by \d|cc-by-\d|cc by-\d)/i.test(lic) && !/sa|nc|nd/i.test(lic.replace(/^cc by/i, ''))

for (const q of process.argv.slice(2)) {
  const u = new URL(API)
  Object.entries({ action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrlimit: '12', gsrsearch: q,
    prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiextmetadatafilter: 'LicenseShortName|Artist|DateTimeOriginal|ImageDescription' })
    .forEach(([k, v]) => u.searchParams.set(k, v))
  let r = {}
  for (let a = 0; a < 4; a++) {
    const res = await fetch(u, { headers: { 'User-Agent': UA } })
    if (res.ok) { r = await res.json(); break }
    await new Promise((ok) => setTimeout(ok, 2000 * (a + 1))) // rate limited: back off politely
  }
  await new Promise((ok) => setTimeout(ok, 600))
  console.log(`\n## ${q}`)
  for (const p of Object.values(r.query?.pages ?? {}).sort((a, b) => a.index - b.index)) {
    const ii = p.imageinfo?.[0]
    if (!ii) continue
    const md = ii.extmetadata ?? {}
    const lic = md.LicenseShortName?.value ?? '?'
    const strip = (h) => (h ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    console.log(`${ok(lic) ? 'OK ' : 'no '} ${String(ii.width).padStart(5)}x${String(ii.height).padEnd(5)} ${lic.padEnd(22)} ${p.title}  | ${strip(md.Artist?.value).slice(0, 50)} | ${strip(md.DateTimeOriginal?.value).slice(0, 20)}`)
  }
}
