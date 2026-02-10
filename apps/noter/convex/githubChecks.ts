import { action } from "./_generated/server";
import { v } from "convex/values";

export const getCommitStatus = action({
  args: {
    owner: v.string(),
    repo: v.string(),
    ref: v.string(), // commit SHA or branch name
  },
  handler: async (ctx, { owner, repo, ref }) => {
    try {
      // Use the GitHub API to get check runs for the commit
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/commits/${ref}/check-runs`,
        {
          headers: {
            "Authorization": `token ${process.env.GITHUB_TOKEN}`,
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "Noter-App",
          },
        }
      );

      if (!response.ok) {
        console.error(`GitHub API error: ${response.status} ${response.statusText}`);
        return { error: `GitHub API error: ${response.status}` };
      }

      const data = await response.json();
      
      return {
        total_count: data.total_count,
        check_runs: data.check_runs.map((run: any) => ({
          id: run.id,
          name: run.name,
          status: run.status,
          conclusion: run.conclusion,
          started_at: run.started_at,
          completed_at: run.completed_at,
          html_url: run.html_url,
        })),
      };
    } catch (error) {
      console.error("Failed to fetch commit status:", error);
      return { error: "Failed to fetch commit status" };
    }
  },
});