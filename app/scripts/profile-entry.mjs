// CPU profile of a window of interaction (default: entering the museum after all prefetching has settled).
//   node scripts/profile-entry.mjs [settle-ms]
import { chromium } from 'playwright-core'

const SETTLE = Number(process.argv[2] ?? 30000)
// PREFETCH=1: profile the idle prefetch window (loaded + 11 s .. + 22 s) instead of the museum entry
const PREFETCH = !!process.env.PREFETCH
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto('http://localhost:5174/', { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 120000 })
await page.waitForTimeout(SETTLE)
await page.evaluate(() => { window.__ft = []; let last = 0; const f = (t) => { if (last && t - last > 80) window.__ft.push([Math.round(last), Math.round(t - last)]); last = t; requestAnimationFrame(f) }; requestAnimationFrame(f) })
const cdp = await page.context().newCDPSession(page)
await cdp.send('Profiler.enable')
await cdp.send('Profiler.setSamplingInterval', { interval: 500 })
await cdp.send('Profiler.start')
if (PREFETCH) await page.waitForTimeout(Number(process.env.WINDOW ?? 11000))
else {
  await page.getByRole('button', { name: 'MUSEUM', exact: true }).click()
  await page.waitForFunction(() => window.__jazz.useJazz.getState().museumRoom === 'vestibule' && !window.__jazz.museumState.busy, null, { timeout: 120000 })
}
const { profile } = await cdp.send('Profiler.stop')
console.log('long frames', JSON.stringify(await page.evaluate(() => window.__ft)))
const byId = new Map(profile.nodes.map((n) => [n.id, n]))
const parent = new Map()
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
const self = new Map()
const incl = new Map()
for (let i = 0; i < profile.samples.length; i++) {
  const dt = (profile.timeDeltas[i] ?? 0) / 1000
  let id = profile.samples[i]
  const n = byId.get(id)
  const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop().split('?')[0]}:${n.callFrame.lineNumber}`
  self.set(k, (self.get(k) ?? 0) + dt)
  const seen = new Set()
  while (id !== undefined) {
    const m = byId.get(id)
    const kk = `${m.callFrame.functionName || '(anon)'} ${m.callFrame.url.split('/').pop().split('?')[0]}:${m.callFrame.lineNumber}`
    if (!seen.has(kk)) { incl.set(kk, (incl.get(kk) ?? 0) + dt); seen.add(kk) }
    id = parent.get(id)
  }
}
const top = (m, n) => [...m.entries()].filter(([k]) => !/^\((idle|program|root)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, n)
  .map(([k, v]) => `${v.toFixed(0).padStart(7)} ms  ${k}`).join('\n')
console.log('--- self\n' + top(self, 14) + '\n--- inclusive\n' + top(incl, 22))
await browser.close()
// who calls the hottest native functions (FOCUS=name): their callers' chains, 4 deep
if (process.env.FOCUS) {
  const chains = new Map()
  for (let i = 0; i < profile.samples.length; i++) {
    const dt = (profile.timeDeltas[i] ?? 0) / 1000
    const n = byId.get(profile.samples[i])
    if (n.callFrame.functionName !== process.env.FOCUS) continue
    const chain = []
    let id = parent.get(n.id)
    while (id !== undefined && chain.length < 5) { const m = byId.get(id); chain.push(`${m.callFrame.functionName || '(anon)'}:${m.callFrame.lineNumber}`); id = parent.get(id) }
    const k = chain.join(' < ')
    chains.set(k, (chains.get(k) ?? 0) + dt)
  }
  console.log('--- callers of ' + process.env.FOCUS)
  for (const [k, v] of [...chains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`${v.toFixed(0).padStart(6)} ms  ${k}`)
}
