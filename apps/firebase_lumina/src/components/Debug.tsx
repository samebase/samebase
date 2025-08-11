import React from 'react'

const Debug: React.FC = () => {
  return null
  return (
    <div
      style={{
        position: 'fixed',
        top: '10px',
        right: '10px',
        background: 'rgba(0,0,0,0.8)',
        color: 'white',
        padding: '1rem',
        borderRadius: '8px',
        fontSize: '12px',
        maxWidth: '300px',
      }}
    >
      <h4>Firebase Config Debug:</h4>
      <p>
        <strong>API Key:</strong> {import.meta.env.VITE_FIREBASE_API_KEY ? '✅ Set' : '❌ Missing'}
      </p>
      <p>
        <strong>Auth Domain:</strong> {import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '❌ Missing'}
      </p>
      <p>
        <strong>Project ID:</strong> {import.meta.env.VITE_FIREBASE_PROJECT_ID || '❌ Missing'}
      </p>
      <p>
        <strong>App ID:</strong> {import.meta.env.VITE_FIREBASE_APP_ID ? '✅ Set' : '❌ Missing'}
      </p>
    </div>
  )
}

export default Debug
