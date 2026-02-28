import type {
  NetlifyManagementProvider,
  RailwayManagementProvider,
} from "./infraProviders";
import type { HostingState } from "./hostingState";
import {
  asRecord,
  clamp,
  readString,
  readStringOrNumber,
  toErrorMessage,
  type JsonRecord,
} from "./jsonUtils";
import { sanitizeSlug, vaultSuffix } from "./slugUtils";

const NETLIFY_ENV_CONTEXTS = [
  "production",
  "deploy-preview",
  "branch-deploy",
  "dev",
] as const;

type AddGitHubDeployKeyArgs = {
  githubAccessToken: string;
  owner: string;
  repo: string;
  title: string;
  publicKey: string;
};

type EnsureGitHubPushWebhookArgs = {
  githubAccessToken: string;
  owner: string;
  repo: string;
  webhookUrl: string;
};

async function createNetlifyDeployKey(args: {
  netlifyProvider: NetlifyManagementProvider;
}): Promise<{ deployKeyId: string; publicKey: string }> {
  const deployKeyRaw = await args.netlifyProvider.request(
    "/deploy_keys",
    "POST",
  );
  const deployKey = asRecord(deployKeyRaw);
  const deployKeyId = readStringOrNumber(deployKey, "id");
  const publicKey = readString(deployKey, "public_key");

  if (!deployKeyId || !publicKey) {
    throw new Error("Failed to create Netlify deploy key");
  }

  return {
    deployKeyId,
    publicKey,
  };
}

async function setNetlifyEnvironmentVariables(args: {
  netlifyProvider: NetlifyManagementProvider;
  accountId: string;
  siteId: string;
  vars: Record<string, string>;
}): Promise<void> {
  const varKeys = Object.keys(args.vars);
  console.log("infra:netlify:env:set:start", {
    siteId: args.siteId,
    accountId: args.accountId,
    keys: varKeys,
    contexts: NETLIFY_ENV_CONTEXTS,
  });

  const envVarsPayload = Object.entries(args.vars).map(([key, value]) => ({
    key,
    scopes: ["builds", "functions", "runtime"],
    values: NETLIFY_ENV_CONTEXTS.map((context) => ({
      context,
      value,
    })),
    is_secret: /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(key),
  }));

  try {
    await args.netlifyProvider.request(
      `/accounts/${encodeURIComponent(args.accountId)}/env?site_id=${encodeURIComponent(args.siteId)}`,
      "POST",
      envVarsPayload,
    );
    console.log("infra:netlify:env:set:success", {
      siteId: args.siteId,
      accountId: args.accountId,
      keys: varKeys,
    });
  } catch (error) {
    console.error("infra:netlify:env:set:failed", {
      siteId: args.siteId,
      accountId: args.accountId,
      keys: varKeys,
      message: toErrorMessage(error),
    });
    throw error;
  }
}

export type { HostingProvider } from "./hostingState";

type NetlifyProvisionExistingState = {
  siteId?: string;
  siteName?: string;
  defaultUrl?: string;
  productionUrl?: string;
  buildHookId?: string;
};

type NetlifyProvisionConvexState = {
  cloudUrl: string;
  siteUrl: string;
  deployKey: string;
};

type RailwayProvisionExistingState = {
  projectId?: string;
  environmentId?: string;
  serviceId?: string;
  domain?: string;
};

type RailwayProvisionConvexState = {
  cloudUrl: string;
  siteUrl: string;
  deployKey: string;
};

export type ProvisionedByProvider = HostingState;

type EnsureNetlifyResourcesArgs = {
  provider: "netlify";
  netlifyProvider: NetlifyManagementProvider;
  teamSlug: string;
  owner: string;
  repo: string;
  ghRepoId: string;
  githubAccessToken: string;
  defaultBranch: string;
  vaultId: string;
  existing: NetlifyProvisionExistingState;
  convex: NetlifyProvisionConvexState;
  addGitHubDeployKey(args: AddGitHubDeployKeyArgs): Promise<void>;
  ensureGitHubPushWebhook(args: EnsureGitHubPushWebhookArgs): Promise<void>;
};

type EnsureRailwayResourcesArgs = {
  provider: "railway";
  railwayProvider: RailwayManagementProvider;
  owner: string;
  repo: string;
  defaultBranch: string;
  vaultId: string;
  existing: RailwayProvisionExistingState;
  convex: RailwayProvisionConvexState;
};

type EnsureHostingResourcesArgs =
  | EnsureNetlifyResourcesArgs
  | EnsureRailwayResourcesArgs;

