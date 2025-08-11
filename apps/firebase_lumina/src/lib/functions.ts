import { getFunctions, httpsCallable } from 'firebase/functions'
import app from './firebase'

// Initialize Cloud Functions
const functions = getFunctions(app)

// Types for Cloud Function responses
export interface GitHubRepository {
  id: number
  name: string
  full_name: string
  private: boolean
  owner: {
    login: string
    avatar_url: string
  }
  description: string | null
  updated_at: string
  language: string | null
  stargazers_count: number
  forks_count: number
  default_branch: string
}

export interface FileContent {
  content: string
  encoding: string
  sha: string
}

// Cloud Function wrappers
export const cloudFunctions = {
  // List user's GitHub repositories
  listGitHubRepositories: httpsCallable<{}, { repositories: GitHubRepository[] }>(
    functions,
    'listGitHubRepositories',
  ),

  // Get repository details
  getRepositoryDetails: httpsCallable<
    { owner: string; repo: string },
    { repository: GitHubRepository }
  >(functions, 'getRepositoryDetails'),

  // Get repository contents (files/folders)
  getRepositoryContents: httpsCallable<
    { owner: string; repo: string; path?: string },
    { contents: any[] }
  >(functions, 'getRepositoryContents'),

  // Get file content
  getFileContent: httpsCallable<
    { owner: string; repo: string; path: string },
    { fileContent: FileContent }
  >(functions, 'getFileContent'),

  // Validate vault connection before creating
  validateVaultConnection: httpsCallable<
    { repositoryFullName: string },
    { valid: boolean; repository: GitHubRepository }
  >(functions, 'validateVaultConnection'),

  // Get repository tree (file structure)
  getRepositoryTree: httpsCallable<{ owner: string; repo: string }, { tree: any[] }>(
    functions,
    'getRepositoryTree',
  ),

  // Get file for editing
  getFileForEditing: httpsCallable<
    { repositoryFullName: string; filePath: string },
    { version: number; content: string; sha: string }
  >(functions, 'getFileForEditing'),
}

// Helper function to handle Cloud Function errors
export const handleFunctionError = (error: any): string => {
  console.error('Cloud Function error:', error)

  if (error.code === 'unauthenticated') {
    return 'Please sign in to continue'
  }

  if (error.code === 'permission-denied') {
    return 'You do not have permission to perform this action'
  }

  if (error.code === 'not-found') {
    return 'Resource not found'
  }

  if (error.code === 'already-exists') {
    return 'Repository is already connected'
  }

  if (error.code === 'failed-precondition') {
    return 'GitHub access token not found. Please sign in again.'
  }

  return error.message || 'An unexpected error occurred'
}
