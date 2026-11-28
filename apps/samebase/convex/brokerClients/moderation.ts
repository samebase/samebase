import {
  checkDocument,
  fetchDocument,
  parseClientId,
  refusalDescriptions,
} from "@samebase/identity-broker/cimd";
import { ModerationApi, ModerationKey } from "@samebase/identity-broker/moderation-api";
import { v } from "convex/values";
import { Effect } from "effect";
import { FetchHttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient, HttpApiMiddleware } from "effect/http-api";

import { env } from "../_generated/server";
import { action } from "../functions";

const { array, boolean, literal, number, object, string, union } = v;

/** A hung broker must not hold the admin page. */
const REQUEST_TIMEOUT_MS = 10_000;

const vBlockAction = union(literal("block"), literal("unblock"));

// The broker's answers as `ModerationApi` of @samebase/identity-broker/moderation-api declares them.
// The typed client decodes them; each action's return type checks them against these validators.

/** A site's metadata file as it is now: what it says about the site, or why the broker refuses it. */
const vSiteFile = union(
  object({
    status: literal("ok"),
    clientName: union(string(), v.null()),
    clientUri: union(string(), v.null()),
    logoUri: union(string(), v.null()),
    redirectUris: array(string()),
    /** The whole file, formatted. */
    json: string(),
  }),
  /** `json` is null when no JSON object was read. */
  object({ status: literal("refused"), reason: string(), json: union(string(), v.null()) }),
  /** The host answers 404 or 410: usually a deleted preview. */
  object({ status: literal("gone") }),
);

/** The sites of a broker's CIMD layer: each `clientId` is the address of a metadata file on `host`. */
const vSiteList = object({
  clients: array(
    object({
      clientId: string(),
      host: string(),
      createdAt: number(),
      lastSignInAt: union(number(), v.null()),
    }),
  ),
  limitReached: boolean(),
});

/** The files of the newest sites that one load of the page reads. */
const SITE_FILES_READ = 50;

/**
Reads one site's file now with the broker's own reader (`@samebase/identity-broker/cimd`): no
redirect, no private or special-use address, at most 5 KB, 5 seconds. A stranger writes the file, so
nothing of it is followed or loaded, only shown as text.
*/
const readSiteFile = (clientId: string) =>
  Effect.gen(function* () {
    const parsed = parseClientId(clientId);
    if (parsed._tag !== "ClientId") {
      return { status: "refused" as const, reason: refusalDescriptions[parsed.code], json: null };
    }
    // Convex's fetch takes the redirect mode only from its second argument, as the broker's does.
    const fetched = yield* fetchDocument(parsed, (request) =>
      fetch(request, { redirect: "manual" }),
    );
    if (
      fetched.code === "unexpected_status" &&
      (fetched.status === 404 || fetched.status === 410)
    ) {
      return { status: "gone" as const };
    }
    if (fetched._tag !== "Document") {
      return { status: "refused" as const, reason: refusalDescriptions[fetched.code], json: null };
    }
    const json = JSON.stringify(fetched.json, null, 2);
    const checked = checkDocument(parsed.id, fetched.json);
    if (checked._tag !== "Checked") {
      return { status: "refused" as const, reason: refusalDescriptions[checked.code], json };
    }
    return {
      json,
      status: "ok" as const,
      clientName: checked.selfAsserted.clientName ?? null,
      clientUri: checked.selfAsserted.clientUri ?? null,
      logoUri: checked.selfAsserted.logoUri ?? null,
      redirectUris: checked.redirectUris.map(({ uri }) => uri),
    };
  });

/** The blocked hosts of a broker's CIMD layer, newest first. */
const vHostBlockList = object({
  blocks: array(object({ host: string(), createdAt: number() })),
  limitReached: boolean(),
});

const vOff = object({ status: literal("off") });

type Moderation = { issuer: string; key: string };

const LOGIN_BROKER_ISSUER = "https://login.samebase.com";

