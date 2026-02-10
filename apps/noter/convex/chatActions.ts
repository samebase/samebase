"use node";

import { internalAction } from "./_generated/server";
import { v, Infer } from "convex/values";
import { api, internal } from "./_generated/api";
import Anthropic from "@anthropic-ai/sdk";
import { Octokit } from "@octokit/rest";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { GithubTreeData } from "./schema";

// --- Tool Definitions ---

const TOOLS: Anthropic.Tool[] = [
  {
    name: "read_file",
    description:
      "Read the contents of a file in the repository. Returns the file content as text.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "File path relative to repository root",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "list_files",
    description:
      "List files in the repository, optionally filtered to a directory.",
    input_schema: {
      type: "object" as const,
      properties: {
        directory: {
          type: "string",
          description:
            "Optional directory path to filter by (e.g. 'src/components'). Omit to list all files.",
        },
      },
      required: [],
    },
  },
  {
    name: "edit_file",
    description:
      "Edit an existing file by replacing its entire content. The file must already exist.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "File path relative to repository root",
        },
        content: {
          type: "string",
          description: "The new full content of the file",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "create_file",
    description: "Create a new file in the repository.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "File path relative to repository root",
        },
        content: {
          type: "string",
          description: "The content of the new file",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "delete_file",
    description: "Mark a file for deletion in the repository.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "File path relative to repository root",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "github_api",
    description: `Call the GitHub REST API. Owner and repo are auto-filled from the current vault context when not provided in params.

Common endpoints:
- pulls.list — List pull requests
- pulls.get — Get a single PR (params: { pull_number })
- pulls.create — Create a PR (params: { title, head, base, body? })
- issues.list — List issues
- issues.get — Get a single issue (params: { issue_number })
- issues.create — Create an issue (params: { title, body? })
- checks.listForRef — Get CI status (params: { ref })
- branches.list — List branches
- branches.get — Get branch details (params: { branch })
- actions.listWorkflowRunsForRepo — List workflow runs
- repos.getContent — Get file/directory contents (params: { path })
- repos.listCommits — List commits (params: { sha?, per_page? })
- git.getRef — Get a git reference (params: { ref })`,
    input_schema: {
      type: "object" as const,
      properties: {
        endpoint: {
          type: "string",
          description:
            'GitHub REST API endpoint in "category.method" format, e.g. "pulls.list", "issues.get"',
        },
        params: {
          type: "object",
          description:
            "Parameters passed to the GitHub API method. Owner and repo are auto-injected.",
          additionalProperties: true,
        },
      },
      required: ["endpoint"],
    },
  },
  {
    name: "commit_and_push",
    description:
      "Propose committing all currently staged file changes and pushing to the main branch. The user will see an approval button — changes are NOT committed until approved.",
    input_schema: {
      type: "object" as const,
      properties: {
        message: {
          type: "string",
          description: "A short commit message describing the changes",
        },
      },
      required: ["message"],
    },
  },
];

// --- GitHub API Allowlist ---

const GITHUB_API_ALLOWLIST = new Set([
  // Repos
  "repos.get",
  "repos.getContent",
  "repos.listCommits",
  "repos.listBranches",
  "repos.getBranch",
  "repos.listContributors",
  "repos.listLanguages",
  "repos.listTags",
  "repos.listReleases",
  "repos.getRelease",
  "repos.getLatestRelease",
  "repos.compareCommits",
  "repos.compareCommitsWithBasehead",
  // Pulls
  "pulls.list",
  "pulls.get",
  "pulls.create",
  "pulls.update",
  "pulls.listFiles",
  "pulls.listReviews",
  "pulls.listReviewComments",
  "pulls.listCommits",
  "pulls.checkIfMerged",
  "pulls.merge",
  "pulls.requestReviewers",
  // Issues
  "issues.list",
  "issues.get",
  "issues.create",
  "issues.update",
  "issues.listComments",
  "issues.createComment",
  "issues.listLabelsOnIssue",
  "issues.addLabels",
  "issues.listForRepo",
  // Branches
  "branches.list",
  "branches.get",
  // Checks / CI
  "checks.listForRef",
  "checks.listForSuite",
  "checks.get",
  "checks.listSuitesForRef",
  // Actions / Workflows
  "actions.listWorkflowRunsForRepo",
  "actions.getWorkflowRun",
  "actions.listJobsForWorkflowRun",
  "actions.listRepoWorkflows",
  // Git
  "git.getRef",
  "git.getCommit",
  "git.getTree",
  "git.getBlob",
  "git.listMatchingRefs",
  // Users
  "users.getAuthenticated",
  // Search
  "search.issuesAndPullRequests",
  "search.code",
  "search.commits",
]);

