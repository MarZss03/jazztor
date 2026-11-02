// Cabinet with more records than sleeves: shelves page by 8, the shelf follows the record on the deck, every record
// on a shelf can be put on the deck from its thumbnail. Shots to OUT.
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const OUT = (process.argv[2] ?? 'D:/Jazztor/blender/renders/web/cabinet-shelves') + '/'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--force_high_performance_gpu'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e.stack).slice(0, 600)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
const js = (fn, a) => page.evaluate(fn, a)
const st = () => js(() => {
  const s = window.__jazz.useJazz.getState()
  return { page: s.cabinetPage, album: s.albumId, deck: s.deck, shelf: window.__jazz.shelfAlbums(s).map((a) => a.id),
    bar: document.querySelector('.shelfbar')?.textContent, thumbs: document.querySelectorAll('.shelfthumb').length }
})
await page.goto(process.env.JT_URL ?? 'http://localhost:5174/', { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 120000 })
await js(() => window.__jazz.useJazz.getState().set({ crate: 'FOR_YOU', timeSetting: 'NIGHT' }))
await page.keyboard.press('b')
await sleep(3500)
console.log('shelf 1', JSON.stringify(await st()))
await page.screenshot({ path: `${OUT}01-shelf1.png` })
await page.keyboard.press('ArrowRight')
await sleep(1500)
const s2 = await st()
console.log('shelf 2', JSON.stringify(s2))
await page.screenshot({ path: `${OUT}02-shelf2.png` })
// put the last record of shelf 2 on the deck from its thumbnail
await page.locator('.shelfthumb').last().click()
await page.waitForFunction(() => window.__jazz.useJazz.getState().deck === 'playing', null, { timeout: 30000 }).catch(() => {})
await sleep(1500)
const s3 = await st()
console.log('after thumb', JSON.stringify(s3), 'expected', s2.shelf.at(-1))
await page.screenshot({ path: `${OUT}03-playing-from-shelf2.png` })
// leave and come back: the cabinet opens on the shelf holding the record on the deck
await page.keyboard.press('Escape')
await sleep(2500)
await js(() => window.__jazz.useJazz.getState().set({ cabinetPage: 0 }))
await page.keyboard.press('b')
await sleep(3000)
console.log('reopened', JSON.stringify(await st()))
// next record past the end of shelf 2 wraps to shelf 1
await page.keyboard.press('Shift+ArrowRight')
await sleep(2500)
console.log('next record', JSON.stringify(await st()))
console.log('errors', errors.length ? errors.join('\n') : 'none')
await browser.close()
