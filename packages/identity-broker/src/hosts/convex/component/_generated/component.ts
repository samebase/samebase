/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    authRequests: {
      abandon: FunctionReference<
        "mutation",
        "internal",
        { args: { requestId: string }; now: number },
        { redirectUri: string; state?: string } | null,
        Name
      >;
      claimUpstream: FunctionReference<
        "mutation",
        "internal",
        {
          args: {
            configured: Array<string>;
            connector: string;
            liveGates: Array<{ live: Array<string>; prefix: string }>;
            now: number;
            txnCookieHashes: Array<string>;
            upstreamStateHash: string;
          };
          now: number;
        },
        | {
            connector: string;
            createdAt: number;
            freshLogin: boolean;
            maxAge?: number;
            requestId: string;
            status: "claimed";
            upstreamCodeVerifier: string;
            upstreamNonce?: string;
          }
        | {
            back?: { redirectUri: string; state?: string };
            requestId: string;
            status: "expired";
          }
        | {
            back?: { redirectUri: string; state?: string };
            requestId: string;
            status: "refused";
          }
        | { status: "unbound" }
        | { status: "missing" },
        Name
      >;
      complete: FunctionReference<
        "mutation",
        "internal",
        {
          args: {
            authTime: number;
            codeExpiresAt: number;
            codeHash: string;
            configured: Array<string>;
            identity: {
              connector: string;
              email?: string;
              emailVerified?: boolean;
              name?: string;
              picture?: string;
              upstreamId: string;
            };
            liveGates: Array<{ live: Array<string>; prefix: string }>;
            now: number;
            requestId: string;
          };
          now: number;
        },
        | { back: { redirectUri: string; state?: string }; ok: true }
        | {
            back?: { redirectUri: string; state?: string };
            error: "expired" | "wrong_status" | "refused";
            ok: false;
          }
        | { error: "not_found"; ok: false },
        Name
      >;
      create: FunctionReference<
        "mutation",
        "internal",
        {
          args: {
            clientId: string;
            codeChallenge: string;
            configured: Array<string>;
            createdAt: number;
            expiresAt: number;
            freshLogin: boolean;
            liveGates: Array<{ live: Array<string>; prefix: string }>;
            maxAge?: number;
            nonce?: string;
            redirectUri: string;
            requestId: string;
            requested: Array<string>;
            scope: string;
            state?: string;
            txnCookieHash: string;
          };
          now: number;
        },
        | { confirm: boolean; connectors: Array<string>; ok: true }
        | {
            error:
              | "unknown_client"
              | "stopped"
              | "redirect_uri"
              | "off"
              | "rate_limited";
            ok: false;
          },
        Name
      >;
      exchangeCode: FunctionReference<
        "mutation",
        "internal",
        {
          args: {
            authentication:
              | { method: "none" }
              | {
                  method: "client_secret_post" | "client_secret_basic";
                  secretHash: string;
                };
            clientId: string;
            codeChallengeOfVerifier: string;
            codeHash: string;
            configured: Array<string>;
            liveGates: Array<{ live: Array<string>; prefix: string }>;
            now: number;
            redirectUri: string;
            resource?: string;
          };
          now: number;
        },
        | {
            authTime?: number;
            clientId: string;
            identity: {
              connector: string;
              email?: string;
              emailVerified?: boolean;
              name?: string;
              picture?: string;
              upstreamId: string;
            };
            nonce?: string;
            ok: true;
            ref: string;
            scope: string;
          }
        | {
            description: string;
            error: "invalid_client" | "invalid_grant" | "invalid_target";
            ok: false;
          },
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { args: { requestId: string }; now: number },
        {
          back?: { redirectUri: string; state?: string };
          clientId: string;
          connectors: Array<string>;
          freshLogin: boolean;
          maxAge?: number;
          requestId: string;
          status: "pending" | "upstream" | "claimed" | "completed";
          txnCookieHash: string;
        } | null,
        Name
      >;
      startUpstream: FunctionReference<
        "mutation",
        "internal",
        {
          args: {
            configured: Array<string>;
            connector: string;
            liveGates: Array<{ live: Array<string>; prefix: string }>;
            now: number;
            requestId: string;
            upstreamCodeVerifier: string;
            upstreamNonce?: string;
            upstreamStateHash: string;
          };
          now: number;
        },
        | { back: { redirectUri: string; state?: string }; ok: true }
        | {
            back?: { redirectUri: string; state?: string };
            error: "expired" | "wrong_status" | "refused";
            ok: false;
          }
        | { error: "not_found"; ok: false },
        Name
      >;
    };
    cimd: {
      begin: FunctionReference<
        "mutation",
        "internal",
        {
          args: {
            clientId: string;
            connectors: Array<string>;
            fetches: { capacity: number; periodMs: number; rate: number };
            redirectUri: string;
          };
          now: number;
        },
        | { next: "stopped" | "fresh" | "rate_limited" }
        | { fetchStartedAt: number; next: "fetch" },
        Name
      >;
      blockHost: FunctionReference<
        "mutation",
        "internal",
        { args: { host: string }; now: number },
        { changed: boolean },
        Name
      >;
      clients: FunctionReference<
        "query",
        "internal",
        { args: {}; now: number },
        {
          clients: Array<{
            clientId: string;
            createdAt: number;
            host: string;
            lastSignInAt: number | null;
          }>;
          limitReached: boolean;
        },
        Name
      >;
      hostBlocks: FunctionReference<
        "query",
        "internal",
        { args: {}; now: number },
        {
          blocks: Array<{ createdAt: number; host: string }>;
          limitReached: boolean;
        },
        Name
      >;
      put: FunctionReference<
        "mutation",
        "internal",
        {
          args: {
            clientId: string;
            clientsPerHost: number;
            connectors: Array<string>;
            fetchStartedAt: number;
            freshUntil: number;
            newClients: { capacity: number; periodMs: number; rate: number };
            redirectUri: string;
            redirectUris: Array<string>;
          };
          now: number;
        },
        | "inserted"
        | "replaced"
        | "older"
        | "stopped"
        | "rate_limited"
        | "not_listed",
        Name
      >;
      remove: FunctionReference<
        "mutation",
        "internal",
        { args: { clientId: string; fetchStartedAt: number }; now: number },
        { removed: boolean },
        Name
      >;
      unblockHost: FunctionReference<
        "mutation",
        "internal",
        { args: { host: string }; now: number },
        { changed: boolean },
        Name
      >;
    };
    clients: {
      get: FunctionReference<
        "query",
        "internal",
        { args: { clientId: string }; now: number },
        {
          clientId: string;
          confirm: boolean;
          connectors: Array<string>;
          redirectUris: Array<string>;
          ref: string;
        } | null,
        Name
      >;
    };
    connections: {
      abandon: FunctionReference<
        "mutation",
        "internal",
        { args: { requestId: string }; now: number },
        { redirectUri: string; state?: string } | null,
        Name
      >;
      admitRefresh: FunctionReference<
        "mutation",
        "internal",
        {
          args: {
            clientId: string;
            clientSecretHash: string;
            liveGates: Array<{ live: Array<string>; prefix: string }>;
            now: number;
            providers: Array<{ name: string; resource: string }>;
            resource: string;
            tokenEndpointAuthMethod:
              "client_secret_post" | "client_secret_basic";
          };
          now: number;
        },
        | { ok: true; ref: string }
        | {
            description: string;
            error: "invalid_client" | "invalid_target";
            ok: false;
            refused: {
              clientId: string;
              reason: "card" | "stopped" | "connections" | "rate_limited";
              ref: string | null;
              resource: string;
            } | null;
          },
        Name
      >;
      authenticate: FunctionReference<
        "query",
        "internal",
        {
          args: {
            clientId: string;
            clientSecretHash: string;
            tokenEndpointAuthMethod:
              "client_secret_post" | "client_secret_basic";
          };
          now: number;
        },
        string | null,
        Name
      >;
      claim: FunctionReference<
        "mutation",
        "internal",
        {
          args: {
            liveGates: Array<{ live: Array<string>; prefix: string }>;
            now: number;
            providers: Array<{ name: string; resource: string }>;
            resource: string;
            txnCookieHashes: Array<string>;
            upstreamStateHash: string;
          };
          now: number;
        },
        | { requestId: string; status: "claimed"; upstreamCodeVerifier: string }
        | {
            back?: { redirectUri: string; state?: string };
            requestId: string;
            status: "expired";
          }
        | {
            back?: { redirectUri: string; state?: string };
            refused: {
              clientId: string;
              reason: "card" | "stopped" | "connections" | "rate_limited";
              ref: string | null;
              resource: string;
            };
            requestId: string;
            status: "refused";
          }
        | { status: "unbound" }
        | { status: "missing" },
        Name
      >;
      cleanup: FunctionReference<
        "mutation",
        "internal",
        { args: { now: number }; now: number },
        { connectionCodes: number; connectionRequests: number; more: boolean },
        Name
      >;
      complete: FunctionReference<
        "mutation",
        "internal",
        {
          args: {
            codeExpiresAt: number;
            codeHash: string;
            liveGates: Array<{ live: Array<string>; prefix: string }>;
            now: number;
            providers: Array<{ name: string; resource: string }>;
            requestId: string;
            tokens: {
              accessToken: string;
              expiresAt?: number;
              refreshToken?: string;
              scope: string;
            };
          };
          now: number;
        },
        | { back: { redirectUri: string; state?: string }; ok: true }
        | {
            back?: { redirectUri: string; state?: string };
            error: "gone";
            ok: false;
          }
        | {
            back?: { redirectUri: string; state?: string };
            error: "refused";
            ok: false;
            refused: {
              clientId: string;
              reason: "card" | "stopped" | "connections" | "rate_limited";
              ref: string | null;
              resource: string;
            };
          },
        Name
      >;
      create: FunctionReference<
        "mutation",
        "internal",
        {
          args: {
            clientId: string;
            codeChallenge: string;
            expiresAt: number;
            liveGates: Array<{ live: Array<string>; prefix: string }>;
            now: number;
            providers: Array<{ name: string; resource: string }>;
            redirectUri: string;
            requestId: string;
            resource: string;
            state?: string;
            txnCookieHash: string;
            upstreamCodeVerifier: string;
            upstreamStateHash: string;
          };
          now: number;
        },
        | { ok: true }
        | {
            error:
              | "unknown_client"
              | "redirect_uri"
              | "stopped"
              | "refused"
              | "rate_limited";
            ok: false;
            refused: {
              clientId: string;
              reason: "card" | "stopped" | "connections" | "rate_limited";
              ref: string | null;
              resource: string;
            } | null;
          },
        Name
      >;
      exchangeCode: FunctionReference<
        "mutation",
        "internal",
        {
          args: {
            clientId: string;
            clientSecretHash: string;
            codeChallengeOfVerifier: string;
            codeHash: string;
            liveGates: Array<{ live: Array<string>; prefix: string }>;
            now: number;
            providers: Array<{ name: string; resource: string }>;
            redirectUri: string;
            resource?: string;
            tokenEndpointAuthMethod:
              "client_secret_post" | "client_secret_basic";
          };
          now: number;
        },
        | { error: "not_found"; ok: false }
        | {
            description: string;
            error: "invalid_client" | "invalid_grant" | "invalid_target";
            ok: false;
            refused: {
              clientId: string;
              reason: "card" | "stopped" | "connections" | "rate_limited";
              ref: string | null;
              resource: string;
            } | null;
          }
        | {
            ok: true;
            ref: string;
            resource: string;
            tokens: {
              accessToken: string;
              expiresAt?: number;
              refreshToken?: string;
              scope: string;
            };
          },
        Name
      >;
    };
    github: {
      admit: FunctionReference<
        "mutation",
        "internal",
        {
          args: {
            allowList:
              "any" | Array<{ ownerId: string; repositoryId?: string }>;
            configured: Array<string>;
            connectors?: Array<string>;
            githubOwnerId: string;
            githubRepositoryDatabaseId: string;
          };
          now: number;
        },
        | { enrollment: Array<string>; ok: true }
        | { ok: false; reason: "blocked" }
        | {
            ok: false;
            reason: "rate_limited";
            window: "repository" | "owner" | "new_owners";
          }
        | { allowed: Array<string>; ok: false; reason: "invalid_connectors" },
        Name
      >;
      blocks: FunctionReference<
        "query",
        "internal",
        { args: {}; now: number },
        {
          blocks: Array<{
            adminEmail: string;
            createdAt: number;
            githubId: string;
            kind: "repository" | "owner";
            reason: string;
          }>;
          events: Array<{
            action: "block" | "unblock";
            adminEmail: string;
            createdAt: number;
            githubId: string;
            kind: "repository" | "owner";
            reason: string;
          }>;
        },
        Name
      >;
      changeBlock: FunctionReference<
        "mutation",
        "internal",
        {
          args: {
            action: "block" | "unblock";
            adminEmail: string;
            githubId: string;
            kind: "repository" | "owner";
            reason: string;
          };
          now: number;
        },
        { changed: boolean },
        Name
      >;
      changeConnectorGrant: FunctionReference<
        "mutation",
        "internal",
        {
          args: {
            allowList:
              "any" | Array<{ ownerId: string; repositoryId?: string }>;
            configured: Array<string>;
            connector: string;
            expectedOwnerId: string;
            grant: boolean;
            reason: string;
            repositoryId: string;
          };
          now: number;
        },
        { changed: boolean; ok: true } | { error: "owner_changed"; ok: false },
        Name
      >;
      changeSignInPage: FunctionReference<
        "mutation",
        "internal",
        {
          args: {
            allowList:
              "any" | Array<{ ownerId: string; repositoryId?: string }>;
            configured: Array<string>;
            reason: string;
            skip: boolean;
            target:
              | { scope: "every_app" }
              | {
                  expectedOwnerId: string;
                  repositoryId: string;
                  scope: "repository";
                };
          };
          now: number;
        },
        { changed: boolean; ok: true } | { error: "owner_changed"; ok: false },
        Name
      >;
      clients: FunctionReference<
        "query",
        "internal",
        {
          args: {
            allowList:
              "any" | Array<{ ownerId: string; repositoryId?: string }>;
            configured: Array<string>;
            owner?: string;
          };
          now: number;
        },
        {
          cimd?: {
            clients: Array<{
              clientId: string;
              createdAt: number;
              host: string;
              lastSignInAt: number | null;
            }>;
            limitReached: boolean;
          };
          clients: Array<{
            appId: string;
            clientId: string;
            clientName: string;
            connectors: Array<string>;
            createdAt: number;
            deploymentType: "production" | "development" | "preview";
            grantedConnectors: Array<string> | null;
            lastSignInAt: number | null;
            ownerId: string | null;
            policyConnectors: Array<string> | null;
            redirectUris: Array<string>;
            registeredBy:
              | {
                  app: string;
                  githubActorLogin: string;
                  githubOwnerId: string;
                  githubRepository: string;
                  githubRepositoryDatabaseId: string;
                  kind: "github";
                }
              | {
                  app: string;
                  githubOwnerId: string;
                  githubRepository: string;
                  githubRepositoryDatabaseId: string;
                  issuedAt: number;
                  kind: "initial_access_token";
                };
            removeAt: number | null;
            renewedAt: number;
            signInPage: "shown" | "every_app" | "repository" | null;
            usableConnectors: Array<string> | null;
          }>;
          limitReached: boolean;
          owner?: string;
        },
        Name
      >;
      connectorGrants: FunctionReference<
        "query",
        "internal",
        { args: { configured: Array<string> }; now: number },
        {
          connectors: Array<string>;
          grants: Array<{
            active: boolean;
            connector: string;
            ownerId: string;
            reason: string;
            repositoryId: string;
          }>;
        },
        Name
      >;
      counts: FunctionReference<
        "query",
        "internal",
        { args: {}; now: number },
        {
          day: { atLeast: boolean; count: number };
          week: { atLeast: boolean; count: number };
        },
        Name
      >;
      createClient: FunctionReference<
        "mutation",
        "internal",
        {
          args: {
            allowList:
              "any" | Array<{ ownerId: string; repositoryId?: string }>;
            app: string;
            appId: string;
            clientId: string;
            commitSha: string;
            configured: Array<string>;
            connectors: Array<string>;
            deployment:
              | { initialAccessTokenHash: string; type: "production" }
              | { stage: string; type: "preview" };
            githubActorId: string;
            githubActorLogin: string;
            githubOwnerId: string;
            githubRepository: string;
            githubRepositoryDatabaseId: string;
            proofIssuedAt: number;
            redirectUris: Array<string>;
            registrationTokenHash: string;
            secretHash: string;
            softwareVersion: string;
            tokenEndpointAuthMethod:
              "client_secret_post" | "client_secret_basic";
          };
          now: number;
        },
        | { clientName: string; createdAt: number; ok: true; tenantId: string }
        | {
            ok: false;
            reason:
              | "blocked"
              | "too_many_apps"
              | "too_many_clients"
              | "app_taken"
              | "stale_proof"
              | "new_owners";
          }
        | { allowed: Array<string>; ok: false; reason: "invalid_connectors" },
        Name
      >;
      createDevelopmentClient: FunctionReference<
        "mutation",
        "internal",
        {
          args: {
            allowList:
              "any" | Array<{ ownerId: string; repositoryId?: string }>;
            app: string;
            appId: string;
            clientId: string;
            configured: Array<string>;
            connectors: Array<string>;
            githubOwnerId: string;
            githubRepository: string;
            githubRepositoryDatabaseId: string;
            redirectUris: Array<string>;
            registrationTokenHash: string;
            secretHash: string;
            softwareVersion: string;
            tokenEndpointAuthMethod:
              "client_secret_post" | "client_secret_basic";
            tokenHash: string;
          };
          now: number;
        },
        | { clientName: string; createdAt: number; ok: true; tenantId: string }
        | {
            ok: false;
            reason:
              | "blocked"
              | "too_many_apps"
              | "too_many_clients"
              | "app_taken"
              | "invalid_token";
          }
        | { allowed: Array<string>; ok: false; reason: "invalid_connectors" },
        Name
      >;
      deleteClient: FunctionReference<
        "mutation",
        "internal",
        { args: { clientId: string; owner?: string }; now: number },
        { changed: boolean },
        Name
      >;
      readInitialAccessToken: FunctionReference<
        "query",
        "internal",
        { args: { tokenHash: string }; now: number },
        {
          app: string;
          githubOwnerId: string;
          githubRepository: string;
          githubRepositoryDatabaseId: string;
        } | null,
        Name
      >;
      remove: FunctionReference<
        "mutation",
        "internal",
        {
          args: { clientId: string; registrationTokenHash: string };
          now: number;
        },
        { ok: true } | { error: "invalid_token" | "production"; ok: false },
        Name
      >;
      renew: FunctionReference<
        "mutation",
        "internal",
        {
          args: {
            allowList:
              "any" | Array<{ ownerId: string; repositoryId?: string }>;
            clientId: string;
            configured: Array<string>;
            registrationTokenHash: string;
          };
          now: number;
        },
        | {
            app: string;
            clientName: string;
            connectors: Array<string>;
            createdAt: number;
            ok: true;
            redirectUris: Array<string>;
            softwareVersion: string;
            tenantId: string;
            tokenEndpointAuthMethod:
              "client_secret_post" | "client_secret_basic";
          }
        | { error: "invalid_token" | "suspended"; ok: false },
        Name
      >;
      signInPage: FunctionReference<
        "query",
        "internal",
        { args: {}; now: number },
        {
          everyApp: { reason: string } | null;
          repositories: Array<{
            active: boolean;
            ownerId: string;
            reason: string;
            repositoryId: string;
          }>;
        },
        Name
      >;
    };
    lifecycle: {
      cleanup: FunctionReference<
        "mutation",
        "internal",
        { args: { now: number }; now: number },
        {
          authRequests: number;
          authorizationCodes: number;
          clients: number;
          more: boolean;
          signIns: number;
        },
        Name
      >;
    };
    stack: {
      createClient: FunctionReference<
        "mutation",
        "internal",
        {
          args: {
            client: {
              enrollment: Array<string>;
              key: string;
              name: string;
              registrationTokenHash: string;
              softwareId: string;
              softwareVersion: string;
            };
            clientId: string;
            configured: Array<string>;
            connections: Array<string>;
            permanent: boolean;
            redirectUris: Array<string>;
            secretHash: string;
            tokenEndpointAuthMethod:
              "client_secret_post" | "client_secret_basic";
          };
          now: number;
        },
        { createdAt: number },
        Name
      >;
      remove: FunctionReference<
        "mutation",
        "internal",
        {
          args: { clientId: string; registrationTokenHash: string };
          now: number;
        },
        { ok: true } | { error: "invalid_token" | "permanent"; ok: false },
        Name
      >;
      renew: FunctionReference<
        "mutation",
        "internal",
        {
          args: {
            clientId: string;
            configured: Array<string>;
            keys: Array<{ connections: Array<string>; name: string }>;
            registrationTokenHash: string;
          };
          now: number;
        },
        | {
            client: {
              enrollment: Array<string>;
              key: string;
              name: string;
              registrationTokenHash: string;
              softwareId: string;
              softwareVersion: string;
            };
            createdAt: number;
            ok: true;
            redirectUris: Array<string>;
            tokenEndpointAuthMethod:
              "client_secret_post" | "client_secret_basic";
          }
        | { error: "invalid_token" | "suspended" | "withdrawn"; ok: false },
        Name
      >;
    };
  };
