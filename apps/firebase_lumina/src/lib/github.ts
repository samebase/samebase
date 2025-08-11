// GitHub API integration functions

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

export interface GitHubUser {
  login: string
  id: number
  avatar_url: string
  name: string
  email: string
}

export class GitHubAPI {
  private accessToken: string

  constructor(accessToken: string) {
    this.accessToken = accessToken
  }

  private async makeRequest<T>(endpoint: string): Promise<T> {
    const response = await fetch(`https://api.github.com${endpoint}`, {
      headers: {
        Authorization: `token ${this.accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(`GitHub API error: ${response.status} ${response.statusText} - ${errorData}`)
    }

    return response.json()
  }

  async getUser(): Promise<GitHubUser> {
    return this.makeRequest<GitHubUser>('/user')
  }

  async getUserRepositories(perPage = 100): Promise<GitHubRepository[]> {
    return this.makeRequest<GitHubRepository[]>(`/user/repos?per_page=${perPage}&sort=updated`)
  }

  async getRepository(owner: string, repo: string): Promise<GitHubRepository> {
    return this.makeRequest<GitHubRepository>(`/repos/${owner}/${repo}`)
  }

  async getRepositoryContents(owner: string, repo: string, path = ''): Promise<any[]> {
    return this.makeRequest<any[]>(`/repos/${owner}/${repo}/contents/${path}`)
  }

  async getFileContent(
    owner: string,
    repo: string,
    path: string,
  ): Promise<{
    content: string
    encoding: string
    sha: string
  }> {
    const response = await this.makeRequest<any>(`/repos/${owner}/${repo}/contents/${path}`)

    if (response.type !== 'file') {
      throw new Error('Path is not a file')
    }

    return {
      content: response.content,
      encoding: response.encoding,
      sha: response.sha,
    }
  }

  async createOrUpdateFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    sha?: string,
  ): Promise<any> {
    const body: any = {
      message,
      content: btoa(content), // Base64 encode
    }

    if (sha) {
      body.sha = sha // Required for updates
    }

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: {
        Authorization: `token ${this.accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(`GitHub API error: ${response.status} ${response.statusText} - ${errorData}`)
    }

    return response.json()
  }

  async deleteFile(
    owner: string,
    repo: string,
    path: string,
    message: string,
    sha: string,
  ): Promise<any> {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      method: 'DELETE',
      headers: {
        Authorization: `token ${this.accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        sha,
      }),
    })

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(`GitHub API error: ${response.status} ${response.statusText} - ${errorData}`)
    }

    return response.json()
  }

  async createBranch(
    owner: string,
    repo: string,
    branchName: string,
    fromBranch = 'main',
  ): Promise<any> {
    // First get the SHA of the source branch
    const refResponse = await this.makeRequest<any>(
      `/repos/${owner}/${repo}/git/ref/heads/${fromBranch}`,
    )
    const sha = refResponse.object.sha

    // Create the new branch
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      headers: {
        Authorization: `token ${this.accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha,
      }),
    })

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(`GitHub API error: ${response.status} ${response.statusText} - ${errorData}`)
    }

    return response.json()
  }
}

// Utility functions
export const decodeBase64Content = (content: string): string => {
  return atob(content.replace(/\n/g, ''))
}

export const formatTimeAgo = (timestamp: string | number): string => {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp)
  const now = Date.now()
  const diff = now - date.getTime()
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
