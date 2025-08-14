import { schema, Typesaurus } from 'typesaurus'
import { Timestamp } from 'firebase/firestore'

// User schema - represents authenticated users with GitHub integration
export interface User {
  uid: string // Firebase Auth UID
  email: string
  displayName: string
  githubUsername: string
  githubAccessToken: string
  photoURL?: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

// Vault schema - represents connected GitHub repositories
export interface Vault {
  userId: string // Reference to User
  repositoryFullName: string // e.g., "owner/repo-name"
  repositoryId: string // GitHub repository ID
  repositoryName: string
  repositoryOwner: string
  isPrivate: boolean
  defaultBranch?: string
  description?: string
  language?: string
  stargazersCount?: number
  forksCount?: number
  createdAt: Timestamp
  updatedAt: Timestamp
}

// Collaborative updates for real-time editing
export interface CollaborativeUpdate {
  vaultId: string // Reference to Vault
  filePath: string
  version: number
  clientId: string
  changes: string // Serialized ChangeSet from CodeMirror
  userId: string // Reference to User
  timestamp: Timestamp
}

// File staging for tracking file modifications
export interface FileStaging {
  vaultId: string // Reference to Vault
  filePath: string
  content: string
  sha: string // Git SHA for version tracking
  version: number
  userId: string // Reference to User
  isModified: boolean
  lastModified: Timestamp
  createdAt: Timestamp
}

// Folder expansion state for UI persistence
export interface FolderExpansion {
  userId: string // Reference to User
  vaultId: string // Reference to Vault
  folderPath: string
  isExpanded: boolean
  updatedAt: Timestamp
}

// GitHub repository cache for performance
export interface RepositoryCache {
  repositoryFullName: string
  repositoryData: {
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
  treeData?: Array<{
    path: string
    type: 'blob' | 'tree'
    sha: string
    size?: number
  }>
  lastFetched: Timestamp
  expiresAt: Timestamp
}

// Define the database schema using Typesaurus
export const db = schema($ => ({
  users: $.collection<User>(),
  vaults: $.collection<Vault>(),
  collaborativeUpdates: $.collection<CollaborativeUpdate>(),
  fileStaging: $.collection<FileStaging>(),
  folderExpansions: $.collection<FolderExpansion>(),
  repositoryCache: $.collection<RepositoryCache>(),
}))

// Infer the schema type for type safety
export type Schema = Typesaurus.Schema<typeof db>

// Export collection references for easy access
export const {
  users,
  vaults,
  collaborativeUpdates,
  fileStaging,
  folderExpansions,
  repositoryCache,
} = db
