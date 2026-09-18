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

export const toolJustifications = {
  samebase_auth_getAuthenticationStatus: {
    read_only_justification:
      "Only reads the authenticated Samebase account, role, permissions, and granted MCP scopes.",
    open_world_justification:
      "Reads only the current caller's private Samebase account and authorization.",
    destructive_justification: noDestructiveActions,
  },
  repository_dashboard_getUserRepositories: {
    read_only_justification:
      "Only lists the caller's Samebase apps, setup state, and attached resource identities.",
    open_world_justification:
      "Reads only apps in Samebase workspaces where the caller is a current member.",
    destructive_justification: noDestructiveActions,
  },
  cloudflare_listWorkersBuildTokens: {
    read_only_justification:
      "Only lists non-secret Workers Builds token names and UUIDs, without creating or changing tokens.",
    open_world_justification:
      "Reads only the Cloudflare account connected to the selected Samebase workspace.",
    destructive_justification: noDestructiveActions,
  },
  repository_actions_createRepository: {
    read_only_justification:
      "Starts a managed app provisioning workflow that creates a GitHub repository and a Convex project with the selected production region, records Samebase state, and creates Cloudflare resources only when a current Workers Builds token UUID is supplied.",
    open_world_justification:
      "Creates resources in GitHub and Convex, including one Convex production deployment in the selected region. It can create a public GitHub repository when requested and creates Cloudflare resources only when a current Workers Builds token UUID is supplied. A confirmed empty token list creates no Cloudflare Worker.",
    destructive_justification: noDestructiveActions,
  },
  repository_actions_connectRepository: {
    read_only_justification:
      "Creates the repository-backed Samebase repository and starts a tree sync; provider resources are not modified.",
    open_world_justification:
      "Reads only a repository within the selected workspace's authorized GitHub installation and records its Samebase connection.",
    destructive_justification: noDestructiveActions,
  },
  repository_convex_discoverProjects: {
    read_only_justification:
      "Only reads repository code locations, connected Convex projects, and Cloudflare Worker markers.",
    open_world_justification:
      "Reads only the selected repository and its workspace's connected Convex team and Cloudflare account.",
    destructive_justification: noDestructiveActions,
  },
  repository_cloudflare_createWorker: {
    read_only_justification:
      "Creates one Cloudflare Worker, records it as a repository attachment, configures its Workers Builds production and Previews Base settings, and requests an initial production build.",
    open_world_justification:
      "Creates and configures a Worker in the caller's Cloudflare account and starts a build for the caller's GitHub repository.",
    destructive_justification:
      "Rejects existing Worker names and existing Workers Builds connections. It initializes native previews only on its new Worker. It does not overwrite or delete an existing Worker, repository, deployment, or user data.",
  },
  repository_cloudflare_discoverWorkers: {
    read_only_justification:
      "Only lists existing Workers and reads their repository connections, build roots, and Convex project markers.",
    open_world_justification:
      "Reads only Workers in the selected repository's connected Cloudflare account.",
    destructive_justification: noDestructiveActions,
  },
  repository_convex_attachProjects: {
    read_only_justification:
      "Records selected existing Convex projects and confirmed convex.json paths as repository attachments.",
    open_world_justification:
      "Reads only the workspace's authorized GitHub repository and connected Convex projects, then records attachments in Samebase.",
    destructive_justification: noDestructiveActions,
  },
  repository_cloudflare_attachWorkers: {
    read_only_justification:
      "Records selected existing Cloudflare Workers as repository attachments; Workers without a verified root for this repository are rejected.",
    open_world_justification:
      "Reads only the workspace's connected Cloudflare account, then records verified repository attachments in Samebase.",
    destructive_justification: noDestructiveActions,
  },
  repository_cloudflare_configureWorkersBuildsForGitHub: {
    read_only_justification:
      "Creates or updates the app's own Workers Builds production and Previews Base settings with the selected token UUID, then starts a production build.",
    open_world_justification:
      "Creates or patches build settings on the caller's own Cloudflare account for the caller's own repository, then starts a production build.",
    destructive_justification:
      "May overwrite the app's production, Previews Base, and existing preview build settings, including repository roots and commands, before starting a production build. Existing Workers must already use native previews. It does not delete user data, repositories, deployments, or Workers.",
  },
  repository_cloudflare_rotateConvexDeployKeysForWorkersBuilds: {
    read_only_justification:
      "Rotates the app's Convex deploy keys, writes them into its Workers Builds production, Previews Base, and existing preview variables, and starts a production build.",
    open_world_justification:
      "Creates deploy keys on the caller's Convex project, sets variables in the caller's Cloudflare build settings, and starts a production build.",
    destructive_justification:
      "Revokes recorded Convex deploy keys before creating replacements and updating build variables, so a failure can leave build access unavailable.",
  },
  repository_actions_retryInfrastructureProvisioning: {
    read_only_justification:
      "Starts a fresh provisioning run that reuses attached resources, creates missing ones, and configures Workers Builds and rotates deploy keys when Cloudflare is requested.",
    open_world_justification:
      "Creates missing Convex and Cloudflare resources and starts production builds that can publish the app.",
    destructive_justification:
      "Can overwrite the created Worker's production and preview build settings, finish native preview initialization, and rotate or revoke previously recorded Convex deploy keys while repairing the app.",
  },
  create_browser_handoff: {
    read_only_justification:
      "Creates a short-lived Samebase browser sign-in URL for the user behind the current MCP grant and records Samebase audit state.",
    open_world_justification:
      "Writes only Samebase-owned handoff state; it does not create, publish, or modify GitHub, Convex, Cloudflare, or other external resources.",
    destructive_justification:
      "Consumes the one-time handoff token on redemption or account mismatch; does not delete user data, repositories, deployments, Workers, or provider resources.",
  },
  samebase_feedback_submit: {
    read_only_justification:
      "Sends one user-approved feedback report to a fixed Samebase staff mailbox and updates an account-linked submission-attempt counter.",
    open_world_justification:
      "Uses Cloudflare Email Sending and the Samebase staff mailbox. It does not publish the report or modify user-owned provider resources.",
    destructive_justification:
      "Sends the exact report approved by the user to Samebase staff by email, which cannot be recalled after delivery.",
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
    tools_triggered: ["samebase_auth_getAuthenticationStatus"],
    expected_output:
      "Returns the authenticated reviewer account's email, role, and granted scope names. Does not expose access tokens or internal account IDs.",
    expected_output_url: null,
  },
  {
    description:
      "Inspect the existing Samebase apps already prepared in the reviewer demo account.",
    user_prompt: "List my Samebase apps and their setup status.",
    file_attachment_urls: null,
    tools_triggered: ["repository_dashboard_getUserRepositories"],
    expected_output:
      "Returns one summary per visible app. Each summary includes its repository and independent source and provider setup states. It can include the default branch and attached resource names or identifiers when available, but must not claim that inventory is live provider state.",
    expected_output_url: null,
  },
  {
    description:
      "Discover Cloudflare Workers for samebase-live-tests/tmp-my-cool-app2 by using its stored provider destination.",
    user_prompt:
      "Show me the Cloudflare Workers I can attach to samebase-live-tests/tmp-my-cool-app2.",
    file_attachment_urls: null,
    tools_triggered: [
      "repository_dashboard_getUserRepositories",
      "repository_cloudflare_discoverWorkers",
    ],
    expected_output:
      "Reads the app inventory, passes that repository's cloudflareAccountId to Worker discovery, and reports Workers from only that account. It does not select another account or create a Cloudflare resource.",
    expected_output_url: null,
  },
  {
    description:
      "Create one private app with the reviewer account's prepared samebase-live-tests GitHub, Convex, and Cloudflare connections.",
    user_prompt:
      "Create a private Samebase app under samebase-live-tests in US East (N. Virginia) with a unique name that starts with tmp-plugin-review-. Wait until it is ready.",
    file_attachment_urls: null,
    tools_triggered: [
      "repository_dashboard_getUserRepositories",
      "cloudflare_listWorkersBuildTokens",
      "repository_actions_createRepository",
    ],
    expected_output:
      "Reads inventory and passes aws-us-east-1 as the requested Convex production region without changing the saved organization default. It also reads the connected Cloudflare account's current Workers Builds token records. If that list is confirmed empty, it passes explicit null in the required cloudflareBuildTokenUuid field. The managed run then creates the GitHub repository and Convex project but no Cloudflare Worker. It polls only inventory until source and provider setup reach ready or failed. A ready provider setup in this case means only that the requested GitHub and Convex work finished. It reports Cloudflare setup as pending and links to https://samebase.com/docs/cloudflare-setup. Otherwise, it uses an available lastUsedBuildTokenUuid without asking, uses the only listed token, or asks the user to choose when several tokens are listed, then passes that exact UUID. It never treats the initial creation response as completion.",
    expected_output_url: null,
  },
  {
    description:
      "Create a browser handoff for the authenticated reviewer account without changing provider resources.",
    user_prompt: "Open my Samebase dashboard in the browser.",
    file_attachment_urls: null,
    tools_triggered: ["create_browser_handoff"],
    expected_output:
      "Returns a short-lived Samebase sign-in URL for the current MCP account. The response provides a clickable link on ChatGPT web and mobile. When a browser-opening action is available, it opens that URL; otherwise it does not claim the dashboard opened. The link signs in to the reviewer dashboard before expiry. No provider resource changes.",
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
    user_prompt: "Can I delete a Samebase app and all of its resources through Samebase MCP?",
    file_attachment_urls: null,
    tools_triggered: null,
    expected_output:
      "Explains that Samebase MCP has no deletion action and that deletion is available in the Samebase dashboard. It may offer to open the dashboard, but it does not call a tool until the user accepts and does not claim that any resource was removed.",
    expected_output_url: null,
  },
  {
    description: "Do not trigger Samebase for a standalone provider resource.",
    user_prompt: "Create a standalone Cloudflare Worker for me.",
    file_attachment_urls: null,
    tools_triggered: null,
    expected_output:
      "Uses a provider-native Cloudflare workflow without invoking Samebase because a standalone Worker is not a repository-backed Samebase app or provider attachment.",
    expected_output_url: null,
  },
] as const satisfies SubmissionNegativeTestCases;
