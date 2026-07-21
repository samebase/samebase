/**
Hand-written half of the ChatGPT app submission file. Tool names, descriptions, and annotations
come from the action catalog; everything here is the prose OpenAI requires that cannot be derived
from code. generate-action-docs.ts composes both halves into /chatgpt-app-submission.json and
fails closed when a catalog tool has no justification entry.
*/

export const appInfo = {
  display_name: "Samebase",
  subtitle: "Create and connect web apps",
  description:
    "Create web apps in the user's own GitHub, Convex, and Cloudflare accounts, or connect an existing GitHub repository and attach provider resources later. Inspect vault attachments and live provider state from one inventory.",
  category: "DEVELOPER_TOOLS",
} as const;

type ToolJustifications = {
  read_only_justification: string;
  open_world_justification: string;
  destructive_justification: string;
};

const noDestructiveActions =
  "Does not delete, overwrite, revoke access, or perform irreversible destructive actions.";

export const toolJustifications: Record<string, ToolJustifications | undefined> = {
  samebase_auth_getAuthenticationStatus: {
    read_only_justification:
      "Reports the authenticated Samebase account, current role, access keys, and MCP token scopes for the caller's own bearer token.",
    open_world_justification:
      "Reads Samebase authentication state for the caller's own token; writes nothing and does not contact third-party provider APIs.",
    destructive_justification: noDestructiveActions,
  },
  vault_dashboard_getUserVaults: {
    read_only_justification:
      "Lists the authenticated user's Samebase apps with repository metadata, provisioning state, and the user's own provider coordinates (Convex deployment names and URLs, Cloudflare worker names and dashboard links).",
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
      "Discovers exact convex.json files in the vault repository and Convex projects readable through the caller's connected team.",
    open_world_justification:
      "Reads from GitHub, Convex, and available Cloudflare Worker markers; writes nothing anywhere.",
    destructive_justification: noDestructiveActions,
  },
  vault_cloudflare_listAccounts: {
    read_only_justification:
      "Only lists Cloudflare accounts readable with the caller's connected Cloudflare login.",
    open_world_justification: "Reads from the Cloudflare API; writes nothing anywhere.",
    destructive_justification: noDestructiveActions,
  },
  vault_cloudflare_discoverWorkers: {
    read_only_justification:
      "Lists Workers on the chosen Cloudflare account and observes their live repository roots against the vault repository.",
    open_world_justification: "Reads from the Cloudflare API; writes nothing anywhere.",
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
      "Creates or updates the app's own Workers Builds production and preview triggers connecting its Worker to its repository, and may create a Workers Builds API token under API-key auth.",
    open_world_justification:
      "Creates or patches build triggers on the caller's own Cloudflare account for the caller's own repository.",
    destructive_justification:
      "May update the app's own existing build trigger configuration; does not delete user data, repositories, deployments, or Workers.",
  },
  vault_cloudflare_rotateConvexDeployKeysForWorkersBuilds: {
    read_only_justification:
      "Rotates the app's Convex deploy keys and writes them into its Workers Builds trigger variables.",
    open_world_justification:
      "Creates deploy keys on the caller's Convex deployment and sets variables on the caller's Cloudflare build triggers.",
    destructive_justification:
      "Rotates the app's own build deploy keys: previously recorded keys are deleted once replacements are installed, and its own new keys are cleaned up on failure. Does not delete user data, deployments, or Workers.",
  },
  vault_actions_retryInfrastructureProvisioning: {
    read_only_justification:
      "Restarts a failed managed provisioning run from its failed step, which can create the provider resources the failed run had not completed.",
    open_world_justification:
      "Resumes resource creation in GitHub, Convex, and Cloudflare on the caller's own accounts.",
    destructive_justification: noDestructiveActions,
  },
  create_browser_handoff: {
    read_only_justification:
      "Creates a short-lived Samebase browser sign-in URL for the user behind the current MCP grant and records Samebase audit state.",
    open_world_justification:
      "Writes only Samebase-owned handoff state; it does not create, publish, or modify GitHub, Convex, Cloudflare, or other external resources.",
    destructive_justification:
      "Consumes the one-time handoff token on redemption or account mismatch; does not delete user data, repositories, deployments, Workers, or provider resources.",
  },
};

