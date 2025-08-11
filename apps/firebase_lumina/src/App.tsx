import React from 'react'
import Auth from './components/Auth'
import Debug from './components/Debug'
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 p-8">
      <Debug />
      <div className="text-center w-full max-w-2xl">
        <h1 className="text-5xl font-light mb-8 text-white">
          {user ? 'Welcome to Lumina! 🚀' : 'Lumina'}
        </h1>
        <Auth />
      </div>
    </div>
  )
}

export default App
