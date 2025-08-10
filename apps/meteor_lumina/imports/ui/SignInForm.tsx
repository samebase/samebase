import React from 'react'
import { Button } from '/imports/components/ui/button'
import { Meteor } from 'meteor/meteor'
import { GitHubLogoIcon } from '@radix-ui/react-icons'

export function SignInForm() {
  return (
    <div className="container my-auto">
      <div className="max-w-[384px] mx-auto flex flex-col my-auto gap-4 pb-8">
        <h2 className="font-semibold text-2xl tracking-tight">If Notion and Obsidian had a baby</h2>{' '}
        <h3>
          that <b>stores everything on GitHub</b> so there's 0.00018% lock-in
        </h3>
        <SignInWithGitHub />
      </div>
    </div>
  )
}

export function SignInWithGitHub() {
  const handleGitHubSignIn = () => {
    Meteor.loginWithGithub(
      {
        requestPermissions: ['user:email', 'repo'],
      },
      error => {
        if (error) {
          console.error('GitHub login error:', error)
        }
      },
    )
  }

  return (
    <Button className="flex-1" variant="outline" type="button" onClick={handleGitHubSignIn}>
      <GitHubLogoIcon className="mr-2 h-4 w-4" /> GitHub
    </Button>
  )
}
