/**
Hand-written half of the OpenAI plugin submission. Tool names, descriptions, and annotations come
from the action catalog; everything here is the prose OpenAI requires that cannot be derived from
code. generate-action-docs.ts composes both halves into /chatgpt-app-submission.json (per-tool
annotation justifications for the portal) and into the Codex manifest's extensions.com.openai
block (test cases, demo recording, release notes), and fails closed when a catalog tool has no
justification entry.
*/

export const appInfo = {
  display_name: "Samebase",
  subtitle: "Build and ship web apps",
  description:
    "Start and monitor web apps in the user's own accounts. Samebase creates or connects a GitHub repository and reads its status through MCP. The repository's GitHub Actions deploy it with Alchemy, and repair lives in Alchemy and the coding agent. One bundled skill guides the agent through repository setup, implementation, and validation.",
  category: "DEVELOPER_TOOLS",
} as const;

/** Walkthrough recording the portal requires at submission: sign-in, then the submitted cases on ChatGPT web. */
export const demoRecordingUrl = "https://youtu.be/eoK5Md5bCgM";

/** Summarizes the plugin version being submitted; the portal imports it as release notes. */
export const releaseNotes =
  "0.3.7: Samebase starts and monitors apps, and repair lives in Alchemy and the coding agent. The catalog drops the 10 tools that attached, created, repaired, or detached Workers and Convex projects, and keeps 8 tools. repository_list no longer names attached resources or pending Cloudflare setup. repository_getStatus reads each stack from the team's Alchemy state store: its production URL, deployed commit, and preview URLs. 0.3.6: the MCP server URL is https://samebase.com/mcp. No tool change. 0.3.5: plugin README and license metadata for directory listings, and the MCP Registry server.json. No tool change. 0.3.4: one catalog of 18 tools named by Convex function path. repository_getStatus reads live builds, URLs, Convex deployments, checks, and pull requests of one repository. Connecting a Worker, rotating deploy keys, retrying setup, and detaching a resource now need a server-issued confirmation on a second call. Shorter server instructions and rewritten test cases.";

type ToolJustifications = {
  read_only_justification: string;
  open_world_justification: string;
  destructive_justification: string;
};

const noDestructiveActions =
  "Does not delete, overwrite, revoke access, or perform irreversible destructive actions.";

const serverConfirmation =
  "The server gates it: the first call changes nothing and returns the effect, an acknowledgement sentence, and a one-use token that expires after 10 minutes. The agent tells the user the effect. Only a second call after the user approves, with the same arguments, that token, and the exact sentence, performs it.";

export const toolJustifications = {
  repository_list: {
    read_only_justification: "Only lists the caller's Samebase repositories and their setup state.",
    open_world_justification:
      "Reads only repositories in Samebase organizations where the caller is a current member.",
    destructive_justification: noDestructiveActions,
  },
  repository_getStatus: {
    read_only_justification:
      "Only reads the repository's Alchemy stacks, URLs, deployed commits, default branch checks, and open pull requests, and derives attention items from them.",
    open_world_justification:
      "Calls the GitHub and Convex APIs to read the selected repository's stacks, URLs, deployed commits, checks, and pull requests. It reads only resources in the organization's connected accounts and removes the short-lived read key that it creates in the team's state store deployment.",
    destructive_justification: noDestructiveActions,
  },
  repository_create: {
    read_only_justification:
      "Starts a setup workflow that creates a GitHub repository, writes its GitHub Actions secret and variable, seeds the starter, and records Samebase state.",
    open_world_justification:
      "Creates a GitHub repository, which can be public when requested. The seeded starter runs the repository's GitHub Actions, which create a Convex project and deploy the app in the organization's Convex team.",
    destructive_justification:
      "Creates only new resources and rejects existing names before it creates anything. It does not overwrite or delete an existing repository, project, deployment, or user data.",
  },
  repository_connect: {
    read_only_justification:
      "Records an existing GitHub repository as a Samebase repository and starts a tree sync; provider resources are not modified.",
    open_world_justification:
      "Calls the GitHub API to read the repository through the organization's authorized GitHub installation and to sync its tree, then records the Samebase connection. It changes nothing in GitHub.",
    destructive_justification: noDestructiveActions,
  },
  repository_retryProviderSetup: {
    read_only_justification:
      "Starts a fresh setup run that writes the repository's GitHub Actions secret and variable again and seeds the starter when it was not seeded yet.",
    open_world_justification:
      "Writes to the caller's GitHub repository. A seeded starter runs the repository's GitHub Actions, which deploy the app.",
    destructive_justification: `Replaces the values of the repository's GitHub Actions secret and variable. It never creates or changes a Convex project. ${serverConfirmation}`,
  },
  feedback_submit: {
    read_only_justification:
      "Sends one user-approved feedback report to a fixed Samebase staff mailbox and updates an account-linked submission-attempt counter.",
    open_world_justification:
      "Uses Cloudflare Email Sending and the Samebase staff mailbox. It does not publish the report or modify user-owned provider resources.",
    destructive_justification:
      "Sends the exact report approved by the user to Samebase staff by email, which cannot be recalled after delivery.",
  },
  account_createSignInLink: {
    read_only_justification:
      "Creates a short-lived Samebase browser sign-in URL for the user behind the current MCP grant and records Samebase audit state.",
    open_world_justification:
      "Writes only Samebase-owned handoff state; it does not create, publish, or modify GitHub, Convex, Cloudflare, or other external resources.",
    destructive_justification:
      "Consumes the one-time handoff token on redemption or account mismatch; does not delete user data, repositories, deployments, Workers, or provider resources.",
  },
  account_getAuthenticationStatus: {
    read_only_justification:
      "Only reads the authenticated Samebase account, role, the GitHub owners of its organizations, and granted MCP scopes.",
    open_world_justification:
      "Reads only the current caller's private Samebase account and authorization.",
    destructive_justification: noDestructiveActions,
  },
} as const satisfies Record<string, ToolJustifications>;

