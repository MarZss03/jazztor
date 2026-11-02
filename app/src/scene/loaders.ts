// GLTF loading with locally hosted Draco + Basis (KTX2) decoders — no CDN dependency.
import type { WebGLRenderer } from 'three'
import { useGLTF } from '@react-three/drei'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import type { Tier } from '../quality'

let ktx2: KTX2Loader | null = null

/** Must run once with the live renderer before the first load (KTX2 picks a GPU transcode target). */
export function initLoaders(gl: WebGLRenderer) {
  if (!ktx2) ktx2 = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(gl)
}

// drei types the loader with three-stdlib's GLTFLoader; the runtime object accepts three's KTX2Loader
type ExtendLoader = NonNullable<Parameters<typeof useGLTF>[3]>
const extend: ExtendLoader = (loader) => {
  if (ktx2) (loader as unknown as { setKTX2Loader: (l: KTX2Loader) => void }).setKTX2Loader(ktx2)
}

export const ROOM_GLBS = ['JT_Room', 'JT_Turntable', 'JT_Cabinet', 'JT_Whiskey'] // the city is now the photo backdrop
export const glbUrl = (tier: Tier, name: string) => `/assets/3d/${tier}/${name}.gltf` // + shared tex/*.ktx2

export function useTierGLTF(tier: Tier, names: string[]) {
  return useGLTF(names.map((n) => glbUrl(tier, n)), '/draco/', false, extend)
}
