# The Mail app as a Samebase template

Date: October 7, 2026. Status: research and design proposal. It informs a second
`repository_actions` template after RFC 126. It does not define product behavior. Every
recommendation here is the author's proposal and open to challenge; a Codex design review ran on
this note, and the last section lists its findings and what changed.

- Base: `origin/main` at `accecddda` (v2105). RFC 126 is read from its branch
  `rfc-repository-actions-provisioning` at `22ede5ca6`. The parity follow-up is
  [PR #1701](https://github.com/samebase/samebase/pull/1701) (the `failed` setup output state).
- Mail: GitHub `samebase/convex-cloudflare-email-inbox` (`samebase/mail` redirects to it) at `main`
  `f97bebb` (v16), read from a tarball snapshot. The local checkout `~/dev/samebase/mail` is on
  `stack-hardening`, an earlier form of its PR 15, and was not changed.
- Packages read from the Mail checkout's `node_modules`: `alchemy@2.0.0-beta.80`,
  `wrangler@4.136.2`, `cf@1.0.0-beta.12`, `@samebase/alchemy-cloudflare-workers-builds@0.5.0`,
  `@samebase/alchemy-convex@0.2.0`. `npm view @samebase/convex-cloudflare-email-inbox versions` on
  2026-10-07 lists one version, `0.1.0`.
- Paths without a prefix are in this repository. `mail:` means the Mail repository at `f97bebb`.
  `alchemy:` means `alchemy/lib/` of the installed beta.80.

## Summary

1. **Shape.** A Mail template is `templates/base-actions` plus the Mail app: the same setup stack
   (Worker shell, Builds link, Convex project and keys named from the repository, `FirstBuild`,
   setup output), plus the inbox wiring imported from the npm package. The package does not export
   it today: `mail:packages/convex-cloudflare-email-inbox/alchemy.ts` says "The published package
   leaves it out", and `0.1.0` has no `./alchemy` export. A package release with that export comes
   first.
2. **Location.** `templates/mail` in this repository, exported like the other templates, with a sync
   check that pins the shared deploy layer to `templates/base-actions` byte for byte. Deciding
   reason: that layer (setup output writer, confirmed destroy, names) changes with Samebase's
   reader, often, and one repository with one check keeps them together. The Mail app code reaches
   the template through the component's npm releases.
3. **Inputs.** One input for Mail, `MAIL_ZONE`. It replaces the hard-coded `json.md` in three files.
   Samebase writes it once as a repository variable in the step that writes `CONVEX_TEAM_ID`; after
   that, the GitHub variable is the authority. The stack reads it and writes it into Convex as
   `MAIL_DOMAIN`, where the app reads it at runtime. Nothing passes repository variables to Workers
   Builds, so the app's build does not read the input directly.
4. **Manifest.** `samebase.template.json` at the template root: inputs, prerequisite check ids, and
   the manual settings. The exporter validates it and copies it into the generated seed manifest.
   The base templates have no file. The checks are Samebase code, keyed by id.
5. **Prerequisites.** Zone active, Email Routing ready, catch-all free, and a workers.dev subdomain
   block creation. Samebase checks the zone facts with a Mail-specific Cloudflare CI token and the
   subdomain with its own Cloudflare connection. `repository_getStatus` reports each check as met,
   unmet, or unavailable, and an unmet one as an attention item with the check id.
6. **The component's Worker code.** Confirmed: the app's Worker hosts the component's handlers
   through the `./worker` export, and the infra function only wires.
7. **Sending credential.** Stays a manual setting in the Convex dashboard. Samebase never receives
   it. The template adds a same-account rule and writes `CLOUDFLARE_EMAIL_ACCOUNT_ID` from the
   stack.
8. **Destroy.** Today a confirmed destroy would leave the catch-all rule pointing at a deleted
   Worker and the mail bytes in R2. Proposed: the stack creates the buckets under Alchemy-generated
   names (so it can never adopt a bucket it did not create), the buckets and the catch-all are
   retained except on the confirmed destroy, and the destroy script never re-deploys a stack that an
   earlier destroy left half deleted.
9. **Four gaps block an agent-made Mail app today**, independent of Samebase: previews fail until a
   person writes the preview bridge secret; the production deploy needs `MAIL_RECOVERY_ADDRESS`; the
   first build races the Worker's secrets; and the Worker configuration names its buckets from a
   default that is right only for the `json.md` install. Sections 1 and 6 propose a fix for each.

## 1. Template shape

### What `templates/base-actions` already gives

The stack in `templates/base-actions/alchemy.run.ts` names everything from the repository through
`scripts/deploy-names.ts`:

```ts
const names = deployNames();
// ...
Effect.gen(function* () {
  // ...
  const shell = yield* WorkersBuilds.Worker("Worker", { name: names.worker }).pipe(
    Alchemy.RemovalPolicy.retain(keepProductionApp),
  );
  const project = yield* Convex.Project("Project", {
    team: yield* Config.Int("CONVEX_TEAM_ID"),
    name: names.convexProject,
  }).pipe(Alchemy.RemovalPolicy.retain(keepProductionApp));
  // ...
});
```

It then declares the two deploy keys, the Builds link with `CONVEX_DEPLOY_KEY` and
`SAMEBASE_CONVEX_PROJECT`, the `FirstBuild` action, and the `samebase` output that
`scripts/publish-setup-output.ts` uploads. `.github/workflows/destroy.yml` runs
`scripts/destroy-app.ts` after the typed confirmation.

### What Mail has instead

`mail:alchemy.run.ts` declares the same Worker shell, project, keys, and Builds link, with fixed
values instead of names from the repository:

```ts
const CONVEX_TEAM = 38516;
const CONVEX_PROJECT = "mail";
const MAIL_ZONE = "json.md";

export default Alchemy.Stack(
  "SamebaseMail",
  // ...
    yield* EmailInbox("Mail", {
      worker,
      deployment,
      deployKey: deployKey.deployKey,
      zone: MAIL_ZONE,
    });
```

It imports `EmailInbox` from the workspace path
`./packages/convex-cloudflare-email-inbox/alchemy.ts` and the Worker name from
`./apps/mail/cloudflare.config.ts`. It publishes no setup output and has no confirmed destroy.

### The order the template needs

Alchemy runs resources that do not depend on each other at the same time. `FirstBuild` in
base-actions depends only on the Builds link, so in a Mail stack the first build could start before
the Worker has `MAIL_BRIDGE_SECRET`, and the `cf` deploy of a version that declares a secret the
Worker lacks fails (`mail:apps/mail/cloudflare.config.ts`: "cf refuses a version whose declared
secret the Worker does not have"). The catch-all, in turn, should route only to a Worker that has a
version. So the template needs this dependency chain, expressed through inputs and outputs, not
through the order of lines:

```text
Worker shell, Convex project, deploy keys
  └─ inbox storage and secrets (buckets, bridge secrets, Convex variables)
       └─ Builds link (its variables carry the bucket names and the Worker name)
            └─ FirstBuild (starts the build and waits until it succeeds)
                 └─ inbox routing (the catch-all of the zone)
```

That splits today's `EmailInbox` into two functions: one for what must exist before the first build,
one for the routing after it.

### The template stack

Proposed changes to `templates/base-actions/alchemy.run.ts` for `templates/mail/alchemy.run.ts`:

```diff
 import * as WorkersBuilds from "@samebase/alchemy-cloudflare-workers-builds";
 import * as Convex from "@samebase/alchemy-convex";
+import { EmailInbox, EmailInboxRouting } from "@samebase/convex-cloudflare-email-inbox/alchemy";
 import * as Alchemy from "alchemy";
@@
-    const deployKey = yield* Convex.DeployKey("DeployKey", {
-      deployment: Output.map(project.prodDeploymentName, (name) => {
+    const deployment = Output.map(project.prodDeploymentName, (name) => {
       // ... unchanged check ...
-      }),
+    });
+    const deployKey = yield* Convex.DeployKey("DeployKey", {
+      deployment,
       name: "workers-builds",
@@
+    // The storage and the secrets of the inbox, before the first build.
+    const inbox = yield* EmailInbox("Mail", {
+      worker: shell,
+      projectId: project.projectId,
+      deployment,
+      deployKey: deployKey.deployKey,
+      retain: keepProductionApp,
+    });
+
     const builds = yield* WorkersBuilds.Repository("Builds", {
       // ...
       variables: {
         CONVEX_DEPLOY_KEY: deployKey.deployKey,
         SAMEBASE_CONVEX_PROJECT: Output.interpolate`version=1&teamId=${project.teamId}&projectId=${project.projectId}`,
+        // cloudflare.config.ts reads both: the Worker to deploy and its bucket.
+        WORKER_NAME: shell.name,
+        MAIL_STORAGE_BUCKET: inbox.storageBucket,
       },
-      previewVariables: { CONVEX_DEPLOY_KEY: previewKey.previewDeployKey },
+      previewVariables: {
+        CONVEX_DEPLOY_KEY: previewKey.previewDeployKey,
+        WORKER_NAME: shell.name,
+        MAIL_STORAGE_BUCKET: inbox.previewStorageBucket,
+      },
     });

-    yield* FirstBuild({
+    const firstBuild = yield* FirstBuild({
       accountId: builds.accountId,
       scriptTag: builds.scriptTag,
       branch: builds.repository.branch,
     });
+
+    // The input of this template. Samebase writes the repository variable
+    // MAIL_ZONE once at creation (samebase.template.json).
+    const zone = yield* Config.String("MAIL_ZONE");
+    yield* EmailInboxRouting("Mail", {
+      worker: shell,
+      zone,
+      // A Worker with a version: the first build has deployed.
+      deployedBuild: firstBuild.buildUuid,
+      retain: keepProductionApp,
+    });
+    // The app reads the domain at runtime: convex/inboxes.ts and convex/bootstrap.ts.
+    yield* Convex.EnvironmentVariable("MailDomain", {
+      deployment,
+      deployKey: deployKey.deployKey,
+      name: "MAIL_DOMAIN",
+      value: zone,
+    });
+    yield* Convex.DefaultEnvironmentVariable("PreviewMailDomain", {
+      projectId: project.projectId,
+      deploymentType: "preview",
+      name: "MAIL_DOMAIN",
+      value: zone,
+    });
```

`FirstBuild` changes too: today it posts the build and returns `{ triggerUuid }`. It should return
the build's id and wait until the build succeeds, so that routing waits for a deployed Worker. The
first deploy then takes as long as one Workers build (about 80 seconds in the RFC 126 dogfood) and
stays inside the 15-minute job limit. Because an Action runs again only when its input changes, the
wait happens once per Worker.

The setup output stays version 1. The buckets and the catch-all are neither Workers nor Convex
projects, and Samebase does not need their identity to show the app, so the contract does not change
("A new kind, such as buckets or email routing, is a new list or a new section, and that is a new
version", `templates/base-actions/scripts/setup-output.ts`).

### The inbox functions in the package

`mail:packages/convex-cloudflare-email-inbox/alchemy.ts` today declares five things under the `Mail`
namespace: `Alchemy.Random("BridgeSecret")`, the Worker secret `MAIL_BRIDGE_SECRET`, the Convex
variables `MAIL_BRIDGE_SECRET` and `MAIL_WORKER_URL`, and the catch-all rule:

```ts
Effect.gen(function* () {
  // ...
  yield* Cloudflare.Email.CatchAll("CatchAll", {
    zone: props.zone,
    name: Output.interpolate`${workerName} catch-all`,
    enabled: true,
    actions: [{ type: "worker", value: [workerName] }],
  }).pipe(Alchemy.RemovalPolicy.retain());
});
```

Proposed, as a sketch of the props and the additions; the five existing declarations stay, with the
catch-all moved into the second function:

```ts
export interface EmailInboxProps {
  readonly worker: WorkersBuilds.Worker;
  /** The Convex project, for the preview defaults. */
  readonly projectId: Alchemy.Input<number>;
  readonly deployment: Alchemy.Input<string>;
  readonly deployKey: Alchemy.Input<Redacted.Redacted<string>>;
  /** Whether a destroy keeps the stored mail. The app's confirmed destroy passes false. */
  readonly retain: Effect.Effect<boolean>;
}

export const EmailInbox = (id: string, props: EmailInboxProps) =>
  Namespace.push(
    id,
    Effect.gen(function* () {
      const workerName = props.worker.name;
      // ... today's bridge secret and MAIL_WORKER_URL, unchanged ...

      // The stored mail: raw messages and attachments. No name: Alchemy generates
      // `<stack>-<id>-<stage>-<random>`, so the stack can never take over a bucket
      // that it did not create. The Builds variables carry the names to the Worker.
      const storage = yield* Cloudflare.R2.Bucket("Storage", { forceDestroy: true }).pipe(
        Alchemy.RemovalPolicy.retain(props.retain),
      );
      const previewStorage = yield* Cloudflare.R2.Bucket("PreviewStorage", {
        forceDestroy: true,
      }).pipe(Alchemy.RemovalPolicy.retain(props.retain));

      // Previews share one bridge secret, other than production's, on the
      // Worker's preview settings and in the Convex preview defaults.
      const previewSecret = yield* Alchemy.Random("PreviewBridgeSecret");
      yield* Convex.DefaultEnvironmentVariable("ConvexPreviewBridgeSecret", {
        projectId: props.projectId,
        deploymentType: "preview",
        name: "MAIL_BRIDGE_SECRET",
        value: previewSecret.text,
      });
      yield* WorkersBuilds.PreviewSecret("WorkerPreviewBridgeSecret", {
        worker: workerName,
        name: "MAIL_BRIDGE_SECRET",
        value: previewSecret.text,
      });

      // The template's rule: the app sends from the account of its Worker and zone.
      yield* Convex.EnvironmentVariable("ConvexEmailAccountId", {
        deployment: props.deployment,
        deployKey: props.deployKey,
        name: "CLOUDFLARE_EMAIL_ACCOUNT_ID",
        value: props.worker.accountId,
      });

      return { storageBucket: storage.bucketName, previewStorageBucket: previewStorage.bucketName };
    }),
  );
```

`EmailInboxRouting` holds today's `CatchAll` with `retain(props.retain)` instead of an unconditional
`retain()`, and takes `deployedBuild` only as an input that orders it after the first build.

Four of these change earlier decisions and are decision 3:

- The buckets move from "named by the Worker configuration, created by hand" (`mail:README.md`,
  Manual steps 3) to the stack, under generated names. `cf deploy` would create a missing named
  production bucket itself (its deploy input sets `resourcesProvision: !0`, read in the installed
  `cf` dist), but not the preview bucket, and a bucket that the Worker deploy creates is invisible
  to the confirmed destroy. Section 6 gives the ownership reason for generated names.
- The preview bridge secret needs a resource that does not exist. The 2026-10-05 note says "A
  preview-aware Worker secret in the provider is no longer needed: Wrangler has it". That holds for
  a person with a laptop; a template that nobody touches by hand needs it in the stack, or every
  preview build of a new app fails on the declared `MAIL_BRIDGE_SECRET`.
  `WorkersBuilds.PreviewSecret` is a new resource in `@samebase/alchemy-cloudflare-workers-builds`.
- `CLOUDFLARE_EMAIL_ACCOUNT_ID` moves from "Settings the stack does not touch" to the stack. The
  component keeps it as an independent setting; the same-account rule belongs to this template.
- Previews keep sharing one bridge secret and one bucket, as Mail does today. That separates
  production from previews, not previews from each other: object grants carry no deployment identity
  (`mail:packages/convex-cloudflare-email-inbox/src/r2.ts`).

The Alchemy input types in these sketches (`props.worker.accountId`, `shell.name` as a Builds
variable, a bucket name as an output) are not checked here.

### The package change

The inbox functions must reach the template through npm. Proposed changes in
`mail:packages/convex-cloudflare-email-inbox/`, with `alchemy.ts` moved to `src/alchemy.ts`:

```diff
 // tsconfig.json
-  "include": ["src/client/**/*.ts", "src/component/**/*.ts", "src/worker/**/*.ts", "src/r2.ts"],
+  "include": [
+    "src/client/**/*.ts",
+    "src/component/**/*.ts",
+    "src/worker/**/*.ts",
+    "src/r2.ts",
+    "src/alchemy.ts"
+  ],
```

```diff
 // package.json
   "exports": {
+    "./alchemy": {
+      "types": "./dist/alchemy.d.ts",
+      "default": "./dist/alchemy.js"
+    },
@@
   "peerDependencies": {
     "convex": "^1.45.0",
-    "convex-test": "^0.0.56"
+    "convex-test": "^0.0.56",
+    "@samebase/alchemy-cloudflare-workers-builds": "^0.6.0",
+    "@samebase/alchemy-convex": "^0.3.0",
+    "alchemy": "2.0.0-beta.80",
+    "effect": "^4.0.0"
   },
   "peerDependenciesMeta": {
-    "convex-test": { "optional": true }
+    "convex-test": { "optional": true },
+    "@samebase/alchemy-cloudflare-workers-builds": { "optional": true },
+    "@samebase/alchemy-convex": { "optional": true },
+    "alchemy": { "optional": true },
+    "effect": { "optional": true }
   }
```

The existing `component:test-package` check (`scripts/check-email-package.ts`, a fresh consumer of
the packed tarball) must import `./alchemy` too, so the export is proven against the packed files.
Optional peers keep Alchemy out of an app that only sends: Samebase itself mounts the component for
sending only (`apps/samebase/convex/convex.config.ts`). The exact `alchemy` peer couples the
component's release to the template's Alchemy version while Alchemy is in beta. `0.6.0` stands for
the provider release with `PreviewSecret`.

### The app files

The template takes the app from `mail:apps/mail` and the tooling from `templates/base-actions`. Of
the 21 tooling and configuration files that exist in both, 15 are byte-identical on `f97bebb`: the
dev runners (`run-context-dev.ts` with its test, `run-primary-dev.ts`, `run-worktree-dev.ts`),
`ensure-convex-auth.ts` with its test, `verify-current-branch-head.ts` with its test,
`generate-cloudflare-redirects.ts`, `generate-dev-launcher-version.ts`, `tsconfig.json`,
`components.json`, `convex.json`, `convex/auth.config.ts`, and `convex/tsconfig.json`. The other six
differ: `build-cloudflare.ts` and its test, `generate-cloudflare-redirects.test.ts`,
`prerender.config.ts`, `vite.config.ts`, and `tsconfig.node.json`. `build-cloudflare.ts` differs by
one line, which goes away with the npm package:

```ts
await runCommand(["run", "component:build"], { ...env, CONVEX_DEPLOY_KEY: undefined });
```

The Worker stays on `cloudflare.config.ts` and `cf` (decision 2), with Mail's `wrangler.config.ts`,
`scripts/build-worker.ts`, and `scripts/deploy-mail.ts`. Mail runs this shape in production,
including the preview build and the preview output line that Workers Builds needs for its pull
request comment. The configuration reads the names from the stack's Builds variables instead of a
default:

```diff
-const name = process.env["WRANGLER_CI_OVERRIDE_NAME"] ?? "samebase-mail";
+// The Worker and the buckets come from the setup stack's Builds variables. A
+// Workers build without them would deploy or bind another app's resources.
+function stackValue(variable: "WORKER_NAME" | "MAIL_STORAGE_BUCKET", local: string) {
+  const value = process.env[variable];
+  if (value) return value;
+  if (process.env["WORKERS_CI"]) {
+    throw new Error(`${variable} is unset. The setup stack writes it as a Builds variable.`);
+  }
+  return local;
+}
+const name = stackValue("WORKER_NAME", "mail-local");
+const bucket = stackValue("MAIL_STORAGE_BUCKET", "mail-local");
@@
   env: {
     ...env,
-    MAIL_STORAGE: bindings.r2({ name }),
-    MAIL_RECOVERY_ADDRESS: bindings.secret(),
+    MAIL_STORAGE: bindings.r2({ name: bucket }),
   },
@@
-    ? { ...worker, env: { ...env, MAIL_STORAGE: bindings.r2({ name: `${name}-previews` }) } }
+    ? { ...worker, env: { ...env, MAIL_STORAGE: bindings.r2({ name: bucket }) } }
```

The production and preview builds see different `MAIL_STORAGE_BUCKET` values, because the stack
writes one as a production Builds variable and the other as a preview Builds variable. Reading
`WORKER_NAME` from the stack removes the dependency on `WRANGLER_CI_OVERRIDE_NAME` during the build
command, which the `cf` gaps note (gap 8) records as unverified; in a template, a silent default
would bind the buckets of the `json.md` install when both live in one account.

Dropping `MAIL_RECOVERY_ADDRESS: bindings.secret()` lets the first production build pass before a
person sets the recovery address. `mail:apps/mail/worker/index.ts` already reads it as optional
(`if (env.MAIL_RECOVERY_ADDRESS)`), so the Worker's `Env` type needs the field as optional. Codex
cites a `cf` change that keeps undeclared Worker secrets on deploy; this note did not verify it in
the installed beta.12.

The hard-coded domain goes away in the app:

```diff
 // convex/inboxes.ts
 export const create = mutation({
-  args: { domain: v.string(), localPart: v.string(), label: v.string() },
+  args: { localPart: v.string(), label: v.string() },
   returns: v.string(),
   handler: async (ctx, args) => {
     await requireOwner(ctx);
+    const domain = process.env["MAIL_DOMAIN"];
+    if (!domain) throw new Error("MAIL_DOMAIN is not set. The setup stack writes it.");
     return await email.createInbox(ctx, {
-      address: `${args.localPart.trim()}@${args.domain.trim()}`,
+      address: `${args.localPart.trim()}@${domain}`,
       label: args.label,
     });
   },
 });
+
+export const domain = query({
+  args: {},
+  returns: v.union(v.string(), v.null()),
+  handler: async (ctx) => {
+    await requireOwner(ctx);
+    return process.env["MAIL_DOMAIN"] ?? null;
+  },
+});
```

`convex/bootstrap.ts` reads the same variable instead of `domain: "json.md"`, and
`src/components/mail/MailWorkspace.tsx` shows `New {domain} address` from `api.inboxes.domain`
instead of `New json.md address`. The server decides the domain, so a client cannot create an inbox
on another domain.

Until an inbox exists, the Worker rejects every message permanently: the component answers an
unknown recipient with a rejection, and the recovery forward runs only when storage fails. A new app
therefore bounces mail between its first deploy and the owner's first inbox. The template should
create the default inboxes (`inbox@`, `notes@`) when the owner first signs in, so the window ends
with the person's one setup step. Keeping the catch-all disabled until then would need the stack to
read app data, and a disabled catch-all drops mail without telling the sender.

### Shared and per-template files

`scripts/deploy-names.ts`, `scripts/setup-output.ts`, `scripts/publish-setup-output.ts`, and
`scripts/destroy-app.ts` stay byte-identical to base-actions (the last one changes for every
template, section 6). Both workflows become per-template files, because both need the input next to
the existing variable (the destroy deploys the stack once, section 6):

```diff
 env:
   CI: "true"
   CONVEX_TEAM_ID: ${{ vars.CONVEX_TEAM_ID }}
+  MAIL_ZONE: ${{ vars.MAIL_ZONE }}
```

A generic form, one `${{ toJSON(vars) }}` variable that a shared script validates against the
manifest, would keep both workflows shared. It is more code than two lines and is worth it when a
third template has inputs.

### Where the template lives

| Option                                                                                  | For                                                                                                                                                                                                                                                                                              | Against                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A. `templates/mail` here, exported to a public repository, with a sync check            | Same model as the other templates. The shared deploy layer and Samebase's setup output reader change in one pull request (`docs/repository-exports.md`: a template change, its generated manifest, and its export in one pull request). CI audits and builds the template with its own lockfile. | The Mail app code has two homes: `mail:apps/mail` (the live `json.md` install and the component's test bed) and `templates/mail`.                                                                                                                                                                      |
| B. The Mail repository holds the template; Samebase imports a pinned tree at build time | One home for the app code, next to the component. No fetch at creation: the exporter would import the pinned tree.                                                                                                                                                                               | The Mail repository is a pnpm workspace with the component's source (`"workspace:*"`), so it would need a new standalone template directory. Every change to the shared deploy layer becomes a Mail pull request plus a pin bump here, and the layer has changed in most RFC 126 pull requests so far. |

Recommendation: A. Deciding reason: the shared deploy layer is Samebase's contract and is still
changing often; the Mail app code changes with the component and reaches the template through npm
releases. The two-homes cost is real: `templates/mail` becomes the one source for the template's app
code, and `mail:apps/mail` stays the `json.md` install, whose Worker (`samebase-mail`), project
(`mail`), and buckets do not follow the template's names. Moving that install onto a repository made
from the template is a data move (R2 objects into new buckets), left out here.

The sync check reverses the base-actions model. `templates/base-actions` must equal `templates/base`
everywhere except a list of deploy paths. `templates/mail` must equal `templates/base-actions` on a
list of shared paths and may differ everywhere else, because most of its files are app files:

```ts
// scripts/check-template-sync.ts
/** The paths that templates/mail shares with templates/base-actions, byte for byte. */
export const mailSharedPaths = [
  "scripts/deploy-names.ts",
  "scripts/deploy-names.test.ts",
  "scripts/setup-output.ts",
  "scripts/publish-setup-output.ts",
  "scripts/publish-setup-output.test.ts",
  "scripts/destroy-app.ts",
  "scripts/build-cloudflare.ts",
  "scripts/ensure-convex-auth.ts",
  "scripts/verify-current-branch-head.ts",
  "scripts/run-context-dev.ts",
  "scripts/run-primary-dev.ts",
  "scripts/run-worktree-dev.ts",
  ".github/workflows/ci.yml",
  // ... the remaining tooling files, each named
];
```

The public repository needs a new name. `samebase/mail` is the old name of the component repository
and GitHub redirects it, so reusing it would break those links.
`scripts/publish-repository-exports.ts` has five targets today; Mail would be the sixth.

## 2. Inputs, prerequisites, settings

Every value of a Mail install, classified. "Stack" means the setup stack creates it. Every value
named in `mail:README.md` "Settings the stack does not touch" and "Manual steps" is in this table.

| Value                                                  | Class                          | Owner after this proposal                                                       |
| ------------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------- |
| Worker shell, Builds link, Builds variables            | Automatic                      | Stack (base-actions)                                                            |
| Convex project, production and preview deploy keys     | Automatic                      | Stack (base-actions)                                                            |
| `MAIL_BRIDGE_SECRET` (production, Worker and Convex)   | Automatic                      | Stack, `EmailInbox` (today)                                                     |
| `MAIL_WORKER_URL` (Convex production)                  | Automatic                      | Stack, `EmailInbox` (today); previews: `scripts/deploy-mail.ts` (today)         |
| Catch-all rule of the zone                             | Automatic                      | Stack, `EmailInboxRouting` (today in `EmailInbox`)                              |
| `MAIL_BRIDGE_SECRET` (previews, Worker and Convex)     | Automatic                      | Stack, `EmailInbox` (proposed; manual today)                                    |
| `CLOUDFLARE_EMAIL_ACCOUNT_ID` (Convex)                 | Automatic                      | Stack, `EmailInbox` (proposed; manual today)                                    |
| The two R2 buckets                                     | Automatic                      | Stack, `EmailInbox`, generated names (proposed; manual today)                   |
| `MAIL_DOMAIN` (Convex production and preview defaults) | Automatic, from the input      | Stack (proposed; hard-coded `json.md` today)                                    |
| `MAIL_ZONE`                                            | Input, given once              | Person or agent, at creation; then the GitHub repository variable               |
| Zone on Cloudflare, active                             | Prerequisite                   | Person: nameservers at the registrar                                            |
| Email Routing enabled on the zone                      | Prerequisite                   | Person: it replaces the zone's MX records                                       |
| Catch-all rule free                                    | Prerequisite                   | Person: it may forward mail elsewhere today                                     |
| workers.dev subdomain of the account                   | Prerequisite                   | Person: it names every Worker URL of the account                                |
| Cloudflare Workers GitHub App on the owner             | Prerequisite                   | Person, as for base-actions (RFC 126 open item 5)                               |
| Email Sending domain onboarded                         | Prerequisite, for sending only | Person                                                                          |
| Destination address verified                           | Prerequisite of a setting      | Person: a click in the verification email                                       |
| `OWNER_EMAIL`, `OWNER_SETUP_SECRET`                    | Setting                        | Convex dashboard: production and preview defaults                               |
| `CLOUDFLARE_EMAIL_API_TOKEN`                           | Setting, credential            | Convex dashboard: production (section 5)                                        |
| `MAIL_RECOVERY_ADDRESS`                                | Setting                        | Cloudflare dashboard: Worker secret, after the destination is verified          |
| Default inboxes (`inbox@`, `notes@`)                   | Automatic, proposed            | The app, on the owner's first sign-in; today `bootstrap:defaultInboxes` by hand |

Only one value is an input. Rule 1 of the 2026-10-05 note decides the others: an input is a value
the stack needs in order to create or wire something. The owner email, the setup code, the sending
token, and the recovery address are values a person opens a dashboard to check, so a declared copy
would turn every dashboard edit into drift. The parked templates RFC (PR #1646) proposed all five as
inputs, with secret ones as GitHub secrets. This note keeps only the zone, for that reason.

### The prerequisite checks

Each check is Samebase code with an id. Samebase's own Cloudflare connection has only the Workers,
Workers Builds, and account scopes (`CLOUDFLARE_OAUTH_SCOPES` in
`apps/samebase/convex/cloudflareOAuth.ts`), so it cannot read zones. The zone checks use the Mail CI
token of decision 6, which the organization pastes like the existing one; Samebase already reads
with the existing CI token when it is saved and when an app is created
(`requireCloudflareCiTokenPermissions` on PR #1701).

| Id                       | Check                                                                                                                    | Credential                       | Permission                                             | Blocks creation |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------- | ------------------------------------------------------ | --------------- |
| `cloudflare_zone_active` | `GET /zones?name=<zone>&account.id=<account>`: one zone, `status: "active"`                                              | Mail CI token                    | Zone Read                                              | Yes             |
| `email_routing_ready`    | `GET /zones/{zone_id}/email/routing`: `enabled: true`, `status: "ready"`                                                 | Mail CI token                    | Zone Settings Read                                     | Yes             |
| `catch_all_available`    | `GET /zones/{zone_id}/email/routing/rules/catch_all`: disabled, or `drop`, or a `worker` action naming this app's Worker | Mail CI token                    | Email Routing Rules Read (the stack needs Write)       | Yes             |
| `workers_dev_subdomain`  | `GET /accounts/{account_id}/workers/subdomain`: a subdomain exists                                                       | Samebase's Cloudflare connection | Workers Scripts Read (`workers-scripts.read`)          | Yes             |
| `email_sending_domain`   | `GET /zones/{zone_id}/email/sending/subdomains`: an entry named the zone with `enabled: true`                            | Mail CI token                    | Not documented; Email Sending Read is the likely group | No              |

Notes on each, including what an API could do and why a person still does it:

- **Zone.** `POST /zones` can add a zone, but the nameserver change happens at the registrar. Only a
  person can do it.
- **Email Routing.** `POST /zones/{zone_id}/email/routing/enable` exists (deprecated, Zone Settings
  Write) and "Add[s] and lock[s] the necessary MX and SPF records". On a domain that receives mail
  elsewhere, that ends the old delivery. This needs a person's yes; the `EmailInbox` comment already
  leaves enablement to the dashboard.
- **Catch-all.** Alchemy's `CatchAll` takes over an existing rule without `--adopt`: "a cold read
  adopts freely (never `Unowned`)" (`alchemy:Cloudflare/Email/CatchAll.js`). A zone whose catch-all
  forwards to a person's mailbox would lose that forward without a warning, and two Mail apps on one
  zone would take the rule from each other. A check before creation does not cover later changes
  (two creations at once, a later edit of `MAIL_ZONE`), so the same check runs on every status read,
  and section 6 adds a guard to the destroy.
- **workers.dev.** `PUT /accounts/{account_id}/workers/subdomain` exists, but the name is public and
  account-wide, so a person picks it. `EmailInbox` stops the deploy without it ("Set the workers.dev
  subdomain of the Cloudflare account.").
- **Email Sending.** `Cloudflare.Email.SendingSubdomain` could create it in the stack. It stays a
  person's step because it is optional for receiving and because the stack would need Email Sending
  Write, which is account-scoped: anyone who can push a workflow could then send mail as every
  onboarded domain of the account.
- **Destination address.** `GET /accounts/{account_id}/email/routing/addresses` returns `verified`
  per address (Email Routing Addresses Read). Samebase can check it only when it knows the address,
  and the recovery address is a setting, so Samebase does not check it. The person verifies it
  before setting the Worker secret.

The existing CI token preset (`CLOUDFLARE_CI_TOKEN_PERMISSION_GROUPS` in
`apps/samebase/shared/cloudflareResourceUrls.ts`) has Workers Scripts Edit, Workers Builds
Configuration Edit, Secrets Store Edit, and Account Settings Read. The Mail stack and checks add
Zone Read, Zone Settings Read, and Email Routing Rules Edit (all zone-scoped, so the token can be
limited to the chosen zones) and Workers R2 Storage Edit (account-scoped, for the buckets).
`mail:README.md` also lists DNS; nothing in the current or proposed stack writes DNS, and this note
cannot say why it is there.

### Where the zone flows

```text
New App form or repository_create { template: "mail", inputs: [{ name: "MAIL_ZONE", value }] }
  └─ write_actions_secrets, once: repository variable MAIL_ZONE (with CONVEX_TEAM_ID)
       └─ alchemy.yml env MAIL_ZONE ─ alchemy.run.ts Config.String("MAIL_ZONE")
            ├─ EmailInboxRouting: catch-all rule of the zone
            ├─ Convex production env MAIL_DOMAIN ─ convex/inboxes.ts, convex/bootstrap.ts
            │                                     └─ api.inboxes.domain ─ MailWorkspace.tsx
            └─ Convex preview default MAIL_DOMAIN ─ the same, in previews
  repository_getStatus reads the current repository variable for the zone checks
```

The brief for this note proposed that the app's build reads the repository variable. Workers Builds
runs outside GitHub Actions, and the template passes it only Builds variables, so the build would
need a stack-written copy. A runtime read from Convex needs no copy and no rebuild when the value
changes.

## 3. How inputs travel

### The manifest

`templates/mail/samebase.template.json`, seeded into the app repository with every other file:

```json
{
  "version": 1,
  "inputs": [
    {
      "name": "MAIL_ZONE",
      "label": "Mail domain",
      "description": "A domain in the connected Cloudflare account. Every address on it is routed to this app; an address without an inbox is rejected.",
      "kind": "cloudflare_zone",
      "prerequisites": [
        "cloudflare_zone_active",
        "email_routing_ready",
        "catch_all_available",
        "email_sending_domain"
      ]
    }
  ],
  "prerequisites": ["workers_dev_subdomain"],
  "settings": [
    {
      "name": "OWNER_EMAIL",
      "where": ["convex_production", "convex_preview_defaults"],
      "description": "The only email that can sign in."
    },
    {
      "name": "OWNER_SETUP_SECRET",
      "where": ["convex_production", "convex_preview_defaults"],
      "description": "The code that the first sign-up requires."
    },
    {
      "name": "CLOUDFLARE_EMAIL_API_TOKEN",
      "where": ["convex_production"],
      "description": "A Cloudflare API token with Email Sending Write for this account. Without it the app does not send; sends end as email_not_configured."
    },
    {
      "name": "MAIL_RECOVERY_ADDRESS",
      "where": ["worker_secret"],
      "description": "A verified Email Routing destination that gets the mail the app cannot store."
    }
  ]
}
```

Rules, all checked by the exporter:

- `version` is `1`. Unknown fields fail the export, as in the setup output contract.
- `kind` is a closed set in Samebase. One kind now: `cloudflare_zone` (a lowercase host name with a
  dot, at most 253 characters, labels of letters, digits, and inner hyphens). Every input is a
  required, non-secret string. Secret inputs do not exist in version 1 (section 5).
- `prerequisites` are ids from Samebase's check registry. The registry, not the manifest, decides
  whether a check blocks creation, because the check is Samebase code with a Samebase credential. A
  template never makes Samebase run template code (the parked RFC: "Never import a manifest as
  executable TypeScript").
- Input names must not be `CONVEX_TEAM_ID`, start with `CLOUDFLARE_`, `CONVEX_`, or `GITHUB_`
  (GitHub rejects that prefix for variables), or repeat.
- `settings` is data for people and agents: what to set by hand after the setup run. Samebase cannot
  read these values (section 5) and does not report them as attention items.

`templates/base` and `templates/base-actions` have no file. No file means no inputs, no
prerequisites, and no settings.

### The exporter and the seed

`scripts/export-starter-manifest.ts` gets a third template and reads the file from the collected,
staged files, so the seed and the manifest come from the same bytes:

```diff
 export type StarterTemplateManifest = {
   version: string;
   // ...
   fileModes: Record<string, "100644" | "100755">;
+  template: StarterTemplateContract;
 };
@@ function buildManifest(files, identity) {
+  const contractFile = files.find((file) => file.relativePath === "samebase.template.json");
+  const template = contractFile
+    ? decodeTemplateContract(JSON.parse(contractFile.rawContent.toString("utf8")))
+    : { version: 1, inputs: [], prerequisites: [], settings: [] };
   return {
     version: `${identity.versionPrefix}-${contentHash.slice(0, 12)}`,
     // ...
+    template,
   };
 }
@@ export async function renderStarterSeedManifests(repoRoot: string) {
+  const mailFiles = await collectTemplateFiles(repoRoot, mailTemplateSourceRoot);
+  const mailManifest = buildManifest(mailFiles, {
+    versionPrefix: "samebase-mail",
+    sourcePath: mailTemplateSourceRoot,
+    publishedRepo: "https://github.com/samebase/<mail template repository>.git",
+    commitMessage: "Initialize app from the Samebase Mail template",
+  });
```

`decodeTemplateContract` is the one schema, strict, in the exporter. The generated
`starterSeedManifest.mail.generated.ts` carries the typed result, and the Convex side reads that
type. The seed (`seedRepositoryWithStarter`) is unchanged: it pushes the files, including the JSON
file.

### Creation

`repository_create` today picks the manifest by mode only, when the seed step runs:

```ts
const manifest = repositoryActions ? actionsStarterTemplateManifest : starterTemplateManifest;
```

Proposed contract change (`apps/samebase/convex/repository/contracts/createRepository.ts`):

```diff
   mcpArgs: {
     // ...
     provisioning: optional(vRepositoryProvisioningMode),
+    template: optional(union(literal("base"), literal("mail"))),
+    inputs: optional(array(object({ name: string(), value: string() }))),
   },
```

- `template` defaults to `base`. `mail` requires `provisioning: "repository_actions"`.
- `inputs` must name every declared input once and nothing else; each value passes its `kind`.
- The pre-checks that run before anything is created (CI tokens, installation permissions, name
  availability, quota) also run every blocking prerequisite check. A failure names the check, the
  input, and the dashboard page that fixes it, so an agent can ask the person and call again.
- The MCP description lists the templates with their inputs, prerequisites, and settings, generated
  from the manifests. A separate list tool waits for a third template.

The plan stores the choice and the manifest version that the checks validated. The seed step
compares that version with the compiled manifest and fails closed when they differ (a Samebase
deploy landed in between); Samebase holds only the current compiled manifest, so it cannot seed an
older one. Proposed change to the `repository_actions` variant in
`apps/samebase/convex/repository/provisioningModel.ts`:

```diff
 const vRepositoryActionsProvisioningPlan = object({
   provisioning: literal("repository_actions"),
   repositoryId: id("repositories"),
   convexConfigPath: string(),
+  /** Absent for the base template. */
+  template: optional(
+    object({
+      id: literal("mail"),
+      manifestVersion: string(),
+      /** Written once by write_actions_secrets; the GitHub variables are the authority after that. */
+      inputs: union(
+        object({ state: literal("planned"), values: array(object({ name: string(), value: string() })) }),
+        object({ state: literal("written"), writtenAt: number() }),
+      ),
+    }),
+  ),
   ciSecrets: vRepositoryActionsCiSecrets,
```

The field is optional, so no live plan row changes shape. A required field would fall under the
precondition of `specs/003_REPOSITORY_INFRA_PROVISIONING_SPEC.md` (zero plan rows, cleared by the
operator), which is not worth it for one template.

### Writing the variables

`write_actions_secrets` already writes the variable that the stack needs, before the seed push that
starts the first run (the step order is create, connect, `write_actions_secrets`, seed, sync). The
inputs join it while they are `planned`, and the plan records `written` with the values dropped:

```diff
     await writeGitHubActionsSecrets({
       octokit,
       owner: repository.owner.login,
       repo: repository.name,
       secrets: [
         { name: "CLOUDFLARE_API_TOKEN", value: target.cloudflareApiToken },
         { name: "CLOUDFLARE_ACCOUNT_ID", value: target.cloudflareAccountId },
         { name: "CONVEX_ACCESS_TOKEN", value: target.convexAccessToken },
       ],
-      variables: [{ name: "CONVEX_TEAM_ID", value: target.convexTeamId }],
+      variables: [{ name: "CONVEX_TEAM_ID", value: target.convexTeamId }, ...target.plannedInputs],
       recordApiCall,
     });
```

A retry that repeats the step writes the secrets and `CONVEX_TEAM_ID` again but not inputs that are
already `written`, so it never reverts a person's edit of `MAIL_ZONE` in GitHub. For the same reason
`repository_getStatus` reads the current variable
(`GET /repos/{owner}/{repo}/actions/variables/MAIL_ZONE`, the Variables permission the GitHub App
already has) for the zone checks. Changing the zone of a running app moves its routing to another
domain; it is a migration a person starts, not part of this proposal.

### Reporting prerequisites

`repository_getStatus` gains the checks for a `repository_actions` repository whose template
declares any. The Node read in `apps/samebase/convex/repository/status.ts` runs them next to the
other provider reads, and the result keeps the three states apart:

```ts
// repository_getStatus.setupStack, for a template with prerequisites
prerequisites: Array<{
  id: TemplatePrerequisite;
  input: string | null;
  state: "met" | "unmet" | "unavailable";
  detail: string;
}>;
```

`unavailable` (a provider error, a token without the permission) stays visible as a fact and, like
every other unreadable fact, gives no attention item. `unmet` gives an attention item with a new
variant:

```diff
 // apps/samebase/convex/repository/contracts/getRepositoryStatus.ts
 const vRepositoryAttentionItem = union(
   // ...
+  object({
+    tool: v.null(),
+    prerequisite: vTemplatePrerequisite,
+    problem: string(),
+  }),
 );
```

The `problem` text says what is wrong, why the app needs it, and the Cloudflare dashboard page that
fixes it, for example: "Email Routing is not enabled on example.com, so the catch-all rule cannot be
created. Enable it in the Cloudflare dashboard (it replaces the domain's MX records):
https://dash.cloudflare.com/...". The id lets an agent tell "ask the person" from "read again
later". The plan projection that the dashboard and status read
(`apps/samebase/convex/repository/dashboard.ts`) gains the template id. The `settings` of the
manifest appear in the `repository_create` result and on the repository's Overview as a fixed list
that says Samebase cannot read these values.

## 4. The component's Worker code

Confirmed from the code:

- `mail:apps/mail/worker/index.ts` is the app's Worker. It imports the component's handlers and
  calls them from its own `fetch` and `email` exports:

  ```ts
  import { downloadObject, receiveEmail } from "@samebase/convex-cloudflare-email-inbox/worker";
  // ...
      if (request.method === "GET" && url.pathname === "/api/mail/object") {
        return await downloadObject(request, env);
      }
  // ...
    async email(message, env) {
      try {
        await receiveEmail(message, env);
  ```

  `receiveEmail` and `downloadObject` are the only exports of
  `mail:packages/convex-cloudflare-email-inbox/src/worker/index.ts`, and they receive their bindings
  (`CONVEX_SITE_URL`, `MAIL_BRIDGE_SECRET`, `MAIL_STORAGE`) from the app's `env`.

- `EmailInbox` creates no Worker and uploads no code. It takes the app's Worker as a prop
  (`readonly worker: WorkersBuilds.Worker`) and declares a random value, a Worker secret, two Convex
  variables, and the catch-all rule whose action names that Worker.

What this means for the split rule: the component's runtime code is part of the app's Worker
version, so the Worker configuration and Workers Builds own it like any app code (rule 2). The infra
functions are wiring on the stack side (rule 1) and never cross into code. The catch-all is the one
place where rule 2 would allow Wrangler (`addresses` is "a trigger of this Worker"). It stays in the
stack for the template: its zone is an input that the Worker configuration does not see, and the
default Workers Builds token has no Email Routing permission (2026-10-05 note, the Wrangler table).

For a future component that needs its own Worker, the existing pieces allow it without deciding it
now: one configuration file per Worker, one Builds connection per Worker with a root directory, and
a setup output whose `cloudflare.workers` is already a list with `rootDirectory`. Mounting in the
app's Worker stays the default, including a component's Durable Object class, which the app's Worker
can re-export and declare in its own configuration.

## 5. The sending credential

`CLOUDFLARE_EMAIL_API_TOKEN` is read by the component in Convex (`delivery.ts`:
`env.CLOUDFLARE_EMAIL_API_TOKEN?.trim()`; without it a send ends as `email_not_configured`). It is
an account-scoped token with Email Sending Write that a person creates. Cloudflare does not let a
third party mint it: account API token provisioning through OAuth is open only to Cloudflare's own
CLI (2026-10-05 note).

| Option                                                                                    | What Samebase holds                                                                                       | Problem                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a. Secret input; Samebase writes it into Convex with the organization's Convex connection | The token, from the create call until the stack has created the deployment, which can be minutes or never | Samebase stores a credential it does not need. The Management API description in this repository has no production environment endpoint (only project defaults), so Samebase would also mint a deploy key for the user's deployment to call the deployment API. In this mode Samebase writes nothing on Convex. |
| b. Repository secret; the stack copies it into Convex                                     | The token until `write_actions_secrets` succeeds (the workflow journal and the retry need it)             | The 2026-10-05 note rejects this chain: "Routing operator values through repository secrets into Convex rebuilt the GitHub-to-CI-to-server chain that was painful before." A rotation in the Convex dashboard becomes drift that the next deploy reverts. Anyone who can push a workflow can read it.           |
| c. A setting a person adds in the Convex dashboard; the manifest lists it                 | Nothing                                                                                                   | A manual step. Samebase cannot see whether it is done.                                                                                                                                                                                                                                                          |
| d. The stack mints a narrow token with `Cloudflare.ApiToken.AccountApiToken`              | Nothing                                                                                                   | The CI token would need Account API Tokens Write, which lets anyone who can push a workflow mint a token with any permission in the account.                                                                                                                                                                    |

Recommendation: c. Deciding reason: it is the only option that needs neither a Samebase-held secret
(a, b) nor a broader CI permission (d), the Convex dashboard stays the token's one owner, and the
app receives mail without it. The manifest names the setting, the `repository_create` result and the
Overview show it with the Convex dashboard link, an agent asks the person for it, and the app shows
"sending is not configured" while sends end as `email_not_configured`. When Cloudflare opens account
token provisioning to third-party OAuth clients, a token minted for this one purpose becomes
possible without the broad permission.

One alternative changes the component instead: the Worker's `send_email` binding needs no token
("Bindings give a Worker its resources by capability"), and Convex could send through the Worker
bridge it already has. Cloudflare's pages read for this note do not say whether the binding sends to
any recipient; a third-party guide says it needs the Workers Paid plan. It would also make a Worker
a requirement for sending, which the component avoids today ("Sending without attachments does not
require a Worker or R2 bucket"). Not proposed.

## 6. Destroy

`templates/base-actions/scripts/destroy-app.ts` today deploys only the Worker and the project with
`DESTROY_APP=true`, then runs `alchemy destroy --stage prod`:

```ts
const deployWorkerAndProject = [
  "deploy",
  "--stage",
  "prod",
  "--include",
  "Worker",
  "--include",
  "Project",
  "--yes",
  "--no-input",
];
```

For a Mail app made from today's `EmailInbox`, a confirmed destroy removes the Worker (with its
secrets and Previews), the Builds link, the deploy keys, the Convex project (with its environment
variables and all data), and the stack state. It leaves:

| Left behind                                                | Why                                                                                                                                                                       | Effect                                                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| The catch-all rule                                         | `RemovalPolicy.retain()` without a condition. A destroy only drops it from state.                                                                                         | The zone keeps routing every address to a Worker that no longer exists.                       |
| Both R2 buckets with every raw message and attachment      | Not in the stack. Mail names them in `cloudflare.config.ts`; its README creates them by hand, and `cf deploy` would create a missing production one. Neither is in state. | The destroy removes the Convex half of the mail and keeps the bytes, which are personal data. |
| Email Routing enablement and its locked MX and SPF records | A person's prerequisite                                                                                                                                                   | Correct to keep: the domain may use routing for other addresses.                              |
| The destination (recovery) address                         | Account-level, made by a person                                                                                                                                           | Correct to keep.                                                                              |
| The Email Sending registration of the zone                 | Made by a person                                                                                                                                                          | Correct to keep.                                                                              |
| The sending token                                          | Made by a person, stored only in Convex, which is gone                                                                                                                    | The person revokes it; the destroy run's summary can say so.                                  |

Proposed rule: **the confirmed destroy removes what the stack created and what holds the app's data,
and nothing a person made.** For Mail, the resources retained during normal deploys and destroyed
only by the confirmed destroy are exactly: the Worker shell and the Convex project (base-actions),
the two buckets (they hold the mail), and the catch-all (it routes the zone). The other stack
resources (deploy keys, Builds link, Worker secrets, Convex variables) are destroyed by any destroy
and hold no data.

Three parts make the rule safe.

**1. Generated bucket names.** Alchemy's R2 `Bucket` never reports an existing bucket as `Unowned`:
its `read` returns plain attributes for any bucket of that name (`alchemy:Cloudflare/R2/Bucket.js`),
which the plan treats as "exists and is owned by us; silent adopt" (`alchemy:Plan.js`). With a fixed
name such as `<worker>`, a stack could take over a bucket of another app or a person, and a
confirmed destroy with `forceDestroy` would empty it. Without a `name`, Alchemy generates
`<stack>-<id>-<stage>-<instance suffix>`, where the suffix is 16 base32 characters of a random
instance id (`alchemy:PhysicalName.js`, "80 bits of entropy"). A name that did not exist before the
stack created it can only name the stack's own bucket. The Builds variables carry it to the Worker
(section 1).

**2. A destroy that never re-creates.** A resource left in `deleting` by an interrupted destroy is
created again by the next deploy: "we're in a partially deleted state ... continue by re-creating
it" (`alchemy:Plan.js`). Today's policy deploy before the destroy already has this defect for the
Worker and the project. The script should run the policy deploy only when no resource of the stack
is in `deleting`; otherwise an earlier run already rewrote the policies, and it goes straight to
`alchemy destroy`. The policy deploy also needs the namespaced retained resources, so it includes
them by id instead of the two fixed ones:

```diff
-alchemy([...deployWorkerAndProject, "--dry-run"]);
+// The resources that only the confirmed destroy removes, from the template's own list.
+const deployRetained = ["deploy", "--stage", "prod", ...retainedResourceIds.flatMap((id) => ["--include", id]), "--yes", "--no-input"];
+alchemy([...deployRetained, "--dry-run"]);
 if (!hasStack()) {
   console.log(`The state store has no stack ${stack}: nothing to destroy.`);
 } else {
-  alchemy(deployWorkerAndProject);
+  // An interrupted destroy left resources in `deleting`, with their policies already rewritten.
+  // A deploy now would create them again.
+  if (!hasDeletingResources()) {
+    alchemy(deployRetained);
+  }
   alchemy(["destroy", "--stage", "prod", "--yes", "--no-input"]);
```

`retainedResourceIds` lives in a small per-template module next to `deploy-names.ts`
(`["Worker", "Project"]` for base-actions; plus the inbox ids for Mail), so `destroy-app.ts` stays
shared. `hasDeletingResources` reads the stack's state with the same `alchemy state` commands the
script already uses; how the state shows a resource's status is to be verified.

**3. A catch-all guard.** Alchemy's `CatchAll` destroy restores the rule as it was before the stack
first touched it, without checking whether someone changed it since
(`alchemy:Cloudflare/Email/CatchAll.js`, `delete`). If another app or a person took the rule, the
destroy would overwrite their routing. The script checks the rule first and, when it no longer
routes to this app's Worker, removes the catch-all row from the state instead of destroying it. The
better fix is upstream: restore only when the rule still equals what the stack last applied.

Remaining costs:

- `forceDestroy` empties a bucket before it deletes it; without it R2 refuses ("destroying a
  non-empty bucket fails with `BucketNotEmpty`"). It does not remove incomplete multipart uploads,
  which can still stop the delete (Codex, citing the provider source). The Mail Worker writes
  messages with single puts, so this is rare; the destroy run reports it.
- A large mailbox can take longer to empty than the 20-minute job. A rerun continues with the
  `deleting` rule above.
- The `destroy.yml` confirm text is shared and today names "the Worker, the Convex project with all
  its deployments, and the stack state". It becomes generic: "everything the setup stack created,
  with its stored data".
- The `json.md` install uses the same inbox code from its workspace path. It keeps its named buckets
  (the generated names are for new stacks), so its stack needs the bucket resources to stay optional
  there or an explicit `name` with a one-time adopt.

## 7. Decisions for the operator

1. **Where the Mail template lives.** Options: (a) `templates/mail` in this repository, exported to
   a new public repository, with a sync check that pins the shared deploy layer to
   `templates/base-actions`; (b) the Mail repository holds a standalone template directory that
   Samebase imports at a pinned commit at build time. Recommendation: (a). Deciding reason: the
   shared deploy layer is Samebase's contract and still changes in most RFC 126 pull requests; (a)
   changes it in one pull request with its check, (b) needs a Mail pull request plus a pin bump each
   time. `templates/mail` becomes the one source of the template's app code; `mail:apps/mail` stays
   the `json.md` install.
2. **The Worker configuration of the Mail template.** Options: (a) keep Mail's
   `cloudflare.config.ts` with `cf`; (b) move to `wrangler.jsonc` like base-actions, with a build
   step that writes a generated configuration for the names. Recommendation: (a). Deciding reason:
   the configuration must take the Worker and bucket names from the stack's Builds variables, which
   `cloudflare.config.ts` reads directly and `wrangler.jsonc` cannot, and Mail already runs this
   shape, previews included, in production.
3. **What the inbox functions own.** Options: (a) as today; (b) split into storage-and-secrets and
   routing, add the two buckets under generated names, the preview bridge secret (a new
   `WorkersBuilds.PreviewSecret`), and `CLOUDFLARE_EMAIL_ACCOUNT_ID`, retain the buckets and the
   catch-all except on the confirmed destroy, and order the first build between the two.
   Recommendation: (b). Deciding reason: each value is wiring that nobody edits by hand, and without
   them a new app has failing previews, a first build that races its secrets, no preview bucket, and
   a destroy that keeps the stored mail. This reverses two 2026-10-05 items (buckets in the Worker
   configuration; no preview secret in the provider).
4. **How inputs travel and what may be one.** Options: (a) only non-secret wiring values, declared
   in `samebase.template.json`, written once as repository variables by `write_actions_secrets`,
   then owned by GitHub; (b) the parked RFC's five inputs including secrets. Recommendation: (a),
   with `MAIL_ZONE` as Mail's only input. Deciding reason: rule 1 keeps settings in their
   dashboards, and no Samebase-held secret is needed.
5. **The sending credential.** Options: (a) secret input written by Samebase into Convex; (b)
   repository secret copied by the stack; (c) a manual setting listed by the manifest; (d) a token
   minted by the stack. Recommendation: (c). Deciding reason: it is the only option that needs
   neither a Samebase-held secret nor a broader CI permission, and the app receives mail without it.
6. **The Cloudflare CI token for Mail.** The organization's one Cloudflare CI token is written into
   every app repository. Mail needs Zone Read, Zone Settings Read, Email Routing Rules Edit, and
   Workers R2 Storage Edit on top. Options: (a) add them to the one token; (b) a second, Mail CI
   token with the base permissions plus these, its zone permissions limited in Cloudflare to the
   chosen zones, written only into Mail repositories. Recommendation: (b). Deciding reason: with
   (a), every base app repository would carry routing rights over the account's zones and write
   access to its buckets, and RFC 126's release gate on credential scope does not reduce that.

## What this note could not confirm

- Whether a Worker shell without a version accepts the bridge secret and the catch-all. The proposed
  order writes the secret before the first build and the catch-all after it.
- Whether a version deployed by `cf` keeps a Worker secret that `cloudflare.config.ts` does not
  declare (`MAIL_RECOVERY_ADDRESS`), and whether the server, not only `cf`, rejects a declared
  secret that the Worker lacks.
- The response shape of the Workers Builds build that `FirstBuild` would poll.
- The endpoint and permission of a `WorkersBuilds.PreviewSecret` resource (Codex says `cf` has the
  endpoint) and the permission for `/zones/{zone_id}/email/sending/subdomains`, which the API
  reference does not list.
- How `alchemy state` shows a resource in `deleting`, for the destroy guard, and the `--include`
  form for a resource inside a namespace (such as the inbox buckets under `Mail`).
- Why `mail:README.md` lists the DNS permission for the stack token.
- Whether `Cloudflare.Email.SendingSubdomain` accepts the zone apex as its name.
- The Alchemy input types in the sketches.
- What Cloudflare does with mail for a zone whose catch-all is disabled.

## Sources

- `rfcs/126_REPOSITORY_ACTIONS_PROVISIONING_MVP.md` on `rfc-repository-actions-provisioning`;
  `research/2026-10-05-alchemy-setup-stack-and-wrangler-split.md`;
  `research/2026-10-06-cf-cli-gaps-for-vite-plus-apps.md`;
  `research/2026-10-07-alchemy-as-samebase-source-of-truth.md`; `docs/repository-exports.md`;
  `specs/003_REPOSITORY_INFRA_PROVISIONING_SPEC.md`; the parked templates RFC
  `rfcs/2026-09-30-templates-and-components.md` on `nicu-templates-proposal` (PR #1646).
- This repository: `templates/base-actions/` (`alchemy.run.ts`, `scripts/deploy-names.ts`,
  `scripts/setup-output.ts`, `scripts/publish-setup-output.ts`, `scripts/destroy-app.ts`,
  `.github/workflows/alchemy.yml`, `.github/workflows/destroy.yml`),
  `scripts/export-starter-manifest.ts`, `scripts/check-template-sync.ts`,
  `scripts/publish-repository-exports.ts`,
  `apps/samebase/convex/repositoryProvisioningWorkflowActions.ts` (`writeActionsSecrets`, the seed
  step), `apps/samebase/convex/repositoryProvisioningWorkflow.ts` (`readActionsSecretsTarget`),
  `apps/samebase/convex/repository/provisioningModel.ts`,
  `apps/samebase/convex/repository/contracts/createRepository.ts`,
  `apps/samebase/convex/repository/contracts/getRepositoryStatus.ts`,
  `apps/samebase/convex/repository/repositoryStatus.ts`, `apps/samebase/convex/cloudflareOAuth.ts`,
  `apps/samebase/shared/cloudflareResourceUrls.ts`, `apps/samebase/convex/convex.config.ts`;
  `apps/samebase/convex/organization/ciCredentials.ts` on PR #1701.
- Mail at `f97bebb`: `alchemy.run.ts`, `README.md`, `.github/workflows/infra.yml`,
  `apps/mail/{README.md, cloudflare.config.ts, wrangler.config.ts, package.json, worker/index.ts, convex/convex.config.ts, convex/bootstrap.ts, convex/inboxes.ts, convex/auth.ts, scripts/build-cloudflare.ts, scripts/build-worker.ts, scripts/deploy-mail.ts, src/components/mail/MailWorkspace.tsx}`,
  `packages/convex-cloudflare-email-inbox/{package.json, tsconfig.json, alchemy.ts, src/worker/index.ts, src/component/convex.config.ts, src/component/delivery.ts, README.md}`,
  `docs/integration.md`.
- Installed packages: `alchemy:Cloudflare/Email/CatchAll.js`, `alchemy:Cloudflare/Email/retry.js`,
  `alchemy:Cloudflare/Email/{Address,SendingSubdomain}.d.ts`,
  `alchemy:Cloudflare/R2/Bucket.{js,d.ts}`, `alchemy:Plan.js`, `alchemy:PhysicalName.js`,
  `alchemy:Cloudflare/ApiToken/{AccountApiToken,PermissionGroups}.d.ts`; Wrangler 4.136.2
  `wrangler-dist/cli.js` (`R2Handler`, `provisionBindings`, `runProvisioningFlow`); `cf`
  1.0.0-beta.12 `dist/deploy-input-*.mjs` (`resourcesProvision`); `@samebase/alchemy-convex`
  `src/{EnvironmentVariable,DefaultEnvironmentVariable}.ts`.
- Cloudflare API reference, read on 2026-10-07:
  [Get Email Routing settings](https://developers.cloudflare.com/api/resources/email_routing/methods/get/),
  [Enable Email Routing](https://developers.cloudflare.com/api/resources/email_routing/methods/enable/),
  [Update catch-all rule](https://developers.cloudflare.com/api/resources/email_routing/subresources/rules/subresources/catch_alls/methods/update/),
  [List destination addresses](https://developers.cloudflare.com/api/resources/email_routing/subresources/addresses/methods/list/),
  [Email Sending subdomains](https://developers.cloudflare.com/api/resources/email_sending/subresources/subdomains/),
  [Workers subdomain](https://developers.cloudflare.com/api/resources/workers/subresources/subdomains/),
  [Email Sending domains](https://developers.cloudflare.com/email-service/configuration/domains/),
  [Send emails](https://developers.cloudflare.com/email-service/get-started/send-emails/); the
  third-party guide on the `send_email` binding:
  [flaviocopes.com](https://flaviocopes.com/cloudflare-email-service/).

## Codex review

One Codex design review ran on 2026-10-07 (`codex exec`, the operator's prompt: challenge any
decision, give severity, alternative, and deciding reason, and name every claim it cannot confirm
from the files). It checked the note against Samebase `accecddda`, Mail `f97bebb`, PR #1701, and the
pinned provider sources. The findings it backed with source were checked against the installed
packages before they changed the note.

| #     | Codex finding                                                                                                                                                                                                                                                                         | What changed                                                                                                                                                                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | High: `forceDestroy` has no ownership check; R2 `Bucket` adopts an existing bucket without `--adopt`.                                                                                                                                                                                 | Accepted, verified in `Bucket.js` `read` and `Plan.js`. Buckets get Alchemy-generated names with a random instance suffix; the Builds variables carry them to the Worker. The note's earlier claim that an existing bucket needs `--adopt` is removed.                    |
| 2     | High: a deploy before the destroy re-creates resources left in `deleting`.                                                                                                                                                                                                            | Accepted, verified in `Plan.js`. The destroy skips the policy deploy when any resource is in `deleting`, and keeps `--include` with a per-template list instead of a full deploy. The same defect exists today for the Worker and the project in base-actions.            |
| 3     | High: the catch-all check at creation does not protect later ownership, and the destroy restores without checking.                                                                                                                                                                    | Accepted in part. The check also runs on every status read; the destroy checks the rule before restoring and an upstream fix is named. Not adopted: a lock across creations, since the window is two creations for one zone at once.                                      |
| 4     | High: `FirstBuild` does not depend on the Mail secrets and buckets.                                                                                                                                                                                                                   | Accepted. The inbox code splits into storage-and-secrets before the Builds link and routing after a `FirstBuild` that waits for the build.                                                                                                                                |
| 5     | High: routing starts before the app has an inbox; mail is rejected.                                                                                                                                                                                                                   | Accepted in part. The note now states the rejection window and proposes default inboxes on the owner's first sign-in. Not adopted: keeping routing off until setup, because the stack would read app data and a disabled catch-all drops mail without telling the sender. |
| 6     | High: one CI token spreads Mail's permissions to every app repository.                                                                                                                                                                                                                | Accepted. Decision 6 now recommends a separate Mail CI token with zone permissions limited to the chosen zones.                                                                                                                                                           |
| 7     | High: the input has two authorities after creation; a retry rewrites the original.                                                                                                                                                                                                    | Accepted. Inputs are written once (`planned`, then `written` without the values); GitHub is the authority after that; status reads the current variable.                                                                                                                  |
| 8     | High: creation does not pin the validated template.                                                                                                                                                                                                                                   | Accepted in part. The plan records the manifest version; the seed fails closed on a mismatch. Seeding an older snapshot is not possible, because Samebase holds only the compiled manifest.                                                                               |
| 9     | Medium: all previews share one secret and one bucket.                                                                                                                                                                                                                                 | Accepted as a stated limit (as in Mail today); per-preview isolation is not proposed.                                                                                                                                                                                     |
| 10    | Medium: unreadable checks disappear from status.                                                                                                                                                                                                                                      | Accepted. Status reports `met`, `unmet`, and `unavailable`; only `unmet` is an attention item.                                                                                                                                                                            |
| 11    | Medium: computed names do not decide `cf` against Wrangler; pass the Worker name as a stack-owned Builds variable.                                                                                                                                                                    | Accepted. The configuration reads `WORKER_NAME` and `MAIL_STORAGE_BUCKET` from Builds variables; the deciding reason for `cf` is restated (it reads them directly; Wrangler needs a generated file).                                                                      |
| 12    | Medium: the package `tsconfig.json` include list excludes `src/alchemy.ts`.                                                                                                                                                                                                           | Accepted, verified. The diff adds it, and the packed-consumer check imports `./alchemy`.                                                                                                                                                                                  |
| 13    | Medium: the location argument rested on a false restriction; a pinned build-time import needs no fetch at creation, and the policy is one pull request, not one commit.                                                                                                               | Accepted. Option B is restated as a pinned import, "same commit" became "same pull request", and the deciding reason is now the change rate of the shared layer.                                                                                                          |
| 14    | Medium: recreating plan rows needs evidence.                                                                                                                                                                                                                                          | Accepted. The `template` field is optional, so no live row changes; spec 003's precondition is named for the required alternative.                                                                                                                                        |
| Low   | Sending token reasoning; same-account rule; the universal retention rule did not match the sketch; keep the manifest; defer the second-Worker prescription.                                                                                                                           | All accepted: option c's reason no longer claims uniqueness; the same-account rule is the template's; the retained resources are listed exactly; the second-Worker part is cut to what exists.                                                                            |
| Facts | `cf` provisions a missing named production bucket; Mail would be the sixth export; `destroy.yml` was called shared and per-template; the setup code is not one-time in code; "every address is delivered" overstated; the 21-file denominator; the build-variable claim was absolute. | All corrected in place. The `cf` provisioning was verified (`resourcesProvision: !0` in the deploy input). Codex's claim that `cf` keeps undeclared secrets was not verified here and is marked as such.                                                                  |
