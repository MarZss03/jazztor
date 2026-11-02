// Headless smoke test of the homepage using the system's Microsoft Edge.
// Usage: npm run dev (in another terminal), then:
//   node scripts/verify.mjs [auto|high|medium|low] [dgpu|igpu]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const QUALITY = process.argv[2] ?? 'auto'
const GPU = process.argv[3] ?? 'dgpu'
const OUT = new URL(`../../blender/renders/web/${QUALITY}-${GPU}/`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    ...(GPU === 'dgpu' ? ['--force_high_performance_gpu'] : [])],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e.stack).slice(0, 600)))
page.on('response', (r) => r.status() >= 400 && errors.push('HTTP ' + r.status() + ' ' + r.url()))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

const state = () => page.evaluate(() => {
  const j = window.__jazz
  const s = j.useJazz.getState()
  return { deck: s.deck, album: s.albumId, mode: s.resolvedMode, curtain: s.curtain, lamp: s.lampLevel,
    station: s.station, crate: s.crate, yaw: j.deck.armYaw, speed: j.deck.platterSpeed, lift: j.deck.armLift,
    pos: j.audio.position(), playing: j.audio.isPlaying, levels: j.audio.levels() }
})
const at = (name) => page.evaluate((n) => window.__jazz.project(n), name)
const click = async (name) => {
  const p = await at(name)
  await page.mouse.move(p.x, p.y)
  await sleep(150)
  await page.mouse.down()
  await page.mouse.up()
}
const shot = (name) => page.screenshot({ path: `${OUT}${name}.png` })
const atConsole = (name) => page.evaluate((n) => window.__jazz.consoleProject(n), name)
const clickConsole = async (name) => {
  const p = await atConsole(name)
  await page.mouse.move(p.x, p.y)
  await sleep(120)
  await page.mouse.down()
  await page.mouse.up()
}

