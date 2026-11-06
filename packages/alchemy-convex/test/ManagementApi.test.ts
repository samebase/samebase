import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fromValues } from "../src/Credentials.ts";
import { FakeConvex } from "./fakeConvex.ts";
import {
  ConvexApiError,
  isRetryableWriteError,
  ManagementApi,
  ManagementApiLive,
  type ManagementApiService,
} from "../src/ManagementApi.ts";

const fixture = (file: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/management/${file}`, import.meta.url), "utf8"));

const ErrorBody = Schema.Struct({ code: Schema.String, message: Schema.String });

/** The error that ManagementApi makes from a recorded error body. */
const errorFrom = (
  file: string,
  status: number,
  change: { code?: string; message?: string } = {},
) =>
  new ConvexApiError({
    operation: "test",
    status,
    ...Schema.decodeUnknownSync(ErrorBody)(fixture(file)),
    ...change,
  });

describe("isRetryableWriteError", () => {
  it("retries the recorded write conflict of update_environment_variables", () => {
    expect(
      isRetryableWriteError(
        errorFrom("deployment_update_environment_variables_conflict.json", 503),
      ),
    ).toBe(true);
  });

  it("retries the recorded 500 of a parallel delete_preview_deploy_key", () => {
    expect(
      isRetryableWriteError(errorFrom("project_delete_preview_deploy_key_500.json", 500)),
    ).toBe(true);
  });

  it("retries the platform codes OCC and WriteConflict and the conflict message", () => {
    const file = "deployment_update_environment_variables_conflict.json";
    expect(isRetryableWriteError(errorFrom(file, 400, { code: "OCC" }))).toBe(true);
    expect(isRetryableWriteError(errorFrom(file, 400, { code: "WriteConflict" }))).toBe(true);
    expect(
      isRetryableWriteError(
        errorFrom(file, 400, {
          code: "Other",
          message:
            'Documents read from or written to the "_environment_variables" table changed while this mutation was being run and on every subsequent retry.',
        }),
      ),
    ).toBe(true);
  });

  it("does not retry the recorded 404", () => {
    expect(isRetryableWriteError(errorFrom("project_not_found.json", 404))).toBe(false);
  });
});

describe("isCredentialToken", () => {
  /** The recorded deploy key: `dev:beaming-okapi-932|REDACTED`. */
  const { deployKey } = Schema.decodeUnknownSync(Schema.Struct({ deployKey: Schema.String }))(
    fixture("deployment_create_deploy_key.json"),
  );
  const withCredential = (accessToken: string, secret: string) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const api = yield* ManagementApi;
        return yield* api.isCredentialToken(secret);
      }).pipe(
        Effect.provide(
          ManagementApiLive().pipe(
            Layer.provide(fromValues({ accessToken: Redacted.make(accessToken) })),
          ),
        ),
      ),
    );

  it("matches a key that carries the OAuth token after a new prefix", async () => {
    expect(await withCredential("team:samebase-live-tests|REDACTED", deployKey)).toBe(true);
  });

  it("matches a key that carries a token without a prefix", async () => {
    expect(await withCredential("REDACTED", deployKey)).toBe(true);
  });

  it("does not match a key with a token of its own", async () => {
    expect(await withCredential("team:samebase-live-tests|other", deployKey)).toBe(false);
  });

  it("matches a key when the credential has white space around it", async () => {
    expect(await withCredential(" team:samebase-live-tests|REDACTED \n", deployKey)).toBe(true);
  });
});

describe("isOAuthCredential", () => {
  const isOAuth = (accessToken: string) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const api = yield* ManagementApi;
        return yield* api.isOAuthCredential;
      }).pipe(
        Effect.provide(
          ManagementApiLive().pipe(
            Layer.provide(fromValues({ accessToken: Redacted.make(accessToken) })),
          ),
        ),
      ),
    );

  it.each([
    ["a team OAuth token", "team:samebase-live-tests|token", true],
    ["a project OAuth token", "project:samebase-live-tests:app|token", true],
    ["an OAuth token with white space around it", " team:samebase-live-tests|token\n", true],
    ["a team access token", "eyJ2MiI6ImEifQ==", false],
  ])("reads %s", async (_name, accessToken, expected) => {
    expect(await isOAuth(accessToken)).toBe(expected);
  });
});

const withToken = <A>(
  token: string,
  use: (api: ManagementApiService) => Effect.Effect<A, ConvexApiError>,
) =>
  Effect.gen(function* () {
    return yield* use(yield* ManagementApi);
  }).pipe(
    Effect.provide(
      ManagementApiLive().pipe(Layer.provide(fromValues({ accessToken: Redacted.make(token) }))),
    ),
  );
const failureOf = (effect: Effect.Effect<number, ConvexApiError>) =>
  Effect.runPromise(Effect.flip(effect)).then((error) => error.message);

describe("ManagementApi.teamId", () => {
  const teamOf = (token: string) => withToken(token, (api) => api.teamId);

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("takes the team that a team access token names, once for each service", async () => {
    const fake = new FakeConvex().install();
    const twice = withToken(fake.teamToken, (api) => Effect.all([api.teamId, api.teamId]));
    expect(await Effect.runPromise(twice)).toEqual([38516, 38516]);
    expect(fake.lines()).toEqual(["GET api.convex.dev/v1/token_details"]);
  });

  // Measured with the Convex CLI login: token_details answers 403, and the deployment and its
  // project answer with the project id and the team id.
  it("takes the team of the deployment that the Convex CLI selected for the Convex CLI login", async () => {
    const fake = new FakeConvex().install();
    const projectId = fake.addProject({ name: "app", teamId: 38516 });
    const selected = fake.addDeployment({ projectId, type: "dev", name: "dev/nicu" });
    vi.stubEnv("CONVEX_DEPLOYMENT", `dev:${selected}`);
    expect(await Effect.runPromise(teamOf("cli-login"))).toBe(38516);
    expect(fake.lines()).toEqual([
      "GET api.convex.dev/v1/token_details",
      `GET api.convex.dev/v1/deployments/${selected}`,
      `GET api.convex.dev/v1/projects/${projectId}`,
    ]);
  });

  // A set CONVEX_DEPLOYMENT wins over .env.local, so these cases read no `.env.local`. The working
  // directory of the test run has no `.convex/local/default`.
  it.each([
    ["a local deployment that the working directory does not hold", "local:local-nicu-app"],
    ["an anonymous deployment", "anonymous:anonymous-app"],
    ["an anonymous deployment without a prefix", "anonymous-app"],
  ])(
    "refuses the Convex CLI login with %s, with no deployment request",
    async (_name, selected) => {
      const fake = new FakeConvex().install();
      vi.stubEnv("CONVEX_DEPLOYMENT", selected);
      expect(await failureOf(teamOf("cli-login"))).toContain(
        "no deployment of a project is selected",
      );
      expect(fake.lines()).toEqual(["GET api.convex.dev/v1/token_details"]);
    },
  );

  // `npx convex deployment create <team>:<project>:local --select` writes the project id into the
  // folder's `.convex/local/default/config.json`.
  it("takes the team of the project of the selected local deployment of the working directory", async () => {
    const fake = new FakeConvex().install();
    const projectId = fake.addProject({ name: "app", teamId: 38516 });
    const dir = mkdtempSync(join(tmpdir(), "alchemy-convex-team-"));
    const cwd = process.cwd();
    try {
      mkdirSync(join(dir, ".convex", "local", "default"), { recursive: true });
      writeFileSync(
        join(dir, ".convex", "local", "default", "config.json"),
        JSON.stringify({
          ports: { cloud: 3210, site: 3211 },
          adminKey: "REDACTED",
          cloudProjectId: projectId,
          deploymentName: "local-nicu-app-1",
        }),
      );
      process.chdir(dir);
      vi.stubEnv("CONVEX_DEPLOYMENT", "local:local-nicu-app-1");
      expect(await Effect.runPromise(teamOf("cli-login"))).toBe(38516);
      expect(fake.lines()).toEqual([
        "GET api.convex.dev/v1/token_details",
        `GET api.convex.dev/v1/projects/${projectId}`,
      ]);
      // Another local deployment selected than the folder holds: no team from the folder.
      vi.stubEnv("CONVEX_DEPLOYMENT", "local:local-nicu-app-2");
      expect(await failureOf(teamOf("cli-login"))).toContain(
        "no deployment of a project is selected",
      );
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("ManagementApi.resolveTeamId", () => {
  const resolve = (token: string, team: string | number) =>
    withToken(token, (api) => api.resolveTeamId(team));

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses a numeric id as it is, with no request", async () => {
    const fake = new FakeConvex().install();
    expect(await Effect.runPromise(resolve("cli-login", 38516))).toBe(38516);
    expect(await Effect.runPromise(resolve("cli-login", "38516"))).toBe(38516);
    expect(fake.sent).toEqual([]);
  });

  // The recorded project payload carries the team slug samebase-live-tests (522530).
  it("checks a slug against the projects of the team of a team access token", async () => {
    const fake = new FakeConvex().install();
    fake.teamTokenTeamId = 522530;
    fake.addProject({ name: "app", teamId: 522530 });
    expect(await Effect.runPromise(resolve(fake.teamToken, "samebase-live-tests"))).toBe(522530);
    expect(fake.lines()).toEqual([
      "GET api.convex.dev/v1/token_details",
      "GET api.convex.dev/v1/teams/522530/projects",
    ]);
  });

  it("refuses a slug of another team, and a slug that a team without projects cannot check", async () => {
    const fake = new FakeConvex().install();
    fake.teamTokenTeamId = 522530;
    expect(await failureOf(resolve(fake.teamToken, "samebase-live-tests"))).toContain(
      "team 522530 has no project yet. Set team to 522530",
    );
    fake.addProject({ name: "app", teamId: 522530 });
    expect(await failureOf(resolve(fake.teamToken, "nicu"))).toContain(
      'belongs to team 522530 ("samebase-live-tests"), and team is "nicu"',
    );
    expect(fake.projects).toHaveLength(1);
  });

  it("looks a slug up in the dashboard's team list for the Convex CLI login", async () => {
    const fake = new FakeConvex().install();
    expect(await Effect.runPromise(resolve("cli-login", "nicu"))).toBe(38516);
    expect(fake.lines()).toEqual([
      "GET api.convex.dev/v1/token_details",
      "GET api.convex.dev/api/dashboard/teams",
    ]);
    expect(await failureOf(resolve("cli-login", "no-such-team"))).toContain(
      'no team with slug "no-such-team"',
    );
  });
});
