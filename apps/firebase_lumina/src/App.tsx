import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Auth from './components/Auth'
import Debug from './components/Debug'
import { VaultDashboard } from './components/VaultDashboard'
import { AddRepository } from './components/AddRepository'
import { FileView } from './components/FileView'
import { useAuth } from './hooks/useAuth'

function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
        <Debug />
        <div className="text-white">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 p-8">
        <Debug />
        <div className="text-center w-full max-w-2xl">
          <h1 className="text-5xl font-light mb-8 text-white">Lumina</h1>
          <Auth />
        </div>
      </div>
    )
  }

  return (
    <Router>
      <div className="min-h-screen bg-background">
        <Debug />
        <Routes>
          <Route path="/" element={<VaultDashboard />} />
          <Route path="/add" element={<AddRepository />} />
          <Route path="/vault/:owner/:repoName/*" element={<FileView />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App