const t00 = Date.now()
await page.goto(`${process.env.JT_URL ?? 'http://localhost:5173/'}${QUALITY === 'auto' ? '' : `?quality=${QUALITY}`}`, { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded && window.__jazz.project && window.__jazz.consoleProject,
  null, { timeout: 120000 })
const loadS = (Date.now() - t00) / 1000
await sleep(3000)
const t0 = await state()
const env = await page.evaluate(() => {
  const s = window.__jazz.useJazz.getState()
  let ktx2 = 0
  let maps = 0
  window.__jazz.console.root.traverse((o) => {
    const m = o.material
    if (o.isMesh && m && !Array.isArray(m) && m.map && m.name === 'JT_Walnut') {
      maps++
      if (m.map.isCompressedTexture) ktx2++
    }
  })
  return { tier: s.tier, gpu: s.gpu, ktx2, maps }
})
check('scene loaded, Toronto time resolved', !!t0.mode, `${t0.mode}, ${loadS.toFixed(1)} s, tier ${env.tier}`)
check('KTX2 textures transcoded on GPU', env.maps > 0 && env.ktx2 === env.maps, `${env.ktx2}/${env.maps} walnut maps compressed`)
await page.evaluate(() => window.__jazz.useJazz.getState().set({ timeSetting: 'DUSK' }))
await sleep(4000)
await shot('01-home-dusk')

// one-click play via the physical button
await click('COL_PlayButton')
await page.waitForFunction(() => window.__jazz.useJazz.getState().deck === 'playing', null, { timeout: 30000 })
  .catch(() => {})
await sleep(2500)
const t1 = await state()
check('hidden button starts the deck', t1.deck === 'playing' && t1.playing, JSON.stringify({ deck: t1.deck, pos: t1.pos.toFixed(2) }))
check('platter at speed', t1.speed > 0.9, t1.speed.toFixed(3))
check('stylus in lead-in groove', t1.yaw < -0.5 && t1.yaw > -0.7, `yaw ${t1.yaw.toFixed(3)} rad`)
check('needle lowered', t1.lift < 0.05, t1.lift.toFixed(3))
check('audio signal present (VU)', t1.levels[0] > 0.001, t1.levels.map((v) => v.toFixed(4)).join(' / '))
await shot('02-playing')

// time modes
for (const m of ['DAY', 'NIGHT']) {
  await page.evaluate((mode) => window.__jazz.useJazz.getState().set({ timeSetting: mode }), m)
  await sleep(4500)
  await shot(`03-${m.toLowerCase()}`)
}
const tm = await state()
check('manual time override', tm.mode === 'NIGHT', tm.mode)

// cabinet: clicking the shelf from Home opens the cabinet view, then pick a sleeve
await click('COL_DisplaySleeve')
await sleep(3500)
const tc = await state()
check('shelf click opens cabinet view', tc.station === 'cabinet', tc.station)
const sp = await at('COL_Sleeve_004')
await page.mouse.move(sp.x, sp.y)
await sleep(300)
const hov = await page.evaluate(() => window.__jazz.useJazz.getState().hovered)
const want = await page.evaluate((h) => {
  if (!h?.startsWith('sleeve:')) return null
  const s = window.__jazz.useJazz.getState()
  return window.__jazz.shelfAlbums(s)[Number(h.slice(7))]?.id ?? null
}, hov)
await page.mouse.down()
await page.mouse.up()
await page.waitForFunction((w) => window.__jazz.useJazz.getState().albumId === w, want, { timeout: 20000 }).catch(() => {})
await page.waitForFunction(() => window.__jazz.useJazz.getState().deck === 'playing', null, { timeout: 30000 }).catch(() => {})
const t2 = await state()
check('sleeve click changes record and replays', !!want && t2.album === want && t2.album !== t1.album && t2.deck === 'playing',
  `hovered ${hov} → ${t2.album} ${t2.deck}`)
await sleep(1200)
await shot('04-cabinet-new-record')
await click('COL_CabinetSelector')
await sleep(1500)
const t6 = await state()
check('crate selector', t6.crate === 'MY_CRATE', t6.crate)
await shot('05b-cabinet-my-crate')
await page.keyboard.press('Escape')
await sleep(3500)

// manual needle ritual: drag the headshell to mid-record
const head = await at('JT_Tonearm_Headshell')
const spindle = await at('JT_Turntable_Spindle')
await page.mouse.move(head.x, head.y)
await sleep(200)
await page.mouse.down()
await sleep(400)
const target = { x: spindle.x + (head.x - spindle.x) * 0.55, y: spindle.y + (head.y - spindle.y) * 0.55 }
for (let i = 1; i <= 12; i++) {
  await page.mouse.move(head.x + (target.x - head.x) * (i / 12), head.y + (target.y - head.y) * (i / 12))
  await sleep(40)
}
const mid = await state()
check('drag enters manual mode', mid.deck === 'manual', mid.deck)
await page.mouse.up()
await page.waitForFunction(() => window.__jazz.useJazz.getState().deck === 'playing', null, { timeout: 15000 }).catch(() => {})
await sleep(800)
const t3 = await state()
check('needle drop resumes mid-record', t3.deck === 'playing' && t3.pos > 20, `pos ${t3.pos.toFixed(1)} s`)

// room controls
await click('COL_CurtainCord')
await sleep(300)
const t4 = await state()
check('curtain cord cycles curtains', t4.curtain === 'HALF', t4.curtain)
await click('COL_Lamp')
await sleep(300)
const t5 = await state()
check('lamp toggles', t5.lamp === 0, String(t5.lamp))
await sleep(2500)
await shot('05-night-curtain-lamp')

// 3D player console (A09)
const vu = await page.evaluate(() => window.__jazz.console.vu.map((v) => v.toFixed(2)).join('/'))
const needle = await page.evaluate(() => window.__jazz.console.needleL.rotation.z)
check('console VU needles follow the audio', Number(vu.split('/')[0]) > 0.05 && needle < 0.8, `vu ${vu}, needle ${needle.toFixed(2)} rad`)
await shot('05c-console-playing')
const rail = await atConsole('COL_Player_Rail')
const panel = await page.evaluate(() => {
  const r = window.__jazz.console
  return { len: r.layout.railLen, x: r.mods.Groove.position.x, left: r.cam.left, right: r.cam.right }
})
// drag the puck to ~25 % of the groove
const pxPerUnit = 1440 / (panel.right - panel.left)
const x25 = rail.x + (-panel.len / 2 + panel.len * 0.25) * pxPerUnit
await page.mouse.move(rail.x, rail.y)
await page.mouse.down()
await page.mouse.move(x25, rail.y, { steps: 6 })
await page.mouse.up()
await sleep(2200)
const ts = await state()
const dur = await page.evaluate(() => window.__jazz.console.duration)
check('console groove seeks', ts.deck === 'playing' && Math.abs(ts.pos / dur - 0.25) < 0.04, `pos ${(ts.pos / dur * 100).toFixed(1)} %`)
const crateBefore = await page.evaluate(() => window.__jazz.useJazz.getState().myCrate.length)
await clickConsole('JT_Player_Btn_Crate')
await sleep(300)
const crateAfter = await page.evaluate(() => window.__jazz.useJazz.getState().myCrate.length)
check('console crate rocker', crateAfter !== crateBefore, `${crateBefore} -> ${crateAfter}`)
const volBefore = await page.evaluate(() => window.__jazz.useJazz.getState().volume)
const vk = await atConsole('JT_Player_VolumeKnob')
await page.mouse.move(vk.x, vk.y)
await page.mouse.wheel(0, -300)
await sleep(300)
const volAfter = await page.evaluate(() => window.__jazz.useJazz.getState().volume)
check('console volume knob', volAfter > volBefore, `${volBefore.toFixed(2)} -> ${volAfter.toFixed(2)}`)
await clickConsole('JT_Player_Btn_Play')
await page.waitForFunction(() => window.__jazz.useJazz.getState().deck === 'stopped', null, { timeout: 20000 }).catch(() => {})
const tp = await state()
check('console play/pause stops the deck', tp.deck === 'stopped', tp.deck)
await clickConsole('JT_Player_Btn_Play')
await page.waitForFunction(() => window.__jazz.useJazz.getState().deck === 'playing', null, { timeout: 30000 }).catch(() => {})
const tq = await state()
check('console play/pause restarts the deck', tq.deck === 'playing', tq.deck)

// Jazz Map station (A10): open from the MAP nav, pick a pin, archival card, filter dial, date wheel, save
await page.getByRole('button', { name: 'MAP', exact: true }).click()
await page.waitForFunction(() => window.__jazz.mapProject && window.__jazz.useJazz.getState().station === 'map', null,
  { timeout: 60000 }).catch(() => {})
await sleep(3500)
const ms = await page.evaluate(() => window.__jazz.useJazz.getState().station)
check('MAP nav flies to the map station', ms === 'map', ms)
await shot('07-map-arrive')
const mp = (k) => page.evaluate((key) => window.__jazz.mapProject(key), k)
const rexPin = await mp('rex')
await page.mouse.move(rexPin.x, rexPin.y)
await sleep(250)
await page.mouse.down()
await page.mouse.up()
await sleep(1600)
const card = await page.evaluate(() => ({ sel: window.__jazz.useJazz.getState().selectedVenue, rise: window.__jazz.mapRig.cardRise }))
// map magnifier: wheel zooms toward the cursor; the reading panel lists the venue
const mz = await page.evaluate(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { x: r.left + r.width * 0.45, y: r.top + r.height * 0.45 } })
await page.mouse.move(mz.x, mz.y)
for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -240); await sleep(80) }
await sleep(900)
const zoomed = await page.evaluate(() => window.__jazz.useJazz.getState().mapZoom)
check('map magnifier zooms with the wheel', zoomed > 1.5, zoomed.toFixed(2) + 'x')
await shot('09b-map-zoomed')
await page.getByRole('button', { name: 'Whole map' }).click()
await sleep(700)
const panelName = await page.evaluate(() => document.querySelector('.mappanel__card h3')?.textContent)
check('map panel shows the selected venue', /Rex/.test(panelName ?? ''), panelName ?? 'none')
await page.getByRole('button', { name: 'Minimise the venue list' }).click()
await sleep(400)
const minimised = await page.evaluate(() => !!document.querySelector('.mappanel-tab') && !document.querySelector('.mappanel'))
await page.getByRole('button', { name: 'Show the venue list' }).click()
await sleep(400)
const restored = await page.evaluate(() => !!document.querySelector('.mappanel'))
check('map panel minimises to a tab and restores', minimised && restored, JSON.stringify({ minimised, restored }))
check('pin raises the archival card', card.sel === 'rex' && card.rise > 0.9, `${card.sel}, rise ${card.rise.toFixed(2)}`)
await shot('08-map-card')
// SAVE plate: project the card's UV zone (u 0.62-0.95, v 0.04-0.17 from the bottom) to the screen
const saveScreen = await page.evaluate(() => {
  const mesh = window.__jazz.mapRig.card
  mesh.geometry.computeBoundingBox()
  const b = mesh.geometry.boundingBox
  // card front faces +Z (three); u runs along X, v along Y
  const p = b.max.clone().set(b.min.x + (b.max.x - b.min.x) * 0.785, b.min.y + (b.max.y - b.min.y) * 0.105, b.max.z)
  mesh.localToWorld(p)
  return window.__jazz.projectWorld(p.x, p.y, p.z)
})
const savedBefore = await page.evaluate(() => window.__jazz.useJazz.getState().savedVenues.length)
await page.mouse.move(saveScreen.x, saveScreen.y)
await sleep(200)
await page.mouse.down()
await page.mouse.up()
await sleep(500)
const savedAfter = await page.evaluate(() => window.__jazz.useJazz.getState().savedVenues)
check('card SAVE plate saves the venue', savedAfter.includes('rex') && savedAfter.length === savedBefore + 1, savedAfter.join(','))
// filter dial: ALL -> LIVE -> HALLS hides the Rex pin and closes its card
await page.mouse.move((await mp('COL_MapFilter')).x, (await mp('COL_MapFilter')).y)
for (let i = 0; i < 2; i++) {
  await page.mouse.down()
  await page.mouse.up()
  await sleep(350)
}
await sleep(1200)
const flt = await page.evaluate(() => {
  const r = window.__jazz.mapRig
  const rex = r.pins.find((p) => p.v.id === 'rex')
  const massey = r.pins.find((p) => p.v.id === 'massey')
  return { f: window.__jazz.useJazz.getState().mapFilter, sel: window.__jazz.useJazz.getState().selectedVenue,
    rex: rex.rise, massey: massey.rise }
})
check('filter dial sinks non-matching pins', flt.f === 'HALLS' && flt.sel === null && flt.rex < 0.2 && flt.massey > 0.9,
  `${flt.f}: rex ${flt.rex.toFixed(2)}, massey ${flt.massey.toFixed(2)}`)
