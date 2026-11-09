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
import { usableNames } from "../component/connectorRule.js";
import { evaluate, pageShown } from "./policy.js";
import type { RegistrationConfig } from "./registration.js";
import { sha256Hex } from "./subject.js";

// `/moderation/*`: the registration counts, the clients with who made them, the blocks, the
// exemptions from the sign-in page, and the connector grants, for the hub's administrator page
// (samebase.com's admin page for the shared hub). Every request needs the moderation key. The rows
// are in src/component/moderation.ts, src/component/signInPage.ts, and
// src/component/connectorGrants.ts.

const { boolean, literal, object, string, union } = v;

type Ctx = GenericActionCtx<GenericDataModel>;

const MAX_REASON_LENGTH = 1_000;
const MAX_EMAIL_LENGTH = 320;
/** A numeric GitHub id of a repository or an account. */
const GITHUB_ID = /^[1-9][0-9]*$/;

/** The body of `POST /moderation/blocks`. */
const vBlockChange = object({
  action: union(literal("block"), literal("unblock")),
  kind: union(literal("repository"), literal("owner")),
  githubId: string(),
  reason: string(),
  adminEmail: string(),
});

/**
 * The body of `POST /moderation/sign-in-page`: set (`skip: true`) or remove one exemption. A
 * repository target, by its numeric GitHub id, names the owner that the row is bound to.
 */
const vSignInPageChange = object({
  target: union(
    object({ scope: literal("every_app") }),
    object({ scope: literal("repository"), repositoryId: string(), expectedOwnerId: string() }),
  ),
  skip: boolean(),
  reason: string(),
  adminEmail: string(),
});

/**
 * The body of `POST /moderation/connector-grants`: grant (`grant: true`) or revoke one connector of
 * one repository, by its numeric GitHub id, for the owner that the row is bound to.
 */