async function ensureNetlifyResources(
  args: EnsureNetlifyResourcesArgs,
): Promise<Extract<ProvisionedByProvider, { provider: "netlify" }>> {
  const suffix = vaultSuffix(args.vaultId);
  const siteName =
    args.existing.siteName ??
    sanitizeSlug(`${args.owner}-${args.repo}-${suffix}`, 48);
  const repoIdNumber = Number.parseInt(args.ghRepoId, 10);
  const repoId =
    Number.isFinite(repoIdNumber) && repoIdNumber > 0
      ? repoIdNumber
      : args.ghRepoId;

  console.log("infra:netlify:provision:start", {
    vaultId: args.vaultId,
    teamSlug: args.teamSlug,
    repo: `${args.owner}/${args.repo}`,
    siteName,
    existingSiteId: args.existing.siteId,
    existingBuildHookId: args.existing.buildHookId,
  });

  let step = "resolve_site";
  let siteResponse: JsonRecord | null = null;

  try {
    let netlifyDeployKeyId: string | undefined;
    let repoLinkagePatched = false;

    if (args.existing.siteId) {
      step = "read_existing_site";
      try {
        const existingSiteRaw = await args.netlifyProvider.request(
          `/sites/${encodeURIComponent(args.existing.siteId)}`,
          "GET",
        );
        siteResponse = asRecord(existingSiteRaw);
      } catch (error) {
        step = "read_existing_site_failed";
        siteResponse = null;
        console.warn("infra:netlify:site:read_existing_failed", {
          vaultId: args.vaultId,
          siteId: args.existing.siteId,
          message: toErrorMessage(error),
        });
      }
    }

    if (!siteResponse) {
      step = "find_site_by_name";
      const sitesRaw = await args.netlifyProvider.request(
        `/${encodeURIComponent(args.teamSlug)}/sites?name=${encodeURIComponent(siteName)}`,
        "GET",
      );
      const sites = Array.isArray(sitesRaw) ? sitesRaw : [];
      console.log("infra:netlify:site:search", {
        vaultId: args.vaultId,
        siteName,
        count: sites.length,
      });

      for (const site of sites) {
        const siteRecord = asRecord(site);
        if (readString(siteRecord, "name") === siteName) {
          siteResponse = siteRecord;
          break;
        }
      }
    }

    if (!siteResponse) {
      step = "create_site";
      const createSiteRaw = await args.netlifyProvider.request(
        `/${encodeURIComponent(args.teamSlug)}/sites?configure_dns=false`,
        "POST",
        {
          name: siteName,
        },
      );
      siteResponse = asRecord(createSiteRaw);
    }

    const siteId = readString(siteResponse, "id");
    if (!siteId) {
      throw new Error("Failed to resolve Netlify site ID");
    }

    const accountId = readString(siteResponse, "account_id");
    if (!accountId) {
      throw new Error(
        "Failed to resolve Netlify account ID for environment setup",
      );
    }

    const siteRepo = asRecord(siteResponse["repo"]);
    netlifyDeployKeyId = readStringOrNumber(siteRepo, "deploy_key_id");
    const currentRepoPath =
      readString(siteRepo, "repo_path") ?? readString(siteRepo, "repo");
    const currentRepoBranch =
      readString(siteRepo, "repo_branch") ?? readString(siteRepo, "branch");
    const needsRepoPatch =
      currentRepoPath !== `${args.owner}/${args.repo}` ||
      currentRepoBranch !== args.defaultBranch ||
      typeof netlifyDeployKeyId !== "string" ||
      netlifyDeployKeyId.length === 0;

    console.log("infra:netlify:site:resolved", {
      vaultId: args.vaultId,
      siteId,
      accountId,
      siteName,
      deployKeyConfigured: typeof netlifyDeployKeyId === "string",
    });

    step = "set_env";
    await setNetlifyEnvironmentVariables({
      netlifyProvider: args.netlifyProvider,
      accountId,
      siteId,
      vars: {
        VITE_CONVEX_URL: args.convex.cloudUrl,
        VITE_CONVEX_SITE_URL: args.convex.siteUrl,
        CONVEX_DEPLOY_KEY: args.convex.deployKey,
      },
    });

    if (!netlifyDeployKeyId) {
      step = "ensure_deploy_key";
      const netlifyDeployKey = await createNetlifyDeployKey({
        netlifyProvider: args.netlifyProvider,
      });
      netlifyDeployKeyId = netlifyDeployKey.deployKeyId;

      await args.addGitHubDeployKey({
        githubAccessToken: args.githubAccessToken,
        owner: args.owner,
        repo: args.repo,
        title: `netlify-${siteName}`,
        publicKey: netlifyDeployKey.publicKey,
      });
    }

    if (needsRepoPatch) {
      step = "patch_site_repo";
      await args.netlifyProvider.request(
        `/sites/${encodeURIComponent(siteId)}`,
        "PATCH",
        {
          repo: {
            provider: "github",
            repo: `${args.owner}/${args.repo}`,
            repo_id: repoId,
            branch: args.defaultBranch,
            private: true,
            public_repo: false,
            deploy_key_id: netlifyDeployKeyId,
            repo_path: `${args.owner}/${args.repo}`,
            repo_branch: args.defaultBranch,
          },
        },
      );
      repoLinkagePatched = true;
    }

    step = "list_build_hooks";
    const hooksRaw = await args.netlifyProvider.request(
      `/sites/${encodeURIComponent(siteId)}/build_hooks`,
      "GET",
    );
    const hooks = Array.isArray(hooksRaw) ? hooksRaw : [];
    console.log("infra:netlify:hooks:list", {
      vaultId: args.vaultId,
      siteId,
      count: hooks.length,
      defaultBranch: args.defaultBranch,
    });

    let buildHookId: string | undefined;
    let buildHookUrl: string | undefined;
    for (const hook of hooks) {
      const hookRecord = asRecord(hook);
      if (readString(hookRecord, "branch") === args.defaultBranch) {
        const hookId = readStringOrNumber(hookRecord, "id");
        if (!hookId) {
          continue;
        }
        buildHookId = hookId;
        buildHookUrl =
          readString(hookRecord, "url") ??
          `https://api.netlify.com/build_hooks/${encodeURIComponent(hookId)}`;
        break;
      }
    }

    if (!buildHookId) {
      step = "create_build_hook";
      const hookRaw = await args.netlifyProvider.request(
        `/sites/${encodeURIComponent(siteId)}/build_hooks`,
        "POST",
        {
          title: `noter-${args.defaultBranch}`,
          branch: args.defaultBranch,
        },
      );
      const hookRecord = asRecord(hookRaw);
      const hookId = readStringOrNumber(hookRecord, "id");
      if (!hookId) {
        throw new Error("Failed to create Netlify build hook");
      }
      buildHookId = hookId;
      buildHookUrl =
        readString(hookRecord, "url") ??
        `https://api.netlify.com/build_hooks/${encodeURIComponent(hookId)}`;
      console.log("infra:netlify:hooks:created", {
        vaultId: args.vaultId,
        siteId,
        buildHookId,
        buildHookUrl,
        branch: args.defaultBranch,
      });
    }

    if (!buildHookId || !buildHookUrl) {
      throw new Error("Failed to resolve Netlify build hook URL");
    }

    step = "ensure_push_webhook";
    await args.ensureGitHubPushWebhook({
      githubAccessToken: args.githubAccessToken,
      owner: args.owner,
      repo: args.repo,
      webhookUrl: buildHookUrl,
    });

    step = "trigger_build";
    if (repoLinkagePatched) {
      console.log("infra:netlify:build:skipped_manual_trigger", {
        vaultId: args.vaultId,
        siteId,
        branch: args.defaultBranch,
        reason: "repo_linkage_recently_patched",
      });
    } else {
      try {
        await args.netlifyProvider.request(
          `/sites/${encodeURIComponent(siteId)}/builds?branch=${encodeURIComponent(args.defaultBranch)}`,
          "POST",
          {},
        );
        console.log("infra:netlify:build:triggered", {
          vaultId: args.vaultId,
          siteId,
          branch: args.defaultBranch,
        });
      } catch (error) {
        console.warn("infra:netlify:build:trigger_failed", {
          vaultId: args.vaultId,
          siteId,
          branch: args.defaultBranch,
          message: toErrorMessage(error),
        });
      }
    }

    step = "refresh_site";
    const refreshedSiteRaw = await args.netlifyProvider.request(
      `/sites/${encodeURIComponent(siteId)}`,
      "GET",
    );
    const refreshedSite = asRecord(refreshedSiteRaw);

    const result: Extract<ProvisionedByProvider, { provider: "netlify" }> = {
      provider: "netlify",
      siteId,
      siteName: readString(refreshedSite, "name") ?? siteName,
      teamId: accountId,
      defaultUrl:
        readString(refreshedSite, "deploy_url") ??
        readString(refreshedSite, "url"),
      productionUrl:
        readString(refreshedSite, "ssl_url") ??
        readString(refreshedSite, "url"),
      buildHookId,
    };

    console.log("infra:netlify:provision:success", {
      vaultId: args.vaultId,
      siteId: result.siteId,
      siteName: result.siteName,
      defaultUrl: result.defaultUrl,
      productionUrl: result.productionUrl,
      buildHookId: result.buildHookId,
    });

    return result;
  } catch (error) {
    console.error("infra:netlify:provision:failed", {
      vaultId: args.vaultId,
      teamSlug: args.teamSlug,
      repo: `${args.owner}/${args.repo}`,
      siteName,
      step,
      message: toErrorMessage(error),
    });
    throw error;
  }
}

