// Debug probe: open the museum (reduced motion), go to a room, evaluate an expression, screenshot.
//   node scripts/probe-museum.mjs <room> "<js expression>" [shot-name]
import { chromium } from 'playwright-core'

import { readFileSync, existsSync } from 'node:fs'
const [room = 'vestibule', exprArg = '1', name = 'probe'] = process.argv.slice(2)
const expr = existsSync(exprArg) ? readFileSync(exprArg, 'utf8') : exprArg // an expression, or a file holding one
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
page.on('pageerror', (e) => console.log('PAGEERROR', String(e.stack).slice(0, 800)))
page.on('console', (m) => (m.type() === 'error' || m.text().startsWith('[probe]')) && console.log(m.type(), m.text().slice(0, 400)))
await page.goto(`${process.env.JT_URL ?? 'http://localhost:5174/'}?quality=${process.env.Q ?? 'high'}`, { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 120000 })
await page.evaluate(() => window.__jazz.useJazz.getState().set({ reducedMotion: true }))
await page.getByRole('button', { name: 'MUSEUM', exact: true }).click()
await page.waitForFunction(() => window.__jazz.museumState && !window.__jazz.museumState.busy && window.__jazz.useJazz.getState().station === 'museum', null, { timeout: 120000 })
if (room !== 'vestibule' && room !== 'door') {
  await page.evaluate((r) => window.__jazz.museum.go(r), room)
  await page.waitForFunction(() => !window.__jazz.museumState.busy, null, { timeout: 20000 })
}
await page.waitForTimeout(1200)
console.log(JSON.stringify(await page.evaluate((e) => (0, eval)(e), expr), null, 1))
await page.screenshot({ path: `D:/Jazztor/blender/renders/web/${name}.png` })
await browser.close()
