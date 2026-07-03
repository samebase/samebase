import { asRecord, readStringOrNumber } from "./jsonUtils";
import type { ProviderApiCallRecorder } from "./providerApiLog";

const GITHUB_API_VERSION = "2022-11-28";

async function readResponseTextSafe(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

async function parseResponseJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

type GitHubRepoRequestMethod = "GET" | "POST" | "PATCH";

export async function requestGitHubRepoApi(args: {
  githubAccessToken: string;
  owner: string;
  repo: string;
  path: string;
  method: GitHubRepoRequestMethod;
  recordApiCall?: ProviderApiCallRecorder;
  body?: unknown;
}): Promise<unknown> {
  const recordApiCall = args.recordApiCall;
  if (recordApiCall) {
    const values: Record<string, unknown> = {
      params: {
        path: {
          owner: args.owner,
          repo: args.repo,
        },
      },
    };
    if (args.body !== undefined) {
      values.body = args.body;
    }
    await recordApiCall({
      provider: "GitHub",
      method: args.method,
      endpoint: `/repos/{owner}/{repo}${args.path}`,
      values,
    });
  }
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.repo)}${args.path}`;
  const response = await fetch(endpoint, {
    method: args.method,
    headers: {
      Authorization: `Bearer ${args.githubAccessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "Content-Type": "application/json",
    },
    body: args.body === undefined ? undefined : JSON.stringify(args.body),
  });

  if (!response.ok) {
    const responseText = await readResponseTextSafe(response);
    throw new Error(
      `GitHub API request failed (${response.status}) for ${args.owner}/${args.repo}${args.path}: ${responseText}`,
    );
  }

  if (response.status === 204) {
    return null;
  }

  return await parseResponseJsonSafe(response);
}

export async function fetchGitHubRepoIdentity(args: {
  githubAccessToken: string;
  owner: string;
  repo: string;
  expectedRepoId: string;
  recordApiCall?: ProviderApiCallRecorder;
}): Promise<{ ownerId: string }> {
  const repoRaw = await requestGitHubRepoApi({
    githubAccessToken: args.githubAccessToken,
    owner: args.owner,
    repo: args.repo,
    path: "",
    method: "GET",
    recordApiCall: args.recordApiCall,
  });
  const record = asRecord(repoRaw);
  const repoId = readStringOrNumber(record, "id");
  const ownerRecord = asRecord(record["owner"]);
  const ownerId = readStringOrNumber(ownerRecord, "id");
  if (!repoId) {
    throw new Error("GitHub repository response did not include repo id.");
  }
  if (repoId !== args.expectedRepoId) {
    throw new Error("GitHub repository response did not match the vault repo.");
  }
  if (!ownerId) {
    throw new Error("GitHub repository response did not include owner id.");
  }
  return { ownerId };
}
