import React from 'react'
import Auth from './components/Auth'
import Debug from './components/Debug'
import { useAuth } from './hooks/useAuth'

function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
        }}
      >
        <Debug />
        <div>Loading...</div>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '2rem',
      }}
    >
      <Debug />
      {user ? (
        <div style={{ textAlign: 'center', width: '100%', maxWidth: '600px' }}>
          <h1
            style={{
              fontSize: '3rem',
              marginBottom: '2rem',
              fontWeight: '300',
            }}
          >
            Welcome to Lumina! 🚀
          </h1>
          <Auth />
        </div>
      ) : (
        <div style={{ textAlign: 'center', width: '100%', maxWidth: '600px' }}>
          <h1
            style={{
              fontSize: '3rem',
              marginBottom: '2rem',
              fontWeight: '300',
            }}
          >
            Lumina
          </h1>
          <Auth />
        </div>
      )}
    </div>
  )
}

export default App
