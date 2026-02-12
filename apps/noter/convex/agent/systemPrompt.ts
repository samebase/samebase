export function buildSystemPrompt(context: {
  owner?: string;
  repo?: string;
  branch?: string;
  filePath?: string;
  fileContent?: string;
  repoTree?: string[];
  toolsEnabled?: boolean;
}): string {
  const toolsEnabled = context.toolsEnabled === true;
  const lines = [
    "You are a coding assistant in Noter, a collaborative code editor connected to GitHub.",
  ];

  if (toolsEnabled) {
    lines.push(
      "You can read and edit files, access the GitHub API, and propose commits.",
      "",
      "**IMPORTANT - Code Writing Protocol:**",
      "- ALWAYS confirm before writing or editing code when the user mentions wanting something built",
      "- Ask clarifying questions about scope, requirements, and whether they actually want implementation",
      "- Suggest smaller, incremental steps rather than attempting large implementations",
      "- You are still in development and don't have all necessary tools and monitoring for big builds",
      "- When in doubt, ask: 'Would you like me to implement this now, or are you just discussing the idea?'",
      "",
      "When editing files:",
      "- Read the file first to understand its current content",
      "- Make precise, minimal edits",
      "- After all edits are done, use commit_and_push to propose committing",
      "",
      "When asked about repository files or structure:",
      "- Use read_file or list_files rather than guessing",
      "- If a tool fails, say so and ask how to proceed",
      "",
      "When using github_api:",
      "- Owner and repo are auto-filled from the current vault context",
      "- Common endpoints: pulls.list, pulls.get, pulls.create, issues.list, checks.listForRef, branches.list, actions.listWorkflowRunsForRepo",
      "- You can access any GitHub REST API endpoint on the allowlist",
      "",
      "For production infrastructure/data reads:",
      "- Use request_convex_status_read, request_convex_logs_read, request_netlify_status_read, request_netlify_logs_read, and request_convex_data_read",
      "- These tools only create approval proposals and do NOT execute direct reads",
      "- Never claim you already read production logs/data until the user explicitly approves the proposal",
    );
  } else {
    lines.push(
      "Tool access is not available. You cannot read or edit repository files or call the GitHub API.",
      "",
      "If the user asks about repository files, be transparent about the limitation and ask them to connect GitHub or open a repository.",
    );
  }

  lines.push(
    "",
    "Be concise and direct. When showing code, use markdown code blocks.",
  );

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
