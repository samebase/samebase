import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import type { AppProvisioningRunStep, AppProvisioningRunTrigger } from "./model";
import { makeConvexTest } from "../test.setup";

type ConvexTest = ReturnType<typeof makeConvexTest>;

type SeedRunArgs = {
  repoName: string;
  trigger: AppProvisioningRunTrigger;
  currentStep: AppProvisioningRunStep;
  workflowId?: string;
  connectedVault?: boolean;
  activeOwnership?: boolean;
};

async function seedRun(t: ConvexTest, args: SeedRunArgs) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
    });
    const vaultId = await ctx.db.insert("vaults", {
      userId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const runId = await ctx.db.insert("appProvisioningRuns", {
      userId,
      vaultId,
      repositoryFullName: `ada/${args.repoName}`,
      workflowId: args.workflowId,
      trigger: args.trigger,
      state: "running",
      currentStep: args.currentStep,
      createdAt: 10,
      updatedAt: 30,
    });

    if (args.connectedVault) {
      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: args.repoName,
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
      });
    }

    if (args.activeOwnership) {
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId,
        runId,
        state: "active",
        updatedAt: 31,
      });
    }

    return { runId, vaultId };
  });
}

async function readRunAndFirstEvent(
  t: ConvexTest,
  runId: Awaited<ReturnType<typeof seedRun>>["runId"],
) {
  return await t.run(async (ctx) => {
    const run = await ctx.db.get(runId);
    const event = await ctx.db
      .query("appProvisioningEvents")
      .withIndex("by_run_and_created_at", (q) => q.eq("runId", runId))
      .first();
    return { event, run };
  });
}

describe("upsertDomainRecord", () => {
  it("creates and updates one branch domain for Samebase-managed connected vaults", async () => {
    const t = makeConvexTest();
    const ids = await seedRun(t, {
      repoName: "domain-record",
      trigger: "create",
      currentStep: "record_domains",
      connectedVault: true,
    });

    await t.mutation(internal.appProvisioning.infrastructure.upsertDomainRecord, {
      vaultId: ids.vaultId,
      branch: "main",
      kind: "main",
      url: "https://domain-record.workers.dev",
      source: "cloudflare_workers_default",
      active: true,
    });
    await t.mutation(internal.appProvisioning.infrastructure.upsertDomainRecord, {
      vaultId: ids.vaultId,
      branch: "main",
      kind: "main",
      url: "https://domain-record.example.com",
      source: "cloudflare_workers_custom",
      active: false,
    });

    const domains = await t.run(async (ctx) => {
      return await ctx.db
        .query("vaultDomains")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .collect();
    });

    expect(domains).toHaveLength(1);
    expect(domains[0]).toMatchObject({
      vaultId: ids.vaultId,
      branch: "main",
      kind: "main",
      url: "https://domain-record.example.com",
      source: "cloudflare_workers_custom",
      active: false,
    });
  });

  it("ignores vaults that are not connected managed repositories", async () => {
    const t = makeConvexTest();
    const ids = await seedRun(t, {
      repoName: "ignored-domain",
      trigger: "create",
      currentStep: "record_domains",
    });

    const result = await t.mutation(internal.appProvisioning.infrastructure.upsertDomainRecord, {
      vaultId: ids.vaultId,
      branch: "main",
      kind: "main",
      url: "https://ignored-domain.workers.dev",
      source: "cloudflare_workers_default",
      active: true,
    });

    const domains = await t.run(async (ctx) => {
      return await ctx.db
        .query("vaultDomains")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .collect();
    });

    expect(result).toEqual({ applied: false });
    expect(domains).toEqual([]);
  });
});

