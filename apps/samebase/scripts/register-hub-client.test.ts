import { describe, expect, it, vi } from "vite-plus/test";
import { registerHubClient } from "./register-hub-client.ts";

/** A Convex CLI with one deployment's variables that records every call. */
function fakeConvex(initial: Record<string, string>) {
  const env = { ...initial };
  const calls: string[][] = [];
  const runConvex = (args: string[], input?: string) => {
    calls.push(args);
    if (args[0] === "env" && args[1] === "get") {
      return env[args[2] ?? ""] ?? "";
    }
    if (args[0] === "env" && args[1] === "set") {
      for (const line of (input ?? "").split("\n")) {
        const match = /^([A-Z_]+)='(.*)'$/.exec(line);
        if (match !== null) {
          env[match[1]] = match[2];
        }
      }
      return "";
    }
    if (args[0] === "run") {
      return JSON.stringify("https://quiet-robin-508.convex.site");
    }
    throw new Error(`unexpected convex ${args.join(" ")}`);
  };
  return { env, calls, runConvex };
}

const hubEnv = { HUB_ISSUER: "https://auth.test/", HUB_REGISTRATION_TOKEN: "rt_token" };

function registered(clientId: string, clientSecret: string) {
  return vi.fn(async () =>
    Response.json({ client_id: clientId, client_secret: clientSecret }, { status: 201 }),
  );
}

describe("registerHubClient", () => {
  it("registers the deployment's callback once and stores the client", async () => {
    const convex = fakeConvex({});
    const fetchSpy = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init);
      expect(request.url).toBe("https://auth.test/register");
      expect(request.headers.get("authorization")).toBe("Bearer rt_token");
      expect(await request.json()).toEqual({
        redirect_uris: ["https://quiet-robin-508.convex.site/auth/hub/callback"],
        client_name: "development",
        software_version: "quiet-robin-508.convex.site",
        deployment_type: "development",
        token_endpoint_auth_method: "client_secret_post",
      });
      return Response.json({ client_id: "cl_1", client_secret: "s3cret" }, { status: 201 });
    });

    await expect(
      registerHubClient(hubEnv, { runConvex: convex.runConvex, fetch: fetchSpy }),
    ).resolves.toEqual({
      clientId: "cl_1",
      callbackUrl: "https://quiet-robin-508.convex.site/auth/hub/callback",
    });
    expect(convex.env).toEqual({
      HUB_ISSUER: "https://auth.test",
      HUB_CLIENT_ID: "cl_1",
      HUB_CLIENT_SECRET: "s3cret",
    });
    // The secret is on standard input, not in the arguments.
    expect(convex.calls.at(-1)).toEqual(["env", "set", "--force"]);

    fetchSpy.mockClear();
    await expect(
      registerHubClient(hubEnv, { runConvex: convex.runConvex, fetch: fetchSpy }),
    ).resolves.toBeNull();
    // Without the values, the complete client stays as well.
    await expect(
      registerHubClient({}, { runConvex: convex.runConvex, fetch: fetchSpy }),
    ).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    [
      "the stored issuer is another hub",
      { HUB_ISSUER: "https://old-hub.test", HUB_CLIENT_ID: "cl_old", HUB_CLIENT_SECRET: "old" },
    ],
    ["the stored client has no secret", { HUB_ISSUER: "https://auth.test", HUB_CLIENT_ID: "cl_1" }],
  ])("registers again when %s", async (_name, stored) => {
    const convex = fakeConvex(stored);

    await registerHubClient(hubEnv, {
      runConvex: convex.runConvex,
      fetch: registered("cl_2", "new-secret"),
    });

    expect(convex.env).toEqual({
      HUB_ISSUER: "https://auth.test",
      HUB_CLIENT_ID: "cl_2",
      HUB_CLIENT_SECRET: "new-secret",
    });
  });

  it("leaves the no-hub values of a linked worktree with the hub values given", async () => {
    const noHub = {
      HUB_ISSUER: "http://127.0.0.1:1",
      HUB_CLIENT_ID: "no-hub",
      HUB_CLIENT_SECRET: "no-hub",
    };
    const convex = fakeConvex(noHub);
    const fetchSpy = registered("cl_1", "s3cret");

    await expect(
      registerHubClient(hubEnv, { runConvex: convex.runConvex, fetch: fetchSpy }),
    ).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(convex.env).toEqual(noHub);
  });

  it("names the .env.local values when a deployment without a client has none", async () => {
    const convex = fakeConvex({});

    await expect(
      registerHubClient(
        { HUB_ISSUER: "https://auth.test" },
        { runConvex: convex.runConvex, fetch: registered("cl_1", "s3cret") },
      ),
    ).rejects.toThrow(
      "Set HUB_ISSUER and HUB_REGISTRATION_TOKEN in apps/samebase/.env.local (README, Sign-in).",
    );
    expect(convex.env).toEqual({});
  });

  it("reports a refused registration with the hub's error code only", async () => {
    const convex = fakeConvex({});
    const fetchSpy = vi.fn(async () =>
      Response.json(
        { error: "invalid_redirect_uri", error_description: "host not allowed" },
        { status: 400 },
      ),
    );

    await expect(
      registerHubClient(hubEnv, { runConvex: convex.runConvex, fetch: fetchSpy }),
    ).rejects.toThrow(/400: invalid_redirect_uri$/);
    expect(convex.env).toEqual({});
  });
});
