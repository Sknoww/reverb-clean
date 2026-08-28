import { useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import './app.css'
import Dashboard, {
  CommandScreen,
  ConsoleScreen,
  FlowScreen,
  SettingsScreen,
  SyncScreen
} from './pages/dashboard/Dashboard'

function App(): JSX.Element {
  useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])

  return (
    <div className="app">
      <Routes>
        {/* Every screen is a child of the layout route. */}
        <Route element={<Dashboard />}>
          <Route path="/" element={<CommandScreen />} />
          <Route path="/flows" element={<FlowScreen />} />
          <Route path="/console" element={<ConsoleScreen />} />
          <Route path="/sync" element={<SyncScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
        </Route>
      </Routes>
    </div>
  )
}

export default App
