import { ConvexError } from "convex/values";
import { MutationCtx, QueryCtx, ActionCtx } from "../../_generated/api";
import { Id } from "../../_generated/dataModel";
import { 
  FileReadArgs, 
  FileWriteArgs, 
  FileCreateArgs, 
  FileDeleteArgs,
  DirectoryListArgs,
  FileStagingResult,
  FileTreeNode,
  CommitProposal
} from "./schema";

/**
 * FileSystem Component
 * 
 * Provides a unified interface for file operations, staging, and GitHub synchronization.
 * Can be used by both regular functions and AI agents.
 */
export class FileSystemComponent {
  constructor(
    private ctx: QueryCtx | MutationCtx | ActionCtx,
    private userId?: Id<"users">
  ) {}

  /**
   * Read a file's content from staging or GitHub
   */
  async readFile(args: typeof FileReadArgs._type): Promise<string> {
    // First check if file exists in staging
    const staging = await this.ctx.db
      .query("fileStaging")
      .withIndex("by_vault_and_path", (q) => 
        q.eq("vaultId", args.vaultId).eq("filePath", args.filePath)
      )
      .first();

    if (staging && !staging.fileDeleted) {
      return staging.content;
    }

    // If not in staging, read from GitHub via blob storage
    const vault = await this.ctx.db.get(args.vaultId);
    if (!vault) {
      throw new ConvexError("Vault not found");
    }

    // Find file in tree data
    const fileNode = this.findFileInTree(vault.treeData.tree, args.filePath);
    if (!fileNode) {
      throw new ConvexError(`File not found: ${args.filePath}`);
    }

    // Get blob content
    const blob = await this.ctx.db
      .query("blobs")
      .withIndex("by_sha", (q) => q.eq("sha", fileNode.sha))
      .first();

    if (!blob) {
      throw new ConvexError(`Blob not found for file: ${args.filePath}`);
    }

    if (blob.text) {
      return blob.text;
    }

    // If content is in storage, we'd need to read it (this would be an action)
    throw new ConvexError("File content in storage - use action to read");
  }

  /**
   * Write content to a file (stages the change)
   */
  async writeFile(args: typeof FileWriteArgs._type): Promise<void> {
    const vault = await this.ctx.db.get(args.vaultId);
    if (!vault) {
      throw new ConvexError("Vault not found");
    }

    // Get current file content for comparison
    let initialContent = "";
    try {
      initialContent = await this.readFile({
        vaultId: args.vaultId,
        filePath: args.filePath,
        userId: args.userId,
      });
    } catch {
      // File doesn't exist, that's ok for new files
    }

    // Check if file already has staging
    const existingStaging = await this.ctx.db
      .query("fileStaging")
      .withIndex("by_vault_and_path", (q) => 
        q.eq("vaultId", args.vaultId).eq("filePath", args.filePath)
      )
      .first();

    const now = Date.now();

    if (existingStaging) {
      // Update existing staging
      await this.ctx.db.patch(existingStaging._id, {
        content: args.content,
        lastEditTime: now,
        lastEditUserId: args.userId,
        fileDeleted: false,
        version: existingStaging.version + 1,
      });
    } else {
      // Create new staging
      await this.ctx.db.insert("fileStaging", {
        ownerId: args.userId,
        vaultId: args.vaultId,
        filePath: args.filePath,
        initialFilePath: args.filePath,
        content: args.content,
        initialContent,
        fileDeleted: false,
        parentCommitSha: vault.treeSHA,
        lastEditTime: now,
        lastEditUserId: args.userId,
        branch: args.branch || "main",
        version: 0,
      });
    }
  }

  /**
   * Create a new file
   */
  async createFile(args: typeof FileCreateArgs._type): Promise<void> {
    // Check if file already exists
    try {
      await this.readFile({
        vaultId: args.vaultId,
        filePath: args.filePath,
        userId: args.userId,
      });
      throw new ConvexError(`File already exists: ${args.filePath}`);
    } catch (error) {
      if (error instanceof ConvexError && error.message.includes("already exists")) {
        throw error;
      }
      // File doesn't exist, proceed with creation
    }

    await this.writeFile(args);
  }

