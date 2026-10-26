import { RequestError } from "@octokit/request-error";
import { Octokit } from "@octokit/rest";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { internal } from "./_generated/api";
import { attachGitHubBackoff } from "./githubBackoffClient";
import { makeConvexTest } from "./test.setup";

afterEach(() => vi.useRealTimers());

// Header and error contracts:
// https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
// https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api
describe("shared GitHub rate-limit backoff", () => {
  it("shares primary cooldowns across clients while separating principals and resource buckets", async () => {
    const t = makeConvexTest();
    await t.action(async (ctx) => {
      const principal = { kind: "installation", id: "installation-a" } as const;
      const resetAt = Math.ceil(Date.now() / 1000) + 90;
      const limited = attachGitHubBackoff(
        ctx,
        new Octokit({
          request: {
            fetch: async () =>
              new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
                status: 403,
                headers: {
                  "content-type": "application/json",
                  "x-ratelimit-resource": "core",
                  "x-ratelimit-remaining": "0",
                  "x-ratelimit-reset": String(resetAt),
                },
              }),
          },
        }),
        principal,
      );
      await expect(limited.rest.repos.get({ owner: "one", repo: "first" })).rejects.toMatchObject({
        status: 403,
      });

      const fetch = vi.fn(
        async () =>
          new Response(JSON.stringify({ data: { viewer: null } }), {
            headers: { "content-type": "application/json" },
          }),
      );
      const secondClient = attachGitHubBackoff(ctx, new Octokit({ request: { fetch } }), principal);
      await expect(
        secondClient.rest.repos.get({ owner: "two", repo: "second" }),
      ).rejects.toMatchObject({
        status: 429,
        response: {
          headers: { "x-ratelimit-reset": String(resetAt), "x-ratelimit-resource": "core" },
        },
      });
      expect(fetch).not.toHaveBeenCalled();
      await secondClient.graphql("query { viewer { login } }");
      await secondClient.request("POST /app-manifests/{code}/conversions", {
        code: "unknown-resource",
      });
      const otherInstallation = attachGitHubBackoff(ctx, new Octokit({ request: { fetch } }), {
        kind: "installation",
        id: "installation-b",
      });
      await otherInstallation.rest.repos.get({ owner: "two", repo: "second" });
      const userClient = attachGitHubBackoff(ctx, new Octokit({ request: { fetch } }), {
        kind: "user",
        id: principal.id,
      });
      await userClient.rest.repos.get({ owner: "two", repo: "second" });
      expect(fetch).toHaveBeenCalledTimes(4);
    });
  });

  it("applies secondary cooldowns to all resources and does not shorten a later deadline", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t = makeConvexTest();
    await t.action(async (ctx) => {
      const principal = { kind: "installation", id: "installation-secondary" } as const;
      const client = attachGitHubBackoff(
        ctx,
        new Octokit({
          request: {
            fetch: async () =>
              new Response(
                JSON.stringify({ message: "You have exceeded a secondary rate limit." }),
                {
                  status: 403,
                  headers: {
                    "content-type": "application/json",
                    "retry-after": "120",
                    "x-ratelimit-resource": "core",
                    "x-ratelimit-remaining": "10",
                  },
                },
              ),
          },
        }),
        principal,
      );
      await expect(client.rest.repos.get({ owner: "one", repo: "first" })).rejects.toBeInstanceOf(
        RequestError,
      );
      await t.mutation(internal.githubBackoff.record, {
        principal,
        resource: null,
        until: Date.now() + 30_000,
      });
      const fetch = vi.fn(
        async () =>
          new Response(JSON.stringify({ data: {} }), {
            headers: { "content-type": "application/json" },
          }),
      );
      const nextClient = attachGitHubBackoff(ctx, new Octokit({ request: { fetch } }), principal);
      await expect(nextClient.graphql("query { viewer { login } }")).rejects.toMatchObject({
        response: { headers: { "retry-after": "120" } },
      });
      await expect(nextClient.request("GET /unknown-resource")).rejects.toMatchObject({
        status: 429,
      });
      expect(fetch).not.toHaveBeenCalled();
      vi.setSystemTime(Date.now() + 120_001);
      await nextClient.graphql("query { viewer { login } }");
      expect(fetch).toHaveBeenCalledOnce();
    });
  });

  it("observes HTTP 200 GraphQL rate errors without changing native GraphQL failures", async () => {
    const t = makeConvexTest();
    await t.action(async (ctx) => {
      const principal = { kind: "user", id: "github-user" } as const;
      const client = attachGitHubBackoff(
        ctx,
        new Octokit({
          request: {
            fetch: async () =>
              new Response(
                JSON.stringify({
                  errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded" }],
                }),
                {
                  headers: {
                    "content-type": "application/json",
                    "x-ratelimit-resource": "graphql",
                    "x-ratelimit-remaining": "0",
                    "x-ratelimit-reset": String(Math.ceil(Date.now() / 1000) + 60),
                  },
                },
              ),
          },
        }),
        principal,
      );
      await expect(client.graphql("query { viewer { login } }")).rejects.toMatchObject({
        name: "GraphqlResponseError",
        errors: [{ type: "RATE_LIMITED" }],
      });
      expect(
        await t.query(internal.githubBackoff.get, { principal, resource: "graphql" }),
      ).not.toBeNull();
      expect(await t.query(internal.githubBackoff.get, { principal, resource: "core" })).toBeNull();
    });
  });

  it("does not turn permission failures or ordinary GraphQL errors into cooldowns", async () => {
    const t = makeConvexTest();
    await t.action(async (ctx) => {
      const principal = { kind: "installation", id: "not-rate-limited" } as const;
      const rest = attachGitHubBackoff(
        ctx,
        new Octokit({
          request: {
            fetch: async () =>
              new Response(JSON.stringify({ message: "Resource not accessible by integration" }), {
                status: 403,
                headers: { "content-type": "application/json" },
              }),
          },
        }),
        principal,
      );
      await expect(rest.rest.repos.get({ owner: "one", repo: "first" })).rejects.toMatchObject({
        status: 403,
      });
      const graphql = attachGitHubBackoff(
        ctx,
        new Octokit({
          request: {
            fetch: async () =>
              new Response(
                JSON.stringify({
                  errors: [{ type: "NOT_FOUND", message: "Could not resolve to a Repository" }],
                }),
                {
                  headers: {
                    "content-type": "application/json",
                    "x-ratelimit-resource": "graphql",
                  },
                },
              ),
          },
        }),
        principal,
      );
      await expect(graphql.graphql("query { viewer { login } }")).rejects.toMatchObject({
        name: "GraphqlResponseError",
      });
      expect(await t.run((ctx) => ctx.db.query("githubRateLimitCooldowns").collect())).toEqual([]);
    });
  });
});
