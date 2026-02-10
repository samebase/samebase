/**
 * Isomorphic tool catalog — single source of truth for tool metadata.
 *
 * Imported by:
 *  - tools.ts (LangGraph tool definitions)
 *  - ChatFab.tsx (UI capabilities panel + tool activity display)
 *
 * No "use node", no Convex server imports — safe for both server and client.
 */

export interface ToolMeta {
  /** Tool name used by LangGraph */
  name: string;
  /** Full description sent to the LLM via bindTools() */
  description: string;
  /** Short description for the UI capabilities panel */
  uiDescription: string;
  /** Input key to show in tool activity badges (e.g. "path", "endpoint") */
  inputDisplayKey?: string;
}

export const TOOL_CATALOG: ToolMeta[] = [
  {
    name: "read_file",
    description:
      "Read the contents of a file in the repository. Returns the file content as text.",
    uiDescription: "Read a file's contents",
    inputDisplayKey: "path",
  },
  {
    name: "list_files",
    description:
      "List files in the repository, optionally filtered to a directory.",
    uiDescription: "List files (optionally by directory)",
  },
  {
    name: "edit_file",
    description:
      "Edit an existing file by replacing its entire content. The file must already exist.",
    uiDescription: "Replace a file's content",
    inputDisplayKey: "path",
  },
  {
    name: "create_file",
    description: "Create a new file in the repository.",
    uiDescription: "Create a new file",
    inputDisplayKey: "path",
  },
  {
    name: "delete_file",
    description: "Mark a file for deletion in the repository.",
    uiDescription: "Mark a file for deletion",
    inputDisplayKey: "path",
  },
  {
    name: "github_api",
    description: `Call the GitHub REST API. Owner and repo are auto-filled from the current vault context.

Common endpoints:
- pulls.list — List pull requests
- pulls.get — Get a single PR (params: { pull_number })
- pulls.create — Create a PR (params: { title, head, base, body? })
- issues.list — List issues
- issues.get — Get a single issue (params: { issue_number })
- issues.create — Create an issue (params: { title, body? })
- checks.listForRef — Get CI status (params: { ref })
- branches.list — List branches
- actions.listWorkflowRunsForRepo — List workflow runs`,
    uiDescription: "Call allowlisted GitHub endpoints",
    inputDisplayKey: "endpoint",
  },
  {
    name: "commit_and_push",
    description:
      "Propose committing all currently staged file changes and pushing to the main branch. The user will see an approval button — changes are NOT committed until approved.",
    uiDescription: "Propose a commit (requires approval)",
  },
];
