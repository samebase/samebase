/**
Hand-written half of the OpenAI plugin submission file. Tool names, descriptions, and annotations
come from the action catalog; everything here is the prose OpenAI requires that cannot be derived
from code. generate-action-docs.ts composes both halves into /chatgpt-app-submission.json and
fails closed when a catalog tool has no justification entry.
*/

import type { ActionContractMcpName } from "../convex/toolRuntime/actionCatalog";

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
      "Reports the authenticated Samebase account, current role, access keys, and MCP token scopes. Request authentication and usage bookkeeping can update private Samebase records.",
    open_world_justification:
      "Does not create, publish, or modify public internet state or third-party provider resources.",
    destructive_justification: noDestructiveActions,
  },
  vault_dashboard_getUserVaults: {
    read_only_justification:
      "Lists the authenticated user's Samebase apps with repository metadata, setup state, and stable identifiers for attached provider resources. Request authentication and usage bookkeeping can update private Samebase records.",
    open_world_justification:
      "Does not create, publish, or modify public internet state or third-party systems.",
    destructive_justification: noDestructiveActions,
  },
  vault_actions_createRepository: {
    read_only_justification:
      "Starts a managed app provisioning workflow that creates provider resources and records Samebase state.",
    open_world_justification:
      "Creates resources in external systems including GitHub, Convex, and Cloudflare, and can create a public GitHub repository when requested.",
    destructive_justification: noDestructiveActions,
  },
  vault_actions_connectRepository: {
    read_only_justification:
      "Creates the repository-backed Samebase vault and starts a tree sync; provider resources are not modified.",
    open_world_justification:
      "Reads repository metadata from GitHub; creates no external resources beyond Samebase's own record.",
    destructive_justification: noDestructiveActions,
  },
  vault_convex_discoverProjects: {
    read_only_justification:
      "Discovers exact convex.json files and readable Convex projects, and may refresh private Samebase connection bookkeeping while reading provider state.",
    open_world_justification:
      "Reads GitHub, Convex, and available Cloudflare Worker markers; it does not change provider or public internet state.",
    destructive_justification: noDestructiveActions,
  },
  vault_cloudflare_listAccounts: {
    read_only_justification:
      "Lists Cloudflare accounts and may refresh private Samebase connection bookkeeping while reading Cloudflare.",
    open_world_justification:
      "Reads the Cloudflare API; it does not change Cloudflare or public internet state.",
    destructive_justification: noDestructiveActions,
  },
  vault_cloudflare_createWorker: {
    read_only_justification:
      "Creates one Cloudflare Worker, records it as a vault attachment, configures its Workers Builds triggers, and requests an initial production build.",
    open_world_justification:
      "Creates and configures a Worker in the caller's Cloudflare account and starts a build for the caller's GitHub repository.",
    destructive_justification:
      "Rejects existing Worker names and existing Workers Builds connections. It does not overwrite or delete a Worker, trigger, repository, deployment, or user data.",
  },
  vault_cloudflare_discoverWorkers: {
    read_only_justification:
      "Lists Workers and their live repository roots, and may refresh private Samebase connection bookkeeping while reading Cloudflare.",
    open_world_justification:
      "Reads the Cloudflare API; it does not change Cloudflare or public internet state.",
    destructive_justification: noDestructiveActions,
  },
  vault_convex_attachProjects: {
    read_only_justification:
      "Records selected existing Convex projects and confirmed convex.json paths as vault attachments.",
    open_world_justification:
      "Re-reads the selected projects from Convex and exact config blobs from GitHub, then records Samebase state; provider resources are not modified.",
    destructive_justification: noDestructiveActions,
  },
  vault_cloudflare_attachWorkers: {
    read_only_justification:
      "Records selected existing Cloudflare Workers as vault attachments; Workers without a verified root for this repository are rejected.",
    open_world_justification:
      "Re-reads Worker identity and live repository roots from Cloudflare, then records Samebase state; provider resources are not modified.",
    destructive_justification: noDestructiveActions,
  },
  vault_cloudflare_configureWorkersBuildsForGitHub: {
    read_only_justification:
      "Creates or updates the app's own Workers Builds production and preview triggers, may create a Workers Builds API token under API-key auth, and starts a production build.",
    open_world_justification:
      "Creates or patches build triggers on the caller's own Cloudflare account for the caller's own repository, then starts a production build.",
    destructive_justification:
      "May overwrite the app's existing production and preview build trigger configuration, including repository roots and commands, before starting a production build. It does not delete user data, repositories, deployments, or Workers.",
  },
  vault_cloudflare_rotateConvexDeployKeysForWorkersBuilds: {
    read_only_justification:
      "Rotates the app's Convex deploy keys, writes them into its Workers Builds trigger variables, and starts a production build.",
    open_world_justification:
      "Creates deploy keys on the caller's Convex deployment, sets variables on the caller's Cloudflare build triggers, and starts a production build.",
    destructive_justification:
      "Rotates the app's own build deploy keys: previously recorded keys are deleted once replacements are installed, and its own new keys are cleaned up on failure. It then starts a production build. It does not delete user data, deployments, or Workers.",
  },
  vault_actions_retryInfrastructureProvisioning: {
    read_only_justification:
      "Restarts a failed managed provisioning run from its failed step, which can create the provider resources the failed run had not completed.",
    open_world_justification:
      "Resumes resource creation in GitHub, Convex, and Cloudflare on the caller's own accounts.",
    destructive_justification:
      "Can overwrite existing Workers Builds trigger configuration and rotate or revoke previously recorded Convex deploy keys while repairing the app.",
  },
  create_browser_handoff: {
    read_only_justification:
      "Creates a short-lived Samebase browser sign-in URL for the user behind the current MCP grant and records Samebase audit state.",
    open_world_justification:
      "Writes only Samebase-owned handoff state; it does not create, publish, or modify GitHub, Convex, Cloudflare, or other external resources.",
    destructive_justification:
      "Consumes the one-time handoff token on redemption or account mismatch; does not delete user data, repositories, deployments, Workers, or provider resources.",
  },
} as const satisfies Record<ActionContractMcpName, ToolJustifications>;