const dw = await mp('COL_MapDate')
await page.mouse.move(dw.x, dw.y)
await page.mouse.down()
await page.mouse.up()
await sleep(400)
const rng = await page.evaluate(() => window.__jazz.useJazz.getState().mapRange)
check('date wheel cycles the range', rng === 'THIS MONTH', rng)
await shot('09-map-halls')
await page.keyboard.press('Escape')
await sleep(2500)

// station panels: menu -> Collection -> pick a record; preferences; museum -> map; local file import; account
const js = (fn, arg) => page.evaluate(fn, arg)
await page.getByRole('button', { name: 'Menu', exact: true }).click()
await sleep(600)
check('menu drawer opens', (await js(() => window.__jazz.useJazz.getState().panel)) === 'menu')
await page.getByRole('button', { name: 'Collection', exact: true }).click()
await sleep(900)
// the panel opens on the current shelf; pick the first record that is not already on the deck
const pick = await js(() => {
  const s = window.__jazz.useJazz.getState()
  const list = window.__jazz.visibleAlbums(s.crate, s.myCrate)
  const i = list.findIndex((a) => a.id !== s.albumId)
  return { i, id: list[i]?.id }
})
const wantRecord = pick.id
await page.locator('.record__sleeve').nth(pick.i).click()
await page.waitForFunction((w) => window.__jazz.useJazz.getState().albumId === w && window.__jazz.useJazz.getState().deck === 'playing',
  wantRecord, { timeout: 30000 }).catch(() => {})
