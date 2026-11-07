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
    apps: {
      get: FunctionReference<
        "query",
        "internal",
        { appId: string },
        {
          appId: string;
          createdAt: number;
          name: string;
          suspended: boolean;
          tenantId: string;
        } | null,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        {},
        Array<{
          appId: string;
          createdAt: number;
          name: string;
          suspended: boolean;
          tenantId: string;
        }>,
        Name
      >;
      remove: FunctionReference<
        "mutation",
        "internal",
        { appId: string },
        null,
        Name
      >;
    };
    authRequests: {
      abandon: FunctionReference<
        "mutation",
        "internal",
        { requestId: string },
        { redirectUri: string; state?: string } | null,
        Name
      >;
      claimUpstream: FunctionReference<
        "mutation",
        "internal",
        {
          connector: string;
          now: number;
          policy: {
            connectors: Array<string>;
            ownerId?: string;
            paused: boolean;
            resources: Array<string>;
          };
          txnCookieHashes: Array<string>;
          upstreamStateHash: string;
        },
        | {
            connector: string;
            createdAt: number;
            freshLogin: boolean;
            redirectUri: string;
            requestId: string;
            state?: string;
            status: "claimed";
            upstreamCodeVerifier: string;
            upstreamNonce?: string;
          }
        | {
            redirectUri: string;
            requestId: string;
            state?: string;
            status: "expired";
          }
        | {
            redirectUri: string;
            requestId: string;
            state?: string;
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
          authTime: number;
          codeExpiresAt: number;
          codeHash: string;
          identity: {
            connector: string;
            email?: string;
            emailVerified?: boolean;
            name?: string;
            picture?: string;
            upstreamId: string;
          };
          now: number;
          policy: {
            connectors: Array<string>;
            ownerId?: string;
            paused: boolean;
            resources: Array<string>;
          };
          requestId: string;
        },
        | { ok: true; redirectUri: string; state?: string }
        | {
            error: "expired" | "wrong_status" | "refused";
            ok: false;
            redirectUri: string;
            state?: string;
          }
        | { error: "not_found"; ok: false },
        Name
      >;
      create: FunctionReference<
        "mutation",
        "internal",
        {
          appId: string;
          clientId: string;
          codeChallenge: string;
          connectors: Array<string>;
          createdAt: number;
          expiresAt: number;
          freshLogin: boolean;
          nonce?: string;
          redirectUri: string;
          requestId: string;
          scope: string;
          state?: string;
          tenantId: string;
          txnCookieHash: string;
        },
        { ok: true } | { error: "rate_limited" | "suspended"; ok: false },
        Name
      >;
      exchangeCode: FunctionReference<
        "mutation",
        "internal",
        {
          clientId: string;
          clientSecretHash: string;
          codeHash: string;
          codeVerifier: string;
          now: number;
          policy: {
            connectors: Array<string>;
            ownerId?: string;
            paused: boolean;
            resources: Array<string>;
          };
          redirectUri?: string;
          refreshTokenHash: string;
          resource?: string;
          tokenEndpointAuthMethod: "client_secret_post" | "client_secret_basic";
        },
        | {
            accessToken: string;
            expiresAt?: number;
            kind: "resource";
            ok: true;
            refresh: boolean;
            scope: string;
          }
        | {
            appId: string;
            authTime: number;
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
        { requestId: string },
        | {
            appId: string;
            clientId: string;
            codeChallenge: string;
            connectors: Array<string>;
            createdAt: number;
            expiresAt: number;
            freshLogin: boolean;
            nonce?: string;
            redirectUri: string;
            requestId: string;
            scope: string;
            state?: string;
            status: "pending";
            txnCookieHash: string;
          }
        | {
            appId: string;
            clientId: string;
            codeChallenge: string;
            connector: string;
            connectors: Array<string>;
            createdAt: number;
            expiresAt: number;
            freshLogin: boolean;
            nonce?: string;
            redirectUri: string;
            requestId: string;
            scope: string;
            state?: string;
            status: "upstream";
            txnCookieHash: string;
            upstreamCodeVerifier: string;
            upstreamNonce?: string;
            upstreamStateHash: string;
          }
        | {
            appId: string;
            clientId: string;
            codeChallenge: string;
            connector: string;
            connectors: Array<string>;
            createdAt: number;
            expiresAt: number;
            freshLogin: boolean;
            nonce?: string;
            redirectUri: string;
            requestId: string;
            scope: string;
            state?: string;
            status: "claimed";
            txnCookieHash: string;
          }
        | {
            appId: string;
            authTime: number;
            clientId: string;
            codeChallenge: string;
            connectors: Array<string>;
            createdAt: number;
            expiresAt: number;
            freshLogin: boolean;
            identity: {
              connector: string;
              email?: string;
              emailVerified?: boolean;
              name?: string;
              picture?: string;
              upstreamId: string;
            };
            nonce?: string;
            redirectUri: string;
            requestId: string;
            scope: string;
            state?: string;
            status: "completed";
            txnCookieHash: string;
          }
        | null,
        Name
      >;
      startUpstream: FunctionReference<
        "mutation",
        "internal",
        {
          connector: string;
          now: number;
          policy: {
            connectors: Array<string>;
            ownerId?: string;
            paused: boolean;
            resources: Array<string>;
          };
          requestId: string;
          upstreamCodeVerifier: string;
          upstreamNonce?: string;
          upstreamStateHash: string;
        },
        | { ok: true; redirectUri: string; state?: string }
        | {
            error: "expired" | "wrong_status" | "refused";
            ok: false;
            redirectUri: string;
            state?: string;
          }
        | { error: "not_found"; ok: false },
        Name
      >;
      upstreamClient: FunctionReference<
        "query",
        "internal",
        { upstreamStateHash: string },
        {
          client: {
            app: {
              appId: string;
              createdAt: number;
              name: string;
              suspended: boolean;
              tenantId: string;
            } | null;
            client: {
              app: string;
              appId: string;
              clientId: string;
              clientName: string;
              connectors: Array<string>;
              createdAt: number;
              deploymentType: "production" | "development" | "preview";
              lastSignInAt?: number;
              redirectUri: string;
              registeredBy:
                | {
                    commitSha: string;
                    githubActorId: string;
                    githubActorLogin: string;
                    githubOwnerId: string;
                    githubRepository: string;
                    kind: "github";
                  }
                | {
                    githubOwnerId: string;
                    githubRepository: string;
                    issuedAt: number;
                    kind: "initial_access_token";
                  };
              registrationTokenHash: string;
              removeAt?: number;
              renewedAt: number;
              secretHash: string;
              softwareVersion: string;
              tokenEndpointAuthMethod:
                "client_secret_post" | "client_secret_basic";
            };
            registration: {
              app: string;
              deploymentType: "production" | "development" | "preview";
              ownerId: string;
              proof: "github-actions" | "initial-access-token";
              redirectUri: string;
              repository: string;
              repositoryId: string;
            } | null;
          } | null;
          request: {
            redirectUri: string;
            requestId: string;
            state?: string;
            txnCookieHash: string;
          };
        } | null,
        Name
      >;
    };
    clients: {
      get: FunctionReference<
        "query",
        "internal",
        { clientId: string },
        {
          app: string;
          appId: string;
          clientId: string;
          clientName: string;
          connectors: Array<string>;
          createdAt: number;
          deploymentType: "production" | "development" | "preview";
          lastSignInAt?: number;
          redirectUri: string;
          registeredBy:
            | {
                commitSha: string;
                githubActorId: string;
                githubActorLogin: string;
                githubOwnerId: string;
                githubRepository: string;
                kind: "github";
              }
            | {
                githubOwnerId: string;
                githubRepository: string;
                issuedAt: number;
                kind: "initial_access_token";
              };
          registrationTokenHash: string;
          removeAt?: number;
          renewedAt: number;
          secretHash: string;
          softwareVersion: string;
          tokenEndpointAuthMethod: "client_secret_post" | "client_secret_basic";
        } | null,
        Name
      >;
      listByApp: FunctionReference<
        "query",
        "internal",
        { appId: string },
        Array<{
          app: string;
          appId: string;
          clientId: string;
          clientName: string;
          connectors: Array<string>;
          createdAt: number;
          deploymentType: "production" | "development" | "preview";
          lastSignInAt?: number;
          redirectUri: string;
          registeredBy:
            | {
                commitSha: string;
                githubActorId: string;
                githubActorLogin: string;
                githubOwnerId: string;
                githubRepository: string;
                kind: "github";
              }
            | {
                githubOwnerId: string;
                githubRepository: string;
                issuedAt: number;
                kind: "initial_access_token";
              };
          registrationTokenHash: string;
          removeAt?: number;
          renewedAt: number;
          secretHash: string;
          softwareVersion: string;
          tokenEndpointAuthMethod: "client_secret_post" | "client_secret_basic";
        }>,
        Name
      >;
      remove: FunctionReference<
        "mutation",
        "internal",
        { clientId: string },
        { changed: boolean },
        Name
      >;
      withApp: FunctionReference<
        "query",
        "internal",
        { clientId: string },
        {
          app: {
            appId: string;
            createdAt: number;
            name: string;
            suspended: boolean;
            tenantId: string;
          } | null;
          client: {
            app: string;
            appId: string;
            clientId: string;
            clientName: string;
            connectors: Array<string>;
            createdAt: number;
            deploymentType: "production" | "development" | "preview";
            lastSignInAt?: number;
            redirectUri: string;
            registeredBy:
              | {
                  commitSha: string;
                  githubActorId: string;
                  githubActorLogin: string;
                  githubOwnerId: string;
                  githubRepository: string;
                  kind: "github";
                }
              | {
                  githubOwnerId: string;
                  githubRepository: string;
                  issuedAt: number;
                  kind: "initial_access_token";
                };
            registrationTokenHash: string;
            removeAt?: number;
            renewedAt: number;
            secretHash: string;
            softwareVersion: string;
            tokenEndpointAuthMethod:
              "client_secret_post" | "client_secret_basic";
          };
          registration: {
            app: string;
            deploymentType: "production" | "development" | "preview";
            ownerId: string;
            proof: "github-actions" | "initial-access-token";
            redirectUri: string;
            repository: string;
            repositoryId: string;
          } | null;
        } | null,
        Name
      >;
    };
    hubClients: {
      admit: FunctionReference<
        "mutation",
        "internal",
        { githubOwnerId: string; githubRepositoryDatabaseId: string },
        | { status: "admitted" }
        | { status: "blocked" }
        | {
            status: "rate_limited";
            window: "repository" | "owner" | "new_owners";
          },
        Name
      >;
      createClient: FunctionReference<
        "mutation",
        "internal",
        {
          app: string;
          clientId: string;
          commitSha: string;
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
          redirectUri: string;
          registrationTokenHash: string;
          secretHash: string;
          softwareVersion: string;
        },
        | { ok: true }
        | {
            ok: false;
            reason:
              | "blocked"
              | "suspended"
              | "too_many_apps"
              | "too_many_clients"
              | "app_taken"
              | "stale_proof"
              | "new_owners";
          },
        Name
      >;
      createDevelopmentClient: FunctionReference<
        "mutation",
        "internal",
        {
          app: string;
          clientId: string;
          connectors: Array<string>;
          githubOwnerId: string;
          githubRepository: string;
          githubRepositoryDatabaseId: string;
          redirectUri: string;
          registrationTokenHash: string;
          secretHash: string;
          softwareVersion: string;
          tokenHash: string;
        },
        | { ok: true }
        | {
            ok: false;
            reason:
              | "blocked"
              | "suspended"
              | "too_many_apps"
              | "too_many_clients"
              | "app_taken"
              | "invalid_token";
          },
        Name
      >;
      readInitialAccessToken: FunctionReference<
        "query",
        "internal",
        { tokenHash: string },
        {
          app: string;
          githubOwnerId: string;
          githubRepository: string;
          githubRepositoryDatabaseId: string;
        } | null,
        Name
      >;
    };
    lifecycle: {
      cleanup: FunctionReference<
        "mutation",
        "internal",
        {
          now: number;
          previewClientMaxAgeMs?: number;
          signInRetentionMs: number;
        },
        {
          authRequests: number;
          authorizationCodes: number;
          expiredClients: number;
          previewClients: number;
          refreshGrants: number;
          resourceRequests: number;
          signIns: number;
        },
        Name
      >;
    };
    moderation: {
      blockList: FunctionReference<
        "query",
        "internal",
        {},
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
      clientList: FunctionReference<
        "query",
        "internal",
        {},
        {
          clients: Array<{
            appId: string;
            clientId: string;
            clientName: string;
            connectors: Array<string>;
            createdAt: number;
            deploymentType: "production" | "development" | "preview";
            lastSignInAt: number | null;
            redirectUri: string;
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
          }>;
          limitReached: boolean;
        },
        Name
      >;
      counts: FunctionReference<
        "query",
        "internal",
        { now: number },
        {
          day: { atLeast: boolean; count: number };
          week: { atLeast: boolean; count: number };
        },
        Name
      >;
      repositoryClients: FunctionReference<
        "query",
        "internal",
        { githubRepositoryDatabaseIds: Array<string> },
        Array<{
          appId: string;
          clientId: string;
          clientName: string;
          connectors: Array<string>;
          createdAt: number;
          deploymentType: "production" | "development" | "preview";
          lastSignInAt: number | null;
          redirectUri: string;
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
        }>,
        Name
      >;
      setBlock: FunctionReference<
        "mutation",
        "internal",
        {
          action: "block" | "unblock";
          adminEmail: string;
          githubId: string;
          kind: "repository" | "owner";
          reason: string;
        },
        { changed: boolean },
        Name
      >;
    };
    registration: {
      register: FunctionReference<
        "mutation",
        "internal",
        {
          app: string;
          appId: string;
          clientId: string;
          clientName: string;
          connectors: Array<string>;
          deploymentType: "production" | "preview" | "development";
          now: number;
          ownerId?: string;
          redirectUri: string;
          registeredBy:
            | {
                commitSha: string;
                githubActorId: string;
                githubActorLogin: string;
                githubOwnerId: string;
                githubRepository: string;
                kind: "github";
              }
            | {
                githubOwnerId: string;
                githubRepository: string;
                issuedAt: number;
                kind: "initial_access_token";
              };
          registrationTokenHash: string;
          secretHash: string;
          softwareVersion: string;
          tenantId: string;
          tokenEndpointAuthMethod: "client_secret_post" | "client_secret_basic";
        },
        | { ok: true }
        | {
            error:
              "suspended" | "too_many_apps" | "too_many_clients" | "app_taken";
            ok: false;
          },
        Name
      >;
      remove: FunctionReference<
        "mutation",
        "internal",
        { clientId: string; registrationTokenHash: string },
        { ok: true } | { error: "invalid_token" | "production"; ok: false },
        Name
      >;
      renew: FunctionReference<
        "mutation",
        "internal",
        { clientId: string; now: number; registrationTokenHash: string },
        | {
            appId: string;
            clientName: string;
            connectors: Array<string>;
            createdAt: number;
            ok: true;
            redirectUri: string;
            softwareVersion: string;
            tokenEndpointAuthMethod:
              "client_secret_post" | "client_secret_basic";
          }
        | { error: "invalid_token" | "suspended"; ok: false },
        Name
      >;
    };
    resourceRequests: {
      abandon: FunctionReference<
        "mutation",
        "internal",
        { requestId: string },
        null,
        Name
      >;
      claim: FunctionReference<
        "mutation",
        "internal",
        {
          cookieHashes: Array<string>;
          now: number;
          resource: string;
          stateHash: string;
        },
        | {
            clientId: string;
            codeChallenge: string;
            expiresAt: number;
            redirectUri: string;
            requestId: string;
            resource: string;
            state?: string;
            status: "claimed";
            txnCookieHash: string;
            upstreamCodeVerifier: string;
          }
        | {
            redirectUri: string;
            requestId: string;
            state?: string;
            status: "expired";
          }
        | { status: "missing" }
        | { status: "unbound" },
        Name
      >;
      claimRefresh: FunctionReference<
        "mutation",
        "internal",
        {
          clientId: string;
          clientSecretHash: string;
          now: number;
          policy: {
            connectors: Array<string>;
            ownerId?: string;
            paused: boolean;
            resources: Array<string>;
          };
          resource?: string;
          tokenEndpointAuthMethod: "client_secret_post" | "client_secret_basic";
          tokenHash: string;
        },
        | {
            description: string;
            error: "invalid_client" | "invalid_grant" | "invalid_target";
            ok: false;
          }
        | { description: string; error: "temporarily_unavailable"; ok: false }
        | {
            attempt: number;
            grantId: string;
            ok: true;
            resource: string;
            upstreamRefreshToken: string;
          },
        Name
      >;
      complete: FunctionReference<
        "mutation",
        "internal",
        {
          codeExpiresAt: number;
          codeHash: string;
          now: number;
          policy: {
            connectors: Array<string>;
            ownerId?: string;
            paused: boolean;
            resources: Array<string>;
          };
          requestId: string;
          tokens: {
            accessToken: string;
            expiresAt?: number;
            refreshToken?: string;
            scope: string;
          };
        },
        "completed" | "refused" | "gone",
        Name
      >;
      create: FunctionReference<
        "mutation",
        "internal",
        {
          clientId: string;
          codeChallenge: string;
          expiresAt: number;
          policy: {
            connectors: Array<string>;
            ownerId?: string;
            paused: boolean;
            resources: Array<string>;
          };
          redirectUri: string;
          requestId: string;
          resource: string;
          state?: string;
          txnCookieHash: string;
          upstreamCodeVerifier: string;
          upstreamStateHash: string;
        },
        boolean,
        Name
      >;
      failRefresh: FunctionReference<
        "mutation",
        "internal",
        { attempt: number; grantId: string; rejected: boolean },
        null,
        Name
      >;
      finishRefresh: FunctionReference<
        "mutation",
        "internal",
        {
          attempt: number;
          grantId: string;
          now: number;
          policy: {
            connectors: Array<string>;
            ownerId?: string;
            paused: boolean;
            resources: Array<string>;
          } | null;
          tokens: {
            accessToken: string;
            expiresAt?: number;
            refreshToken?: string;
            scope: string;
          };
        },
        "released" | "refused" | "stale" | "gone",
        Name
      >;
      revoke: FunctionReference<
        "mutation",
        "internal",
        {
          clientId: string;
          clientSecretHash: string;
          tokenEndpointAuthMethod: "client_secret_post" | "client_secret_basic";
          tokenHash: string;
        },
        boolean,
        Name
      >;
    };
    signIns: {
      record: FunctionReference<
        "mutation",
        "internal",
        {
          appId: string;
          at: number;
          clientId: string;
          connector: string;
          sub: string;
        },
        null,
        Name
      >;
    };
  };
