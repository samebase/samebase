// Convex.HubClient against the fake Convex control plane: the resource finds the base by name and
// runs the admin functions of the hub with a short-lived key.
import * as Output from "alchemy/Output";
import * as Test from "@alchemy.run/test/Vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import * as Convex from "../src/index.ts";
import { fromValues } from "../src/Credentials.ts";
import { HUB_PROJECT_NAME, registerDevelopmentClient } from "../src/HubClient.ts";
import { ManagementApiLive } from "../src/ManagementApi.ts";
import { RUN_KEY_ACTIONS } from "../src/State.ts";
import { FakeConvex, Hub } from "./fakeConvex.ts";

const TEAM = 38516;
const ISSUER = "https://auth.test";
const CALLBACK = "https://happy-otter-123.convex.site/auth/hub/callback";

const { test } = Test.make({
  providers: Convex.providers(Convex.fromValues({ accessToken: Redacted.make("test-token") })),
});

const props = (overrides: Partial<Convex.HubClientProps> = {}): Convex.HubClientProps => ({
  team: TEAM,
  app: "scout",
  redirectUri: CALLBACK,
  deploymentType: "preview",
  clientName: "pr-1",
  softwareVersion: "abc",
  ...overrides,
});

const client = (input: Convex.HubClientProps) =>
  Effect.gen(function* () {
    const hubClient = yield* Convex.HubClient("HubClient", input);
    return {
      issuer: hubClient.issuer,
      clientId: hubClient.clientId,
      secret: Output.map(hubClient.clientSecret, Redacted.value),
    };
  });

/** A fake with the hub of the team on the production deployment of its project. */
const withHub = () => {
  const fake = new FakeConvex().install();
  const [deployment] = fake.deploymentsOf(
    fake.addProject({ name: HUB_PROJECT_NAME, teamId: TEAM }),
  );
  if (deployment === undefined) throw new Error("the fake project has no deployment");
  const hub = new Hub(ISSUER);
  fake.hubs.set(deployment.name, hub);
  return { fake, hub, deployment: deployment.name };
};

const KeyBody = Schema.Struct({ allowedActions: Schema.Array(Schema.String) });

