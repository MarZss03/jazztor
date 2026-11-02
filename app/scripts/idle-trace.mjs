// Which long frames happen while idling in the room after load? (integrated GPU unless DGPU=1)
//   node scripts/idle-trace.mjs   -> long frames as [ms after loaded, duration, programs, textures, station flags]
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', ...(process.env.DGPU ? ['--force_high_performance_gpu'] : [])] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.addInitScript((upMin) => {
  window.__upMin = upMin
  window.__lf = []
  window.__ev = []
  for (const name of ['texImage2D', 'texSubImage2D', 'compressedTexSubImage2D', 'compressedTexImage2D', 'texStorage2D', 'generateMipmap']) {
    const orig = WebGL2RenderingContext.prototype[name]
    WebGL2RenderingContext.prototype[name] = function (...args) {
      const t = performance.now()
      const r = orig.apply(this, args)
      const src = args.find((a) => a && typeof a === 'object' && 'width' in a)
      const ms = performance.now() - t
      if (ms > window.__upMin) window.__ev.push(`${name} ${src ? `${src.constructor?.name} ${src.width}x${src.height}` : `${args[3]}x${args[4]}`} ${Math.round(ms)}ms`)
      return r
    }
  }
  let last = 0
  const f = (t) => {
    const j = window.__jazz
    if (last && t - last > 45 && j?.useJazz.getState().loaded) {
      const s = j.useJazz.getState()
      window.__lf.push([Math.round(last - (window.__loadedAt ?? 0)), Math.round(t - last), j.gl?.info?.programs?.length ?? 0,
        j.gl?.info?.memory?.textures ?? 0, s.mapRequested ? 'map' : '', s.museumRequested ? 'mus' : '', window.__ev.join(' | ')])
    }
    window.__ev = []
    if (j?.useJazz.getState().loaded && !window.__loadedAt) window.__loadedAt = t
    last = t
    requestAnimationFrame(f)
  }
  requestAnimationFrame(f)
}, process.env.ALLUP ? -1 : 2)
await page.goto(process.env.JT_URL ?? 'http://localhost:5174/', { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 180000 })
await page.waitForTimeout(23000)
console.log(JSON.stringify(await page.evaluate(() => window.__lf)))
await browser.close()
