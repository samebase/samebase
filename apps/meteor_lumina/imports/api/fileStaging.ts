import { Meteor } from 'meteor/meteor'
import { FileStagingCollection } from './collaborative'

export const AUTO_COMMIT_DELAY_MS = 2 * 1000

// File staging methods
Meteor.methods({
  async getFileForEditing(repositoryFullName: string, originalFilePath: string) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in')
    }

    const vault = await Meteor.callAsync('getVaultByRepository', repositoryFullName)
    if (!vault) {
      throw new Error('Vault not found')
    }

    // Check if file is already staged
    const staging = await FileStagingCollection.findOneAsync({
      vaultId: vault._id,
      originalFilePath,
    })

    if (staging) {
      return {
        version: staging.version || 0,
        content: staging.content,
      }
    }

    // File not staged yet - fetch from GitHub and create staging
    try {
      // Get file content from GitHub
      const [owner, repo] = repositoryFullName.split('/')
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${originalFilePath}`,
        {
          headers: {
            Authorization: `Bearer ${await Meteor.callAsync('getGitHubAccessToken', this.userId)}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'Lumina-App',
          },
        },
      )

      let content = ''
      if (response.ok) {
        const fileData = await response.json()
        if (fileData.content) {
          content = Buffer.from(fileData.content, 'base64').toString('utf-8')
        }
      }

      // Create staging record
      await FileStagingCollection.insertAsync({
        vaultId: vault._id,
        filePath: originalFilePath,
        originalFilePath,
        content,
        version: 0,
        lastEditTime: Date.now(),
        lastEditUserId: this.userId,
        originalContent: content,
        createdAt: new Date(),
      })

      return {
        version: 0,
        content,
      }
    } catch (error) {
      console.error('Error fetching file for editing:', error)
      throw new Meteor.Error('file-fetch-error', 'Failed to fetch file for editing')
    }
  },

  async getStagedFiles(repositoryFullName: string) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in')
    }

    const vault = await Meteor.callAsync('getVaultByRepository', repositoryFullName)
    if (!vault) {
      throw new Error('Vault not found')
    }

    const stagedFiles = await FileStagingCollection.find({
      vaultId: vault._id,
    }).fetchAsync()

    return stagedFiles.map(file => ({
      _id: file._id,
      filePath: file.filePath,
      originalFilePath: file.originalFilePath,
      content: file.content,
      version: file.version,
      lastEditTime: file.lastEditTime,
      lastEditUserId: file.lastEditUserId,
      hasChanges: file.content !== (file.originalContent || ''),
    }))
  },

  async commitStagedFiles(repositoryFullName: string, commitMessage: string) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in')
    }

    const vault = await Meteor.callAsync('getVaultByRepository', repositoryFullName)
    if (!vault) {
      throw new Error('Vault not found')
    }

    const stagedFiles = await FileStagingCollection.find({
      vaultId: vault._id,
    }).fetchAsync()

    if (stagedFiles.length === 0) {
      throw new Meteor.Error('no-staged-files', 'No staged files to commit')
    }

    try {
      const [owner, repo] = repositoryFullName.split('/')
      const accessToken = await Meteor.callAsync('getGitHubAccessToken', this.userId)

      // For simplicity, commit files one by one
      // In a production app, you'd want to create a single commit with multiple files
      const commitResults = []

      for (const file of stagedFiles) {
        if (file.content !== (file.originalContent || '')) {
          const result = await Meteor.callAsync(
            'createGitHubCommit',
            owner,
            repo,
            file.originalFilePath,
            commitMessage,
            file.content,
          )
          commitResults.push(result)
        }
      }

      // Clear staging after successful commit
      for (const file of stagedFiles) {
        await FileStagingCollection.removeAsync(file._id!)
      }

      return {
        success: true,
        commitCount: commitResults.length,
        commitResults,
      }
    } catch (error) {
      console.error('Error committing staged files:', error)
      throw new Meteor.Error('commit-error', 'Failed to commit staged files')
    }
  },

  async discardStagedFile(repositoryFullName: string, filePath: string) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in')
    }

    const vault = await Meteor.callAsync('getVaultByRepository', repositoryFullName)
    if (!vault) {
      throw new Error('Vault not found')
    }

    const staging = await FileStagingCollection.findOneAsync({
      vaultId: vault._id,
      filePath,
    })

    if (staging) {
      await FileStagingCollection.removeAsync(staging._id!)
    }

    return { success: true }
  },

  async saveToStaging(
    vaultId: string,
    initialFilePath: string,
    content: string,
    initialContent: string,
    parentCommitSha: string,
    branch: string,
  ) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in')
    }

    // Check if there's already a staging record for this file
    const existingStaging = await FileStagingCollection.findOneAsync({
      vaultId,
      originalFilePath: initialFilePath,
    })

    const currentTimestamp = Date.now()

    if (existingStaging) {
      // Codemirror gives lots of updates
      if (existingStaging.content === content) {
        return existingStaging
      }

      console.log({
        old: existingStaging.content,
        new: content,
      })

      // Update existing staging
      await FileStagingCollection.updateAsync(existingStaging._id!, {
        $set: {
          content,
          lastEditTime: currentTimestamp,
          lastEditUserId: this.userId,
        },
      })
    } else {
      // Create new staging record
      await FileStagingCollection.insertAsync({
        vaultId,
        filePath: initialFilePath,
        originalFilePath: initialFilePath,
        content,
        originalContent: initialContent,
        version: 0,
        lastEditTime: currentTimestamp,
        lastEditUserId: this.userId,
        createdAt: new Date(),
      })
    }

    const staging = await FileStagingCollection.findOneAsync({
      vaultId,
      originalFilePath: initialFilePath,
    })

    if (!staging) {
      throw new Error('Should not happen. Staging not found after saving?!?')
    }

    return staging
  },

  async getStagedFile(vaultId: string, originalFilePath: string) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in')
    }

    const staging = await FileStagingCollection.findOneAsync({
      vaultId,
      originalFilePath,
    })

    return staging
  },

  async listStagedFiles(vaultId: string, includeUnchanged = false) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in')
    }

    let query: any = { vaultId }

    if (!includeUnchanged) {
      // Only include files that have changes
      query = {
        ...query,
        $or: [
          // content changed
          { $expr: { $ne: ['$content', '$originalContent'] } },
          // file renamed
          { $expr: { $ne: ['$filePath', '$originalFilePath'] } },
        ],
      }
    }

    const files = await FileStagingCollection.find(query).fetchAsync()
    return files
  },

  async clearAllStaging(vaultId: string) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in')
    }

    // Remove all staging files for this vault
    await FileStagingCollection.removeAsync({ vaultId })

    // Also remove collaborative updates for this vault
    const { CollaborativeUpdatesCollection } = await import('./collaborative')
    await CollaborativeUpdatesCollection.removeAsync({ vaultId })

    return null
  },

  async markFileForDeletion(
    vaultId: string,
    filePath: string,
    parentCommitSha: string,
    branch: string,
  ) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in')
    }

    // Check if there's already a staging record for this file
    const existingStaging = await FileStagingCollection.findOneAsync({
      vaultId,
      filePath,
    })

    const currentTimestamp = Date.now()

    if (existingStaging) {
      // Update existing staging to mark as deleted
      await FileStagingCollection.updateAsync(existingStaging._id!, {
        $set: {
          fileDeleted: true,
          lastEditTime: currentTimestamp,
          lastEditUserId: this.userId,
        },
      })
    } else {
      // Create new staging record for deletion
      await FileStagingCollection.insertAsync({
        vaultId,
        filePath,
        originalFilePath: filePath,
        fileDeleted: true,
        content: '', // Empty content for deleted files
        originalContent: '', // We don't need the original content for deletions
        version: 0,
        lastEditTime: currentTimestamp,
        lastEditUserId: this.userId,
        createdAt: new Date(),
      })
    }

    return null
  },

  async renameFileInStaging(vaultId: string, originalPath: string, newPath: string) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in')
    }

    console.log('renameFileInStaging', { vaultId, originalPath, newPath })

    const file = await FileStagingCollection.findOneAsync({
      vaultId,
      originalFilePath: originalPath,
    })

    if (!file) {
      throw new Error('File not found')
    }

    await FileStagingCollection.updateAsync(file._id!, {
      $set: {
        filePath: newPath,
      },
    })

    const updatedFile = await FileStagingCollection.findOneAsync({
      vaultId,
      filePath: newPath,
    })

    if (!updatedFile) {
      throw new Error('File not found after rename???')
    }

    return {
      content: updatedFile.content,
    }
  },
})
