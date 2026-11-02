// The record cabinet, exercised end to end: hover / click every sleeve, both crates, an empty crate, the display
// sleeve ("up next"), the caption card and the floating caption. Prints what each step shows; shots to OUT.
//   node scripts/cabinet-probe.mjs [out-dir]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const OUT = (process.argv[2] ?? 'D:/Jazztor/blender/renders/web/cabinet-probe') + '/'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--force_high_performance_gpu'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e.stack).slice(0, 600)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
const js = (fn, a) => page.evaluate(fn, a)
const shot = (n) => page.screenshot({ path: `${OUT}${n}.png` })
const st = () => js(() => {
  const s = window.__jazz.useJazz.getState()
  const list = window.__jazz.visibleAlbums(s.crate, s.myCrate).map((a) => a.id)
  const cap = document.querySelector('.sleevecap')
  return { station: s.station, crate: s.crate, myCrate: s.myCrate, album: s.albumId, deck: s.deck, hovered: s.hovered, list,
    caption: cap ? { text: cap.textContent, vis: cap.style.visibility, op: cap.style.opacity } : null }
})
const sleeveInfo = () => js(() => {
  const { scene } = window.__jazz
  return Array.from({ length: 8 }, (_, i) => {
    const sl = scene.getObjectByName(`JT_Cabinet_Sleeve_${String(i + 1).padStart(3, '0')}`)
    let cover = null
    sl?.traverse((o) => { if (o.isMesh) for (const m of [o.material].flat()) if (m.map?.image?.src) cover = m.map.image.src.split('/').pop() })
    return { i, visible: sl?.visible, z: +(sl?.position.z ?? 0).toFixed(3), cover }
  })
})
const displayCover = () => js(() => {
  const d = window.__jazz.scene.getObjectByName('JT_Cabinet_DisplaySleeve')
  return d?.material?.map?.image?.src?.split('/').pop() ?? null
})

await page.goto(process.env.JT_URL ?? 'http://localhost:5174/', { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 120000 })
await js(() => window.__jazz.useJazz.getState().set({ crate: 'FOR_YOU', timeSetting: 'NIGHT' }))
await js(() => window.__jazz.useJazz.getState().set({ station: 'cabinet' }))
await sleep(3500)
console.log('cabinet', JSON.stringify(await st()))
console.log('sleeves', JSON.stringify(await sleeveInfo()))
console.log('display (up next)', await displayCover())
await shot('01-cabinet')
// hover each sleeve
for (let i = 1; i <= 8; i++) {
  const p = await js((n) => window.__jazz.project(n), `COL_Sleeve_${String(i).padStart(3, '0')}`)
  if (!p) { console.log('sleeve', i, 'no collider'); continue }
  await page.mouse.move(p.x, p.y)
  await sleep(700)
  const s = await st()
  console.log('hover', i, s.hovered, JSON.stringify(s.caption), 'display', await displayCover())
  if (i === 3) await shot('02-hover-3')
}
// click sleeve 3
const p3 = await js(() => window.__jazz.project('COL_Sleeve_003'))
await page.mouse.move(p3.x, p3.y)
await page.mouse.down(); await page.mouse.up()
await sleep(4000)
console.log('after click 3', JSON.stringify(await st()), 'display', await displayCover())
await page.mouse.move(20, 450)
await sleep(1500)
await shot('03-after-click')
// my crate
await js(() => window.__jazz.useJazz.getState().set({ crate: 'MY_CRATE' }))
await sleep(1800)
console.log('my crate', JSON.stringify(await st()), JSON.stringify(await sleeveInfo()), 'display', await displayCover())
await shot('04-my-crate')
// empty crate
await js(() => window.__jazz.useJazz.getState().set({ myCrate: [] }))
await sleep(1800)
console.log('empty crate', JSON.stringify(await st()), JSON.stringify(await sleeveInfo()), 'display', await displayCover())
await shot('05-empty-crate')
// step with keyboard / console next while in empty crate
await js(() => window.__jazz.useJazz.getState().set({ crate: 'FOR_YOU', myCrate: [] }))
await sleep(1500)
console.log('errors', errors.length ? errors.join('\n') : 'none')
await browser.close()