// --- System Prompt Builder ---

function buildSystemPrompt(context: {
  owner?: string;
  repo?: string;
  branch?: string;
  filePath?: string;
  fileContent?: string;
  repoTree?: string[];
}): string {
  const lines = [
    "You are a coding assistant in Noter, a collaborative code editor connected to GitHub.",
    "You can read and edit files, access the GitHub API, and propose commits.",
    "",
    "When editing files:",
    "- Read the file first to understand its current content",
    "- Make precise, minimal edits",
    "- After all edits are done, use commit_and_push to propose committing",
    "",
    "When using github_api:",
    "- Owner and repo are auto-filled from the current vault context",
    "- Common endpoints: pulls.list, pulls.get, pulls.create, issues.list, checks.listForRef, branches.list, actions.listWorkflowRunsForRepo",
    "- You can access any GitHub REST API endpoint on the allowlist",
    "",
    "Be concise and direct. When showing code, use markdown code blocks.",
  ];

  // Repository context
  if (context.owner && context.repo) {
    lines.push("", `## Current Context`);
    lines.push(`Repository: ${context.owner}/${context.repo}`);
    if (context.branch) {
      lines.push(`Branch: ${context.branch}`);
    }
  }

  // Current file context
  if (context.filePath) {
    lines.push("", `### Currently Open File`);
    lines.push(`Path: ${context.filePath}`);
    lines.push(
      "The user is currently viewing and editing this file. When they ask questions without specifying a file, they are likely referring to this one.",
    );

    if (context.fileContent !== undefined) {
      // Truncate very large files to avoid blowing up the system prompt
      const maxLen = 12000;
      const content =
        context.fileContent.length > maxLen
          ? context.fileContent.slice(0, maxLen) + "\n... (file truncated)"
          : context.fileContent;
      lines.push("", "Current file content:", "```", content, "```");
    }
  }

  // Repository structure
  if (context.repoTree && context.repoTree.length > 0) {
    lines.push("", `### Repository File Structure`);
    // Cap tree listing to keep prompt manageable
    const maxFiles = 200;
    if (context.repoTree.length > maxFiles) {
      lines.push(
        context.repoTree.slice(0, maxFiles).join("\n"),
        `... and ${context.repoTree.length - maxFiles} more files`,
      );
    } else {
      lines.push(context.repoTree.join("\n"));
    }
  }

  return lines.join("\n");
}

// --- Tool Executors ---

interface ToolContext {
  ctx: ActionCtx;
  vaultId: Id<"vaults">;
  owner: string;
  repo: string;
  userId: Id<"users">;
  accessToken: string;
}

async function executeReadFile(
  toolCtx: ToolContext,
  input: { path: string },
): Promise<string> {
  // 1. Check staging
  const staging = await toolCtx.ctx.runQuery(
    internal.fileStaging.getByOriginalPath,
    { vaultId: toolCtx.vaultId, originalFilePath: input.path },
  );
  if (staging) {
    return staging.content;
  }

  // 2. Check blobs via vault tree
  const vault = await toolCtx.ctx.runQuery(internal.vault.getById, {
    id: toolCtx.vaultId,
  });
  if (vault) {
    const treeSha = vault.treeData.tree.find(
      (t: { path?: string }) => t.path === input.path,
    )?.sha;
    if (treeSha) {
      const blob = await toolCtx.ctx.runQuery(
        internal.gitOperations.getBlobBySha,
        { sha: treeSha },
      );
      if (blob?.text !== undefined) {
        return blob.text;
      }
    }
  }

  // 3. Fall back to GitHub API
  const octokit = new Octokit({ auth: toolCtx.accessToken });
  const file = await octokit.rest.repos.getContent({
    owner: toolCtx.owner,
    repo: toolCtx.repo,
    path: input.path,
  });
  if (Array.isArray(file.data) || file.data.type !== "file") {
    return `Error: ${input.path} is a directory, not a file`;
  }
  return Buffer.from(file.data.content, "base64").toString("utf-8");
}

async function executeListFiles(
  toolCtx: ToolContext,
  input: { directory?: string },
): Promise<string> {
  const vault = await toolCtx.ctx.runQuery(internal.vault.getById, {
    id: toolCtx.vaultId,
  });
  if (!vault) return "Error: vault not found";

  let entries = vault.treeData.tree.filter(
    (t: { type?: string }) => t.type === "blob",
  );
  if (input.directory) {
    const prefix = input.directory.endsWith("/")
      ? input.directory
      : input.directory + "/";
    entries = entries.filter((t: { path?: string }) =>
      t.path?.startsWith(prefix),
    );
  }
  if (entries.length === 0) {
    return input.directory
      ? `No files found in directory: ${input.directory}`
      : "Repository has no files";
  }
  return entries.map((t: { path?: string }) => t.path).join("\n");
}

