import React from 'react'
import { useAuth } from '../hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Github } from 'lucide-react'

const Auth: React.FC = () => {
  const { user, userData, loading, signInWithGitHub, signOut } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div>Loading...</div>
      </div>
    )
  }

  if (user && userData) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <div className="flex items-center space-x-4">
            <Avatar>
              <AvatarImage src={userData.photoURL || ''} alt="Profile" />
              <AvatarFallback>
                {userData.displayName?.charAt(0) || userData.email?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-lg">{userData.displayName}</CardTitle>
              <p className="text-sm text-muted-foreground">@{userData.githubUsername}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 text-sm">
            <p>
              <strong>Email:</strong> {userData.email}
            </p>
            <p>
              <strong>GitHub Access:</strong>{' '}
              {userData.githubAccessToken ? (
                <span className="text-green-600">✅ Connected</span>
              ) : (
                <span className="text-red-600">❌ No token</span>
              )}
            </p>
          </div>
          <Button onClick={signOut} variant="outline" className="w-full">
            Sign Out
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md mx-auto text-center">
      <CardHeader>
        <CardTitle className="text-2xl">Welcome to Lumina</CardTitle>
        <p className="text-muted-foreground">Sign in with GitHub to access your repositories</p>
      </CardHeader>
      <CardContent>
        <Button onClick={signInWithGitHub} className="w-full" size="lg">
          <Github className="mr-2 h-5 w-5" />
          Sign in with GitHub
        </Button>
      </CardContent>
    </Card>
  )
}

export default Auth
