# Templates after Alchemy

Status: proposal. Updated October 5, 2026. Replaces the earlier deployment recommendation.

## Recommendation

Use complete GitHub repositories at tested commits. Each contains `alchemy.run.ts`, a deployment
workflow, and one data manifest, `samebase.template.json`. Samebase prepares the repository, Convex
project, keys, and inputs. The user's CI creates the remaining resources. Keep resource graphs,
component selection, inheritance, and template code execution outside Samebase.

The
[Base proof](https://github.com/samebase/tmp-alchemy-base/tree/3765df0a19de05a88d1e4fc63a623a5baedcee44)
has successful [production](https://github.com/samebase/tmp-alchemy-base/actions/runs/37284745692)
and [PR](https://github.com/samebase/tmp-alchemy-base/actions/runs/37283497105) runs. Its run file
owns deployment; its bootstrap supplies CI credentials. The
[Convex provider](https://github.com/samebase/alchemy-convex/tree/6c51d72db92fc47136d6cb0b891e44ecc6dad496)
is private and pins Alchemy beta.80. This proves the deployment direction, not a released template
contract.

## Evidence

| System                                                                                                                               | Useful boundary                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Railway](https://docs.railway.com/templates/create)                                                                                 | Template metadata adds source and required variables to deployment settings. [`railway.json`](https://docs.railway.com/config-as-code/reference) is now deprecated. |
| [Cloudflare deploy buttons](https://developers.cloudflare.com/workers/platform/deploy-buttons/)                                      | Clone into the user's account; read Wrangler and secret names from `.dev.vars.example`.                                                                             |
| [Render Blueprints](https://render.com/docs/blueprint-spec)                                                                          | `sync: false` collects secrets at creation only; later secret writes remain separate.                                                                               |
| [GitHub templates](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template) | Copy a complete app with independent history; supply no input or update engine.                                                                                     |
| [Copier](https://copier.readthedocs.io/en/stable/configuring/#the-copier-answersyml-file)                                            | `.copier-answers.yml` records source, version, and answers for later updates with conflict handling.                                                                |
| [shadcn](https://ui.shadcn.com/docs/registry/registry-item-json)                                                                     | Schema-based metadata supports discovery; `envVars` contains development examples, not production secrets.                                                          |

Inference: reuse deployment files and declare only missing inputs and display metadata. These
systems do not share one resource model or update algorithm.

## Minimal contract

Validate JSON against one versioned schema. Never import a manifest as executable TypeScript. A
proposed Mail manifest is:

```json
{
  "version": 1,
  "name": "Mail",
  "description": "Email for your own domains.",
  "screenshot": "preview.png",
  "inputs": {
    "MAIL_DOMAIN": { "label": "Domain", "secret": false },
    "OWNER_EMAIL": { "label": "Owner email", "secret": true },
    "OWNER_SETUP_SECRET": { "label": "First sign-up code", "secret": true },
    "MAIL_RECOVERY_ADDRESS": { "label": "Verified recovery address", "secret": true },
    "CLOUDFLARE_EMAIL_API_TOKEN": { "label": "Email sending token", "secret": true }
  }
}
```

All declared inputs are required strings. Keys are environment names; `secret` controls storage.
Only `screenshot` is optional; it names a file at the same commit. Base uses empty `inputs`. The
Convex catalog stores approved repository identities, release labels, and resolved commits,
published after release checks. GitHub, Cloudflare, and Convex connections are fixed requirements in
v1. Workflow success and app checks belong in CI, without manifest check commands. The workflow
publishes its app URL as a `deployment.json` artifact.

[Current Mail](https://github.com/samebase/mail/blob/dfadf564b86faf06c2cec30c6e7d5bda2950ea93/apps/mail/README.md#L48)
requires the additional owner, recovery, and sending values above. Its Alchemy migration should
create `MAIL_BRIDGE_SECRET` with
[Alchemy.Random](https://alchemy.run/cloudflare/security/secrets-env/#generate-tokens-with-alchemyrandom),
which retains generated values in state. The run file supplies it to Worker and Convex. It owns R2,
routing, domain checks, and isolated preview secrets. Previews must not route live mail or receive
production sending credentials.

Samebase writes nonsecret inputs to GitHub variables and secret inputs to GitHub secrets; the
workflow explicitly passes them to Alchemy. Retain supplied secrets encrypted for later rewrites,
never in provenance or ordinary MCP results. The Cloudflare deployment token stays on the
organization's account connection and is copied to each app. Its initial creation remains a
dashboard step because of the [OAuth scope gap](https://github.com/cloudflare/mcp/issues/243).

## Source and admission

Use approved official releases in v1. Arbitrary repositories are out: their CI would receive the
organization's credentials, and a valid manifest cannot establish trust.

Every v1 release, and any later external template, requires the manifest, root run file,
`.github/workflows/alchemy.yml`, lockfile, and a license or owner permission for reuse. Read the run
file as source, without interpreting resources. Reject unknown schema fields, reserved input names,
missing files, inaccessible sources, and unapproved commits before creation. Official release CI
must pass schema checks, an Alchemy plan, and production, preview, and cleanup checks in an isolated
account. A [plan](https://alchemy.run/cli/plan/) is not a sandbox: code executes, and
[state setup](https://alchemy.run/cloudflare/tutorial/part-1/#configure-state) can create resources.

Fetch the exact commit tree, publicly or through GitHub App access, then seed an owned repository.
GitHub's
[generate API](https://docs.github.com/en/rest/repos/repos#create-a-repository-using-a-template) has
no ref parameter. Unlike
[Railway's upstream source plus Eject](https://docs.railway.com/templates/deploy), copy immediately.
This removes Samebase release coupling and supports private sources. Compared with the compiled
seed, it adds GitHub read failures and loses offline source availability. Pin dependencies and
Actions, preserve licenses, and retain the selected source snapshot for retries.

## Create and repair

1. Select a catalog release through the app or MCP. Resolve and validate its immutable snapshot.
2. Select organization connections and repository name. Collect inputs. Store the plan and stable
   app identity.
3. Create an empty repository. Create the Convex project, production key, preview key, and project
   auth defaults. Store each result before continuing.
4. Write inputs, the `SAMEBASE_APP_ID` GitHub variable, and four CI secrets: `CLOUDFLARE_API_TOKEN`,
   `CLOUDFLARE_ACCOUNT_ID`, `CONVEX_DEPLOY_KEY`, `CONVEX_PREVIEW_DEPLOY_KEY`.
5. Seed the snapshot and provenance in one commit. CI derives stable deployment names from the saved
   app identity, replacing the proof's fixed Worker name.
6. Read the Alchemy deploy job and URL artifact for that commit and stage. Report their results.
   Samebase creates no Worker or Workers Builds configuration.

Keep project creation, key replacement, secret writes, and reruns independent. Retries reuse saved
identifiers. Rotation writes replacement credentials before rerunning CI; it does not recreate the
project. Preserve Alchemy state and resource identities, because rerunning cannot repair lost state
safely.

## Provenance and updates

Add `.samebase/template-origin.json` to the created app with
`{version, sourceRepositoryId, sourceUrl, sourceRef, sourceCommit, inputs}`. Include nonsecret
inputs only. Store secret references separately in Convex. Expose the same catalog and provenance
through MCP.

Follow
[Copier's comparison model](https://copier.readthedocs.io/en/stable/updating/#how-the-update-works)
and [Railway's opt-in updates](https://docs.railway.com/templates/updates). Compare old source, new
source, and current app files. Open a requested update PR, preserve app edits, and stop for
unresolved conflicts or new required inputs. The PR updates provenance; the installed version
advances only when it merges. Never replace files wholesale.

## Samebase changes, in order

1. Publish tested Base with this convention and pinned providers; admit Mail after its migration.
2. Add manifest validation and one catalog API for app and MCP discovery.
3. Accept release IDs and inputs in create-app/MCP requests; replace the hard-coded seed with commit
   snapshots and provenance.
4. Add account-token reuse, encrypted app inputs, GitHub variable/secret writes, and independent
   repair operations.
5. Change new-app provisioning to Convex bootstrap plus GitHub Actions status and rerun support.
6. Add requested template update PRs using the recorded source baseline.

## Rejected alternatives

- Expand the compiled manifest: every template release would still require a Samebase deployment.
- Detect inputs from code alone: code cannot reliably identify prompts, privacy, or display
  metadata.
- Adopt Copier rendering: complete apps can receive inputs through environment variables.

## Decisions for Nicu

- Release Base first? The proof covers Base; current Mail has no Alchemy run file. Recommend
  admitting Mail only after equivalent checks pass.
- Accept Mail's separate sending token and verified recovery address? Its current README requires
  both. Recommend keeping the deployment token out of the running app.
- Permit Samebase source reuse? Its [license](../LICENSE.md) requires permission. Recommend keeping
  it outside the catalog until reuse terms and an independent deployment are ready.