const cr = await js(() => ({ id: window.__jazz.useJazz.getState().albumId, deck: window.__jazz.useJazz.getState().deck,
  hist: window.__jazz.useJazz.getState().history.length }))
check('Collection: choosing a record plays it', cr.id === wantRecord && cr.deck === 'playing', `${cr.id} ${cr.deck}`)
check('listening memory records the play', cr.hist > 0, `${cr.hist} entries`)
await shot('10-panel-collection')
await page.keyboard.press('Escape')
await sleep(500)
check('Escape closes the panel', (await js(() => window.__jazz.useJazz.getState().panel)) === null)
await js(() => window.__jazz.useJazz.getState().set({ panel: 'room' }))
await sleep(600)
await page.getByRole('radio', { name: 'Black Lacquer' }).click()
await page.getByRole('radiogroup', { name: 'Display rotation' }).getByRole('radio', { name: 'Off' }).click()
await sleep(800)
const pr = await js(() => ({ finish: window.__jazz.useJazz.getState().prefs.roomFinish, whiskey: window.__jazz.useJazz.getState().prefs.whiskeySpeed }))
check('preferences change the room', pr.finish === 'lacquer' && pr.whiskey === 'off', JSON.stringify(pr))
await shot('11-panel-room-lacquer')
await page.getByRole('button', { name: /Restore JazzTor Original/ }).click()
await sleep(400)
// ---- legendary instruments in the room: a click walks up to the horn and opens its card; Escape steps back
const hornAt = await js(() => {
  const { scene, THREE, projectWorld } = window.__jazz
  const o = scene.getObjectByName('JT_Inst_Miles_room')
  if (!o) return null
  const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3())
  return projectWorld(c.x, c.y, c.z)
})
if (hornAt) await page.mouse.click(hornAt.x, hornAt.y)
await page.waitForFunction(() => document.querySelector('.instcard h3'), null, { timeout: 8000 }).catch(() => {})
await sleep(1600)
const horn = await js(() => ({ st: window.__jazz.useJazz.getState().station, inst: window.__jazz.useJazz.getState().instrument,
  card: document.querySelector('.instcard h3')?.textContent }))
check('room instrument: click walks up to it and opens its card', horn.st === 'instrument' && horn.inst === 'miles' && /Moon and Stars/.test(horn.card ?? ''),
  JSON.stringify(horn))
