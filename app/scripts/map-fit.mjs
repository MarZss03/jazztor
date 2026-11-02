// The Jazz Map table at several window sizes, venue panel open and minimised: does the whole table stay on screen?
// Prints the table's projected screen box (left edge must stay >= 0, right edge left of the panel).
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const OUT = 'D:/Jazztor/blender/renders/web/map-fit/'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
for (const [w, h] of [[1280, 720], [1366, 768], [1440, 900], [1600, 900], [1920, 1080], [2560, 1080]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } })
  await page.goto(process.env.JT_URL ?? 'http://localhost:5174/', { waitUntil: 'commit' })
  await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 120000 })
  for (const open of [true, false]) {
    await page.evaluate((o) => window.__jazz.useJazz.getState().set({ station: 'map', mapRequested: true, mapPanelOpen: o }), open)
    await page.waitForTimeout(3500)
    const box = await page.evaluate(() => {
      const { scene, THREE, projectWorld } = window.__jazz
      const o = scene.getObjectByName('JT_Map_Board') ?? scene.getObjectByName('JT_MapStation')
      if (!o) return null
      const b = new THREE.Box3().setFromObject(o)
      const xs = []
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) xs.push(projectWorld(x, y, z).x)
      const panel = document.querySelector('.mappanel')?.getBoundingClientRect()
      return { left: Math.round(Math.min(...xs)), right: Math.round(Math.max(...xs)), panelLeft: panel ? Math.round(panel.left) : null }
    })
    console.log(`${w}x${h} panel ${open ? 'open' : 'min '}`, JSON.stringify(box))
    await page.screenshot({ path: `${OUT}map-${w}x${h}-${open ? 'open' : 'min'}.png` })
  }
  await page.close()
}
await browser.close()
