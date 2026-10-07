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
    "Build and ship web apps in the user's GitHub, Convex, and Cloudflare accounts. Samebase creates, connects, configures, and inspects provider resources through MCP. One bundled skill guides the coding agent through repository setup, implementation, validation, and deployment.",
  category: "DEVELOPER_TOOLS",
} as const;

/** Walkthrough recording the portal requires at submission: sign-in, then the submitted cases on ChatGPT web. */
export const demoRecordingUrl = "https://youtu.be/eoK5Md5bCgM";

/** Summarizes the plugin version being submitted; the portal imports it as release notes. */
export const releaseNotes =
  "0.3.5: plugin README and license metadata for directory listings, and the MCP Registry server.json. No tool change. 0.3.4: one catalog of 18 tools named by Convex function path. repository_getStatus reads live builds, URLs, Convex deployments, checks, and pull requests of one repository. Connecting a Worker, rotating deploy keys, retrying setup, and detaching a resource now need a server-issued confirmation on a second call. Shorter server instructions and rewritten test cases.";

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
    read_only_justification:
      "Only lists the caller's Samebase repositories, their setup state, the names of attached Workers, and the slugs and names of attached Convex projects.",
    open_world_justification:
      "Reads only repositories in Samebase organizations where the caller is a current member, and the slugs and names of their attached Convex projects in the connected Convex team.",
    destructive_justification: noDestructiveActions,
  },
  repository_getStatus: {
    read_only_justification:
      "Only reads the repository's Workers, builds, URLs, Convex deployments, default branch checks, and open pull requests, and derives attention items from them.",
    open_world_justification:
      "Calls the GitHub, Cloudflare, and Convex APIs to read the selected repository's live builds, URLs, deployments, checks, and pull requests. It reads only resources in the organization's connected accounts and writes nothing.",
    destructive_justification: noDestructiveActions,
  },
  repository_convex_findProjects: {
    read_only_justification:
      "Only reads repository code locations, connected Convex projects, and Cloudflare Worker markers.",
    open_world_justification:
      "Calls the GitHub and Convex APIs to read the selected repository's code locations and the projects of the organization's connected Convex team. It reads only resources in the connected accounts and writes nothing.",
    destructive_justification: noDestructiveActions,
  },
  repository_cloudflare_findWorkers: {
    read_only_justification:
      "Only lists existing Workers and reads their repository connections and build roots.",
    open_world_justification:
      "Calls the Cloudflare API to list the Workers of the selected repository's connected Cloudflare account and their Workers Builds connections. It reads only that account and writes nothing.",
    destructive_justification: noDestructiveActions,
  },
  repository_create: {
    read_only_justification:
      "Starts a managed setup workflow that creates a GitHub repository and a Convex project with the selected production region, records Samebase state, and creates a Cloudflare Worker only when the Cloudflare account has a Workers Builds token, which Samebase picks.",
    open_world_justification:
      "Creates resources in GitHub and Convex, including one Convex production deployment in the selected region. It can create a public GitHub repository when requested and creates a Cloudflare Worker only when the Cloudflare account has a Workers Builds token.",
    destructive_justification:
      "Creates only new resources and rejects existing names before it creates anything. It does not overwrite or delete an existing repository, project, Worker, deployment, or user data.",
  },
  repository_connect: {
    read_only_justification:
      "Records an existing GitHub repository as a Samebase repository and starts a tree sync; provider resources are not modified.",
    open_world_justification:
      "Calls the GitHub API to read the repository through the organization's authorized GitHub installation and to sync its tree, then records the Samebase connection. It changes nothing in GitHub.",
    destructive_justification: noDestructiveActions,
  },
  repository_convex_attachProject: {
    read_only_justification:
      "Records one existing Convex project and one confirmed Convex code location as a repository attachment.",
    open_world_justification:
      "Calls the GitHub and Convex APIs to confirm the code location and the project in the organization's connected accounts, then records the attachment in Samebase. It changes nothing in GitHub or Convex.",
    destructive_justification: noDestructiveActions,
  },
  repository_convex_createProject: {
    read_only_justification:
      "Creates one Convex project with a production deployment and records it as a repository attachment.",
    open_world_justification:
      "Creates a project in the caller's connected Convex team, which provisions a production deployment in the selected region.",
    destructive_justification:
      "Rejects existing project names. It does not overwrite or delete an existing project, deployment, repository, or user data.",
  },
  repository_cloudflare_attachWorkers: {
    read_only_justification:
      "Records existing Cloudflare Workers that already build this repository as repository attachments; Workers without a verified root for this repository are rejected.",
    open_world_justification:
      "Calls the Cloudflare API to re-verify each Worker's identity and live Workers Builds root in the organization's connected account, then records the attachments in Samebase. It changes nothing in Cloudflare.",
    destructive_justification: noDestructiveActions,
  },
  repository_cloudflare_connectWorker: {
    read_only_justification:
      "Connects an existing Worker to the repository: records the attachment, writes its Workers Builds settings, installs the Convex deploy key when a Convex project is attached, and starts a production build.",
    open_world_justification:
      "Writes build settings in the caller's Cloudflare account, creates deploy keys in the caller's Convex project, and starts a production build that publishes the repository's code on the Worker.",
    destructive_justification: `The production build replaces what the Worker currently serves with a build of this repository. It accepts only Workers that have no Workers Builds repository connection, and it does not delete the Worker or user data. ${serverConfirmation}`,
  },
  repository_cloudflare_createWorker: {
    read_only_justification:
      "Creates one Cloudflare Worker, records it as a repository attachment, configures its Workers Builds production and Previews Base settings, installs the Convex deploy key when a Convex project is attached, and starts the first production build.",
    open_world_justification:
      "Creates and configures a Worker in the caller's Cloudflare account, creates deploy keys in the caller's Convex project, and starts a build for the caller's GitHub repository.",
    destructive_justification:
      "Rejects existing Worker names and existing Workers Builds connections. It initializes native previews only on its new Worker. It does not overwrite or delete an existing Worker, repository, deployment, or user data.",
  },
  repository_cloudflare_configureBuilds: {
    read_only_justification:
      "Creates or rewrites an attached Worker's Workers Builds production and Previews Base settings for this repository, then starts a production build.",
    open_world_justification:
      "Writes build settings in the caller's Cloudflare account and starts a production build of the caller's GitHub repository.",
    destructive_justification:
      "May overwrite the Worker's production, Previews Base, and existing preview build settings, including repository roots and commands, before starting a production build. It does not revoke keys or delete user data, repositories, deployments, or Workers.",
  },
  repository_cloudflare_rotateConvexDeployKeys: {
    read_only_justification:
      "Replaces the Convex deploy keys in an attached Worker's Workers Builds production, Previews Base, and existing preview variables, and starts a production build.",
    open_world_justification:
      "Creates deploy keys in the caller's Convex project, sets variables in the caller's Cloudflare build settings, and starts a production build.",
    destructive_justification: `Revokes the recorded Convex deploy keys before creating replacements and updating build variables, so a failure can leave builds without access. ${serverConfirmation}`,
  },
  repository_retryProviderSetup: {
    read_only_justification:
      "Starts a fresh managed setup run that reuses attached resources, creates missing ones, and configures Workers Builds and rotates deploy keys when Cloudflare is requested.",
    open_world_justification:
      "Creates missing Convex and Cloudflare resources and starts production builds that can publish the repository's code.",
    destructive_justification: `When Cloudflare is requested, it reconfigures the Worker's production and preview build settings and revokes and replaces the recorded Convex deploy keys. ${serverConfirmation}`,
  },
  repository_detachResource: {
    read_only_justification:
      "Removes one Worker or Convex project attachment from the Samebase repository record.",
    open_world_justification:
      "Changes only Samebase state. It reads the connected Convex team only to resolve a project slug, changes nothing in GitHub, Convex, or Cloudflare, and the resource keeps running in the provider account.",
    destructive_justification: `Removes the Samebase attachment record, so Samebase stops managing that Worker or Convex project for the repository. It does not delete the provider resource or user data. ${serverConfirmation}`,
  },
  repository_setupOutput_apply: {
    read_only_justification:
      "Attaches the Workers and Convex projects that the repository's own GitHub Actions setup output lists to the Samebase repository record.",
    open_world_justification:
      "Reads the repository's GitHub Actions artifacts and checks each listed resource in the caller's Cloudflare account and Convex team. It changes nothing in GitHub, Cloudflare, or Convex.",
    destructive_justification:
      "Changes only Samebase attachment records: it can replace the record of a Worker that the setup stack recreated. It does not delete or change any provider resource or user data.",
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
      "The answer lists each repository by owner/name, including samebase-live-tests/tmp-my-cool-app2, with its source setup status and its provider setup status. It can name the attached Workers and Convex projects. It does not say that the list proves that an app is live.",
  },
  {
    description:
      "Find the Cloudflare Workers that can be added to samebase-live-tests/tmp-my-cool-app2 in its stored Cloudflare account, without changing them.",
    prompt: "Show me the Cloudflare Workers I can attach to samebase-live-tests/tmp-my-cool-app2.",
    tools_triggered: ["repository_cloudflare_findWorkers"],
    expected_behavior:
      "The answer lists tmp-something as a connectable Worker that is not attached to any repository, and gives the counts of Workers already attached to this repository and attached elsewhere. It may warn that connecting replaces what the Worker serves. It does not say that a Worker was attached, connected, or created.",
  },
  {
    description:
      "Create one private repository with the reviewer account's prepared samebase-live-tests GitHub, Convex, and Cloudflare connections. This fixture requires an available last-used Workers Builds token and enough organization connection capacity, so Samebase picks the token and asks nothing about it.",
    prompt:
      "Create a private Samebase repository under samebase-live-tests with a unique name that starts with tmp-plugin-review-, and report its setup status.",
    tools_triggered: ["repository_create", "repository_list"],
    expected_behavior:
      "The answer names the new private repository (samebase-live-tests/tmp-plugin-review- with a unique suffix) and its planned Cloudflare Worker, and reports the source setup status and the provider setup status. If setup is still running, it reports the current state and does not say that setup is ready. When both are ready, it can name the attached Convex project that repository_list returns, and it says that ready setup does not prove that the app is live. A failed setup is reported as failed.",
  },
  {
    description:
      "Read the live production status of samebase-live-tests/tmp-my-cool-app2 from GitHub, Cloudflare, and Convex without changing anything.",
    prompt:
      "Is samebase-live-tests/tmp-my-cool-app2 deployed? Give me its production URL, latest build state, Convex deployment, checks, and open pull requests.",
    tools_triggered: ["repository_getStatus"],
    expected_behavior:
      "The answer names the Worker tmp-my-cool-app and its workers.dev production URL, the latest production build state and whether its commit matches the default branch head, the check counts on the default branch, the Convex project tmp-my-cool-app with its production deployment name and region, and each open pull request with its checks and preview build state. It can list attention items. It does not say that the app serves the expected content, and it changes nothing.",
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
      "Calls no Samebase tool. The answer says no: Samebase MCP cannot remove a repository from Samebase or delete its resources; the closest tool only detaches a resource and leaves it running. It does not say that anything was removed.",
  },
  {
    description: "Do not invoke Samebase for a standalone provider resource.",
    prompt: "Create a standalone Cloudflare Worker for me.",
    expected_behavior:
      "Calls no Samebase tool. The answer says that Samebase does not create standalone Workers: a Worker exists only inside a Samebase repository. It does not create anything.",
  },
] as const satisfies SubmissionNegativeTestCases;