await shot('12b-room-instrument')
await page.keyboard.press('Escape')
await sleep(1500)
check('...and Escape steps back to the room', await js(() => window.__jazz.useJazz.getState().station) === 'home')
// ---- credits: every record and every museum picture with its licence (CC BY attribution)
await page.getByRole('button', { name: 'CREDITS' }).click()
await page.waitForFunction(() => document.querySelectorAll('.credits__pictures li').length > 0, null, { timeout: 8000 }).catch(() => {})
const crd = await js(() => ({ records: document.querySelectorAll('.credits__record').length, pictures: document.querySelectorAll('.credits__pictures li').length,
  ccby: [...document.querySelectorAll('.credits__pictures li')].filter((li) => /CC BY/.test(li.textContent ?? '')).length }))
const nPics = await js(() => fetch('/data/museum-images.json').then((r) => r.json()).then((j) => Object.keys(j).length))
check('credits list every record and every museum picture', crd.records > 0 && crd.pictures === nPics && crd.ccby >= 5, JSON.stringify({ ...crd, nPics }))
await page.locator('.credits__close').click()
await sleep(300)
// ---- 3D museum: door transition, two separate wings, inert room layers, focus restore, reduced motion
await page.getByRole('button', { name: 'MUSEUM', exact: true }).focus()
await page.getByRole('button', { name: 'MUSEUM', exact: true }).click()
await page.waitForFunction(() => window.__jazz.museumState && window.__jazz.useJazz.getState().station === 'museum', null, { timeout: 90000 }).catch(() => {})
// sample the hardware: the handle must turn and the latch clear before the leaf swings
const seq = await js(() => new Promise((r) => {
  const out = []
  const t0 = performance.now()
  const f = () => {
    const m = window.__jazz.museumState
    out.push({ t: performance.now() - t0, h: m.handle, l: m.latch, d: m.door, room: window.__jazz.useJazz.getState().museumRoom })
    if (window.__jazz.useJazz.getState().museumRoom === 'vestibule' && !m.busy) r(out)
    else if (performance.now() - t0 > 9000) r(out)
    else requestAnimationFrame(f)
  }
  f()
}))
const firstH = seq.find((x) => x.h > 0.05)?.t ?? -1
const firstD = seq.find((x) => x.d > 0.05)?.t ?? -1
const doorEnd = seq.find((x) => x.d > 0.98)?.t ?? -1
check('museum door: handle, then latch, then swing', firstH >= 0 && firstD > firstH && doorEnd > firstD && doorEnd - firstD > 800,
  `handle ${firstH.toFixed(0)} ms, swing ${firstD.toFixed(0)}–${doorEnd.toFixed(0)} ms`)
const ms0 = await js(() => ({ st: window.__jazz.useJazz.getState().station, room: window.__jazz.useJazz.getState().museumRoom,
  inert: document.querySelector('.home-layer')?.hasAttribute('inert'), focus: document.activeElement?.className,
  deck: window.__jazz.useJazz.getState().deck }))
check('museum vestibule reached, room layers inert', ms0.st === 'museum' && ms0.room === 'vestibule' && ms0.inert && /museum-ui__where/.test(ms0.focus ?? ''),
  JSON.stringify(ms0))
check('music keeps playing through the door', ms0.deck === 'playing', ms0.deck)
await sleep(800)
await shot('13-museum-vestibule')
// the leaves opened outward (toward the visitor: the left leaf turned negative about the vertical), levers pointing to the hinges
const leaf = await js(() => window.__jazz.museumScene.getObjectByName('JT_Mus_DoorRig_L').rotation.y)
check('museum door opens outward, toward the visitor', leaf < -1.2, `left leaf ${leaf.toFixed(2)} rad`)
// a legendary instrument on its plinth: click -> close-up + card; back to the vestibule
const plinth = await js(() => window.__jazz.museumProject('JT_Inst_Gillespie_museum'))
if (plinth) await page.mouse.click(plinth.x, plinth.y - 8)
await page.waitForFunction(() => window.__jazz.useJazz.getState().museumRoom === 'instrument' && !window.__jazz.museumState.busy, null, { timeout: 8000 }).catch(() => {})
await sleep(600)
const mi = await js(() => ({ room: window.__jazz.useJazz.getState().museumRoom, inst: window.__jazz.useJazz.getState().instrument,
  card: document.querySelector('.instcard h3')?.textContent }))