type RailwayEnvironmentSummary = {
  id: string;
  name?: string;
};

type RailwayServiceSummary = {
  id: string;
  name?: string;
};

type RailwayProjectSummary = {
  id: string;
  name?: string;
  workspaceId?: string;
  environments: RailwayEnvironmentSummary[];
  services: RailwayServiceSummary[];
};

type RailwayDeploymentSummary = {
  id: string;
  status?: string;
  createdAt?: string;
  url?: string;
  staticUrl?: string;
};

function readRailwayConnectionNodes(value: unknown): JsonRecord[] {
  const connection = asRecord(value);
  const edges = Array.isArray(connection["edges"]) ? connection["edges"] : [];
  const nodes: JsonRecord[] = [];
  for (const edge of edges) {
    const node = asRecord(asRecord(edge)["node"]);
    const id = readString(node, "id");
    if (id) {
      nodes.push(node);
    }
  }
  return nodes;
}

function parseRailwayProjectSummary(
  value: unknown,
  workspaceId?: string,
): RailwayProjectSummary | null {
  const project = asRecord(value);
  const id = readString(project, "id");
  if (!id) {
    return null;
  }

  const environments = readRailwayConnectionNodes(project["environments"]).map(
    (entry) => ({
      id: readString(entry, "id") ?? "",
      name: readString(entry, "name") ?? undefined,
    }),
  );
  const services = readRailwayConnectionNodes(project["services"]).map(
    (entry) => ({
      id: readString(entry, "id") ?? "",
      name: readString(entry, "name") ?? undefined,
    }),
  );

  return {
    id,
    name: readString(project, "name") ?? undefined,
    workspaceId,
    environments: environments.filter((entry) => entry.id.length > 0),
    services: services.filter((entry) => entry.id.length > 0),
  };
}

