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

/**
 * The body of `POST /moderation/connector-grants`: grant (`grant: true`) or revoke one connector of
 * one app. It names the owner that the admin saw: the tenant's recorded owner to grant, the row's
 * owner to revoke.
 */
const vConnectorGrantChange = object({
  appId: string(),
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

/** The change, if its reason and admin are given and it names an app and a GitHub owner id. */
function readConnectorGrantChange(body: unknown) {
  if (!validate(vConnectorGrantChange, body)) {
    return null;
  }
  const reason = body.reason.trim();
  const adminEmail = body.adminEmail.trim();
  return body.appId !== "" &&
    /^[1-9][0-9]*$/.test(body.expectedOwnerId) &&
    reason !== "" &&
    reason.length <= MAX_REASON_LENGTH &&
    adminEmail !== "" &&
    adminEmail.length <= MAX_EMAIL_LENGTH
    ? {
        appId: body.appId,
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
   * `/authorize` applies (`pageShown`: `shown`, or skipped by the `every_app` or the `this_app`
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
          : ("this_app" as const),
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

  /** The hub's connectors, which a grant may name, and every grant. */
  const listConnectorGrants = moderationEndpoint(async (ctx) =>
    reply(200, {
      connectors,
      grants: await ctx.runQuery(component.connectorGrants.list, {}),
    }),
  );

  /**
   * Grants or revokes one connector of one app. Answers `{ changed }`; 400 `unknown_connector` for
   * a connector the hub does not have, 409 `owner_changed` when the owner is no longer the one the
   * admin saw, and 404 `unknown_app` for an app the hub does not have.
   */
  const changeConnectorGrant = moderationEndpoint(async (ctx, request) => {
    const change = readConnectorGrantChange(await request.json().catch(() => null));
    if (change === null) {
      return reply(400, { error: "invalid_request" });
    }
    if (!connectors.includes(change.connector)) {
      return reply(400, { error: "unknown_connector" });
    }
    const result = await ctx.runMutation(component.connectorGrants.set, {
      appId: change.appId,
      connector: change.connector,
      expectedOwnerId: change.expectedOwnerId,
      grant: change.grant,
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