check('museum instrument: click on the plinth opens it', mi.room === 'instrument' && mi.inst === 'gillespie' && /Silver Flair/.test(mi.card ?? ''), JSON.stringify(mi))
await shot('13b-museum-instrument')
await page.keyboard.press('Escape')
await page.waitForFunction(() => window.__jazz.useJazz.getState().museumRoom === 'vestibule' && !window.__jazz.museumState.busy, null, { timeout: 8000 }).catch(() => {})
// the time switch works inside the museum (it sets the light outside the Toronto window)
const tsBefore = await js(() => window.__jazz.useJazz.getState().timeSetting)
await page.getByRole('radio', { name: 'DAY' }).click()
await sleep(300)
check('time switch works inside the museum', await js(() => window.__jazz.useJazz.getState().resolvedMode) === 'DAY')
await page.getByRole('radio', { name: tsBefore }).click()
// free exploration: walk forward with the keyboard, stopped by the furniture, Escape back to the guided tour
await page.getByRole('button', { name: 'Explore freely' }).click()
await sleep(400)
const w0 = await js(() => ({ room: window.__jazz.useJazz.getState().museumRoom, y: window.__jazz.museumWalkState().y }))
await page.keyboard.down('w'); await sleep(1500); await page.keyboard.up('w'); await sleep(300)
const w1 = await js(() => ({ y: window.__jazz.museumWalkState().y, x: window.__jazz.museumWalkState().x }))
check('free walk: W walks forward (and the table stops you)', w0.room === 'explore' && w1.y > w0.y + 0.8 && w1.y < 2.55,
  `${w0.y.toFixed(2)} -> ${w1.y.toFixed(2)} m`)
