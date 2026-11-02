// Quick visual probe: node scripts/probe.mjs [quality] [igpu]
import { chromium } from 'playwright-core'
const q = process.argv[2] ?? ''
const args = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
if (process.argv[3] !== 'igpu') args.push('--force_high_performance_gpu')
const browser = await chromium.launch({ channel: 'msedge', headless: true, args })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
page.on('pageerror', (e) => console.log('pageerror', e.stack?.slice(0, 600)))
page.on('console', (m) => m.type() === 'error' && console.log('console', m.text().slice(0, 300)))
page.on('response', (r) => r.status() >= 400 && console.log('HTTP', r.status(), r.url()))
const t = Date.now()
await page.goto('http://localhost:5173/' + (q ? `?quality=${q}` : ''), { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 120000 })
console.log('loaded in', ((Date.now() - t) / 1000).toFixed(1), 's', await page.evaluate(() => {
  const s = window.__jazz.useJazz.getState()
  return `tier=${s.tier} gpu=${s.gpu}`
}))
await new Promise((r) => setTimeout(r, 4000))
await page.screenshot({ path: `D:/Jazztor/blender/renders/web/probe-${q || 'auto'}.png` })
await browser.close()
process.exit(0)
