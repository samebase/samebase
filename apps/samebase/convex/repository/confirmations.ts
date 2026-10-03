import { ConvexError, v, type Infer } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type DatabaseReader, type MutationCtx } from "../_generated/server";
import { isRecord } from "../jsonUtils";
import { createActionConfirmationTokenValue, sha256Hex } from "../mcp/tokens";
import { requireRepositoryForUser } from "../organizationAccess";
import { getConvexCodeLocationPath, readConvexCodeLocation } from "../../shared/convexCodeLocation";
import {
  vConfirmationSurface,
  type ConfirmationSurface,
  type ConfirmedResource,
} from "./confirmationModel";
import {
  vActionConfirmation,
  vActionConfirmationRequest,
  type ActionConfirmation,
} from "./contracts/actionConfirmation";
import { cloudflareConnectWorkerContract } from "./contracts/cloudflareAttachments";
import { cloudflareRotateConvexDeployKeysForWorkersBuildsContract } from "./contracts/cloudflareRotateConvexDeployKeysForWorkersBuilds";
import { detachResourceContract, vDetachableResource } from "./contracts/detachResource";
import { retryInfrastructureProvisioningContract } from "./contracts/retryInfrastructureProvisioning";

/*
The one confirmation check of the four gated actions (rfcs/125), shared by the dashboard and MCP.
The first call of a gated action gets a challenge and performs nothing. The second call sends the
token and the exact acknowledgement sentence; the check accepts them only for the same user,
action, and normalized request, consumes the token, and writes the audit row.
*/

const { id, literal, object, optional, string, union } = v;

const ACTION_CONFIRMATION_TTL_MS = 10 * 60 * 1000;
const START_AGAIN =
  "Nothing changed. Call the action again without confirmation to get a new confirmation request.";

/**
A gated request after the server resolved names and defaults: the repository, the Worker tag, the
root directory, the Workers Builds token, and the Convex project (null when none is attached). A
token approves exactly this request.
*/
export const vConfirmedActionRequest = union(
  object({
    action: literal(cloudflareConnectWorkerContract.id),
    repositoryId: id("repositories"),
    workerName: string(),
    workerTag: string(),
    rootDirectory: string(),
    buildTokenUuid: string(),
    convexProjectId: union(id("repositoryConvexProjects"), v.null()),
  }),
  object({
    action: literal(cloudflareRotateConvexDeployKeysForWorkersBuildsContract.id),
    repositoryId: id("repositories"),
    workerId: id("repositoryCloudflareWorkers"),
    convexProjectId: id("repositoryConvexProjects"),
  }),
  object({
    action: literal(retryInfrastructureProvisioningContract.id),
    repositoryId: id("repositories"),
  }),
  object({
    action: literal(detachResourceContract.id),
    repositoryId: id("repositories"),
    resource: vDetachableResource,
  }),
);
export type ConfirmedActionRequest = Infer<typeof vConfirmedActionRequest>;

/** `confirmed` means that the token was consumed and the caller performs the request now. */
export const vActionConfirmationCheck = union(
  vActionConfirmationRequest,
  object({ state: literal("confirmed") }),
);
type ActionConfirmationCheck = Infer<typeof vActionConfirmationCheck>;

type ConnectedRepository = Extract<Doc<"repositories">, { state: "connected" }>;

type ConfirmationSubject = {
  organizationId: Id<"organizations">;
  resource: ConfirmedResource;
  effect: string;
  /** The approved change, which the acknowledgement names after its surface prefix. */
  approval: string;
};

/** JSON with sorted object keys, so equal requests have equal digests in any key order. */
function toCanonicalJson(request: ConfirmedActionRequest): string {
  return JSON.stringify(request, (_key, value: unknown) =>
    isRecord(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, value[key]]),
        )
      : value,
  );
}

async function requireAttachedWorker(
  db: DatabaseReader,
  repository: ConnectedRepository,
  workerId: Id<"repositoryCloudflareWorkers">,
) {
  const worker = await db.get(workerId);
  if (
    !worker ||
    worker.repositoryId !== repository._id ||
    worker.organizationId !== repository.organizationId
  ) {
    throw new ConvexError("The Cloudflare Worker is not attached to this repository.");
  }
  return worker;
}

async function requireAttachedConvexProject(
  db: DatabaseReader,
  repository: ConnectedRepository,
  convexProjectId: Id<"repositoryConvexProjects">,
) {
  const project = await db.get(convexProjectId);
  if (
    !project ||
    project.repositoryId !== repository._id ||
    project.organizationId !== repository.organizationId
  ) {
    throw new ConvexError("The Convex project is not attached to this repository.");
  }
  return {
    project,
    codeLocation: getConvexCodeLocationPath(readConvexCodeLocation(project)),
  };
}

