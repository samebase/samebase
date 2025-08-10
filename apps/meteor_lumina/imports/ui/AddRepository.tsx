import React, { useState, useEffect } from 'react'
import { useTracker } from 'meteor/react-meteor-data'
import { Meteor } from 'meteor/meteor'
import { useNavigate } from 'react-router-dom'
import { Button } from '/imports/components/ui/button'
import { Input } from '/imports/components/ui/input'
import { Link } from 'react-router-dom'
import { GitHubLogoIcon, ClockIcon } from '@radix-ui/react-icons'

const formatTimeAgo = (timestamp: number) => {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (minutes < 60) {
    return `${minutes}m ago`
  } else if (hours < 24) {
    return `${hours}h ago`
  } else {
    return `${days}d ago`
  }
}

const fuzzySearchWithHighlight = (
  query: string,
  target: string,
): {
  matches: boolean
  highlightedText: JSX.Element
} => {
  if (!query.trim()) {
    return { matches: true, highlightedText: <span>{target}</span> }
  }

  const searchChars = query.toLowerCase().replace(/\s+/g, '').split('')
  const targetChars = target.toLowerCase().split('')
  const targetOriginal = target.split('')

  const matchedIndices: number[] = []
  let searchIndex = 0

  for (let i = 0; i < targetChars.length && searchIndex < searchChars.length; i++) {
    if (targetChars[i] === searchChars[searchIndex]) {
      matchedIndices.push(i)
      searchIndex++
    }
  }

  const matches = searchIndex === searchChars.length

  if (!matches) {
    return { matches: false, highlightedText: <span>{target}</span> }
  }

  // Build highlighted JSX
  const elements: JSX.Element[] = []
  let lastIndex = 0

  matchedIndices.forEach((index, i) => {
    // Add non-highlighted text before this match
    if (index > lastIndex) {
      elements.push(
        <span key={`text-${i}`}>{targetOriginal.slice(lastIndex, index).join('')}</span>,
      )
    }

    // Add highlighted character
    elements.push(
      <mark key={`mark-${i}`} className="bg-yellow-200">
        {targetOriginal[index]}
      </mark>,
    )

    lastIndex = index + 1
  })

  // Add remaining text
  if (lastIndex < targetOriginal.length) {
    elements.push(<span key="text-end">{targetOriginal.slice(lastIndex).join('')}</span>)
  }

  return { matches: true, highlightedText: <span>{elements}</span> }
}

export function AddRepository() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [repositories, setRepositories] = useState<any[]>([])
  const [vaults, setVaults] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)

        // Fetch both repositories and vaults in parallel
        const [repos, userVaults] = await Promise.all([
          Meteor.callAsync('listGitHubRepositories'),
          Meteor.callAsync('getUserVaults'),
        ])

        setRepositories(repos)
        setVaults(userVaults || [])
      } catch (err: any) {
        console.error('Error fetching data:', err)
        setError(err.reason || 'Failed to fetch data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const connectedVaults = vaults || []

  const filteredRepositories = repositories
    .filter(repo => {
      // Filter out already connected repos
      const isConnected = connectedVaults.some(
        (vault: any) => vault.repositoryFullName === repo.full_name,
      )
      return !isConnected
    })
    .filter(repo => {
      if (!searchQuery.trim()) return true

      const repoName = repo.name

      // Search only repo name
      const repoMatch = fuzzySearchWithHighlight(searchQuery, repoName).matches

      return repoMatch
    })

  const handleConnectRepository = async (repositoryFullName: string) => {
    try {
      await Meteor.callAsync('connectRepository', repositoryFullName)
      navigate('/')
    } catch (err: any) {
      console.error('Error connecting repository:', err)
      setError(err.reason || 'Failed to connect repository')
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
        {loading && repositories.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">Loading repositories...</div>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredRepositories.map(repo => {
              const ownerName = repo.full_name.split('/')[0]
              const repoName = repo.name

              const repoHighlight = fuzzySearchWithHighlight(searchQuery, repoName)

              return (
                <div
                  key={repo.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col items-start">
                        <span className="text-sm text-muted-foreground">{ownerName}/</span>
                        <h3 className="font-semibold truncate">
                          <span className="flex items-center gap-1">
                            {repoHighlight.highlightedText}
                          </span>
                        </h3>
                      </div>
                    </div>

                    <div className="flex flex-col items-end text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <ClockIcon className="h-3 w-3" />
                        <span className="text-xs">
                          {formatTimeAgo(new Date(repo.updated_at).getTime())}
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => handleConnectRepository(repo.full_name)}
                      >
                        Connect
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {filteredRepositories.length === 0 && !loading && !error && repositories.length > 0 && (
          <div className="text-center py-8">
            <div className="text-muted-foreground">No repositories match your search</div>
          </div>
        )}

        {repositories.length === 0 && !loading && !error && (
          <div className="text-center py-8">
            <div className="text-muted-foreground">No repositories found</div>
          </div>
        )}
      </div>
    </div>
  )
}
