// Prints a Commons file's size, licence, author, date and description (for choosing and captioning exhibits).
//   node scripts/commons-meta.mjs "File:..." "File:..."
const UA = 'JazzTor-museum/0.1 (local build of a personal project)'
const s = (x) => (x?.value ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
for (const t of process.argv.slice(2)) {
  const u = new URL('https://commons.wikimedia.org/w/api.php')
  Object.entries({ action: 'query', prop: 'imageinfo', iiprop: 'url|size|extmetadata', format: 'json', titles: t }).forEach(([k, v]) => u.searchParams.set(k, v))
  let j = null
  for (let a = 0; a < 6 && !j; a++) {
    const r = await fetch(u, { headers: { 'User-Agent': UA } })
    if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) j = await r.json()
    else await new Promise((ok) => setTimeout(ok, 4000 * (a + 1))) // rate limited: back off politely
  }
  const p = Object.values(j.query.pages)[0].imageinfo?.[0]
  if (!p) { console.log('MISSING', t); continue }
  const e = p.extmetadata
  console.log(`\n${t}\n  ${p.width}x${p.height} | ${s(e.LicenseShortName)} | ${s(e.Artist).slice(0, 90)} | ${s(e.DateTimeOriginal).slice(0, 40)}`)
  console.log(`  desc: ${s(e.ImageDescription).slice(0, 500)}`)
  console.log(`  credit: ${s(e.Credit).slice(0, 200)}`)
  await new Promise((r) => setTimeout(r, 2500))
}
