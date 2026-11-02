import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { useJazz, visibleAlbums, shelfAlbums } from './state/store'
import { deck } from './scene/deck'
import { audio } from './audio/engine'

if (import.meta.env.DEV) Object.assign(window, { __jazz: { useJazz, deck, audio, visibleAlbums, shelfAlbums } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
