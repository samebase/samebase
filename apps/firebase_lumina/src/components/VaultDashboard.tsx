import { Button } from '@/components/ui/button'
import { Link } from 'react-router-dom'
import { GitHubLogoIcon, PlusIcon, FileTextIcon, ClockIcon } from '@radix-ui/react-icons'
import { useVaults } from '@/hooks/useVaults'
import { formatTimeAgo } from '@/lib/github'

export function VaultDashboard() {
  const { vaults, loading, error } = useVaults()

  if (loading) {
    return (
      <div className="container py-6 max-w-2xl mx-auto">
        <div className="text-center py-8">
          <div className="text-muted-foreground">Loading your vaults...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container py-6 max-w-2xl mx-auto">
        <div className="text-center py-8">
          <div className="text-red-600 mb-4">Error loading vaults: {error}</div>
          <Button onClick={() => window.location.reload()}>Try Again</Button>
        </div>
      </div>
    )
  }

  if (!vaults || vaults.length === 0) {
    return (
      <div className="container py-6 max-w-2xl mx-auto">
        <div className="text-center space-y-6">
          <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center">
            <GitHubLogoIcon className="h-12 w-12 text-muted-foreground" />
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-bold">Connect your first GitHub repository</h1>
            <p className="text-lg text-muted-foreground">
              Once connected, you'll be able to edit files directly in your browser and collaborate
              with others in real-time.
            </p>
          </div>

          <Button size="lg" className="px-8 py-6 text-lg" asChild>
            <Link to="/add">
              <PlusIcon className="h-5 w-5 mr-2" />
              Connect Your First Repository
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="container py-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <GitHubLogoIcon className="h-5 w-5 sm:h-6 sm:w-6" />
          <h1 className="text-xl sm:text-2xl font-semibold">Your Vaults</h1>
        </div>
        <Button asChild className="shrink-0">
          <Link to="/add">
            <PlusIcon className="h-4 w-4 mr-2" />
            <span className="sm:inline">Connect Repository</span>
          </Link>
        </Button>
      </div>

      <div className="space-y-2">
        {vaults.map(vault => (
          <div
            key={vault.id}
            className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
          >
            <Link
              to={`/vault/${vault.repositoryFullName}`}
              className="flex items-center gap-3 flex-1 min-w-0"
            >
              <div className="flex-shrink-0">
                <FileTextIcon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-foreground truncate">
                  {vault.repositoryFullName}
                </div>
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                  <ClockIcon className="h-3 w-3" />
                  {formatTimeAgo(vault.createdAt.toDate().getTime())}
                  {vault.isPrivate && (
                    <>
                      <span className="mx-1">•</span>
                      <span>Private</span>
                    </>
                  )}
                </div>
              </div>
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
