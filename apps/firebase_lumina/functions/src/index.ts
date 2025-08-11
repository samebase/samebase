import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { getFirestore } from 'firebase-admin/firestore'
import { initializeApp } from 'firebase-admin/app'

// Initialize Firebase Admin
initializeApp()

const db = getFirestore()

/**
 * GitHub API integration class
 */
class GitHubAPI {
  private accessToken: string

  /**
   * Constructor for GitHubAPI
   * @param {string} accessToken GitHub access token
   */
  constructor(accessToken: string) {
    this.accessToken = accessToken
  }

  /**
   * Make a request to GitHub API
   * @param {string} endpoint API endpoint
   * @return {Promise<any>} API response
   */
  private async makeRequest<T>(endpoint: string): Promise<T> {
    const response = await fetch(`https://api.github.com${endpoint}`, {
      headers: {
        Authorization: `token ${this.accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    if (!response.ok) {
      const errorData = await response.text()
      throw new HttpsError(
        'internal',
        `GitHub API error: ${response.status} ` + `${response.statusText} - ${errorData}`,
      )
    }

    return response.json()
  }

  /**
   * Get user repositories
   * @param {number} perPage Number of repos per page
   * @return {Promise<any>} Repository list
   */
  async getUserRepositories(perPage = 100) {
    return this.makeRequest(`/user/repos?per_page=${perPage}&sort=updated`)
  }

  /**
   * Get repository details
   * @param {string} owner Repository owner
   * @param {string} repo Repository name
   * @return {Promise<any>} Repository details
   */
  async getRepository(owner: string, repo: string) {
    return this.makeRequest(`/repos/${owner}/${repo}`)
  }

  /**
   * Get repository contents
   * @param {string} owner Repository owner
   * @param {string} repo Repository name
   * @param {string} path File path
   * @return {Promise<any>} Repository contents
   */
  async getRepositoryContents(owner: string, repo: string, path = '') {
    return this.makeRequest(`/repos/${owner}/${repo}/contents/${path}`)
  }

  /**
   * Get file content
   * @param {string} owner Repository owner
   * @param {string} repo Repository name
   * @param {string} path File path
   * @return {Promise<any>} File content
   */
  async getFileContent(owner: string, repo: string, path: string) {
    const response = await this.makeRequest<any>(`/repos/${owner}/${repo}/contents/${path}`)

    if (response.type !== 'file') {
      throw new HttpsError('invalid-argument', 'Path is not a file')
    }

    return {
      content: response.content,
      encoding: response.encoding,
      sha: response.sha,
    }
  }
}

/**
 * Helper to get user's GitHub token from Firestore
 * @param {string} uid User ID
 * @return {Promise<string>} GitHub access token
 */
async function getUserGitHubToken(uid: string): Promise<string> {
  const userDoc = await db.collection('users').doc(uid).get()
  if (!userDoc.exists) {
    throw new HttpsError('not-found', 'User not found')
  }

  const userData = userDoc.data()
  const githubAccessToken = userData?.githubAccessToken

  if (!githubAccessToken) {
    throw new HttpsError('failed-precondition', 'GitHub access token not found')
  }

  return githubAccessToken
}

/**
 * Cloud Function: List GitHub repositories
 */
export const listGitHubRepositories = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated')
  }

  try {
    const githubToken = await getUserGitHubToken(request.auth.uid)
    const githubAPI = new GitHubAPI(githubToken)
    const repositories = await githubAPI.getUserRepositories()

    return { repositories }
  } catch (error: any) {
    console.error('Error listing repositories:', error)
    throw new HttpsError('internal', error.message || 'Failed to list repositories')
  }
})

/**
 * Cloud Function: Get repository details
 */
export const getRepositoryDetails = onCall<{ owner: string; repo: string }>(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated')
  }

  const { owner, repo } = request.data
  if (!owner || !repo) {
    throw new HttpsError('invalid-argument', 'Owner and repo are required')
  }

  try {
    const githubToken = await getUserGitHubToken(request.auth.uid)
    const githubAPI = new GitHubAPI(githubToken)
    const repository = await githubAPI.getRepository(owner, repo)

    return { repository }
  } catch (error: any) {
    console.error('Error getting repository details:', error)
    throw new HttpsError('internal', error.message || 'Failed to get repository details')
  }
})

/**
 * Cloud Function: Get repository contents
 */
export const getRepositoryContents = onCall<{ owner: string; repo: string; path?: string }>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    const { owner, repo, path = '' } = request.data
    if (!owner || !repo) {
      throw new HttpsError('invalid-argument', 'Owner and repo are required')
    }

    try {
      const githubToken = await getUserGitHubToken(request.auth.uid)
      const githubAPI = new GitHubAPI(githubToken)
      const contents = await githubAPI.getRepositoryContents(owner, repo, path)

      return { contents }
    } catch (error: any) {
      console.error('Error getting repository contents:', error)
      throw new HttpsError('internal', error.message || 'Failed to get repository contents')
    }
  },
)

/**
 * Cloud Function: Get file content
 */
export const getFileContent = onCall<{ owner: string; repo: string; path: string }>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    const { owner, repo, path } = request.data
    if (!owner || !repo || !path) {
      throw new HttpsError('invalid-argument', 'Owner, repo, and path are required')
    }

    try {
      const githubToken = await getUserGitHubToken(request.auth.uid)
      const githubAPI = new GitHubAPI(githubToken)
      const fileContent = await githubAPI.getFileContent(owner, repo, path)

      return { fileContent }
    } catch (error: any) {
      console.error('Error getting file content:', error)
      throw new HttpsError('internal', error.message || 'Failed to get file content')
    }
  },
)

/**
 * Cloud Function: Validate vault connection
 */
export const validateVaultConnection = onCall<{ repositoryFullName: string }>(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated')
  }

  const { repositoryFullName } = request.data
  if (!repositoryFullName) {
    throw new HttpsError('invalid-argument', 'Repository full name is required')
  }

  try {
    // Check if vault already exists
    const existingVault = await db
      .collection('vaults')
      .where('userId', '==', request.auth.uid)
      .where('repositoryFullName', '==', repositoryFullName)
      .get()

    if (!existingVault.empty) {
      throw new HttpsError('already-exists', 'Repository is already connected')
    }

    // Validate repository access
    const [owner, repo] = repositoryFullName.split('/')
    const githubToken = await getUserGitHubToken(request.auth.uid)
    const githubAPI = new GitHubAPI(githubToken)
    const repository = (await githubAPI.getRepository(owner, repo)) as any

    return {
      valid: true,
      repository: {
        id: repository.id,
        name: repository.name,
        full_name: repository.full_name,
        private: repository.private,
        owner: repository.owner,
      },
    }
  } catch (error: any) {
    console.error('Error validating vault connection:', error)
    throw new HttpsError('internal', error.message || 'Failed to validate vault connection')
  }
})

/**
 * Firestore trigger: Log vault creation
 */
export const onVaultCreated = onDocumentCreated('vaults/{vaultId}', async (event) => {
  const vaultData = event.data?.data()
  if (!vaultData) return

  console.log(
    `New vault created: ${vaultData.repositoryFullName} ` + `for user ${vaultData.userId}`,
  )

  // Could add additional logic here like:
  // - Send welcome email
  // - Initialize default settings
  // - Create audit log entry
})