  /**
   * Delete a file (marks for deletion in staging)
   */
  async deleteFile(args: typeof FileDeleteArgs._type): Promise<void> {
    const vault = await this.ctx.db.get(args.vaultId);
    if (!vault) {
      throw new ConvexError("Vault not found");
    }

    // Check if file exists
    const fileExists = this.findFileInTree(vault.treeData.tree, args.filePath);
    if (!fileExists) {
      throw new ConvexError(`File not found: ${args.filePath}`);
    }

    // Check if file already has staging
    const existingStaging = await this.ctx.db
      .query("fileStaging")
      .withIndex("by_vault_and_path", (q) => 
        q.eq("vaultId", args.vaultId).eq("filePath", args.filePath)
      )
      .first();

    const now = Date.now();

    if (existingStaging) {
      // Mark existing staging as deleted
      await this.ctx.db.patch(existingStaging._id, {
        fileDeleted: true,
        lastEditTime: now,
        lastEditUserId: args.userId,
        version: existingStaging.version + 1,
      });
    } else {
      // Create new staging marked as deleted
      await this.ctx.db.insert("fileStaging", {
        ownerId: args.userId,
        vaultId: args.vaultId,
        filePath: args.filePath,
        initialFilePath: args.filePath,
        content: "",
        initialContent: "",
        fileDeleted: true,
        parentCommitSha: vault.treeSHA,
        lastEditTime: now,
        lastEditUserId: args.userId,
        branch: args.branch || "main",
        version: 0,
      });
    }
  }

  /**
   * List files in a directory
   */
  async listFiles(args: typeof DirectoryListArgs._type): Promise<FileTreeNode[]> {
    const vault = await this.ctx.db.get(args.vaultId);
    if (!vault) {
      throw new ConvexError("Vault not found");
    }

    const directoryPath = args.directoryPath || "";
    const files: FileTreeNode[] = [];

    // Get files from GitHub tree
    for (const item of vault.treeData.tree) {
      if (directoryPath === "" || item.path.startsWith(directoryPath + "/")) {
        const relativePath = directoryPath === "" ? item.path : item.path.slice(directoryPath.length + 1);
        
        // Only include direct children (no nested paths)
        if (!relativePath.includes("/")) {
          files.push({
            path: item.path,
            type: item.type === "tree" ? "directory" : "file",
            size: item.size,
          });
        }
      }
    }

    // Add staged files that aren't deleted
    const stagedFiles = await this.ctx.db
      .query("fileStaging")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .collect();

    for (const staged of stagedFiles) {
      if (!staged.fileDeleted && (directoryPath === "" || staged.filePath.startsWith(directoryPath + "/"))) {
        const relativePath = directoryPath === "" ? staged.filePath : staged.filePath.slice(directoryPath.length + 1);
        
        if (!relativePath.includes("/")) {
          // Check if already in files array
          const existingIndex = files.findIndex(f => f.path === staged.filePath);
          if (existingIndex >= 0) {
            // Update existing entry
            files[existingIndex] = {
              path: staged.filePath,
              type: "file",
              size: staged.content.length,
            };
          } else {
            // Add new staged file
            files.push({
              path: staged.filePath,
              type: "file", 
              size: staged.content.length,
            });
          }
        }
      }
    }

    return files.sort((a, b) => {
      // Directories first, then files, both alphabetically
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }
      return a.path.localeCompare(b.path);
    });
  }

  /**
   * Get all staged files for a vault
   */
  async getStagedFiles(vaultId: Id<"vaults">): Promise<FileStagingResult[]> {
    const stagedFiles = await this.ctx.db
      .query("fileStaging")
      .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
      .collect();

    return stagedFiles.map(staged => ({
      filePath: staged.filePath,
      content: staged.content,
      isModified: staged.content !== staged.initialContent || staged.fileDeleted,
      lastEditTime: staged.lastEditTime,
      lastEditUserId: staged.lastEditUserId,
    }));
  }

  /**
   * Prepare a commit proposal with all staged changes
   */
  async prepareCommit(vaultId: Id<"vaults">, message: string, userId: Id<"users">): Promise<typeof CommitProposal._type> {
    const stagedFiles = await this.getStagedFiles(vaultId);
    const vault = await this.ctx.db.get(vaultId);
    
    if (!vault) {
      throw new ConvexError("Vault not found");
    }

    const files = stagedFiles
      .filter(f => f.isModified)
      .map(f => {
        const staging = stagedFiles.find(s => s.filePath === f.filePath);
        if (!staging) throw new ConvexError("Staging not found");

        let operation: "create" | "update" | "delete";
        if (staging.content === "" && f.isModified) {
          operation = "delete";
        } else if (staging.content !== staging.content) { // This logic needs fixing
          operation = "update";
        } else {
          operation = "create";
        }

        return {
          path: f.filePath,
          content: f.content,
          operation,
        };
      });

    return {
      vaultId,
      message,
      files,
      branch: "main", // TODO: Make configurable
      userId,
    };
  }

  /**
   * Helper method to find a file in the GitHub tree
   */
  private findFileInTree(tree: any[], filePath: string) {
    return tree.find(item => item.path === filePath);
  }
}