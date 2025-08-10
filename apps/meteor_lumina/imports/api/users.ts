import { Meteor } from 'meteor/meteor'

export interface User {
  _id?: string
  name?: string
  image?: string
  email?: string
  emailVerificationTime?: number
  phone?: string
  phoneVerificationTime?: number
  isAnonymous?: boolean

  // GitHub integration
  githubUsername?: string
  githubAccessToken?: string
  githubRefreshToken?: string
  githubExpiresAt?: number
}

// Use Meteor's built-in users collection
// Create indexes
if (Meteor.isServer) {
  // Note: Meteor.users already has indexes on emails and username
  // We can add additional indexes if needed
}

// User management methods
Meteor.methods({
  async getCurrentUser() {
    if (!this.userId) {
      return null
    }

    const user = await Meteor.users.findOneAsync(this.userId)
    return user
  },

  async getUserById(userId: string) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in')
    }

    const user = await Meteor.users.findOneAsync(userId)
    return user
  },

  async getGitHubAccount() {
    if (!this.userId) {
      return null
    }

    const user = await Meteor.users.findOneAsync(this.userId)
    // @ts-expect-error TODO: add typings file
    const githubService = user?.services?.github

    return githubService
      ? {
          provider: 'github',
          providerAccountId: githubService.id,
          accessToken: githubService.accessToken,
        }
      : null
  },
})
