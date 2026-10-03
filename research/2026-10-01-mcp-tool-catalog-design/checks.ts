/**
Offline regression checks for the stub, from the review of PR #1664 (2026-10-03). No model calls.

node checks.ts
*/
import assert from "node:assert/strict";

import { callTool, type DesignId } from "./designs.ts";
import {
  APP2,
  buildFixture,
  findAccountWorker,
  liveStatus,
  rotateKeys,
  type State,
} from "./fixtures.ts";
import { TASKS, keyFor, type KeyedCall } from "./tasks.ts";

const APP = "samebase-live-tests/tmp-my-cool-app2";
let checks = 0;

function call(state: State, design: DesignId, tool: string, args: Record<string, unknown>) {
  return callTool(state, design, "D", tool, args);
}

function check(name: string, run: () => void): void {
  run();
  checks += 1;
  console.log(`ok ${name}`);
}

function appOf(state: State, fullName: string) {
  const app = state.apps.find((candidate) => `${candidate.owner}/${candidate.name}` === fullName);
  assert.ok(app, `app ${fullName} exists`);
  return app;
}

function twinState(): State {
  // A new app gets a Worker and a Convex project with the app's own name.
  const state = buildFixture("A");
  assert.ok(
    call(state, "R", "samebase_create_app", {
      githubOwnerLogin: "samebase-live-tests",
      name: "tmp-twin",
    }).ok,
  );
  call(state, "R", "samebase_list_apps", {});
  call(state, "R", "samebase_list_apps", {});
  return state;
}

check("1. detach needs kind when a Worker and a Convex project share a name", () => {
  const state = twinState();
  const twin = "samebase-live-tests/tmp-twin";
  const ambiguous = call(state, "R", "samebase_detach_resource", {
    app: twin,
    resourceName: "tmp-twin",
  });
  assert.equal(ambiguous.ok, false);
  assert.match(ambiguous.text, /Pass kind/);
  const detached = call(state, "R", "samebase_detach_resource", {
    app: twin,
    resourceName: "tmp-twin",
    kind: "convex_project",
  });
  assert.equal(detached.ok, true, detached.text);
  const app = appOf(state, twin);
  assert.equal(app.convexProjects.length, 0);
  assert.equal(app.workers.length, 1);
});

check("1. the V4 token binds kind", () => {
  const state = twinState();
  const twin = "samebase-live-tests/tmp-twin";
  const first = call(state, "RV4", "samebase_detach_resource", {
    app: twin,
    resourceName: "tmp-twin",
    kind: "convex_project",
  });
  assert.equal(first.ok, true, first.text);
  const token = String(Object.fromEntries(Object.entries(Object(first.result))).confirmationToken);
  const swapped = call(state, "RV4", "samebase_detach_resource", {
    app: twin,
    resourceName: "tmp-twin",
    kind: "cloudflare_worker",
    confirmationToken: token,
  });
  assert.equal(swapped.ok, false);
  assert.match(swapped.text, /request changed after confirmation \(kind\)/);
  assert.equal(appOf(state, twin).workers.length, 1);
});

check(
  "2. two attached Convex projects and no choice: create and connect fail before changes",
  () => {
    const state = buildFixture("A");
    assert.ok(
      call(state, "R", "samebase_attach_convex_project", { app: APP, projectName: "weather-data" })
        .ok,
    );
    const workersBefore = state.workers.length;
    const created = call(state, "R", "samebase_create_cloudflare_worker", {
      app: APP,
      workerName: "tmp-admin",
    });
    assert.equal(created.ok, false);
    assert.match(
      created.text,
      /Several Convex projects are attached.*tmp-my-cool-app2, weather-data/,
    );
    assert.equal(state.workers.length, workersBefore);
    const connected = call(state, "R", "samebase_connect_cloudflare_worker", {
      app: APP,
      workerName: "legacy-landing",
    });
    assert.equal(connected.ok, false);
    assert.equal(findAccountWorker(state, "legacy-landing")?.attachedTo, null);
    const chosen = call(state, "R", "samebase_create_cloudflare_worker", {
      app: APP,
      workerName: "tmp-admin",
      convexProject: "weather-data",
    });
    assert.equal(chosen.ok, true, chosen.text);
    assert.match(chosen.text, /"installed":true,"convexProject":"weather-data"/);
    assert.equal(findAccountWorker(state, "tmp-admin")?.convexKeys, "configured");
  },
);

check("2. one attached Convex project is used automatically", () => {
  const state = buildFixture("A");
  const created = call(state, "R", "samebase_create_cloudflare_worker", {
    app: APP,
    workerName: "tmp-admin",
  });
  assert.equal(created.ok, true, created.text);
  assert.match(created.text, /"installed":true,"convexProject":"tmp-my-cool-app2"/);
  assert.equal(findAccountWorker(state, "tmp-admin")?.convexKeys, "configured");
});

