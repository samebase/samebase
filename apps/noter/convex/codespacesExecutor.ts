"use node";

import { action } from "./_generated/server";
import { type Infer, v } from "convex/values";
import { internal } from "./_generated/api";

const executeCommandResult = v.object({
  stdout: v.string(),
  stderr: v.string(),
  exitCode: v.number(),
  success: v.boolean(),
});

/**
 * Execute a command in the Codespace
 */
export const executeCommand = action({
  args: {
    codespaceId: v.id("codespaces"),
    command: v.string(),
    workingDir: v.optional(v.string()),
    timeoutMs: v.optional(v.number()),
  },
  returns: executeCommandResult,
  handler: async (ctx, args): Promise<Infer<typeof executeCommandResult>> => {
    // Get codespace record with agentUrl and agentToken
    const codespace = await ctx.runQuery(
      internal.codespacesMutations.getCodespace,
      {
        codespaceId: args.codespaceId,
      },
    );

    if (!codespace) {
      throw new Error("Codespace not found");
    }

    if (!codespace.agentUrl || !codespace.agentToken) {
      throw new Error("Codespace agent not available");
    }

    if (codespace.state !== "running") {
      throw new Error(
        `Codespace is not running (current state: ${codespace.state})`,
      );
    }

    // Call agent via HTTP
    const response = await fetch(`${codespace.agentUrl}/exec`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${codespace.agentToken}`,
      },
      body: JSON.stringify({
        command: args.command,
        workingDir: args.workingDir,
        timeoutMs: args.timeoutMs || 60000,
      }),
    });

    if (!response.ok) {
      throw new Error(`Agent request failed: ${response.statusText}`);
    }

    return await response.json();
  },
});

const writeFileToCodespaceResult = v.object({
  success: v.boolean(),
  filePath: v.string(),
});
/**
 * Write a file to the Codespace
 */
export const writeFileToCodespace = action({
  args: {
    codespaceId: v.id("codespaces"),
    filePath: v.string(),
    content: v.string(),
  },
  returns: writeFileToCodespaceResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof writeFileToCodespaceResult>> => {
    const codespace = await ctx.runQuery(
      internal.codespacesMutations.getCodespace,
      {
        codespaceId: args.codespaceId,
      },
    );

    if (!codespace) {
      throw new Error("Codespace not found");
    }

    if (!codespace.agentUrl || !codespace.agentToken) {
      throw new Error("Codespace agent not available");
    }

    if (codespace.state !== "running") {
      throw new Error(
        `Codespace is not running (current state: ${codespace.state})`,
      );
    }

    const response = await fetch(`${codespace.agentUrl}/files/write`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${codespace.agentToken}`,
      },
      body: JSON.stringify({
        filePath: args.filePath,
        content: args.content,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to write file: ${error}`);
    }

    return await response.json();
  },
});

/**
 * Read a file from the Codespace
 */
const readFileFromCodespaceResult = v.object({
  content: v.string(),
  filePath: v.string(),
});
export const readFileFromCodespace = action({
  args: {
    codespaceId: v.id("codespaces"),
    filePath: v.string(),
  },
  returns: readFileFromCodespaceResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof readFileFromCodespaceResult>> => {
    const codespace = await ctx.runQuery(
      internal.codespacesMutations.getCodespace,
      {
        codespaceId: args.codespaceId,
      },
    );

    if (!codespace) {
      throw new Error("Codespace not found");
    }

    if (!codespace.agentUrl || !codespace.agentToken) {
      throw new Error("Codespace agent not available");
    }

    if (codespace.state !== "running") {
      throw new Error(
        `Codespace is not running (current state: ${codespace.state})`,
      );
    }

    const response = await fetch(
      `${codespace.agentUrl}/files/read?filePath=${encodeURIComponent(
        args.filePath,
      )}`,
      {
        headers: {
          Authorization: `Bearer ${codespace.agentToken}`,
        },
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to read file: ${error}`);
    }

    return await response.json();
  },
});

/**
 * List files in a directory in the Codespace
 */