type SubmissionTestCase = {
  description: string;
  user_prompt: string;
  file_attachment_urls: null;
  tools_triggered: readonly [ActionContractMcpName, ...ActionContractMcpName[]];
  expected_output: string;
  expected_output_url: null;
};

type SubmissionNegativeTestCase = Omit<SubmissionTestCase, "tools_triggered"> & {
  tools_triggered: null;
};

type SubmissionTestCases = readonly [SubmissionTestCase, ...SubmissionTestCase[]];

type SubmissionNegativeTestCases = readonly [
  SubmissionNegativeTestCase,
  ...SubmissionNegativeTestCase[],
];

export const testCases = [
  {
    description:
      "Confirm the submitted reviewer credentials resolve to the prepared Samebase demo account.",
    user_prompt: "Am I connected to Samebase?",
    file_attachment_urls: null,
    tools_triggered: ["samebase_auth_getAuthenticationStatus"],
    expected_output:
      "Confirms that the reviewer account is connected. It can report the account email, role, and granted scope names, but must not expose tokens or internal account IDs.",
    expected_output_url: null,
  },
  {
    description:
      "Inspect the existing Samebase apps already prepared in the reviewer demo account.",
    user_prompt: "List my Samebase apps and their setup status.",
    file_attachment_urls: null,
    tools_triggered: ["vault_dashboard_getUserVaults"],
    expected_output:
      "Returns one summary per visible app. Each summary includes its repository and independent source and provider setup states. It can include the default branch and attached resource names or identifiers when available, but must not claim that inventory is live provider state.",
    expected_output_url: null,
  },
  {
    description:
      "Read the Cloudflare account fixture already connected to the prepared reviewer demo account.",
    user_prompt: "Which Cloudflare accounts are connected to my Samebase account?",
    file_attachment_urls: null,
    tools_triggered: ["vault_cloudflare_listAccounts"],
    expected_output:
      "Returns the Cloudflare accounts readable through the reviewer account as account-name and account-ID pairs. It creates no Cloudflare resource.",
    expected_output_url: null,
  },
  {
    description:
      "Create one private app with the reviewer account's prepared noter-guest GitHub, Convex, and Cloudflare connections.",
    user_prompt:
      "Create a private Samebase app under noter-guest with a unique name that starts with tmp-plugin-review-. Wait until it is ready.",
    file_attachment_urls: null,
    tools_triggered: ["vault_dashboard_getUserVaults", "vault_actions_createRepository"],
    expected_output:
      "Reads inventory, then creates one private repository-backed app without a provider-account preflight. It uses the selected name for the app and its new provider resources. It polls only inventory until source setup is ready or failed. After source setup is ready, it also polls only inventory until provider setup is ready or failed. It reports the repository and final states without treating the initial run IDs as completion.",
    expected_output_url: null,
  },
  {
    description:
      "Create a browser handoff for the authenticated reviewer account without changing provider resources.",
    user_prompt: "Open my Samebase dashboard in the browser.",
    file_attachment_urls: null,
    tools_triggered: ["create_browser_handoff"],
    expected_output:
      "Creates and presents one short-lived Samebase sign-in URL for the current MCP account. It does not create or modify GitHub, Convex, or Cloudflare resources.",
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
    user_prompt: "Delete one of my Samebase apps and all of its resources.",
    file_attachment_urls: null,
    tools_triggered: null,
    expected_output:
      "Does not call any write or provider-deletion action because the plugin exposes no deletion tool. It may explain that deletion must use the Samebase dashboard, but it must not claim that any resource was removed.",
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
