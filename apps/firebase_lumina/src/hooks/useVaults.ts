import { useState, useEffect } from 'react'
import { useAuth } from './useAuth'
import {
  getUserVaults,
  createVault,
  getVaultByRepository,
  deleteVault,
  type Vault,
} from '@/lib/firestore'
import { cloudFunctions, handleFunctionError, type GitHubRepository } from '@/lib/functions'

export const useVaults = () => {
  const { user } = useAuth()
  const [vaults, setVaults] = useState<Vault[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchVaults = async () => {
    if (!user?.uid) {
      setVaults([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const userVaults = await getUserVaults(user.uid)
      setVaults(userVaults)
    } catch (err: any) {
      console.error('Error fetching vaults:', err)
      setError(err.message || 'Failed to fetch vaults')
      setVaults([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchVaults()
  }, [user?.uid])

  const connectRepository = async (repository: GitHubRepository) => {
    if (!user?.uid) {
      throw new Error('User not authenticated')
    }

    try {
      // Validate connection using Cloud Function (also checks for duplicates)
      const result = await cloudFunctions.validateVaultConnection({
        repositoryFullName: repository.full_name,
      })

      if (!result.data.valid) {
        throw new Error('Unable to validate repository connection')
      }

      // Create new vault using validated repository data
      const vaultData = {
        userId: user.uid,
        repositoryFullName: repository.full_name,
        repositoryId: repository.id.toString(),
        repositoryName: repository.name,
        repositoryOwner: repository.owner.login,
        isPrivate: repository.private,
      }

      const vaultId = await createVault(vaultData)

      // Refresh vaults list
      await fetchVaults()

      return vaultId
    } catch (err: any) {
      console.error('Error connecting repository:', err)
      const errorMessage = handleFunctionError(err)
      throw new Error(errorMessage)
    }
  }

  const disconnectRepository = async (vaultId: string) => {
    if (!user?.uid) {
      throw new Error('User not authenticated')
    }

    try {
      await deleteVault(vaultId)
      // Refresh vaults list
      await fetchVaults()
    } catch (err: any) {
      console.error('Error disconnecting repository:', err)
      throw new Error(err.message || 'Failed to disconnect repository')
    }
  }

  return {
    vaults,
    loading,
    error,
    connectRepository,
    disconnectRepository,
    refreshVaults: fetchVaults,
  }
}

export const useGitHubRepositories = () => {
  const { user } = useAuth()
  const [repositories, setRepositories] = useState<GitHubRepository[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRepositories = async () => {
    if (!user?.uid) {
      setError('User not authenticated')
      return
    }

    try {
      setLoading(true)
      setError(null)

      // Use Cloud Function instead of direct GitHub API call
      const result = await cloudFunctions.listGitHubRepositories()
      setRepositories(result.data.repositories)
    } catch (err: any) {
      console.error('Error fetching repositories:', err)
      const errorMessage = handleFunctionError(err)
      setError(errorMessage)
      setRepositories([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user?.uid) {
      fetchRepositories()
    }
  }, [user?.uid])

  return {
    repositories,
    loading,
    error,
    refreshRepositories: fetchRepositories,
  }
}