describe("Convex.HubClient", () => {
  test.provider("registers with a key of the hub that runs internal functions only", (stack) =>
    Effect.gen(function* () {
      const { fake, hub, deployment } = withHub();
      const out = yield* stack.deploy(client(props()));
      expect(out).toEqual({ issuer: ISSUER, clientId: "cl_1", secret: "secret-of-cl_1" });
      expect(hub.clients.get("cl_1")).toEqual({
        appId: "scout",
        redirectUri: CALLBACK,
        deploymentType: "preview",
        clientName: "pr-1",
        softwareVersion: "abc",
        tokenEndpointAuthMethod: "client_secret_post",
        expires: true,
      });
      const created = fake.sent.find((sent) => sent.path.endsWith("/create_deploy_key"));
      expect(Schema.decodeUnknownSync(KeyBody)(created?.body).allowedActions).toEqual([
        ...RUN_KEY_ACTIONS,
      ]);
      // The key of the call is gone again.
      expect(fake.lines().filter((line) => line.endsWith("/delete_deploy_key"))).toHaveLength(1);
      expect(fake.functionCalls).toEqual([`${deployment} identityBroker:registerClient`]);
    }),
  );

  test.provider("a deploy with the same redirect URI renews the client and keeps it", (stack) =>
    Effect.gen(function* () {
      const { fake, hub, deployment } = withHub();
      const first = yield* stack.deploy(client(props()));
      const again = yield* stack.deploy(
        client(props({ clientName: "other", softwareVersion: "d" })),
      );
      expect(again).toEqual(first);
      expect(hub.clients.size).toBe(1);
      expect(hub.renewals).toEqual([{ clientId: "cl_1", expires: true }]);
      expect(fake.functionCalls).toEqual([
        `${deployment} identityBroker:registerClient`,
        `${deployment} identityBroker:renewClient`,
      ]);
    }),
  );

  test.provider("another app or team stores the new props and keeps the client", (stack) =>
    Effect.gen(function* () {
      const { hub } = withHub();
      const first = yield* stack.deploy(client(props()));
      const again = yield* stack.deploy(client(props({ app: "other" })));
      expect(again).toEqual(first);
      expect(hub.clients.size).toBe(1);
      expect(hub.renewals).toHaveLength(1);
    }),
  );

  test.provider(
    "a deploy after the hub deleted the client registers a new one, and the deployment gets its values",
    (stack) =>
      Effect.gen(function* () {
        const { fake, hub } = withHub();
        const projectId = fake.addProject({ name: "scout", teamId: TEAM });
        const withSite = Effect.gen(function* () {
          const hubClient = yield* Convex.HubClient("HubClient", props());
          const site = yield* Convex.Deployment("Site", {
            project: { projectId },
            type: "dev",
            name: "pr-1",
            env: { HUB_CLIENT_ID: hubClient.clientId, HUB_CLIENT_SECRET: hubClient.clientSecret },
          });
          return { clientId: hubClient.clientId, site: site.name };
        });
        const first = yield* stack.deploy(withSite);
        expect(fake.variables.get(first.site)).toEqual({
          HUB_CLIENT_ID: "cl_1",
          HUB_CLIENT_SECRET: "secret-of-cl_1",
        });
        // The daily cleanup of the hub, 14 days after the last deploy.
        hub.clients.delete("cl_1");
        const second = yield* stack.deploy(withSite);
        expect(second.clientId).toBe("cl_2");
        expect([...hub.clients.keys()]).toEqual(["cl_2"]);
        expect(hub.clients.get("cl_2")).toMatchObject({ expires: true });
        expect(fake.variables.get(second.site)).toEqual({
          HUB_CLIENT_ID: "cl_2",
          HUB_CLIENT_SECRET: "secret-of-cl_2",
        });
      }),
  );

  test.provider("another redirect URI is a new client, and the old one goes", (stack) =>
    Effect.gen(function* () {
      const { hub } = withHub();
      yield* stack.deploy(client(props()));
      const next = yield* stack.deploy(client(props({ redirectUri: `${CALLBACK}2` })));
      expect(next.clientId).toBe("cl_2");
      expect([...hub.clients.keys()]).toEqual(["cl_2"]);
    }),
  );

  test.provider("a destroy deletes a preview client", (stack) =>
    Effect.gen(function* () {
      const { hub } = withHub();
      yield* stack.deploy(client(props()));
      yield* stack.destroy();
      expect(hub.clients.size).toBe(0);
    }),
  );

  test.provider("a destroy keeps a production client", (stack) =>
    Effect.gen(function* () {
      const { fake, hub } = withHub();
      yield* stack.deploy(client(props({ deploymentType: "production" })));
      yield* stack.destroy();
      expect([...hub.clients.keys()]).toEqual(["cl_1"]);
      expect(fake.functionCalls.filter((call) => call.endsWith("deleteClient"))).toEqual([]);
    }),
  );

  test.provider("a team without a hub project fails and names what is missing", (stack) =>
    Effect.gen(function* () {
      new FakeConvex().install();
      const error = yield* Effect.flip(stack.deploy(client(props())));
      expect(error).toBeInstanceOf(Convex.HubClientFailed);
      expect(error.message).toContain("no project identity-hub");
    }),
  );

  test.provider("a project without the hub functions fails with the Convex message", (stack) =>
    Effect.gen(function* () {
      const { fake, deployment } = withHub();
      fake.hubs.delete(deployment);
      const error = yield* Effect.flip(stack.deploy(client(props())));
      expect(error).toBeInstanceOf(Convex.HubClientFailed);
      expect(error.message).toContain(
        "Could not find function for 'identityBroker:registerClient'",
      );
    }),
  );
});

