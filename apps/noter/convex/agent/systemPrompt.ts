export function buildSystemPrompt(context: {
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

  if (context.owner && context.repo) {
    lines.push("", `## Current Context`);
    lines.push(`Repository: ${context.owner}/${context.repo}`);
    if (context.branch) {
      lines.push(`Branch: ${context.branch}`);
    }
  }

  if (context.filePath) {
    lines.push("", `### Currently Open File`);
    lines.push(`Path: ${context.filePath}`);
    lines.push(
      "The user is currently viewing and editing this file. When they ask questions without specifying a file, they are likely referring to this one.",
    );

    if (context.fileContent !== undefined) {
      const maxLen = 12000;
      const content =
        context.fileContent.length > maxLen
          ? context.fileContent.slice(0, maxLen) + "\n... (file truncated)"
          : context.fileContent;
      lines.push("", "Current file content:", "```", content, "```");
    }
  }

  if (context.repoTree && context.repoTree.length > 0) {
    lines.push("", `### Repository File Structure`);
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
