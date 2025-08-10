import { Mongo } from 'meteor/mongo'
import { Meteor } from 'meteor/meteor'
import { ChangeSet, Text } from '@codemirror/state'

// Collaborative Updates Collection
export interface CollaborativeUpdate {
  _id?: string
  vaultId: string
  filePath: string
  version: number
  clientId: string
  changes: string // Serialized ChangeSet
  userId: string
  timestamp: number
  createdAt?: Date
}

export const CollaborativeUpdatesCollection = new Mongo.Collection<CollaborativeUpdate>(
  'collaborativeUpdates',
)

// File Staging Collection
export interface FileStaging {
  _id?: string
  vaultId: string
  filePath: string
  content: string
  version: number
  lastEditTime: number
  lastEditUserId: string
  originalContent: string
  originalFilePath: string
  fileDeleted?: boolean
  createdAt?: Date
}

export const FileStagingCollection = new Mongo.Collection<FileStaging>('fileStaging')

// Collaborative methods
Meteor.methods({
  async getDocument({ vaultId, filePath }: { vaultId: string; filePath: string }) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in')
    }

    console.log('getDocument:', filePath)

    // Check if there's staged content for this file
    const staging = await FileStagingCollection.findOneAsync({
      vaultId,
      filePath,
    })

    if (staging) {
      console.log('getDocument: found staging with version', staging.version ?? 0)
      return {
        version: staging.version ?? 0,
        content: staging.content,
        exists: true,
      }
    }

    console.log('getDocument: no staging found')
    // No staging found - return empty document
    return {
      version: 0,
      content: '',
      exists: false,
    }
  },

  async pullUpdates({
    repositoryFullName,
    filePath,
    version,
  }: {
    repositoryFullName: string
    filePath: string
    version: number
  }) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in')
    }

    const vault = await Meteor.callAsync('getVaultByRepository', { repositoryFullName })
    if (!vault) {
      throw new Error('Vault not found')
    }

    const updates = await CollaborativeUpdatesCollection.find({
      vaultId: vault._id,
      filePath,
      version: { $gt: version },
    }).fetchAsync()

    return updates.map(update => ({
      clientID: update.clientId,
      changes: update.changes,
      version: update.version,
      userId: update.userId,
    }))
  },

  async pushUpdates({
    repositoryFullName,
    filePath,
    version,
    updates,
  }: {
    repositoryFullName: string
    filePath: string
    version: number
    updates: Array<{ clientId: string; changes: string }>
  }) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in')
    }

    console.log(
      'pushUpdates received:',
      JSON.stringify({ repositoryFullName, filePath, version, updates }, null, 2),
    )

    const vault = await Meteor.callAsync('getVaultByRepository', { repositoryFullName })
    if (!vault) {
      throw new Error('Vault not found')
    }

    // Get current staging record
    const staging = await FileStagingCollection.findOneAsync({
      vaultId: vault._id,
      filePath,
    })

    if (!staging) {
      throw new Error('Staging not found')
    }

    let currentVersion = staging.version || 0

    // Simple version check - reject if versions don't match
    if (version !== currentVersion) {
      return {
        success: false,
        newVersion: currentVersion,
      }
    }

    // Apply updates
    const timestamp = Date.now()
    console.log('pushUpdates: applying', updates.length, 'updates')

    // Store the updates for other clients to pull and apply them to content
    let currentDoc = Text.of(staging.content.split('\n'))

    for (const update of updates) {
      currentVersion++

      // Store the update for other clients to pull
      const inserted = await CollaborativeUpdatesCollection.insertAsync({
        vaultId: vault._id,
        filePath,
        version: currentVersion,
        clientId: update.clientId,
        changes: update.changes,
        userId: this.userId,
        timestamp,
        createdAt: new Date(),
      })

      console.log('pushUpdates: inserted update', inserted, 'for version', currentVersion)

      // Apply the changes to the document using CodeMirror's proper methods
      const changeSet = ChangeSet.fromJSON(JSON.parse(update.changes))
      currentDoc = changeSet.apply(currentDoc)
    }

    // Convert back to string
    const updatedContent = currentDoc.toString()

    // Update the staging record with new content and version
    await FileStagingCollection.updateAsync(staging._id!, {
      $set: {
        content: updatedContent,
        version: currentVersion,
        lastEditTime: timestamp,
        lastEditUserId: this.userId,
      },
    })

    return {
      success: true,
      newVersion: currentVersion,
    }
  },

  async getActiveEditors({ vaultId, filePath }: { vaultId: string; filePath: string }) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in')
    }

    // Get recent updates (within last 30 seconds) to determine active editors
    const recentTimestamp = Date.now() - 30 * 1000

    const recentUpdates = await CollaborativeUpdatesCollection.find({
      vaultId,
      filePath,
      timestamp: { $gt: recentTimestamp },
    }).fetchAsync()

    // Group by user and get the most recent activity
    const userActivity = new Map<string, number>()
    for (const update of recentUpdates) {
      const currentLatest = userActivity.get(update.userId) ?? 0
      if (update.timestamp > currentLatest) {
        userActivity.set(update.userId, update.timestamp)
      }
    }

    return Array.from(userActivity.entries()).map(([userId, lastActive]) => ({
      userId,
      lastActive,
    }))
  },
})