function readRailwayDeploymentSummaries(
  value: unknown,
): RailwayDeploymentSummary[] {
  return readRailwayConnectionNodes(value).map((entry) => ({
    id: readString(entry, "id") ?? "",
    status: readString(entry, "status") ?? undefined,
    createdAt: readString(entry, "createdAt") ?? undefined,
    url: readString(entry, "url") ?? undefined,
    staticUrl: readString(entry, "staticUrl") ?? undefined,
  }));
}

function selectRailwayEnvironmentId(
  environments: RailwayEnvironmentSummary[],
): string | undefined {
  for (const environment of environments) {
    if (environment.name?.toLowerCase() === "production") {
      return environment.id;
    }
  }
  return undefined;
}

function selectRailwayServiceId(
  services: RailwayServiceSummary[],
  preferredServiceName: string,
): string | undefined {
  for (const service of services) {
    if (service.name === preferredServiceName) {
      return service.id;
    }
  }
  if (services.length === 1) {
    return services[0].id;
  }
  return undefined;
}

function readRailwayServiceDomains(value: unknown): Array<{
  id: string;
  domain: string;
}> {
  const domainsRecord = asRecord(value);
  const serviceDomainsRaw = Array.isArray(domainsRecord["serviceDomains"])
    ? domainsRecord["serviceDomains"]
    : [];
  const domains: Array<{ id: string; domain: string }> = [];
  for (const domainEntry of serviceDomainsRaw) {
    const domainRecord = asRecord(domainEntry);
    const id = readString(domainRecord, "id");
    const domain = readString(domainRecord, "domain");
    if (id && domain) {
      domains.push({ id, domain });
    }
  }
  return domains;
}

function readRailwayLogLines(value: unknown): string[] {
  const entries = Array.isArray(value) ? value : [];
  const lines: string[] = [];
  for (const entry of entries) {
    const record = asRecord(entry);
    const timestamp = readString(record, "timestamp") ?? "unknown";
    const severity = readString(record, "severity") ?? "unknown";
    const message = readString(record, "message") ?? "";
    lines.push(`[${timestamp}] ${severity}: ${message}`.trim());
  }
  return lines;
}

async function getRailwayProjectById(args: {
  railwayProvider: RailwayManagementProvider;
  projectId: string;
}): Promise<RailwayProjectSummary | null> {
  const data = await args.railwayProvider.request(
    `
      query RailwayProject($projectId: String!) {
        project(id: $projectId) {
          id
          name
          environments {
            edges {
              node {
                id
                name
              }
            }
          }
          services {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      }
    `,
    {
      projectId: args.projectId,
    },
  );

  return parseRailwayProjectSummary(asRecord(data)["project"]);
}

async function listRailwayProjects(args: {
  railwayProvider: RailwayManagementProvider;
}): Promise<{
  projects: RailwayProjectSummary[];
  workspaceIds: string[];
  defaultWorkspaceId?: string;
}> {
  const data = await args.railwayProvider.request(`
    query RailwayProjectsViaWorkspaces {
      me {
        workspaces {
          id
          projects {
            edges {
              node {
                id
                name
                environments {
                  edges {
                    node {
                      id
                      name
                    }
                  }
                }
                services {
                  edges {
                    node {
                      id
                      name
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `);
  const me = asRecord(asRecord(data)["me"]);
  const workspacesRaw = Array.isArray(me["workspaces"]) ? me["workspaces"] : [];
  const projects: RailwayProjectSummary[] = [];
  const workspaceIds: string[] = [];
  for (const workspaceRaw of workspacesRaw) {
    const workspace = asRecord(workspaceRaw);
    const workspaceId = readString(workspace, "id");
    if (!workspaceId) {
      continue;
    }
    workspaceIds.push(workspaceId);
    const nodes = readRailwayConnectionNodes(workspace["projects"]);
    for (const node of nodes) {
      const parsed = parseRailwayProjectSummary(node, workspaceId);
      if (parsed) {
        projects.push(parsed);
      }
    }
  }
  const defaultWorkspaceId =
    workspaceIds.length === 1 ? workspaceIds[0] : undefined;
  return {
    projects,
    workspaceIds,
    defaultWorkspaceId,
  };
}

