// The legendary instruments in the 3D scenes (models: blender/scripts/jt_instruments.py, content: data/instruments.ts).
// Each scene clones the roots it shows (two on the listening room's console, three on the museum plinths), tags every
// mesh for picking, and gets a close-up camera pose per instrument: the camera walks up to it and the reading card opens.
// While one is in focus it sways slowly on its display so the light runs over the metal.
import * as THREE from 'three'
import { INSTRUMENTS, type Instrument } from '../data/instruments'

export type Pose = { pos: THREE.Vector3; quat: THREE.Quaternion; fov: number }
export type Placed = { inst: Instrument; obj: THREE.Object3D; restQuat: THREE.Quaternion; pose: Pose }

const CLOSE_FOV = 28

/** Clone instrument `inst` from the loaded GLB, at `at` (centre of its footprint on the surface), turned `yaw` about the
 * vertical; `toward` = unit direction from the instrument to where the visitor stands (the close-up comes from there). */
export function place(src: THREE.Object3D, inst: Instrument, at: THREE.Vector3, yaw: number, toward: THREE.Vector3, aspect = 1.5,
  where = inst.where, opts: { upright?: boolean; lift?: number; env?: THREE.Texture; envIntensity?: number } = {}): Placed | null {
  const root = src.getObjectByName(inst.node)
  if (!root) return null
  // outer: position + yaw (and the sway); inner: the model, re-stood upright when asked, its lowest point at `lift`
  const obj = new THREE.Group()
  obj.name = `${inst.node}_${where}` // e.g. JT_Inst_Miles_room
  const model = root.clone(true)
  model.position.set(0, 0, 0)
  if (opts.upright) {
    // the saxophones are modelled lying on their backs (length +x, keys +y): stand them up - length up, keys to +z
    model.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)))
  }
  obj.add(model)
  obj.updateMatrixWorld(true)
  const box = new THREE.Box3()
  model.traverse((o) => { if ((o as THREE.Mesh).isMesh && !o.name.startsWith('COL_')) box.expandByObject(o) })
  const c = box.getCenter(new THREE.Vector3())
  model.position.set(-c.x, (opts.lift ?? 0) - box.min.y, -c.z)
  obj.position.copy(at)
  obj.rotation.set(0, yaw, 0)
  obj.traverse((o) => {
    o.userData.pick = { kind: 'instrument', id: inst.id }
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    if (o.name.startsWith('COL_')) {
      o.visible = false // pick volume only (raycasts still hit invisible meshes in R3F; three's Raycaster too)
      return
    }
    mesh.castShadow = true
    mesh.receiveShadow = true
    if (opts.env) {
      // display lighting: a neutral studio reflection instead of the warm room's - silver reads silver, ivory ivory
      const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
        const c = (m as THREE.MeshStandardMaterial).clone()
        c.envMap = opts.env!
        c.envMapIntensity = opts.envIntensity ?? 1
        return c
      })
      mesh.material = Array.isArray(mesh.material) ? mats : mats[0]
    }
  })
  obj.updateMatrixWorld(true)
  return { inst, obj, restQuat: obj.quaternion.clone(), pose: closeup(obj, toward, aspect) }
}

/** camera pose framing the whole instrument from `toward` (and a little above), for a view `aspect` wide */
export function closeup(obj: THREE.Object3D, toward: THREE.Vector3, aspect = 1.5): Pose {
  const box = new THREE.Box3()
  obj.traverse((o) => { if ((o as THREE.Mesh).isMesh && !o.name.startsWith('COL_')) box.expandByObject(o) })
  const c = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const tv = Math.tan(THREE.MathUtils.degToRad(CLOSE_FOV / 2))
  const r = Math.max(size.x, size.z) * 0.5
  const dist = Math.max(r * 1.25 / (tv * aspect), (size.y * 0.5 + r * 0.45) * 1.35 / tv, 0.45)
  const pos = c.clone().addScaledVector(toward.clone().normalize(), dist)
  const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pos, c, new THREE.Vector3(0, 1, 0)))
  return { pos, quat, fov: CLOSE_FOV }
}

/** A slim saxophone floor stand (black enamel): three splayed legs, a padded cradle for the bow at `cradle` height and
 * a post with a fork that steadies the body - so an upright alto stands as it would in a player's room. */
export function saxStand(cradle = 0.09): THREE.Group {
  const g = new THREE.Group()
  g.name = 'JT_SaxStand'
  const metal = new THREE.MeshStandardMaterial({ name: 'JT_SaxStand_Enamel', color: '#101010', roughness: 0.35, metalness: 0.6 })
  const pad = new THREE.MeshStandardMaterial({ name: 'JT_SaxStand_Felt', color: '#2a120a', roughness: 0.9 })
  const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number, m = metal) => {
    const len = a.distanceTo(b)
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), m)
    mesh.position.copy(a).add(b).multiplyScalar(0.5)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
    mesh.castShadow = true
    g.add(mesh)
  }
  const hub = new THREE.Vector3(0, cradle - 0.02, -0.02)
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2
    rod(hub, new THREE.Vector3(Math.cos(a) * 0.16, 0.004, Math.sin(a) * 0.16 - 0.02), 0.005)
  }
  // cradle: a padded U under the bow, opening up
  const u = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.007, 8, 20, Math.PI), pad)
  u.rotation.set(0, 0, Math.PI)
  u.position.set(0, cradle + 0.04, 0)
  g.add(u)
  rod(hub, new THREE.Vector3(0, 0.36, -0.035), 0.0055)
  rod(new THREE.Vector3(-0.025, 0.36, -0.035), new THREE.Vector3(0.025, 0.36, -0.035), 0.005, pad)
  return g
}

/** a slow sway on the display while in focus (eases back to rest otherwise) */
export function sway(p: Placed, focused: boolean, t: number, dt: number) {
  const target = focused ? p.restQuat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(t * 0.45) * 0.32))
    : p.restQuat
  p.obj.quaternion.slerp(target, Math.min(1, dt * (focused ? 1.6 : 3)))
}

export const roomInstruments = INSTRUMENTS.filter((i) => i.where === 'room')
export const museumInstruments = INSTRUMENTS.filter((i) => i.where === 'museum')
