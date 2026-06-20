# New App Provider Name Selection Research

## Document Control

- Status: Current-state research
- Owner: Noter app creation and provider provisioning
- Created: 2026-05-18
- Related:
  - `specs/090_CREATE_APP_WORKFLOW_PROVISIONING_SPEC.md`
  - `specs/101_CLOUDFLARE_WORKERS_SINGLE_STACK_MIGRATION_SPEC.md`
  - `research/2026-05-15-samebase-workers-provisioning-migration.md`
  - `docs/artifacts/notermd-app/cloudflare-workers-install.md`

## Prompt

Research how Noter currently selects Convex and Cloudflare names when adding a new Noter-managed
app, then record the baseline before designing a better name selection flow.

## Current Finding

New app creation has one user-facing name input: `New App name`. That value is treated first as the
GitHub repository name. Convex and Cloudflare names are not selected independently in the UI;
provider names are derived later from the actual vault repository coordinates plus a suffix from the
vault ID.

The current derivation is deterministic, but it is fragile for long names: Noter appends the unique
vault suffix at the end of `owner-repo-suffix`, then truncates the whole string. For long owner/repo
names, the suffix can be partly or completely removed, which weakens the collision protection that
retries and provider reuse depend on.

## Current Create Flow

The dashboard create control renders one text input with placeholder `New App name`, a GitHub owner
select, and a `New App` button
(`apps/noter/src/components/vault-dashboard/VaultDashboard.tsx:3023`).

On submit, the UI trims the entered value and calls `createRepository` with:

1. `name`: the trimmed input
2. `owner`: the selected GitHub owner
3. `private`: `true`

Relevant UI path:

- `VaultDashboard.tsx:2860` trims the input.
- `VaultDashboard.tsx:2862` requires GitHub, Convex, and Cloudflare.
- `VaultDashboard.tsx:2868` requires a selected GitHub owner.
- `VaultDashboard.tsx:2877` calls `createRepository`.

The backend action sanitizes the requested GitHub repository name with `toSafeRepoName`, creates an
initializing vault/run, then starts the app provisioning Workflow
(`apps/noter/convex/vault/actions.ts:312`).

`toSafeRepoName` preserves GitHub-oriented characters and case:

1. trims whitespace
2. replaces runs of non `a-zA-Z0-9._-` characters with `-`
3. collapses repeated dashes
4. strips leading and trailing dots
5. returns empty unless at least one alphanumeric character remains

This means a name like `My_App.Name` can remain a GitHub repo name, but provider slugs later
lowercase it and turn `_` and `.` into dashes.

## Convex Naming

Convex resource creation happens in `ensureConvexResources`
(`apps/noter/convex/infraProvisioning.ts:199`).

Current candidate project name:

```ts
const suffix = vaultSuffix(args.vaultId);
const projectName = sanitizeSlug(`${args.owner}-${args.repo}-${suffix}`, 40);
```

Behavior:

1. `vaultSuffix` removes non-alphanumerics from the vault ID and takes the last six characters
   (`apps/noter/convex/slugUtils.ts:14`).
2. `sanitizeSlug` lowercases, converts non-`a-z0-9-` characters to dashes, collapses dashes, trims
   edge dashes, and slices to `maxLen` (`apps/noter/convex/slugUtils.ts:1`).
3. Convex project lookup scans `list_projects` for an existing project whose `name` exactly matches
   the candidate (`infraProvisioning.ts:218`).
4. If no project ID is known and no matching project is found, Noter calls `create_project` with
   `projectName` and `deploymentType: "prod"` (`infraProvisioning.ts:248`).
5. The production deployment name is provider-returned. If missing, Noter reads or creates a prod
   cloud deployment and uses the provider-returned deployment name (`infraProvisioning.ts:283`).
6. The preview deployment is not named by Noter. Noter reuses the first dev cloud deployment on the
   project or calls `create_deployment` with `type: "dev"` (`infraProvisioning.ts:343`).
7. Deploy keys are named from only the vault suffix: `noter-${vaultSuffix(vaultId)}` and
   `noter-preview-${vaultSuffix(vaultId)}` (`infraProvisioning.ts:1508`).

Durable Convex identifiers are stored only after provider success:

1. `vaultInfrastructure` stores `convexProjectId`, `convexProjectSlug`, `convexDeploymentName`,
   URLs, and optional deploy key ID (`apps/noter/convex/schema.ts:464`).
2. `vaults.convex.connected` stores `projectId`, `projectSlug`, and `deploymentName`
   (`apps/noter/convex/vault/model.ts:84`).

## Cloudflare Naming

Cloudflare Worker creation happens in `ensureCloudflareResources`
(`apps/noter/convex/cloudflareResources.ts:863`).

Current candidate Worker name:

```ts
const suffix = vaultSuffix(args.vaultId);
const fallbackWorkerName = sanitizeSlug(`${args.owner}-${args.repo}-${suffix}`, 58);
```

Behavior:

1. The candidate uses the same owner, repo, and vault suffix inputs as Convex, but with a
   58-character max (`cloudflareResources.ts:866`).
2. Noter first reads a Worker at that exact candidate name (`cloudflareResources.ts:364`).
3. If the Worker exists, Noter reuses it and computes the production URL from the returned Worker
   name plus the account workers.dev subdomain (`cloudflareResources.ts:370`).
4. If it does not exist, Noter creates a Worker with `name: fallbackWorkerName`, enables workers.dev
   subdomain and previews, and records the returned Worker name/tag (`cloudflareResources.ts:380`).