await shot('13c-museum-explore')
await page.keyboard.press('Escape')
await page.waitForFunction(() => window.__jazz.useJazz.getState().museumRoom === 'vestibule' && !window.__jazz.museumState.busy, null, { timeout: 8000 }).catch(() => {})
check('...and Escape returns to the guided tour', await js(() => window.__jazz.useJazz.getState().museumRoom) === 'vestibule')
// sit on the World wing's bench (in front of the world map), then a step stands you up
await js(() => window.__jazz.museum.sit('world'))
await page.waitForFunction(() => !window.__jazz.museumState.busy, null, { timeout: 15000 }).catch(() => {})
await sleep(900)
const seated = await js(() => { const w = window.__jazz.museumWalkState(); return { seat: w.seat?.id ?? null, eye: window.__jazz.museumCamera.position.y } })
check('sit on the World wing bench (camera lowers onto it)', seated.seat === 'world' && seated.eye < 1.3, JSON.stringify(seated))
await shot('13d-museum-seated')
await page.keyboard.down('w'); await sleep(900); await page.keyboard.up('w'); await sleep(900)
const stood = await js(() => { const w = window.__jazz.museumWalkState(); return { seat: w.seat?.id ?? null, eye: +w.eye.toFixed(2) } })
check('...walking stands you up', stood.seat === null && stood.eye > 1.5, JSON.stringify(stood))
await page.keyboard.press('Escape')
await page.waitForFunction(() => !window.__jazz.museumState.busy && window.__jazz.useJazz.getState().museumRoom !== 'explore', null, { timeout: 10000 }).catch(() => {})
await js(() => window.__jazz.museum.go('vestibule'))
await page.waitForFunction(() => window.__jazz.useJazz.getState().museumRoom === 'vestibule' && !window.__jazz.museumState.busy, null, { timeout: 10000 }).catch(() => {})
// a framed picture: the camera walks up to it and the reading card shows its wall text
// (keyboard path: the accessible list of what hangs in this room)
await page.getByRole('button', { name: /^Louis Armstrong, Aquarium/ }).focus()
await page.keyboard.press('Enter')
await page.waitForFunction(() => window.__jazz.useJazz.getState().museumRoom === 'exhibit' && !window.__jazz.museumState.busy, null, { timeout: 8000 }).catch(() => {})
const exv = await js(() => ({ room: window.__jazz.useJazz.getState().museumRoom, ex: window.__jazz.useJazz.getState().museumExhibit, card: document.querySelector('.excard h3')?.textContent }))
check('clicking a framed picture opens its exhibit view + wall text', exv.room === 'exhibit' && exv.ex === 'v-armstrong' && /Armstrong/.test(exv.card ?? ''), JSON.stringify(exv))
await page.getByRole('button', { name: 'Next exhibit' }).click()
await page.waitForFunction(() => !window.__jazz.museumState.busy && window.__jazz.useJazz.getState().museumExhibit !== 'v-armstrong', null, { timeout: 8000 }).catch(() => {})
check('Next walks to the following exhibit', (await js(() => window.__jazz.useJazz.getState().museumExhibit)) === 'v-ellington')
await page.keyboard.press('Escape')
await page.waitForFunction(() => window.__jazz.useJazz.getState().museumRoom === 'vestibule' && !window.__jazz.museumState.busy, null, { timeout: 8000 }).catch(() => {})
await page.getByRole('button', { name: /World Jazz History/ }).click()
await page.waitForFunction(() => window.__jazz.useJazz.getState().museumRoom === 'world' && !window.__jazz.museumState.busy, null, { timeout: 8000 }).catch(() => {})
await sleep(400)
const pinKoB = await js(() => window.__jazz.museumProject('marker:kind-of-blue-1959'))
if (pinKoB) await page.mouse.click(pinKoB.x, pinKoB.y)
await sleep(700)
const wsel = await js(() => ({ w: window.__jazz.useJazz.getState().museumWorld, t: window.__jazz.useJazz.getState().museumToronto }))
check('World wing: timeline marker selects its chapter', wsel.w === 'kind-of-blue-1959' && wsel.t === null, JSON.stringify(wsel))
await page.waitForFunction(() => !window.__jazz.museumState.busy, null, { timeout: 8000 }).catch(() => {})
const walked = await js(() => window.__jazz.useJazz.getState().museumExhibit)
check('...and walks to that chapter\'s framed picture', walked === 'w-kob', walked ?? 'none')
await shot('14-museum-world')
await page.keyboard.press('Escape')
await page.waitForFunction(() => window.__jazz.useJazz.getState().museumRoom === 'world' && !window.__jazz.museumState.busy, null, { timeout: 8000 }).catch(() => {})
await page.getByRole('button', { name: 'Read placard' }).click()
await page.waitForFunction(() => window.__jazz.useJazz.getState().museumRoom === 'world-read' && !window.__jazz.museumState.busy, null, { timeout: 8000 }).catch(() => {})
await sleep(400)
// the sheet is in plain view: rays through its centre and four inner points hit the placard before anything else
const sheetSeen = await js(() => {
  const { museumScene: s, museumCamera: cam, THREE } = window.__jazz
  const p = s.getObjectByName('JT_Mus_WorldPlacard')
  const box = new THREE.Box3().setFromObject(p)
  const c = box.getCenter(new THREE.Vector3())
  const ray = new THREE.Raycaster()
  return [c, ...[[0, 0], [1, 0], [0, 1], [1, 1]].map(([a, b]) => c.clone().lerp(new THREE.Vector3(a ? box.max.x : box.min.x, (box.min.y + box.max.y) / 2, b ? box.max.z : box.min.z), 0.5))]
    .map((pt) => {
      ray.setFromCamera(new THREE.Vector2().copy(pt.clone().project(cam)), cam)
      return ray.intersectObject(s, true).find((h) => !h.object.name.startsWith('COL_'))?.object.name
    })
})
check('placard reading view: the sheet is in plain view (nothing in front of it)', sheetSeen.every((n) => n === 'JT_Mus_WorldPlacard'), sheetSeen.join(', '))
await page.getByRole('button', { name: 'Next entry' }).click()
await sleep(300)
const turned = await js(() => ({ w: window.__jazz.useJazz.getState().museumWorld, h: document.querySelector('.plcard h3')?.textContent }))
check('placard: Next turns to the following entry (card follows)', turned.w === 'getz-gilberto-1964' && /Getz/.test(turned.h ?? ''), JSON.stringify(turned))
await page.getByRole('button', { name: 'Previous entry' }).click()
await sleep(300)
await shot('15-museum-world-placard')
await page.keyboard.press('Escape')
await sleep(1200)
await page.keyboard.press('Escape')
await page.waitForFunction(() => window.__jazz.useJazz.getState().museumRoom === 'vestibule' && !window.__jazz.museumState.busy, null, { timeout: 8000 }).catch(() => {})
await page.getByRole('button', { name: /Toronto Jazz Legacy/ }).last().click()
await page.waitForFunction(() => window.__jazz.useJazz.getState().museumRoom === 'toronto' && !window.__jazz.museumState.busy, null, { timeout: 8000 }).catch(() => {})
await sleep(400)
const pinMassey = await js(() => window.__jazz.museumProject('chapter:massey-1953'))
if (pinMassey) await page.mouse.click(pinMassey.x, pinMassey.y)
await sleep(700)
await page.waitForFunction(() => !window.__jazz.museumState.busy, null, { timeout: 8000 }).catch(() => {})
const tsel = await js(() => ({ w: window.__jazz.useJazz.getState().museumWorld, t: window.__jazz.useJazz.getState().museumToronto }))
check('Toronto wing: venue pin selects its chapter (World selection untouched)', tsel.t === 'massey-1953' && tsel.w === 'kind-of-blue-1959', JSON.stringify(tsel))
await shot('16-museum-toronto')
await page.getByRole('button', { name: /on the Jazz Map/ }).click()
await page.waitForFunction(() => window.__jazz.useJazz.getState().station === 'map', null, { timeout: 30000 }).catch(() => {})
await sleep(2500)
const mm = await js(() => ({ st: window.__jazz.useJazz.getState().station, v: window.__jazz.useJazz.getState().selectedVenue,
  inert: document.querySelector('.home-layer')?.hasAttribute('inert') }))