async function createRailwayProject(args: {
  railwayProvider: RailwayManagementProvider;
  name: string;
  workspaceId: string;
}): Promise<string> {
  const data = await args.railwayProvider.request(
    `
      mutation RailwayProjectCreate($input: ProjectCreateInput!) {
        projectCreate(input: $input) {
          id
        }
      }
    `,
    {
      input: {
        name: args.name,
        workspaceId: args.workspaceId,
      },
    },
  );
  const created = asRecord(asRecord(data)["projectCreate"]);
  const projectId = readString(created, "id");
  if (!projectId) {
    throw new Error("Failed to create Railway project.");
  }
  return projectId;
}

async function createRailwayEnvironment(args: {
  railwayProvider: RailwayManagementProvider;
  projectId: string;
  name: string;
}): Promise<string> {
  const data = await args.railwayProvider.request(
    `
      mutation RailwayEnvironmentCreate($input: EnvironmentCreateInput!) {
        environmentCreate(input: $input) {
          id
        }
      }
    `,
    {
      input: {
        projectId: args.projectId,
        name: args.name,
      },
    },
  );
  const created = asRecord(asRecord(data)["environmentCreate"]);
  const environmentId = readString(created, "id");
  if (!environmentId) {
    throw new Error("Failed to create Railway environment.");
  }
  return environmentId;
}

async function createRailwayServiceFromGithub(args: {
  railwayProvider: RailwayManagementProvider;
  projectId: string;
  serviceName: string;
  repoPath: string;
  branch: string;
}): Promise<string> {
  const data = await args.railwayProvider.request(
    `
      mutation RailwayServiceCreate($input: ServiceCreateInput!) {
        serviceCreate(input: $input) {
          id
        }
      }
    `,
    {
      input: {
        projectId: args.projectId,
        name: args.serviceName,
        branch: args.branch,
        source: {
          repo: args.repoPath,
        },
      },
    },
  );
  const created = asRecord(asRecord(data)["serviceCreate"]);
  const serviceId = readString(created, "id");
  if (!serviceId) {
    throw new Error("Failed to create Railway service.");
  }
  return serviceId;
}

async function upsertRailwayServiceVariables(args: {
  railwayProvider: RailwayManagementProvider;
  projectId: string;
  environmentId: string;
  serviceId: string;
  variables: Record<string, string>;
}): Promise<void> {
  await args.railwayProvider.request(
    `
      mutation RailwayVariableCollectionUpsert($input: VariableCollectionUpsertInput!) {
        variableCollectionUpsert(input: $input)
      }
    `,
    {
      input: {
        projectId: args.projectId,
        environmentId: args.environmentId,
        serviceId: args.serviceId,
        variables: args.variables,
      },
    },
  );
}

async function listRailwayServiceDomains(args: {
  railwayProvider: RailwayManagementProvider;
  projectId: string;
  environmentId: string;
  serviceId: string;
}): Promise<Array<{ id: string; domain: string }>> {
  const data = await args.railwayProvider.request(
    `
      query RailwayDomains($projectId: String!, $environmentId: String!, $serviceId: String!) {
        domains(
          projectId: $projectId
          environmentId: $environmentId
          serviceId: $serviceId
        ) {
          serviceDomains {
            id
            domain
          }
        }
      }
    `,
    {
      projectId: args.projectId,
      environmentId: args.environmentId,
      serviceId: args.serviceId,
    },
  );
  return readRailwayServiceDomains(asRecord(data)["domains"]);
}

async function createRailwayServiceDomain(args: {
  railwayProvider: RailwayManagementProvider;
  environmentId: string;
  serviceId: string;
}): Promise<string> {
  const data = await args.railwayProvider.request(
    `
      mutation RailwayServiceDomainCreate($input: ServiceDomainCreateInput!) {
        serviceDomainCreate(input: $input) {
          id
          domain
        }
      }
    `,
    {
      input: {
        serviceId: args.serviceId,
        environmentId: args.environmentId,
      },
    },
  );
  const created = asRecord(asRecord(data)["serviceDomainCreate"]);
  const domain = readString(created, "domain");
  if (!domain) {
    throw new Error("Failed to create Railway service domain.");
  }
  return domain;
}

async function triggerRailwayDeployment(args: {
  railwayProvider: RailwayManagementProvider;
  serviceId: string;
  environmentId: string;
}): Promise<void> {
  await args.railwayProvider.request(
    `
      mutation RailwayServiceDeploy($serviceId: String!, $environmentId: String!) {
        serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId)
      }
    `,
    {
      serviceId: args.serviceId,
      environmentId: args.environmentId,
    },
  );
}

async function queryRailwayLatestDeployments(args: {
  railwayProvider: RailwayManagementProvider;
  projectId: string;
  environmentId: string;
  serviceId: string;
  first: number;
}): Promise<RailwayDeploymentSummary[]> {
  const data = await args.railwayProvider.request(
    `
      query RailwayDeployments($input: DeploymentListInput!, $first: Int) {
        deployments(input: $input, first: $first) {
          edges {
            node {
              id
              status
              createdAt
              url
              staticUrl
            }
          }
        }
      }
    `,
    {
      input: {
        projectId: args.projectId,
        environmentId: args.environmentId,
        serviceId: args.serviceId,
      },
      first: args.first,
    },
  );
  return readRailwayDeploymentSummaries(asRecord(data)["deployments"]).filter(
    (entry) => entry.id.length > 0,
  );
}

