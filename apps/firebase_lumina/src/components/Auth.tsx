import React from 'react'
import { useAuth } from '../hooks/useAuth'

const Auth: React.FC = () => {
  const { user, userData, loading, signInWithGitHub, signOut } = useAuth()

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '200px',
        }}
      >
        <div>Loading...</div>
      </div>
    )
  }

  if (user && userData) {
    return (
      <div
        style={{
          padding: '2rem',
          borderRadius: '12px',
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          color: 'white',
          maxWidth: '400px',
          margin: '0 auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
          {userData.photoURL && (
            <img
              src={userData.photoURL}
              alt="Profile"
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                marginRight: '1rem',
              }}
            />
          )}
          <div>
            <h3 style={{ margin: 0 }}>{userData.displayName}</h3>
            <p style={{ margin: 0, opacity: 0.8, fontSize: '0.9rem' }}>
              @{userData.githubUsername}
            </p>
          </div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <p style={{ margin: '0.5rem 0', fontSize: '0.9rem' }}>
            <strong>Email:</strong> {userData.email}
          </p>
          <p style={{ margin: '0.5rem 0', fontSize: '0.9rem' }}>
            <strong>GitHub Access:</strong>{' '}
            {userData.githubAccessToken ? '✅ Connected' : '❌ No token'}
          </p>
        </div>

        <button
          onClick={signOut}
          style={{
            background: 'rgba(255, 255, 255, 0.2)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            color: 'white',
            padding: '0.75rem 1.5rem',
            borderRadius: '8px',
            cursor: 'pointer',
            width: '100%',
            fontSize: '1rem',
          }}
        >
          Sign Out
        </button>
      </div>
    )
  }

  return (
    <div
      style={{
        padding: '2rem',
        borderRadius: '12px',
        background: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
        color: 'white',
        maxWidth: '400px',
        margin: '0 auto',
        textAlign: 'center',
      }}
    >
      <h2 style={{ marginBottom: '1rem' }}>Welcome to Lumina</h2>
      <p style={{ marginBottom: '2rem', opacity: 0.9 }}>
        Sign in with GitHub to access your repositories
      </p>

      <button
        onClick={signInWithGitHub}
        style={{
          background: '#24292e',
          border: 'none',
          color: 'white',
          padding: '0.75rem 1.5rem',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          margin: '0 auto',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
        </svg>
        Sign in with GitHub
      </button>
    </div>
  )
}

export default Auth
