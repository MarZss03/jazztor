// Jazz Map magnifier: zoom / pan the map station's view by cropping the camera's projection window
// (setViewOffset), so the composition, the pins and pointer picking all stay exact at any zoom.
// zoom >= 1; (L, T) = top-left of the visible window in the unzoomed view, normalised 0..1 (window size 1/zoom).
import { useJazz } from '../state/store'

export const MAX_ZOOM = 4
export const mapView = { zoom: 1, target: 1, L: 0, T: 0, tL: 0, tT: 0 }

const clamp = () => {
  const span = 1 - 1 / mapView.target
  mapView.tL = Math.min(Math.max(mapView.tL, 0), span)
  mapView.tT = Math.min(Math.max(mapView.tT, 0), span)
}

/** Zoom by `factor` keeping the point under (sx, sy) (0..1 of the view) where it is. */
export function zoomAt(factor: number, sx = 0.5, sy = 0.5) {
  const z = mapView.target
  const z2 = Math.min(MAX_ZOOM, Math.max(1, z * factor))
  const u = mapView.tL + sx / z
  const v = mapView.tT + sy / z
  mapView.target = z2
  mapView.tL = u - sx / z2
  mapView.tT = v - sy / z2
  clamp()
  useJazz.getState().set({ mapZoom: z2 })
}

/** Pan by a drag of (dx, dy) in view fractions. */
export function panBy(dx: number, dy: number) {
  mapView.tL -= dx / mapView.target
  mapView.tT -= dy / mapView.target
  clamp()
}

export function resetMapView() {
  mapView.target = 1
  mapView.tL = mapView.tT = 0
  useJazz.getState().set({ mapZoom: 1 })
}

/** Ease toward the targets (called once per frame by the map station). */
export function stepMapView(k: number) {
  mapView.zoom += (mapView.target - mapView.zoom) * k
  mapView.L += (mapView.tL - mapView.L) * k
  mapView.T += (mapView.tT - mapView.T) * k
  if (Math.abs(mapView.zoom - mapView.target) < 1e-4) mapView.zoom = mapView.target
}
