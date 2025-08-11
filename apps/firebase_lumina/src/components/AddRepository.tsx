import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Link } from 'react-router-dom'
import { GitHubLogoIcon, ClockIcon } from '@radix-ui/react-icons'
import { useVaults, useGitHubRepositories } from '@/hooks/useVaults'
import { formatTimeAgo } from '@/lib/github'

const fuzzySearchWithHighlight = (
  query: string,
  target: string,
): { matches: boolean; highlightedText: React.ReactNode } => {
  if (!query.trim()) {
    return { matches: true, highlightedText: target }
  }

  const queryLower = query.toLowerCase()
  const targetLower = target.toLowerCase()
  const queryChars = queryLower.split('')
  const targetChars = targetLower.split('')

  let queryIndex = 0
  const matches: number[] = []

  for (let i = 0; i < targetChars.length && queryIndex < queryChars.length; i++) {
    if (targetChars[i] === queryChars[queryIndex]) {
      matches.push(i)
      queryIndex++
    }
  }

  if (queryIndex < queryChars.length) {
    return { matches: false, highlightedText: target }
  }

  const elements: React.ReactNode[] = []
  let lastIndex = 0

  matches.forEach((matchIndex, i) => {
    if (matchIndex > lastIndex) {
      elements.push(target.slice(lastIndex, matchIndex))
    }
    elements.push(
      <mark key={i} className="bg-yellow-200 text-yellow-900 px-0">
        {target[matchIndex]}
      </mark>,
    )
    lastIndex = matchIndex + 1
  })

  if (lastIndex < target.length) {
    elements.push(target.slice(lastIndex))
  }

  return { matches: true, highlightedText: <span>{elements}</span> }
}

export function AddRepository() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [connectingRepo, setConnectingRepo] = useState<string | null>(null)

  const { repositories, loading: repoLoading, error: repoError } = useGitHubRepositories()
  const { vaults, connectRepository, error: vaultError } = useVaults()

  const loading = repoLoading
  const error = repoError || vaultError

  const connectedVaults = vaults || []

  const filteredRepositories = repositories
    .filter(repo => {
      // Filter out already connected repos
      const isConnected = connectedVaults.some(vault => vault.repositoryFullName === repo.full_name)
      return !isConnected
    })
    .filter(repo => {
      if (!searchQuery.trim()) return true

      const repoName = repo.name

      // Search only repo name
      const repoMatch = fuzzySearchWithHighlight(searchQuery, repoName).matches

      return repoMatch
    })

  const handleConnectRepository = async (repository: any) => {
    setConnectingRepo(repository.full_name)

    try {
      await connectRepository(repository)
      navigate('/')
    } catch (err: any) {
      console.error('Error connecting repository:', err)
      // Error is handled by the useVaults hook
    } finally {
      setConnectingRepo(null)
    }
  }

  return (
    <div className="container py-6 h-screen flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 flex-shrink-0">
        <div className="flex items-center gap-2">
          <GitHubLogoIcon className="h-5 w-5 sm:h-6 sm:w-6" />
          <h1 className="text-xl sm:text-2xl font-semibold">Connect a Repository</h1>
        </div>
        <Button variant="outline" asChild className="shrink-0">
          <Link to="/">
            <span className="sm:hidden">Back</span>
            <span className="hidden sm:inline">Back to Vaults</span>
          </Link>
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-4 text-sm text-red-600 bg-red-50 rounded-md border border-red-200 flex-shrink-0">
          {error}
        </div>
      )}

      <div className="mb-6 flex-shrink-0">
        <Input
          placeholder="Search repositories..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="max-w-md"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-center py-8">
            <div className="text-muted-foreground">Loading repositories...</div>
          </div>
        ) : filteredRepositories.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-muted-foreground">
              {searchQuery ? 'No repositories match your search.' : 'No repositories found.'}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredRepositories.map(repo => (
              <div
                key={repo.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex-shrink-0">
                    <GitHubLogoIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground truncate">
                      {fuzzySearchWithHighlight(searchQuery, repo.name).highlightedText}
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-1">
                      <ClockIcon className="h-3 w-3" />
                      {formatTimeAgo(new Date(repo.updated_at).getTime())}
                      {repo.private && (
                        <>
                          <span className="mx-1">•</span>
                          <span>Private</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleConnectRepository(repo)}
                  disabled={connectingRepo === repo.full_name}
                  className="flex-shrink-0"
                >
                  {connectingRepo === repo.full_name ? 'Connecting...' : 'Connect'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
