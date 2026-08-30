# Convex deployment region support

Date: 2026-08-30

Status: Approved product and implementation model

Scope: Convex production deployments that Samebase creates or observes

## Summary

Samebase must require a production region when it creates a Convex project. This rule applies to the
managed New App path, including MCP, and to the manual Create Convex project path.

An organization can save one default. When no value is stored, Samebase uses US East as the
effective default. The default only initializes a create form. The creator can select another region
for one project, and that choice never changes the organization default. Samebase does not change
the Convex team's own default.

The managed create path stores the selected region in its existing durable provisioning plan before
the provider write. The manual create path has no plan. Both paths check current availability and
send the selected region to Convex. They do not add a post-create region check, read retry, or new
diagnostic event.

The live Convex production deployment observation supplies the actual region after attachment.
Samebase shows that live value where it shows a project or production deployment. It does not copy
the actual region into the stable project attachment.

This release does not change preview deployment behavior or display.

## Confirmed Convex facts

| Fact                                                                                                                   | Samebase effect                                                                        |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Convex offers `US East (N. Virginia)` and `EU West (Ireland)`.                                                         | Use provider IDs `aws-us-east-1` and `aws-eu-west-1`. Show the provider display names. |
| Region belongs to a deployment.                                                                                        | Name the creation field `Convex production region`. Do not call it a project region.   |
| An existing deployment cannot change region.                                                                           | Region selection is a create-time choice. Existing production region UI is read-only.  |
| Project creation accepts `deploymentRegion`.                                                                           | Both Samebase project-create paths send the exact selected value.                      |
| `list_deployment_regions` returns `name`, `displayName`, and `available`.                                              | Read the current list for the connected team and reject an unavailable selection.      |
| A cloud deployment response contains required `region`.                                                                | Use live provider data as the actual production region. Do not infer it from a URL.    |
| An omitted create value uses the Convex team default.                                                                  | Samebase does not omit the value. Every Samebase project create is explicit.           |
| EU usage costs 1.3 times US usage. Included usage for Starter and Professional plans does not apply to EU deployments. | Show both facts when EU is selected. Convex bills all EU usage at its listed EU rates. |
| Local deployments run on the developer's computer.                                                                     | Local development has no US or EU region and is outside this feature.                  |

Primary sources:

- [Convex Regions](https://docs.convex.dev/production/regions)
- [Convex Multiple Deployments](https://docs.convex.dev/production/multiple-deployments)
- [Convex List Deployment Regions](https://docs.convex.dev/management-api/list-deployment-regions)
- [Convex Create Project](https://docs.convex.dev/management-api/create-project)
- [Convex Create Deployment](https://docs.convex.dev/management-api/create-deployment)
- [Convex Deployment CLI](https://docs.convex.dev/cli/reference/deployment)
- [Convex Pricing](https://www.convex.dev/pricing)
- [Convex Management OpenAPI](https://api.convex.dev/v1/openapi.json)

The Convex Regions page still says that CLI region selection is coming soon. The current Deployment
CLI reference documents `npx convex deployment create --region <region>`. Samebase uses the
Management API, so this documentation difference does not block the feature.

## Product contract

### Supported values

Use one shared validator and derive its TypeScript type:

- `aws-us-east-1`, shown as `US East (N. Virginia)`
- `aws-eu-west-1`, shown as `EU West (Ireland)`

Samebase reads the provider region list before creation. The UI can show an unavailable region as
disabled. The server rejects a selection unless the current provider response contains the exact
value with `available: true`.

The supported value union remains closed even though availability comes from Convex. A new provider
region needs an explicit Samebase product and type update.

### Organization saved default

Add this optional field:

```text
organizations.defaultConvexDeploymentRegion?: ConvexDeploymentRegion
```

The effective default is an organization-shared form preference. It is not a data-residency policy.

- An organization owner can save US East or EU West.
- An organization member can read it.
- Saving it does not require a Convex connection.
- A create form selects it only when Convex still reports it as available.
- If no value is stored, the effective default is US East.
- If the effective default is unavailable, the form starts without a selection.
- A creator can select another available region for one project.
- A one-project selection never writes the saved default.
- A changed default affects only forms opened for later creates.
- A changed default does not change a plan, project, deployment, or Convex team default.
- Convex connection, disconnection, reauthorization, team replacement, and slug refresh preserve it.

Existing organizations can keep the field unset. Do not backfill US. The shared business rule
resolves an unset value to US East. The public team-token API does not give Samebase a reliable read
for the Convex team's saved default.

Do not add a user-by-organization preference. The location and price affect a shared organization
resource, and the organization owns the saved form default.

### Creation UI

Use these field values on New App and in the manual Convex create dialog:

- Label: `Convex production region`
- Empty value: `Choose a region`
- EU disclosure:
  `EU usage costs 1.3 times US usage. Included usage for Starter and Professional plans does not apply to EU deployments.`

Link the EU disclosure to [Convex pricing](https://www.convex.dev/pricing). Use the display names
from Convex. A US or EU flag can support the text, but it cannot replace the region name.

Organization Settings labels the control `Default production region`. It does not show an unset
choice or explanatory helper text. Members see the effective default as read-only text. Owners can
save US East or EU West. An unavailable saved value stays visible in Organization Settings, but it
is not selected in a create form.

Each selector has a visible label. The EU disclosure is part of the selector description and is
announced when it appears. A load or save error uses alert semantics. The selector trigger renders
at 16 CSS pixels or more on touch devices.

### Managed creation

The New App web and MCP flows use this sequence:

1. Read the current production regions and the effective organization default.
2. Initialize the choice from the effective default only when that value is available.
3. Require one exact available region from the creator or agent.
4. Pass it as required `convexDeploymentRegion` input to `create_repository`.
5. Save it in every Convex variant of `workflow_vaultProvisioning_plans` in the admission
   transaction.
6. Recheck that the saved value is available immediately before a new provider create call.
7. Send it to Convex as `deploymentRegion` with `deploymentType: "prod"`.
8. Record the normal provider checkpoint and stable attachment.

The plan keeps `deploymentRegion` in its `planned`, `creating`, and `created` variants. A managed
retry uses the plan value. It does not read the organization default again and cannot change the
region.

The external create step keeps `retry: false`. Provider project creation is not idempotent. This
feature adds no post-create deployment read, region comparison, read retry, or region diagnostic.
The existing project read and attachment checkpoint behavior remain unchanged.

### Manual creation

The manual Create Convex project dialog uses this sequence:

1. Read current production regions and the effective organization default.
2. Initialize the choice from the effective default only when it is available.
3. Require one exact available region.
4. Recheck availability before the provider create call.
5. Send `deploymentRegion` with `deploymentType: "prod"`.
6. Record the normal project checkpoint and attachment.

The manual action has no durable provisioning plan. The one-project choice does not write the
organization default. This feature adds no post-create region check, read retry, or diagnostic.

### Live production region

The stable `vaultConvexProjects` row continues to store only provider identity, source location, and
origin. It does not store a deployment region.

`observeConvexProjects` reads the current default production deployment and returns its region in
the `available` observation. Project Settings and production deployment rows show that actual live
value. A missing deployment remains an explicit `missing` observation.

Existing-project discovery lists all default production deployments for the team with one paginated
read and joins them to projects by project ID. The picker shows the actual production region or
`No production deployment`. It must not make one deployment request for each project.

During managed creation, a plan-only project row can show the requested production region. After
attachment, the live observation supplies the actual value.

### Preview deployments

Preview deployment region selection, promises, and display are outside this release. Do not change
the starter preview command, pull request provider contract, or preview UI for this feature.

## MCP contract

Add `convex_listDeploymentRegions` as a read tool. Its public input is the human `githubOwnerLogin`,
not an opaque Samebase organization ID. It returns the current region options and the effective
organization default. The returned default is US East when no value is stored.

Managed app creation uses this closed sequence:

1. Read app inventory.
2. List Convex production regions and Cloudflare Workers Builds tokens for the selected
   organization.
3. Use an available region that the user requested. Otherwise, use the available organization
   default. If it is unavailable, ask the user to select one available display name.
4. If the selected region is EU, disclose the Convex price and included-usage facts before create.
5. Pass the exact provider ID as required `convexDeploymentRegion`.
6. Use the current token-selection rules and call `create_repository` once.
7. Poll only inventory until setup is ready or failed.

The one-project MCP choice never changes the organization saved default.

## Change map

| Area                     | Required change                                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Shared region model      | Add the two provider IDs, display formatting, parsing, and one shared validator.                                 |
| Organization model       | Add optional `defaultConvexDeploymentRegion` and resolve an unset value to US East.                              |
| Region read              | Return live team options plus the effective default to web and MCP callers.                                      |
| Organization Settings    | Let owners save US East or EU West. Show the effective value as read-only text to members.                       |
| New App                  | Require an available region, initialize from the saved default, and show the EU disclosure.                      |
| Managed plan             | Save the selected region in all Convex plan states before any provider write.                                    |
| Managed provider call    | Recheck availability and send `deploymentRegion` with `deploymentType: "prod"`.                                  |
| Manual create            | Require the same region selection, recheck it, and send it to Convex.                                            |
| Existing-project picker  | Join one paginated default-production deployment list to projects and show region.                               |
| Live project observation | Return the actual production deployment region in the `available` result.                                        |
| Stable attachment        | Keep it unchanged. Do not copy live region state.                                                                |
| MCP and plugin           | Add region discovery, require the create input, and document the selection and EU disclosure sequence.           |
| Privacy notice           | No change. The feature does not change data categories, purposes, recipients, legal bases, retention, or rights. |

## Rollout

The organization field is optional, so existing organization rows need no backfill. Existing stable
project attachments also need no migration because the actual region comes from live provider data.

The provisioning plan shape changes. Product code has no compatibility reader or plan backfill.
Before deployment, the operator must use the existing zero-row gate:

1. Stop the complete target deployment.
2. Drain or reconcile each active provider write.
3. Clear only resolved plan and lock rows through the accepted operator procedure.
4. Confirm that `workflow_vaultProvisioning_writeLocks` has zero rows.
5. Confirm that `workflow_vaultProvisioning_plans` has zero rows.
6. Deploy the required region field in every Convex plan variant.
7. Resume the deployment.

Do not delete an unresolved plan and reconstruct its region from the organization default. The
default is not retry input.

## Validation scope

Update the existing contract owners. Do not add duplicate tests.

Backend and contract checks cover:

- exact IDs, display names, sorting, and unknown values
- region-list authorization by organization and GitHub owner login
- US fallback, owner save, member read, and member write denial
- same-team preservation
- create input and provider payload in both project-create paths
- current availability checks at each provider-write boundary
- managed plan persistence through each state and retry
- one-project choices that do not update the saved default
- paginated existing-project production-region discovery without one request per project
- actual production region in live project observations

Frontend checks cover:

- unset US fallback, available defaults, and unavailable defaults
- explicit one-project overrides on both create forms
- owner edit, member read-only value, and load or save failures
- actual production region and missing production deployment displays
- selector accessible names, descriptions, alerts, and touch text size

Update the existing New App, Organization Settings, and vault overview screenshot owners when their
shipped appearance changes. Do not add preview-region coverage.

Run one live EU project-create smoke test before release. It proves that Samebase can create and
attach a production deployment in the EU region. It does not create a preview-region contract.

## Accepted source updates

Keep these accepted contracts consistent with the implementation:

- `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
- `specs/096_INITIALIZING_VAULT_GITHUB_PROVISIONING_SPEC.md`
- `specs/106_CONVEX_MANUAL_DEPLOYMENT_CONNECTION_SPEC.md`
- `specs/115_VAULT_RESOURCE_ATTACHMENT_MODEL_SPEC.md`
- `specs/120_ORGANIZATION_OWNERSHIP_SPEC.md`
- `specs/121_ORGANIZATION_CONTEXT_AND_ROUTE_MODEL.md`

Update the Samebase plugin skill and `apps/samebase/scripts/chatgptAppSubmissionSource.ts` because
managed MCP creation gains one read tool and one required create argument. Generate public action
documentation only after the action contracts and submission source are complete.

## Future region move

A future move feature is a separate destructive workflow. It must create a target resource in the
new region, deploy code, copy required configuration and data, switch application URLs and keys,
verify the target, and remove the old resource only after explicit approval.

Convex exports do not include deployed code, environment variables, configuration, or pending
scheduled functions. Convex import is documented as beta. See
[Backup and Restore](https://docs.convex.dev/database/backup-restore),
[Data Export](https://docs.convex.dev/database/import-export/export), and
[Data Import](https://docs.convex.dev/database/import-export/import).

Do not put a disabled or incomplete move control in this release.

## Acceptance criteria

- Both Samebase Convex project-create paths require one currently available production region.
- The effective organization default is the saved value or US East, and it only initializes forms.
- A one-project selection never changes the organization saved default.
- The managed plan stores the selected region before provider creation and retry reuses it.
- Both provider create calls send the selected region.
- The feature adds no post-create region check, read retry, or new diagnostic.
- Live Convex production deployment observation supplies the actual displayed region.
- Existing stable project attachments do not copy live region state.
- Existing-project discovery shows each default production deployment region without one request per
  project.
- EU selection shows the pricing and included-usage disclosure with a Convex pricing link.
- Preview deployments are unchanged and outside the feature contract.
- The rollout uses the accepted zero-lock-row and zero-plan-row gate.