function toWorkerResource(worker: Doc<"repositoryCloudflareWorkers">): ConfirmedResource {
  return {
    kind: "cloudflare_worker",
    accountId: worker.accountId,
    workerTag: worker.workerTag,
    workerName: worker.workerName,
  };
}

/**
Re-reads the repository and the resource that the request names, from local rows only, so the
dashboard mutation can run the check. Convex projects are named by their code location, which the
dashboard also shows; their Convex names need a provider read.
*/
async function readConfirmationSubject(
  db: DatabaseReader,
  args: { userId: Id<"users">; request: ConfirmedActionRequest },
): Promise<ConfirmationSubject> {
  const { request } = args;
  const repository = await requireRepositoryForUser(db, {
    userId: args.userId,
    repositoryId: request.repositoryId,
  });
  if (repository.state !== "connected") {
    throw new ConvexError("This repository has no connected GitHub repository yet.");
  }
  const organization = await db.get(repository.organizationId);
  if (!organization) {
    throw new Error("Repository organization not found.");
  }
  const repositoryName = `${organization.githubOwnerLogin}/${repository.githubRepositoryName}`;
  const { organizationId } = repository;

  switch (request.action) {
    case "connect_cloudflare_worker": {
      const accountId = repository.cloudflareAccountId;
      if (!accountId) {
        throw new ConvexError("Connect Cloudflare in Providers before adding a Worker.");
      }
      const convexProject =
        request.convexProjectId === null
          ? null
          : await requireAttachedConvexProject(db, repository, request.convexProjectId);
      const { rootDirectory, workerName } = request;
      return {
        organizationId,
        resource: {
          kind: "cloudflare_worker",
          accountId,
          workerTag: request.workerTag,
          workerName,
        },
        effect: `Samebase attaches the Worker ${workerName} to ${repositoryName}, sets its Workers Builds settings to build ${repositoryName} from root directory ${rootDirectory}${convexProject ? `, installs the deploy key of the Convex project at ${convexProject.codeLocation}` : ""}, and starts a production build. That build replaces what the Worker serves now.`,
        approval: `replacing the live deployment of Worker ${workerName} with a build of ${repositoryName} from root directory ${rootDirectory}${convexProject ? ` that deploys the Convex project at ${convexProject.codeLocation}` : ""}`,
      };
    }
    case "rotate_convex_deploy_keys": {
      const worker = await requireAttachedWorker(db, repository, request.workerId);
      const { codeLocation } = await requireAttachedConvexProject(
        db,
        repository,
        request.convexProjectId,
      );
      return {
        organizationId,
        resource: toWorkerResource(worker),
        effect: `Samebase revokes the Convex deploy keys that it recorded for the Worker ${worker.workerName}, creates new keys on the Convex project at ${codeLocation}, writes them to the Worker's Workers Builds settings, and starts a production build. If a step fails, builds of the Worker cannot deploy Convex until the keys are replaced again.`,
        approval: `revoking and replacing the Convex deploy keys of Worker ${worker.workerName} with new keys of the Convex project at ${codeLocation}`,
      };
    }
    case "retry_provider_setup":
      return {
        organizationId,
        resource: { kind: "repository", githubRepositoryFullName: repositoryName },
        effect: `Samebase starts a new provider setup run for ${repositoryName}. It creates missing Convex and Cloudflare resources. When the setup includes Cloudflare, it rewrites the Workers Builds settings of the Worker, revokes and replaces the Convex deploy keys that it recorded, and starts a production build.`,
        approval: `a new provider setup run for ${repositoryName}, which can rewrite its Workers Builds settings and revoke and replace its Convex deploy keys`,
      };
    case "detach_resource": {
      if (request.resource.kind === "cloudflare_worker") {
        const worker = await requireAttachedWorker(db, repository, request.resource.workerId);
        return {
          organizationId,
          resource: toWorkerResource(worker),
          effect: `Samebase removes the Worker ${worker.workerName} from ${repositoryName}. The Worker keeps running in Cloudflare, and Samebase changes no Cloudflare setting or key.`,
          approval: `removing Worker ${worker.workerName} from ${repositoryName} in Samebase`,
        };
      }
      const { codeLocation, project } = await requireAttachedConvexProject(
        db,
        repository,
        request.resource.convexProjectId,
      );
      return {
        organizationId,
        resource: {
          kind: "convex_project",
          teamId: project.teamId,
          projectId: project.projectId,
          codeLocation,
        },
        effect: `Samebase removes the Convex project at ${codeLocation} from ${repositoryName}. The project keeps running in Convex, and Samebase changes no Convex setting or key.`,
        approval: `removing the Convex project at ${codeLocation} from ${repositoryName} in Samebase`,
      };
    }
    default:
      request satisfies never;
      throw new Error("Unsupported confirmed action.");
  }
}

