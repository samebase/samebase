export function buildSystemPrompt(context: {
  owner?: string;
  repo?: string;
  branch?: string;
  filePath?: string;
  repoTree?: string[];
}): string {
  const lines = [
    "You are a coding assistant in Samebase, a collaborative code editor connected to GitHub.",
    "Tool access is not available. You cannot read or edit repository files or call provider APIs.",
  ];

  lines.push("", "Be concise and direct. When showing code, use markdown code blocks.");

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
