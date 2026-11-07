import { validate } from "convex-helpers/validators";
import {
  httpActionGeneric,
  type GenericActionCtx,
  type GenericDataModel,
  type HttpRouter,
} from "convex/server";
import { v } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";
import { evaluate } from "./policy.js";
import type { RegistrationConfig } from "./registration.js";
import { sha256Hex } from "./subject.js";

// `/moderation/*`: the registration counts, the clients with who made them, the blocks, and the
// exemptions from the sign-in page, for the hub's administrator page (samebase.com's admin page
// for the shared hub). Every request needs the moderation key. The rows are in
// src/component/moderation.ts and src/component/signInPage.ts.

const { boolean, literal, object, string, union } = v;

type Ctx = GenericActionCtx<GenericDataModel>;

const MAX_REASON_LENGTH = 1_000;
/** The repositories of one `GET /moderation/clients` request, such as those of one organization. */
const MAX_REPOSITORIES_PER_REQUEST = 100;
const MAX_EMAIL_LENGTH = 320;

/** The body of `POST /moderation/blocks`. */
const vBlockChange = object({
  action: union(literal("block"), literal("unblock")),
  kind: union(literal("repository"), literal("owner")),
  githubId: string(),
  reason: string(),
  adminEmail: string(),
});

/**
 * The body of `POST /moderation/sign-in-page`: set (`skip: true`) or remove one exemption. An app
 * target names the recorded owner that the admin saw, which the hub checks before it sets the row.
 */
const vSignInPageChange = object({
  target: union(
    object({ scope: literal("every_app") }),
    object({ scope: literal("app"), appId: string(), expectedOwnerId: string() }),
  ),
  skip: boolean(),
  reason: string(),
  adminEmail: string(),
});

type ClientEntry = FunctionReturnType<ComponentApi["moderation"]["clientList"]>["clients"][number];

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

/** The change, if its reason and admin are given and an app target names a GitHub owner id. */
function readSignInPageChange(body: unknown) {
  if (!validate(vSignInPageChange, body)) {
    return null;
  }
  const reason = body.reason.trim();
  const adminEmail = body.adminEmail.trim();
  const { target } = body;
  return (target.scope === "every_app" ||
    (target.appId !== "" && /^[1-9][0-9]*$/.test(target.expectedOwnerId))) &&
    reason !== "" &&
    reason.length <= MAX_REASON_LENGTH &&
    adminEmail !== "" &&
    adminEmail.length <= MAX_EMAIL_LENGTH
    ? { target, skip: body.skip, reason, adminEmail }
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
   * A listed client with the tenant's recorded owner and what decides its sign-in page, as
   * `/authorize` decides it (`decide` in policy.ts): skipped by the `every_app` or the `this_app`
   * exemption, else `shown` when the hub's policy asks for it and skipped by the `policy` when it
   * does not. Null when the policy has no facts or failed.
   */
  function clientAnswer(entry: ClientEntry) {
    const policy =
      entry.registration === null ? null : evaluate(registration.policy, entry.registration);
    const signInPage =
      policy === null
        ? null
        : entry.exemption.everyApp
          ? ("every_app" as const)
          : entry.exemption.thisApp
            ? ("this_app" as const)
            : policy.consent
              ? ("shown" as const)
              : ("policy" as const);
    return { ...entry.client, ownerId: entry.ownerId, signInPage };
  }

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
   * Every client, newest first, up to the list's limit. With `?repository=<GitHub id>`, once for
   * each of at most `MAX_REPOSITORIES_PER_REQUEST` repositories, every client of those repositories
   * as `{ clients }`.
   */
  const listClients = moderationEndpoint(async (ctx, request) => {
    const repositories = new URL(request.url).searchParams.getAll("repository");
    if (repositories.length === 0) {
      const list = await ctx.runQuery(component.moderation.clientList, {});
      return reply(200, {
        clients: list.clients.map(clientAnswer),
        limitReached: list.limitReached,
      });
    }
    if (
      repositories.length > MAX_REPOSITORIES_PER_REQUEST ||
      !repositories.every((repository) => /^[1-9][0-9]*$/.test(repository))
    ) {
      return reply(400, { error: "invalid_request" });
    }
    const clients = await ctx.runQuery(component.moderation.repositoryClients, {
      githubRepositoryDatabaseIds: [...new Set(repositories)],
    });
    return reply(200, { clients: clients.map(clientAnswer) });
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

  /** The "every app" exemption from the sign-in page, if set, and every one-app exemption. */
  const listSignInPage = moderationEndpoint(async (ctx) =>
    reply(200, await ctx.runQuery(component.signInPage.list, {})),
  );

  /**
   * Sets or removes one exemption from the sign-in page. Answers `{ changed }`; 409
   * `owner_changed` when the repository's recorded owner is no longer the one the admin saw, and
   * 404 `unknown_app` for an app the hub does not have.
   */
  const changeSignInPage = moderationEndpoint(async (ctx, request) => {
    const change = readSignInPageChange(await request.json().catch(() => null));
    if (change === null) {
      return reply(400, { error: "invalid_request" });
    }
    const result = await ctx.runMutation(component.signInPage.set, {
      target:
        change.target.scope === "every_app"
          ? { scope: "every_app" }
          : {
              scope: "app",
              appId: change.target.appId,
              expectedOwnerId: change.target.expectedOwnerId,
            },
      skip: change.skip,
      reason: change.reason,
      adminEmail: change.adminEmail,
    });
    if (result.ok) {
      return reply(200, { changed: result.changed });
    }
    return reply(result.error === "owner_changed" ? 409 : 404, { error: result.error });
  });

  return {
    addRoutes(http: HttpRouter): void {
      http.route({ path: path("/moderation/counts"), method: "GET", handler: countRegistrations });
      http.route({ path: path("/moderation/blocks"), method: "GET", handler: listBlocks });
      http.route({ path: path("/moderation/blocks"), method: "POST", handler: changeBlock });
      http.route({
        path: path("/moderation/sign-in-page"),
        method: "GET",
        handler: listSignInPage,
      });
      http.route({
        path: path("/moderation/sign-in-page"),
        method: "POST",
        handler: changeSignInPage,
      });
      http.route({ path: path("/moderation/clients"), method: "GET", handler: listClients });
      http.route({ pathPrefix: clientsPrefix, method: "DELETE", handler: deleteClient });
    },
  };
}
