import React from 'react'
import { createRoot } from 'react-dom/client'
import { Meteor } from 'meteor/meteor'
import { BrowserRouter } from 'react-router-dom'
import { App } from '/imports/ui/App'
import { QueryProvider } from '/imports/lib/providers/query-provider'

Meteor.startup(() => {
  const container = document.getElementById('react-target')
  const root = createRoot(container!)
  root.render(
    <QueryProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryProvider>,
  )
})
