import { Mongo } from 'meteor/mongo'
import { Meteor } from 'meteor/meteor'

export interface Vault {
  _id: string
  userId: string // Reference to users collection
  ghRepoId: string
  ghRepoOwner: string
  ghRepoName: string
  createdAt?: Date
}

export const VaultsCollection = new Mongo.Collection<Vault>('vaults')

// Publications - Server-side security
if (Meteor.isServer) {
  // Publish vault by repository - SECURE: only user's own vaults
  Meteor.publish('vault-by-repository', function (repositoryFullName: string) {
    // Security check - must be logged in
    if (!this.userId) {
      return this.ready()
    }

    if (!repositoryFullName || typeof repositoryFullName !== 'string') {
      return this.ready()
    }

    const [owner, name] = repositoryFullName.split('/')
    if (!owner || !name) {
      return this.ready()
    }

    // Only return vaults that belong to the current user
    return VaultsCollection.find({
      userId: this.userId, // Server-enforced security
      ghRepoOwner: owner,
      ghRepoName: name,
    })
  })

  // Publish user's vaults
  Meteor.publish('user-vaults', function () {
    if (!this.userId) {
      return this.ready()
    }

    return VaultsCollection.find({
      userId: this.userId,
    })
  })
}

// Vault management methods
Meteor.methods({
  async connectRepository({ repositoryFullName }: { repositoryFullName: string }) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in')
    }

    try {
      // Get repository details from GitHub
      const repoData = await Meteor.callAsync('getGitHubRepository', { repositoryFullName })

      // Check if vault already exists
      const existingVault = await VaultsCollection.findOneAsync({
        userId: this.userId,
        ghRepoId: repoData.id.toString(),
      })

      if (existingVault) {
        return existingVault._id
      }

      // Create new vault
      const vaultId = await VaultsCollection.insertAsync({
        userId: this.userId,
        ghRepoId: repoData.id.toString(),
        ghRepoOwner: repoData.owner.login,
        ghRepoName: repoData.name,
        createdAt: new Date(),
      })

      return vaultId
    } catch (error) {
      console.error('Error connecting repository:', error)
      throw new Meteor.Error('vault-creation-error', 'Failed to connect repository')
    }
  },

  async getUserVaults() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in')
    }

    try {
      const vaults = await VaultsCollection.find({ userId: this.userId }).fetchAsync()

      // Ensure vaults is an array
      if (!Array.isArray(vaults)) {
        console.error('VaultsCollection.find().fetchAsync() did not return an array:', vaults)
        return []
      }

      return vaults.map(vault => ({
        _id: vault._id,
        _creationTime: vault.createdAt?.getTime() || 0,
        ghRepoOwner: vault.ghRepoOwner,
        ghRepoName: vault.ghRepoName,
        repositoryFullName: `${vault.ghRepoOwner}/${vault.ghRepoName}`,
        fileCount: 0, // TODO: Implement file staging count
        lastEditTime: undefined, // TODO: Implement last edit time
      }))
    } catch (error) {
      console.error('Error in getUserVaults:', error)
      return []
    }
  },

  async getVaultByRepository({ repositoryFullName }: { repositoryFullName: string }) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in')
    }

    const [owner, name] = repositoryFullName.split('/')
    if (!owner || !name) {
      throw new Meteor.Error('invalid-repo-name', 'Invalid repository full name')
    }

    const vault = await VaultsCollection.findOneAsync({
      userId: this.userId,
      ghRepoOwner: owner,
      ghRepoName: name,
    })

    if (!vault) {
      return null
    }

    return {
      _id: vault._id,
      _creationTime: vault.createdAt?.getTime() || 0,
      ghRepoOwner: vault.ghRepoOwner,
      ghRepoName: vault.ghRepoName,
      repositoryFullName,
    }
  },
})
