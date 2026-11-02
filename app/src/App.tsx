import { Component, Suspense, useEffect, useRef, type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import * as THREE from 'three'
import { Experience } from './scene/Experience'
import { PlayerConsole } from './scene/PlayerConsole'
import { MapStation } from './scene/MapStation'
import { MuseumWorld } from './scene/MuseumWorld'
import { MuseumUI } from './ui/Museum'
import { MapPanel } from './ui/MapPanel'
import { NowPlaying } from './ui/NowPlaying'
import { SleeveCaption } from './ui/SleeveCaption'
import { InstrumentCard } from './ui/InstrumentCard'
import { PlayerBar } from './ui/PlayerBar'
import { Credits } from './ui/Credits'
import { Panels } from './ui/Panels'
import { localLibrary } from './data/localLibrary'
import { detectTier } from './quality'
import { AccessibleControls, CabinetShelf, HoverHint, Loader, Toast, TimeSwitch, TopNav, useKeyboard } from './ui/Overlay'
import { useJazz } from './state/store'
import { TIERS, lowerTier } from './quality'

const forcedQuality = new URLSearchParams(location.search).has('quality')

/** A station that fails to load must never take the listening room down with it. */
class StationBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(err: unknown) {
    console.error('station failed', err)
    const s = useJazz.getState()
    s.set({ station: 'home' })
    s.showToast('This station could not be opened')
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

const systemReduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
void localLibrary.init()

/** Preferences that change how the room renders: quality tier and motion. */
function usePrefsEffects() {
  const quality = useJazz((s) => s.prefs.quality)
  const motion = useJazz((s) => s.prefs.motion)
  useEffect(() => {
    if (forcedQuality) return
    useJazz.getState().set({ tier: quality === 'auto' ? detectTier() : quality })
  }, [quality])
  useEffect(() => {
    useJazz.getState().set({ reducedMotion: motion === 'system' ? systemReduced : motion === 'reduced' })
  }, [motion])
}

export default function App() {
  useKeyboard()
  usePrefsEffects()
  const tier = useJazz((s) => s.tier)
  const mapRequested = useJazz((s) => s.mapRequested)
  const museumRequested = useJazz((s) => s.museumRequested)
  const museumInside = useJazz((s) => s.museumInside)
  const declines = useRef(0)
  return (
    <div className="app" data-tier={tier}>
      <h1 className="sr-only">JazzTor — Toronto listening room</h1>
      <Canvas
        className="stage"
        shadows={{ type: THREE.PCFSoftShadowMap }}
        dpr={TIERS[tier].dpr}
        camera={{ fov: 40, near: 0.02, far: 1600, position: [0, 1.2, 1] }}
        gl={{ antialias: !TIERS[tier].post, powerPreference: 'high-performance', stencil: false }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.NoToneMapping
          gl.outputColorSpace = THREE.SRGBColorSpace
          // reading every program's info log forces each link to finish synchronously (15 s of main-thread stall when the
          // museum compiles ~100 programs); without it KHR_parallel_shader_compile links them in the background
          gl.debug.checkShaderErrors = new URLSearchParams(location.search).has('shaderdebug')
        }}
      >
        {/* step down a tier when the device can't sustain the frame rate (auto mode only) */}
        <PerformanceMonitor
          flipflops={3}
          onDecline={() => {
            if (forcedQuality || !useJazz.getState().loaded) return
            if (++declines.current < 2) return
            declines.current = 0
            const s = useJazz.getState()
            if (s.tier === 'low') return
            s.set({ tier: lowerTier(s.tier) })
            s.showToast('Adjusting the room to this device')
          }}
        />
        <Suspense fallback={null}>
          <Experience />
          <PlayerConsole />
        </Suspense>
        {museumRequested && (
          <StationBoundary>
            <Suspense fallback={null}>
              <MuseumWorld />
            </Suspense>
          </StationBoundary>
        )}
        {mapRequested && (
          <StationBoundary>
            <Suspense fallback={null}>
              <MapStation />
            </Suspense>
          </StationBoundary>
        )}
      </Canvas>
      <TopNav />
      {/* the listening room's own controls are inert while the camera is inside the museum */}
      {/* (the time switch stays live everywhere: in the museum it sets the light outside the Toronto window) */}
      <TimeSwitch />
      <Credits />
      <div className="home-layer" ref={(el) => el?.toggleAttribute('inert', museumInside)} aria-hidden={museumInside || undefined}>
        <AccessibleControls />
      </div>
      <MuseumUI />
      <MapPanel />
      <NowPlaying />
      <SleeveCaption />
      <InstrumentCard />
      <CabinetShelf />
      <Panels />
      <PlayerBar />
      <HoverHint />
      <Toast />
      <Loader />
    </div>
  )
}