async function executeEditFile(
  toolCtx: ToolContext,
  input: { path: string; content: string },
): Promise<string> {
  // Ensure file exists in staging (loads from blob/GitHub if needed)
  const repoFullName = `${toolCtx.owner}/${toolCtx.repo}`;
  await toolCtx.ctx.runAction(api.fileStagingActions.getFileForEditing, {
    repositoryFullName: repoFullName,
    originalFilePath: input.path,
  });

  // Save the new content
  await toolCtx.ctx.runMutation(internal.fileStaging.saveToStaging, {
    vaultId: toolCtx.vaultId,
    initialFilePath: input.path,
    content: input.content,
    initialContent: "", // saveToStaging only uses this for new records
    parentCommitSha: null,
    branch: "main",
  });

  return `File edited: ${input.path}`;
}

async function executeCreateFile(
  toolCtx: ToolContext,
  input: { path: string; content: string },
): Promise<string> {
  await toolCtx.ctx.runMutation(api.fileStaging.createFileInStaging, {
    vaultId: toolCtx.vaultId,
    filePath: input.path,
    content: input.content,
    branch: "main",
  });
  return `File created: ${input.path}`;
}

async function executeDeleteFile(
  toolCtx: ToolContext,
  input: { path: string },
): Promise<string> {
  // Get vault for parentCommitSha
  const vault = await toolCtx.ctx.runQuery(internal.vault.getById, {
    id: toolCtx.vaultId,
  });
  const sha =
    vault?.treeData.tree.find((t: { path?: string }) => t.path === input.path)
      ?.sha ?? null;

  await toolCtx.ctx.runMutation(api.fileStaging.markFileForDeletion, {
    vaultId: toolCtx.vaultId,
    filePath: input.path,
    parentCommitSha: sha,
    branch: "main",
  });
  return `File marked for deletion: ${input.path}`;
}

async function executeGithubApi(
  toolCtx: ToolContext,
  input: { endpoint: string; params?: Record<string, unknown> },
): Promise<string> {
  if (!GITHUB_API_ALLOWLIST.has(input.endpoint)) {
    return `Error: endpoint "${input.endpoint}" is not allowed. Use only allowlisted GitHub API endpoints.`;
  }

  const [category, method] = input.endpoint.split(".");
  if (!category || !method) {
    return `Error: invalid endpoint format "${input.endpoint}". Expected "category.method" (e.g. "pulls.list")`;
  }

  const octokit = new Octokit({ auth: toolCtx.accessToken });

  // Auto-inject owner/repo
  const params = {
    owner: toolCtx.owner,
    repo: toolCtx.repo,
    ...(input.params ?? {}),
  };

  // @ts-expect-error — dynamic dispatch on Octokit.rest
  const categoryObj = octokit.rest[category];
  if (!categoryObj) {
    return `Error: unknown GitHub API category "${category}"`;
  }
  const fn = categoryObj[method];
  if (typeof fn !== "function") {
    return `Error: unknown method "${method}" on category "${category}"`;
  }

  const response = await fn(params);

  // Truncate large responses to avoid blowing up context
  const json = JSON.stringify(response.data, null, 2);
  if (json.length > 15000) {
    return json.slice(0, 15000) + "\n\n... (response truncated)";
  }
  return json;
}

// --- Main Action ---

const MODEL = "claude-sonnet-4-20250514";