const listFilesResult = v.object({
  files: v.array(
    v.object({
      name: v.string(),
      isDirectory: v.boolean(),
      isFile: v.boolean(),
      path: v.string(),
    }),
  ),
  dirPath: v.string(),
});
export const listFiles = action({
  args: {
    codespaceId: v.id("codespaces"),
    dirPath: v.optional(v.string()),
  },
  returns: listFilesResult,
  handler: async (ctx, args): Promise<Infer<typeof listFilesResult>> => {
    const codespace = await ctx.runQuery(
      internal.codespacesMutations.getCodespace,
      {
        codespaceId: args.codespaceId,
      },
    );

    if (!codespace) {
      throw new Error("Codespace not found");
    }

    if (!codespace.agentUrl || !codespace.agentToken) {
      throw new Error("Codespace agent not available");
    }

    if (codespace.state !== "running") {
      throw new Error(
        `Codespace is not running (current state: ${codespace.state})`,
      );
    }

    const url = new URL(`${codespace.agentUrl}/files/list`);
    if (args.dirPath) {
      url.searchParams.set("dirPath", args.dirPath);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${codespace.agentToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to list files: ${error}`);
    }

    return await response.json();
  },
});

/**
 * Delete a file or directory in the Codespace
 */
const deleteFileResult = v.object({
  success: v.boolean(),
  filePath: v.string(),
});
export const deleteFile = action({
  args: {
    codespaceId: v.id("codespaces"),
    filePath: v.string(),
    recursive: v.optional(v.boolean()),
  },
  returns: deleteFileResult,
  handler: async (ctx, args): Promise<Infer<typeof deleteFileResult>> => {
    const codespace = await ctx.runQuery(
      internal.codespacesMutations.getCodespace,
      {
        codespaceId: args.codespaceId,
      },
    );

    if (!codespace) {
      throw new Error("Codespace not found");
    }

    if (!codespace.agentUrl || !codespace.agentToken) {
      throw new Error("Codespace agent not available");
    }

    if (codespace.state !== "running") {
      throw new Error(
        `Codespace is not running (current state: ${codespace.state})`,
      );
    }

    const response = await fetch(`${codespace.agentUrl}/files/delete`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${codespace.agentToken}`,
      },
      body: JSON.stringify({
        filePath: args.filePath,
        recursive: args.recursive || false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to delete file: ${error}`);
    }

    return await response.json();
  },
});

/**
 * Get file metadata in the Codespace
 */
const getFileStatResult = v.object({
  filePath: v.string(),
  size: v.number(),
  isDirectory: v.boolean(),
  isFile: v.boolean(),
  modifiedAt: v.string(),
  createdAt: v.string(),
});
export const getFileStat = action({
  args: {
    codespaceId: v.id("codespaces"),
    filePath: v.string(),
  },
  returns: getFileStatResult,
  handler: async (ctx, args): Promise<Infer<typeof getFileStatResult>> => {
    const codespace = await ctx.runQuery(
      internal.codespacesMutations.getCodespace,
      {
        codespaceId: args.codespaceId,
      },
    );

    if (!codespace) {
      throw new Error("Codespace not found");
    }

    if (!codespace.agentUrl || !codespace.agentToken) {
      throw new Error("Codespace agent not available");
    }

    if (codespace.state !== "running") {
      throw new Error(
        `Codespace is not running (current state: ${codespace.state})`,
      );
    }

    const response = await fetch(
      `${codespace.agentUrl}/files/stat?filePath=${encodeURIComponent(
        args.filePath,
      )}`,
      {
        headers: {
          Authorization: `Bearer ${codespace.agentToken}`,
        },
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get file stat: ${error}`);
    }

    return await response.json();
  },
});

/**
 * Check health of the HTTP agent
 */
const checkAgentHealthResult = v.object({
  healthy: v.boolean(),
  status: v.optional(v.string()),
  uptime: v.optional(v.number()),
  timestamp: v.optional(v.number()),
});
export const checkAgentHealth = action({
  args: {
    codespaceId: v.id("codespaces"),
  },
  returns: checkAgentHealthResult,
  handler: async (ctx, args): Promise<Infer<typeof checkAgentHealthResult>> => {
    const codespace = await ctx.runQuery(
      internal.codespacesMutations.getCodespace,
      {
        codespaceId: args.codespaceId,
      },
    );

    if (!codespace) {
      return { healthy: false };
    }

    if (!codespace.agentUrl) {
      return { healthy: false };
    }

    try {
      const response = await fetch(`${codespace.agentUrl}/health`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        return { healthy: false };
      }

      const data = await response.json();

      // Update health status in database
      await ctx.runMutation(internal.codespacesMutations.updateAgentHealth, {
        codespaceId: args.codespaceId,
        healthy: true,
        lastHealthCheckAt: Date.now(),
      });

      return {
        healthy: true,
        status: data.status,
        uptime: data.uptime,
        timestamp: data.timestamp,
      };
    } catch (error) {
      // Update health status in database
      await ctx.runMutation(internal.codespacesMutations.updateAgentHealth, {
        codespaceId: args.codespaceId,
        healthy: false,
        lastHealthCheckAt: Date.now(),
      });

      return { healthy: false };
    }
  },
});
