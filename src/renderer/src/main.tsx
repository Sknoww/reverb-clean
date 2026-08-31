import '@fontsource-variable/jetbrains-mono/wght.css'
import './assets/main.css'

import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import { RegionSelector } from './components/regionSelector'

const regionSelector = new URLSearchParams(window.location.search).has('regionSelector')

createRoot(document.getElementById('root') as HTMLElement).render(
  regionSelector ? (
    <RegionSelector />
  ) : (
    <MemoryRouter>
      <App />
    </MemoryRouter>
  )
)