export const generateResponse = internalAction({
  args: {
    conversationId: v.id("chatConversations"),
    vaultId: v.optional(v.id("vaults")),
    filePath: v.optional(v.string()),
    branch: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const messages = await ctx.runQuery(internal.chat.loadMessagesForAction, {
      conversationId: args.conversationId,
    });

    // Load vault context if available
    let vault: {
      _id: Id<"vaults">;
      ghRepoOwner: string;
      ghRepoName: string;
      userId?: Id<"users">;
      treeData?: Infer<typeof GithubTreeData>;
    } | null = null;
    let user: {
      _id: Id<"users">;
      githubAccessToken?: string;
    } | null = null;

    if (args.vaultId) {
      const v = await ctx.runQuery(internal.vault.getById, {
        id: args.vaultId,
      });
      if (v) {
        vault = v;
        user = await ctx.runQuery(internal.users.getById, {
          userId: v.userId,
        });
      }
    }

    const hasToolAccess = vault && user?.githubAccessToken;

    // Gather context for the system prompt
    let fileContent: string | undefined;
    let repoTree: string[] | undefined;

    if (vault) {
      // Get repo file tree
      repoTree = vault.treeData?.tree
        ?.filter((t: { type?: string }) => t.type === "blob")
        ?.map((t: { path?: string }) => t.path)
        ?.filter((p: string | undefined): p is string => !!p);
    }

    if (args.filePath && vault && user?.githubAccessToken) {
      // Try to get current file content for context
      try {
        const toolCtx: ToolContext = {
          ctx,
          vaultId: vault._id,
          owner: vault.ghRepoOwner,
          repo: vault.ghRepoName,
          userId: user._id,
          accessToken: user.githubAccessToken,
        };
        fileContent = await executeReadFile(toolCtx, {
          path: args.filePath,
        });
      } catch {
        // File content is optional context — don't fail the request
      }
    }

    const systemPrompt = buildSystemPrompt({
      owner: vault?.ghRepoOwner,
      repo: vault?.ghRepoName,
      branch: args.branch,
      filePath: args.filePath,
      fileContent,
      repoTree,
    });

    const client = new Anthropic();

    // Build Anthropic message history
    const anthropicMessages: Anthropic.MessageParam[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Multi-turn tool execution loop
    const toolActivityLog: Array<{
      tool: string;
      input: unknown;
      result: string;
    }> = [];

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 8192,
        system: systemPrompt,
        messages: anthropicMessages,
        tools: hasToolAccess ? TOOLS : undefined,
      });

      // Collect text content
      const textParts = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text);

      // Check for tool use
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
      );

      if (response.stop_reason === "end_turn" || toolUseBlocks.length === 0) {
        // Done — save the final text response
        const finalText = textParts.join("") || "(No response)";
        const metadata =
          toolActivityLog.length > 0
            ? JSON.stringify({
                type: "tool_activity",
                tools: toolActivityLog.map((t) => ({
                  tool: t.tool,
                  input: t.input,
                })),
              })
            : undefined;

        await ctx.runMutation(internal.chat.saveAssistantMessage, {
          conversationId: args.conversationId,
          content: finalText,
          model: MODEL,
          metadata,
        });
        break;
      }

      // Execute tools and build tool results
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        let result: string;

        if (!hasToolAccess || !vault || !user?.githubAccessToken) {
          result =
            "Error: no vault context available. The user needs to be viewing a repository.";
        } else {
          const toolCtx: ToolContext = {
            ctx,
            vaultId: vault._id,
            owner: vault.ghRepoOwner,
            repo: vault.ghRepoName,
            userId: user._id,
            accessToken: user.githubAccessToken,
          };

          try {
            const input = toolUse.input as Record<string, unknown>;

            switch (toolUse.name) {
              case "read_file":
                result = await executeReadFile(toolCtx, {
                  path: input.path as string,
                });
                break;
              case "list_files":
                result = await executeListFiles(toolCtx, {
                  directory: input.directory as string | undefined,
                });
                break;
              case "edit_file":
                result = await executeEditFile(toolCtx, {
                  path: input.path as string,
                  content: input.content as string,
                });
                break;
              case "create_file":
                result = await executeCreateFile(toolCtx, {
                  path: input.path as string,
                  content: input.content as string,
                });
                break;
              case "delete_file":
                result = await executeDeleteFile(toolCtx, {
                  path: input.path as string,
                });
                break;
              case "github_api":
                result = await executeGithubApi(toolCtx, {
                  endpoint: input.endpoint as string,
                  params: input.params as Record<string, unknown> | undefined,
                });
                break;
              case "commit_and_push": {
                // This is special: save a commit proposal message and stop the loop
                const commitMessage = input.message as string;
                await ctx.runMutation(internal.chat.saveAssistantMessage, {
                  conversationId: args.conversationId,
                  content: `I've prepared the changes and propose committing them with the message: "${commitMessage}"`,
                  model: MODEL,
                  metadata: JSON.stringify({
                    type: "commit_proposal",
                    message: commitMessage,
                    tools: toolActivityLog.map((t) => ({
                      tool: t.tool,
                      input: t.input,
                    })),
                  }),
                });
                return null;
              }
              default:
                result = `Error: unknown tool "${toolUse.name}"`;
            }
          } catch (error) {
            result = `Error: ${error instanceof Error ? error.message : String(error)}`;
          }
        }

        toolActivityLog.push({
          tool: toolUse.name,
          input: toolUse.input,
          result:
            result.length > 500
              ? result.slice(0, 500) + "... (truncated in log)"
              : result,
        });

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
        });
      }

      // Append assistant response + tool results for next iteration
      anthropicMessages.push({ role: "assistant", content: response.content });
      anthropicMessages.push({ role: "user", content: toolResults });
    }

    return null;
  },
});