describe("registerDevelopmentClient", () => {
  const run = (convex: (args: readonly string[], input?: string) => string, envPrefix?: string) =>
    registerDevelopmentClient({
      team: TEAM,
      app: "scout",
      callbackPath: "/auth/hub/callback",
      ...(envPrefix === undefined ? {} : { envPrefix }),
      convex,
    }).pipe(
      Effect.provide(
        ManagementApiLive().pipe(
          Layer.provide(fromValues({ accessToken: Redacted.make("test-token") })),
        ),
      ),
      Effect.runPromise,
    );

  /**
   * The Convex CLI of a deployment with `variables`: it lists and reads them, `env set` writes the
   * lines of its standard input, and the site URL is the one of CALLBACK.
   */
  const cli = (variables: Map<string, string>) => {
    const calls: string[] = [];
    const writes: string[] = [];
    const convex = (args: readonly string[], input?: string) => {
      calls.push(args.join(" "));
      if (args[0] === "run") return '"https://happy-otter-123.convex.site/"';
      if (args[1] === "list") return [...variables.keys()].join("\n");
      if (args[1] === "get") return variables.get(args[2] ?? "") ?? "";
      if (input !== undefined) {
        writes.push(input);
        for (const line of input.trim().split("\n")) {
          const [name = "", value = ""] = line.split("=");
          variables.set(name, value.replace(/^'|'$/g, ""));
        }
      }
      return "";
    };
    return { convex, calls, writes };
  };

  it("a deployment with all three variables renews the client that they name", async () => {
    const { hub } = withHub();
    hub.clients.set("cl_7", {});
    const { convex, calls } = cli(
      new Map([
        ["HUB_ISSUER", ISSUER],
        ["HUB_CLIENT_ID", "cl_7"],
        ["HUB_CLIENT_SECRET", "secret-of-cl_7"],
        ["OTHER", "x"],
      ]),
    );
    expect(await run(convex)).toBeUndefined();
    expect(calls).toEqual(["env list --names-only", "env get HUB_CLIENT_ID"]);
    expect(hub.renewals).toEqual([{ clientId: "cl_7", expires: true }]);
    expect([...hub.clients.keys()]).toEqual(["cl_7"]);
  });

  it("a deployment whose client the hub no longer has gets a new one in one write", async () => {
    const { hub } = withHub();
    const { convex, calls, writes } = cli(
      new Map([
        ["HUB_ISSUER", ISSUER],
        ["HUB_CLIENT_ID", "cl_stale"],
        ["HUB_CLIENT_SECRET", "secret-of-cl_stale"],
      ]),
    );
    expect(await run(convex)).toBe(CALLBACK);
    expect(hub.renewals).toEqual([{ clientId: "cl_stale", expires: true }]);
    expect(hub.clients.get("cl_1")).toMatchObject({
      redirectUri: CALLBACK,
      deploymentType: "development",
      expires: true,
    });
    expect(calls.at(-1)).toBe("env set --force");
    expect(writes).toEqual([
      `HUB_ISSUER='${ISSUER}'\nHUB_CLIENT_ID='cl_1'\nHUB_CLIENT_SECRET='secret-of-cl_1'\n`,
    ]);
  });

  it("a deployment with no complete client registers, and the secret goes on standard input", async () => {
    const { hub } = withHub();
    const { convex, calls, writes } = cli(new Map([["HUB_ISSUER", "http://127.0.0.1:1"]]));
    expect(await run(convex)).toBe(CALLBACK);
    expect(hub.renewals).toEqual([]);
    expect(hub.clients.get("cl_1")).toMatchObject({
      appId: "scout",
      redirectUri: CALLBACK,
      deploymentType: "development",
      softwareVersion: "happy-otter-123.convex.site",
      expires: true,
    });
    expect(calls.filter((call) => call.startsWith("env set"))).toEqual(["env set --force"]);
    expect(writes).toEqual([
      `HUB_ISSUER='${ISSUER}'\nHUB_CLIENT_ID='cl_1'\nHUB_CLIENT_SECRET='secret-of-cl_1'\n`,
    ]);
  });

  it("a second client preserves the sign-in variables and is renewed on the next run", async () => {
    const { hub } = withHub();
    hub.clients.set("cl_sign_in", {});
    const { convex, writes } = cli(
      new Map([
        ["HUB_ISSUER", ISSUER],
        ["HUB_CLIENT_ID", "cl_sign_in"],
        ["HUB_CLIENT_SECRET", "secret-of-cl_sign_in"],
      ]),
    );
    expect(await run(convex, "RESOURCE_HUB")).toBe(CALLBACK);
    expect(writes).toEqual([
      `RESOURCE_HUB_ISSUER='${ISSUER}'\nRESOURCE_HUB_CLIENT_ID='cl_1'\nRESOURCE_HUB_CLIENT_SECRET='secret-of-cl_1'\n`,
    ]);
    expect(await run(convex, "RESOURCE_HUB")).toBeUndefined();
    expect(hub.renewals).toEqual([{ clientId: "cl_1", expires: true }]);
    expect(hub.clients.size).toBe(2);
    expect(writes).toHaveLength(1);
  });
});