/**
Without `confirmation`, stores a token hash bound to the user, the action, and the digest of the
normalized request, and returns the challenge; the caller performs nothing. With `confirmation`, it
requires that token, unused and unexpired, issued to this user for this action and an identical
request, plus the exact acknowledgement. It then consumes the token and writes the audit row in the
same transaction, and the caller performs the request.
*/
export async function checkActionConfirmation(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    surface: ConfirmationSurface;
    request: ConfirmedActionRequest;
    confirmation: ActionConfirmation | undefined;
  },
): Promise<ActionConfirmationCheck> {
  const subject = await readConfirmationSubject(ctx.db, args);
  const requestDigest = await sha256Hex(toCanonicalJson(args.request));
  const now = Date.now();

  if (!args.confirmation) {
    const token = createActionConfirmationTokenValue();
    const expiresAt = now + ACTION_CONFIRMATION_TTL_MS;
    // A person ticks the dashboard sentence; an agent states the user's approval over MCP.
    const acknowledgement =
      args.surface.kind === "dashboard"
        ? `I approve ${subject.approval}`
        : `I confirm that the user approved ${subject.approval}`;
    const tokenId = await ctx.db.insert("actionConfirmationTokens", {
      tokenHash: await sha256Hex(token),
      userId: args.userId,
      action: args.request.action,
      requestDigest,
      effect: subject.effect,
      acknowledgement,
      createdAt: now,
      expiresAt,
    });
    await ctx.scheduler.runAfter(
      ACTION_CONFIRMATION_TTL_MS,
      internal.repository.confirmations.deleteToken,
      { tokenId },
    );
    return {
      state: "needs_confirmation",
      effect: subject.effect,
      acknowledgement,
      token,
      expiresAt,
    };
  }

  const tokenHash = await sha256Hex(args.confirmation.token);
  const issued = await ctx.db
    .query("actionConfirmationTokens")
    .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (!issued || issued.userId !== args.userId) {
    throw new ConvexError(`This confirmation token is not valid. ${START_AGAIN}`);
  }
  if (issued.consumedAt) {
    throw new ConvexError(`This confirmation token was already used. ${START_AGAIN}`);
  }
  if (issued.expiresAt <= now) {
    throw new ConvexError(`This confirmation token expired. ${START_AGAIN}`);
  }
  if (issued.action !== args.request.action) {
    throw new ConvexError(`This confirmation token belongs to another action. ${START_AGAIN}`);
  }
  if (issued.requestDigest !== requestDigest) {
    throw new ConvexError(
      "The arguments differ from the request that the user approved, so nothing changed. Send the approved arguments, or call again without confirmation to get a new confirmation request.",
    );
  }
  if (args.confirmation.acknowledgement.trim() !== issued.acknowledgement) {
    throw new ConvexError(
      `The acknowledgement does not match, so nothing changed. Send exactly: ${issued.acknowledgement}`,
    );
  }

  await ctx.db.patch(issued._id, { consumedAt: now });
  await ctx.db.insert("audit_confirmedActions_events", {
    userId: args.userId,
    organizationId: subject.organizationId,
    repositoryId: args.request.repositoryId,
    action: args.request.action,
    resource: subject.resource,
    requestDigest,
    effect: issued.effect,
    acknowledgement: issued.acknowledgement,
    surface: args.surface,
    issuedAt: issued.createdAt,
    confirmedAt: now,
  });
  return { state: "confirmed" };
}

/** The check for gated actions, which cannot write the database themselves. */
export const check = internalMutation({
  args: {
    userId: id("users"),
    surface: vConfirmationSurface,
    request: vConfirmedActionRequest,
    confirmation: optional(vActionConfirmation),
  },
  returns: vActionConfirmationCheck,
  handler: async (ctx, args): Promise<ActionConfirmationCheck> =>
    await checkActionConfirmation(ctx, {
      userId: args.userId,
      surface: args.surface,
      request: args.request,
      confirmation: args.confirmation,
    }),
});

/** Scheduled at a token's expiry. A used or unused token is no longer valid then. */
export const deleteToken = internalMutation({
  args: {
    tokenId: id("actionConfirmationTokens"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const token = await ctx.db.get(args.tokenId);
    if (token) {
      await ctx.db.delete(token._id);
    }
    return null;
  },
});