async function ensureRailwayResources(
  args: EnsureRailwayResourcesArgs,
): Promise<Extract<ProvisionedByProvider, { provider: "railway" }>> {
  const suffix = vaultSuffix(args.vaultId);
  const projectName = sanitizeSlug(`${args.owner}-${args.repo}-${suffix}`, 48);
  const serviceName = sanitizeSlug(`${args.repo}-web`, 40);

  console.log("infra:railway:provision:start", {
    vaultId: args.vaultId,
    repo: `${args.owner}/${args.repo}`,
    projectName,
    existingProjectId: args.existing.projectId,
    existingEnvironmentId: args.existing.environmentId,
    existingServiceId: args.existing.serviceId,
  });

  let step = "resolve_project";
  try {
    let defaultWorkspaceId: string | undefined;
    let availableWorkspaceIds: string[] = [];
    let project = args.existing.projectId
      ? await getRailwayProjectById({
          railwayProvider: args.railwayProvider,
          projectId: args.existing.projectId,
        })
      : null;

    if (!project) {
      const projectCatalog = await listRailwayProjects({
        railwayProvider: args.railwayProvider,
      });
      defaultWorkspaceId = projectCatalog.defaultWorkspaceId;
      availableWorkspaceIds = projectCatalog.workspaceIds;
      project =
        projectCatalog.projects.find((entry) => entry.name === projectName) ??
        null;

      if (!project && availableWorkspaceIds.length === 0) {
        throw new Error(
          "No Railway workspace is accessible for this account. Verify Railway OAuth access and workspace membership.",
        );
      }
    }

    if (!project) {
      step = "create_project";
      if (!defaultWorkspaceId) {
        if (availableWorkspaceIds.length > 1) {
          throw new Error(
            "Multiple Railway workspaces are accessible. Workspace selection is required before creating a Railway project.",
          );
        }
        throw new Error(
          "No Railway workspace is accessible for project creation.",
        );
      }
      const projectId = await createRailwayProject({
        railwayProvider: args.railwayProvider,
        name: projectName,
        workspaceId: defaultWorkspaceId,
      });
      project = await getRailwayProjectById({
        railwayProvider: args.railwayProvider,
        projectId,
      });
    }

    if (!project) {
      throw new Error("Failed to resolve Railway project.");
    }

    step = "resolve_environment";
    let environmentId = args.existing.environmentId;
    if (
      !environmentId ||
      !project.environments.some((entry) => entry.id === environmentId)
    ) {
      environmentId = selectRailwayEnvironmentId(project.environments);
    }
    if (!environmentId) {
      step = "create_environment";
      environmentId = await createRailwayEnvironment({
        railwayProvider: args.railwayProvider,
        projectId: project.id,
        name: "production",
      });
    }

    step = "resolve_service";
    let serviceId = args.existing.serviceId;
    if (
      !serviceId ||
      !project.services.some((entry) => entry.id === serviceId)
    ) {
      serviceId = selectRailwayServiceId(project.services, serviceName);
    }
    if (!serviceId) {
      step = "create_service";
      serviceId = await createRailwayServiceFromGithub({
        railwayProvider: args.railwayProvider,
        projectId: project.id,
        serviceName,
        repoPath: `${args.owner}/${args.repo}`,
        branch: args.defaultBranch,
      });
    }

    step = "set_variables";
    await upsertRailwayServiceVariables({
      railwayProvider: args.railwayProvider,
      projectId: project.id,
      environmentId,
      serviceId,
      variables: {
        VITE_CONVEX_URL: args.convex.cloudUrl,
        VITE_CONVEX_SITE_URL: args.convex.siteUrl,
        CONVEX_DEPLOY_KEY: args.convex.deployKey,
      },
    });

    step = "resolve_domain";
    const domains = await listRailwayServiceDomains({
      railwayProvider: args.railwayProvider,
      projectId: project.id,
      environmentId,
      serviceId,
    });
    let domain =
      domains.find((entry) => entry.domain === args.existing.domain)?.domain ??
      domains[0]?.domain;
    if (!domain) {
      step = "create_domain";
      domain = await createRailwayServiceDomain({
        railwayProvider: args.railwayProvider,
        environmentId,
        serviceId,
      });
    }

    step = "trigger_deploy";
    try {
      await triggerRailwayDeployment({
        railwayProvider: args.railwayProvider,
        serviceId,
        environmentId,
      });
    } catch (error) {
      console.warn("infra:railway:deploy:trigger_failed", {
        vaultId: args.vaultId,
        projectId: project.id,
        serviceId,
        environmentId,
        message: toErrorMessage(error),
      });
    }

    const result: Extract<ProvisionedByProvider, { provider: "railway" }> = {
      provider: "railway",
      projectId: project.id,
      environmentId,
      serviceId,
      domain,
    };

    console.log("infra:railway:provision:success", {
      vaultId: args.vaultId,
      projectId: result.projectId,
      environmentId: result.environmentId,
      serviceId: result.serviceId,
      domain: result.domain,
    });
    return result;
  } catch (error) {
    console.error("infra:railway:provision:failed", {
      vaultId: args.vaultId,
      repo: `${args.owner}/${args.repo}`,
      projectName,
      step,
      message: toErrorMessage(error),
    });
    throw error;
  }
}

