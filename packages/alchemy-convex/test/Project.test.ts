// Convex.Project through the real Alchemy engine, against FakeConvex. Each
// test gets a fresh in-memory state.
import { adopt } from "alchemy/AdoptPolicy";
import * as Output from "alchemy/Output";
import * as RemovalPolicy from "alchemy/RemovalPolicy";
import * as Test from "@alchemy.run/test/Vitest";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { describe, expect } from "vitest";
import * as Convex from "../src/index.ts";
import { FakeConvex, recorded } from "./fakeConvex.ts";

/** Team of the recorded project.json. */
const TEAM = 522530;
const NAME = "tmp-alchemy-convex-fixture";
const API = "api.convex.dev/v1";

// The bearer value that FakeConvex takes for a team access token. The project is in its team.
const { test } = Test.make({
  providers: Convex.providers(Convex.fromValues({ accessToken: Redacted.make("team-token") })),
});

/** FakeConvex with the team token of TEAM. */
const install = () => {
  const fake = new FakeConvex().install();
  fake.teamTokenTeamId = TEAM;
  return fake;
};

const project = (props: Convex.ProjectProps) =>
  Effect.gen(function* () {
    const created = yield* Convex.Project("Project", props);
    return { projectId: created.projectId, name: created.name, slug: created.slug };
  });

