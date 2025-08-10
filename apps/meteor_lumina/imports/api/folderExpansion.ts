import { Mongo } from 'meteor/mongo'
import { Meteor } from 'meteor/meteor'

// Folder Expansion State Collection
export interface FolderExpansionState {
  _id?: string
  userId: string
  vaultId: string
  folderPath: string
  isExpanded: boolean
  createdAt?: Date
}

export const FolderExpansionStateCollection = new Mongo.Collection<FolderExpansionState>(
  'folderExpansionState',
)

// Folder expansion methods
Meteor.methods({
  async getFolderExpansionStates({ vaultId }: { vaultId: string }) {
    if (!this.userId) {
      return []
    }

    const expansionStates = await FolderExpansionStateCollection.find({
      userId: this.userId,
      vaultId,
    }).fetchAsync()

    return expansionStates.map(state => ({
      folderPath: state.folderPath,
      isExpanded: state.isExpanded,
    }))
  },

  async setFolderExpansionState({
    vaultId,
    folderPath,
    isExpanded,
  }: {
    vaultId: string
    folderPath: string
    isExpanded: boolean
  }) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in')
    }

    // Check if state already exists
    const existingState = await FolderExpansionStateCollection.findOneAsync({
      userId: this.userId,
      vaultId,
      folderPath,
    })

    if (existingState) {
      // Update existing state
      await FolderExpansionStateCollection.updateAsync(existingState._id!, {
        $set: { isExpanded },
      })
    } else {
      // Create new state
      await FolderExpansionStateCollection.insertAsync({
        userId: this.userId,
        vaultId,
        folderPath,
        isExpanded,
        createdAt: new Date(),
      })
    }

    return null
  },

  async clearFolderExpansionStates({ vaultId }: { vaultId: string }) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in')
    }

    const expansionStates = await FolderExpansionStateCollection.find({
      userId: this.userId,
      vaultId,
    }).fetchAsync()

    // Delete all states for this user and vault
    for (const state of expansionStates) {
      await FolderExpansionStateCollection.removeAsync(state._id!)
    }

    return null
  },
})
