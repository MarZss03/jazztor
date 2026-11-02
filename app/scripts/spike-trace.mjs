// What happens in the long frames? Logs per-frame texture uploads (with size) next to each long frame.
//   node scripts/spike-trace.mjs [museum|home|map]   (integrated GPU unless DGPU=1)
import { chromium } from 'playwright-core'

const WHERE = process.argv[2] ?? 'museum'
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', ...(process.env.DGPU ? ['--force_high_performance_gpu'] : [])] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.addInitScript(() => {
  window.__ev = []
  for (const name of ['texImage2D', 'texSubImage2D', 'compressedTexSubImage2D', 'compressedTexImage2D']) {
    const orig = WebGL2RenderingContext.prototype[name]
    WebGL2RenderingContext.prototype[name] = function (...args) {
      const t = performance.now()
      const r = orig.apply(this, args)
      const src = args.find((a) => a && typeof a === 'object' && 'width' in a)
      window.__ev.push(['up', Math.round(t), name, Math.round(performance.now() - t), src ? `${src.constructor?.name} ${src.width}x${src.height}` : `${args[3]}x${args[4]}`])
      return r
    }
  }
})
await page.goto(process.env.JT_URL ?? 'http://localhost:5174/', { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 180000 })
await page.waitForTimeout(22000)
if (!process.env.FULLMOTION) await page.evaluate(() => window.__jazz.useJazz.getState().set({ reducedMotion: true }))
if (process.env.MUSIC) { await page.mouse.click(800, 400); await page.evaluate(() => window.__jazz.deck.toggle(true)); await page.waitForTimeout(3000) }
if (WHERE === 'museum') {
  await page.getByRole('button', { name: 'MUSEUM', exact: true }).click()
  await page.waitForFunction(() => window.__jazz.useJazz.getState().station === 'museum' && !window.__jazz.museumState.busy, null, { timeout: 120000 })
  if (process.env.SETTLE !== '0') { await page.evaluate(() => window.__jazz.museum.go('world')); await page.waitForTimeout(3000) }
  else { await page.evaluate(() => window.__jazz.museum.go('world')); await page.waitForFunction(() => !window.__jazz.museumState.busy) }
} else if (WHERE === 'map') await page.evaluate(() => window.__jazz.useJazz.getState().set({ station: 'map' }))
const out = await page.evaluate(() => new Promise((done) => {
  window.__ev = []
  const rows = []
  let last = 0
  const f = (t) => {
    if (last) {
      const dt = t - last
      const ups = window.__ev.filter((e) => e[0] === 'up')
      if (dt > 45) rows.push([Math.round(t), Math.round(dt), ups.map((u) => `${u[2]} ${u[4]} ${u[3]}ms`).join(' | ')])
      window.__ev = []
    }
    last = t
    if (rows.length < 12 && t < (window.__tEnd ??= t + 8000)) requestAnimationFrame(f)
    else done(rows)
  }
  requestAnimationFrame(f)
}))
for (const r of out) console.log(r[0], r[1] + ' ms', r[2] || '(no uploads)')
console.log('long frames in 8 s:', out.length)
await browser.close()