describe("markWorkflowProvisioningFailed", () => {
  it("records Cloudflare Workers Builds guard errors from wire_builds child runs", async () => {
    const t = makeConvexTest();
    const ids = await seedRun(t, {
      repoName: "manual-cloudflare",
      trigger: "wire_builds",
      currentStep: "wire_builds",
      workflowId: "workflow-wire-builds",
      connectedVault: true,
    });
    const expectedMessage =
      "Cannot connect Cloudflare Worker worker-tag to ada/manual-cloudflare: its existing production Workers Builds trigger is connected to GitHub repository ada/other-app (999). Disconnect Builds in Cloudflare or choose another Worker.";

    await t.mutation(internal.appProvisioning.infrastructure.markWorkflowProvisioningFailed, {
      runId: ids.runId,
      workflowId: "workflow-wire-builds",
      message: `Error: Uncaught Error: ${expectedMessage}\n    at wireCloudflareWorkerBuilds`,
    });

    const result = await readRunAndFirstEvent(t, ids.runId);

    expect(result.run).toMatchObject({
      state: "failed",
      lastError: expectedMessage,
    });
    expect(result.event).toMatchObject({
      step: "wire_builds",
      level: "error",
      message: expectedMessage,
    });
  });

  it("records Cloudflare GitHub App authorization errors on Worker attach runs", async () => {
    const t = makeConvexTest();
    const ids = await seedRun(t, {
      repoName: "cloudflare-github-app",
      trigger: "connect_cloudflare_worker",
      currentStep: "attach_worker",
      workflowId: "workflow-cloudflare-github-app",
      connectedVault: true,
      activeOwnership: true,
    });

    await t.mutation(internal.appProvisioning.infrastructure.markWorkflowProvisioningFailed, {
      runId: ids.runId,
      workflowId: "workflow-cloudflare-github-app",
      message:
        "Cloudflare MCP tool call failed: Error: Cloudflare API error: 8000008: This project is disconnected from your Git account, this may cause deployments to fail. Refer to https://developers.cloudflare.com/pages/platform/git-integration/#this-project-is-disconnected-from-your-git-account-this-may-cause-deployments-to-fail",
    });

    const result = await readRunAndFirstEvent(t, ids.runId);
    const expectedMessage =
      "Cloudflare Workers and Pages GitHub App is not authorized for ada/cloudflare-github-app. Follow Cloudflare's recovery steps at https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/#reinstall-the-cloudflare-github-app: uninstall the GitHub App first, then reinstall/connect GitHub from Workers & Pages and include ada/cloudflare-github-app, then retry.";

    expect(result.run).toMatchObject({
      state: "failed",
      lastError: expectedMessage,
    });
    expect(result.event).toMatchObject({
      step: "attach_worker",
      level: "error",
      message: expectedMessage,
    });
  });

  it("records Cloudflare Worker name conflicts on Worker attach runs", async () => {
    const t = makeConvexTest();
    const ids = await seedRun(t, {
      repoName: "existing-worker-name",
      trigger: "connect_cloudflare_worker",
      currentStep: "attach_worker",
      workflowId: "workflow-existing-worker-name",
      connectedVault: true,
      activeOwnership: true,
    });
    const expectedMessage =
      "Cloudflare Worker name existing-worker-name already exists. Choose another Worker name and try again.";

    await t.mutation(internal.appProvisioning.infrastructure.markWorkflowProvisioningFailed, {
      runId: ids.runId,
      workflowId: "workflow-existing-worker-name",
      message: `Error: Uncaught Error: ${expectedMessage}\n    at handler (../../convex/vault/cloudflare.ts:911:8)`,
    });

    const result = await readRunAndFirstEvent(t, ids.runId);

    expect(result.run).toMatchObject({
      state: "failed",
      lastError: expectedMessage,
    });
    expect(result.event).toMatchObject({
      step: "attach_worker",
      level: "error",
      message: expectedMessage,
    });
  });

  it("marks active Convex child-run ownership as failed", async () => {
    const t = makeConvexTest();
    const ids = await seedRun(t, {
      repoName: "convex-failure",
      trigger: "connect_convex_deployment",
      currentStep: "attach_convex",
      workflowId: "workflow-convex",
      connectedVault: true,
      activeOwnership: true,
    });
    const expectedMessage =
      "Convex connection is required to provision infrastructure. Connect Convex and retry.";

    await t.mutation(internal.appProvisioning.infrastructure.markWorkflowProvisioningFailed, {
      runId: ids.runId,
      workflowId: "workflow-convex",
      message: `Error: ${expectedMessage}`,
    });

    const result = await t.run(async (ctx) => {
      const run = await ctx.db.get(ids.runId);
      const ownership = await ctx.db
        .query("vaultInfrastructureOwnership")
        .withIndex("by_run", (q) => q.eq("runId", ids.runId))
        .first();
      return { ownership, run };
    });

    expect(result.run).toMatchObject({
      state: "failed",
      lastError: expectedMessage,
    });
    expect(result.ownership).toMatchObject({
      state: "failed",
    });
  });

  it("marks active composed create-app ownership as failed", async () => {
    const t = makeConvexTest();
    const ids = await seedRun(t, {
      repoName: "composed-worker-failure",
      trigger: "create",
      currentStep: "attach_worker",
      workflowId: "workflow-composed-worker",
      connectedVault: true,
      activeOwnership: true,
    });
    const expectedMessage = "Cloudflare Worker connection did not attach a Worker.";

    await t.mutation(internal.appProvisioning.infrastructure.markWorkflowProvisioningFailed, {
      runId: ids.runId,
      workflowId: "workflow-composed-worker",
      message: `Error: ${expectedMessage}`,
    });

    const result = await t.run(async (ctx) => {
      const run = await ctx.db.get(ids.runId);
      const ownership = await ctx.db
        .query("vaultInfrastructureOwnership")
        .withIndex("by_run", (q) => q.eq("runId", ids.runId))
        .first();
      const event = await ctx.db
        .query("appProvisioningEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .first();
      return { event, ownership, run };
    });

    expect(result.run).toMatchObject({
      state: "failed",
      lastError: expectedMessage,
    });
    expect(result.ownership).toMatchObject({
      state: "failed",
    });
    expect(result.event).toMatchObject({
      step: "attach_worker",
      level: "error",
      message: expectedMessage,
    });
  });

  it("records GitHub repository validation errors before infrastructure starts", async () => {
    const t = makeConvexTest();
    const ids = await seedRun(t, {
      repoName: "github-validation-failure",
      trigger: "create",
      currentStep: "fetch_github_repo",
      workflowId: "workflow-github",
    });

    await t.mutation(internal.appProvisioning.infrastructure.markWorkflowProvisioningFailed, {
      runId: ids.runId,
      workflowId: "workflow-github",
      message:
        "Error: Uncaught Error: GitHub repository response did not match the vault repo.\n    at fetchGitHubRepoIdentity",
    });

    const result = await readRunAndFirstEvent(t, ids.runId);
    const expectedMessage = "GitHub repository response did not match the vault repo.";

    expect(result.run).toMatchObject({
      state: "failed",
      lastError: expectedMessage,
    });
    expect(result.event).toMatchObject({
      step: "fetch_github_repo",
      level: "error",
      message: expectedMessage,
    });
  });
});
