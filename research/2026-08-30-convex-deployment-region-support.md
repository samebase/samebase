# Convex deployment region research

Date: 2026-08-30

Status: Research note

This file records provider evidence and repository findings. It does not define product behavior.

## Provider facts

- Convex supports `aws-us-east-1` and `aws-eu-west-1`.
- A region belongs to a deployment and is selected when that deployment is created.
- Project creation accepts `deploymentRegion`.
- Cloud deployment responses include the actual region.
- EU usage costs 1.3 times US usage. Starter and Professional included usage does not apply.
- Local deployments do not use a US or EU cloud region.

Sources:

- [Convex Regions](https://docs.convex.dev/production/regions)
- [Convex Create Project](https://docs.convex.dev/management-api/create-project)
- [Convex Multiple Deployments](https://docs.convex.dev/production/multiple-deployments)
- [Convex Pricing](https://www.convex.dev/pricing)
- [Convex Management OpenAPI](https://api.convex.dev/v1/openapi.json)

## Repository findings

- Samebase creates a Convex project in New App and in the existing-vault dialog.
- Managed creation has a durable plan. The plan must keep the chosen production region for retry.
- `vaultConvexProjects` stores attachment identity. It does not copy live deployment state.
- Provider observation already reads the default production deployment, so it can expose its region.
- Existing-project discovery can list production deployments once and join them by project ID.
- Organization Settings does not need a Convex connection to save the create-form default.

## Implementation result

- The optional organization value resolves to US when it is absent.
- Create forms contain the two known choices and start from that resolved value.
- A choice in one create form does not update the organization value.
- The create request is the authority. Samebase does not add a region preflight or read retry.
- Create forms show the EU pricing notice. Organization Settings stays compact.
- Project views show the actual region from the current provider observation.

Current behavior is in the code, tests, and related accepted specs 003, 106, 115, and 120.
