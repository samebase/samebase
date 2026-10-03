/**
Hand-written half of the OpenAI plugin submission file. Tool names, descriptions, and annotations
come from the action catalog; everything here is the prose OpenAI requires that cannot be derived
from code. generate-action-docs.ts composes both halves into /chatgpt-app-submission.json and
fails closed when a catalog tool has no justification entry.
*/

export const appInfo = {
  display_name: "Samebase",
  subtitle: "Build and ship web apps",
  description:
    "Build and ship web apps in the user's GitHub, Convex, and Cloudflare accounts. Samebase creates, connects, configures, and inspects provider resources through MCP. One bundled skill guides the coding agent through repository setup, implementation, validation, and deployment.",
  category: "DEVELOPER_TOOLS",
} as const;

type ToolJustifications = {
  read_only_justification: string;
  open_world_justification: string;
  destructive_justification: string;
};

const noDestructiveActions =
  "Does not delete, overwrite, revoke access, or perform irreversible destructive actions.";

const serverConfirmation =
  "The server gates it: the first call changes nothing and returns the effect, an acknowledgement sentence, and a one-use token that expires after 10 minutes. Only a second call with the same arguments, that token, and the exact sentence performs it.";

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
      "Reads only the selected repository in GitHub and its attached Workers and Convex projects in the organization's connected Cloudflare account and Convex team.",
    destructive_justification: noDestructiveActions,
  },
  repository_convex_findProjects: {
    read_only_justification:
      "Only reads repository code locations, connected Convex projects, and Cloudflare Worker markers.",
    open_world_justification:
      "Reads only the selected repository and its organization's connected Convex team and Cloudflare account.",
    destructive_justification: noDestructiveActions,
  },
  repository_cloudflare_findWorkers: {
    read_only_justification:
      "Only lists existing Workers and reads their repository connections and build roots.",
    open_world_justification:
      "Reads only Workers in the selected repository's connected Cloudflare account.",
    destructive_justification: noDestructiveActions,
  },
  repository_create: {
    read_only_justification:
      "Starts a managed setup workflow that creates a GitHub repository and a Convex project with the selected production region, records Samebase state, and creates a Cloudflare Worker only when the Cloudflare account has a Workers Builds token.",
    open_world_justification:
      "Creates resources in GitHub and Convex, including one Convex production deployment in the selected region. It can create a public GitHub repository when requested and creates a Cloudflare Worker only when the Cloudflare account has a Workers Builds token.",
    destructive_justification:
      "Creates only new resources and rejects existing names before it creates anything. It does not overwrite or delete an existing repository, project, Worker, deployment, or user data.",
  },
  repository_connect: {
    read_only_justification:
      "Records an existing GitHub repository as a Samebase repository and starts a tree sync; provider resources are not modified.",
    open_world_justification:
      "Reads only a repository within the selected organization's authorized GitHub installation and records its Samebase connection.",
    destructive_justification: noDestructiveActions,
  },
  repository_convex_attachProject: {
    read_only_justification:
      "Records one existing Convex project and one confirmed Convex code location as a repository attachment.",
    open_world_justification:
      "Reads only the organization's authorized GitHub repository and connected Convex team, then records the attachment in Samebase.",
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
      "Reads only the organization's connected Cloudflare account, then records verified repository attachments in Samebase.",
    destructive_justification: noDestructiveActions,
  },
  repository_cloudflare_connectWorker: {
    read_only_justification:
      "Connects an existing Worker to the repository: records the attachment, writes its Workers Builds settings, installs the Convex deploy key, and starts a production build.",
    open_world_justification:
      "Writes build settings in the caller's Cloudflare account, creates deploy keys in the caller's Convex project, and starts a production build that publishes the repository's code on the Worker.",
    destructive_justification: `The production build replaces what the Worker currently serves with a build of this repository. It accepts only Workers that have no Workers Builds repository connection, and it does not delete the Worker or user data. ${serverConfirmation}`,
  },
  repository_cloudflare_createWorker: {
    read_only_justification:
      "Creates one Cloudflare Worker, records it as a repository attachment, configures its Workers Builds production and Previews Base settings, installs the Convex deploy key, and starts the first production build.",
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
      "Changes only Samebase state; it does not call GitHub, Convex, or Cloudflare, and the resource keeps running in the provider account.",
    destructive_justification: `Removes the Samebase attachment record, so Samebase stops managing that Worker or Convex project for the repository. It does not delete the provider resource or user data. ${serverConfirmation}`,
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

type SubmissionTestCase = {
  description: string;
  user_prompt: string;
  file_attachment_urls: null;
  tools_triggered: readonly [SubmissionToolName, ...SubmissionToolName[]];
  expected_output: string;
  expected_output_url: null;
};

type SubmissionNegativeTestCase = Omit<SubmissionTestCase, "tools_triggered"> & {
  tools_triggered: null;
};

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
    user_prompt: "Which Samebase account am I signed in as, and what can this connection access?",
    file_attachment_urls: null,
    tools_triggered: ["account_getAuthenticationStatus"],
    expected_output:
      "Returns the authenticated reviewer account's email, role, GitHub owners, and granted scope names. Does not expose access tokens or internal account IDs.",
    expected_output_url: null,
  },
  {
    description:
      "Inspect the existing Samebase repositories already prepared in the reviewer demo account.",
    user_prompt: "List my Samebase repositories and their setup status.",
    file_attachment_urls: null,
    tools_triggered: ["repository_list"],
    expected_output:
      "Returns one summary per visible repository. Each summary includes its owner/name and independent source and provider setup states. It can include the names of attached Workers and Convex projects, but must not claim that the list is live provider state.",
    expected_output_url: null,
  },
  {
    description:
      "Find Cloudflare Workers for samebase-live-tests/tmp-my-cool-app2 in its stored Cloudflare account.",
    user_prompt:
      "Show me the Cloudflare Workers I can attach to samebase-live-tests/tmp-my-cool-app2.",
    file_attachment_urls: null,
    tools_triggered: ["repository_cloudflare_findWorkers"],
    expected_output:
      "Calls Worker discovery for samebase-live-tests/tmp-my-cool-app2 and reports Workers from only that repository's Cloudflare account. Reports that no Worker is left to attach: the Worker already attached to this repository and the Workers that cannot be added are counted, and no Worker is attachable. A connectable Worker can be connected only after the user approves replacing what it serves. It does not attach, connect, or create a Cloudflare resource, and it does not select another account.",
    expected_output_url: null,
  },
  {
    description:
      "Create one private repository with the reviewer account's prepared samebase-live-tests GitHub, Convex, and Cloudflare connections. This fixture requires an available last-used Workers Builds token and enough organization connection capacity.",
    user_prompt:
      "Create a private Samebase repository under samebase-live-tests in US East (N. Virginia) with a unique name that starts with tmp-plugin-review-. Report its repository and provider setup status.",
    file_attachment_urls: null,
    tools_triggered: ["repository_create", "repository_list"],
    expected_output:
      "Calls creation once with private true and aws-us-east-1, without a token UUID, so Samebase uses the available last-used Workers Builds token and leaves the saved organization default unchanged. Returns the new repository with a planned Cloudflare Worker, then polls the repository list for its source and provider setup status. The expected completed setup is a private GitHub repository, an attached Convex project in US East, and an attached Cloudflare Worker with Workers Builds configured and a production build requested. Reports ready only when both setup states are ready; reports any failed setup accurately. The initial creation response and ready setup do not prove that a build succeeded or the app is live. A missing last-used token means the reviewer fixture must be repaired before this case can pass.",
    expected_output_url: null,
  },
  {
    description:
      "Create a browser sign-in link for the authenticated reviewer account without changing provider resources.",
    user_prompt: "Open my Samebase dashboard in the browser.",
    file_attachment_urls: null,
    tools_triggered: ["account_createSignInLink"],
    expected_output:
      "Returns a one-time Samebase sign-in URL for the current MCP account and shows it as a clickable link on ChatGPT web and mobile. The private link expires after five minutes. When a browser-opening action is available, it opens that URL; otherwise it does not claim the dashboard opened. Opening the link before expiry signs in to the reviewer dashboard. No provider resource changes.",
    expected_output_url: null,
  },
] as const satisfies SubmissionTestCases;

