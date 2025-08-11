import React from 'react'

function App() {
  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white'
    }}>
      <div style={{ 
        textAlign: 'center',
        padding: '2rem',
        borderRadius: '12px',
        background: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
      }}>
        <h1 style={{ 
          fontSize: '3rem', 
          marginBottom: '1rem',
          fontWeight: '300'
        }}>
          Hello World! 🚀
        </h1>
        <p style={{ 
          fontSize: '1.2rem',
          opacity: 0.9,
          margin: 0
        }}>
          Firebase Lumina is now running
        </p>
      </div>
    </div>
  )
}

export default App
