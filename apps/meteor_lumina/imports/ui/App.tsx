import React from 'react'
import { Hello } from './Hello'
import { Info } from './Info'
import { useTracker } from 'meteor/react-meteor-data'
import { Meteor } from 'meteor/meteor'
import { Button } from '/imports/components/ui/button'
import { Layout } from './Layout'
import { Route, Routes } from 'react-router-dom'
import { SignInForm } from './SignInForm'
import { VaultDashboard } from './VaultDashboard'
import { AddRepository } from './AddRepository'

export function App() {
  const user = useTracker(() => Meteor.user())

  return (
    <Layout>
      <>
        {user ? (
          <Routes>
            <Route path="/" element={<VaultDashboard />} />
            <Route path="/add" element={<AddRepository />} />
            {/* <Route path="/vault/:owner/:repoName" element={<FileView />} /> */}
            {/* <Route path="/vault/:owner/:repoName/*" element={<FileView />} /> */}
          </Routes>
        ) : (
          <SignInForm />
        )}
      </>
    </Layout>
  )
}
