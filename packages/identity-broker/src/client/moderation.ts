import { validate } from "convex-helpers/validators";
import {
  httpActionGeneric,
  type GenericActionCtx,
  type GenericDataModel,
  type HttpRouter,
} from "convex/server";
import { v } from "convex/values";
import type { ComponentApi } from "../component/_generated/component.js";
import type { RegistrationConfig } from "./registration.js";
import { sha256Hex } from "./subject.js";

// `/moderation/*`: the registration counts, the clients with who made them, and the blocks, for the
// hub's administrator page (samebase.com's admin page for the shared hub). Every request needs the
// moderation key. The rows are in src/component/moderation.ts.

const { literal, object, string, union } = v;

type Ctx = GenericActionCtx<GenericDataModel>;

const MAX_REASON_LENGTH = 1_000;
const MAX_EMAIL_LENGTH = 320;

/** The body of `POST /moderation/blocks`. */
const vBlockChange = object({
  action: union(literal("block"), literal("unblock")),
  kind: union(literal("repository"), literal("owner")),
  githubId: string(),
  reason: string(),
  adminEmail: string(),
});

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** The change, if its id is a GitHub id and its reason and admin are given. */
function readBlockChange(body: unknown) {
  if (!validate(vBlockChange, body)) {
    return null;
  }
  const reason = body.reason.trim();
  const adminEmail = body.adminEmail.trim();
  return /^[1-9][0-9]*$/.test(body.githubId) &&
    reason !== "" &&
    reason.length <= MAX_REASON_LENGTH &&
    adminEmail !== "" &&
    adminEmail.length <= MAX_EMAIL_LENGTH
    ? { action: body.action, kind: body.kind, githubId: body.githubId, reason, adminEmail }
    : null;
}

export function moderationEndpoints(args: {
  component: ComponentApi;
  registration: RegistrationConfig;
  path: (suffix: string) => string;
}) {
  const { component, registration, path } = args;
  const clientsPrefix = path("/moderation/clients/");

  /**
   * An endpoint that answers only a request with the moderation key, compared by hash, so the time it
   * takes says nothing about the key. An unset or empty key refuses every request.
   */
  function moderationEndpoint(handler: (ctx: Ctx, request: Request) => Promise<Response>) {
    return httpActionGeneric(async (ctx, request) => {
      const expected = registration.moderationKey()?.trim();
      const presented = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") ?? "")?.[1];
      if (!expected || !presented || (await sha256Hex(presented)) !== (await sha256Hex(expected))) {
        return reply(401, { error: "invalid_token" });
      }
      return await handler(ctx, request);
    });
  }

  const countRegistrations = moderationEndpoint(async (ctx) =>
    reply(200, await ctx.runQuery(component.moderation.counts, { now: Date.now() })),
  );

  const listBlocks = moderationEndpoint(async (ctx) =>
    reply(200, await ctx.runQuery(component.moderation.blockList, {})),
  );

  /**
   * Every client, newest first, up to the list's limit. With `?repository=<GitHub id>`, every client
   * of that repository as `{ clients }`.
   */
  const listClients = moderationEndpoint(async (ctx, request) => {
    const repository = new URL(request.url).searchParams.get("repository");
    if (repository === null) {
      return reply(200, await ctx.runQuery(component.moderation.clientList, {}));
    }
    if (!/^[1-9][0-9]*$/.test(repository)) {
      return reply(400, { error: "invalid_request" });
    }
    const clients = await ctx.runQuery(component.moderation.repositoryClients, {
      githubRepositoryDatabaseId: repository,
    });
    return reply(200, { clients });
  });

  /**
   * `DELETE /moderation/clients/<client id>`: deletes one client. The deployment that held it gets
   * a new client at its next deploy. Answers `{ changed }`, false for a client already gone.
   */
  const deleteClient = moderationEndpoint(async (ctx, request) => {
    // Exactly one segment after the prefix: `cl_A/cl_B` is a malformed path, not a delete of cl_B.
    const clientId = new URL(request.url).pathname.slice(clientsPrefix.length);
    if (!/^cl_[A-Za-z0-9_-]+$/.test(clientId)) {
      return reply(400, { error: "invalid_request" });
    }
    return reply(200, await ctx.runMutation(component.clients.remove, { clientId }));
  });

  /** Blocks or unblocks one repository or owner. Answers `{ changed }`. */
  const changeBlock = moderationEndpoint(async (ctx, request) => {
    const change = readBlockChange(await request.json().catch(() => null));
    if (change === null) {
      return reply(400, { error: "invalid_request" });
    }
    return reply(
      200,
      await ctx.runMutation(component.moderation.setBlock, {
        action: change.action,
        kind: change.kind,
        githubId: change.githubId,
        reason: change.reason,
        adminEmail: change.adminEmail,
      }),
    );
  });

  return {
    addRoutes(http: HttpRouter): void {
      http.route({ path: path("/moderation/counts"), method: "GET", handler: countRegistrations });
      http.route({ path: path("/moderation/blocks"), method: "GET", handler: listBlocks });
      http.route({ path: path("/moderation/blocks"), method: "POST", handler: changeBlock });
      http.route({ path: path("/moderation/clients"), method: "GET", handler: listClients });
      http.route({ pathPrefix: clientsPrefix, method: "DELETE", handler: deleteClient });
    },
  };
}