export async function ensureHostingResources(
  args: EnsureHostingResourcesArgs,
): Promise<ProvisionedByProvider> {
  switch (args.provider) {
    case "netlify":
      return await ensureNetlifyResources(args);
    case "railway":
      return await ensureRailwayResources(args);
    default:
      args satisfies never;
      throw new Error("Unsupported hosting provider.");
  }
}

export function getProvisionedMainUrl(
  args: ProvisionedByProvider,
): string | undefined {
  switch (args.provider) {
    case "netlify":
      return args.productionUrl ?? args.defaultUrl;
    case "railway":
      return args.domain;
    default:
      args satisfies never;
      return undefined;
  }
}

export type HostingStatusReadResult = {
  summary: string;
  endpoint: string;
  raw: string;
  rowCount: number;
};

export type HostingLogsReadResult = {
  summary: string;
  endpoint: string;
  raw: string;
  logLineCount: number;
};

export type HostingInventoryReadResult = {
  summary: string;
  endpoint: string;
  raw: string;
  rowCount: number;
};

type ReadNetlifySiteStatusArgs = {
  provider: "netlify";
  netlifyProvider: NetlifyManagementProvider;
  siteId: string;
  siteName?: string;
};

type ReadRailwaySiteStatusArgs = {
  provider: "railway";
  railwayProvider: RailwayManagementProvider;
  projectId: string;
  environmentId: string;
  serviceId: string;
};

type ReadHostingSiteStatusArgs =
  | ReadNetlifySiteStatusArgs
  | ReadRailwaySiteStatusArgs;

export async function readHostingSiteStatus(
  args: ReadHostingSiteStatusArgs,
): Promise<HostingStatusReadResult> {
  switch (args.provider) {
    case "netlify": {
      const endpoint = `/sites/${encodeURIComponent(args.siteId)}`;
      const payload = await args.netlifyProvider.request(endpoint, "GET");
      return {
        summary: `Netlify site status for ${args.siteName ?? args.siteId}`,
        endpoint,
        raw: JSON.stringify(payload, null, 2),
        rowCount: 1,
      };
    }
    case "railway": {
      const deployments = await queryRailwayLatestDeployments({
        railwayProvider: args.railwayProvider,
        projectId: args.projectId,
        environmentId: args.environmentId,
        serviceId: args.serviceId,
        first: 1,
      });
      const deployment = deployments[0];
      const domains = await listRailwayServiceDomains({
        railwayProvider: args.railwayProvider,
        projectId: args.projectId,
        environmentId: args.environmentId,
        serviceId: args.serviceId,
      });
      return {
        summary: `Railway deployment status for service ${args.serviceId}`,
        endpoint: `railway:project=${args.projectId};environment=${args.environmentId};service=${args.serviceId}`,
        raw: JSON.stringify(
          {
            deployment,
            domains,
          },
          null,
          2,
        ),
        rowCount: deployment ? 1 : 0,
      };
    }
    default:
      args satisfies never;
      throw new Error("Unsupported hosting provider.");
  }
}

type ReadNetlifyLogsArgs = {
  provider: "netlify";
  netlifyProvider: NetlifyManagementProvider;
  siteId: string;
  maxEntries: number;
};

type ReadRailwayLogsArgs = {
  provider: "railway";
  railwayProvider: RailwayManagementProvider;
  projectId: string;
  environmentId: string;
  serviceId: string;
  maxEntries: number;
};

type ReadHostingLogsArgs = ReadNetlifyLogsArgs | ReadRailwayLogsArgs;

