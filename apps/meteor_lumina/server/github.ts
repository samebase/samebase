import { Meteor } from 'meteor/meteor'

// Helper function to get GitHub access token for a user
export function getGitHubAccessToken(userId: string): string | null {
  const user = Meteor.users.findOne(userId)
  return user?.services?.github?.accessToken || null
}

// Example method to make GitHub API calls
Meteor.methods({
  async createGitHubCommit(repoOwner: string, repoName: string, message: string, content: any) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in')
    }

    const accessToken = getGitHubAccessToken(this.userId)
    if (!accessToken) {
      throw new Meteor.Error('no-github-token', 'GitHub access token not found')
    }

    // Example GitHub API call
    const response = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/contents/path/to/file`,
      {
        method: 'PUT',
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          content: Buffer.from(JSON.stringify(content)).toString('base64'),
          // sha: 'existing-file-sha-if-updating'
        }),
      },
    )

    if (!response.ok) {
      throw new Meteor.Error('github-api-error', `GitHub API error: ${response.statusText}`)
    }

    return await response.json()
  },
})