describe("Convex.Project", () => {
  test.provider("creates a project and takes its id from the create response", (stack) =>
    Effect.gen(function* () {
      const fake = install();
      const out = yield* stack.deploy(project({ name: NAME }));
      expect(fake.project(out.projectId)?.name).toBe(NAME);
      expect(fake.lines()).toEqual([
        `GET ${API}/token_details`,
        `GET ${API}/teams/${TEAM}/projects`,
        `GET ${API}/teams/${TEAM}/projects`,
        `POST ${API}/teams/${TEAM}/create_project`,
        `GET ${API}/projects/${out.projectId}`,
        `GET ${API}/projects/${out.projectId}/list_deployments`,
      ]);
    }),
  );

  test.provider("renames with PATCH, keeps the id and slug, and never lists projects", (stack) =>
    Effect.gen(function* () {
      const fake = install();
      const first = yield* stack.deploy(project({ name: NAME }));
      const from = fake.sent.length;
      const renamed = yield* stack.deploy(project({ name: `${NAME}-renamed` }));
      expect(renamed).toEqual({
        projectId: first.projectId,
        name: `${NAME}-renamed`,
        slug: first.slug,
      });
      expect(fake.lines(from)).toEqual([
        `GET ${API}/projects/${first.projectId}`,
        `PATCH ${API}/projects/${first.projectId}`,
        `GET ${API}/projects/${first.projectId}/list_deployments`,
      ]);
      expect(fake.sent.find((request) => request.method === "PATCH")?.body).toEqual({
        name: `${NAME}-renamed`,
      });
      expect(fake.projects.length).toBe(1);
    }),
  );

  test.provider("fails a deploymentType change with ProjectDeploymentChange", (stack) =>
    Effect.gen(function* () {
      const fake = install();
      const first = yield* stack.deploy(project({ name: NAME }));
      const from = fake.sent.length;
      const error = yield* Effect.flip(
        stack.deploy(project({ name: NAME, deploymentType: "dev" })),
      );
      expect(error).toBeInstanceOf(Convex.ProjectDeploymentChange);
      expect(error).toMatchObject({
        projectId: first.projectId,
        field: "deploymentType",
        current: "prod",
        requested: "dev",
        message: expect.stringContaining("new resource with a new logical id"),
      });
      expect(fake.lines(from)).toEqual([]);
    }),
  );

  test.provider("accepts the original deploymentType again after a refused change", (stack) =>
    Effect.gen(function* () {
      const fake = install();
      // The name comes from another project. When this deploy renames that
      // project, the name is unresolved in plan, so the refusal comes from
      // reconcile, after the engine saved the refused props as state.
      const withName = (name: string, deploymentType: "prod" | "dev") =>
        Effect.gen(function* () {
          const source = yield* Convex.Project("NameSource", { name });
          const created = yield* Convex.Project("Project", {
            name: Output.map(source.name, (sourceName) => `${sourceName}-main`),
            deploymentType,
          });
          return { projectId: created.projectId };
        });
      const first = yield* stack.deploy(withName(`${NAME}-a`, "prod"));
      const refused = yield* Effect.flip(stack.deploy(withName(`${NAME}-b`, "dev")));
      expect(refused).toMatchObject({ _tag: "ProjectDeploymentChange", current: "prod" });
      // The fix that the error names: set the type back.
      const restored = yield* stack.deploy(withName(`${NAME}-b`, "prod"));
      expect(restored.projectId).toBe(first.projectId);
      expect(fake.project(first.projectId)?.name).toBe(`${NAME}-b-main`);
    }),
  );

  test.provider("fails a deploymentRegion change with ProjectDeploymentChange", (stack) =>
    Effect.gen(function* () {
      const fake = install();
      yield* stack.deploy(project({ name: NAME }));
      const from = fake.sent.length;
      const error = yield* Effect.flip(
        stack.deploy(project({ name: NAME, deploymentRegion: "aws-eu-west-1" })),
      );
      expect(error).toMatchObject({
        _tag: "ProjectDeploymentChange",
        field: "deploymentRegion",
        current: undefined,
        requested: "aws-eu-west-1",
      });
      expect(fake.lines(from)).toEqual([]);
    }),
  );

  test.provider(
    "keeps the project when the resource is destroyed with the default policy",
    (stack) =>
      Effect.gen(function* () {
        const fake = install();
        const out = yield* stack.deploy(project({ name: NAME }));
        const from = fake.sent.length;
        yield* stack.destroy();
        expect(fake.lines(from)).toEqual([]);
        expect(fake.project(out.projectId)?.name).toBe(NAME);
      }),
  );

  test.provider("deletes the project only with RemovalPolicy.destroy()", (stack) =>
    Effect.gen(function* () {
      const fake = install();
      const out = yield* stack.deploy(
        Effect.gen(function* () {
          const created = yield* Convex.Project("Project", { name: NAME }).pipe(
            RemovalPolicy.destroy(),
          );
          return { projectId: created.projectId };
        }),
      );
      yield* stack.destroy();
      expect(fake.lines()).toContain(`POST ${API}/projects/${out.projectId}/delete`);
      expect(fake.project(out.projectId)).toBeUndefined();
    }),
  );

  test.provider(
    "records retain over the destroy policy of older state on the next deploy",
    (stack) =>
      Effect.gen(function* () {
        const fake = install();
        // State written with the destroy policy, as 0.1.x wrote it.
        const out = yield* stack.deploy(
          Effect.gen(function* () {
            const created = yield* Convex.Project("Project", { name: NAME }).pipe(
              RemovalPolicy.destroy(),
            );
            return { projectId: created.projectId };
          }),
        );
        // One deploy with the default policy, then destroy.
        yield* stack.deploy(project({ name: NAME }));
        yield* stack.destroy();
        expect(fake.lines().filter((line) => line.endsWith("/delete"))).toEqual([]);
        expect(fake.project(out.projectId)?.name).toBe(NAME);
      }),
  );

  test.provider("takes over a project with the same name only with adoption", (stack) =>
    Effect.gen(function* () {
      const fake = install();
      const existing = fake.addProject({ name: NAME, teamId: TEAM });
      const refused = yield* Effect.flip(stack.deploy(project({ name: NAME })));
      expect(refused).toMatchObject({ _tag: "OwnedBySomeoneElse" });
      const adopted = yield* stack.deploy(
        Effect.gen(function* () {
          const created = yield* Convex.Project("Project", { name: NAME }).pipe(adopt(true));
          return { projectId: created.projectId };
        }),
      );
      expect(adopted.projectId).toBe(existing);
      expect(fake.lines().filter((line) => line.endsWith("/create_project"))).toEqual([]);
      expect(fake.projects.length).toBe(1);
    }),
  );

  test.provider("refuses a same-name project that appears after the plan", (stack) =>
    Effect.gen(function* () {
      const fake = install();
      fake.addProject({ name: NAME, teamId: TEAM });
      // The plan reads an empty listing; reconcile reads the project.
      fake.hideProjectsFromListings = 1;
      const refused = yield* Effect.flip(stack.deploy(project({ name: NAME })));
      expect(refused).toMatchObject({
        _tag: "OwnedBySomeoneElse",
        message: expect.stringContaining("--adopt"),
      });
      expect(fake.lines().filter((line) => line.endsWith("/create_project"))).toEqual([]);
    }),
  );

  test.provider("reads every page of the listing and finds a project on page two", (stack) =>
    Effect.gen(function* () {
      const fake = install();
      const existing = fake.addProject({ name: NAME, teamId: TEAM });
      // A newer project that the search also returns comes first.
      fake.addProject({ name: `${NAME}-2`, teamId: TEAM });
      fake.pageSize = 1;
      const adopted = yield* stack.deploy(
        Effect.gen(function* () {
          const created = yield* Convex.Project("Project", { name: NAME }).pipe(adopt(true));
          return { projectId: created.projectId };
        }),
      );
      expect(adopted.projectId).toBe(existing);
      const listings = fake.sent.filter((request) => request.path.endsWith("/projects"));
      expect(listings.map((request) => request.query.toString())).toEqual([
        `q=${NAME}`,
        `q=${NAME}&cursor=1`,
      ]);
    }),
  );

  test.provider("fails with AmbiguousProject when two projects have the name", (stack) =>
    Effect.gen(function* () {
      const fake = install();
      const first = fake.addProject({ name: NAME, teamId: TEAM });
      const second = fake.addProject({ name: NAME, teamId: TEAM });
      const error = yield* Effect.flip(stack.deploy(project({ name: NAME })));
      expect(error).toBeInstanceOf(Convex.AmbiguousProject);
      expect(error).toMatchObject({ teamId: TEAM, name: NAME, projectIds: [second, first] });
      expect(fake.lines().filter((line) => line.endsWith("/create_project"))).toEqual([]);
    }),
  );

  test.provider("stops on a repeated listing cursor", (stack) =>
    Effect.gen(function* () {
      const fake = install();
      const page = {
        ...recorded("teams_projects.json"),
        items: [],
        pagination: { hasMore: true, nextCursor: "repeated" },
      };
      fake.scripted.set(`GET ${API}/teams/${TEAM}/projects`, [
        { status: 200, body: page },
        { status: 200, body: page },
      ]);
      const error = yield* Effect.flip(stack.deploy(project({ name: NAME })));
      expect(error).toMatchObject({ _tag: "ConvexApiError", code: "InvalidPagination" });
      expect(fake.lines()).toEqual([
        `GET ${API}/token_details`,
        `GET ${API}/teams/${TEAM}/projects`,
        `GET ${API}/teams/${TEAM}/projects`,
      ]);
    }),
  );

  test.provider(
    "takes over an existing project by slug only with --adopt, and never changes it",
    (stack) =>
      Effect.gen(function* () {
        const fake = install();
        const projectId = fake.addProject({ name: NAME, teamId: TEAM });
        const bySlug = { slug: NAME } as const;
        const refused = yield* Effect.flip(stack.deploy(project(bySlug)));
        expect(refused).toMatchObject({ _tag: "OwnedBySomeoneElse" });
        const adopted = yield* stack.deploy(
          Effect.gen(function* () {
            const found = yield* Convex.Project("Project", bySlug).pipe(adopt(true));
            return { projectId: found.projectId, name: found.name, slug: found.slug };
          }),
        );
        expect(adopted).toEqual({ projectId, name: NAME, slug: NAME });
        const from = fake.sent.length;
        const again = yield* stack.deploy(project(bySlug));
        expect(again).toEqual(adopted);
        expect(fake.lines().filter((line) => !line.startsWith("GET "))).toEqual([]);
        expect(fake.lines(from)).not.toContain(`GET ${API}/teams/${TEAM}/projects/${NAME}`);
        // The default policy keeps the project.
        yield* stack.destroy();
        expect(fake.project(projectId)).toBeDefined();
      }),
  );

  test.provider("fails with ProjectNotFound for a slug that no project has", (stack) =>
    Effect.gen(function* () {
      const fake = install();
      const error = yield* Effect.flip(
        stack.deploy(project({ slug: "no-such-project" })).pipe(adopt(true)),
      );
      expect(error).toBeInstanceOf(Convex.ProjectNotFound);
      expect(fake.lines().filter((line) => line.endsWith("/create_project"))).toEqual([]);
    }),
  );
});