export async function readHostingLogs(
  args: ReadHostingLogsArgs,
): Promise<HostingLogsReadResult> {
  switch (args.provider) {
    case "netlify": {
      const maxEntries = clamp(args.maxEntries, 1, 50);
      const deploysEndpoint = `/sites/${encodeURIComponent(args.siteId)}/deploys?per_page=${maxEntries}&page=1`;
      const buildsEndpoint = `/sites/${encodeURIComponent(args.siteId)}/builds?per_page=${maxEntries}&page=1`;

      const deploysPayload = await args.netlifyProvider.request(
        deploysEndpoint,
        "GET",
      );
      const buildsPayload = await args.netlifyProvider.request(
        buildsEndpoint,
        "GET",
      );

      const lines: string[] = [];

      const deploys = Array.isArray(deploysPayload) ? deploysPayload : [];
      for (const deploy of deploys) {
        const record = asRecord(deploy);
        const createdAt = readString(record, "created_at") ?? "unknown";
        const state = readString(record, "state") ?? "unknown";
        const context = readString(record, "context") ?? "unknown";
        const branch = readString(record, "branch") ?? "unknown";
        const errorMessage = readString(record, "error_message");
        lines.push(
          `${createdAt} deploy state=${state} context=${context} branch=${branch}` +
            (errorMessage ? ` error=${errorMessage}` : ""),
        );
      }

      const builds = Array.isArray(buildsPayload) ? buildsPayload : [];
      for (const build of builds) {
        const record = asRecord(build);
        const createdAt = readString(record, "created_at") ?? "unknown";
        const done = record["done"] === true;
        const error = readString(record, "error") ?? "";
        lines.push(
          `${createdAt} build done=${done}` + (error ? ` error=${error}` : ""),
        );
      }

      return {
        summary: `Netlify deploy/build activity for site ${args.siteId}`,
        endpoint: `${deploysEndpoint} + ${buildsEndpoint}`,
        raw: lines.join("\n") || "No deploy/build activity entries returned.",
        logLineCount: lines.length,
      };
    }
    case "railway": {
      const deployments = await queryRailwayLatestDeployments({
        railwayProvider: args.railwayProvider,
        projectId: args.projectId,
        environmentId: args.environmentId,
        serviceId: args.serviceId,
        first: 1,
      });
      const deployment = deployments[0];
      if (!deployment?.id) {
        return {
          summary: `Railway deployment activity for service ${args.serviceId}`,
          endpoint: `railway:project=${args.projectId};environment=${args.environmentId};service=${args.serviceId}`,
          raw: "",
          logLineCount: 0,
        };
      }
      const maxEntries = clamp(args.maxEntries, 1, 200);
      const data = await args.railwayProvider.request(
        `
          query RailwayDeploymentLogs($deploymentId: String!, $limit: Int) {
            deploymentLogs(deploymentId: $deploymentId, limit: $limit) {
              timestamp
              message
              severity
            }
          }
        `,
        {
          deploymentId: deployment.id,
          limit: maxEntries,
        },
      );
      const lines = readRailwayLogLines(asRecord(data)["deploymentLogs"]);
      return {
        summary: `Railway deployment logs for service ${args.serviceId}`,
        endpoint: `railway:deploymentLogs:${deployment.id}`,
        raw: lines.join("\n"),
        logLineCount: lines.length,
      };
    }
    default:
      args satisfies never;
      throw new Error("Unsupported hosting provider.");
  }
}

type ReadNetlifyInventoryArgs = {
  provider: "netlify";
  netlifyProvider: NetlifyManagementProvider;
  teamSlug: string;
  limit: number;
};

type ReadRailwayInventoryArgs = {
  provider: "railway";
  railwayProvider: RailwayManagementProvider;
  limit: number;
};

type ReadHostingInventoryArgs =
  | ReadNetlifyInventoryArgs
  | ReadRailwayInventoryArgs;

export async function readHostingInventory(
  args: ReadHostingInventoryArgs,
): Promise<HostingInventoryReadResult> {
  switch (args.provider) {
    case "netlify": {
      const max = clamp(args.limit, 1, 100);
      const endpoint = `/${encodeURIComponent(args.teamSlug)}/sites?per_page=${max}&page=1`;
      const payload = await args.netlifyProvider.request(endpoint, "GET");
      const sites = Array.isArray(payload) ? payload : [];
      const rows = sites.slice(0, max);
      return {
        summary: `Netlify site inventory for team ${args.teamSlug}`,
        endpoint,
        raw: JSON.stringify(rows, null, 2),
        rowCount: rows.length,
      };
    }
    case "railway": {
      const projectCatalog = await listRailwayProjects({
        railwayProvider: args.railwayProvider,
      });
      const max = clamp(args.limit, 1, 100);
      const rows = projectCatalog.projects.slice(0, max).map((project) => ({
        id: project.id,
        name: project.name,
        workspaceId: project.workspaceId,
        serviceCount: project.services.length,
        environmentCount: project.environments.length,
      }));
      return {
        summary: "Railway project inventory",
        endpoint: "railway:projects",
        raw: JSON.stringify(rows, null, 2),
        rowCount: rows.length,
      };
    }
    default:
      args satisfies never;
      throw new Error("Unsupported hosting provider.");
  }
}

type DeleteNetlifyResourcesArgs = {
  provider: "netlify";
  netlifyProvider: NetlifyManagementProvider;
  siteId: string;
};

type DeleteRailwayResourcesArgs = {
  provider: "railway";
  railwayProvider: RailwayManagementProvider;
  projectId: string;
};

type DeleteHostingResourcesArgs =
  | DeleteNetlifyResourcesArgs
  | DeleteRailwayResourcesArgs;

export async function deleteHostingResources(
  args: DeleteHostingResourcesArgs,
): Promise<void> {
  switch (args.provider) {
    case "netlify":
      await args.netlifyProvider.request(
        `/sites/${encodeURIComponent(args.siteId)}`,
        "DELETE",
      );
      return;
    case "railway":
      await args.railwayProvider.request(
        `
          mutation RailwayProjectDelete($projectId: String!) {
            projectDelete(id: $projectId)
          }
        `,
        {
          projectId: args.projectId,
        },
      );
      return;
    default:
      args satisfies never;
      throw new Error("Unsupported hosting provider.");
  }
}