export const testCases = [
  {
    description: "List the authenticated user's Samebase apps.",
    user_prompt: "List my Samebase apps.",
    file_attachment_urls: null,
    tools_triggered: "vault_dashboard_getUserVaults",
    expected_output:
      "Returns the user's Samebase apps with repository names, provisioning state, provider resources, and branch summaries.",
    expected_output_url: null,
  },
  {
    description: "Inspect provisioning status for existing Samebase apps.",
    user_prompt: "Show me the provisioning state and provider resources for my Samebase apps.",
    file_attachment_urls: null,
    tools_triggered: "vault_dashboard_getUserVaults",
    expected_output:
      "Summarizes each app's source setup, Convex and Cloudflare provisioning state, and relevant provider URLs when available.",
    expected_output_url: null,
  },
  {
    description: "Create a new private Samebase app with explicit provider resource names.",
    user_prompt:
      "Create a private Samebase app named tmp-chatgpt-mcp-test under GitHub owner samebase, with Convex project tmp-chatgpt-mcp-test and Cloudflare Worker tmp-chatgpt-mcp-test.",
    file_attachment_urls: null,
    tools_triggered: "vault_actions_createRepository",
    expected_output:
      "Starts app provisioning and returns the Samebase vault ID and provisioning run ID.",
    expected_output_url: null,
  },
  {
    description:
      "Create a public Samebase app when public repository visibility is explicitly requested.",
    user_prompt:
      "Create a public Samebase app named tmp-public-chatgpt-test for GitHub owner samebase, Convex project tmp-public-chatgpt-test, and Cloudflare Worker tmp-public-chatgpt-test. Use the description 'ChatGPT MCP submission test app'.",
    file_attachment_urls: null,
    tools_triggered: "vault_actions_createRepository",
    expected_output:
      "Starts app provisioning with public GitHub repository visibility and returns the Samebase vault ID and provisioning run ID.",
    expected_output_url: null,
  },
  {
    description: "Connect an existing GitHub repository without changing its providers.",
    user_prompt:
      "Connect the existing GitHub repository samebase/tmp-chatgpt-existing to Samebase. Keep it GitHub-only for now and do not attach Convex or Cloudflare.",
    file_attachment_urls: null,
    tools_triggered: "vault_actions_connectRepository",
    expected_output:
      "Creates the repository-backed Samebase vault and starts repository tree sync while leaving Convex and Cloudflare unconfigured.",
    expected_output_url: null,
  },
  {
    description:
      "Use the read tool before creating a new app when the user asks to inspect existing apps first.",
    user_prompt:
      "Check my current Samebase apps, then create a private app named tmp-after-list-chatgpt under GitHub owner samebase with matching Convex project and Cloudflare Worker names.",
    file_attachment_urls: null,
    tools_triggered: "vault_dashboard_getUserVaults, vault_actions_createRepository",
    expected_output:
      "Lists the current Samebase apps, then starts provisioning for the requested new app and reports the created vault and run identifiers.",
    expected_output_url: null,
  },
  {
    description: "Configure Workers Builds for GitHub when that configuration is missing.",
    user_prompt:
      "One of my Samebase apps says its Cloudflare Worker is not connected to GitHub. Fix it.",
    file_attachment_urls: null,
    tools_triggered:
      "vault_dashboard_getUserVaults, vault_cloudflare_configureWorkersBuildsForGitHub",
    expected_output:
      "Reads the app state, finds the Worker whose live repository configuration is missing, and configures its production and preview Workers Builds triggers for GitHub using the vault and Worker ids.",
    expected_output_url: null,
  },
  {
    description: "Create a browser handoff link for the current Samebase account.",
    user_prompt: "Open Samebase in the browser so I can see this account's dashboard.",
    file_attachment_urls: null,
    tools_triggered: "create_browser_handoff",
    expected_output:
      "Returns a short-lived Samebase browser URL that signs in the current MCP grant's user and opens the dashboard.",
    expected_output_url: null,
  },
] as const;

export const negativeTestCases = [
  {
    description: "Do not trigger Samebase for direct GitHub pull request work.",
    user_prompt: "Open a pull request in my existing GitHub repository with these code changes.",
    file_attachment_urls: null,
    tools_triggered: null,
    expected_output:
      "The app should not be invoked because Samebase does not expose GitHub pull request tools through this MCP server.",
    expected_output_url: null,
  },
  {
    description: "Do not trigger Samebase for deletion requests.",
    user_prompt: "Delete my Samebase app and remove all of its provider resources.",
    file_attachment_urls: null,
    tools_triggered: null,
    expected_output:
      "The app should not be invoked because this MCP server does not expose deletion or destructive resource-removal tools.",
    expected_output_url: null,
  },
  {
    description:
      "Do not trigger Samebase for direct provider administration outside managed app creation.",
    user_prompt: "Create a standalone Cloudflare Worker for me without creating a Samebase app.",
    file_attachment_urls: null,
    tools_triggered: null,
    expected_output:
      "The app should not be invoked because direct Cloudflare administration is outside this MCP server's supported Samebase workflows.",
    expected_output_url: null,
  },
] as const;