5. Workers Builds triggers then pass the Worker name through the template deploy scripts. The
   template intentionally keeps `name` out of `wrangler.jsonc`, because the Cloudflare dashboard
   Worker name must match Wrangler's deploy target
   (`docs/artifacts/notermd-app/cloudflare-workers-install.md:66`).

Durable Cloudflare identifiers are stored on the vault provider state:

1. `vaults.cloudflare.connected.accountId`
2. `vaults.cloudflare.connected.workerName`
3. `vaults.cloudflare.connected.workerTag`
4. `vaults.cloudflare.connected.productionUrl`

The Workers migration research explicitly documents the current intent: deterministic Worker names
are derived from owner, repository, and vault suffix so retries target the same Worker without
storing another pending name (`research/2026-05-15-samebase-workers-provisioning-migration.md:363`).

## Important Edge Cases

### Suffix Can Be Truncated Away

Both Convex and Cloudflare append the vault suffix before calling `sanitizeSlug(..., maxLen)`, and
`sanitizeSlug` slices from the front. If the owner/repo portion is long enough, the suffix does not
survive truncation.

Examples:

1. Convex max is 40, so suffix loss is easy with long org and repo names.
2. Cloudflare max is 58, so suffix loss is less common but still possible.
3. If the suffix is removed, separate vaults with the same long prefix can produce the same provider
   candidate.

### Different GitHub Names Can Collapse To The Same Provider Slug

GitHub repo names can include uppercase, dots, and underscores after `toSafeRepoName`. Provider
candidates later lowercase and replace dots and underscores with dashes. Without a suffix that
always survives truncation, names such as `My_App`, `my-app`, and `my.app` can collide.

### Existing Provider Resource Reuse Is Name-Based

Convex reuses an existing project when `list_projects` contains an exact name match. Cloudflare
reuses an existing Worker when the candidate Worker name already exists. Neither path appears to
verify an app-owned marker before reusing the provider resource; the unique name is the main
ownership guard.

That makes suffix survival important. A collision could cause Noter to attach deploy keys, build
triggers, env vars, or URLs to the wrong provider resource.

### Candidate Names Are Not Durable Until Success

The generated provider candidate names are not stored on the run or vault before provider calls.
After success, Noter stores provider-returned identifiers. Before success, the name can only be
recomputed from vault repository coordinates and vault ID.

That is simple for current deterministic retries, but it means the UI cannot show or adjust provider
names independently without adding a new contract.

## Tests And Coverage

Existing tests cover:

1. GitHub repository name sanitization through `toSafeRepoName`
   (`apps/noter/convex/repoName.test.ts`).
2. Cloudflare build env var selection, Worker tag parsing, and Workers Builds token selection
   (`apps/noter/convex/cloudflareResources.test.ts`).
3. Infrastructure ownership and visible provisioning failure behavior
   (`apps/noter/convex/infraProvisioning.test.ts`).

I did not find dedicated tests for:

1. Convex project name derivation.
2. Cloudflare Worker candidate derivation.
3. Long names preserving the vault suffix.
4. Cross-provider consistency between Convex and Cloudflare candidate names.
5. Provider-name collisions or reuse of pre-existing provider resources.

## Likely Design Levers

These are the places a future implementation can change, depending on the new product behavior:

1. Add a shared provider-name proposal helper so Convex and Cloudflare derive names from one tested
   contract.
2. Truncate the human-readable base before appending the suffix, so the suffix always survives.
3. Choose separate provider-specific max lengths while preserving the same readable stem and durable
   suffix.
4. Store proposed provider names on the provisioning run if the UI should show, edit, or audit them
   before provider calls.
5. Add provider availability checks or collision handling before reusing an existing project/Worker
   by name.
6. Decide whether the user-facing app name should stay identical to the GitHub repo name or become
   an app display name that proposes a repo/provider name.

## Implemented Direction

The accepted direction is to keep GitHub repository creation as the first explicit input, then
expose separate Convex project and Cloudflare Worker inputs beside it. Convex and Cloudflare default
from the repository name only, not from the selected GitHub owner, because owner-prefixed names
become unnecessarily long for the common case where users create apps under their own account.

The provider fields stay automatic until the user edits them. While automatic, each repository-name
change recomputes the provider names through the shared provider-name helper. Once edited, the field
becomes a manual override and the backend uses that submitted name exactly after validation.

Provider-name availability is checked before creation through a new Convex action. The create action
also revalidates immediately before any GitHub or provider side effect, so the dashboard check is
early feedback rather than the only guard. When a name is taken, Noter proposes the first available
numbered variant it can verify.

Selected provider names are written to `vaultInfrastructureTargets` before provisioning starts.
Retry workflows then read that durable target row and use the original user-selected names instead
of deriving names again from owner, repository, and vault ID. Existing vaults without a target row
keep the legacy derivation path for retry compatibility.

## Open Questions For The Next Design

1. Should users choose only an app display name, with Noter deriving GitHub, Convex, and Cloudflare
   names?
2. Should users see and edit provider names before creation, or should Noter silently choose safe
   names?
3. Should Convex and Cloudflare share the same visible stem, even if their max lengths differ?
4. Should Noter fail on provider name collisions, auto-increment, or always use a longer
   deterministic suffix?
5. Should existing-repository connections ever get an infrastructure naming proposal, or is this
   only for newly created apps?