check("2. no attached Convex project installs no key and says so", () => {
  const state = buildFixture("A");
  assert.ok(
    call(state, "R", "samebase_detach_resource", {
      app: APP,
      resourceName: "tmp-my-cool-app2",
      kind: "convex_project",
    }).ok,
  );
  const created = call(state, "R", "samebase_create_cloudflare_worker", {
    app: APP,
    workerName: "tmp-admin",
  });
  assert.equal(created.ok, true, created.text);
  assert.match(created.text, /"installed":false,"reason":".*no attached Convex project/);
  assert.equal(findAccountWorker(state, "tmp-admin")?.convexKeys, "missing");
});

check("3. the build commit stays behind when the head moves without a build", () => {
  const state = buildFixture("A");
  const app = appOf(state, APP);
  app.headCommit = { title: "Change footer", sha: "9f9f9f9", checks: "success (3 of 3)" };
  const status = liveStatus(state, app);
  assert.equal(status.defaultBranch.headCommit.sha, "9f9f9f9");
  const build = status.production.workers[0]?.lastProductionBuild;
  assert.deepEqual(build, { state: "success", commit: "4be1c09" });
});

check("4. T01 fails when setup is still running after one progress read", () => {
  const task = TASKS.find((candidate) => candidate.id === "T01_create_app");
  assert.ok(task);
  const state = buildFixture(task.fixture);
  const calls: KeyedCall[] = [];
  for (const step of task.oracle.H.slice(0, -1)) {
    const tool = step.key === "create_app" ? "samebase_create_app" : "samebase_get_app_status";
    const outcome = callTool(state, "H", "D", tool, step.args([]));
    const record = {
      at: "",
      server: "samebase",
      tool,
      args: step.args([]),
      ok: outcome.ok,
      text: outcome.text,
    };
    calls.push({ ...record, key: keyFor("H", "D", record) });
  }
  assert.equal(
    appOf(state, "samebase-live-tests/tmp-weather-board").providerSetup.status,
    "running",
  );
  const verdict = task.check({ design: "H", state, calls, answer: "Setup is running." });
  assert.equal(verdict.success, false);
  assert.ok(verdict.notes.some((note) => note.includes("provider setup ended running")));
});

check("5. a Convex project without a production deployment can be attached", () => {
  const state = buildFixture("A");
  const attached = call(state, "R", "samebase_attach_convex_project", {
    app: APP,
    projectName: "scratch-project",
  });
  assert.equal(attached.ok, true, attached.text);
  assert.equal(state.projects.find((project) => project.projectId === "48232")?.attachedTo, APP2);
});

check("5. key installation still rejects the missing production deployment", () => {
  const state = buildFixture("A");
  assert.ok(
    call(state, "R", "samebase_attach_convex_project", { app: APP, projectName: "scratch-project" })
      .ok,
  );
  const app = appOf(state, APP);
  const scratch = app.convexProjects.find((attached) => attached.projectId === "48232");
  assert.ok(scratch);
  assert.throws(
    () => rotateKeys(state, app, app.workers[0].workerId, scratch.convexProjectId),
    /Deploy the Convex project scratch-project to production first/,
  );
  const workersBefore = state.workers.length;
  const created = call(state, "R", "samebase_create_cloudflare_worker", {
    app: APP,
    workerName: "tmp-admin",
    convexProject: "scratch-project",
  });
  assert.equal(created.ok, false);
  assert.match(created.text, /production first/);
  assert.equal(state.workers.length, workersBefore);
});

check("6. the V4 token rejects a changed rootDirectory and runs the approved request", () => {
  const state = buildFixture("D");
  const first = call(state, "RV4", "samebase_connect_cloudflare_worker", {
    app: APP,
    workerName: "legacy-landing",
    rootDirectory: "apps/site",
  });
  assert.equal(first.ok, true, first.text);
  const token = String(Object.fromEntries(Object.entries(Object(first.result))).confirmationToken);
  const changed = call(state, "RV4", "samebase_connect_cloudflare_worker", {
    app: APP,
    workerName: "legacy-landing",
    rootDirectory: "apps/admin",
    confirmationToken: token,
  });
  assert.equal(changed.ok, false);
  assert.match(changed.text, /request changed after confirmation \(rootDirectory\)/);
  assert.equal(findAccountWorker(state, "legacy-landing")?.attachedTo, null);
  const approved = call(state, "RV4", "samebase_connect_cloudflare_worker", {
    app: APP,
    workerName: "legacy-landing",
    rootDirectory: "apps/site",
    confirmationToken: token,
  });
  assert.equal(approved.ok, true, approved.text);
  assert.equal(findAccountWorker(state, "legacy-landing")?.root, "apps/site");
  const reused = call(state, "RV4", "samebase_connect_cloudflare_worker", {
    app: APP,
    workerName: "legacy-landing",
    rootDirectory: "apps/site",
    confirmationToken: token,
  });
  assert.equal(reused.ok, false);
});

console.log(`${checks} checks passed`);