check('Toronto chapter leaves through the door to its venue on the Jazz Map', mm.st === 'map' && mm.v === 'massey' && !mm.inert, JSON.stringify(mm))
await page.keyboard.press('Escape')
await sleep(1500)
// leave from the vestibule: focus returns to the nav button that opened the museum
await page.getByRole('button', { name: 'MUSEUM', exact: true }).focus()
await page.keyboard.press('Enter')
await page.waitForFunction(() => window.__jazz.useJazz.getState().museumRoom === 'vestibule' && !window.__jazz.museumState.busy, null, { timeout: 15000 }).catch(() => {})
await page.getByRole('button', { name: /Listening room/ }).click()
await page.waitForFunction(() => window.__jazz.useJazz.getState().station === 'home' && !window.__jazz.museumState.busy, null, { timeout: 10000 }).catch(() => {})
await sleep(600)
const back = await js(() => ({ st: window.__jazz.useJazz.getState().station, focus: document.activeElement?.textContent }))
check('leaving the museum returns focus to its entrance', back.st === 'home' && back.focus === 'MUSEUM', JSON.stringify(back))
// reduced motion: a short fade, no door choreography
await js(() => window.__jazz.useJazz.getState().set({ reducedMotion: true }))
const tr = Date.now()
await page.getByRole('button', { name: 'MUSEUM', exact: true }).click()
await page.waitForFunction(() => window.__jazz.useJazz.getState().museumRoom === 'vestibule' && !window.__jazz.museumState.busy, null, { timeout: 8000 }).catch(() => {})
const trMs = Date.now() - tr
check('reduced motion: short fade into the museum', trMs < 1200, `${trMs} ms`)
await shot('17-museum-reduced-motion')
await page.keyboard.press('Escape')
await page.waitForFunction(() => window.__jazz.useJazz.getState().station === 'home' && !window.__jazz.museumState.busy, null, { timeout: 8000 }).catch(() => {})
await js(() => window.__jazz.useJazz.getState().set({ reducedMotion: false }))
await sleep(800)
await js(() => window.__jazz.useJazz.getState().set({ panel: 'connect' }))
await sleep(600)
const before = await js(() => window.__jazz.visibleAlbums('FOR_YOU', []).length)
await page.locator('input[type=file]').setInputFiles('D:/Jazztor/audio/source/fma/245614-maarten-schellekens-sax-and-piano-free-track.mp3')
await page.waitForFunction((n) => window.__jazz.visibleAlbums('FOR_YOU', []).length > n, before, { timeout: 20000 }).catch(() => {})
const imp = await js(() => window.__jazz.visibleAlbums('FOR_YOU', []).find((a) => a.source === 'local'))
check('local file import adds a record (ID3 tags read)', !!imp && imp.tracks[0].duration > 60, imp ? `${imp.title} — ${imp.artist}, ${Math.round(imp.tracks[0].duration)} s` : 'none')
await shot('12-panel-connect-imported')
await page.getByRole('button', { name: /^Remove / }).first().click()
await sleep(800)
await js(() => window.__jazz.useJazz.getState().set({ panel: 'account' }))
await sleep(500)
await page.getByLabel('Name shown in the room').fill('Test Listener')
await page.getByRole('button', { name: 'Save on this device' }).click()
check('on-device profile saves', (await js(() => window.__jazz.useJazz.getState().profile?.name)) === 'Test Listener')
await js(() => window.__jazz.useJazz.getState().set({ panel: null, profile: null }))
await sleep(1500)

// record ritual camera
await page.keyboard.press('r')
await sleep(1800)
await shot('06-platter-view')
await page.keyboard.press('Escape')

// stop from the button
await sleep(1500)
await click('COL_PlayButton')
await page.waitForFunction(() => window.__jazz.useJazz.getState().deck === 'stopped', null, { timeout: 20000 }).catch(() => {})
const t7 = await state()
check('button stops, arm returns to rest', t7.deck === 'stopped' && Math.abs(t7.yaw) < 0.01, `${t7.deck} yaw ${t7.yaw.toFixed(3)}`)

const fps = await page.evaluate(() => new Promise((r) => {
  let n = 0
  const t = performance.now()
  const f = () => (++n, performance.now() - t < 2000 ? requestAnimationFrame(f) : r(n / ((performance.now() - t) / 1000)))
  requestAnimationFrame(f)
}))
const gpu = await page.evaluate(() => {
  const g = document.querySelector('canvas').getContext('webgl2')
  const ext = g.getExtension('WEBGL_debug_renderer_info')
  return ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown'
})
const finalTier = await page.evaluate(() => window.__jazz.useJazz.getState().tier)
check('frame rate (headless Edge)', fps >= 30, `${fps.toFixed(0)} fps, tier ${finalTier} on ${gpu}`)
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()
const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots: ${OUT}`)
process.exit(failed ? 1 : 0)