type SubmissionToolName = keyof typeof toolJustifications;

/** Field names follow the manifest's extensions.com.openai.review test case shape. */
type SubmissionTestCase = {
  description: string;
  prompt: string;
  tools_triggered: readonly [SubmissionToolName, ...SubmissionToolName[]];
  expected_behavior: string;
};

type SubmissionNegativeTestCase = Omit<SubmissionTestCase, "tools_triggered">;

type SubmissionTestCases = readonly [
  SubmissionTestCase,
  SubmissionTestCase,
  SubmissionTestCase,
  SubmissionTestCase,
  SubmissionTestCase,
];

type SubmissionNegativeTestCases = readonly [
  SubmissionNegativeTestCase,
  SubmissionNegativeTestCase,
  SubmissionNegativeTestCase,
];

export const testCases = [
  {
    description:
      "Inspect the identity and permissions of an already-authorized reviewer connection.",
    prompt: "Which Samebase account am I signed in as, and what can this connection access?",
    tools_triggered: ["account_getAuthenticationStatus"],
    expected_behavior:
      "The answer names the reviewer account's email and role, the GitHub owner of its organization, and the granted permissions. It shows no access token and no internal account ID.",
  },
  {
    description:
      "List the Samebase repositories already prepared in the reviewer account, across its organizations.",
    prompt: "List my Samebase repositories and their setup status.",
    tools_triggered: ["repository_list"],
    expected_behavior:
      "The answer lists each repository by owner/name, including samebase-live-tests/tmp-my-cool-app2, with its source setup status and its provider setup status. It does not say that the list proves that an app is live.",
  },
  {
    description:
      "Create a browser sign-in link for the authenticated reviewer account without changing provider resources.",
    prompt: "Open my Samebase dashboard in the browser.",
    tools_triggered: ["account_createSignInLink"],
    expected_behavior:
      "The answer shows a one-time Samebase sign-in link as a clickable link on ChatGPT web and mobile. It does not say that the dashboard opened unless a browser action opened it.",
  },
  {
    description:
      "Create one private repository with the reviewer account's prepared samebase-live-tests GitHub and Convex connections. This fixture requires enough organization connection capacity.",
    prompt:
      "Create a private Samebase repository under samebase-live-tests with a unique name that starts with tmp-plugin-review-, and report its setup status.",
    tools_triggered: ["repository_create", "repository_list"],
    expected_behavior:
      "The answer names the new private repository (samebase-live-tests/tmp-plugin-review- with a unique suffix), and reports the source setup status and the provider setup status. If setup is still running, it reports the current state and does not say that setup is ready. When both are ready, it says that ready setup does not prove that the app is live, because the repository's GitHub Actions run the deployment. A failed setup is reported as failed.",
  },
  {
    description:
      "Read the live production status of samebase-live-tests/tmp-my-cool-app2 from GitHub and the team's Alchemy state store without changing anything.",
    prompt:
      "Is samebase-live-tests/tmp-my-cool-app2 deployed? Give me its production URL, deployed commit, preview URLs, checks, and open pull requests.",
    tools_triggered: ["repository_getStatus"],
    expected_behavior:
      "The answer names the stack with its production URL, its deployed commit and whether that commit matches the default branch head, its preview URLs, the check counts on the default branch, and each open pull request with its checks. It can list attention items. It does not say that the app serves the expected content, and it changes nothing.",
  },
] as const satisfies SubmissionTestCases;

export const negativeTestCases = [
  {
    description: "Do not invoke Samebase for Git-only work in an unrelated repository.",
    prompt: "Change the README heading in octocat/Hello-World and open a pull request.",
    expected_behavior:
      "Calls no Samebase tool. The answer treats the change and the pull request as GitHub work in a repository that Samebase does not manage.",
  },
  {
    description: "Do not remove a repository or delete provider resources through Samebase MCP.",
    prompt:
      "Can I remove a Samebase repository from Samebase and delete all of its resources through Samebase MCP?",
    expected_behavior:
      "Calls no Samebase tool. The answer says no: Samebase MCP cannot remove a repository from Samebase or delete its resources. It does not say that anything was removed.",
  },
  {
    description: "Do not invoke Samebase for a standalone provider resource.",
    prompt: "Create a standalone Cloudflare Worker for me.",
    expected_behavior:
      "Calls no Samebase tool. The answer says that Samebase does not create Workers, and it does not create anything.",
  },
] as const satisfies SubmissionNegativeTestCases;
