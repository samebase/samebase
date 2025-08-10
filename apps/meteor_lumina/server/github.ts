import { Meteor } from 'meteor/meteor'
import type { Endpoints } from '@octokit/types'

// Type definitions using Octokit's official types
type ListUserReposResponse = Endpoints['GET /user/repos']['response']['data']
type GetRepoResponse = Endpoints['GET /repos/{owner}/{repo}']['response']['data']
type CreateOrUpdateFileResponse =
  Endpoints['PUT /repos/{owner}/{repo}/contents/{path}']['response']['data']

// Helper function to get GitHub access token for a user
export async function getGitHubAccessToken(userId: string): Promise<string | null> {
  const user = await Meteor.users.findOneAsync(userId)
  // @ts-expect-error TODO: add typings file
  return user?.services?.github?.accessToken || null
}

// Helper function to make GitHub API requests with proper typing
async function githubFetch<T = any>(
  url: string,
  accessToken: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Lumina-App',
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`GitHub API error (${response.status}):`, errorText)
    throw new Meteor.Error(
      'github-api-error',
      `GitHub API error: ${response.status} ${response.statusText}`,
    )
  }

  return response.json()
}

// GitHub API methods
Meteor.methods({
  async listGitHubRepositories(): Promise<ListUserReposResponse> {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in')
    }

    const accessToken = await getGitHubAccessToken(this.userId)
    if (!accessToken) {
      throw new Meteor.Error('no-github-token', 'GitHub access token not found')
    }

    try {
      const repos = await githubFetch<ListUserReposResponse>(
        'https://api.github.com/user/repos?sort=updated&per_page=100',
        accessToken,
      )

      return repos
    } catch (error) {
      console.error('Error fetching GitHub repositories:', error)
      throw new Meteor.Error('github-api-error', 'Failed to fetch repositories')
    }
  },

  async getGitHubRepository(repositoryFullName: string): Promise<GetRepoResponse> {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in')
    }

    const accessToken = await getGitHubAccessToken(this.userId)
    if (!accessToken) {
      throw new Meteor.Error('no-github-token', 'GitHub access token not found')
    }

    try {
      const [owner, repo] = repositoryFullName.split('/')
      const repoData = await githubFetch<GetRepoResponse>(
        `https://api.github.com/repos/${owner}/${repo}`,
        accessToken,
      )

      return repoData
    } catch (error) {
      console.error('Error fetching GitHub repository:', error)
      throw new Meteor.Error('github-api-error', 'Failed to fetch repository')
    }
  },

  async createGitHubCommit(
    repoOwner: string,
    repoName: string,
    filePath: string,
    message: string,
    content: string,
    sha?: string,
  ): Promise<{ sha: string; url: string }> {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in')
    }

    const accessToken = await getGitHubAccessToken(this.userId)
    if (!accessToken) {
      throw new Meteor.Error('no-github-token', 'GitHub access token not found')
    }

    try {
      const body: any = {
        message,
        content: Buffer.from(content, 'utf8').toString('base64'),
      }

      if (sha) {
        body.sha = sha
      }

      const response = await githubFetch<CreateOrUpdateFileResponse>(
        `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`,
        accessToken,
        {
          method: 'PUT',
          body: JSON.stringify(body),
        },
      )

      return {
        sha: response.commit?.sha || '',
        url: response.commit?.html_url || '',
      }
    } catch (error) {
      console.error(`Error creating/updating file ${filePath}:`, error)
      throw new Meteor.Error('github-api-error', 'Failed to create/update file')
    }
  },

  async getGitHubAccessToken(userId: string): Promise<string | null> {
    const user = await Meteor.users.findOneAsync(userId)
    // @ts-expect-error TODO: add typings file
    return user?.services?.github?.accessToken || null
  },

  async getGitHubReadme(owner: string, repo: string) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in')
    }

    const accessToken = await getGitHubAccessToken(this.userId)
    if (!accessToken) {
      throw new Meteor.Error('no-github-token', 'GitHub access token not found')
    }

    try {
      const readme = await githubFetch(
        `https://api.github.com/repos/${owner}/${repo}/readme`,
        accessToken,
      )

      return {
        content: readme.content,
        encoding: readme.encoding,
        name: readme.name,
      }
    } catch (error) {
      // README might not exist
      console.log(`README not found for ${owner}/${repo}:`, error)
      return null
    }
  },

  async createGitHubFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch = 'main',
  ) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in')
    }

    const accessToken = await getGitHubAccessToken(this.userId)
    if (!accessToken) {
      throw new Meteor.Error('no-github-token', 'GitHub access token not found')
    }

    try {
      const result = await githubFetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        accessToken,
        {
          method: 'PUT',
          body: JSON.stringify({
            message,
            content: Buffer.from(content, 'utf8').toString('base64'),
            branch,
          }),
        },
      )

      return {
        sha: result.commit?.sha || '',
        url: result.commit?.html_url || '',
      }
    } catch (error) {
      console.error(`Failed to create file ${path} for ${owner}/${repo}:`, error)
      throw new Meteor.Error('github-api-error', 'Failed to create file')
    }
  },

  async deleteGitHubFile(
    owner: string,
    repo: string,
    path: string,
    message: string,
    sha: string,
    branch = 'main',
  ) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in')
    }

    const accessToken = await getGitHubAccessToken(this.userId)
    if (!accessToken) {
      throw new Meteor.Error('no-github-token', 'GitHub access token not found')
    }

    try {
      const result = await githubFetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        accessToken,
        {
          method: 'DELETE',
          body: JSON.stringify({
            message,
            sha,
            branch,
          }),
        },
      )

      return {
        sha: result.commit?.sha || '',
        url: result.commit?.html_url || '',
      }
    } catch (error) {
      console.error(`Failed to delete file ${path} for ${owner}/${repo}:`, error)
      throw new Meteor.Error('github-api-error', 'Failed to delete file')
    }
  },

  async getGitHubRepositoryTree(owner: string, repo: string) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in')
    }

    const accessToken = await getGitHubAccessToken(this.userId)
    if (!accessToken) {
      throw new Meteor.Error('no-github-token', 'GitHub access token not found')
    }

    try {
      const tree = await githubFetch(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
        accessToken,
      )

      return tree.tree.map((item: any) => ({
        path: item.path,
        mode: item.mode,
        type: item.type,
        sha: item.sha,
        size: item.size,
        url: item.url,
      }))
    } catch (error) {
      console.error(`Failed to fetch tree for ${owner}/${repo}:`, error)
      return []
    }
  },
})
