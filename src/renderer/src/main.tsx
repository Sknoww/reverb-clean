// JetBrains Mono ships as unicode-range subsets, so only the latin ones are actually fetched.
import '@fontsource-variable/jetbrains-mono/wght.css'
import './assets/main.css'

import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

createRoot(document.getElementById('root') as HTMLElement).render(
  <MemoryRouter>
    <App />
  </MemoryRouter>
)