export const negativeTestCases = [
  {
    description: "Do not invoke Samebase for Git-only work in an unrelated repository.",
    user_prompt: "Change the README heading in octocat/Hello-World and open a pull request.",
    file_attachment_urls: null,
    tools_triggered: null,
    expected_output:
      "Uses available GitHub or local Git capabilities without invoking Samebase because this is ordinary work in an unrelated repository.",
    expected_output_url: null,
  },
  {
    description: "Do not perform destructive provider deletion through the Samebase plugin.",
    user_prompt:
      "Can I remove a Samebase repository from Samebase and delete all of its resources through Samebase MCP?",
    file_attachment_urls: null,
    tools_triggered: null,
    expected_output:
      "Explains that Samebase MCP has no action that removes a repository from Samebase or deletes its resources, and that removal is available in the Samebase dashboard. It may offer to open the dashboard, but it does not call a tool until the user accepts and does not claim that any resource was removed.",
    expected_output_url: null,
  },
  {
    description: "Do not trigger Samebase for a standalone provider resource.",
    user_prompt: "Create a standalone Cloudflare Worker for me.",
    file_attachment_urls: null,
    tools_triggered: null,
    expected_output:
      "Uses a provider-native Cloudflare workflow without invoking Samebase because a standalone Worker is not part of a Samebase repository.",
    expected_output_url: null,
  },
] as const satisfies SubmissionNegativeTestCases;
