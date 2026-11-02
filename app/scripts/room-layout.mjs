// Prints the listening room's main objects with world bounding boxes (three.js Y-up metres) and the station cameras.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto(process.env.JT_URL ?? 'http://localhost:5174/', { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 120000 })
await page.waitForFunction(() => window.__jazz?.THREE, null, { timeout: 60000 })
const out = await page.evaluate((filter) => {
  const { scene, THREE } = window.__jazz
  const re = new RegExp(filter)
  const rows = []
  scene.traverse((o) => {
    if (!o.name || !re.test(o.name) || o.name.startsWith('COL_')) return
    const b = new THREE.Box3().setFromObject(o)
    if (b.isEmpty()) return
    const f = (v) => v.toArray().map((x) => +x.toFixed(2)).join(',')
    rows.push(`${o.name.padEnd(36)} min ${f(b.min)}  max ${f(b.max)}`)
  })
  const lights = []
  scene.traverse((o) => { if (o.isLight) lights.push(`${o.type} ${o.name} ${o.position.toArray().map((x) => +x.toFixed(2))} int ${+o.intensity.toFixed(2)} vis ${o.visible} cast ${o.castShadow}`) })
  return { rows, lights }
}, process.env.FILTER ?? '^JT_(Room|Floor|Wall|Window|Curtain|Column|Cabinet$|Cabinet_Body|Sideboard|Table|Marble|Turntable_Root|Whiskey_Rig|Lamp|Plinth|Shelf|Logo|Sofa|Chair|Rug|Desk|Cam_)')
console.log(out.rows.join('\n'))
console.log('--- lights\n' + out.lights.join('\n'))
await browser.close()