/**
The moderation endpoints of login.samebase.com (samebase/public-identity-broker), whose only clients
are sites of its CIMD layer, or null while LOGIN_BROKER_MODERATION_KEY is unset. Only an admin uses
them: a site belongs to no organization.
*/
function readLoginModeration(): Moderation | null {
  const key = env.LOGIN_BROKER_MODERATION_KEY?.trim();
  return key ? { issuer: LOGIN_BROKER_ISSUER, key } : null;
}

type BrokerClient = HttpApiClient.ForApi<typeof ModerationApi>["moderation"];

/** The decoded answer of `request` through the typed client. A refusal or a bad answer throws. */
async function askBroker<A, E>(
  moderation: Moderation,
  request: (broker: BrokerClient) => Effect.Effect<A, E>,
): Promise<A> {
  return await Effect.runPromise(
    HttpApiClient.make(ModerationApi, { baseUrl: moderation.issuer }).pipe(
      Effect.flatMap((client) => request(client.moderation)),
      Effect.timeout(REQUEST_TIMEOUT_MS),
      Effect.provide(
        HttpApiMiddleware.layerClient(ModerationKey, ({ next, request }) =>
          next(HttpClientRequest.bearerToken(request, moderation.key)),
        ),
      ),
      Effect.provide(FetchHttpClient.layer),
    ),
  );
}

/** The newest sites that sign in at login.samebase.com, and its newest blocked hosts. */
export const readLoginBroker = action({
  access: "access_admin",
  args: {},
  returns: union(
    vOff,
    object({ status: literal("on"), siteList: vSiteList, hostBlockList: vHostBlockList }),
  ),
  handler: async () => {
    const moderation = readLoginModeration();
    if (moderation === null) {
      return { status: "off" as const };
    }

    const [clientList, hostBlockList] = await askBroker(moderation, (broker) =>
      Effect.all([broker.clients({ query: {} }), broker.hostBlocks()], {
        concurrency: "unbounded",
      }),
    );
    if (clientList.cimd === undefined) {
      throw new Error("login.samebase.com answered without its CIMD layer.");
    }
    return {
      status: "on" as const,
      siteList: {
        clients: [...clientList.cimd.clients],
        limitReached: clientList.cimd.limitReached,
      },
      hostBlockList: {
        blocks: [...hostBlockList.blocks],
        limitReached: hostBlockList.limitReached,
      },
    };
  },
});

/**
The files of the newest sites at login.samebase.com, read now. Apart from `readLoginBroker`, so a
slow file never holds the list or the host blocks. The sites come from the broker, never from the
caller, so no request can make samebase.com fetch an address of the caller's choice.
*/
export const readLoginSiteFiles = action({
  access: "access_admin",
  args: {},
  returns: union(
    vOff,
    object({
      status: literal("on"),
      files: array(object({ clientId: string(), file: vSiteFile })),
    }),
  ),
  handler: async () => {
    const moderation = readLoginModeration();
    if (moderation === null) {
      return { status: "off" as const };
    }

    const clientList = await askBroker(moderation, (broker) => broker.clients({ query: {} }));
    const sites = clientList.cimd?.clients.slice(0, SITE_FILES_READ) ?? [];
    const files = await Effect.runPromise(
      Effect.forEach(
        sites,
        ({ clientId }) => Effect.map(readSiteFile(clientId), (file) => ({ clientId, file })),
        { concurrency: 8 },
      ),
    );
    return { status: "on" as const, files };
  },
});

/**
Blocks or unblocks sign-in at login.samebase.com for every site on one host. The broker takes a DNS
name in lower case; the typed client refuses another one before it sends the request.
*/
export const changeLoginHostBlock = action({
  access: "access_admin",
  args: { action: vBlockAction, host: string() },
  returns: union(vOff, object({ status: literal("on"), changed: boolean() })),
  handler: async (_ctx, args) => {
    const moderation = readLoginModeration();
    if (moderation === null) {
      return { status: "off" as const };
    }

    const { changed } = await askBroker(moderation, (broker) =>
      broker.changeHostBlock({
        payload: { action: args.action, host: args.host.trim().toLowerCase() },
      }),
    );
    return { status: "on" as const, changed };
  },
});