const vConnectorGrantChange = object({
  repositoryId: string(),
  connector: string(),
  expectedOwnerId: string(),
  grant: boolean(),
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
  return GITHUB_ID.test(body.githubId) &&
    reason !== "" &&
    reason.length <= MAX_REASON_LENGTH &&
    adminEmail !== "" &&
    adminEmail.length <= MAX_EMAIL_LENGTH
    ? { action: body.action, kind: body.kind, githubId: body.githubId, reason, adminEmail }
    : null;
}

/** The change, if its reason and admin are given and a repository target names GitHub ids. */
function readSignInPageChange(body: unknown) {
  if (!validate(vSignInPageChange, body)) {
    return null;
  }
  const reason = body.reason.trim();
  const adminEmail = body.adminEmail.trim();
  const { target } = body;
  return (target.scope === "every_app" ||
    (GITHUB_ID.test(target.repositoryId) && GITHUB_ID.test(target.expectedOwnerId))) &&
    reason !== "" &&
    reason.length <= MAX_REASON_LENGTH &&
    adminEmail !== "" &&
    adminEmail.length <= MAX_EMAIL_LENGTH
    ? { target, skip: body.skip, reason, adminEmail }
    : null;
}

/** The change, if its reason and admin are given and it names a repository and owner by GitHub id. */
function readConnectorGrantChange(body: unknown) {
  if (!validate(vConnectorGrantChange, body)) {
    return null;
  }
  const reason = body.reason.trim();
  const adminEmail = body.adminEmail.trim();
  return GITHUB_ID.test(body.repositoryId) &&
    GITHUB_ID.test(body.expectedOwnerId) &&
    reason !== "" &&
    reason.length <= MAX_REASON_LENGTH &&
    adminEmail !== "" &&
    adminEmail.length <= MAX_EMAIL_LENGTH
    ? {
        repositoryId: body.repositoryId,
        connector: body.connector,
        expectedOwnerId: body.expectedOwnerId,
        grant: body.grant,
        reason,
        adminEmail,
      }
    : null;
}

export function moderationEndpoints(args: {
  component: ComponentApi;
  registration: RegistrationConfig;
  /** The names of the hub's connectors, the only ones a grant may name. */
  connectors: string[];
  path: (suffix: string) => string;
}) {
  const { component, registration, connectors, path } = args;
  const clientsPrefix = path("/moderation/clients/");

  /**
   * A listed client with the tenant's recorded owner, its sign-in page by the rule that
   * `/authorize` applies (`pageShown`: `shown`, or skipped by the `every_app` or the `repository`
   * exemption), and its connectors by the rule that every step of a sign-in applies: the hub's
   * connectors that the policy gives it (`policyConnectors`), the enrolled ones it may use now
   * (`usableConnectors`), and those of them that only a grant allows (`grantedConnectors`). The
   * page and the connector lists are null when the client cannot sign in at all: the policy has no
   * facts or failed.
   */
  function clientAnswer(entry: ClientEntry) {
    const policy =
      entry.registration === null ? null : evaluate(registration.policy, entry.registration);
    if (policy === null) {
      return {
        ...entry.client,
        ownerId: entry.ownerId,
        signInPage: null,
        policyConnectors: null,
        usableConnectors: null,
        grantedConnectors: null,
      };
    }
    const policyConnectors = connectors.filter((name) => policy.connectors.includes(name));
    // The rule of every step of a sign-in, so the report and the fences cannot disagree.
    const usableConnectors = usableNames({
      requested: entry.client.connectors,
      enrollment: entry.client.connectors,
      policy: policyConnectors,
      granted: entry.granted,
      configured: connectors,
    });
    return {
      ...entry.client,
      ownerId: entry.ownerId,
      signInPage: pageShown(entry.exemption)
        ? ("shown" as const)
        : entry.exemption.everyApp
          ? ("every_app" as const)
          : ("repository" as const),
      policyConnectors,
      usableConnectors,
      grantedConnectors: usableConnectors.filter((name) => !policyConnectors.includes(name)),
    };
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
   * Every client, newest first, up to the list's limit. With `?owner=<GitHub id>`, every client of
   * the repositories whose recorded owner that account is, such as those of one organization, as
   * `{ owner, clients, limitReached }`. Any other parameter is refused, so a caller that asks for a
   * filter this version does not have never gets the full list.
   */
  const listClients = moderationEndpoint(async (ctx, request) => {
    const params = new URL(request.url).searchParams;
    if (params.size === 0) {
      const list = await ctx.runQuery(component.moderation.clientList, {});
      return reply(200, {
        clients: list.clients.map(clientAnswer),
        limitReached: list.limitReached,
      });
    }
    const owner = params.get("owner");
    if (params.size !== 1 || owner === null || !GITHUB_ID.test(owner)) {
      return reply(400, { error: "invalid_request" });
    }
    const list = await ctx.runQuery(component.moderation.ownerClients, { ownerId: owner });
    return reply(200, {
      owner,
      clients: list.clients.map(clientAnswer),
      limitReached: list.limitReached,
    });
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

  /** The "every app" exemption from the sign-in page, if set, and every repository exemption. */
  const listSignInPage = moderationEndpoint(async (ctx) =>
    reply(200, await ctx.runQuery(component.signInPage.list, {})),
  );

  /**
   * Sets or removes one exemption from the sign-in page. Answers `{ changed }`, or 409
   * `owner_changed` when the hub has recorded another owner of the repository.
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
              scope: "repository",
              repositoryId: change.target.repositoryId,
              expectedOwnerId: change.target.expectedOwnerId,
            },
      skip: change.skip,
      reason: change.reason,
      adminEmail: change.adminEmail,
    });
    return result.ok
      ? reply(200, { changed: result.changed })
      : reply(409, { error: result.error });
  });

  /** The hub's connectors, which a grant may name, and every grant. */
  const listConnectorGrants = moderationEndpoint(async (ctx) =>
    reply(200, {
      connectors,
      grants: await ctx.runQuery(component.connectorGrants.list, {}),
    }),
  );

  /**
   * Grants or revokes one connector of one repository. Answers `{ changed }`; 400
   * `unknown_connector` for a grant of a connector the hub does not have, and 409 `owner_changed`
   * when the hub has recorded another owner of the repository. A revoke can remove a row of a
   * connector the hub no longer has.
   */
  const changeConnectorGrant = moderationEndpoint(async (ctx, request) => {
    const change = readConnectorGrantChange(await request.json().catch(() => null));
    if (change === null) {
      return reply(400, { error: "invalid_request" });
    }
    if (change.grant && !connectors.includes(change.connector)) {
      return reply(400, { error: "unknown_connector" });
    }
    const result = await ctx.runMutation(component.connectorGrants.set, {
      repositoryId: change.repositoryId,
      connector: change.connector,
      expectedOwnerId: change.expectedOwnerId,
      grant: change.grant,
      reason: change.reason,
      adminEmail: change.adminEmail,
    });
    return result.ok
      ? reply(200, { changed: result.changed })
      : reply(409, { error: result.error });
  });

  return {
    addRoutes(http: HttpRouter): void {
      http.route({
        path: path("/moderation/connector-grants"),
        method: "GET",
        handler: listConnectorGrants,
      });
      http.route({
        path: path("/moderation/connector-grants"),
        method: "POST",
        handler: changeConnectorGrant,
      });
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
